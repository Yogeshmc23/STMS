/**
 * Development seed (DATABASE.md §7) — TEMPORARY SCAFFOLDING, not shipped data.
 * Creates demo student + realistic tasks spanning subjects/priorities/statuses
 * and due dates (-10d…+30d, incl. overdue/today/week/later/unscheduled) so the
 * dashboard, calendar, notifications and analytics all have something real to
 * aggregate. Idempotent: skips when the demo user exists. Refuses production.
 * Run: npm run seed  (prints the demo password once)
 */
import { hashSync } from 'bcryptjs';
import { loadConfig } from '../config.js';
import { openDb } from './connection.js';
import { runMigrations } from './migrate.js';

const DEMO_EMAIL = 'demo@stms.dev';
const DEMO_PASSWORD = 'Demo1234!';
const DAY = 86_400_000;

const config = loadConfig();
if (config.isProduction) {
  console.error('refusing to seed in production (DATABASE.md §7)');
  process.exit(1);
}

const db = openDb(config.dbPath);
try {
  runMigrations(db);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_EMAIL) as
    { id: number } | undefined;
  if (existing) {
    console.log(`seed: ${DEMO_EMAIL} already exists — nothing to do`);
    process.exit(0);
  }

  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const atLocal = (dayOffset: number, hourUtc: number) => {
    const d = new Date(now + dayOffset * DAY);
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d.toISOString();
  };

  const tx = db.transaction(() => {
    const created = iso(now - 20 * DAY);
    const info = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, email_reminders_enabled, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .run('Demo Student', DEMO_EMAIL, hashSync(DEMO_PASSWORD, 12), created, created);
    const uid = Number(info.lastInsertRowid);

    db.prepare(
      `INSERT INTO notifications (user_id, task_id, kind, title, body, created_at)
       VALUES (?, NULL, 'welcome', ?, ?, ?)`,
    ).run(
      uid,
      'Welcome to the Student Task Manager 🎓',
      'Create your first task with a subject, priority and due date — reminders will show up here before deadlines.',
      created,
    );

    const ins = db.prepare(
      `INSERT INTO tasks (user_id, title, description, subject, type, priority, status, due_at, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    type Row = [
      title: string,
      desc: string,
      subject: string,
      type: string,
      priority: string,
      status: string,
      due: string | null,
      completedAgo?: number,
    ];
    const rows: Row[] = [
      // overdue pile (the seed deliberately shows the danger state)
      [
        'Problem Set 7 — Integrals',
        'Sections 8.2–8.4, show all work',
        'Mathematics',
        'assignment',
        'high',
        'pending',
        atLocal(-3, 18),
        undefined,
      ],
      [
        'Lab 4 report: Optics',
        'Write discussion + error analysis',
        'Physics',
        'assignment',
        'medium',
        'in_progress',
        atLocal(-1, 12),
        undefined,
      ],
      [
        'Read "The Republic" books I–IV',
        'Notes for seminar',
        'History',
        'study',
        'low',
        'pending',
        atLocal(-2, 20),
        undefined,
      ],
      // due today
      [
        'Quiz 3 revision block',
        'Past papers + formula sheet',
        'Mathematics',
        'study',
        'high',
        'pending',
        atLocal(0, 22),
        undefined,
      ],
      [
        'Submit AST parser stubs',
        'Repo README explains fixtures',
        'Data Structures',
        'project',
        'high',
        'in_progress',
        atLocal(0, 16),
        undefined,
      ],
      // next 7 days
      [
        'Essay: causes of WWI',
        '1500 words, Chicago style',
        'History',
        'assignment',
        'medium',
        'pending',
        atLocal(2, 18),
        undefined,
      ],
      [
        'Hash tables deep-dive',
        'Chaining vs open addressing',
        'Data Structures',
        'study',
        'medium',
        'pending',
        atLocal(3, 17),
        undefined,
      ],
      [
        'Midterm exam',
        'Covers units 1–4, closed book',
        'Mathematics',
        'exam',
        'high',
        'pending',
        atLocal(5, 9),
        undefined,
      ],
      [
        'Lab prep: circuits sim',
        'Run sim before class, bring plots',
        'Physics',
        'study',
        'low',
        'pending',
        atLocal(6, 8),
        undefined,
      ],
      [
        'Poetry response draft',
        'Choose 2 poems, close reading',
        'English',
        'assignment',
        'medium',
        'pending',
        atLocal(4, 23),
        undefined,
      ],
      // later
      [
        'Final project: proposal',
        '1 page abstract + milestones',
        'Data Structures',
        'project',
        'high',
        'pending',
        atLocal(14, 23),
        undefined,
      ],
      [
        'Thermodynamics chapter review',
        'Problems 12–20',
        'Physics',
        'study',
        'medium',
        'pending',
        atLocal(18, 17),
        undefined,
      ],
      [
        'Final exam — Mechanics',
        'Cumulative, 3 hours',
        'Physics',
        'exam',
        'high',
        'pending',
        atLocal(27, 14),
        undefined,
      ],
      [
        'Presentation: graph algos',
        '10 min + Q&A, slides to TA',
        'Data Structures',
        'project',
        'medium',
        'pending',
        atLocal(21, 10),
        undefined,
      ],
      [
        'Book report: open theme',
        'Any novel >200 pages',
        'English',
        'assignment',
        'low',
        'pending',
        atLocal(25, 20),
        undefined,
      ],
      // unscheduled
      [
        'Build spaced-repetition deck',
        'All courses, ~30 cards/week',
        'History',
        'study',
        'low',
        'pending',
        null,
        undefined,
      ],
      [
        'Office hours question list',
        'Bring week 6 exercises',
        'Mathematics',
        'study',
        'low',
        'pending',
        null,
        undefined,
      ],
      // completed history (drives analytics)
      [
        'Problem Set 6 — Series',
        'Submitted, 94%',
        'Mathematics',
        'assignment',
        'high',
        'completed',
        atLocal(-8, 18),
        8 * DAY,
      ],
      [
        'Lab 3 report: Waves',
        'Graded A-',
        'Physics',
        'assignment',
        'medium',
        'completed',
        atLocal(-9, 12),
        9 * DAY,
      ],
      ['Quiz 2', '86/100', 'Mathematics', 'exam', 'high', 'completed', atLocal(-10, 9), 10 * DAY],
      [
        'Essay: Athenian democracy',
        'Feedback: cite more sources',
        'History',
        'assignment',
        'medium',
        'completed',
        atLocal(-12, 18),
        12 * DAY,
      ],
      [
        'Hashing readings',
        'Done ahead of schedule',
        'Data Structures',
        'study',
        'low',
        'completed',
        atLocal(-6, 17),
        6 * DAY,
      ],
      [
        'Reading log week 5',
        'Logged 4 entries',
        'English',
        'study',
        'low',
        'completed',
        atLocal(-5, 21),
        5 * DAY,
      ],
      [
        'Problem Set 5 — Limits',
        'Submitted late (−5%)',
        'Mathematics',
        'assignment',
        'medium',
        'completed',
        atLocal(-14, 18),
        14 * DAY,
      ],
      [
        'Midterm revision plan',
        'Checked off all topics',
        'Mathematics',
        'study',
        'medium',
        'completed',
        atLocal(-15, 16),
        15 * DAY,
      ],
      [
        'Vocab sprint unit 3',
        '38/40 on self-test',
        'English',
        'study',
        'low',
        'completed',
        atLocal(-4, 19),
        4 * DAY,
      ],
      [
        'Library queue: return textbook',
        'Not an assignment, but due',
        'History',
        'other',
        'medium',
        'pending',
        atLocal(1, 12),
        undefined,
      ],
      [
        'Schedule tutor session',
        'Focus: integration by parts',
        'Mathematics',
        'other',
        'medium',
        'pending',
        null,
        undefined,
      ],
    ];

    for (const [title, desc, subject, type, priority, status, due] of rows) {
      const createdAt = status === 'completed' ? iso(now - 20 * DAY) : created;
      const completedAt =
        status === 'completed' ? iso(now - (rows.find((r) => r[0] === title)?.[7] ?? DAY)) : null;
      ins.run(
        uid,
        title,
        desc,
        subject,
        type,
        priority,
        status,
        due,
        completedAt,
        createdAt,
        createdAt,
      );
    }
    void now;
    void iso;
  });
  tx();

  const n = (db.prepare('SELECT COUNT(*) AS c FROM tasks').get() as { c: number }).c;
  console.log(`seed: created ${DEMO_EMAIL} (password: ${DEMO_PASSWORD}) with ${n} tasks`);
} finally {
  db.close();
}
