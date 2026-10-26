/**
 * Typed HTTP errors → central error middleware shapes the JSON envelope (API.md §1).
 * Services/routes throw these; nothing else formats error responses.
 */
import { ERROR_CODES, type FieldDetail } from '@stms/shared';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: FieldDetail[],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const httpError = {
  badRequest: (message = 'Invalid request.', details?: FieldDetail[]) =>
    new HttpError(400, ERROR_CODES.VALIDATION_ERROR, message, details),
  unauthenticated: () => new HttpError(401, ERROR_CODES.UNAUTHENTICATED, 'You must be signed in.'),
  invalidCredentials: () =>
    new HttpError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password.'),
  notFound: (what = 'Resource') => new HttpError(404, ERROR_CODES.NOT_FOUND, `${what} not found.`),
  emailTaken: () =>
    new HttpError(409, ERROR_CODES.EMAIL_TAKEN, 'An account with this email already exists.'),
  originMismatch: () =>
    new HttpError(403, ERROR_CODES.ORIGIN_MISMATCH, 'Cross-origin request rejected.'),
  tooManyRequests: () =>
    new HttpError(429, ERROR_CODES.RATE_LIMITED, 'Too many requests. Please slow down.'),
};
