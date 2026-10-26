# MONITORING.md — Student Task Manager

**Stage 19 deliverable.** Sized for a small student app — signal, no noise, no secrets in logs.

## 1. Structured logs (pino, JSON)

- Every request: one line with `reqId` (echoed as `X-Request-Id` response header → paste into bug reports), method, path, status, duration. Health-probe requests are excluded (`autoLogging.ignore`) so uptime pings don't drown real lines.
- Levels via `LOG_LEVEL` env (`info` default; `debug` in dev). Redactions (serializer-level, enforced by `logger.ts`): cookies, authorization headers, `password`/`currentPassword`/`newPassword`, password hashes, session tokens. **No secret ever reaches stdout** by construction.
- Startup logs: migrations applied, port/env/dbPath, scheduler start; a loud `warn` when SMTP is unconfigured ("emails go to the dev outbox (not sent)") — the honest-state principle, visible at boot.

## 2. What to watch (host-provided or free tools)

| Signal            | Source                                                                                                                                                     | Alert on                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Liveness          | `GET /api/health` → `{status, db, uptime, version}`; 503 when DB check fails                                                                               | 3 consecutive failures (~1 min). UptimeRobot/BetterStack free tier is enough |
| Error rate        | count of `"level":50` lines                                                                                                                                | any 5xx cluster > 5/min for 5 min                                            |
| DB health         | health endpoint `db:"unavailable"`; `SQLITE_BUSY` log entries                                                                                              | immediate                                                                    |
| Reminder pipeline | scheduler logs one line **only when it did work** (`notificationsCreated`, `email:{sent,skipped,failed,pending}`, `sessionsPruned`)                        | sustained 0 for days with open deadlines = scheduler dead                    |
| Email delivery    | `SELECT state, COUNT(*) FROM email_queue GROUP BY state` + `last_error` on rows marked `failed` (after 3 attempts) — surfaced in logs at `error` level too | `failed > 0`                                                                 |
| Disk              | size of the SQLite file + WAL vs host quota                                                                                                                | >85%                                                                         |

## 3. Log handling

- stdout JSON → host collector (Render/Fly capture it; VPS: journald + rotation `maxsize 50M`). No file logging in-app (one less moving part).
- Retention 30 days is plenty at this scale.
- `pino-http` never logs bodies (request bodies contain task text — kept out of logs by default; add transports only if ever needed, with the same redactions).

## 4. What monitoring deliberately excludes (kept simple, per brief §4)

- No APM/tracing/metrics exporters — single process + SQLite; logs + health endpoint answer the questions a student project asks.
- No alert channels beyond the host's + one free uptime checker; no "noisy alerts" (scheduler success lines are info-level).
- No Sentry-style error capture yet: 5xx lines in stdout + reqId correlation is sufficient for one maintainer; wiring Sentry is a 20-line follow-up if ever wanted.
