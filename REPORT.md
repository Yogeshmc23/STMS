# Project Report — Student Task Manager (STMS)

**Date:** 2026-10-26 · **Branch:** `arena/2e2550c2-stms` @ `5170d8d` (pushed to origin) · **Verdict: READY WITH WARNINGS**

---

## 1. Executive summary

A production-ready **Student Task Manager** web app was built end-to-end from the 5-page Master Prompt spec, following its 20-stage plan: PRD → design → architecture → schema → API contract → repo conventions → implementation plan → 8 delivery phases → testing, security audit, deployment verification, monitoring, and a final evidence-based audit.

| Metric               | Value                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| MVP features shipped | **10 / 10** (auth, tasks CRUD, priorities, deadlines, dashboard, calendar, notifications, analytics, search/filters, responsive UI)     |
| Source code          | ~10,200 lines TS/TSX/CSS across 3 workspaces (`shared` `server` `client`)                                                               |
| Automated tests      | **125 passing** (91 server incl. real HTTP+DB via Supertest, 34 client via Testing Library) · typecheck strict 0 errors · lint 0 errors |
| Production build     | Booted with `NODE_ENV=production` and smoke-tested (SPA, auth w/ Secure cookies, CSP, health, dev-route removal)                        |
| Dependencies         | `npm audit --omit=dev` → **0 prod vulnerabilities** (zod 4.6.7 / nodemailer 10.1.4 / react-router 7 upgrades applied)                   |
| Docs                 | 13 markdown deliverables (table in §3)                                                                                                  |
| Scope honesty        | MCP & external APIs intentionally **not built** (spec: "not needed unless approved"); advanced features kept in PRD backlog only        |

**Warnings (both environmental, not code gaps):** ① Playwright browser E2E could not run in this sandbox (no browser binaries) — mitigated with API-level E2E + component tests + manual live verification, and a CI-ready recommendation in `TESTING.md` §4. ② Real SMTP delivery needs provider credentials on your side (outbox fallback is used and _labeled "NOT sent"_ — never faked).

## 2. What was done, phase by phase

| Phase                  | Built                                                                                                                                                                                                      | Verification performed (actual runs)                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1–7 (planning)         | PRD, DESIGN, ARCHITECTURE, DATABASE (ERD), API contract, AGENTS rules, IMPLEMENTATION_PLAN; owner decisions captured (student-only role, in-app+email, Express+React+SQLite, free-tier deploy)             | Docs written against the PDF; re-checked after every implementation phase                 |
| 0 (scaffold)           | npm-workspaces monorepo, shared zod contracts, Express core (pino, helmet, error envelopes), Vite+React shell, migration runner, design tokens                                                             | typecheck/build/lint + 24 server tests green; live via dev pair                           |
| 1 (auth)               | register/login/logout/profile, bcrypt-12, hashed sliding sessions, rate limits, origin guard                                                                                                               | 38 auth+core tests; live register→me→logout                                               |
| 2 (tasks)              | full CRUD API + Tasks page + task sheet, optimistic complete/reopen                                                                                                                                        | 54 task assertions; live curl CRUD; caught & fixed a real PATCH-wipes-dueAt bug via tests |
| 3 (deadlines+calendar) | due buckets (overdue/today/week/later), `/api/calendar`, month/week/day views, tz-safe day math                                                                                                            | 21 tests incl. NOW-relative fixtures + grid math; live                                    |
| 4 (dashboard)          | summary aggregates, up-next, per-subject workload, recent activity                                                                                                                                         | hand-computed expectation test; live JSON match                                           |
| 5 (notifications)      | reminder scanner (due-soon/imminent windows, dedup UNIQUE), bell + panel + page, email queue → SMTP **or** labeled dev outbox                                                                              | 11 tests incl. `.eml` content assertion; live dev-scan created 6+6                        |
| 6 (analytics)          | 14/30-day completion trend (zero-filled), distributions, rate                                                                                                                                              | SVG charts; API validation tests; live                                                    |
| 7 (search/filters)     | escaped-LIKE search, multi-select filters, URL-shareable state, `?open=` deep-link, FAB                                                                                                                    | LIKE-escape tests (`%` matches literal); live                                             |
| 8 (hardening)          | seed script, dependency security upgrades, **prod-build fix** (tsc didn't copy `.sql` migrations — real bug caught by the smoke test), TESTING/SECURITY/DEPLOYMENT/MONITORING docs, README, Stage-20 audit | full gate re-run + prod smoke all-green (see PROGRESS_LOG Phase 8)                        |

Findings closed during the build: nodemailer v7 SMTP-injection advisories (upgraded), zod memory-exhaustion DoS (upgraded), react-router advisory (upgraded), rate-limiter IPv6 key crash (fixed), PATCH field-presence bug (fixed), prod migration-asset bug (fixed).

## 3. Artifact map

| I want to…                     | Open                                                  |
| ------------------------------ | ----------------------------------------------------- |
| Run/hack the app               | `README.md` (quick start) → `AGENTS.md` (conventions) |
| Understand product & UI intent | `PRD.md`, `DESIGN.md`                                 |
| Understand system              | `ARCHITECTURE.md`, `DATABASE.md`, `API.md`            |
| See verification history       | `PROGRESS_LOG.md` (every phase has a VERIFIED line)   |
| QA / security review           | `TESTING.md`, `SECURITY.md`                           |
| Ship it                        | `DEPLOYMENT.md` + `Dockerfile` + `render.yaml`        |
| Operate it                     | `MONITORING.md`                                       |
| Trust the conclusion           | Stage-20 audit table at end of `PROGRESS_LOG.md`      |

## 4. Next steps for you (in order)

1. **Try it now** — the sandbox preview is live: open the **port 3001** preview (production-style single process: SPA+API) or **5173** (hot-reload dev). Login `demo@stms.dev` / `Demo1234!` (28 seeded tasks show every feature: 3 overdue, bell reminders, calendar spread, analytics trend).
2. **Create the pull request** — `main` was deliberately untouched. GitHub already printed the link: `https://github.com/Yogeshmc23/STMS/pull/new/arena/2e2550c2-stms`. Diff is one squashed commit `5170d8d` containing everything; review sections via the docs map above. Merge when satisfied.
3. **Deploy (pick one, all in `DEPLOYMENT.md` §3):**
   - **Cheapest real step:** Render → "New Web Service" → connect repo → use `render.yaml` values (build `npm ci && npm run build`, start `npm start`, health `/api/health`). ⚠️ Free-tier disk is ephemeral — either attach a persistent disk (~$1/mo) or accept data resets on redeploy.
   - **Best fit:** Fly.io with `fly volume create stms_data` mounted at `/data`, `DB_PATH=/data/stms.sqlite`; or any $5 VPS with the systemd+nginx recipe.
   - **Docker:** `docker build -t stms . && docker run -d -p 3000:3000 -v stms-data:/data --env-file .env stms` (Dockerfile verified-compatible with better-sqlite3's bundled musl prebuilds — no compilers needed).
   - Before first boot anywhere: set a real `SESSION_SECRET` (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
4. **Enable real email (optional, ~5 min):** free SMTP creds (e.g. Brevo/SendGrid free tier) → set `SMTP_HOST/PORT/USER/PASS` + `EMAIL_FROM` (all-or-nothing — app boots fine without them) → the same queue/outbox code path switches to real delivery; failure visibility per `MONITORING.md` §2.
5. **Close the two warnings:** ① add a Playwright smoke spec in CI when the repo gets a pipeline (10-minute task; suggested flow already written in `TESTING.md` §4); ② bump vitest 3→5 at the next toolchain refresh (only remaining advisory, dev-only).
6. **Keep the demo data out of production:** seed refuses to run under `NODE_ENV=production`; on a real host just register your own account and (optionally) delete `demo@stms.dev`.

Backlog (explicitly not built, per spec): AI prioritization, study-plan generator, recurring tasks, group projects, Google Calendar sync, password-reset email, MFA, account export — each has a PRD §5 sketch if you greenlight any later.
