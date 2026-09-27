# Journal completion and plan-vs-actual

Status: v1 implementation contract for VI-003 / GitHub #23.

## Canonical completion model

The WebApp maintains three distinct layers:

1. **planned session** — canonical Skillz prescription;
2. **activity evidence** — one real activity with one or more immutable provider sources;
3. **completed session** — the canonical finalized training outcome with Athlete-authored subjective data.

Device import can link evidence to a planned or completed session, but import alone never invents or finalizes Session-RPE, expectation match, pain, deviation reasons or Athlete comment.

Manual completion and imported-activity finalization converge on exactly one `completed_session`. A late device import is attached to the existing completion by time/duration matching and does not require a second subjective finalization.

## Subjective v1 contract

Athlete post-session input supports:

- Session-RPE 0–10; required for finalization;
- expectation match: `easier | as_expected | harder`;
- optional pain 0–10;
- zero or more structured deviations:
  `time_constraint, weather_environment, fatigue, pain, illness, equipment, intentionally_modified, external_interruption, other`;
- optional Athlete comment.

Morning Check fields such as fatigue, soreness and motivation remain separate and are not duplicated as mandatory post-session fields.

Athlete-authored journal rows retain `authored_by_subject`. Manual completed-session payloads retain `athlete_authored_by_subject`. After a subjective finalization the UI renders the Athlete data read-only; later device sources may still attach as provenance.

## Coach boundary

An assigned Coach may read the Athlete journal and Soll/Ist view. Coach privilege cannot write Athlete subjective fields.

Coach observations use the separate `coach_session_notes` table and:

```text
PUT /api/v1/completed-sessions/{completed_session_id}/coach-note
```

Each note retains its Coach subject. The unique key is `completed_session_id + authored_by_subject`, so different Coaches can retain distinct notes and one Coach can update only their own note record.

## Late device attachment

During every activity import, including an exact re-import, an activity without a `completed_session_id` is compared with existing completions for the Athlete. A compatible completion is linked immediately.

This attachment:

- does not create a second completion;
- does not set journal finalization;
- may restore the canonical planned-session link from the matched completion;
- keeps every provider source independently stored.

## Soll/Ist read model

```text
GET /api/v1/training/week-comparison?from=YYYY-MM-DD
```

The response provides:

- planned-session identity, date, objective, duration, planned RPE, intensity/stop rule, flexibility and structured items;
- actual completion identity, duration, RPE and completion status;
- observed distance, power, HR, stroke rate, pace/work and interval evidence where available;
- expectation match, deviations, pain, Athlete comment and Athlete author;
- provider/source provenance;
- separate Coach notes;
- unplanned completed sessions in the week;
- explicit weekly aggregates for planned/completed counts, duration and mean RPE.

There is intentionally **no opaque compliance score**.

## Compatibility

Existing FIT/TCX, Concept2 and RP3 normalization/deduplication remain unchanged. Existing journal and manual completion routes remain available. Migration 008 is additive; historical journal rows may have null authorship/expectation values.

## Evidence required for VI-003

- repeated provider import remains idempotent;
- late import links to a manual completion without creating another completion;
- device import never creates subjective finalization;
- imported and manual completion paths preserve Athlete-authored subjective fields;
- unassigned Coach cannot read another Athlete journal;
- assigned Coach writes only separate Coach notes;
- session/week Soll/Ist returns plan, actual, subjective and provenance data;
- GitHub-hosted PostgreSQL integration, migration/readiness, syntax and Docker checks pass.
