import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApplication } from '../src/app.mjs';

const SECRET = '0123456789abcdef0123456789abcdef';

function config() {
  return {
    nodeEnv: 'development',
    appStatus: 'active',
    publicOrigin: 'https://training.example.com',
    auth: { mode: 'dev', devUserId: 'athlete', devEmail: null, devName: 'Athlete' },
    skillz: { adaptationUrl: '', token: '', timeoutMs: 5000, specialistUrl: '', specialistToken: '', specialistTimeoutMs: 15000 },
    specialist: { serviceSecret: SECRET, serviceHeader: 'x-sam-p1-ingest-secret' },
    p1: { ingestSecret: SECRET, ingestHeader: 'x-sam-p1-ingest-secret' }
  };
}

function artifact() {
  return {
    schema_version: 1,
    athlete_id: 'forged-athlete',
    generated_at: '2026-08-22T15:00:00.000Z',
    source_refs: ['skillz:test'],
    uncertainties: [],
    safety_flags: [],
    window_start: '2026-08-18',
    window_end: '2026-08-22',
    baseline: {},
    current_signals: {},
    trend: {},
    interventions: [],
    next_re_evaluation: '2026-08-23T06:00:00.000Z',
    confidence: 0.8
  };
}

async function withServer(repository, fn) {
  const server = createServer(createApplication({ config: config(), repository }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await fn(port); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('wrong legacy P1 service secret is rejected before persistence', async () => {
  let touched = false;
  const repository = {
    async athleteExists() { touched = true; return true; },
    async saveSpecialistArtifact() { touched = true; return {}; }
  };
  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/internal/p1/artifacts/recovery_state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sam-p1-ingest-secret': 'wrong' },
      body: JSON.stringify({ athlete_id: 'athlete-1', artifact: artifact() })
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'unauthorized_specialist_service');
    assert.equal(touched, false);
  });
});

test('trusted legacy P1 ingest forces target athlete into canonical artifact', async () => {
  let saved;
  const repository = {
    async athleteExists(id) { return id === 'athlete-1'; },
    async saveSpecialistArtifact(athleteId, type, value, actor) {
      saved = { athleteId, type, value, actor };
      return { id: 'artifact-1', artifact_type: type, artifact_version: 1, artifact: value };
    }
  };
  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/internal/p1/artifacts/recovery_state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sam-p1-ingest-secret': SECRET },
      body: JSON.stringify({ athlete_id: 'athlete-1', artifact: artifact() })
    });
    assert.equal(response.status, 201);
    assert.equal(saved.value.athlete_id, 'athlete-1');
    assert.equal(saved.actor, 'service:skillz');
  });
});
