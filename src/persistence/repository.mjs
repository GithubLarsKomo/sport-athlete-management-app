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

export function createRepository(db) {
  return {
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
        const rows = await conn.query('SELECT COALESCE(MAX(profile_version),0) AS version FROM athlete_profiles WHERE athlete_id=? FOR UPDATE', [athleteId]);
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
          [plan.season.id, athleteId, plan.season.name, plan.season.start_date, plan.season.end_date, plan.season.status, plan.season.version, JSON.stringify(plan.season)]);

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
          [plan.mesocycle.id, athleteId, plan.season.id, plan.mesocycle.start_date, plan.mesocycle.end_date, plan.mesocycle.primary_adaptation, plan.mesocycle.version, JSON.stringify(plan.mesocycle)]);

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
          [plan.microcycle.id, athleteId, plan.mesocycle.id, plan.microcycle.start_date, plan.microcycle.end_date, plan.microcycle.focus, plan.microcycle.version, JSON.stringify(plan.microcycle)]);

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
        await conn.query('INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)', [athleteId, actor, 'plan.imported', 'microcycle', plan.microcycle.id, JSON.stringify({ season_id: plan.season.id, mesocycle_id: plan.mesocycle.id, session_count: plan.sessions.length, version: plan.microcycle.version })]);
        return { season_id: plan.season.id, mesocycle_id: plan.mesocycle.id, microcycle_id: plan.microcycle.id, session_count: plan.sessions.length };
      });
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
