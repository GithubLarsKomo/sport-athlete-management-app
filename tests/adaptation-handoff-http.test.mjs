import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApplication } from '../src/app.mjs';
import { ADAPTATION_PROPOSAL_KIND } from '../src/domain/adaptation-handoff.mjs';

function config() {
  return {
    nodeEnv:'development',
    appStatus:'active',
    publicOrigin:'',
    auth:{ mode:'dev', devUserId:'subject-1', devEmail:'user@example.com', devName:'User' },
    skillz:{ adaptationUrl:'', token:'', timeoutMs:5000 },
    specialist:{ serviceSecret:'' },
    concept2:{}
  };
}

async function withServer(repository, fn) {
  const server=createServer(createApplication({config:config(),repository}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const {port}=server.address();
  try { await fn(port); } finally { await new Promise(resolve=>server.close(resolve)); }
}

function baseRepository({ coach=false, assigned=true }={}) {
  let stored=null;
  let version=1;
  const audits=[];
  return {
    audits,
    get version(){ return version; },
    async resolvePrincipal(identity) {
      return coach ? {...identity,role:'coach',athleteId:null} : {...identity,role:'athlete',athleteId:'athlete-a'};
    },
    async coachCanAccess(){ return assigned; },
    async audit(athleteId,actor,eventType,entityType,entityId,details) {
      audits.push({athleteId,actor,eventType,entityType,entityId,details});
    },
    async getProfile(){ return {profile_version:1,sport:'rowing',discipline:'1x',availability:{sessions_per_week:6},equipment:[],performance_history:[],health_constraints:[],preferences:{}}; },
    async getGoals(){ return [{id:'goal-1',goal_type:'performance',description:'2k',target_value:null,target_unit:null,target_date:null,priority:1,status:'active'}]; },
    async getContext(){ return {active_goal:null,next_competition:null,season:null,mesocycle:null,microcycle:null}; },
    async getWeekComparison(){
      return {
        from:'2026-09-28',to:'2026-10-04',
        sessions:[{plan:{planned_session_id:'session-1',local_date:'2026-09-29',planned_start:'2026-09-29T17:00:00.000Z',session_type:'rowing',objective:'Quality',planned_duration_min:60,planned_rpe:7,status:'planned',version},actual:null}],
        unplanned:[],summary:{planned_sessions:1,completed_planned_sessions:0,unplanned_sessions:0,planned_duration_min:60,actual_duration_min:0,planned_rpe_average:7,actual_rpe_average:null}
      };
    },
    async getCheckins(){ return []; },
    async listPerformanceTests(){ return []; },
    async listPlanImports(){ return [{import_id:'import-1',revision:1,content_hash:'hash-1',producer:{repository:'GithubLarsKomo/skillz',workflow:'sport-training-plan-workflow',contract_version:'0.1.0',source_ref:'skillz@1'},source_refs:['skillz:1'],supersedes_import_id:null,imported_at:'2026-09-27T12:00:00.000Z'}]; },
    async saveAdaptation(athleteId,decision,actor) {
      stored={decision,applied_at:null,applied_by_subject:null};
      audits.push({eventType:'adaptation.recorded',athleteId,actor});
      return decision;
    },
    async getAdaptationById(athleteId,id) {
      if (!stored || stored.decision.adaptation_decision_id!==id) return null;
      return stored;
    },
    async applySessionRevision(athleteId,id,command,actor) {
      if (!stored || stored.decision.adaptation_decision_id!==id) throw Object.assign(new Error('adaptation_decision_not_found'),{statusCode:404});
      if (stored.applied_at) throw Object.assign(new Error('adaptation_decision_already_applied'),{statusCode:409});
      if (command.expected_version!==version) throw Object.assign(new Error('plan_version_conflict'),{statusCode:409});
      const prior=version;
      version+=1;
      stored.applied_at='2026-09-28T10:10:00.000Z';
      stored.applied_by_subject=actor;
      return {revision_id:'rev-1',session_id:command.entity_id,prior_version:prior,new_version:version,status:'modified'};
    },
    async getLatestAdaptation(){ return stored?.decision || null; },
    async getAdaptationHistory(){ return stored ? [stored.decision] : []; }
  };
}

function proposal(handoff) {
  return {
    schema_version:1,
    kind:ADAPTATION_PROPOSAL_KIND,
    contract_version:'1.0.0',
    proposal_id:'proposal-1',
    athlete_id:'athlete-a',
    handoff_id:handoff.handoff_id,
    handoff_from:'2026-09-28',
    generated_at:'2026-09-28T10:00:00.000Z',
    producer:{name:'manual-skillz',version:'1'},
    decision_level:'tactical',
    action:'reduce_volume',
    safety_state:'YELLOW',
    trigger:'manual review',
    rationale:'Reduce next session duration.',
    confidence:0.8,
    source_refs:[],
    uncertainties:[],
    safety_flags:[],
    revised_plan:{entity_type:'planned_session',entity_id:'session-1',expected_version:1,patch:{planned_duration_min:45}}
  };
}

test('handoff export is inspectable and proposal import alone never mutates the plan', async () => {
  const repository=baseRepository();
  await withServer(repository,async port=>{
    const handoffResponse=await fetch(`http://127.0.0.1:${port}/api/v1/adaptation/handoff?from=2026-09-28`);
    assert.equal(handoffResponse.status,200);
    const {handoff}=await handoffResponse.json();
    assert.equal(repository.version,1);

    const imported=await fetch(`http://127.0.0.1:${port}/api/v1/adaptation/proposals`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(proposal(handoff))
    });
    assert.equal(imported.status,201);
    const body=await imported.json();
    assert.equal(repository.version,1);
    assert.equal(body.decision.origin,'manual_handoff_import');

    const applied=await fetch(`http://127.0.0.1:${port}/api/v1/adaptation/${body.decision.adaptation_decision_id}/apply`,{
      method:'POST',headers:{'content-type':'application/json'},body:'{}'
    });
    assert.equal(applied.status,200);
    assert.equal(repository.version,2);

    const second=await fetch(`http://127.0.0.1:${port}/api/v1/adaptation/${body.decision.adaptation_decision_id}/apply`,{
      method:'POST',headers:{'content-type':'application/json'},body:'{}'
    });
    assert.equal(second.status,409);
    assert.equal(repository.version,2);
  });
  assert.ok(repository.audits.some(row=>row.eventType==='adaptation.handoff_exported'));
  assert.ok(repository.audits.some(row=>row.eventType==='adaptation.proposal_imported'));
});

test('invalid proposal fails closed and stale handoff conflicts without persistence', async () => {
  const repository=baseRepository();
  let saves=0;
  const original=repository.saveAdaptation;
  repository.saveAdaptation=async (...args)=>{ saves+=1; return original(...args); };

  await withServer(repository,async port=>{
    const invalid=await fetch(`http://127.0.0.1:${port}/api/v1/adaptation/proposals`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({schema_version:1})
    });
    assert.equal(invalid.status,422);
    assert.equal(saves,0);
    assert.equal(repository.version,1);

    const handoffResponse=await fetch(`http://127.0.0.1:${port}/api/v1/adaptation/handoff?from=2026-09-28`);
    const {handoff}=await handoffResponse.json();
    const stale=proposal(handoff);
    stale.handoff_id=`sha256:${'0'.repeat(64)}`;
    const response=await fetch(`http://127.0.0.1:${port}/api/v1/adaptation/proposals`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(stale)
    });
    assert.equal(response.status,409);
    assert.equal(saves,0);
    assert.equal(repository.version,1);
  });
});

test('unassigned Coach cannot export, import or apply adaptation handoffs', async () => {
  const repository=baseRepository({coach:true,assigned:false});
  await withServer(repository,async port=>{
    const headers={'x-sam-target-athlete':'athlete-a','content-type':'application/json'};
    const exportResponse=await fetch(`http://127.0.0.1:${port}/api/v1/adaptation/handoff?from=2026-09-28`,{headers});
    assert.equal(exportResponse.status,403);

    const importResponse=await fetch(`http://127.0.0.1:${port}/api/v1/adaptation/proposals`,{method:'POST',headers,body:'{}'});
    assert.equal(importResponse.status,403);

    const applyResponse=await fetch(`http://127.0.0.1:${port}/api/v1/adaptation/decision-1/apply`,{method:'POST',headers,body:'{}'});
    assert.equal(applyResponse.status,403);
  });
});
