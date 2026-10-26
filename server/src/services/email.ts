/**
 * Email queue sender (ARCHITECTURE.md §6). Two modes, no faking:
 *  - SMTP configured → nodemailer send; failures retry up to REMINDER.maxEmailAttempts,
 *    then state 'failed' with last_error (surfaced in monitoring, never crashes the app).
 *  - SMTP NOT configured → queue rows are written as .eml files to the dev OUTBOX
 *    directory and marked 'skipped_no_smtp'. Files are clearly labeled as dev-only.
 */
import fs from 'node:fs';
import path from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { REMINDER } from '@stms/shared';
import type { Db } from '../db/connection.js';
import type { AppConfig } from '../config.js';
import type { Logger } from '../util/logger.js';
import { toIso } from '../util/time.js';

interface QueueRow {
  id: number;
  to_email: string;
  subject: string;
  body_text: string;
  attempts: number;
}

let cachedTransport: { key: string; transport: Transporter } | undefined;

function getTransport(config: AppConfig): Transporter | undefined {
  if (!config.smtp) return undefined;
  const key = `${config.smtp.host}:${config.smtp.port}:${config.smtp.user}`;
  if (cachedTransport?.key !== key) {
    cachedTransport = {
      key,
      transport: nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465, // 465 = implicit TLS, 587 = STARTTLS upgrade
        auth: { user: config.smtp.user, pass: config.smtp.pass },
      }),
    };
  }
  return cachedTransport.transport;
}

function writeOutbox(dir: string, row: QueueRow): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${row.id}.eml`);
  fs.writeFileSync(
    file,
    [
      'X-STMS-Dev-Outbox: SMTP is not configured; this email was NOT sent.',
      `To: ${row.to_email}`,
      `Subject: ${row.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      row.body_text,
      '',
    ].join('\r\n'),
  );
  return file;
}

/**
 * Drain up to `limit` pending queue rows. Returns counts by outcome.
 * Called by the scheduler tick and by the dev-only scan endpoint.
 */
export async function drainEmailQueue(
  db: Db,
  config: AppConfig,
  logger: Logger,
  limit = 20,
): Promise<{ sent: number; skipped: number; failed: number; pending: number }> {
  const transport = getTransport(config);
  const rows = db
    .prepare(
      `SELECT id, to_email, subject, body_text, attempts
       FROM email_queue WHERE state = 'pending' ORDER BY created_at ASC LIMIT ?`,
    )
    .all(limit) as QueueRow[];

  const out = { sent: 0, skipped: 0, failed: 0, pending: 0 };
  for (const row of rows) {
    if (!transport) {
      writeOutbox(config.outboxDir, row);
      db.prepare("UPDATE email_queue SET state = 'skipped_no_smtp', sent_at = ? WHERE id = ?").run(
        toIso(Date.now()),
        row.id,
      );
      out.skipped++;
      continue;
    }
    try {
      await transport.sendMail({
        from: config.smtp!.from,
        to: row.to_email,
        subject: row.subject,
        text: row.body_text,
      });
      db.prepare(
        "UPDATE email_queue SET state = 'sent', sent_at = ?, last_error = NULL WHERE id = ?",
      ).run(toIso(Date.now()), row.id);
      out.sent++;
    } catch (err) {
      const attempts = row.attempts + 1;
      const message = err instanceof Error ? err.message : String(err);
      if (attempts >= REMINDER.maxEmailAttempts) {
        db.prepare(
          "UPDATE email_queue SET state = 'failed', attempts = ?, last_error = ? WHERE id = ?",
        ).run(attempts, message.slice(0, 500), row.id);
        out.failed++;
        logger.error({ queueId: row.id, attempts }, `email permanently failed: ${message}`);
      } else {
        db.prepare('UPDATE email_queue SET attempts = ?, last_error = ? WHERE id = ?').run(
          attempts,
          message.slice(0, 500),
          row.id,
        );
        out.pending++; // stays 'pending' for retry next tick
      }
    }
  }
  return out;
}
