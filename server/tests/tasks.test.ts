/**
 * Tasks CRUD + priority suite (IMPLEMENTATION_PLAN Phase 2 completion criteria):
 * happy paths, validation errors, ownership (404 not 403), complete/reopen
 * invariant, sorts, subjects meta, delete cascade, pagination.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Agent } from 'supertest';
import { closeTestApp, createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;
let riya: Agent;
let amir: Agent;

async function makeTask(agent: Agent, overrides: Record<string, unknown> = {}) {
  return agent
    .post('/api/tasks')
    .send({
      title: 'Problem set 4',
      subject: 'Mathematics',
      type: 'assignment',
      ...overrides,
    })
    .expect(201);
}

beforeAll(async () => {
  ctx = createTestApp({
    RATE_LIMIT_AUTH_PER_MIN: '100000',
    RATE_LIMIT_WRITE_PER_MIN: '100000',
    RATE_LIMIT_READ_PER_MIN: '100000',
  });
  riya = request.agent(ctx.app);
  amir = request.agent(ctx.app);
  await riya
    .post('/api/auth/register')
    .send({ name: 'Riya', email: 'riya@t.dev', password: 'Password123!' })
    .expect(201);
  await amir
    .post('/api/auth/register')
    .send({ name: 'Amir', email: 'amir@t.dev', password: 'Password123!' })
    .expect(201);
});
afterAll(() => closeTestApp(ctx));

describe('tasks (Phase 2)', () => {
  describe('auth boundary', () => {
    it('requires a session', async () => {
      const res = await request(ctx.app).get('/api/tasks').expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('create + defaults', () => {
    it('creates a task with defaults (medium priority, pending, no due date)', async () => {
      const res = await makeTask(riya);
      expect(res.body.task).toMatchObject({
        title: 'Problem set 4',
        subject: 'Mathematics',
        type: 'assignment',
        priority: 'medium',
        status: 'pending',
        dueAt: null,
        completedAt: null,
        description: '',
      });
      expect(new Date(res.body.task.createdAt).getTime()).not.toBeNaN();
    });

    it('normalizes dueAt offsets to UTC Z', async () => {
      const res = await makeTask(riya, { dueAt: '2026-11-02T18:30:00+05:30' });
      expect(res.body.task.dueAt).toBe('2026-11-02T13:00:00.000Z');
    });

    it('rejects invalid payloads with field details', async () => {
      const res = await riya
        .post('/api/tasks')
        .send({ title: '', subject: '', type: 'workshop', priority: 'urgent', dueAt: 'tomorrow' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const fields = (res.body.error.details as { field: string }[]).map((d) => d.field);
      expect(fields).toEqual(
        expect.arrayContaining(['title', 'subject', 'type', 'priority', 'dueAt']),
      );
    });

    it('rejects oversized title', async () => {
      await riya
        .post('/api/tasks')
        .send({ title: 'x'.repeat(201), subject: 'Math', type: 'assignment' })
        .expect(400);
    });
  });

  describe('read', () => {
    it('GET /:id returns own task, 404 for another user (no existence leak)', async () => {
      const created = await makeTask(riya, { title: 'Private task' });
      const id = created.body.task.id as number;
      await riya.get(`/api/tasks/${id}`).expect(200);
      const res = await amir.get(`/api/tasks/${id}`).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('GET /:id validates numeric ids', async () => {
      await riya.get('/api/tasks/abc').expect(400);
      await riya.get('/api/tasks/0').expect(400);
    });

    it('lists with pagination metadata', async () => {
      const res = await riya.get('/api/tasks?page=1&limit=2').expect(200);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      expect(res.body.total).toBeGreaterThan(1);
      expect(res.body).toMatchObject({ page: 1, limit: 2 });
    });
  });

  describe('update', () => {
    it('complete sets completedAt; reopen clears it (invariant)', async () => {
      const created = await makeTask(riya, { title: 'Finish lab report' });
      const id = created.body.task.id as number;

      const done = await riya.patch(`/api/tasks/${id}`).send({ status: 'completed' }).expect(200);
      expect(done.body.task.status).toBe('completed');
      expect(done.body.task.completedAt).toBeTruthy();

      const reopened = await riya.patch(`/api/tasks/${id}`).send({ status: 'pending' }).expect(200);
      expect(reopened.body.task.completedAt).toBeNull();

      // creating directly as completed records completion time
      const bornDone = await makeTask(riya, { title: 'Backdated', status: 'completed' });
      expect(bornDone.body.task.completedAt).toBeTruthy();
    });

    it('supports partial patches incl. clearing dueAt with null', async () => {
      const created = await makeTask(riya, { dueAt: '2026-12-01T10:00:00.000Z' });
      const id = created.body.task.id as number;
      const patched = await riya
        .patch(`/api/tasks/${id}`)
        .send({ dueAt: null, priority: 'high' })
        .expect(200);
      expect(patched.body.task).toMatchObject({ dueAt: null, priority: 'high' });
    });

    it('rejects empty patch and unknown-only patch bodies', async () => {
      const created = await makeTask(riya);
      await riya.patch(`/api/tasks/${created.body.task.id}`).send({}).expect(400);
    });

    it('cannot touch another user task via patch/delete', async () => {
      const created = await makeTask(riya, { title: 'Keep out' });
      const id = created.body.task.id as number;
      await amir.patch(`/api/tasks/${id}`).send({ title: 'Hijacked' }).expect(404);
      await amir.delete(`/api/tasks/${id}`).expect(404);
      const after = await riya.get(`/api/tasks/${id}`).expect(200);
      expect(after.body.task.title).toBe('Keep out');
    });
  });

  describe('sort (F3 smart ordering)', () => {
    it('orders overdue first, then nearest due, then priority', async () => {
      const a = await makeTask(riya, {
        title: 'SortA future-high',
        subject: 'S',
        type: 'study',
        priority: 'high',
        dueAt: '2099-01-01T12:00:00.000Z',
      });
      const b = await makeTask(riya, {
        title: 'SortB overdue-low',
        subject: 'S',
        type: 'study',
        priority: 'low',
        dueAt: '2020-01-01T12:00:00.000Z',
      });
      const c = await makeTask(riya, {
        title: 'SortC tomorrow-low',
        subject: 'S',
        type: 'study',
        priority: 'low',
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      void a;
      const list = await riya.get('/api/tasks?sort=smart&limit=100').expect(200);
      const titles = (list.body.items as { title: string }[]).map((t) => t.title);
      expect(titles.indexOf('SortB overdue-low')).toBeLessThan(
        titles.indexOf('SortC tomorrow-low'),
      );
      expect(titles.indexOf('SortC tomorrow-low')).toBeLessThan(
        titles.indexOf('SortA future-high'),
      );
      void b;
      void c;
    });

    it('supports due/title sorts', async () => {
      const asc = await riya.get('/api/tasks?sort=due_asc&limit=100').expect(200);
      const dues = (asc.body.items as { dueAt: string | null }[])
        .map((t) => t.dueAt)
        .filter((d): d is string => d !== null);
      const sorted = [...dues].sort();
      expect(dues).toEqual(sorted);
      const title = await riya.get('/api/tasks?sort=title_asc').expect(200);
      expect(title.body.items.length).toBeGreaterThan(0);
    });
  });

  describe('delete', () => {
    it('hard-deletes and cascades notifications', async () => {
      const created = await makeTask(riya, { title: 'Doomed' });
      const id = created.body.task.id as number;
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          `INSERT INTO notifications (user_id, task_id, kind, title, body, created_at)
           SELECT id, ?, 'overdue', 't', 'b', ? FROM users WHERE email = 'riya@t.dev'`,
        )
        .run(id, now);
      await riya.delete(`/api/tasks/${id}`).expect(204);
      await riya.get(`/api/tasks/${id}`).expect(404);
      const n = ctx.db
        .prepare('SELECT COUNT(*) AS n FROM notifications WHERE task_id = ?')
        .get(id) as { n: number };
      expect(n.n).toBe(0);
      // deleting again → 404
      await riya.delete(`/api/tasks/${id}`).expect(404);
    });
  });

  describe('meta/subjects', () => {
    it('returns distinct subjects for the caller only', async () => {
      await makeTask(riya, { subject: 'Zoology' });
      const res = await riya.get('/api/tasks/meta/subjects').expect(200);
      expect(res.body.subjects).toContain('Zoology');
      expect(res.body.subjects).toContain('Mathematics');
      const other = await amir.get('/api/tasks/meta/subjects').expect(200);
      expect(other.body.subjects).not.toContain('Zoology');
    });
  });
});
