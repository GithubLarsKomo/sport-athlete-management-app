import { specialistDescriptor } from './specialist-registry.mjs';

const ROUTES = Object.freeze({
  goal_or_plan_changed: ['strength_power_plan','endurance_plan','fueling_plan','testing_plan'],
  mesocycle_started: ['strength_power_plan','endurance_plan','fueling_plan','testing_plan'],
  microcycle_started: ['strength_power_plan','endurance_plan','recovery_state','fueling_plan'],
  key_session_completed: ['recovery_state','adaptation_analysis'],
  monitoring_mismatch: ['recovery_state','adaptation_analysis','energy_availability_risk'],
  longitudinal_review: ['adaptation_analysis','recovery_state','energy_availability_risk'],
  injury_state_changed: ['rehab_progression'],
  illness_state_changed: ['return_after_illness_plan'],
  retest_checkpoint: ['testing_plan','adaptation_analysis'],
  performance_psychology_needed: ['performance_psychology_plan'],
  mental_health_concern: ['mental_health_routing'],
  music_profile_requested: ['training_music_profile'],
  travel_context_changed: ['environment_adjustment']
});

export const SPECIALIST_TRIGGERS = Object.freeze([...Object.keys(ROUTES), 'explicit_specialist_request']);

export function routeSpecialists(trigger, requestedTypes = []) {
  if (trigger === 'explicit_specialist_request') {
    const unique = [...new Set(requestedTypes.map(String))];
    const invalid = unique.filter(type => !specialistDescriptor(type));
    if (invalid.length) return { types: [], errors: [`unsupported requested type: ${invalid.join(', ')}`] };
    if (!unique.length) return { types: [], errors: ['explicit_specialist_request requires requested_types'] };
    return { types: unique, errors: [] };
  }
  const types = ROUTES[trigger];
  if (!types) return { types: [], errors: ['unsupported specialist trigger'] };
  return { types: [...types], errors: [] };
}
