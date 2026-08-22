import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlanPackage, validateSessionRevisionCommand } from '../src/domain/planning.mjs';

function validPlan() {
  return {
    schema_version: 1,
    season: { id:'season', version:1, name:'Season', start_date:'2026-08-01', end_date:'2026-10-31', status:'active' },
    mesocycle: { id:'meso', version:1, start_date:'2026-08-10', end_date:'2026-09-06', primary_adaptation:'power' },
    microcycle: { id:'micro', version:1, start_date:'2026-08-17', end_date:'2026-08-23', focus:'quality' },
    sessions: [{ id:'session', version:1, local_date:'2026-08-22', planned_start:'2026-08-22T17:00:00+02:00', session_type:'rowing', objective:'race pace', planned_duration_min:60, planned_rpe:7, status:'planned' }]
  };
}

test('valid plan hierarchy passes', () => assert.deepEqual(validatePlanPackage(validPlan()), []));

test('microcycle outside mesocycle is rejected', () => {
  const plan=validPlan(); plan.microcycle.end_date='2026-09-20';
  assert.ok(validatePlanPackage(plan).some(e=>e.includes('inside mesocycle')));
});

test('session revision is allow-listed and version-bound', () => {
  const valid={entity_type:'planned_session',entity_id:'session',expected_version:1,patch:{planned_duration_min:45,planned_rpe:5}};
  assert.deepEqual(validateSessionRevisionCommand(valid),[]);
  assert.ok(validateSessionRevisionCommand({...valid,patch:{athlete_id:'other'}}).some(e=>e.includes('unsupported')));
});
