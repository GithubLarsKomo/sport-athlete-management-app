import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/persistence/db.mjs';

const config = loadConfig();
const db = createDatabase(config);

function sha256(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

function statements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(value => value.trim())
    .filter(Boolean);
}

try {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_name VARCHAR(191) PRIMARY KEY,
    sha256 CHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  const dir = resolve(process.cwd(), 'migrations', 'postgresql');
  const files = (await readdir(dir)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  let applied = 0;

  for (const file of files) {
    const sql = await readFile(resolve(dir, file), 'utf8');
    const digest = sha256(sql);
    const wasApplied = await db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext('sport-athlete-management-app:migrations'))");
      const rows = await tx.query('SELECT sha256 FROM schema_migrations WHERE migration_name=?', [file]);
      if (rows[0]) {
        if (rows[0].sha256 !== digest) throw new Error(`Migration drift detected for ${file}`);
        return false;
      }
      for (const statement of statements(sql)) await tx.query(statement);
      await tx.query('INSERT INTO schema_migrations (migration_name, sha256) VALUES (?, ?)', [file, digest]);
      return true;
    });
    if (wasApplied) {
      applied += 1;
      console.log(`Applied ${file}`);
    }
  }

  console.log(`PostgreSQL migrations complete: ${applied} newly applied, ${files.length} known.`);
} finally {
  await db.close();
}
