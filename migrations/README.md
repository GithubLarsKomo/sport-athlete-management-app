# Database migrations

`migrations/postgresql/` is the active migration stream for the PostgreSQL runtime.

The SQL files that remain directly under `migrations/` are the frozen MariaDB migration history from the pre-PostgreSQL runtime. They are intentionally retained unchanged as provenance for installations created before the provider cutover. The PostgreSQL migration runner does not execute them.

Rules:

1. Never edit an applied migration in either provider history.
2. Add new PostgreSQL migrations only under `migrations/postgresql/`.
3. `scripts/migrate.mjs` hashes every PostgreSQL migration and rejects drift.
4. Provider cutover is a data migration, not a reinterpretation of the old MariaDB hashes.
5. New production deployments use PostgreSQL only.
