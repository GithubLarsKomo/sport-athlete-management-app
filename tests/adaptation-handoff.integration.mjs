import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/persistence/db.mjs';
import { createRepository } from '../src/persistence/repository.mjs';
import { createActivityRepository } from '../src/persistence/activity-repository.mjs';
import { createPerformanceTestRepository } from '../src/persistence/performance-test-repository.mjs';
import { commonEnvelope } from '../src/domain/contracts.mjs';
import { buildAdaptationHandoff, proposalToAdaptationDecision, validateAdaptationProposal } from '../src/domain/adaptation-handoff.mjs';
import { validateSessionRevisionCommand } from '../src/domain/planning.mjs';

const config=loadConfig();
const db=createDatabase(config);
const repository=Object.assign(createRepository(db),createActivityRepository(db),createPerformanceTestRepository(db));
const athleteId=`handoff-${randomUUID()}`;
const actor=`subject-${athleteId}`;
const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
const today=fmt.format(new Date());
const plusDate=days=>{const d=new Date(`${today}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};

test.after(async()=>{await db.close();});

test('manual proposal import leaves plan untouched until one explicit apply', async()=>{
  await repository.ensureAthlete({subject:actor,athleteId,email:null,displayName:'Handoff Athlete'});
  await repository.putProfile(athleteId,{
    ...commonEnvelope(athleteId),
    profile_version:1,
    valid_from:new Date().toISOString(),
    sport:'rowing',
    discipline:'1x',
    age_band:'50+',
    training_age_years:20,
    availability:{sessions_per_week:6,weekday_minutes:90},
    equipment:['RowErg'],
    performance_history:[],
    health_constraints:[],
    preferences:{}
  },actor);
  await repository.createGoal(athleteId,{
    goal_type:'performance',
    description:'Improve 2k',
    target_value:405,
    target_unit:'s',
    target_date:plusDate(60),
    priority:1
  },actor);
  await repository.saveCheckin(athleteId,{
    ...commonEnvelope(athleteId),
    local_date:today,
    sleep_duration_min:450,
    sleep_quality_1_5:4,
    fatigue_1_5:2,
    soreness_1_5:2,
    stress_1_5:2,
    motivation_1_5:4,
    pain_0_10:0,
    pain_locations:[],
    illness_symptoms:[],
    objective_metrics:[{name:'resting_hr',value:42}]
  },actor);

  const sessionId=randomUUID();
  const start=new Date(`${today}T17:00:00.000Z`);
  const plan={
    schema_version:1,
    season:{id:randomUUID(),version:1,name:'Handoff season',start_date:plusDate(-7),end_date:plusDate(90),status:'active'},
    mesocycle:{id:randomUUID(),version:1,start_date:plusDate(-3),end_date:plusDate(21),primary_adaptation:'specific power'},
    microcycle:{id:randomUUID(),version:1,start_date:today,end_date:plusDate(6),focus:'quality'},
    sessions:[{
      id:sessionId,version:1,local_date:today,planned_start:start.toISOString(),session_type:'rowing',
      objective:'Quality intervals',planned_duration_min:60,planned_rpe:7,status:'planned'
    }]
  };
  await repository.applyPlanPackage(athleteId,plan,actor);

  const first=await buildAdaptationHandoff(repository,athleteId,today);
  const second=await buildAdaptationHandoff(repository,athleteId,today);
  assert.equal(first.handoff_id,second.handoff_id);
  assert.equal(first.morning_checks.length,1);
  assert.equal('objective_metrics' in first.morning_checks[0],false);

  const proposal={
    schema_version:1,
    kind:'sport-athlete-adaptation-proposal',
    contract_version:'1.0.0',
    proposal_id:'integration-proposal',
    athlete_id:athleteId,
    handoff_id:first.handoff_id,
    handoff_from:today,
    generated_at:new Date().toISOString(),
    producer:{name:'integration-manual',version:'1'},
    decision_level:'tactical',
    action:'reduce_volume',
    safety_state:'YELLOW',
    trigger:'integration test',
    rationale:'Reduce duration for the next session.',
    confidence:0.8,
    source_refs:[],
    uncertainties:[],
    safety_flags:[],
    revised_plan:{entity_type:'planned_session',entity_id:sessionId,expected_version:1,patch:{planned_duration_min:45,planned_rpe:6}}
  };
  assert.deepEqual(validateAdaptationProposal(proposal,{athleteId}),[]);
  assert.deepEqual(validateSessionRevisionCommand(proposal.revised_plan),[]);

  const decision=proposalToAdaptationDecision(proposal,first);
  await repository.saveAdaptation(athleteId,decision,actor);

  const before=await repository.getPlannedSessionById(athleteId,sessionId);
  assert.equal(Number(before.version),1);
  assert.equal(Number(before.planned_duration_min),60);

  const revision=await repository.applySessionRevision(athleteId,decision.adaptation_decision_id,proposal.revised_plan,actor);
  assert.equal(revision.prior_version,1);
  assert.equal(revision.new_version,2);

  const after=await repository.getPlannedSessionById(athleteId,sessionId);
  assert.equal(Number(after.version),2);
  assert.equal(Number(after.planned_duration_min),45);
  assert.equal(Number(after.planned_rpe),6);

  const record=await repository.getAdaptationById(athleteId,decision.adaptation_decision_id);
  assert.equal(record.applied_by_subject,actor);
  await assert.rejects(
    ()=>repository.applySessionRevision(athleteId,decision.adaptation_decision_id,proposal.revised_plan,actor),
    error=>error.statusCode===409 && error.message==='adaptation_decision_already_applied'
  );
});
