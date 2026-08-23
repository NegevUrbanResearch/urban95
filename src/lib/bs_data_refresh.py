"""Validate and publish Beer Sheva municipal building/tree raw inputs."""
from __future__ import annotations

import gzip
import json
import logging
from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd

from core.geo_io import unique_columns
from core.paths import RAW_DIR

BUILDINGS_SOURCE_NAME = "buildings_BS.geojson"
TREES_SOURCE_NAME = "trees_BS.geojson"
BUILDINGS_CANONICAL_NAME = "buildings.geojson.gz"
TREES_CANONICAL_NAME = "trees.geojson.gz"

RESIDENTIAL_USED_VALUE = "מגורים"
BUILDINGS_REQUIRED_COLUMNS = ("Used",)
BUILDINGS_ALLOWED_GEOMETRIES = frozenset({"Polygon", "MultiPolygon"})
TREES_REQUIRED_COLUMNS = ("lon", "lat")
TREES_ALLOWED_GEOMETRIES = frozenset({"Point"})

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LayerRefreshStats:
    source_path: Path
    output_path: Path
    feature_count: int
    residential_count: int | None
    bytes_written: int


@dataclass(frozen=True)
class RefreshPrepareResult:
    buildings: LayerRefreshStats
    trees: LayerRefreshStats


def source_paths(raw_dir: Path = RAW_DIR) -> tuple[Path, Path]:
    return raw_dir / BUILDINGS_SOURCE_NAME, raw_dir / TREES_SOURCE_NAME


def canonical_paths(raw_dir: Path = RAW_DIR) -> tuple[Path, Path]:
    return raw_dir / BUILDINGS_CANONICAL_NAME, raw_dir / TREES_CANONICAL_NAME


def _ensure_wgs84(gdf: gpd.GeoDataFrame, path: Path) -> gpd.GeoDataFrame:
    if gdf.crs is None:
        raise ValueError(f"{path} has no CRS defined.")
    epsg = gdf.crs.to_epsg()
    if epsg != 4326:
        raise ValueError(f"{path} must be EPSG:4326, got {gdf.crs}.")
    return gdf


def _validate_non_empty(gdf: gpd.GeoDataFrame, path: Path) -> None:
    if gdf.empty:
        raise ValueError(f"{path} contains no features.")


def _validate_geometry_types(
    gdf: gpd.GeoDataFrame,
    path: Path,
    allowed: frozenset[str],
) -> None:
    observed = set(gdf.geometry.geom_type.dropna().unique())
    invalid = observed - allowed
    if invalid:
        raise ValueError(
            f"{path} has unsupported geometry types {sorted(invalid)}; "
            f"expected {sorted(allowed)}."
        )


def _validate_required_columns(
    gdf: gpd.GeoDataFrame,
    path: Path,
    required: tuple[str, ...],
) -> None:
    missing = [name for name in required if name not in gdf.columns]
    if missing:
        raise ValueError(f"{path} is missing required columns: {missing}")


def validate_buildings_source(path: Path) -> gpd.GeoDataFrame:
    if not path.is_file():
        raise FileNotFoundError(f"Buildings source not found: {path}")
    gdf = unique_columns(gpd.read_file(path))
    _validate_non_empty(gdf, path)
    gdf = _ensure_wgs84(gdf, path)
    _validate_required_columns(gdf, path, BUILDINGS_REQUIRED_COLUMNS)
    _validate_geometry_types(gdf, path, BUILDINGS_ALLOWED_GEOMETRIES)
    return gdf


def validate_trees_source(path: Path) -> gpd.GeoDataFrame:
    if not path.is_file():
        raise FileNotFoundError(f"Trees source not found: {path}")
    gdf = unique_columns(gpd.read_file(path))
    _validate_non_empty(gdf, path)
    gdf = _ensure_wgs84(gdf, path)
    _validate_required_columns(gdf, path, TREES_REQUIRED_COLUMNS)
    _validate_geometry_types(gdf, path, TREES_ALLOWED_GEOMETRIES)
    return gdf


def count_residential_buildings(gdf: gpd.GeoDataFrame) -> int:
    if "Used" not in gdf.columns:
        return 0
    return int((gdf["Used"].astype(str).str.strip() == RESIDENTIAL_USED_VALUE).sum())


def write_canonical_gzip(
    gdf: gpd.GeoDataFrame,
    output_path: Path,
    *,
    compresslevel: int = 9,
) -> int:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = gdf.to_json()
    with gzip.open(output_path, "wt", encoding="utf-8", compresslevel=compresslevel) as handle:
        handle.write(payload)
    return output_path.stat().st_size


def load_canonical_gzip(path: Path) -> gpd.GeoDataFrame:
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        data = json.load(handle)
    gdf = gpd.GeoDataFrame.from_features(data.get("features") or [])
    if gdf.crs is None:
        gdf = gdf.set_crs(epsg=4326)
    return unique_columns(gdf)


def prepare_canonical_inputs(
    raw_dir: Path = RAW_DIR,
    *,
    compresslevel: int = 9,
) -> RefreshPrepareResult:
    buildings_source, trees_source = source_paths(raw_dir)
    buildings_output, trees_output = canonical_paths(raw_dir)

    buildings = validate_buildings_source(buildings_source)
    trees = validate_trees_source(trees_source)

    buildings_bytes = write_canonical_gzip(
        buildings,
        buildings_output,
        compresslevel=compresslevel,
    )
    trees_bytes = write_canonical_gzip(
        trees,
        trees_output,
        compresslevel=compresslevel,
    )

    buildings_stats = LayerRefreshStats(
        source_path=buildings_source,
        output_path=buildings_output,
        feature_count=len(buildings),
        residential_count=count_residential_buildings(buildings),
        bytes_written=buildings_bytes,
    )
    trees_stats = LayerRefreshStats(
        source_path=trees_source,
        output_path=trees_output,
        feature_count=len(trees),
        residential_count=None,
        bytes_written=trees_bytes,
    )
    logger.info(
        "Prepared buildings: %d features (%d residential) -> %s (%d bytes)",
        buildings_stats.feature_count,
        buildings_stats.residential_count,
        buildings_stats.output_path,
        buildings_stats.bytes_written,
    )
    logger.info(
        "Prepared trees: %d features -> %s (%d bytes)",
        trees_stats.feature_count,
        trees_stats.output_path,
        trees_stats.bytes_written,
    )
    return RefreshPrepareResult(buildings=buildings_stats, trees=trees_stats)
