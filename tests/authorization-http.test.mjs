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

test('athlete defaults to own scope and cannot target another athlete', async () => {
  const calls = [];
  const repository = {
    async resolvePrincipal(identity) {
      return { ...identity, role: 'athlete', athleteId: 'athlete-a' };
    },
    async getTodaySession(athleteId) {
      calls.push(['today', athleteId]);
      return null;
    }
  };

  await withServer(repository, async port => {
    const own = await fetch(`http://127.0.0.1:${port}/api/v1/training/today`);
    assert.equal(own.status, 200);
    assert.deepEqual(calls, [['today','athlete-a']]);

    const foreign = await fetch(`http://127.0.0.1:${port}/api/v1/training/today`, {
      headers: { 'x-sam-target-athlete': 'athlete-b' }
    });
    assert.equal(foreign.status, 403);
    assert.equal((await foreign.json()).error, 'athlete_scope_forbidden');
    assert.deepEqual(calls, [['today','athlete-a']]);
  });
});

test('coach requires an explicit active assignment for the target athlete and access is audited', async () => {
  const calls = [];
  const repository = {
    async resolvePrincipal(identity) {
      return { ...identity, role: 'coach', athleteId: null };
    },
    async coachCanAccess(subject, athleteId) {
      calls.push(['canAccess', subject, athleteId]);
      return athleteId === 'athlete-a';
    },
    async audit(athleteId, actor, eventType, entityType, entityId, details) {
      calls.push(['audit', athleteId, actor, eventType, entityType, entityId, details.method]);
    },
    async getTodaySession(athleteId) {
      calls.push(['today', athleteId]);
      return { id: 'session-1' };
    },
    async listCoachAthletes(subject) {
      calls.push(['list', subject]);
      return [{ athlete_id: 'athlete-a', display_name: 'Athlete A' }];
    }
  };

  await withServer(repository, async port => {
    const missing = await fetch(`http://127.0.0.1:${port}/api/v1/training/today`);
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).error, 'athlete_target_required');

    const allowed = await fetch(`http://127.0.0.1:${port}/api/v1/training/today`, {
      headers: { 'x-sam-target-athlete': 'athlete-a' }
    });
    assert.equal(allowed.status, 200);

    const denied = await fetch(`http://127.0.0.1:${port}/api/v1/training/today`, {
      headers: { 'x-sam-target-athlete': 'athlete-b' }
    });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error, 'athlete_scope_forbidden');

    const assigned = await fetch(`http://127.0.0.1:${port}/api/v1/coach/athletes`);
    assert.equal(assigned.status, 200);
    assert.deepEqual((await assigned.json()).athletes, [{ athlete_id: 'athlete-a', display_name: 'Athlete A' }]);

    assert.deepEqual(calls, [
      ['canAccess','subject-1','athlete-a'],
      ['audit','athlete-a','subject-1','coach.api_access','api_route','/api/v1/training/today','GET'],
      ['today','athlete-a'],
      ['canAccess','subject-1','athlete-b'],
      ['list','subject-1']
    ]);
  });
});

test('assigned Coach cannot write athlete-authored subjective data', async () => {
  let subjectiveWriteTouched = false;
  const audits = [];
  const repository = {
    async resolvePrincipal(identity) {
      return { ...identity, role: 'coach', athleteId: null };
    },
    async coachCanAccess(_subject, athleteId) {
      return athleteId === 'athlete-a';
    },
    async audit(athleteId, actor, eventType, entityType, entityId, details) {
      audits.push({ athleteId, actor, eventType, entityType, entityId, details });
    },
    async saveCheckin() {
      subjectiveWriteTouched = true;
      return {};
    }
  };

  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/checkins`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sam-target-athlete': 'athlete-a'
      },
      body: '{}'
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'coach_action_forbidden');
    assert.equal(subjectiveWriteTouched, false);
    assert.equal(audits[0].eventType, 'coach.api_denied');
    assert.equal(audits[0].athleteId, 'athlete-a');
    assert.equal(audits[0].details.reason, 'athlete_authored_or_unsupported_write');
  });
});

test('me exposes application role without requiring athlete target', async () => {
  const repository = {
    async resolvePrincipal(identity) {
      return { ...identity, role: 'coach', athleteId: null };
    }
  };
  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/me`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.role, 'coach');
    assert.equal(body.athleteId, null);
  });
});


test('unassigned Coach cannot read Athlete journal', async () => {
  let journalReadTouched = false;
  const repository = {
    async resolvePrincipal(identity) {
      return { ...identity, role: 'coach', athleteId: null };
    },
    async coachCanAccess() {
      return false;
    },
    async listJournal() {
      journalReadTouched = true;
      return [];
    }
  };

  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/journal`, {
      headers: { 'x-sam-target-athlete': 'athlete-b' }
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'athlete_scope_forbidden');
    assert.equal(journalReadTouched, false);
  });
});

test('assigned Coach can write only a separate Coach note, while Athlete cannot use the Coach-note endpoint', async () => {
  const saved = [];
  const audits = [];
  const coachRepository = {
    async resolvePrincipal(identity) {
      return { ...identity, role: 'coach', athleteId: null };
    },
    async coachCanAccess(_subject, athleteId) {
      return athleteId === 'athlete-a';
    },
    async audit(athleteId, actor, eventType, entityType, entityId, details) {
      audits.push({ athleteId, actor, eventType, entityType, entityId, details });
    },
    async saveCoachSessionNote(athleteId, completedSessionId, note, actor) {
      saved.push({ athleteId, completedSessionId, note, actor });
      return [{ completed_session_id: completedSessionId, authored_by_subject: actor, note }];
    }
  };

  await withServer(coachRepository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/completed-sessions/completed-1/coach-note`, {
      method:'PUT',
      headers: {
        'content-type':'application/json',
        'x-sam-target-athlete':'athlete-a'
      },
      body: JSON.stringify({ note:'Technik stabil, nächstes Mal Schlaglänge beobachten.' })
    });
    assert.equal(response.status, 200);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].actor, 'subject-1');
    assert.equal(saved[0].athleteId, 'athlete-a');
    assert.equal(audits[0].eventType, 'coach.api_access');
  });

  let athleteWriteTouched = false;
  const athleteRepository = {
    async resolvePrincipal(identity) {
      return { ...identity, role: 'athlete', athleteId: 'athlete-a' };
    },
    async saveCoachSessionNote() {
      athleteWriteTouched = true;
      return [];
    }
  };

  await withServer(athleteRepository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/completed-sessions/completed-1/coach-note`, {
      method:'PUT',
      headers: { 'content-type':'application/json' },
      body: JSON.stringify({ note:'should fail' })
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'coach_role_required');
    assert.equal(athleteWriteTouched, false);
  });
});


test('manual Athlete completion preserves subjective authorship and v1 post-session fields', async () => {
  let captured = null;
  const repository = {
    async resolvePrincipal(identity) {
      return { ...identity, role: 'athlete', athleteId: 'athlete-a' };
    },
    async completeSession(athleteId, plannedSessionId, payload, actor) {
      captured = { athleteId, plannedSessionId, payload, actor };
      return payload;
    }
  };

  await withServer(repository, async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/sessions/session-1/complete`, {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({
        started_at:'2026-09-27T17:00:00.000Z',
        completed_at:'2026-09-27T18:00:00.000Z',
        duration_min:60,
        session_rpe:6,
        completion_status:'modified',
        expectation_match:'harder',
        pain_0_10:2,
        deviations:['fatigue'],
        comment:'Gegen Ende zäher als geplant.'
      })
    });
    assert.equal(response.status, 201);
    assert.equal(captured.athleteId, 'athlete-a');
    assert.equal(captured.plannedSessionId, 'session-1');
    assert.equal(captured.actor, 'subject-1');
    assert.equal(captured.payload.athlete_authored_by_subject, 'subject-1');
    assert.equal(captured.payload.expectation_match, 'harder');
    assert.deepEqual(captured.payload.deviations, ['fatigue']);
    assert.equal(captured.payload.session_load, 360);
  });
});
