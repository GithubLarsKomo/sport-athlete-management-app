import { randomUUID } from 'node:crypto';
import { canonicalFromSources, matchActivity } from '../domain/activity-import.mjs';
import { normalizeDeviationReasons, validateSessionSubjective } from '../domain/journal.mjs';

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  return JSON.parse(value);
}

function rowsWithJson(rows) {
  return rows.map(row => ({
    ...row,
    canonical_summary: parseJson(row.canonical_summary_json) || {},
    journal: row.journal_json ? parseJson(row.journal_json) : null,
    completion: row.completion_payload_json ? parseJson(row.completion_payload_json) : null
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
    expectation_match: journal.expectation_match || null,
    deviations: journal.deviations || [],
    import_activity_id: activity.id,
    comment: journal.comment || null,
    pain_0_10: journal.pain_0_10 ?? null,
    athlete_authored_by_subject: journal.authored_by_subject || null
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

async function fetchCoachNotes(conn, athleteId, completedSessionId) {
  if (!completedSessionId) return [];
  return conn.query(`SELECT id, completed_session_id, authored_by_subject, note, created_at, updated_at
    FROM coach_session_notes
    WHERE athlete_id=? AND completed_session_id=?
    ORDER BY updated_at DESC, created_at ASC`, [athleteId, completedSessionId]);
}

async function attachExistingCompletion(conn, athleteId, activityId) {
  const rows = await conn.query(`SELECT id, planned_session_id, completed_session_id, started_at, duration_s
    FROM activities WHERE athlete_id=? AND id=? FOR UPDATE`, [athleteId, activityId]);
  const activity = rows[0];
  if (!activity || activity.completed_session_id) return activity || null;
  const existing = await completedSessionMatch(conn, athleteId, activity);
  if (!existing) return activity;
  await conn.query(`UPDATE activities
    SET completed_session_id=?, planned_session_id=COALESCE(planned_session_id, ?), updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND athlete_id=?`, [existing.id, existing.planned_session_id || null, activityId, athleteId]);
  return {
    ...activity,
    completed_session_id: existing.id,
    planned_session_id: activity.planned_session_id || existing.planned_session_id || null
  };
}

function weekEnd(fromDate) {
  const date = new Date(`${fromDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

function subjectiveFrom(row) {
  if (row.journal_json) return parseJson(row.journal_json);
  const completion = parseJson(row.completion_payload_json) || {};
  if (!row.completed_session_id) return null;
  return {
    session_rpe: completion.session_rpe ?? (row.actual_rpe == null ? null : Number(row.actual_rpe)),
    expectation_match: completion.expectation_match || null,
    pain_0_10: completion.pain_0_10 ?? completion.pain_during ?? null,
    deviations: Array.isArray(completion.deviations) ? completion.deviations : [],
    comment: completion.comment || null,
    authored_by_subject: completion.athlete_authored_by_subject || null,
    finalized_at: completion.generated_at || null
  };
}

function observedEvidence(summary, durationS, sources) {
  const distanceM = summary?.distance_m == null ? null : Number(summary.distance_m);
  const duration = durationS == null ? null : Number(durationS);
  const avgPower = summary?.avg_power_w == null ? null : Number(summary.avg_power_w);
  const pace500S = distanceM && duration ? duration / distanceM * 500 : null;
  const workKj = avgPower != null && duration != null ? avgPower * duration / 1000 : null;
  const intervalCount = Math.max(0, ...sources.map(source => Array.isArray(source.intervals) ? source.intervals.length : 0));
  return {
    duration_s: duration,
    distance_m: distanceM,
    avg_power_w: avgPower,
    avg_hr_bpm: summary?.avg_hr_bpm == null ? null : Number(summary.avg_hr_bpm),
    max_hr_bpm: summary?.max_hr_bpm == null ? null : Number(summary.max_hr_bpm),
    stroke_rate_spm: summary?.stroke_rate_spm == null ? null : Number(summary.stroke_rate_spm),
    pace_500_s: pace500S,
    work_kj: workKj,
    interval_count: intervalCount
  };
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
          await attachExistingCompletion(conn, athleteId, existing[0].activity_id);
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
        const attached = await attachExistingCompletion(conn, athleteId, activityId);
        await conn.query(`INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json)
          VALUES (?, ?, 'activity.imported', 'activity', ?, ?)`, [athleteId, actor, activityId, JSON.stringify({ provider: incoming.provider, external_activity_id: incoming.externalActivityId || null, disposition, source_id: sourceId, completed_session_id: attached?.completed_session_id || null })]);
        const activity = await this.getJournalActivity(athleteId, activityId, conn);
        return { activity, disposition };
      });
    },

    async getJournalActivity(athleteId, activityId, connection = null) {
      const conn = connection || db;
      const rows = await conn.query(`SELECT a.*,
        CASE WHEN j.activity_id IS NULL THEN NULL ELSE jsonb_build_object(
          'session_rpe', j.session_rpe, 'expectation_match', j.expectation_match, 'pain_0_10', j.pain_0_10, 'comment', j.comment,
          'deviations', j.deviations_json, 'authored_by_subject', j.authored_by_subject,
          'finalized_at', j.finalized_at, 'updated_at', j.updated_at
        ) END AS journal_json,
        c.payload_json AS completion_payload_json
        FROM activities a
        LEFT JOIN activity_journal_entries j ON j.activity_id=a.id
        LEFT JOIN completed_sessions c ON c.id=a.completed_session_id
        WHERE a.athlete_id=? AND a.id=? LIMIT 1`, [athleteId, activityId]);
      if (!rows[0]) return null;
      const activity = rowsWithJson(rows)[0];
      activity.sources = await fetchSources(conn, activityId);
      activity.coach_notes = await fetchCoachNotes(conn, athleteId, activity.completed_session_id);
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
          'session_rpe', j.session_rpe, 'expectation_match', j.expectation_match, 'pain_0_10', j.pain_0_10, 'comment', j.comment,
          'deviations', j.deviations_json, 'authored_by_subject', j.authored_by_subject,
          'finalized_at', j.finalized_at, 'updated_at', j.updated_at
        ) END AS journal_json,
        c.payload_json AS completion_payload_json
        FROM activities a
        LEFT JOIN activity_journal_entries j ON j.activity_id=a.id
        LEFT JOIN completed_sessions c ON c.id=a.completed_session_id
        WHERE ${filters.join(' AND ')} ORDER BY a.started_at DESC LIMIT ${safeLimit}`, params);
      const activities = rowsWithJson(rows);
      for (const activity of activities) {
        activity.sources = await fetchSources(db, activity.id);
        activity.coach_notes = await fetchCoachNotes(db, athleteId, activity.completed_session_id);
      }
      return activities;
    },

    async saveJournalEntry(athleteId, activityId, input, actor) {
      return db.transaction(async conn => {
        const rows = await conn.query('SELECT * FROM activities WHERE athlete_id=? AND id=? FOR UPDATE', [athleteId, activityId]);
        const activity = rows[0];
        if (!activity) throw Object.assign(new Error('activity_not_found'), { statusCode: 404 });
        const sessionRpe = input.session_rpe == null || input.session_rpe === '' ? null : Number(input.session_rpe);
        const pain = input.pain_0_10 == null || input.pain_0_10 === '' ? null : Number(input.pain_0_10);
        const finalize = Boolean(input.finalize);
        const deviations = normalizeDeviationReasons(input.deviations);
        const subjective = {
          session_rpe: sessionRpe,
          expectation_match: input.expectation_match || null,
          pain_0_10: pain,
          deviations,
          comment: input.comment == null ? null : String(input.comment)
        };
        const errors = validateSessionSubjective(subjective, { requireRpe: finalize });
        if (errors.length) throw Object.assign(new Error('invalid_journal_entry'), { statusCode: 400, details: errors });
        await conn.query(`INSERT INTO activity_journal_entries
          (activity_id, athlete_id, session_rpe, expectation_match, pain_0_10, comment, deviations_json, authored_by_subject, finalized_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (activity_id) DO UPDATE SET
            session_rpe=EXCLUDED.session_rpe,
            expectation_match=EXCLUDED.expectation_match,
            pain_0_10=EXCLUDED.pain_0_10,
            comment=EXCLUDED.comment,
            deviations_json=EXCLUDED.deviations_json,
            authored_by_subject=COALESCE(activity_journal_entries.authored_by_subject, EXCLUDED.authored_by_subject),
            finalized_at=COALESCE(activity_journal_entries.finalized_at, EXCLUDED.finalized_at),
            updated_at=CURRENT_TIMESTAMP`, [
          activityId, athleteId, sessionRpe, subjective.expectation_match, pain,
          subjective.comment ? subjective.comment.slice(0, 4000) : null,
          JSON.stringify(deviations), actor, finalize ? new Date() : null
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
            const payload = completionPayload(athleteId, activity, {
              ...subjective,
              authored_by_subject: actor
            }, completedSessionId);
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

    async saveCoachSessionNote(athleteId, completedSessionId, note, actor) {
      const trimmed = String(note || '').trim();
      if (!trimmed) throw Object.assign(new Error('coach_note_required'), { statusCode: 400 });
      if (trimmed.length > 4000) throw Object.assign(new Error('coach_note_too_long'), { statusCode: 400 });
      return db.transaction(async conn => {
        const owned = await conn.query(
          'SELECT id FROM completed_sessions WHERE athlete_id=? AND id=? FOR UPDATE',
          [athleteId, completedSessionId]
        );
        if (!owned[0]) throw Object.assign(new Error('completed_session_not_found'), { statusCode: 404 });
        const id = randomUUID();
        await conn.query(`INSERT INTO coach_session_notes
          (id, athlete_id, completed_session_id, authored_by_subject, note)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (completed_session_id, authored_by_subject)
          DO UPDATE SET note=EXCLUDED.note, updated_at=CURRENT_TIMESTAMP`,
          [id, athleteId, completedSessionId, actor, trimmed]);
        await conn.query(`INSERT INTO audit_log
          (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json)
          VALUES (?, ?, 'coach.session_note_saved', 'completed_session', ?, ?)`,
          [athleteId, actor, completedSessionId, JSON.stringify({ note_length: trimmed.length })]);
        return fetchCoachNotes(conn, athleteId, completedSessionId);
      });
    },

    async getWeekComparison(athleteId, fromDate) {
      const toDate = weekEnd(fromDate);
      const plannedRows = await db.query(`SELECT
          p.id AS planned_session_id,
          p.local_date,
          p.planned_start,
          p.session_type,
          p.objective,
          p.planned_duration_min,
          p.planned_rpe,
          p.status AS planned_status,
          p.version AS planned_version,
          p.payload_json AS planned_payload_json,
          c.id AS completed_session_id,
          c.started_at AS actual_started_at,
          c.completed_at AS actual_completed_at,
          c.duration_min AS actual_duration_min,
          c.session_rpe AS actual_rpe,
          c.completion_status AS actual_completion_status,
          c.payload_json AS completion_payload_json,
          a.id AS activity_id,
          a.duration_s AS activity_duration_s,
          a.canonical_source,
          a.canonical_summary_json,
          CASE WHEN j.activity_id IS NULL THEN NULL ELSE jsonb_build_object(
            'session_rpe', j.session_rpe,
            'expectation_match', j.expectation_match,
            'pain_0_10', j.pain_0_10,
            'comment', j.comment,
            'deviations', j.deviations_json,
            'authored_by_subject', j.authored_by_subject,
            'finalized_at', j.finalized_at
          ) END AS journal_json
        FROM planned_sessions p
        LEFT JOIN LATERAL (
          SELECT c.*
          FROM completed_sessions c
          WHERE c.athlete_id=p.athlete_id AND c.planned_session_id=p.id
          ORDER BY c.created_at DESC
          LIMIT 1
        ) c ON TRUE
        LEFT JOIN LATERAL (
          SELECT a.*
          FROM activities a
          WHERE a.athlete_id=p.athlete_id
            AND ((c.id IS NOT NULL AND a.completed_session_id=c.id) OR a.planned_session_id=p.id)
          ORDER BY CASE WHEN c.id IS NOT NULL AND a.completed_session_id=c.id THEN 0 ELSE 1 END, a.updated_at DESC
          LIMIT 1
        ) a ON TRUE
        LEFT JOIN activity_journal_entries j ON j.activity_id=a.id
        WHERE p.athlete_id=? AND p.local_date BETWEEN ? AND ?
        ORDER BY p.local_date, p.planned_start`, [athleteId, fromDate, toDate]);

      const sessions = [];
      for (const row of plannedRows) {
        const plannedPayload = parseJson(row.planned_payload_json) || {};
        const summary = parseJson(row.canonical_summary_json) || {};
        const sources = row.activity_id ? await fetchSources(db, row.activity_id) : [];
        const subjective = subjectiveFrom(row);
        const coachNotes = await fetchCoachNotes(db, athleteId, row.completed_session_id);
        sessions.push({
          plan: {
            planned_session_id: row.planned_session_id,
            local_date: row.local_date,
            planned_start: row.planned_start,
            session_type: row.session_type,
            objective: row.objective,
            planned_duration_min: row.planned_duration_min == null ? null : Number(row.planned_duration_min),
            planned_rpe: row.planned_rpe == null ? null : Number(row.planned_rpe),
            status: row.planned_status,
            version: Number(row.planned_version),
            intensity_rule: plannedPayload.intensity_rule || null,
            stop_rule: plannedPayload.stop_rule || null,
            flexibility: plannedPayload.flexibility || null,
            items: Array.isArray(plannedPayload.items) ? plannedPayload.items : []
          },
          actual: row.completed_session_id || row.activity_id ? {
            completed_session_id: row.completed_session_id || null,
            activity_id: row.activity_id || null,
            started_at: row.actual_started_at || null,
            completed_at: row.actual_completed_at || null,
            duration_min: row.actual_duration_min == null ? (row.activity_duration_s == null ? null : Number(row.activity_duration_s) / 60) : Number(row.actual_duration_min),
            session_rpe: row.actual_rpe == null ? (subjective?.session_rpe ?? null) : Number(row.actual_rpe),
            completion_status: row.actual_completion_status || (row.activity_id ? 'awaiting_subjective_finalization' : null),
            subjective,
            evidence: observedEvidence(summary, row.activity_duration_s, sources),
            provenance: {
              canonical_source: row.canonical_source || null,
              completion_source_refs: (parseJson(row.completion_payload_json) || {}).source_refs || [],
              activity_sources: sources.map(source => ({
                provider: source.provider,
                external_activity_id: source.external_activity_id || null,
                raw_sha256: source.raw_sha256
              }))
            },
            coach_notes: coachNotes
          } : null
        });
      }

      const unplannedRows = await db.query(`SELECT
          c.id AS completed_session_id,
          c.started_at AS actual_started_at,
          c.completed_at AS actual_completed_at,
          c.duration_min AS actual_duration_min,
          c.session_rpe AS actual_rpe,
          c.completion_status AS actual_completion_status,
          c.payload_json AS completion_payload_json,
          a.id AS activity_id,
          a.duration_s AS activity_duration_s,
          a.activity_type,
          a.canonical_source,
          a.canonical_summary_json,
          CASE WHEN j.activity_id IS NULL THEN NULL ELSE jsonb_build_object(
            'session_rpe', j.session_rpe,
            'expectation_match', j.expectation_match,
            'pain_0_10', j.pain_0_10,
            'comment', j.comment,
            'deviations', j.deviations_json,
            'authored_by_subject', j.authored_by_subject,
            'finalized_at', j.finalized_at
          ) END AS journal_json
        FROM completed_sessions c
        LEFT JOIN LATERAL (
          SELECT a.* FROM activities a
          WHERE a.athlete_id=c.athlete_id AND a.completed_session_id=c.id
          ORDER BY a.updated_at DESC LIMIT 1
        ) a ON TRUE
        LEFT JOIN activity_journal_entries j ON j.activity_id=a.id
        WHERE c.athlete_id=? AND c.planned_session_id IS NULL
          AND (c.started_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN ?::date AND ?::date
        ORDER BY c.started_at`, [athleteId, fromDate, toDate]);

      const unplanned = [];
      for (const row of unplannedRows) {
        const summary = parseJson(row.canonical_summary_json) || {};
        const sources = row.activity_id ? await fetchSources(db, row.activity_id) : [];
        const subjective = subjectiveFrom(row);
        unplanned.push({
          plan: null,
          actual: {
            completed_session_id: row.completed_session_id,
            activity_id: row.activity_id || null,
            session_type: row.activity_type || null,
            started_at: row.actual_started_at,
            completed_at: row.actual_completed_at,
            duration_min: Number(row.actual_duration_min),
            session_rpe: Number(row.actual_rpe),
            completion_status: row.actual_completion_status,
            subjective,
            evidence: observedEvidence(summary, row.activity_duration_s, sources),
            provenance: {
              canonical_source: row.canonical_source || null,
              completion_source_refs: (parseJson(row.completion_payload_json) || {}).source_refs || [],
              activity_sources: sources.map(source => ({
                provider: source.provider,
                external_activity_id: source.external_activity_id || null,
                raw_sha256: source.raw_sha256
              }))
            },
            coach_notes: await fetchCoachNotes(db, athleteId, row.completed_session_id)
          }
        });
      }

      const completed = sessions.filter(record => record.actual?.completed_session_id);
      const observed = sessions.filter(record => record.actual);
      const plannedRpe = sessions.map(record => record.plan.planned_rpe).filter(value => value != null);
      const allActual = [...observed, ...unplanned];
      const actualRpe = allActual.map(record => record.actual.session_rpe).filter(value => value != null);
      return {
        from: fromDate,
        to: toDate,
        sessions,
        unplanned,
        summary: {
          planned_sessions: sessions.length,
          completed_planned_sessions: completed.length,
          unplanned_sessions: unplanned.length,
          planned_duration_min: sessions.reduce((sum, record) => sum + Number(record.plan.planned_duration_min || 0), 0),
          actual_duration_min: allActual.reduce((sum, record) => sum + Number(record.actual.duration_min || 0), 0),
          planned_rpe_average: plannedRpe.length ? plannedRpe.reduce((a, b) => a + b, 0) / plannedRpe.length : null,
          actual_rpe_average: actualRpe.length ? actualRpe.reduce((a, b) => a + b, 0) / actualRpe.length : null
        }
      };
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
