/**
 * Phase 6: analytics overview accuracy — totals, completion rate, period
 * comparison, zero-filled trend buckets, distributions (F8 completion criteria).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Agent } from 'supertest';
import { closeTestApp, createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;
let agent: Agent;
let other: Agent;

async function create(body: Record<string, unknown>, a: Agent = agent) {
  const res = await a.post('/api/tasks').send(body).expect(201);
  return res.body.task as { id: number; completedAt: string | null };
}

beforeAll(async () => {
  ctx = createTestApp({
    RATE_LIMIT_AUTH_PER_MIN: '100000',
    RATE_LIMIT_WRITE_PER_MIN: '100000',
    RATE_LIMIT_READ_PER_MIN: '100000',
  });
  agent = request.agent(ctx.app);
  other = request.agent(ctx.app);
  await agent
    .post('/api/auth/register')
    .send({ name: 'Ana', email: 'ana@t.dev', password: 'Password123!' })
    .expect(201);
  await other
    .post('/api/auth/register')
    .send({ name: 'Bob', email: 'bob@t.dev', password: 'Password123!' })
    .expect(201);
});
afterAll(() => closeTestApp(ctx));

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const DAY = 86_400_000;
const HOUR = 3_600_000;

describe('GET /api/analytics/overview (F8)', () => {
  it('zero-data: null rate, empty arrays', async () => {
    const res = await other.get('/api/analytics/overview').expect(200);
    expect(res.body.totals).toMatchObject({ created: 0, completed: 0, open: 0, overdue: 0 });
    expect(res.body.completionRate).toBeNull();
    expect(
      res.body.trend.every(
        (p: { completed: number; created: number }) => p.completed === 0 && p.created === 0,
      ),
    ).toBe(true);
    expect(res.body.bySubject).toEqual([]);
  });

  it('computes totals, rate, periods, trend and distributions from a fixture', async () => {
    // Math: 2 open (1 overdue), 1 completed-in-last-period, 1 completed-in-previous
    await create({
      title: 'overdue-task',
      subject: 'Math',
      type: 'exam',
      priority: 'high',
      dueAt: iso(2 * HOUR),
    });
    await create({ title: 'open-task', subject: 'Math', type: 'assignment', priority: 'medium' });
    const doneNow = await create({
      title: 'done-now',
      subject: 'Math',
      type: 'study',
      dueAt: iso(30 * 60_000),
      status: 'completed',
    });
    expect(doneNow.completedAt).toBeTruthy();

    // Backdate a second completion into the PREVIOUS period (25 days ago, window=14d).
    const doneOld = await create({
      title: 'done-old',
      subject: 'Physics',
      type: 'project',
      status: 'completed',
    });
    ctx.db
      .prepare('UPDATE tasks SET completed_at = ?, created_at = ? WHERE id = ?')
      .run(iso(25 * DAY), iso(26 * DAY), doneOld.id);

    const res = await agent.get('/api/analytics/overview?days=14').expect(200);
    const body = res.body;

    expect(body.totals).toEqual({ created: 4, completed: 2, open: 2, overdue: 1 });
    expect(body.completionRate).toBe(0.5); // 2/4
    expect(body.completedLastPeriod).toBe(1); // done-now (30m ago within 14d)
    expect(body.completedPreviousPeriod).toBe(1); // done-old (25d ago → 15..28d window)

    // Trend: 14 zero-filled buckets ending today; the old day is outside the window.
    expect(body.trend).toHaveLength(14);
    const lastDay = body.trend[body.trend.length - 1];
    expect(lastDay.completed).toBe(1);
    expect(lastDay.created).toBeGreaterThanOrEqual(3);
    expect(body.trend.some((p: { date: string }) => p.date.length === 10)).toBe(true);

    // Distributions — every priority present even at zero (Physics/other levels exist as rows).
    const prio = new Map(body.byPriority.map((r: { priority: string }) => [r.priority, r]));
    expect(prio.get('high')).toMatchObject({ open: 1, completed: 0 });
    expect(prio.get('low')).toMatchObject({ open: 0, completed: 0 });
    const subj = new Map(body.bySubject.map((r: { subject: string }) => [r.subject, r]));
    expect(subj.get('Math')).toMatchObject({ open: 2, completed: 1 });
    expect(subj.get('Physics')).toMatchObject({ open: 0, completed: 1 });
    const types = new Map(body.byType.map((r: { type: string }) => [r.type, r]));
    expect(types.get('exam')).toMatchObject({ open: 1, completed: 0 });
    expect(types.has('other')).toBe(false); // zero-only types omitted
  });

  it('days=30 widens the trend and re-splits the periods', async () => {
    const res = await agent.get('/api/analytics/overview?days=30').expect(200);
    expect(res.body.trend).toHaveLength(30);
    expect(res.body.completedLastPeriod).toBe(2); // both completions within 30d
    expect(res.body.completedPreviousPeriod).toBe(0);
  });

  it('validates days to 14|30 and requires auth', async () => {
    await agent.get('/api/analytics/overview?days=45').expect(400);
    await request(ctx.app).get('/api/analytics/overview').expect(401);
  });
});
