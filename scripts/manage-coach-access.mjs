import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/persistence/db.mjs';
import { createRepository } from '../src/persistence/repository.mjs';

function usage() {
  console.error('Usage: node scripts/manage-coach-access.mjs <grant|revoke> <coach-subject> <athlete-id> [display-name]');
  process.exit(2);
}

const [action, coachSubject, athleteId, ...nameParts] = process.argv.slice(2);
if (!['grant','revoke'].includes(action) || !coachSubject || !athleteId) usage();

const config = loadConfig();
const db = createDatabase(config);
const repository = createRepository(db);

try {
  if (action === 'grant') {
    await repository.ensureCoachPrincipal({
      subject: coachSubject,
      email: null,
      displayName: nameParts.join(' ').trim() || coachSubject
    }, 'operator:cli');
  }
  const assignment = await repository.setCoachAthleteAssignment({
    coachSubject,
    athleteId,
    active: action === 'grant',
    actor: 'operator:cli'
  });
  console.log(JSON.stringify({ ok: true, action, assignment }));
} finally {
  await db.close();
}
