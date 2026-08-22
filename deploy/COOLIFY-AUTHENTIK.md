# Coolify + Authentik deployment runbook

This runbook deploys the Sport Athlete Management App as a private application service behind a trusted authentication boundary. The application stores longitudinal health-adjacent athlete data; do not use the simple token pattern from the Grilling app.

## 1. Target topology

```text
Internet
  -> TLS / public reverse proxy
  -> Authentik authentication / forward-auth decision
  -> trusted proxy hop that strips and re-injects identity headers
  -> sport-athlete-management-app:3000
       -> MariaDB 11.8 on the private Coolify network
       -> optional Skillz adaptation service on a trusted endpoint
```

The application container must not have a second unauthenticated public route. Client-supplied `x-authentik-*` or `x-sam-proxy-secret` headers must be removed at the public edge before the trusted values are inserted.

## 2. Coolify application

Create a new application from `GithubLarsKomo/sport-athlete-management-app` and use the repository `Dockerfile`.

Runtime port: `3000`.

Create or attach a MariaDB **11.8** resource on the same private Coolify network. Use a dedicated database and user. Do not publish the database port to the Internet.

Set production variables in Coolify, not in Git:

```text
NODE_ENV=production
APP_STATUS=active
PUBLIC_ORIGIN=https://<training-domain>

DB_HOST=<private-mariadb-service-name>
DB_PORT=3306
DB_NAME=sport_athlete
DB_USER=<dedicated-user>
DB_PASSWORD=<random-database-password>
DB_CONNECTION_LIMIT=5

AUTH_MODE=proxy
AUTH_PROXY_SHARED_SECRET=<at-least-32-random-characters>
AUTH_PROXY_SECRET_HEADER=x-sam-proxy-secret
AUTH_SUBJECT_HEADER=x-authentik-uid
AUTH_EMAIL_HEADER=x-authentik-email
AUTH_NAME_HEADER=x-authentik-name

SKILLZ_ADAPTATION_URL=<optional-trusted-reasoning-endpoint>
SKILLZ_ADAPTATION_TOKEN=<optional-token>
SKILLZ_ADAPTATION_TIMEOUT_MS=5000
```

Production startup intentionally fails when `PUBLIC_ORIGIN`, `DB_PASSWORD`, or a sufficiently long proxy shared secret is missing.

## 3. Database migrations

Run migrations after the database is reachable and before production traffic reaches a new application version:

```bash
npm run migrate
```

Use the Coolify pre-deploy/one-off command mechanism available in the installed version. Do not run multiple concurrent migration jobs. Applied migrations are SHA-256 tracked in `schema_migrations`; a changed historical migration fails rather than silently drifting production state.

After migration, verify:

```bash
npm run ready
```

The Docker health check performs the same database-readiness probe.

## 4. Authentik boundary

Create an Authentik application/provider for the training application and require authentication before traffic is forwarded to the app.

The final trusted proxy hop must:

1. reject unauthenticated requests;
2. strip inbound `x-sam-proxy-secret` and all configured identity headers supplied by the client;
3. inject the configured `AUTH_PROXY_SHARED_SECRET` value;
4. inject a stable Authentik subject into `x-authentik-uid`;
5. optionally inject email and display name;
6. forward the request only to the private application service.

The application verifies the shared secret with a timing-safe comparison. The Authentik subject becomes the stable `athlete_id`; changing the subject mapping later would create a new athlete identity.

## 5. Public origin and CSRF boundary

`PUBLIC_ORIGIN` must be the exact HTTPS origin, without path, query or fragment. Browser writes with a foreign `Origin` or `Sec-Fetch-Site: cross-site` are rejected before authentication or persistence.

Example:

```text
PUBLIC_ORIGIN=https://training.example.com
```

Do not set `PUBLIC_ORIGIN` to an internal container URL.

## 6. Skillz reasoning service

The WebApp does not reproduce sport-science reasoning. If `SKILLZ_ADAPTATION_URL` is configured, the application sends the authoritative snapshot to that service and stores the returned decision. The product layer preserves athlete identity and audit input; the remote service cannot replace them.

If the reasoning service is missing or fails, the application records a conservative `YELLOW / review_required` result instead of inventing a plan change.

Keep the reasoning service private where possible. If it is reached over a network boundary, use HTTPS and a separate token.

## 7. Deployment verification

Before exposing the route to athletes:

```bash
npm run migrate
npm run ready
```

Then verify through the authenticated public route:

- profile read/write works;
- Morning Check can be saved;
- the weekly plan renders;
- completing a test session creates exactly one completion;
- an adaptation proposal is visible but does **not** modify the plan automatically;
- applying a supported revision requires explicit confirmation and increments the session version;
- a second application attempt is rejected;
- direct access to the application container without the trusted proxy secret is impossible.

## 8. Backup and privacy baseline

Before real longitudinal athlete data is stored:

- enable encrypted MariaDB backups and test restoration;
- define retention/deletion rules;
- restrict Coolify/DB access to administrators who need it;
- keep production secrets only in the deployment secret store;
- review logs so identity/health payloads are not emitted unnecessarily;
- document data export/deletion procedures for athletes;
- complete the GDPR and software-boundary review before broader multi-user use.

## 9. Rollback

Application releases are stateless apart from MariaDB. Roll back the application image/commit independently, but **do not** edit or reverse historical migration files. If a schema rollback is required, add a new forward migration that restores compatibility deliberately.
