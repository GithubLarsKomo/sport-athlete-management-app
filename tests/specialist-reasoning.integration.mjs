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
const athleteId = `reason-it-${randomUUID()}`;
const otherAthleteId = `reason-it-${randomUUID()}`;

test.after(async () => { await db.close(); });

function musicArtifact(label) {
  return {
    schema_version:1,
    athlete_id:athleteId,
    generated_at:new Date().toISOString(),
    source_refs:['integration'],
    uncertainties:[],
    safety_flags:[],
    profile_version:1,
    preferences:{ label },
    exclusions:[],
    session_goals:[],
    activation_target:{},
    timing:[],
    selection_rules:[],
    bpm_context:{ descriptive_only:true },
    safety_constraints:[],
    feedback_fields:[]
  };
}

test('reasoning run produces append-only versions with provenance and athlete isolation', async () => {
  await repository.ensureAthlete({ subject:athleteId, athleteId, email:null, displayName:'Reasoning Athlete' });
  await repository.ensureAthlete({ subject:otherAthleteId, athleteId:otherAthleteId, email:null, displayName:'Other Athlete' });

  const run = await repository.createReasoningRun(athleteId, 'music_profile_requested', ['training_music_profile'], 'service:skillz-producer');
  const provenance = {
    skill:'sport-training-music',
    artifact_type:'training_music_profile',
    contract_layer:'p2',
    contract_version:1,
    skillz_revision:'skillz-sha',
    runtime:'integration-runtime',
    model:'fixture-model',
    provider:'fixture'
  };

  const first = await repository.saveSpecialistArtifact(athleteId, 'training_music_profile', musicArtifact('first'), 'service:skillz-producer', { reasoningRunId:run.id, provenance });
  const second = await repository.saveSpecialistArtifact(athleteId, 'training_music_profile', musicArtifact('second'), 'service:skillz-producer', { reasoningRunId:run.id, provenance });
  assert.equal(first.artifact_version, 1);
  assert.equal(second.artifact_version, 2);

  await repository.completeReasoningRun(athleteId, run.id, 'completed', [{ artifact_type:'training_music_profile', artifact_version:2 }], null);
  const storedRun = await repository.getReasoningRun(athleteId, run.id);
  assert.equal(storedRun.status, 'completed');
  assert.equal(storedRun.trigger_type, 'music_profile_requested');
  assert.equal(storedRun.result[0].artifact_version, 2);

  const latest = await repository.getLatestSpecialistArtifact(athleteId, 'training_music_profile');
  assert.equal(latest.artifact_version, 2);
  assert.equal(latest.artifact.preferences.label, 'second');
  assert.equal(latest.reasoning_run_id, run.id);
  assert.equal(latest.provenance.skill, 'sport-training-music');
  assert.equal(latest.provenance.skillz_revision, 'skillz-sha');

  const history = await repository.getSpecialistArtifactHistory(athleteId, 'training_music_profile');
  assert.deepEqual(history.map(item => item.artifact_version), [2,1]);
  assert.equal(await repository.getLatestSpecialistArtifact(otherAthleteId, 'training_music_profile'), null);
  assert.equal(await repository.getReasoningRun(otherAthleteId, run.id), null);
});
