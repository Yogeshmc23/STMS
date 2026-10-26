/**
 * Auth + profile routes (API.md §2 "Auth & profile").
 * Cookie handling lives here (HTTP concern); business rules in service.ts.
 */
import { Router, type CookieOptions, type Request, type Response } from 'express';
import {
  loginSchema,
  passwordChangeSchema,
  profilePatchSchema,
  registerSchema,
} from '@stms/shared';
import type { AppConfig } from '../../config.js';
import type { Db } from '../../db/connection.js';
import { asyncHandler } from '../../util/asyncHandler.js';
import { httpError } from '../../util/httpError.js';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/session.js';
import { createRateLimiters } from '../../middleware/rateLimit.js';
import * as service from './service.js';

export interface AuthRouterDeps {
  config: AppConfig;
  db: Db;
}

function cookieOptions(config: AppConfig, expiresAt: string): CookieOptions {
  const maxAge = Math.max(0, Date.parse(expiresAt) - Date.now());
  return {
    httpOnly: true,
    sameSite: config.COOKIE_SAMESITE,
    secure: config.cookieSecure,
    path: '/',
    maxAge,
  };
}

function setSessionCookie(
  config: AppConfig,
  res: Response,
  token: string,
  expiresAt: string,
): void {
  res.cookie(config.SESSION_COOKIE_NAME, token, cookieOptions(config, expiresAt));
}

function clearSessionCookie(config: AppConfig, res: Response): void {
  res.clearCookie(config.SESSION_COOKIE_NAME, { path: '/' });
}

export function createAuthRouter({ config, db }: AuthRouterDeps): Router {
  const router = Router();
  const { authLimiter } = createRateLimiters(config);

  router.post(
    '/register',
    authLimiter,
    validateBody(registerSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const session = await service.register(config, db, req.body);
      setSessionCookie(config, res, session.token, session.expiresAt);
      res.status(201).json({ user: session.user });
    }),
  );

  router.post(
    '/login',
    authLimiter,
    validateBody(loginSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const session = await service.login(config, db, req.body);
      setSessionCookie(config, res, session.token, session.expiresAt);
      res.json({ user: session.user });
    }),
  );

  router.post(
    '/logout',
    asyncHandler(async (req: Request, res: Response) => {
      const raw = req.cookies?.[config.SESSION_COOKIE_NAME];
      if (typeof raw === 'string') {
        service.logout(config, db, raw);
      }
      clearSessionCookie(config, res);
      res.status(204).end();
    }),
  );

  router.get(
    '/me',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      // Re-read the row so profile updates are immediately reflected.
      const user = service.getUserById(db, req.userId!);
      if (!user) {
        throw httpError.unauthenticated();
      }
      res.json({ user });
    }),
  );

  router.patch(
    '/profile',
    requireAuth,
    validateBody(profilePatchSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const user = service.updateProfile(db, req.userId!, req.body);
      res.json({ user });
    }),
  );

  router.put(
    '/password',
    requireAuth,
    validateBody(passwordChangeSchema),
    asyncHandler(async (req: Request, res: Response) => {
      await service.changePassword(db, req.userId!, req.body);
      res.status(204).end();
    }),
  );

  return router;
}
