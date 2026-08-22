import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApplication } from '../src/app.mjs';

function config() {
  return {
    nodeEnv:'development',
    appStatus:'active',
    publicOrigin:'',
    auth:{ mode:'dev', devUserId:'athlete-1', devEmail:null, devName:'Athlete' },
    skillz:{ adaptationUrl:'', token:'', timeoutMs:5000, specialistUrl:'', specialistToken:'', specialistTimeoutMs:15000 },
    specialist:{ serviceSecret:'', serviceHeader:'x-sam-specialist-secret' },
    p1:{ ingestSecret:'', ingestHeader:'x-sam-p1-ingest-secret' }
  };
}

async function withServer(repository, fn) {
  const server = createServer(createApplication({ config:config(), repository }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await fn(port); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('P2 latest endpoint filters shared storage and remains athlete-scoped', async () => {
  const calls = [];
  const repository = {
    async ensureAthlete(identity) { calls.push(['ensure', identity.athleteId]); },
    async getLatestSpecialistArtifacts(athleteId) {
      calls.push(['latest', athleteId]);
      return [
        { artifact_type:'recovery_state', artifact:{ athlete_id:athleteId } },
        { artifact_type:'training_music_profile', artifact:{ athlete_id:athleteId } },
        { artifact_type:'environment_adjustment', artifact:{ athlete_id:athleteId } }
      ];
    }
  };
  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/p2/artifacts/latest`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.artifacts.map(item => item.artifact_type), ['training_music_profile','environment_adjustment']);
    assert.deepEqual(calls, [['ensure','athlete-1'],['latest','athlete-1']]);
  });
});

test('P1 latest endpoint no longer leaks P2 records from shared table', async () => {
  const repository = {
    async ensureAthlete() {},
    async getLatestSpecialistArtifacts() {
      return [
        { artifact_type:'recovery_state', artifact:{} },
        { artifact_type:'mental_health_routing', artifact:{} }
      ];
    }
  };
  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/p1/artifacts/latest`);
    const body = await response.json();
    assert.deepEqual(body.artifacts.map(item => item.artifact_type), ['recovery_state']);
  });
});

test('P2 type endpoint exposes only P2 contract types', async () => {
  const repository = { async ensureAthlete() {} };
  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/p2/types`);
    const body = await response.json();
    assert.deepEqual(body.types, ['performance_psychology_plan','mental_health_routing','training_music_profile','environment_adjustment']);
  });
});
