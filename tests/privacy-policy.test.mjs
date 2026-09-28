import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [gateText, runbook, app, http] = await Promise.all([
  readFile(new URL('../docs/privacy/privacy-rollout-gate.json', import.meta.url),'utf8'),
  readFile(new URL('../docs/privacy/data-governance-v1.md', import.meta.url),'utf8'),
  readFile(new URL('../src/app.mjs', import.meta.url),'utf8'),
  readFile(new URL('../src/http.mjs', import.meta.url),'utf8')
]);
const gate=JSON.parse(gateText);

test('privacy gate stays blocked until production retention, backup and proxy checks are verified', () => {
  assert.equal(gate.status,'blocked-for-broad-rollout-until-production-controls-verified');
  const pending=gate.productionControlsRequiredBeforeBroadRollout.filter(control=>control.status==='pending');
  assert.deepEqual(pending.map(control=>control.id),['PRIV-PROD-001','PRIV-PROD-002','PRIV-PROD-003','PRIV-PROD-004']);
  assert.ok(pending.every(control=>control.owner==='VI-007/#27'));
  assert.equal(gate.implementationControls.providerRawFilesInSelfExport,'references-only');
  assert.equal(gate.implementationControls.securityAuditTreatment,'retained-after-primary-deletion');
});

test('runbook makes backup survival and deletion replay explicit', () => {
  assert.match(runbook,/deleted data may therefore remain recoverable only until the applicable backup expires/i);
  assert.match(runbook,/re-apply all later deletion requests/i);
  assert.match(runbook,/before restored service is exposed to users/i);
  assert.match(runbook,/audit-retention window/i);
  assert.match(runbook,/Request bodies must not be logged by default/i);
});

test('application request parsing and routes do not log request-body payloads', () => {
  assert.doesNotMatch(http,/console\.(?:log|info|debug|warn|error)\s*\([^\n]*(?:body|chunks)/i);
  assert.doesNotMatch(app,/console\.(?:log|info|debug|warn|error)\s*\([^\n]*(?:body|payload|checkin|symptom|result_json)/i);
});
