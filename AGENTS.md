# AGENTS.md — Coding-Agent Rules for STMS

**Stage 6 deliverable.** These rules govern all code produced for this repository (by agents or humans). Follow this file for the rest of the build.

---

## 1. Operating Discipline

- **Act, don't narrate.** Implement directly; report what changed and what was verified.
- **Small, verifiable increments.** After each meaningful change run the most relevant check (`npm run typecheck`, `npm run lint`, `npm test -w @stms/server`, a real HTTP request, a production build). Never claim something works without a real run behind it.
- **Inspect before editing.** Read the existing file/module first; preserve verified behavior; no drive-by rewrites.
- **Honesty.** Missing tools/credentials/ambiguity → say so, state impact, propose workaround. No mock data, placeholder buttons, or simulated integrations presented as finished. Temporary scaffolding (dev seed, dev outbox, dev-only reminder-scan route) must be labeled as such in code comments and docs.
- **No scope creep.** The 10 MVP features in PRD.md are the scope. Backlog items (AI prioritization, study plans, recurring tasks, collaboration, Google Calendar) require explicit owner approval — do not "sneak them in".
- **Update the PROGRESS_LOG.md** after every phase/stage with what was done and evidence of verification.

## 2. Code Quality & Naming

- **TypeScript strict mode** in all three packages (`shared`, `server`, `client`). No `any` without a written justification comment; no `@ts-ignore` (use `@ts-expect-error` + reason if truly needed).
- Names: `camelCase` variables/functions, `PascalCase` types/classes/components, `SCREAMING_SNAKE` for constants, `kebab-case` file names for non-component modules, `PascalCase.tsx` for React components.
- Files/modules do one thing. Server modules are foldered: `routes.ts` (HTTP concerns only) → `service.ts` (business rules) → `repo.ts` (SQL). No SQL outside `repo.ts`/`db/`; no HTTP concepts (req/res/status) inside services.
- Functions < ~50 lines where practical; early returns over deep nesting; no commented-out code committed.
- Comments explain **why**, not what. Every non-obvious constraint (e.g., dedup via unique index, UTC-everywhere rule) gets a comment or doc link.

## 3. Type Safety & Shared Contracts

- API request/response shapes and enums live in `@stms/shared` (types + zod schemas). The server validates with those schemas; the client types its fetch layer with the same types. **Never duplicate a type definition** across client/server.
- zod schemas are the single source of validation truth (limits, enums, formats). Client-side validation reuses the same schemas for form pre-checks; server-side validation is mandatory regardless.
- Dates cross the wire as UTC ISO strings; the client converts with the shared time helpers for display. No `Date` parsing of non-ISO formats.

## 4. Component Reuse (client)

- Use the existing component inventory (DESIGN.md §6): TaskCard, PriorityBadge, DueBadge, StatusChip, FilterBar, TaskForm, calendar views, StatCard, NotificationPanel, EmptyState, Skeleton, Toast, ConfirmDialog, Icons.
- New UI must reuse tokens (colors/spacing/radius from `design-system.css`) — **no hardcoded hex values or px spacing** in component CSS outside the token file.
- Every screen implements loading (skeleton), empty, error, and success states. A component that fetches must handle all four.
- Accessibility is part of "done": focus management on overlays, `aria-live` toasts, labeled inputs, keyboard operability, AA contrast.

## 5. Dependency Management

- Prefer the established stack; a new runtime dependency needs a justification comment in the PR/commit and an entry in PROGRESS_LOG.md. No heavyweight libs for problems the stdlib/existing deps solve (e.g., no moment.js, no lodash for one function, no axios — native fetch is fine).
- Pin exact versions (no `^` surprises) via committed `package-lock.json`. `npm audit` reviewed at security stage; known-high vulns block release.
- Native modules: only `better-sqlite3` (verified working here). Avoid adding more native deps.

## 6. Database & API Access Patterns

- **All SQL parameterized** (`?` placeholders). String interpolation of user data into SQL is a firing offense.
- Every query on user-owned resources includes `WHERE user_id = ?` — ownership is enforced in the repo layer, not only in routes.
- Migrations: add a new `NNN_name.sql`, never edit an applied one. Schema changes ship together with repo/service/type updates in the same change.
- Transactions (`db.transaction(...)`) for multi-statement invariants (complete task + set completed_at; notification + email_queue insert).
- API client rules (server side): routes wrap handlers with `asyncHandler`; throw typed `HttpError`s; the central error middleware is the only place that shapes error JSON.

## 7. Error Handling

- Server: known failures → `HttpError(status, code, message, details?)`; unexpected → 500 generic + full log. Never leak stack traces, SQL, or file paths to clients. Never swallow errors silently (`catch {}` forbidden).
- Client: query errors → inline error state + retry; mutation errors → toast + form state preserved; 401 → session reset + redirect. Distinguish network vs server errors in copy.
- Scheduler/email failures: record in `email_queue.last_error`, respect attempt cap, surface in logs/monitoring — never crash the process.

## 8. Security & Secrets

- Secrets only via env vars (see API.md §3); `.env` is gitignored; `.env.example` documents names with safe placeholders. Never log secrets, cookies, password hashes, or full request bodies of auth endpoints.
- Passwords: bcrypt cost 12; constant-time-ish flows (same error for unknown email/bad password); rate limiting per SECURITY.md.
- Sessions: random 32-byte tokens, stored hashed, httpOnly + SameSite=Lax cookies, Secure in production, server-side revocation on logout.
- All write endpoints validate Origin when present (CSRF posture from API.md).
- Dependency updates and `npm audit` before every deploy stage.

## 9. Testing Rules

- Server: Vitest + Supertest integration tests per module (auth flows, task CRUD + ownership, filters/sort/buckets, dashboard aggregates, analytics math, reminder scan idempotency, validation errors). Each test file gets a fresh in-memory DB + migrations. Fixtures via factories (`tests/helpers.ts`), never the dev seed.
- Client: Testing Library for components with real behavior (TaskCard actions, FilterBar URL sync, TaskForm validation). No snapshot-only tests.
- A phase is complete only when: typecheck ✅ lint ✅ tests ✅ (all green in a real run) and the feature was exercised via a real HTTP request or the live preview.
- Investigate failures to root cause; never skip/quarantine a failing test to "go green".

## 10. Documentation

- The mandated doc set (PRD, DESIGN, ARCHITECTURE, DATABASE, API, AGENTS, IMPLEMENTATION_PLAN, TESTING, SECURITY, DEPLOYMENT, MONITORING, README, PROGRESS_LOG) must reflect **what was actually built**. When implementation deviates from a doc, update the doc in the same change with a note.
- README.md is the entry point: what it is, feature list, quickstart (install → migrate → seed → dev), scripts table, env vars, architecture summary, deploy pointer.

## 11. Git & Change Discipline

- Work happens on the session branch `arena/2e2550c2-stms`; never push to `main` directly.
- Commit messages: imperative, scoped — `feat(tasks): add smart sort and bucket filters`, `fix(auth): reject origin mismatch on writes`, `docs(api): document calendar range limits`. One logical change per commit; docs+code for the same change may share a commit.
- Never commit: `node_modules/`, `dist/`, `*.sqlite*`, `.env`, `server/outbox/`, coverage output (all gitignored).
- Keep the repo in a working state at every commit: typecheck+tests green before committing.
