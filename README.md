# Sport Athlete Management App

Small Node.js WebApp for the operational side of the Sport Athlete Management system. It follows the product-separation pattern of `GithubLarsKomo/grilling`: a dedicated product repository, static responsive frontend, small Node server, Docker/Coolify deployment and explicit runtime status. Unlike Grilling, this application stores longitudinal health-adjacent athlete data and therefore requires a real trusted authentication boundary.

## Architectural boundary

`GithubLarsKomo/skillz` owns sport-science reasoning, versioned contracts, safety rules and evaluation. This repository owns UI, authentication, API, **PostgreSQL persistence**, audit history and deployment. Canonical P0, P1 and P2 contracts are copied into `contracts/` with provenance in `contracts/PROVENANCE.md`.

The WebApp does **not** reimplement the sport-training adaptation engine or P1/P2 specialist logic. `POST /api/v1/adaptation/evaluate` sends the current input snapshot to `SKILLZ_ADAPTATION_URL` when configured. Without that service, the application records a conservative `YELLOW / review_required` decision and makes no automatic plan change.

A separate specialist producer can call `SKILLZ_SPECIALIST_URL`. The product selects the relevant specialist from a deterministic event route, constructs the authoritative athlete snapshot internally, minimizes the snapshot for that specialist, validates the returned canonical artifact, and stores it append-only with runtime/model/Skillz-revision provenance. If the specialist runtime is unavailable or returns an invalid artifact, the reasoning run is recorded as failed or partial and **no replacement advice is invented**.

## Current closed-loop workflow

1. authenticated athlete identity and profile onboarding
2. active goal / competition / season / mesocycle / microcycle context
3. versioned seven-day training view and today's planned session
4. 20–40 second morning check-in
5. completed session with duration and session RPE
6. event/checkpoint-driven P1/P2 specialist generation where relevant
7. external Skillz adaptation evaluation or safe review-required fallback
8. visible revision proposal with explicit athlete confirmation
9. version-bound plan revision and adaptation/audit history

## P1/P2 specialist artifacts

P1 supports strength/power, endurance, recovery, fueling, energy-availability risk, rehabilitation, return after illness, testing and longitudinal adaptation analysis. P2 supports performance psychology, mental-health routing, training music and environment/travel adjustment.

P1 and P2 use the same generic `specialist_artifacts` table. Artifacts are append-only and receive a product-side `artifact_version`. Athlete-facing APIs are read-only. P2 artifacts cannot contain direct plan patches; urgent mental-health routing leaves the performance-optimization loop rather than inventing performance advice.

## Specialist reasoning producer

Generation is server-to-server only. Configure:

```text
SPECIALIST_SERVICE_SHARED_SECRET=<at least 32 random characters>
SPECIALIST_SERVICE_SECRET_HEADER=x-sam-specialist-secret
SKILLZ_SPECIALIST_URL=<trusted Skillz runtime endpoint>
SKILLZ_SPECIALIST_TOKEN=<runtime bearer token if required>
SKILLZ_SPECIALIST_TIMEOUT_MS=15000
SKILLZ_SOURCE_REVISION=<deployed skillz commit>
```

`POST /api/v1/internal/specialists/generate` accepts only `athlete_id`, a known trigger and optionally validated requested types. The product rebuilds the authoritative athlete snapshot from PostgreSQL and sends only the specialist-specific minimized snapshot. Each attempt creates a `specialist_reasoning_runs` record and retains runtime/model/Skillz-revision provenance. Details are in [`deploy/SPECIALIST-REASONING-RUNTIME.md`](deploy/SPECIALIST-REASONING-RUNTIME.md).

The previous `P1_INGEST_*` configuration and `/api/v1/internal/p1/artifacts/{type}` route remain supported for compatibility. New integrations should use `SPECIALIST_SERVICE_*` and `/api/v1/internal/specialists/artifacts/{type}`.

## Database platform

Hosted and local persistent deployments use PostgreSQL 18.x. The shared Hetzner/Coolify baseline is PostgreSQL 18.6.

```text
DATABASE_URL=postgresql://<dedicated-user>:<secret>@<private-postgres-host>:5432/sport_athlete
DB_POOL_MAX=5
```

PostgreSQL is private infrastructure. Port 5432 is never exposed publicly; external administration uses SSH/private networking or an SSH tunnel. The Sport app owns its `sport_athlete` database and does not read sibling application databases.

Active migrations live under `migrations/postgresql/`. The SQL files directly under `migrations/` are frozen MariaDB provenance and are not executed by the PostgreSQL migration runner. Applied PostgreSQL migrations are SHA-256 tracked and serialized with a PostgreSQL advisory transaction lock.

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

Use the `Dockerfile`, attach the application to the private PostgreSQL 18.x service and put the athlete-facing application behind Authentik or an equivalent trusted proxy. Production configuration fails closed when HTTPS `PUBLIC_ORIGIN`, a credentialed PostgreSQL `DATABASE_URL`, or a proxy shared secret of at least 32 characters is missing. The specialist service secret is independent from the browser/Auth proxy secret and must never be exposed to frontend code.

Prefer private service networking for PostgreSQL, the specialist runtime and internal producer/ingest endpoints. The base deployment runbook is in [`deploy/COOLIFY-AUTHENTIK.md`](deploy/COOLIFY-AUTHENTIK.md); specialist runtime details are in [`deploy/SPECIALIST-REASONING-RUNTIME.md`](deploy/SPECIALIST-REASONING-RUNTIME.md).

Before routing traffic to a new release:

```bash
npm run migrate
npm run ready
```

The Docker health check executes the same database-readiness probe.

## API

Athlete-facing endpoints include identity/profile, goals/context, versioned planning, weekly/today training, check-ins, completed sessions, adaptation history/apply, and read-only P1/P2 specialist artifacts.

Private service-to-service endpoints:

- `POST /api/v1/internal/specialists/generate`
- `POST /api/v1/internal/specialists/artifacts/{type}`
- `POST /api/v1/internal/p1/artifacts/{type}` — legacy P1-compatible alias

## Plan lifecycle

The app accepts a versioned active planning package through `PUT /api/v1/planning/active`; see `examples/plan-package.example.json`. IDs and versions are preserved so stale imports cannot silently overwrite newer local session revisions or finalized sessions.

An external Skillz adaptation decision may propose a `revised_plan` command for a `planned_session`. The proposal is stored first and only changes the plan through explicit apply. Current specialist artifacts may inform the adaptation snapshot, but they do not bypass the central adaptation engine or mutate the plan by themselves.

## Safety and privacy

- No opaque readiness score controls training.
- No automatic medical diagnosis or clearance is implemented in the product layer.
- Missing P0 adaptation reasoning produces `review_required`; missing specialist reasoning produces a failed run and no invented artifact.
- P1/P2 athlete-facing APIs are read-only; specialist writes/generation require the independent internal service secret.
- The product, not the caller/runtime, is authoritative for athlete identity.
- Specialist snapshots are minimized by artifact type before transmission.
- Mental-health routing is non-diagnostic and can leave the performance loop on urgent safety concerns.
- P2 artifacts cannot mutate a training plan directly.
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

CI repeats these checks against PostgreSQL 18.6 and builds the production Docker image.
