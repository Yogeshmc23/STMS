# PRD — Student Task Manager (STMS)

**Version:** 1.0 · **Date:** 2026-10-26 · **Status:** Scope confirmed by product owner
**Owner decisions locked (2026-10-26):** Student-only role · In-app + email notifications · Express + React/Vite + SQLite stack · Open deployment target (free-tier ready)

---

## 1. Problem

Students managing assignments, projects, exams, and deadlines across multiple subjects via notebooks or scattered reminders face missed deadlines, poor prioritization, and academic stress.

## 2. Objective

A centralized web app for organizing academic tasks, deadlines, and priorities, visualizing workload via a dashboard, and surfacing progress analytics — to build better study habits and reduce missed work.

## 3. Users & Roles

**Single role: Student.** Every account is a student who owns their data. There is no admin or teacher role in MVP (confirmed). Authorization rule: a student can only view/modify their own tasks, notifications, and profile.

**Persona:** "Riya, 2nd-year undergrad, 5–6 subjects per semester, juggling assignments, projects, and exams. Uses phone between classes and a laptop in the evening."

## 4. Success Criteria (product-level)

1. A student can register, log in, create a task with subject/type/priority/due date, and see it on the dashboard and calendar.
2. Completing a task updates completion stats and analytics immediately.
3. The student receives an in-app reminder before a task's deadline and when a task is overdue (email additionally sent when SMTP is configured).
4. The student can find any task within seconds via search and filters (subject, priority, status, due date).
5. The full experience works on desktop, tablet, and mobile.

## 5. MVP Features — User Stories & Acceptance Criteria

### F1. Authentication

- **Story:** As a student, I can register, log in, log out, and manage my profile so my data is private and mine.
- **Acceptance criteria:**
  - Register with name, valid email, password (min 8 chars); duplicate email rejected with clear error.
  - Passwords hashed with bcrypt (cost ≥ 12); never logged or returned by any API.
  - Login issues an httpOnly, SameSite=Lax session cookie; sessions stored server-side with expiry (7 days sliding) and revoked on logout.
  - Profile management: update name, update email (unique check), change password (requires current password).
  - All non-auth endpoints return 401 without a valid session; rate limiting on auth endpoints.

### F2. Task Management

- **Story:** As a student, I can create, edit, delete, and organize tasks (assignment, project, exam, study task) so nothing lives only in my head.
- **Acceptance criteria:**
  - Task fields: title (required, ≤ 200), description (optional, ≤ 5000), subject (required, ≤ 100), type ∈ {assignment, project, exam, study, other}, priority ∈ {high, medium, low}, status ∈ {pending, in_progress, completed}, due date-time (optional).
  - Marking a task completed records `completed_at`; reopening clears it.
  - Delete requires confirmation in UI; delete is hard-delete of the task row (notifications referencing it are cleaned up).
  - All mutations validate input server-side (zod) and enforce ownership (403/404 for other users' tasks).
  - Task list supports sorting by due date, priority, created date, title.

### F3. Priority Management

- **Story:** As a student, I can tag tasks High/Medium/Low so I know what deserves attention first.
- **Acceptance criteria:**
  - Priority is required (default: medium), shown as a color-coded badge everywhere tasks appear (list, calendar, dashboard).
  - Tasks can be sorted and filtered by priority; "smart" default sort orders by (overdue first, then due date, then priority).

### F4. Deadline Tracking

- **Story:** As a student, I can see upcoming, due-today, overdue, and completed work at a glance so I never miss a deadline.
- **Acceptance criteria:**
  - Tasks expose computed deadline buckets: `overdue` (due < now, not completed), `due_today`, `due_soon` (next 7 days), `later`, `no_due_date`, `completed`.
  - Dashboard shows counts per bucket; task list has quick-filter chips for them.
  - Overdue tasks are visually distinct (red badge) in every view.

### F5. Interactive Dashboard

- **Story:** As a student, I land on a dashboard that summarizes my academic state so I know what to do next in 10 seconds.
- **Acceptance criteria:**
  - Widgets: total tasks, completion rate (%), pending/in-progress counts, overdue count, tasks due today/this week.
  - "Up next" list: nearest 5 upcoming deadlines with priority badges and quick-complete action.
  - Workload by subject (task counts per subject for open work).
  - All numbers derive from real DB aggregates (no client-side guesswork); empty state when the user has no tasks, with a CTA to create the first task.

### F6. Calendar & Scheduling

- **Story:** As a student, I can view my tasks in day, week, and month calendar views so deadlines fit my schedule.
- **Acceptance criteria:**
  - Month view: grid of days with per-day task dots/chips (color by priority), click a day → day view.
  - Week view: 7 columns with that week's tasks; Day view: single-day detail incl. tasks with no due date surfaced separately.
  - Navigate prev/next/today; range data fetched from one API (`GET /api/calendar?from&to`).
  - Tasks without due dates do not appear on the calendar (but appear in day view's "unscheduled" section).

### F7. Notifications & Reminders

- **Story:** As a student, I get reminded about approaching and overdue deadlines so the system watches my back.
- **Acceptance criteria:**
  - Server-side reminder scheduler runs every minute; thresholds: **24 h before due** and **1 hour before due** ("deadline_approaching"), and once when a task becomes **overdue** ("overdue").
  - Deduplication: at most one notification per (task, kind) — enforced by DB unique index.
  - In-app: bell with unread count, notification panel, mark read / mark all read, deep-link to the task.
  - Email: when SMTP env is configured, reminders are also emailed (per-reminder, with a send log to avoid duplicate sends). When not configured, emails are written to a local dev outbox and clearly flagged; nothing silently pretends to send.
  - Completed tasks never generate reminders; reminders stop after the due date passes (overdue notice is the terminal one).

### F8. Progress Analytics

- **Story:** As a student, I can see completion rates, productivity trends, and workload distribution so I can improve my habits.
- **Acceptance criteria:**
  - Overview: total created vs completed, completion rate, current streak-ish metrics (tasks completed this week vs last week).
  - Trend chart: tasks completed per day over the last 14/30 days (selectable).
  - Distribution charts: open tasks by priority; open + completed by subject (workload).
  - All computed server-side via SQL aggregates over the user's real data; correct handling of zero-data users (empty states, not divide-by-zero).

### F9. Search & Filtering

- **Story:** As a student, I can search and filter my tasks so I find what I need fast.
- **Acceptance criteria:**
  - Free-text search across title, description, subject (case-insensitive).
  - Filters: subject (multi), priority (multi), status (multi), due-date range/bucket; combinable with search; results update without full page reload.
  - Filter state reflected in URL query string (shareable/back-button friendly).
  - Server-side filtering with indexes; pagination (or "load more") beyond 50 results.

### F10. Responsive Design

- **Story:** As a student, I can use the app on phone, tablet, and desktop without compromise.
- **Acceptance criteria:**
  - Breakpoints: ≥1024 desktop (sidebar nav), 640–1023 tablet, <640 mobile (bottom nav / compact header).
  - All core flows (create task, complete task, see dashboard, check calendar) usable at 360 px width.
  - Touch targets ≥ 40 px; no horizontal page scroll at any supported width.

## 6. Out of Scope — Backlog (explicitly NOT built in MVP)

| #   | Feature                         | Status                                                                      |
| --- | ------------------------------- | --------------------------------------------------------------------------- |
| B1  | AI-assisted task prioritization | Backlog — needs explicit approval (+ would trigger Stage 12/MCP evaluation) |
| B2  | Automatic study-plan generation | Backlog                                                                     |
| B3  | Recurring tasks                 | Backlog                                                                     |
| B4  | Collaborative group projects    | Backlog                                                                     |
| B5  | Google Calendar integration     | Backlog — needs explicit approval (+ Stage 13 third-party review)           |

Also out of scope: admin/teacher roles, browser push notifications, payments, i18n, offline/PWA.

## 7. Notification Channel Decision & Cost Flags (Stage 1 requirement)

- **Channel:** In-app (always on) + Email (opt-in by configuration).
- **Email transport:** provider-agnostic SMTP via nodemailer, configured through env vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`). Works with any provider; no code change needed to switch.
- **Cost flags (all have free tiers; nothing billed by this project):**
  - Resend SMTP: free 3,000 emails/mo, 100/day.
  - Brevo SMTP: free 300/day.
  - Gmail SMTP: free with an App Password (rate-limited ~500/day; acceptable for a student project).
  - Without any SMTP config, email sending is **disabled**; the dev outbox records what would be sent. The app never blocks on email.

## 8. Non-Functional Requirements

- **Security:** see SECURITY.md (bcrypt, httpOnly cookies, CSRF-safe SameSite, zod validation, rate limiting, helmet, ownership checks on every resource).
- **Performance:** student scale (≤ a few hundred tasks/user); API p95 < 200 ms locally; indexed queries; no premature optimization.
- **Reliability:** single-node deployment; SQLite WAL mode; migrations are versioned and idempotent.
- **Accessibility:** WCAG 2.1 AA target — contrast, keyboard navigation, focus states, ARIA on interactive components, reduced-motion support.
- **Maintainability:** TypeScript strict mode everywhere; ESLint + Prettier; tests for critical behavior; docs kept truthful (this file reflects what is built).

## 9. Assumptions (flagged, not asked)

1. One user = one student; no data sharing between students in MVP.
2. Due dates are stored with time; UI defaults new tasks to 23:59 local time when only a date is picked.
3. "Subjects" are free-text labels owned implicitly by the user (no global subject catalog); suggestions come from the user's own past subjects.
4. Server time is UTC; the client renders in the browser's local timezone.
5. Email reminders are best-effort: SMTP failure must never break task flows; failures are logged and surfaced in monitoring.

## 10. Gate

Scope confirmed by the product owner via the Stage 1 clarifying questions on 2026-10-26. **Proceed to Stage 2.**
