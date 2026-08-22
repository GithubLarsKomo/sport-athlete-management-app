const COMMON = ['schema_version', 'athlete_id', 'generated_at', 'source_refs', 'uncertainties', 'safety_flags'];

function required(value, fields) {
  const errors = [];
  for (const field of fields) if (!(field in value)) errors.push(`missing ${field}`);
  return errors;
}

function numberIn(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function validDateTime(value) {
  return typeof value === 'string' && value.length >= 20 && Number.isFinite(Date.parse(value));
}

export function validateEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['payload must be an object'];
  const errors = required(value, COMMON);
  if (value.schema_version !== 1) errors.push('schema_version must be 1');
  if (typeof value.athlete_id !== 'string' || !value.athlete_id) errors.push('athlete_id must be non-empty');
  if (!validDateTime(value.generated_at)) errors.push('generated_at must be an ISO date-time');
  for (const field of ['source_refs', 'uncertainties', 'safety_flags']) if (!Array.isArray(value[field])) errors.push(`${field} must be an array`);
  return errors;
}

export function validateCheckin(value) {
  const errors = validateEnvelope(value);
  errors.push(...required(value, ['local_date', 'sleep_quality_1_5', 'fatigue_1_5', 'soreness_1_5', 'stress_1_5', 'motivation_1_5']));
  if (!validDate(value.local_date)) errors.push('local_date must be YYYY-MM-DD');
  if (value.sleep_duration_min != null && (!Number.isInteger(value.sleep_duration_min) || value.sleep_duration_min < 0 || value.sleep_duration_min > 1440)) errors.push('sleep_duration_min must be null or 0..1440');
  for (const field of ['sleep_quality_1_5', 'fatigue_1_5', 'soreness_1_5', 'stress_1_5', 'motivation_1_5']) {
    if (value[field] != null && (!Number.isInteger(value[field]) || !numberIn(value[field], 1, 5))) errors.push(`${field} must be null or an integer 1..5`);
  }
  if (value.pain_0_10 != null && !numberIn(value.pain_0_10, 0, 10)) errors.push('pain_0_10 must be null or 0..10');
  return errors;
}

export function validateCompletedSession(value) {
  const errors = validateEnvelope(value);
  errors.push(...required(value, ['completed_session_id', 'started_at', 'completed_at', 'duration_min', 'session_rpe', 'completion_status']));
  if (!validDateTime(value.started_at)) errors.push('started_at must be an ISO date-time');
  if (!validDateTime(value.completed_at)) errors.push('completed_at must be an ISO date-time');
  if (validDateTime(value.started_at) && validDateTime(value.completed_at) && Date.parse(value.completed_at) < Date.parse(value.started_at)) errors.push('completed_at must not precede started_at');
  if (!numberIn(value.duration_min, 0, Number.MAX_SAFE_INTEGER)) errors.push('duration_min must be >= 0');
  if (!numberIn(value.session_rpe, 0, 10)) errors.push('session_rpe must be 0..10');
  const valid = new Set(['completed', 'modified', 'stopped', 'not_started']);
  if (!valid.has(value.completion_status)) errors.push('invalid completion_status');
  if (numberIn(value.duration_min, 0, Number.MAX_SAFE_INTEGER) && numberIn(value.session_rpe, 0, 10)) {
    const expected = value.duration_min * value.session_rpe;
    if (value.session_load != null && Math.abs(value.session_load - expected) > 1e-9) errors.push('session_load must equal duration_min * session_rpe');
  }
  return errors;
}

export function validateAdaptationDecision(value) {
  const errors = validateEnvelope(value);
  errors.push(...required(value, ['adaptation_decision_id', 'decision_level', 'action', 'safety_state', 'trigger', 'input_snapshot', 'rationale', 'confidence', 'human_override']));
  if (!new Set(['acute', 'tactical', 'strategic']).has(value.decision_level)) errors.push('invalid decision_level');
  if (!new Set(['proceed','reduce_volume','reduce_intensity','substitute','move_session','recovery','progress','delay_progression','retest','health_route','medical_review','review_required']).has(value.action)) errors.push('invalid action');
  if (!new Set(['GREEN','YELLOW','ORANGE','RED']).has(value.safety_state)) errors.push('invalid safety_state');
  if (!numberIn(value.confidence, 0, 1)) errors.push('confidence must be 0..1');
  if (typeof value.input_snapshot !== 'object' || value.input_snapshot == null || Array.isArray(value.input_snapshot)) errors.push('input_snapshot must be an object');
  if (value.safety_state === 'RED' && !new Set(['health_route','medical_review','review_required']).has(value.action)) errors.push('RED decisions cannot continue normal training progression');
  return errors;
}

export function commonEnvelope(athleteId, { sourceRefs = [], uncertainties = [], safetyFlags = [] } = {}) {
  return {
    schema_version: 1,
    athlete_id: athleteId,
    generated_at: new Date().toISOString(),
    source_refs: sourceRefs,
    uncertainties,
    safety_flags: safetyFlags
  };
}
