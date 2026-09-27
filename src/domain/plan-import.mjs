import { createHash } from 'node:crypto';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_FILES = [
  'sport-training-plan.json',
  'sport-season-plan.json',
  'sport-mesocycle.json',
  'sport-microcycle.json'
];

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function date(value) {
  return typeof value === 'string' && DATE_RE.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function dateTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function positiveVersion(value) {
  return Number.isInteger(value) && value >= 1;
}

function stringArray(value) {
  return Array.isArray(value) && value.every(nonEmpty);
}

function inside(value, start, end) {
  return Date.parse(value) >= Date.parse(start) && Date.parse(value) <= Date.parse(end);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

export function planContentHash(files) {
  return createHash('sha256').update(canonicalJson(files)).digest('hex');
}

function validateEnvelope(value, label, errors) {
  if (!object(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (value.schema_version !== 1) errors.push(`${label}.schema_version must be 1`);
  if (!nonEmpty(value.athlete_id)) errors.push(`${label}.athlete_id required`);
  if (!dateTime(value.generated_at)) errors.push(`${label}.generated_at invalid`);
  if (!stringArray(value.source_refs)) errors.push(`${label}.source_refs must be a string array`);
  if (!Array.isArray(value.uncertainties)) errors.push(`${label}.uncertainties must be an array`);
  if (!Array.isArray(value.safety_flags)) errors.push(`${label}.safety_flags must be an array`);
}

function validatePlannedSession(session, index, microcycle, errors) {
  const label = `sport-microcycle.json.sessions[${index}]`;
  if (!object(session)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!nonEmpty(session.planned_session_id)) errors.push(`${label}.planned_session_id required`);
  if (!nonEmpty(session.session_type)) errors.push(`${label}.session_type required`);
  if (!nonEmpty(session.objective)) errors.push(`${label}.objective required`);
  if (!dateTime(session.planned_start)) errors.push(`${label}.planned_start invalid`);
  if (typeof session.planned_duration_min !== 'number' || !Number.isFinite(session.planned_duration_min) || session.planned_duration_min < 0) {
    errors.push(`${label}.planned_duration_min invalid`);
  }
  if (session.planned_rpe != null && (typeof session.planned_rpe !== 'number' || session.planned_rpe < 0 || session.planned_rpe > 10)) {
    errors.push(`${label}.planned_rpe invalid`);
  }
  if (!nonEmpty(session.intensity_rule)) errors.push(`${label}.intensity_rule required`);
  if (!nonEmpty(session.stop_rule)) errors.push(`${label}.stop_rule required`);
  if (session.flexibility != null && !['key', 'movable', 'optional'].includes(session.flexibility)) {
    errors.push(`${label}.flexibility invalid`);
  }
  if (session.items != null && !Array.isArray(session.items)) errors.push(`${label}.items must be an array`);

  if (dateTime(session.planned_start)) {
    const localDate = session.planned_start.slice(0, 10);
    if (!date(localDate) || !inside(localDate, microcycle.start_date, microcycle.end_date)) {
      errors.push(`${label}.planned_start must fall inside microcycle dates`);
    }
  }
}

export function validateCanonicalPlanImportBundle(value) {
  const errors = [];
  if (!object(value)) return ['plan import bundle must be an object'];
  if (value.schema_version !== 1) errors.push('schema_version must be 1');
  if (value.kind !== 'sport-training-plan-import') errors.push('kind must be sport-training-plan-import');

  const producer = value.producer;
  if (!object(producer)) {
    errors.push('producer is required');
  } else {
    if (producer.repository !== 'GithubLarsKomo/skillz') errors.push('producer.repository must be GithubLarsKomo/skillz');
    if (producer.workflow !== 'sport-training-plan-workflow') errors.push('producer.workflow must be sport-training-plan-workflow');
    if (producer.contract_version !== '0.1.0') errors.push('producer.contract_version must be 0.1.0');
    if (!nonEmpty(producer.source_ref)) errors.push('producer.source_ref required');
  }

  if (!object(value.files)) {
    errors.push('files is required');
    return errors;
  }
  for (const filename of REQUIRED_FILES) {
    if (!object(value.files[filename])) errors.push(`files["${filename}"] is required`);
  }
  if (errors.some(error => error.includes(' is required'))) return errors;

  const plan = value.files['sport-training-plan.json'];
  const season = value.files['sport-season-plan.json'];
  const mesocycle = value.files['sport-mesocycle.json'];
  const microcycle = value.files['sport-microcycle.json'];

  validateEnvelope(plan, 'sport-training-plan.json', errors);
  validateEnvelope(season, 'sport-season-plan.json', errors);
  validateEnvelope(mesocycle, 'sport-mesocycle.json', errors);
  validateEnvelope(microcycle, 'sport-microcycle.json', errors);

  const athleteIds = Object.values(value.files)
    .filter(object)
    .map(artifact => artifact.athlete_id)
    .filter(nonEmpty);
  if (new Set(athleteIds).size > 1) errors.push('all canonical artifacts with athlete_id must use the same athlete_id');

  const refs = [
    ['profileRef', null],
    ['performanceModelRef', null],
    ['seasonPlanRef', 'sport-season-plan.json'],
    ['mesocycleRef', 'sport-mesocycle.json'],
    ['microcycleRef', 'sport-microcycle.json'],
    ['strengthPowerRef', null],
    ['enduranceRef', null]
  ];
  for (const [key, expected] of refs) {
    if (!nonEmpty(plan[key])) errors.push(`sport-training-plan.json.${key} required`);
    if (expected && plan[key] !== expected) errors.push(`sport-training-plan.json.${key} must reference ${expected}`);
  }
  for (const key of ['weeks', 'progressionRules', 'taperRules', 'safetyRules', 'uncertainties']) {
    if (!Array.isArray(plan[key])) errors.push(`sport-training-plan.json.${key} must be an array`);
  }

  if (!nonEmpty(season.season_id) || !positiveVersion(season.version)) errors.push('sport-season-plan.json season_id/version invalid');
  if (!date(season.start_date) || !date(season.end_date) || Date.parse(season.end_date) < Date.parse(season.start_date)) {
    errors.push('sport-season-plan.json date range invalid');
  }
  for (const key of ['competitions', 'macrocycles', 'revision_points']) {
    if (!Array.isArray(season[key])) errors.push(`sport-season-plan.json.${key} must be an array`);
  }

  if (!nonEmpty(mesocycle.mesocycle_id) || !nonEmpty(mesocycle.season_id) || !positiveVersion(mesocycle.version)) {
    errors.push('sport-mesocycle.json identity/version invalid');
  }
  if (nonEmpty(season.season_id) && nonEmpty(mesocycle.season_id) && mesocycle.season_id !== season.season_id) {
    errors.push('sport-mesocycle.json.season_id must match sport-season-plan.json.season_id');
  }
  if (!date(mesocycle.start_date) || !date(mesocycle.end_date) ||
      (date(season.start_date) && date(season.end_date) && !inside(mesocycle.start_date, season.start_date, season.end_date)) ||
      (date(season.start_date) && date(season.end_date) && !inside(mesocycle.end_date, season.start_date, season.end_date))) {
    errors.push('sport-mesocycle.json must be inside season date range');
  }
  if (!nonEmpty(mesocycle.primary_adaptation)) errors.push('sport-mesocycle.json.primary_adaptation required');
  for (const key of ['maintenance_qualities', 'entry_criteria', 'exit_criteria']) {
    if (!Array.isArray(mesocycle[key])) errors.push(`sport-mesocycle.json.${key} must be an array`);
  }
  if (!object(mesocycle.load_strategy)) errors.push('sport-mesocycle.json.load_strategy must be an object');

  if (!nonEmpty(microcycle.microcycle_id) || !nonEmpty(microcycle.mesocycle_id) || !positiveVersion(microcycle.version)) {
    errors.push('sport-microcycle.json identity/version invalid');
  }
  if (nonEmpty(mesocycle.mesocycle_id) && nonEmpty(microcycle.mesocycle_id) && microcycle.mesocycle_id !== mesocycle.mesocycle_id) {
    errors.push('sport-microcycle.json.mesocycle_id must match sport-mesocycle.json.mesocycle_id');
  }
  if (!date(microcycle.start_date) || !date(microcycle.end_date) ||
      (date(mesocycle.start_date) && date(mesocycle.end_date) && !inside(microcycle.start_date, mesocycle.start_date, mesocycle.end_date)) ||
      (date(mesocycle.start_date) && date(mesocycle.end_date) && !inside(microcycle.end_date, mesocycle.start_date, mesocycle.end_date))) {
    errors.push('sport-microcycle.json must be inside mesocycle date range');
  }
  if (!nonEmpty(microcycle.focus)) errors.push('sport-microcycle.json.focus required');
  if (!Array.isArray(microcycle.sessions)) {
    errors.push('sport-microcycle.json.sessions must be an array');
  } else {
    const ids = new Set();
    microcycle.sessions.forEach((session, index) => {
      validatePlannedSession(session, index, microcycle, errors);
      if (object(session) && nonEmpty(session.planned_session_id)) {
        if (ids.has(session.planned_session_id)) errors.push(`duplicate planned_session_id: ${session.planned_session_id}`);
        ids.add(session.planned_session_id);
      }
    });
  }

  return errors;
}

export function normalizeCanonicalPlanImportBundle(value) {
  const errors = validateCanonicalPlanImportBundle(value);
  if (errors.length) return { errors };

  const plan = value.files['sport-training-plan.json'];
  const season = value.files['sport-season-plan.json'];
  const mesocycle = value.files['sport-mesocycle.json'];
  const microcycle = value.files['sport-microcycle.json'];

  const companionSourceRefs = Object.values(value.files)
    .filter(object)
    .flatMap(artifact => Array.isArray(artifact.source_refs) ? artifact.source_refs : []);
  const sourceRefs = [...new Set([
    value.producer.source_ref,
    ...companionSourceRefs
  ].filter(nonEmpty))];

  const planPackage = {
    schema_version: 1,
    season: {
      id: season.season_id,
      version: season.version,
      name: nonEmpty(season.name) ? season.name : season.season_id,
      start_date: season.start_date,
      end_date: season.end_date,
      status: ['planned', 'active', 'completed'].includes(season.status) ? season.status : 'planned',
      payload: season
    },
    mesocycle: {
      id: mesocycle.mesocycle_id,
      version: mesocycle.version,
      start_date: mesocycle.start_date,
      end_date: mesocycle.end_date,
      primary_adaptation: mesocycle.primary_adaptation,
      payload: mesocycle
    },
    microcycle: {
      id: microcycle.microcycle_id,
      version: microcycle.version,
      start_date: microcycle.start_date,
      end_date: microcycle.end_date,
      focus: microcycle.focus,
      payload: microcycle
    },
    sessions: microcycle.sessions.map(session => ({
      id: session.planned_session_id,
      version: 1,
      local_date: session.planned_start.slice(0, 10),
      planned_start: session.planned_start,
      session_type: session.session_type,
      objective: session.objective,
      planned_duration_min: session.planned_duration_min,
      planned_rpe: session.planned_rpe ?? null,
      status: 'planned',
      intensity_rule: session.intensity_rule,
      stop_rule: session.stop_rule,
      flexibility: session.flexibility || 'movable',
      items: session.items || [],
      payload: session
    }))
  };

  return {
    errors: [],
    athleteId: plan.athlete_id,
    contentHash: planContentHash(value.files),
    sourceRefs,
    producer: value.producer,
    planPackage,
    bundle: value
  };
}
