# Activity Journal Ingestion v1

## Purpose

The journal models one real training session as one canonical `activity`, even when several devices or services recorded it. Garmin, Concept2 and RP3 are stored as source records with their own provenance and raw payload; they are not independent journal sessions merely because they have different provider IDs.

## Supported input paths

| Provider | v1 input | Notes |
|---|---|---|
| Garmin | FIT upload, TCX upload | FIT is decoded with Garmin's official JavaScript FIT SDK. |
| Concept2 | Logbook API sync; single-result API for testing/import tooling | Incremental sync uses `updated_after` plus an overlap window. |
| RP3 | JSON, CSV, TCX upload | Raw export remains preserved and stroke/sample data is retained where available. |

The provider adapter returns a common normalized activity envelope before persistence.

## Identity and exact deduplication

Each source record preserves:

- athlete ID;
- provider;
- provider external activity ID when available;
- SHA-256 of the imported source data;
- provider start/end timestamps;
- normalized summary, intervals and bounded samples;
- raw source payload/provenance.

Exact imports are idempotent through two independent uniqueness boundaries:

```text
(athlete_id, provider, external_activity_id)
(athlete_id, provider, raw_sha256)
```

A repeated Concept2 sync or repeated upload of the same Garmin/RP3 file therefore returns the existing activity rather than creating a new journal row.

## Cross-provider matching

When the provider identity is different, the importer compares the incoming source with nearby canonical activities using:

- compatible activity type;
- start-time proximity;
- temporal overlap;
- duration similarity;
- distance similarity.

The match score is deliberately not a database identity. It is evidence for linking two provider records to one real activity.

Default behavior:

```text
normal providers: score >= 0.90 -> automatic merge
complementary indoor-rowing sources: score >= 0.82 -> automatic merge
score >= 0.70 below auto threshold -> review candidate
otherwise -> separate activity
```

For indoor rowing, Garmin versus Concept2/RP3 is considered complementary because a watch commonly contributes physiology while the ergometer contributes rowing mechanics. The lower automatic threshold applies only when the activity type is rowing-compatible and one side is an ergometer source.

Review candidates remain separate until explicitly merged. The UI exposes the candidate and score; no raw source is deleted by a merge.

## Canonical metric precedence

Source records are immutable evidence; canonical display values are recomputed from them.

For `indoor_rowing`:

| Metric | Preferred source order |
|---|---|
| duration, distance | Concept2 -> RP3 -> Garmin -> manual |
| power, stroke rate | Concept2 -> RP3 -> Garmin -> manual |
| drag factor | Concept2 -> RP3 -> Garmin |
| average/max heart rate | Garmin -> Concept2 -> RP3 -> manual |
| ascent/GPS-derived context | Garmin |

For other activities Garmin is the default first source in v1.

A canonical value never removes the conflicting provider value. Reprocessing can therefore change display precedence without rewriting provenance.

## Planned-session matching

A newly created activity may link to an unfinished `planned_session` when its start time and duration are reasonably compatible. This link does not finalize the planned session.

The journal remains the human-control boundary:

1. device/service data is imported;
2. the app links or deduplicates it;
3. the athlete supplies RPE and optional pain/comment/deviations;
4. finalizing the journal entry creates exactly one `completed_session`;
5. if a planned session was linked, that plan item becomes completed;
6. an unplanned activity also becomes a `completed_session`, with `planned_session_id = NULL`, so it still informs later adaptation.

This prevents a device import from silently inventing subjective RPE while ensuring spontaneous training is not omitted from training history.

## Concept2 sync

The server uses the official Concept2 Logbook results endpoint with a read token. For a personal single-user deployment, `CONCEPT2_ACCESS_TOKEN` can be supplied as a deployment secret. A future multi-user OAuth flow can store per-athlete credentials without changing the activity/source model.

The application stores an `updated_after` cursor. Each successful sync moves the cursor to slightly before sync start time. That overlap is intentional: provider records updated near the boundary may be returned twice, while exact source deduplication makes the repeated delivery harmless.

The cursor advances only when all fetched results were processed successfully.

## File import boundary

Browser file import uses the authenticated same-origin API.

- FIT: maximum decoded source size 12 MiB; transported as base64 inside a bounded request.
- JSON/CSV/TCX: parsed server-side.
- RP3 sample/stroke arrays are bounded before persistence to avoid unbounded imports.
- Import files and provider payloads may contain location and physiological data and therefore follow the same privacy/access controls as the rest of the athlete database.

## APIs

```text
GET  /api/v1/import/status
POST /api/v1/import/file
POST /api/v1/import/concept2/result
POST /api/v1/import/concept2/sync
GET  /api/v1/journal
PUT  /api/v1/journal/{activity_id}
POST /api/v1/journal/{target_activity_id}/merge
```

`POST /api/v1/import/concept2/result` exists primarily for controlled import/testing. Normal use is the incremental sync endpoint.

## Non-goals for v1

- Garmin Connect cloud API authorization;
- automatic RP3 Portal cloud synchronization;
- deleting provider evidence after a merge;
- automatic journal finalization without athlete RPE;
- storing arbitrary unlimited high-frequency streams in PostgreSQL;
- using Strava as the canonical source of truth.

Garmin Connect API and RP3 cloud adapters can be added later as additional source adapters without changing journal identity or dedupe semantics.
