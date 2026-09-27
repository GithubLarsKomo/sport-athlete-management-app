import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, js, p1] = await Promise.all([
  readFile(new URL('../site/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../site/app/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../site/app/p1.js', import.meta.url), 'utf8')
]);

test('dashboard exposes the complete athlete-facing P0 controls', () => {
  for (const id of ['profileForm', 'planImportForm', 'planImportHistory', 'weekSessions', 'weekComparisonSummary', 'weekComparisonDetails', 'checkinForm', 'sessionForm', 'decision', 'applyDecision']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(js, /\/api\/v1\/athlete\/profile/);
  assert.match(js, /\/api\/v1\/training\/week-comparison\?from=/);
  assert.match(html, /name="expectation_match"/);
  assert.match(html, /name="deviations"/);
  assert.match(js, /completed-sessions\/\$\{encodeURIComponent\(completedSessionId\)\}\/coach-note/);
  assert.match(js, /\/api\/v1\/planning\/import/);
  assert.match(js, /\/api\/v1\/planning\/imports\?limit=8/);
  assert.match(js, /\/api\/v1\/adaptation\/\$\{encodeURIComponent\(decision\.adaptation_decision_id\)\}\/apply/);
});

test('adaptation application is explicit and never automatic', () => {
  assert.match(js, /window\.confirm\(/);
  assert.match(js, /Adaptationsvorschlag/);
  const applyCalls = js.match(/\/apply/g) || [];
  assert.equal(applyCalls.length, 1);
});

test('dynamic dashboard HTML goes through escaping helpers', () => {
  assert.match(js, /const esc =/);
  assert.match(js, /esc\(session\.objective\)/);
  assert.match(js, /esc\(decision\.rationale\)/);
  assert.match(p1, /const esc =/);
  assert.match(p1, /esc\(summary\(record\)\)/);
});

test('P1 specialist context is visible but not browser-writable', () => {
  assert.match(html, /id="specialistArtifacts"/);
  assert.match(html, /schreibgeschützt/);
  assert.match(p1, /\/api\/v1\/p1\/artifacts\/latest/);
  assert.doesNotMatch(p1, /method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
  assert.doesNotMatch(html, /p1.*<form/i);
});


test('weekly Soll-Ist UI is explicit and does not use an opaque compliance score', () => {
  assert.match(html, /weekComparisonSummary/);
  assert.match(js, /Dauer Soll/);
  assert.match(js, /Dauer Ist/);
  assert.match(js, /RPE Soll/);
  assert.match(js, /RPE Ist/);
  assert.match(js, /kein zusammenfassender Compliance-Score/);
  assert.doesNotMatch(js, /compliance_score/i);
});
