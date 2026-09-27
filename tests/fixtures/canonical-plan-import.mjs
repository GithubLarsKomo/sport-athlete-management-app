export function canonicalPlanImportFixture(athleteId = 'athlete-1') {
  const envelope = {
    schema_version: 1,
    athlete_id: athleteId,
    generated_at: '2026-09-27T16:00:00.000Z',
    source_refs: ['fixture:source'],
    uncertainties: [],
    safety_flags: []
  };

  return {
    schema_version: 1,
    kind: 'sport-training-plan-import',
    producer: {
      repository: 'GithubLarsKomo/skillz',
      workflow: 'sport-training-plan-workflow',
      contract_version: '0.1.0',
      source_ref: 'skillz@fixture'
    },
    files: {
      'sport-training-plan.json': {
        ...envelope,
        profileRef: 'athlete-profile.json',
        performanceModelRef: 'sport-performance-model.json',
        seasonPlanRef: 'sport-season-plan.json',
        mesocycleRef: 'sport-mesocycle.json',
        microcycleRef: 'sport-microcycle.json',
        strengthPowerRef: 'not_required',
        enduranceRef: 'endurance-plan.json',
        weeks: [{ week: 1 }],
        progressionRules: [],
        taperRules: [],
        safetyRules: [],
        uncertainties: []
      },
      'sport-season-plan.json': {
        ...envelope,
        season_id: 'season-2026',
        version: 1,
        start_date: '2026-09-01',
        end_date: '2026-12-31',
        competitions: [],
        macrocycles: [],
        revision_points: []
      },
      'sport-mesocycle.json': {
        ...envelope,
        mesocycle_id: 'meso-1',
        season_id: 'season-2026',
        version: 1,
        start_date: '2026-09-14',
        end_date: '2026-10-11',
        primary_adaptation: 'rowing-specific endurance',
        maintenance_qualities: [],
        load_strategy: { mode: 'progressive' },
        entry_criteria: [],
        exit_criteria: []
      },
      'sport-microcycle.json': {
        ...envelope,
        microcycle_id: 'micro-1',
        mesocycle_id: 'meso-1',
        version: 1,
        start_date: '2026-09-21',
        end_date: '2026-09-27',
        focus: 'aerobic quality',
        sessions: [{
          planned_session_id: 'session-1',
          session_type: 'rowing',
          objective: 'Aerobic endurance',
          planned_start: '2026-09-27T08:00:00+02:00',
          planned_duration_min: 75,
          planned_rpe: 5,
          intensity_rule: 'RPE 4-5, conversational',
          stop_rule: 'Stop or modify for safety-relevant symptoms',
          flexibility: 'movable',
          items: [{ type: 'steady', duration_min: 60 }]
        }]
      }
    }
  };
}
