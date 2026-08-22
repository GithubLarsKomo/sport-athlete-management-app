# Sport Athlete Management App

Small Node.js WebApp for the operational side of the Sport Athlete Management system. It follows the product-separation pattern of `GithubLarsKomo/grilling`: a dedicated product repository, static responsive frontend, small Node server, Docker/Coolify deployment and explicit runtime status. Unlike Grilling, this application stores longitudinal health-adjacent athlete data and therefore requires a real trusted authentication boundary.

## Architectural boundary

`GithubLarsKomo/skillz` owns sport-science reasoning, versioned contracts, safety rules and evaluation. This repository owns UI, authentication, API, MariaDB persistence, audit history and deployment. The canonical contract is copied into `contracts/` with provenance in `contracts/PROVENANCE.md`.

The WebApp does **not** reimplement the sport-training adaptation engine. `POST /api/v1/adaptation/evaluate` sends the current input snapshot to `SKILLZ_ADAPTATION_URL` when configured. Without that service, the application records a conservative `YELLOW / review_required` decision and makes no automatic plan change.

## MVP vertical slice

1. authenticated athlete identity
2. athlete profile read/update
3. active goal / competition / season / mesocycle / microcycle context
4. today's planned session
5. 20–40 second morning check-in
6. completed session with duration and session RPE
7. external Skillz adaptation evaluation or safe review-required fallback
8. versioned plan-revision support
9. adaptation and audit history

## Local start

```bash
cp .env.example .env
# Export values from .env in your shell or configure them in your runtime.
npm install
npm run migrate
npm run seed:demo
AUTH_MODE=dev NODE_ENV=development npm start
```

Open `http://localhost:3000`.

## Production on Hetzner / Coolify

Use the `Dockerfile`, provision a MariaDB 11.8 service and set the DB variables. Put the app behind Authentik (or an equivalent trusted auth proxy). Configure `AUTH_MODE=proxy`, a long random `AUTH_PROXY_SHARED_SECRET`, and make the reverse proxy inject the matching header on every authenticated request.

Do **not** expose the app container directly to the public Internet when proxy-header authentication is enabled. A user-supplied header must never be enough to impersonate another athlete.

Recommended production variables:

- `NODE_ENV=production`
- `APP_STATUS=active`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `AUTH_MODE=proxy`
- `AUTH_PROXY_SHARED_SECRET`
- `AUTH_PROXY_SECRET_HEADER=x-sam-proxy-secret`
- `AUTH_SUBJECT_HEADER=x-authentik-uid`
- `AUTH_EMAIL_HEADER=x-authentik-email`
- `AUTH_NAME_HEADER=x-authentik-name`
- `SKILLZ_ADAPTATION_URL` and optionally `SKILLZ_ADAPTATION_TOKEN`

Run the migration once per release:

```bash
npm run migrate
```

## API

- `GET /healthz`
- `GET /api/v1/me`
- `GET|PUT /api/v1/athlete/profile`
- `GET|POST /api/v1/goals`
- `GET /api/v1/context`
- `GET /api/v1/training/today`
- `GET /api/v1/checkins/today`
- `POST /api/v1/checkins`
- `POST /api/v1/sessions/:id/complete`
- `POST /api/v1/adaptation/evaluate`
- `GET /api/v1/adaptation/latest`
- `GET /api/v1/adaptation/history`

## Safety and privacy

- No opaque readiness score controls training.
- No automatic medical diagnosis or clearance is implemented in the product layer.
- Missing external reasoning produces `review_required`, not invented training advice.
- Every mutation is written to `audit_log`.
- Adaptation decisions retain the input snapshot and rationale.
- Optional sex-specific and health-adjacent fields remain inside versioned profile/check-in payloads and are not required by the UI MVP.
- Before multi-user production use, complete GDPR/privacy, retention/deletion and software-boundary review.

## Checks

```bash
npm test
npm run check
```
