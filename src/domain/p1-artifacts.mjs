import { timingSafeEqual } from 'node:crypto';

const TYPES = Object.freeze({
  strength_power_plan: { definition: 'strengthPowerPlan', required: ['plan_version','objective','mesocycle_ref','exercises','progression','stop_rules'] },
  endurance_plan: { definition: 'endurancePlan', required: ['plan_version','objective','reference_model','sessions','progression','stop_rules'] },
  recovery_state: { definition: 'recoveryState', required: ['window_start','window_end','baseline','current_signals','trend','interventions','next_re_evaluation'] },
  fueling_plan: { definition: 'fuelingPlan', required: ['plan_version','load_context','session_fueling','hydration','protein_strategy','re_evaluation'] },
  energy_availability_risk: { definition: 'energyAvailabilityRisk', required: ['risk_state','signals','confidence','routing'] },
  rehab_progression: { definition: 'rehabProgression', required: ['restriction_source','current_phase','entry_criteria','exit_criteria','load_components','response_rules','next_re_evaluation'] },
  return_after_illness_plan: { definition: 'returnAfterIllnessPlan', required: ['symptom_state','current_stage','stages','progression_criteria','regression_criteria','medical_routing'] },
  testing_plan: { definition: 'testingPlan', required: ['plan_version','decision_questions','tests','timing','standardization','retest_plan'] },
  adaptation_analysis: { definition: 'adaptationAnalysis', required: ['analysis_window','data_coverage','baseline_method','trends','interpretations','alternative_explanations','confidence','next_measurements'] }
});

const RECOVERY_PHASES = new Set(['protection','restore_load','force_capacity','power_elastic','sport_specific','return_participation','return_sport','return_performance']);
const ENERGY_RISK_STATES = new Set(['no_signal','monitor','review','urgent_review','unknown']);

export const SPECIALIST_ARTIFACT_TYPES = Object.freeze(Object.keys(TYPES));

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (!left.length || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function specialistIngestAuthorized(req, config) {
  const secret = config.p1?.ingestSecret || '';
  if (!secret) return false;
  const header = config.p1?.ingestHeader || 'x-sam-p1-ingest-secret';
  return safeEqual(firstHeader(req.headers[header]), secret);
}

export function specialistTypeInfo(type) {
  return TYPES[type] || null;
}

export function validateSpecialistArtifact(type, artifact) {
  const spec = TYPES[type];
  const errors = [];
  if (!spec) return ['unsupported_specialist_artifact_type'];
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return ['artifact_must_be_object'];

  if (artifact.schema_version !== 1) errors.push('schema_version must equal 1');
  if (!String(artifact.athlete_id || '').trim()) errors.push('athlete_id is required');
  if (!artifact.generated_at || Number.isNaN(Date.parse(artifact.generated_at))) errors.push('generated_at must be a valid date-time');
  for (const key of ['source_refs','uncertainties','safety_flags']) if (!Array.isArray(artifact[key])) errors.push(`${key} must be an array`);
  for (const key of spec.required) if (!(key in artifact) || artifact[key] === null || artifact[key] === '') errors.push(`${key} is required`);

  if ('plan_version' in artifact && (!Number.isInteger(Number(artifact.plan_version)) || Number(artifact.plan_version) < 1)) errors.push('plan_version must be an integer >= 1');
  if ('confidence' in artifact && (typeof artifact.confidence !== 'number' || artifact.confidence < 0 || artifact.confidence > 1)) errors.push('confidence must be 0..1');
  if (type === 'energy_availability_risk' && !ENERGY_RISK_STATES.has(artifact.risk_state)) errors.push('invalid energy availability risk_state');
  if (type === 'rehab_progression' && !RECOVERY_PHASES.has(artifact.current_phase)) errors.push('invalid rehabilitation current_phase');
  if (type === 'return_after_illness_plan' && (!Number.isInteger(Number(artifact.current_stage)) || Number(artifact.current_stage) < 0)) errors.push('current_stage must be an integer >= 0');

  return errors;
}

export function normalizeSpecialistArtifact(type, athleteId, input) {
  const artifact = {
    ...(input || {}),
    schema_version: 1,
    athlete_id: athleteId
  };
  const errors = validateSpecialistArtifact(type, artifact);
  return { artifact, errors, definition: TYPES[type]?.definition || null };
}
