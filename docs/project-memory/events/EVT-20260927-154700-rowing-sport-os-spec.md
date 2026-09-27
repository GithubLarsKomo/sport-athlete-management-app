---
id: EVT-20260927-154700-rowing-sport-os-spec
type: project-event
project: rowing-sport-os-journal
stage: specification
status: approval-pending
date: 2026-09-27T15:47:00+02:00
source_skill: conversation-to-spec
repository: GithubLarsKomo/sport-athlete-management-app
head_sha: 8fb2b8380ac646ac821540e89f8cb5071361f07f
previous_event: EVT-20260927-140300-rowing-sport-os-wayfinding
inputs:
  - ../../requirements/rowing-sport-os-journal-v1-GRILL-REPORT.md
  - ../../requirements/rowing-sport-os-journal-v1-requirements-handoff.json
  - ../../wayfinding/rowing-sport-os-journal-v1-gap-audit.md
outputs:
  - ../../../SPEC.md
  - ../../spec/rowing-sport-os-journal-v1-consistency-report.md
decisions:
  - ../decisions/DEC-001-coach-first-class-v1.md
  - ../decisions/DEC-002-manual-first-adaptation.md
tags:
  - project-memory
  - stage/specification
  - rowing-sport-os
  - sport-journal
---

# Context

The focused Grilling was completed with five product decisions confirmed. Coach support is required in v1, and the fixed RowErg test catalogue was expanded with 500 m and 1,000 m protocols.

# Inputs

- completed v1 Grilling report and requirements handoff;
- technical Wayfinding audit at the previously verified repository baseline;
- existing PRODUCT/DESIGN and deployment contracts.

# Result

A complete Rowing Sport OS / Sport Journal v1 `SPEC.md@0.1.0` was created and checked for internal consistency.

The specification makes Athlete and Coach first-class users, requires explicit Coach↔Athlete assignment, adds plan-vs-actual journaling, structured RowErg/bike testing, deterministic adaptation handoff and self-service data export while keeping Garmin cloud, embedded LLM and Second-Brain writes outside MVP.

`PRODUCT.md` was aligned with the confirmed Coach scope. `DESIGN.md` remains unchanged and authoritative for the existing Sport Performance / Impeccable visual system.

# Decisions and assumptions

Accepted decisions:
- DEC-001 Coach is a first-class v1 user with explicit athlete assignment.
- DEC-002 adaptation is manual-first/proposal-only and Athlete Second-Brain writes are not enabled in v1.

Reversible assumptions:
- Coach↔Athlete assignment administration may initially be operator controlled.
- exact relational table/API names remain implementation details.
- a transport-only plan import envelope may carry canonical Skillz companion artifacts.

# Evidence

Specification/content head before this event: `8fb2b8380ac646ac821540e89f8cb5071361f07f`.

Consistency report: PASS for approval; no unresolved contradictions.

# Open loops

One workflow gate remains: explicit approval of `SPEC.md@0.1.0`.

No implementation issues may be generated until that approval is received.

# Next action

User approves or rejects `SPEC.md@0.1.0`. On approval, route immediately to `spec-to-vertical-issues`.
