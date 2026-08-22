import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApplication } from '../src/app.mjs';

function config() {
  return {
    nodeEnv: 'development',
    appStatus: 'active',
    publicOrigin: '',
    auth: { mode: 'dev', devUserId: 'athlete-1', devEmail: null, devName: 'Athlete' },
    skillz: { adaptationUrl: '', token: '', timeoutMs: 5000 },
    p1: { ingestSecret: '', ingestHeader: 'x-sam-p1-ingest-secret' }
  };
}

async function withServer(repository, fn) {
  const server = createServer(createApplication({ config: config(), repository }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await fn(port); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('P1 latest endpoint is scoped to the authenticated athlete', async () => {
  const calls = [];
  const repository = {
    async ensureAthlete(identity) { calls.push(['ensure', identity.athleteId]); },
    async getLatestSpecialistArtifacts(athleteId) {
      calls.push(['latest', athleteId]);
      return [{ id:'p1', artifact_type:'recovery_state', artifact_version:2, artifact:{ athlete_id:athleteId } }];
    }
  };

  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/p1/artifacts/latest`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.artifacts[0].artifact.athlete_id, 'athlete-1');
    assert.deepEqual(calls, [['ensure','athlete-1'], ['latest','athlete-1']]);
  });
});

test('unsupported P1 type is rejected without repository lookup', async () => {
  let lookedUp = false;
  const repository = {
    async ensureAthlete() {},
    async getLatestSpecialistArtifact() { lookedUp = true; return null; }
  };

  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/p1/artifacts/not-a-type`);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, 'unsupported_specialist_artifact_type');
    assert.equal(lookedUp, false);
  });
});
