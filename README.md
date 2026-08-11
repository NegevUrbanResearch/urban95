# Cities for Children: Beer Sheva streetscape accessibility

**[View the live map](https://negevurbanresearch.github.io/urban95/)**

This project maps how easy it is to reach everyday services and child-relevant features on foot from residential buildings in Beer Sheva. It is a collaboration between **Urban95** and **NUR** under the “Cities for Children” initiative.

---

## What you get

- **Interactive map** (`docs/`) — MapLibre GL, with optional deck.gl clusters for dense points and Chart.js for dashboards.
- **Two scoring models** — **Urban95** uses equal-mean traffic-light statuses; **Amenities Focus** (internally `expanded`) uses a broader amenity-count classification.
- **Three scales** — Single building (with walking-time area), neighborhood comparison, and citywide summary.

---

## Run the map locally

From the repository root (serves the whole repo so `./data` resolves next to `docs/index.html`):

```bash
pip install -r requirements.txt
npm install
npm run start
```

Open **http://localhost:8080/docs/index.html**

To serve only the `docs/` folder (paths like `./data` will break unless you mirror files), use `npm run start:docs` only if you adjust asset URLs accordingly.

---

## Data layout

Processed layers for the website live under **`docs/data/`** (GeoJSON plus `neighborhood_charts.json` and `citywide_stats.json`). The app loads them with `BASE = "./data"` in `docs/app.js`.

Typical files include building footprints with accessibility fields, amenity layers (`amenities_new.geojson`, `amenities_all.geojson`), trees, parks, street lights, precomputed walking isochrones, and neighborhood boundaries. Exact filenames must match `docs/app.js`.

### Building fields used by the app

- **Urban95 overview status**: `u95_status_*`.
- **Urban95 category status**: `u95_status_<category>_*`.
- **Urban95 direct indicator status**: `u95_status_sub_<category>_<indicator>_*`.
- **Urban95 diagnostic status**: `u95_status_detail_<category>_<parent>_<child>_*`. School and Kindergarten are Education diagnostics; Clinic and Tipat Halav are Health diagnostics. They are visible in drill-downs but excluded from means.
- **Amenities Focus score**: `score_expanded_*`.

`*` is one of `_5min`, `_10min`, `_15min`; the frontend currently consumes `_10min`. Urban95 publishes status strings, raw explanation measurements such as `summer_si`, and no numeric overview total.

---

## Scoring methodology

### Urban95 (equal-mean traffic-light statuses)

Urban95 preserves the existing spatial indicator rules but presents every public Urban95 result as **Disappointing**, **Functioning**, **Thriving**, or **Unknown**. It does not publish, display, rank, or reconstruct a numeric Urban95 overview total.

The hierarchy is Environmental Quality (Shade, Trees, Distance from fast roads), Nature (Parks, Urban nature areas), Play (Playgrounds), Safety & Mobility (Street lights, Bicycle access, Bus stops, Shelters), and Family Services (Education, Community centers, Business centers, Health). Direct indicators retain their project rules and internal 0/0.5/1 attainment levels. Sibling direct indicators contribute equally to their category; the five categories contribute equally to the overview. Thus categories with more indicators do not have extra influence.

Category and overview means use the following status cutoffs: attainment below `0.25` is Disappointing, `0.25` through below `0.75` is Functioning, and `0.75` through `1.00` is Thriving. Exact midpoint ties classify upward. If any required direct child is Unknown, its category is Unknown; if any category is Unknown, the overview is Unknown. Unknown is never replaced with zero or omitted from a denominator.

Missing, unreadable, schema-invalid, or failed source evidence produces Unknown for dependent results. A valid empty source or valid empty subtype remains available and follows the normal indicator rule. Per-building calculation failures produce Unknown only for that building. Area summaries count all four statuses and use the uniquely predominant building status only; ties and unsupported areas publish Unknown with a summary reason rather than a hidden average.

**Environmental Quality / Shade** — Beer Sheva BDAR **Spatial Shade Index (`summer_SI`)** comes from the [Derech Tzel shading metrics guide](https://tzel.org.il/wp-content/uploads/2025/08/Shade-Indicators_eng-2.6.pdf). Values are used as-is (**SI, not SAI**; not recalculated). Each building gets a **300 m area-weighted mean `summer_SI` around the building footprint (near-edge buffer)**, then stored/displayed `summer_si` is **rounded to 1 decimal place with standard half-up ties before output and status calculation** (`0.15 → 0.2`, `0.35 → 0.4`). The separate official SI interpretation remains `<0.10 severe lack`, `0.10–<0.20 significant lack`, `0.20–<0.40 needs improvement`, `0.40–<0.60 good shade`, and `≥0.60 excellent shade`. Urban95's status rule is project-defined: rounded SI `<0.20`, `0.20–<0.40`, and `≥0.40` map to low, middle, and high attainment respectively.

Urban95 status columns retain `_5min/_10min/_15min` for compatibility even though its direct rules are generally fixed-distance **near-edge** rules from building footprints. Amenities Focus walking isochrones still originate from building centroids.

### Amenities Focus (internally `expanded`)

Amenities Focus score is calculated from broader amenity coverage and is the model that most directly responds to amenity-category composition and filtering:

- Amenities Focus score = `num_amenities + 0.25*num_trees + 0.25*num_street_lights` within the selected walking isochrone.

Amenities Focus map coloring and percentile displays are rank-based relative to all buildings for the selected walking time.

---

## Regenerating outputs (Python)

### 1. Prerequisites

- Raw GIS under `data/raw/` (see `src/core/paths.py` / `python -m pipeline check` for expected layers — e.g. `buildings.geojson.gz`, `amenities_clean.geojson`, `trees.geojson`, `parks.geojson`).
- **`data/raw/arcgis_shade/bsv_street_summer_shade_index.geojson`** and **`data/raw/arcgis_shade/bsv_open_spaces_summer_shade_index.geojson`** — raw ArcGIS summer SI layers for shade scoring and the web map layer.
- **`data/raw/amenities_clean.geojson`** (published as `docs/data/amenities_new.geojson` by `export_web`) and optionally **`data/raw/street_lights.geojson`** for Urban95/clean-manifest inventory views.
- **`.env`** in the repo root with a Mapbox token used only for isochrone generation:

  ```text
  mapbox_access_token=YOUR_TOKEN
  ```

Seed provisional raw inputs when needed:

```powershell
$env:PYTHONPATH="src"
python scripts/seed_provisional_raw.py
python -m pipeline check
```

### 2. Shade SI layers (before building accessibility)

Prepares metric scoring layers under `output/shade_si/` and a simplified web-only display layer at `docs/data/shade_si.geojson` (+ `.gz`):

```powershell
$env:PYTHONPATH="src"
python -m pipeline run shade
```

Scoring reads the prepared layers in `output/shade_si/`; the simplified `docs/data/shade_si.geojson` is for map display only.

### 3. Building-level metrics and web GeoJSON

Full pipeline (shade → isochrones → amenity metrics → Urban95 score → publish → neighborhoods):

```powershell
$env:PYTHONPATH="src"
python -m pipeline run all
```

Or stage by stage:

```powershell
$env:PYTHONPATH="src"
python -m pipeline run isochrones
python -m pipeline run amenity_metrics
python -m pipeline run score
python -m pipeline run export_web
```

`export_web` owns publication of the building, lookup, amenity, tree, park, and isochrone layers under `docs/data/` (including their specified `.gz` companions). The shade stage owns `shade_si.geojson` (+ `.gz`); the neighborhoods stage owns its four neighborhood/statistics files. See [`docs/data/README.md`](docs/data/README.md) for the complete ownership table.

### Layer-oriented execution model

The commands and browser-facing output contracts above are unchanged. In `run all`, the pipeline now prepares and reuses named source frames, computes amenity and scoring relations as exact layer-by-layer/chunked reductions, uses exact threaded local street-light unions, reuses one neighborhood IDW geometry plan, and publishes each web layer in one serialization pass. Standalone stages retain their disk-backed fallbacks. The neighborhoods stage intentionally rereads the rounded building publication so its aggregates use the same geometry and values served to the map.

For acceptance-only warm-run checks, set `PIPELINE_FORBID_MAPBOX=1`. A guarded run validates the complete `(building_id, minutes)` warm aggregate and aborts before token/session/network work when it is incomplete; ordinary unguarded runs retain their existing Mapbox/cache behavior.

To recompute Urban95 status fields (including shade SI) on existing buildings without Mapbox or isochrones:

```powershell
$env:PYTHONPATH="src"
python -m pipeline run rescore
```

This refreshes **`docs/data/buildings_accessibility.geojson`** (+ `.gz`), **`buildings_lookup.json`** (+ `.gz`), and companion publish layers via `export_web` — **`amenities_new.geojson`**, **`street_lights.geojson`**, **`amenities_all.geojson`**, **`trees.geojson`**, **`parks.geojson`**, **`isochrones.geojson`** (when raw/cache inputs exist). Run `python -m pipeline run neighborhoods` immediately afterward so **`docs/data/neighborhoods.geojson`**, **`neighborhood_charts.json`**, and **`citywide_stats.json`** stay in sync with the rescored building fields.

### Partial updates → what the app actually gets

You can refresh **one concern** without Mapbox or a full rebuild — but only if that command chain **writes the published files the map reads** (especially `buildings_lookup.json`, not only a local scored GeoJSON).

| You changed… | Run (no Mapbox unless noted) | Must refresh for the live app |
|--------------|------------------------------|-------------------------------|
| Urban95 status rules / shade SI mapping | `run shade` (if SI inputs changed) → `run rescore` → `run neighborhoods` | `buildings_lookup` (+ gz), buildings `.gz`, neighborhoods / charts / citywide |
| Clean amenities / trees / lights inventory (raw) | `run amenity_metrics` → `run score` → `run export_web` → `run neighborhoods` | Same publish set + `amenities_new` / trees / lights sync; **isochrones reused from cache** |
| Isochrone geometry / walk sheds | `run isochrones` (**Mapbox** if cache cold) → `run amenity_metrics` → `run score` → `run export_web` → `run neighborhoods` | Isochrones + lookup + aggregates |
| Neighborhood chart logic only | `run neighborhoods` | neighborhoods / surface / charts / citywide (buildings unchanged) |
| Everything | `run all` | Full publish set |

**Rule:** a stage that changes building scores is incomplete until `export_web` (lookup) and, when aggregates matter, `neighborhoods`. `run rescore` already ends in `export_web`.

### 4. Neighborhood and citywide aggregates

Run after `buildings_accessibility.geojson` (and related layers) exist in `docs/data/`:

```powershell
$env:PYTHONPATH="src"
python -m pipeline run neighborhoods
```

This updates **`docs/data/neighborhoods.geojson`**, **`neighborhood_charts.json`**, and **`citywide_stats.json`**.

### 5. Spatial syntax layer (street network)

Builds segment and zone-level spatial syntax layers from `docs/data/roads.geojson`:

```bash
$env:PYTHONPATH="src"; python -m optional.generate_spatial_syntax
```

Outputs:
- `docs/data/spatial_syntax_segments.geojson`
- `docs/data/spatial_syntax_zones.geojson`

---

## Repository layout (short)

```
urban95/
├── docs/                    # Static site (GitHub Pages root)
│   ├── index.html           # Map UI + in-app help
│   ├── app.js
│   ├── style.css
│   ├── data/                # GeoJSON + JSON consumed by the map
│   └── icons/
├── output/                  # Full preprocessing output (optional archive)
├── data/                    # Source GIS for preprocessing
├── src/
│   ├── pipeline/            # `python -m pipeline check` / `run`
│   ├── core/                # paths, preflight, geo_io, geojson_utils
│   ├── stages/              # shade, isochrones, amenity_metrics, score, export_web, neighborhoods, rescore
│   ├── lib/                 # shade_si, urban95_weights, buildings_*, amenity_layers
│   └── optional/            # filter, download_osm_roads, generate_spatial_syntax, export_urban_nature_areas
├── requirements.txt
├── package.json
└── README.md
```

---

## GitHub Pages

Publish from the **`docs/`** folder. Commit the contents of **`docs/data/`** so the deployed site has the same files as local `./data`, or host assets elsewhere and update URLs in `docs/app.js`.

---

## Optional: filter source layers

```bash
$env:PYTHONPATH="src"; python -m optional.filter
```

Writes distance-filtered layers under `filtered/` when configured. Note: `filtered/` is deprecated as a pipeline input; resolve layers from `data/raw/` via `core/paths.py`.
