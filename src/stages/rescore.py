"""
Recompute Urban95 status columns (including shade SI) on existing web buildings.

Does not call Mapbox or rebuild isochrones. Run from repo root:

    $env:PYTHONPATH="src"; python -m pipeline run rescore

Via export_web, refreshes buildings (+gz), buildings_lookup (+gz), amenities_new,
street_lights, amenities_all, trees, parks, and isochrones (when available). Regenerate
neighborhood and citywide aggregates afterward with:

    $env:PYTHONPATH="src"; python -m pipeline run neighborhoods
"""

from __future__ import annotations

import logging
import os
from collections import Counter
from pathlib import Path

os.environ["PROJ_DEBUG"] = "OFF"
os.environ["PYPROJ_GLOBAL_CONTEXT"] = "ON"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

import geopandas as gpd
from core.geo_io import load_layer, write_scored_buildings
from core.paths import OUTPUT_DIR, SCORED_BUILDINGS, layer
from lib.shade_si import BUILDING_SI_FIELD
from stages.export_web import export_web
from stages.shade import (
    OPEN_SPACE_PREPARED_FILENAME,
    STREET_PREPARED_FILENAME,
    preprocess_shade,
)
from stages.urban95_scoring import append_urban95_statuses

SHADE_SI_DIR = OUTPUT_DIR / "shade_si"
BUILDINGS_GZ = layer("publish_buildings_gz").path
BUILDINGS_GEOJSON = layer("publish_buildings").path

STALE_PREFIXES = ("score_weighted", "u95_status", "access_")
STALE_EXACT = (BUILDING_SI_FIELD,)


def _ensure_shade_si_prepared() -> None:
    street_path = SHADE_SI_DIR / STREET_PREPARED_FILENAME
    open_space_path = SHADE_SI_DIR / OPEN_SPACE_PREPARED_FILENAME
    if street_path.is_file() and open_space_path.is_file():
        logging.info("Prepared shade SI layers found in %s", SHADE_SI_DIR)
        return
    logging.info("Prepared shade SI layers missing; running preprocess_shade...")
    preprocess_shade()


def _resolve_buildings_path() -> Path:
    if SCORED_BUILDINGS.is_file():
        return SCORED_BUILDINGS
    if BUILDINGS_GZ.is_file():
        return BUILDINGS_GZ
    if BUILDINGS_GEOJSON.is_file():
        return BUILDINGS_GEOJSON
    raise FileNotFoundError(
        f"No existing buildings layer found. Tried: {SCORED_BUILDINGS}, {BUILDINGS_GZ}, {BUILDINGS_GEOJSON}"
    )


def _drop_stale_score_columns(buildings: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    stale_cols = [
        c
        for c in buildings.columns
        if c in STALE_EXACT or any(c.startswith(prefix) for prefix in STALE_PREFIXES)
    ]
    if not stale_cols:
        return buildings
    logging.info("Dropped %d stale score columns: %s", len(stale_cols), stale_cols[:8])
    if len(stale_cols) > 8:
        logging.info("... and %d more", len(stale_cols) - 8)
    return buildings.drop(columns=stale_cols)


def _log_status_distribution(buildings: gpd.GeoDataFrame) -> None:
    status_column = "u95_status_10min"
    if status_column not in buildings.columns:
        logging.warning("Missing %s after rescoring", status_column)
        return
    counts = Counter(buildings[status_column].fillna("unknown").astype(str))
    logging.info("Urban95 status distribution (%s): %s", status_column, dict(counts))


def rescore_urban95_statuses() -> None:
    _ensure_shade_si_prepared()

    buildings_path = _resolve_buildings_path()
    logging.info("Loading existing buildings from %s...", buildings_path)
    crs_metric = 2039
    buildings = load_layer(buildings_path, target_crs=crs_metric)
    logging.info("Loaded %d buildings", len(buildings))

    buildings = _drop_stale_score_columns(buildings)

    logging.info("Recomputing Urban95 status columns (shade SI from %s)...", SHADE_SI_DIR)
    buildings = append_urban95_statuses(
        buildings,
        shade_si_dir=SHADE_SI_DIR,
    )

    _log_status_distribution(buildings)

    logging.info("Writing rescored buildings to %s...", SCORED_BUILDINGS)
    write_scored_buildings(buildings, SCORED_BUILDINGS)

    export_web(buildings)

    logging.info(
        "Verification: u95_status_10min=%s, score_expanded_10min=%s",
        "u95_status_10min" in buildings.columns,
        "score_expanded_10min" in buildings.columns,
    )
    logging.warning(
        "Rescore refreshed buildings, lookup, and companion publish layers via export_web "
        "(amenities_new, street_lights, amenities_all, trees, parks, isochrones when "
        "available). Run python -m pipeline run neighborhoods next to refresh "
        "neighborhoods.geojson, neighborhood_charts.json, and citywide_stats.json."
    )
    logging.info("Urban95 status rescore complete.")


if __name__ == "__main__":
    rescore_urban95_statuses()
