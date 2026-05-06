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

Optional tuning (see `src/preprocess_accessibility.py`): `INDEX_SCORE_WORKERS`, `ISOCHRONE_FETCH_WORKERS`.

### Regenerating site data (order matters)

1. **Optional (usually first if you use it):** `python src/filter.py` — clips `data/*.geojson` into `filtered/`. Run before preprocessing when you want a bounded study area. Resolution order is **per layer** in `compute_building_accessibility`: **`buildings.geojson` tries `filtered/` before `data/`**; legacy amenities, trees, and parks try **`data/` before `filtered/`** (see the `*_candidates` lists in `src/preprocess_accessibility.py`).
2. Raw GIS in `data/` and/or `filtered/` as expected by `src/preprocess_accessibility.py`, plus **`docs/data/amenities_new.geojson`** when you rely on the merged/clean amenity inventory (same prerequisite called out in **`README.md`** — without it, parts of the pipeline log warnings or produce incomplete metrics).
3. `python src/preprocess_accessibility.py` — writes `output/` and `docs/data/` layers.
4. `python src/preprocess_neighborhoods.py` — requires building-level outputs in `docs/data/`; updates neighborhoods GeoJSON, `neighborhood_charts.json`, `citywide_stats.json`.
5. **Roads + spatial syntax (optional):** `python src/download_osm_roads.py` → `docs/data/roads.geojson`, then `python src/generate_spatial_syntax.py` → segment/zone GeoJSON under `docs/data/`.

### Quirks agents must respect

- **`src/index calculation.py` contains a space in the filename.** Normal entry is **`preprocess_accessibility.py`**, which loads it via `runpy.run_path(...)`. If you invoke it manually, use a quoted path (Windows/macOS/Linux): `python "src/index calculation.py"`.
- **`index calculation.py` imports `plotly.graph_objects`, but `plotly` is not listed in `requirements.txt`.** A minimal `pip install -r requirements.txt` may still fail when Urban95 scoring runs unless `plotly` is installed separately. Consider adding it to `requirements.txt` if you touch dependencies.
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
| `filtered/` | Optional clipped inputs (gitignored) |

**`src/` modules:** `preprocess_accessibility.py`, `preprocess_neighborhoods.py`, `generate_spatial_syntax.py`, `filter.py`, `download_osm_roads.py`, and `index calculation.py` (Urban95 weights — loaded by preprocessing, not the usual CLI entry).

## Tooling expectations

- **No** `pyproject.toml`, Docker, Makefile, ESLint/Prettier/Ruff configs, or `.github/workflows` were present when `AGENTS.md` was written — confirm with a quick directory listing if that matters for your change.
- **`.gitignore`** excludes `.venv/`, `data/`, `output/`, `filtered/`, `node_modules/`, `.env`, with an exception so **`docs/data/`** can be tracked for Pages (see **Frontend** above for the `buildings_accessibility.geojson` carve-out).

## Scoring models (high level)

- **Urban95:** weighted category/subcategory model; weights live in `src/index calculation.py` (see README for percentages).
- **Amenities Focus (`expanded`):** amenity-count-style model tied closely to amenity filters in the UI.

For field names and `_5min/_10min/_15min` columns, follow **`README.md`** and the columns referenced in `docs/app.js`.

---

When changing data contracts, update **both** the Python writers and **`docs/app.js`** URL constants (and gzip behavior if applicable). When changing scoring, coordinate **`src/index calculation.py`** with **`src/preprocess_accessibility.py`** and verify downstream aggregates if neighborhood/citywide stats depend on new columns.
