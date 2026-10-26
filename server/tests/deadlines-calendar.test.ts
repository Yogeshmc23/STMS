/**
 * Phase 3 suites: due-bucket quick filters on GET /api/tasks and the calendar
 * range endpoint. Dates are derived from dueBucketBoundaries() so they are
 * deterministic regardless of when the suite runs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Agent } from 'supertest';
import { closeTestApp, createTestApp, type TestContext } from './helpers.js';
import { dueBucketBoundaries } from '../src/util/time.js';

let ctx: TestContext;
let agent: Agent;

const HOUR = 3_600_000;

async function createTask(body: Record<string, unknown>) {
  const res = await agent.post('/api/tasks').send(body).expect(201);
  return res.body.task as { id: number; dueAt: string | null };
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
    .send({ name: 'Cal', email: 'cal@t.dev', password: 'Password123!' })
    .expect(201);
});
afterAll(() => closeTestApp(ctx));

describe('due buckets (F4)', () => {
  it('classifies overdue / today / week / later / none', async () => {
    const b = dueBucketBoundaries(Date.now(), 0);
    const now = Date.parse(b.nowIso);

    // Fixed-past date: deterministically overdue, and never in today/week/later.
    const overdue = await createTask({
      title: 'was-due',
      subject: 'Math',
      type: 'exam',
      dueAt: '2020-01-01T12:00:00.000Z',
    });
    // Midpoint between NOW and local midnight: deterministically future AND today.
    await createTask({
      title: 'due-today',
      subject: 'Math',
      type: 'assignment',
      dueAt: new Date(now + (Date.parse(b.tomorrowStart) - now) / 2).toISOString(),
    });
    await createTask({
      title: 'later-this-week',
      subject: 'Math',
      type: 'project',
      dueAt: new Date(Date.parse(b.tomorrowStart) + 12 * HOUR).toISOString(),
    });
    await createTask({
      title: 'far-out',
      subject: 'Math',
      type: 'study',
      dueAt: new Date(Date.parse(b.weekEnd) + 12 * HOUR).toISOString(),
    });
    await createTask({ title: 'unscheduled', subject: 'Math', type: 'study' });

    const titlesFor = async (due: string) => {
      const res = await agent.get(`/api/tasks?due=${due}&limit=100`).expect(200);
      return (res.body.items as { title: string }[]).map((t) => t.title);
    };

    const overdueT = await titlesFor('overdue');
    expect(overdueT).toContain('was-due');
    expect(overdueT).not.toContain('due-today');
    expect(overdueT).not.toContain('unscheduled');

    const todayT = await titlesFor('today');
    expect(todayT).toContain('due-today');
    expect(todayT).not.toContain('far-out');
    expect(todayT).not.toContain('unscheduled');

    const weekT = await titlesFor('week'); // [today, today+7d)
    expect(weekT).toEqual(expect.arrayContaining(['due-today', 'later-this-week']));
    expect(weekT).not.toContain('far-out');

    const laterT = await titlesFor('later');
    expect(laterT).toContain('far-out');
    expect(laterT).not.toContain('later-this-week');

    const noneT = await titlesFor('none');
    expect(noneT).toContain('unscheduled');
    expect(noneT).not.toContain('was-due');

    // a completed task leaves the OVERDUE bucket (PRD F4)
    await agent.patch(`/api/tasks/${overdue.id}`).send({ status: 'completed' }).expect(200);
    expect(await titlesFor('overdue')).not.toContain('was-due');
  });

  it('filters by explicit dueFrom/dueTo (inclusive)', async () => {
    await createTask({
      title: 'r1',
      subject: 'Math',
      type: 'study',
      dueAt: '2027-03-10T12:00:00.000Z',
    });
    const res = await agent
      .get('/api/tasks?dueFrom=2027-03-10T00:00:00.000Z&dueTo=2027-03-10T23:59:59.999Z')
      .expect(200);
    const titles = (res.body.items as { title: string }[]).map((t) => t.title);
    expect(titles).toContain('r1');
    expect(titles).not.toContain('far-out');
  });

  it('rejects invalid bucket values', async () => {
    await agent.get('/api/tasks?due=whenever').expect(400);
  });
});

describe('GET /api/calendar (F6)', () => {
  beforeAll(async () => {
    // Fixed-world tasks in November 2026.
    await createTask({
      title: 'first-light',
      subject: 'Hist',
      type: 'exam',
      dueAt: '2026-11-01T00:00:00.000Z',
    });
    await createTask({
      title: 'last-second',
      subject: 'Hist',
      type: 'exam',
      dueAt: '2026-11-30T23:59:59.500Z',
    });
    await createTask({
      title: 'day-before',
      subject: 'Hist',
      type: 'exam',
      dueAt: '2026-10-31T23:59:59.000Z',
    });
    await createTask({
      title: 'day-after',
      subject: 'Hist',
      type: 'exam',
      dueAt: '2026-12-01T00:00:00.000Z',
    });
    const done = await createTask({
      title: 'done-in-range',
      subject: 'Hist',
      type: 'exam',
      dueAt: '2026-11-15T10:00:00.000Z',
    });
    await agent.patch(`/api/tasks/${done.id}`).send({ status: 'completed' }).expect(200);
  });

  it('returns tasks within [from,to] (date-only = whole days), incl. completed, excl. unscheduled', async () => {
    const res = await agent.get('/api/calendar?from=2026-11-01&to=2026-11-30').expect(200);
    const titles = (res.body.tasks as { title: string }[]).map((t) => t.title);
    expect(titles).toEqual(expect.arrayContaining(['first-light', 'last-second', 'done-in-range']));
    expect(titles).not.toContain('day-before');
    expect(titles).not.toContain('day-after');
    expect(titles).not.toContain('unscheduled');
    // ordered by due_at asc
    const dues = (res.body.tasks as { dueAt: string }[]).map((t) => t.dueAt);
    expect(dues).toEqual([...dues].sort());
  });

  it('exact ISO instants are honored (day-grid ranges from the client)', async () => {
    const res = await agent
      .get('/api/calendar?from=2026-11-15T00:00:00.000Z&to=2026-11-15T23:59:59.999Z')
      .expect(200);
    const titles = (res.body.tasks as { title: string }[]).map((t) => t.title);
    expect(titles).toEqual(['done-in-range']);
  });

  it('validates the range (API.md)', async () => {
    await agent.get('/api/calendar?from=2026-11-30&to=2026-11-01').expect(400);
    await agent.get('/api/calendar?from=2026-01-01&to=2026-12-01').expect(400); // > 92 days
    await agent.get('/api/calendar?from=garbage&to=2026-11-01').expect(400);
    await agent.get('/api/calendar').expect(400); // required params
  });

  it('requires auth', async () => {
    await request(ctx.app).get('/api/calendar?from=2026-11-01&to=2026-11-02').expect(401);
  });
});
