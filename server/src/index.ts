/**
 * Server entry (ARCHITECTURE.md §2): env → config (validated) → db → migrations
 * → app → listen. Fail-fast on bad config; graceful shutdown on SIGINT/SIGTERM.
 */
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { startScheduler } from './services/scheduler.js';
import { createLogger } from './util/logger.js';

function main(): void {
  const config = loadConfig();
  const logger = createLogger(config);

  const db = openDb(config.dbPath);
  const applied = runMigrations(db);
  if (applied.length > 0) {
    logger.info({ applied }, 'Applied database migrations');
  }

  const app = createApp({ db, config, logger });
  const server = app.listen(config.PORT, '0.0.0.0', () => {
    logger.info(
      { port: config.PORT, env: config.NODE_ENV, dbPath: config.dbPath },
      'STMS server listening',
    );
  });

  // Reminder scheduler (ARCHITECTURE.md §6): 60s ticks, disabled under tests
  // (suites drive runReminderScan directly) or when SCHEDULER_ENABLED=0.
  let stopScheduler: (() => void) | undefined;
  if (config.SCHEDULER_ENABLED && !config.isTest) {
    stopScheduler = startScheduler(db, config, logger);
    logger.info({ intervalMs: config.SCHEDULER_INTERVAL_MS }, 'reminder scheduler started');
  }
  if (!config.smtp) {
    logger.warn(
      { outboxDir: config.outboxDir },
      'SMTP not configured — reminder emails go to the dev outbox (not sent)',
    );
  }

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutting down');
    stopScheduler?.();
    server.close(() => {
      db.close();
      process.exit(0);
    });
    // Force-exit if connections hang (SRE: bounded shutdown).
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

try {
  main();
} catch (err) {
  console.error('Failed to start STMS server:', err);
  process.exit(1);
}
