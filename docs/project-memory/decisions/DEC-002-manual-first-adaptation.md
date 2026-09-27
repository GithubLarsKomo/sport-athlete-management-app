# DEC-002 — Manual-first adaptation and Second-Brain boundary

Status: accepted  
Date: 2026-09-27  
Authority: confirmed Rowing Sport OS v1 scope and Grilling R1

## Context

The product is intended to evolve toward LLM-assisted plan adaptation and athlete-specific learnings, but the MVP must remain useful, auditable and safe without an embedded model.

## Decision

- v1 provides a deterministic structured adaptation-handoff export.
- A returned LLM/Skillz artifact is always a proposal until schema validation and explicit human apply.
- No model may directly mutate the active plan.
- Raw FIT/device/journal/test telemetry remains in PostgreSQL.
- v1 prepares but does not activate automatic Athlete Second-Brain persistence.
- Later knowledge promotion is limited to confirmed, reusable, evidence-referenced learnings.

## Consequences

The system can collect high-quality ground truth before model selection. External model use can be tested manually without coupling MVP availability to a provider.

## Supersession

Embedded LLM and Athlete Second-Brain writes require separately versioned contracts, evaluation evidence and an accepted follow-up decision.
