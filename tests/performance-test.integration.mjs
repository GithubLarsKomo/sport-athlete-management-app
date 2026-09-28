import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/persistence/db.mjs';
import { createRepository } from '../src/persistence/repository.mjs';
import { createPerformanceTestRepository } from '../src/persistence/performance-test-repository.mjs';
import { classifiedValue } from '../src/domain/performance-tests.mjs';

const config = loadConfig();
const db = createDatabase(config);
const repository = Object.assign(createRepository(db), createPerformanceTestRepository(db));
const athleteId = `perf-${randomUUID()}`;
const actor = `subject-${athleteId}`;

test.before(async () => {
  await repository.ensureAthlete({
    subject: actor,
    athleteId,
    email: null,
    displayName: 'Performance Test Athlete'
  });
});

test.after(async () => {
  await db.close();
});

test('fixed RowErg test plan, result and measurement classes persist and reload with actor provenance', async () => {
  const protocols = await repository.listTestProtocols(athleteId);
  for (const id of ['rowerg-500m','rowerg-1000m','rowerg-2000m','rowerg-5000m','rowerg-30min']) {
    assert.ok(protocols.some(protocol => protocol.protocol_id === id && protocol.source === 'built_in'));
  }

  const planned = await repository.planPerformanceTest(athleteId, {
    protocol_id:'rowerg-2000m',
    protocol_version:1,
    scheduled_at:'2026-10-01T17:00:00.000Z',
    expected_targets:{
      pace_500_s:classifiedValue(102, 's/500m', 'assumed_or_estimated', 'coach:target-v1')
    },
    warm_up:{ description:'20 min progressive' },
    environment:{ location:'indoor' },
    notes:'Baseline test'
  }, actor);

  assert.equal(planned.status, 'planned');
  assert.equal(planned.planned_by_subject, actor);
  assert.equal(planned.expected_targets.pace_500_s.measurement_class, 'assumed_or_estimated');

  const performed = await repository.performPerformanceTest(athleteId, planned.test_id, {
    performed_at:'2026-10-01T17:10:00.000Z',
    device:'Concept2 PM5',
    metrics:{
      duration_s:classifiedValue(410.2, 's', 'measured', 'pm5:result'),
      distance_m:classifiedValue(2000, 'm', 'measured', 'pm5:result'),
      pace_500_s:classifiedValue(102.55, 's/500m', 'derived', 'calc:duration/distance'),
      heart_rate_bpm:classifiedValue(171, 'bpm', 'measured', 'hrm:average'),
      stroke_rate_spm:classifiedValue(31, 'spm', 'measured', 'pm5:result'),
      rpe:classifiedValue(9, 'RPE', 'measured', 'athlete:self-report')
    },
    notes:'Even split',
    interpretation_refs:['skillz:testing:pending']
  }, actor);

  assert.equal(performed.status, 'performed');
  assert.equal(performed.performed_by_subject, actor);
  assert.equal(performed.result.metrics.duration_s.measurement_class, 'measured');
  assert.equal(performed.result.metrics.pace_500_s.measurement_class, 'derived');

  const reloaded = await repository.getPerformanceTest(athleteId, planned.test_id);
  assert.equal(reloaded.result.metrics.pace_500_s.source_ref, 'calc:duration/distance');
  assert.deepEqual(reloaded.interpretation_refs, ['skillz:testing:pending']);
});

test('RowErg and bike lactate stages plus a custom staged protocol persist without schema redesign', async () => {
  const rowerg = await repository.planPerformanceTest(athleteId, {
    protocol_id:'rowerg-lactate-step',
    protocol_version:1,
    scheduled_at:'2026-10-02T07:00:00.000Z'
  }, actor);
  const rowergDone = await repository.performPerformanceTest(athleteId, rowerg.test_id, {
    performed_at:'2026-10-02T07:10:00.000Z',
    device:'Concept2 PM5 + Lactate Scout',
    stages:[
      {
        stage_number:1,
        metrics:{
          duration_s:classifiedValue(240, 's', 'measured'),
          power_w:classifiedValue(180, 'W', 'measured'),
          heart_rate_bpm:classifiedValue(132, 'bpm', 'measured'),
          lactate_mmol_l:classifiedValue(1.2, 'mmol/L', 'measured'),
          rpe:classifiedValue(3, 'RPE', 'measured'),
          stroke_rate_spm:classifiedValue(20, 'spm', 'measured')
        },
        comment:'controlled'
      },
      {
        stage_number:2,
        metrics:{
          duration_s:classifiedValue(240, 's', 'measured'),
          power_w:classifiedValue(220, 'W', 'measured'),
          heart_rate_bpm:classifiedValue(148, 'bpm', 'measured'),
          lactate_mmol_l:classifiedValue(2.1, 'mmol/L', 'measured'),
          rpe:classifiedValue(5, 'RPE', 'measured'),
          stroke_rate_spm:classifiedValue(24, 'spm', 'measured')
        }
      }
    ]
  }, actor);
  assert.equal(rowergDone.result.stages.length, 2);
  assert.equal(rowergDone.result.stages[1].metrics.lactate_mmol_l.value, 2.1);

  const bike = await repository.planPerformanceTest(athleteId, {
    protocol_id:'bike-lactate-step',
    protocol_version:1,
    scheduled_at:'2026-10-03T07:00:00.000Z'
  }, actor);
  const bikeDone = await repository.performPerformanceTest(athleteId, bike.test_id, {
    performed_at:'2026-10-03T07:05:00.000Z',
    device:'Smart trainer + Lactate Scout',
    stages:[
      {
        stage_number:1,
        metrics:{
          duration_s:classifiedValue(300, 's', 'measured'),
          power_w:classifiedValue(180, 'W', 'measured'),
          heart_rate_bpm:classifiedValue(128, 'bpm', 'measured'),
          lactate_mmol_l:classifiedValue(1.1, 'mmol/L', 'measured'),
          cadence_rpm:classifiedValue(88, 'rpm', 'measured'),
          rpe:classifiedValue(3, 'RPE', 'measured')
        }
      }
    ]
  }, actor);
  assert.equal(bikeDone.protocol.modality, 'bike');
  assert.equal(bikeDone.result.stages[0].metrics.cadence_rpm.value, 88);

  const custom = await repository.saveCustomTestProtocol(athleteId, {
    name:'Bike custom 2-stage',
    modality:'bike',
    protocol_kind:'staged',
    stage_fields:['duration_s','power_w','heart_rate_bpm','lactate_mmol_l','rpe','cadence_rpm'],
    stages:[
      {
        stage_number:1,
        target_metrics:{
          duration_s:classifiedValue(300, 's', 'assumed_or_estimated'),
          power_w:classifiedValue(190, 'W', 'assumed_or_estimated')
        }
      },
      {
        stage_number:2,
        target_metrics:{
          duration_s:classifiedValue(300, 's', 'assumed_or_estimated'),
          power_w:classifiedValue(220, 'W', 'assumed_or_estimated')
        }
      }
    ]
  }, actor);

  const plannedCustom = await repository.planPerformanceTest(athleteId, {
    protocol_id:custom.protocol_id,
    protocol_version:custom.version,
    scheduled_at:'2026-10-04T07:00:00.000Z'
  }, actor);
  const reloaded = await repository.getPerformanceTest(athleteId, plannedCustom.test_id);
  assert.equal(reloaded.protocol_source, 'custom');
  assert.equal(reloaded.protocol.stages.length, 2);
  assert.equal(reloaded.protocol.stages[1].target_metrics.power_w.measurement_class, 'assumed_or_estimated');
});


test('custom protocol identity is athlete-scoped and built-in identifiers stay reserved', async () => {
  const shared = {
    protocol_id:'shared-bike-step',
    version:1,
    name:'Shared-name bike step',
    modality:'bike',
    protocol_kind:'staged',
    stage_fields:['duration_s','power_w'],
    stages:[{
      stage_number:1,
      target_metrics:{
        duration_s:classifiedValue(300, 's', 'assumed_or_estimated'),
        power_w:classifiedValue(180, 'W', 'assumed_or_estimated')
      }
    }]
  };

  const first = await repository.saveCustomTestProtocol(athleteId, shared, actor);
  assert.equal(first.protocol_id, 'shared-bike-step');

  const secondAthleteId = `perf-${randomUUID()}`;
  const secondActor = `subject-${secondAthleteId}`;
  await repository.ensureAthlete({
    subject:secondActor,
    athleteId:secondAthleteId,
    email:null,
    displayName:'Second Performance Athlete'
  });
  const second = await repository.saveCustomTestProtocol(secondAthleteId, shared, secondActor);
  assert.equal(second.protocol_id, 'shared-bike-step');

  await assert.rejects(
    () => repository.saveCustomTestProtocol(athleteId, { ...shared, protocol_id:'rowerg-2000m', version:2, name:'collision' }, actor),
    error => error.statusCode === 409 && error.message === 'test_protocol_id_reserved'
  );
});
