# DESIGN.md — Student Task Manager

**Stage 2 deliverable.** Visual direction and component system for a clean, low-friction productivity tool. Implemented as hand-rolled CSS (custom properties + utility classes) — no UI framework dependency, full control, fast at student scale.

---

## 1. Design Principles

1. **Calm surface, loud signals.** Neutral backgrounds; color reserved for meaning (priority, overdue, success).
2. **10-second orientation.** The dashboard answers "what needs me first?" without scrolling on desktop.
3. **One primary action per screen.** "New task" is always visible and always the same color.
4. **Forgiving UI.** Destructive actions confirm; empty states teach; errors explain how to fix.
5. **Accessible by default.** AA contrast, visible focus, keyboard-complete flows, reduced-motion respected.

## 2. Color System (CSS custom properties, light + dark)

### Brand & semantic (light theme)

| Token           | Value                      | Use                                 |
| --------------- | -------------------------- | ----------------------------------- |
| `--brand`       | `#4f46e5` (indigo-600)     | Primary actions, active nav, links  |
| `--brand-hover` | `#4338ca`                  | Hover on primary                    |
| `--brand-soft`  | `#eef2ff`                  | Selected/active surfaces, badges bg |
| `--bg`          | `#f8fafc`                  | App background                      |
| `--surface`     | `#ffffff`                  | Cards, panels                       |
| `--surface-2`   | `#f1f5f9`                  | Subtle fills, table head, chips     |
| `--border`      | `#e2e8f0`                  | Card/panel borders                  |
| `--text`        | `#0f172a`                  | Primary text                        |
| `--text-muted`  | `#64748b`                  | Secondary text                      |
| `--danger`      | `#dc2626` / soft `#fef2f2` | Overdue, delete, errors             |
| `--warning`     | `#d97706` / soft `#fffbeb` | Due soon / due today                |
| `--success`     | `#16a34a` / soft `#f0fdf4` | Completed, success toasts           |

### Priority colors (consistent everywhere)

| Priority | Dot/Badge                       | Text on soft bg |
| -------- | ------------------------------- | --------------- |
| High     | `#dc2626` red, soft `#fef2f2`   | `#b91c1c`       |
| Medium   | `#d97706` amber, soft `#fffbeb` | `#b45309`       |
| Low      | `#0891b2` cyan, soft `#ecfeff`  | `#0e7490`       |

### Task type accents (icon chips)

assignment 📝 indigo · project 📁 violet `#7c3aed` · exam 🎯 red · study 📚 green `#16a34a` · other ⚪ slate

### Dark theme

Same tokens re-valued on `data-theme="dark"`: `--bg #0b1220`, `--surface #111a2e`, `--surface-2 #1a2540`, `--border #263352`, `--text #e2e8f0`, `--text-muted #94a3b8`, brand lightened to `#6366f1`. Theme toggle persisted in `localStorage`; defaults to `prefers-color-scheme`.

## 3. Typography

System font stack (zero network dependency, fast):
`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
Mono for stats/dates where tabular alignment matters: `ui-monospace, "SF Mono", Menlo, Consolas, monospace` + `font-variant-numeric: tabular-nums`.

| Level   | Size/Weight   | Use                       |
| ------- | ------------- | ------------------------- |
| Display | 28px/700      | Page titles ("Dashboard") |
| H2      | 20px/600      | Card/widget titles        |
| H3      | 16px/600      | Section labels            |
| Body    | 14.5px/400    | Default text              |
| Small   | 12.5px/500    | Meta, badges, timestamps  |
| Stat    | 26px/700 mono | Dashboard numbers         |

Line-height 1.5 body / 1.2 headings. Max text measure ~72ch for descriptions.

## 4. Spacing, Layout, Elevation

- **Spacing scale:** 4px base → `4 / 8 / 12 / 16 / 24 / 32 / 48`.
- **Radius:** cards/panels `12px`, buttons/inputs `8px`, badges/pills `999px`, modals `16px`.
- **Shadows:** card `0 1px 2px rgb(15 23 42 / .06)`; raised (dropdown/modal) `0 12px 32px rgb(15 23 42 / .16)`.
- **App shell:** desktop = fixed 240px sidebar + content (max-width 1200px, 24px gutter). Dashboard grid: `repeat(auto-fit, minmax(240px, 1fr))` for stat cards; main column + 320px "up next" side column ≥1024px.
- **Z-index layers:** nav 10, dropdowns 20, sticky header 30, modal 50, toast 60.

## 5. Navigation

Desktop sidebar (mobile: bottom tab bar, tablet: compact sidebar→icons only at <1100px):

1. **Dashboard** (home icon) — `/`
2. **Tasks** — `/tasks`
3. **Calendar** — `/calendar`
4. **Analytics** — `/analytics`
5. **Notifications** bell in header (badge = unread count, opens panel) + `/notifications` page
6. Footer of sidebar: user chip (initial avatar + name) → **Profile** `/profile` · theme toggle · **Log out**

Auth screens (`/login`, `/register`) render centered cards without the app shell. Protected routes redirect unauthenticated users to `/login?next=…`.

## 6. Core Components (reusable inventory)

| Component                      | Spec                                                                                                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TaskCard**                   | Row/card: type icon chip, title, subject chip, due date (relative + absolute, red if overdue), priority badge, status control (circle checkbox → complete; menu → reopen), edit/delete in overflow menu. Whole card clickable → edit drawer.          |
| **PriorityBadge**              | Pill: dot + label (High/Medium/Low), soft-bg colors above.                                                                                                                                                                                            |
| **StatusChip**                 | pending (outline slate) · in progress (indigo soft) · completed (green soft, strikethrough title in lists).                                                                                                                                           |
| **DueBadge**                   | "Overdue · 2d" danger / "Today 17:00" warning / "Tomorrow" / "Mon, 12 May" neutral / "No due date" muted.                                                                                                                                             |
| **TaskForm (modal/drawer)**    | Fields: title*, subject (datalist of user's past subjects), type (segmented control), priority (3 radio pills), status select, due datetime-local, description textarea. Client+server validation; inline field errors; submit disabled while saving. |
| **FilterBar**                  | Search input (debounced 250ms), subject multi-select, priority chips (toggle), status chips, due-bucket chips (Overdue, Today, 7 days, No date), sort select, "Clear all". State synced to URL query.                                                 |
| **DashboardStat**              | Label, big stat number, sub-delta ("+3 this week"), tone color.                                                                                                                                                                                       |
| **CalendarMonth**              | 7-col grid, day cells with ≤3 task chips + "+n more", priority-colored dots, today ring, adjacent-month days muted, click → day view.                                                                                                                 |
| **CalendarWeek / CalendarDay** | Columns per day with stacked TaskCards (compact); day view adds "Unscheduled tasks" section.                                                                                                                                                          |
| **NotificationPanel**          | Dropdown/page list: icon by kind, title, body, relative time, unread dot; "Mark all read"; click → navigate to task and mark read.                                                                                                                    |
| **Modal / ConfirmDialog**      | Focus-trapped, Esc to close, backdrop click closes (confirm dialogs require explicit choice).                                                                                                                                                         |
| **Toast**                      | Bottom-right stack, success/danger/info tones, auto-dismiss 4s, aria-live polite.                                                                                                                                                                     |
| **EmptyState**                 | Illustration (inline SVG), one-line explanation, primary CTA. Distinct copy per screen (no tasks / no results for filters / no notifications / no data for range).                                                                                    |
| **Skeleton**                   | Shimmering placeholder cards/rows for dashboard, list, calendar while loading.                                                                                                                                                                        |
| **ErrorState**                 | Inline panel with message + Retry button; global fallback page for route errors.                                                                                                                                                                      |

## 7. States (every screen must handle)

- **Loading:** skeletons shaped like real content (no spinners-on-white).
- **Empty:** dedicated EmptyState with CTA ("Create your first task").
- **Error:** API failures show toast + inline retry; forms keep user input on failure.
- **Success:** toast confirmation + optimistic UI update (complete/uncomplete toggles instantly, rolls back on failure).
- **Unauthorized (401):** redirect to login preserving `next`; session-expiry toast "You were signed out".

## 8. Responsive Behavior

| Breakpoint | Shell                                                                | Key adaptations                                                                                                             |
| ---------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| ≥ 1024px   | Sidebar + content, 2-col dashboard                                   | Full FilterBar inline                                                                                                       |
| 640–1023px | Icon sidebar or top bar                                              | Dashboard single column; calendar week view scrollable; FilterBar collapses into "Filters" sheet                            |
| < 640px    | Header + bottom nav (Dashboard, Tasks, Calendar, Analytics, Profile) | TaskForm is a full-screen sheet; month calendar shows dots only; touch targets ≥ 44px; FAB for "New task" on Tasks/Calendar |

No horizontal scrolling at 360px. Tables never used — card lists instead.

## 9. Accessibility (WCAG 2.1 AA target)

- Contrast: all text ≥ 4.5:1 (muted `#64748b` on white = 4.76:1 ✓); priority conveyed by **dot + label**, never color alone.
- Keyboard: full tab order; `Esc` closes overlays; focus trap in modal/drawer; focus restored on close; visible 2px focus ring (`--brand`, offset 2px).
- ARIA: nav landmarks, `aria-current` on active route, `aria-live` toasts, dialog roles, checkbox semantics for task completion, labels on every input.
- Motion: transitions 120–200ms ease; `prefers-reduced-motion: reduce` disables all non-essential animation.
- Forms: errors linked via `aria-describedby`, announced on submit.

## 10. Content & Microcopy Tone

Direct, encouraging, student-friendly. "You're all caught up 🎉" not "No records found." Dates humanized ("Today 17:00", "Tomorrow", "in 3 days", "2 days overdue"). Never blame the user in errors ("We couldn't save that — check your connection and retry").

## 11. Iconography

Inline SVG sprite (hand-written, 20px grid, `currentColor` stroke) — dashboard, list, calendar, chart, bell, plus, search, filter, chevrons, check, trash, pencil, logout, sun/moon, task-type icons. No icon-library dependency.
