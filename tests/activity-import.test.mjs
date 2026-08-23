import test from 'node:test';
import assert from 'node:assert/strict';
import { matchActivity, normalizeConcept2Result, normalizeRp3Csv, normalizeTcx } from '../src/domain/activity-import.mjs';

test('Concept2 results normalize tenths-of-seconds and rowing metrics', () => {
  const result = normalizeConcept2Result({
    id: 123,
    type: 'rower',
    date_utc: '2026-08-23 06:00:00',
    time: 36000,
    distance: 15000,
    stroke_rate: 20,
    drag_factor: 118,
    heart_rate: { average: 142, maximum: 164 },
    workout: { splits: [{ distance: 5000, time: 12000 }] }
  });
  assert.equal(result.provider, 'concept2');
  assert.equal(result.activityType, 'indoor_rowing');
  assert.equal(result.durationS, 3600);
  assert.equal(result.distanceM, 15000);
  assert.equal(result.summary.drag_factor, 118);
  assert.equal(result.intervals.length, 1);
});

test('TCX normalization extracts summary without provider-specific dependencies', () => {
  const tcx = `<?xml version="1.0"?><TrainingCenterDatabase><Activities><Activity Sport="Other"><Id>2026-08-23T06:00:00Z</Id><Lap StartTime="2026-08-23T06:00:00Z"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>7500</DistanceMeters><AverageHeartRateBpm><Value>138</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>160</Value></MaximumHeartRateBpm><Cadence>21</Cadence></Lap></Activity></Activities></TrainingCenterDatabase>`;
  const result = normalizeTcx(tcx, 'rp3', 'rp3.tcx');
  assert.equal(result.activityType, 'indoor_rowing');
  assert.equal(result.durationS, 1800);
  assert.equal(result.distanceM, 7500);
  assert.equal(result.summary.avg_hr_bpm, 138);
});

test('RP3 CSV normalization accepts semicolon exports and stroke columns', () => {
  const csv = `timestamp;elapsedTime;distance;power;strokeRate;heartRate\n2026-08-23T06:00:00Z;0;0;180;20;120\n2026-08-23T06:00:10Z;10;45;220;22;130\n2026-08-23T06:00:20Z;20;95;240;24;140`;
  const result = normalizeRp3Csv(csv, 'rp3.csv');
  assert.equal(result.durationS, 20);
  assert.equal(result.distanceM, 95);
  assert.equal(result.samples.length, 3);
  assert.equal(Math.round(result.summary.avg_power_w), 213);
  assert.equal(result.summary.stroke_rate_spm, 22);
});

test('Garmin plus Concept2 indoor rowing is classified as complementary auto-merge', () => {
  const match = matchActivity({
    activity_type: 'indoor_rowing',
    canonical_source: 'garmin',
    started_at: '2026-08-23T06:00:00Z',
    ended_at: '2026-08-23T07:00:00Z',
    duration_s: 3600,
    distance_m: 14980
  }, {
    provider: 'concept2',
    activityType: 'indoor_rowing',
    startedAt: '2026-08-23T06:00:12Z',
    endedAt: '2026-08-23T07:00:02Z',
    durationS: 3590,
    distanceM: 15000
  });
  assert.equal(match.classification, 'auto_merge');
  assert.ok(match.score > 0.9);
});

test('unrelated sessions remain separate', () => {
  const match = matchActivity({
    activity_type: 'indoor_rowing', canonical_source: 'garmin', started_at: '2026-08-23T06:00:00Z', ended_at: '2026-08-23T07:00:00Z', duration_s: 3600, distance_m: 15000
  }, {
    provider: 'concept2', activityType: 'indoor_rowing', startedAt: '2026-08-23T08:00:00Z', endedAt: '2026-08-23T09:00:00Z', durationS: 3600, distanceM: 15000
  });
  assert.equal(match.classification, 'new');
});
