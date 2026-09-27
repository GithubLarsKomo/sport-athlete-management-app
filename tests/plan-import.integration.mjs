import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.mjs';
import { normalizeCanonicalPlanImportBundle } from '../src/domain/plan-import.mjs';
import { createDatabase } from '../src/persistence/db.mjs';
import { createRepository } from '../src/persistence/repository.mjs';
import { canonicalPlanImportFixture } from './fixtures/canonical-plan-import.mjs';

const config = loadConfig();
const db = createDatabase(config);
const repository = createRepository(db);

test.after(async () => { await db.close(); });

function uniqueBundle(athleteId) {
  const bundle = canonicalPlanImportFixture(athleteId);
  const suffix = randomUUID().slice(0, 8);
  const season = bundle.files['sport-season-plan.json'];
  const meso = bundle.files['sport-mesocycle.json'];
  const micro = bundle.files['sport-microcycle.json'];
  season.season_id = `season-${suffix}`;
  meso.season_id = season.season_id;
  meso.mesocycle_id = `meso-${suffix}`;
  micro.mesocycle_id = meso.mesocycle_id;
  micro.microcycle_id = `micro-${suffix}`;
  micro.sessions[0].planned_session_id = `session-${suffix}`;
  return bundle;
}

test('canonical plan imports are idempotent and changed content creates immutable revision history', async () => {
  const athleteId = `plan-it-${randomUUID()}`;
  await repository.ensureAthlete({ subject: athleteId, athleteId, email: null, displayName: 'Plan Import Athlete' });

  const bundleV1 = uniqueBundle(athleteId);
  const normalizedV1 = normalizeCanonicalPlanImportBundle(bundleV1);
  assert.deepEqual(normalizedV1.errors, []);

  const first = await repository.importCanonicalPlanBundle(athleteId, normalizedV1, athleteId);
  assert.equal(first.disposition, 'created');
  assert.equal(first.revision, 1);
  assert.match(first.content_hash, /^[a-f0-9]{64}$/);
  assert.equal(first.applied.session_count, 1);

  const repeated = await repository.importCanonicalPlanBundle(athleteId, normalizedV1, athleteId);
  assert.equal(repeated.disposition, 'unchanged');
  assert.equal(repeated.revision, 1);
  assert.equal(repeated.import_id, first.import_id);

  const bundleV2 = structuredClone(bundleV1);
  bundleV2.files['sport-microcycle.json'].sessions[0].objective = 'Aerobic endurance revised';
  bundleV2.files['sport-training-plan.json'].weeks = [{ week: 1, revision: 2 }];
  const normalizedV2 = normalizeCanonicalPlanImportBundle(bundleV2);
  assert.deepEqual(normalizedV2.errors, []);

  const second = await repository.importCanonicalPlanBundle(athleteId, normalizedV2, athleteId);
  assert.equal(second.disposition, 'created');
  assert.equal(second.revision, 2);
  assert.equal(second.supersedes_import_id, first.import_id);
  assert.notEqual(second.content_hash, first.content_hash);

  const history = await repository.listPlanImports(athleteId);
  assert.equal(history.length, 2);
  assert.deepEqual(history.map(record => record.revision), [2, 1]);
  assert.equal(history[0].producer.workflow, 'sport-training-plan-workflow');
  assert.ok(history[0].source_refs.includes('skillz@fixture'));

  const sessionId = bundleV1.files['sport-microcycle.json'].sessions[0].planned_session_id;
  const current = await repository.getPlannedSessionById(athleteId, sessionId);
  assert.equal(current.objective, 'Aerobic endurance revised');
  assert.equal(current.payload.objective, 'Aerobic endurance revised');

  const rows = await db.query(
    'SELECT revision, bundle_json FROM training_plan_imports WHERE athlete_id=? ORDER BY revision',
    [athleteId]
  );
  assert.equal(rows.length, 2);
  const priorBundle = typeof rows[0].bundle_json === 'string' ? JSON.parse(rows[0].bundle_json) : rows[0].bundle_json;
  const revisedBundle = typeof rows[1].bundle_json === 'string' ? JSON.parse(rows[1].bundle_json) : rows[1].bundle_json;
  assert.equal(priorBundle.files['sport-microcycle.json'].sessions[0].objective, 'Aerobic endurance');
  assert.equal(revisedBundle.files['sport-microcycle.json'].sessions[0].objective, 'Aerobic endurance revised');
});
