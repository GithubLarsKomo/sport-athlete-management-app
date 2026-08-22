import { normalizeAnySpecialistArtifact, specialistDescriptor } from './specialist-registry.mjs';
import { routeSpecialists } from './specialist-routing.mjs';

function runtimeConfig(config) {
  return {
    url: String(config.skillz?.specialistUrl || '').trim(),
    token: String(config.skillz?.specialistToken || '').trim(),
    timeoutMs: Number(config.skillz?.specialistTimeoutMs || 15000),
    sourceRevision: String(config.skillz?.specialistRevision || '').trim()
  };
}

function normalizeProvenance(raw, descriptor, runtime) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    skill: descriptor.skill,
    artifact_type: descriptor.type,
    contract_layer: descriptor.layer,
    contract_version: 1,
    skillz_revision: String(value.skillz_revision || runtime.sourceRevision || 'unknown'),
    runtime: String(value.runtime || 'unknown'),
    model: String(value.model || 'unknown'),
    provider: String(value.provider || 'unknown')
  };
}

async function requestArtifact({ runtime, descriptor, athleteId, trigger, snapshot, fetchImpl }) {
  const headers = { 'content-type': 'application/json' };
  if (runtime.token) headers.authorization = `Bearer ${runtime.token}`;
  const response = await fetchImpl(runtime.url, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(runtime.timeoutMs),
    body: JSON.stringify({
      athlete_id: athleteId,
      trigger,
      artifact_type: descriptor.type,
      skill: descriptor.skill,
      contract: {
        layer: descriptor.layer,
        version: 1,
        definition: descriptor.definition
      },
      snapshot
    })
  });
  if (!response.ok) throw new Error(`specialist runtime HTTP ${response.status}`);
  const body = await response.json();
  if (!body || typeof body !== 'object' || Array.isArray(body) || !body.artifact) throw new Error('specialist runtime returned no artifact');
  return body;
}

export async function produceSpecialistArtifacts({
  athleteId,
  trigger,
  requestedTypes = [],
  snapshot,
  config,
  repository,
  fetchImpl = globalThis.fetch,
  actor = 'service:skillz-producer'
}) {
  const route = routeSpecialists(trigger, requestedTypes);
  if (route.errors.length) return { status: 'rejected', run_id: null, selected_types: [], artifacts: [], errors: route.errors };

  const runtime = runtimeConfig(config);
  const run = await repository.createReasoningRun(athleteId, trigger, route.types, actor);
  if (!runtime.url) {
    const error = 'specialist reasoning runtime is not configured';
    await repository.completeReasoningRun(athleteId, run.id, 'failed', [], error);
    return { status: 'failed', run_id: run.id, selected_types: route.types, artifacts: [], errors: [error] };
  }

  const artifacts = [];
  const errors = [];
  for (const type of route.types) {
    const descriptor = specialistDescriptor(type);
    try {
      const response = await requestArtifact({ runtime, descriptor, athleteId, trigger, snapshot, fetchImpl });
      const normalized = normalizeAnySpecialistArtifact(type, athleteId, response.artifact);
      if (normalized.errors.length) {
        errors.push({ type, error: 'invalid_specialist_artifact', details: normalized.errors });
        continue;
      }
      const provenance = normalizeProvenance(response.provenance, descriptor, runtime);
      const record = await repository.saveSpecialistArtifact(
        athleteId,
        type,
        normalized.artifact,
        actor,
        { reasoningRunId: run.id, provenance }
      );
      artifacts.push({ ...record, definition: descriptor.definition, layer: descriptor.layer, skill: descriptor.skill, provenance });
    } catch (error) {
      errors.push({ type, error: String(error?.message || error) });
    }
  }

  const status = errors.length === 0 ? 'completed' : artifacts.length ? 'partial' : 'failed';
  await repository.completeReasoningRun(athleteId, run.id, status, artifacts.map(item => ({
    artifact_type: item.artifact_type,
    artifact_version: item.artifact_version,
    skill: item.skill
  })), errors.length ? JSON.stringify(errors) : null);

  return { status, run_id: run.id, selected_types: route.types, artifacts, errors };
}
