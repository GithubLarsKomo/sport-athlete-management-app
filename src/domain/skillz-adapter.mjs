import { randomUUID } from 'node:crypto';
import { commonEnvelope, validateAdaptationDecision } from './contracts.mjs';

export async function evaluateAdaptation({ athleteId, snapshot, config, fetchImpl = fetch }) {
  if (config.skillz.adaptationUrl) {
    const headers = { 'content-type': 'application/json' };
    if (config.skillz.token) headers.authorization = `Bearer ${config.skillz.token}`;
    const response = await fetchImpl(config.skillz.adaptationUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ athlete_id: athleteId, input_snapshot: snapshot, contract_version: 1 })
    });
    if (!response.ok) throw new Error(`Skillz adaptation service returned HTTP ${response.status}`);
    const decision = await response.json();
    const errors = validateAdaptationDecision(decision);
    if (errors.length) throw new Error(`Skillz adaptation contract violation: ${errors.join('; ')}`);
    return decision;
  }

  return {
    ...commonEnvelope(athleteId, {
      uncertainties: ['sport-domain adaptation service is not configured'],
      safetyFlags: []
    }),
    adaptation_decision_id: randomUUID(),
    decision_level: 'acute',
    action: 'review_required',
    safety_state: 'YELLOW',
    trigger: 'adaptation_service_unavailable',
    input_snapshot: snapshot,
    previous_plan: snapshot.planned_session || null,
    revised_plan: null,
    rationale: 'No automatic training modification was made because the Skillz adaptation service is not configured. Review is required.',
    responsible_signals: ['service_configuration'],
    confidence: 0,
    human_override: false,
    engine_version: 'product-safe-fallback/1'
  };
}
