# Rowing Sport OS / Sport Journal — Project Memory

Status: active  
Repository: `GithubLarsKomo/sport-athlete-management-app`

## Goal

Deliver a Hetzner-hosted, Authentik-protected longitudinal training journal that imports canonical Skillz plans, records plan-vs-actual training and subjective response, ingests FIT/device evidence, stores performance tests and supports a manual adaptation handoff before later LLM integration.

## Current status

Technical wayfinding is complete against baseline `b7d63b7c13e6e86b5ec43d84fa8009bdaf5e5005`. The existing application remains the sole operational producer. Five material product decisions are pending in the focused progressive Grilling before a normative SPEC is created.

## Current state

- [state.json](state.json)
- [Timeline](TIMELINE.md)
- [Latest event](events/EVT-20260927-140300-rowing-sport-os-wayfinding.md)

## Canonical project artifacts

- [Wayfinding brief](../wayfinding/rowing-sport-os-journal-v1-gap-audit.md)
- [Investigation backlog](../wayfinding/rowing-sport-os-journal-v1-investigation-backlog.json)
- [Dependency graph](../wayfinding/rowing-sport-os-journal-v1-dependency-graph.json)
- Grilling definition: `GithubLarsKomo/grilling/examples/rowing-sport-os-journal-v1.json`

## Open loops

1. Confirm v1 user model.
2. Confirm post-session subjective fields.
3. Confirm structured performance-test catalogue.
4. Confirm data export/deletion boundary.
5. Confirm athlete Second-Brain preparation mode.

## Next step

Complete Grilling R1, then use `conversation-to-spec` to create the normative `SPEC.md`.
