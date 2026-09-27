import { randomUUID } from 'node:crypto';

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  return JSON.parse(value);
}

function isoDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function plannedPayload(session) {
  return session.payload || {
    planned_session_id: session.id,
    session_type: session.session_type,
    objective: session.objective,
    planned_start: session.planned_start,
    planned_duration_min: session.planned_duration_min,
    planned_rpe: session.planned_rpe ?? null,
    intensity_rule: session.intensity_rule || 'See active training plan',
    stop_rule: session.stop_rule || 'Stop or modify on safety-relevant symptoms',
    flexibility: session.flexibility || 'movable',
    items: session.items || []
  };
}

function entityPayload(entity) {
  return entity.payload || entity;
}

async function writePlanPackage(conn, athleteId, plan) {
  const assertOwnedVersion = async (table, id, incomingVersion) => {
    const rows = await conn.query(`SELECT athlete_id, version FROM ${table} WHERE id=? FOR UPDATE`, [id]);
    if (rows[0]?.athlete_id && rows[0].athlete_id !== athleteId) throw httpError('plan_entity_conflict', 409);
    if (rows[0] && Number(rows[0].version) > incomingVersion) throw httpError('stale_plan_version', 409);
  };

  await assertOwnedVersion('seasons', plan.season.id, plan.season.version);
  await conn.query(`INSERT INTO seasons (id, athlete_id, name, start_date, end_date, status, version, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      name=EXCLUDED.name,
      start_date=EXCLUDED.start_date,
      end_date=EXCLUDED.end_date,
      status=EXCLUDED.status,
      version=EXCLUDED.version,
      payload_json=EXCLUDED.payload_json,
      updated_at=CURRENT_TIMESTAMP`,
    [plan.season.id, athleteId, plan.season.name, plan.season.start_date, plan.season.end_date, plan.season.status, plan.season.version, JSON.stringify(entityPayload(plan.season))]);

  await assertOwnedVersion('mesocycles', plan.mesocycle.id, plan.mesocycle.version);
  await conn.query(`INSERT INTO mesocycles (id, athlete_id, season_id, start_date, end_date, primary_adaptation, version, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      season_id=EXCLUDED.season_id,
      start_date=EXCLUDED.start_date,
      end_date=EXCLUDED.end_date,
      primary_adaptation=EXCLUDED.primary_adaptation,
      version=EXCLUDED.version,
      payload_json=EXCLUDED.payload_json,
      updated_at=CURRENT_TIMESTAMP`,
    [plan.mesocycle.id, athleteId, plan.season.id, plan.mesocycle.start_date, plan.mesocycle.end_date, plan.mesocycle.primary_adaptation, plan.mesocycle.version, JSON.stringify(entityPayload(plan.mesocycle))]);

  await assertOwnedVersion('microcycles', plan.microcycle.id, plan.microcycle.version);
  await conn.query(`INSERT INTO microcycles (id, athlete_id, mesocycle_id, start_date, end_date, focus, version, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      mesocycle_id=EXCLUDED.mesocycle_id,
      start_date=EXCLUDED.start_date,
      end_date=EXCLUDED.end_date,
      focus=EXCLUDED.focus,
      version=EXCLUDED.version,
      payload_json=EXCLUDED.payload_json,
      updated_at=CURRENT_TIMESTAMP`,
    [plan.microcycle.id, athleteId, plan.mesocycle.id, plan.microcycle.start_date, plan.microcycle.end_date, plan.microcycle.focus, plan.microcycle.version, JSON.stringify(entityPayload(plan.microcycle))]);

  for (const session of plan.sessions) {
    const existing = await conn.query('SELECT athlete_id, version, status FROM planned_sessions WHERE id=? FOR UPDATE', [session.id]);
    if (existing[0]?.athlete_id && existing[0].athlete_id !== athleteId) throw httpError('plan_entity_conflict', 409);
    if (existing[0] && Number(existing[0].version) > session.version) throw httpError('stale_plan_version', 409);
    if (existing[0] && ['completed','cancelled'].includes(existing[0].status)) throw httpError('cannot_overwrite_finalized_session', 409);
    const payload = plannedPayload(session);
    await conn.query(`INSERT INTO planned_sessions (id, athlete_id, microcycle_id, local_date, planned_start, session_type, objective, planned_duration_min, planned_rpe, status, version, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        microcycle_id=EXCLUDED.microcycle_id,
        local_date=EXCLUDED.local_date,
        planned_start=EXCLUDED.planned_start,
        session_type=EXCLUDED.session_type,
        objective=EXCLUDED.objective,
        planned_duration_min=EXCLUDED.planned_duration_min,
        planned_rpe=EXCLUDED.planned_rpe,
        status=EXCLUDED.status,
        version=EXCLUDED.version,
        payload_json=EXCLUDED.payload_json,
        updated_at=CURRENT_TIMESTAMP`,
      [session.id, athleteId, plan.microcycle.id, session.local_date, new Date(session.planned_start), session.session_type, session.objective, session.planned_duration_min, session.planned_rpe ?? null, session.status || 'planned', session.version, JSON.stringify(payload)]);
  }

  return {
    season_id: plan.season.id,
    mesocycle_id: plan.mesocycle.id,
    microcycle_id: plan.microcycle.id,
    session_count: plan.sessions.length
  };
}

export function createRepository(db) {
  return {
    async resolvePrincipal(identity) {
      let rows = await db.query(
        'SELECT auth_subject, role, athlete_id, email, display_name, active FROM app_principals WHERE auth_subject=? LIMIT 1',
        [identity.subject]
      );

      if (!rows[0]) {
        await this.ensureAthlete(identity);
        await db.query(`INSERT INTO app_principals (auth_subject, role, athlete_id, email, display_name, active)
          VALUES (?, 'athlete', ?, ?, ?, TRUE)
          ON CONFLICT (auth_subject) DO NOTHING`,
          [identity.subject, identity.athleteId, identity.email, identity.displayName]);
        rows = await db.query(
          'SELECT auth_subject, role, athlete_id, email, display_name, active FROM app_principals WHERE auth_subject=? LIMIT 1',
          [identity.subject]
        );
      }

      const principal = rows[0];
      if (!principal || !principal.active) throw httpError('principal_inactive', 403);

      if (principal.role === 'athlete') {
        if (!principal.athlete_id) throw httpError('principal_athlete_missing', 500);
        await db.query(
          'UPDATE athletes SET email=?, display_name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
          [identity.email, identity.displayName, principal.athlete_id]
        );
      } else {
        await db.query(
          'UPDATE app_principals SET email=?, display_name=?, updated_at=CURRENT_TIMESTAMP WHERE auth_subject=?',
          [identity.email, identity.displayName, identity.subject]
        );
      }

      return {
        subject: identity.subject,
        role: principal.role,
        athleteId: principal.athlete_id || null,
        email: identity.email || principal.email || null,
        displayName: identity.displayName || principal.display_name || identity.subject
      };
    },

    async ensureCoachPrincipal(identity, actor = 'operator') {
      return db.transaction(async conn => {
        const existing = await conn.query(
          'SELECT auth_subject, role, athlete_id, active FROM app_principals WHERE auth_subject=? FOR UPDATE',
          [identity.subject]
        );
        if (existing[0]?.role === 'athlete') throw httpError('principal_role_conflict', 409);

        await conn.query(`INSERT INTO app_principals (auth_subject, role, athlete_id, email, display_name, active)
          VALUES (?, 'coach', NULL, ?, ?, TRUE)
          ON CONFLICT (auth_subject) DO UPDATE SET
            email=EXCLUDED.email,
            display_name=EXCLUDED.display_name,
            active=TRUE,
            updated_at=CURRENT_TIMESTAMP`,
          [identity.subject, identity.email || null, identity.displayName || identity.subject]);

        await conn.query(
          'INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (NULL, ?, ?, ?, ?, ?)',
          [actor, 'coach.principal.provisioned', 'app_principal', identity.subject, JSON.stringify({ role: 'coach' })]
        );

        return {
          subject: identity.subject,
          role: 'coach',
          athleteId: null,
          email: identity.email || null,
          displayName: identity.displayName || identity.subject
        };
      });
    },

    async setCoachAthleteAssignment({ coachSubject, athleteId, active, actor = 'operator' }) {
      return db.transaction(async conn => {
        const coach = await conn.query(
          "SELECT auth_subject FROM app_principals WHERE auth_subject=? AND role='coach' AND active=TRUE FOR UPDATE",
          [coachSubject]
        );
        if (!coach[0]) throw httpError('coach_principal_not_found', 404);

        const athlete = await conn.query('SELECT id FROM athletes WHERE id=? AND active=TRUE FOR UPDATE', [athleteId]);
        if (!athlete[0]) throw httpError('athlete_not_found', 404);

        const current = await conn.query(
          'SELECT id FROM coach_athlete_assignments WHERE coach_subject=? AND athlete_id=? AND active=TRUE AND effective_to IS NULL FOR UPDATE',
          [coachSubject, athleteId]
        );

        if (active) {
          if (current[0]) return { assignment_id: current[0].id, coach_subject: coachSubject, athlete_id: athleteId, active: true, changed: false };
          const id = randomUUID();
          await conn.query(
            'INSERT INTO coach_athlete_assignments (id, coach_subject, athlete_id, active, assigned_by_subject) VALUES (?, ?, ?, TRUE, ?)',
            [id, coachSubject, athleteId, actor]
          );
          await conn.query(
            'INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
            [athleteId, actor, 'coach.assignment.granted', 'coach_athlete_assignment', id, JSON.stringify({ coach_subject: coachSubject })]
          );
          return { assignment_id: id, coach_subject: coachSubject, athlete_id: athleteId, active: true, changed: true };
        }

        if (!current[0]) return { assignment_id: null, coach_subject: coachSubject, athlete_id: athleteId, active: false, changed: false };
        await conn.query(
          'UPDATE coach_athlete_assignments SET active=FALSE, effective_to=CURRENT_TIMESTAMP WHERE id=?',
          [current[0].id]
        );
        await conn.query(
          'INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
          [athleteId, actor, 'coach.assignment.revoked', 'coach_athlete_assignment', current[0].id, JSON.stringify({ coach_subject: coachSubject })]
        );
        return { assignment_id: current[0].id, coach_subject: coachSubject, athlete_id: athleteId, active: false, changed: true };
      });
    },

    async listCoachAthletes(coachSubject) {
      return db.query(`SELECT a.id AS athlete_id, a.email, a.display_name, ca.effective_from AS assigned_at
        FROM coach_athlete_assignments ca
        JOIN app_principals p ON p.auth_subject=ca.coach_subject AND p.role='coach' AND p.active=TRUE
        JOIN athletes a ON a.id=ca.athlete_id AND a.active=TRUE
        WHERE ca.coach_subject=? AND ca.active=TRUE AND ca.effective_to IS NULL
        ORDER BY COALESCE(a.display_name, a.id), a.id`, [coachSubject]);
    },

    async coachCanAccess(coachSubject, athleteId) {
      const rows = await db.query(`SELECT 1 AS allowed
        FROM coach_athlete_assignments ca
        JOIN app_principals p ON p.auth_subject=ca.coach_subject AND p.role='coach' AND p.active=TRUE
        JOIN athletes a ON a.id=ca.athlete_id AND a.active=TRUE
        WHERE ca.coach_subject=? AND ca.athlete_id=? AND ca.active=TRUE AND ca.effective_to IS NULL
        LIMIT 1`, [coachSubject, athleteId]);
      return Boolean(rows[0]);
    },

    async ensureAthlete(identity) {
      await db.query(`INSERT INTO athletes (id, auth_subject, email, display_name)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (auth_subject) DO UPDATE SET
          email=EXCLUDED.email,
          display_name=EXCLUDED.display_name,
          updated_at=CURRENT_TIMESTAMP`,
        [identity.athleteId, identity.subject, identity.email, identity.displayName]);
      return identity;
    },

    async getProfile(athleteId) {
      const rows = await db.query('SELECT payload_json FROM athlete_profiles WHERE athlete_id=? ORDER BY profile_version DESC LIMIT 1', [athleteId]);
      return rows[0] ? parseJson(rows[0].payload_json) : null;
    },

    async putProfile(athleteId, payload, actor) {
      return db.transaction(async conn => {
        const athlete = await conn.query('SELECT id FROM athletes WHERE id=? FOR UPDATE', [athleteId]);
        if (!athlete[0]) throw httpError('athlete_not_found', 404);
        const rows = await conn.query('SELECT COALESCE(MAX(profile_version),0) AS version FROM athlete_profiles WHERE athlete_id=?', [athleteId]);
        const version = Number(rows[0].version) + 1;
        payload.profile_version = version;
        payload.valid_from = new Date().toISOString();
        await conn.query('INSERT INTO athlete_profiles (athlete_id, profile_version, valid_from, payload_json) VALUES (?, ?, ?, ?)', [athleteId, version, new Date(), JSON.stringify(payload)]);
        await conn.query('INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)', [athleteId, actor, 'profile.updated', 'athlete_profile', `${athleteId}:${version}`, JSON.stringify({ version })]);
        return payload;
      });
    },

    async getGoals(athleteId) {
      return db.query("SELECT id, goal_type, description, target_value, target_unit, target_date, priority, status FROM goals WHERE athlete_id=? ORDER BY (status='active') DESC, priority ASC, target_date ASC", [athleteId]);
    },

    async createGoal(athleteId, input, actor) {
      const id = randomUUID();
      await db.query('INSERT INTO goals (id, athlete_id, goal_type, description, target_value, target_unit, target_date, priority, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, athleteId, input.goal_type, input.description, input.target_value ?? null, input.target_unit ?? null, input.target_date ?? null, input.priority ?? 1, 'active']);
      await this.audit(athleteId, actor, 'goal.created', 'goal', id, input);
      return { id, ...input, status: 'active' };
    },

    async applyPlanPackage(athleteId, plan, actor) {
      return db.transaction(async conn => {
        const applied = await writePlanPackage(conn, athleteId, plan);
        await conn.query(
          'INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
          [athleteId, actor, 'plan.imported', 'microcycle', plan.microcycle.id, JSON.stringify({
            season_id: plan.season.id,
            mesocycle_id: plan.mesocycle.id,
            session_count: plan.sessions.length,
            version: plan.microcycle.version,
            source: 'legacy_plan_package'
          })]
        );
        return applied;
      });
    },

    async importCanonicalPlanBundle(athleteId, normalized, actor) {
      return db.transaction(async conn => {
        await conn.query('SELECT pg_advisory_xact_lock(hashtext(?))', [`sport-journal:plan-import:${athleteId}`]);

        const existing = await conn.query(
          'SELECT id, revision, content_hash, producer_json, source_refs_json, supersedes_import_id, created_at FROM training_plan_imports WHERE athlete_id=? AND content_hash=? LIMIT 1',
          [athleteId, normalized.contentHash]
        );
        if (existing[0]) {
          const row = existing[0];
          await conn.query(
            'INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
            [athleteId, actor, 'plan.canonical_import_unchanged', 'training_plan_import', row.id, JSON.stringify({
              revision: Number(row.revision),
              content_hash: row.content_hash
            })]
          );
          return {
            import_id: row.id,
            revision: Number(row.revision),
            content_hash: row.content_hash,
            producer: parseJson(row.producer_json),
            source_refs: parseJson(row.source_refs_json) || [],
            supersedes_import_id: row.supersedes_import_id || null,
            imported_at: row.created_at,
            disposition: 'unchanged'
          };
        }

        const latestRows = await conn.query(
          'SELECT id, revision FROM training_plan_imports WHERE athlete_id=? ORDER BY revision DESC LIMIT 1 FOR UPDATE',
          [athleteId]
        );
        const previous = latestRows[0] || null;
        const revision = previous ? Number(previous.revision) + 1 : 1;
        const applied = await writePlanPackage(conn, athleteId, normalized.planPackage);
        const importId = randomUUID();

        await conn.query(
          `INSERT INTO training_plan_imports
            (id, athlete_id, revision, content_hash, producer_json, source_refs_json, bundle_json, imported_by_subject, supersedes_import_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            importId,
            athleteId,
            revision,
            normalized.contentHash,
            JSON.stringify(normalized.producer),
            JSON.stringify(normalized.sourceRefs),
            JSON.stringify(normalized.bundle),
            actor,
            previous?.id || null
          ]
        );
        await conn.query(
          'INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
          [athleteId, actor, 'plan.canonical_imported', 'training_plan_import', importId, JSON.stringify({
            revision,
            content_hash: normalized.contentHash,
            supersedes_import_id: previous?.id || null,
            session_count: applied.session_count,
            producer: normalized.producer
          })]
        );

        return {
          import_id: importId,
          revision,
          content_hash: normalized.contentHash,
          producer: normalized.producer,
          source_refs: normalized.sourceRefs,
          supersedes_import_id: previous?.id || null,
          imported_at: new Date().toISOString(),
          disposition: 'created',
          applied
        };
      });
    },

    async listPlanImports(athleteId, limit = 20) {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
      const rows = await db.query(
        `SELECT id, revision, content_hash, producer_json, source_refs_json, imported_by_subject, supersedes_import_id, created_at
         FROM training_plan_imports
         WHERE athlete_id=?
         ORDER BY revision DESC
         LIMIT ?`,
        [athleteId, safeLimit]
      );
      return rows.map(row => ({
        import_id: row.id,
        revision: Number(row.revision),
        content_hash: row.content_hash,
        producer: parseJson(row.producer_json),
        source_refs: parseJson(row.source_refs_json) || [],
        imported_by_subject: row.imported_by_subject,
        supersedes_import_id: row.supersedes_import_id || null,
        imported_at: row.created_at
      }));
    },

    async getWeekSessions(athleteId, fromDate = isoDate()) {
      const start = new Date(`${fromDate}T00:00:00Z`);
      const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
      const toDate = end.toISOString().slice(0, 10);
      const rows = await db.query('SELECT id, local_date, planned_start, session_type, objective, planned_duration_min, planned_rpe, status, version, payload_json FROM planned_sessions WHERE athlete_id=? AND local_date BETWEEN ? AND ? ORDER BY local_date, planned_start', [athleteId, fromDate, toDate]);
      return rows.map(row => ({ ...row, payload: parseJson(row.payload_json) }));
    },

    async getPlannedSessionById(athleteId, sessionId) {
      const rows = await db.query('SELECT id, local_date, planned_start, session_type, objective, planned_duration_min, planned_rpe, status, version, payload_json FROM planned_sessions WHERE athlete_id=? AND id=? LIMIT 1', [athleteId, sessionId]);
      return rows[0] ? { ...rows[0], payload: parseJson(rows[0].payload_json) } : null;
    },

    async getContext(athleteId, localDate = isoDate()) {
      const [goals, comps, seasons, mesos, micros] = await Promise.all([
        db.query("SELECT * FROM goals WHERE athlete_id=? AND status='active' ORDER BY priority ASC, target_date ASC LIMIT 1", [athleteId]),
        db.query('SELECT * FROM competitions WHERE athlete_id=? AND competition_date>=? ORDER BY competition_date ASC LIMIT 1', [athleteId, localDate]),
        db.query("SELECT id, name, start_date, end_date, status, version, payload_json FROM seasons WHERE athlete_id=? AND start_date<=? AND end_date>=? ORDER BY (status='active') DESC LIMIT 1", [athleteId, localDate, localDate]),
        db.query('SELECT id, season_id, start_date, end_date, primary_adaptation, version, payload_json FROM mesocycles WHERE athlete_id=? AND start_date<=? AND end_date>=? ORDER BY start_date DESC LIMIT 1', [athleteId, localDate, localDate]),
        db.query('SELECT id, mesocycle_id, start_date, end_date, focus, version, payload_json FROM microcycles WHERE athlete_id=? AND start_date<=? AND end_date>=? ORDER BY start_date DESC LIMIT 1', [athleteId, localDate, localDate])
      ]);
      const map = row => row ? { ...row, payload_json: parseJson(row.payload_json) } : null;
      return { active_goal: goals[0] || null, next_competition: comps[0] || null, season: map(seasons[0]), mesocycle: map(mesos[0]), microcycle: map(micros[0]) };
    },

    async getTodaySession(athleteId, localDate = isoDate()) {
      const rows = await db.query("SELECT id, local_date, planned_start, session_type, objective, planned_duration_min, planned_rpe, status, version, payload_json FROM planned_sessions WHERE athlete_id=? AND local_date=? AND status IN ('planned','modified') ORDER BY planned_start ASC LIMIT 1", [athleteId, localDate]);
      if (!rows[0]) return null;
      return { ...rows[0], payload: parseJson(rows[0].payload_json) };
    },

    async getTodayCheckin(athleteId, localDate = isoDate()) {
      const rows = await db.query('SELECT payload_json FROM daily_checkins WHERE athlete_id=? AND local_date=? LIMIT 1', [athleteId, localDate]);
      return rows[0] ? parseJson(rows[0].payload_json) : null;
    },

    async saveCheckin(athleteId, payload, actor) {
      const id = randomUUID();
      await db.query(`INSERT INTO daily_checkins (id, athlete_id, local_date, payload_json) VALUES (?, ?, ?, ?)
        ON CONFLICT (athlete_id, local_date) DO UPDATE SET
          payload_json=EXCLUDED.payload_json,
          updated_at=CURRENT_TIMESTAMP`, [id, athleteId, payload.local_date, JSON.stringify(payload)]);
      await this.audit(athleteId, actor, 'checkin.saved', 'daily_checkin', payload.local_date, { local_date: payload.local_date });
      return payload;
    },

    async completeSession(athleteId, plannedSessionId, payload, actor) {
      return db.transaction(async conn => {
        const owned = await conn.query('SELECT id, status FROM planned_sessions WHERE id=? AND athlete_id=? FOR UPDATE', [plannedSessionId, athleteId]);
        if (!owned[0]) throw Object.assign(new Error('planned_session_not_found'), { statusCode: 404 });
        if (!new Set(['planned', 'modified']).has(owned[0].status)) throw Object.assign(new Error('planned_session_already_finalized'), { statusCode: 409 });
        await conn.query('INSERT INTO completed_sessions (id, athlete_id, planned_session_id, started_at, completed_at, duration_min, session_rpe, session_load, completion_status, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [payload.completed_session_id, athleteId, plannedSessionId, new Date(payload.started_at), new Date(payload.completed_at), payload.duration_min, payload.session_rpe, payload.session_load, payload.completion_status, JSON.stringify(payload)]);
        const finalStatus = payload.completion_status === 'not_started' ? 'cancelled' : 'completed';
        await conn.query('UPDATE planned_sessions SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND athlete_id=?', [finalStatus, plannedSessionId, athleteId]);
        await conn.query('INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)', [athleteId, actor, 'session.completed', 'completed_session', payload.completed_session_id, JSON.stringify({ planned_session_id: plannedSessionId, session_load: payload.session_load })]);
        return payload;
      });
    },

    async getLatestCompletedSession(athleteId) {
      const rows = await db.query('SELECT payload_json FROM completed_sessions WHERE athlete_id=? ORDER BY completed_at DESC LIMIT 1', [athleteId]);
      return rows[0] ? parseJson(rows[0].payload_json) : null;
    },

    async saveAdaptation(athleteId, decision, actor) {
      await db.query('INSERT INTO adaptation_decisions (id, athlete_id, decision_level, action, safety_state, trigger_text, input_snapshot_json, previous_plan_json, decision_json, revised_plan_json, rationale, confidence, human_override, engine_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [decision.adaptation_decision_id, athleteId, decision.decision_level, decision.action, decision.safety_state, decision.trigger, JSON.stringify(decision.input_snapshot), JSON.stringify(decision.previous_plan ?? null), JSON.stringify(decision), JSON.stringify(decision.revised_plan ?? null), decision.rationale, decision.confidence, decision.human_override, decision.engine_version || 'unknown']);
      await this.audit(athleteId, actor, 'adaptation.recorded', 'adaptation_decision', decision.adaptation_decision_id, { action: decision.action, safety_state: decision.safety_state });
      return decision;
    },

    async getAdaptationById(athleteId, decisionId) {
      const rows = await db.query('SELECT decision_json, applied_at, applied_by_subject FROM adaptation_decisions WHERE athlete_id=? AND id=? LIMIT 1', [athleteId, decisionId]);
      return rows[0] ? { decision: parseJson(rows[0].decision_json), applied_at: rows[0].applied_at || null, applied_by_subject: rows[0].applied_by_subject || null } : null;
    },

    async applySessionRevision(athleteId, decisionId, command, actor) {
      return db.transaction(async conn => {
        const decisionRows = await conn.query('SELECT applied_at FROM adaptation_decisions WHERE id=? AND athlete_id=? FOR UPDATE', [decisionId, athleteId]);
        if (!decisionRows[0]) throw httpError('adaptation_decision_not_found', 404);
        if (decisionRows[0].applied_at) throw httpError('adaptation_decision_already_applied', 409);

        const rows = await conn.query('SELECT id, local_date, planned_start, session_type, objective, planned_duration_min, planned_rpe, status, version, payload_json FROM planned_sessions WHERE id=? AND athlete_id=? FOR UPDATE', [command.entity_id, athleteId]);
        const row = rows[0];
        if (!row) throw httpError('planned_session_not_found', 404);
        if (!['planned','modified'].includes(row.status)) throw httpError('planned_session_already_finalized', 409);
        if (Number(row.version) !== command.expected_version) throw httpError('plan_version_conflict', 409);

        const patch = command.patch;
        const plannedStart = patch.planned_start ? new Date(patch.planned_start) : new Date(row.planned_start);
        const localDate = patch.local_date || isoDate(plannedStart);
        const objective = patch.objective ?? row.objective;
        const duration = patch.planned_duration_min ?? Number(row.planned_duration_min);
        const rpe = Object.prototype.hasOwnProperty.call(patch, 'planned_rpe') ? patch.planned_rpe : (row.planned_rpe == null ? null : Number(row.planned_rpe));
        const status = patch.status ?? 'modified';
        const priorPayload = parseJson(row.payload_json) || {};
        const payload = {
          ...priorPayload,
          ...(patch.payload || {}),
          planned_session_id: row.id,
          planned_start: plannedStart.toISOString(),
          objective,
          planned_duration_min: duration,
          planned_rpe: rpe
        };
        const newVersion = Number(row.version) + 1;
        await conn.query('UPDATE planned_sessions SET local_date=?, planned_start=?, objective=?, planned_duration_min=?, planned_rpe=?, status=?, version=?, payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND athlete_id=?', [localDate, plannedStart, objective, duration, rpe, status, newVersion, JSON.stringify(payload), row.id, athleteId]);
        const revisionId = randomUUID();
        await conn.query('INSERT INTO training_plan_revisions (id, athlete_id, affected_entity_type, affected_entity_id, prior_version, new_version, adaptation_decision_id, revision_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [revisionId, athleteId, 'planned_session', row.id, Number(row.version), newVersion, decisionId, JSON.stringify(command)]);
        await conn.query('UPDATE adaptation_decisions SET applied_at=CURRENT_TIMESTAMP, applied_by_subject=? WHERE id=? AND athlete_id=?', [actor, decisionId, athleteId]);
        await conn.query('INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)', [athleteId, actor, 'adaptation.applied', 'planned_session', row.id, JSON.stringify({ decision_id: decisionId, prior_version: Number(row.version), new_version: newVersion, revision_id: revisionId })]);
        return { revision_id: revisionId, session_id: row.id, prior_version: Number(row.version), new_version: newVersion, status, local_date: localDate, planned_start: plannedStart.toISOString(), objective, planned_duration_min: duration, planned_rpe: rpe };
      });
    },

    async getLatestAdaptation(athleteId) {
      const rows = await db.query('SELECT decision_json FROM adaptation_decisions WHERE athlete_id=? ORDER BY created_at DESC LIMIT 1', [athleteId]);
      return rows[0] ? parseJson(rows[0].decision_json) : null;
    },

    async getAdaptationHistory(athleteId, limit = 20) {
      const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const rows = await db.query(`SELECT decision_json FROM adaptation_decisions WHERE athlete_id=? ORDER BY created_at DESC LIMIT ${safeLimit}`, [athleteId]);
      return rows.map(row => parseJson(row.decision_json));
    },

    async audit(athleteId, actor, eventType, entityType, entityId, details) {
      await db.query('INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)', [athleteId, actor, eventType, entityType, entityId, JSON.stringify(details || {})]);
    }
  };
}
