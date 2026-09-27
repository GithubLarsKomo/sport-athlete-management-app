# SPEC.md — Rowing Sport OS / Sport Journal v1

Status: **approved**  
Spec ID: `rowing-sport-os-journal-v1`  
Version: 0.1.0  
Repository: `GithubLarsKomo/sport-athlete-management-app`  
Baseline: `1bb9445f40aa5b4279bea488e8e73ff1067950ec`  
Date: 2026-09-27

## 1. Purpose and target state

Rowing Sport OS / Sport Journal v1 extends the existing Sport Athlete Management App into a Hetzner-hosted, Authentik-protected longitudinal training journal for athletes and coaches.

The closed loop is:

`canonical plan -> scheduled training -> actual activity/journal -> plan-vs-actual -> performance testing -> structured adaptation handoff -> human-reviewed plan revision`

The MVP remains fully useful without an embedded LLM. Device evidence and athlete observations retain provenance. Garmin cloud and LLM integrations are later additive adapters, not alternate sources of truth.

### 1.1 MVP outcome

An authenticated athlete or assigned coach can:

1. work from a versioned canonical training plan;
2. see current and weekly planned training;
3. import or manually record actual sessions;
4. complete/review the post-session journal;
5. compare planned vs actual execution;
6. plan and record structured RowErg/bike performance tests;
7. export a deterministic adaptation handoff;
8. review and explicitly apply a validated plan revision;
9. export the athlete's data.

## 2. Non-goals for v1

- Garmin Connect cloud OAuth/activity/health sync.
- Automatic RP3 cloud synchronization.
- Automatic LLM plan mutation.
- Automatic Athlete Second-Brain persistence.
- Opaque global readiness/health/compliance/biological-age score.
- Medical diagnosis or medical clearance.
- User-facing administrator console.
- Replacing canonical Skillz sport-science logic inside the WebApp.

## 3. Users, roles and authorization

### REQ-ROLE-001 — Authentik identity

Production authentication MUST remain behind the trusted Authentik/Traefik proxy boundary. The application MUST reject requests lacking the trusted proxy secret and stable authenticated subject.

### REQ-ROLE-002 — Athlete role

An Athlete MUST be able to access and mutate only their own athlete-scoped data, subject to domain-specific authorship and evidence rules.

### REQ-ROLE-003 — Coach role

A Coach MUST be able to operate on an athlete only when an active explicit Coach↔Athlete assignment exists.

For an assigned athlete a Coach MAY:
- view plan, journal, activity evidence, relevant check-ins, tests and adaptation history;
- import/assign or revise versioned plans through supported contracts;
- schedule tests and enter test results;
- add coach-authored notes;
- create/export adaptation handoffs;
- explicitly apply a validated supported plan revision.

A Coach MUST NOT:
- access an unassigned athlete;
- impersonate the athlete;
- silently rewrite athlete-authored subjective observations;
- delete immutable provider/source evidence.

### REQ-ROLE-004 — Actor/target separation and audit

Every athlete-scoped request MUST distinguish authenticated actor subject, actor role, target athlete and authorization basis.

Every cross-athlete Coach action MUST be written to the audit log with actor, target athlete, action, entity and time.

### REQ-ROLE-005 — Assignment management

The data model MUST support explicit active/inactive Coach↔Athlete assignments with audit history. A user-facing assignment-management console is not required in v1; assignment administration MAY initially remain operator controlled.

## 4. Planning and canonical JSON import

### REQ-PLAN-001 — Source-of-truth boundary

Skillz remains the owner of sport-science planning semantics and the canonical `sport-training-plan.json` output. The application MUST NOT redefine training logic.

### REQ-PLAN-002 — Versioned import

The application MUST provide a JSON import path for canonical Skillz training plans.

Where `sport-training-plan.json` references companion season/mesocycle/microcycle artifacts, the transport MAY provide them in a versioned import bundle. This bundle is transport only and MUST NOT alter their semantics.

### REQ-PLAN-003 — Validation and provenance

Before persistence an import MUST:
- validate required contract version and shape;
- record producer/source references;
- compute/store a content hash;
- reject invalid input;
- retain uncertainties and safety rules;
- preserve planned-session identity and prescriptions.

### REQ-PLAN-004 — Idempotency and revisions

Re-importing identical plan content MUST be idempotent. Changed content MUST create an explicit revision/new version and MUST NOT silently overwrite historical plan state.

### REQ-PLAN-005 — Session detail preservation

Each planned-session representation MUST preserve at least:
- stable planned session ID;
- planned start/local date;
- session type;
- objective;
- planned duration;
- planned RPE when supplied;
- intensity rule;
- stop rule;
- flexibility/key-session classification;
- structured items/intervals where supplied;
- source/version provenance.

## 5. Training journal and Soll/Ist

### REQ-JRN-001 — One real session, one canonical activity

Existing activity/source deduplication remains normative. Multiple provider records for one real session MUST converge on one canonical activity while preserving immutable source evidence.

### REQ-JRN-002 — Plan linkage

An activity MAY link to one compatible planned session. Device import alone MUST NOT finalize subjective journal data.

### REQ-JRN-003 — Required post-session input

Journal finalization MUST require Session-RPE 0–10.

### REQ-JRN-004 — Subjective v1 fields

The journal MUST additionally support:
- expectation match: `easier | as_expected | harder`;
- optional pain 0–10;
- zero or more structured deviation reasons;
- optional athlete free-text comment.

Structured deviation reasons SHOULD include:
`time_constraint, weather_environment, fatigue, pain, illness, equipment, intentionally_modified, external_interruption, other`.

### REQ-JRN-005 — Authorship

Athlete-authored subjective fields MUST retain actor/authorship provenance. A Coach MAY add a separate coach note but MUST NOT silently replace athlete-authored values.

### REQ-JRN-006 — Completed-session convergence

Manual completion and imported-activity finalization MUST converge on exactly one canonical `completed_session`. A late device import MAY attach to an already completed session without creating a duplicate completion.

### REQ-JRN-007 — Soll/Ist comparison

The product MUST expose plan-vs-actual comparison at session and weekly level.

Where data exist, comparison MUST show:
- duration target vs actual;
- planned RPE vs actual RPE;
- target intensity rule vs observed power/pace/HR/RPE evidence;
- interval/item completion;
- distance/work where relevant;
- completion status;
- expectation match;
- deviations;
- pain;
- athlete comment;
- source/provenance.

No single opaque compliance score is required.

## 6. Morning Check

The existing Morning Check remains available and distinct from post-session reporting.

### REQ-CHECK-001

Passive wearable/device data MUST NOT replace athlete pain, illness or subjective reporting.

### REQ-CHECK-002

The post-session MVP MUST NOT duplicate mandatory fatigue/muscle-feel/motivation scales already captured in Morning Check unless a later requirement explicitly changes that decision.

## 7. Performance tests

### REQ-TST-001 — Test lifecycle

The system MUST support:

`planned test -> protocol -> expected/assumed targets -> performed test -> measured result -> derived interpretation references -> retest history`.

### REQ-TST-002 — Fixed RowErg protocols

v1 MUST provide structured protocol types for:
- RowErg 500 m;
- RowErg 1,000 m;
- RowErg 2,000 m;
- RowErg 5,000 m;
- RowErg 30 min.

Result fields MUST allow total time/distance, pace, power, HR where present, stroke rate where present, RPE, device/provenance and notes.

### REQ-TST-003 — Lactate protocols

v1 MUST support RowErg lactate step tests and bike lactate step tests.

Each stage MUST support:
- stage number;
- duration;
- power and/or pace;
- heart rate;
- lactate;
- RPE;
- cadence or stroke rate;
- comment.

### REQ-TST-004 — Generic staged protocol

v1 MUST support a configurable staged protocol so additional bike/RowErg tests can be represented without schema redesign.

### REQ-TST-005 — Protocol metadata

Each test execution MUST retain:
- sport/modality;
- device;
- protocol ID/version;
- warm-up;
- environment/context;
- termination reason;
- operator/actor;
- date/time;
- notes.

### REQ-TST-006 — Measurement class

Every relevant value MUST identify whether it is:
`measured | derived | assumed_or_estimated`.

Assumptions MUST never be displayed or exported as measured results.

### REQ-TST-007 — Skillz boundary

Test interpretation and training recommendations remain owned by Skillz diagnostics/testing capabilities. The app persists test evidence and may display validated returned artifacts; it MUST NOT invent thresholds from incomplete test data.

## 8. Adaptation handoff and future LLM integration

### REQ-AI-001 — Manual-first deterministic export

v1 MUST generate a deterministic, versioned `sport-athlete-adaptation-handoff` JSON export before any embedded LLM provider is required.

### REQ-AI-002 — Minimum handoff context

The export MUST contain only necessary structured context:
- athlete/profile reference and relevant current constraints;
- goals;
- current active plan revision;
- selected planned-vs-actual training window;
- completed sessions;
- athlete-authored subjective observations;
- relevant Morning Checks;
- current performance-test evidence;
- explicit athlete/coach notes;
- safety flags;
- uncertainties;
- source/provenance references.

### REQ-AI-003 — Data minimization

The export MUST be inspectable before external use and MUST NOT include unrelated raw telemetry or secrets.

### REQ-AI-004 — Proposal-only return

Any returned LLM/Skillz adaptation artifact MUST be validated as a proposal. Invalid output MUST fail closed.

### REQ-AI-005 — Explicit apply

No model/service response may directly mutate the active plan. Applying a supported revision requires an explicit authenticated Athlete or assigned-Coach action and MUST record actor and prior/new version.

### REQ-AI-006 — Future provider abstraction

A later embedded provider MAY use the Grilling-v3-style configurable OpenAI-compatible endpoint/API-key/model pattern. Provider selection is not MVP scope; secrets MUST remain server-side.

### REQ-AI-007 — Ground truth and evaluation

Before an embedded model influences production recommendations, behavior MUST be evaluated against deterministic/manual baseline workflows and initially run in shadow/proposal mode. Safety and authorization rules remain deterministic.

## 9. Athlete Second Brain

### REQ-BRAIN-001

v1 MUST NOT automatically write athlete telemetry, journal rows or test rows to a Second Brain.

### REQ-BRAIN-002

v1 SHOULD define an integration boundary for future promotion of confirmed learnings containing:
- athlete/project reference;
- learning statement;
- evidence references;
- applicable conditions;
- counter-evidence/limitations;
- confidence/status;
- as-of/freshness metadata.

### REQ-BRAIN-003

Future promotion MUST pass the Knowledge Promotion Gate. Raw conversation, raw telemetry, secrets and speculative hypotheses are not promotable.

## 10. Data portability, privacy and retention

### REQ-DATA-001 — Self-service export

MVP MUST provide an authenticated self-service export for an Athlete's own data.

The export SHOULD include structured JSON for:
- profile/goals;
- plan/revisions;
- journal/completed sessions;
- activity/source summaries and provenance references;
- check-ins;
- tests;
- adaptation history;
- relevant audit data concerning the athlete.

Provider raw files MAY be included or referenced according to size/privacy constraints, but the export MUST state what is and is not included.

### REQ-DATA-002 — Coach export

A Coach MAY export data only for an actively assigned athlete and only through the same authorization/audit boundary.

### REQ-DATA-003 — Deletion/retention release gate

Before broader multi-user production rollout, the product MUST have:
- documented retention policy;
- athlete deletion/request procedure;
- treatment of immutable audit/security evidence;
- treatment of backups and restore windows;
- verified execution procedure.

### REQ-DATA-004 — Sensitive-data logging

Application/proxy logs MUST avoid emitting journal, symptom, test or physiological payloads except where explicitly required for bounded diagnostics.

## 11. FIT and external activity sources

### REQ-IMP-001

Existing Garmin FIT/TCX, Concept2 and RP3 ingestion remains supported.

### REQ-IMP-002

FIT upload MUST be part of the v1 workflow and feed the same canonical activity/journal/Soll-Ist path.

### REQ-IMP-003

Garmin Connect cloud authorization is not a v1 release dependency.

### REQ-IMP-004

Provider data MUST retain provider/device/source identity and raw hash/provenance. Re-import MUST remain idempotent.

## 12. Domain model additions

Existing tables and evidence MUST be preserved through additive forward migrations.

Logical additions required by v1:
- application principal/user role representation;
- Coach↔Athlete assignment;
- plan-import provenance/revision record;
- athlete/coach journal authorship where not already explicit;
- structured expectation/deviation fields;
- performance-test definition/planned execution/result/stages;
- adaptation-handoff export record;
- data-export audit record.

Exact table names are an implementation detail; authorization, versioning and provenance semantics are normative.

## 13. State and error behavior

- Unauthorized target-athlete access -> `403`, without unnecessary existence leakage.
- Invalid plan/test/adaptation JSON -> `422` with bounded validation details.
- Same immutable import hash -> idempotent success, no duplicate plan/activity.
- Ambiguous cross-provider match -> review state, never silent destructive merge.
- Completed/finalized evidence remains historically traceable.
- Failed external reasoning -> no invented advice and no plan mutation.
- Applying an already applied adaptation -> conflict.
- Revoked Coach↔Athlete assignment takes effect for all subsequent requests.

## 14. UX and design constraints

Existing `PRODUCT.md`, `DESIGN.md` and Sport Performance template remain authoritative.

v1 additions MUST:
- remain mobile-friendly for athlete post-session use;
- keep journal completion low friction;
- give Coach workflows explicit athlete context to prevent wrong-athlete actions;
- show actor/source provenance where plan/test/adaptation changes are reviewed;
- preserve WCAG AA and no-color-only meaning;
- not redesign the accepted Impeccable layout merely to add features.

## 15. Deployment and operation

### REQ-OPS-001

Deploy using the repository Dockerfile on Hetzner/Coolify with:
- `PUBLIC_ORIGIN=https://sportjournal.ratzeburg-ai.de`;
- private PostgreSQL 18.x;
- least-privilege database credentials;
- Authentik trusted proxy headers/secret;
- no second unauthenticated route.

### REQ-OPS-002

Migrations MUST remain forward-only, checksum tracked and serialized as currently documented.

### REQ-OPS-003

Production release MUST pass:
- migration;
- readiness;
- automated test suite;
- authenticated Athlete smoke test;
- assigned-Coach authorization smoke test;
- denied unassigned-Coach access test;
- FIT import/finalization test;
- plan import/idempotency/revision test;
- performance-test save/read test;
- data export test;
- adaptation proposal cannot mutate without explicit apply;
- backup/restore verification appropriate to deployment stage.

## 16. Acceptance criteria

### AC-01 Roles
Given two athletes and one coach assigned only to Athlete A, the coach can access A and receives `403` for B across athlete-scoped APIs. Athlete B cannot access A. Audit records identify actor and target.

### AC-02 Plan import
A valid canonical training-plan bundle imports once, re-imports idempotently, and changed content creates explicit revision history without losing the previous plan.

### AC-03 Journal
A FIT-imported session can link to its planned session; finalization requires RPE and records expectation match, deviations/pain/comment where supplied. Repeating the FIT import does not duplicate the session.

### AC-04 Soll/Ist
Athlete and assigned Coach can view planned vs actual duration/RPE and available intensity/item evidence at session and weekly level without a black-box compliance score.

### AC-05 Fixed tests
The system can plan/store RowErg 500m, 1k, 2k, 5k and 30min results with provenance and subjective response.

### AC-06 Lactate
A RowErg or bike lactate test can store ordered stages with workload/pace, HR, lactate, RPE and cadence/stroke rate; measured and estimated values are visibly distinguishable.

### AC-07 Adaptation handoff
A deterministic JSON export can be downloaded, inspected, externally processed and returned as a validated proposal. Importing the proposal alone does not change the plan.

### AC-08 Explicit apply
An Athlete or assigned Coach can explicitly apply a supported proposal once; prior/new versions and actor are auditable.

### AC-09 Data export
An Athlete can export their own longitudinal data. An unassigned Coach cannot export it.

### AC-10 Deployment
The app is reachable only through Authentik at the configured public origin; PostgreSQL is private and no public application bypass exists.

## 17. AI/ML architecture and data strategy

**Current phase:** KI-ready, not KI-dependent.

- Data acquisition, normalization, deterministic rule/safety boundary, model inference and result application remain separable.
- The deterministic export is the MVP baseline.
- Ground truth includes completed sessions, tests, athlete subjective response, accepted/rejected proposals and subsequent outcomes.
- Provider-derived wearable scores remain context-only unless separately validated.
- Future models are evaluated for contract validity, safety-rule adherence, recommendation consistency, uncertainty/calibration and downstream acceptance/outcomes.
- Model/version/provider provenance is mandatory for generated proposals.
- Plan revisions and reasoning runs remain append/audit oriented for rollback.
- No retraining or self-learning occurs implicitly from user data.

## 18. Migration and compatibility

- Existing athlete data, activities, source records, completed sessions and plan history remain valid.
- Schema changes are additive forward PostgreSQL migrations.
- Existing athlete self-service remains operational after role extension.
- Existing Authentik stable subjects retain identity continuity.
- Existing FIT/C2/RP3 dedupe semantics MUST not regress.
- Existing Skillz specialist/adaptation interfaces remain compatible unless explicitly versioned.

## 19. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Coach sees wrong athlete | explicit assignment + server-side authorization on every target + actor/target UI context + tests |
| Plan contract drift | canonical Skillz ownership + version/hash/provenance + adapter only |
| Subjective data overwritten | authorship + separate coach notes + auditable updates |
| Duplicate actual sessions | preserve source dedupe and one-completed-session invariant |
| Test estimates mistaken for measurements | mandatory measurement class |
| LLM leaks excess data | deterministic minimized inspectable export |
| LLM mutates plan | proposal-only + schema gate + explicit apply |
| Second Brain becomes raw data lake | no v1 writes; promotion contract only |
| Privacy incomplete at scale | export in MVP; deletion/retention is rollout gate |

## 20. Sequencing principles

After explicit SPEC approval, vertical slicing SHOULD prioritize:

1. role/assignment authorization and regression protection;
2. canonical plan-import adapter;
3. journal subjective fields + Soll/Ist convergence;
4. performance-test domain;
5. deterministic adaptation handoff;
6. self-service export;
7. integrated FIT/journal polish;
8. deployment verification at `sportjournal.ratzeburg-ai.de`.

Garmin cloud, embedded LLM and Athlete Second Brain remain later increments.

## 21. Decisions, assumptions and open items

### Accepted decisions
- DEC-001 Coach is a first-class v1 user with explicit assignment.
- DEC-002 Manual-first adaptation and no automatic Second-Brain writes.
- Post-session subjective field set is confirmed.
- Performance-test catalogue is confirmed including RowErg 500m and 1,000m.
- Self-service export is confirmed for MVP.

### Reversible implementation assumptions
- User-facing Coach↔Athlete assignment management is deferred; v1 may use an operator-controlled mechanism.
- Exact relational table/endpoint names are implementation details behind normative authorization/data contracts.
- Transport packaging of canonical Skillz companion planning artifacts may use an app import envelope but may not redefine sport-science semantics.

### Open blockers
None for specification content.

The specification was explicitly approved by the user on 2026-09-27 and is released to `spec-to-vertical-issues`.
