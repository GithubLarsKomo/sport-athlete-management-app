function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function mapRows(rows, jsonFields = {}) {
  return rows.map(row => {
    const result = { ...row };
    for (const [field, target] of Object.entries(jsonFields)) {
      result[target] = parseJson(result[field], target.endsWith('s') ? [] : {});
      delete result[field];
    }
    return result;
  });
}

export function createDataExportRepository(db) {
  return {
    async getAthleteDataExportSource(athleteId) {
      const accountRows = await db.query(
        'SELECT id AS athlete_id, email, display_name, timezone, active, created_at, updated_at FROM athletes WHERE id=? LIMIT 1',
        [athleteId]
      );

      const profileRows = await db.query(
        'SELECT profile_version, valid_from, payload_json, created_at FROM athlete_profiles WHERE athlete_id=? ORDER BY profile_version',
        [athleteId]
      );
      const goals = await db.query(
        'SELECT id, goal_type, description, target_value, target_unit, target_date, priority, status, created_at FROM goals WHERE athlete_id=? ORDER BY created_at, id',
        [athleteId]
      );
      const competitions = await db.query(
        'SELECT id, name, competition_date, priority, discipline, notes FROM competitions WHERE athlete_id=? ORDER BY competition_date, id',
        [athleteId]
      );

      const seasons = await db.query(
        'SELECT id, name, start_date, end_date, status, version, payload_json, updated_at FROM seasons WHERE athlete_id=? ORDER BY start_date, id',
        [athleteId]
      );
      const mesocycles = await db.query(
        'SELECT id, season_id, start_date, end_date, primary_adaptation, version, payload_json, updated_at FROM mesocycles WHERE athlete_id=? ORDER BY start_date, id',
        [athleteId]
      );
      const microcycles = await db.query(
        'SELECT id, mesocycle_id, start_date, end_date, focus, version, payload_json, updated_at FROM microcycles WHERE athlete_id=? ORDER BY start_date, id',
        [athleteId]
      );
      const plannedSessions = await db.query(
        'SELECT id, microcycle_id, local_date, planned_start, session_type, objective, planned_duration_min, planned_rpe, status, version, payload_json, created_at, updated_at FROM planned_sessions WHERE athlete_id=? ORDER BY planned_start, id',
        [athleteId]
      );
      const planImports = await db.query(
        'SELECT id AS import_id, revision, content_hash, producer_json, source_refs_json, imported_by_subject, supersedes_import_id, created_at AS imported_at FROM training_plan_imports WHERE athlete_id=? ORDER BY revision, id',
        [athleteId]
      );
      const planRevisions = await db.query(
        'SELECT id, affected_entity_type, affected_entity_id, prior_version, new_version, adaptation_decision_id, revision_json, created_at FROM training_plan_revisions WHERE athlete_id=? ORDER BY created_at, id',
        [athleteId]
      );

      const completedSessions = await db.query(
        'SELECT id, planned_session_id, started_at, completed_at, duration_min, session_rpe, session_load, completion_status, payload_json, created_at FROM completed_sessions WHERE athlete_id=? ORDER BY started_at, id',
        [athleteId]
      );
      const activities = await db.query(
        'SELECT id, planned_session_id, completed_session_id, activity_type, started_at, ended_at, duration_s, distance_m, canonical_source, canonical_summary_json, match_state, match_candidate_activity_id, match_score, created_at, updated_at FROM activities WHERE athlete_id=? ORDER BY started_at, id',
        [athleteId]
      );
      const activitySources = await db.query(
        'SELECT id, activity_id, provider, external_activity_id, source_started_at, source_ended_at, raw_sha256, summary_json, imported_at FROM activity_sources WHERE athlete_id=? ORDER BY imported_at, id',
        [athleteId]
      );
      const journalEntries = await db.query(
        'SELECT activity_id, session_rpe, expectation_match, pain_0_10, comment, deviations_json, authored_by_subject, finalized_at, created_at, updated_at FROM activity_journal_entries WHERE athlete_id=? ORDER BY created_at, activity_id',
        [athleteId]
      );
      const coachNotes = await db.query(
        'SELECT id, completed_session_id, authored_by_subject, note, created_at, updated_at FROM coach_session_notes WHERE athlete_id=? ORDER BY created_at, id',
        [athleteId]
      );
      const checkins = await db.query(
        'SELECT id, local_date, payload_json, created_at, updated_at FROM daily_checkins WHERE athlete_id=? ORDER BY local_date, id',
        [athleteId]
      );

      const protocols = await db.query(
        'SELECT id, version, name, modality, protocol_kind, definition_json, created_by_subject, created_at FROM performance_test_protocols WHERE athlete_id=? ORDER BY created_at, id, version',
        [athleteId]
      );
      const tests = await db.query(
        'SELECT id, protocol_id, protocol_version, protocol_source, protocol_snapshot_json, modality, status, scheduled_at, performed_at, device, warm_up_json, environment_json, termination_reason, notes, expected_targets_json, result_json, interpretation_refs_json, planned_by_subject, performed_by_subject, retest_of_test_id, created_at, updated_at FROM performance_tests WHERE athlete_id=? ORDER BY scheduled_at, id',
        [athleteId]
      );

      const adaptations = await db.query(
        'SELECT id, decision_json, applied_at, applied_by_subject, created_at FROM adaptation_decisions WHERE athlete_id=? ORDER BY created_at, id',
        [athleteId]
      );
      const specialistArtifacts = await db.query(
        'SELECT id, artifact_type, artifact_version, generated_at, payload_json, created_by_subject, created_at, reasoning_run_id, provenance_json FROM specialist_artifacts WHERE athlete_id=? ORDER BY created_at, id',
        [athleteId]
      );
      const specialistRuns = await db.query(
        'SELECT id, trigger_type, selected_types_json, status, result_json, created_by_subject, started_at, completed_at FROM specialist_reasoning_runs WHERE athlete_id=? ORDER BY started_at, id',
        [athleteId]
      );
      const audit = await db.query(
        'SELECT id, actor_subject, event_type, entity_type, entity_id, details_json, created_at FROM audit_log WHERE athlete_id=? ORDER BY created_at, id',
        [athleteId]
      );

      return {
        account: accountRows[0] || null,
        profiles: mapRows(profileRows, { payload_json: 'profile' }),
        goals,
        competitions,
        planning: {
          seasons: mapRows(seasons, { payload_json: 'payload' }),
          mesocycles: mapRows(mesocycles, { payload_json: 'payload' }),
          microcycles: mapRows(microcycles, { payload_json: 'payload' }),
          planned_sessions: mapRows(plannedSessions, { payload_json: 'payload' }),
          plan_imports: mapRows(planImports, { producer_json: 'producer', source_refs_json: 'source_refs' }),
          revisions: mapRows(planRevisions, { revision_json: 'revision' })
        },
        journal: {
          completed_sessions: mapRows(completedSessions, { payload_json: 'payload' }),
          activities: mapRows(activities, { canonical_summary_json: 'summary' }),
          activity_sources: mapRows(activitySources, { summary_json: 'summary' }),
          entries: mapRows(journalEntries, { deviations_json: 'deviations' }),
          coach_notes: coachNotes
        },
        checkins: mapRows(checkins, { payload_json: 'checkin' }),
        performance_testing: {
          protocols: mapRows(protocols, { definition_json: 'definition' }),
          tests: mapRows(tests, {
            protocol_snapshot_json: 'protocol_snapshot',
            warm_up_json: 'warm_up',
            environment_json: 'environment',
            expected_targets_json: 'expected_targets',
            result_json: 'result',
            interpretation_refs_json: 'interpretation_refs'
          })
        },
        adaptation_history: mapRows(adaptations, { decision_json: 'decision' }),
        specialists: {
          artifacts: mapRows(specialistArtifacts, { payload_json: 'artifact', provenance_json: 'provenance' }),
          reasoning_runs: mapRows(specialistRuns, { selected_types_json: 'selected_types', result_json: 'result' })
        },
        audit: mapRows(audit, { details_json: 'details' })
      };
    },

    async deleteAthleteData(athleteId, actorSubject) {
      return db.transaction(async conn => {
        const athlete = await conn.query('SELECT id FROM athletes WHERE id=? FOR UPDATE', [athleteId]);
        if (!athlete[0]) return { deleted: false, reason: 'athlete_not_found' };

        await conn.query(
          'INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
          [athleteId, actorSubject, 'privacy.deletion_started', 'athlete', athleteId, JSON.stringify({ procedure: 'operator-v1' })]
        );

        await conn.query('DELETE FROM specialist_artifacts WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM specialist_reasoning_runs WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM performance_tests WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM performance_test_protocols WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM coach_session_notes WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM activity_journal_entries WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM activity_sources WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM activity_import_cursors WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM activities WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM training_plan_revisions WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM adaptation_decisions WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM completed_sessions WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM planned_sessions WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM training_plan_imports WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM microcycles WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM mesocycles WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM seasons WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM competitions WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM goals WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM daily_checkins WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM athlete_profiles WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM coach_athlete_assignments WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM app_principals WHERE athlete_id=?', [athleteId]);
        await conn.query('DELETE FROM athletes WHERE id=?', [athleteId]);

        await conn.query(
          'INSERT INTO audit_log (athlete_id, actor_subject, event_type, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
          [athleteId, actorSubject, 'privacy.deletion_completed', 'athlete', athleteId, JSON.stringify({ retained_security_audit: true, primary_data_deleted: true })]
        );

        return { deleted: true, retained_security_audit: true };
      });
    }
  };
}
