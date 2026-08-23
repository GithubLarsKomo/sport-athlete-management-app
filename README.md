# Sport Athlete Management App

Small Node.js WebApp for the operational side of the Sport Athlete Management system. It follows the product-separation pattern of `GithubLarsKomo/grilling`: a dedicated product repository, static responsive frontend, small Node server, Docker/Coolify deployment and explicit runtime status. Unlike Grilling, this application stores longitudinal health-adjacent athlete data and therefore requires a real trusted authentication boundary.

## Architectural boundary

`GithubLarsKomo/skillz` owns sport-science reasoning, versioned contracts, safety rules and evaluation. This repository owns UI, authentication, API, **PostgreSQL persistence**, activity ingestion, journal history, audit history and deployment. Canonical P0 and P1 contracts are copied into `contracts/` with provenance in `contracts/PROVENANCE.md`.

The WebApp does **not** reimplement the sport-training adaptation engine or the P1 specialist skills. `POST /api/v1/adaptation/evaluate` sends the current input snapshot to `SKILLZ_ADAPTATION_URL` when configured. Without that service, the application records a conservative `YELLOW / review_required` decision and makes no automatic plan change.

## Current P0 workflow

1. authenticated athlete identity and profile onboarding
2. active goal / competition / season / mesocycle / microcycle context
3. versioned seven-day training view and today's planned session
4. 20–40 second morning check-in
5. device/service activity import or manual session completion
6. journal RPE and subjective completion context
7. external Skillz adaptation evaluation or safe review-required fallback
8. visible revision proposal with explicit athlete confirmation
9. version-bound plan revision and adaptation/audit history

## Activity journal and device ingestion

The journal deliberately separates a **real training activity** from the services that recorded it. One Concept2/RP3 ergometer session recorded at the same time by a Garmin device becomes one canonical `activity` with multiple `activity_sources`, not two completed workouts.

Journal/Ingestion v1 supports:

- Garmin FIT uploads through the official Garmin FIT SDK;
- Garmin TCX uploads;
- Concept2 Logbook incremental results sync;
- RP3 JSON, CSV and TCX exports;
- exact deduplication through provider activity IDs and source SHA-256;
- cross-provider matching by activity type, start time, overlap, duration and distance;
- complementary Garmin + Concept2/RP3 matching for indoor rowing;
- manual review/merge for ambiguous matches;
- canonical metric precedence while retaining every provider value and provenance;
- automatic matching to a compatible unfinished `planned_session` when possible;
- journal finalization with RPE, pain/comment and deviations before training history is considered complete;
- matching against an already completed manual session so a later device import does not create a second `completed_session`.

A finalized imported activity creates exactly one `completed_session`. Planned activities close the matching plan item; spontaneous/unplanned activities are retained with `planned_session_id = NULL` and still enter later training adaptation. Device data never invents subjective RPE automatically.

The detailed matching, precedence and provenance contract is in [`docs/activity-journal-ingestion.md`](docs/activity-journal-ingestion.md).

For a personal Concept2 deployment, configure the read token only as a deployment secret and bind it to the stable athlete/AuthentiK subject that owns the Concept2 account:

```text
CONCEPT2_BASE_URL=https://log.concept2.com
CONCEPT2_ACCESS_TOKEN=<read-only-logbook-token>
CONCEPT2_ATHLETE_ID=<stable-athlete-id>
CONCEPT2_TIMEOUT_MS=10000
```

The current token configuration is intentionally single-athlete. Requests from any other authenticated athlete are denied before the token is used. A future per-athlete OAuth implementation can replace credential storage without changing the activity/journal model.

## P1 specialist artifacts

The merged Skillz P1 layer is consumed separately from P0. Supported artifact types are:

- `strength_power_plan`
- `endurance_plan`
- `recovery_state`
- `fueling_plan`
- `energy_availability_risk`
- `rehab_progression`
- `return_after_illness_plan`
- `testing_plan`
- `adaptation_analysis`

P1 artifacts are append-only in the product database. The application assigns a product-side `artifact_version` for each athlete/type pair while preserving the canonical Skillz payload and its own plan/domain version. Athlete-facing endpoints are read-only.

P1 writes use a distinct service-to-service endpoint and secret. Set `P1_INGEST_SHARED_SECRET` to at least 32 random characters to enable it; leaving it blank disables P1 ingest. The Skillz service must send the configured `P1_INGEST_SECRET_HEADER` and a body containing the target `athlete_id` plus the canonical `artifact`. The app overwrites any athlete ID inside the payload with the authenticated target, validates the P1 contract subset, appends a new version and writes an audit event.

The internal ingest route must be reachable only through the private application/service network where possible. It is not a browser authoring API. Operational details and verification steps are in [`deploy/P1-SPECIALIST-INGEST.md`](deploy/P1-SPECIALIST-INGEST.md).

## Database platform

Hosted and local persistent deployments use PostgreSQL 18.x. The baseline documented for the shared Hetzner/Coolify platform is PostgreSQL 18.6.

The canonical application connection contract is:

```text
DATABASE_URL=postgresql://<dedicated-user>:<secret>@<private-postgres-host>:5432/sport_athlete
DB_POOL_MAX=5
```

Production PostgreSQL is private infrastructure. Do not expose port 5432 publicly; external administration is through SSH/private-network paths or an SSH tunnel. The app owns the `sport_athlete` database and does not read sibling application databases.

The active PostgreSQL migrations live under `migrations/postgresql/`. The older SQL files directly under `migrations/` are frozen MariaDB migration provenance and are not executed by the PostgreSQL migration runner.

## Local start

A quick local PostgreSQL stack is provided by `docker-compose.example.yml`.

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

Use the `Dockerfile`, attach the application to the private PostgreSQL 18.x service and put the application behind Authentik or an equivalent trusted proxy. Production configuration fails closed when HTTPS `PUBLIC_ORIGIN`, a credentialed PostgreSQL `DATABASE_URL`, or a proxy shared secret of at least 32 characters is missing. If P1 ingest is enabled, its separate secret is also required to contain at least 32 characters.

If Concept2 synchronization is enabled, store `CONCEPT2_ACCESS_TOKEN` only in the deployment secret store and set `CONCEPT2_ATHLETE_ID` to the stable athlete/AuthentiK subject that owns that token. Garmin/RP3 browser uploads remain behind the same authenticated same-origin boundary as the rest of the athlete application.

The base deployment runbook is in [`deploy/COOLIFY-AUTHENTIK.md`](deploy/COOLIFY-AUTHENTIK.md); the P1 service boundary is in [`deploy/P1-SPECIALIST-INGEST.md`](deploy/P1-SPECIALIST-INGEST.md).

Existing MariaDB installations must use the controlled cutover in [`deploy/MARIADB-TO-POSTGRESQL.md`](deploy/MARIADB-TO-POSTGRESQL.md). There is no dual-write compatibility mode.

Before routing traffic to a new release:

```bash
npm run migrate
npm run ready
```

The Docker health check executes the same database-readiness probe.

## API

- `GET /healthz` — process/application liveness only
- `GET /api/v1/me`
- `GET|PUT /api/v1/athlete/profile`
- `GET|POST /api/v1/goals`
- `GET /api/v1/context`
- `PUT /api/v1/planning/active` — idempotent, version-aware active season/meso/micro/session import
- `GET /api/v1/training/today`
- `GET /api/v1/training/week?from=YYYY-MM-DD`
- `GET /api/v1/checkins/today`
- `POST /api/v1/checkins`
- `POST /api/v1/sessions/:id/complete`
- `GET /api/v1/import/status`
- `POST /api/v1/import/file` — Garmin FIT/TCX or RP3 JSON/CSV/TCX
- `POST /api/v1/import/concept2/result` — controlled single-result ingest/testing endpoint
- `POST /api/v1/import/concept2/sync` — incremental Concept2 Logbook synchronization
- `GET /api/v1/journal`
- `PUT /api/v1/journal/{activity_id}` — RPE/comment update or journal finalization
- `POST /api/v1/journal/{target_activity_id}/merge` — explicit ambiguous-duplicate merge
- `POST /api/v1/adaptation/evaluate`
- `POST /api/v1/adaptation/{id}/apply` — explicitly apply a supported version-bound next-session revision
- `GET /api/v1/adaptation/latest`
- `GET /api/v1/adaptation/history`
- `GET /api/v1/p1/types`
- `GET /api/v1/p1/artifacts/latest`
- `GET /api/v1/p1/artifacts/{type}`
- `GET /api/v1/p1/artifacts/{type}/history?limit=20`
- `POST /api/v1/internal/p1/artifacts/{type}` — private service-to-service ingest, requires the separate P1 secret

## Plan lifecycle

The app accepts a versioned active planning package through `PUT /api/v1/planning/active`; see `examples/plan-package.example.json`. IDs and versions are preserved so stale imports cannot silently overwrite newer local session revisions or finalized sessions.

Imported activity data may be matched to an unfinished planned session but does not close it by itself. Journal finalization is the human-control boundary that turns the canonical activity into a completed training record. If a manual completion already represents the same time/duration window, the activity links to that completion instead of creating another one. This keeps device metrics and subjective load context in one lifecycle.

An external Skillz decision may propose a `revised_plan` command for a `planned_session`. The proposal is stored first and only changes the plan through the explicit `/api/v1/adaptation/{id}/apply` endpoint. Applying it checks athlete ownership and `expected_version`, increments the session version, writes `training_plan_revisions`, marks the decision as applied and records an audit event.

Current P1 specialist artifacts are also included in the adaptation input snapshot when available. They provide specialist context; they do not bypass the central adaptation engine or cause automatic plan mutation by themselves.

Database migrations are ordered, transactional where supported and SHA-256 tracked in `schema_migrations`; editing an already applied PostgreSQL migration causes deployment to fail instead of silently drifting the schema. A PostgreSQL advisory transaction lock prevents concurrent migration runners from racing each other.

## Safety and privacy

- No opaque readiness score controls training.
- No automatic medical diagnosis or clearance is implemented in the product layer.
- Missing external reasoning produces `review_required`, not invented training advice.
- Device/service raw payloads remain provenance and are not silently overwritten by canonical values.
- Imported device data does not fabricate subjective RPE or automatically finalize training.
- A personal Concept2 token is bound to one athlete identity and cannot be used by another authenticated athlete.
- P1 athlete-facing APIs are read-only; specialist artifacts require the independent internal ingest secret.
- Every mutation is written to `audit_log`.
- Adaptation decisions retain the authoritative input snapshot and rationale.
- Optional sex-specific and physiology context is voluntary and does not create rigid menstrual-phase prescriptions.
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

CI repeats the tests and migration lifecycle against PostgreSQL 18.6 and builds the production Docker image.
