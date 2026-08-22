import { randomUUID } from 'node:crypto';

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  return JSON.parse(value);
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    artifact_type: row.artifact_type,
    artifact_version: Number(row.artifact_version),
    generated_at: row.generated_at,
    created_by_subject: row.created_by_subject,
    reasoning_run_id: row.reasoning_run_id || null,
    provenance: parseJson(row.provenance_json),
    created_at: row.created_at,
    artifact: parseJson(row.payload_json)
  };
}

function mapRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    athlete_id: row.athlete_id,
    trigger_type: row.trigger_type,
    selected_types: parseJson(row.selected_types_json) || [],
    status: row.status,
    result: parseJson(row.result_json),
    error_text: row.error_text || null,
    created_by_subject: row.created_by_subject,
    started_at: row.started_at,
    completed_at: row.completed_at || null
  };
}

const ARTIFACT_SELECT = 'SELECT id, artifact_type, artifact_version, generated_at, payload_json, created_by_subject, reasoning_run_id, provenance_json, created_at FROM specialist_artifacts';

export function createP1Repository(db) {
  return {
    async athleteExists(athleteId) {
      const rows = await db.query('SELECT id FROM athletes WHERE id=? LIMIT 1', [athleteId]);
      return Boolean(rows[0]);
    },

    async saveSpecialistArtifact(athleteId, artifactType, artifact, actor, options = {}) {
      return db.transaction(async conn => {
        const athlete = await conn.query('SELECT id FROM athletes WHERE id=? FOR UPDATE', [athleteId]);
        if (!athlete[0]) throw Object.assign(new Error('athlete_not_found'), { statusCode: 404 });

        const latest = await conn.query('SELECT artifact_version FROM specialist_artifacts WHERE athlete_id=? AND artifact_type=? ORDER BY artifact_version DESC LIMIT 1', [athleteId, artifactType]);
        const artifactVersion = Number(latest[0]?.artifact_version || 0) + 1;
        const id = randomUUID();
        const reasoningRunId = options.reasoningRunId || null;
        const provenance = options.provenance || null;
        await conn.query(
          'INSERT INTO specialist_artifacts (id, athlete_id, artifact_type, artifact_version, generated_at, payload_json, created_by_subject, reasoning_run_id, provenance_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, athleteId, artifactType, artifactVersion, new Date(artifact.generated_at), JSON.stringify(artifact), actor, reasoningRunId, provenance ? JSON.stringify(provenance) : null]
        );
        await conn.query(
          'INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
          [athleteId, actor, 'specialist_artifact.recorded', 'specialist_artifact', id, JSON.stringify({ artifact_type: artifactType, artifact_version: artifactVersion, reasoning_run_id: reasoningRunId })]
        );
        return { id, artifact_type: artifactType, artifact_version: artifactVersion, artifact, reasoning_run_id: reasoningRunId, provenance };
      });
    },

    async getLatestSpecialistArtifacts(athleteId) {
      const rows = await db.query(
        `${ARTIFACT_SELECT} WHERE athlete_id=? ORDER BY artifact_type ASC, artifact_version DESC`,
        [athleteId]
      );
      const seen = new Set();
      const latest = [];
      for (const row of rows) {
        if (seen.has(row.artifact_type)) continue;
        seen.add(row.artifact_type);
        latest.push(mapRow(row));
      }
      return latest;
    },

    async getLatestSpecialistArtifact(athleteId, artifactType) {
      const rows = await db.query(
        `${ARTIFACT_SELECT} WHERE athlete_id=? AND artifact_type=? ORDER BY artifact_version DESC LIMIT 1`,
        [athleteId, artifactType]
      );
      return mapRow(rows[0]);
    },

    async getSpecialistArtifactHistory(athleteId, artifactType, limit = 20) {
      const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const rows = await db.query(
        `${ARTIFACT_SELECT} WHERE athlete_id=? AND artifact_type=? ORDER BY artifact_version DESC LIMIT ${safeLimit}`,
        [athleteId, artifactType]
      );
      return rows.map(mapRow);
    },

    async createReasoningRun(athleteId, triggerType, selectedTypes, actor) {
      const id = randomUUID();
      await db.query(
        'INSERT INTO specialist_reasoning_runs (id, athlete_id, trigger_type, selected_types_json, status, created_by_subject) VALUES (?, ?, ?, ?, ?, ?)',
        [id, athleteId, triggerType, JSON.stringify(selectedTypes || []), 'running', actor]
      );
      await db.query(
        'INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
        [athleteId, actor, 'specialist_reasoning.started', 'specialist_reasoning_run', id, JSON.stringify({ trigger_type: triggerType, selected_types: selectedTypes || [] })]
      );
      return { id, athlete_id: athleteId, trigger_type: triggerType, selected_types: selectedTypes || [], status: 'running' };
    },

    async completeReasoningRun(athleteId, runId, status, result = [], errorText = null) {
      await db.query(
        'UPDATE specialist_reasoning_runs SET status=?, result_json=?, error_text=?, completed_at=CURRENT_TIMESTAMP(6) WHERE id=? AND athlete_id=?',
        [status, JSON.stringify(result || []), errorText, runId, athleteId]
      );
      await db.query(
        'INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
        [athleteId, 'service:skillz-producer', 'specialist_reasoning.completed', 'specialist_reasoning_run', runId, JSON.stringify({ status, result_count: Array.isArray(result) ? result.length : 0, has_error: Boolean(errorText) })]
      );
    },

    async getReasoningRun(athleteId, runId) {
      const rows = await db.query('SELECT * FROM specialist_reasoning_runs WHERE id=? AND athlete_id=? LIMIT 1', [runId, athleteId]);
      return mapRun(rows[0]);
    }
  };
}
