/**
 * CSRF posture (API.md §1): state-changing requests that carry an Origin header
 * must match the request's own host (protocol-insensitive: dev proxies terminate
 * TLS at the edge) or an explicitly allowed origin (split-origin dev via CLIENT_ORIGIN).
 * Requests without an Origin header (curl, server-to-server) pass — browsers always
 * send Origin on cross-site unsafe requests, and SameSite=Lax cookies already block
 * the classic form-post CSRF vector.
 */
import type { RequestHandler } from 'express';
import { httpError } from '../util/httpError.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function originGuard(allowedOrigins: string[] = []): RequestHandler {
  const allowed = new Set(allowedOrigins.filter(Boolean));
  return (req, _res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (!origin) {
      next();
      return;
    }
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      next(httpError.originMismatch());
      return;
    }
    const host = req.headers.host ?? '';
    if (originHost === host || allowed.has(origin)) {
      next();
      return;
    }
    next(httpError.originMismatch());
  };
}
