# Canonical Skillz training-plan import

Status: v1 implementation contract for VI-002 / GitHub #22.

## Ownership boundary

Skillz remains the source of truth for sport-science planning semantics. The WebApp does not regenerate, reinterpret or improve prescriptions during import. It validates the canonical artifacts, stores the complete bundle immutably, and projects the current season/mesocycle/microcycle/sessions into the existing operational planning tables.

The canonical producer is:

- repository: `GithubLarsKomo/skillz`
- workflow: `sport-training-plan-workflow`
- contract version: `0.1.0`
- canonical output: `sport-training-plan.json`

## Transport envelope

The browser/API transport is intentionally separate from the canonical artifacts:

```json
{
  "schema_version": 1,
  "kind": "sport-training-plan-import",
  "producer": {
    "repository": "GithubLarsKomo/skillz",
    "workflow": "sport-training-plan-workflow",
    "contract_version": "0.1.0",
    "source_ref": "commit-or-artifact-reference"
  },
  "files": {
    "sport-training-plan.json": {},
    "sport-season-plan.json": {},
    "sport-mesocycle.json": {},
    "sport-microcycle.json": {}
  }
}
```

The `files` values are the unchanged canonical JSON artifacts. Additional transport-only companion files may be present and are retained in the immutable bundle. The four files above are required for v1 activation because the operational database needs an explicit season → mesocycle → microcycle → session hierarchy.

A reduced-context `seasonPlanRef` is therefore not activated by this v1 importer unless a canonical `sport-season-plan.json` companion is supplied.

## Validation

Before any persistence, the API checks:

- import envelope and producer identity/version;
- canonical common-envelope fields;
- one consistent `athlete_id` across the four artifacts;
- canonical references from `sport-training-plan.json`;
- season/mesocycle/microcycle IDs and date containment;
- canonical planned-session fields;
- unique `planned_session_id` values;
- duration/RPE/intensity/stop/flexibility/item structure;
- authenticated target athlete equals canonical `athlete_id`.

Invalid bundles return HTTP 422 and do not mutate planning state.

## Projection into operational planning

The import uses the canonical `sport-microcycle.json.sessions` collection as the authoritative session source. It does **not** infer session prescriptions from `weeks[]`.

Projection rules are technical only:

- canonical `season_id`, `mesocycle_id`, `microcycle_id`, and `planned_session_id` remain stable database IDs;
- the canonical season name falls back to `season_id` when no display name exists;
- the operational season status falls back to `planned` when the canonical artifact does not carry one;
- session `local_date` is taken from the date component of canonical `planned_start`;
- session `intensity_rule`, `stop_rule`, `flexibility` and `items` are preserved in the session payload;
- complete canonical season/mesocycle/microcycle/session payloads remain stored unchanged in JSONB;
- within the imported microcycle, the canonical session list is authoritative for **open** operational sessions: planned/modified sessions omitted by a changed canonical plan are removed from the current projection but remain recoverable in the immutable prior import revision.

Existing finalized sessions are never overwritten or removed by a later plan import. Canonical planned sessions do not carry an independent source version, so an accepted changed canonical plan advances the existing **operational** session version instead of downgrading or rejecting an already adapted open session.

## Hashing and revisions

The SHA-256 content hash is calculated from a deterministic key-sorted serialization of the complete `files` object. Producer transport metadata is not part of the content hash.

Consequences:

- same canonical file content → same hash → idempotent success, no new revision;
- changed canonical file content → different hash → new immutable plan-import revision;
- every revision stores the full received bundle, producer metadata, source references, actor and superseded import ID;
- the current operational projection can change, but prior imported bundles remain inspectable.

The database enforces one hash and one revision number per athlete. Import sequencing is serialized with an athlete-scoped PostgreSQL advisory transaction lock.

## API

```text
POST /api/v1/planning/import
GET  /api/v1/planning/imports?limit=8
```

Both Athlete and explicitly assigned Coach use the normal authenticated athlete scope. An unassigned Coach receives 403 before persistence. The POST endpoint returns 201 for a new revision and 200 with `disposition: "unchanged"` for an identical re-import.

The history endpoint exposes revision, SHA-256 hash, producer/source provenance, actor, superseded revision reference and import time. It does not return the entire stored bundle.

## Compatibility

`PUT /api/v1/planning/active` remains available for the pre-existing internal plan-package contract during migration. It is not the canonical Skillz bundle endpoint and does not create canonical import revisions.

## Evidence required for VI-002

- unit tests for canonical validation, normalization and deterministic hashing;
- HTTP tests for 422, athlete mismatch, valid import/history and unassigned-Coach 403;
- PostgreSQL integration test proving identical re-import is idempotent and changed content creates revision 2 while revision 1 remains unchanged;
- GitHub-hosted CI green on the exact review head.
