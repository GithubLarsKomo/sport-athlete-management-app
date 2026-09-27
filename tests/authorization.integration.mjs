import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/persistence/db.mjs';
import { createRepository } from '../src/persistence/repository.mjs';
import { createApplication } from '../src/app.mjs';

const config = loadConfig();
const db = createDatabase(config);
const repository = createRepository(db);

test.after(async () => { await db.close(); });

function appConfig(subject) {
  return {
    ...config,
    nodeEnv: 'development',
    appStatus: 'active',
    publicOrigin: '',
    auth: {
      mode: 'dev',
      devUserId: subject,
      devEmail: null,
      devName: 'Integration Coach'
    },
    concept2: config.concept2 || {},
    specialist: config.specialist || { serviceSecret: '' }
  };
}

async function withServer(subject, fn) {
  const server = createServer(createApplication({ config: appConfig(subject), repository }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await fn(port); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('Coach assignment grant and revoke control real athlete-scoped HTTP access', async () => {
  const athleteId = `auth-athlete-${randomUUID()}`;
  const coachSubject = `auth-coach-${randomUUID()}`;

  await repository.ensureAthlete({
    subject: athleteId,
    athleteId,
    email: null,
    displayName: 'Authorization Athlete'
  });

  const athletePrincipal = await repository.resolvePrincipal({
    subject: athleteId,
    athleteId,
    email: null,
    displayName: 'Authorization Athlete'
  });
  assert.equal(athletePrincipal.role, 'athlete');
  assert.equal(athletePrincipal.athleteId, athleteId);

  await repository.ensureCoachPrincipal({
    subject: coachSubject,
    athleteId: coachSubject,
    email: null,
    displayName: 'Authorization Coach'
  }, 'operator:test');

  const coachPrincipal = await repository.resolvePrincipal({
    subject: coachSubject,
    athleteId: coachSubject,
    email: null,
    displayName: 'Authorization Coach'
  });
  assert.equal(coachPrincipal.role, 'coach');
  assert.equal(coachPrincipal.athleteId, null);

  const granted = await repository.setCoachAthleteAssignment({
    coachSubject,
    athleteId,
    active: true,
    actor: 'operator:test'
  });
  assert.equal(granted.active, true);
  assert.equal(await repository.coachCanAccess(coachSubject, athleteId), true);
  assert.equal((await repository.listCoachAthletes(coachSubject))[0].athlete_id, athleteId);

  await withServer(coachSubject, async port => {
    const allowed = await fetch(`http://127.0.0.1:${port}/api/v1/training/today`, {
      headers: { 'x-sam-target-athlete': athleteId }
    });
    assert.equal(allowed.status, 200);

    const accessAudit = await db.query(
      "SELECT athlete_id, actor_subject, event_type, details_json FROM audit_log WHERE athlete_id=? AND actor_subject=? AND event_type='coach.api_access' ORDER BY id DESC LIMIT 1",
      [athleteId, coachSubject]
    );
    assert.equal(accessAudit[0].athlete_id, athleteId);
    assert.equal(accessAudit[0].actor_subject, coachSubject);
    const accessDetails = typeof accessAudit[0].details_json === 'string'
      ? JSON.parse(accessAudit[0].details_json)
      : accessAudit[0].details_json;
    assert.equal(accessDetails.method, 'GET');

    const revoked = await repository.setCoachAthleteAssignment({
      coachSubject,
      athleteId,
      active: false,
      actor: 'operator:test'
    });
    assert.equal(revoked.active, false);
    assert.equal(revoked.changed, true);
    assert.equal(await repository.coachCanAccess(coachSubject, athleteId), false);

    const denied = await fetch(`http://127.0.0.1:${port}/api/v1/training/today`, {
      headers: { 'x-sam-target-athlete': athleteId }
    });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error, 'athlete_scope_forbidden');
  });

  const assignmentHistory = await db.query(
    'SELECT active, effective_from, effective_to FROM coach_athlete_assignments WHERE coach_subject=? AND athlete_id=? ORDER BY created_at',
    [coachSubject, athleteId]
  );
  assert.equal(assignmentHistory.length, 1);
  assert.equal(assignmentHistory[0].active, false);
  assert.ok(assignmentHistory[0].effective_from);
  assert.ok(assignmentHistory[0].effective_to);

  const assignmentAudit = await db.query(
    "SELECT event_type FROM audit_log WHERE athlete_id=? AND actor_subject='operator:test' AND event_type IN ('coach.assignment.granted','coach.assignment.revoked') ORDER BY id",
    [athleteId]
  );
  assert.deepEqual(assignmentAudit.map(row => row.event_type), ['coach.assignment.granted','coach.assignment.revoked']);
});
