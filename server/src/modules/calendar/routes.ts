/**
 * Calendar range endpoint (API.md §2): tasks with a due date inside
 * [from, to], all statuses, single user-scoped query. Date-only bounds are
 * normalized to whole UTC days (inclusive end) so `to=2026-10-31` behaves as
 * "through end of Oct 31"; the client normally sends exact local instants.
 */
import { Router, type Request, type Response } from 'express';
import { calendarQuerySchema, type CalendarQuery } from '@stms/shared';
import type { Db } from '../../db/connection.js';
import { asyncHandler } from '../../util/asyncHandler.js';
import { validateQuery } from '../../middleware/validate.js';
import type { RateLimiters } from '../../middleware/rateLimit.js';
import { tasksInRange } from '../tasks/repo.js';

export function normalizeRange(from: string, to: string): { fromIso: string; toIso: string } {
  return {
    fromIso: from.length === 10 ? `${from}T00:00:00.000Z` : new Date(from).toISOString(),
    toIso: to.length === 10 ? `${to}T23:59:59.999Z` : new Date(to).toISOString(),
  };
}

export interface CalendarRouterDeps {
  db: Db;
  limiters: Pick<RateLimiters, 'readLimiter'>;
}

export function createCalendarRouter({ db, limiters }: CalendarRouterDeps): Router {
  const router = Router();

  router.get(
    '/',
    limiters.readLimiter,
    validateQuery(calendarQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const q = res.locals.query as CalendarQuery;
      const { fromIso, toIso } = normalizeRange(q.from, q.to);
      res.json({ tasks: tasksInRange(db, req.userId!, fromIso, toIso) });
    }),
  );

  return router;
}
