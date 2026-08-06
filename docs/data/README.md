# `docs/data/` publication contract

These GeoJSON and JSON files are the browser-facing payloads loaded by `docs/app.js`. Filenames, schemas, and optional gzip fallback behavior are unchanged. Each file has one stage owner:

| Owner | Files |
| --- | --- |
| `export_web` | `buildings_accessibility.geojson` + `.gz`; `buildings_lookup.json` + `.gz`; `amenities_new.geojson`; `street_lights.geojson` + `.gz`; `amenities_all.geojson` + `.gz`; `trees.geojson` + `.gz`; `parks.geojson`; `isochrones.geojson` + `.gz` |
| `shade` | `shade_si.geojson` + `.gz` |
| `neighborhoods` | `neighborhoods.geojson`, `neighborhood_surface.geojson`, `neighborhood_charts.json` (includes `distributions_weighted` / `distributions_expanded` shared-edge per-hood histograms), `citywide_stats.json` |
| `survey` | `survey_results.geojson` |

`run all` carries prepared amenity, scoring, and isochrone frames through the stages before publication. Standalone stages retain disk-backed fallbacks. Neighborhoods intentionally reads the rounded published building geometry from this directory (plain or gzip) so its aggregates match the data served to the map.

Do not change a filename or add a new companion without updating the corresponding writer and the URL constants in `docs/app.js`.

`survey_results.geojson` is a standalone public derivative that combines the four survey prompt exports and omits `submission_id`. It does not feed scoring.
