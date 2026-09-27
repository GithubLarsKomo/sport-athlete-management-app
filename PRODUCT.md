# PRODUCT.md — Sport Athlete Management

## Product statement

Sport Athlete Management / Rowing Sport OS is a closed-loop training-control application for athletes and their explicitly assigned coaches. It turns a versioned training plan, daily athlete feedback, completed-session data, performance testing, passive biometric context and external Skillz reasoning into a safe, reviewable adaptation workflow without hiding why a change is proposed.

This file is the authoritative product-context entry point for frontend decisions. Detailed API, safety and contract behavior remains in `README.md`, `SPEC.md`, `docs/garmin-health-baselines.md` and `contracts/`.

## Primary users

### Athlete

Needs to understand today's training, complete a short daily check-in, record/import the actual session, compare plan vs actual, record performance tests and see whether a proposed plan change exists. The athlete retains authorship of subjective observations and may explicitly apply a supported revision.

### Coach

Needs to work with explicitly assigned athletes, review plan-vs-actual history and tests, manage plans/test scheduling, add coach-authored context, prepare adaptation handoffs and explicitly apply supported plan revisions without impersonating the athlete or rewriting athlete-authored subjective data.

Coach access is assignment-bound and audited. No Coach has implicit access to all athletes.

## Secondary users/services

### Specialist / reasoning service

Provides versioned specialist or adaptation artifacts through explicit contracts rather than direct database access.

### Operator / administrator

Maintains deployment, Authentik integration, Coach↔Athlete assignments where no end-user admin UI exists, migrations, backup, privacy controls and device/service integrations. Operational controls should not dominate the athlete/coach UI.

## Core jobs

1. See today's session and current microcycle immediately.
2. Complete the morning check-in in roughly 20–40 seconds.
3. Record/import a completed session and finalize the journal with RPE quickly.
4. Compare planned vs actual training at session/week level.
5. Plan and record structured RowErg/bike performance tests.
6. Understand the latest adaptation state and its rationale.
7. Explicitly apply a supported version-bound revision when appropriate.
8. Let an assigned Coach work with the athlete without widening data access.
9. Review longitudinal Recovery, Training Tolerance, Performance Capacity, Physiological Stability and Body/Energy context without one opaque score.
10. Export athlete data and a deterministic adaptation handoff.
11. Preserve longitudinal history, device/method provenance, authorship and reasoning provenance.

## Product principles

- **Today first:** the current session and next action dominate athlete use.
- **Right athlete, always:** Coach surfaces make the target athlete explicit and prevent cross-athlete ambiguity.
- **Fast routine capture:** repeated daily input stays compact.
- **Passive data, active athlete:** wearable sync reduces manual entry but does not replace subjective recovery, pain or illness reporting.
- **Provider ≠ regulator:** Garmin and other vendors provide observations/context; they do not own the training decision.
- **Human control:** no silent automatic plan mutation.
- **Authorship matters:** athlete observations and coach notes remain distinguishable.
- **Transparent reasoning:** status, rationale, source, metric class, decision role and version are visible when relevant.
- **Personal baselines:** longitudinal athlete-specific references are preferred over universal cut-offs where appropriate.
- **Method-aware data:** measurement method and measured/derived/estimated status remain visible.
- **Safety without alarmism:** warnings are prominent when needed, calm when not.
- **Longitudinal clarity:** week, block, testing, adaptation and physiological trends remain easy to scan.
- **No wellness-score theatre:** do not collapse meaningful context into an opaque readiness, health, longevity or biological-age score.

## Surface hierarchy

### Athlete
1. Today / current session
2. Morning check + passive sync summary
3. Weekly plan / Soll-Ist
4. Post-session journal
5. Tests
6. Adaptation proposal/decision
7. Longitudinal trends
8. Specialist context/history
9. Profile, devices and export

### Coach
1. Explicit athlete selector / current athlete context
2. Current plan and week / Soll-Ist
3. Journal/activity/test review
4. Plan/test management
5. Adaptation handoff/proposal
6. Longitudinal context
7. Coach notes/history

Provider-derived values such as Training Readiness, Body Battery, Sleep Score or Training Status may be shown only as secondary device context.

## Shared platform boundary

The hosted platform standard is the private PostgreSQL 18.x infrastructure defined in `docs/shared-db-infrastructure.md`. The Sport app owns a dedicated `sport_athlete` database and least-privilege runtime role.

## AI and Second-Brain boundary

The v1 product is fully functional without an embedded LLM. It exports a structured adaptation handoff and accepts only validated proposal artifacts. No model directly mutates an active plan.

Raw training, journal, test and wearable data remain in PostgreSQL. Athlete-specific Second-Brain integration is contract-ready only in v1; automatic knowledge persistence is not enabled.

## Frontend authority

`DESIGN.md` defines the visual and interaction system. Existing implementation should be evolved toward it rather than rewritten solely for aesthetic reasons.

## Provenance

Updated from completed `rowing-sport-os-journal-v1@0.1.0` Grilling and the 2026-09-27 repository Wayfinding audit.
