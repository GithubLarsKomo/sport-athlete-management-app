import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApplication } from '../src/app.mjs';

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

const fixedProtocol = {
  protocol_id: 'rowerg-2000m',
  version: 1,
  name: 'RowErg 2,000 m',
  modality: 'rowerg',
  protocol_kind: 'fixed_effort',
  source: 'built_in'
};

test('Athlete can list protocols, plan a fixed test and submit classified evidence', async () => {
  const calls = [];
  const repository = {
    async resolvePrincipal(identity) {
      return { ...identity, role: 'athlete', athleteId: 'athlete-a' };
    },
    async listTestProtocols(athleteId) {
      calls.push(['protocols', athleteId]);
      return [fixedProtocol];
    },
    async planPerformanceTest(athleteId, body, actor) {
      calls.push(['plan', athleteId, actor, body.protocol_id]);
      return { test_id:'test-1', athlete_id:athleteId, protocol:fixedProtocol, status:'planned', ...body };
    },
    async getPerformanceTest(athleteId, testId) {
      calls.push(['get', athleteId, testId]);
      return { test_id:testId, athlete_id:athleteId, protocol:fixedProtocol, status:'planned' };
    },
    async performPerformanceTest(athleteId, testId, body, actor) {
      calls.push(['perform', athleteId, testId, actor, body.metrics.duration_s.measurement_class]);
      return { test_id:testId, athlete_id:athleteId, protocol:fixedProtocol, status:'performed', result:{ metrics:body.metrics }, performed_by_subject:actor };
    }
  };

  await withServer(repository, async port => {
    const protocols = await fetch(`http://127.0.0.1:${port}/api/v1/tests/protocols`);
    assert.equal(protocols.status, 200);
    assert.equal((await protocols.json()).protocols[0].protocol_id, 'rowerg-2000m');

    const planned = await fetch(`http://127.0.0.1:${port}/api/v1/tests`, {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({
        protocol_id:'rowerg-2000m',
        protocol_version:1,
        scheduled_at:'2026-10-01T17:00:00.000Z',
        expected_targets:{
          pace_500_s:{ value:102, unit:'s/500m', measurement_class:'assumed_or_estimated' }
        }
      })
    });
    assert.equal(planned.status, 201);

    const performed = await fetch(`http://127.0.0.1:${port}/api/v1/tests/test-1/result`, {
      method:'PUT',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({
        performed_at:'2026-10-01T17:10:00.000Z',
        device:'Concept2 PM5',
        metrics:{
          duration_s:{ value:410.2, unit:'s', measurement_class:'measured', source_ref:'pm5:result' },
          pace_500_s:{ value:102.55, unit:'s/500m', measurement_class:'derived', source_ref:'calc:duration/distance' }
        }
      })
    });
    assert.equal(performed.status, 200);
    const body = await performed.json();
    assert.equal(body.test.performed_by_subject, 'subject-1');
    assert.equal(body.test.result.metrics.pace_500_s.measurement_class, 'derived');
  });

  assert.deepEqual(calls, [
    ['protocols','athlete-a'],
    ['plan','athlete-a','subject-1','rowerg-2000m'],
    ['get','athlete-a','test-1'],
    ['perform','athlete-a','test-1','subject-1','measured']
  ]);
});

test('planned targets presented as measured data are rejected before persistence', async () => {
  let touched = false;
  const repository = {
    async resolvePrincipal(identity) {
      return { ...identity, role:'athlete', athleteId:'athlete-a' };
    },
    async planPerformanceTest() {
      touched = true;
      return {};
    }
  };
  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/tests`, {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({
        protocol_id:'rowerg-2000m',
        protocol_version:1,
        scheduled_at:'2026-10-01T17:00:00.000Z',
        expected_targets:{
          pace_500_s:{ value:102, unit:'s/500m', measurement_class:'measured' }
        }
      })
    });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error, 'invalid_performance_test_plan');
    assert.equal(touched, false);
  });
});

test('unassigned Coach receives 403 before performance test data is read or written', async () => {
  let touched = false;
  const repository = {
    async resolvePrincipal(identity) {
      return { ...identity, role:'coach', athleteId:null };
    },
    async coachCanAccess() {
      return false;
    },
    async listPerformanceTests() {
      touched = true;
      return [];
    }
  };
  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/tests`, {
      headers:{ 'x-sam-target-athlete':'athlete-a' }
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'athlete_scope_forbidden');
    assert.equal(touched, false);
  });
});

test('assigned Coach can plan and perform a test and access is audited', async () => {
  const calls = [];
  const repository = {
    async resolvePrincipal(identity) {
      return { ...identity, role:'coach', athleteId:null };
    },
    async coachCanAccess(subject, athleteId) {
      calls.push(['can', subject, athleteId]);
      return athleteId === 'athlete-a';
    },
    async audit(athleteId, actor, eventType, entityType, entityId, details) {
      calls.push(['audit', athleteId, actor, eventType, details.method]);
    },
    async planPerformanceTest(athleteId, body, actor) {
      calls.push(['plan', athleteId, actor]);
      return { test_id:'coach-test', athlete_id:athleteId, protocol:fixedProtocol, status:'planned', ...body };
    },
    async getPerformanceTest(athleteId, testId) {
      calls.push(['get', athleteId, testId]);
      return { test_id:testId, athlete_id:athleteId, protocol:fixedProtocol, status:'planned' };
    },
    async performPerformanceTest(athleteId, testId, body, actor) {
      calls.push(['perform', athleteId, testId, actor]);
      return { test_id:testId, status:'performed', result:{ metrics:body.metrics } };
    }
  };

  await withServer(repository, async port => {
    const headers = { 'content-type':'application/json', 'x-sam-target-athlete':'athlete-a' };
    const planned = await fetch(`http://127.0.0.1:${port}/api/v1/tests`, {
      method:'POST',
      headers,
      body:JSON.stringify({
        protocol_id:'rowerg-2000m',
        protocol_version:1,
        scheduled_at:'2026-10-01T17:00:00.000Z'
      })
    });
    assert.equal(planned.status, 201);

    const performed = await fetch(`http://127.0.0.1:${port}/api/v1/tests/coach-test/result`, {
      method:'PUT',
      headers,
      body:JSON.stringify({
        performed_at:'2026-10-01T17:10:00.000Z',
        device:'Concept2 PM5',
        metrics:{ duration_s:{ value:410, unit:'s', measurement_class:'measured' } }
      })
    });
    assert.equal(performed.status, 200);
  });

  assert.equal(calls.filter(call => call[0] === 'can').length, 2);
  assert.deepEqual(calls.filter(call => call[0] === 'plan')[0], ['plan','athlete-a','subject-1']);
  assert.deepEqual(calls.filter(call => call[0] === 'perform')[0], ['perform','athlete-a','coach-test','subject-1']);
  assert.equal(calls.filter(call => call[0] === 'audit').length, 2);
});
