# P1 specialist artifact ingest

This runbook covers the service-to-service boundary used to import P1 sport-science artifacts from a trusted Skillz reasoning service into the Sport Athlete Management App.

## Security model

Athlete/browser sessions are read-only for P1 specialist artifacts. P1 writes use a separate internal endpoint and a separate shared secret; the Authentik browser-session headers do not authorize P1 writes.

Preferred production topology:

```text
Skillz reasoning service
  -> private Coolify network
  -> sport-athlete-management-app:3000
  -> MariaDB 11.8 (private network only)
```

Do not expose the internal P1 ingest route as a browser authoring surface. If the public reverse proxy can route by path, deny `/api/v1/internal/*` at the public edge and permit it only on the private service network. If path splitting is not practical, the independent service secret remains mandatory and the public proxy must not inject it.

## Required variables

Set on the app container as deployment secrets:

```text
P1_INGEST_SHARED_SECRET=<at least 32 random characters>
P1_INGEST_SECRET_HEADER=x-sam-p1-ingest-secret
```

Use a value distinct from `AUTH_PROXY_SHARED_SECRET`, database credentials and any Skillz adaptation bearer token. Leaving `P1_INGEST_SHARED_SECRET` blank disables P1 writes and causes the ingest endpoint to return `503 p1_ingest_disabled`.

## Request contract

Endpoint:

```text
POST /api/v1/internal/p1/artifacts/{type}
```

Supported `{type}` values:

- `strength_power_plan`
- `endurance_plan`
- `recovery_state`
- `fueling_plan`
- `energy_availability_risk`
- `rehab_progression`
- `return_after_illness_plan`
- `testing_plan`
- `adaptation_analysis`

Headers:

```text
Content-Type: application/json
x-sam-p1-ingest-secret: <service secret>
```

Body shape:

```json
{
  "athlete_id": "stable-authentik-subject-used-by-the-app",
  "artifact": {
    "schema_version": 1,
    "athlete_id": "ignored-by-product",
    "generated_at": "2026-08-22T15:00:00Z",
    "source_refs": [],
    "uncertainties": [],
    "safety_flags": []
  }
}
```

The artifact must additionally satisfy the required fields for its canonical P1 type in `contracts/sport-athlete-management-p1-v1.schema.json`. The application makes the outer target `athlete_id` authoritative and overwrites any athlete ID supplied inside `artifact` before validation/persistence.

## Persistence semantics

For each `(athlete_id, artifact_type)` pair the app assigns an append-only `artifact_version` beginning at 1. It never updates an older P1 artifact in place. Every ingest also creates an `audit_log` event with actor `service:skillz`.

The version assigned by the product is an audit/persistence version. Domain versions inside a Skillz payload such as `plan_version` remain untouched and may have a different value.

## Athlete-facing access

Authenticated athletes can read only their own P1 artifacts through:

```text
GET /api/v1/p1/artifacts/latest
GET /api/v1/p1/artifacts/{type}
GET /api/v1/p1/artifacts/{type}/history?limit=20
```

There is no athlete/browser P1 mutation endpoint.

## Adaptation integration

Latest P1 specialist artifacts are included in the authoritative input snapshot passed to the central adaptation engine. Specialist artifacts provide evidence and domain recommendations; they do not directly mutate the training plan and do not bypass the existing explicit `/adaptation/{id}/apply` workflow.

## Deployment verification

After `npm run migrate` and before real P1 data is retained, verify all of the following:

- migration `003_specialist_artifacts.sql` is recorded in `schema_migrations`;
- app passes `npm run ready`;
- blank P1 secret returns `503` on ingest;
- wrong secret returns `401` before database persistence;
- correct private-service secret accepts a valid test artifact;
- the artifact is visible only to the matching athlete account;
- importing the same artifact type twice creates versions 1 and 2 rather than overwriting version 1;
- an invalid or unsupported artifact is rejected;
- an `audit_log` entry exists for each accepted import;
- no P1 secret appears in logs, Git, issue comments or browser JavaScript.

## Secret rotation

Rotate the P1 secret independently of browser authentication. Update the reasoning service and app in a coordinated maintenance window. Since requests are stateless, no data migration is required. After rotation, verify that the old secret fails and the new one succeeds.

## Medical boundary

`rehab_progression`, `return_after_illness_plan` and `energy_availability_risk` are persisted sport-management artifacts, not medical diagnoses or autonomous clearance decisions. Medical red flags and documented restrictions remain routing/stop conditions in the Skillz domain layer.
