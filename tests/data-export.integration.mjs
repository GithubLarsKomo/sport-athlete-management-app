import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/persistence/db.mjs';
import { createRepository } from '../src/persistence/repository.mjs';
import { createDataExportRepository } from '../src/persistence/data-export-repository.mjs';
import { buildAthleteDataExport, exportContainsForbiddenKeys } from '../src/domain/data-export.mjs';
import { commonEnvelope } from '../src/domain/contracts.mjs';

const config=loadConfig();
const db=createDatabase(config);
const repository=Object.assign(createRepository(db),createDataExportRepository(db));
const athleteId=`data-export-${randomUUID()}`;
const subject=`subject-${athleteId}`;

test.after(async()=>{ await db.close(); });

test('database export exposes provenance references but not raw provider telemetry or secrets, then deletion removes primary data and retains security evidence', async () => {
  await repository.ensureAthlete({subject,athleteId,email:'export@example.com',displayName:'Export Athlete'});
  await repository.putProfile(athleteId,{
    ...commonEnvelope(athleteId),
    profile_version:1,
    valid_from:new Date().toISOString(),
    sport:'rowing',
    discipline:'1x',
    age_band:'50+',
    training_age_years:20,
    availability:{sessions_per_week:6},
    equipment:['RowErg'],
    performance_history:[],
    health_constraints:[],
    preferences:{},
    access_token:'stored-secret'
  },subject);

  await repository.createGoal(athleteId,{
    goal_type:'performance',
    description:'Sensitive private goal text',
    target_value:360,
    target_unit:'seconds',
    priority:1
  },subject);

  const activityId=randomUUID();
  await db.query(
    'INSERT INTO activities (id, athlete_id, activity_type, started_at, ended_at, duration_s, distance_m, canonical_source, canonical_summary_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [activityId,athleteId,'rowing',new Date().toISOString(),new Date().toISOString(),3600,14000,'garmin',JSON.stringify({avg_power_w:220})]
  );
  await db.query(
    'INSERT INTO activity_sources (id, activity_id, athlete_id, provider, external_activity_id, raw_sha256, summary_json, intervals_json, samples_json, raw_payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(),activityId,athleteId,'garmin','garmin-42','a'.repeat(64),JSON.stringify({avg_hr_bpm:150}),JSON.stringify([{power:220}]),JSON.stringify([{hr:150}]),JSON.stringify({access_token:'provider-secret',huge:'raw'})]
  );

  const source=await repository.getAthleteDataExportSource(athleteId);
  const dataExport=buildAthleteDataExport({athleteId,exportId:randomUUID(),source});
  const serialized=JSON.stringify(dataExport);

  assert.equal(source.account.athlete_id,athleteId);
  assert.equal(dataExport.manifest.record_counts.activity_sources,1);
  assert.equal(dataExport.data.journal.activity_sources[0].raw_sha256,'a'.repeat(64));
  assert.equal(exportContainsForbiddenKeys(dataExport),false);
  assert.doesNotMatch(serialized,/stored-secret|provider-secret|huge/);
  assert.equal('raw_payload_json' in dataExport.data.journal.activity_sources[0],false);
  assert.equal('samples_json' in dataExport.data.journal.activity_sources[0],false);
  assert.equal('intervals_json' in dataExport.data.journal.activity_sources[0],false);

  const deleted=await repository.deleteAthleteData(athleteId,'operator:test');
  assert.equal(deleted.deleted,true);

  const remaining=await db.query('SELECT id FROM athletes WHERE id=?',[athleteId]);
  assert.equal(remaining.length,0);
  const rawRemaining=await db.query('SELECT id FROM activity_sources WHERE athlete_id=?',[athleteId]);
  assert.equal(rawRemaining.length,0);

  const audit=await db.query(
    "SELECT event_type, actor_subject, details_json FROM audit_log WHERE athlete_id=? ORDER BY id",
    [athleteId]
  );
  const deletionEvents=audit.filter(row=>['privacy.deletion_started','privacy.deletion_completed'].includes(row.event_type));
  assert.deepEqual(deletionEvents.map(row=>row.event_type),['privacy.deletion_started','privacy.deletion_completed']);
  assert.ok(deletionEvents.every(row=>row.actor_subject==='operator:test'));

  const goalAudit=audit.find(row=>row.event_type==='goal.created');
  assert.ok(goalAudit);
  assert.deepEqual(goalAudit.details_json,{privacy_redacted:true,event_metadata_retained:true});
  assert.doesNotMatch(JSON.stringify(audit),/Sensitive private goal text/);
});
