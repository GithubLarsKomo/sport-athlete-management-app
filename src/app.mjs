import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveIdentity } from './auth.mjs';
import { readJson, sendJson, sendText } from './http.mjs';
import { commonEnvelope, validateCheckin, validateCompletedSession } from './domain/contracts.mjs';
import { evaluateAdaptation } from './domain/skillz-adapter.mjs';
import { validatePlanPackage, validateSessionRevisionCommand } from './domain/planning.mjs';
import { SPECIALIST_ARTIFACT_TYPES, normalizeSpecialistArtifact, specialistIngestAuthorized, specialistTypeInfo } from './domain/p1-artifacts.mjs';
import { normalizeConcept2Result, normalizeFileImport } from './domain/activity-import.mjs';
import { fetchConcept2Results } from './domain/concept2-client.mjs';

const SITE_ROOT = resolve(process.cwd(), 'site');
const TYPES = new Map([['.html','text/html; charset=utf-8'],['.css','text/css; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.svg','image/svg+xml'],['.png','image/png'],['.json','application/json; charset=utf-8']]);
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSP = "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

function firstHeader(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function expectedOrigin(req, config) {
  if (config.publicOrigin) return new URL(config.publicOrigin).origin;
  const proto = String(firstHeader(req.headers['x-forwarded-proto']) || 'http').split(',')[0].trim();
  const host = String(firstHeader(req.headers.host) || '').trim();
  return host ? `${proto}://${host}` : null;
}

function writeOriginAllowed(req, config) {
  if (!MUTATING.has(req.method || '')) return true;
  if (String(firstHeader(req.headers['sec-fetch-site']) || '').toLowerCase() === 'cross-site') return false;
  const origin = firstHeader(req.headers.origin);
  if (!origin) return true;
  const expected = expectedOrigin(req, config);
  if (!expected) return false;
  try { return new URL(origin).origin === expected; } catch { return false; }
}

function localDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function concept2CursorTime(date) {
  return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
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
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': CSP
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

      if (!writeOriginAllowed(req, config)) return sendJson(res, 403, { error: 'cross_site_write_rejected' });

      const ingestMatch = url.pathname.match(/^\/api\/v1\/internal\/p1\/artifacts\/([^/]+)$/);
      if (req.method === 'POST' && ingestMatch) {
        if (!config.p1?.ingestSecret) return sendJson(res, 503, { error: 'p1_ingest_disabled' });
        if (!specialistIngestAuthorized(req, config)) return sendJson(res, 401, { error: 'unauthorized_p1_ingest' });
        const artifactType = decodeURIComponent(ingestMatch[1]);
        if (!specialistTypeInfo(artifactType)) return sendJson(res, 404, { error: 'unsupported_specialist_artifact_type' });
        const body = await readJson(req, 512 * 1024);
        const targetAthleteId = String(body.athlete_id || '').trim();
        if (!targetAthleteId) return sendJson(res, 400, { error: 'athlete_id_required' });
        if (!await repository.athleteExists(targetAthleteId)) return sendJson(res, 404, { error: 'athlete_not_found' });
        const { artifact, errors, definition } = normalizeSpecialistArtifact(artifactType, targetAthleteId, body.artifact);
        if (errors.length) return sendJson(res, 400, { error: 'invalid_specialist_artifact', details: errors });
        const record = await repository.saveSpecialistArtifact(targetAthleteId, artifactType, artifact, 'service:skillz');
        return sendJson(res, 201, { record: { ...record, definition } });
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
          ...body,
          ...commonEnvelope(athleteId),
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

      if (req.method === 'PUT' && url.pathname === '/api/v1/planning/active') {
        const body = await readJson(req, 512 * 1024);
        const errors = validatePlanPackage(body);
        if (errors.length) return sendJson(res, 400, { error: 'invalid_plan_package', details: errors });
        return sendJson(res, 200, { applied: await repository.applyPlanPackage(athleteId, body, identity.subject) });
      }
      if (req.method === 'GET' && url.pathname === '/api/v1/training/week') {
        const from = url.searchParams.get('from') || localDate();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return sendJson(res, 400, { error: 'invalid_from_date' });
        return sendJson(res, 200, { sessions: await repository.getWeekSessions(athleteId, from) });
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/context') return sendJson(res, 200, await repository.getContext(athleteId));
      if (req.method === 'GET' && url.pathname === '/api/v1/training/today') return sendJson(res, 200, { session: await repository.getTodaySession(athleteId) });
      if (req.method === 'GET' && url.pathname === '/api/v1/checkins/today') return sendJson(res, 200, { checkin: await repository.getTodayCheckin(athleteId) });

      if (req.method === 'GET' && url.pathname === '/api/v1/import/status') {
        return sendJson(res, 200, {
          concept2_configured: Boolean(config.concept2?.accessToken),
          file_imports: { garmin: ['fit','tcx'], rp3: ['json','csv','tcx'] }
        });
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/import/file') {
        const body = await readJson(req, 18 * 1024 * 1024);
        const normalized = await normalizeFileImport(body);
        const result = await repository.ingestActivity(athleteId, normalized, identity.subject);
        return sendJson(res, result.disposition === 'created' ? 201 : 200, result);
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/import/concept2/result') {
        const body = await readJson(req, 2 * 1024 * 1024);
        const normalized = normalizeConcept2Result(body.result || body);
        const result = await repository.ingestActivity(athleteId, normalized, identity.subject);
        return sendJson(res, result.disposition === 'created' ? 201 : 200, result);
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/import/concept2/sync') {
        if (!config.concept2?.accessToken) return sendJson(res, 503, { error: 'concept2_not_configured' });
        const syncStarted = new Date();
        const explicitFrom = url.searchParams.get('from');
        const storedCursor = await repository.getImportCursor(athleteId, 'concept2');
        const updatedAfter = explicitFrom || storedCursor || null;
        const results = await fetchConcept2Results({
          baseUrl: config.concept2.baseUrl,
          accessToken: config.concept2.accessToken,
          updatedAfter,
          timeoutMs: config.concept2.timeoutMs
        });
        const dispositions = { created: 0, auto_merged: 0, exact_duplicate: 0, review: 0 };
        const failures = [];
        for (const result of results) {
          try {
            const imported = await repository.ingestActivity(athleteId, normalizeConcept2Result(result), identity.subject);
            dispositions[imported.disposition] = (dispositions[imported.disposition] || 0) + 1;
          } catch (error) {
            failures.push({ id: result?.id ?? null, error: error.message });
          }
        }
        if (!failures.length) {
          const overlapCursor = concept2CursorTime(new Date(syncStarted.getTime() - 120000));
          await repository.setImportCursor(athleteId, 'concept2', overlapCursor);
        }
        return sendJson(res, failures.length ? 207 : 200, { fetched: results.length, dispositions, failures, cursor_advanced: !failures.length });
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/journal') {
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        return sendJson(res, 200, { activities: await repository.listJournal(athleteId, { from, to, limit: url.searchParams.get('limit') }) });
      }
      const journalMatch = url.pathname.match(/^\/api\/v1\/journal\/([^/]+)$/);
      if (req.method === 'PUT' && journalMatch) {
        const body = await readJson(req);
        const activity = await repository.saveJournalEntry(athleteId, journalMatch[1], body, identity.subject);
        return sendJson(res, 200, { activity });
      }
      const mergeMatch = url.pathname.match(/^\/api\/v1\/journal\/([^/]+)\/merge$/);
      if (req.method === 'POST' && mergeMatch) {
        const body = await readJson(req);
        const duplicateId = String(body.duplicate_activity_id || '').trim();
        if (!duplicateId) return sendJson(res, 400, { error: 'duplicate_activity_id_required' });
        const activity = await repository.mergeActivities(athleteId, mergeMatch[1], duplicateId, identity.subject);
        return sendJson(res, 200, { activity });
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/p1/types') return sendJson(res, 200, { types: SPECIALIST_ARTIFACT_TYPES });
      if (req.method === 'GET' && url.pathname === '/api/v1/p1/artifacts/latest') return sendJson(res, 200, { artifacts: await repository.getLatestSpecialistArtifacts(athleteId) });
      const p1HistoryMatch = url.pathname.match(/^\/api\/v1\/p1\/artifacts\/([^/]+)\/history$/);
      if (req.method === 'GET' && p1HistoryMatch) {
        const artifactType = decodeURIComponent(p1HistoryMatch[1]);
        if (!specialistTypeInfo(artifactType)) return sendJson(res, 404, { error: 'unsupported_specialist_artifact_type' });
        return sendJson(res, 200, { artifacts: await repository.getSpecialistArtifactHistory(athleteId, artifactType, url.searchParams.get('limit')) });
      }
      const p1ArtifactMatch = url.pathname.match(/^\/api\/v1\/p1\/artifacts\/([^/]+)$/);
      if (req.method === 'GET' && p1ArtifactMatch) {
        const artifactType = decodeURIComponent(p1ArtifactMatch[1]);
        if (!specialistTypeInfo(artifactType)) return sendJson(res, 404, { error: 'unsupported_specialist_artifact_type' });
        return sendJson(res, 200, { artifact: await repository.getLatestSpecialistArtifact(athleteId, artifactType) });
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/checkins') {
        const body = await readJson(req);
        const checkin = { ...body, ...commonEnvelope(athleteId), local_date: localDate() };
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
          ...body,
          ...commonEnvelope(athleteId),
          completed_session_id: body.completed_session_id || randomUUID(),
          planned_session_id: plannedSessionId,
          session_load: Number(body.duration_min) * Number(body.session_rpe)
        };
        const errors = validateCompletedSession(completed);
        if (errors.length) return sendJson(res, 400, { error: 'invalid_completed_session', details: errors });
        return sendJson(res, 201, { completed_session: await repository.completeSession(athleteId, plannedSessionId, completed, identity.subject) });
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/adaptation/evaluate') {
        const latestCompleted = await repository.getLatestCompletedSession(athleteId);
        const activePlanned = await repository.getTodaySession(athleteId);
        const completedPrescription = !activePlanned && latestCompleted?.planned_session_id ? await repository.getPlannedSessionById(athleteId, latestCompleted.planned_session_id) : null;
        const snapshot = {
          profile: await repository.getProfile(athleteId),
          context: await repository.getContext(athleteId),
          planned_session: activePlanned || completedPrescription,
          daily_checkin: await repository.getTodayCheckin(athleteId),
          latest_completed_session: latestCompleted,
          specialist_artifacts: repository.getLatestSpecialistArtifacts ? await repository.getLatestSpecialistArtifacts(athleteId) : []
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

      const applyMatch = url.pathname.match(/^\/api\/v1\/adaptation\/([^/]+)\/apply$/);
      if (req.method === 'POST' && applyMatch) {
        const record = await repository.getAdaptationById(athleteId, applyMatch[1]);
        if (!record) return sendJson(res, 404, { error: 'adaptation_decision_not_found' });
        if (record.applied_at) return sendJson(res, 409, { error: 'adaptation_decision_already_applied' });
        const command = record.decision.revised_plan;
        const errors = validateSessionRevisionCommand(command);
        if (errors.length) return sendJson(res, 422, { error: 'unsupported_plan_revision', details: errors });
        return sendJson(res, 200, { revision: await repository.applySessionRevision(athleteId, applyMatch[1], command, identity.subject) });
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/adaptation/latest') {
        const decision = await repository.getLatestAdaptation(athleteId);
        if (!decision) return sendJson(res, 200, { decision: null });
        const record = await repository.getAdaptationById(athleteId, decision.adaptation_decision_id);
        return sendJson(res, 200, {
          decision: {
            ...decision,
            applied_at: record?.applied_at || null,
            applied_by_subject: record?.applied_by_subject || null
          }
        });
      }
      if (req.method === 'GET' && url.pathname === '/api/v1/adaptation/history') {
        const decisions = await repository.getAdaptationHistory(athleteId, url.searchParams.get('limit'));
        const enriched = await Promise.all(decisions.map(async decision => {
          const record = await repository.getAdaptationById(athleteId, decision.adaptation_decision_id);
          return {
            ...decision,
            applied_at: record?.applied_at || null,
            applied_by_subject: record?.applied_by_subject || null
          };
        }));
        return sendJson(res, 200, { decisions: enriched });
      }

      return sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      console.error(error);
      return sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'internal_error' });
    }
  };
}
