# DEC-001 — Coach is a first-class v1 user

Status: accepted  
Date: 2026-09-27  
Authority: user confirmation in Rowing Sport OS v1 Grilling R1

## Context

The existing application authorizes one Authentik identity only against its own athlete record. Rowing Sport OS v1 must support real coach workflows immediately.

## Decision

v1 supports both Athlete and Coach as application users.

- Coach access is granted only through an explicit Coach↔Athlete assignment.
- An authenticated Coach has no implicit access to other athletes.
- Cross-athlete reads and writes must be authorization-checked server-side and audited.
- A Coach may manage planning/testing/adaptation workflow for assigned athletes.
- Athlete-origin subjective journal observations remain attributable to the athlete and may not be silently rewritten by a Coach.
- A dedicated user-facing Admin role/UI is not required for v1; operator administration may remain an operational function.

## Consequences

The current identity model must be extended without weakening the trusted Authentik proxy boundary. Every athlete-scoped API must resolve the acting principal separately from the target athlete.

## Supersession

A later richer RBAC model may supersede this decision, but may not weaken explicit assignment or auditability without a new accepted Decision Record.
