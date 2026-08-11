# Neighborhood sidebar stoplight redesign

## Problem

Urban95 neighborhood summaries now use categorical statuses, but the neighborhood sidebar does not yet explain them with the same visual grammar as the building explainer. The attempted redesign made status-composition percentages and duplicated A/B layouts primary, producing dense rows that were difficult to interpret or compare.

## Goals

- Make the single-neighborhood view feel like the existing Urban95 building explainer.
- Compare two neighborhoods on one shared categorical stoplight scale so equality and difference are visible immediately.
- Keep red, amber, and green exclusively tied to Disappointing, Functioning, and Thriving.
- Preserve full Hebrew neighborhood names and accessible status text.
- Keep scoring and published data contracts unchanged.

## Non-goals

- Do not reintroduce numeric Urban95 scores, percentiles, averages, ranks, or deltas.
- Do not change the Python pipeline, status thresholds, or Amenities Focus.
- Do not redesign the building explainer.
- Do not perform automated or agent-driven live visual checks; the user owns visual verification.

## Single neighborhood: building-explainer parity

The neighborhood view reuses the building explainer's information hierarchy and visual primitives rather than maintaining a separate neighborhood-specific dashboard.

1. The header contains the neighborhood name and the same large `status-signal--hero` stoplight/status readout used by building mode.
2. The body starts with one compact neighborhood context line showing total buildings once. It does not show a support percentage, matching-status count, or composition rail.
3. The five Urban95 categories use the same building-mode disclosure structure:
   - category icon from the weighted indicator icon registry;
   - category taxonomy color from the score-model registry;
   - category label;
   - fixed-width `urban95-status-tag` with the canonical compact stoplight and status word.
4. Expanding a category reveals its subcategories using the same neutral-icon, indented status-row treatment as building mode.
5. The surface contains no per-indicator percentages, building counts, or secondary status-composition disclosure.
6. The attempted `At a glance`, `Focus areas`, and `Strong foundations` sections are removed; the building-style category tree is the single navigation and explanation structure.

## Comparison: shared-stoplight overlay

Comparison uses one categorical fixture per metric, not two independent columns.

1. The pair header keeps the existing removable full-name neighborhood chips. A full-name identity legend maps the first neighborhood to sky and the second to lavender; A/B shorthand is not shown to users.
2. The overall comparison hero is one large three-lamp stoplight. Each neighborhood is represented by a high-contrast identity-colored rail anchored above or below its published status position; the legend repeats that same spatial treatment.
3. If statuses differ, markers occupy different lamps and both selected lamps are active. If statuses match, both markers meet around the same active lamp with small opposing offsets so neither identity disappears.
4. Each category row contains:
   - the building-mode category icon and taxonomy color;
   - the category label;
   - one shared, deliberately prominent stoplight overlay carrying both neighborhood markers;
   - two stacked status readouts, each paired with the same sky/lavender identity rail used by its neighborhood in the legend.
5. The five category rows are disclosures. They remain collapsed in the overall view for a compact at-a-glance comparison, and each opens to the complete ordered indicator set for that category. A category opens automatically when it contains the active metric.
   - Subcategory rows use the same softer, indented hierarchy as the building/single explainer.
   - Education and Health are nested disclosures exposing their diagnostic indicators.
   - Equal statuses use one text readout with a half-sky/half-lavender rail; different statuses retain one identity-colored readout per neighborhood.
6. There is no selectively filtered `Where they differ` list and no secondary comparison-evidence disclosure.
7. Unknown is neutral: no red/amber/green lamp is activated for that neighborhood. Its identity marker moves to a small neutral `Unknown` anchor beside the fixture.

## Overlay semantics

- Lamp colors encode status only: red = Disappointing, amber = Functioning, green = Thriving.
- Sky/lavender encode neighborhood identity only and appear as outlines/notches, never as status fills.
- Full neighborhood names appear in the pair header/legend. Body fixtures repeat the identity rail beside each neighborhood's status text and use accessible full names without A/B letters.
- Decorative lamps and markers are `aria-hidden`; each shared fixture has an accessible label containing both full neighborhood names and their text statuses.

## Implementation boundaries

- `docs/js/ui/neighborhoodPanelRender.js`: building-style single-neighborhood category tree.
- `docs/js/ui/neighborhoodCompareRender.js`: shared overlay helper and complete category/indicator disclosures.
- `docs/style.css`: neighborhood-scoped building-parity adjustments and overlay fixture geometry.
- `docs/app.js`: inject existing building-explainer label/icon helpers into the neighborhood renderer context.
- Focused renderer and module-contract tests: assert structure, full names, overlay/same-status behavior, and absence of score-era copy.

## Verification

- Run focused renderer/module tests and the existing `npm test` suite.
- Run `git diff --check` and inspect the final file list.
- Do not run Playwright, screenshots, browser automation, or live visual checks. Hand the result to the user for visual verification.
