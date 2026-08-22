import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/persistence/db.mjs';

const config = loadConfig();
const db = createDatabase(config);
try {
  const sql = await readFile(resolve(process.cwd(), 'migrations/001_initial.sql'), 'utf8');
  const statements = sql.split(/;\s*(?:\r?\n|$)/).map(s => s.trim()).filter(Boolean);
  for (const statement of statements) await db.query(statement);
  console.log(`Applied ${statements.length} migration statements.`);
} finally {
  await db.close();
}
