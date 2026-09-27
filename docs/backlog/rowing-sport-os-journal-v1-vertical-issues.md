# Rowing Sport OS / Sport Journal v1 — Vertical Implementation Backlog

Spec: `rowing-sport-os-journal-v1@0.1.0`  
Approved main ref: `bd9b06bc19e41c197ce81b906ce0d4921bfb8e57`  
Status: ready

## VI-001 — Add Coach↔Athlete authorization end to end

**GitHub:** #21 — https://github.com/GithubLarsKomo/sport-athlete-management-app/issues/21

**Outcome:** An Authentik-authenticated Coach can work only with explicitly assigned athletes, while Athlete self-service continues unchanged and every cross-athlete action is auditable.

**Requirements:** `REQ-ROLE-001`, `REQ-ROLE-002`, `REQ-ROLE-003`, `REQ-ROLE-004`, `REQ-ROLE-005`

**Dependencies:** none

**Behavior**
- Represent application principal role separately from athlete identity.
- Persist active/inactive Coach↔Athlete assignments with history.
- Resolve actor and target athlete on every athlete-scoped route.
- Return 403 for an unassigned Coach without leaking unnecessary athlete existence information.
- Audit Coach actor, target athlete, action and entity.
- Expose explicit current-athlete context in Coach-facing UI paths without redesigning the accepted layout.

**Acceptance evidence**
- Automated authorization tests green.
- Manual/API smoke with two athletes + one Coach demonstrates allowed and denied paths.
- Migration/readiness pass.

**Non-goals**
- User-facing Admin console.
- Organization/team hierarchy beyond explicit Coach↔Athlete assignment.

## VI-002 — Import canonical Skillz training plans with revision history

**GitHub:** #22 — https://github.com/GithubLarsKomo/sport-athlete-management-app/issues/22

**Outcome:** An Athlete or assigned Coach can import a canonical Skillz plan bundle, re-import identical content idempotently, and retain explicit history for changed plans.

**Requirements:** `REQ-PLAN-001`, `REQ-PLAN-002`, `REQ-PLAN-003`, `REQ-PLAN-004`, `REQ-PLAN-005`

**Dependencies:** VI-001

**Behavior**
- Accept sport-training-plan.json plus transport-only referenced companion artifacts.
- Validate contract version/shape before persistence.
- Store producer/source refs and content hash.
- Map canonical season/meso/micro/session data into existing planning persistence without redefining sport-science semantics.
- Preserve session IDs, objectives, duration, planned RPE, intensity/stop rules, flexibility and structured items.
- Treat same hash as idempotent success; changed content creates explicit revision.

**Acceptance evidence**
- Automated plan adapter tests.
- UI/API import demo showing current + prior revision.
- DB provenance/hash evidence.

**Non-goals**
- Reimplement Skillz plan generation.
- Embedded LLM plan generation.

## VI-003 — Unify FIT/manual journal completion with plan-vs-actual views

**GitHub:** #23 — https://github.com/GithubLarsKomo/sport-athlete-management-app/issues/23

**Outcome:** An Athlete can finalize a real session once—whether manual or FIT-backed—with RPE and subjective context, and Athlete/assigned Coach can inspect transparent session/week Soll-Ist.

**Requirements:** `REQ-JRN-001`, `REQ-JRN-002`, `REQ-JRN-003`, `REQ-JRN-004`, `REQ-JRN-005`, `REQ-JRN-006`, `REQ-JRN-007`, `REQ-CHECK-001`, `REQ-CHECK-002`, `REQ-IMP-001`, `REQ-IMP-002`, `REQ-IMP-003`, `REQ-IMP-004`

**Dependencies:** VI-001, VI-002

**Behavior**
- Preserve existing Garmin FIT/TCX, Concept2 and RP3 normalization/dedupe.
- Link an activity to a compatible planned session without auto-finalizing subjective data.
- Require Session-RPE to finalize.
- Capture easier/as_expected/harder, optional pain, structured deviations and optional Athlete comment.
- Preserve Athlete authorship and separate Coach notes.
- Converge manual and imported paths onto exactly one completed_session; late imports attach instead of duplicating.
- Show session and weekly plan-vs-actual duration/RPE and available intensity/items/distance/work plus provenance.

**Acceptance evidence**
- End-to-end browser/API journal demo.
- Regression tests for provider dedupe + completion convergence.
- Session/week comparison screenshot/test fixture.

**Non-goals**
- Garmin Connect cloud OAuth.
- Mandatory extra fatigue/motivation scales after every session.

## VI-004 — Add structured RowErg and bike performance testing

**GitHub:** #24 — https://github.com/GithubLarsKomo/sport-athlete-management-app/issues/24

**Outcome:** Athlete or assigned Coach can plan, execute and review fixed RowErg and staged lactate tests while measured, derived and estimated values remain distinguishable.

**Requirements:** `REQ-TST-001`, `REQ-TST-002`, `REQ-TST-003`, `REQ-TST-004`, `REQ-TST-005`, `REQ-TST-006`, `REQ-TST-007`

**Dependencies:** VI-001

**Behavior**
- Support test lifecycle from planned protocol through performed result and retest history.
- Provide fixed RowErg protocols: 500m, 1k, 2k, 5k, 30min.
- Provide RowErg and bike lactate step tests.
- Provide configurable staged protocol.
- Persist stage duration, power/pace, HR, lactate, RPE, cadence/stroke rate and comment.
- Persist device, protocol/version, warm-up, environment, termination reason, actor/time and notes.
- Classify relevant values as measured, derived or assumed_or_estimated.
- Keep interpretation/recommendation ownership in Skillz.

**Acceptance evidence**
- Automated persistence/API tests.
- Browser demo for fixed and staged tests.
- Database/provenance fixture.

**Non-goals**
- Automatic lactate-threshold diagnosis inside WebApp.
- Medical test interpretation.

## VI-005 — Export deterministic adaptation handoff and apply validated proposals explicitly

**GitHub:** #25 — https://github.com/GithubLarsKomo/sport-athlete-management-app/issues/25

**Outcome:** Athlete or assigned Coach can download an inspectable minimized adaptation JSON, import a validated proposal, and explicitly apply it once without any model directly mutating the plan.

**Requirements:** `REQ-AI-001`, `REQ-AI-002`, `REQ-AI-003`, `REQ-AI-004`, `REQ-AI-005`, `REQ-AI-006`, `REQ-AI-007`, `REQ-BRAIN-001`, `REQ-BRAIN-002`, `REQ-BRAIN-003`

**Dependencies:** VI-002, VI-003, VI-004

**Behavior**
- Build a deterministic versioned sport-athlete-adaptation-handoff from profile/goals/current plan/Soll-Ist/completions/subjective observations/check-ins/tests/notes/safety/uncertainties/source refs.
- Let user inspect/download the JSON before external use.
- Exclude unrelated raw telemetry and secrets.
- Accept only schema-valid returned proposal artifacts; invalid output fails closed.
- Importing proposal never mutates plan.
- Explicit authenticated Athlete or assigned-Coach apply records actor and prior/new versions and is single-application safe.
- Define contract-only future Athlete-learning promotion boundary with evidence refs, conditions, counter-evidence, confidence and freshness.
- Do not implement automatic Second-Brain writes.

**Acceptance evidence**
- Golden-file handoff contract test.
- End-to-end manual export→proposal import→explicit apply demo.
- Audit/version evidence.

**Non-goals**
- Embedded OpenAI-compatible provider UI.
- Automatic model invocation.
- Automatic Second-Brain persistence.

## VI-006 — Provide athlete data export and privacy rollout gate

**GitHub:** #26 — https://github.com/GithubLarsKomo/sport-athlete-management-app/issues/26

**Outcome:** Athletes can self-export their longitudinal data, assigned Coaches are authorization-bound, and the product has a verifiable retention/deletion/logging gate before broad multi-user rollout.

**Requirements:** `REQ-DATA-001`, `REQ-DATA-002`, `REQ-DATA-003`, `REQ-DATA-004`

**Dependencies:** VI-001, VI-002, VI-003, VI-004, VI-005

**Behavior**
- Provide authenticated Athlete self-service structured export covering profile/goals, plan/revisions, journal/completions, activity/source summaries, check-ins, tests, adaptation history and relevant audit records.
- State whether raw provider files are included or only referenced.
- Permit assigned Coach export only through explicit authorization/audit.
- Document and verify retention policy, deletion/request procedure, immutable audit/security treatment and backup/restore-window handling.
- Review application/proxy logging so journal/symptom/test/physiology payloads are not emitted unnecessarily.

**Acceptance evidence**
- Downloadable JSON export fixture.
- Authorization tests.
- Documented retention/deletion/backup procedure with verification checklist.

**Non-goals**
- Automated account deletion UI if operator procedure satisfies the v1 rollout gate.
- Cross-product data export.

## VI-007 — Deploy Rowing Sport OS v1 behind Authentik on Hetzner

**GitHub:** #27 — https://github.com/GithubLarsKomo/sport-athlete-management-app/issues/27

**Outcome:** The approved v1 runs at sportjournal.ratzeburg-ai.de through Authentik with private PostgreSQL and passes the complete Athlete/Coach/FIT/plan/test/export/adaptation production smoke suite.

**Requirements:** `REQ-OPS-001`, `REQ-OPS-002`, `REQ-OPS-003`

**Dependencies:** VI-001, VI-002, VI-003, VI-004, VI-005, VI-006

**Behavior**
- Deploy repository Dockerfile through Coolify with PUBLIC_ORIGIN=https://sportjournal.ratzeburg-ai.de.
- Use private PostgreSQL 18.x and least-privilege credentials.
- Keep Authentik trusted proxy/header secret boundary and eliminate public bypass routes.
- Run checksum-tracked forward migrations and readiness.
- Execute representative Athlete and Coach smoke paths plus plan/FIT/test/export/adaptation checks.
- Verify backup/restore appropriate to deployment stage.

**Acceptance evidence**
- Green CI on deployment commit.
- Recorded deployment checklist and smoke evidence.
- Verified public Authentik route and private DB/bypass posture.

**Non-goals**
- Garmin Connect cloud OAuth.
- Embedded LLM provider.
- Automatic Athlete Second Brain writes.

