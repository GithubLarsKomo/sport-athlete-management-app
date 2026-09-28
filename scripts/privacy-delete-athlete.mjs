import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/persistence/db.mjs';
import { createDataExportRepository } from '../src/persistence/data-export-repository.mjs';
import { buildAthleteDataExport } from '../src/domain/data-export.mjs';

function argument(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : '';
}

const athleteId = argument('athlete').trim();
const confirm = argument('confirm').trim();
const execute = process.argv.includes('--execute');

if (!athleteId) {
  console.error('Usage: npm run privacy:delete -- --athlete=<athlete-id> [--execute --confirm=<athlete-id>]');
  process.exit(2);
}

const config = loadConfig();
const db = createDatabase(config);
const repository = createDataExportRepository(db);

try {
  const source = await repository.getAthleteDataExportSource(athleteId);
  if (!source.account) {
    console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', athlete_id: athleteId, exists: false }, null, 2));
    process.exitCode = 3;
  } else {
    const preview = buildAthleteDataExport({
      athleteId,
      exportId: `dry-run-${randomUUID()}`,
      source
    });

    if (!execute) {
      console.log(JSON.stringify({
        mode: 'dry-run',
        athlete_id: athleteId,
        exists: true,
        record_counts: preview.manifest.record_counts,
        provider_raw_files_in_self_export: false,
        retained_security_audit_after_delete: true,
        next: `PRIVACY_DELETE_ENABLED=true PRIVACY_OPERATOR_SUBJECT=<operator> npm run privacy:delete -- --athlete=${athleteId} --execute --confirm=${athleteId}`
      }, null, 2));
    } else {
      if (process.env.PRIVACY_DELETE_ENABLED !== 'true') {
        throw new Error('destructive deletion disabled: set PRIVACY_DELETE_ENABLED=true for the bounded maintenance action');
      }
      if (confirm !== athleteId) {
        throw new Error('confirmation mismatch: --confirm must exactly equal --athlete');
      }
      const actor = String(process.env.PRIVACY_OPERATOR_SUBJECT || '').trim();
      if (!actor) throw new Error('PRIVACY_OPERATOR_SUBJECT is required for destructive deletion');

      const result = await repository.deleteAthleteData(athleteId, actor);
      const after = await repository.getAthleteDataExportSource(athleteId);
      if (after.account) throw new Error('deletion verification failed: athlete account remains');

      console.log(JSON.stringify({
        mode: 'execute',
        athlete_id: athleteId,
        actor_subject: actor,
        ...result,
        verified_primary_account_absent: true
      }, null, 2));
    }
  }
} finally {
  await db.close();
}
