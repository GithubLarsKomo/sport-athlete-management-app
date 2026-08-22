import test from 'node:test';
import assert from 'node:assert/strict';
import { P2_SPECIALIST_ARTIFACT_TYPES, normalizeP2SpecialistArtifact, validateP2SpecialistArtifact } from '../src/domain/p2-artifacts.mjs';

const envelope = {
  schema_version: 1,
  athlete_id: 'foreign-athlete',
  generated_at: '2026-08-22T18:00:00.000Z',
  source_refs: ['skillz:test'],
  uncertainties: [],
  safety_flags: []
};

test('P2 exposes every canonical context artifact type', () => {
  assert.deepEqual(P2_SPECIALIST_ARTIFACT_TYPES, [
    'performance_psychology_plan',
    'mental_health_routing',
    'training_music_profile',
    'environment_adjustment'
  ]);
});

test('P2 normalization makes the product target athlete authoritative', () => {
  const input = {
    ...envelope,
    profile_version: 1,
    preferences: {},
    exclusions: [],
    session_goals: [],
    activation_target: {},
    timing: [],
    selection_rules: [],
    safety_constraints: [],
    feedback_fields: []
  };
  const result = normalizeP2SpecialistArtifact('training_music_profile', 'athlete-1', input);
  assert.deepEqual(result.errors, []);
  assert.equal(result.artifact.athlete_id, 'athlete-1');
  assert.equal(input.athlete_id, 'foreign-athlete');
});

test('urgent mental-health routing must pause performance and route immediate support', () => {
  const value = {
    ...envelope,
    routing_version: 1,
    concern_summary: 'acute concern',
    observed_signals: [],
    functioning_course: {},
    routing_level: 'urgent',
    training_boundaries: { performance_optimization_paused: false },
    support_path: { immediate: false },
    privacy_minimization: {},
    confidence: 0.8
  };
  const errors = validateP2SpecialistArtifact('mental_health_routing', value);
  assert.ok(errors.includes('urgent routing requires performance_optimization_paused=true'));
  assert.ok(errors.includes('urgent routing requires support_path.immediate=true'));
});

test('music BPM remains descriptive only', () => {
  const value = {
    ...envelope,
    profile_version: 1,
    preferences: {},
    exclusions: [],
    session_goals: [],
    activation_target: {},
    timing: [],
    selection_rules: [],
    bpm_context: { descriptive_only: false },
    safety_constraints: [],
    feedback_fields: []
  };
  assert.ok(validateP2SpecialistArtifact('training_music_profile', value).includes('bpm_context must be descriptive_only=true'));
});

test('jet lag requires a circadian strategy and P2 cannot patch the plan', () => {
  const value = {
    ...envelope,
    adjustment_version: 1,
    exposures: ['jet_lag'],
    environment_travel_data: {},
    target_event: {},
    acclimation_strategy: {},
    circadian_strategy: {},
    microcycle_adjustments: [],
    hydration_cooling_context: {},
    monitoring: {},
    next_re_evaluation: '2026-08-23T08:00:00.000Z',
    revised_plan: { entity_type: 'planned_session' }
  };
  const errors = validateP2SpecialistArtifact('environment_adjustment', value);
  assert.ok(errors.includes('jet_lag requires circadian_strategy'));
  assert.ok(errors.includes('P2 artifact must not contain revised_plan'));
});
