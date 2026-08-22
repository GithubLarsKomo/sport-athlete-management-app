# Sport Athlete Management App — MVP SPEC

## Goal

Provide a fast athlete-facing daily WebApp that persists training state and acts as the operational adapter between an athlete and the sport-domain reasoning in `GithubLarsKomo/skillz`.

## Product boundary

The product owns authentication, storage, API, UI, audit and deployment. `skillz` remains the source of sport-science decision logic. The app may validate contract shape and enforce safe infrastructure fallbacks, but must not silently fork training-domain rules.

## MVP acceptance criteria

- Authenticated requests resolve to exactly one athlete identity.
- Athlete profile is versioned rather than overwritten without history.
- Goal/context and today's planned session can be retrieved.
- Morning check-in can be completed in under roughly 40 seconds.
- Completed sessions store duration, sRPE and derived session load.
- Adaptation evaluation sends a complete input snapshot to the configured Skillz service.
- When no Skillz service is configured or it fails, no training modification is invented; an auditable `review_required` decision is stored.
- Every write produces an audit event.
- The app can be globally disabled with `APP_STATUS=inactive` and then returns HTTP 503 except for `/healthz`.
- Production proxy authentication requires a shared secret and refuses development identity mode.

## Non-goals

- no diagnosis, treatment or medical clearance
- no local replacement of the Skillz adaptation engine
- no wearable ingestion in MVP
- no music/psychology module in MVP
- no coach multi-athlete dashboard in MVP
