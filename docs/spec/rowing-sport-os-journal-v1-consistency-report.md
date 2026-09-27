# Rowing Sport OS / Sport Journal v1 — Consistency Report

Spec: `SPEC.md@0.1.0`  
Status: **PASS for approval**; implementation slicing remains gated on explicit approval.

## Checks

- **Role vs authorization:** PASS. Athlete-own and Coach-assigned access are explicit; cross-athlete Coach actions require assignment and audit.
- **Coach vs subjective authorship:** PASS. Coach can manage planning/testing but cannot silently overwrite athlete-authored subjective observations.
- **Plan ownership:** PASS. Skillz remains sport-science owner; app is transport/persistence adapter.
- **Plan revision/history:** PASS. Identical import is idempotent and changed plan content creates explicit revision history.
- **Journal convergence:** PASS. Manual/device paths converge on one completed session while preserving provider evidence.
- **Performance testing:** PASS. Fixed RowErg tests, lactate protocols and generic staged tests share measured/derived/estimated semantics.
- **LLM boundary:** PASS. MVP works without a model; export is deterministic; model output is proposal-only; explicit apply is required.
- **Second Brain boundary:** PASS. No raw telemetry promotion in v1.
- **Data portability/privacy:** PASS for MVP specification. Self-service export is in scope; deletion/retention remains a broader-rollout release gate.
- **Deployment:** PASS. Existing Coolify/AuthentiK/PostgreSQL architecture is reused.
- **Design:** PASS. Existing PRODUCT/DESIGN contract remains authoritative; no unapproved layout redesign is introduced.
- **Migration:** PASS. Additive forward migrations only; existing activity and identity continuity are preserved.

## Reversible assumptions

1. Coach↔Athlete assignment administration may initially be operator-controlled rather than a user-facing admin UI.
2. Exact database table/API names are left to implementation.
3. Canonical Skillz plan companion artifacts may travel in a transport-only import envelope.

These assumptions are behind stable normative boundaries and do not block approval.

## Unresolved contradictions

None found.

## Gate

Explicit user approval of `SPEC.md@0.1.0` is required before creating `vertical-issues.json` or GitHub implementation issues.
