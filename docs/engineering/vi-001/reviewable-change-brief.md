# VI-001 / Issue #21 — Reviewable Change Brief

Status: implementation complete; ready for two-axis review  
PR: #29  
Implementation evidence head: `e9f6693bc9cce02c0ddf0df1bc989e24cc7e9d77`

## Outcome delivered

The application now separates the authenticated actor from the target athlete.

- Authentik still authenticates a stable subject.
- The application owns the `athlete|coach` role.
- Athlete users remain scoped to their own athlete record.
- Coach users must have an active explicit Coach↔Athlete assignment.
- The Coach-selected athlete is visible in the UI and is carried as an untrusted target selector.
- Server authorization validates the assignment before any athlete-scoped route is reached.
- Allowed Coach access is audited with actor and target.
- Revocation takes effect on the next request.
- Athlete-authored subjective writes are not permitted through Coach privilege.

## Deliberately allowed Coach mutations in the current codebase

Until later verticals add their own explicit endpoints, Coach mutation is limited to:
- versioned plan import/update through `PUT /api/v1/planning/active`;
- adaptation evaluation;
- explicit supported adaptation apply.

Profile writes, goals creation, device imports, journal writes/merges, Morning Check and session completion are denied for Coach.

## Operator workflow

No public Admin API was added. v1 assignment administration uses:

```bash
npm run coach:access -- grant <authentik-coach-subject> <athlete-id> "Coach name"
npm run coach:access -- revoke <authentik-coach-subject> <athlete-id>
```

## Verification

GitHub Actions run `36334290860` on `e9f6693bc9cce02c0ddf0df1bc989e24cc7e9d77` passed:
- unit/HTTP tests;
- syntax check;
- PostgreSQL migration including 006;
- readiness;
- integration tests against PostgreSQL 18.6;
- reconciliation;
- Docker build.

The real integration case proves grant → authorized HTTP access → audit → revoke → 403.

## Explicit non-goals preserved

- no user-facing Admin console;
- no organization/team hierarchy;
- no Authentik group shortcut granting global access;
- no self-hosted runner;
- no deployment claim;
- no Coach impersonation of athlete-authored subjective input.
