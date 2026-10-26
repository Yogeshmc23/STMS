# TESTING.md — Student Task Manager

**Stage 14 deliverable.** What is tested, how, and — honestly — what can't be tested in this environment.

## 1. How to run

```bash
npm run test          # shared build + server suite + client suite
npm run test -w @stms/server   # Vitest + Supertest against the real Express app + temp in-memory SQLite
npm run test -w @stms/client   # Vitest + Testing Library (jsdom)
npm run typecheck     # tsc strict across shared/server/client
npm run lint          # ESLint flat + Prettier check
```

Current status (recorded from real runs, 2026-10-26): **91 server + 34 client = 125 tests passing**, typecheck green ×3, lint green.

## 2. Coverage matrix (tests → features)

| Area               | File(s)                                                                   | Key behaviors verified                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migration + schema | `server/tests/migrate.test.ts`                                            | idempotent apply, tables/indexes exist, FK enforcement, CHECK enums, user→task/notifications cascade, notification UNIQUE dedup                                                                                                                                                                        |
| Config             | `server/tests/config.test.ts`                                             | defaults, empty-as-unset, all-or-nothing SMTP, prod secret rule, secure-cookie rule                                                                                                                                                                                                                    |
| Auth/session       | `server/tests/auth.test.ts` (17)                                          | register dup 409, field errors 400, bcrypt hash at rest (no plaintext), identical 401 for unknown-email vs wrong-password (enumeration), httpOnly/SameSite cookie flags, expiry prune, sliding refresh, logout revocation, A6 email immutability, rate limit 429                                       |
| Tasks CRUD         | `server/tests/tasks.test.ts` (16)                                         | defaults, UTC normalization, complete/reopen completed_at invariant (transaction), partial patch clearing `dueAt:null`, foreign-id 404 on get/patch/delete, sorts, subjects meta, delete cascade incl. notifications                                                                                   |
| Buckets + calendar | `server/tests/deadlines-calendar.test.ts` (7), `time-buckets.test.ts` (5) | overdue/today/week/later/none with NOW-relative fixtures (completed excluded from overdue), filtered `total`, range inclusivity (date-only = whole UTC days), 92-day guard, invalid-range 400, unscheduled excluded from calendar, local-day math for IST/NY offsets                                   |
| Search & filter    | `server/tests/search-filter.test.ts` (6)                                  | q across title/description/subject, case-insensitive, **LIKE wildcard escaping** (bare `%` matches literal only), OR-within/AND-across multi-selects, pagination beyond end → empty + stable total, enum + limit-cap validation                                                                        |
| Dashboard          | `server/tests/dashboard.test.ts` (4)                                      | hand-computed aggregates (counts/rate/upNext/workload/activity order+dedup), zero-data null rate, ownership isolation, 401                                                                                                                                                                             |
| Notifications      | `server/tests/notifications.test.ts` (11)                                 | window correctness (48h task un-notified), scan idempotency (2nd scan = 0 inserts), completed never notified, email queue only when preference on, SMTP-off → outbox `.eml` with "NOT sent" label (no fake delivery), task-delete cascade, mark-read idempotent, read-all, dismiss, foreign 404, authz |
| App factory        | `server/tests/health.test.ts` (8)                                         | health w/ real DB check, JSON 404/400 envelopes, Origin-mismatch 403 (CSRF posture), CSP + no x-powered-by, no-store                                                                                                                                                                                   |
| Client forms/auth  | `client/src/App.test.tsx`, `phase2.test.tsx`                              | unauthenticated redirect, client validation before fetch, submit payload shape, server-error surfacing, confirm-password check, shell/nav                                                                                                                                                              |
| Client features    | `phase5/6/7 + dashboard tests` (15)                                       | bell badge + panel mark-read POST, mark-all, dismiss, analytics aggregates render + period toggle + empty/error, FilterBar↔URL sync + debounce + `?open=` deep-link into edit sheet, TaskCard intents                                                                                                  |
| Grid math          | `client/src/utils/calendar.test.ts` (8)                                   | Monday weeks, 42-cell matrix, ranges, month wrap                                                                                                                                                                                                                                                       |

## 3. Integration & production-path verification (beyond unit)

Every phase was additionally verified with **real HTTP requests** against the running app (curl through the Vite proxy for dev; direct boot for production): auth flow, tasks flow, calendar/buckets, dev scan + outbox file, seeded demo data through dashboard/analytics (2026-10-26 logs in PROGRESS_LOG.md).

**Production build check (Stage 18):** `npm run build` → boot `NODE_ENV=production node server/dist/index.js` → health ok, SPA + hashed assets served, deep-link fallback, secure-cookie session flow, CSP headers, **dev-only routes absent** (404). This caught a real bug: migration `.sql` files were not copied into `dist/` — fixed in the server build script.

## 4. Known gaps (honest)

- **No browser E2E (Playwright/Cypress).** This sandbox cannot download browser binaries. Mitigations: Supertest drives the real Express app (full middleware stack, cookies, DB); jsdom component tests cover user interactions; every flow was manually curl-verified against the live preview. Recommendation before/at first deploy: add `e2e/` Playwright smoke (register → create task → complete → see dashboard) — CI-ready config can be added on approval.
- Email delivery is verified to the **transport boundary** (queue state machine + outbox file contents); real SMTP delivery depends on provider credentials (dev outbox is asserted instead — never faked).
- Scheduler timing (60 s tick) is unit-tested via the pure `runReminderScan(db, now)`; the `setInterval` wiring is smoke-verified in the dev server logs ("reminder scheduler started").
- Responsive/a11y: CSS follows DESIGN.md §8/§9 and is exercised at the DOM level; pixel-level checks across 360/768/1280 were done by construction + jsdom layout assertions, not by a real browser here.
