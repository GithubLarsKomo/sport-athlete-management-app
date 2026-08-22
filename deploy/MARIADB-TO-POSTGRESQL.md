# MariaDB -> PostgreSQL production cutover

This runbook moves an existing Sport Athlete Management installation from the legacy MariaDB 11.8 provider to the PostgreSQL 18.x runtime implemented by this repository.

The application does **not** dual-write. Treat the provider change as a controlled maintenance-window migration with a write freeze, reconciliation and an explicit rollback boundary.

## 1. Preconditions

Before touching production data:

- deploy/test this release against an isolated PostgreSQL 18.6 database;
- run `npm test`, `npm run check`, `npm run migrate`, `npm run ready` and `npm run test:integration` against PostgreSQL;
- provision the target `sport_athlete` database and a dedicated least-privilege application role;
- keep PostgreSQL on the private Hetzner/Coolify network; do not publish port 5432;
- take and verify a restorable MariaDB backup;
- take source row counts for every application table;
- rehearse the full migration once with a recent production copy before the live cutover.

Application tables:

```text
athletes
athlete_profiles
goals
competitions
seasons
mesocycles
microcycles
planned_sessions
daily_checkins
completed_sessions
adaptation_decisions
training_plan_revisions
audit_log
specialist_artifacts
```

`schema_migrations` is provider-specific metadata and is **not** copied from MariaDB. PostgreSQL builds its own migration ledger from `migrations/postgresql/`.

## 2. Freeze writes

Enter a maintenance window before taking the final source snapshot. Stop or otherwise block application writes to MariaDB. Do not rely on a DNS/config switch while old application instances can still write.

Record:

- source backup identifier/checksum;
- source row count per application table;
- cutover start timestamp;
- source application commit/image;
- target application commit/image.

Keep MariaDB intact and read-only through the rollback observation window.

## 3. Create the PostgreSQL schema

Point the migration command at the empty target database:

```bash
export DATABASE_URL='postgresql://sport_athlete_app:<secret>@<private-postgres-host>:5432/sport_athlete'
export DB_POOL_MAX=5
npm run migrate
npm run ready
```

Do not import the legacy MariaDB `schema_migrations` table.

## 4. Copy application data

`pgloader` supports a `data only` mode for loading data into an already-created PostgreSQL schema. Use that mode so this repository remains the authority for PostgreSQL DDL rather than allowing pgloader to reinterpret the MariaDB schema.

Create a migration-specific pgloader command file with the private source and target endpoints. Keep credentials out of Git and shell history. A minimal shape is:

```lisp
LOAD DATABASE
     FROM mysql://<source-user>:<source-secret>@<private-mariadb-host>/sport_athlete
     INTO postgresql://<migration-role>:<target-secret>@<private-postgres-host>/sport_athlete

 WITH data only, on error stop, reset sequences;
```

Run the load only after `npm run migrate` has created the target schema.

If a rehearsal shows that the loader cannot satisfy an existing foreign-key ordering, split the data-only migration into dependency-ordered table groups rather than disabling PostgreSQL constraints in the live database. The parent-first order is:

1. `athletes`
2. `athlete_profiles`, `goals`, `competitions`, `seasons`, `audit_log`
3. `mesocycles`
4. `microcycles`
5. `planned_sessions`
6. `daily_checkins`, `completed_sessions`, `adaptation_decisions`, `specialist_artifacts`
7. `training_plan_revisions`

Never use a schema-dropping pgloader option against the repository-managed PostgreSQL database.

## 5. Reconcile before traffic switch

Run the target report:

```bash
DATABASE_URL='postgresql://...' npm run reconcile > postgresql-reconciliation.json
```

The report contains a row count and SHA-256 digest of ordered primary keys for every application table. Compare its counts with the frozen MariaDB source counts. For a rehearsed migration, retain equivalent source primary-key digests as migration evidence and compare them with the PostgreSQL report.

In addition to table counts, verify these invariants directly:

```sql
-- No orphaned planned sessions.
SELECT COUNT(*) AS orphan_count
FROM planned_sessions s
LEFT JOIN athletes a ON a.id = s.athlete_id
WHERE a.id IS NULL;

-- No orphaned revision decisions.
SELECT COUNT(*) AS orphan_count
FROM training_plan_revisions r
LEFT JOIN adaptation_decisions d ON d.id = r.adaptation_decision_id
WHERE d.id IS NULL;

-- Profile versions remain unique by athlete.
SELECT athlete_id, profile_version, COUNT(*)
FROM athlete_profiles
GROUP BY athlete_id, profile_version
HAVING COUNT(*) <> 1;

-- Specialist artifact versions remain unique by athlete/type/version.
SELECT athlete_id, artifact_type, artifact_version, COUNT(*)
FROM specialist_artifacts
GROUP BY athlete_id, artifact_type, artifact_version
HAVING COUNT(*) <> 1;
```

Every orphan query must return zero and every duplicate query must return no rows.

Then run:

```bash
npm run ready
npm run test:integration
```

against the migrated target.

## 6. Create the first PostgreSQL backup

Before opening production traffic, create and retain an encrypted logical backup of the reconciled PostgreSQL database using the infrastructure backup process. For a manual verification copy:

```bash
pg_dump --format=custom --file=sport_athlete-post-cutover.dump "$DATABASE_URL"
```

Test restoration into an isolated database before declaring the provider migration complete.

## 7. Switch the application

Update the Coolify application secrets to the PostgreSQL contract:

```text
DATABASE_URL=postgresql://sport_athlete_app:<secret>@<private-postgres-host>:5432/sport_athlete
DB_POOL_MAX=5
```

Deploy exactly one application release using the PostgreSQL runtime. Confirm old MariaDB-backed instances cannot receive traffic or writes.

Smoke-test through the authenticated public route:

- profile read and append-version write;
- current context and weekly plan;
- Morning Check read/write;
- session completion;
- adaptation creation and explicit revision apply;
- P1 specialist artifact ingest/read when enabled;
- audit events for each mutation.

## 8. Rollback boundary

Before any new write is accepted on PostgreSQL, rollback is simple: restore the previous application release and its MariaDB connection, then reopen traffic.

After PostgreSQL has accepted new production writes, **do not blindly switch back to the frozen MariaDB database**. Doing so would lose or fork history. A post-write rollback requires an explicit reverse reconciliation/export plan or restoration of a consistent pre-cutover state plus replay of accepted writes.

Keep the legacy MariaDB database read-only until the agreed observation window has passed and the PostgreSQL backup/restore drill has succeeded. Decommission MariaDB only after the migration evidence is retained.

## 9. Completion evidence

The production provider cutover is complete only when the change record contains:

- source MariaDB backup/checksum;
- target PostgreSQL migration ledger and checksums;
- source and target table counts;
- reconciliation report and invariant-query results;
- successful PostgreSQL integration/smoke tests;
- first PostgreSQL backup and isolated restore evidence;
- application release/commit used for the switch;
- confirmation that MariaDB is no longer in the application runtime path.
