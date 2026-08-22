import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApplication } from '../src/app.mjs';

function baseConfig() {
  return {
    nodeEnv: 'development',
    appStatus: 'active',
    publicOrigin: 'https://training.example.com',
    auth: { mode: 'dev', devUserId: 'athlete', devEmail: null, devName: 'Athlete' },
    skillz: { adaptationUrl: '', token: '', timeoutMs: 5000 }
  };
}

const repository = {
  async ensureAthlete() { throw new Error('repository must not be touched for rejected cross-site writes'); }
};

test('cross-site browser write is rejected before authentication or persistence', async () => {
  const server = createServer(createApplication({ config: baseConfig(), repository }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/checkins`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
      body: '{}'
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'cross_site_write_rejected');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
