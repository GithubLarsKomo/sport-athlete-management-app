import {
  SPECIALIST_ARTIFACT_TYPES as P1_TYPES,
  normalizeSpecialistArtifact as normalizeP1,
  specialistTypeInfo as p1TypeInfo
} from './p1-artifacts.mjs';
import {
  P2_SPECIALIST_ARTIFACT_TYPES as P2_TYPES,
  normalizeP2SpecialistArtifact as normalizeP2,
  p2SpecialistTypeInfo
} from './p2-artifacts.mjs';

const P1_SKILLS = Object.freeze({
  strength_power_plan: 'sport-strength-power-programming',
  endurance_plan: 'sport-endurance-programming',
  recovery_state: 'sport-recovery-sleep',
  fueling_plan: 'sport-nutrition-fueling',
  energy_availability_risk: 'sport-nutrition-fueling',
  rehab_progression: 'sport-injury-rehabilitation',
  return_after_illness_plan: 'sport-return-after-illness',
  testing_plan: 'sport-testing-battery',
  adaptation_analysis: 'sport-adaptation-analysis'
});

export const SPECIALIST_ARTIFACT_TYPES = Object.freeze([...P1_TYPES, ...P2_TYPES]);

export function specialistDescriptor(type) {
  const p1 = p1TypeInfo(type);
  if (p1) return { type, layer: 'p1', definition: p1.definition, skill: P1_SKILLS[type] };
  const p2 = p2SpecialistTypeInfo(type);
  if (p2) return { type, layer: 'p2', definition: p2.definition, skill: p2.skill };
  return null;
}

export function specialistTypesForLayer(layer) {
  if (layer === 'p1') return P1_TYPES;
  if (layer === 'p2') return P2_TYPES;
  return [];
}

export function normalizeAnySpecialistArtifact(type, athleteId, input) {
  const descriptor = specialistDescriptor(type);
  if (!descriptor) return { artifact: null, errors: ['unsupported_specialist_artifact_type'], definition: null, skill: null, layer: null };
  const result = descriptor.layer === 'p1' ? normalizeP1(type, athleteId, input) : normalizeP2(type, athleteId, input);
  return { ...result, skill: descriptor.skill, layer: descriptor.layer };
}
