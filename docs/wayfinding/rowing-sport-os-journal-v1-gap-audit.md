# Rowing Sport OS / Sport Journal v1 — Wayfinding Brief

Status: completed technical gap audit; product decisions pending Grilling R1  
Repository baseline: `b7d63b7c13e6e86b5ec43d84fa8009bdaf5e5005`  
Source workflow: `large-work-wayfinder`  
Date: 2026-09-27

## Goal

Extend the existing Sport Athlete Management App into the first deployable Rowing Sport OS / Sport Journal at `sportjournal.ratzeburg-ai.de`, reusing the existing operational model rather than creating a parallel application or data store.

## Verified facts

1. **Operational producer already exists.** The repository owns the WebApp, PostgreSQL persistence, authentication boundary, planning state, journal/device ingestion, adaptation history and deployment.
2. **Authentik boundary already exists.** Production is designed for Authentik/Traefik trusted proxy authentication with a stable subject mapped to the internal athlete identity. Direct unauthenticated container access is explicitly prohibited.
3. **Current authorization is athlete-self only.** `resolveIdentity()` maps one authenticated subject to one `athleteId`. There is no coach assignment, role table or cross-athlete authorization model.
4. **Planning persistence already exists.** Season, mesocycle, microcycle and planned-session tables are versioned and mutable through an audited plan package path.
5. **Plan input is not yet the canonical Skillz one-shot plan.** The current API accepts an app-local `schema_version: 1` package with `season`, `mesocycle`, `microcycle` and `sessions`; it does not directly ingest `sport-training-plan.json`.
6. **Journal and device ingestion are already substantial.** Garmin FIT/TCX, Concept2 and RP3 imports normalize into one canonical activity timeline with immutable provider provenance and idempotent deduplication.
7. **Subjective completion exists but needs product shaping.** Session RPE, pain, deviations and comments are already persisted. The current imported-activity UI sends an empty deviations array and does not yet capture perceived-vs-expected difficulty or structured deviation reasons.
8. **Soll/Ist linkage exists structurally.** Imported activities may link to a planned session and finalization creates exactly one `completed_session`, but there is no dedicated plan-vs-actual comparison surface across session/week/block.
9. **Performance testing is not yet a first-class domain.** No dedicated test protocol/result persistence, lactate stage model, test planning UI or test-result handoff exists.
10. **Manual/LLM adaptation boundary exists.** Adaptation decisions are stored separately, are not applied automatically, and applying a supported revision requires an explicit action. The present adapter is service-oriented; there is no manual export/import handoff package for external LLM use.
11. **Garmin cloud health/activity sync is not implemented.** Architecture and guardrails exist; FIT upload is implemented. Cloud APIs remain a later adapter.
12. **Deployment runbook already supports Hetzner/Coolify + Authentik + private PostgreSQL.** The concrete public origin and deployment instance are not yet verified for `sportjournal.ratzeburg-ai.de`.
13. **No athlete-specific Second-Brain write path exists in the app.** This is desirable for v1: raw telemetry stays in PostgreSQL; only later evidence-backed learnings should cross a governed promotion boundary.
14. **Self-service export/deletion is not implemented.** The deployment runbook already treats retention/deletion/export as a production privacy gate.

## Architectural conclusion

Do **not** create a new application or parallel training schema. Extend this repository and keep the current ownership boundary:

- Skillz owns sport-science contracts, diagnostics, plan generation and adaptation reasoning.
- This application owns user-bound operational state, journal, imports, audit, plan revisions and deployment.
- Sport Performance Second Brain may later own promoted learnings, never raw telemetry.

## Required v1 vertical capabilities

### V1-A — Deployment identity boundary
- Deploy repository through Coolify.
- Public origin: `https://sportjournal.ratzeburg-ai.de`.
- Authentik proxy authentication.
- Private PostgreSQL 18.x.
- Verify no bypass route exists.

### V1-B — Canonical plan import adapter
Add a validator/adapter that accepts the canonical Skillz training-plan handoff and maps referenced season/meso/micro/session artifacts into the app's existing persistence model without redefining sport-science semantics.

Required behavior:
- schema/provenance validation before persistence;
- immutable import record with content hash and source metadata;
- idempotent re-import;
- explicit revision instead of silent overwrite;
- preserve `planned_session_id`, intensity rule, stop rule, flexibility, items and uncertainties.

### V1-C — Journal Soll/Ist
Extend the current journal instead of creating a second completion path.

Minimum comparison dimensions:
- duration;
- external load metrics available from source;
- intensity target vs observed metric(s);
- interval/item completion where available;
- session RPE vs planned RPE;
- completion status;
- structured deviations;
- perceived difficulty relative to expectation;
- pain;
- comment.

No opaque compliance/readiness score is required.

### V1-D — Performance tests
Create first-class test planning and result records.

Minimum protocol families:
- RowErg fixed-distance/time tests;
- staged RowErg lactate test;
- staged bike lactate test;
- configurable staged protocol.

Every test result must distinguish measured values, derived values and assumptions.

Lactate-stage minimum:
`stage, duration, power_or_pace, heart_rate, lactate, rpe, cadence_or_stroke_rate, comment`.

Test metadata minimum:
`device, protocol_version, warmup, environment, termination_reason, measured_or_estimated`.

### V1-E — Manual adaptation handoff
Create a deterministic export package before any embedded LLM provider.

The package must include only necessary, structured context:
- athlete/profile references;
- current plan revision;
- planned vs actual training window;
- completed sessions and subjective observations;
- performance tests;
- relevant morning checks;
- goals;
- explicit athlete comments;
- safety flags and uncertainties.

The returned adaptation artifact must be a proposal. It may not mutate the active plan until separately validated and explicitly applied.

### V1-F — FIT/UI completion
Keep Garmin FIT upload in v1 and integrate it into the same journal/Soll-Ist experience. Do not block MVP on Garmin Connect OAuth.

## Technical unknowns reduced by this audit

No exploratory spike is required for FIT ingestion, Authentik proxy authentication, PostgreSQL persistence, session finalization or explicit adaptation apply: working implementations already exist.

The remaining material unknowns are product decisions, not engineering unknowns:
- v1 user/role model;
- exact post-session subjective fields;
- built-in v1 test catalogue;
- self-service data portability boundary;
- athlete Second-Brain opt-in timing.

These are routed to the progressive Grilling `rowing-sport-os-journal-v1`.

## Risks

1. **Contract drift:** app-local planning package can diverge from Skillz canonical plan semantics unless the import adapter is explicit and versioned.
2. **Dual completion paths:** manual session completion and imported-activity finalization can create UX ambiguity unless both converge on one canonical completed-session model.
3. **Role creep:** adding Coach/Admin prematurely materially expands authorization and privacy scope.
4. **Health-data sensitivity:** training, symptoms and physiological data require strict least-privilege access, export/deletion policy and backup discipline.
5. **LLM leakage:** raw or excessive athlete history must not be sent to external models by default; the handoff must be minimized and auditable.
6. **Second-Brain duplication:** raw operational data must not be copied into Git/Markdown knowledge stores.

## Routing

Current routing target: `round-based-requirements-grilling`.

When Grilling R1 is confirmed, technical evidence is sufficient to route directly to `conversation-to-spec`. No additional broad Wayfinder pass is currently required.

## Next action

Complete the five material product decisions in Grilling definition `rowing-sport-os-journal-v1@0.1.0`, then generate the normative `SPEC.md`.
