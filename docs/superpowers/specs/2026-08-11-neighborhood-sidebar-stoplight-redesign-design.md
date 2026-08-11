# Neighborhood sidebar stoplight redesign

## Problem

The Urban95 scoring change replaced continuous neighborhood scores with categorical
status summaries: Disappointing, Functioning, Thriving, and Unknown. The current
neighborhood sidebar still uses the old score-era visual grammar in places and the
new composition view repeats full red/amber/green bars without a clear first signal.
The comparison view duplicates those compositions in two columns, which makes the
relationship between neighborhoods hard to scan.

## Goals

- Make a single neighborhood readable in a few seconds.
- Keep the existing Urban95 stoplight language used by the building explainer.
- Make comparison visual and row-by-row without paired score bars.
- Preserve all published status composition evidence and Hebrew labels.
- Keep the scoring/data contracts unchanged.

## Non-goals

- Do not reintroduce numeric Urban95 scores, percentiles, averages, ranks, or
  score-like comparison deltas.
- Do not change the Python scoring pipeline, status thresholds, or published fields.
- Do not redesign the building explainer itself.
- Do not change Amenities Focus behavior.

## Visual language

Use the existing `status-signal` / `status-signal-lamp` components from the building
explainer as the canonical status encoding:

- red active lamp = Disappointing
- amber active lamp = Functioning
- green active lamp = Thriving
- gray text/neutral treatment = Unknown

Neighborhood A/B colors (sky and lavender) are reserved for identity labels and
values. They must not replace the shared red/amber/green status semantics.

## Single-neighborhood hierarchy

1. **Hero**
   - Neighborhood name.
   - Existing large three-lamp stoplight readout and status label.
   - Building support line: matching status count out of total buildings.
   - One compact overall composition rail for context.

2. **At a glance**
   - Five fixed-order Urban95 category rows.
   - Each row uses the compact existing three-lamp signal, category label, and the
     matching published status share/count.
   - Rows are visually light and scannable; no full four-status legend is repeated.

3. **Focus areas**
   - Up to four subcategories with the clearest need for attention.
   - Disappointing indicators first; then Functioning indicators with the largest
     disappointing share.
   - Each row uses the same stoplight tag and a building share/count.
   - Unknown is reported as unavailable evidence, never treated as a weakness.

4. **Strong foundations**
   - Up to two Thriving subcategories using the same compact stoplight tag.

5. **Full status composition**
   - A collapsed details section containing the existing four-status composition
     rails and count/percentage rows for the overall view and category views.
   - The expanded section remains the audit surface for all four statuses.

## Comparison hierarchy

1. **Pair header**
   - Existing removable neighborhood chips remain.
   - Two side-by-side overall stoplight readouts, one for each neighborhood.
   - Each readout includes status and matching building share/count.

2. **Category comparison**
   - One compact two-lane card per category in fixed methodology order.
   - Lane A and lane B each use the compact existing three-lamp signal, status label,
     and matching status share/count.
   - Sky/lavender identify the lanes; red/amber/green remain status semantics.
   - No paired horizontal score bars and no winner/stronger language.

3. **Where they differ**
   - Show only subcategories whose published headline status differs between A and B.
   - Render each difference as the same two-lane stoplight card, with the category
     context visible and no derived score or comparison badge.
   - If no subcategory statuses differ, show a concise neutral empty state.

4. **Full status composition**
   - A collapsed details section exposes complete A/B four-status compositions for
     overall, category, and relevant subcategory views.

## Data rules

- Use the existing `statusCompositionPrefix` metadata and published `*_count_*` /
  `*_pct_*` fields.
- Headline status is the published `areaStatusKey` value (predominant status for the
  neighborhood summary).
- The visible share/count is the composition entry matching that headline status.
- Use the fixed category and subcategory definitions already supplied by the score
  model; do not infer labels from property-key strings.
- Preserve diagnostic-access behavior: if neighborhood averages are unavailable,
  show the existing unavailable explanation rather than fabricated zeroes.
- Keep `Unknown` neutral and visible in the full composition details.

## Implementation boundaries

- `docs/js/ui/neighborhoodPanelRender.js`: single-neighborhood status markup, focus /
  foundation selection, and full-composition disclosure markup.
- `docs/js/ui/neighborhoodCompareRender.js`: comparison hero, two-lane category rows,
  status-difference filtering, and full-composition disclosure markup.
- `docs/style.css`: scoped neighborhood single/compare cards, stoplight layout,
  spacing, RTL-safe labels, and responsive behavior. Reuse existing status-signal
  classes rather than duplicating lamp semantics.
- `docs/js/ui/neighborhoodSidebar.js`: only adjust orchestration if the renderers need
  additional context; keep loading and stale-render handling unchanged.
- Existing frontend contract tests remain the baseline. Add focused renderer tests
  for status-focused output and update only assertions that encode the old score-era
  neighborhood composition markup.

## Accessibility and responsive behavior

- Every stoplight readout has a text status label and an accessible name; lamps are
  decorative.
- Count/share values use tabular numerals and remain readable at the narrow sidebar
  width.
- Comparison lane order is explicitly labeled A/B and remains stable in RTL content.
- Details sections use native `details`/`summary` disclosure semantics.
- Reduced-motion behavior continues to suppress transitions.

## Verification

- Run focused frontend tests for neighborhood renderers, module contracts, and status
  composition behavior.
- Run the full `npm test` suite and distinguish unrelated pre-existing failures.
- Render the single and comparison sidebars at the existing desktop sidebar width and
  inspect the visual hierarchy against the four supplied references.
- Confirm no active neighborhood UI copy contains Urban95 score, percentile, average,
  rank, or winner language.
