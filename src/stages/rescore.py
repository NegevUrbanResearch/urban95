"""
Recompute Urban95 weighted score columns (including shade SI) on existing web buildings.

Does not call Mapbox or rebuild isochrones. Run from repo root:

    $env:PYTHONPATH="src"; python -m pipeline run rescore

Via export_web, refreshes buildings (+gz), buildings_lookup (+gz), amenities_new,
street_lights, amenities_all, trees, parks, and isochrones (when available). Regenerate
neighborhood and citywide aggregates afterward with:

    $env:PYTHONPATH="src"; python -m pipeline run neighborhoods
"""

from __future__ import annotations

import gzip
import json
import logging
import os
from collections import Counter
from pathlib import Path

os.environ["PROJ_DEBUG"] = "OFF"
os.environ["PYPROJ_GLOBAL_CONTEXT"] = "ON"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

import geopandas as gpd
import pandas as pd

from core.geo_io import WALK_MINUTES, load_layer, write_scored_buildings
from core.paths import OUTPUT_DIR, SCORED_BUILDINGS, layer
from lib.shade_si import BUILDING_SI_FIELD
from stages.export_web import export_web
from stages.shade import (
    OPEN_SPACE_PREPARED_FILENAME,
    STREET_PREPARED_FILENAME,
    preprocess_shade,
)
from stages.urban95_scoring import append_weighted_urban95_scores

SHADE_SI_DIR = OUTPUT_DIR / "shade_si"
BUILDINGS_GZ = layer("publish_buildings_gz").path
BUILDINGS_GEOJSON = layer("publish_buildings").path

SHADE_SUBSCORE_COL = "score_weighted_sub_environmental_quality_shade_5min"
SHADE_SUBSCORE_COL_10MIN = "score_weighted_sub_environmental_quality_shade_10min"
BUILDINGS_LOOKUP_JSON = layer("publish_buildings_lookup").path

STALE_PREFIXES = ("score_weighted",)
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


def _log_shade_distribution(buildings: gpd.GeoDataFrame) -> None:
    if BUILDING_SI_FIELD in buildings.columns:
        si = pd.to_numeric(buildings[BUILDING_SI_FIELD], errors="coerce").dropna()
        if len(si):
            logging.info(
                "summer_si: count=%d mean=%.4f min=%.4f max=%.4f",
                len(si),
                float(si.mean()),
                float(si.min()),
                float(si.max()),
            )
        else:
            logging.warning("summer_si column present but has no numeric values")

    if SHADE_SUBSCORE_COL not in buildings.columns:
        logging.warning("Missing %s after rescoring", SHADE_SUBSCORE_COL)
        return

    tiers = pd.to_numeric(buildings[SHADE_SUBSCORE_COL], errors="coerce").fillna(0).astype(int)
    counts = Counter(tiers.tolist())
    total = len(tiers)
    logging.info(
        "Shade sub-score tier distribution (%s, n=%d): tier 0=%d (%.1f%%), tier 50=%d (%.1f%%), tier 100=%d (%.1f%%)",
        SHADE_SUBSCORE_COL,
        total,
        counts.get(0, 0),
        100.0 * counts.get(0, 0) / total if total else 0.0,
        counts.get(50, 0),
        100.0 * counts.get(50, 0) / total if total else 0.0,
        counts.get(100, 0),
        100.0 * counts.get(100, 0) / total if total else 0.0,
    )
    other = {k: v for k, v in counts.items() if k not in (0, 50, 100)}
    if other:
        logging.warning("Unexpected shade sub-score values: %s", other)


def _log_lookup_shade_tiers(lookup_path: Path, label: str) -> None:
    source_path = lookup_path
    if not source_path.is_file():
        gzip_path = lookup_path.with_name(f"{lookup_path.name}.gz")
        if gzip_path.is_file():
            source_path = gzip_path
        else:
            logging.warning("%s: lookup not found at %s", label, lookup_path)
            return

    if source_path.name.endswith(".gz"):
        with gzip.open(source_path, "rt", encoding="utf-8") as handle:
            payload = json.load(handle)
    else:
        with source_path.open("rt", encoding="utf-8") as handle:
            payload = json.load(handle)

    tiers = Counter(
        int(record.get(SHADE_SUBSCORE_COL_10MIN, 0))
        for record in payload.get("features", [])
        if isinstance(record, dict)
    )
    logging.info(
        "%s shade tier distribution (%s, n=%d): tier 0=%d, tier 50=%d, tier 100=%d",
        label,
        SHADE_SUBSCORE_COL_10MIN,
        sum(tiers.values()),
        tiers.get(0, 0),
        tiers.get(50, 0),
        tiers.get(100, 0),
    )


def rescore_urban95_weighted() -> None:
    _ensure_shade_si_prepared()

    _log_lookup_shade_tiers(BUILDINGS_LOOKUP_JSON, "Lookup before rescore")

    buildings_path = _resolve_buildings_path()
    logging.info("Loading existing buildings from %s...", buildings_path)
    crs_metric = 2039
    buildings = load_layer(buildings_path, target_crs=crs_metric)
    logging.info("Loaded %d buildings", len(buildings))

    buildings = _drop_stale_score_columns(buildings)

    logging.info("Recomputing Urban95 weighted scores (shade SI from %s)...", SHADE_SI_DIR)
    buildings = append_weighted_urban95_scores(
        buildings,
        shade_si_dir=SHADE_SI_DIR,
    )

    _log_shade_distribution(buildings)

    logging.info("Writing rescored buildings to %s...", SCORED_BUILDINGS)
    write_scored_buildings(buildings, SCORED_BUILDINGS)

    export_web(buildings)

    has_si = BUILDING_SI_FIELD in buildings.columns
    has_shade = SHADE_SUBSCORE_COL in buildings.columns
    logging.info(
        "Verification: summer_si=%s, %s=%s, walk horizons=%s",
        has_si,
        SHADE_SUBSCORE_COL,
        has_shade,
        [f"score_weighted_{m}min" for m in WALK_MINUTES],
    )
    _log_lookup_shade_tiers(BUILDINGS_LOOKUP_JSON, "Lookup after rescore")
    logging.warning(
        "Rescore refreshed buildings, lookup, and companion publish layers via export_web "
        "(amenities_new, street_lights, amenities_all, trees, parks, isochrones when "
        "available). Run python -m pipeline run neighborhoods next to refresh "
        "neighborhoods.geojson, neighborhood_charts.json, and citywide_stats.json."
    )
    logging.info("Urban95 weighted rescore complete.")


if __name__ == "__main__":
    rescore_urban95_weighted()
