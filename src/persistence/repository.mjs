import { randomUUID } from 'node:crypto';

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  return JSON.parse(value);
}

function isoDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function createRepository(db) {
  return {
    async ensureAthlete(identity) {
      await db.query(`INSERT INTO athletes (id, auth_subject, email, display_name)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE email=VALUES(email), display_name=VALUES(display_name), updated_at=CURRENT_TIMESTAMP(6)`,
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
      return db.query('SELECT id, goal_type, description, target_value, target_unit, target_date, priority, status FROM goals WHERE athlete_id=? ORDER BY status="active" DESC, priority ASC, target_date ASC', [athleteId]);
    },

    async createGoal(athleteId, input, actor) {
      const id = randomUUID();
      await db.query('INSERT INTO goals (id, athlete_id, goal_type, description, target_value, target_unit, target_date, priority, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, athleteId, input.goal_type, input.description, input.target_value ?? null, input.target_unit ?? null, input.target_date ?? null, input.priority ?? 1, 'active']);
      await this.audit(athleteId, actor, 'goal.created', 'goal', id, input);
      return { id, ...input, status: 'active' };
    },

    async getContext(athleteId, localDate = isoDate()) {
      const [goals, comps, seasons, mesos, micros] = await Promise.all([
        db.query('SELECT * FROM goals WHERE athlete_id=? AND status="active" ORDER BY priority ASC, target_date ASC LIMIT 1', [athleteId]),
        db.query('SELECT * FROM competitions WHERE athlete_id=? AND competition_date>=? ORDER BY competition_date ASC LIMIT 1', [athleteId, localDate]),
        db.query('SELECT id, name, start_date, end_date, status, payload_json FROM seasons WHERE athlete_id=? AND start_date<=? AND end_date>=? ORDER BY status="active" DESC LIMIT 1', [athleteId, localDate, localDate]),
        db.query('SELECT id, season_id, start_date, end_date, primary_adaptation, payload_json FROM mesocycles WHERE athlete_id=? AND start_date<=? AND end_date>=? ORDER BY start_date DESC LIMIT 1', [athleteId, localDate, localDate]),
        db.query('SELECT id, mesocycle_id, start_date, end_date, focus, payload_json FROM microcycles WHERE athlete_id=? AND start_date<=? AND end_date>=? ORDER BY start_date DESC LIMIT 1', [athleteId, localDate, localDate])
      ]);
      const map = row => row ? { ...row, payload_json: parseJson(row.payload_json) } : null;
      return { active_goal: goals[0] || null, next_competition: comps[0] || null, season: map(seasons[0]), mesocycle: map(mesos[0]), microcycle: map(micros[0]) };
    },

    async getTodaySession(athleteId, localDate = isoDate()) {
      const rows = await db.query('SELECT id, local_date, planned_start, session_type, objective, planned_duration_min, planned_rpe, status, version, payload_json FROM planned_sessions WHERE athlete_id=? AND local_date=? AND status IN ("planned","modified") ORDER BY planned_start ASC LIMIT 1', [athleteId, localDate]);
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
        ON DUPLICATE KEY UPDATE payload_json=VALUES(payload_json), updated_at=CURRENT_TIMESTAMP(6)`, [id, athleteId, payload.local_date, JSON.stringify(payload)]);
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
        await conn.query('UPDATE planned_sessions SET status=?, updated_at=CURRENT_TIMESTAMP(6) WHERE id=? AND athlete_id=?', [finalStatus, plannedSessionId, athleteId]);
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
