import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_TEST_PROTOCOLS,
  PERFORMANCE_MEASUREMENT_CLASSES,
  builtInProtocol,
  classifiedValue,
  validateClassifiedValue,
  validateCustomProtocol,
  validatePerformanceTestPlan,
  validatePerformanceTestResult
} from '../src/domain/performance-tests.mjs';

test('built-in catalogue contains all fixed RowErg and lactate protocols required by VI-004', () => {
  assert.deepEqual(
    BUILT_IN_TEST_PROTOCOLS.map(protocol => protocol.protocol_id),
    [
      'rowerg-500m',
      'rowerg-1000m',
      'rowerg-2000m',
      'rowerg-5000m',
      'rowerg-30min',
      'rowerg-lactate-step',
      'bike-lactate-step'
    ]
  );
  assert.equal(builtInProtocol('rowerg-500m').fixed_target.value, 500);
  assert.equal(builtInProtocol('rowerg-1000m').fixed_target.value, 1000);
  assert.equal(builtInProtocol('rowerg-30min').fixed_target.value, 1800);
  assert.deepEqual(PERFORMANCE_MEASUREMENT_CLASSES, ['measured', 'derived', 'assumed_or_estimated']);
});

test('expected targets can only be stored as assumed_or_estimated', () => {
  assert.deepEqual(
    validateClassifiedValue(classifiedValue(102, 's/500m', 'assumed_or_estimated'), 'target', { expectedOnly: true }),
    []
  );
  assert.match(
    validateClassifiedValue(classifiedValue(102, 's/500m', 'measured'), 'target', { expectedOnly: true }).join('\n'),
    /must be assumed_or_estimated/
  );

  const validPlan = validatePerformanceTestPlan({
    protocol_id: 'rowerg-2000m',
    protocol_version: 1,
    scheduled_at: '2026-10-01T17:00:00.000Z',
    expected_targets: {
      pace_500_s: classifiedValue(102, 's/500m', 'assumed_or_estimated', 'coach:target-v1')
    }
  });
  assert.deepEqual(validPlan, []);
});

test('fixed test result accepts measured and derived values only when every value carries its class', () => {
  const protocol = builtInProtocol('rowerg-2000m');
  const valid = validatePerformanceTestResult({
    performed_at: '2026-10-01T17:10:00.000Z',
    device: 'Concept2 PM5',
    metrics: {
      duration_s: classifiedValue(410.2, 's', 'measured', 'pm5:result'),
      distance_m: classifiedValue(2000, 'm', 'measured', 'pm5:result'),
      pace_500_s: classifiedValue(102.55, 's/500m', 'derived', 'calc:duration/distance'),
      rpe: classifiedValue(9, 'RPE', 'measured', 'athlete:self-report')
    }
  }, protocol);
  assert.deepEqual(valid, []);

  const invalid = validatePerformanceTestResult({
    performed_at: '2026-10-01T17:10:00.000Z',
    device: 'Concept2 PM5',
    metrics: { power_w: { value: 300, unit: 'W' } }
  }, protocol);
  assert.match(invalid.join('\n'), /measurement_class invalid/);
});

test('lactate and generic staged protocols validate without schema redesign', () => {
  const custom = {
    name: 'Bike 4 x 5 min custom',
    modality: 'bike',
    protocol_kind: 'staged',
    stage_fields: ['duration_s', 'power_w', 'heart_rate_bpm', 'lactate_mmol_l', 'rpe', 'cadence_rpm'],
    stages: [
      {
        stage_number: 1,
        target_metrics: {
          duration_s: classifiedValue(300, 's', 'assumed_or_estimated'),
          power_w: classifiedValue(180, 'W', 'assumed_or_estimated')
        }
      },
      {
        stage_number: 2,
        target_metrics: {
          duration_s: classifiedValue(300, 's', 'assumed_or_estimated'),
          power_w: classifiedValue(210, 'W', 'assumed_or_estimated')
        }
      }
    ]
  };
  assert.deepEqual(validateCustomProtocol(custom), []);

  const lactate = builtInProtocol('rowerg-lactate-step');
  const result = validatePerformanceTestResult({
    performed_at: '2026-10-02T07:30:00.000Z',
    device: 'Concept2 PM5 + Lactate Scout',
    stages: [
      {
        stage_number: 1,
        metrics: {
          duration_s: classifiedValue(240, 's', 'measured'),
          power_w: classifiedValue(180, 'W', 'measured'),
          heart_rate_bpm: classifiedValue(132, 'bpm', 'measured'),
          lactate_mmol_l: classifiedValue(1.2, 'mmol/L', 'measured'),
          rpe: classifiedValue(3, 'RPE', 'measured'),
          stroke_rate_spm: classifiedValue(20, 'spm', 'measured')
        },
        comment: 'controlled'
      }
    ]
  }, lactate);
  assert.deepEqual(result, []);

  const duplicateStage = validatePerformanceTestResult({
    performed_at: '2026-10-02T07:30:00.000Z',
    device: 'Concept2 PM5',
    stages: [
      { stage_number: 1, metrics: {} },
      { stage_number: 1, metrics: {} }
    ]
  }, lactate);
  assert.match(duplicateStage.join('\n'), /duplicate result stage_number 1/);
});
