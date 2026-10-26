/**
 * Central error handling (ARCHITECTURE.md §8): the ONLY place that shapes error JSON.
 * Known HttpError → status + envelope; zod safety-net → 400; malformed JSON → 400;
 * anything else → generic 500 (details logged server-side with request id, never leaked).
 */
import type { ErrorRequestHandler, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody, FieldDetail } from '@stms/shared';
import { ERROR_CODES } from '@stms/shared';
import { HttpError } from '../util/httpError.js';
import type { Logger } from '../util/logger.js';

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorBody = {
    error: { code: ERROR_CODES.NOT_FOUND, message: `Cannot ${req.method} ${req.originalUrl}` },
  };
  res.status(404).json(body);
}

function zodDetails(error: ZodError): FieldDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    if (err instanceof HttpError) {
      if (err.status >= 500) {
        logger.error({ err, requestId: req.id }, err.message);
      }
      const body: ApiErrorBody = {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      };
      res.status(err.status).json(body);
      return;
    }

    // Safety net — validate middleware normally converts ZodErrors before this point.
    if (err instanceof ZodError) {
      const body: ApiErrorBody = {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Validation failed.',
          details: zodDetails(err),
        },
      };
      res.status(400).json(body);
      return;
    }

    // body-parser malformed JSON
    if (err instanceof SyntaxError && 'body' in err) {
      const body: ApiErrorBody = {
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Malformed JSON body.' },
      };
      res.status(400).json(body);
      return;
    }

    logger.error({ err, requestId: req.id, method: req.method, path: req.path }, 'Unhandled error');
    const body: ApiErrorBody = {
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Something went wrong. Please try again.',
      },
    };
    res.status(500).json(body);
  };
}
