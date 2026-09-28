import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATHLETE_DATA_EXPORT_KIND,
  ATHLETE_DATA_EXPORT_VERSION,
  buildAthleteDataExport,
  exportContainsForbiddenKeys,
  sanitizeExportValue
} from '../src/domain/data-export.mjs';

test('athlete data export recursively removes secrets and raw provider payload keys', () => {
  const source = {
    account:{ athlete_id:'athlete-a', email:'a@example.com' },
    profiles:[{ profile_version:1, profile:{ sport:'rowing', access_token:'secret', nested:{ api_key:'secret-2', safe:'ok' } } }],
    goals:[],
    competitions:[],
    planning:{ seasons:[], mesocycles:[], microcycles:[], planned_sessions:[], plan_imports:[], revisions:[] },
    journal:{
      completed_sessions:[],
      activities:[],
      activity_sources:[{
        id:'source-1',
        provider:'garmin',
        external_activity_id:'garmin-1',
        raw_sha256:'a'.repeat(64),
        summary:{ duration_s:3600, samples_json:[1,2,3], nested:{ refresh_token:'drop' } },
        raw_payload_json:{ token:'must-never-appear' },
        samples_json:[1,2,3],
        intervals_json:[{ power:200 }]
      }],
      entries:[],
      coach_notes:[]
    },
    checkins:[{ checkin:{ fatigue_1_5:2, authorization:'drop' } }],
    performance_testing:{ protocols:[], tests:[] },
    adaptation_history:[],
    specialists:{ artifacts:[], reasoning_runs:[] },
    audit:[]
  };

  const result = buildAthleteDataExport({
    athleteId:'athlete-a',
    exportId:'export-1',
    generatedAt:'2026-09-28T12:00:00.000Z',
    source
  });

  assert.equal(result.kind, ATHLETE_DATA_EXPORT_KIND);
  assert.equal(result.contract_version, ATHLETE_DATA_EXPORT_VERSION);
  assert.equal(result.manifest.provider_raw_files.included, false);
  assert.equal(result.manifest.provider_raw_files.representation, 'references_only');
  assert.equal(result.manifest.security.secrets_included, false);
  assert.equal(result.manifest.record_counts.activity_sources, 1);
  assert.equal(result.data.journal.activity_sources[0].raw_sha256, 'a'.repeat(64));
  assert.equal(result.data.profiles[0].profile.nested.safe, 'ok');
  assert.equal(exportContainsForbiddenKeys(result), false);

  const serialized = JSON.stringify(result);
  for (const forbidden of ['secret-2','must-never-appear','samples_json','intervals_json','raw_payload_json','access_token','refresh_token','authorization']) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
});

test('sanitizer preserves ordinary provenance while stripping credential-shaped nested keys', () => {
  assert.deepEqual(
    sanitizeExportValue({
      provider:'concept2',
      raw_sha256:'b'.repeat(64),
      credentials:{ password:'drop', username:'keep' },
      client_secret:'drop',
      source_ref:'concept2:123'
    }),
    {
      provider:'concept2',
      raw_sha256:'b'.repeat(64),
      credentials:{ username:'keep' },
      source_ref:'concept2:123'
    }
  );
});
