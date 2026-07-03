"""
Prepare ArcGIS summer shade index (SI) layers for web display and Urban95 scoring.

Run from repo root:
    $env:PYTHONPATH="src"; python src/preprocess_shade.py
"""

from __future__ import annotations

import json
import logging
import math
import os
from pathlib import Path

os.environ["PROJ_DEBUG"] = "OFF"
os.environ["PYPROJ_GLOBAL_CONTEXT"] = "ON"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

import geopandas as gpd
import pandas as pd

from preprocess_geojson_utils import (
    reduce_coordinate_precision,
    simplify_geometries,
    write_gzip_copy,
    write_minimal_geojson,
)
from shade_si import (
    LAYER_OPEN_SPACE,
    LAYER_STREET,
    LAYER_TYPE_FIELD,
    METRIC_CRS,
    OFFICIAL_SI_INTERPRETATION_BUCKETS,
    SCORE_FIELD,
    URBAN95_SHADE_SCORE_BUCKETS,
    load_raw_si_layers,
    sanitize_polygonal_finite_si_surfaces,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
ARCGIS_SHADE_DIR = REPO_ROOT / "data" / "arcgis_shade"
STREET_RAW_PATH = ARCGIS_SHADE_DIR / "bsv_street_summer_shade_index.geojson"
OPEN_SPACE_RAW_PATH = ARCGIS_SHADE_DIR / "bsv_open_spaces_summer_shade_index.geojson"

OUTPUT_DIR = REPO_ROOT / "output" / "shade_si"
CALIBRATION_PATH = REPO_ROOT / "output" / "shade_si_calibration.json"
DOCS_DATA_DIR = REPO_ROOT / "docs" / "data"
WEB_OUTPUT_PATH = DOCS_DATA_DIR / "shade_si.geojson"

STREET_PREPARED_FILENAME = "street_summer_si.geojson"
OPEN_SPACE_PREPARED_FILENAME = "open_space_summer_si.geojson"

SHADE_SIMPLIFY_TOLERANCE_M = 2.0


def _layer_stats(gdf: gpd.GeoDataFrame) -> dict:
    scores = pd.to_numeric(gdf[SCORE_FIELD], errors="coerce").dropna()
    count = int(len(gdf))
    official_thresholds = {
        "percent_gte_0.10": 0.0,
        "percent_gte_0.40": 0.0,
    }
    urban95_thresholds = {
        "percent_gte_0.20": 0.0,
        "percent_gte_0.40": 0.0,
    }
    if len(scores) == 0:
        return {
            "feature_count": count,
            SCORE_FIELD: {"mean": None, "min": None, "max": None},
            "official_interpretation_thresholds": official_thresholds,
            "urban95_scoring_thresholds": urban95_thresholds,
        }
    for bucket in OFFICIAL_SI_INTERPRETATION_BUCKETS:
        threshold = bucket["max_exclusive"]
        if not math.isfinite(threshold):
            continue
        if threshold in (0.10, 0.40):
            official_thresholds[f"percent_gte_{threshold:.2f}"] = round(
                float((scores >= threshold).mean() * 100.0), 2
            )
    for bucket in URBAN95_SHADE_SCORE_BUCKETS:
        threshold = bucket["min_inclusive"]
        if threshold in (0.20, 0.40):
            urban95_thresholds[f"percent_gte_{threshold:.2f}"] = round(
                float((scores >= threshold).mean() * 100.0), 2
            )
    return {
        "feature_count": count,
        SCORE_FIELD: {
            "mean": round(float(scores.mean()), 6),
            "min": round(float(scores.min()), 6),
            "max": round(float(scores.max()), 6),
        },
        "official_interpretation_thresholds": official_thresholds,
        "urban95_scoring_thresholds": urban95_thresholds,
    }


def _drop_empty_geometries(gdf: gpd.GeoDataFrame, layer_label: str) -> gpd.GeoDataFrame:
    valid = ~gdf.geometry.is_empty & ~gdf.geometry.isna()
    dropped = int((~valid).sum())
    if dropped:
        logging.info("Dropped %d empty/null geometries from %s layer", dropped, layer_label)
    return gdf[valid].copy()


def _build_calibration_report(
    streets: gpd.GeoDataFrame,
    open_spaces: gpd.GeoDataFrame,
    merged: gpd.GeoDataFrame | None = None,
) -> dict:
    if merged is None:
        merged = gpd.GeoDataFrame(
            pd.concat([streets, open_spaces], ignore_index=True),
            crs=METRIC_CRS,
        )
    return {
        "by_layer": {
            LAYER_STREET: _layer_stats(streets),
            LAYER_OPEN_SPACE: _layer_stats(open_spaces),
        },
        "combined": _layer_stats(merged),
    }


def _write_prepared_layer(gdf: gpd.GeoDataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    export_cols = [SCORE_FIELD, LAYER_TYPE_FIELD, gdf.geometry.name]
    gdf[export_cols].to_file(path, driver="GeoJSON")
    logging.info("Wrote prepared scoring layer %s (%d features)", path, len(gdf))


def preprocess_shade(
    street_raw_path: Path = STREET_RAW_PATH,
    open_space_raw_path: Path = OPEN_SPACE_RAW_PATH,
    output_dir: Path = OUTPUT_DIR,
    calibration_path: Path = CALIBRATION_PATH,
    web_output_path: Path = WEB_OUTPUT_PATH,
) -> None:
    logging.info("Loading ArcGIS shade SI layers...")
    streets, open_spaces = load_raw_si_layers(street_raw_path, open_space_raw_path)
    logging.info(
        "Loaded %d street and %d open-space features in %s",
        len(streets),
        len(open_spaces),
        METRIC_CRS,
    )

    streets = sanitize_polygonal_finite_si_surfaces(
        _drop_empty_geometries(streets, LAYER_STREET)
    )
    open_spaces = sanitize_polygonal_finite_si_surfaces(
        _drop_empty_geometries(open_spaces, LAYER_OPEN_SPACE)
    )

    merged_metric = gpd.GeoDataFrame(
        pd.concat([streets, open_spaces], ignore_index=True),
        crs=METRIC_CRS,
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    _write_prepared_layer(streets, output_dir / STREET_PREPARED_FILENAME)
    _write_prepared_layer(open_spaces, output_dir / OPEN_SPACE_PREPARED_FILENAME)

    calibration = _build_calibration_report(streets, open_spaces, merged=merged_metric)
    calibration_path.parent.mkdir(parents=True, exist_ok=True)
    with open(calibration_path, "w", encoding="utf-8") as f:
        json.dump(calibration, f, indent=2)
        f.write("\n")
    logging.info("Wrote calibration report %s", calibration_path)
    logging.info(
        "Simplifying merged web layer (tolerance: %.1fm in %s)...",
        SHADE_SIMPLIFY_TOLERANCE_M,
        METRIC_CRS,
    )
    web_metric = simplify_geometries(merged_metric, SHADE_SIMPLIFY_TOLERANCE_M)
    web_wgs84 = reduce_coordinate_precision(web_metric.to_crs(epsg=4326), precision=5)

    web_output_path.parent.mkdir(parents=True, exist_ok=True)
    write_minimal_geojson(web_wgs84, web_output_path, precision=5)
    web_size = web_output_path.stat().st_size
    logging.info(
        "Wrote web layer %s (%.1fMB, %d features)",
        web_output_path,
        web_size / 1e6,
        len(web_wgs84),
    )

    gz_path = write_gzip_copy(web_output_path)
    if gz_path is not None:
        gz_size = gz_path.stat().st_size
        ratio = (gz_size / web_size * 100.0) if web_size else 0.0
        logging.info(
            "Compressed %s -> %s (%.1fMB -> %.1fMB, %.1f%%)",
            web_output_path.name,
            gz_path.name,
            web_size / 1e6,
            gz_size / 1e6,
            ratio,
        )

    logging.info("Shade SI preprocessing complete.")


if __name__ == "__main__":
    preprocess_shade()
