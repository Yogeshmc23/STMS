# STMS — Student Task Manager

A focused, responsive web app for students to capture coursework, prioritize it, and stay ahead of deadlines. Built end-to-end (plan → code → tests → security → docs) against [`PRD.md`](./PRD.md); progress and verification history in [`PROGRESS_LOG.md`](./PROGRESS_LOG.md).

## MVP features (all shipped + verified)

1. **Auth** — register/login/logout, bcrypt sessions, rate limiting, profile page
2. **Tasks** — CRUD + complete/reopen, notes, subject, type, due date/time
3. **Priorities** — High / Medium / Low with smart ordering
4. **Deadline tracking** — overdue / today / this week / later buckets everywhere it matters
5. **Dashboard** — progress summary, due-soon queue, per-subject workload, recent activity
6. **Calendar** — month / week / day views with unscheduled backlog, per-day lists
7. **Notifications** — reminder engine (due soon / imminent), in-app bell + optional email, dedup + failure isolation
8. **Progress analytics** — completion trend (14/30 d, sparkline), priority/subject distributions, due-in-7 summary
9. **Search & filters** — instant text search + subject/priority/status/type + due-window chips, URL-shareable state
10. **Responsive UI** — 360 px → desktop, light/dark, skeleton states, keyboard/ARIA basics

## Stack

npm workspaces monorepo: **shared** (zod contracts) · **server** (Express 4, better-sqlite3 WAL, pino, nodemailer, hand-rolled forward-only migrations) · **client** (React 18 + Vite + TanStack Query + React Router). Production = one process: Express serves API + built SPA.

## Quick start

```bash
npm install
npm run seed            # optional demo data (refuses production)
npm run dev             # server :3001 + client :5173 (proxied)
```

Seeded login: `demo@stms.dev` / `Demo1234!`

Quality gates: `npm run typecheck` · `npm run lint` · `npm test` (91 server + 34 client) · `npm run build`

## Docs map

| File                                                                                     | Contents                                                     |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [PRD.md](./PRD.md) / [DESIGN.md](./DESIGN.md)                                            | product & UI specs (source: Master Prompt)                   |
| [ARCHITECTURE.md](./ARCHITECTURE.md) / [DATABASE.md](./DATABASE.md) / [API.md](./API.md) | system, schema (ERD), endpoint contract                      |
| [AGENTS.md](./AGENTS.md) / [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)            | repo rules, phases & gates                                   |
| [TESTING.md](./TESTING.md) / [SECURITY.md](./SECURITY.md)                                | coverage matrix & honest gaps; audit findings                |
| [DEPLOYMENT.md](./DEPLOYMENT.md) / [MONITORING.md](./MONITORING.md)                      | verified prod build, free-tier targets; logging & watch list |
