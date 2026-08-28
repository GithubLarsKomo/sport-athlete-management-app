# Garmin Health, Baselines and Body Composition Integration

Status: architecture/design contract  
Canonical reasoning rules: `GithubLarsKomo/skillz`

## Goal

Extend Sport Athlete Management with passive Garmin/health data while preserving the existing athlete-management control loop. Garmin is a provider of observations and optional workout delivery, not an autonomous readiness or medical decision system.

## Product rules

- Keep one Sports Journal / Athlete Management product; do not create a parallel Health Twin.
- Keep the Morning Check even when passive sync is available.
- Preserve raw/provider provenance before deriving baselines or Health Drift.
- Distinguish direct sensor data from proprietary provider scores.
- Never let a single vendor score control training.
- Keep Body Composition method-aware: BIA, DXA, scale and tape measurements remain distinct series.
- Do not expose Biological Age, Pace of Aging, Lifespan Meter, Metabolic Capacity or a universal Health score as authoritative product constructs.

## Data flow

```text
Garmin activity/FIT ───────────────┐
Concept2 / RP3 ────────────────────┤
                                  ├─> canonical athlete timeline
Garmin passive health ─────────────┤
Morning Check / symptoms ──────────┤
Body measurements ─────────────────┘
                                         |
                                         v
                              baseline / Health Drift
                                         |
                                         v
                               Skillz adaptation engine
                                         |
                              explicit versioned revision
                                         |
                                optional Garmin workout
```

## Metric classification

Persist or normalize objective/passive metrics with:

- `metric_class`: `direct_sensor | provider_derived | journal_derived | reference_measurement | manual_measurement`
- `decision_role`: `primary_evidence | context_only | display_only | excluded_from_adaptation`
- `quality_flag`
- provider/device/method provenance
- `comparable_series_id` where a method/device boundary matters

Examples:

| Metric | Class | Default role |
|---|---|---|
| Resting HR | direct_sensor | primary_evidence |
| Nocturnal HRV | direct_sensor | primary_evidence |
| Respiration | direct_sensor | primary_evidence/context |
| Skin-temperature delta | direct_sensor | context |
| SpO₂ | direct_sensor | context |
| Garmin Training Readiness | provider_derived | context_only |
| Garmin Body Battery | provider_derived | context_only |
| Garmin Sleep Score | provider_derived | context_only |
| Garmin Fitness Age | provider_derived | display_only |
| Health Drift | journal_derived | context_only until multisignal rules are satisfied |
| DXA body fat / lean mass | reference_measurement | longitudinal/reference context |
| BIA body fat | manual/provider measurement | trend context |

## Baselines

`biometric_baselines` should hold robust personal references for compatible data series. A baseline record needs at least metric, window, center, lower/upper range, observation count, method, data quality and comparable-series identity.

A baseline must not be activated with insufficient observations. Missing data are not normal values.

## Health Drift

`biometric_anomalies` and the derived Health Drift state describe deviations, not diagnoses.

Suggested states:

- normal
- elevated
- persistent
- resolving
- unknown

Escalation requires persistence, multiple signals or compatible symptoms/safety context. An isolated HRV/SpO₂/temperature deviation stays contextual.

## Body measurements

Add a method-aware body measurement model for:

- body mass
- waist circumference
- waist-height ratio
- body fat
- fat mass
- fat-free/lean mass
- BMD only when actually measured with an appropriate method

Suggested quality classes:

- reference
- validated_consumer
- consumer_estimate
- manual_context
- unknown

Never label consumer BIA-derived “bone density” as DXA-like BMD.

## Adaptation boundary

The product sends the authoritative athlete snapshot to Skillz. Product code must not locally invent a training decision from wearable scores.

The snapshot may contain provider-score context, but Skillz must be able to identify the underlying responsible signals. A favorable vendor score never overrides pain, illness, explicit restrictions or red flags.

## UI

Primary athlete trend views should be domain-based:

1. Recovery
2. Training tolerance
3. Performance capacity
4. Physiological stability
5. Body / Energy context

Do not create a single composite Health/Readiness/Longevity score.

Provider scores, when shown, belong in secondary device context with provider labeling.

## Future Garmin adapters

The adapter layer may later support:

- passive Garmin health summaries,
- device connection/consent state,
- sync status,
- workout publication through Garmin Training APIs where available.

The existing FIT/TCX activity ingestion and cross-provider deduplication remain unchanged.

## Acceptance criteria

- passive metrics retain provenance and classification;
- Morning Check continues to work with and without Garmin;
- provider-derived scores cannot independently mutate a plan;
- individual baselines and Health Drift are explainable;
- body-composition methods remain distinct;
- safety signals override favorable wearable context;
- every derived state and plan revision remains auditable.
