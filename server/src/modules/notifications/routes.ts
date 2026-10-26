/**
 * Notification routes (API.md §2). Reads are plain; mark-read is idempotent.
 * Dev-only scan trigger route lives here too but is mounted ONLY outside
 * production (app.ts) so tests/dev can drive the scheduler deterministically.
 */
import { Router, type Request, type Response } from 'express';
import { idParamSchema, notificationQuerySchema } from '@stms/shared';
import type { NotificationQuery } from '@stms/shared';
import type { Db } from '../../db/connection.js';
import { asyncHandler } from '../../util/asyncHandler.js';
import { validateParams, validateQuery } from '../../middleware/validate.js';
import type { RateLimiters } from '../../middleware/rateLimit.js';
import * as service from './service.js';

export function createNotificationsRouter({
  db,
  limiters,
}: {
  db: Db;
  limiters: Pick<RateLimiters, 'readLimiter' | 'writeLimiter'>;
}): Router {
  const router = Router();

  router.get(
    '/',
    limiters.readLimiter,
    validateQuery(notificationQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const q = res.locals.query as NotificationQuery;
      const { items, total } = service.list(db, req.userId!, {
        unreadOnly: q.unreadOnly,
        page: q.page,
        limit: q.limit,
      });
      res.json({ items, page: q.page, limit: q.limit, total });
    }),
  );

  router.get(
    '/unread-count',
    limiters.readLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      res.json({ count: service.unreadCount(db, req.userId!) });
    }),
  );

  router.post(
    '/read-all',
    limiters.writeLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      service.markAllRead(db, req.userId!);
      res.status(204).end();
    }),
  );

  router.post(
    '/:id/read',
    limiters.writeLimiter,
    validateParams(idParamSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = res.locals.params as { id: number };
      res.json({ notification: service.markRead(db, req.userId!, id) });
    }),
  );

  router.delete(
    '/:id',
    limiters.writeLimiter,
    validateParams(idParamSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = res.locals.params as { id: number };
      service.remove(db, req.userId!, id);
      res.status(204).end();
    }),
  );

  return router;
}
