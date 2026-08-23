import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApplication } from '../src/app.mjs';

const SECRET = 'fedcba9876543210fedcba9876543210';
const HEADER = 'x-sam-specialist-secret';

function config() {
  return {
    nodeEnv:'development',
    appStatus:'active',
    publicOrigin:'',
    auth:{ mode:'dev', devUserId:'athlete-1', devEmail:null, devName:'Athlete' },
    skillz:{ adaptationUrl:'', token:'', timeoutMs:5000, specialistUrl:'', specialistToken:'', specialistTimeoutMs:15000, specialistRevision:'skillz-sha' },
    specialist:{ serviceSecret:SECRET, serviceHeader:HEADER },
    p1:{ ingestSecret:SECRET, ingestHeader:HEADER }
  };
}

async function withServer(repository, fn) {
  const server = createServer(createApplication({ config:config(), repository }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await fn(port); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('wrong specialist service secret is rejected before athlete lookup', async () => {
  let touched = false;
  const repository = {
    async athleteExists() { touched = true; return true; }
  };
  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/internal/specialists/generate`, {
      method:'POST',
      headers:{ 'content-type':'application/json', [HEADER]:'wrong' },
      body:JSON.stringify({ athlete_id:'athlete-1', trigger:'injury_state_changed' })
    });
    assert.equal(response.status, 401);
    assert.equal(touched, false);
  });
});

test('missing runtime creates an auditable failed run and no artifact', async () => {
  const state = { saved:0, run:null, completed:null };
  const repository = {
    async athleteExists(id) { return id === 'athlete-1'; },
    async getLatestCompletedSession() { return null; },
    async getTodaySession() { return null; },
    async getProfile() { return { athlete_id:'athlete-1', sport:'rowing' }; },
    async getContext() { return {}; },
    async getTodayCheckin() { return null; },
    async getLatestSpecialistArtifacts() { return []; },
    async createReasoningRun(athleteId, trigger, selectedTypes) {
      state.run = { id:'run-1', athleteId, trigger, selectedTypes };
      return { id:'run-1' };
    },
    async completeReasoningRun(athleteId, id, status, result, error) {
      state.completed = { athleteId, id, status, result, error };
    },
    async saveSpecialistArtifact() { state.saved += 1; }
  };
  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/internal/specialists/generate`, {
      method:'POST',
      headers:{ 'content-type':'application/json', [HEADER]:SECRET },
      body:JSON.stringify({ athlete_id:'athlete-1', trigger:'injury_state_changed' })
    });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.status, 'failed');
    assert.deepEqual(body.selected_types, ['rehab_progression']);
    assert.equal(state.saved, 0);
    assert.equal(state.completed.status, 'failed');
  });
});

test('generic trusted ingest accepts P2 while product controls athlete identity', async () => {
  let saved;
  const repository = {
    async athleteExists(id) { return id === 'athlete-1'; },
    async saveSpecialistArtifact(athleteId, type, artifact, actor) {
      saved = { athleteId, type, artifact, actor };
      return { id:'p2-1', artifact_type:type, artifact_version:1, artifact };
    }
  };
  const artifact = {
    schema_version:1,
    athlete_id:'forged',
    generated_at:'2026-08-22T18:00:00.000Z',
    source_refs:['test'],
    uncertainties:[],
    safety_flags:[],
    profile_version:1,
    preferences:{},
    exclusions:[],
    session_goals:[],
    activation_target:{},
    timing:[],
    selection_rules:[],
    bpm_context:{ descriptive_only:true },
    safety_constraints:[],
    feedback_fields:[]
  };
  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/internal/specialists/artifacts/training_music_profile`, {
      method:'POST',
      headers:{ 'content-type':'application/json', [HEADER]:SECRET },
      body:JSON.stringify({ athlete_id:'athlete-1', artifact })
    });
    assert.equal(response.status, 201);
    assert.equal(saved.type, 'training_music_profile');
    assert.equal(saved.artifact.athlete_id, 'athlete-1');
    assert.equal(saved.actor, 'service:skillz');
  });
});
