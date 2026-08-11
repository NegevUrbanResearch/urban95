"""Preprocesses building-level accessibility data into neighborhood and citywide statistics.

Outputs:
  - docs/data/neighborhoods.geojson  (enriched with per-amenity averages and percentile ranks)
  - docs/data/neighborhood_surface.geojson  (precomputed neighborhood hex surface for fast map switching)
  - docs/data/neighborhood_charts.json  (per-hood POI inventory: clean vs legacy taxonomy)
  - docs/data/citywide_stats.json    (aggregate statistics for dashboard)
"""

import json
import logging
import math
import os
import re
import warnings
import gzip
from bisect import bisect_right
from pathlib import Path

os.environ["PROJ_DEBUG"] = "OFF"
os.environ["PYPROJ_GLOBAL_CONTEXT"] = "ON"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point, Polygon, mapping as shapely_mapping

from core.paths import DOCS_DATA_DIR, layer
from lib.neighborhood_distributions import build_per_neighborhood_distributions
from lib.neighborhood_idw import IDWPlan, apply_idw_plan, build_idw_plan
from lib.urban95_status import (
    STATUS_DIAGNOSTICS,
    STATUS_HIERARCHY,
    STATUS_TOKENS,
    STATUS_UNKNOWN,
    category_status_field,
    diagnostic_status_field,
    indicator_status_field,
    status_composition_prefix,
)

# Publish-read exception: neighborhood aggregates read scored buildings from docs/data.
BUILDINGS_CANDIDATES = [
    layer("publish_buildings_gz").path,
    layer("publish_buildings").path,
]
NEIGHBORHOODS_PATH = layer("neighborhoods").path
AMENITIES_NEW_PATH = layer("amenities_clean").path
AMENITIES_LEGACY_PATH = layer("amenities_legacy").path
TREES_PATH = layer("trees").path

WALK_MINUTES = [5, 10, 15]
EXCLUDED_CLEAN_MANIFEST_INVENTORY_TYPES = frozenset({"bicycle_track"})

HEX_CELL_SIDE_METERS = 50.0
HEX_LOCAL_DATA_RADIUS_METERS = 470.0
HEX_IDW_RADIUS_METERS = 425.0
URBAN95_FIXED_MINUTES = 10


def amenity_stat_keys_from_buildings(buildings: gpd.GeoDataFrame) -> list:
    """Reads amen_<key>_<5|10|15>min columns from buildings_accessibility (any taxonomy)."""
    keys = set()
    for col in buildings.columns:
        m = re.match(r"^amen_(.+)_(?:5|10|15)min$", str(col))
        if m:
            keys.add(m.group(1))
    return sorted(keys)


def amenity_type_counts_from_geojson(path: Path, exclude_types: frozenset | None = None) -> dict:
    exclude_types = exclude_types or frozenset()
    data = load_geojson(path)
    type_counts: dict = {}
    for feat in data.get("features") or []:
        t = (feat.get("properties") or {}).get("amenity_type", "other")
        if t in exclude_types:
            continue
        type_counts[t] = type_counts.get(t, 0) + 1
    return type_counts


def inventory_counts_per_neighborhood(
    hoods_wgs84: gpd.GeoDataFrame,
    points_path: Path,
    exclude_amenity_types: frozenset | None = None,
):
    """Point-in-polygon counts by amenity_type for each neighborhood Name."""
    if not points_path.is_file():
        return {}
    pts = gpd.read_file(points_path)
    if pts.crs is None:
        pts = pts.set_crs(epsg=4326)
    elif pts.crs != hoods_wgs84.crs:
        pts = pts.to_crs(hoods_wgs84.crs)
    if "amenity_type" not in pts.columns:
        return {}
    if exclude_amenity_types:
        pts = pts[~pts["amenity_type"].isin(exclude_amenity_types)]
        if len(pts) == 0:
            return {}
    h = hoods_wgs84[["Name", "geometry"]].copy().rename(columns={"Name": "hood_name"})
    j = gpd.sjoin(pts, h, predicate="within", how="inner")
    if len(j) == 0:
        return {}
    out = {}
    for name, grp in j.groupby("hood_name", dropna=True):
        vc = grp["amenity_type"].value_counts()
        out[str(name)] = {str(k): int(v) for k, v in vc.items()}
    return out


def percentile_ranks_across_hoods(values_by_name: dict) -> dict:
    """Percentile rank (0–100) of each neighborhood's value among all neighborhoods."""
    names = list(values_by_name.keys())
    vals = [values_by_name[n] for n in names]
    sorted_vals = sorted(vals)
    n_total = len(sorted_vals)
    if n_total == 0:
        return {}
    out = {}
    for n in names:
        val = values_by_name[n]
        rank = sum(1 for v in sorted_vals if v <= val)
        out[n] = round(rank / n_total * 100)
    return out


def load_geojson(path):
    if str(path).endswith(".gz"):
        with gzip.open(path, "rt", encoding="utf-8") as f:
            return json.load(f)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_geodataframe(path: Path) -> gpd.GeoDataFrame:
    if str(path).endswith(".geojson.gz"):
        data = load_geojson(path)
        gdf = gpd.GeoDataFrame.from_features(data.get("features") or [])
        if gdf.crs is None:
            gdf = gdf.set_crs(epsg=4326)
        return gdf
    return gpd.read_file(path)


def bulk_percentile_ranks(values: np.ndarray) -> np.ndarray:
    """Replicates frontend bulkPercentileRanks (0..100, rounded)."""
    n = int(values.size)
    if n == 0:
        return np.array([], dtype=float)
    sorted_vals = sorted(float(v) for v in values.tolist())
    out = []
    for v in values.tolist():
        at_or_below = bisect_right(sorted_vals, float(v))
        out.append(round((at_or_below / n) * 100))
    return np.asarray(out, dtype=float)


def as_numeric_series(df: pd.DataFrame, col: str, fallback: float = 0.0) -> np.ndarray:
    if col not in df.columns:
        return np.full(len(df), fallback, dtype=float)
    vals = pd.to_numeric(df[col], errors="coerce").fillna(fallback)
    return vals.to_numpy(dtype=float)


def status_composition(values: pd.Series, prefix: str = "u95") -> dict[str, float | int]:
    """Return four-status counts and exact-denominator percentages."""
    normalized = values.where(values.isin(STATUS_TOKENS), STATUS_UNKNOWN)
    total = len(normalized)
    out: dict[str, float | int] = {}
    for token in STATUS_TOKENS:
        count = int((normalized == token).sum())
        out[f"{prefix}_count_{token}"] = count
        out[f"{prefix}_pct_{token}"] = round((count / total * 100.0) if total else 0.0, 1)
    return out


def status_summary(values: pd.Series, prefix: str = "u95") -> dict[str, float | int | str]:
    """Add a deterministic categorical headline, support, and reason to a composition."""
    out: dict[str, float | int | str] = status_composition(values, prefix)
    total = len(values)
    out[f"{prefix}_support_count"] = total
    if total == 0:
        out[f"{prefix}_status"] = STATUS_UNKNOWN
        out[f"{prefix}_summary_reason"] = "no_buildings"
        return out

    counts = {token: out[f"{prefix}_count_{token}"] for token in STATUS_TOKENS}
    maximum = max(counts.values())
    leaders = [token for token, count in counts.items() if count == maximum]
    if len(leaders) != 1:
        out[f"{prefix}_status"] = STATUS_UNKNOWN
        out[f"{prefix}_summary_reason"] = "tie"
    elif leaders[0] == STATUS_UNKNOWN:
        out[f"{prefix}_status"] = STATUS_UNKNOWN
        out[f"{prefix}_summary_reason"] = "predominantly_unknown"
    else:
        out[f"{prefix}_status"] = leaders[0]
        out[f"{prefix}_summary_reason"] = "predominant"
    return out


def status_metric_definitions(minutes: int = URBAN95_FIXED_MINUTES) -> list[tuple[str, str, str]]:
    """Return (surface/status key, flat composition prefix, source-column) tuples."""
    suffix = f"_{minutes}min"
    metrics = [("u95_status", "u95", f"u95_status{suffix}")]
    for category, indicators in STATUS_HIERARCHY.items():
        metrics.append((
            f"u95_status_{category}",
            status_composition_prefix(category=category),
            category_status_field(category, suffix),
        ))
        for indicator in indicators:
            metrics.append((
                f"u95_status_sub_{category}_{indicator}",
                status_composition_prefix(category=category, indicator=indicator),
                indicator_status_field(category, indicator, suffix),
            ))
            for child in STATUS_DIAGNOSTICS.get((category, indicator), ()):
                metrics.append((
                    f"u95_status_detail_{category}_{indicator}_{child}",
                    status_composition_prefix(
                        category=category,
                        indicator=indicator,
                        parent=indicator,
                        child=child,
                    ),
                    diagnostic_status_field(category, indicator, child, suffix),
                ))
    return metrics


def status_values(frame: pd.DataFrame, source_column: str) -> pd.Series:
    if source_column in frame.columns:
        return frame[source_column]
    return pd.Series(STATUS_UNKNOWN, index=frame.index, dtype=object)


def normalize_status_token(value: object) -> str:
    try:
        if pd.isna(value):
            return STATUS_UNKNOWN
    except (TypeError, ValueError):
        return STATUS_UNKNOWN
    return value if isinstance(value, str) and value in STATUS_TOKENS else STATUS_UNKNOWN


def _unique_count_leader(values: list[str]) -> str:
    counts = {token: values.count(token) for token in STATUS_TOKENS}
    maximum = max(counts.values())
    leaders = [token for token, count in counts.items() if count == maximum]
    return leaders[0] if len(leaders) == 1 else STATUS_UNKNOWN


def _unique_influence_leader(influence: dict[str, float]) -> str:
    maximum = max(influence.values())
    leaders = [
        token
        for token, value in influence.items()
        if math.isclose(value, maximum, rel_tol=1e-12, abs_tol=0.0)
    ]
    return leaders[0] if len(leaders) == 1 else STATUS_UNKNOWN


def apply_categorical_status_plan(
    status_values_input: pd.Series | list,
    plan: IDWPlan,
) -> list[tuple[str, int]]:
    """Infer one categorical status per target without averaging status codes."""
    normalized = [normalize_status_token(value) for value in list(status_values_input)]
    if len(normalized) != plan.source_count:
        raise ValueError("status_values must have length plan.source_count")

    results: list[tuple[str, int]] = []
    for target_position in range(plan.target_count):
        start = int(plan.in_radius_indptr[target_position])
        stop = int(plan.in_radius_indptr[target_position + 1])
        source_positions = plan.in_radius_source_positions[start:stop]
        weights = plan.in_radius_weights[start:stop]
        exact_positions = source_positions[weights == 0.0]

        if len(exact_positions):
            exact_statuses = [normalized[int(position)] for position in exact_positions]
            results.append((_unique_count_leader(exact_statuses), len(exact_positions)))
            continue

        if len(source_positions):
            influence = {
                token: math.fsum(
                    float(weight)
                    for position, weight in zip(source_positions, weights)
                    if normalized[int(position)] == token
                )
                for token in STATUS_TOKENS
            }
            results.append((_unique_influence_leader(influence), len(source_positions)))
            continue

        nearest_position = int(plan.nearest_source_positions[target_position])
        if nearest_position >= 0:
            results.append((normalized[nearest_position], 1))
        else:
            results.append((STATUS_UNKNOWN, 0))
    return results


def add_status_summaries(out: dict, frame: pd.DataFrame) -> None:
    """Attach all canonical Urban95 metric summaries to an area payload."""
    for status_key, prefix, source_column in status_metric_definitions():
        summary = status_summary(status_values(frame, source_column), prefix)
        summary[status_key] = summary.pop(f"{prefix}_status")
        out.update(summary)


def build_hexagon(cx: float, cy: float, side: float) -> Polygon:
    half_h = math.sqrt(3) * side / 2.0
    return Polygon([
        (cx + side, cy),
        (cx + side / 2.0, cy + half_h),
        (cx - side / 2.0, cy + half_h),
        (cx - side, cy),
        (cx - side / 2.0, cy - half_h),
        (cx + side / 2.0, cy - half_h),
    ])


def hex_grid_for_polygon_bounds(minx: float, miny: float, maxx: float, maxy: float, side: float) -> list[Polygon]:
    """Creates a flat-top hex grid that covers the input bounds."""
    x_step = 1.5 * side
    y_step = math.sqrt(3) * side
    pad_x = side * 2.5
    pad_y = y_step * 1.5
    x = minx - pad_x
    col = 0
    grid: list[Polygon] = []
    while x <= maxx + pad_x:
        y = miny - pad_y
        if col % 2 == 1:
            y += y_step / 2.0
        while y <= maxy + pad_y:
            grid.append(build_hexagon(x, y, side))
            y += y_step
        x += x_step
        col += 1
    return grid


def has_nearby_samples_batch(
    cx: np.ndarray,
    cy: np.ndarray,
    samples: list[tuple[float, float]] | np.ndarray,
    radius_m: float,
) -> np.ndarray:
    """Vectorized nearby-sample mask for query points (cx, cy)."""
    m = int(len(cx))
    if m == 0:
        return np.zeros(0, dtype=bool)
    if samples is None or len(samples) == 0:
        return np.zeros(m, dtype=bool)
    arr = np.asarray(samples, dtype=float)
    d2 = (arr[None, :, 0] - cx[:, None]) ** 2 + (arr[None, :, 1] - cy[:, None]) ** 2
    return np.any(d2 <= radius_m * radius_m, axis=1)


def has_nearby_sample(cx: float, cy: float, samples: list[tuple[float, float]], radius_m: float) -> bool:
    mask = has_nearby_samples_batch(
        np.asarray([cx], dtype=float),
        np.asarray([cy], dtype=float),
        samples,
        radius_m,
    )
    return bool(mask[0]) if len(mask) else False


def idw_scores_batch(
    cx: np.ndarray,
    cy: np.ndarray,
    samples: list[tuple[float, float, float]] | np.ndarray,
    radius_m: float,
) -> np.ndarray:
    """Vectorized IDW for many query points against the same sample set.

    Matches the prior scalar loop semantics: exact hit (d2 < 1e-9) returns that
    sample value; otherwise inverse-distance-squared within radius; if no samples
    fall in radius, returns the nearest sample score.
    """
    m = int(len(cx))
    if m == 0:
        return np.zeros(0, dtype=float)
    if samples is None or len(samples) == 0:
        return np.zeros(m, dtype=float)
    arr = np.asarray(samples, dtype=float)
    sx = arr[:, 0]
    sy = arr[:, 1]
    sv = arr[:, 2]
    d2 = (sx[None, :] - cx[:, None]) ** 2 + (sy[None, :] - cy[:, None]) ** 2

    exact = d2 < 1e-9
    has_exact = np.any(exact, axis=1)
    exact_idx = np.argmax(exact, axis=1)
    nearest_idx = np.argmin(d2, axis=1)

    in_radius = d2 <= radius_m * radius_m
    with np.errstate(divide="ignore", invalid="ignore"):
        weights = np.where(in_radius & ~exact, 1.0 / d2, 0.0)
    numerator = np.sum(sv[None, :] * weights, axis=1)
    denominator = np.sum(weights, axis=1)

    out = np.empty(m, dtype=float)
    use_idw = (~has_exact) & (denominator > 0)
    use_nearest = (~has_exact) & (denominator <= 0)
    out[has_exact] = sv[exact_idx[has_exact]]
    out[use_idw] = numerator[use_idw] / denominator[use_idw]
    out[use_nearest] = sv[nearest_idx[use_nearest]]
    return out


def idw_score(cx: float, cy: float, samples: list[tuple[float, float, float]], radius_m: float) -> float:
    vals = idw_scores_batch(
        np.asarray([cx], dtype=float),
        np.asarray([cy], dtype=float),
        samples,
        radius_m,
    )
    return float(vals[0]) if len(vals) else 0.0


def round_coords(c, prec=5):
    if isinstance(c, (list, tuple)):
        if len(c) >= 2 and isinstance(c[0], (int, float)):
            return [round(x, prec) for x in c]
        return [round_coords(x, prec) for x in c]
    return c


def round_geometry_coords(g, prec=5):
    if not isinstance(g, dict):
        return g
    if "coordinates" in g:
        g["coordinates"] = round_coords(g["coordinates"], prec)
    elif "geometries" in g and isinstance(g["geometries"], list):
        g["geometries"] = [round_geometry_coords(sub_geom, prec) for sub_geom in g["geometries"]]
    return g


def normalize_surface_filter_key(value: str) -> str:
    s = re.sub(r"[^0-9a-zA-Z]+", "_", str(value).strip().lower())
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "other"


def amenity_filter_score_by_type(buildings_df: pd.DataFrame, amenity_type: str, minutes: int) -> np.ndarray:
    sfx = f"_{minutes}min"
    t = str(amenity_type)
    if t == "trees":
        return as_numeric_series(buildings_df, f"num_trees{sfx}", fallback=0.0) * 0.25
    if t == "street-lights":
        return as_numeric_series(buildings_df, f"num_street_lights{sfx}", fallback=0.0) * 0.25
    stat_key = "healthcare" if t == "health" else t
    return as_numeric_series(buildings_df, f"amen_{stat_key}{sfx}", fallback=0.0)


def assign_centroids_to_hexes(centroids: list[Point], hexes: list[dict]) -> list[str | None]:
    """Assign each centroid to one clipped hex, breaking shared edges by hex id."""
    assignments: list[str | None] = []
    for centroid in centroids:
        if centroid is None or centroid.is_empty:
            assignments.append(None)
            continue
        matches = sorted(
            str(cell["hex_id"])
            for cell in hexes
            if cell["geometry"].intersects(centroid)
        )
        assignments.append(matches[0] if matches else None)
    return assignments


def _has_finite_point_coordinates(point: object) -> bool:
    if point is None:
        return False
    try:
        return not point.is_empty and math.isfinite(float(point.x)) and math.isfinite(float(point.y))
    except (AttributeError, TypeError, ValueError):
        return False


def _stable_building_id_key(value: object) -> tuple:
    try:
        if pd.isna(value):
            return (2, "", "")
    except (TypeError, ValueError):
        return (2, "", "")
    text = str(value)
    try:
        numeric = float(text)
    except (TypeError, ValueError):
        numeric = math.nan
    if math.isfinite(numeric):
        return (0, numeric, text)
    return (1, text.casefold(), text)


def build_neighborhood_surface_geojson(
    neighborhoods_projected: gpd.GeoDataFrame,
    buildings: gpd.GeoDataFrame,
    filter_types: list[str],
) -> dict:
    if "Name" not in neighborhoods_projected.columns:
        raise ValueError("Neighborhood Name values must be non-null and unique")
    neighborhood_names = neighborhoods_projected["Name"]
    if neighborhood_names.isna().any():
        raise ValueError("Neighborhood Name values must be non-null")
    if neighborhood_names.astype(str).duplicated().any():
        raise ValueError("Neighborhood Name values must be unique")

    assigned = buildings[buildings["neighborhood"].notna()].copy().reset_index(drop=True)

    expanded_pct: dict[int, np.ndarray] = {}
    filter_pct: dict[int, dict[str, np.ndarray]] = {}
    for minutes in WALK_MINUTES:
        suffix = f"_{minutes}min"
        expanded_column = f"score_expanded{suffix}"
        if expanded_column in assigned.columns:
            raw = as_numeric_series(assigned, expanded_column, fallback=0.0)
        else:
            raw = (
                as_numeric_series(assigned, f"num_amenities{suffix}", fallback=0.0)
                + as_numeric_series(assigned, f"num_trees{suffix}", fallback=0.0) * 0.25
                + as_numeric_series(assigned, f"num_street_lights{suffix}", fallback=0.0) * 0.25
            )
        expanded_pct[minutes] = np.clip(bulk_percentile_ranks(raw), 0.0, 100.0)
        filter_pct[minutes] = {
            filter_type: np.clip(
                bulk_percentile_ranks(amenity_filter_score_by_type(assigned, filter_type, minutes)),
                0.0,
                100.0,
            )
            for filter_type in filter_types
        }

    cells_by_hood: dict[str, list[dict]] = {}
    for hood_index, (_, hood_row) in enumerate(neighborhoods_projected[["Name", "geometry"]].iterrows()):
        hood_name = str(hood_row.get("Name", "Unknown neighborhood"))
        polygon = hood_row.geometry
        if polygon is None or polygon.is_empty:
            continue
        cells: list[dict] = []
        for cell_index, cell in enumerate(hex_grid_for_polygon_bounds(*polygon.bounds, HEX_CELL_SIDE_METERS)):
            try:
                clipped = cell.intersection(polygon)
            except Exception:
                continue
            if clipped is None or clipped.is_empty or clipped.geom_type not in ("Polygon", "MultiPolygon"):
                continue
            cells.append({
                "hex_id": f"H{hood_index:04d}_{cell_index:06d}",
                "geometry": clipped,
                "neighborhood_name": hood_name,
            })
        if cells:
            cells_by_hood[hood_name] = cells

    metric_definitions = status_metric_definitions()
    output_cells: list[dict] = []
    for hood_name, cells in cells_by_hood.items():
        local = assigned[assigned["neighborhood"].astype(str) == hood_name].copy()
        raw_centroids = (
            local["_centroid_proj"].tolist()
            if "_centroid_proj" in local.columns
            else local.geometry.centroid.tolist()
        )
        usable_positions = [
            position
            for position, point in enumerate(raw_centroids)
            if _has_finite_point_coordinates(point)
        ]
        local = local.iloc[usable_positions].copy()
        centroids = [raw_centroids[position] for position in usable_positions]
        building_ids = local["building_id"].tolist() if "building_id" in local.columns else local.index.tolist()
        source_order = sorted(
            range(len(local)),
            key=lambda position: (
                _stable_building_id_key(building_ids[position]),
                int(local.index[position]),
            ),
        )
        local = local.iloc[source_order]
        centroids = [centroids[position] for position in source_order]

        values_by_hex = {
            cell["hex_id"]: {source: [] for _status_key, _prefix, source in metric_definitions}
            for cell in cells
        }
        for (_, row), hex_id in zip(local.iterrows(), assign_centroids_to_hexes(centroids, cells)):
            if hex_id is None:
                continue
            for _status_key, _prefix, source in metric_definitions:
                values_by_hex[hex_id][source].append(row.get(source, STATUS_UNKNOWN))

        numeric_fields = [f"score_expanded_{minutes}min" for minutes in WALK_MINUTES]
        numeric_fields.extend(
            f"score_filter_{normalize_surface_filter_key(filter_type)}_{minutes}min"
            for minutes in WALK_MINUTES
            for filter_type in filter_types
        )
        points = (
            np.asarray([(point.x, point.y) for point in centroids], dtype=float)
            if centroids
            else np.empty((0, 2), dtype=float)
        )
        queries = np.asarray(
            [(cell["geometry"].centroid.x, cell["geometry"].centroid.y) for cell in cells],
            dtype=float,
        )
        plan = build_idw_plan(points, queries, HEX_IDW_RADIUS_METERS, HEX_LOCAL_DATA_RADIUS_METERS)
        source_values = np.zeros((len(local), len(numeric_fields)), dtype=float)
        local_positions = local.index.to_numpy(dtype=int)
        for field_index, field in enumerate(numeric_fields):
            if field.startswith("score_expanded_"):
                minutes = int(field.split("_")[-1].removesuffix("min"))
                source_values[:, field_index] = expanded_pct[minutes][local_positions]
            else:
                parts = field.rsplit("_", 1)
                minutes = int(parts[1].removesuffix("min"))
                filter_stem = parts[0].removeprefix("score_filter_")
                filter_type = next(
                    item for item in filter_types if normalize_surface_filter_key(item) == filter_stem
                )
                source_values[:, field_index] = filter_pct[minutes][filter_type][local_positions]
        interpolated = apply_idw_plan(source_values, plan)
        numeric_values = {
            field: interpolated[:, field_index]
            for field_index, field in enumerate(numeric_fields)
        }
        inferred_statuses = {
            source: apply_categorical_status_plan(status_values(local, source), plan)
            for _status_key, _prefix, source in metric_definitions
        }

        for cell_index, cell in enumerate(cells):
            prop = {
                "hex_id": cell["hex_id"],
                "neighborhood_name": hood_name,
            }
            for status_key, prefix, source in metric_definitions:
                observed = pd.Series(values_by_hex[cell["hex_id"]][source], dtype=object)
                if len(observed):
                    summary = status_summary(observed, prefix)
                    if summary[f"{prefix}_summary_reason"] == "tie":
                        inferred_status, support_count = inferred_statuses[source][cell_index]
                        prop[status_key] = inferred_status
                        prop[f"{prefix}_support_count"] = support_count
                        prop[f"{prefix}_summary_reason"] = "inferred_spatial"
                    else:
                        prop[status_key] = summary[f"{prefix}_status"]
                        prop[f"{prefix}_support_count"] = summary[f"{prefix}_support_count"]
                        prop[f"{prefix}_summary_reason"] = summary[f"{prefix}_summary_reason"]
                else:
                    inferred_status, support_count = inferred_statuses[source][cell_index]
                    prop[status_key] = inferred_status
                    prop[f"{prefix}_support_count"] = support_count
                    prop[f"{prefix}_summary_reason"] = (
                        "inferred_spatial" if support_count else "no_buildings"
                    )
            prop["has_buildings"] = 1 if bool(plan.local_data_mask[cell_index]) else 0
            for field, values in numeric_values.items():
                prop[field] = round(max(0.0, min(100.0, float(values[cell_index]))), 2)
            output_cells.append({"properties": prop, "geometry": cell["geometry"]})

    if not output_cells:
        return {"type": "FeatureCollection", "features": []}

    surface_gdf = gpd.GeoDataFrame(
        [cell["properties"] for cell in output_cells],
        geometry=[cell["geometry"] for cell in output_cells],
        crs=neighborhoods_projected.crs,
    )
    surface_wgs84 = surface_gdf.to_crs(epsg=4326)
    features = []
    for _, row in surface_wgs84.iterrows():
        geom_json = round_geometry_coords(shapely_mapping(row.geometry))
        row_props = {k: row[k] for k in surface_wgs84.columns if k != "geometry"}
        features.append({"type": "Feature", "properties": row_props, "geometry": geom_json})
    return {"type": "FeatureCollection", "features": features}


def main():
    buildings_path = next((p for p in BUILDINGS_CANDIDATES if p.is_file()), None)
    if buildings_path is None:
        candidate_text = ", ".join(str(p) for p in BUILDINGS_CANDIDATES)
        raise FileNotFoundError(f"No buildings layer found. Tried: {candidate_text}")

    logging.info("Loading buildings...")
    buildings = load_geodataframe(buildings_path)
    logging.info("  %d buildings loaded", len(buildings))

    logging.info("Loading neighborhoods...")
    neighborhoods = gpd.read_file(NEIGHBORHOODS_PATH)
    logging.info("  %d neighborhoods loaded", len(neighborhoods))

    # Neighborhoods are in Web Mercator (EPSG:3857) but GeoJSON lacks CRS metadata
    hood_bounds = neighborhoods.total_bounds
    if hood_bounds[0] > 100000:
        logging.info("  Detected projected coordinates, setting CRS to EPSG:3857")
        neighborhoods = neighborhoods.set_crs(epsg=3857, allow_override=True)
        neighborhoods = neighborhoods.to_crs(epsg=4326)

    # Ensure same CRS
    if buildings.crs and neighborhoods.crs and buildings.crs != neighborhoods.crs:
        neighborhoods = neighborhoods.to_crs(buildings.crs)
    neighborhoods_projected = neighborhoods.to_crs(epsg=2039)

    # Compute building centroids for spatial join (project to metric CRS for accuracy)
    buildings_projected = buildings.to_crs(epsg=2039)
    centroids_projected = buildings_projected.geometry.centroid
    centroids_wgs84 = gpd.GeoSeries(centroids_projected, crs="EPSG:2039").to_crs(epsg=4326)
    buildings["_centroid_proj"] = centroids_projected
    buildings["_centroid"] = centroids_wgs84
    buildings_pts = buildings.set_geometry("_centroid")

    logging.info("Assigning buildings to neighborhoods...")
    joined = gpd.sjoin(buildings_pts, neighborhoods[["Name", "geometry"]], predicate="within", how="left")
    buildings["neighborhood"] = joined["Name"]
    unassigned = buildings["neighborhood"].isna().sum()
    logging.info("  %d buildings unassigned (outside all neighborhoods)", unassigned)

    existing_types = amenity_stat_keys_from_buildings(buildings)
    logging.info("  %d amenity stat keys in buildings: %s", len(existing_types), existing_types[:12])

    # Build neighborhood stats
    neighborhood_stats = {}
    assigned = buildings[buildings["neighborhood"].notna()]

    for name, group in assigned.groupby("neighborhood"):
        stats = {"name": name, "building_count": len(group)}

        for minutes in WALK_MINUTES:
            sfx = f"_{minutes}min"

            amenity_col = f"num_amenities{sfx}"
            tree_col = f"num_trees{sfx}"
            street_light_col = f"num_street_lights{sfx}"
            a_vals = pd.to_numeric(group[amenity_col], errors="coerce").fillna(0)
            t_vals = pd.to_numeric(group[tree_col], errors="coerce").fillna(0)
            sl_vals = as_numeric_series(group, street_light_col, fallback=0.0)
            overall = a_vals + t_vals * 0.25 + sl_vals * 0.25

            stats[f"avg_overall{sfx}"] = round(float(overall.mean()), 2)
            stats[f"med_overall{sfx}"] = round(float(overall.median()), 2)
            stats[f"avg_amenities{sfx}"] = round(float(a_vals.mean()), 2)
            stats[f"avg_trees{sfx}"] = round(float(t_vals.mean()), 2)
            stats[f"avg_street_lights{sfx}"] = round(float(sl_vals.mean()), 2)

            # Coverage: % of buildings with at least 1 amenity
            stats[f"coverage{sfx}"] = round(float((a_vals > 0).mean() * 100), 1)

            for t in existing_types:
                col = f"amen_{t}{sfx}"
                vals = pd.to_numeric(group[col], errors="coerce").fillna(0)
                stats[f"avg_{t}{sfx}"] = round(float(vals.mean()), 2)

            sc_col = f"score_clean{sfx}"
            if sc_col in group.columns:
                sc_vals = pd.to_numeric(group[sc_col], errors="coerce").fillna(0)
                stats[f"avg_score_clean{sfx}"] = round(float(sc_vals.mean()), 2)
                stats[f"coverage_clean{sfx}"] = round(float((sc_vals > 0).mean() * 100), 1)
            else:
                stats[f"avg_score_clean{sfx}"] = 0.0
                stats[f"coverage_clean{sfx}"] = 0.0

        add_status_summaries(stats, group)

        neighborhood_stats[name] = stats

    # Compute percentile rankings across neighborhoods for each metric
    logging.info("Computing percentile rankings...")
    for minutes in WALK_MINUTES:
        sfx = f"_{minutes}min"

        # Overall percentile
        vals = {n: s[f"avg_overall{sfx}"] for n, s in neighborhood_stats.items()}
        sorted_vals = sorted(vals.values())
        n_total = len(sorted_vals)
        for name, val in vals.items():
            rank = sum(1 for v in sorted_vals if v <= val)
            neighborhood_stats[name][f"pct_overall{sfx}"] = round(rank / n_total * 100)

        # Per-type percentiles
        for t in existing_types:
            key = f"avg_{t}{sfx}"
            vals = {n: s[key] for n, s in neighborhood_stats.items()}
            sorted_vals = sorted(vals.values())
            for name, val in vals.items():
                rank = sum(1 for v in sorted_vals if v <= val)
                neighborhood_stats[name][f"pct_{t}{sfx}"] = round(rank / n_total * 100)

        # Trees percentile
        vals = {n: s[f"avg_trees{sfx}"] for n, s in neighborhood_stats.items()}
        sorted_vals = sorted(vals.values())
        for name, val in vals.items():
            rank = sum(1 for v in sorted_vals if v <= val)
            neighborhood_stats[name][f"pct_trees{sfx}"] = round(rank / n_total * 100)

        # Default manifest score: overall percentile across neighborhoods
        vals = {n: s.get(f"avg_score_clean{sfx}", 0) for n, s in neighborhood_stats.items()}
        sorted_vals = sorted(vals.values())
        n_total = len(sorted_vals)
        for name, val in vals.items():
            rank = sum(1 for v in sorted_vals if v <= val)
            neighborhood_stats[name][f"pct_clean_overall{sfx}"] = round(rank / n_total * 100) if n_total else 0

    for hood_name in neighborhoods["Name"].dropna().astype(str):
        if hood_name in neighborhood_stats:
            continue
        empty_stats = {"name": hood_name, "building_count": 0}
        add_status_summaries(empty_stats, buildings.iloc[0:0])
        neighborhood_stats[hood_name] = empty_stats

    neighborhood_status_groups = {token: [] for token in STATUS_TOKENS}
    for name, stats in neighborhood_stats.items():
        headline = str(stats.get("u95_status", STATUS_UNKNOWN))
        if headline not in neighborhood_status_groups:
            headline = STATUS_UNKNOWN
        neighborhood_status_groups[headline].append({
            "name": str(name),
            "building_count": stats["building_count"],
            "u95_status": headline,
            "u95_support_count": stats["u95_support_count"],
            "u95_summary_reason": stats["u95_summary_reason"],
        })
    for token in STATUS_TOKENS:
        neighborhood_status_groups[token].sort(key=lambda item: item["name"])

    # Point-in-polygon inventory (clean vs legacy taxonomy) for neighborhood/city pies
    logging.info("Computing per-neighborhood POI inventory (clean vs legacy)...")
    inv_clean = inventory_counts_per_neighborhood(
        neighborhoods, AMENITIES_NEW_PATH, exclude_amenity_types=EXCLUDED_CLEAN_MANIFEST_INVENTORY_TYPES
    )
    inv_legacy = inventory_counts_per_neighborhood(neighborhoods, AMENITIES_LEGACY_PATH)

    clean_types = set()
    for d in inv_clean.values():
        clean_types.update(d.keys())
    for t in sorted(clean_types):
        counts_by_hood = {n: inv_clean.get(n, {}).get(t, 0) for n in neighborhood_stats.keys()}
        pr = percentile_ranks_across_hoods(counts_by_hood)
        for name in neighborhood_stats:
            neighborhood_stats[name][f"pct_inv_clean_{t}"] = pr.get(name, 0)

    leg_types = set()
    for d in inv_legacy.values():
        leg_types.update(d.keys())
    for t in sorted(leg_types):
        counts_by_hood = {n: inv_legacy.get(n, {}).get(t, 0) for n in neighborhood_stats.keys()}
        pr = percentile_ranks_across_hoods(counts_by_hood)
        for name in neighborhood_stats:
            neighborhood_stats[name][f"pct_inv_legacy_{t}"] = pr.get(name, 0)

    # Enrich neighborhoods GeoJSON and write with WGS84 coordinates
    logging.info("Enriching neighborhoods GeoJSON...")
    enriched_features = []
    for _, row in neighborhoods.iterrows():
        name = row.get("Name", "")
        stats = neighborhood_stats.get(name, {})

        props = {"Name": name}
        for k, v in stats.items():
            if k != "name":
                props[k] = v

        geom = row.geometry
        if geom is None or geom.is_empty:
            continue

        geom_json = shapely_mapping(geom)

        geom_json = round_geometry_coords(geom_json)

        enriched_features.append({
            "type": "Feature",
            "properties": props,
            "geometry": geom_json
        })

    enriched_geojson = {"type": "FeatureCollection", "features": enriched_features}
    with open(DOCS_DATA_DIR / "neighborhoods.geojson", "w", encoding="utf-8") as f:
        json.dump(enriched_geojson, f, separators=(",", ":"), ensure_ascii=False)
    logging.info("  Wrote enriched neighborhoods.geojson (%d features)", len(enriched_features))

    logging.info("Precomputing neighborhood surface hex map...")
    surface_filter_types: list[str] = ["trees", "street-lights"]
    for t in existing_types:
        if t not in surface_filter_types:
            surface_filter_types.append(t)
    neighborhood_surface_geojson = build_neighborhood_surface_geojson(
        neighborhoods_projected,
        buildings,
        surface_filter_types,
    )
    with open(DOCS_DATA_DIR / "neighborhood_surface.geojson", "w", encoding="utf-8") as f:
        json.dump(neighborhood_surface_geojson, f, separators=(",", ":"), ensure_ascii=False)
    logging.info(
        "  Wrote neighborhood_surface.geojson (%d features)",
        len(neighborhood_surface_geojson.get("features") or []),
    )

    charts_payload = {
        "inventory_clean": inv_clean,
        "inventory_legacy": inv_legacy,
        **build_per_neighborhood_distributions(buildings),
    }
    with open(DOCS_DATA_DIR / "neighborhood_charts.json", "w", encoding="utf-8") as f:
        json.dump(charts_payload, f, separators=(",", ":"), ensure_ascii=False)
    logging.info("  Wrote neighborhood_charts.json")

    # Citywide statistics
    logging.info("Computing citywide statistics...")
    citywide = {"total_buildings": len(buildings)}
    add_status_summaries(citywide, buildings)
    citywide["neighborhood_status_groups"] = neighborhood_status_groups

    # Pie chart: legacy POI inventory (same taxonomy as building amen_* / neighborhood breakdown).
    if AMENITIES_LEGACY_PATH.is_file():
        legacy_counts = amenity_type_counts_from_geojson(AMENITIES_LEGACY_PATH)
        citywide["amenity_counts"] = legacy_counts
        logging.info("  citywide amenity_counts: legacy file %s (%d types)", AMENITIES_LEGACY_PATH.name, len(legacy_counts))
    elif AMENITIES_NEW_PATH.is_file():
        fallback = amenity_type_counts_from_geojson(
            AMENITIES_NEW_PATH, exclude_types=EXCLUDED_CLEAN_MANIFEST_INVENTORY_TYPES
        )
        citywide["amenity_counts"] = fallback
        logging.info("  citywide amenity_counts: manifest only %s (no amenities_all)", AMENITIES_NEW_PATH.name)
    else:
        citywide["amenity_counts"] = {}

    if AMENITIES_NEW_PATH.is_file():
        citywide["amenity_counts_clean"] = amenity_type_counts_from_geojson(
            AMENITIES_NEW_PATH, exclude_types=EXCLUDED_CLEAN_MANIFEST_INVENTORY_TYPES
        )

    citywide["total_amenities"] = sum((citywide.get("amenity_counts") or {}).values())
    citywide["total_amenities_clean"] = sum((citywide.get("amenity_counts_clean") or {}).values())

    # Tree count
    trees_data = load_geojson(TREES_PATH)
    citywide["total_trees"] = len(trees_data["features"])

    # Per walking-time averages
    for minutes in WALK_MINUTES:
        sfx = f"_{minutes}min"
        a_col = f"num_amenities{sfx}"
        t_col = f"num_trees{sfx}"
        sl_col = f"num_street_lights{sfx}"
        a_vals = pd.to_numeric(buildings[a_col], errors="coerce").fillna(0)
        t_vals = pd.to_numeric(buildings[t_col], errors="coerce").fillna(0)
        sl_vals = as_numeric_series(buildings, sl_col, fallback=0.0)
        overall = a_vals + t_vals * 0.25 + sl_vals * 0.25

        citywide[f"avg_overall{sfx}"] = round(float(overall.mean()), 2)
        citywide[f"med_overall{sfx}"] = round(float(overall.median()), 2)
        citywide[f"avg_amenities{sfx}"] = round(float(a_vals.mean()), 2)
        citywide[f"avg_trees{sfx}"] = round(float(t_vals.mean()), 2)
        citywide[f"avg_street_lights{sfx}"] = round(float(sl_vals.mean()), 2)
        citywide[f"coverage{sfx}"] = round(float((a_vals > 0).mean() * 100), 1)

        # Histograms: match building score modes (same columns as house-mode choropleth)
        sc_col = f"score_clean{sfx}"
        if sc_col in buildings.columns:
            clean_vals = pd.to_numeric(buildings[sc_col], errors="coerce").fillna(0)
            hc, he = np.histogram(clean_vals, bins=20)
            citywide[f"distribution_clean{sfx}"] = {
                "counts": hc.tolist(),
                "edges": [round(e, 2) for e in he.tolist()],
            }
        se_col = f"score_expanded{sfx}"
        if se_col in buildings.columns:
            exp_vals = pd.to_numeric(buildings[se_col], errors="coerce").fillna(0)
            hc, he = np.histogram(exp_vals, bins=20)
            citywide[f"distribution_expanded{sfx}"] = {
                "counts": hc.tolist(),
                "edges": [round(e, 2) for e in he.tolist()],
            }
        hist_counts, hist_edges = np.histogram(overall, bins=20)
        citywide[f"distribution{sfx}"] = {
            "counts": hist_counts.tolist(),
            "edges": [round(e, 1) for e in hist_edges.tolist()],
        }

        # Per-type averages
        for t in existing_types:
            col = f"amen_{t}{sfx}"
            vals = pd.to_numeric(buildings[col], errors="coerce").fillna(0)
            citywide[f"avg_{t}{sfx}"] = round(float(vals.mean()), 2)

    # Neighborhood ranking table (sorted by overall score, 10min)
    ranking = []
    for name, stats in sorted(neighborhood_stats.items(), key=lambda x: x[1].get("avg_overall_10min", 0), reverse=True):
        ranking.append({
            "name": name,
            "building_count": stats["building_count"],
            "avg_overall_5min": stats.get("avg_overall_5min", 0),
            "avg_overall_10min": stats.get("avg_overall_10min", 0),
            "avg_overall_15min": stats.get("avg_overall_15min", 0),
            "pct_overall_5min": stats.get("pct_overall_5min", 0),
            "pct_overall_10min": stats.get("pct_overall_10min", 0),
            "pct_overall_15min": stats.get("pct_overall_15min", 0),
            "coverage_10min": stats.get("coverage_10min", 0),
        })
    citywide["neighborhood_ranking"] = ranking

    ranking_clean = []
    for name, stats in sorted(
        neighborhood_stats.items(),
        key=lambda x: x[1].get("avg_score_clean_10min", 0),
        reverse=True,
    ):
        ranking_clean.append({
            "name": name,
            "building_count": stats["building_count"],
            "avg_score_clean_5min": stats.get("avg_score_clean_5min", 0),
            "avg_score_clean_10min": stats.get("avg_score_clean_10min", 0),
            "avg_score_clean_15min": stats.get("avg_score_clean_15min", 0),
            "pct_clean_overall_5min": stats.get("pct_clean_overall_5min", 0),
            "pct_clean_overall_10min": stats.get("pct_clean_overall_10min", 0),
            "pct_clean_overall_15min": stats.get("pct_clean_overall_15min", 0),
            "coverage_clean_10min": stats.get("coverage_clean_10min", 0),
        })
    citywide["neighborhood_ranking_clean"] = ranking_clean

    # Per-type neighborhood comparison (top/bottom for each type at 10min)
    type_comparisons = {}
    for t in existing_types:
        key = f"avg_{t}_10min"
        sorted_hoods = sorted(neighborhood_stats.items(), key=lambda x: x[1].get(key, 0), reverse=True)
        type_comparisons[t] = {
            "best": [{"name": n, "avg": s.get(key, 0)} for n, s in sorted_hoods[:5]],
            "worst": [{"name": n, "avg": s.get(key, 0)} for n, s in sorted_hoods[-5:]],
            "citywide_avg": citywide.get(f"avg_{t}_10min", 0),
        }
    citywide["type_comparisons"] = type_comparisons

    with open(DOCS_DATA_DIR / "citywide_stats.json", "w", encoding="utf-8") as f:
        json.dump(citywide, f, separators=(",", ":"), ensure_ascii=False)
    logging.info("  Wrote citywide_stats.json")

    logging.info("Done. Neighborhood and citywide stats generated.")


if __name__ == "__main__":
    main()
