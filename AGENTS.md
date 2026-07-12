# Agent notes — urban95

Context for AI assistants and contributors working in this repository.

## What this project is

**Cities for Children — Beer Sheva streetscape accessibility.** Interactive map and GIS pipeline measuring how reachable everyday services and child-relevant features are on foot from residential buildings. Collaboration between **Urban95** and **NUR**.

- **Live site:** https://negevurbanresearch.github.io/urban95/
- **Upstream repo:** https://github.com/NegevUrbanResearch/urban95

## Architecture (two halves)

1. **Python GIS pipeline** (`src/`) — ingests raw GeoJSON under `data/` (and optional `filtered/`), calls Mapbox for walking isochrones, computes **Urban95** (methodology weights) and **Amenities Focus** (`expanded`) scores, writes full-precision artifacts to `output/` and simplified GeoJSON/JSON under **`docs/data/`** for the web app.
2. **Static map site** (`docs/`) — HTML/CSS/JS only (no bundler). MapLibre GL, Turf, deck.gl, Chart.js loaded from CDNs in `docs/index.html`. Data paths are relative (`BASE = "./data"` in `docs/app.js`).

## Local development

### Map UI (recommended path)

From the repository root (the dev server maps **`docs/data/`** to the map’s relative **`./data`** requests, matching `BASE = "./data"` in `docs/app.js`):

```bash
pip install -r requirements.txt
npm install
npm run start
```

Open **http://localhost:8080/docs/index.html**

`npm run start:docs` serves only `docs/`; relative `./data` URLs in `app.js` will not resolve unless you change `BASE` or mirror assets.

### Python environment

- Use a venv (`.venv/` is gitignored).
- Install: `pip install -r requirements.txt`
- **Preprocessing needs a Mapbox token** in a root `.env` file:

  ```text
  mapbox_access_token=YOUR_TOKEN
  ```

Optional tuning: `INDEX_SCORE_WORKERS` (Urban95 scoring), `ISOCHRONE_FETCH_WORKERS` (isochrones stage).

### Regenerating site data (order matters)

```powershell
$env:PYTHONPATH="src"
python scripts/seed_provisional_raw.py
python -m pipeline check
```

1. **Optional (usually first if you use it):** `python -m optional.filter` — clips layers into `filtered/` (legacy helper; `filtered/` is deprecated as a pipeline input — resolve from `data/raw/` via `core/paths.py`).
2. Raw GIS under `data/raw/` as registered in `src/core/paths.py` (see `python -m pipeline check`), plus shade SI under `data/raw/arcgis_shade/`, and `data/raw/amenities_clean.geojson` for the clean manifest.
3. **`python -m pipeline run shade`** — validates raw ArcGIS SI inputs, writes metric prepared scoring layers to **`output/shade_si/`**, calibration to **`output/shade_si_calibration.json`**, and a simplified web-only **`docs/data/shade_si.geojson`** (+ `.gz`). Run **before** building accessibility scoring.
4. **`python -m pipeline run all`** (or stage-by-stage: `isochrones` → `amenity_metrics` → `score` → `export_web`) — writes `output/buildings_scored.geojson` and publishes web layers via **`stages/export_web.py`** for its owned layers; shade and neighborhoods retain their separate publication ownership.
5. **`python -m pipeline run rescore`** — recompute Urban95 weighted columns (incl. shade SI) on existing published buildings without Mapbox/isochrones. Refreshes buildings (+gz), lookup (+gz), and companion publish layers (`amenities_new`, `street_lights`, `amenities_all`, `trees`, `parks`, `isochrones` when available) via `export_web`; rerun `python -m pipeline run neighborhoods` immediately afterward.
6. **`python -m pipeline run neighborhoods`** — requires building-level outputs in `docs/data/`; updates neighborhoods GeoJSON, `neighborhood_charts.json`, `citywide_stats.json`.
7. **Roads + spatial syntax (optional):** `python -m optional.download_osm_roads` → `docs/data/roads.geojson`, then `python -m optional.generate_spatial_syntax` → segment/zone GeoJSON under `docs/data/`.

### Layer-oriented pipeline behavior

The commands, filenames, schemas, and browser URL contracts are unchanged. During `run all`, named source frames are prepared/reused once; amenity and score work uses exact layer-by-layer/chunked reductions; street-light coverage uses exact threaded local unions; neighborhoods reuses one IDW geometry plan; and publication serializes each web layer once. Standalone stages keep their existing disk fallbacks. Neighborhoods intentionally rereads the rounded published building geometry so aggregates match the browser payload.

`PIPELINE_FORBID_MAPBOX=1` is an acceptance-only guard for a warm run. It validates the complete `(building_id, minutes)` aggregate and aborts before token/session/network work if any key is missing. With the variable unset, the existing Mapbox token/cache/API behavior remains in force.

Publication ownership is recorded in [`docs/data/README.md`](docs/data/README.md): `export_web` owns buildings + lookup, `amenities_new`, `street_lights`, `amenities_all`, `trees`, `parks`, `isochrones` and their specified gzip companions; `shade` owns `shade_si` and its gzip; `neighborhoods` owns `neighborhoods.geojson`, `neighborhood_surface.geojson`, `neighborhood_charts.json`, and `citywide_stats.json`.

### Quirks agents must respect

- **`folium` is in `requirements.txt` but is not imported by any file under `src/`** (may be legacy or notebook use).

## Frontend (`docs/`)

- **Entry:** `docs/index.html`, `docs/app.js`, `docs/style.css`.
- **Data URLs** are defined at the top of `docs/app.js` (`BUILDINGS_URL`, `AMENITIES_*`, `ISOCHRONES_URL`, neighborhoods, charts JSON, etc.). Filenames there must match what the pipeline produces (or what you commit).
- **Icons:** runtime loads from `./icons` relative to the published site → **`docs/icons/`**. There is also a top-level `icons/` directory; the app uses **`docs/icons/`** via `ICONS_BASE`.
- Some layers support optional `.gz` fetch via `fetchJsonWithGzipFallback`.
- **GitHub Pages:** publish from the **`docs/`** folder. `.gitignore` un-ignores **`docs/data/`** for deployment, but **`docs/data/buildings_accessibility.geojson`** is explicitly ignored — most generated GeoJSON under `docs/data/` is intended to be committed; verify `git status` for this repo’s current rules.

## Repository layout (concise)

| Path | Role |
|------|------|
| `docs/` | Static site + `data/` JSON/GeoJSON consumed by the map |
| `src/` | Preprocessing and scoring scripts |
| `data/` | Raw GIS inputs (gitignored empty checkout common) |
| `output/` | Full-precision pipeline outputs (gitignored) |
| `filtered/` | Legacy clipped outputs only (gitignored; deprecated as pipeline input) |

**`src/` packages:** `pipeline/` (CLI), `core/` (paths, preflight, geo_io, geojson_utils), `stages/` (shade, isochrones, amenity_metrics, urban95_scoring, export_web, neighborhoods, rescore), `lib/` (shade_si, urban95_weights, buildings_prep, buildings_lookup, amenity_layers), `optional/` (filter, download_osm_roads, generate_spatial_syntax, export_urban_nature_areas).

## Tooling expectations

- **No** `pyproject.toml`, Docker, Makefile, ESLint/Prettier/Ruff configs, or `.github/workflows` were present when `AGENTS.md` was written — confirm with a quick directory listing if that matters for your change.
- **`.gitignore`** excludes `.venv/`, `data/`, `output/`, `filtered/`, `node_modules/`, `.env`, with an exception so **`docs/data/`** can be tracked for Pages (see **Frontend** above for the `buildings_accessibility.geojson` carve-out).

## Scoring models (high level)

- **Urban95:** weighted category/subcategory model; weights and category functions live in `lib/urban95_weights.py`, attached by `stages/urban95_scoring.py` (`python -m pipeline run score`; see README for percentages).
- **Shade (Environmental Quality sub-score):** uses Beer Sheva BDAR **`summer_SI`** from Derech Tzel ([shading metrics guide PDF](https://tzel.org.il/wp-content/uploads/2025/08/Shade-Indicators_eng-2.6.pdf)) as-is — **SI, not SAI**, not recalculated. Building SI = **300 m area-weighted mean `summer_SI` around each building centroid**, then stored/displayed `summer_si` is **rounded to 1 decimal place with standard half-up ties before scoring/output** (`0.15 → 0.2`, `0.35 → 0.4`). Official SI interpretation buckets are `<0.10 severe lack`, `0.10–<0.20 significant lack`, `0.20–<0.40 needs improvement`, `0.40–<0.60 good shade`, `≥0.60 excellent shade`. Urban95 keeps a project-specific ternary sub-score mapping on that **rounded** building SI: `<0.20 → 0`, `0.20–<0.40 → 50`, `≥0.40 → 100`. **Scoring source:** prepared layers in **`output/shade_si/`**. **Web display only:** simplified **`docs/data/shade_si.geojson`** (+ gzip).
- **Amenities Focus (`expanded`):** amenity-count-style model tied closely to amenity filters in the UI.

For field names and `_5min/_10min/_15min` columns, follow **`README.md`** and the columns referenced in `docs/app.js`.

---

When changing data contracts, update **both** the Python writers and **`docs/app.js`** URL constants (and gzip behavior if applicable). When changing scoring, coordinate **`lib/urban95_weights.py`** with **`stages/urban95_scoring.py`** / **`stages/export_web.py`** and verify downstream aggregates if neighborhood/citywide stats depend on new columns.
