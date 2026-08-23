import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/persistence/db.mjs';

const config = loadConfig();
const db = createDatabase(config);

const entities = [
  ['athletes', ['id']],
  ['athlete_profiles', ['athlete_id', 'profile_version']],
  ['goals', ['id']],
  ['competitions', ['id']],
  ['seasons', ['id']],
  ['mesocycles', ['id']],
  ['microcycles', ['id']],
  ['planned_sessions', ['id']],
  ['daily_checkins', ['id']],
  ['completed_sessions', ['id']],
  ['adaptation_decisions', ['id']],
  ['training_plan_revisions', ['id']],
  ['audit_log', ['id']],
  ['specialist_artifacts', ['id']]
];

function digestRows(rows, columns) {
  const hash = createHash('sha256');
  for (const row of rows) hash.update(`${JSON.stringify(columns.map(column => String(row[column])))}\n`);
  return hash.digest('hex');
}

async function reportEntity(table, keyColumns) {
  const columns = keyColumns.join(', ');
  const order = keyColumns.join(', ');
  const rows = await db.query(`SELECT ${columns} FROM ${table} ORDER BY ${order}`);
  return {
    count: rows.length,
    primary_key_sha256: digestRows(rows, keyColumns)
  };
}

try {
  const report = {
    provider: 'postgresql',
    generated_at: new Date().toISOString(),
    entities: {}
  };

  for (const [table, keyColumns] of entities) {
    report.entities[table] = await reportEntity(table, keyColumns);
  }

  const baselinePath = process.env.RECONCILIATION_BASELINE || '';
  if (baselinePath) {
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    const mismatches = [];
    for (const [table] of entities) {
      const expected = baseline.entities?.[table];
      const actual = report.entities[table];
      if (!expected) {
        mismatches.push(`${table}: missing from baseline`);
        continue;
      }
      if (Number(expected.count) !== actual.count) mismatches.push(`${table}: count expected ${expected.count}, got ${actual.count}`);
      if (expected.primary_key_sha256 && expected.primary_key_sha256 !== actual.primary_key_sha256) mismatches.push(`${table}: primary-key digest mismatch`);
    }
    report.baseline = baselinePath;
    report.mismatches = mismatches;
    if (mismatches.length) process.exitCode = 1;
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.close();
}
