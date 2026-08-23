import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function runConfig(overrides = {}, remove = []) {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    AUTH_MODE: 'proxy',
    PUBLIC_ORIGIN: 'https://training.example.com',
    DATABASE_URL: 'postgresql://sport_athlete_app:database-secret@postgres:5432/sport_athlete',
    DB_POOL_MAX: '5',
    AUTH_PROXY_SHARED_SECRET: '12345678901234567890123456789012',
    ...overrides
  };
  for (const key of remove) delete env[key];
  return spawnSync(process.execPath, ['--input-type=module', '-e', "import('./src/config.mjs').then(({loadConfig})=>loadConfig())"], {
    cwd: process.cwd(), env, encoding: 'utf8'
  });
}

test('production configuration accepts HTTPS and a credentialed PostgreSQL URL', () => {
  const result = runConfig();
  assert.equal(result.status, 0, result.stderr);
});

test('production configuration requires PUBLIC_ORIGIN and DATABASE_URL', () => {
  assert.notEqual(runConfig({}, ['PUBLIC_ORIGIN']).status, 0);
  assert.notEqual(runConfig({}, ['DATABASE_URL']).status, 0);
});

test('production configuration rejects non-PostgreSQL or credential-less database URLs', () => {
  assert.notEqual(runConfig({ DATABASE_URL: 'mysql://user:secret@db/sport_athlete' }).status, 0);
  assert.notEqual(runConfig({ DATABASE_URL: 'postgresql://postgres:5432/sport_athlete' }).status, 0);
  assert.notEqual(runConfig({ DATABASE_URL: 'postgresql://sport_athlete_app@postgres:5432/sport_athlete' }).status, 0);
});

test('production configuration rejects invalid pool sizes, insecure origins and weak proxy secrets', () => {
  assert.notEqual(runConfig({ DB_POOL_MAX: '0' }).status, 0);
  assert.notEqual(runConfig({ DB_POOL_MAX: '51' }).status, 0);
  assert.notEqual(runConfig({ PUBLIC_ORIGIN: 'http://training.example.com' }).status, 0);
  assert.notEqual(runConfig({ AUTH_PROXY_SHARED_SECRET: 'too-short' }).status, 0);
});

test('legacy P1 ingest may remain disabled but rejects weak secrets when enabled', () => {
  assert.equal(runConfig({ P1_INGEST_SHARED_SECRET: '' }).status, 0);
  assert.notEqual(runConfig({ P1_INGEST_SHARED_SECRET: 'too-short' }).status, 0);
  assert.equal(runConfig({ P1_INGEST_SHARED_SECRET: 'abcdef0123456789abcdef0123456789' }).status, 0);
});

test('generic specialist service secret replaces legacy P1 secret and must be strong', () => {
  assert.notEqual(runConfig({ SPECIALIST_SERVICE_SHARED_SECRET: 'too-short', P1_INGEST_SHARED_SECRET: '' }).status, 0);
  assert.equal(runConfig({ SPECIALIST_SERVICE_SHARED_SECRET: 'fedcba9876543210fedcba9876543210', P1_INGEST_SHARED_SECRET: '' }).status, 0);
});

test('specialist runtime timeout is bounded', () => {
  assert.notEqual(runConfig({ SKILLZ_SPECIALIST_TIMEOUT_MS: '100' }).status, 0);
  assert.notEqual(runConfig({ SKILLZ_SPECIALIST_TIMEOUT_MS: '60001' }).status, 0);
  assert.equal(runConfig({ SKILLZ_SPECIALIST_TIMEOUT_MS: '15000' }).status, 0);
});

test('Concept2 personal token must be bound to one athlete in production', () => {
  assert.equal(runConfig({ CONCEPT2_ACCESS_TOKEN: '' }).status, 0);
  assert.notEqual(runConfig({ CONCEPT2_ACCESS_TOKEN: 'read-token' }, ['CONCEPT2_ATHLETE_ID']).status, 0);
  assert.equal(runConfig({ CONCEPT2_ACCESS_TOKEN: 'read-token', CONCEPT2_ATHLETE_ID: 'athlete-123' }).status, 0);
});
