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
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Berlin', year:'numeric', month:'2-digit', day:'2-digit' });
const today = fmt.format(new Date());
const plusDate = days => { const d=new Date(); d.setUTCDate(d.getUTCDate()+days); return fmt.format(d); };

test.after(async () => { await db.close(); });

test('MariaDB persistence closes plan -> session -> revision lifecycle safely', async () => {
  await repository.ensureAthlete({ subject: athleteId, athleteId, email: null, displayName: 'Integration Athlete' });
  const baseProfile = {
    ...commonEnvelope(athleteId), profile_version: 1, valid_from: new Date().toISOString(), sport: 'rowing', discipline: '1x', age_band: '50+', training_age_years: 20, availability: { days: 6 }
  };
  const v1 = await repository.putProfile(athleteId, { ...baseProfile }, athleteId);
  const v2 = await repository.putProfile(athleteId, { ...baseProfile, discipline: '2x' }, athleteId);
  assert.equal(v1.profile_version, 1);
  assert.equal(v2.profile_version, 2);

  const checkin = { ...commonEnvelope(athleteId), local_date: today, sleep_quality_1_5:4, fatigue_1_5:2, soreness_1_5:2, stress_1_5:2, motivation_1_5:4, pain_0_10:0, pain_locations:[], illness_symptoms:[], objective_metrics:[] };
  await repository.saveCheckin(athleteId, checkin, athleteId);
  assert.equal((await repository.getTodayCheckin(athleteId, today)).motivation_1_5, 4);

  const sessionId = randomUUID();
  const nextSessionId = randomUUID();
  const start = new Date(); start.setHours(17,0,0,0);
  const nextStart = new Date(start); nextStart.setDate(nextStart.getDate()+1);
  const plan = {
    schema_version:1,
    season:{id:randomUUID(),version:1,name:'Integration season',start_date:plusDate(-7),end_date:plusDate(60),status:'active'},
    mesocycle:{id:randomUUID(),version:1,start_date:plusDate(-3),end_date:plusDate(21),primary_adaptation:'specific power'},
    microcycle:{id:randomUUID(),version:1,start_date:plusDate(-1),end_date:plusDate(5),focus:'quality'},
    sessions:[
      {id:sessionId,version:1,local_date:today,planned_start:start.toISOString(),session_type:'rowing',objective:'Integration test',planned_duration_min:30,planned_rpe:5,status:'planned'},
      {id:nextSessionId,version:1,local_date:plusDate(1),planned_start:nextStart.toISOString(),session_type:'rowing',objective:'Next session',planned_duration_min:60,planned_rpe:6,status:'planned'}
    ]
  };
  const imported = await repository.applyPlanPackage(athleteId, plan, athleteId);
  assert.equal(imported.session_count, 2);
  assert.equal((await repository.getWeekSessions(athleteId, today)).length, 2);

  const now = new Date();
  const completed = { ...commonEnvelope(athleteId), completed_session_id:randomUUID(), planned_session_id:sessionId, started_at:new Date(now.getTime()-30*60000).toISOString(), completed_at:now.toISOString(), duration_min:30, session_rpe:5, session_load:150, completion_status:'modified', deviations:['shortened'] };
  await repository.completeSession(athleteId, sessionId, completed, athleteId);
  assert.equal((await repository.getPlannedSessionById(athleteId, sessionId)).status, 'completed');
  await assert.rejects(() => repository.completeSession(athleteId, sessionId, { ...completed, completed_session_id: randomUUID() }, athleteId), error => error.statusCode === 409);

  const foreignAthlete = `it-${randomUUID()}`;
  await repository.ensureAthlete({ subject: foreignAthlete, athleteId: foreignAthlete, email:null, displayName:'Other' });
  await assert.rejects(() => repository.completeSession(foreignAthlete, sessionId, { ...completed, athlete_id:foreignAthlete, completed_session_id:randomUUID() }, foreignAthlete), error => error.statusCode === 404);

  const decisionId=randomUUID();
  const command={entity_type:'planned_session',entity_id:nextSessionId,expected_version:1,patch:{planned_duration_min:45,planned_rpe:5}};
  const decision={...commonEnvelope(athleteId),adaptation_decision_id:decisionId,decision_level:'tactical',action:'reduce_volume',safety_state:'YELLOW',trigger:'integration',input_snapshot:{},previous_plan:null,revised_plan:command,rationale:'test revision',responsible_signals:['test'],confidence:.8,human_override:false,engine_version:'integration/1'};
  await repository.saveAdaptation(athleteId,decision,athleteId);
  const revision=await repository.applySessionRevision(athleteId,decisionId,command,athleteId);
  assert.equal(revision.new_version,2);
  const revised=await repository.getPlannedSessionById(athleteId,nextSessionId);
  assert.equal(Number(revised.planned_duration_min),45);
  assert.equal(Number(revised.planned_rpe),5);
  assert.equal(revised.status,'modified');
  await assert.rejects(() => repository.applySessionRevision(athleteId,decisionId,command,athleteId), error => error.statusCode === 409);
});
