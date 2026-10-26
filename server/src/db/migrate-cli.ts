/** CLI: apply pending migrations (npm run migrate). Server boot also migrates automatically. */
import { loadConfig } from '../config.js';
import { openDb } from './connection.js';
import { runMigrations } from './migrate.js';

const config = loadConfig();
const db = openDb(config.dbPath);
try {
  const applied = runMigrations(db);
  console.log(
    applied.length > 0 ? `migrations applied: ${applied.join(', ')}` : 'migrations: up to date',
  );
} finally {
  db.close();
}
