import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApplication } from '../src/app.mjs';

function config(linkedAthlete = 'athlete-b') {
  return {
    nodeEnv: 'development',
    appStatus: 'active',
    publicOrigin: '',
    auth: { mode: 'dev', devUserId: 'athlete-a', devEmail: null, devName: 'Athlete A' },
    skillz: { adaptationUrl: '', token: '', timeoutMs: 5000 },
    p1: { ingestSecret: '', ingestHeader: 'x-sam-p1-ingest-secret' },
    concept2: { baseUrl: 'https://log.concept2.com', accessToken: 'personal-read-token', athleteId: linkedAthlete, timeoutMs: 10000 }
  };
}

async function withServer(appConfig, repository, fn) {
  const server = createServer(createApplication({ config: appConfig, repository }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await fn(port); } finally { await new Promise(resolve => server.close(resolve)); }
}

function repository() {
  return {
    async ensureAthlete() {},
    async getImportCursor() { throw new Error('cursor must not be read for a foreign Concept2 token'); }
  };
}

test('Concept2 status is unavailable to an athlete other than the token owner', async () => {
  await withServer(config('athlete-b'), repository(), async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/import/status`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.concept2_configured, false);
  });
});

test('Concept2 sync is forbidden when the personal token belongs to another athlete', async () => {
  await withServer(config('athlete-b'), repository(), async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/import/concept2/sync`, { method: 'POST' });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'concept2_not_linked_to_athlete');
  });
});
