import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, js] = await Promise.all([
  readFile(new URL('../site/index.html', import.meta.url),'utf8'),
  readFile(new URL('../site/app/app.js', import.meta.url),'utf8')
]);

test('data export UI states the raw-provider boundary and exposes explicit download only', () => {
  assert.match(html,/id="dataExportCard"/);
  assert.match(html,/id="downloadDataExport"/);
  assert.match(html,/id="dataExportMessage"/);
  assert.match(html,/Rohdateien und Roh-Telemetrie der Provider werden nicht eingebettet/);
  assert.match(html,/SHA-256-Referenzen/);
  assert.match(js,/\/api\/v1\/data\/export/);
  assert.match(js,/sport-athlete-data-export-/);
  assert.match(js,/Provider-Rohdateien nicht enthalten/);
  assert.doesNotMatch(js,/data\/export[^\n]+method:\s*['"]POST/i);
});
