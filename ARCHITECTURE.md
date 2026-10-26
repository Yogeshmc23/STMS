# ARCHITECTURE.md — Student Task Manager

**Stage 3 deliverable.** Technical architecture with reasoning. Guiding constraint from the brief: _keep it simple — this doesn't need microservices_. This is a monorepo with one backend process and one SPA frontend, deployable as a single container/process.

---

## 1. Tech Stack (with reasoning)

| Layer              | Choice                                                                                     | Why (and why not alternatives)                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language           | **TypeScript (strict)** everywhere                                                         | One language across client/server; type safety required by the brief; shared types via a common package.                                                                                                                                                                                                                                                                                                |
| Backend            | **Node.js 22 + Express 5**                                                                 | Node 22 is installed & verified in this environment. Express is the smallest coherent choice for a REST API + static serving — no microservices, no framework lock-in (rejected NestJS as over-engineered for one resource domain; rejected Next.js SSR because the app is a private dashboard behind auth, SPA is simpler and the owner approved Express+React).                                       |
| Frontend           | **React 18 + Vite**                                                                        | Owner-approved. Vite gives fast dev server with proxy to the API; React 18 stable, huge ecosystem. No heavyweight state lib — React Query (TanStack Query) only, for server-state caching; everything else is context/hooks.                                                                                                                                                                            |
| Styling            | **Hand-rolled CSS with custom properties**                                                 | DESIGN.md system is small and specific; avoids Tailwind build churn and component-lib theming fights. CSS Modules-free single design-system stylesheet + component classes.                                                                                                                                                                                                                             |
| Database           | **SQLite via better-sqlite3**                                                              | Verified working in this environment (smoke test passed). Zero-ops, single-file, synchronous API (simplest correct transaction model), WAL mode for concurrency at student scale. Postgres would require a server this sandbox doesn't have and adds ops cost with no benefit at this scale. Migration path to Postgres is kept cheap by using standard SQL in migrations and a thin data-access layer. |
| Migrations         | **Hand-rolled versioned SQL migrations** (`migrations/*.sql` + `schema_migrations` table)  | No ORM runtime dependency; migrations are explicit, reviewable, idempotent-guarded.                                                                                                                                                                                                                                                                                                                     |
| Auth               | **Session cookie (server-side sessions in SQLite) + bcrypt**                               | httpOnly/SameSite=Lax cookie defeats token theft via XSS better than localStorage JWT; server-side sessions allow instant logout/expiry revocation. bcrypt (cost 12) for passwords.                                                                                                                                                                                                                     |
| Validation         | **zod**                                                                                    | One schema per endpoint → runtime validation + static types; shared error shape.                                                                                                                                                                                                                                                                                                                        |
| Email              | **nodemailer**                                                                             | Owner approved in-app + email. nodemailer is provider-agnostic SMTP; disabled unless `SMTP_*` configured (dev outbox fallback). No third-party SDK lock-in.                                                                                                                                                                                                                                             |
| Scheduler          | **In-process `setInterval` (60 s tick)**                                                   | Reminder scan is a cheap indexed query; no cron infra, no queue needed at this scale. Idempotent by design (unique notification keys), so restarts/ticks never duplicate.                                                                                                                                                                                                                               |
| Testing            | **Vitest + Supertest** (API/integration), **Vitest + Testing Library** (client components) | One test runner for both packages; Supertest exercises the real Express app over HTTP against a temp SQLite DB. No Playwright (browser binaries can't be downloaded in this sandbox — flagged honestly; E2E critical paths covered by API-level integration tests + manual verification checklist).                                                                                                     |
| Lint/Format        | **ESLint (flat config) + Prettier**                                                        | Required by Stage 8.                                                                                                                                                                                                                                                                                                                                                                                    |
| Runtime mgr (prod) | **Single `node dist/index.js`**                                                            | One process serves API + built SPA. No PM2/Docker requirement, though a Dockerfile is provided for hosts that want it.                                                                                                                                                                                                                                                                                  |

## 2. Repository Layout (npm workspaces monorepo)

```
STMS/
├── package.json               # workspaces root, shared scripts
├── shared/                    # @stms/shared — types, zod schemas, constants used by both sides
│   └── src/ (types.ts, schemas.ts, constants.ts)
├── server/                    # @stms/server — Express API
│   ├── src/
│   │   ├── index.ts           # entry: env → db → app → listen (+ scheduler start)
│   │   ├── app.ts             # express app factory (testable without listen)
│   │   ├── config.ts          # env parsing/validation (zod), defaults
│   │   ├── db/
│   │   │   ├── connection.ts  # better-sqlite3 open, pragmas (WAL, FK)
│   │   │   ├── migrate.ts     # migration runner
│   │   │   ├── migrations/    # 001_init.sql, ...
│   │   │   └── seed.ts        # dev seed (sample tasks across subjects/priorities/statuses)
│   │   ├── middleware/        # auth (session), error handler, rate limit, validate, notFound
│   │   ├── modules/
│   │   │   ├── auth/          # routes + service (register/login/logout/profile/password)
│   │   │   ├── tasks/         # routes + service + repo (CRUD, search/filter/sort, buckets)
│   │   │   ├── dashboard/     # summary aggregates
│   │   │   ├── calendar/      # range queries
│   │   │   ├── analytics/     # completion/trend/workload aggregates
│   │   │   └── notifications/ # list/read + reminder scheduler + email sender
│   │   └── util/              # http errors, asyncHandler, time helpers
│   └── tests/                 # *.test.ts (vitest + supertest)
├── client/                    # @stms/client — React SPA
│   ├── index.html
│   ├── vite.config.ts         # dev proxy /api → server; build out ../server/public
│   └── src/
│       ├── main.tsx, App.tsx  # router, providers
│       ├── api/               # typed fetch client (credentials: include), endpoints
│       ├── auth/              # AuthProvider (me query, login/logout), ProtectedRoute
│       ├── components/        # TaskCard, PriorityBadge, DueBadge, StatusChip, FilterBar,
│       │                      # TaskForm modal, CalendarMonth/Week/Day, StatCard,
│       │                      # NotificationPanel, EmptyState, Skeleton, Toast, ConfirmDialog,
│       │                      # Icons (SVG sprite), Layout (sidebar/bottom nav/header)
│       ├── pages/             # Dashboard, Tasks, Calendar, Analytics, Notifications,
│       │                      # Profile, Login, Register, NotFound
│       ├── hooks/             # useDebounce, useMediaQuery, useDocumentTitle, useTheme
│       └── styles/            # design-system.css (tokens, base), components.css
├── docs/                      # project docs beyond the mandated root set (ADRs if needed)
├── .env.example               # documented, no secrets
├── .gitignore                 # node_modules, dist, *.sqlite, .env, outbox
├── Dockerfile                 # optional single-image prod build
├── render.yaml                # free-tier deploy blueprint (Stage 18)
└── (root docs)                # PRD/DESIGN/ARCHITECTURE/DATABASE/API/AGENTS/IMPLEMENTATION_PLAN/
                               # TESTING/SECURITY/DEPLOYMENT/MONITORING/README/PROGRESS_LOG
```

**Dependency direction:** `client → shared ← server`. The client never imports server code; the server never imports React. Shared holds only types/zod schemas/constants (no runtime deps beyond zod).

## 3. Frontend/Backend Split & Data Flow

- **Dev:** Vite dev server (port 5173) proxies `/api/*` → Express (port 3001). One origin for the browser → no CORS complexity in dev; preview works through the sandbox proxy because the browser only ever talks to Vite's origin.
- **Prod:** `vite build` outputs to `server/public/`; Express serves it statically and handles `/api/*`. **Single process, single port** (`PORT`, default 3000) → trivially deployable on any free tier; HTTPS terminated by the host.
- **Data flow:** UI event → TanStack Query mutation → typed API client (`fetch` with `credentials: 'include'`) → Express route → zod validate → auth/ownership check → service → repo → SQLite → JSON response → query cache invalidation → UI re-render. Server state lives in the query cache; the only client global state is auth session + theme + toasts.

## 4. Authentication Approach

1. `POST /api/auth/register|login` → create/find user → create `sessions` row (random 32-byte token id, SHA-256 hash stored, 7-day expiry) → `Set-Cookie: stms_sid=<token>; HttpOnly; SameSite=Lax; Path=/; Secure(prod)`.
2. Every request: session middleware loads session by cookie hash, checks expiry, attaches `req.userId`. Sliding expiry: refresh `expires_at` when < 6 days remain.
3. Logout deletes the session row (instant revocation). Expired sessions are pruned by the scheduler tick.
4. CSRF: SameSite=Lax cookie + JSON-only API (no form posts) + same-origin dev proxy → CSRF surface is minimal; state-changing endpoints additionally reject requests whose `Origin` header is present and not the app's own origin.
5. Passwords: bcrypt hash cost 12; password never leaves the server; rate-limited auth endpoints (see SECURITY.md).

## 5. API Architecture

REST, versioned under `/api/v1` is **not** used — single-consumer app, `/api/*` per API.md (Stage 5 defines every endpoint, error shape, validation rules). Conventions: JSON everywhere; errors as `{ error: { code, message, details? } }`; correct status codes (400 validation, 401 unauthenticated, 403/404 ownership — we return 404 for other users' resources to avoid existence leaks); pagination via `?page=&limit=`; filtering/sorting via query params validated by zod.

## 6. Notifications & Reminders — How Delivery Actually Works

- **Store:** `notifications` table (DATABASE.md). Unique index on `(user_id, kind, task_id)` ⇒ dedup is a DB guarantee, not app logic.
- **Scheduler:** in-process `setInterval` 60 s (started in `index.ts`, skipped during tests, injectable for tests via a `runReminderScan(db, now)` pure-ish function).
  - Each tick, per active user: find open tasks due within (0, 24h] not yet notified → insert `deadline_soon_24h`; due within (0, 1h] → `deadline_soon_1h`; due < now → `overdue`. Insert = `INSERT OR IGNORE` against the unique key.
  - Also: prune expired sessions; process pending email queue rows.
- **Email:** `email_queue` table (transactionally inserted alongside a notification when the user has email enabled and SMTP is configured). The tick picks up `pending` rows, sends via nodemailer, marks `sent`/`failed` with error text and attempt count (max 3, then `failed` permanently — surfaced in monitoring). **SMTP not configured ⇒ queue rows are written to `server/outbox/*.eml` and marked `skipped_no_smtp`** (dev outbox, clearly flagged — never presented as real delivery).
- **In-app delivery:** polling. Client queries unread count every 60 s (TanStack Query `refetchInterval`) and on window focus. No WebSockets — one extra moving part with no MVP benefit at student scale; polling an indexed count query is negligible.
- **User preference:** `users.email_reminders_enabled` (default true; toggle in Profile).

## 7. Environment & Configuration

All config via env vars, parsed & validated once in `server/src/config.ts` (zod) — the process fails fast on invalid config. `.env` supported via Node's `--env-file` in dev scripts (no dotenv dependency). See `.env.example` for the full documented list: `NODE_ENV, PORT, DB_PATH, SESSION_COOKIE_NAME, SESSION_TTL_DAYS, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, EMAIL_REPLY_TO, CLIENT_ORIGIN (dev CORS only), RATE_LIMIT_*`. **Secrets never committed; never exposed to the client** (Vite only bundles `VITE_*` vars, and we use none for secrets).

## 8. Error Handling Strategy

- **Server:** central Express error middleware maps known `HttpError`s to status+JSON; zod failures → 400 with per-field details; unexpected errors → 500 with generic message, full error logged server-side with request id (never leaked to client). Async route handlers wrapped so rejections reach the middleware.
- **Client:** query errors surface per-component (inline error + retry) and mutation errors via toast; 401 anywhere → auth state reset → redirect to login; network failures distinguished from server errors in copy.

## 9. Security Boundaries

Browser ↔ Express is the only trust boundary. Everything the browser sends is untrusted: zod-validated bodies/params/queries; ownership enforced in the repo layer (`WHERE user_id = ?` on every read/write, not just route checks); bcrypt password storage; hashed session tokens at rest; rate limiting on auth + write endpoints; helmet headers; SQLite parameterized statements everywhere (no string SQL interpolation of user data); file uploads: **none exist** (attack surface avoided). Details and audit checklist in SECURITY.md (Stage 16).

## 10. Testing & Deployment Approach

- **Testing (Stage 14, detailed in TESTING.md):** unit (services, time/bucket logic, analytics SQL), integration (Supertest over the real app with a temp DB per test file: auth flows, CRUD, ownership, filters, dashboard aggregates, reminder scan idempotency), client component tests (TaskCard, FilterBar, TaskForm validation), plus a production-build smoke test (build SPA → boot server → exercise critical API paths).
- **Deployment (Stage 18, detailed in DEPLOYMENT.md):** single process; `npm run build` (shared → server tsc, client vite build), `npm run start`. Works on any Node host with a persistent disk (Render free tier needs the disk caveat documented; Fly.io volumes; or a VPS with systemd). Dockerfile provided. Health endpoint `/api/health` (liveness + DB check) for host probes. Env vars documented in `.env.example`.

## 11. Deliberate Non-Decisions (kept simple, justified)

- No Redis/queue: SQLite tables + 60 s tick are enough for reminders at this scale.
- No ORM: thin repo modules with parameterized SQL keep the DB layer reviewable; zod provides the type safety an ORM would.
- No SSR/SSG: private app behind login; SPA is correct.
- No i18n, no feature flags, no analytics of the app itself: out of MVP scope.
