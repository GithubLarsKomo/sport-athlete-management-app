import { randomUUID } from 'node:crypto';
import { BUILT_IN_TEST_PROTOCOLS, builtInProtocol } from '../domain/performance-tests.mjs';

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  return JSON.parse(value);
}

function builtInRecord(protocol) {
  return {
    ...protocol,
    source: 'built_in',
    created_by_subject: 'system:built-in',
    created_at: null
  };
}

function mapProtocol(row) {
  if (!row) return null;
  const definition = parseJson(row.definition_json) || {};
  return {
    ...definition,
    protocol_id: row.id,
    version: Number(row.version),
    name: row.name,
    modality: row.modality,
    protocol_kind: row.protocol_kind,
    source: 'custom',
    created_by_subject: row.created_by_subject,
    created_at: row.created_at
  };
}

function mapTest(row) {
  if (!row) return null;
  return {
    test_id: row.id,
    athlete_id: row.athlete_id,
    protocol_id: row.protocol_id,
    protocol_version: Number(row.protocol_version),
    protocol_source: row.protocol_source,
    protocol: parseJson(row.protocol_snapshot_json),
    modality: row.modality,
    status: row.status,
    scheduled_at: row.scheduled_at,
    performed_at: row.performed_at || null,
    device: row.device || null,
    warm_up: parseJson(row.warm_up_json) || {},
    environment: parseJson(row.environment_json) || {},
    termination_reason: row.termination_reason || null,
    notes: row.notes || null,
    expected_targets: parseJson(row.expected_targets_json) || {},
    result: parseJson(row.result_json),
    interpretation_refs: parseJson(row.interpretation_refs_json) || [],
    planned_by_subject: row.planned_by_subject,
    performed_by_subject: row.performed_by_subject || null,
    retest_of_test_id: row.retest_of_test_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

const TEST_SELECT = `SELECT id, athlete_id, protocol_id, protocol_version, protocol_source, protocol_snapshot_json,
  modality, status, scheduled_at, performed_at, device, warm_up_json, environment_json, termination_reason,
  notes, expected_targets_json, result_json, interpretation_refs_json, planned_by_subject, performed_by_subject,
  retest_of_test_id, created_at, updated_at
  FROM performance_tests`;

export function createPerformanceTestRepository(db) {
  return {
    async listTestProtocols(athleteId) {
      const rows = await db.query(`SELECT id, version, name, modality, protocol_kind, definition_json,
        created_by_subject, created_at
        FROM performance_test_protocols
        WHERE athlete_id=?
        ORDER BY created_at DESC, id, version DESC`, [athleteId]);
      return [
        ...BUILT_IN_TEST_PROTOCOLS.map(builtInRecord),
        ...rows.map(mapProtocol)
      ];
    },

    async getTestProtocol(athleteId, protocolId, version = 1) {
      const builtIn = builtInProtocol(protocolId, version);
      if (builtIn) return builtInRecord(builtIn);
      const rows = await db.query(`SELECT id, version, name, modality, protocol_kind, definition_json,
        created_by_subject, created_at
        FROM performance_test_protocols
        WHERE athlete_id=? AND id=? AND version=?
        LIMIT 1`, [athleteId, protocolId, Number(version)]);
      return mapProtocol(rows[0]);
    },

    async saveCustomTestProtocol(athleteId, input, actor) {
      const id = input.protocol_id || randomUUID();
      const version = Number(input.version || 1);
      if (builtInProtocol(id, version)) {
        throw Object.assign(new Error('test_protocol_id_reserved'), { statusCode: 409 });
      }
      const definition = {
        schema_version: 1,
        protocol_id: id,
        version,
        name: input.name,
        modality: input.modality,
        protocol_kind: 'staged',
        stages: input.stages,
        stage_fields: input.stage_fields || []
      };
      try {
        await db.query(`INSERT INTO performance_test_protocols
          (id, version, athlete_id, name, modality, protocol_kind, definition_json, created_by_subject)
          VALUES (?, ?, ?, ?, ?, 'staged', ?, ?)`,
          [id, version, athleteId, input.name, input.modality, JSON.stringify(definition), actor]);
      } catch (error) {
        if (error?.code === '23505') throw Object.assign(new Error('test_protocol_version_exists'), { statusCode: 409 });
        throw error;
      }
      await this.audit(athleteId, actor, 'performance_test.protocol_saved', 'performance_test_protocol', id, {
        version,
        modality: input.modality,
        stage_count: input.stages.length
      });
      return this.getTestProtocol(athleteId, id, version);
    },

    async planPerformanceTest(athleteId, input, actor) {
      const protocol = await this.getTestProtocol(athleteId, input.protocol_id, input.protocol_version);
      if (!protocol) throw Object.assign(new Error('test_protocol_not_found'), { statusCode: 404 });
      if (input.retest_of_test_id) {
        const previous = await this.getPerformanceTest(athleteId, input.retest_of_test_id);
        if (!previous) throw Object.assign(new Error('retest_source_not_found'), { statusCode: 404 });
      }

      const id = randomUUID();
      await db.query(`INSERT INTO performance_tests
        (id, athlete_id, protocol_id, protocol_version, protocol_source, protocol_snapshot_json, modality,
         status, scheduled_at, device, warm_up_json, environment_json, notes, expected_targets_json,
         planned_by_subject, retest_of_test_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?, ?, ?)`, [
          id, athleteId, protocol.protocol_id, protocol.version, protocol.source,
          JSON.stringify(protocol), protocol.modality, new Date(input.scheduled_at), input.device || null,
          JSON.stringify(input.warm_up || {}), JSON.stringify(input.environment || {}),
          input.notes ? String(input.notes).slice(0, 4000) : null,
          JSON.stringify(input.expected_targets || {}), actor, input.retest_of_test_id || null
        ]);
      await this.audit(athleteId, actor, 'performance_test.planned', 'performance_test', id, {
        protocol_id: protocol.protocol_id,
        protocol_version: protocol.version,
        protocol_source: protocol.source,
        retest_of_test_id: input.retest_of_test_id || null
      });
      return this.getPerformanceTest(athleteId, id);
    },

    async performPerformanceTest(athleteId, testId, result, actor) {
      return db.transaction(async conn => {
        const rows = await conn.query(`${TEST_SELECT} WHERE athlete_id=? AND id=? FOR UPDATE`, [athleteId, testId]);
        const current = mapTest(rows[0]);
        if (!current) throw Object.assign(new Error('performance_test_not_found'), { statusCode: 404 });
        if (current.status !== 'planned') throw Object.assign(new Error('performance_test_already_finalized'), { statusCode: 409 });

        await conn.query(`UPDATE performance_tests SET
          status='performed',
          performed_at=?,
          device=?,
          warm_up_json=?,
          environment_json=?,
          termination_reason=?,
          notes=?,
          result_json=?,
          interpretation_refs_json=?,
          performed_by_subject=?,
          updated_at=CURRENT_TIMESTAMP
          WHERE athlete_id=? AND id=?`, [
            new Date(result.performed_at),
            result.device,
            JSON.stringify(result.warm_up || current.warm_up || {}),
            JSON.stringify(result.environment || current.environment || {}),
            result.termination_reason ? String(result.termination_reason).slice(0, 4000) : null,
            result.notes ? String(result.notes).slice(0, 4000) : current.notes,
            JSON.stringify({
              metrics: result.metrics || {},
              stages: result.stages || []
            }),
            JSON.stringify(result.interpretation_refs || []),
            actor,
            athleteId,
            testId
          ]);
        await conn.query(`INSERT INTO audit_log
          (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json)
          VALUES (?, ?, 'performance_test.performed', 'performance_test', ?, ?)`, [
            athleteId, actor, testId, JSON.stringify({
              protocol_id: current.protocol_id,
              protocol_version: current.protocol_version,
              measurement_classes: [...new Set([
                ...Object.values(result.metrics || {}).map(metric => metric.measurement_class),
                ...(result.stages || []).flatMap(stage => Object.values(stage.metrics || {}).map(metric => metric.measurement_class))
              ].filter(Boolean))],
              interpretation_ref_count: (result.interpretation_refs || []).length
            })
          ]);
        const refreshed = await conn.query(`${TEST_SELECT} WHERE athlete_id=? AND id=? LIMIT 1`, [athleteId, testId]);
        return mapTest(refreshed[0]);
      });
    },

    async getPerformanceTest(athleteId, testId) {
      const rows = await db.query(`${TEST_SELECT} WHERE athlete_id=? AND id=? LIMIT 1`, [athleteId, testId]);
      return mapTest(rows[0]);
    },

    async listPerformanceTests(athleteId, limit = 50) {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
      const rows = await db.query(`${TEST_SELECT} WHERE athlete_id=? ORDER BY scheduled_at DESC, created_at DESC LIMIT ?`, [athleteId, safeLimit]);
      return rows.map(mapTest);
    }
  };
}
