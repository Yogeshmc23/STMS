# API.md — Student Task Manager REST API

**Stage 5 deliverable.** Single JSON REST API under `/api`. Auth: httpOnly session cookie (`stms_sid`). All endpoints except `auth/register`, `auth/login`, `health` require a valid session → otherwise **401**. Ownership: any resource id belonging to another user → **404** (no existence leaks). All request bodies/queries zod-validated → **400** with field details.

---

## 1. Conventions

- **Content type:** `application/json` on all requests/responses (415 for anything else on writes).
- **Timestamps:** UTC ISO-8601 (`2026-10-26T18:30:00.000Z`). Client renders in local timezone.
- **Error shape (every non-2xx):**
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Human-readable summary",
      "details": [{ "field": "dueAt", "message": "Must be a valid ISO date-time" }]
    }
  }
  ```
  Codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `NOT_FOUND` (404), `CONFLICT` (409, duplicate email), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500 — generic message only, details logged server-side).
- **Status codes:** 200 OK, 201 Created (register, task create), 204 No Content (logout, delete, mark-read-all), 400/401/404/409/429/500 as above.
- **Pagination:** list endpoints accept `?page=1&limit=20` (limit ≤ 100); response `{ items, page, limit, total }`.
- **Rate limits:** auth endpoints 10 req/min/IP; write endpoints 120 req/min/user; reads 300 req/min/user (SECURITY.md).
- **CSRF posture:** SameSite=Lax cookie; state-changing requests with an `Origin` header must match the server origin (else 403 `ORIGIN_MISMATCH`).
- **Security headers:** helmet defaults; `Cache-Control: no-store` on all `/api` responses.

## 2. Endpoints

### Auth & profile

| Method & path             | Auth                  | Body / Query                                                                     | Success                                                                                                                                                  |
| ------------------------- | --------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/register` | public (rate-limited) | `{ name, email, password }` — name 1–100; email valid, ≤254; password ≥ 8, ≤ 200 | **201** `{ user }` + session cookie. 409 `EMAIL_TAKEN`.                                                                                                  |
| `POST /api/auth/login`    | public (rate-limited) | `{ email, password }`                                                            | **200** `{ user }` + cookie. 401 `INVALID_CREDENTIALS` (same message for unknown email / bad password).                                                  |
| `POST /api/auth/logout`   | session               | —                                                                                | **204**, cookie cleared, session row deleted.                                                                                                            |
| `GET /api/auth/me`        | session               | —                                                                                | **200** `{ user }` or 401. `user = { id, name, email, emailRemindersEnabled, createdAt }` — never includes password hash.                                |
| `PATCH /api/auth/profile` | session               | `{ name?, emailRemindersEnabled? }` (at least one field)                         | **200** `{ user }`. Email change is **not** offered in MVP (identity stability; flagged in PRD assumptions) — profile covers name + reminder preference. |
| `PUT /api/auth/password`  | session               | `{ currentPassword, newPassword }` (new ≥ 8)                                     | **204**. 401 `INVALID_CREDENTIALS` if current is wrong. Other sessions stay valid (documented choice; logout-all is backlog).                            |

> PRD F1 mentioned email update; scoped down here to name + reminder toggle because email is the login identifier and changing it safely (re-verification) exceeds MVP. Logged as assumption A6 in PROGRESS_LOG.md.

### Tasks

| Method & path                  | Notes                                                                                                                                                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/tasks`               | Filters (all optional, combinable): `q` (search in title/description/subject, ≤200 chars), `subject` (repeatable), `priority` (repeatable: high/medium/low), `status` (repeatable: pending/in_progress/completed), `type` (repeatable), `due` bucket (`overdue | today | week | later | none`), `dueFrom`/`dueTo`(ISO range),`sort` (`due_asc | due_desc | priority_desc | created_desc | title_asc | smart`— default`smart`: overdue first, then due date asc (nulls last), then priority, then created), `page`, `limit`. → **200** paginated `{ items: Task[], ... }`. |
| `POST /api/tasks`              | `{ title*, description?, subject*, type*, priority?, status?, dueAt? }` → **201** `{ task }`. `dueAt` null/absent = unscheduled. status≠completed unless `completedAt` handling applies (service sets it).                                                     |
| `GET /api/tasks/:id`           | Owner only → **200** `{ task }`, else 404.                                                                                                                                                                                                                     |
| `PATCH /api/tasks/:id`         | Any subset of task fields incl. `status`. Completing sets `completedAt=now`; reopening clears it. → **200** `{ task }`.                                                                                                                                        |
| `DELETE /api/tasks/:id`        | **204**. Cascades its notifications/email_queue rows.                                                                                                                                                                                                          |
| `GET /api/tasks/meta/subjects` | Distinct subjects of the caller's tasks, alphabetical → **200** `{ subjects: string[] }` (filter UI + form datalist).                                                                                                                                          |

**Task shape (camelCase):**

```json
{
  "id": 1,
  "title": "Linear algebra problem set 4",
  "description": "",
  "subject": "Mathematics",
  "type": "assignment",
  "priority": "high",
  "status": "pending",
  "dueAt": "2026-10-28T18:29:00.000Z",
  "completedAt": null,
  "createdAt": "…",
  "updatedAt": "…"
}
```

### Dashboard

| `GET /api/dashboard/summary`                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **200** `{ counts: { total, pending, inProgress, completed, overdue, dueToday, dueThisWeek, unscheduled }, completionRate: 0..1 (null when total=0), upNext: Task[≤5] (open, nearest due, smart order), workloadBySubject: [{ subject, open, total }] (open work), recentActivity: [{ id, title, kind: 'completed' | 'created', at }] (≤8) }` |

### Calendar

| `GET /api/calendar?from=&to=`                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `from`/`to` required ISO dates (`to` ≥ `from`, span ≤ 92 days → else 400). **200** `{ tasks: Task[] }` — tasks with `dueAt` inside `[from, to]` (all statuses; completed shown muted by client). Range covers month/week/day views (client requests the visible grid range). |

### Analytics

| `GET /api/analytics/overview?days=14|30` |
|---|
| **200** `{ totals: { created, completed, open, overdue }, completionRate, completedLastPeriod, completedPreviousPeriod, trend: [{ date: 'YYYY-MM-DD', completed: n, created: n }] (day buckets, UTC, zero-filled), byPriority: [{ priority, open, completed }], bySubject: [{ subject, open, completed }], byType: [{ type, open, completed }] }`. Period comparison: last `days` vs the `days` before. |

### Notifications & reminders

| Method & path                                     | Notes                                                        |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/notifications?unreadOnly=&page=&limit=` | **200** paginated `{ items: Notification[] }`, newest first. |
| `GET /api/notifications/unread-count`             | **200** `{ count }` (polled by client every 60 s).           |
| `POST /api/notifications/:id/read`                | **200** `{ notification }`; idempotent.                      |
| `POST /api/notifications/read-all`                | **204**.                                                     |
| `DELETE /api/notifications/:id`                   | **204** (dismiss).                                           |

**Notification shape:** `{ id, kind, title, body, taskId, readAt, createdAt }`.
**Reminder triggers (server-side scheduler, not HTTP):** every 60 s scan creates `deadline_soon_24h` / `deadline_soon_1h` / `overdue` notifications (unique per task+kind) for open tasks; queues email rows when the user has reminders enabled; sender drains queue via SMTP or dev outbox. `POST /api/dev/run-reminder-scan` exists **only when `NODE_ENV !== 'production'`** to let tests/dev trigger a scan deterministically.

### Health

| `GET /api/health` | Public. **200** `{ status: 'ok', db: 'ok', uptime }`; 503 if DB check fails. Used by deploy probes (DEPLOYMENT.md). |

## 3. Required Environment Variables (server)

| Var                                                   | Required              | Default                   | Notes                                                                                                               |
| ----------------------------------------------------- | --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                            | no                    | `development`             | `production` enables Secure cookies, disables dev-only routes/seed                                                  |
| `PORT`                                                | no                    | `3000`                    | Single port serves API + built SPA                                                                                  |
| `DB_PATH`                                             | no                    | `server/data/stms.sqlite` | `:memory:` allowed (tests)                                                                                          |
| `SESSION_COOKIE_NAME`                                 | no                    | `stms_sid`                |                                                                                                                     |
| `SESSION_TTL_DAYS`                                    | no                    | `7`                       | Sliding                                                                                                             |
| `SESSION_SECRET`                                      | **yes in production** | dev fallback              | Used to sign nothing (tokens are random) but required as a boot check in prod to force deliberate config; 32+ chars |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | no                    | —                         | All-or-nothing: absent ⇒ email disabled ⇒ dev outbox                                                                |
| `EMAIL_FROM`                                          | with SMTP             | —                         | e.g. `STMS <reminders@yourdomain>`                                                                                  |
| `CLIENT_ORIGIN`                                       | dev only              | —                         | CORS allow-origin for split dev servers (not needed in prod single-origin)                                          |
| `RATE_LIMIT_AUTH_PER_MIN` etc.                        | no                    | 10/120/300                | Tuning                                                                                                              |

No secret is ever exposed to the client bundle (no `VITE_*` secrets; API is same-origin).

## 4. Versioning & Compatibility

Single internal consumer (the SPA shipped with the server) ⇒ no public versioning. Breaking changes land together in one commit. `/api/health` is the only endpoint considered a stable external contract (host probes).
