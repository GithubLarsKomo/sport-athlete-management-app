# PRODUCT.md — Sport Athlete Management

## Product statement

Sport Athlete Management is an athlete-facing closed-loop training control application. It turns a versioned training plan, daily athlete feedback, completed-session data, passive biometric context and external Skillz reasoning into a safe, reviewable adaptation workflow without hiding the reason for a change.

This file is the authoritative product-context entry point for frontend decisions. Detailed API, safety and contract behavior remains in `README.md`, `SPEC.md`, `docs/garmin-health-baselines.md` and `contracts/`.

## Primary user

### Athlete

Needs to understand today's training, complete a short daily check-in, record the actual session and see whether a proposed plan change exists. The athlete must remain in control of whether a supported revision is applied.

## Secondary users/services

### Coach / specialist service

Provides planning context and versioned specialist artifacts through explicit contracts rather than direct database access.

### Operator / administrator

Maintains deployment, trusted authentication, migrations, backup, privacy controls and device/service integrations. Operational controls should not dominate the athlete-facing UI.

## Core jobs

1. See today's session and current microcycle immediately.
2. Complete the morning check-in in roughly 20–40 seconds, even when passive wearable data are available.
3. Record/import the completed session and session RPE quickly.
4. Understand the latest adaptation state and its rationale.
5. Review longitudinal Recovery, Training Tolerance, Performance Capacity, Physiological Stability and Body/Energy context without collapsing them into one opaque score.
6. Explicitly apply a supported version-bound revision when appropriate.
7. Review specialist context without confusing it with automatic medical advice.
8. Preserve longitudinal history, device/method provenance and reasoning provenance.

## Product principles

- **Today first:** the current session and the next action dominate the interface.
- **Fast routine capture:** repeated daily input must be compact and low-friction.
- **Passive data, active athlete:** wearable sync reduces manual entry but does not replace subjective recovery, pain or illness reporting.
- **Provider ≠ regulator:** Garmin and other vendors provide observations/context; they do not own the training decision.
- **Human control:** no silent automatic plan mutation.
- **Transparent reasoning:** status, rationale, source, metric class, decision role and version are visible when relevant.
- **Personal baselines:** longitudinal athlete-specific references are preferred over universal cut-offs where appropriate.
- **Method-aware body data:** BIA, DXA, scale and tape measurements stay distinguishable.
- **Safety without alarmism:** warnings are prominent when needed, calm when not.
- **Longitudinal clarity:** week, block, adaptation and physiological trends remain easy to scan.
- **No wellness-score theatre:** do not collapse meaningful context into an opaque readiness, health, longevity or “biological age” score.

## Surface hierarchy

1. Today / current session
2. Morning check + passive sync summary
3. Weekly plan
4. Post-session completion / journal
5. Adaptation proposal/decision
6. Longitudinal trends
   - Recovery
   - Training tolerance
   - Performance capacity
   - Physiological stability
   - Body / Energy context
7. Specialist context
8. History
9. Profile, device connections and detailed context

Provider-derived values such as Training Readiness, Body Battery, Sleep Score, Training Status or Fitness Age may be shown as secondary device context. Biological Age, Pace of Aging, Lifespan Meter, Metabolic Capacity/Momentum or similar constructs are not primary Sports Journal product metrics.

## Shared platform boundary

The hosted platform standard is the private PostgreSQL 18.x infrastructure defined in `docs/shared-db-infrastructure.md`. The Sport runtime is now implemented on PostgreSQL and uses the canonical `DATABASE_URL` plus `DB_POOL_MAX` connection contract.

The Sport app owns a dedicated `sport_athlete` PostgreSQL database and least-privilege runtime role. It never reads Masters Diagnostics, Grilling or other product databases directly. Existing MariaDB production data, if present, is moved only through the controlled reconciliation and backup/restore process in `deploy/MARIADB-TO-POSTGRESQL.md`; there is no long-term dual-provider mode.

## Frontend authority

`DESIGN.md` defines the visual and interaction system. Existing implementation should be evolved toward it rather than rewritten solely for aesthetic reasons.
