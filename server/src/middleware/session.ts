/**
 * Session middleware (ARCHITECTURE.md §4): resolves the httpOnly cookie into
 * req.userId on every request. Never trusts client-side auth — every protected
 * route goes through requireAuth, and resource ownership is enforced in repos.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../config.js';
import type { Db } from '../db/connection.js';
import { httpError } from '../util/httpError.js';
import { resolveSession } from '../modules/auth/service.js';

export function sessionMiddleware(config: AppConfig, db: Db): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const raw = req.cookies?.[config.SESSION_COOKIE_NAME];
    if (typeof raw === 'string' && raw.length > 0) {
      const resolved = resolveSession(config, db, raw);
      if (resolved) {
        req.userId = resolved.userId;
        req.authUser = resolved.user;
      }
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (req.userId === undefined) {
    next(httpError.unauthenticated());
    return;
  }
  next();
};
