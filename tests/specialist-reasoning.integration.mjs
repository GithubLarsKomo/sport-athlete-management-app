import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/persistence/db.mjs';
import { createRepository } from '../src/persistence/repository.mjs';
import { createP1Repository } from '../src/persistence/p1-repository.mjs';
import { produceSpecialistArtifacts } from '../src/domain/specialist-producer.mjs';

const config = loadConfig();
const db = createDatabase(config);
const repository = Object.assign(createRepository(db), createP1Repository(db));
const athleteId = `reason-it-${randomUUID()}`;
const otherAthleteId = `reason-it-${randomUUID()}`;

test.after(async () => { await db.close(); });

function musicArtifact(label) {
  return {
    schema_version:1,
    athlete_id:'runtime-foreign-athlete',
    generated_at:new Date().toISOString(),
    source_refs:['integration-runtime'],
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

async function withRuntime(fn) {
  let generation = 0;
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push(body);
    generation += 1;
    res.writeHead(200, { 'content-type':'application/json' });
    res.end(JSON.stringify({
      artifact:musicArtifact(generation === 1 ? 'first' : 'second'),
      provenance:{ skillz_revision:'runtime-skillz-sha', runtime:'integration-runtime', model:'fixture-model', provider:'fixture' }
    }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await fn(`http://127.0.0.1:${port}`, requests); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

const snapshot = {
  profile:{ athlete_id:athleteId, sport:'rowing', preferences:{ music:['preferred'] } },
  context:{ active_goal:{ description:'race' } },
  planned_session:{ id:'s1', objective:'power' },
  daily_checkin:{ fatigue_1_5:2 },
  latest_completed_session:null,
  specialist_artifacts:[]
};

test('producer generates v1 then v2 append-only with provenance and athlete isolation', async () => {
  await repository.ensureAthlete({ subject:athleteId, athleteId, email:null, displayName:'Reasoning Athlete' });
  await repository.ensureAthlete({ subject:otherAthleteId, athleteId:otherAthleteId, email:null, displayName:'Other Athlete' });

  await withRuntime(async (runtimeUrl, requests) => {
    const producerConfig = {
      ...config,
      skillz:{
        ...config.skillz,
        specialistUrl:runtimeUrl,
        specialistToken:'integration-token',
        specialistTimeoutMs:5000,
        specialistRevision:'configured-fallback-sha'
      }
    };

    const first = await produceSpecialistArtifacts({
      athleteId,
      trigger:'explicit_specialist_request',
      requestedTypes:['training_music_profile'],
      snapshot,
      config:producerConfig,
      repository
    });
    const second = await produceSpecialistArtifacts({
      athleteId,
      trigger:'explicit_specialist_request',
      requestedTypes:['training_music_profile'],
      snapshot,
      config:producerConfig,
      repository
    });

    assert.equal(first.status, 'completed');
    assert.equal(second.status, 'completed');
    assert.equal(first.artifacts[0].artifact_version, 1);
    assert.equal(second.artifacts[0].artifact_version, 2);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].athlete_id, athleteId);
    assert.equal(requests[0].artifact_type, 'training_music_profile');
    assert.deepEqual(Object.keys(requests[0].snapshot).sort(), ['planned_session','profile']);

    const latest = await repository.getLatestSpecialistArtifact(athleteId, 'training_music_profile');
    assert.equal(latest.artifact_version, 2);
    assert.equal(latest.artifact.preferences.label, 'second');
    assert.equal(latest.artifact.athlete_id, athleteId);
    assert.equal(latest.reasoning_run_id, second.run_id);
    assert.equal(latest.provenance.skill, 'sport-training-music');
    assert.equal(latest.provenance.skillz_revision, 'runtime-skillz-sha');
    assert.equal(latest.provenance.model, 'fixture-model');

    const history = await repository.getSpecialistArtifactHistory(athleteId, 'training_music_profile');
    assert.deepEqual(history.map(item => item.artifact_version), [2,1]);

    const firstRun = await repository.getReasoningRun(athleteId, first.run_id);
    const secondRun = await repository.getReasoningRun(athleteId, second.run_id);
    assert.equal(firstRun.status, 'completed');
    assert.equal(secondRun.status, 'completed');
    assert.equal(firstRun.result[0].artifact_version, 1);
    assert.equal(secondRun.result[0].artifact_version, 2);

    assert.equal(await repository.getLatestSpecialistArtifact(otherAthleteId, 'training_music_profile'), null);
    assert.equal(await repository.getReasoningRun(otherAthleteId, first.run_id), null);
  });
});
