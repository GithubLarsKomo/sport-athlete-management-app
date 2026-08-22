const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function date(value) { return typeof value === 'string' && DATE_RE.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)); }
function dateTime(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
function positiveVersion(value) { return Number.isInteger(value) && value >= 1; }
function inside(start, end, parentStart, parentEnd) { return Date.parse(start) >= Date.parse(parentStart) && Date.parse(end) <= Date.parse(parentEnd); }

export function validatePlanPackage(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['plan package must be an object'];
  if (value.schema_version !== 1) errors.push('schema_version must be 1');
  for (const key of ['season', 'mesocycle', 'microcycle']) if (!value[key] || typeof value[key] !== 'object') errors.push(`${key} is required`);
  if (!Array.isArray(value.sessions)) errors.push('sessions must be an array');
  if (errors.length) return errors;

  const { season, mesocycle, microcycle, sessions } = value;
  if (!nonEmpty(season.id) || !nonEmpty(season.name)) errors.push('season id/name required');
  if (!positiveVersion(season.version)) errors.push('season version must be >= 1');
  if (!date(season.start_date) || !date(season.end_date) || Date.parse(season.end_date) < Date.parse(season.start_date)) errors.push('invalid season date range');
  if (!new Set(['planned','active','completed']).has(season.status)) errors.push('invalid season status');

  if (!nonEmpty(mesocycle.id) || !positiveVersion(mesocycle.version) || !nonEmpty(mesocycle.primary_adaptation)) errors.push('invalid mesocycle identity/version/adaptation');
  if (!date(mesocycle.start_date) || !date(mesocycle.end_date) || !inside(mesocycle.start_date, mesocycle.end_date, season.start_date, season.end_date)) errors.push('mesocycle must be inside season');

  if (!nonEmpty(microcycle.id) || !positiveVersion(microcycle.version) || !nonEmpty(microcycle.focus)) errors.push('invalid microcycle identity/version/focus');
  if (!date(microcycle.start_date) || !date(microcycle.end_date) || !inside(microcycle.start_date, microcycle.end_date, mesocycle.start_date, mesocycle.end_date)) errors.push('microcycle must be inside mesocycle');

  const ids = new Set();
  for (const [index, session] of sessions.entries()) {
    if (!session || typeof session !== 'object') { errors.push(`sessions[${index}] must be an object`); continue; }
    if (!nonEmpty(session.id) || ids.has(session.id)) errors.push(`sessions[${index}] id missing or duplicated`); else ids.add(session.id);
    if (!positiveVersion(session.version)) errors.push(`sessions[${index}] version must be >= 1`);
    if (!date(session.local_date) || !inside(session.local_date, session.local_date, microcycle.start_date, microcycle.end_date)) errors.push(`sessions[${index}] local_date must be inside microcycle`);
    if (!dateTime(session.planned_start)) errors.push(`sessions[${index}] planned_start invalid`);
    if (!nonEmpty(session.session_type) || !nonEmpty(session.objective)) errors.push(`sessions[${index}] type/objective required`);
    if (typeof session.planned_duration_min !== 'number' || !Number.isFinite(session.planned_duration_min) || session.planned_duration_min < 0) errors.push(`sessions[${index}] planned_duration_min invalid`);
    if (session.planned_rpe != null && (typeof session.planned_rpe !== 'number' || session.planned_rpe < 0 || session.planned_rpe > 10)) errors.push(`sessions[${index}] planned_rpe invalid`);
    if (!new Set(['planned','modified']).has(session.status || 'planned')) errors.push(`sessions[${index}] status must be planned or modified`);
  }
  return errors;
}

export function validateSessionRevisionCommand(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['revision must be an object'];
  if (value.entity_type !== 'planned_session') errors.push('entity_type must be planned_session');
  if (!nonEmpty(value.entity_id)) errors.push('entity_id required');
  if (!positiveVersion(value.expected_version)) errors.push('expected_version must be >= 1');
  if (!value.patch || typeof value.patch !== 'object' || Array.isArray(value.patch)) return [...errors, 'patch must be an object'];
  const allowed = new Set(['planned_start','local_date','objective','planned_duration_min','planned_rpe','status','payload']);
  const keys = Object.keys(value.patch);
  if (!keys.length) errors.push('patch must not be empty');
  for (const key of keys) if (!allowed.has(key)) errors.push(`unsupported patch field: ${key}`);
  if ('planned_start' in value.patch && !dateTime(value.patch.planned_start)) errors.push('planned_start invalid');
  if ('local_date' in value.patch && !date(value.patch.local_date)) errors.push('local_date invalid');
  if ('objective' in value.patch && !nonEmpty(value.patch.objective)) errors.push('objective invalid');
  if ('planned_duration_min' in value.patch && (typeof value.patch.planned_duration_min !== 'number' || !Number.isFinite(value.patch.planned_duration_min) || value.patch.planned_duration_min < 0)) errors.push('planned_duration_min invalid');
  if ('planned_rpe' in value.patch && value.patch.planned_rpe != null && (typeof value.patch.planned_rpe !== 'number' || value.patch.planned_rpe < 0 || value.patch.planned_rpe > 10)) errors.push('planned_rpe invalid');
  if ('status' in value.patch && !new Set(['modified','cancelled']).has(value.patch.status)) errors.push('status must be modified or cancelled');
  if ('payload' in value.patch && (!value.patch.payload || typeof value.patch.payload !== 'object' || Array.isArray(value.patch.payload))) errors.push('payload must be an object');
  return errors;
}
