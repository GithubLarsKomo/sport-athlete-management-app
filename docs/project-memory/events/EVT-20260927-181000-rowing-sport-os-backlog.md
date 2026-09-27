---
id: EVT-20260927-181000-rowing-sport-os-backlog
type: project-event
project: rowing-sport-os-journal
stage: backlog
status: completed
date: 2026-09-27T18:10:00+02:00
source_skill: spec-to-vertical-issues
repository: GithubLarsKomo/sport-athlete-management-app
head_sha: f77e7dc06e95ae5eed50483f5b399505341efbd7
previous_event: EVT-20260927-180200-rowing-sport-os-spec-approved
inputs:
  - ../../../SPEC.md
  - ../../spec/rowing-sport-os-journal-v1-consistency-report.md
outputs:
  - ../../backlog/rowing-sport-os-journal-v1-vertical-issues.json
  - ../../backlog/rowing-sport-os-journal-v1-vertical-issues.md
  - ../../backlog/rowing-sport-os-journal-v1-dependency-order.json
tags:
  - project-memory
  - stage/backlog
  - rowing-sport-os
---

# Context

The explicitly approved `SPEC.md@0.1.0` was sliced into independently reviewable vertical implementation issues.

# Result

Seven vertical issues cover all v1 requirement IDs with no unresolved blocker:

- VI-001 -> GitHub #21 — Coach↔Athlete authorization
- VI-002 -> GitHub #22 — canonical Skillz plan import/revisions
- VI-003 -> GitHub #23 — FIT/manual journal convergence + Soll/Ist
- VI-004 -> GitHub #24 — RowErg/bike performance testing
- VI-005 -> GitHub #25 — deterministic adaptation handoff/proposal apply
- VI-006 -> GitHub #26 — athlete export/privacy rollout gate
- VI-007 -> GitHub #27 — Hetzner/AuthentiK production deployment

The dependency graph is acyclic. VI-001 is the first implementation slice. After VI-001, VI-002 and VI-004 can proceed independently; VI-003 follows authorization + plan import; VI-005 requires plan/journal/testing; VI-006 closes portability/privacy; VI-007 closes production deployment.

# Evidence

Approved specification main ref: `bd9b06bc19e41c197ce81b906ce0d4921bfb8e57`.

Backlog artifact head before this event: `f77e7dc06e95ae5eed50483f5b399505341efbd7`.

# Open loops

Implementation has not started.

# Next action

Implement GitHub issue #21 / VI-001 through the software iteration workflow.
