export const ATHLETE_DATA_EXPORT_KIND = 'sport-athlete-data-export';
export const ATHLETE_DATA_EXPORT_VERSION = '1.0.0';

const FORBIDDEN_EXACT_KEYS = new Set([
  'raw_payload_json',
  'samples_json',
  'intervals_json',
  'raw_samples',
  'access_token',
  'refresh_token',
  'service_secret',
  'client_secret',
  'api_key',
  'apikey',
  'password',
  'authorization',
  'cookie',
  'token',
  'secret',
  'private_key',
  'credentials'
]);

function forbiddenKey(key) {
  const normalized = String(key || '').toLowerCase();
  if (FORBIDDEN_EXACT_KEYS.has(normalized)) return true;
  return /(^|[_-])(token|secret|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|service[_-]?secret|private[_-]?key|password|authorization|credentials?|cookie)([_-]|$)/i.test(normalized);
}

export function sanitizeExportValue(value) {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitizeExportValue);
  if (typeof value !== 'object') return value;
  const clean = {};
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKey(key)) continue;
    clean[key] = sanitizeExportValue(nested);
  }
  return clean;
}

function count(value) {
  return Array.isArray(value) ? value.length : (value ? 1 : 0);
}

export function buildAthleteDataExport({ athleteId, exportId, generatedAt = new Date().toISOString(), source }) {
  const data = sanitizeExportValue(source || {});
  const planning = data.planning || {};
  const journal = data.journal || {};
  const testing = data.performance_testing || {};
  const specialists = data.specialists || {};

  return {
    schema_version: 1,
    kind: ATHLETE_DATA_EXPORT_KIND,
    contract_version: ATHLETE_DATA_EXPORT_VERSION,
    export_id: exportId,
    generated_at: generatedAt,
    athlete_id: athleteId,
    manifest: {
      scope: 'athlete-longitudinal-data',
      format: 'application/json',
      provider_raw_files: {
        included: false,
        representation: 'references_only',
        included_reference_fields: ['provider', 'external_activity_id', 'source_started_at', 'source_ended_at', 'raw_sha256', 'summary', 'imported_at'],
        excluded_source_fields: ['intervals_json', 'samples_json', 'raw_payload_json']
      },
      security: {
        secrets_included: false,
        secret_fields_are_removed_recursively: true
      },
      policy_refs: [
        'docs/privacy/data-governance-v1.md',
        'docs/privacy/privacy-rollout-gate.json'
      ],
      record_counts: {
        account: count(data.account),
        profiles: count(data.profiles),
        goals: count(data.goals),
        competitions: count(data.competitions),
        seasons: count(planning.seasons),
        mesocycles: count(planning.mesocycles),
        microcycles: count(planning.microcycles),
        planned_sessions: count(planning.planned_sessions),
        plan_imports: count(planning.plan_imports),
        plan_revisions: count(planning.revisions),
        completed_sessions: count(journal.completed_sessions),
        activities: count(journal.activities),
        activity_sources: count(journal.activity_sources),
        journal_entries: count(journal.entries),
        coach_notes: count(journal.coach_notes),
        checkins: count(data.checkins),
        test_protocols: count(testing.protocols),
        performance_tests: count(testing.tests),
        adaptation_decisions: count(data.adaptation_history),
        specialist_artifacts: count(specialists.artifacts),
        specialist_reasoning_runs: count(specialists.reasoning_runs),
        audit_events: count(data.audit)
      }
    },
    data
  };
}

export function exportContainsForbiddenKeys(value) {
  if (value == null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(exportContainsForbiddenKeys);
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKey(key)) return true;
    if (exportContainsForbiddenKeys(nested)) return true;
  }
  return false;
}
