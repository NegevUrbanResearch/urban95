# Cities for Children: Beer Sheva Streetscape Analysis

A spatial analysis project to visualize and assess how child-friendly different parts of Beer Sheva's streetscape are. This project is a collaboration between **Urban95** and **NUR** as part of the "Cities for Children" initiative.

## Getting Started

1. Unzip `data.zip` to get the `data/` folder with GeoJSON layers (e.g. `buildings.geojson`, `amenities.geojson`).
2. Install Python dependencies and (optional) Node for running the site locally:

```bash
pip install -r requirements.txt
npm install
```

## Project Structure

```
urban95/
├── data/                 # GeoJSON layers (from data.zip)
├── output/               # Preprocessed GeoJSON for the web map (generated)
├── filtered/             # Optional: distance-filtered layers (from src/filter.py)
├── docs/                 # Static site for GitHub Pages (MapLibre GL map)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── src/
│   ├── preprocess_accessibility.py   # Build accessibility metrics per building
│   └── filter.py                     # Optional: filter layers by distance to neighborhoods
├── requirements.txt
├── package.json
└── README.md
```

## Preprocessing (Python)

From the repo root, run the accessibility preprocessing. This writes `output/buildings_accessibility.geojson` and `output/amenities_<type>.geojson` for the web map:

```bash
python src/preprocess_accessibility.py
```

Optional: filter all layers to a distance from neighborhoods (writes to `filtered/`):

```bash
python src/filter.py
```

## Web Map (vanilla JS + MapLibre GL)

- **Local:** Serve the repo root so `docs/` can load `output/` GeoJSON. Then open the map:

```bash
npm run start
# Open http://localhost:8080/docs/index.html
```

- **GitHub Pages:** Publish from the `docs/` folder. Either commit the contents of `output/` into `docs/output/` so the app’s `../output/` (or `output/`) paths work, or host the GeoJSON elsewhere and set the URLs in `docs/app.js`.

The map shows building footprints colored by number of amenities within radius, with an optional heatmap per amenity type.

## Data

- **Buildings:** Building footprints.
- **Amenities:** Points of interest (type in `top_classi`); used for per-building counts and heatmaps.

## License

ISC
