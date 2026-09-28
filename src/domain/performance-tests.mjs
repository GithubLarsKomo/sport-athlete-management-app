const MEASUREMENT_CLASSES = new Set(['measured', 'derived', 'assumed_or_estimated']);
const MODALITIES = new Set(['rowerg', 'bike']);
const PROTOCOL_KINDS = new Set(['fixed_effort', 'staged']);

export const PERFORMANCE_MEASUREMENT_CLASSES = [...MEASUREMENT_CLASSES];

export const BUILT_IN_TEST_PROTOCOLS = Object.freeze([
  {
    schema_version: 1,
    protocol_id: 'rowerg-500m',
    version: 1,
    name: 'RowErg 500 m',
    modality: 'rowerg',
    protocol_kind: 'fixed_effort',
    fixed_target: { metric: 'distance_m', value: 500, unit: 'm' },
    stage_fields: []
  },
  {
    schema_version: 1,
    protocol_id: 'rowerg-1000m',
    version: 1,
    name: 'RowErg 1,000 m',
    modality: 'rowerg',
    protocol_kind: 'fixed_effort',
    fixed_target: { metric: 'distance_m', value: 1000, unit: 'm' },
    stage_fields: []
  },
  {
    schema_version: 1,
    protocol_id: 'rowerg-2000m',
    version: 1,
    name: 'RowErg 2,000 m',
    modality: 'rowerg',
    protocol_kind: 'fixed_effort',
    fixed_target: { metric: 'distance_m', value: 2000, unit: 'm' },
    stage_fields: []
  },
  {
    schema_version: 1,
    protocol_id: 'rowerg-5000m',
    version: 1,
    name: 'RowErg 5,000 m',
    modality: 'rowerg',
    protocol_kind: 'fixed_effort',
    fixed_target: { metric: 'distance_m', value: 5000, unit: 'm' },
    stage_fields: []
  },
  {
    schema_version: 1,
    protocol_id: 'rowerg-30min',
    version: 1,
    name: 'RowErg 30 min',
    modality: 'rowerg',
    protocol_kind: 'fixed_effort',
    fixed_target: { metric: 'duration_s', value: 1800, unit: 's' },
    stage_fields: []
  },
  {
    schema_version: 1,
    protocol_id: 'rowerg-lactate-step',
    version: 1,
    name: 'RowErg lactate step test',
    modality: 'rowerg',
    protocol_kind: 'staged',
    fixed_target: null,
    stage_fields: ['duration_s','power_w','pace_500_s','heart_rate_bpm','lactate_mmol_l','rpe','stroke_rate_spm']
  },
  {
    schema_version: 1,
    protocol_id: 'bike-lactate-step',
    version: 1,
    name: 'Bike lactate step test',
    modality: 'bike',
    protocol_kind: 'staged',
    fixed_target: null,
    stage_fields: ['duration_s','power_w','heart_rate_bpm','lactate_mmol_l','rpe','cadence_rpm']
  }
]);

const RESULT_METRICS = new Set([
  'duration_s','distance_m','pace_500_s','power_w','heart_rate_bpm','max_heart_rate_bpm',
  'lactate_mmol_l','rpe','cadence_rpm','stroke_rate_spm','work_kj'
]);

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function dateTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function classifiedValue(value, unit, measurementClass, sourceRef = null) {
  return {
    value,
    unit,
    measurement_class: measurementClass,
    ...(sourceRef ? { source_ref: sourceRef } : {})
  };
}

export function validateClassifiedValue(value, label = 'value', { expectedOnly = false } = {}) {
  const errors = [];
  if (!object(value)) return [`${label} must be an object`];
  if (!finite(value.value)) errors.push(`${label}.value must be a finite number`);
  if (!nonEmpty(value.unit)) errors.push(`${label}.unit required`);
  if (!MEASUREMENT_CLASSES.has(value.measurement_class)) errors.push(`${label}.measurement_class invalid`);
  if (expectedOnly && value.measurement_class !== 'assumed_or_estimated') {
    errors.push(`${label}.measurement_class must be assumed_or_estimated for expected targets`);
  }
  if (value.source_ref != null && !nonEmpty(value.source_ref)) errors.push(`${label}.source_ref must be non-empty when supplied`);
  return errors;
}

function validateMetricMap(metrics, label, options = {}) {
  const errors = [];
  if (!object(metrics)) return [`${label} must be an object`];
  for (const [name, value] of Object.entries(metrics)) {
    if (!RESULT_METRICS.has(name)) errors.push(`${label}.${name} is not a supported metric`);
    errors.push(...validateClassifiedValue(value, `${label}.${name}`, options));
  }
  return errors;
}

export function builtInProtocol(protocolId, version = 1) {
  return BUILT_IN_TEST_PROTOCOLS.find(protocol => protocol.protocol_id === protocolId && protocol.version === Number(version)) || null;
}

export function validateCustomProtocol(value) {
  const errors = [];
  if (!object(value)) return ['protocol must be an object'];
  if (!nonEmpty(value.name)) errors.push('name required');
  else if (value.name.length > 191) errors.push('name must be <= 191 characters');
  if (value.protocol_id != null && !nonEmpty(value.protocol_id)) errors.push('protocol_id must be non-empty when supplied');
  else if (typeof value.protocol_id === 'string' && value.protocol_id.length > 64) errors.push('protocol_id must be <= 64 characters');
  if (value.version != null && (!Number.isInteger(Number(value.version)) || Number(value.version) < 1)) errors.push('version must be >= 1');
  if (!MODALITIES.has(value.modality)) errors.push('modality must be rowerg or bike');
  if (value.protocol_kind !== 'staged') errors.push('custom v1 protocol_kind must be staged');
  if (!Array.isArray(value.stages) || value.stages.length < 1) {
    errors.push('stages must contain at least one stage');
    return errors;
  }
  const numbers = new Set();
  value.stages.forEach((stage, index) => {
    const label = `stages[${index}]`;
    if (!object(stage)) { errors.push(`${label} must be an object`); return; }
    if (!Number.isInteger(stage.stage_number) || stage.stage_number < 1) errors.push(`${label}.stage_number must be >= 1`);
    if (numbers.has(stage.stage_number)) errors.push(`duplicate stage_number ${stage.stage_number}`);
    numbers.add(stage.stage_number);
    if (stage.target_metrics != null) errors.push(...validateMetricMap(stage.target_metrics, `${label}.target_metrics`, { expectedOnly: true }));
    if (stage.comment != null && typeof stage.comment !== 'string') errors.push(`${label}.comment must be a string`);
  });
  if (value.stage_fields != null) {
    if (!Array.isArray(value.stage_fields)) errors.push('stage_fields must be an array');
    else for (const field of value.stage_fields) if (!RESULT_METRICS.has(field)) errors.push(`unsupported stage_field: ${field}`);
  }
  return errors;
}

export function validatePerformanceTestPlan(value) {
  const errors = [];
  if (!object(value)) return ['test plan must be an object'];
  if (!nonEmpty(value.protocol_id)) errors.push('protocol_id required');
  if (!Number.isInteger(Number(value.protocol_version)) || Number(value.protocol_version) < 1) errors.push('protocol_version must be >= 1');
  if (!dateTime(value.scheduled_at)) errors.push('scheduled_at must be an ISO date-time');
  if (value.device != null && typeof value.device !== 'string') errors.push('device must be a string');
  else if (typeof value.device === 'string' && value.device.length > 191) errors.push('device must be <= 191 characters');
  if (value.warm_up != null && !object(value.warm_up)) errors.push('warm_up must be an object');
  if (value.environment != null && !object(value.environment)) errors.push('environment must be an object');
  if (value.notes != null && typeof value.notes !== 'string') errors.push('notes must be a string');
  else if (typeof value.notes === 'string' && value.notes.length > 4000) errors.push('notes must be <= 4000 characters');
  if (value.expected_targets != null) errors.push(...validateMetricMap(value.expected_targets, 'expected_targets', { expectedOnly: true }));
  if (value.retest_of_test_id != null && !nonEmpty(value.retest_of_test_id)) errors.push('retest_of_test_id must be non-empty when supplied');
  return errors;
}

export function validatePerformanceTestResult(value, protocol) {
  const errors = [];
  if (!object(value)) return ['test result must be an object'];
  if (!dateTime(value.performed_at)) errors.push('performed_at must be an ISO date-time');
  if (!nonEmpty(value.device)) errors.push('device required');
  else if (value.device.length > 191) errors.push('device must be <= 191 characters');
  if (value.warm_up != null && !object(value.warm_up)) errors.push('warm_up must be an object');
  if (value.environment != null && !object(value.environment)) errors.push('environment must be an object');
  if (value.termination_reason != null && typeof value.termination_reason !== 'string') errors.push('termination_reason must be a string');
  else if (typeof value.termination_reason === 'string' && value.termination_reason.length > 4000) errors.push('termination_reason must be <= 4000 characters');
  if (value.notes != null && typeof value.notes !== 'string') errors.push('notes must be a string');
  else if (typeof value.notes === 'string' && value.notes.length > 4000) errors.push('notes must be <= 4000 characters');
  if (value.metrics != null) errors.push(...validateMetricMap(value.metrics, 'metrics'));

  if (protocol?.protocol_kind === 'fixed_effort' && (!object(value.metrics) || Object.keys(value.metrics).length < 1)) {
    errors.push('fixed effort result requires at least one metric');
  }

  if (protocol?.protocol_kind === 'staged') {
    if (!Array.isArray(value.stages) || value.stages.length < 1) errors.push('staged protocol requires at least one result stage');
  }
  if (value.stages != null) {
    if (!Array.isArray(value.stages)) errors.push('stages must be an array');
    else {
      const stageNumbers = new Set();
      value.stages.forEach((stage, index) => {
        const label = `stages[${index}]`;
        if (!object(stage)) { errors.push(`${label} must be an object`); return; }
        if (!Number.isInteger(stage.stage_number) || stage.stage_number < 1) errors.push(`${label}.stage_number must be >= 1`);
        if (stageNumbers.has(stage.stage_number)) errors.push(`duplicate result stage_number ${stage.stage_number}`);
        stageNumbers.add(stage.stage_number);
        errors.push(...validateMetricMap(stage.metrics || {}, `${label}.metrics`));
        if (!object(stage.metrics) || Object.keys(stage.metrics).length < 1) errors.push(`${label}.metrics must contain at least one classified value`);
        if (stage.comment != null && typeof stage.comment !== 'string') errors.push(`${label}.comment must be a string`);
      });
    }
  }

  if (value.interpretation_refs != null && (!Array.isArray(value.interpretation_refs) || !value.interpretation_refs.every(nonEmpty))) {
    errors.push('interpretation_refs must be a string array');
  }
  return errors;
}

export function displayMeasurement(value) {
  if (!object(value)) return null;
  return {
    value: value.value,
    unit: value.unit,
    measurement_class: value.measurement_class,
    source_ref: value.source_ref || null
  };
}
