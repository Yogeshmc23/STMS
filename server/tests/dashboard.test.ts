/**
 * Phase 4: dashboard summary accuracy (IMPLEMENTATION_PLAN completion criteria:
 * aggregate accuracy against hand-computed fixtures + zero-data rule).
 * All fixtures are deterministic regardless of when the suite runs: the
 * "today" task sits between NOW and local midnight; the "far" task sits
 * EXACTLY at the weekEnd boundary (must be excluded from week, included in later).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Agent } from 'supertest';
import { closeTestApp, createTestApp, type TestContext } from './helpers.js';
import { dueBucketBoundaries } from '../src/util/time.js';

let ctx: TestContext;
let agent: Agent;

async function make(body: Record<string, unknown>) {
  return (await agent.post('/api/tasks').send(body).expect(201)).body.task as { id: number };
}

beforeAll(async () => {
  ctx = createTestApp({
    RATE_LIMIT_AUTH_PER_MIN: '100000',
    RATE_LIMIT_WRITE_PER_MIN: '100000',
    RATE_LIMIT_READ_PER_MIN: '100000',
  });
  agent = request.agent(ctx.app);
  await agent
    .post('/api/auth/register')
    .send({ name: 'Dash', email: 'dash@t.dev', password: 'Password123!' })
    .expect(201);

  const b = dueBucketBoundaries(Date.now(), 0);
  const nowMs = Date.parse(b.nowIso);
  const futureToday = new Date(nowMs + (Date.parse(b.tomorrowStart) - nowMs) / 2).toISOString();

  await make({
    title: 'A-overdue',
    subject: 'Math',
    type: 'exam',
    priority: 'high',
    dueAt: '2020-01-01T12:00:00.000Z',
  }); // overdue
  await make({ title: 'B-today', subject: 'Math', type: 'assignment', dueAt: futureToday }); // open, today, not overdue
  await make({
    title: 'C-done',
    subject: 'Math',
    type: 'study',
    dueAt: '2020-01-02T12:00:00.000Z',
    status: 'completed',
  });
  await make({ title: 'D-far', subject: 'Physics', type: 'project', dueAt: b.weekEnd }); // exactly at weekEnd → 'later', NOT 'week'
  await make({ title: 'E-none', subject: 'Physics', type: 'study' }); // unscheduled
});
afterAll(() => closeTestApp(ctx));

describe('GET /api/dashboard/summary (F5)', () => {
  it('aggregates match hand-computed fixture', async () => {
    const res = await agent.get('/api/dashboard/summary?tzOffset=0').expect(200);

    expect(res.body.counts).toEqual({
      total: 5,
      pending: 4,
      inProgress: 0,
      completed: 1,
      overdue: 1, // A-overdue only (C-done is past but completed)
      dueToday: 1, // B-today
      dueThisWeek: 1, // [todayStart, weekEnd) — D-far sits exactly AT weekEnd → boundary-excluded
      unscheduled: 1,
    });
    expect(res.body.completionRate).toBe(0.2); // 1 completed / 5 total

    // Up next: overdue first, then nearest deadline; completed/unscheduled excluded.
    const upNext = res.body.upNext as { title: string }[];
    expect(upNext.map((t) => t.title)).toEqual(['A-overdue', 'B-today', 'D-far']);

    // Workload: open counts per subject — Math 2 open of 3, Physics 2 open of 2;
    // tie on `open` broken by total desc (Math first).
    expect(res.body.workloadBySubject).toEqual([
      { subject: 'Math', open: 2, total: 3 },
      { subject: 'Physics', open: 2, total: 2 },
    ]);

    // Recent activity: contains the completion entry; ≤8 items; newest first.
    const activity = res.body.recentActivity as { id: number; kind: string; at: string }[];
    expect(activity.length).toBeGreaterThan(0);
    expect(activity.length).toBeLessThanOrEqual(8);
    expect(activity.map((a) => a.kind)).toContain('completed');
    const times = activity.map((a) => Date.parse(a.at));
    expect(times).toEqual([...times].sort((x, y) => y - x));
  });

  it('is zero-data safe for a fresh account', async () => {
    const fresh = request.agent(ctx.app);
    await fresh
      .post('/api/auth/register')
      .send({ name: 'Empty', email: 'empty@t.dev', password: 'Password123!' })
      .expect(201);
    const res = await fresh.get('/api/dashboard/summary').expect(200);
    expect(res.body.counts).toMatchObject({ total: 0, pending: 0, overdue: 0 });
    expect(res.body.completionRate).toBeNull();
    expect(res.body.upNext).toEqual([]);
    expect(res.body.workloadBySubject).toEqual([]);
  });

  it('scopes everything to the caller', async () => {
    const other = request.agent(ctx.app);
    await other
      .post('/api/auth/register')
      .send({ name: 'Other', email: 'other@t.dev', password: 'Password123!' })
      .expect(201);
    const res = await other.get('/api/dashboard/summary').expect(200);
    expect(res.body.counts.total).toBe(0);
  });

  it('requires auth', async () => {
    await request(ctx.app).get('/api/dashboard/summary').expect(401);
  });
});
