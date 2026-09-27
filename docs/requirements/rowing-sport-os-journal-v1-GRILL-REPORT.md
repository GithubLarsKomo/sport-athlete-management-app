# Rowing Sport OS / Sport Journal v1 — GRILL REPORT

Status: completed  
Definition: `rowing-sport-os-journal-v1@0.1.0`  
Definition source: `GithubLarsKomo/grilling/examples/rowing-sport-os-journal-v1.json`  
Completed: 2026-09-27

## Goal

Close the remaining product decisions required to specify the first production-capable Rowing Sport OS / Sport Journal increment on top of the existing Sport Athlete Management App.

## Confirmed context

- Existing producer repository remains `GithubLarsKomo/sport-athlete-management-app`.
- Hetzner/Coolify deployment.
- Initial public origin `https://sportjournal.ratzeburg-ai.de`.
- Authentik-protected access.
- PostgreSQL remains the operational source of truth.
- Canonical Skillz training-plan artifacts remain the sport-science source of truth.
- MVP works without an embedded LLM.
- Garmin FIT import is included in MVP.
- Garmin cloud APIs are later adapters.
- LLM output is proposal-only; no automatic plan mutation.
- Raw athlete telemetry remains in the app database, not in Second Brain.

## Confirmed R1 decisions

### R1-01 — v1 user model

**Decision:** Athlete + Coach are first-class v1 application users.

A coach may access only athletes explicitly assigned to that coach. Authentication remains Authentik-based. Cross-athlete access without an active assignment is forbidden.

### R1-02 — post-session subjective capture

**Decision:** v1 post-session journal captures:

- mandatory Session-RPE 0–10;
- perceived difficulty relative to expectation: easier / as expected / harder;
- optional pain 0–10;
- structured deviation reason;
- optional free-text comment.

Additional post-session fatigue, muscle-feel and motivation scales are not required in v1 because related context is already available through the Morning Check.

### R1-03 — structured performance-test catalogue

**Decision:** v1 includes:

- RowErg 500 m;
- RowErg 1,000 m;
- RowErg 2,000 m;
- RowErg 5,000 m;
- RowErg 30 min;
- RowErg lactate step test;
- bike lactate step test;
- configurable staged protocol.

All tests distinguish measured values, derived values and assumptions/estimates.

### R1-04 — data portability

**Decision:** self-service data export is part of MVP. A complete deletion/retention workflow is a mandatory release gate before broader multi-user production rollout.

### R1-05 — Athlete Second Brain

**Decision:** v1 prepares the governed contract boundary only. No automatic athlete-specific Second-Brain persistence is enabled in v1. Raw telemetry never leaves the operational store for Project Memory. Later promotion is limited to confirmed, evidence-referenced learnings.

## Remaining product decisions

None blocking the v1 specification.

## Routing

`conversation-to-spec`.
