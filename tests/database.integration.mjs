import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/persistence/db.mjs';
import { createRepository } from '../src/persistence/repository.mjs';
import { commonEnvelope } from '../src/domain/contracts.mjs';

const config = loadConfig();
const db = createDatabase(config);
const repository = createRepository(db);
const athleteId = `it-${randomUUID()}`;

test.after(async () => { await db.close(); });

test('MariaDB persistence preserves versions, ownership and finalization', async () => {
  await repository.ensureAthlete({ subject: athleteId, athleteId, email: null, displayName: 'Integration Athlete' });
  const baseProfile = {
    ...commonEnvelope(athleteId), profile_version: 1, valid_from: new Date().toISOString(), sport: 'rowing', discipline: '1x', age_band: '50+', training_age_years: 20, availability: { days: 6 }
  };
  const v1 = await repository.putProfile(athleteId, { ...baseProfile }, athleteId);
  const v2 = await repository.putProfile(athleteId, { ...baseProfile, discipline: '2x' }, athleteId);
  assert.equal(v1.profile_version, 1);
  assert.equal(v2.profile_version, 2);
  assert.equal((await repository.getProfile(athleteId)).discipline, '2x');

  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  const checkin = { ...commonEnvelope(athleteId), local_date: date, sleep_quality_1_5:4, fatigue_1_5:2, soreness_1_5:2, stress_1_5:2, motivation_1_5:4, pain_0_10:0, pain_locations:[], illness_symptoms:[], objective_metrics:[] };
  await repository.saveCheckin(athleteId, checkin, athleteId);
  assert.equal((await repository.getTodayCheckin(athleteId, date)).motivation_1_5, 4);

  const sessionId = randomUUID();
  const planned = { planned_session_id:sessionId, session_type:'sport', objective:'Integration test', planned_start:new Date().toISOString(), planned_duration_min:30, planned_rpe:5, intensity_rule:'test', stop_rule:'test', flexibility:'key', items:[] };
  await db.query('INSERT INTO planned_sessions (id, athlete_id, microcycle_id, local_date, planned_start, session_type, objective, planned_duration_min, planned_rpe, status, version, payload_json) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [sessionId, athleteId, date, new Date(), 'sport', 'Integration test', 30, 5, 'planned', 1, JSON.stringify(planned)]);

  const now = new Date();
  const completed = { ...commonEnvelope(athleteId), completed_session_id:randomUUID(), planned_session_id:sessionId, started_at:new Date(now.getTime()-30*60000).toISOString(), completed_at:now.toISOString(), duration_min:30, session_rpe:5, session_load:150, completion_status:'modified', deviations:['shortened'] };
  await repository.completeSession(athleteId, sessionId, completed, athleteId);
  const row = await db.query('SELECT status FROM planned_sessions WHERE id=? AND athlete_id=?', [sessionId, athleteId]);
  assert.equal(row[0].status, 'completed');
  await assert.rejects(() => repository.completeSession(athleteId, sessionId, { ...completed, completed_session_id: randomUUID() }, athleteId), error => error.statusCode === 409);

  const foreignAthlete = `it-${randomUUID()}`;
  await repository.ensureAthlete({ subject: foreignAthlete, athleteId: foreignAthlete, email:null, displayName:'Other' });
  await assert.rejects(() => repository.completeSession(foreignAthlete, sessionId, { ...completed, athlete_id:foreignAthlete, completed_session_id:randomUUID() }, foreignAthlete), error => error.statusCode === 404);
});
