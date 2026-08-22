# Sport Athlete Management App

Small Node.js WebApp for the operational side of the Sport Athlete Management system. It follows the product-separation pattern of `GithubLarsKomo/grilling`: a dedicated product repository, static responsive frontend, small Node server, Docker/Coolify deployment and explicit runtime status. Unlike Grilling, this application stores longitudinal health-adjacent athlete data and therefore requires a real trusted authentication boundary.

## Architectural boundary

`GithubLarsKomo/skillz` owns sport-science reasoning, versioned contracts, safety rules and evaluation. This repository owns UI, authentication, API, MariaDB persistence, audit history and deployment. Canonical P0 and P1 contracts are copied into `contracts/` with provenance in `contracts/PROVENANCE.md`.

The WebApp does **not** reimplement the sport-training adaptation engine or the P1 specialist skills. `POST /api/v1/adaptation/evaluate` sends the current input snapshot to `SKILLZ_ADAPTATION_URL` when configured. Without that service, the application records a conservative `YELLOW / review_required` decision and makes no automatic plan change.

## Current P0 workflow

1. authenticated athlete identity and profile onboarding
2. active goal / competition / season / mesocycle / microcycle context
3. versioned seven-day training view and today's planned session
4. 20–40 second morning check-in
5. completed session with duration and session RPE
6. external Skillz adaptation evaluation or safe review-required fallback
7. visible revision proposal with explicit athlete confirmation
8. version-bound plan revision and adaptation/audit history

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

The internal ingest route must be reachable only through the private application/service network where possible. It is not a browser authoring API.

## Local start

```bash
cp .env.example .env
npm ci
npm run migrate
npm run seed:demo
AUTH_MODE=dev NODE_ENV=development npm start
```

Open `http://localhost:3000`.

## Production on Hetzner / Coolify

Use the `Dockerfile`, provision MariaDB 11.8 and put the application behind Authentik or an equivalent trusted proxy. Production configuration fails closed when HTTPS `PUBLIC_ORIGIN`, `DB_PASSWORD`, or a proxy shared secret of at least 32 characters is missing. If P1 ingest is enabled, its separate secret is also required to contain at least 32 characters.

The detailed runbook is in [`deploy/COOLIFY-AUTHENTIK.md`](deploy/COOLIFY-AUTHENTIK.md).

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

An external Skillz decision may propose a `revised_plan` command for a `planned_session`. The proposal is stored first and only changes the plan through the explicit `/api/v1/adaptation/{id}/apply` endpoint. Applying it checks athlete ownership and `expected_version`, increments the session version, writes `training_plan_revisions`, marks the decision as applied and records an audit event.

Current P1 specialist artifacts are also included in the adaptation input snapshot when available. They provide specialist context; they do not bypass the central adaptation engine or cause automatic plan mutation by themselves.

Database migrations are ordered and hash-tracked in `schema_migrations`; editing an already applied migration causes deployment to fail instead of silently drifting the schema.

## Safety and privacy

- No opaque readiness score controls training.
- No automatic medical diagnosis or clearance is implemented in the product layer.
- Missing external reasoning produces `review_required`, not invented training advice.
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
```

CI repeats these checks against MariaDB 11.8 and also builds the production Docker image.
