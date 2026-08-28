# Sport Athlete Management App

Small Node.js WebApp for the operational side of the Sport Athlete Management system. It stores longitudinal health-adjacent athlete data behind a trusted authentication boundary and uses PostgreSQL for durable persistence.

## Architectural boundary

`GithubLarsKomo/skillz` owns sport-science reasoning, versioned contracts, safety rules and evaluation. This repository owns UI, authentication, API, PostgreSQL persistence, journal/device ingestion, audit history and deployment. Canonical P0, P1 and P2 contracts are copied into `contracts/` with provenance in `contracts/PROVENANCE.md`.

The WebApp does not reimplement the adaptation engine or P1/P2 specialist logic. P0 adaptation can use `SKILLZ_ADAPTATION_URL`; P1/P2 specialist generation can use `SKILLZ_SPECIALIST_URL`. Missing or invalid reasoning fails closed without inventing advice.

Garmin and comparable wearable platforms are providers of observations and optional provider-derived context. They are not the authoritative readiness, health or training-decision engine. The normative product extension is documented in [`docs/garmin-health-baselines.md`](docs/garmin-health-baselines.md); canonical reasoning rules remain in `GithubLarsKomo/skillz`.

## Closed-loop workflow

1. authenticated athlete identity and profile
2. goals and versioned season/meso/micro/session planning
3. morning check-in, with passive device context when available
4. device/service activity ingestion and cross-provider deduplication
5. one canonical journal activity with Garmin, Concept2 and/or RP3 source provenance
6. athlete RPE, pain, deviations and comment
7. journal finalization into exactly one `completed_session`
8. longitudinal Recovery, Training Tolerance, Performance Capacity, Physiological Stability and Body/Energy context where data are available
9. event/checkpoint-driven P1/P2 specialist generation where relevant
10. adaptation evaluation and explicit athlete-confirmed plan revision
11. optional future publication of an approved/versioned workout to a device provider

Passive wearable data reduce manual entry but do not replace the Morning Check, pain/illness reporting or the athlete's subjective response.

## Journal and activity ingestion

A real training session is represented once in `activities`; provider observations are retained separately in `activity_sources`. Re-imports are idempotent by external provider ID and SHA-256, while cross-provider matching uses activity type, time overlap, duration and distance. Garmin plus Concept2/RP3 indoor-rowing recordings are treated as complementary sources. Ambiguous matches remain reviewable instead of being silently merged.

Supported v1 inputs:

- Garmin FIT via the official `@garmin/fitsdk`, plus Garmin TCX
- Concept2 Logbook incremental result sync
- RP3 JSON, CSV and TCX

Imported activities are linked to a compatible planned session where possible. Finalization requires athlete RPE. Unplanned sessions also become completed sessions, while a later device import can attach to an already manually completed session instead of creating a duplicate. The detailed precedence and dedupe contract is in [`docs/activity-journal-ingestion.md`](docs/activity-journal-ingestion.md).

For a personal Concept2 connection configure a read-only token and bind it to exactly one stable athlete identity:

```text
CONCEPT2_ACCESS_TOKEN=<secret>
CONCEPT2_ATHLETE_ID=<stable-athlete-id>
```

A future per-athlete OAuth flow can replace this without changing the journal data model.

## Garmin health / passive biometrics extension

The current branch defines the architecture and contract boundary for a future passive Garmin-health adapter; it does not claim that Garmin Health API ingestion is already implemented.

When implemented, passive metrics are normalized with explicit provenance and classification:

- `metric_class`: `direct_sensor | provider_derived | journal_derived | reference_measurement | manual_measurement`
- `decision_role`: `primary_evidence | context_only | display_only | excluded_from_adaptation`
- provider/device/method information where known
- `quality_flag`
- a comparable-series identity where device/method changes matter

Examples of suitable passive context include resting/night HR, HRV, sleep summaries, respiration, skin-temperature trend and selected SpO₂ summaries. Provider-derived values such as Garmin Training Readiness, Body Battery, Sleep Score, Training Status or Fitness Age may be retained as secondary device context but cannot independently modify a training plan.

### Personal baselines and Health Drift

Sports Journal uses athlete-specific, method-compatible longitudinal references rather than treating population cut-offs or one day's wearable value as the control signal. Baselines require adequate coverage and retain their window/method/quality for audit.

`Health Drift` is an explainable Sports-Journal-derived state for physiological instability relative to those baselines. It uses persistence, multiple compatible signals, data quality and symptom/training context. It is not a diagnosis and an isolated HRV, temperature or SpO₂ deviation is insufficient for autonomous escalation.

### Body / Energy context

Body data remain method-aware. Body mass, waist circumference, waist-height ratio and optional body-composition estimates can be stored longitudinally, but BIA, DXA, scale and tape series are not silently merged. Consumer BIA-derived fat/lean estimates do not become DXA-equivalent measurements, and a BIA device's “bone density” estimate is not treated as measured bone mineral density.

Biological Age, Pace of Aging, Lifespan/“days gained”, Metabolic Capacity/Momentum and universal Health/Readiness scores are not authoritative Sports Journal constructs.

## P1/P2 specialist artifacts

P1 supports strength/power, endurance, recovery, fueling, energy-availability risk, rehabilitation, return after illness, testing and longitudinal adaptation analysis. P2 supports performance psychology, mental-health routing, training music and environment/travel adjustment. Both use append-only `specialist_artifacts`; athlete-facing APIs are read-only. P2 cannot patch a training plan directly.

Recovery and longitudinal adaptation reasoning are expected to keep direct/passive signals, Sports-Journal-derived states and proprietary provider scores distinguishable. Body/Energy interpretation remains method-aware and RED-S routing is multisignal rather than weight/BIA driven.

## Specialist reasoning producer

Generation is server-to-server only. Configure `SPECIALIST_SERVICE_SHARED_SECRET`, `SKILLZ_SPECIALIST_URL` and the optional runtime token/revision settings. `POST /api/v1/internal/specialists/generate` rebuilds the authoritative athlete snapshot from PostgreSQL, minimizes it by specialist, validates the canonical response and stores reasoning-run provenance. Details are in [`deploy/SPECIALIST-REASONING-RUNTIME.md`](deploy/SPECIALIST-REASONING-RUNTIME.md).

Legacy `P1_INGEST_*` configuration and `/api/v1/internal/p1/artifacts/{type}` remain supported for compatibility.

## Database platform

Hosted and local persistent deployments use PostgreSQL 18.x; the shared Hetzner/Coolify baseline is PostgreSQL 18.6.

```text
DATABASE_URL=postgresql://<dedicated-user>:<secret>@<private-postgres-host>:5432/sport_athlete
DB_POOL_MAX=5
```

PostgreSQL remains private infrastructure. Port 5432 is never exposed publicly. Active migrations live under `migrations/postgresql/`; legacy MariaDB SQL in the parent migration directory is frozen provenance. The active sequence currently includes specialist reasoning as migration 004 and journal/activity ingestion as migration 005. Migrations are SHA-256 tracked, transactional where supported and serialized by a PostgreSQL advisory transaction lock.

The health/baseline architecture anticipates future persistence for enhanced `objective_metrics`, `device_connections`, `biometric_baselines`, `biometric_anomalies` and `body_measurements`. These are design targets until corresponding migrations/API code are implemented.

## Local start

```bash
docker compose -f docker-compose.example.yml up -d db
cp .env.example .env
npm ci
npm run migrate
npm run seed:demo
AUTH_MODE=dev NODE_ENV=development npm start
```

Open `http://localhost:3000`.

## Production on Hetzner / Coolify

Use the repository Dockerfile, a private PostgreSQL 18.x service and Authentik or an equivalent trusted proxy. Production fails closed when HTTPS `PUBLIC_ORIGIN`, a credentialed `DATABASE_URL`, or a sufficiently strong proxy secret is missing. Specialist and device/service credentials stay in the deployment secret store and are never exposed to frontend code.

Before routing traffic to a release:

```bash
npm run migrate
npm run ready
```

## API additions for journal ingestion

```text
GET  /api/v1/import/status
POST /api/v1/import/file
POST /api/v1/import/concept2/result
POST /api/v1/import/concept2/sync
GET  /api/v1/journal
PUT  /api/v1/journal/{activity_id}
POST /api/v1/journal/{target_activity_id}/merge
```

The application also exposes identity/profile, goals/context, planning, check-ins, manual session completion, adaptation history/apply, read-only P1/P2 artifacts and private specialist producer/ingest endpoints. Passive health endpoints are intentionally not documented as available until their adapter/persistence implementation exists.

## Safety and privacy

- No opaque readiness, health or longevity score controls training.
- No Garmin/provider-derived score independently determines GREEN/YELLOW/ORANGE/RED or mutates a plan.
- No automatic medical diagnosis or clearance is implemented in the product layer.
- Missing external reasoning does not invent advice.
- Passive sync never replaces pain, illness or subjective Morning Check fields.
- Device imports never invent subjective RPE.
- Raw/provider provenance and method boundaries are retained before derived interpretation.
- Safety flags, pain, illness and explicit restrictions override favorable wearable context.
- Concept2 personal tokens are athlete-scoped; a different authenticated athlete cannot invoke or discover that connection.
- P1/P2 athlete APIs are read-only and specialist writes use an independent service secret.
- Every mutation and reasoning run is audit-traceable.
- Production browser writes are bound to the configured HTTPS origin.
- Before multi-user production use, complete GDPR/privacy, retention/deletion, backup/restore and software-boundary review.

## Checks

```bash
npm ci
npm test
npm run check
npm run migrate
npm run ready
npm run test:integration
npm run reconcile
```

CI runs these checks against PostgreSQL 18.6 and builds the production Docker image.
