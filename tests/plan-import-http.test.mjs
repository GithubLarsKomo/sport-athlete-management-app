import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApplication } from '../src/app.mjs';
import { canonicalPlanImportFixture } from './fixtures/canonical-plan-import.mjs';

function config() {
  return {
    nodeEnv: 'development',
    appStatus: 'active',
    publicOrigin: '',
    auth: { mode: 'dev', devUserId: 'subject-1', devEmail: 'user@example.com', devName: 'User' },
    skillz: { adaptationUrl: '', token: '', timeoutMs: 5000 },
    specialist: { serviceSecret: '' },
    concept2: {}
  };
}

async function withServer(repository, fn) {
  const server = createServer(createApplication({ config: config(), repository }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await fn(port); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('plan import API returns 422 for invalid canonical bundle and athlete mismatch', async () => {
  let writes = 0;
  const repository = {
    async resolvePrincipal(identity) {
      return { ...identity, role: 'athlete', athleteId: 'athlete-a' };
    },
    async importCanonicalPlanBundle() {
      writes += 1;
      return {};
    }
  };

  await withServer(repository, async port => {
    const invalid = await fetch(`http://127.0.0.1:${port}/api/v1/planning/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(invalid.status, 422);
    assert.equal((await invalid.json()).error, 'invalid_plan_import');

    const mismatch = await fetch(`http://127.0.0.1:${port}/api/v1/planning/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(canonicalPlanImportFixture('other-athlete'))
    });
    assert.equal(mismatch.status, 422);
    assert.equal((await mismatch.json()).error, 'plan_athlete_mismatch');
    assert.equal(writes, 0);
  });
});

test('valid canonical import returns inspectable revision/hash and history', async () => {
  const repository = {
    async resolvePrincipal(identity) {
      return { ...identity, role: 'athlete', athleteId: 'athlete-a' };
    },
    async importCanonicalPlanBundle(athleteId, normalized, actor) {
      assert.equal(athleteId, 'athlete-a');
      assert.equal(normalized.athleteId, 'athlete-a');
      assert.equal(actor, 'subject-1');
      return {
        import_id: 'import-1',
        revision: 1,
        content_hash: normalized.contentHash,
        producer: normalized.producer,
        source_refs: normalized.sourceRefs,
        supersedes_import_id: null,
        disposition: 'created'
      };
    },
    async listPlanImports(athleteId) {
      assert.equal(athleteId, 'athlete-a');
      return [{
        import_id: 'import-1',
        revision: 1,
        content_hash: 'a'.repeat(64),
        producer: { workflow: 'sport-training-plan-workflow' },
        source_refs: ['skillz@fixture']
      }];
    }
  };

  await withServer(repository, async port => {
    const imported = await fetch(`http://127.0.0.1:${port}/api/v1/planning/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(canonicalPlanImportFixture('athlete-a'))
    });
    assert.equal(imported.status, 201);
    const body = await imported.json();
    assert.equal(body.imported.revision, 1);
    assert.match(body.imported.content_hash, /^[a-f0-9]{64}$/);

    const history = await fetch(`http://127.0.0.1:${port}/api/v1/planning/imports`);
    assert.equal(history.status, 200);
    assert.equal((await history.json()).imports[0].revision, 1);
  });
});

test('unassigned Coach receives 403 before plan import persistence', async () => {
  let writeTouched = false;
  const repository = {
    async resolvePrincipal(identity) {
      return { ...identity, role: 'coach', athleteId: null };
    },
    async coachCanAccess() {
      return false;
    },
    async importCanonicalPlanBundle() {
      writeTouched = true;
      return {};
    }
  };

  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/planning/import`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sam-target-athlete': 'athlete-a'
      },
      body: JSON.stringify(canonicalPlanImportFixture('athlete-a'))
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'athlete_scope_forbidden');
    assert.equal(writeTouched, false);
  });
});


test('assigned Coach can import a canonical plan for the assigned athlete', async () => {
  const audits = [];
  let importedBy = null;
  const repository = {
    async resolvePrincipal(identity) {
      return { ...identity, role: 'coach', athleteId: null };
    },
    async coachCanAccess(subject, athleteId) {
      return subject === 'subject-1' && athleteId === 'athlete-a';
    },
    async audit(athleteId, actor, eventType, entityType, entityId, details) {
      audits.push({ athleteId, actor, eventType, entityType, entityId, details });
    },
    async importCanonicalPlanBundle(athleteId, normalized, actor) {
      importedBy = actor;
      assert.equal(athleteId, 'athlete-a');
      assert.equal(normalized.athleteId, 'athlete-a');
      return {
        import_id: 'coach-import-1',
        revision: 1,
        content_hash: normalized.contentHash,
        producer: normalized.producer,
        source_refs: normalized.sourceRefs,
        supersedes_import_id: null,
        disposition: 'created'
      };
    }
  };

  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/planning/import`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sam-target-athlete': 'athlete-a'
      },
      body: JSON.stringify(canonicalPlanImportFixture('athlete-a'))
    });
    assert.equal(response.status, 201);
    assert.equal(importedBy, 'subject-1');
    assert.equal(audits[0].eventType, 'coach.api_access');
    assert.equal(audits[0].athleteId, 'athlete-a');
  });
});
