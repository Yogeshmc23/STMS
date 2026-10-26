/**
 * Auth + session suite (Stage 11 completion criteria, IMPLEMENTATION_PLAN.md Phase 1):
 * register/login/logout/profile/password, cookie flags, expiry, revocation,
 * enumeration-resistance, rate limiting, welcome notification.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Agent } from 'supertest';
import { closeTestApp, createTestApp, type TestContext } from './helpers.js';

const PASSWORD = 'SecurePass123!';

function newUser(email: string, name = 'Test User') {
  return { name, email, password: PASSWORD };
}

async function registerUser(ctx: TestContext, email: string): Promise<Agent> {
  const agent = request.agent(ctx.app);
  const res = await agent.post('/api/auth/register').send(newUser(email)).expect(201);
  expect(res.body.user.email).toBe(email);
  return agent;
}

describe('auth (Phase 1)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    // High auth limit so functional tests don't trip the limiter; a dedicated test below covers it.
    ctx = createTestApp({ RATE_LIMIT_AUTH_PER_MIN: '10000' });
  });
  afterAll(() => closeTestApp(ctx));

  describe('POST /api/auth/register', () => {
    it('creates user, returns safe shape, sets httpOnly lax cookie', async () => {
      const res = await request(ctx.app)
        .post('/api/auth/register')
        .send(newUser('Fresh@Example.com '))
        .expect(201);
      expect(res.body.user).toMatchObject({ name: 'Test User', email: 'fresh@example.com' });
      expect(res.body.user.password_hash).toBeUndefined();
      expect(res.body.user.password).toBeUndefined();
      const cookie: string = res.headers['set-cookie'][0];
      expect(cookie).toContain('stms_sid=');
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).not.toMatch(/Secure/i); // test env is not production
    });

    it('normalizes email case and rejects duplicates (409 EMAIL_TAKEN)', async () => {
      await registerUser(ctx, 'dup@example.com');
      const res = await request(ctx.app)
        .post('/api/auth/register')
        .send(newUser('DUP@EXAMPLE.COM'))
        .expect(409);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('validates input (400 with field details)', async () => {
      const res = await request(ctx.app)
        .post('/api/auth/register')
        .send({ name: '', email: 'not-an-email', password: 'short' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const fields = (res.body.error.details as { field: string }[]).map((d) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
    });

    it('creates exactly one welcome notification', async () => {
      const agent = await registerUser(ctx, 'welcome@example.com');
      const me = await agent.get('/api/auth/me').expect(200);
      const rows = ctx.db
        .prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND kind = 'welcome'")
        .get(me.body.user.id) as { n: number };
      expect(rows.n).toBe(1);
    });

    it('stores passwords as bcrypt hashes, never plaintext', async () => {
      const agent = await registerUser(ctx, 'hash@example.com');
      const me = await agent.get('/api/auth/me').expect(200);
      const row = ctx.db
        .prepare('SELECT password_hash FROM users WHERE id = ?')
        .get(me.body.user.id) as { password_hash: string };
      expect(row.password_hash).toMatch(/^\$2[aby]\$/);
      expect(row.password_hash).not.toContain(PASSWORD);
    });
  });

  describe('POST /api/auth/login', () => {
    it('sets a working session', async () => {
      await registerUser(ctx, 'loginok@example.com');
      const agent = request.agent(ctx.app);
      const res = await agent
        .post('/api/auth/login')
        .send({ email: 'loginok@example.com', password: PASSWORD })
        .expect(200);
      expect(res.body.user.email).toBe('loginok@example.com');
      await agent.get('/api/auth/me').expect(200);
    });

    it('returns the same 401 for wrong password and unknown email', async () => {
      await registerUser(ctx, 'enum@example.com');
      const wrong = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: 'enum@example.com', password: 'WrongPass999!' })
        .expect(401);
      const unknown = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: 'ghost@example.com', password: 'WrongPass999!' })
        .expect(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('session middleware', () => {
    it('GET /me without cookie → 401 UNAUTHENTICATED', async () => {
      const res = await request(ctx.app).get('/api/auth/me').expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('expired sessions are rejected and pruned', async () => {
      const agent = await registerUser(ctx, 'expired@example.com');
      const me = await agent.get('/api/auth/me').expect(200);
      ctx.db
        .prepare('UPDATE sessions SET expires_at = ?')
        .run(new Date(Date.now() - 60_000).toISOString());
      await agent.get('/api/auth/me').expect(401);
      const rows = ctx.db
        .prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?')
        .get(me.body.user.id) as { n: number };
      expect(rows.n).toBe(0);
    });

    it('sliding expiry refreshes sessions close to expiry', async () => {
      const agent = await registerUser(ctx, 'sliding@example.com');
      const me = await agent.get('/api/auth/me').expect(200);
      const before = new Date(Date.now() + 3 * 86_400_000).toISOString(); // 3d left, TTL 7d
      ctx.db
        .prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?')
        .run(before, me.body.user.id);
      await agent.get('/api/auth/me').expect(200);
      const after = ctx.db
        .prepare('SELECT expires_at FROM sessions WHERE user_id = ?')
        .get(me.body.user.id) as { expires_at: string };
      expect(Date.parse(after.expires_at)).toBeGreaterThan(Date.parse(before));
    });

    it('tampered/garbage cookies are ignored safely', async () => {
      const res = await request(ctx.app)
        .get('/api/auth/me')
        .set('Cookie', 'stms_sid=deadbeef')
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('revokes the session server-side', async () => {
      const agent = await registerUser(ctx, 'logout@example.com');
      const me = await agent.get('/api/auth/me').expect(200);
      await agent.post('/api/auth/logout').expect(204);
      await agent.get('/api/auth/me').expect(401);
      const rows = ctx.db
        .prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?')
        .get(me.body.user.id) as { n: number };
      expect(rows.n).toBe(0);
    });
  });

  describe('PATCH /api/auth/profile', () => {
    it('updates name and reminder preference', async () => {
      const agent = await registerUser(ctx, 'profile@example.com');
      const res = await agent
        .patch('/api/auth/profile')
        .send({ name: 'Riya S', emailRemindersEnabled: false })
        .expect(200);
      expect(res.body.user).toMatchObject({ name: 'Riya S', emailRemindersEnabled: false });
    });

    it('requires at least one field', async () => {
      const agent = await registerUser(ctx, 'emptypatch@example.com');
      await agent.patch('/api/auth/profile').send({}).expect(400);
    });

    it('does NOT allow changing email (A6 scope decision)', async () => {
      const agent = await registerUser(ctx, 'stable@example.com');
      // Email-only patch → no known fields → rejected with a validation error…
      const res = await agent.patch('/api/auth/profile').send({ email: 'attacker@example.com' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      // …and combined patches ignore email entirely.
      const patch = await agent
        .patch('/api/auth/profile')
        .send({ name: 'Renamed', email: 'attacker@example.com' })
        .expect(200);
      expect(patch.body.user).toMatchObject({ name: 'Renamed', email: 'stable@example.com' });
    });
  });

  describe('PUT /api/auth/password', () => {
    it('requires the correct current password and swaps credentials', async () => {
      const agent = await registerUser(ctx, 'pwd@example.com');
      await agent
        .put('/api/auth/password')
        .send({ currentPassword: 'NotMyPassword1!', newPassword: 'NewSecure456!' })
        .expect(401);

      await agent
        .put('/api/auth/password')
        .send({ currentPassword: PASSWORD, newPassword: 'NewSecure456!' })
        .expect(204);

      // old password now fails, new works, current session stays valid (documented)
      await agent.get('/api/auth/me').expect(200);
      const fresh = request.agent(ctx.app);
      await fresh
        .post('/api/auth/login')
        .send({ email: 'pwd@example.com', password: PASSWORD })
        .expect(401);
      await fresh
        .post('/api/auth/login')
        .send({ email: 'pwd@example.com', password: 'NewSecure456!' })
        .expect(200);
    });
  });

  describe('rate limiting (SECURITY.md)', () => {
    it('429s after the configured limit on auth endpoints', async () => {
      const limited = createTestApp({ RATE_LIMIT_AUTH_PER_MIN: '2' });
      try {
        await request(limited.app)
          .post('/api/auth/login')
          .send({ email: 'a@b.co', password: 'whatever12' })
          .expect(401);
        await request(limited.app)
          .post('/api/auth/login')
          .send({ email: 'a@b.co', password: 'whatever12' })
          .expect(401);
        const res = await request(limited.app)
          .post('/api/auth/login')
          .send({ email: 'a@b.co', password: 'whatever12' })
          .expect(429);
        expect(res.body.error.code).toBe('RATE_LIMITED');
        expect(res.headers['ratelimit-limit'] ?? res.headers['ratelimit']).toBeTruthy();
      } finally {
        closeTestApp(limited);
      }
    });
  });
});
