/**
 * Tasks routes (API.md §2 "Tasks"). requireAuth + write/read rate limiters are
 * applied at mount time in app.ts. Parsed query lives in res.locals.query
 * (validate.ts) because Express 5 exposes req.query as a getter.
 */
import { Router, type Request, type Response } from 'express';
import { idParamSchema, taskCreateSchema, taskQuerySchema, taskUpdateSchema } from '@stms/shared';
import type { TaskQuery } from '@stms/shared';
import type { Db } from '../../db/connection.js';
import { asyncHandler } from '../../util/asyncHandler.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import type { RateLimiters } from '../../middleware/rateLimit.js';
import * as service from './service.js';

export interface TasksRouterDeps {
  db: Db;
  limiters: Pick<RateLimiters, 'readLimiter' | 'writeLimiter'>;
}

export function createTasksRouter({ db, limiters }: TasksRouterDeps): Router {
  const router = Router();

  router.get(
    '/',
    limiters.readLimiter,
    validateQuery(taskQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const q = res.locals.query as TaskQuery;
      const { items, total } = service.list(db, req.userId!, {
        sort: q.sort,
        page: q.page,
        limit: q.limit,
        q: q.q,
        subject: q.subject,
        priority: q.priority,
        status: q.status,
        type: q.type,
        due: q.due,
        dueFrom: q.dueFrom,
        dueTo: q.dueTo,
        tzOffset: q.tzOffset,
      });
      res.json({ items, page: q.page, limit: q.limit, total });
    }),
  );

  // Static segment BEFORE /:id so 'meta' is never parsed as an id.
  router.get(
    '/meta/subjects',
    limiters.readLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      res.json({ subjects: service.subjects(db, req.userId!) });
    }),
  );

  router.post(
    '/',
    limiters.writeLimiter,
    validateBody(taskCreateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const task = service.createTask(db, req.userId!, req.body);
      res.status(201).json({ task });
    }),
  );

  router.get(
    '/:id',
    limiters.readLimiter,
    validateParams(idParamSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = res.locals.params as { id: number };
      res.json({ task: service.getTask(db, req.userId!, id) });
    }),
  );

  router.patch(
    '/:id',
    limiters.writeLimiter,
    validateParams(idParamSchema),
    validateBody(taskUpdateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = res.locals.params as { id: number };
      res.json({ task: service.patchTask(db, req.userId!, id, req.body) });
    }),
  );

  router.delete(
    '/:id',
    limiters.writeLimiter,
    validateParams(idParamSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = res.locals.params as { id: number };
      service.removeTask(db, req.userId!, id);
      res.status(204).end();
    }),
  );

  return router;
}
