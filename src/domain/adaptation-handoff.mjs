import { createHash, randomUUID } from 'node:crypto';

export const ADAPTATION_HANDOFF_KIND = 'sport-athlete-adaptation-handoff';
export const ADAPTATION_HANDOFF_VERSION = '1.0.0';
export const ADAPTATION_PROPOSAL_KIND = 'sport-athlete-adaptation-proposal';
export const ADAPTATION_PROPOSAL_VERSION = '1.0.0';

const DECISION_LEVELS = new Set(['acute', 'tactical', 'strategic']);
const ACTIONS = new Set(['proceed','reduce_volume','reduce_intensity','substitute','move_session','recovery','progress','delay_progression','retest','health_route','medical_review','review_required']);
const SAFETY_STATES = new Set(['GREEN','YELLOW','ORANGE','RED']);
const PROPOSAL_FIELDS = new Set([
  'schema_version','kind','contract_version','proposal_id','athlete_id','handoff_id','handoff_from',
  'generated_at','producer','decision_level','action','safety_state','trigger','rationale','confidence',
  'source_refs','uncertainties','safety_flags','revised_plan'
]);

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function isoDateTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function canonicalValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (object(value)) {
    const output = {};
    for (const key of Object.keys(value).sort()) output[key] = canonicalValue(value[key]);
    return output;
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex');
}

function plusDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function pick(source, fields) {
  if (!object(source)) return null;
  const output = {};
  for (const field of fields) if (Object.prototype.hasOwnProperty.call(source, field)) output[field] = source[field];
  return output;
}

function minimizeProfile(profile) {
  return pick(profile, [
    'profile_version','sport','discipline','age_band','training_age_years','availability','equipment',
    'performance_history','health_constraints','preferences','optional_sex_specific_context'
  ]);
}

function minimizeGoal(goal) {
  return pick(goal, ['id','goal_type','description','target_value','target_unit','target_date','priority','status']);
}

function minimizeCompetition(competition) {
  return pick(competition, ['id','name','competition_date','priority','discipline']);
}

function minimizeContext(context) {
  if (!object(context)) return null;
  return {
    next_competition: minimizeCompetition(context.next_competition),
    season: pick(context.season, ['id','name','start_date','end_date','status','version']),
    mesocycle: pick(context.mesocycle, ['id','season_id','start_date','end_date','primary_adaptation','version']),
    microcycle: pick(context.microcycle, ['id','mesocycle_id','start_date','end_date','focus','version'])
  };
}

function minimizePlanImport(record) {
  if (!object(record)) return null;
  return {
    ...pick(record, ['import_id','revision','content_hash','source_refs','supersedes_import_id','imported_at']),
    producer: pick(record.producer, ['repository','workflow','contract_version','source_ref'])
  };
}

function minimizeCheckin(checkin) {
  if (!object(checkin)) return null;
  return pick(checkin, [
    'local_date','sleep_duration_min','sleep_quality_1_5','fatigue_1_5','soreness_1_5','stress_1_5',
    'motivation_1_5','pain_0_10','pain_locations','illness_symptoms','source_refs'
  ]);
}

function minimizePlan(plan) {
  if (!object(plan)) return null;
  return pick(plan, [
    'planned_session_id','local_date','planned_start','session_type','objective','planned_duration_min',
    'planned_rpe','status','version','intensity_rule','stop_rule','flexibility','items'
  ]);
}

function minimizeSubjective(subjective) {
  if (!object(subjective)) return null;
  return pick(subjective, [
    'session_rpe','expectation_match','pain_0_10','comment','deviations','authored_by_subject','finalized_at'
  ]);
}

function minimizeActual(actual) {
  if (!object(actual)) return null;
  const evidence = pick(actual.evidence, [
    'duration_s','distance_m','avg_power_w','avg_hr_bpm','max_hr_bpm','stroke_rate_spm',
    'pace_500_s','work_kj','interval_count'
  ]) || {};
  const provenance = object(actual.provenance) ? {
    canonical_source: actual.provenance.canonical_source || null,
    completion_source_refs: Array.isArray(actual.provenance.completion_source_refs)
      ? actual.provenance.completion_source_refs
      : [],
    activity_sources: Array.isArray(actual.provenance.activity_sources)
      ? actual.provenance.activity_sources.map(source => pick(source, ['provider','external_activity_id','raw_sha256'])).filter(Boolean)
      : []
  } : {};
  const coachNotes = Array.isArray(actual.coach_notes)
    ? actual.coach_notes.map(note => pick(note, ['id','completed_session_id','authored_by_subject','note','created_at','updated_at'])).filter(Boolean)
    : [];
  return {
    ...pick(actual, [
      'completed_session_id','activity_id','session_type','started_at','completed_at','duration_min',
      'session_rpe','completion_status'
    ]),
    subjective: minimizeSubjective(actual.subjective),
    evidence,
    provenance,
    coach_notes: coachNotes
  };
}

function minimizeComparison(comparison) {
  if (!object(comparison)) return { from:null, to:null, sessions:[], unplanned:[], summary:{} };
  const sessions = (comparison.sessions || []).map(record => ({
    plan: minimizePlan(record.plan),
    actual: minimizeActual(record.actual)
  })).sort((a, b) => {
    const left = `${a.plan?.local_date || ''}|${a.plan?.planned_start || ''}|${a.plan?.planned_session_id || ''}`;
    const right = `${b.plan?.local_date || ''}|${b.plan?.planned_start || ''}|${b.plan?.planned_session_id || ''}`;
    return left.localeCompare(right);
  });
  const unplanned = (comparison.unplanned || []).map(record => ({
    plan: null,
    actual: minimizeActual(record.actual)
  })).sort((a, b) => {
    const left = `${a.actual?.started_at || ''}|${a.actual?.completed_session_id || a.actual?.activity_id || ''}`;
    const right = `${b.actual?.started_at || ''}|${b.actual?.completed_session_id || b.actual?.activity_id || ''}`;
    return left.localeCompare(right);
  });
  return {
    from: comparison.from,
    to: comparison.to,
    sessions,
    unplanned,
    summary: comparison.summary || {}
  };
}

function minimizeMetricMap(metrics) {
  if (!object(metrics)) return {};
  const output = {};
  for (const [name, value] of Object.entries(metrics)) {
    if (!object(value)) continue;
    output[name] = pick(value, ['value','unit','measurement_class','source_ref']);
  }
  return output;
}

function minimizeTest(test) {
  if (!object(test)) return null;
  const protocol = object(test.protocol) ? {
    ...pick(test.protocol, ['protocol_id','version','name','modality','protocol_kind','fixed_target','stage_fields']),
    stages: Array.isArray(test.protocol.stages)
      ? test.protocol.stages.map(stage => ({
          stage_number: stage.stage_number,
          target_metrics: minimizeMetricMap(stage.target_metrics),
          ...(stage.comment ? { comment:stage.comment } : {})
        }))
      : []
  } : null;
  const result = object(test.result) ? {
    metrics: minimizeMetricMap(test.result.metrics),
    stages: Array.isArray(test.result.stages)
      ? test.result.stages.map(stage => ({
          stage_number: stage.stage_number,
          metrics: minimizeMetricMap(stage.metrics),
          ...(stage.comment ? { comment:stage.comment } : {})
        }))
      : []
  } : null;
  return {
    ...pick(test, [
      'test_id','protocol_id','protocol_version','protocol_source','modality','status','scheduled_at','performed_at',
      'device','warm_up','environment','termination_reason','notes','interpretation_refs','planned_by_subject',
      'performed_by_subject','retest_of_test_id'
    ]),
    protocol,
    expected_targets: minimizeMetricMap(test.expected_targets),
    result
  };
}

function addRef(target, value) {
  if (nonEmpty(value)) target.add(value.trim());
}

function addRefsFromUnknown(target, values) {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (typeof value === 'string') addRef(target, value);
    else if (value != null) addRef(target, `ref:${sha256(value)}`);
  }
}

function metricSourceRefs(target, metrics) {
  if (!object(metrics)) return;
  for (const value of Object.values(metrics)) if (object(value)) addRef(target, value.source_ref);
}

function collectSourceRefs({ profile, planImport, comparison, checkins, tests }) {
  const refs = new Set();
  if (profile?.profile_version != null) addRef(refs, `athlete-profile:v${profile.profile_version}`);
  if (planImport) {
    addRef(refs, `plan-import:${planImport.import_id}:r${planImport.revision}:${planImport.content_hash}`);
    addRefsFromUnknown(refs, planImport.source_refs);
  }
  for (const checkin of checkins || []) addRef(refs, `morning-check:${checkin.local_date}`);
  for (const record of [...(comparison.sessions || []), ...(comparison.unplanned || [])]) {
    const actual = record.actual;
    if (!actual) continue;
    if (actual.completed_session_id) addRef(refs, `completed-session:${actual.completed_session_id}`);
    if (actual.activity_id) addRef(refs, `activity:${actual.activity_id}`);
    addRefsFromUnknown(refs, actual.provenance?.completion_source_refs);
    for (const source of actual.provenance?.activity_sources || []) {
      addRef(refs, `activity-source:${source.provider || 'unknown'}:${source.external_activity_id || source.raw_sha256 || 'unknown'}`);
    }
  }
  for (const test of tests || []) {
    addRef(refs, `performance-test:${test.test_id}`);
    addRefsFromUnknown(refs, test.interpretation_refs);
    metricSourceRefs(refs, test.expected_targets);
    metricSourceRefs(refs, test.result?.metrics);
    for (const stage of test.result?.stages || []) metricSourceRefs(refs, stage.metrics);
  }
  return [...refs].sort();
}

function deriveSafetyFlags(checkins, comparison) {
  const flags = new Set();
  for (const checkin of checkins || []) {
    if (Number(checkin?.pain_0_10 || 0) > 0 || (checkin?.pain_locations || []).length) {
      flags.add(`morning-check:${checkin.local_date}:athlete-reported-pain`);
    }
    if ((checkin?.illness_symptoms || []).length) {
      flags.add(`morning-check:${checkin.local_date}:athlete-reported-illness`);
    }
  }
  for (const record of [...(comparison.sessions || []), ...(comparison.unplanned || [])]) {
    const actual = record.actual;
    if (Number(actual?.subjective?.pain_0_10 || 0) > 0) {
      flags.add(`completed-session:${actual.completed_session_id || actual.activity_id || 'unknown'}:athlete-reported-pain`);
    }
  }
  return [...flags].sort();
}

function deriveUncertainties({ profile, goals, planImport, comparison, checkins, tests }) {
  const values = [];
  if (!profile) values.push('athlete_profile_missing');
  if (!goals.length) values.push('active_or_historical_goal_context_missing');
  if (!planImport) values.push('canonical_plan_import_reference_missing');
  if (!(comparison.sessions || []).length) values.push('selected_window_has_no_planned_sessions');
  if (!checkins.length) values.push('selected_window_has_no_morning_checks');
  if (!tests.length) values.push('no_current_performance_test_evidence');
  return values.sort();
}

export const ATHLETE_LEARNING_PROMOTION_CONTRACT = Object.freeze({
  kind: 'athlete-learning-candidate',
  contract_version: '1.0.0',
  automatic_write: false,
  promotion_gate: 'KNOWLEDGE-PROMOTION-CONTRACT',
  required_fields: [
    'athlete_or_project_ref','learning_statement','evidence_refs','applicable_conditions',
    'counter_evidence_or_limitations','confidence_status','as_of','freshness'
  ],
  non_promotable: ['raw_conversation','raw_telemetry','secrets','speculative_hypotheses']
});

export async function buildAdaptationHandoff(repository, athleteId, fromDate) {
  if (!isoDate(fromDate)) throw Object.assign(new Error('invalid_handoff_from_date'), { statusCode:400 });
  const toDate = plusDays(fromDate, 6);
  const [profile, goalsRaw, context, comparisonRaw, checkinsRaw, testsRaw, imports] = await Promise.all([
    repository.getProfile(athleteId),
    repository.getGoals(athleteId),
    repository.getContext(athleteId, fromDate),
    repository.getWeekComparison(athleteId, fromDate),
    repository.getCheckins(athleteId, fromDate, toDate),
    repository.listPerformanceTests(athleteId, 20),
    repository.listPlanImports(athleteId, 1)
  ]);
  const goals = (goalsRaw || []).map(minimizeGoal).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  const planImport = minimizePlanImport((imports || [])[0] || null);
  const comparison = minimizeComparison(comparisonRaw);
  const checkins = (checkinsRaw || []).map(minimizeCheckin).filter(Boolean)
    .sort((a, b) => String(a.local_date || '').localeCompare(String(b.local_date || '')));
  const tests = (testsRaw || []).map(minimizeTest).filter(Boolean)
    .sort((a, b) => {
      const left = `${a.scheduled_at || ''}|${a.test_id || ''}`;
      const right = `${b.scheduled_at || ''}|${b.test_id || ''}`;
      return left.localeCompare(right);
    });
  const minimizedProfile = minimizeProfile(profile);
  const body = {
    schema_version: 1,
    kind: ADAPTATION_HANDOFF_KIND,
    contract_version: ADAPTATION_HANDOFF_VERSION,
    athlete_ref: {
      athlete_id: athleteId,
      profile_version: minimizedProfile?.profile_version ?? null
    },
    window: { from: fromDate, to: toDate },
    profile: minimizedProfile,
    goals,
    active_plan: {
      canonical_import: planImport,
      context: minimizeContext(context)
    },
    plan_vs_actual: comparison,
    morning_checks: checkins,
    performance_tests: tests,
    safety_flags: deriveSafetyFlags(checkins, comparison),
    uncertainties: deriveUncertainties({ profile:minimizedProfile, goals, planImport, comparison, checkins, tests }),
    source_refs: collectSourceRefs({ profile:minimizedProfile, planImport, comparison, checkins, tests }),
    future_learning_promotion: ATHLETE_LEARNING_PROMOTION_CONTRACT
  };
  return {
    ...body,
    handoff_id: `sha256:${sha256(body)}`
  };
}

export function validateAdaptationProposal(value, { athleteId = null } = {}) {
  const errors = [];
  if (!object(value)) return ['proposal must be an object'];
  for (const key of Object.keys(value)) if (!PROPOSAL_FIELDS.has(key)) errors.push(`unsupported proposal field: ${key}`);
  if (value.schema_version !== 1) errors.push('schema_version must be 1');
  if (value.kind !== ADAPTATION_PROPOSAL_KIND) errors.push(`kind must be ${ADAPTATION_PROPOSAL_KIND}`);
  if (value.contract_version !== ADAPTATION_PROPOSAL_VERSION) errors.push(`contract_version must be ${ADAPTATION_PROPOSAL_VERSION}`);
  if (!nonEmpty(value.proposal_id) || value.proposal_id.length > 191) errors.push('proposal_id must be 1..191 characters');
  if (!nonEmpty(value.athlete_id)) errors.push('athlete_id required');
  if (athleteId && value.athlete_id !== athleteId) errors.push('athlete_id mismatch');
  if (typeof value.handoff_id !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.handoff_id)) errors.push('handoff_id must be sha256:<64 lowercase hex>');
  if (!isoDate(value.handoff_from)) errors.push('handoff_from must be YYYY-MM-DD');
  if (!isoDateTime(value.generated_at)) errors.push('generated_at must be an ISO date-time');
  if (!object(value.producer) || !nonEmpty(value.producer.name) || !nonEmpty(value.producer.version)) errors.push('producer.name and producer.version required');
  if (!DECISION_LEVELS.has(value.decision_level)) errors.push('invalid decision_level');
  if (!ACTIONS.has(value.action)) errors.push('invalid action');
  if (!SAFETY_STATES.has(value.safety_state)) errors.push('invalid safety_state');
  if (!nonEmpty(value.trigger)) errors.push('trigger required');
  if (!nonEmpty(value.rationale)) errors.push('rationale required');
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) errors.push('confidence must be 0..1');
  for (const field of ['source_refs','uncertainties','safety_flags']) {
    if (!Array.isArray(value[field]) || !value[field].every(item => typeof item === 'string')) errors.push(`${field} must be a string array`);
  }
  if (value.revised_plan != null && !object(value.revised_plan)) errors.push('revised_plan must be an object or null');
  if (value.safety_state === 'RED' && !new Set(['health_route','medical_review','review_required']).has(value.action)) {
    errors.push('RED proposals cannot continue normal training progression');
  }
  if (value.safety_state === 'RED' && value.revised_plan != null) {
    errors.push('RED proposals must not include a plan revision');
  }
  return errors;
}

function findPreviousPlan(handoff, command) {
  if (!command?.entity_id) return null;
  for (const record of handoff.plan_vs_actual?.sessions || []) {
    if (record.plan?.planned_session_id === command.entity_id) return record.plan;
  }
  return null;
}

export function proposalToAdaptationDecision(proposal, handoff) {
  return {
    schema_version: 1,
    athlete_id: proposal.athlete_id,
    generated_at: proposal.generated_at,
    source_refs: [...new Set([...(proposal.source_refs || []), handoff.handoff_id])].sort(),
    uncertainties: proposal.uncertainties || [],
    safety_flags: proposal.safety_flags || [],
    adaptation_decision_id: randomUUID(),
    decision_level: proposal.decision_level,
    action: proposal.action,
    safety_state: proposal.safety_state,
    trigger: proposal.trigger,
    input_snapshot: handoff,
    previous_plan: findPreviousPlan(handoff, proposal.revised_plan),
    revised_plan: proposal.revised_plan || null,
    rationale: proposal.rationale,
    responsible_signals: [],
    confidence: proposal.confidence,
    human_override: false,
    engine_version: `${proposal.producer.name}/${proposal.producer.version}`,
    origin: 'manual_handoff_import',
    external_proposal_id: proposal.proposal_id,
    handoff_id: handoff.handoff_id,
    proposal_contract_version: proposal.contract_version
  };
}
