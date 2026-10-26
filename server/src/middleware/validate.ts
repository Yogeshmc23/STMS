/**
 * Request validation with shared zod schemas (AGENTS.md §3).
 * Parsed (and transformed) input replaces req.body / lands in res.locals for
 * query+params (Express 5 defines req.query as a getter — it cannot be reassigned).
 */
import type { RequestHandler } from 'express';
import type { ZodError, ZodTypeAny } from 'zod';
import type { FieldDetail } from '@stms/shared';
import { httpError } from '../util/httpError.js';

function toDetails(error: ZodError): FieldDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export function validateBody<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(httpError.badRequest('Validation failed.', toDetails(result.error)));
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(httpError.badRequest('Validation failed.', toDetails(result.error)));
      return;
    }
    res.locals.query = result.data;
    next();
  };
}

export function validateParams<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(httpError.badRequest('Validation failed.', toDetails(result.error)));
      return;
    }
    res.locals.params = result.data;
    next();
  };
}
