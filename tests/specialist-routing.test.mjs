import test from 'node:test';
import assert from 'node:assert/strict';
import { routeSpecialists } from '../src/domain/specialist-routing.mjs';

test('injury state routes only rehabilitation', () => {
  assert.deepEqual(routeSpecialists('injury_state_changed'), { types: ['rehab_progression'], errors: [] });
});

test('mental-health concern routes only mental-health routing', () => {
  assert.deepEqual(routeSpecialists('mental_health_concern'), { types: ['mental_health_routing'], errors: [] });
});

test('travel context routes only environment adjustment', () => {
  assert.deepEqual(routeSpecialists('travel_context_changed'), { types: ['environment_adjustment'], errors: [] });
});

test('goal/plan change does not invoke optional P2 context modules', () => {
  const result = routeSpecialists('goal_or_plan_changed');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.types, ['strength_power_plan','endurance_plan','fueling_plan','testing_plan']);
});

test('explicit specialist request preserves the exact supported set', () => {
  assert.deepEqual(routeSpecialists('explicit_specialist_request', ['training_music_profile','recovery_state','training_music_profile']), {
    types: ['training_music_profile','recovery_state'],
    errors: []
  });
  assert.ok(routeSpecialists('explicit_specialist_request', ['not_real']).errors.length > 0);
  assert.ok(routeSpecialists('explicit_specialist_request', []).errors.length > 0);
});
