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

export function loadConfig() {
  const runtime = readRuntimeConfig();
  const nodeEnv = env('NODE_ENV', 'development');
  const authMode = env('AUTH_MODE', nodeEnv === 'production' ? 'proxy' : 'dev').toLowerCase();
  const config = {
    nodeEnv,
    port: Number(env('PORT', '3000')),
    appStatus: env('APP_STATUS', runtime.APP_STATUS || 'active').toLowerCase(),
    publicOrigin: env('PUBLIC_ORIGIN', ''),
    db: {
      host: env('DB_HOST', '127.0.0.1'),
      port: Number(env('DB_PORT', '3306')),
      database: env('DB_NAME', 'sport_athlete'),
      user: env('DB_USER', 'sport_athlete'),
      password: env('DB_PASSWORD', ''),
      connectionLimit: Number(env('DB_CONNECTION_LIMIT', '5'))
    },
    auth: {
      mode: authMode,
      sharedSecret: env('AUTH_PROXY_SHARED_SECRET', ''),
      sharedSecretHeader: env('AUTH_PROXY_SECRET_HEADER', 'x-sam-proxy-secret').toLowerCase(),
      subjectHeader: env('AUTH_SUBJECT_HEADER', 'x-authentik-uid').toLowerCase(),
      emailHeader: env('AUTH_EMAIL_HEADER', 'x-authentik-email').toLowerCase(),
      nameHeader: env('AUTH_NAME_HEADER', 'x-authentik-name').toLowerCase(),
      devUserId: env('DEV_USER_ID', 'demo-athlete'),
      devEmail: env('DEV_USER_EMAIL', 'demo@example.invalid'),
      devName: env('DEV_USER_NAME', 'Demo Athlete')
    },
    skillz: {
      adaptationUrl: env('SKILLZ_ADAPTATION_URL', ''),
      token: env('SKILLZ_ADAPTATION_TOKEN', ''),
      timeoutMs: Number(env('SKILLZ_ADAPTATION_TIMEOUT_MS', '5000'))
    }
  };

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT must be a valid TCP port');
  if (nodeEnv === 'production' && authMode === 'dev') throw new Error('AUTH_MODE=dev is forbidden in production');
  if (nodeEnv === 'production' && authMode === 'proxy' && !config.auth.sharedSecret) throw new Error('AUTH_PROXY_SHARED_SECRET is required in production proxy mode');
  if (!Number.isInteger(config.skillz.timeoutMs) || config.skillz.timeoutMs < 250 || config.skillz.timeoutMs > 30000) throw new Error('SKILLZ_ADAPTATION_TIMEOUT_MS must be 250..30000');
  return config;
}
