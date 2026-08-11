# `docs/data/` publication contract

These GeoJSON and JSON files are browser-facing payloads loaded by `docs/app.js`. Filenames and gzip fallback behavior are stable. One stage owns each generated artifact:

| Owner | Files |
| --- | --- |
| `export_web` | `buildings_accessibility.geojson` + `.gz`; `buildings_lookup.json` + `.gz`; `amenities_new.geojson`; `street_lights.geojson` + `.gz`; `amenities_all.geojson` + `.gz`; `trees.geojson` + `.gz`; `parks.geojson`; `isochrones.geojson` + `.gz` |
| `shade` | `shade_si.geojson` + `.gz` |
| `neighborhoods` | `neighborhoods.geojson`, `neighborhood_surface.geojson`, `neighborhood_charts.json`, `citywide_stats.json` |
| `survey` | `survey_results.geojson` |
| checked-in/manual companion | `education.geojson` |

`run all` carries prepared amenity, scoring, and isochrone frames through publication. Standalone stages retain disk-backed fallbacks. Neighborhoods intentionally reads the rounded published building geometry (plain or gzip) so its aggregates match the browser payload. Do not change filenames or add companions without updating writers and `docs/app.js` URL constants.

## Urban95 status contract

Building and lookup records publish canonical status tokens: `disappointing`, `functioning`, `thriving`, and `unknown`. The overview is `u95_status_5min`, `u95_status_10min`, and `u95_status_15min`; categories use `u95_status_<category>_<minutes>`; scored indicators use `u95_status_sub_<category>_<indicator>_<minutes>`; diagnostics use `u95_status_detail_<category>_<parent>_<child>_<minutes>`. The browser uses `_10min`.

The equivalent neighborhood-surface fields omit the minute suffix: `u95_status`, `u95_status_<category>`, `u95_status_sub_<category>_<indicator>`, and `u95_status_detail_<category>_<parent>_<child>`. Building, lookup, and surface artifacts never publish a numeric Urban95 total or `score_weighted*` field. They retain raw measurements needed for explanation and all existing `score_expanded*` Amenities Focus fields.

Urban95 has five equally influential overview categories: Environmental Quality, Nature, Play, Safety & Mobility, and Family Services. Direct scored children contribute equally within each category. School/Kindergarten and Clinic/Tipat Halav are diagnostic statuses only, excluded from category and overview means. Direct low/middle/high attainment remains internal; means classify as Disappointing below `0.25`, Functioning from `0.25` to below `0.75`, and Thriving from `0.75` through `1.00`. Any required Unknown makes the parent Unknown; Unknown is never dropped or converted to zero.

Neighborhood and city summaries publish four counts and percentages for every selectable Urban95 prefix: `<prefix>_count_disappointing`, `_functioning`, `_thriving`, `_unknown`, and matching `_pct_*` fields. Prefixes are `u95`, `u95_<category>`, `u95_sub_<category>_<indicator>`, and `u95_detail_<category>_<parent>_<child>`. Area headline fields use the matching `<prefix>_status`, `<prefix>_support_count`, and `<prefix>_summary_reason`. A headline is a unique unweighted predominant status; otherwise it is Unknown. Reasons are `predominant`, `predominantly_unknown`, `tie`, or `no_buildings`. Unknown stays in the count denominator. Surface cells publish the status, support count, and reason; compositions remain in neighborhood/city summaries.

`amenities_new.geojson` persists `amenity_subtype` for Education and Health records: `school`, `kindergarten`, `clinic`, and `tipat_halav`. Pipeline validation requires all four tokens and does not reconstruct them from coordinates or row order. `survey_results.geojson` is a standalone public derivative that combines four survey prompt exports and omits `submission_id`; it does not feed scoring.
