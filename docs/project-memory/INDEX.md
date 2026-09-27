# Rowing Sport OS / Sport Journal — Project Memory

Status: active  
Repository: `GithubLarsKomo/sport-athlete-management-app`

## Goal

Deliver a Hetzner-hosted, Authentik-protected longitudinal training journal for athletes and explicitly assigned coaches that imports canonical Skillz plans, records plan-vs-actual training and subjective response, ingests FIT/device evidence, stores performance tests and supports deterministic adaptation handoff before later embedded LLM integration.

## Current status

Grilling and technical Wayfinding are complete. `SPEC.md@0.1.0` has been generated and passed its consistency check. The specification is **approved**; vertical issue slicing is released.

Confirmed v1 additions include:
- Coach as first-class user with explicit Athlete assignment;
- post-session RPE + expectation match + pain/deviation/comment;
- RowErg 500 m, 1k, 2k, 5k and 30 min tests;
- RowErg and bike lactate tests plus configurable staged protocol;
- self-service data export;
- contract-only Athlete Second-Brain preparation.

## Current state

- [state.json](state.json)
- [Timeline](TIMELINE.md)
- [Latest event](events/EVT-20260927-180200-rowing-sport-os-spec-approved.md)

## Canonical project artifacts

- [SPEC.md](../../SPEC.md)
- [Consistency report](../spec/rowing-sport-os-journal-v1-consistency-report.md)
- [Grilling report](../requirements/rowing-sport-os-journal-v1-GRILL-REPORT.md)
- [Requirements handoff](../requirements/rowing-sport-os-journal-v1-requirements-handoff.json)
- [Wayfinding brief](../wayfinding/rowing-sport-os-journal-v1-gap-audit.md)
- [DEC-001 Coach v1](decisions/DEC-001-coach-first-class-v1.md)
- [DEC-002 Manual-first adaptation](decisions/DEC-002-manual-first-adaptation.md)

## Open loops

None at the specification stage.

## Next step

Run `spec-to-vertical-issues`, persist the backlog artifacts and create the GitHub implementation issues in dependency order.
