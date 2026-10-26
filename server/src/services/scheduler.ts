/**
 * In-process scheduler (ARCHITECTURE.md §6): one interval per tick doing
 * reminder scan → email drain → session prune. Re-entrancy guarded; errors
 * are logged, never crash the server. Skipped under NODE_ENV=test so suites
 * drive runReminderScan() directly (deterministic).
 */
import type { Db } from '../db/connection.js';
import type { AppConfig } from '../config.js';
import type { Logger } from '../util/logger.js';
import { pruneExpiredSessions, runReminderScan } from '../modules/notifications/service.js';
import { drainEmailQueue } from './email.js';

export function startScheduler(db: Db, config: AppConfig, logger: Logger): () => void /* stop */ {
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return; // skip overlapping ticks (slow disk, retry storms)
    running = true;
    try {
      const created = runReminderScan(db);
      const drained = await drainEmailQueue(db, config, logger);
      const pruned = pruneExpiredSessions(db);
      if (created > 0 || drained.sent > 0 || pruned > 0) {
        logger.info(
          { notificationsCreated: created, email: drained, sessionsPruned: pruned },
          'scheduler tick',
        );
      }
    } catch (err) {
      logger.error({ err }, 'scheduler tick failed'); // keep ticking
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), config.SCHEDULER_INTERVAL_MS);
  timer.unref(); // never keeps the process alive by itself
  return () => clearInterval(timer);
}
