import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApplication } from '../src/app.mjs';

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

function source() {
  return {
    account:{athlete_id:'athlete-a',email:'a@example.com'},
    profiles:[],goals:[],competitions:[],
    planning:{seasons:[],mesocycles:[],microcycles:[],planned_sessions:[],plan_imports:[],revisions:[]},
    journal:{completed_sessions:[],activities:[],activity_sources:[{provider:'garmin',raw_sha256:'a'.repeat(64),summary:{}}],entries:[],coach_notes:[]},
    checkins:[],
    performance_testing:{protocols:[],tests:[]},
    adaptation_history:[],
    specialists:{artifacts:[],reasoning_runs:[]},
    audit:[]
  };
}

function repositoryFixture({coach=false, assigned=true}={}) {
  const audits=[];
  let exportReads=0;
  return {
    audits,
    get exportReads(){ return exportReads; },
    async resolvePrincipal(identity) {
      return coach ? {...identity,role:'coach',athleteId:null} : {...identity,role:'athlete',athleteId:'athlete-a'};
    },
    async coachCanAccess(){ return assigned; },
    async audit(athleteId,actor,eventType,entityType,entityId,details) {
      audits.push({athleteId,actor,eventType,entityType,entityId,details});
    },
    async getAthleteDataExportSource(athleteId) {
      exportReads+=1;
      assert.equal(athleteId,'athlete-a');
      return source();
    }
  };
}

test('Athlete can self-export structured data and export action is audited', async () => {
  const repository=repositoryFixture();
  await withServer(repository,async port=>{
    const response=await fetch(`http://127.0.0.1:${port}/api/v1/data/export`);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-disposition') || '', /^attachment; filename="sport-athlete-data-export-/);
    const body=await response.json();
    assert.equal(body.kind,'sport-athlete-data-export');
    assert.equal(body.athlete_id,'athlete-a');
    assert.equal(body.manifest.provider_raw_files.included,false);
  });
  assert.equal(repository.exportReads,1);
  assert.ok(repository.audits.some(row=>row.eventType==='data.exported' && row.details.actor_role==='athlete'));
});

test('assigned Coach can export selected athlete and receives explicit export audit', async () => {
  const repository=repositoryFixture({coach:true,assigned:true});
  await withServer(repository,async port=>{
    const response=await fetch(`http://127.0.0.1:${port}/api/v1/data/export`,{
      headers:{'x-sam-target-athlete':'athlete-a'}
    });
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.athlete_id,'athlete-a');
  });
  assert.equal(repository.exportReads,1);
  assert.ok(repository.audits.some(row=>row.eventType==='coach.api_access'));
  assert.ok(repository.audits.some(row=>row.eventType==='data.exported' && row.details.actor_role==='coach'));
});

test('unassigned Coach is denied before export source is read', async () => {
  const repository=repositoryFixture({coach:true,assigned:false});
  await withServer(repository,async port=>{
    const response=await fetch(`http://127.0.0.1:${port}/api/v1/data/export`,{
      headers:{'x-sam-target-athlete':'athlete-a'}
    });
    assert.equal(response.status,403);
    assert.deepEqual(await response.json(),{error:'athlete_scope_forbidden'});
  });
  assert.equal(repository.exportReads,0);
  assert.equal(repository.audits.some(row=>row.eventType==='data.exported'),false);
});
