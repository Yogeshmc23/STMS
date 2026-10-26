# SECURITY.md — Student Task Manager

**Stage 16 deliverable.** Audit of the implemented app against the OWASP-ish checklist for this scope. Findings marked ✅ were verified by tests (see TESTING.md refs) or inspection noted below.

## 1. Authentication & session management

- Passwords: bcryptjs, cost 12; plaintext never stored, logged, or returned. Stored-hash format asserted in tests. ✅
- Sessions: random 32-byte tokens; only `SHA-256(secret:token)` persisted; httpOnly cookie; server-side revocation on logout; 7-day sliding expiry with prune-on-read; expiry behavior tested. ✅
- Enumeration resistance: identical 401 envelope + message for unknown email vs wrong password; bcrypt timing equalized with dummy-hash compare. ✅
- Auth endpoints rate-limited: 10 req/min/IP (`express-rate-limit`, IPv6 keys normalized via `ipKeyGenerator` — found & fixed during Phase 1 audit). Write/read limiters user-keyed (120/300). ✅
- Production requires `SESSION_SECRET` ≥ 32 chars (fail-fast boot). Dev fallback is loud and only outside production. ✅
- Password change requires current password; keeps other sessions (documented A-choice in API.md).

## 2. Authorization (resource ownership)

- Every task/notification SQL statement is scoped `WHERE user_id = ?` at the **repo layer** (defense-in-depth beyond route `requireAuth`); foreign ids → 404 (no existence leak). Verified by tests for get/patch/delete/notifications. ✅
- Client-side routing guards are UX only — server re-checks on every request (401 path tested). ✅
- No admin/teacher roles by design (PRD §3) → no privilege surface to audit beyond ownership.

## 3. CSRF / cross-origin

- SameSite=Lax cookie + JSON-only API + Origin check on unsafe methods (403 `ORIGIN_MISMATCH`) + same-origin prod serving (SPA served by Express). CORS is disabled unless `CLIENT_ORIGIN` is explicitly set for dev. Tests cover Origin rejection + no-Origin allowance. ✅
- Caveat: sandbox preview needs `SameSite=None; Secure` (iframe, cross-site) — config-driven, documented in .env.example; standard deploys keep Lax.

## 4. Injection & input validation

- SQL: 100% parameterized (`?`) — no interpolation of user data; dynamic identifiers only from fixed allowlists (SET-clause builders). ✅
- Search LIKE: user `%`/`_`/`\` escaped (`ESCAPE '\'`) — bare `%` search tested to match literal-only. ✅
- Every body/query/param validated by shared zod schemas (limits, enums, ISO datetime, ranges); oversized payloads rejected (413 via 1 mb body limit; title ≤200 etc. enforced at API **and** SQLite CHECK layers). ✅
- No HTML rendering of user content (React escapes); no dangerouslySetInnerHTML anywhere. CSP `script-src 'self'` blocks injected script as second layer. ✅
- XSS via notification text: notification bodies embed task titles as plain text. ✅

## 5. Secrets & data exposure

- `.env` gitignored; `.env.example` documents names with placeholders; repo scan for committed secrets: clean (only dev fallback constant, clearly labeled). ✅
- Password never in logs: pino redacts `password|currentPassword|newPassword|passwordHash|cookie|authorization`. ✅
- Error responses are generic envelopes; stacks/SQL/paths never returned to clients (central handler tested); `X-Powered-By` disabled. ✅
- Client bundle contains no secrets (no `VITE_*` used); SMTP credentials server-side only. ✅
- GDPR-lite: hard-delete endpoints for tasks/notifications; account deletion = backlog item (documented limitation).

## 6. Headers & transport (helmet)

- CSP default-src 'self'; frame-ancestors 'self' (override documented for iframe previews — sandbox sets `FRAME_ANCESTORS=*`, standard deploys don't); HSTS auto via host TLS; nosniff; referrer-policy no-referrer. Verified header present on prod smoke. ✅

## 7. Dependency vulnerabilities (`npm audit`, 2026-10-26)

- **Fixed in this session:** nodemailer 7→**^10.1.4** (12 advisories incl. SMTP/CRLF injections), zod 3→**^4.6.7** (memory-exhaustion on oversized constrained collections), react-router-dom 6→**^7** (moderate router advisories). All typecheck+125 tests green after upgrade.
- **Remaining:** dev-toolchain advisory (vitest 3 / tinypool) affecting the test runner only — not shipped to production; upgrade path = vitest 5 (needs vite 7 bump). Flagged: schedule with the next toolchain refresh. `npm audit --omit=dev` → **0 prod vulnerabilities**. ✅ (with noted dev caveat)
- Lockfile committed; native module limited to better-sqlite3 (bundled prebuilds, no download-time script chain in sandbox — installed with `--ignore-scripts`, see DEPLOYMENT.md §6).

## 8. Trust boundaries & abuse

- Single boundary browser↔server; no file uploads, no exec, no SSRF surface (outbound = SMTP only, admin-configured). Rate limits cover brute force; registration requires nothing external. ✅
- DoS: pagination caps (limit ≤100), calendar span ≤92 days, activity/upNext caps, body limit 1 mb, SQLite busy timeout. ✅
- Scheduler failure isolation: errors logged, never crash; re-entrancy guarded. ✅

## 9. Residual risks (accepted, documented)

1. Single-node SQLite, no at-rest disk encryption — hosting responsibility (all target hosts provide it or document).
2. Email content includes task title/subject — expected product behavior; user preference can disable.
3. No MFA / password reset-by-email — deferred (PRD out-of-scope list).
4. Public registration (no invite codes) — acceptable for the stated use; rate limit mitigates spam signups.
