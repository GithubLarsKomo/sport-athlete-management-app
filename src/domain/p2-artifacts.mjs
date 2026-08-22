const TYPES = Object.freeze({
  performance_psychology_plan: {
    definition: 'performancePsychologyPlan',
    skill: 'sport-performance-psychology',
    required: ['plan_version','performance_question','target_behavior','skills','practice_blocks','cues','transfer_situations','monitoring','re_evaluation']
  },
  mental_health_routing: {
    definition: 'mentalHealthRouting',
    skill: 'sport-mental-health-routing',
    required: ['routing_version','concern_summary','observed_signals','functioning_course','routing_level','training_boundaries','support_path','privacy_minimization','confidence']
  },
  training_music_profile: {
    definition: 'trainingMusicProfile',
    skill: 'sport-training-music',
    required: ['profile_version','preferences','exclusions','session_goals','activation_target','timing','selection_rules','safety_constraints','feedback_fields']
  },
  environment_adjustment: {
    definition: 'environmentAdjustment',
    skill: 'sport-environment-travel',
    required: ['adjustment_version','exposures','environment_travel_data','target_event','acclimation_strategy','circadian_strategy','microcycle_adjustments','hydration_cooling_context','monitoring','next_re_evaluation']
  }
});

const ROUTING_LEVELS = new Set(['performance_support','monitor','professional_review','urgent']);
const EXPOSURES = new Set(['heat','cold','altitude_hypoxia','travel_fatigue','jet_lag']);
const DIRECT_PLAN_FIELDS = ['revised_plan','plan_patch','automatic_plan_change'];

export const P2_SPECIALIST_ARTIFACT_TYPES = Object.freeze(Object.keys(TYPES));

export function p2SpecialistTypeInfo(type) {
  return TYPES[type] || null;
}

export function validateP2SpecialistArtifact(type, artifact) {
  const spec = TYPES[type];
  const errors = [];
  if (!spec) return ['unsupported_specialist_artifact_type'];
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return ['artifact_must_be_object'];

  if (artifact.schema_version !== 1) errors.push('schema_version must equal 1');
  if (!String(artifact.athlete_id || '').trim()) errors.push('athlete_id is required');
  if (!artifact.generated_at || Number.isNaN(Date.parse(artifact.generated_at))) errors.push('generated_at must be a valid date-time');
  for (const key of ['source_refs','uncertainties','safety_flags']) if (!Array.isArray(artifact[key])) errors.push(`${key} must be an array`);
  for (const key of spec.required) if (!(key in artifact) || artifact[key] === null || artifact[key] === '') errors.push(`${key} is required`);
  if ('confidence' in artifact && (typeof artifact.confidence !== 'number' || artifact.confidence < 0 || artifact.confidence > 1)) errors.push('confidence must be 0..1');
  for (const field of DIRECT_PLAN_FIELDS) if (field in artifact) errors.push(`P2 artifact must not contain ${field}`);

  if (type === 'performance_psychology_plan') {
    for (const field of ['diagnosis','psychotherapy_plan','medication_advice']) if (field in artifact) errors.push(`performance psychology must not contain ${field}`);
  }

  if (type === 'mental_health_routing') {
    if (!ROUTING_LEVELS.has(artifact.routing_level)) errors.push('invalid routing_level');
    if (artifact.routing_level === 'urgent') {
      if (artifact.training_boundaries?.performance_optimization_paused !== true) errors.push('urgent routing requires performance_optimization_paused=true');
      if (artifact.support_path?.immediate !== true) errors.push('urgent routing requires support_path.immediate=true');
    }
    for (const field of ['diagnosis','psychotherapy','medication_plan']) if (field in artifact) errors.push(`mental-health routing must not contain ${field}`);
  }

  if (type === 'training_music_profile') {
    if (artifact.bpm_context && artifact.bpm_context.descriptive_only !== true) errors.push('bpm_context must be descriptive_only=true');
    for (const field of ['mandatory_bpm_zone','physiological_zone_from_bpm']) if (field in artifact) errors.push(`training music must not contain ${field}`);
  }

  if (type === 'environment_adjustment') {
    if (!Array.isArray(artifact.exposures) || !artifact.exposures.length) errors.push('exposures must be a non-empty array');
    else if (artifact.exposures.some(value => !EXPOSURES.has(value))) errors.push('invalid exposure');
    if (artifact.exposures?.includes('jet_lag') && (!artifact.circadian_strategy || !Object.keys(artifact.circadian_strategy).length)) errors.push('jet_lag requires circadian_strategy');
    for (const field of ['medical_clearance','sleep_medication_plan']) if (field in artifact) errors.push(`environment adjustment must not contain ${field}`);
  }

  return errors;
}

export function normalizeP2SpecialistArtifact(type, athleteId, input) {
  const artifact = {
    ...(input || {}),
    schema_version: 1,
    athlete_id: athleteId
  };
  return {
    artifact,
    errors: validateP2SpecialistArtifact(type, artifact),
    definition: TYPES[type]?.definition || null,
    skill: TYPES[type]?.skill || null
  };
}
