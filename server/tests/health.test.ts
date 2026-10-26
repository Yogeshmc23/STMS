/**
 * Phase 0 verification (IMPLEMENTATION_PLAN.md): health endpoint, JSON 404/400
 * envelopes, origin guard, security headers — the app-factory contract itself.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { closeTestApp, createTestApp, type TestContext } from './helpers.js';

describe('app factory (Phase 0)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestApp();
  });
  afterAll(() => closeTestApp(ctx));

  describe('GET /api/health', () => {
    it('returns ok with a real db check', async () => {
      const res = await request(ctx.app).get('/api/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
      expect(typeof res.body.uptime).toBe('number');
      expect(typeof res.body.version).toBe('string');
    });

    it('sets no-store cache control and a request id', async () => {
      const res = await request(ctx.app).get('/api/health').expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-request-id']).toBeTruthy();
    });
  });

  describe('error conventions (API.md §1)', () => {
    it('returns a JSON 404 envelope for unknown API paths', async () => {
      const res = await request(ctx.app).get('/api/does-not-exist').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(typeof res.body.error.message).toBe('string');
    });

    it('returns 400 VALIDATION_ERROR for malformed JSON', async () => {
      const res = await request(ctx.app)
        .post('/api/does-not-exist')
        .set('Content-Type', 'application/json')
        .send('{"broken"')
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('origin guard (CSRF posture)', () => {
    it('rejects unsafe methods with a mismatched Origin', async () => {
      const res = await request(ctx.app)
        .post('/api/does-not-exist')
        .set('Origin', 'https://evil.example')
        .set('Content-Type', 'application/json')
        .send('{}')
        .expect(403);
      expect(res.body.error.code).toBe('ORIGIN_MISMATCH');
    });

    it('passes requests whose Origin matches the Host (reaches routing)', async () => {
      const res = await request(ctx.app)
        .post('/api/does-not-exist')
        .set('Host', 'app.example')
        .set('Origin', 'https://app.example')
        .set('Content-Type', 'application/json')
        .send('{}');
      // Past the guard: unknown route → 404, not 403.
      expect(res.status).toBe(404);
    });

    it('allows unsafe methods without an Origin header (non-browser clients)', async () => {
      const res = await request(ctx.app)
        .post('/api/does-not-exist')
        .set('Content-Type', 'application/json')
        .send('{}');
      expect(res.status).toBe(404);
    });
  });

  describe('security headers', () => {
    it('hides x-powered-by and sends a CSP', async () => {
      const res = await request(ctx.app).get('/api/health').expect(200);
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    });
  });
});
