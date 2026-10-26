# IMPLEMENTATION_PLAN.md — Student Task Manager

**Stage 7 deliverable.** Ordered phases mapped to the 10 MVP features. Stage 1 clarifying questions are resolved (roles: student-only; notifications: in-app + email via SMTP; stack: Express + React/Vite + SQLite; deployment: open, free-tier-ready) — **the implementation gate is satisfied**.

Each phase: Goal · Tasks · Files · DB/API changes · Tests · Completion criteria. A phase is done only when its criteria are verified by real runs (typecheck, lint, tests, real requests) and PROGRESS_LOG.md is updated.

---

## Phase 0 — Project Setup (Stage 8)

**Goal:** Monorepo skeleton per ARCHITECTURE.md §2 that builds, lints, typechecks, and serves "hello" end-to-end (Vite dev → proxy → Express → SQLite connection). No features.

**Tasks:** npm workspaces root; `shared` package (types/constants placeholder); `server` (Express app factory, config via zod, db connection + migration runner + `001_init.sql`, `/api/health`, error middleware, dev script with `--env-file`); `client` (Vite + React + router shell, design-system.css tokens from DESIGN.md, API client stub, AuthProvider stub); ESLint flat config + Prettier; tsconfigs (strict); `.gitignore`; `.env.example`; proxy config; prod static serving of `server/public`.

**Files:** everything under `shared/`, `server/`, `client/`, root manifests/configs.
**DB/API:** schema v1 created by migration runner at boot; `GET /api/health`.
**Tests:** health endpoint integration test; migration runner test (fresh in-memory DB applies and records version).
**Completion criteria:** `npm install` ✅, `npm run typecheck` ✅, `npm run lint` ✅, `npm test` ✅, dev servers boot, browser preview loads the shell through the Vite proxy, health returns `{status:'ok',db:'ok'}` via a real curl.

## Phase 1 — Authentication (F1; Stages 9–11 core)

**Goal:** Register/login/logout/session/profile fully working and protected; bcrypt + hashed server-side sessions + rate limiting.

**Tasks:** `shared` auth schemas; server `modules/auth` (repo/service/routes), session middleware, cookie handling, `users`+`sessions` usage, profile update (name, emailRemindersEnabled), password change, auth rate limiter, Origin check on writes; client Login/Register pages, AuthProvider (`/me` on boot), ProtectedRoute, Profile page, user chip + logout in Layout; welcome notification on register.
**Files:** `server/src/modules/auth/*`, `server/src/middleware/{auth,rateLimit,origin}.ts`, `shared/src/schemas.ts`, `client/src/auth/*`, `client/src/pages/{Login,Register,Profile}.tsx`.
**DB/API:** none new (schema v1 covers it). API.md auth endpoints implemented.
**Tests:** register (happy, dup email 409, weak password 400), login (happy, wrong password, unknown email — same error), session flow (me, logout revokes, expiry), profile patch, password change (wrong current → 401), unauthenticated 401s, rate limit smoke.
**Completion criteria:** all tests green; manual check via preview: register → redirected to dashboard shell → logout → login again works; cookie is httpOnly (verified via curl -i); passwords stored as bcrypt hashes (verified via sqlite query).

## Phase 2 — Task CRUD + Priority (F2, F3)

**Goal:** Full task lifecycle with validation and ownership enforcement; priority badges and sorting.

**Tasks:** `shared` task schemas/types; server `modules/tasks` (repo with filters stub/sort, service with completed_at invariants, routes: list/get/create/patch/delete + meta/subjects); client Tasks page (list, smart sort default), TaskCard, TaskForm modal (create/edit), ConfirmDialog delete, quick-complete toggle with optimistic update + rollback, priority/status/type badges, toasts, empty/loading/error states.
**Files:** `server/src/modules/tasks/*`, `client/src/pages/Tasks.tsx`, `client/src/components/{TaskCard,TaskForm,PriorityBadge,StatusChip,DueBadge,ConfirmDialog,EmptyState,Skeleton,Toast}.*`, `client/src/api/tasks.ts`.
**DB/API:** Tasks endpoints from API.md (filters partially — `q`/subject/priority/status/sort; due buckets in Phase 3).
**Tests:** CRUD happy paths; validation errors (title too long, bad enum, bad date); ownership (user B gets 404 on user A's task for get/patch/delete); complete sets completedAt, reopen clears; subjects meta distinctness; sort orders.
**Completion criteria:** tests green; preview: create/edit/delete/complete tasks with visible priority badges; other-user isolation proven by integration test.

## Phase 3 — Deadline Tracking + Calendar (F4, F6)

**Goal:** Due-date buckets everywhere; day/week/month calendar views fed by the range API.

**Tasks:** bucket logic in tasks repo (`overdue|today|week|later|none`) + `due` filter + `dueFrom/dueTo`; DueBadge relative-time rendering; server `modules/calendar` (range query, ≤92-day guard); client Calendar page with Month/Week/Day components, prev/next/today navigation, day click-through, unscheduled section in day view, priority-colored chips; Tasks page bucket quick-filter chips.
**Files:** `server/src/modules/calendar/*`, tasks repo/service updates, `client/src/pages/Calendar.tsx`, `client/src/components/calendar/*`, `client/src/api/calendar.ts`.
**DB/API:** `GET /api/calendar`; tasks `due` filter (API.md already specified).
**Tests:** bucket boundary tests (now-injected: 23:59 today vs tomorrow, overdue excludes completed), range query inclusivity, 92-day guard 400, tasks with null due_at excluded from calendar.
**Completion criteria:** tests green; preview: month grid shows seeded tasks on correct days; week/day views match; overdue tasks red everywhere.

## Phase 4 — Dashboard (F5)

**Goal:** Landing dashboard with real aggregates: counts, completion rate, up-next, workload by subject, recent activity.

**Tasks:** server `modules/dashboard` (single service computing all aggregates over indexed queries, zero-data safe: `completionRate: null`); client Dashboard page (StatCards grid, UpNext list with quick-complete, WorkloadBySubject bars, RecentActivity feed), skeleton/empty states.
**Files:** `server/src/modules/dashboard/*`, `client/src/pages/Dashboard.tsx`, `client/src/components/{StatCard,UpNextList,WorkloadBySubject,RecentActivity}.tsx`.
**DB/API:** `GET /api/dashboard/summary`.
**Tests:** aggregate accuracy against hand-computed fixtures (counts per bucket, completion rate incl. empty-user null, upNext ordering & limit, workload numbers); unauthorized access 401.
**Completion criteria:** tests green; preview dashboard numbers match the visible task list exactly (cross-checked manually with seeded data).

## Phase 5 — Notifications & Reminders (F7)

**Goal:** Reminder scheduler creating deduped in-app notifications + email queue; bell UI; email via SMTP or labeled dev outbox.

**Tasks:** server `modules/notifications` (repo/service/routes: list, unread-count, read, read-all, delete); `services/reminder-scan.ts` (pure function over db+now: 24h/1h/overdue scans, INSERT OR IGNORE, email_queue rows respecting `email_reminders_enabled`); `services/email.ts` (nodemailer transport when SMTP configured; outbox writer otherwise; attempt cap 3, `last_error`); scheduler tick (60s `setInterval` in index.ts; also prunes expired sessions); dev-only `POST /api/dev/run-reminder-scan`; client NotificationBell (60s poll + focus refetch), NotificationPanel, Notifications page, deep-link to task, mark read/all; Profile email toggle wired.
**Files:** `server/src/modules/notifications/*`, `server/src/services/{reminder-scan,email,scheduler}.ts`, `client/src/components/Notification{Bell,Panel}.tsx`, `client/src/pages/Notifications.tsx`.
**DB/API:** notifications + email_queue usage; API.md notification endpoints; welcome notification (Phase 1) reused.
**Tests:** scan creates correct kinds at boundaries; **idempotency** (second scan inserts nothing); completed tasks never scanned; email rows only when enabled; queue drain marks sent/failed/skipped_no_smtp correctly (transport mocked at nodemailer boundary, outbox path real); unread-count/read flows; task deletion cascades notifications.
**Completion criteria:** tests green; preview: seeded due-soon task → run dev scan → bell shows unread → panel links to task → mark read; outbox file written with the exact email content (verified by cat).

## Phase 6 — Analytics (F8)

**Goal:** Analytics page with completion rate, 14/30-day trend, priority/subject/type distributions — all server-computed.

**Tasks:** server `modules/analytics` (SQL aggregates, zero-filled day buckets, period-over-period comparison); client Analytics page (trend line/bar chart — hand-rolled SVG chart component, no chart lib dependency; distribution bars; StatCards); days selector.
**Files:** `server/src/modules/analytics/*`, `client/src/pages/Analytics.tsx`, `client/src/components/charts/{TrendChart,DistributionBars}.tsx`.
**DB/API:** `GET /api/analytics/overview?days=14|30`.
**Tests:** trend zero-fill and bucket correctness against fixtures (tasks completed across day boundaries UTC), period comparison math, completionRate null on empty, bySubject/byPriority/byType sums equal totals.
**Completion criteria:** tests green; preview analytics match dashboard/DB numbers (manual cross-check on seed data).

## Phase 7 — Search & Filtering + Responsive Polish (F9, F10)

**Goal:** Full FilterBar (search, multi-filters, buckets, sort) synced to URL; responsive pass on every screen; accessibility sweep.

**Tasks:** complete tasks repo filtering (`q` across 3 fields, repeated params, combined where-clauses, pagination); client FilterBar (debounced search 250ms, subject multi-select fed by meta/subjects, priority/status chips, bucket chips, sort select, clear-all, URL sync via router search params, back-button friendly); pagination/"load more"; responsive audit against DESIGN.md §8 (sidebar→bottom nav at <640, full-screen TaskForm sheet on mobile, calendar dots-only month at small widths, ≥44px touch targets, no h-scroll at 360px); a11y sweep (focus rings, aria-live, dialog focus trap, contrast check).
**Files:** tasks repo/service, `client/src/components/FilterBar.tsx`, Tasks page rework, Layout responsive CSS, component CSS adjustments.
**DB/API:** none new (API.md filters fully implemented now).
**Tests:** search matching (case-insensitive, description hits), filter combinations, bucket+filter interplay, pagination boundaries (page beyond total → empty items, total correct), limit cap 100, sort stability.
**Completion criteria:** tests green; preview exercised at 360px/768px/1280px widths (browser devtools) with all flows usable; URL share/back-button verified.

## Phase 8 — Hardening, QA & Production Readiness (Stages 14–20)

**Goal:** Full test suite green, security audit fixes, code review pass, production build verified, deployment/monitoring docs truthful, final audit verdict.

**Tasks:** TESTING.md (matrix of what's covered + how to run + honest Playwright-absence note); security audit per SECURITY.md checklist (helmet headers verified, rate limits verified by test, npm audit, secrets scan of repo, ownership fuzz pass); refactoring pass (dupes, dead code); `npm run build` (shared → server tsc → client vite build into `server/public`) and **production-mode smoke test** (`NODE_ENV=production` boot on one port, curl critical paths, SPA routing fallback); DEPLOYMENT.md (Render/Fly/VPS recipes, render.yaml, Dockerfile, health probe, SQLite disk caveat, SMTP setup + costs from PRD §7); MONITORING.md (pino structured logs, request ids, `/api/health`, email_queue failure surfacing, log-redaction rules); README.md final; Stage 20 audit table (all 10 features Verified/Partially/Unverified + verdict).
**Files:** root docs, `Dockerfile`, `render.yaml`, logging middleware, build scripts.
**Tests:** production smoke script (`scripts/smoke.sh` or vitest prod-build test); full suite run recorded.
**Completion criteria:** everything green in one recorded run; preview serving the **production build**; final verdict written in PROGRESS_LOG.md and README status section.

---

## Recommended First Task

**Phase 0, task 1:** create the npm-workspaces root (`package.json`, tsconfig base, ESLint flat config, Prettier, `.gitignore`, `.env.example`) and the `shared` package skeleton — then immediately verify with `npm install` and `npm run typecheck` before writing any server/client code.

**Gate check (Stage 7 requirement):** Stage 1 clarifications resolved by owner answers on 2026-10-26; architecture decisions locked in ARCHITECTURE.md (single-process monorepo, SQLite, cookie sessions, SMTP-or-outbox email, 60s scheduler). **Cleared to start Phase 0.**
