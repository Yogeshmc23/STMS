# DEPLOYMENT.md — Student Task Manager

**Stage 18 deliverable.** Single-process architecture (ARCHITECTURE.md §3): Express serves `/api/*` **and** the built SPA from one port. The production build below was **actually booted and smoke-tested** (2026-10-26; results in PROGRESS_LOG.md).

## 1. Build & run (any Node ≥ 20.19 host)

```bash
git clone <repo> && cd STMS
npm ci                      # lockfile-pinned; run postinstall normally on real hosts
npm run build               # shared → server tsc (+ .sql migration copy) → vite SPA → server/public
cp .env.example .env        # fill SESSION_SECRET (≥32 chars), DB_PATH, SMTP_* as desired
npm start                   # NODE_ENV=production node server/dist/index.js
```

Verified prod boot checklist (all ✅ in the sandbox smoke run):

- `GET /api/health` → `{status:"ok",db:"ok"}` (use this as the host health-check path)
- Migrations apply automatically on boot (idempotent; forward-fix policy — no down-migrations)
- SPA + hashed assets served; deep links (`/calendar`) fall back to index.html
- Register/login → `Secure; HttpOnly` cookie; dev-only `/api/dev/*` routes absent in production
- CSP/helmet headers present; no `x-powered-by`

## 2. Required / notable env

| Var                    | Prod requirement                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`       | **required, ≥32 chars** (boot fails otherwise)                                                          |
| `DB_PATH`              | point at a **persistent-disk** path (SQLite; losing the file = losing all data)                         |
| `TRUST_PROXY`          | `1` behind any TLS-terminating proxy/render (needed for secure cookies + correct rate-limit IPs)        |
| `COOKIE_SAMESITE`      | `lax` default; `none` **only** if embedding cross-site (forces Secure — browsers require it)            |
| `SMTP_*`, `EMAIL_FROM` | all-or-nothing; unset = email disabled with dev-outbox fallback (SECURITY/PRD §7), never blocks the app |
| `FRAME_ANCESTORS`      | default CSP `frame-ancestors 'self'`; override ONLY for iframe-embed scenarios (e.g., previews)         |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## 3. Free-tier targets (ranked for this app)

1. **VPS + systemd** (recommended where a cheap one exists): SQLite persists naturally. `ExecStart=/usr/bin/node /srv/stms/server/dist/index.js` with `EnvironmentFile=/srv/stms/.env`, `Restart=always`; nginx/caddy for TLS.
2. **Fly.io**: `fly launch` (node runtime) + `fly volume create stms_data -s 1` mounted at `/data`, `DB_PATH=/data/stms.sqlite`. Free-allowance class `shared-cpu-1x` fits.
3. **Render**: `render.yaml` included (web service, health check `/api/health`, build/start above). ⚠️ Free tier has **ephemeral disk** — SQLite data resets on redeploy unless you attach a persistent disk (paid ~$1/mo). Choose this only with the disk or accepting resets.
4. **Vercel/serverless: not suitable** with SQLite (no persistent fs) — would require switching to a hosted Postgres first (out of MVP scope).

## 4. Docker (optional; Dockerfile included)

```bash
docker build -t stms .
docker run -d -p 3000:3000 -v stms-data:/data --env-file .env stms
```

Two-stage alpine image; runtime uses `better-sqlite3`'s bundled **musl prebuild** (no compilers needed — same mechanism verified in this sandbox). `DB_PATH=/data/stms.sqlite` default in-image with a VOLUME.

## 5. TLS / domain / CORS

- TLS at the host (all three options provide HTTPS free); app itself stays plain http behind the proxy + `TRUST_PROXY=1`.
- CORS stays disabled (SPA is same-origin). `CLIENT_ORIGIN` exists only for split-origin dev convenience — leave unset in production.

## 6. Environment quirks recorded during this build

- In networks that block `nodejs.org`/GitHub-release assets, install with `npm ci --ignore-scripts` — safe here because the only native dep (better-sqlite3 ≥13) loads a bundled prebuild (verified). Not needed on normal hosts.

## 7. Release routine

1. `npm run typecheck && npm run lint && npm test` green
2. merge to main, deploy host builds tag
3. `GET /api/health` 200 + spot-flow (login → create → complete → dashboard)
4. Migrations run at boot — forward-fix policy; to roll back code, redeploy previous image (schema is additive-only in practice)
5. No dev credentials/db anywhere near prod: separate `.env`, fresh `SESSION_SECRET`, prod `DB_PATH` only on the host
