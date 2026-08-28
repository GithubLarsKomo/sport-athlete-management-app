# Sport Athlete Management App — MVP SPEC

## Goal

Provide a fast athlete-facing daily WebApp that persists training state and acts as the operational adapter between an athlete, device/service observations and the sport-domain reasoning in `GithubLarsKomo/skillz`.

## Product boundary

The product owns authentication, storage, API, UI, audit, device/service adapters and deployment. `skillz` remains the source of sport-science decision logic. The app may validate contract shape, compute explicitly defined deterministic persistence helpers and enforce safe infrastructure fallbacks, but must not silently fork training-domain rules.

Garmin or another wearable provider is a source of observations and optional provider-derived context. It is not the authoritative readiness, health or training-decision engine.

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

## Health/wearable extension acceptance criteria

This extension is additive to the MVP and follows `docs/garmin-health-baselines.md`.

- Passive wearable sync never replaces the Morning Check.
- Objective/passive metrics retain source, provider/device/method provenance, quality, metric class and decision role.
- Provider-derived scores such as Garmin Training Readiness, Body Battery, Sleep Score, Training Status or Fitness Age are at most contextual/display inputs and cannot independently mutate a plan.
- Individual biometric baselines use compatible data series and explicit coverage/quality.
- Health Drift is a transparent multisignal baseline-deviation state, not a diagnosis.
- Body-composition data retain method/quality; BIA, DXA, scale and tape measurements are not silently merged.
- Biological Age, Pace of Aging, Lifespan Meter, Metabolic Capacity/Momentum and a universal Health score are not authoritative product constructs.
- Safety flags, pain, illness and explicit medical restrictions override favorable wearable context.
- Every derived baseline/anomaly/adaptation state remains reconstructable from stored inputs and audit history.

## Non-goals

- no diagnosis, treatment or medical clearance
- no local replacement of the Skillz adaptation engine
- no vendor-readiness score as autonomous training regulator
- no Biological Age / Pace of Aging / Lifespan prediction
- no direct equivalence between consumer BIA and DXA
- no music/psychology module in MVP
- no coach multi-athlete dashboard in MVP
