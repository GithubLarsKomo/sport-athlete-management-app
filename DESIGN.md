# DESIGN.md — Sport Athlete Management

## Direction

**Training control console.** The UI should feel like a focused athlete dashboard rather than a generic wellness app: dark technical chrome, calm light work surfaces, compact hierarchy, strong day/week orientation and restrained semantic color.

This project uses the canonical Skillz `sport-performance` profile as its visual default. The former local green/pine palette is superseded by this shared Sport Performance system.

## Shared family

Sport Athlete Management and `master-diagnostics` share the same design grammar and the same canonical Sport Performance palette:

- navy/dark technical application chrome;
- calm light work surfaces;
- system-first geometric sans typography;
- compact spacing and high information density;
- large radius only for major surfaces, smaller radius for controls;
- semantic status colors with text labels, never color alone;
- subtle borders and shadows rather than glassmorphism;
- minimal motion, limited to focus/hover/loading feedback.

Product identity differs through hierarchy and emphasis, not through incompatible brand colors.

## Sport Performance profile

Source of truth: `Skillz / frontend-design-system-context / brand-profiles / sport-performance.json`.

### Canonical brand tokens

```css
--sport-navy: #173652;
--sport-dark: #1C2B3A;
--sport-body: #24313E;
--sport-teal: #246F6C;
--sport-teal-bright: #2B8884;
--sport-muted: #6B7785;
--sport-energy: #B54708;
--sport-success: #2E7D32;
--sport-warning: #9A6500;
--sport-critical: #B42318;
--sport-recovery: #6D5BD0;
--sport-border: #D6E0E6;
--sport-surface: #EDF3F6;
--sport-surface-subtle: #F6F8F9;
--sport-warning-surface: #FFF4D6;
--sport-white: #FFFFFF;
```

These values are canonical and must not be silently replaced by framework or template defaults. Project/component aliases may reference them. Derived UI colors are allowed only when their base token and purpose are documented and traceable.

### Semantic defaults

- primary: Navy
- secondary / info: Teal
- accent: Energy
- success: Success green
- warning: Warning ochre
- danger / stop: Critical red
- recovery / readiness: Recovery violet
- text: Body
- muted text: Muted
- background: White
- surface: Surface
- border: Border

`teal_bright` is for charts, accents and focus rather than normal text on a filled background. `critical` is reserved for risk, injury, destructive or genuine stop states. `recovery` is reserved for recovery/readiness or an explicitly documented analytic dimension.

## Typography

Use a local/system font stack. No external font dependency is required for the core app.

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

- Page/product title: compact and heavy.
- Current session title: strongest content heading.
- Section titles: 1.05–1.4rem, 750–800 weight.
- Eyebrows: 0.72rem, uppercase, 0.12–0.15em tracking.
- Training numbers and version values: tabular numerals where useful.
- Body: 0.9–1rem, line-height ~1.5.

## Layout

### Application chrome

The top bar carries product identity, athlete identity and compact profile/runtime state. It is not a marketing hero.

### Content shell

- max width: 1180–1240px;
- desktop horizontal padding: 24–32px;
- mobile horizontal padding: 12–16px;
- vertical rhythm: 16 / 20 / 28 / 40px.

## Information hierarchy

The default athlete flow is:

1. Today's planned session and current adaptation state.
2. Morning check if not yet completed.
3. Weekly plan with today visually anchored.
4. Post-session capture when a session is active/completable.
5. Adaptation proposal and explicit apply action.
6. Specialist context.
7. History and detailed profile context.

Avoid forcing every section into an equal-weight card. Repeated operational items should use lists, strips or compact tiles as appropriate.

## Today surface

- Today's session title is the strongest heading below the product header.
- Show duration/intensity/type/version as concise facts rather than a paragraph.
- Adaptation state sits next to today's plan only when it changes the athlete's decision.
- If there is no actionable state, use visually quiet neutral text rather than a loud badge.

## Morning check

- Optimize for repeated completion in 20–40 seconds.
- Keep labels short and input targets >= 44px.
- Prefer compact 1–5 controls/selects that remain keyboard and touch accessible.
- Pain and illness inputs receive more visual importance than routine comfort fields when non-zero/non-empty.
- The save action is singular and obvious.

## Week plan

- Today must be visually anchored.
- Completed, modified and cancelled sessions remain readable without relying on opacity alone.
- Version state is secondary metadata, not a dominant badge.
- On narrow screens, use a single-column chronological list rather than cramped mini-cards.

## Adaptation

- Present `GREEN / YELLOW / ORANGE / RED` with text meaning and rationale.
- Avoid implying medical clearance.
- A revision preview is visually distinct from the currently active plan.
- `Adaptation anwenden` is available only when the proposal is valid and version-bound.
- Never use a dramatic red full-screen treatment unless there is a genuine stop/safety condition.
- Adaptation color is a secondary cue; the textual state and rationale are mandatory.

## Specialist context

Specialist artifacts are evidence/context, not a second dashboard. Group by relevance and recency. Avoid a generic 3-column card wall when a compact ordered list communicates priority better.

## Forms

- labels above controls;
- min control height 44px;
- helper text near the field;
- two columns only where the relationship is obvious and the viewport supports it;
- mobile collapses cleanly to one column;
- error/success messages remain adjacent to the action.

## Buttons

- primary: filled Navy;
- secondary: neutral surface + border, Navy text;
- destructive/stop: Critical red only when semantically required;
- Energy orange is an accent, not a default CTA color;
- no more than one visually dominant action per local surface.

## Data visualization

Canonical series order:

1. Navy
2. Bright Teal
3. Energy
4. Critical
5. Recovery
6. Success

Always combine color with labels, markers, line styles, symbols or shapes. Never encode a training/safety decision by color alone.

## Accessibility

- WCAG AA contrast target for normal text;
- visible `:focus-visible` on links, buttons and form controls;
- status always includes text/meaning, not color alone;
- touch targets >= 44px;
- reduced-motion preference respected;
- native semantic controls preferred.

## Brand assets

Logo, favicon and app icon must form one coherent Sport Performance family and use the same canonical color system. Do not introduce unrelated framework/default-color branding. Dedicated brand assets can be added later without changing this palette contract.

## Motion

Use only short functional transitions (roughly 120–180ms). No entrance choreography, parallax or ambient animation.

## Anti-patterns

Reject:

- equal-weight generic card grids;
- giant marketing heroes;
- gradient text;
- decorative glassmorphism;
- arbitrary stock/generated fitness imagery;
- opaque readiness scores;
- excessive pills/badges;
- modal-first repeated workflows;
- decorative progress rings without a clear decision purpose;
- local green/pine brand tokens that compete with the canonical Sport Performance profile.

## Review checklist

A surface is ready when:

- today's action is obvious within seconds;
- routine capture is fast on phone and tablet;
- status and rationale are clear without opening a second surface;
- cards are used only for meaningful object boundaries;
- the UI does not look like a generic fitness dashboard;
- keyboard focus, contrast and touch sizes are correct;
- plan/version provenance is visible where it matters;
- canonical Sport Performance token values remain intact;
- derived colors are traceable;
- charts and status states remain understandable without color.
