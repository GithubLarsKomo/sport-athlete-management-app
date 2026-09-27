# Rowing Sport OS / Sport Journal — Project Memory

Status: active  
Repository: `GithubLarsKomo/sport-athlete-management-app`

## Goal

Deliver a Hetzner-hosted, Authentik-protected longitudinal training journal for athletes and explicitly assigned coaches that imports canonical Skillz plans, records plan-vs-actual training and subjective response, ingests FIT/device evidence, stores performance tests and supports deterministic adaptation handoff before later embedded LLM integration.

## Current status

Grilling, Wayfinding and specification are complete. `SPEC.md@0.1.0` is approved. VI-001/#21, VI-002/#22 and VI-003/#23 are reviewed, merged and closed; main CI is green. VI-004/#24 is the active critical-path increment.

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
- [Latest event](events/EVT-20260927-224800-vi-003-delivered.md)

## Canonical project artifacts

- [SPEC.md](../../SPEC.md)
- [Consistency report](../spec/rowing-sport-os-journal-v1-consistency-report.md)
- [Grilling report](../requirements/rowing-sport-os-journal-v1-GRILL-REPORT.md)
- [Requirements handoff](../requirements/rowing-sport-os-journal-v1-requirements-handoff.json)
- [Wayfinding brief](../wayfinding/rowing-sport-os-journal-v1-gap-audit.md)
- [DEC-001 Coach v1](decisions/DEC-001-coach-first-class-v1.md)
- [DEC-002 Manual-first adaptation](decisions/DEC-002-manual-first-adaptation.md)

## Backlog

- [Vertical issues](../backlog/rowing-sport-os-journal-v1-vertical-issues.md)
- [Dependency order](../backlog/rowing-sport-os-journal-v1-dependency-order.json)
- VI-001 → GitHub #21 — **delivered**
- VI-002 → GitHub #22 — **delivered**
- VI-003 → GitHub #23 — **delivered**
- VI-004 → GitHub #24
- VI-005 → GitHub #25
- VI-006 → GitHub #26
- VI-007 → GitHub #27

## Delivered increments

### VI-001 / GitHub #21

- PR #29
- merge: `a5915db7d7c2f67e6466f7079c01f0b3e90d0199`
- main CI: `36334503326` success
- [Implementation evidence](../engineering/vi-001/implementation-evidence.json)
- review decision: PASS / PASS WITH NOTES
- issue state: completed

### VI-002 / GitHub #22

- PR #31
- reviewed head: `5f8bcb92383c259c4ae23656e03465b879172eff`
- merge: `37e45c8298da64b9810e0b36147cc11449021470`
- review-head CI: `36339091164` success
- main CI: `36339192684` success
- [Delivery status](../engineering/vi-002/engineering-delivery-status.json)
- review decision: PASS / PASS WITH NOTES
- issue state: completed

### VI-003 / GitHub #23

- PR #33
- reviewed head: `8f6f0148ae5c460613cb29c33af965de3dd4cc3f`
- merge: `50acab4696854c94e9ceb2142d15f50ea154e746`
- review-head CI: `36349249828` success
- main CI: `36349327148` success
- [Delivery status](../engineering/vi-003/engineering-delivery-status.json)
- review decision: PASS / PASS WITH NOTES
- issue state: completed

## Current engineering increment

VI-004 / GitHub #24 — structured RowErg and bike performance testing with explicit measurement class.

## Open loop

Implement and review VI-004.

## Next step

Start VI-004 from current main.
