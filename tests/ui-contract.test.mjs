import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, js] = await Promise.all([
  readFile(new URL('../site/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../site/app/app.js', import.meta.url), 'utf8')
]);

test('dashboard exposes the complete athlete-facing P0 controls', () => {
  for (const id of ['profileForm', 'weekSessions', 'checkinForm', 'sessionForm', 'decision', 'applyDecision']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(js, /\/api\/v1\/athlete\/profile/);
  assert.match(js, /\/api\/v1\/training\/week\?from=/);
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
});
