export const EXPECTATION_MATCH_VALUES = ['easier', 'as_expected', 'harder'];
export const DEVIATION_REASON_VALUES = [
  'time_constraint',
  'weather_environment',
  'fatigue',
  'pain',
  'illness',
  'equipment',
  'intentionally_modified',
  'external_interruption',
  'other'
];

const EXPECTATION_MATCH = new Set(EXPECTATION_MATCH_VALUES);
const DEVIATION_REASONS = new Set(DEVIATION_REASON_VALUES);

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeDeviationReasons(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))];
}

export function validateSessionSubjective(value, { requireRpe = false } = {}) {
  const errors = [];
  const rpe = finiteNumber(value?.session_rpe);
  const pain = value?.pain_0_10 == null || value.pain_0_10 === '' ? null : Number(value.pain_0_10);

  if (requireRpe && rpe == null) errors.push('session_rpe required');
  if (rpe != null && (rpe < 0 || rpe > 10)) errors.push('session_rpe must be 0..10');

  if (value?.expectation_match != null && value.expectation_match !== '' && !EXPECTATION_MATCH.has(value.expectation_match)) {
    errors.push('expectation_match must be easier, as_expected or harder');
  }

  if (pain != null && (!Number.isInteger(pain) || pain < 0 || pain > 10)) {
    errors.push('pain_0_10 must be null or an integer 0..10');
  }

  const deviations = normalizeDeviationReasons(value?.deviations);
  for (const reason of deviations) {
    if (!DEVIATION_REASONS.has(reason)) errors.push(`unsupported deviation reason: ${reason}`);
  }

  if (value?.comment != null && typeof value.comment !== 'string') errors.push('comment must be a string');
  if (typeof value?.comment === 'string' && value.comment.length > 4000) errors.push('comment must be at most 4000 characters');

  return errors;
}
