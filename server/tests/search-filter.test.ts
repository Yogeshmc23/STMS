/**
 * Phase 7 suite: search (F9) + multi-select filtering on GET /api/tasks.
 * Verifies combined filters AND together, values within one field OR,
 * case-insensitive search, LIKE-wildcard escaping, and that `total` reflects
 * the filtered set (pagination correctness).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Agent } from 'supertest';
import { closeTestApp, createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;
let agent: Agent;

async function make(body: Record<string, unknown>) {
  await agent.post('/api/tasks').send(body).expect(201);
}

async function titles(query: string): Promise<string[]> {
  const res = await agent.get(`/api/tasks?limit=100&${query}`).expect(200);
  return (res.body.items as { title: string }[]).map((t) => t.title);
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
    .send({ name: 'Filo', email: 'filo@t.dev', password: 'Password123!' })
    .expect(201);

  await make({
    title: 'Calculus problem set',
    subject: 'Math',
    type: 'assignment',
    priority: 'high',
  });
  await make({
    title: 'Linear algebra review',
    subject: 'Math',
    type: 'study',
    priority: 'low',
    description: 'eigenvalues and 100% of past papers',
  });
  await make({
    title: 'Essay on metaphysics',
    subject: 'Philosophy',
    type: 'assignment',
    priority: 'medium',
  });
  await make({
    title: 'Lab: titration 100% safety',
    subject: 'Chemistry',
    type: 'exam',
    priority: 'high',
  });
  const done = await agent
    .post('/api/tasks')
    .send({
      title: 'Calculus problem set (copy)',
      subject: 'Math',
      type: 'assignment',
      status: 'completed',
    })
    .expect(201);
  void done;
});
afterAll(() => closeTestApp(ctx));

describe('search & filtering (F9)', () => {
  it('free-text search across title/description, case-insensitive', async () => {
    expect(await titles('q=calculus')).toEqual(
      expect.arrayContaining(['Calculus problem set', 'Calculus problem set (copy)']),
    );
    expect(await titles('q=EIGENVALUES')).toContain('Linear algebra review'); // description hit
    expect(await titles('q=nonexistent-xyz')).toEqual([]);
  });

  it('escapes LIKE wildcards in user text (no accidental matches)', async () => {
    // A bare "%" search must match ONLY rows containing a literal percent —
    // an unescaped LIKE '%' would return every task (5 here).
    const percents = await titles('q=%25');
    expect(percents).toEqual(
      expect.arrayContaining(['Linear algebra review', 'Lab: titration 100% safety']),
    );
    expect(percents).toHaveLength(2);

    // "100x" must not match "100% safety" — proves the user % isn't a wildcard.
    expect(await titles('q=100x')).toEqual([]);
    // "100" does prefix-match both percent rows (normal substring semantics).
    expect((await titles('q=100')).length).toBe(2);
  });

  it('multi-values within one field OR; fields AND together', async () => {
    const mathOrPhil = await titles('subject=Math&subject=Philosophy');
    expect(mathOrPhil.length).toBe(4);

    const highAssignments = await titles('priority=high&type=assignment');
    expect(highAssignments).toEqual(['Calculus problem set']);

    const combo = await titles('q=calculus&status=completed');
    expect(combo).toEqual(['Calculus problem set (copy)']);
  });

  it('filters compose with due buckets and filtered totals paginate', async () => {
    const b = (await agent.get('/api/tasks?q=calculus&limit=1&page=1').expect(200)).body;
    expect(b.total).toBe(2); // calculus tasks only
    const page2 = (await agent.get('/api/tasks?q=calculus&limit=1&page=2').expect(200)).body;
    expect(page2.items).toHaveLength(1);
    expect(page2.total).toBe(2);
  });

  it('rejects unknown enum values', async () => {
    await agent.get('/api/tasks?priority=urgent').expect(400);
    await agent.get('/api/tasks?status=nope').expect(400);
  });

  it('caps limit at 100 (pageLimitMax)', async () => {
    await agent.get('/api/tasks?limit=101').expect(400);
  });
});
