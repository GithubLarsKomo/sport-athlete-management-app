# Binding Design Template — Sport Athlete Management

## Status

This file is normative for the Sport Athlete Management UI.

The accepted **Impeccable UI/CSS is the binding layout template**. The Sport Performance system is applied as a branding overlay only.

## Binding layer separation

### Impeccable UI layer — frozen by default

Preserve the accepted implementation of:

- application shell and header/navigation proportions;
- content width and responsive breakpoints;
- grid/card/list layout and operational hierarchy;
- typography scale, weights and hierarchy;
- spacing and vertical rhythm;
- radii, borders and component geometry;
- training, adaptation, readiness and athlete modules;
- information density and hierarchy;
- responsive/mobile behavior;
- focus, hover, loading, empty and error interaction patterns.

A branding, logo, favicon, app-icon or palette task MUST NOT redesign these elements.

### Sport Performance branding layer — allowed scope

Only the following may change for branding work:

- canonical `sport-performance` color tokens and semantic color aliases;
- Sport Athlete Management product mark and wordmark/lockup;
- favicon;
- app/PWA icons;
- chart/status colors where the existing component already exposes semantic color;
- PWA/theme metadata required to register the brand.

The Sport Athlete Management mark remains the athlete/development/adaptation member of the shared Sport family.

## Literal rule for branding-only work

If the task is phrased as **"only logos and colors"** or equivalent, all non-color CSS/layout and UI structure must remain unchanged or behaviorally equivalent. Any unavoidable technical integration difference must be minimal and documented.

## Visual reference

The confirmed 2026-08-26 Sport Performance proposal is the visual reference for the branding layer: Navy technical chrome, Teal/Bright Teal athlete/training accents, restrained semantic state colors and the product-specific athlete/adaptation mark. It does **not** authorize a replacement of the accepted Impeccable layout.

## Acceptance gate

Before merge, verify:

1. no unintended layout/grid/card/navigation/typography/spacing diff;
2. canonical Sport Performance color values are intact;
3. current Sport Athlete Management logo/favicon/app icons are used;
4. WCAG AA and no-color-only semantics remain satisfied;
5. responsive behavior matches the accepted Impeccable implementation.

A failed item is a regression unless an explicit UI redesign was separately approved.
