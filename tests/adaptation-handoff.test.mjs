import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADAPTATION_HANDOFF_KIND,
  ADAPTATION_PROPOSAL_KIND,
  buildAdaptationHandoff,
  canonicalJson,
  proposalToAdaptationDecision,
  validateAdaptationProposal
} from '../src/domain/adaptation-handoff.mjs';

function repositoryFixture() {
  return {
    async getProfile() {
      return {
        profile_version: 4,
        sport: 'rowing',
        discipline: '1x',
        age_band: '50+',
        training_age_years: 20,
        availability: { sessions_per_week: 6, weekday_minutes: 90 },
        equipment: ['RowErg'],
        performance_history: [{ test: '2k', value: 410 }],
        health_constraints: ['athlete-entered constraint'],
        preferences: { preferred_time: 'morning' },
        optional_sex_specific_context: null,
        email: 'must-not-export@example.com',
        access_token: 'must-not-export'
      };
    },
    async getGoals() {
      return [{ id:'goal-1', goal_type:'performance', description:'Improve 2k', target_value:'405', target_unit:'s', target_date:'2026-12-01', priority:1, status:'active', private_internal:'drop' }];
    },
    async getContext() {
      return {
        next_competition:{ id:'race-1', name:'Race', competition_date:'2026-10-10', priority:'A', discipline:'1x', notes:'drop' },
        season:{ id:'season-1', name:'Season', start_date:'2026-09-01', end_date:'2027-03-31', status:'active', version:2, payload_json:{ raw:'drop' } },
        mesocycle:{ id:'meso-1', season_id:'season-1', start_date:'2026-09-21', end_date:'2026-10-18', primary_adaptation:'threshold', version:3, payload_json:{ raw:'drop' } },
        microcycle:{ id:'micro-1', mesocycle_id:'meso-1', start_date:'2026-09-28', end_date:'2026-10-04', focus:'quality', version:5, payload_json:{ raw:'drop' } }
      };
    },
    async getWeekComparison() {
      return {
        from:'2026-09-28',
        to:'2026-10-04',
        sessions:[{
          plan:{
            planned_session_id:'session-1', local_date:'2026-09-28', planned_start:'2026-09-28T17:00:00.000Z',
            session_type:'rowing', objective:'Intervals', planned_duration_min:60, planned_rpe:7, status:'planned', version:1,
            intensity_rule:'controlled', stop_rule:'pain', flexibility:'key', items:[{ type:'interval', count:4 }]
          },
          actual:{
            completed_session_id:'completed-1', activity_id:'activity-1', started_at:'2026-09-28T17:00:00.000Z',
            completed_at:'2026-09-28T18:00:00.000Z', duration_min:60, session_rpe:7, completion_status:'completed',
            subjective:{ session_rpe:7, expectation_match:'as_expected', pain_0_10:2, comment:'fine', deviations:[], authored_by_subject:'athlete-subject', finalized_at:'2026-09-28T18:05:00.000Z' },
            evidence:{ duration_s:3600, distance_m:14000, avg_power_w:220, avg_hr_bpm:150, max_hr_bpm:176, stroke_rate_spm:26, pace_500_s:128.5, work_kj:792, interval_count:4, raw_samples:[1,2,3] },
            provenance:{
              canonical_source:'concept2',
              completion_source_refs:['session:manual'],
              activity_sources:[{ provider:'concept2', external_activity_id:'c2-1', raw_sha256:'abc', samples:[1,2,3] }],
              provider_secret:'drop'
            },
            coach_notes:[{ id:'note-1', completed_session_id:'completed-1', authored_by_subject:'coach-1', note:'Keep split stable', created_at:'2026-09-28T18:10:00.000Z', updated_at:'2026-09-28T18:10:00.000Z', internal:'drop' }]
          }
        }],
        unplanned:[],
        summary:{ planned_sessions:1, completed_planned_sessions:1, unplanned_sessions:0, planned_duration_min:60, actual_duration_min:60, planned_rpe_average:7, actual_rpe_average:7 }
      };
    },
    async getCheckins() {
      return [{
        local_date:'2026-09-28',
        sleep_duration_min:450,
        sleep_quality_1_5:4, fatigue_1_5:2, soreness_1_5:2, stress_1_5:2, motivation_1_5:4,
        pain_0_10:1, pain_locations:['back'], illness_symptoms:[], objective_metrics:[{ resting_hr:42, raw_samples:[1,2,3] }],
        access_token:'drop', source_refs:['checkin:self']
      }];
    },
    async listPerformanceTests() {
      return [{
        test_id:'test-1', protocol_id:'rowerg-2000m', protocol_version:1, protocol_source:'built_in', modality:'rowerg',
        status:'performed', scheduled_at:'2026-09-27T10:00:00.000Z', performed_at:'2026-09-27T10:05:00.000Z',
        device:'Concept2 PM5', warm_up:{ description:'20 min' }, environment:{ location:'indoor' },
        termination_reason:null, notes:'baseline', interpretation_refs:['skillz:test:1'],
        planned_by_subject:'athlete-subject', performed_by_subject:'athlete-subject', retest_of_test_id:null,
        protocol:{ protocol_id:'rowerg-2000m', version:1, name:'RowErg 2,000 m', modality:'rowerg', protocol_kind:'fixed_effort', fixed_target:{metric:'distance_m',value:2000,unit:'m'}, stage_fields:[], private:'drop' },
        expected_targets:{ pace_500_s:{ value:103, unit:'s/500m', measurement_class:'assumed_or_estimated', source_ref:'coach:target', secret:'drop' } },
        result:{ metrics:{ duration_s:{ value:410, unit:'s', measurement_class:'measured', source_ref:'pm5:result', raw_samples:[1,2] } }, stages:[] }
      }];
    },
    async listPlanImports() {
      return [{
        import_id:'import-1', revision:3, content_hash:'deadbeef', source_refs:['skillz:plan:3'],
        producer:{ repository:'GithubLarsKomo/skillz', workflow:'sport-training-plan-workflow', contract_version:'0.1.0', source_ref:'skillz@abc', api_key:'drop' },
        imported_by_subject:'coach-1', supersedes_import_id:'import-0', imported_at:'2026-09-27T12:00:00.000Z'
      }];
    }
  };
}

test('same snapshot yields byte-stable deterministic minimized handoff', async () => {
  const repository = repositoryFixture();
  const first = await buildAdaptationHandoff(repository, 'athlete-a', '2026-09-28');
  const second = await buildAdaptationHandoff(repository, 'athlete-a', '2026-09-28');

  assert.equal(first.kind, ADAPTATION_HANDOFF_KIND);
  assert.equal(first.handoff_id, second.handoff_id);
  assert.equal(canonicalJson(first), canonicalJson(second));

  const serialized = JSON.stringify(first);
  for (const forbidden of ['must-not-export@example.com','must-not-export','raw_samples','objective_metrics','provider_secret','api_key','private_internal']) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
  assert.match(serialized, /Keep split stable/);
  assert.match(serialized, /measurement_class/);
  assert.match(serialized, /athlete-reported-pain/);
  assert.equal(first.future_learning_promotion.automatic_write, false);
  assert.equal(first.window.to, '2026-10-04');
});

test('proposal validation is strict, athlete-bound and RED cannot carry a plan revision', () => {
  const proposal = {
    schema_version:1,
    kind:ADAPTATION_PROPOSAL_KIND,
    contract_version:'1.0.0',
    proposal_id:'external-1',
    athlete_id:'athlete-a',
    handoff_id:`sha256:${'a'.repeat(64)}`,
    handoff_from:'2026-09-28',
    generated_at:'2026-09-28T10:00:00.000Z',
    producer:{ name:'manual-test', version:'1' },
    decision_level:'tactical',
    action:'reduce_volume',
    safety_state:'YELLOW',
    trigger:'fatigue pattern',
    rationale:'Reduce next session slightly.',
    confidence:0.8,
    source_refs:['source:1'],
    uncertainties:[],
    safety_flags:[],
    revised_plan:{ entity_type:'planned_session', entity_id:'session-1', expected_version:1, patch:{ planned_duration_min:45 } }
  };
  assert.deepEqual(validateAdaptationProposal(proposal, { athleteId:'athlete-a' }), []);
  assert.match(validateAdaptationProposal({ ...proposal, athlete_id:'other' }, { athleteId:'athlete-a' }).join('\n'), /athlete_id mismatch/);
  assert.match(validateAdaptationProposal({ ...proposal, unexpected:'field' }, { athleteId:'athlete-a' }).join('\n'), /unsupported proposal field/);
  assert.match(validateAdaptationProposal({ ...proposal, safety_state:'RED', action:'medical_review' }, { athleteId:'athlete-a' }).join('\n'), /must not include a plan revision/);
});

test('proposal normalization binds authoritative handoff instead of trusting echoed context', async () => {
  const handoff = await buildAdaptationHandoff(repositoryFixture(), 'athlete-a', '2026-09-28');
  const proposal = {
    schema_version:1, kind:ADAPTATION_PROPOSAL_KIND, contract_version:'1.0.0', proposal_id:'external-2',
    athlete_id:'athlete-a', handoff_id:handoff.handoff_id, handoff_from:'2026-09-28',
    generated_at:'2026-09-28T10:00:00.000Z', producer:{name:'skillz-manual',version:'0.1'},
    decision_level:'tactical', action:'reduce_volume', safety_state:'YELLOW', trigger:'test',
    rationale:'Reduce volume.', confidence:0.7, source_refs:[], uncertainties:[], safety_flags:[],
    revised_plan:{ entity_type:'planned_session', entity_id:'session-1', expected_version:1, patch:{ planned_duration_min:45 } }
  };
  const decision = proposalToAdaptationDecision(proposal, handoff);
  assert.equal(decision.origin, 'manual_handoff_import');
  assert.equal(decision.input_snapshot.handoff_id, handoff.handoff_id);
  assert.equal(decision.external_proposal_id, 'external-2');
  assert.equal(decision.previous_plan.planned_session_id, 'session-1');
  assert.equal(decision.human_override, false);
});
