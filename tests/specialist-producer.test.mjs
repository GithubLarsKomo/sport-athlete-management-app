import test from 'node:test';
import assert from 'node:assert/strict';
import { produceSpecialistArtifacts, snapshotForSpecialist } from '../src/domain/specialist-producer.mjs';

function repository() {
  const state = { runs: [], completed: [], saved: [] };
  return {
    state,
    async createReasoningRun(athleteId, trigger, selectedTypes, actor) {
      const run = { id: `run-${state.runs.length + 1}`, athleteId, trigger, selectedTypes, actor };
      state.runs.push(run);
      return run;
    },
    async completeReasoningRun(athleteId, id, status, result, error) {
      state.completed.push({ athleteId, id, status, result, error });
    },
    async saveSpecialistArtifact(athleteId, type, artifact, actor, options) {
      const record = { id:`artifact-${state.saved.length + 1}`, artifact_type:type, artifact_version:state.saved.length + 1, athleteId, artifact, actor, options };
      state.saved.push(record);
      return record;
    }
  };
}

const snapshot = {
  profile: { athlete_id:'athlete-1', preferences:{ music:['preferred'] }, private_extra:'profile-value' },
  context: { active_goal:{ description:'race' } },
  planned_session: { id:'s1', objective:'power' },
  daily_checkin: { fatigue_1_5:2, private_note:'checkin-value' },
  latest_completed_session: { id:'c1', session_rpe:5 },
  specialist_artifacts: [{ artifact_type:'recovery_state', artifact:{ trend:{ direction:'stable' } } }]
};

function config(overrides = {}) {
  return {
    skillz: {
      specialistUrl: 'http://skillz.internal/reason',
      specialistToken: 'token',
      specialistTimeoutMs: 1000,
      specialistRevision: 'skillz-sha',
      ...overrides
    }
  };
}

function musicArtifact() {
  return {
    schema_version:1,
    athlete_id:'forged-athlete',
    generated_at:'2026-08-22T18:00:00.000Z',
    source_refs:['skillz:test'],
    uncertainties:[],
    safety_flags:[],
    profile_version:1,
    preferences:{ artists:['preferred'] },
    exclusions:[],
    session_goals:[],
    activation_target:{ desired:'focused' },
    timing:[],
    selection_rules:['preference first'],
    bpm_context:{ descriptive_only:true },
    safety_constraints:[],
    feedback_fields:[]
  };
}

test('valid runtime artifact is normalized, versioned and provenance-linked', async () => {
  const repo = repository();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body:JSON.parse(options.body), authorization:options.headers.authorization });
    return {
      ok:true,
      async json() { return { artifact:musicArtifact(), provenance:{ runtime:'skillz-gateway', model:'model-x', provider:'local' } }; }
    };
  };
  const result = await produceSpecialistArtifacts({
    athleteId:'athlete-1',
    trigger:'explicit_specialist_request',
    requestedTypes:['training_music_profile'],
    snapshot,
    config:config(),
    repository:repo,
    fetchImpl
  });
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.selected_types, ['training_music_profile']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.skill, 'sport-training-music');
  assert.equal(calls[0].body.snapshot.daily_checkin, undefined);
  assert.equal(calls[0].authorization, 'Bearer token');
  assert.equal(repo.state.saved[0].artifact.athlete_id, 'athlete-1');
  assert.equal(repo.state.saved[0].options.reasoningRunId, 'run-1');
  assert.equal(repo.state.saved[0].options.provenance.skillz_revision, 'skillz-sha');
  assert.equal(repo.state.completed[0].status, 'completed');
});

test('missing runtime records failure without fabricating an artifact', async () => {
  const repo = repository();
  const result = await produceSpecialistArtifacts({
    athleteId:'athlete-1',
    trigger:'injury_state_changed',
    snapshot,
    config:config({ specialistUrl:'' }),
    repository:repo,
    fetchImpl:async () => { throw new Error('must not be called'); }
  });
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.selected_types, ['rehab_progression']);
  assert.equal(repo.state.saved.length, 0);
  assert.equal(repo.state.completed[0].status, 'failed');
});

test('invalid runtime artifact is rejected before persistence', async () => {
  const repo = repository();
  const result = await produceSpecialistArtifacts({
    athleteId:'athlete-1',
    trigger:'explicit_specialist_request',
    requestedTypes:['training_music_profile'],
    snapshot,
    config:config(),
    repository:repo,
    fetchImpl:async () => ({ ok:true, async json() { return { artifact:{ ...musicArtifact(), mandatory_bpm_zone:[150,170] } }; } })
  });
  assert.equal(result.status, 'failed');
  assert.equal(repo.state.saved.length, 0);
  assert.equal(result.errors[0].error, 'invalid_specialist_artifact');
});

test('mental-health concern invokes only routing and accepts an urgent safety exit', async () => {
  const repo = repository();
  const requested = [];
  const result = await produceSpecialistArtifacts({
    athleteId:'athlete-1',
    trigger:'mental_health_concern',
    snapshot,
    config:config(),
    repository:repo,
    fetchImpl:async (_url, options) => {
      const request = JSON.parse(options.body);
      requested.push(request.artifact_type);
      return {
        ok:true,
        async json() {
          return {
            artifact:{
              schema_version:1,
              athlete_id:'foreign',
              generated_at:'2026-08-22T18:00:00.000Z',
              source_refs:['reported-signal'],
              uncertainties:[],
              safety_flags:['urgent_support'],
              routing_version:1,
              concern_summary:'acute safety concern',
              observed_signals:[],
              functioning_course:{},
              routing_level:'urgent',
              training_boundaries:{ performance_optimization_paused:true },
              support_path:{ immediate:true, route:'qualified_local_support' },
              privacy_minimization:{ stored_fields:'minimum' },
              confidence:0.8
            },
            provenance:{ runtime:'skillz-gateway', model:'model-x' }
          };
        }
      };
    }
  });
  assert.deepEqual(requested, ['mental_health_routing']);
  assert.equal(result.status, 'completed');
  assert.equal(repo.state.saved[0].artifact.routing_level, 'urgent');
  assert.equal(repo.state.saved[0].artifact.athlete_id, 'athlete-1');
});

test('snapshot minimization is type-specific', () => {
  const music = snapshotForSpecialist('training_music_profile', snapshot);
  assert.deepEqual(Object.keys(music).sort(), ['planned_session','profile']);
  const mental = snapshotForSpecialist('mental_health_routing', snapshot);
  assert.deepEqual(Object.keys(mental).sort(), ['daily_checkin','profile']);
});
