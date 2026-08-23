# Specialist Reasoning Runtime

## Purpose

The athlete application persists state and contracts; it does not implement Skillz sport-science reasoning. A separately deployed private runtime receives one selected specialist request, executes the corresponding merged Skillz skill against the supplied minimized snapshot, and returns one canonical artifact plus provenance.

## Network boundary

Recommended Hetzner/Coolify topology:

```text
Browser -> Authentik -> sport-athlete-management-app
                         |
                         +--> private Skillz specialist runtime
                         |
                         +--> private MariaDB
```

Do not expose the specialist service token or `SPECIALIST_SERVICE_SHARED_SECRET` to browser code. Prefer an internal Docker/Coolify network for the Skillz runtime. Administration should use the existing server administration channel rather than exposing a public database/runtime management port.

## Product-to-runtime request

The app sends one request per routed artifact type to `SKILLZ_SPECIALIST_URL`:

```json
{
  "athlete_id": "athlete-123",
  "trigger": "travel_context_changed",
  "artifact_type": "environment_adjustment",
  "skill": "sport-environment-travel",
  "contract": {
    "layer": "p2",
    "version": 1,
    "definition": "environmentAdjustment"
  },
  "snapshot": {}
}
```

The snapshot is created from product-owned MariaDB state and minimized for the requested specialist. The caller of `/api/v1/internal/specialists/generate` cannot supply or override it.

If configured, the app sends `Authorization: Bearer <SKILLZ_SPECIALIST_TOKEN>`.

## Runtime response

Return HTTP 2xx and:

```json
{
  "artifact": {
    "schema_version": 1,
    "athlete_id": "athlete-123",
    "generated_at": "2026-08-22T18:00:00Z",
    "source_refs": [],
    "uncertainties": [],
    "safety_flags": []
  },
  "provenance": {
    "skillz_revision": "<git sha>",
    "runtime": "skillz-gateway/1",
    "model": "<model identity>",
    "provider": "<provider identity>"
  }
}
```

The shown artifact contains only the common envelope; the runtime must include all required fields for the requested P1/P2 artifact type. The product overwrites `artifact.athlete_id` with the authoritative target athlete and validates the result before persistence.

## Failure behavior

Failures are fail-closed:

- missing `SKILLZ_SPECIALIST_URL` -> reasoning run `failed`, no artifact;
- non-2xx runtime response -> affected artifact fails, no fabricated replacement;
- malformed or contract-invalid artifact -> rejected before persistence;
- mixed multi-specialist outcome -> run `partial`, only valid artifacts persisted;
- P2 direct-plan fields such as `revised_plan` -> rejected;
- urgent mental-health output without paused performance optimization and immediate support routing -> rejected.

The producer does not retry inside the HTTP request. A new trigger/retry creates a new reasoning run, preserving the prior failure for audit.

## Product trigger endpoint

Private endpoint:

```text
POST /api/v1/internal/specialists/generate
```

Header name is `SPECIALIST_SERVICE_SECRET_HEADER`; its value is `SPECIALIST_SERVICE_SHARED_SECRET`.

Body:

```json
{
  "athlete_id": "athlete-123",
  "trigger": "key_session_completed"
}
```

For `explicit_specialist_request` only:

```json
{
  "athlete_id": "athlete-123",
  "trigger": "explicit_specialist_request",
  "requested_types": ["testing_plan"]
}
```

## Event routing

The product route table is deterministic and reviewable in `src/domain/specialist-routing.mjs`. It deliberately avoids running all specialists after every event. Medical/health/mental-health routes remain distinct from performance optimization.

## Provenance and versions

`specialist_reasoning_runs` stores the run trigger, selected artifact types, status, result summary and error text. `specialist_artifacts` remains append-only and adds:

- `reasoning_run_id`
- `provenance_json`

Product `artifact_version` is monotonically assigned per athlete/type. A runtime-generated v2 never overwrites v1.

Set `SKILLZ_SOURCE_REVISION` to the deployed Skillz Git SHA as a fallback. The runtime should still return its own actual revision/model/runtime/provider identity so an artifact can be reconstructed later.

## Deployment checklist

1. Run `npm run migrate` before application cutover.
2. Generate independent high-entropy values for browser Authentik proxy secret, specialist service secret, and optional runtime bearer token.
3. Configure the specialist runtime on a private service URL.
4. Pin/record the deployed Skillz revision.
5. Run `npm run ready`.
6. Trigger one explicit non-medical test artifact and verify v1 plus provenance.
7. Trigger it again and verify v2 exists while v1 remains.
8. Disable the runtime URL temporarily and verify a failed reasoning run is recorded with no new artifact.
