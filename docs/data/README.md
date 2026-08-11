# `docs/data/` publication contract

These GeoJSON and JSON files are the browser-facing payloads loaded by `docs/app.js`. Filenames and optional gzip fallback behavior are unchanged; the building lookup and neighborhood-surface schemas include the diagnostic access fields documented below. Each generated file has one stage owner:

| Owner | Files |
| --- | --- |
| `export_web` | `buildings_accessibility.geojson` + `.gz`; `buildings_lookup.json` + `.gz`; `amenities_new.geojson`; `street_lights.geojson` + `.gz`; `amenities_all.geojson` + `.gz`; `trees.geojson` + `.gz`; `parks.geojson`; `isochrones.geojson` + `.gz` |
| `shade` | `shade_si.geojson` + `.gz` |
| `neighborhoods` | `neighborhoods.geojson`, `neighborhood_surface.geojson`, `neighborhood_charts.json` (includes `distributions_weighted` / `distributions_expanded` shared-edge per-hood histograms), `citywide_stats.json` |
| `survey` | `survey_results.geojson` |
| checked-in/manual companion | `education.geojson` |

`run all` carries prepared amenity, scoring, and isochrone frames through the stages before publication. Standalone stages retain disk-backed fallbacks. Neighborhoods intentionally reads the rounded published building geometry from this directory (plain or gzip) so its aggregates match the data served to the map.

Do not change a filename or add a new companion without updating the corresponding writer and the URL constants in `docs/app.js`.

`amenities_new.geojson` persists `amenity_subtype` for every Education and Health record. Its exact vocabulary is `school`, `kindergarten`, `clinic`, and `tipat_halav`: Education uses `school` (94) and `kindergarten` (412); Health uses `clinic` (45) and `tipat_halav` (14). Migration provenance: Health classifications were transferred once from the historical `fdac95d:new-data/new-data/health.geojson` `ID` values (`0`/`2` = `clinic`, `1` = `tipat_halav`) and then persisted in the clean manifest. Pipeline validation requires all four tokens and never reconstructs them from coordinates or row order.

`buildings_accessibility.geojson` and `buildings_lookup.json` publish the diagnostic fields `access_school_10min`, `access_kindergarten_10min`, `access_clinic_10min`, and `access_tipat_halav_10min`. `neighborhood_surface.geojson` publishes their unsuffixed surface equivalents: `access_school`, `access_kindergarten`, `access_clinic`, and `access_tipat_halav`.

These are diagnostic, non-weighted fixed-rule access fields. V1 publishes no `avg_access_*` neighborhood fields.

`survey_results.geojson` is a standalone public derivative that combines the four survey prompt exports and omits `submission_id`. It does not feed scoring.
