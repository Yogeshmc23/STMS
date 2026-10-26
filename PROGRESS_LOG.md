# PROGRESS_LOG.md — Living Plan & Task Log

Persistent plan and running progress log (Master Prompt §5–6). Newest entries on top. Every entry records **what was done** and **evidence of verification** (real runs, never assumptions).

**Task checklist (Stages 1–20):** see bottom of file.

---

## Log

### 2026-10-26 — Phase 2 (Stage 9): Task CRUD + priority ✅ VERIFIED

- Server `modules/tasks` (repo/service/routes): parameterized ownership-scoped SQL, `completed_at` invariant in a transaction, 404 (not 403) for foreign tasks, subject-datalist meta endpoint, smart sort (overdue → due → priority → newest), user-keyed write/read rate limiters on the mount.
- Client Tasks page: card list w/ optimistic complete-toggle (rollback on error), create/edit sheet, delete confirm, sort control, empty/loading/error states. Shared zod schemas reused client-side.
- **Evidence:** 54 server + 11 client tests green; live curl flow: register→create 201→complete sets completedAt→list→delete 204→subjects meta.

### 2026-10-26 — Phase 3 (Stage 9): Deadline buckets + calendar ✅ VERIFIED

- **Buckets (F4):** `due=overdue|today|week|later|none` + `dueFrom/dueTo` on GET /api/tasks (filtered counts included in `total`). Boundary math in `util/time.ts` (`localDayStartIso`) honors a client-supplied `tzOffset` (minutes east of UTC) so "today" is the student's local day while storage stays UTC (PRD §9.2). week = [today, +7d); overdue excludes completed.
- **Calendar (F6):** `GET /api/calendar?from&to` (single range request per grid; date-only bounds normalized to whole UTC days, ≤92-day guard) + client `utils/calendar.ts` (Monday-based `startOfWeek`/`monthMatrix`/ranges — assumption A7) + Month (6×7 grid, ≤3 chips + "+n", dots on mobile, today ring), Week (7 columns), Day (per-day list + unscheduled section) views with prev/next/Today; Tasks page gained due-bucket quick-filter chips; Calendar in nav + route.
- **Bug found & fixed by tests (Stage 15):** `updateTask` checked `'dueAt' in fields` — always true for the constructed object → status-only PATCH silently cleared due dates. Fixed to value check; regression-tested ("complete a task keeps its dueAt" covered via calendar inclusion).
- **Evidence:** 66 server + 19 client tests green (new: bucket determinism suite w/ boundary-relative dates, calendar range/inclusion/exclusion + validation + authz, local-day math incl. IST/NY offsets, grid-math unit tests); `npm run typecheck` ✅ ×3, `npm run lint` ✅. Live curl: +2d task → appears in calendar range, correctly absent from today/overdue buckets.

### 2026-10-26 — Phase 1 (Stages 9+11): Authentication ✅ VERIFIED

- **Server:** `modules/auth` (repo/service/routes) — bcryptjs cost 12, server-side sessions (SHA-256-hashed, secret-peppered tokens; raw token only in httpOnly cookie), sliding 7-day expiry with prune-on-read, register/login/logout/me/profile-patch/password-change per API.md. `middleware/session.ts` (attach user), `requireAuth` (401), `originGuard` (403 on Origin mismatch), `rateLimit` (auth 10/min/IP with IPv6-normalized keys; user-keyed write/read limiters ready for Phases 2+). Welcome notification created transactionally on register. Email change deliberately not offered (assumption A6).
- **Client:** AuthProvider (bootstrap via /me once; state machine avoids the 401→refetch loop), ProtectedRoute + GuestOnly with `?next=` redirect (open-redirect guarded), Login/Register/Profile pages using the SHARED zod schemas, Toast system, useTheme, app shell (sidebar ≥768 / topbar+bottom-nav <768) with user chip. Phase-1 home is an honest transitional page (real dashboard = Phase 4).
- **Real-run evidence:** server **38/38** (17 new auth tests incl. cookie flags, duplicate email 409, enumeration-identical 401s, expiry+sliding refresh, tampered cookie, logout revocation, A6 email immutability, 429 rate limit) + client **6/6** (form validation, submit payload, server-error surfacing, redirect, shell). `npm run lint` ✅, `npm run typecheck` ✅ (3 workspaces). **Live curl through the running Vite proxy:** register 201 → me 200 (cookie) → me 401 (no cookie) → logout 204 → me 401; Set-Cookie carries session token.
- Deviations: none from API.md. `better-sqlite3` pinned at ^13 (bundled prebuilds) — recorded in Phase 0 entry.

### 2026-10-26 — Phase 0 (Stage 8): Project setup ✅ VERIFIED

- npm-workspaces monorepo created: `shared` (zod schemas + types = single source of validation truth), `server` (Express 5 + better-sqlite3, config fail-fast, versioned SQL migrations, central error handler, origin-guard CSRF posture, pino structured logs, helmet CSP, /api/health), `client` (React 18 + Vite 6 + TanStack Query, design-system tokens from DESIGN.md, typed API client).
- **Real-run evidence:** `npm install` ✅ (405 pkgs); `npm run typecheck` ✅ (all 3 workspaces); `npm run lint` ✅ (eslint + prettier); `npm run test` ✅ **24/24 passing** (21 server: config rules, migration runner + schema integrity incl. FK/CHECK/cascade/notification-dedup, health + error-envelope + origin-guard behaviors; 3 client: scaffold render + API client contract); `npm run build` ✅ (vite → `server/public/`, 258 kB JS); dev chain verified with **real curl**: health OK direct on :3001 and through Vite proxy :5173, JSON 404 envelope through proxy, live preview serving the app.
- **Blocker hit & solved honestly (Stage 15 RCA):** `better-sqlite3@12` install failed — its prebuild download host (objects.githubusercontent.com) and node-gyp header host (nodejs.org) are both outside this sandbox's network allowlist. Root cause confirmed via npm debug log. Fix: pinned `better-sqlite3@13` which bundles prebuilds **inside the npm tarball** (registry only) — install now works here and on any deploy host with zero build toolchain. Documented in DEPLOYMENT.md (Stage 18).
- Git identity: commits authored by repo owner credential (gh GH_TOKEN) on branch `arena/2e2550c2-stms`.

### 2026-10-26 — Stage 0: Environment check ✅

- Verified: Node v22.22.3, npm 10.9.8, Python 3.11 (venv/PEP668), git+gh authenticated as Yogeshmc23, make/gcc, 2 CPU / 3.8 GB RAM / 20 GB disk.
- Verified network allowlist: registry.npmjs.org ✅ (200), pypi.org ✅, api.github.com ✅. No Docker, no Postgres/MySQL, no general internet.
- Smoke tests actually run: `npm install better-sqlite3` in /tmp → import + query OK; `node:sqlite` present but experimental.
- **Implications declared:** no external deployment from sandbox (hosts unreachable) → Stage 18 delivers verified prod build + configs/docs + live preview here; email needs user-provided SMTP (free tiers documented, nothing billed).

### 2026-10-26 — Stage 1 gate: Scope confirmed by owner ✅

Owner answers (ask_user, this session): **roles** = Student only · **notifications** = In-app + Email · **stack** = Express + React/Vite + SQLite · **deployment** = open, free-tier ready.
Derived decision (flagged, config-driven, reversible): email via provider-agnostic SMTP (nodemailer), disabled until `SMTP_*` env set; dev outbox otherwise. Costs documented in PRD §7 (Resend/Brevo/Gmail all free-tier).

### 2026-10-26 — Stages 1–7: Planning docs written ✅

PRD.md, DESIGN.md, ARCHITECTURE.md, DATABASE.md, API.md, AGENTS.md, IMPLEMENTATION_PLAN.md created per Master Prompt. Committed on `arena/2e2550c2-stms`.

- **Assumption A6 (new, from API.md):** profile edit scoped to name + email-reminder toggle; changing login email deferred (needs re-verification flow) — recorded as deliberate MVP scope-down of PRD F1.
- **Assumption A7:** week starts Monday in calendar views.
- **Assumption A8:** bcrypt implemented via `bcryptjs` (pure JS, same algorithm/cost) to avoid native-build risk in CI/host environments.

### (next entries append here as phases complete)

---

## Task Checklist — 20 Stages

- [x] Stage 0 — Environment check
- [x] Stage 1 — PRD.md (+ scope gate confirmed)
- [x] Stage 2 — DESIGN.md
- [x] Stage 3 — ARCHITECTURE.md
- [x] Stage 4 — DATABASE.md
- [x] Stage 5 — API.md
- [x] Stage 6 — AGENTS.md
- [x] Stage 7 — IMPLEMENTATION_PLAN.md (+ gate cleared)
- [x] {n} — Project setup (Phase 0)
- [x] {n}/10/11 — Features: auth → tasks → deadlines/calendar → dashboard → notifications → analytics → search/filter/responsive (Phases 1–7)
- [x] {n} — MCP integration — **N/A for MVP** (backlog B1 not approved)
- [x] {n} — External APIs — email SMTP adapter only (owner-approved channel; costs flagged PRD §7); Google Calendar **N/A** (backlog B5 not approved)
- [x] {n} — Testing & QA (Phase 8)
- [x] {n} — Debugging/RCA — ongoing discipline
- [x] {n} — Security audit & hardening → SECURITY.md
- [x] {n} — Code review & refactoring pass
- [x] {n} — Deployment & release prep → DEPLOYMENT.md, Dockerfile, render.yaml, verified prod build + live preview
- [x] {n} — Monitoring & observability → MONITORING.md, structured logs, /api/health
- [x] {n} — Final production-readiness audit → verdict in this log + README

### 2026-10-26 — Phase 4 (Stage 9): Interactive dashboard ✅ VERIFIED

- Server `modules/dashboard`: ONE SQL pass for all 8 counts (SUM-of-booleans), completionRate (null on zero data), upNext (overdue-first ordering, ≤5), workload-by-subject (open desc, total tie-break), recentActivity (completed∪created, deduped by id, ≤8, newest-first). `GET /api/dashboard/summary?tzOffset` honors local-day buckets.
- Client: replaced the transitional home with real widgets — stat grid, Up-next with quick-complete (invalidates dashboard/tasks/calendar caches), workload bars, activity feed; loading skeleton / error retry / zero-data CTA states.
- Evidence: server 70/70 (new: hand-computed fixture incl. weekEnd-boundary exclusion + zero-data + ownership scoping + authz; 1 test-authoring mistake — Physics open count — fixed in the test, service was right), client 22/22 (dashboard render, zero-data CTA, PATCH-on-quick-complete, scoped queries), typecheck ×3 + lint green. Live curl through the dev proxy: counts match a hand-check of the demo user's tasks; completion preserves dueAt.

### 2026-10-26 — Phase 5 (Stage 9): Notifications & reminders ✅ VERIFIED

- **Server:** `modules/notifications` (scan + list/read/dismiss), `services/email.ts` (nodemailer when SMTP configured; otherwise every queue row is written to `server/outbox/*.eml` marked `skipped_no_smtp` with a "NOT sent" header — never presented as delivered; retry ≤3 with `last_error`), `services/scheduler.ts` (60 s tick: scan → drain → session-prune; re-entrancy guard; unref'd timer; skipped under tests), dev-only `POST /api/dev/run-reminder-scan` (not mounted in production).
- **Scan semantics:** mutually-exclusive windows in one tick ((1h,24h] → `deadline_soon_24h`, (0,1h] → `deadline_soon_1h`, ≤now → `overdue`, 30-day floor); `INSERT OR IGNORE` against the DB unique index → exactly-once per (task, kind); completed tasks never notified; email rows only for users with reminders enabled.
- **Client:** header bell with unread badge (60 s poll + on-focus refetch), dropdown panel (mark-read + deep-link `?open=`), `/notifications` page (unread-only filter, mark-all, dismiss, load-more), Alerts nav entry.
- **Evidence:** 81 server tests (+11: window correctness incl. 48h-exclusion, idempotent second scan, completed exclusion, email-queue gating, outbox file content assertion, cascade on task delete, ownership 404, idempotent mark-read, authz); 26 client tests (+4: badge count, panel→mark-read POST, mark-all POST, dismiss DELETE, empty state); typecheck ×3 ✅ lint ✅. **Live:** task due +45 min → dev-scan → `notificationsCreated:1`, `email.skipped:1`, `.eml` file on disk, unread-count 2, panel title correct.
- Note: 1 new test-authoring bug caught pre-commit (race: sync `getByText` before async list resolved) — fixed with `findByText`.

### 2026-10-26 — Phase 6 (Stage 9): Progress analytics ✅ VERIFIED

- Server `modules/analytics`: single-pass overview — totals+rate (zero-data null), period comparison via UTC-day trend windows (exactly `days` zero-filled buckets ending today; completions before the window count in totals, not the trend), byPriority (fixed high→med→low incl. zeros), bySubject (count desc), byType (zero-only types omitted). Route validated to days ∈ {14,30}.
- Client: Analytics page (14/30 toggle, stat grid incl. +Δ% vs previous period, hand-rolled SVG grouped-bar TrendChart with per-bar `<title>` values, DistributionBars done/total), typed `analyticsApi`, nav entry, dedicated CSS; loading/error-retry/empty states.
- Evidence: 85 server tests (+4: hand-computed fixture incl. backdated completion crossing the 14d boundary, zero-data null rate, ownership isolation, validation), 30 client tests (+4: aggregates render, toggle refetch w/ days=30, empty state, retry affordance); typecheck ×3 ✅ lint ✅. **Live:** demo user → `{created:2, completed:1, rate:0.5, trend:14 buckets}`, `days=45` → 400.
- 2 test-authoring bugs caught & fixed pre-commit (json stub ignored the status arg; a getByText race) — production code was correct in both cases.

### 2026-10-26 — Phase 7 (Stage 9): Search & filtering + responsive polish ✅ VERIFIED

- **Server:** full WHERE builder on GET /api/tasks — `q` LIKE across title/description/subject (case-insensitive, user `%`/`_`/`\` **escaped** so wildcards can't leak), multi-select `subject/priority/status/type` (OR within field, AND across), composable with due buckets + `dueFrom/dueTo`; `total` reflects the filtered set (pagination correctness).
- **Client:** Tasks page rewritten as the URL-driven FilterBar per DESIGN.md §6 — 250 ms debounced search, chip groups (priority/status/subject/buckets), sort select, "Clear all", `isFiltered` helper; all state in router search params (shareable, back-button works, validated on read); mobile FAB (<768px); `?open=<id>` deep-links from notification panel open the task in the edit sheet (closes Phase 5's linkage).
- **Evidence:** 91 server (+6 search/filter incl. escaping + filtered-total), 34 client (+4: URL→query passthrough, debounce, deep-link, helper); typecheck ×3 ✅ lint ✅. **Live curl:** `q=live`→2 exact titles; `q=%25`→0 (escape holds); `priority+status`→0; `due=today&tzOffset=330`→1.
- **Phase 8 — hardening, docs, production verification, final audit ✅ VERIFIED**
  - `npm audit` follow-ups applied: zod ^4.6.7 (all workspaces), nodemailer ^10.1.4, react-router-dom ^7.9.1; `@types/nodemailer` dropped (bundled); `npm audit --omit=dev` → **0 prod vulnerabilities**; remaining dev-tool advisory (vitest/tinypool) documented in SECURITY.md §7.
  - Added `server/src/db/seed.ts` (`npm run seed`, refuses production, idempotent): demo account + 28 realistic tasks → verified live (dashboard 28/9/3-overdue rate 0.321; calendar 14 in a 15-day window; analytics 7/2; dev scan 6 notifications + 6 outbox emails).
  - **Production build smoke (real `NODE_ENV=production node server/dist/index.js`)**: caught & fixed a genuine deploy bug — tsc didn't copy `db/migrations/*.sql` into `dist` (build script now does). Then verified: health/db ok, SPA + hashed assets, deep-link fallback, register→Secure cookie→/me, **dev routes absent in prod**, CSP headers present.
  - Stage 14/16/18/19 docs written: TESTING.md, SECURITY.md, DEPLOYMENT.md (+Dockerfile, render.yaml), MONITORING.md; README.md rewritten; PRD §9 / DESIGN §13 / ARCH §10 / IMPL §6 status tables updated.
  - Final gate re-run for the record: typecheck 0 errors ×3, lint 0 errors, **125/125 tests** (91 server + 34 client), clean production build.
  - **Stage 20 final audit** — per-feature verdicts (all backed by tests + live HTTP as noted): F1 Auth ✅ Verified · F2 Tasks CRUD ✅ (54 API assertions incl. cascade) · F3 priorities ✅ (smart-sort + distributions) · F4 deadlines ✅ (buckets tests + UI badges) · F5 dashboard ✅ (hand-computed aggregates test + live seeded data) · F6 calendar ✅ (grid-math tests + live API; month/week/day UI built, pixel QA = Partially — no browser here) · F7 notifications ✅ (window/dedup/queue/outbox tests + live scan; real SMTP delivery = manual step, provider creds needed) · F8 analytics ✅ (zero-fill/rate tests + live) · F9 search/filter ✅ (escaping/multi-select/URL-sync tests + live q/subject/priority) · F10 responsive ✅ Verified by construction (design tokens, breakpoints, mobile nav tests) / Partially for pixel-level (browser E2E impossible in sandbox, documented in TESTING.md §4).
  - Findings: **Critical: none. High: none (none left — nodemailer/zod/router advisories fixed this phase). Medium: no browser E2E suite (documented + CI-ready recommendation); dev-only vitest advisory (patched in next toolchain refresh). Low: password-reset email flow deferred (out of MVP scope, PRD §5 A-choice); Render free-tier disk caveat (documented).**
  - **VERDICT: READY WITH WARNINGS** — the warnings are the two environmental ones above (browser E2E + SMTP/CDN require the target host), not code gaps. Everything specified in the MVP is implemented, tested, documented and verified running; DEPLOYMENT.md §1 lists the manual steps for a live host.
