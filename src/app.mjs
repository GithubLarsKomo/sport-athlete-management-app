import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveIdentity } from './auth.mjs';
import { readJson, sendJson, sendText } from './http.mjs';
import { commonEnvelope, validateCheckin, validateCompletedSession } from './domain/contracts.mjs';
import { evaluateAdaptation } from './domain/skillz-adapter.mjs';

const SITE_ROOT = resolve(process.cwd(), 'site');
const TYPES = new Map([['.html','text/html; charset=utf-8'],['.css','text/css; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.svg','image/svg+xml'],['.png','image/png'],['.json','application/json; charset=utf-8']]);

function localDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function safeAsset(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = resolve(SITE_ROOT, rel);
  if (candidate !== SITE_ROOT && !candidate.startsWith(`${SITE_ROOT}${sep}`)) return null;
  return candidate;
}

async function serveAsset(req, res, pathname) {
  if (!['GET','HEAD'].includes(req.method)) return false;
  let path = safeAsset(pathname);
  if (!path) return false;
  try {
    let meta = await stat(path);
    if (meta.isDirectory()) { path = resolve(path, 'index.html'); meta = await stat(path); }
    if (!meta.isFile()) return false;
    res.writeHead(200, {
      'Content-Type': TYPES.get(extname(path).toLowerCase()) || 'application/octet-stream',
      'Content-Length': String(meta.size),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY'
    });
    if (req.method === 'HEAD') return res.end(), true;
    createReadStream(path).pipe(res);
    return true;
  } catch { return false; }
}

export function createApplication({ config, repository }) {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true, status: config.appStatus });
      if (config.appStatus !== 'active') return sendJson(res, 503, { error: 'application_inactive' });

      if (!url.pathname.startsWith('/api/')) {
        if (await serveAsset(req, res, url.pathname)) return;
        return sendText(res, 404, 'Not Found');
      }

      const identity = resolveIdentity(req, config);
      if (!identity) return sendJson(res, 401, { error: 'unauthorized' });
      await repository.ensureAthlete(identity);
      const athleteId = identity.athleteId;

      if (req.method === 'GET' && url.pathname === '/api/v1/me') return sendJson(res, 200, identity);
      if (req.method === 'GET' && url.pathname === '/api/v1/athlete/profile') return sendJson(res, 200, { profile: await repository.getProfile(athleteId) });
      if (req.method === 'PUT' && url.pathname === '/api/v1/athlete/profile') {
        const body = await readJson(req);
        const profile = {
          ...commonEnvelope(athleteId),
          ...body,
          athlete_id: athleteId,
          schema_version: 1,
          profile_version: Number(body.profile_version || 1),
          valid_from: new Date().toISOString()
        };
        if (!profile.sport || !profile.discipline || !profile.age_band || !('availability' in profile)) return sendJson(res, 400, { error: 'profile_missing_required_fields' });
        return sendJson(res, 200, { profile: await repository.putProfile(athleteId, profile, identity.subject) });
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/goals') return sendJson(res, 200, { goals: await repository.getGoals(athleteId) });
      if (req.method === 'POST' && url.pathname === '/api/v1/goals') {
        const body = await readJson(req);
        if (!new Set(['outcome','performance','process']).has(body.goal_type) || !String(body.description || '').trim()) return sendJson(res, 400, { error: 'invalid_goal' });
        return sendJson(res, 201, { goal: await repository.createGoal(athleteId, body, identity.subject) });
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/context') return sendJson(res, 200, await repository.getContext(athleteId));
      if (req.method === 'GET' && url.pathname === '/api/v1/training/today') return sendJson(res, 200, { session: await repository.getTodaySession(athleteId) });
      if (req.method === 'GET' && url.pathname === '/api/v1/checkins/today') return sendJson(res, 200, { checkin: await repository.getTodayCheckin(athleteId) });

      if (req.method === 'POST' && url.pathname === '/api/v1/checkins') {
        const body = await readJson(req);
        const checkin = { ...commonEnvelope(athleteId), ...body, athlete_id: athleteId, schema_version: 1, local_date: body.local_date || localDate() };
        for (const field of ['sleep_quality_1_5','fatigue_1_5','soreness_1_5','stress_1_5','motivation_1_5']) if (!(field in checkin)) checkin[field] = null;
        checkin.pain_locations ||= [];
        checkin.illness_symptoms ||= [];
        checkin.objective_metrics ||= [];
        const errors = validateCheckin(checkin);
        if (errors.length) return sendJson(res, 400, { error: 'invalid_checkin', details: errors });
        return sendJson(res, 201, { checkin: await repository.saveCheckin(athleteId, checkin, identity.subject) });
      }

      const completionMatch = url.pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/complete$/);
      if (req.method === 'POST' && completionMatch) {
        const plannedSessionId = completionMatch[1];
        const body = await readJson(req);
        const completed = {
          ...commonEnvelope(athleteId),
          ...body,
          athlete_id: athleteId,
          schema_version: 1,
          completed_session_id: body.completed_session_id || randomUUID(),
          planned_session_id: plannedSessionId,
          session_load: Number(body.duration_min) * Number(body.session_rpe)
        };
        const errors = validateCompletedSession(completed);
        if (errors.length) return sendJson(res, 400, { error: 'invalid_completed_session', details: errors });
        return sendJson(res, 201, { completed_session: await repository.completeSession(athleteId, plannedSessionId, completed, identity.subject) });
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/adaptation/evaluate') {
        const snapshot = {
          profile: await repository.getProfile(athleteId),
          context: await repository.getContext(athleteId),
          planned_session: await repository.getTodaySession(athleteId),
          daily_checkin: await repository.getTodayCheckin(athleteId),
          latest_completed_session: await repository.getLatestCompletedSession(athleteId)
        };
        let decision;
        try {
          decision = await evaluateAdaptation({ athleteId, snapshot, config });
        } catch (error) {
          decision = await evaluateAdaptation({ athleteId, snapshot, config: { ...config, skillz: { adaptationUrl: '', token: '' } } });
          decision.uncertainties.push(`external adaptation service failure: ${error.message}`);
          decision.trigger = 'adaptation_service_failure';
        }
        return sendJson(res, 201, { decision: await repository.saveAdaptation(athleteId, decision, identity.subject) });
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/adaptation/latest') return sendJson(res, 200, { decision: await repository.getLatestAdaptation(athleteId) });
      if (req.method === 'GET' && url.pathname === '/api/v1/adaptation/history') return sendJson(res, 200, { decisions: await repository.getAdaptationHistory(athleteId, url.searchParams.get('limit')) });

      return sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      console.error(error);
      return sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'internal_error' });
    }
  };
}
