import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/persistence/db.mjs';
import { createRepository } from '../src/persistence/repository.mjs';
import { createP1Repository } from '../src/persistence/p1-repository.mjs';

const config = loadConfig();
const db = createDatabase(config);
const repository = Object.assign(createRepository(db), createP1Repository(db));
const athleteId = `p1-it-${randomUUID()}`;
const otherAthleteId = `p1-it-${randomUUID()}`;

test.after(async () => { await db.close(); });

function recoveryArtifact(trendLabel) {
  return {
    schema_version: 1,
    athlete_id: athleteId,
    generated_at: new Date().toISOString(),
    source_refs: ['integration'],
    uncertainties: [],
    safety_flags: [],
    window_start: '2026-08-18',
    window_end: '2026-08-22',
    baseline: { sleep: 'individual' },
    current_signals: { fatigue: 2 },
    trend: { direction: trendLabel },
    interventions: [],
    next_re_evaluation: new Date(Date.now() + 86400000).toISOString(),
    confidence: 0.8
  };
}

test('P1 specialist artifacts are append-only, versioned and athlete-scoped', async () => {
  await repository.ensureAthlete({ subject: athleteId, athleteId, email: null, displayName: 'P1 Athlete' });
  await repository.ensureAthlete({ subject: otherAthleteId, athleteId: otherAthleteId, email: null, displayName: 'Other Athlete' });

  const first = await repository.saveSpecialistArtifact(athleteId, 'recovery_state', recoveryArtifact('stable'), 'service:skillz');
  const second = await repository.saveSpecialistArtifact(athleteId, 'recovery_state', recoveryArtifact('improving'), 'service:skillz');
  assert.equal(first.artifact_version, 1);
  assert.equal(second.artifact_version, 2);

  const latest = await repository.getLatestSpecialistArtifact(athleteId, 'recovery_state');
  assert.equal(latest.artifact_version, 2);
  assert.equal(latest.artifact.trend.direction, 'improving');

  const history = await repository.getSpecialistArtifactHistory(athleteId, 'recovery_state');
  assert.deepEqual(history.map(item => item.artifact_version), [2, 1]);

  const allLatest = await repository.getLatestSpecialistArtifacts(athleteId);
  assert.equal(allLatest.length, 1);
  assert.equal(allLatest[0].artifact_type, 'recovery_state');

  assert.equal(await repository.getLatestSpecialistArtifact(otherAthleteId, 'recovery_state'), null);
});
