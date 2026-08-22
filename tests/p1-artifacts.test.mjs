import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECIALIST_ARTIFACT_TYPES, normalizeSpecialistArtifact, specialistIngestAuthorized, validateSpecialistArtifact } from '../src/domain/p1-artifacts.mjs';

const envelope = {
  schema_version: 1,
  athlete_id: 'foreign-athlete',
  generated_at: '2026-08-22T15:00:00.000Z',
  source_refs: ['skillz:test'],
  uncertainties: [],
  safety_flags: []
};

test('P1 exposes every canonical specialist artifact type', () => {
  assert.deepEqual(SPECIALIST_ARTIFACT_TYPES, [
    'strength_power_plan',
    'endurance_plan',
    'recovery_state',
    'fueling_plan',
    'energy_availability_risk',
    'rehab_progression',
    'return_after_illness_plan',
    'testing_plan',
    'adaptation_analysis'
  ]);
});

test('normalization makes the product target athlete authoritative', () => {
  const input = {
    ...envelope,
    window_start: '2026-08-18',
    window_end: '2026-08-22',
    baseline: {},
    current_signals: {},
    trend: {},
    interventions: [],
    next_re_evaluation: '2026-08-23T06:00:00.000Z',
    confidence: 0.8
  };
  const result = normalizeSpecialistArtifact('recovery_state', 'athlete-1', input);
  assert.deepEqual(result.errors, []);
  assert.equal(result.artifact.athlete_id, 'athlete-1');
  assert.equal(input.athlete_id, 'foreign-athlete');
});

test('energy availability state remains constrained and sex-neutral', () => {
  const valid = { ...envelope, risk_state: 'review', signals: [], confidence: 0.7, routing: {} };
  assert.deepEqual(validateSpecialistArtifact('energy_availability_risk', valid), []);
  const invalid = { ...valid, risk_state: 'female_only' };
  assert.ok(validateSpecialistArtifact('energy_availability_risk', invalid).some(error => error.includes('risk_state')));
});

test('specialist ingest requires an exact independent shared secret', () => {
  const config = { p1: { ingestSecret: '0123456789abcdef0123456789abcdef', ingestHeader: 'x-sam-p1-ingest-secret' } };
  assert.equal(specialistIngestAuthorized({ headers: { 'x-sam-p1-ingest-secret': '0123456789abcdef0123456789abcdef' } }, config), true);
  assert.equal(specialistIngestAuthorized({ headers: { 'x-sam-p1-ingest-secret': 'wrong' } }, config), false);
  assert.equal(specialistIngestAuthorized({ headers: {} }, config), false);
  assert.equal(specialistIngestAuthorized({ headers: { 'x-sam-p1-ingest-secret': '0123456789abcdef0123456789abcdef' } }, { p1: { ingestSecret: '' } }), false);
});
