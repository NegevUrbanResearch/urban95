# Data layout

One-way flow: **`data/raw/` → `output/` → `docs/data/`**.

| Tier | Path | Role | Git |
|------|------|------|-----|
| Raw inputs | `data/raw/` | Pipeline inputs (geometry + inventories) | Tracked when under size policy; see below |
| Intermediates | `output/` | Shade SI prep, isochrone cache, scored buildings | Gitignored |
| Publish | `docs/data/` | Web app artifacts only | Tracked for GitHub Pages (with existing carve-outs) |

## Provisional vs true raw

Most layers under `data/raw/` start as **provisional seeds**: copies of today’s published stand-ins from `docs/data/` (see `SEED_MAP` in `src/core/paths.py`). They are good enough to run the pipeline until true source GIS replaces them.

**True raw (required for pipeline):** Beer Sheva summer shade SI under `data/raw/arcgis_shade/` (`bsv_street_summer_shade_index.geojson`, `bsv_open_spaces_summer_shade_index.geojson`, optional `manifest.json`). Collaborators must have these files locally — commit to git when asked (currently working-tree on some checkouts). Legacy `data/arcgis_shade/` was removed; shade is not seeded from `docs/data/`.

## Parked: `amenities_beer_sheva`

`amenities_beer_sheva.geojson` may live under `data/raw/` for inventory/reference only. It is **not scored** and is not part of the Urban95 / Amenities Focus metric path.

## Deprecated: `filtered/`

`filtered/` is **deprecated as an input**. Do not read clipped layers from there; resolve inputs from `data/raw/` via `src/core/paths.py`. The directory may still exist locally and remains gitignored.

## Size policy

Before `git add` under `data/raw/`, verify each file meets the limits below (use `Get-ChildItem data/raw -Recurse | Sort-Object Length -Descending` on Windows).

- Do **not** commit any file ≥100MB.
- Prefer ≤50MB per tracked file.
- Provisional buildings are stored as `buildings.geojson.gz` for that reason.
- Zips under `data/` stay gitignored.

## Orphan / review

| Path | Class | Notes |
|------|-------|--------|
| `icons/` (repo root) | **Confirm** | Runtime uses `docs/icons/` via `ICONS_BASE`; root copy may be legacy duplicate. |
| `docs/data/neighborhood_surface.pmtiles` | **Keep** | In `pmtiles_manifest.js` / config fallbacks; GeoJSON surface is primary (`useGeneratedAsset: false`). |
| `docs/data/pmtiles_manifest.json` | **Keep** | Build script writer; runtime loads `pmtiles_manifest.js`. |
| `docs/data/population-grid.geojson` | **Keep** | Aux overlay (`config.js`). |
| `docs/data/Beersheva_socioeconomic_statareas2023.geojson` | **Keep** | Aux overlay. |
| `docs/data/education.geojson` | **Keep** | Schools overlay. |
| `docs/data/buildings_accessibility.geojson` | **Keep local** | Gitignored; `.gz` + lookup + PMTiles suffice for the site. |
| `docs/data/SekerTevaIroni.gdb/` | **Keep local** | Gitignored source for `optional/export_urban_nature_areas.py`; app uses `urban_nature_areas.geojson`. |

**Removed (unused publish noise):** standalone amenity splits (`playgrounds`, `shelters`, `community-centers`, `bicycle_track`); `roads.pmtiles` (map uses `roads.geojson`); `spatial_syntax_segments.geojson` / `.pmtiles` and `spatial_syntax_zones.geojson` (optional generator outputs, not in `Urban95Config.urls` — regenerate via `python -m optional.generate_spatial_syntax` + PMTiles build if needed).

**Removed earlier (Task 7):** repo-root `population-grid.geojson`; legacy `data/arcgis_shade/` (+ zip).
