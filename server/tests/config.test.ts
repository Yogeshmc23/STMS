/** Config loading rules (ARCHITECTURE.md §7): fail-fast, env semantics. */
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  NODE_ENV: 'development',
  SESSION_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('applies documented defaults', () => {
    const config = loadConfig({ ...base });
    expect(config.PORT).toBe(3000);
    expect(config.SESSION_TTL_DAYS).toBe(7);
    expect(config.SESSION_COOKIE_NAME).toBe('stms_sid');
    expect(config.smtp).toBeNull();
    expect(config.dbPath).toMatch(/data[\\/]stms\.sqlite$/);
    expect(config.isProduction).toBe(false);
  });

  it('treats empty-string env vars as unset', () => {
    const config = loadConfig({ ...base, DB_PATH: '', SMTP_HOST: '' });
    expect(config.dbPath).toMatch(/stms\.sqlite$/);
    expect(config.smtp).toBeNull();
  });

  it('rejects partial SMTP configuration (all-or-nothing, API.md §3)', () => {
    expect(() => loadConfig({ ...base, SMTP_HOST: 'smtp.example.com' })).toThrow(
      /SMTP config is incomplete/,
    );
  });

  it('accepts complete SMTP configuration', () => {
    const config = loadConfig({
      ...base,
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      EMAIL_FROM: 'STMS <reminders@example.com>',
    });
    expect(config.smtp).toEqual({
      host: 'smtp.example.com',
      port: 465,
      user: 'user',
      pass: 'pass',
      from: 'STMS <reminders@example.com>',
    });
  });

  it('requires a strong SESSION_SECRET in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'short' })).toThrow(
      /SESSION_SECRET/,
    );
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/);
  });

  it('forces secure cookies when SameSite=None (browser requirement)', () => {
    const config = loadConfig({ ...base, COOKIE_SAMESITE: 'none' });
    expect(config.cookieSecure).toBe(true);
    const lax = loadConfig({ ...base, COOKIE_SAMESITE: 'lax' });
    expect(lax.cookieSecure).toBe(false);
  });

  it('rejects invalid values', () => {
    expect(() => loadConfig({ ...base, PORT: 'not-a-number' })).toThrow();
    expect(() => loadConfig({ ...base, NODE_ENV: 'staging' })).toThrow();
  });
});
