import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIdentity } from '../src/auth.mjs';

function req(headers={}) { return { headers }; }
const base = { nodeEnv:'production', auth:{ mode:'proxy', sharedSecret:'secret', sharedSecretHeader:'x-sam-proxy-secret', subjectHeader:'x-authentik-uid', emailHeader:'x-authentik-email', nameHeader:'x-authentik-name' } };

test('proxy auth requires shared secret and subject', () => {
  assert.equal(resolveIdentity(req({'x-authentik-uid':'a'}), base), null);
  const id = resolveIdentity(req({'x-sam-proxy-secret':'secret','x-authentik-uid':'athlete-1','x-authentik-email':'a@example.com'}), base);
  assert.equal(id.athleteId, 'athlete-1');
});

test('dev auth is refused in production', () => {
  assert.equal(resolveIdentity(req(), { nodeEnv:'production', auth:{ mode:'dev' } }), null);
});
