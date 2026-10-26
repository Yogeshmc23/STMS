/**
 * Structured JSON logging via pino (MONITORING.md).
 * Secret-bearing fields are redacted at the serializer level — never logged.
 */
import pino, { type Logger } from 'pino';
import type { AppConfig } from '../config.js';

export type { Logger };

export function createLogger(config: Pick<AppConfig, 'LOG_LEVEL'>): Logger {
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        '*.password',
        '*.currentPassword',
        '*.newPassword',
        '*.passwordHash',
        '*.password_hash',
        '*.token',
      ],
      censor: '[redacted]',
    },
  });
}
