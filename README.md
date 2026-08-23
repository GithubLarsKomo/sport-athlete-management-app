# Sport Athlete Management App

Small Node.js WebApp for the operational side of the Sport Athlete Management system. It stores longitudinal health-adjacent athlete data behind a trusted authentication boundary and uses PostgreSQL for durable persistence.

## Architectural boundary

`GithubLarsKomo/skillz` owns sport-science reasoning, versioned contracts, safety rules and evaluation. This repository owns UI, authentication, API, PostgreSQL persistence, journal ingestion, audit history and deployment. Canonical P0, P1 and P2 contracts are copied into `contracts/` with provenance in `contracts/PROVENANCE.md`.

The WebApp does not reimplement the adaptation engine or P1/P2 specialist logic. P0 adaptation can use `SKILLZ_ADAPTATION_URL`; P1/P2 specialist generation can use `SKILLZ_SPECIALIST_URL`. Missing or invalid reasoning fails closed without inventing advice.

## Closed-loop workflow

1. authenticated athlete identity and profile
2. goals and versioned season/meso/micro/session planning
3. morning check-in
4. device/service activity ingestion and cross-provider deduplication
5. one canonical journal activity with Garmin, Concept2 and/or RP3 source provenance
6. athlete RPE, pain, deviations and comment
7. journal finalization into exactly one `completed_session`
8. event/checkpoint-driven P1/P2 specialist generation where relevant
9. adaptation evaluation and explicit athlete-confirmed plan revision

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

## P1/P2 specialist artifacts

P1 supports strength/power, endurance, recovery, fueling, energy-availability risk, rehabilitation, return after illness, testing and longitudinal adaptation analysis. P2 supports performance psychology, mental-health routing, training music and environment/travel adjustment. Both use append-only `specialist_artifacts`; athlete-facing APIs are read-only. P2 cannot patch a training plan directly.

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

Use the repository Dockerfile, a private PostgreSQL 18.x service and Authentik or an equivalent trusted proxy. Production fails closed when HTTPS `PUBLIC_ORIGIN`, a credentialed `DATABASE_URL`, or a sufficiently strong proxy secret is missing. Specialist and Concept2 credentials stay in the deployment secret store and are never exposed to frontend code.

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

The application also exposes identity/profile, goals/context, planning, check-ins, manual session completion, adaptation history/apply, read-only P1/P2 artifacts and private specialist producer/ingest endpoints.

## Safety and privacy

- No opaque readiness score controls training.
- No automatic medical diagnosis or clearance is implemented in the product layer.
- Missing external reasoning does not invent advice.
- Device imports never invent subjective RPE.
- Raw provider provenance is retained after deduplication.
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
