/** Dashboard route (API.md §2): GET /api/dashboard/summary. */
import { Router, type Request, type Response } from 'express';
import { dashboardQuerySchema, type DashboardQuery } from '@stms/shared';
import type { Db } from '../../db/connection.js';
import { asyncHandler } from '../../util/asyncHandler.js';
import { validateQuery } from '../../middleware/validate.js';
import type { RateLimiters } from '../../middleware/rateLimit.js';
import { summary } from './service.js';

export function createDashboardRouter({
  db,
  limiters,
}: {
  db: Db;
  limiters: Pick<RateLimiters, 'readLimiter'>;
}): Router {
  const router = Router();

  router.get(
    '/summary',
    limiters.readLimiter,
    validateQuery(dashboardQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const q = res.locals.query as DashboardQuery;
      res.json(summary(db, req.userId!, q.tzOffset));
    }),
  );

  return router;
}
