# PRODUCT.md — Sport Athlete Management

## Product statement

Sport Athlete Management is an athlete-facing closed-loop training control application. It turns a versioned training plan, daily athlete feedback, completed-session data and external Skillz reasoning into a safe, reviewable adaptation workflow without hiding the reason for a change.

This file is the authoritative product-context entry point for frontend decisions. Detailed API, safety and contract behavior remains in `README.md`, `SPEC.md` and `contracts/`.

## Primary user

### Athlete

Needs to understand today's training, complete a short daily check-in, record the actual session and see whether a proposed plan change exists. The athlete must remain in control of whether a supported revision is applied.

## Secondary users/services

### Coach / specialist service

Provides planning context and versioned specialist artifacts through explicit contracts rather than direct database access.

### Operator / administrator

Maintains deployment, trusted authentication, migrations, backup and privacy controls. Operational controls should not dominate the athlete-facing UI.

## Core jobs

1. See today's session and current microcycle immediately.
2. Complete the morning check-in in roughly 20–40 seconds.
3. Record the completed session and session RPE quickly.
4. Understand the latest adaptation state and its rationale.
5. Explicitly apply a supported version-bound revision when appropriate.
6. Review specialist context without confusing it with automatic medical advice.
7. Preserve longitudinal history and provenance.

## Product principles

- **Today first:** the current session and the next action dominate the interface.
- **Fast routine capture:** repeated daily input must be compact and low-friction.
- **Human control:** no silent automatic plan mutation.
- **Transparent reasoning:** status, rationale, source and version are visible.
- **Safety without alarmism:** warnings are prominent when needed, calm when not.
- **Longitudinal clarity:** week, block and adaptation history remain easy to scan.
- **No wellness-score theatre:** do not collapse meaningful context into an opaque readiness score.

## Surface hierarchy

1. Today / current session
2. Morning check
3. Weekly plan
4. Post-session completion
5. Adaptation proposal/decision
6. Specialist context
7. History
8. Profile and detailed context

## Shared platform boundary

Hosted deployments use the shared private MariaDB 11.8 infrastructure defined in `docs/shared-db-infrastructure.md`. The Sport app owns its own `sport_athlete` database and never reads the Masters Diagnostics schema directly.

## Frontend authority

`DESIGN.md` defines the visual and interaction system. Existing implementation should be evolved toward it rather than rewritten solely for aesthetic reasons.
