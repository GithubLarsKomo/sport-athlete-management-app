import test from 'node:test';
import assert from 'node:assert/strict';
import { commonEnvelope, validateCheckin, validateCompletedSession, validateAdaptationDecision } from '../src/domain/contracts.mjs';

test('valid daily checkin passes', () => {
  const value={...commonEnvelope('a'),local_date:'2026-08-22',sleep_quality_1_5:4,fatigue_1_5:2,soreness_1_5:2,stress_1_5:2,motivation_1_5:4,pain_0_10:0};
  assert.deepEqual(validateCheckin(value),[]);
});

test('session load must equal duration times RPE', () => {
  const value={...commonEnvelope('a'),completed_session_id:'c',started_at:new Date().toISOString(),completed_at:new Date().toISOString(),duration_min:60,session_rpe:6,session_load:300,completion_status:'completed'};
  assert.ok(validateCompletedSession(value).some(e=>e.includes('session_load')));
});

test('RED cannot proceed', () => {
  const value={...commonEnvelope('a'),adaptation_decision_id:'d',decision_level:'acute',action:'proceed',safety_state:'RED',trigger:'x',input_snapshot:{},rationale:'x',confidence:.5,human_override:false};
  assert.ok(validateAdaptationDecision(value).some(e=>e.includes('RED')));
});
