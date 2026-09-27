---
id: EVT-20260927-140300-rowing-sport-os-wayfinding
type: project-event
project: rowing-sport-os-journal
stage: wayfinding
status: completed
date: 2026-09-27T14:03:00+02:00
source_skill: large-work-wayfinder
repository: GithubLarsKomo/sport-athlete-management-app
head_sha: b7d63b7c13e6e86b5ec43d84fa8009bdaf5e5005
inputs:
  - ../../README.md
  - ../../src/auth.mjs
  - ../../src/app.mjs
  - ../../src/domain/planning.mjs
  - ../../docs/activity-journal-ingestion.md
  - ../../deploy/COOLIFY-AUTHENTIK.md
outputs:
  - ../../docs/wayfinding/rowing-sport-os-journal-v1-gap-audit.md
  - ../../docs/wayfinding/rowing-sport-os-journal-v1-investigation-backlog.json
  - ../../docs/wayfinding/rowing-sport-os-journal-v1-dependency-graph.json
tags:
  - project-memory
  - stage/wayfinding
  - rowing-sport-os
  - sport-journal
---

# Context

The existing Sport Athlete Management App was assessed against the requested Rowing Sport OS / Sport Journal v1 scope.

# Result

The current repository remains the correct operational producer. Authentik proxy authentication, PostgreSQL persistence, versioned planning, journal ingestion and Garmin FIT support already exist. The new product should extend these capabilities rather than start a second application.

Material implementation gaps are canonical Skillz plan import, structured plan-vs-actual UX, first-class performance testing and deterministic adaptation handoff export/import.

# Decisions and assumptions

Confirmed:
- Hetzner/Coolify target;
- provisional public origin `sportjournal.ratzeburg-ai.de`;
- Authentik protection;
- manual MVP before embedded LLM;
- FIT import in MVP;
- Garmin cloud later;
- explicit human approval before a proposed adaptation mutates the plan;
- raw telemetry remains in PostgreSQL.

Pending product decisions remain in the progressive Grilling `rowing-sport-os-journal-v1@0.1.0`.

# Evidence

Repository baseline: `b7d63b7c13e6e86b5ec43d84fa8009bdaf5e5005`.

# Open loops

- Complete Grilling R1.
- Create normative SPEC.md only after those product decisions are confirmed.
- Create vertical GitHub issues only from the approved SPEC.

# Next action

Complete Grilling R1 and route the confirmed handoff to `conversation-to-spec`.
