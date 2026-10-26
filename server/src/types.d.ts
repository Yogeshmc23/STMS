import type { User } from '@stms/shared';

declare global {
  namespace Express {
    interface Request {
      /** Set by the session middleware when a valid session cookie is present. */
      userId?: number;
      /** Cached user row of the authenticated user (mapped DTO). */
      authUser?: User;
    }
  }
}

export {};
