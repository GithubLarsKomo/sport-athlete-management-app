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
