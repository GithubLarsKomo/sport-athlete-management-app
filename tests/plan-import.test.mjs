import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalJson,
  normalizeCanonicalPlanImportBundle,
  planContentHash,
  validateCanonicalPlanImportBundle
} from '../src/domain/plan-import.mjs';
import { canonicalPlanImportFixture } from './fixtures/canonical-plan-import.mjs';

test('canonical Skillz plan bundle validates and preserves prescription fields', () => {
  const bundle = canonicalPlanImportFixture();
  assert.deepEqual(validateCanonicalPlanImportBundle(bundle), []);

  const normalized = normalizeCanonicalPlanImportBundle(bundle);
  assert.deepEqual(normalized.errors, []);
  assert.equal(normalized.athleteId, 'athlete-1');
  assert.match(normalized.contentHash, /^[a-f0-9]{64}$/);
  assert.ok(normalized.sourceRefs.includes('skillz@fixture'));

  const session = normalized.planPackage.sessions[0];
  assert.equal(session.id, 'session-1');
  assert.equal(session.local_date, '2026-09-27');
  assert.equal(session.intensity_rule, 'RPE 4-5, conversational');
  assert.equal(session.stop_rule, 'Stop or modify for safety-relevant symptoms');
  assert.equal(session.flexibility, 'movable');
  assert.deepEqual(session.items, [{ type: 'steady', duration_min: 60 }]);
  assert.deepEqual(session.payload, bundle.files['sport-microcycle.json'].sessions[0]);
  assert.deepEqual(normalized.planPackage.microcycle.payload, bundle.files['sport-microcycle.json']);
});

test('canonical content hash is stable across object key order and excludes transport producer metadata', () => {
  const bundle = canonicalPlanImportFixture();
  const hash = planContentHash(bundle.files);

  const reorderedFiles = Object.fromEntries(Object.entries(bundle.files).reverse().map(([name, artifact]) => [
    name,
    Object.fromEntries(Object.entries(artifact).reverse())
  ]));
  assert.equal(planContentHash(reorderedFiles), hash);

  const changedProducer = structuredClone(bundle);
  changedProducer.producer.source_ref = 'skillz@another-transport-ref';
  assert.equal(planContentHash(changedProducer.files), hash);

  const changedPlan = structuredClone(bundle);
  changedPlan.files['sport-microcycle.json'].sessions[0].planned_duration_min = 80;
  assert.notEqual(planContentHash(changedPlan.files), hash);
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test('invalid canonical bundle is rejected before persistence', () => {
  const bundle = canonicalPlanImportFixture();
  bundle.producer.contract_version = '9.9.9';
  bundle.files['sport-training-plan.json'].microcycleRef = 'other.json';
  bundle.files['sport-microcycle.json'].sessions[0].planned_rpe = 11;

  const errors = validateCanonicalPlanImportBundle(bundle);
  assert.ok(errors.some(error => error.includes('contract_version')));
  assert.ok(errors.some(error => error.includes('microcycleRef')));
  assert.ok(errors.some(error => error.includes('planned_rpe')));
  assert.ok(normalizeCanonicalPlanImportBundle(bundle).errors.length >= 3);
});

test('companion artifacts contribute provenance and must not cross athlete scope', () => {
  const bundle = canonicalPlanImportFixture();
  bundle.files['endurance-plan.json'] = {
    schema_version: 1,
    athlete_id: 'athlete-1',
    generated_at: '2026-09-27T16:00:00.000Z',
    source_refs: ['endurance:source'],
    uncertainties: [],
    safety_flags: [],
    note: 'transport-only companion'
  };
  const normalized = normalizeCanonicalPlanImportBundle(bundle);
  assert.deepEqual(normalized.errors, []);
  assert.ok(normalized.sourceRefs.includes('endurance:source'));

  bundle.files['endurance-plan.json'].athlete_id = 'other-athlete';
  assert.ok(validateCanonicalPlanImportBundle(bundle).some(error => error.includes('same athlete_id')));
});

test('canonical artifact athlete identifiers must agree', () => {
  const bundle = canonicalPlanImportFixture();
  bundle.files['sport-microcycle.json'].athlete_id = 'other-athlete';
  assert.ok(validateCanonicalPlanImportBundle(bundle).some(error => error.includes('same athlete_id')));
});
