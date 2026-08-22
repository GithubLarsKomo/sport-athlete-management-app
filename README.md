# Sport Athlete Management App

Small Node.js WebApp for the operational side of the Sport Athlete Management system. It follows the product-separation pattern of `GithubLarsKomo/grilling`: a dedicated product repository, static responsive frontend, small Node server, Docker/Coolify deployment and explicit runtime status. Unlike Grilling, this application stores longitudinal health-adjacent athlete data and therefore requires a real trusted authentication boundary.

## Architectural boundary

`GithubLarsKomo/skillz` owns sport-science reasoning, versioned contracts, safety rules and evaluation. This repository owns UI, authentication, API, MariaDB persistence, audit history and deployment. The canonical contract is copied into `contracts/` with provenance in `contracts/PROVENANCE.md`.

The WebApp does **not** reimplement the sport-training adaptation engine. `POST /api/v1/adaptation/evaluate` sends the current input snapshot to `SKILLZ_ADAPTATION_URL` when configured. Without that service, the application records a conservative `YELLOW / review_required` decision and makes no automatic plan change.

## Current P0 workflow

1. authenticated athlete identity and profile onboarding
2. active goal / competition / season / mesocycle / microcycle context
3. versioned seven-day training view and today's planned session
4. 20–40 second morning check-in
5. completed session with duration and session RPE
6. external Skillz adaptation evaluation or safe review-required fallback
7. visible revision proposal with explicit athlete confirmation
8. version-bound plan revision and adaptation/audit history

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

Use the `Dockerfile`, provision MariaDB 11.8 and put the application behind Authentik or an equivalent trusted proxy. Production configuration fails closed when HTTPS `PUBLIC_ORIGIN`, `DB_PASSWORD`, or a proxy shared secret of at least 32 characters is missing.

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

## Plan lifecycle

The app accepts a versioned active planning package through `PUT /api/v1/planning/active`; see `examples/plan-package.example.json`. IDs and versions are preserved so stale imports cannot silently overwrite newer local session revisions or finalized sessions.

An external Skillz decision may propose a `revised_plan` command for a `planned_session`. The proposal is stored first and only changes the plan through the explicit `/api/v1/adaptation/{id}/apply` endpoint. Applying it checks athlete ownership and `expected_version`, increments the session version, writes `training_plan_revisions`, marks the decision as applied and records an audit event.

Database migrations are ordered and hash-tracked in `schema_migrations`; editing an already applied migration causes deployment to fail instead of silently drifting the schema.

## Safety and privacy

- No opaque readiness score controls training.
- No automatic medical diagnosis or clearance is implemented in the product layer.
- Missing external reasoning produces `review_required`, not invented training advice.
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
