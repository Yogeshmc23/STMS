/**
 * Rate limiting (API.md §1, SECURITY.md): 10/min per IP on auth endpoints,
 * 120/min per user on writes, 300/min per user on reads. Keys fall back to IP
 * when unauthenticated. Returns 429 with the standard error envelope.
 */
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';
import { ERROR_CODES } from '@stms/shared';
import type { AppConfig } from '../config.js';

function limited(message: string): RequestHandler {
  return (_req, res) => {
    res.status(429).json({ error: { code: ERROR_CODES.RATE_LIMITED, message } });
  };
}

function limitKey(req: Request): string {
  if (req.userId !== undefined) return `u:${req.userId}`;
  // ipKeyGenerator normalizes IPv6 into /56 buckets so v6 clients can't bypass limits
  // (express-rate-limit ERR_ERL_KEY_GEN_IPV6).
  return `ip:${ipKeyGenerator(req.ip ?? '0.0.0.0', 56)}`;
}

export interface RateLimiters {
  authLimiter: RequestHandler;
  writeLimiter: RequestHandler;
  readLimiter: RequestHandler;
}

export function createRateLimiters(config: AppConfig): RateLimiters {
  const windowMs = 60_000;
  const common = {
    windowMs,
    standardHeaders: 'draft-7' as const,
    legacyHeaders: false,
    keyGenerator: limitKey,
  };

  return {
    authLimiter: rateLimit({
      ...common,
      limit: config.RATE_LIMIT_AUTH_PER_MIN,
      handler: limited('Too many authentication attempts. Try again in a minute.'),
    }),
    writeLimiter: rateLimit({
      ...common,
      limit: config.RATE_LIMIT_WRITE_PER_MIN,
      handler: limited('You are making changes too quickly. Please slow down.'),
    }),
    readLimiter: rateLimit({
      ...common,
      limit: config.RATE_LIMIT_READ_PER_MIN,
      handler: limited('Too many requests. Please slow down.'),
    }),
  };
}
