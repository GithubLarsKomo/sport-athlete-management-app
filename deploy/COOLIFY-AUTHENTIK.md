# Coolify + Authentik deployment runbook

This runbook deploys the Sport Athlete Management App as a private application service behind a trusted authentication boundary. The application stores longitudinal health-adjacent athlete data; do not use the simple token pattern from the Grilling app.

## 1. Target topology

```text
Internet
  -> TLS / public reverse proxy
  -> Authentik authentication / forward-auth decision
  -> trusted proxy hop that strips and re-injects identity headers
  -> sport-athlete-management-app:3000
       -> PostgreSQL 18.x on the private Coolify/Hetzner network
       -> optional Skillz adaptation service on a trusted endpoint
```

The application container must not have a second unauthenticated public route. Client-supplied `x-authentik-*` or `x-sam-proxy-secret` headers must be removed at the public edge before the trusted values are inserted.

PostgreSQL port `5432` must not be published publicly. External administration is performed only through SSH/private-network access or an SSH tunnel to the private PostgreSQL endpoint.

## 2. Coolify application

Create a new application from `GithubLarsKomo/sport-athlete-management-app` and use the repository `Dockerfile`.

Runtime port: `3000`.

Create or attach the shared PostgreSQL **18.x** service on the same private Coolify/Hetzner network. The documented baseline is PostgreSQL 18.6. Give Sport its own database and least-privilege application role; do not reuse credentials from another application.

Recommended logical boundary:

```text
database: sport_athlete
runtime role: sport_athlete_app
```

Set production variables in Coolify, not in Git:

```text
NODE_ENV=production
APP_STATUS=active
PUBLIC_ORIGIN=https://<training-domain>

DATABASE_URL=postgresql://sport_athlete_app:<random-database-password>@<private-postgres-service-name>:5432/sport_athlete
DB_POOL_MAX=5

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

Production startup intentionally fails when `PUBLIC_ORIGIN`, a credentialed PostgreSQL `DATABASE_URL`, or a sufficiently long proxy shared secret is missing.

## 3. Database privileges

The runtime role should own or have only the privileges required on the Sport database/schema. It must not have privileges on Masters Diagnostics, Grilling or other application databases and must not be a PostgreSQL superuser.

For production environments that separate runtime and migration privileges, execute `npm run migrate` through a dedicated migration/operator role and run the application through `sport_athlete_app`. Keep both credentials in the deployment secret store.

## 4. Database migrations

Run migrations after the database is reachable and before production traffic reaches a new application version:

```bash
npm run migrate
```

Use the Coolify pre-deploy/one-off command mechanism available in the installed version. Applied PostgreSQL migrations are SHA-256 tracked in `schema_migrations`; a changed historical migration fails rather than silently drifting production state. A PostgreSQL advisory transaction lock prevents two migration jobs from racing each other.

The active migration stream is `migrations/postgresql/`. Legacy MariaDB migration files in the parent `migrations/` directory are retained as historical provenance only and are not executed.

After migration, verify:

```bash
npm run ready
```

The Docker health check performs the same database-readiness probe.

Existing installations with MariaDB data must follow [`MARIADB-TO-POSTGRESQL.md`](MARIADB-TO-POSTGRESQL.md) before switching production traffic.

## 5. Authentik boundary

Create an Authentik application/provider for the training application and require authentication before traffic is forwarded to the app.

The final trusted proxy hop must:

1. reject unauthenticated requests;
2. strip inbound `x-sam-proxy-secret` and all configured identity headers supplied by the client;
3. inject the configured `AUTH_PROXY_SHARED_SECRET` value;
4. inject a stable Authentik subject into `x-authentik-uid`;
5. optionally inject email and display name;
6. forward the request only to the private application service.

The application verifies the shared secret with a timing-safe comparison. The Authentik subject becomes the stable `athlete_id`; changing the subject mapping later would create a new athlete identity.

## 6. Public origin and CSRF boundary

`PUBLIC_ORIGIN` must be the exact HTTPS origin, without path, query or fragment. Browser writes with a foreign `Origin` or `Sec-Fetch-Site: cross-site` are rejected before authentication or persistence.

Example:

```text
PUBLIC_ORIGIN=https://training.example.com
```

Do not set `PUBLIC_ORIGIN` to an internal container URL.

## 7. Skillz reasoning service

The WebApp does not reproduce sport-science reasoning. If `SKILLZ_ADAPTATION_URL` is configured, the application sends the authoritative snapshot to that service and stores the returned decision. The product layer preserves athlete identity and audit input; the remote service cannot replace them.

If the reasoning service is missing or fails, the application records a conservative `YELLOW / review_required` result instead of inventing a plan change.

Keep the reasoning service private where possible. If it is reached over a network boundary, use HTTPS and a separate token.

## 8. Deployment verification

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

## 9. Backup and privacy baseline

Before real longitudinal athlete data is stored:

- enable encrypted PostgreSQL backups;
- verify an independent logical backup/restore for `sport_athlete`;
- define retention/deletion rules;
- restrict Coolify/PostgreSQL access to administrators who need it;
- keep production secrets only in the deployment secret store;
- review logs so identity/health payloads are not emitted unnecessarily;
- document data export/deletion procedures for athletes;
- complete the GDPR and software-boundary review before broader multi-user use.

A manual logical verification copy can be created with `pg_dump --format=custom`, but it does not replace the infrastructure backup policy or an isolated restore drill.

## 10. Rollback

Application releases are stateless apart from PostgreSQL. Roll back an application image/commit independently only when the target database schema remains compatible. Do **not** edit or reverse historical migration files; add a new forward migration if a schema compatibility correction is required.

A provider rollback after a MariaDB -> PostgreSQL cutover has additional data-consistency requirements and must follow the explicit rollback boundary in `MARIADB-TO-POSTGRESQL.md`.
