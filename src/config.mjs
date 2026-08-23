import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readRuntimeConfig() {
  try {
    const value = JSON.parse(readFileSync(resolve(process.cwd(), 'runtime-config.json'), 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function env(name, fallback = '') {
  const value = process.env[name];
  return value == null || value === '' ? fallback : value;
}

function validateProductionOrigin(value) {
  if (!value) throw new Error('PUBLIC_ORIGIN is required in production');
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('PUBLIC_ORIGIN must be a valid URL'); }
  if (parsed.protocol !== 'https:') throw new Error('PUBLIC_ORIGIN must use https in production');
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('PUBLIC_ORIGIN must be an origin without path, query or fragment');
  return parsed.origin;
}

function validateDatabaseUrl(value, { production = false } = {}) {
  if (!value) throw new Error('DATABASE_URL is required');
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('DATABASE_URL must use postgres:// or postgresql://');
  if (!parsed.hostname) throw new Error('DATABASE_URL must include a database host');
  if (!parsed.pathname || parsed.pathname === '/') throw new Error('DATABASE_URL must include a database name');
  if (production && !parsed.username) throw new Error('DATABASE_URL must include a dedicated database user in production');
  if (production && !parsed.password) throw new Error('DATABASE_URL must include a database password in production');
  return value;
}

function validateHttpsBaseUrl(value, name) {
  if (!value) return '';
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be a valid URL`); }
  if (parsed.protocol !== 'https:') throw new Error(`${name} must use https`);
  return parsed.toString().replace(/\/$/, '');
}

export function loadConfig() {
  const runtime = readRuntimeConfig();
  const nodeEnv = env('NODE_ENV', 'development');
  const authMode = env('AUTH_MODE', nodeEnv === 'production' ? 'proxy' : 'dev').toLowerCase();
  const defaultDatabaseUrl = 'postgresql://sport_athlete:sport_athlete@127.0.0.1:5432/sport_athlete';
  const devUserId = env('DEV_USER_ID', 'demo-athlete');
  const config = {
    nodeEnv,
    port: Number(env('PORT', '3000')),
    appStatus: env('APP_STATUS', runtime.APP_STATUS || 'active').toLowerCase(),
    publicOrigin: env('PUBLIC_ORIGIN', ''),
    db: {
      url: env('DATABASE_URL', nodeEnv === 'production' ? '' : defaultDatabaseUrl),
      poolMax: Number(env('DB_POOL_MAX', '5'))
    },
    auth: {
      mode: authMode,
      sharedSecret: env('AUTH_PROXY_SHARED_SECRET', ''),
      sharedSecretHeader: env('AUTH_PROXY_SECRET_HEADER', 'x-sam-proxy-secret').toLowerCase(),
      subjectHeader: env('AUTH_SUBJECT_HEADER', 'x-authentik-uid').toLowerCase(),
      emailHeader: env('AUTH_EMAIL_HEADER', 'x-authentik-email').toLowerCase(),
      nameHeader: env('AUTH_NAME_HEADER', 'x-authentik-name').toLowerCase(),
      devUserId,
      devEmail: env('DEV_USER_EMAIL', 'demo@example.invalid'),
      devName: env('DEV_USER_NAME', 'Demo Athlete')
    },
    skillz: {
      adaptationUrl: env('SKILLZ_ADAPTATION_URL', ''),
      token: env('SKILLZ_ADAPTATION_TOKEN', ''),
      timeoutMs: Number(env('SKILLZ_ADAPTATION_TIMEOUT_MS', '5000'))
    },
    p1: {
      ingestSecret: env('P1_INGEST_SHARED_SECRET', ''),
      ingestHeader: env('P1_INGEST_SECRET_HEADER', 'x-sam-p1-ingest-secret').toLowerCase()
    },
    concept2: {
      baseUrl: env('CONCEPT2_BASE_URL', 'https://log.concept2.com'),
      accessToken: env('CONCEPT2_ACCESS_TOKEN', ''),
      athleteId: env('CONCEPT2_ATHLETE_ID', nodeEnv === 'production' ? '' : devUserId),
      timeoutMs: Number(env('CONCEPT2_TIMEOUT_MS', '10000'))
    }
  };

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT must be a valid TCP port');
  if (!Number.isInteger(config.db.poolMax) || config.db.poolMax < 1 || config.db.poolMax > 50) throw new Error('DB_POOL_MAX must be 1..50');
  if (!['dev', 'proxy'].includes(authMode)) throw new Error('AUTH_MODE must be dev or proxy');
  if (!Number.isInteger(config.skillz.timeoutMs) || config.skillz.timeoutMs < 250 || config.skillz.timeoutMs > 30000) throw new Error('SKILLZ_ADAPTATION_TIMEOUT_MS must be 250..30000');
  if (config.p1.ingestSecret && config.p1.ingestSecret.length < 32) throw new Error('P1_INGEST_SHARED_SECRET must contain at least 32 characters when enabled');
  if (!/^[a-z0-9-]+$/.test(config.p1.ingestHeader)) throw new Error('P1_INGEST_SECRET_HEADER must be a valid lowercase HTTP header name');
  if (!Number.isInteger(config.concept2.timeoutMs) || config.concept2.timeoutMs < 1000 || config.concept2.timeoutMs > 60000) throw new Error('CONCEPT2_TIMEOUT_MS must be 1000..60000');
  if (config.concept2.accessToken && !config.concept2.athleteId) throw new Error('CONCEPT2_ATHLETE_ID is required when CONCEPT2_ACCESS_TOKEN is configured');

  config.db.url = validateDatabaseUrl(config.db.url, { production: nodeEnv === 'production' });
  config.concept2.baseUrl = validateHttpsBaseUrl(config.concept2.baseUrl, 'CONCEPT2_BASE_URL');

  if (nodeEnv === 'production') {
    config.publicOrigin = validateProductionOrigin(config.publicOrigin);
    if (authMode === 'dev') throw new Error('AUTH_MODE=dev is forbidden in production');
    if (authMode === 'proxy' && config.auth.sharedSecret.length < 32) throw new Error('AUTH_PROXY_SHARED_SECRET must contain at least 32 characters in production');
  }
  return config;
}
