/** Analytics route (API.md §2): GET /api/analytics/overview?days=14|30. */
import { Router, type Request, type Response } from 'express';
import { analyticsQuerySchema, type AnalyticsQuery } from '@stms/shared';
import type { Db } from '../../db/connection.js';
import { asyncHandler } from '../../util/asyncHandler.js';
import { validateQuery } from '../../middleware/validate.js';
import type { RateLimiters } from '../../middleware/rateLimit.js';
import { overview } from './service.js';

export function createAnalyticsRouter({
  db,
  limiters,
}: {
  db: Db;
  limiters: Pick<RateLimiters, 'readLimiter'>;
}): Router {
  const router = Router();

  router.get(
    '/overview',
    limiters.readLimiter,
    validateQuery(analyticsQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const q = res.locals.query as AnalyticsQuery;
      res.json(overview(db, req.userId!, q.days));
    }),
  );

  return router;
}
