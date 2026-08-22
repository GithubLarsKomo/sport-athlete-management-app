# Sport Athlete Management App

Small Node.js WebApp for the operational side of the Sport Athlete Management system. It follows the product-separation pattern of `GithubLarsKomo/grilling`: a dedicated product repository, static responsive frontend, small Node server, Docker/Coolify deployment and explicit runtime status. Unlike Grilling, this application stores longitudinal health-adjacent athlete data and therefore requires a real trusted authentication boundary.

## Architectural boundary

`GithubLarsKomo/skillz` owns sport-science reasoning, versioned contracts, safety rules and evaluation. This repository owns UI, authentication, API, MariaDB persistence, audit history and deployment. Canonical P0, P1 and P2 contracts are copied into `contracts/` with provenance in `contracts/PROVENANCE.md`.

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

## P1 specialist artifacts

Supported P1 artifact types are:

- `strength_power_plan`
- `endurance_plan`
- `recovery_state`
- `fueling_plan`
- `energy_availability_risk`
- `rehab_progression`
- `return_after_illness_plan`
- `testing_plan`
- `adaptation_analysis`

## P2 context artifacts

Supported P2 artifact types are:

- `performance_psychology_plan`
- `mental_health_routing`
- `training_music_profile`
- `environment_adjustment`

P1 and P2 use the same generic `specialist_artifacts` table. The application assigns a product-side `artifact_version` for each athlete/type pair while preserving the canonical Skillz payload. Athlete-facing APIs are read-only. P2 artifacts cannot contain direct plan patches; mental-health `urgent` routing must pause performance optimization and require immediate support routing; music BPM is descriptive only; jet-lag artifacts require a concrete circadian strategy.

## Specialist reasoning producer

Generation is server-to-server only. Configure:

```text
SPECIALIST_SERVICE_SHARED_SECRET=<at least 32 random characters>
SPECIALIST_SERVICE_SECRET_HEADER=x-sam-specialist-secret
SKILLZ_SPECIALIST_URL=http://skillz-runtime.internal/reason
SKILLZ_SPECIALIST_TOKEN=<runtime bearer token if required>
SKILLZ_SPECIALIST_TIMEOUT_MS=15000
SKILLZ_SOURCE_REVISION=<deployed skillz commit>
```

`POST /api/v1/internal/specialists/generate` accepts only `athlete_id`, a known trigger and optionally `requested_types` for an explicit request. The client cannot submit its own snapshot. The product rebuilds the authoritative snapshot from MariaDB and routes only required specialists.

Examples of trigger routing:

- `injury_state_changed` → rehabilitation only
- `illness_state_changed` → return-after-illness only
- `mental_health_concern` → mental-health routing only
- `travel_context_changed` → environment/travel only
- `key_session_completed` → recovery + longitudinal adaptation analysis
- `explicit_specialist_request` → exactly the validated requested types

Each attempt creates `specialist_reasoning_runs`. Generated artifacts reference the run and retain `skill`, artifact type/layer, contract version, Skillz revision, runtime, model and provider provenance. Details are in [`deploy/SPECIALIST-REASONING-RUNTIME.md`](deploy/SPECIALIST-REASONING-RUNTIME.md).

The previous `P1_INGEST_*` configuration and `/api/v1/internal/p1/artifacts/{type}` route remain supported for compatibility. New integrations should use `SPECIALIST_SERVICE_*` and `/api/v1/internal/specialists/artifacts/{type}`.

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

Use the `Dockerfile`, provision MariaDB 11.8 and put the athlete-facing application behind Authentik or an equivalent trusted proxy. Production configuration fails closed when HTTPS `PUBLIC_ORIGIN`, `DB_PASSWORD`, or a proxy shared secret of at least 32 characters is missing. The specialist service secret is independent from the browser/Auth proxy secret and must never be exposed to frontend code.

Prefer private service networking for the specialist runtime and internal producer/ingest endpoints. The base deployment runbook is in [`deploy/COOLIFY-AUTHENTIK.md`](deploy/COOLIFY-AUTHENTIK.md); specialist runtime details are in [`deploy/SPECIALIST-REASONING-RUNTIME.md`](deploy/SPECIALIST-REASONING-RUNTIME.md).

Before routing traffic to a new release:

```bash
npm run migrate
npm run ready
```

The Docker health check executes the same database-readiness probe.

## API

Athlete-facing:

- `GET /healthz`
- `GET /api/v1/me`
- `GET|PUT /api/v1/athlete/profile`
- `GET|POST /api/v1/goals`
- `GET /api/v1/context`
- `PUT /api/v1/planning/active`
- `GET /api/v1/training/today`
- `GET /api/v1/training/week?from=YYYY-MM-DD`
- `GET /api/v1/checkins/today`
- `POST /api/v1/checkins`
- `POST /api/v1/sessions/:id/complete`
- `POST /api/v1/adaptation/evaluate`
- `POST /api/v1/adaptation/{id}/apply`
- `GET /api/v1/adaptation/latest`
- `GET /api/v1/adaptation/history`
- `GET /api/v1/p1/types`
- `GET /api/v1/p1/artifacts/latest`
- `GET /api/v1/p1/artifacts/{type}`
- `GET /api/v1/p1/artifacts/{type}/history?limit=20`
- `GET /api/v1/p2/types`
- `GET /api/v1/p2/artifacts/latest`
- `GET /api/v1/p2/artifacts/{type}`
- `GET /api/v1/p2/artifacts/{type}/history?limit=20`

Private service-to-service:

- `POST /api/v1/internal/specialists/generate`
- `POST /api/v1/internal/specialists/artifacts/{type}`
- `POST /api/v1/internal/p1/artifacts/{type}` — legacy P1-compatible alias

## Plan lifecycle

The app accepts a versioned active planning package through `PUT /api/v1/planning/active`; see `examples/plan-package.example.json`. IDs and versions are preserved so stale imports cannot silently overwrite newer local session revisions or finalized sessions.

An external Skillz adaptation decision may propose a `revised_plan` command for a `planned_session`. The proposal is stored first and only changes the plan through the explicit `/api/v1/adaptation/{id}/apply` endpoint. Applying it checks athlete ownership and `expected_version`, increments the session version, writes `training_plan_revisions`, marks the decision as applied and records an audit event.

Current specialist artifacts are included in the adaptation input snapshot when available. They provide specialist evidence/context; they do not bypass the central adaptation engine or cause automatic plan mutation by themselves.

Database migrations are ordered and hash-tracked in `schema_migrations`; editing an already applied migration causes deployment to fail instead of silently drifting the schema.

## Safety and privacy

- No opaque readiness score controls training.
- No automatic medical diagnosis or clearance is implemented in the product layer.
- Missing P0 adaptation reasoning produces `review_required`; missing specialist reasoning produces a failed run and no invented artifact.
- P1/P2 athlete-facing APIs are read-only; specialist writes/generation require the independent internal service secret.
- The product, not the caller/runtime, is authoritative for athlete identity.
- Specialist snapshots are minimized by artifact type before transmission to the external reasoning runtime.
- Mental-health routing is non-diagnostic and can leave the performance loop on urgent safety concerns.
- P2 artifacts cannot mutate a training plan directly.
- Every mutation and reasoning run is audit-traceable.
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
