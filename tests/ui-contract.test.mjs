import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, js, p1, performance, handoff] = await Promise.all([
  readFile(new URL('../site/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../site/app/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../site/app/p1.js', import.meta.url), 'utf8'),
  readFile(new URL('../site/app/performance-tests.js', import.meta.url), 'utf8'),
  readFile(new URL('../site/app/adaptation-handoff.js', import.meta.url), 'utf8')
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


test('VI-004 performance testing UI plans and records provenance-classified evidence', () => {
  for (const id of ['performanceTestCard', 'performanceTestPlanForm', 'performanceProtocol', 'performanceResultEditor', 'performanceResultForm', 'performanceMetricInputs', 'performanceStages', 'performanceTests']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /gemessen, abgeleitet oder angenommen\/geschätzt/);
  assert.match(html, /sportwissenschaftliche Interpretation bleibt bei Skillz/);
  assert.match(performance, /\/api\/v1\/tests\/protocols/);
  assert.match(performance, /\/api\/v1\/tests\?limit=30/);
  assert.match(performance, /measurement_class:'assumed_or_estimated'/);
  assert.match(performance, /measurement_class:classInput\?\.value \|\| 'measured'/);
  assert.match(performance, /classBadge\(value\.measurement_class\)/);
  assert.doesNotMatch(performance, /lactate.*threshold|threshold.*lactate|compliance_score/i);
});

test('generic staged test protocol remains available as an explicit advanced workflow', () => {
  assert.match(html, /id="customTestProtocolForm"/);
  assert.match(html, /Eigenes Stufenprotokoll/);
  assert.match(performance, /protocol_kind:'staged'/);
  assert.match(performance, /stage_fields:stageFields/);
  assert.match(performance, /stages/);
});


test('VI-005 UI makes adaptation a manual export -> proposal -> explicit apply workflow', () => {
  for (const id of [
    'adaptationHandoffCard','adaptationHandoffFrom','buildAdaptationHandoff','downloadAdaptationHandoff',
    'adaptationHandoffPreview','adaptationProposalJson','importAdaptationProposal','applyDecision'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /niemals automatisch an einen externen Dienst gesendet/);
  assert.match(html, /bis zum separaten Apply-Schritt ausschließlich ein Vorschlag/);
  assert.match(handoff, /\/api\/v1\/adaptation\/handoff\?from=/);
  assert.match(handoff, /\/api\/v1\/adaptation\/proposals/);
  assert.match(handoff, /sport-athlete-adaptation-handoff-/);
  assert.match(handoff, /revised_plan:null/);
  assert.match(js, /\/api\/v1\/adaptation\/[^/]+\/apply/);
});

test('session completion no longer invokes automatic adaptation evaluation', () => {
  const completionBlock = js.slice(js.indexOf("$('#sessionForm').addEventListener"), js.indexOf("$('#weekComparisonDetails').addEventListener"));
  assert.doesNotMatch(completionBlock, /\/api\/v1\/adaptation\/evaluate/);
  assert.match(completionBlock, /keine automatische Adaptation ausgelöst/);
});
