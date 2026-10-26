/**
 * Express app factory (ARCHITECTURE.md §2-3). Pure factory — no listen() here,
 * so tests can drive the real app via supertest against an in-memory DB.
 *
 * Middleware order matters:
 *   request-id + structured logs → security headers → body parse → cookies
 *   → optional CORS (split-origin dev) → origin guard → no-store → routes
 *   → SPA static/fallback (when built) → JSON 404 → central error handler.
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { HealthResponse } from '@stms/shared';
import { serverRoot, type AppConfig } from './config.js';
import type { Db } from './db/connection.js';
import { createErrorHandler, notFoundHandler } from './middleware/error.js';
import { originGuard } from './middleware/originGuard.js';
import { asyncHandler } from './util/asyncHandler.js';
import { createRateLimiters } from './middleware/rateLimit.js';
import { requireAuth, sessionMiddleware } from './middleware/session.js';
import { createAuthRouter } from './modules/auth/routes.js';
import { createTasksRouter } from './modules/tasks/routes.js';
import { createCalendarRouter } from './modules/calendar/routes.js';
import { createDashboardRouter } from './modules/dashboard/routes.js';
import { createNotificationsRouter } from './modules/notifications/routes.js';
import { createAnalyticsRouter } from './modules/analytics/routes.js';
import { runReminderScan } from './modules/notifications/service.js';
import { drainEmailQueue } from './services/email.js';
import type { Logger } from './util/logger.js';

export interface AppDeps {
  db: Db;
  config: AppConfig;
  logger: Logger;
}

const requireFromHere = createRequire(import.meta.url);
const pkg = requireFromHere('../package.json') as { version: string };

function buildHelmetOptions(config: AppConfig) {
  // FRAME_ANCESTORS overrides CSP frame-ancestors (preview/iframe environments) and
  // disables X-Frame-Options so the two mechanisms never contradict each other.
  const frameAncestors = config.FRAME_ANCESTORS.trim();
  return {
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'font-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': frameAncestors ? frameAncestors.split(/\s+/) : ["'self'"],
      },
    },
    frameguard: frameAncestors ? (false as const) : { action: 'sameorigin' as const },
    crossOriginResourcePolicy: { policy: 'same-site' as const },
  };
}

function corsMiddleware(origin: string): RequestHandler {
  return (req, res, next) => {
    if (req.headers.origin === origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.sendStatus(204);
        return;
      }
    }
    next();
  };
}

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

export function createApp({ db, config, logger }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  if (config.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const header = req.headers['x-request-id'];
        const id = typeof header === 'string' && header.length > 0 ? header : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      // Health probes are frequent and uninteresting — keep logs signal-rich (MONITORING.md).
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );

  app.use(helmet(buildHelmetOptions(config)));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  if (config.CLIENT_ORIGIN) {
    app.use(corsMiddleware(config.CLIENT_ORIGIN));
  }

  app.use('/api', originGuard(config.CLIENT_ORIGIN ? [config.CLIENT_ORIGIN] : []));
  app.use('/api', noStore);

  // --- Public health endpoint (API.md §2; used by deploy probes) ---
  app.get('/api/health', (_req: Request, res: Response) => {
    let body: HealthResponse;
    try {
      db.prepare('SELECT 1 AS ok').get();
      body = {
        status: 'ok',
        db: 'ok',
        uptime: Math.round(process.uptime()),
        version: pkg.version,
      };
      res.json(body);
    } catch {
      body = {
        status: 'degraded',
        db: 'unavailable',
        uptime: Math.round(process.uptime()),
        version: pkg.version,
      };
      res.status(503).json(body);
    }
  });

  // --- Session + feature routers (mounted per IMPLEMENTATION_PLAN phases) ---
  app.use(sessionMiddleware(config, db));
  const limiters = createRateLimiters(config);
  app.use('/api/auth', createAuthRouter({ config, db }));
  app.use('/api/tasks', requireAuth, createTasksRouter({ db, limiters }));
  app.use('/api/calendar', requireAuth, createCalendarRouter({ db, limiters }));
  app.use('/api/dashboard', requireAuth, createDashboardRouter({ db, limiters }));
  app.use('/api/notifications', requireAuth, createNotificationsRouter({ db, limiters }));
  app.use('/api/analytics', requireAuth, createAnalyticsRouter({ db, limiters }));

  // Dev/test-only scheduler trigger (API.md §2): never mounted in production.
  if (!config.isProduction) {
    app.post(
      '/api/dev/run-reminder-scan',
      requireAuth,
      asyncHandler(async (_req: Request, res: Response) => {
        const created = runReminderScan(db);
        const email = await drainEmailQueue(db, config, logger);
        res.json({ notificationsCreated: created, email });
      }),
    );
  }

  // --- Production SPA serving (ARCHITECTURE.md §3): static assets + history fallback ---
  const publicDir = path.join(serverRoot, 'public');
  const indexHtml = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(publicDir, { index: false, maxAge: config.isProduction ? '1h' : 0 }));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(indexHtml);
    });
  }

  app.use('/api', notFoundHandler);
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
