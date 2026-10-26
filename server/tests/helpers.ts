/**
 * Test harness (AGENTS.md §9): every test file gets a fresh in-memory DB with
 * migrations applied, the real Express app, and a silent logger.
 * Fixtures are created via factories below — never the dev seed.
 */
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { openDb, type Db } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { createLogger } from '../src/util/logger.js';

export interface TestContext {
  app: Express;
  db: Db;
  config: AppConfig;
}

export function createTestApp(envOverrides: Record<string, string> = {}): TestContext {
  const config = loadConfig({
    NODE_ENV: 'test',
    DB_PATH: ':memory:',
    LOG_LEVEL: 'silent',
    SESSION_SECRET: 'test-secret-0123456789abcdef0123456789',
    ...envOverrides,
  });
  const db = openDb(config.dbPath);
  runMigrations(db);
  const logger = createLogger(config);
  const app = createApp({ db, config, logger });
  return { app, db, config };
}

export function closeTestApp(ctx: TestContext): void {
  ctx.db.close();
}
