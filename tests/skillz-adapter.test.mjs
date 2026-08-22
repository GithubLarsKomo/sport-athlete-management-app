import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAdaptation } from '../src/domain/skillz-adapter.mjs';

test('missing external service yields safe review-required fallback', async () => {
  const decision=await evaluateAdaptation({athleteId:'a',snapshot:{planned_session:{id:'s'}},config:{skillz:{adaptationUrl:'',token:''}}});
  assert.equal(decision.action,'review_required');
  assert.equal(decision.safety_state,'YELLOW');
  assert.equal(decision.revised_plan,null);
  assert.equal(decision.confidence,0);
});

test('external adaptation cannot switch athlete identity', async () => {
  const fakeFetch = async () => ({
    ok: true,
    async json() {
      return {
        schema_version:1,athlete_id:'other',generated_at:new Date().toISOString(),source_refs:[],uncertainties:[],safety_flags:[],
        adaptation_decision_id:'d',decision_level:'acute',action:'proceed',safety_state:'GREEN',trigger:'ok',input_snapshot:{},rationale:'ok',confidence:.8,human_override:false,engine_version:'test'
      };
    }
  });
  await assert.rejects(() => evaluateAdaptation({athleteId:'a',snapshot:{marker:'authoritative'},config:{skillz:{adaptationUrl:'https://example.invalid',token:'',timeoutMs:5000}},fetchImpl:fakeFetch}), /athlete_id mismatch/);
});

test('authoritative product snapshot replaces echoed service snapshot', async () => {
  const fakeFetch = async () => ({
    ok: true,
    async json() {
      return {
        schema_version:1,athlete_id:'a',generated_at:new Date().toISOString(),source_refs:[],uncertainties:[],safety_flags:[],
        adaptation_decision_id:'d',decision_level:'acute',action:'proceed',safety_state:'GREEN',trigger:'ok',input_snapshot:{tampered:true},rationale:'ok',confidence:.8,human_override:false,engine_version:'test'
      };
    }
  });
  const snapshot={marker:'authoritative'};
  const decision=await evaluateAdaptation({athleteId:'a',snapshot,config:{skillz:{adaptationUrl:'https://example.invalid',token:'',timeoutMs:5000}},fetchImpl:fakeFetch});
  assert.deepEqual(decision.input_snapshot,snapshot);
});
