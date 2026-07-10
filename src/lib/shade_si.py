"""ArcGIS summer shade index (SI) loading, rounding, classification, and spatial attach."""

from __future__ import annotations

import logging
import math
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import GeometryCollection, MultiPolygon, Point, Polygon
from shapely.ops import unary_union
from shapely.validation import make_valid

logger = logging.getLogger(__name__)

BUILDING_SHADE_RADIUS_M = 300.0
SCORE_FIELD = "summer_SI"
LAYER_TYPE_FIELD = "si_layer"
BUILDING_SI_FIELD = "summer_si"

LAYER_STREET = "street"
LAYER_OPEN_SPACE = "open_space"

METRIC_CRS = "EPSG:2039"
BUILDING_SI_QUANTIZE_STEP = Decimal("0.1")

OFFICIAL_SI_INTERPRETATION_BUCKETS = (
    {"max_exclusive": 0.10, "label": "Severe lack"},
    {"max_exclusive": 0.20, "label": "Significant lack"},
    {"max_exclusive": 0.40, "label": "Needs improvement"},
    {"max_exclusive": 0.60, "label": "Good shade"},
    {"max_exclusive": float("inf"), "label": "Excellent shade"},
)

URBAN95_SHADE_SCORE_BUCKETS = (
    {"min_inclusive": 0.0, "max_exclusive": 0.20, "score": 0},
    {"min_inclusive": 0.20, "max_exclusive": 0.40, "score": 50},
    {"min_inclusive": 0.40, "max_exclusive": float("inf"), "score": 100},
)


def _coerce_finite_summer_si(value: float | None) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric):
        return None
    return numeric


def round_building_summer_si(value: float | None) -> float:
    """Round stored/displayed building SI to one decimal with deterministic half-up ties."""
    numeric = _coerce_finite_summer_si(value)
    if numeric is None:
        return 0.0
    rounded = Decimal(str(numeric)).quantize(BUILDING_SI_QUANTIZE_STEP, rounding=ROUND_HALF_UP)
    return float(rounded)


def classify_summer_si(value: float | None) -> str | None:
    """Return the official SI interpretation label for a finite SI value."""
    numeric = _coerce_finite_summer_si(value)
    if numeric is None:
        return None
    for bucket in OFFICIAL_SI_INTERPRETATION_BUCKETS:
        if numeric < bucket["max_exclusive"]:
            return str(bucket["label"])
    return None


def summer_si_to_subscore(summer_si: float | None) -> int:
    """Map building SI to the Urban95 shade sub-score after 1-decimal building rounding."""
    rounded_value = round_building_summer_si(summer_si)
    for bucket in URBAN95_SHADE_SCORE_BUCKETS:
        if rounded_value < bucket["max_exclusive"]:
            return int(bucket["score"])
    return 0


def _ensure_path_exists(path: Path, label: str) -> Path:
    resolved = Path(path)
    if not resolved.is_file():
        raise FileNotFoundError(f"{label} SI layer not found: {resolved}")
    return resolved


def _load_si_geojson(path: Path) -> gpd.GeoDataFrame:
    gdf = gpd.read_file(path)
    if gdf.crs is None:
        raise ValueError(f"Layer {path} has no CRS defined.")
    return gdf


def _validate_score_field(gdf: gpd.GeoDataFrame, path: Path | str) -> gpd.GeoDataFrame:
    if SCORE_FIELD not in gdf.columns:
        raise ValueError(f"Layer {path} is missing required field {SCORE_FIELD!r}.")
    numeric = pd.to_numeric(gdf[SCORE_FIELD], errors="coerce")
    if numeric.notna().sum() == 0:
        raise ValueError(f"Layer {path} has no numeric {SCORE_FIELD} values.")
    out = gdf.copy()
    out[SCORE_FIELD] = numeric
    return out


def _prepare_si_layer(
    gdf: gpd.GeoDataFrame,
    path: Path | str,
    layer_type: str,
    target_crs: str = METRIC_CRS,
) -> gpd.GeoDataFrame:
    validated = _validate_score_field(gdf, path)
    prepared = validated[[SCORE_FIELD, validated.geometry.name]].copy()
    prepared[LAYER_TYPE_FIELD] = layer_type
    if prepared.crs.to_string() != target_crs:
        prepared = prepared.to_crs(target_crs)
    return prepared


def load_raw_si_layers(
    street_path: Path | str,
    open_space_path: Path | str,
) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """Load raw ArcGIS street/open-space SI layers as validated metric layers."""
    street_file = _ensure_path_exists(Path(street_path), "Street")
    open_space_file = _ensure_path_exists(Path(open_space_path), "Open-space")

    streets_raw = _load_si_geojson(street_file)
    open_spaces_raw = _load_si_geojson(open_space_file)

    if open_spaces_raw.crs != streets_raw.crs:
        open_spaces_raw = open_spaces_raw.to_crs(streets_raw.crs)

    streets = _prepare_si_layer(streets_raw, street_file, LAYER_STREET)
    open_spaces = _prepare_si_layer(open_spaces_raw, open_space_file, LAYER_OPEN_SPACE)
    return streets, open_spaces


def load_prepared_si_layers(
    street_path: Path | str,
    open_space_path: Path | str,
) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """Load prepared SI scoring layers with the same validation rules as the raw inputs."""
    return load_raw_si_layers(street_path, open_space_path)


def _combine_si_layers(*si_layers: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    combined_parts: list[gpd.GeoDataFrame] = []
    for si_layer in si_layers:
        if si_layer is None or len(si_layer) == 0:
            continue
        keep_columns = [column for column in (SCORE_FIELD, LAYER_TYPE_FIELD) if column in si_layer.columns]
        subset = si_layer[keep_columns + [si_layer.geometry.name]].copy()
        if subset.crs.to_string() != METRIC_CRS:
            subset = subset.to_crs(METRIC_CRS)
        combined_parts.append(subset)

    if not combined_parts:
        return _empty_si_layer()

    return gpd.GeoDataFrame(
        pd.concat(combined_parts, ignore_index=True),
        geometry=combined_parts[0].geometry.name,
        crs=METRIC_CRS,
    )


def _empty_si_layer() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        {SCORE_FIELD: pd.Series(dtype=float), LAYER_TYPE_FIELD: pd.Series(dtype=object)},
        geometry=gpd.GeoSeries([], name="geometry", crs=METRIC_CRS),
        crs=METRIC_CRS,
    )


def _iter_polygonal_parts(geometry):
    if geometry is None or geometry.is_empty:
        return
    if isinstance(geometry, Polygon):
        yield geometry
        return
    if isinstance(geometry, MultiPolygon):
        yield from geometry.geoms
        return
    if isinstance(geometry, GeometryCollection):
        for part in geometry.geoms:
            yield from _iter_polygonal_parts(part)


def _repair_area_geometry(geometry):
    if geometry is None or geometry.is_empty:
        return None
    repaired = make_valid(geometry) if not geometry.is_valid else geometry
    if repaired is None or repaired.is_empty:
        return None
    polygonal_parts = list(_iter_polygonal_parts(repaired))
    if not polygonal_parts:
        return None
    polygonal_surface = unary_union(polygonal_parts)
    if polygonal_surface is None or polygonal_surface.is_empty or polygonal_surface.area <= 0:
        return None
    return polygonal_surface


def sanitize_polygonal_finite_si_surfaces(si_layers: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if len(si_layers) == 0:
        return _empty_si_layer()

    records: list[dict[str, object]] = []
    invalid_count = 0
    dropped_geometry_count = 0
    dropped_score_count = 0

    for _, row in si_layers.iterrows():
        numeric_score = _coerce_finite_summer_si(row.get(SCORE_FIELD))
        if numeric_score is None:
            dropped_score_count += 1
            continue

        geometry = row.geometry
        if geometry is not None and not geometry.is_empty and not geometry.is_valid:
            invalid_count += 1
        repaired = _repair_area_geometry(geometry)
        if repaired is None:
            dropped_geometry_count += 1
            continue
        records.append(
            {
                SCORE_FIELD: numeric_score,
                LAYER_TYPE_FIELD: row.get(LAYER_TYPE_FIELD),
                "geometry": repaired,
            }
        )

    if invalid_count or dropped_geometry_count or dropped_score_count:
        logger.warning(
            "Sanitized shade SI geometries: repaired %d invalid geometries; dropped %d empty/non-area geometries; dropped %d non-finite score rows.",
            invalid_count,
            dropped_geometry_count,
            dropped_score_count,
        )

    if not records:
        return _empty_si_layer()

    return gpd.GeoDataFrame(records, geometry="geometry", crs=METRIC_CRS)


def _prepare_combined_si_layers(*si_layers: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    combined_layers = _combine_si_layers(*si_layers)
    if len(combined_layers) == 0:
        return combined_layers
    return sanitize_polygonal_finite_si_surfaces(combined_layers)


def _area_weighted_si_against_prepared(
    points: gpd.GeoDataFrame,
    combined_layers: gpd.GeoDataFrame,
) -> pd.Series:
    result = pd.Series(0.0, index=points.index, dtype=float)
    if len(combined_layers) == 0:
        return result

    metric_points = points
    if metric_points.crs is None:
        metric_points = metric_points.set_crs(METRIC_CRS)
    elif metric_points.crs.to_string() != METRIC_CRS:
        metric_points = metric_points.to_crs(METRIC_CRS)

    values = result.to_numpy(copy=True)
    shade_geometries = combined_layers.geometry.to_numpy()
    shade_scores = combined_layers[SCORE_FIELD].astype(float).to_numpy()
    spatial_index = combined_layers.sindex

    for point_position, point_geometry in enumerate(metric_points.geometry):
        if point_geometry is None or point_geometry.is_empty:
            continue
        buffer_geometry = point_geometry.buffer(BUILDING_SHADE_RADIUS_M)
        candidate_positions = spatial_index.query(buffer_geometry, predicate="intersects")
        total_area = 0.0
        weighted_sum = 0.0
        for shade_position in candidate_positions:
            intersection_area = buffer_geometry.intersection(shade_geometries[shade_position]).area
            if intersection_area <= 0:
                continue
            total_area += intersection_area
            weighted_sum += intersection_area * shade_scores[shade_position]
        if total_area > 0:
            values[point_position] = weighted_sum / total_area

    return pd.Series(values, index=points.index, dtype=float)


def _raw_area_weighted_si_values_within_buffer(
    points: gpd.GeoDataFrame,
    *si_layers: gpd.GeoDataFrame,
) -> pd.Series:
    combined_layers = _prepare_combined_si_layers(*si_layers)
    return _area_weighted_si_against_prepared(points, combined_layers)


def attach_summer_si_to_buildings(
    buildings: gpd.GeoDataFrame,
    streets: gpd.GeoDataFrame,
    open_spaces: gpd.GeoDataFrame,
    *,
    chunk_size: int | None = None,
) -> gpd.GeoDataFrame:
    """Attach rounded 300 m SI. If chunk_size is an int, process buildings in chunks of that size
    (reuse street/open sindex). chunk_size=None keeps one-shot path (must match chunked results)."""
    out = buildings.copy()
    if len(out) == 0:
        out[BUILDING_SI_FIELD] = pd.Series(dtype=float)
        return out

    metric_buildings = out.to_crs(METRIC_CRS)
    centroids = metric_buildings.copy()
    centroids.geometry = metric_buildings.geometry.centroid

    if chunk_size is None:
        combined = _raw_area_weighted_si_values_within_buffer(centroids, streets, open_spaces)
    else:
        if int(chunk_size) <= 0:
            raise ValueError(f"chunk_size must be a positive int, got {chunk_size!r}")
        step = int(chunk_size)
        prepared = _prepare_combined_si_layers(streets, open_spaces)
        parts: list[pd.Series] = []
        for start in range(0, len(centroids), step):
            chunk = centroids.iloc[start : start + step]
            parts.append(_area_weighted_si_against_prepared(chunk, prepared))
        combined = pd.concat(parts) if parts else pd.Series(0.0, index=centroids.index, dtype=float)

    rounded = combined.reindex(out.index, fill_value=0.0).map(round_building_summer_si)
    out[BUILDING_SI_FIELD] = rounded.astype(float).values
    return out


def lookup_summer_si_at_point(
    point: Point,
    streets: gpd.GeoDataFrame,
    open_spaces: gpd.GeoDataFrame,
) -> float:
    """Return the raw 300 m point-buffer area-weighted street/open-space SI."""
    gdf = gpd.GeoDataFrame(geometry=[point], crs=METRIC_CRS)
    return float(_raw_area_weighted_si_values_within_buffer(gdf, streets, open_spaces).iloc[0])
