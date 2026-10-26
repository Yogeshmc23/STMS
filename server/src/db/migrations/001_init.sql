-- 001_init.sql — STMS initial schema (DATABASE.md §1–§3).
-- Conventions: UTC ISO-8601 TEXT timestamps, INTEGER 0/1 booleans, INTEGER PKs.

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  email TEXT NOT NULL UNIQUE CHECK (length(email) <= 254),
  password_hash TEXT NOT NULL,
  email_reminders_enabled INTEGER NOT NULL DEFAULT 1 CHECK (email_reminders_enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 100),
  type TEXT NOT NULL CHECK (type IN ('assignment', 'project', 'exam', 'study', 'other')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  due_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('deadline_soon_24h', 'deadline_soon_1h', 'overdue', 'welcome')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL,
  -- Dedup guarantee for reminders (DATABASE.md §1): INSERT OR IGNORE relies on this.
  -- Note: SQLite treats NULLs as distinct, so 'welcome' (task_id NULL) is app-inserted once.
  UNIQUE (user_id, kind, task_id)
);

CREATE TABLE email_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id INTEGER NOT NULL UNIQUE REFERENCES notifications(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sent', 'skipped_no_smtp', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

-- Indexes for the actual query patterns (DATABASE.md §3)
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_tasks_user_due ON tasks(user_id, due_at);
CREATE INDEX idx_tasks_user_status_due ON tasks(user_id, status, due_at);
CREATE INDEX idx_tasks_user_priority ON tasks(user_id, priority);
CREATE INDEX idx_tasks_user_subject ON tasks(user_id, subject);
CREATE INDEX idx_tasks_user_updated ON tasks(user_id, updated_at DESC);
CREATE INDEX idx_notifs_user_unread ON notifications(user_id, read_at);
CREATE INDEX idx_notifs_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_emailq_state ON email_queue(state, created_at);
