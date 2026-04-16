# Cities for Children: Beer Sheva streetscape accessibility

**[View the live map](https://negevurbanresearch.github.io/urban95/)**

This project maps how easy it is to reach everyday services and child-relevant features on foot from residential buildings in Beer Sheva. It is a collaboration between **Urban95** and **NUR** under the “Cities for Children” initiative.

---

## What you get

- **Interactive map** (`docs/`) — MapLibre GL, with optional deck.gl clusters for dense points and Chart.js for dashboards.
- **Two scoring models** — **Default** uses the default data manifest (curated amenity categories with explicit weights); **Expanded** uses a broader classification with a simpler index (see in-app *About* for detail).
- **Three scales** — Single building (with walking-time area), neighborhood comparison, and citywide summary with rankings.

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

---

## Regenerating outputs (Python)

### 1. Prerequisites

- Raw GIS under `data/` (see `src/preprocess_accessibility.py` for expected inputs — e.g. `buildings.geojson`, `amenities.geojson`, `sidewalks_and_trees.geojson`, parks).
- **`docs/data/amenities_new.geojson`** — merged points from the default data manifest (and optionally **`docs/data/street_lights.geojson`**) used for Default scoring.
- **`.env`** in the repo root with a Mapbox token used only for isochrone generation:

  ```text
  mapbox_access_token=YOUR_TOKEN
  ```

### 2. Building-level metrics and web GeoJSON

Writes full-precision copy to `output/` and an optimized copy to `docs/data/` (buildings, amenities, trees, parks, isochrones, etc.):

```bash
python src/preprocess_accessibility.py
```

### 3. Neighborhood and citywide aggregates

Run after `buildings_accessibility.geojson` (and related layers) exist in `docs/data/`:

```bash
python src/preprocess_neighborhoods.py
```

This updates **`docs/data/neighborhoods.geojson`**, **`neighborhood_charts.json`**, and **`citywide_stats.json`**.

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
│   ├── preprocess_accessibility.py
│   ├── preprocess_neighborhoods.py
│   └── filter.py            # Optional spatial filter to `filtered/`
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
python src/filter.py
```

Writes distance-filtered layers under `filtered/` when configured (used by preprocessing if present).
