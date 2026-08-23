import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/persistence/db.mjs';
import { createRepository } from '../src/persistence/repository.mjs';
import { createActivityRepository } from '../src/persistence/activity-repository.mjs';

const config = loadConfig();
const db = createDatabase(config);
const repository = Object.assign(createRepository(db), createActivityRepository(db));
const athleteId = `activity-it-${randomUUID()}`;
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Berlin', year:'numeric', month:'2-digit', day:'2-digit' });
const today = fmt.format(new Date());
const plusDate = days => { const d = new Date(); d.setUTCDate(d.getUTCDate()+days); return fmt.format(d); };

test.after(async () => { await db.close(); });

function source(provider, externalActivityId, startedAt, durationS, distanceM, hashChar) {
  return {
    provider,
    externalActivityId,
    activityType: 'indoor_rowing',
    startedAt,
    endedAt: new Date(new Date(startedAt).getTime() + durationS * 1000).toISOString(),
    durationS,
    distanceM,
    rawSha256: hashChar.repeat(64),
    summary: {
      duration_s: durationS,
      distance_m: distanceM,
      avg_hr_bpm: provider === 'garmin' ? 142 : null,
      max_hr_bpm: provider === 'garmin' ? 164 : null,
      avg_power_w: provider === 'concept2' ? 205 : null,
      stroke_rate_spm: provider === 'concept2' ? 21 : null,
      drag_factor: provider === 'concept2' ? 118 : null
    },
    intervals: [],
    samples: [],
    rawPayload: { provider, externalActivityId }
  };
}

function planWithSession(plannedSessionId, start, objective = 'Zone 2 erg') {
  return {
    schema_version: 1,
    season: { id: randomUUID(), version: 1, name: 'Import season', start_date: plusDate(-7), end_date: plusDate(60), status: 'active' },
    mesocycle: { id: randomUUID(), version: 1, start_date: plusDate(-3), end_date: plusDate(21), primary_adaptation: 'aerobic endurance' },
    microcycle: { id: randomUUID(), version: 1, start_date: plusDate(-1), end_date: plusDate(5), focus: 'base' },
    sessions: [{
      id: plannedSessionId,
      version: 1,
      local_date: today,
      planned_start: start.toISOString(),
      session_type: 'rowing',
      objective,
      planned_duration_min: 60,
      planned_rpe: 4,
      status: 'planned'
    }]
  };
}

test('Garmin and Concept2 imports collapse to one journal activity and finalize one planned session', async () => {
  await repository.ensureAthlete({ subject: athleteId, athleteId, email: null, displayName: 'Activity Integration Athlete' });
  const start = new Date();
  start.setHours(7, 0, 0, 0);
  const plannedSessionId = randomUUID();
  await repository.applyPlanPackage(athleteId, planWithSession(plannedSessionId, start), athleteId);

  const garmin = source('garmin', 'garmin-1', new Date(start.getTime() + 15000).toISOString(), 3605, 14960, 'a');
  const first = await repository.ingestActivity(athleteId, garmin, athleteId);
  assert.equal(first.disposition, 'created');
  assert.equal(first.activity.planned_session_id, plannedSessionId);
  assert.deepEqual(first.activity.canonical_summary.providers, ['garmin']);

  const concept2 = source('concept2', 'c2-1', start.toISOString(), 3600, 15000, 'b');
  const second = await repository.ingestActivity(athleteId, concept2, athleteId);
  assert.equal(second.disposition, 'auto_merged');
  assert.equal(second.activity.id, first.activity.id);
  assert.equal(second.activity.sources.length, 2);
  assert.equal(second.activity.canonical_source, 'concept2');
  assert.equal(Number(second.activity.distance_m), 15000);
  assert.equal(second.activity.canonical_summary.avg_hr_bpm, 142);
  assert.equal(second.activity.canonical_summary.avg_power_w, 205);

  const exact = await repository.ingestActivity(athleteId, concept2, athleteId);
  assert.equal(exact.disposition, 'exact_duplicate');
  assert.equal(exact.activity.id, first.activity.id);
  assert.equal(exact.activity.sources.length, 2);

  const journal = await repository.listJournal(athleteId);
  assert.equal(journal.filter(item => item.id === first.activity.id).length, 1);

  const finalized = await repository.saveJournalEntry(athleteId, first.activity.id, {
    session_rpe: 4.5,
    pain_0_10: 0,
    comment: 'ruhige Z2 Einheit',
    deviations: [],
    finalize: true
  }, athleteId);
  assert.ok(finalized.completed_session_id);
  assert.ok(finalized.journal.finalized_at);

  const planned = await repository.getPlannedSessionById(athleteId, plannedSessionId);
  assert.equal(planned.status, 'completed');
  const completed = await repository.getLatestCompletedSession(athleteId);
  assert.equal(completed.import_activity_id, first.activity.id);
  assert.equal(Number(completed.session_rpe), 4.5);
});

test('an unplanned imported activity becomes training history after journal finalization', async () => {
  const unplannedAthleteId = `activity-it-${randomUUID()}`;
  await repository.ensureAthlete({ subject: unplannedAthleteId, athleteId: unplannedAthleteId, email: null, displayName: 'Unplanned Activity Athlete' });
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 12);
  start.setUTCHours(5, 30, 0, 0);
  const imported = await repository.ingestActivity(
    unplannedAthleteId,
    source('garmin', `garmin-${randomUUID()}`, start.toISOString(), 2700, 8500, 'c'),
    unplannedAthleteId
  );
  assert.equal(imported.activity.planned_session_id, null);

  const finalized = await repository.saveJournalEntry(unplannedAthleteId, imported.activity.id, {
    session_rpe: 5,
    pain_0_10: 1,
    comment: 'spontane Einheit',
    deviations: ['unplanned'],
    finalize: true
  }, unplannedAthleteId);
  assert.ok(finalized.completed_session_id);

  const completed = await repository.getLatestCompletedSession(unplannedAthleteId);
  assert.equal(completed.planned_session_id, null);
  assert.equal(completed.import_activity_id, imported.activity.id);
  assert.equal(Number(completed.session_rpe), 5);
});

test('a device import after manual completion links to the existing completed session', async () => {
  const manualFirstAthleteId = `activity-it-${randomUUID()}`;
  await repository.ensureAthlete({ subject: manualFirstAthleteId, athleteId: manualFirstAthleteId, email: null, displayName: 'Manual First Athlete' });
  const start = new Date();
  start.setHours(11, 0, 0, 0);
  const plannedSessionId = randomUUID();
  await repository.applyPlanPackage(manualFirstAthleteId, planWithSession(plannedSessionId, start, 'Manual first'), manualFirstAthleteId);

  const completedId = randomUUID();
  const completedAt = new Date(start.getTime() + 3600 * 1000);
  await repository.completeSession(manualFirstAthleteId, plannedSessionId, {
    schema_version: 1,
    athlete_id: manualFirstAthleteId,
    generated_at: new Date().toISOString(),
    source_refs: [],
    uncertainties: [],
    safety_flags: [],
    completed_session_id: completedId,
    planned_session_id: plannedSessionId,
    started_at: start.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_min: 60,
    session_rpe: 4,
    session_load: 240,
    completion_status: 'completed',
    deviations: []
  }, manualFirstAthleteId);

  const imported = await repository.ingestActivity(
    manualFirstAthleteId,
    source('garmin', `manual-first-${randomUUID()}`, new Date(start.getTime() + 20000).toISOString(), 3590, 14900, 'd'),
    manualFirstAthleteId
  );
  assert.equal(imported.activity.planned_session_id, null);

  const finalized = await repository.saveJournalEntry(manualFirstAthleteId, imported.activity.id, {
    session_rpe: 4,
    pain_0_10: 0,
    comment: 'Gerätedaten nachgetragen',
    deviations: [],
    finalize: true
  }, manualFirstAthleteId);
  assert.equal(finalized.completed_session_id, completedId);
  assert.equal(finalized.planned_session_id, plannedSessionId);

  const counts = await db.query('SELECT COUNT(*)::int AS count FROM completed_sessions WHERE athlete_id=?', [manualFirstAthleteId]);
  assert.equal(Number(counts[0].count), 1);
});
