import { randomUUID } from 'node:crypto';
import { canonicalFromSources, matchActivity } from '../domain/activity-import.mjs';

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  return JSON.parse(value);
}

function rowsWithJson(rows) {
  return rows.map(row => ({
    ...row,
    canonical_summary: parseJson(row.canonical_summary_json) || {},
    journal: row.journal_json ? parseJson(row.journal_json) : null
  }));
}

function completionPayload(athleteId, activity, journal, completedId) {
  return {
    schema_version: 1,
    athlete_id: athleteId,
    generated_at: new Date().toISOString(),
    source_refs: [`activity:${activity.id}`],
    uncertainties: [],
    safety_flags: [],
    completed_session_id: completedId,
    planned_session_id: activity.planned_session_id,
    started_at: new Date(activity.started_at).toISOString(),
    completed_at: activity.ended_at ? new Date(activity.ended_at).toISOString() : new Date(new Date(activity.started_at).getTime() + Number(activity.duration_s || 0) * 1000).toISOString(),
    duration_min: Number(activity.duration_s || 0) / 60,
    session_rpe: Number(journal.session_rpe),
    session_load: Number(activity.duration_s || 0) / 60 * Number(journal.session_rpe),
    completion_status: 'completed',
    deviations: journal.deviations || [],
    import_activity_id: activity.id,
    comment: journal.comment || null,
    pain_0_10: journal.pain_0_10 ?? null
  };
}

async function fetchSources(conn, activityId) {
  const rows = await conn.query(`SELECT id, provider, external_activity_id, source_started_at, source_ended_at,
    raw_sha256, summary_json, intervals_json, samples_json, imported_at
    FROM activity_sources WHERE activity_id=? ORDER BY imported_at ASC`, [activityId]);
  return rows.map(row => ({
    ...row,
    summary: parseJson(row.summary_json) || {},
    intervals: parseJson(row.intervals_json) || [],
    samples: parseJson(row.samples_json) || []
  }));
}

async function refreshCanonical(conn, activityId) {
  const activityRows = await conn.query('SELECT id, activity_type, started_at, ended_at FROM activities WHERE id=? FOR UPDATE', [activityId]);
  const activity = activityRows[0];
  if (!activity) return null;
  const sources = await fetchSources(conn, activityId);
  const canonical = canonicalFromSources(sources, activity.activity_type);
  const canonicalSource = sources.find(source => source.provider === canonical.canonicalSource);
  const startedAt = canonicalSource?.source_started_at || activity.started_at;
  const endedAt = canonicalSource?.source_ended_at || activity.ended_at;
  await conn.query(`UPDATE activities SET canonical_source=?, canonical_summary_json=?, started_at=?, ended_at=?,
    duration_s=?, distance_m=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
    canonical.canonicalSource,
    JSON.stringify(canonical.summary),
    startedAt,
    endedAt,
    canonical.summary.duration_s,
    canonical.summary.distance_m,
    activityId
  ]);
  return { ...canonical, sources };
}

async function plannedSessionMatch(conn, athleteId, incoming) {
  if (!incoming.startedAt) return null;
  const rows = await conn.query(`SELECT id, planned_start, session_type, planned_duration_min, status
    FROM planned_sessions
    WHERE athlete_id=? AND status IN ('planned','modified')
      AND planned_start BETWEEN (?::timestamptz - INTERVAL '8 hours') AND (?::timestamptz + INTERVAL '8 hours')
    ORDER BY ABS(EXTRACT(EPOCH FROM (planned_start - ?::timestamptz))) ASC
    LIMIT 3`, [athleteId, incoming.startedAt, incoming.startedAt, incoming.startedAt]);
  for (const row of rows) {
    const diffH = Math.abs(new Date(row.planned_start).getTime() - new Date(incoming.startedAt).getTime()) / 3600000;
    if (diffH > 4) continue;
    const plannedMin = Number(row.planned_duration_min || 0);
    const importedMin = Number(incoming.durationS || 0) / 60;
    if (plannedMin && importedMin && Math.abs(plannedMin - importedMin) / Math.max(plannedMin, importedMin) > 0.6) continue;
    return row.id;
  }
  return null;
}

async function completedSessionMatch(conn, athleteId, activity) {
  const rows = await conn.query(`SELECT id, planned_session_id, started_at, completed_at, duration_min
    FROM completed_sessions
    WHERE athlete_id=?
      AND started_at BETWEEN (?::timestamptz - INTERVAL '15 minutes') AND (?::timestamptz + INTERVAL '15 minutes')
    ORDER BY ABS(EXTRACT(EPOCH FROM (started_at - ?::timestamptz))) ASC
    LIMIT 5`, [athleteId, activity.started_at, activity.started_at, activity.started_at]);
  const activityStart = new Date(activity.started_at).getTime();
  const activityDurationMin = Number(activity.duration_s || 0) / 60;
  for (const row of rows) {
    const startDiffS = Math.abs(new Date(row.started_at).getTime() - activityStart) / 1000;
    if (startDiffS > 5 * 60) continue;
    const completedDurationMin = Number(row.duration_min || 0);
    if (activityDurationMin && completedDurationMin) {
      const relativeDiff = Math.abs(activityDurationMin - completedDurationMin) / Math.max(activityDurationMin, completedDurationMin);
      if (relativeDiff > 0.2) continue;
    }
    return row;
  }
  return null;
}

export function createActivityRepository(db) {
  return {
    async ingestActivity(athleteId, incoming, actor) {
      if (!incoming?.provider || !incoming?.activityType || !incoming?.startedAt || !incoming?.rawSha256) {
        throw Object.assign(new Error('invalid_normalized_activity'), { statusCode: 400 });
      }
      return db.transaction(async conn => {
        let existing = [];
        if (incoming.externalActivityId) {
          existing = await conn.query(`SELECT s.activity_id FROM activity_sources s
            WHERE s.athlete_id=? AND s.provider=? AND s.external_activity_id=? LIMIT 1`, [athleteId, incoming.provider, incoming.externalActivityId]);
        }
        if (!existing[0]) {
          existing = await conn.query(`SELECT s.activity_id FROM activity_sources s
            WHERE s.athlete_id=? AND s.provider=? AND s.raw_sha256=? LIMIT 1`, [athleteId, incoming.provider, incoming.rawSha256]);
        }
        if (existing[0]) {
          const activity = await this.getJournalActivity(athleteId, existing[0].activity_id, conn);
          return { activity, disposition: 'exact_duplicate' };
        }

        const candidates = await conn.query(`SELECT id, activity_type, started_at, ended_at, duration_s, distance_m, canonical_source
          FROM activities WHERE athlete_id=?
          AND started_at BETWEEN (?::timestamptz - INTERVAL '15 minutes') AND (?::timestamptz + INTERVAL '15 minutes')
          ORDER BY ABS(EXTRACT(EPOCH FROM (started_at - ?::timestamptz))) ASC LIMIT 12`,
        [athleteId, incoming.startedAt, incoming.startedAt, incoming.startedAt]);
        let best = null;
        for (const candidate of candidates) {
          const match = matchActivity(candidate, incoming);
          if (!best || match.score > best.match.score) best = { candidate, match };
        }

        let activityId;
        let disposition;
        if (best?.match.classification === 'auto_merge') {
          activityId = best.candidate.id;
          disposition = 'auto_merged';
          await conn.query(`UPDATE activities SET match_state='auto_merged', match_score=GREATEST(COALESCE(match_score,0), ?), updated_at=CURRENT_TIMESTAMP WHERE id=?`, [best.match.score, activityId]);
        } else {
          activityId = randomUUID();
          disposition = best?.match.classification === 'review' ? 'review' : 'created';
          const plannedSessionId = await plannedSessionMatch(conn, athleteId, incoming);
          await conn.query(`INSERT INTO activities
            (id, athlete_id, planned_session_id, activity_type, started_at, ended_at, duration_s, distance_m, canonical_source, canonical_summary_json, match_state, match_candidate_activity_id, match_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            activityId, athleteId, plannedSessionId, incoming.activityType, incoming.startedAt, incoming.endedAt,
            incoming.durationS, incoming.distanceM, incoming.provider, JSON.stringify(incoming.summary || {}),
            disposition === 'review' ? 'review' : 'standalone', best?.match.classification === 'review' ? best.candidate.id : null,
            best?.match.classification === 'review' ? best.match.score : null
          ]);
        }

        const sourceId = randomUUID();
        await conn.query(`INSERT INTO activity_sources
          (id, activity_id, athlete_id, provider, external_activity_id, source_started_at, source_ended_at, raw_sha256, summary_json, intervals_json, samples_json, raw_payload_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          sourceId, activityId, athleteId, incoming.provider, incoming.externalActivityId || null, incoming.startedAt, incoming.endedAt,
          incoming.rawSha256, JSON.stringify(incoming.summary || {}), JSON.stringify(incoming.intervals || []), JSON.stringify(incoming.samples || []), JSON.stringify(incoming.rawPayload || {})
        ]);
        await refreshCanonical(conn, activityId);
        await conn.query(`INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json)
          VALUES (?, ?, 'activity.imported', 'activity', ?, ?)`, [athleteId, actor, activityId, JSON.stringify({ provider: incoming.provider, external_activity_id: incoming.externalActivityId || null, disposition, source_id: sourceId })]);
        const activity = await this.getJournalActivity(athleteId, activityId, conn);
        return { activity, disposition };
      });
    },

    async getJournalActivity(athleteId, activityId, connection = null) {
      const conn = connection || db;
      const rows = await conn.query(`SELECT a.*,
        CASE WHEN j.activity_id IS NULL THEN NULL ELSE jsonb_build_object(
          'session_rpe', j.session_rpe, 'pain_0_10', j.pain_0_10, 'comment', j.comment,
          'deviations', j.deviations_json, 'finalized_at', j.finalized_at, 'updated_at', j.updated_at
        ) END AS journal_json
        FROM activities a LEFT JOIN activity_journal_entries j ON j.activity_id=a.id
        WHERE a.athlete_id=? AND a.id=? LIMIT 1`, [athleteId, activityId]);
      if (!rows[0]) return null;
      const activity = rowsWithJson(rows)[0];
      activity.sources = await fetchSources(conn, activityId);
      return activity;
    },

    async listJournal(athleteId, { from = null, to = null, limit = 50 } = {}) {
      const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
      const params = [athleteId];
      const filters = ['a.athlete_id=?'];
      if (from) { filters.push(`a.started_at >= ?::timestamptz`); params.push(from); }
      if (to) { filters.push(`a.started_at < ?::timestamptz`); params.push(to); }
      const rows = await db.query(`SELECT a.*,
        CASE WHEN j.activity_id IS NULL THEN NULL ELSE jsonb_build_object(
          'session_rpe', j.session_rpe, 'pain_0_10', j.pain_0_10, 'comment', j.comment,
          'deviations', j.deviations_json, 'finalized_at', j.finalized_at, 'updated_at', j.updated_at
        ) END AS journal_json
        FROM activities a LEFT JOIN activity_journal_entries j ON j.activity_id=a.id
        WHERE ${filters.join(' AND ')} ORDER BY a.started_at DESC LIMIT ${safeLimit}`, params);
      const activities = rowsWithJson(rows);
      for (const activity of activities) activity.sources = await fetchSources(db, activity.id);
      return activities;
    },

    async saveJournalEntry(athleteId, activityId, input, actor) {
      return db.transaction(async conn => {
        const rows = await conn.query('SELECT * FROM activities WHERE athlete_id=? AND id=? FOR UPDATE', [athleteId, activityId]);
        const activity = rows[0];
        if (!activity) throw Object.assign(new Error('activity_not_found'), { statusCode: 404 });
        const sessionRpe = input.session_rpe == null || input.session_rpe === '' ? null : Number(input.session_rpe);
        const pain = input.pain_0_10 == null || input.pain_0_10 === '' ? null : Number(input.pain_0_10);
        if (sessionRpe != null && (!Number.isFinite(sessionRpe) || sessionRpe < 0 || sessionRpe > 10)) throw Object.assign(new Error('invalid_session_rpe'), { statusCode: 400 });
        if (pain != null && (!Number.isInteger(pain) || pain < 0 || pain > 10)) throw Object.assign(new Error('invalid_pain'), { statusCode: 400 });
        const finalize = Boolean(input.finalize);
        if (finalize && sessionRpe == null) throw Object.assign(new Error('session_rpe_required_to_finalize'), { statusCode: 400 });
        const deviations = Array.isArray(input.deviations) ? input.deviations : [];
        await conn.query(`INSERT INTO activity_journal_entries (activity_id, athlete_id, session_rpe, pain_0_10, comment, deviations_json, finalized_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (activity_id) DO UPDATE SET session_rpe=EXCLUDED.session_rpe, pain_0_10=EXCLUDED.pain_0_10,
          comment=EXCLUDED.comment, deviations_json=EXCLUDED.deviations_json,
          finalized_at=COALESCE(activity_journal_entries.finalized_at, EXCLUDED.finalized_at), updated_at=CURRENT_TIMESTAMP`, [
          activityId, athleteId, sessionRpe, pain, input.comment ? String(input.comment).slice(0, 4000) : null,
          JSON.stringify(deviations), finalize ? new Date() : null
        ]);

        let completedSessionId = activity.completed_session_id;
        if (finalize && !completedSessionId) {
          let existing = null;
          if (activity.planned_session_id) {
            const rowsByPlan = await conn.query('SELECT id, planned_session_id FROM completed_sessions WHERE athlete_id=? AND planned_session_id=? ORDER BY created_at DESC LIMIT 1', [athleteId, activity.planned_session_id]);
            existing = rowsByPlan[0] || null;
          }
          if (!existing) existing = await completedSessionMatch(conn, athleteId, activity);
          if (existing) {
            completedSessionId = existing.id;
            if (!activity.planned_session_id && existing.planned_session_id) {
              activity.planned_session_id = existing.planned_session_id;
              await conn.query('UPDATE activities SET planned_session_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [existing.planned_session_id, activityId]);
            }
          } else {
            completedSessionId = randomUUID();
            const payload = completionPayload(athleteId, activity, { ...input, session_rpe: sessionRpe, pain_0_10: pain, deviations }, completedSessionId);
            await conn.query(`INSERT INTO completed_sessions
              (id, athlete_id, planned_session_id, started_at, completed_at, duration_min, session_rpe, session_load, completion_status, payload_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`, [
              completedSessionId, athleteId, activity.planned_session_id || null, new Date(payload.started_at), new Date(payload.completed_at),
              payload.duration_min, sessionRpe, payload.session_load, JSON.stringify(payload)
            ]);
          }
          if (activity.planned_session_id) {
            await conn.query(`UPDATE planned_sessions SET status='completed', updated_at=CURRENT_TIMESTAMP
              WHERE id=? AND athlete_id=? AND status IN ('planned','modified')`, [activity.planned_session_id, athleteId]);
          }
          await conn.query('UPDATE activities SET completed_session_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [completedSessionId, activityId]);
        }
        await conn.query(`INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json)
          VALUES (?, ?, ?, 'activity', ?, ?)`, [athleteId, actor, finalize ? 'activity.journal_finalized' : 'activity.journal_updated', activityId, JSON.stringify({ completed_session_id: completedSessionId || null })]);
        return this.getJournalActivity(athleteId, activityId, conn);
      });
    },

    async mergeActivities(athleteId, targetActivityId, duplicateActivityId, actor) {
      if (targetActivityId === duplicateActivityId) throw Object.assign(new Error('cannot_merge_activity_into_itself'), { statusCode: 400 });
      return db.transaction(async conn => {
        const rows = await conn.query(`SELECT id, completed_session_id FROM activities
          WHERE athlete_id=? AND id IN (?, ?) ORDER BY id FOR UPDATE`, [athleteId, targetActivityId, duplicateActivityId]);
        if (rows.length !== 2) throw Object.assign(new Error('activity_not_found'), { statusCode: 404 });
        const target = rows.find(row => row.id === targetActivityId);
        const duplicate = rows.find(row => row.id === duplicateActivityId);
        if (target.completed_session_id && duplicate.completed_session_id && target.completed_session_id !== duplicate.completed_session_id) {
          throw Object.assign(new Error('cannot_merge_two_finalized_activities'), { statusCode: 409 });
        }
        const targetJournal = await conn.query('SELECT * FROM activity_journal_entries WHERE activity_id=?', [targetActivityId]);
        const duplicateJournal = await conn.query('SELECT * FROM activity_journal_entries WHERE activity_id=?', [duplicateActivityId]);
        if (targetJournal[0] && duplicateJournal[0]) throw Object.assign(new Error('cannot_merge_two_journal_entries'), { statusCode: 409 });
        if (!targetJournal[0] && duplicateJournal[0]) await conn.query('UPDATE activity_journal_entries SET activity_id=? WHERE activity_id=?', [targetActivityId, duplicateActivityId]);
        await conn.query('UPDATE activity_sources SET activity_id=? WHERE activity_id=?', [targetActivityId, duplicateActivityId]);
        if (!target.completed_session_id && duplicate.completed_session_id) await conn.query('UPDATE activities SET completed_session_id=? WHERE id=?', [duplicate.completed_session_id, targetActivityId]);
        await conn.query(`UPDATE activities SET match_candidate_activity_id=NULL WHERE match_candidate_activity_id=?`, [duplicateActivityId]);
        await conn.query('DELETE FROM activities WHERE id=? AND athlete_id=?', [duplicateActivityId, athleteId]);
        await conn.query(`UPDATE activities SET match_state='auto_merged', match_candidate_activity_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [targetActivityId]);
        await refreshCanonical(conn, targetActivityId);
        await conn.query(`INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json)
          VALUES (?, ?, 'activity.merged', 'activity', ?, ?)`, [athleteId, actor, targetActivityId, JSON.stringify({ merged_activity_id: duplicateActivityId })]);
        return this.getJournalActivity(athleteId, targetActivityId, conn);
      });
    },

    async getImportCursor(athleteId, provider, key = 'updated_after') {
      const rows = await db.query('SELECT cursor_value FROM activity_import_cursors WHERE athlete_id=? AND provider=? AND cursor_key=?', [athleteId, provider, key]);
      return rows[0]?.cursor_value || null;
    },

    async setImportCursor(athleteId, provider, value, key = 'updated_after') {
      await db.query(`INSERT INTO activity_import_cursors (athlete_id, provider, cursor_key, cursor_value)
        VALUES (?, ?, ?, ?) ON CONFLICT (athlete_id, provider, cursor_key)
        DO UPDATE SET cursor_value=EXCLUDED.cursor_value, updated_at=CURRENT_TIMESTAMP`, [athleteId, provider, key, String(value)]);
    }
  };
}
