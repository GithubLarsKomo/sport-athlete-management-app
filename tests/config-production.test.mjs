import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function runConfig(overrides = {}, remove = []) {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    AUTH_MODE: 'proxy',
    PUBLIC_ORIGIN: 'https://training.example.com',
    DB_PASSWORD: 'database-secret',
    AUTH_PROXY_SHARED_SECRET: '12345678901234567890123456789012',
    ...overrides
  };
  for (const key of remove) delete env[key];
  return spawnSync(process.execPath, ['--input-type=module', '-e', "import('./src/config.mjs').then(({loadConfig})=>loadConfig())"], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8'
  });
}

test('production configuration accepts an HTTPS origin and strong proxy secret', () => {
  const result = runConfig();
  assert.equal(result.status, 0, result.stderr);
});

test('production configuration requires PUBLIC_ORIGIN and DB_PASSWORD', () => {
  assert.notEqual(runConfig({}, ['PUBLIC_ORIGIN']).status, 0);
  assert.notEqual(runConfig({}, ['DB_PASSWORD']).status, 0);
});

test('production configuration rejects insecure origins and weak proxy secrets', () => {
  assert.notEqual(runConfig({ PUBLIC_ORIGIN: 'http://training.example.com' }).status, 0);
  assert.notEqual(runConfig({ AUTH_PROXY_SHARED_SECRET: 'too-short' }).status, 0);
});

test('P1 ingest may remain disabled but rejects weak secrets when enabled', () => {
  assert.equal(runConfig({ P1_INGEST_SHARED_SECRET: '' }).status, 0);
  assert.notEqual(runConfig({ P1_INGEST_SHARED_SECRET: 'too-short' }).status, 0);
  assert.equal(runConfig({ P1_INGEST_SHARED_SECRET: 'abcdef0123456789abcdef0123456789' }).status, 0);
});
