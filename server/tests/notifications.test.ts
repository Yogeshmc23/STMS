/**
 * Phase 5 suites: reminder scan (windows, idempotency, completed exclusion),
 * email queue + dev outbox (ARCHITECTURE.md §6 — nothing pretends to send),
 * list/read/dismiss endpoints with ownership and auth rules.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Agent } from 'supertest';
import { closeTestApp, createTestApp, type TestContext } from './helpers.js';
import { runReminderScan } from '../src/modules/notifications/service.js';

const HOUR = 3_600_000;

let ctx: TestContext;
let agent: Agent; // reminders ON (default)
let muted: Agent; // reminders OFF

async function createTaskAs(a: Agent, body: Record<string, unknown>) {
  const res = await a.post('/api/tasks').send(body).expect(201);
  return res.body.task as { id: number };
}

beforeAll(async () => {
  ctx = createTestApp({
    RATE_LIMIT_AUTH_PER_MIN: '100000',
    RATE_LIMIT_WRITE_PER_MIN: '100000',
    RATE_LIMIT_READ_PER_MIN: '100000',
  });
  agent = request.agent(ctx.app);
  muted = request.agent(ctx.app);
  await agent
    .post('/api/auth/register')
    .send({ name: 'Noti', email: 'noti@t.dev', password: 'Password123!' })
    .expect(201);
  await muted
    .post('/api/auth/register')
    .send({ name: 'Muted', email: 'muted@t.dev', password: 'Password123!' })
    .expect(201);
  await muted.patch('/api/auth/profile').send({ emailRemindersEnabled: false }).expect(200);
});

afterAll(() => {
  closeTestApp(ctx);
  // remove any outbox files this suite produced (dir is gitignored anyway)
  const outbox = path.join(process.cwd(), 'outbox');
  if (fs.existsSync(outbox))
    for (const f of fs.readdirSync(outbox)) fs.rmSync(path.join(outbox, f));
});

const notifCount = (email: string) =>
  (
    ctx.db
      .prepare(
        'SELECT COUNT(*) AS n FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = ?',
      )
      .get(email) as { n: number }
  ).n;

describe('reminder scan (F7)', () => {
  it('creates exactly one notification per (task, kind) and is idempotent', async () => {
    const nowMs = Date.now();
    const soon = new Date(nowMs + 30 * 60_000).toISOString(); // within 1h
    const tomorrowish = new Date(nowMs + 18 * HOUR).toISOString(); // (1h, 24h]
    const past = new Date(nowMs - 1 * HOUR).toISOString(); // overdue
    const far = new Date(nowMs + 48 * HOUR).toISOString(); // outside all windows

    await createTaskAs(agent, { title: 'due-30m', subject: 'Math', type: 'exam', dueAt: soon });
    await createTaskAs(agent, {
      title: 'due-18h',
      subject: 'Math',
      type: 'exam',
      dueAt: tomorrowish,
    });
    await createTaskAs(agent, { title: 'overdue-1h', subject: 'Math', type: 'exam', dueAt: past });
    await createTaskAs(agent, { title: 'due-48h', subject: 'Math', type: 'exam', dueAt: far });

    const before = notifCount('noti@t.dev');
    const created = runReminderScan(ctx.db, nowMs);
    const mid = notifCount('noti@t.dev');
    expect(created).toBe(3); // 30m→1h, 18h→24h, past→overdue; 48h task gets none
    expect(mid - before).toBe(created);

    const created2 = runReminderScan(ctx.db, nowMs);
    expect(created2).toBe(0); // second scan: UNIQUE(user, kind, task) → nothing new
    expect(notifCount('noti@t.dev')).toBe(mid);

    // window correctness: 48h task gets NO reminder at now (but 'due-18h' got the 24h one)
    const rows = ctx.db
      .prepare(
        `SELECT n.kind FROM notifications n
         JOIN tasks t ON t.id = n.task_id
         WHERE t.title = 'due-48h'`,
      )
      .all() as { kind: string }[];
    expect(rows).toEqual([]);
  });

  it('never notifies for completed tasks', async () => {
    const t = await createTaskAs(agent, {
      title: 'already-done',
      subject: 'Math',
      type: 'exam',
      dueAt: new Date(Date.now() - 2 * HOUR).toISOString(),
      status: 'completed',
    });
    runReminderScan(ctx.db);
    const n = ctx.db
      .prepare('SELECT COUNT(*) AS c FROM notifications WHERE task_id = ?')
      .get(t.id) as { c: number };
    expect(n.c).toBe(0);
  });

  it('email reminders: queued for enabled users only; outbox+skip when SMTP is off', async () => {
    const nowMs = Date.now();
    await createTaskAs(agent, {
      title: 'email-me',
      subject: 'Math',
      type: 'exam',
      dueAt: new Date(nowMs + 40 * 60_000).toISOString(),
    });
    await createTaskAs(muted, {
      title: 'no-email',
      subject: 'Math',
      type: 'exam',
      dueAt: new Date(nowMs + 40 * 60_000).toISOString(),
    });
    runReminderScan(ctx.db, nowMs);

    const queueFor = (email: string) =>
      ctx.db
        .prepare(
          `SELECT q.state, q.to_email FROM email_queue q JOIN users u ON u.id = q.user_id WHERE u.email = ?`,
        )
        .all(email) as { state: string; to_email: string }[];

    expect(queueFor('noti@t.dev').length).toBeGreaterThan(0);
    expect(queueFor('muted@t.dev')).toEqual([]);

    // Dev trigger drains the queue: SMTP unset in tests → skipped_no_smtp + real .eml files
    const res = await agent.post('/api/dev/run-reminder-scan').expect(200);
    expect(res.body.email.skipped).toBeGreaterThan(0);
    for (const row of queueFor('noti@t.dev')) expect(row.state).toBe('skipped_no_smtp');

    const outboxDir = path.join(process.cwd(), 'outbox');
    const files = fs.existsSync(outboxDir) ? fs.readdirSync(outboxDir) : [];
    expect(files.some((f) => f.endsWith('.eml'))).toBe(true);
    const sample = fs.readFileSync(
      path.join(
        outboxDir,
        files.find((f) => f.endsWith('.eml'))!,
      ),
      'utf8',
    );
    expect(sample).toContain('NOT sent'); // labeled, never presented as delivered
  });

  it('deleting a task removes its notifications (cascade)', async () => {
    const t = await createTaskAs(agent, {
      title: 'doomed-notif',
      subject: 'Math',
      type: 'exam',
      dueAt: new Date(Date.now() - HOUR).toISOString(),
    });
    runReminderScan(ctx.db);
    const n = ctx.db
      .prepare('SELECT COUNT(*) AS c FROM notifications WHERE task_id = ?')
      .get(t.id) as { c: number };
    expect(n.c).toBe(1);
    await agent.delete(`/api/tasks/${t.id}`).expect(204);
    const after = ctx.db
      .prepare('SELECT COUNT(*) AS c FROM notifications WHERE task_id = ?')
      .get(t.id) as { c: number };
    expect(after.c).toBe(0);
  });
});

describe('notification endpoints (F7)', () => {
  let firstId = 0;

  it('GET / lists newest-first with unread counts', async () => {
    const res = await agent.get('/api/notifications?limit=100').expect(200);
    expect(res.body.total).toBeGreaterThan(1);
    const kinds = res.body.items.map((n: { kind: string }) => n.kind);
    expect(kinds).toContain('overdue');
    firstId = res.body.items[0].id as number;
    const count = await agent.get('/api/notifications/unread-count').expect(200);
    expect(count.body.count).toBe(res.body.total); // none read yet
  });

  it('unreadOnly filter + pagination metadata', async () => {
    const res = await agent.get('/api/notifications?unreadOnly=true&page=1&limit=1').expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBeGreaterThan(1);
  });

  it('POST /:id/read is idempotent', async () => {
    const one = await agent.post(`/api/notifications/${firstId}/read`).expect(200);
    expect(one.body.notification.readAt).toBeTruthy();
    const again = await agent.post(`/api/notifications/${firstId}/read`).expect(200);
    expect(again.body.notification.readAt).toBe(one.body.notification.readAt);
  });

  it('rejects other users’ notifications with 404', async () => {
    await muted.post(`/api/notifications/${firstId}/read`).expect(404);
    await muted.delete(`/api/notifications/${firstId}`).expect(404);
  });

  it('POST /read-all then GET ?unreadOnly=true → empty', async () => {
    await agent.post('/api/notifications/read-all').expect(204);
    const count = await agent.get('/api/notifications/unread-count').expect(200);
    expect(count.body.count).toBe(0);
    const list = await agent.get('/api/notifications?unreadOnly=true').expect(200);
    expect(list.body.items).toEqual([]);
  });

  it('DELETE dismisses; unknown/foreign ids 404', async () => {
    const list = await agent.get('/api/notifications?limit=1').expect(200);
    const id = list.body.items[0].id as number;
    await agent.delete(`/api/notifications/${id}`).expect(204);
    await agent.delete(`/api/notifications/${id}`).expect(404);
  });

  it('requires auth', async () => {
    await request(ctx.app).get('/api/notifications').expect(401);
    await request(ctx.app).post('/api/dev/run-reminder-scan').expect(401);
  });
});
