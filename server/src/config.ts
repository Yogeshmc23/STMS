/**
 * Environment configuration — parsed and validated once at boot (ARCHITECTURE.md §7).
 * Fails fast on invalid config; no defaults for production secrets.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** v4-safe: default handled inside the transform (zod v4 types .default() against the OUTPUT). */
const boolish = (fallback: boolean) =>
  z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === '1' || v === 'true'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DB_PATH: z.string().default(''),
  SESSION_COOKIE_NAME: z.string().min(1).default('stms_sid'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  SESSION_SECRET: z.string().default(''),
  TRUST_PROXY: boolish(false),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  FRAME_ANCESTORS: z.string().default(''),
  CLIENT_ORIGIN: z.url().optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).optional(),
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_WRITE_PER_MIN: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_READ_PER_MIN: z.coerce.number().int().min(1).default(300),
  SCHEDULER_ENABLED: boolish(true),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(5_000).default(60_000),
});

export type Env = z.infer<typeof envSchema>;

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export interface AppConfig extends Env {
  isProduction: boolean;
  isTest: boolean;
  /** Absolute path, or ':memory:' for tests. */
  dbPath: string;
  sessionSecret: string;
  cookieSecure: boolean;
  /** Complete SMTP config, or null when email is disabled (dev outbox mode). */
  smtp: SmtpConfig | null;
  outboxDir: string;
}

/** Server package root (server/), resolved from this module's location in src/ or dist/. */
export const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  // Empty-string env vars (from .env templates) are treated as unset.
  const cleaned: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    cleaned[key] = value === '' ? undefined : value;
  }
  const env = envSchema.parse(cleaned);

  const isProduction = env.NODE_ENV === 'production';
  const isTest = env.NODE_ENV === 'test';

  if (isProduction && env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be set to >= 32 characters in production');
  }
  const sessionSecret = env.SESSION_SECRET || 'dev-only-insecure-secret-do-not-use-in-prod';

  const dbPath = env.DB_PATH
    ? env.DB_PATH === ':memory:'
      ? ':memory:'
      : path.resolve(serverRoot, env.DB_PATH)
    : path.join(serverRoot, 'data', 'stms.sqlite');

  // SMTP is all-or-nothing (API.md §3): partial config is an error, not silent disable.
  const smtpParts = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASS, env.EMAIL_FROM];
  const smtpSetCount = smtpParts.filter(Boolean).length;
  if (smtpSetCount > 0 && smtpSetCount < 4) {
    throw new Error(
      'SMTP config is incomplete: SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM must all be set (or all unset to disable email)',
    );
  }
  const smtp: SmtpConfig | null =
    smtpSetCount === 4
      ? {
          host: env.SMTP_HOST!,
          port: env.SMTP_PORT,
          user: env.SMTP_USER!,
          pass: env.SMTP_PASS!,
          from: env.EMAIL_FROM!,
        }
      : null;

  return {
    ...env,
    isProduction,
    isTest,
    dbPath,
    sessionSecret,
    cookieSecure: isProduction || env.COOKIE_SAMESITE === 'none',
    smtp,
    outboxDir: path.join(serverRoot, 'outbox'),
  };
}
