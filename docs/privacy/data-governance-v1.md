# Data Governance and Privacy Rollout Gate — v1

Status: engineering release contract for Rowing Sport OS / Sport Journal v1  
Owner: sport-athlete-management-app  
Requirements: REQ-DATA-001–004

## Purpose

This document defines the technical handling of athlete data for the v1 rollout gate. It is an engineering control, not a jurisdiction-specific legal retention opinion. Production-specific durations and infrastructure values must be recorded from the deployed system before broad multi-user rollout.

## Data portability

Authenticated Athletes can create a structured JSON self-export. An actively assigned Coach may create the same athlete-scoped export through the existing server-side assignment boundary.

The export contains the longitudinal application record: account metadata, profile history, goals, competitions, plan structures and revisions, journal/completions, canonical activity summaries, check-ins, performance testing, adaptation history, specialist artifacts and relevant athlete-scoped audit events.

Provider source data is represented by provenance references only. The export includes provider, external activity identifier where available, source timestamps, SHA-256 raw hash, normalized summary and import timestamp. It does **not** embed provider raw payloads, sample streams or interval payloads.

The export contract recursively removes credential/secret-shaped fields. The authenticated export action itself is audited as `data.exported`.

## Live-data retention

For v1, application data remains in the primary datastore while the athlete account is active or until an approved deletion request is executed. This includes provider raw ingestion evidence currently stored in PostgreSQL for reconciliation/provenance.

No separate object-store copy of provider upload files is part of the v1 application architecture. If a later deployment introduces one, it must be added to both export/deletion inventory and this gate before use.

The product does not encode a universal legal retention duration. The production owner must record any jurisdictional or contractual retention requirement separately and must not extend retention by accident through undocumented infrastructure defaults.

## Athlete deletion/request procedure

Deletion is an operator-controlled v1 procedure rather than a self-service destructive UI.

1. Verify the requester and athlete identifier through the operational support process.
2. Offer/create a data export first when requested or operationally appropriate.
3. Run `npm run privacy:delete -- --athlete=<athlete-id>` without `--execute` and review the dry-run record counts.
4. Enable the destructive path only for the bounded maintenance action with `PRIVACY_DELETE_ENABLED=true`.
5. Execute with both `--execute` and `--confirm=<athlete-id>`. Set `PRIVACY_OPERATOR_SUBJECT` to an auditable operator/service identity.
6. Verify that the athlete account and athlete-owned primary data are absent.
7. Verify that historical audit detail payloads are redacted while event metadata remains, and that `privacy.deletion_started` and `privacy.deletion_completed` remain in the security audit trail.
8. Record the request/ticket reference in the operational system without copying sensitive training payloads into logs or tickets.

The transaction deletes profiles, goals, competitions, plans/imports/revisions, check-ins, completed sessions, activities and provider raw records, journal data, tests, adaptation records, specialist records, coach assignment to that athlete and the athlete principal/account.

## Security audit treatment

`audit_log` is not deleted by the primary-data deletion transaction. As a bounded privacy-deletion exception, historical athlete-scoped `details_json` is replaced with a redaction marker before the live data is removed. Event type, entity reference, actor subject and timestamp remain as security/operational evidence; the new deletion-started/completed events retain only minimal deletion metadata.

The retained audit metadata may still contain the internal athlete identifier and actor subject and therefore remains access-controlled personal/security data. The production deployment must define and record an audit-retention window before broad rollout. Outside the documented privacy-deletion redaction step, normal application operations must not rewrite or silently prune audit evidence.

## Backups and restore windows

A live deletion cannot retroactively rewrite an already-created infrastructure backup. Deleted data may therefore remain recoverable only until the applicable backup expires.

Before broad rollout, VI-007 deployment evidence must record:
- backup mechanism and scope;
- maximum backup retention/expiry window;
- tested restore procedure;
- where deletion requests completed after the restored backup point are tracked.

Any restore to a point in time before a completed deletion must re-apply all later deletion requests **before restored service is exposed to users**. A restore is not complete until this deletion replay has been verified.

## Sensitive-data logging

The application HTTP layer parses bounded request bodies but does not log request bodies. Normal server logs are limited to startup/shutdown and error reporting; route audit records contain bounded metadata rather than journal, symptom, test or physiology payloads.

Production proxy/Auth gateway logging must be checked in VI-007. Request bodies must not be logged by default. Authorization/cookie headers and other credentials must not be emitted to ordinary access logs. Temporary diagnostics involving sensitive payloads require an explicitly bounded procedure and cleanup.

## Rollout gate

Broad multi-user production rollout is blocked until all of the following are verified:

- authenticated self-export works for Athlete;
- assigned-Coach export is athlete-scoped and audited; unassigned Coach is denied;
- provider raw file inclusion/exclusion is explicit in the export manifest;
- export contains no secrets and no raw provider samples/payloads;
- operator deletion dry-run and destructive procedure are tested;
- retained security-audit treatment is documented;
- production audit-retention window is recorded;
- production backup expiry/restore window is recorded and restore deletion replay is tested;
- application and production proxy logging are confirmed not to emit sensitive request bodies by default.

The implementation-owned controls are verified by automated tests. The infrastructure-specific checks are deliberately handed to VI-007/#27 and keep broad-rollout status blocked until recorded.
