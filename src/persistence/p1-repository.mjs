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
    created_at: row.created_at,
    artifact: parseJson(row.payload_json)
  };
}

export function createP1Repository(db) {
  return {
    async athleteExists(athleteId) {
      const rows = await db.query('SELECT id FROM athletes WHERE id=? LIMIT 1', [athleteId]);
      return Boolean(rows[0]);
    },

    async saveSpecialistArtifact(athleteId, artifactType, artifact, actor) {
      return db.transaction(async conn => {
        const athlete = await conn.query('SELECT id FROM athletes WHERE id=? FOR UPDATE', [athleteId]);
        if (!athlete[0]) throw Object.assign(new Error('athlete_not_found'), { statusCode: 404 });

        const latest = await conn.query('SELECT artifact_version FROM specialist_artifacts WHERE athlete_id=? AND artifact_type=? ORDER BY artifact_version DESC LIMIT 1', [athleteId, artifactType]);
        const artifactVersion = Number(latest[0]?.artifact_version || 0) + 1;
        const id = randomUUID();
        await conn.query(
          'INSERT INTO specialist_artifacts (id, athlete_id, artifact_type, artifact_version, generated_at, payload_json, created_by_subject) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, athleteId, artifactType, artifactVersion, new Date(artifact.generated_at), JSON.stringify(artifact), actor]
        );
        await conn.query(
          'INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
          [athleteId, actor, 'specialist_artifact.recorded', 'specialist_artifact', id, JSON.stringify({ artifact_type: artifactType, artifact_version: artifactVersion })]
        );
        return { id, artifact_type: artifactType, artifact_version: artifactVersion, artifact };
      });
    },

    async getLatestSpecialistArtifacts(athleteId) {
      const rows = await db.query(
        'SELECT id, artifact_type, artifact_version, generated_at, payload_json, created_by_subject, created_at FROM specialist_artifacts WHERE athlete_id=? ORDER BY artifact_type ASC, artifact_version DESC',
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
        'SELECT id, artifact_type, artifact_version, generated_at, payload_json, created_by_subject, created_at FROM specialist_artifacts WHERE athlete_id=? AND artifact_type=? ORDER BY artifact_version DESC LIMIT 1',
        [athleteId, artifactType]
      );
      return mapRow(rows[0]);
    },

    async getSpecialistArtifactHistory(athleteId, artifactType, limit = 20) {
      const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const rows = await db.query(
        `SELECT id, artifact_type, artifact_version, generated_at, payload_json, created_by_subject, created_at FROM specialist_artifacts WHERE athlete_id=? AND artifact_type=? ORDER BY artifact_version DESC LIMIT ${safeLimit}`,
        [athleteId, artifactType]
      );
      return rows.map(mapRow);
    }
  };
}
