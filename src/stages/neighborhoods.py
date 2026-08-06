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
from shapely.geometry import Polygon, mapping as shapely_mapping

from core.paths import DOCS_DATA_DIR, layer
from lib.neighborhood_distributions import build_per_neighborhood_distributions
from lib.neighborhood_idw import IDWPlan, apply_idw_plan, build_idw_plan

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
WEIGHTED_CATEGORY_STEMS = [
    "environmental_quality",
    "nature",
    "play",
    "safety_mobility",
    "family_services",
]

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


def weighted_subcategory_stems_from_buildings(buildings: gpd.GeoDataFrame) -> dict[str, list[str]]:
    out = {stem: set() for stem in WEIGHTED_CATEGORY_STEMS}
    for col in buildings.columns:
        col_s = str(col)
        for stem in WEIGHTED_CATEGORY_STEMS:
            prefix = f"score_weighted_sub_{stem}_"
            if not col_s.startswith(prefix):
                continue
            for minutes in WALK_MINUTES:
                suffix = f"_{minutes}min"
                if not col_s.endswith(suffix):
                    continue
                sub_stem = col_s[len(prefix):-len(suffix)]
                if sub_stem:
                    out[stem].add(sub_stem)
                break
    return {k: sorted(v) for k, v in out.items()}


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


def build_neighborhood_surface_geojson(
    neighborhoods_projected: gpd.GeoDataFrame,
    buildings: gpd.GeoDataFrame,
    filter_types: list[str],
) -> dict:
    assigned = buildings[buildings["neighborhood"].notna()].copy()
    if len(assigned) == 0:
        return {"type": "FeatureCollection", "features": []}

    weighted_by_minutes: dict[int, np.ndarray] = {}
    expanded_pct_by_minutes: dict[int, np.ndarray] = {}
    filter_pct_by_minutes: dict[int, dict[str, np.ndarray]] = {}
    weighted_category_by_minutes: dict[int, dict[str, np.ndarray]] = {}
    weighted_subcategory_by_minutes: dict[int, dict[str, dict[str, np.ndarray]]] = {}
    weighted_sub_stems = weighted_subcategory_stems_from_buildings(assigned)
    for minutes in WALK_MINUTES:
        sfx = f"_{minutes}min"

        weighted = as_numeric_series(
            assigned,
            f"score_weighted{sfx}" if f"score_weighted{sfx}" in assigned.columns else "score_weighted",
            fallback=0.0,
        )
        weighted_by_minutes[minutes] = np.clip(weighted, 0.0, 100.0)

        if f"score_expanded{sfx}" in assigned.columns:
            expanded_raw = as_numeric_series(assigned, f"score_expanded{sfx}", fallback=0.0)
        else:
            amenities = as_numeric_series(assigned, f"num_amenities{sfx}", fallback=0.0)
            trees = as_numeric_series(assigned, f"num_trees{sfx}", fallback=0.0)
            street_lights = as_numeric_series(assigned, f"num_street_lights{sfx}", fallback=0.0)
            expanded_raw = amenities + trees * 0.25 + street_lights * 0.25
        expanded_pct_by_minutes[minutes] = np.clip(bulk_percentile_ranks(expanded_raw), 0.0, 100.0)

        pct_by_filter: dict[str, np.ndarray] = {}
        for f_type in filter_types:
            filter_vals = amenity_filter_score_by_type(assigned, f_type, minutes)
            pct_by_filter[f_type] = np.clip(bulk_percentile_ranks(filter_vals), 0.0, 100.0)
        filter_pct_by_minutes[minutes] = pct_by_filter

        category_vals: dict[str, np.ndarray] = {}
        for cat_stem in WEIGHTED_CATEGORY_STEMS:
            cat_col = f"score_weighted_{cat_stem}{sfx}"
            if cat_col in assigned.columns:
                vals = as_numeric_series(assigned, cat_col, fallback=0.0)
            else:
                vals = np.zeros(len(assigned), dtype=float)
            category_vals[cat_stem] = np.clip(vals, 0.0, 100.0)
        weighted_category_by_minutes[minutes] = category_vals

        subcategory_vals: dict[str, dict[str, np.ndarray]] = {}
        for cat_stem in WEIGHTED_CATEGORY_STEMS:
            subcategory_vals[cat_stem] = {}
            for sub_stem in weighted_sub_stems.get(cat_stem, []):
                sub_col = f"score_weighted_sub_{cat_stem}_{sub_stem}{sfx}"
                if sub_col in assigned.columns:
                    sub_vals = as_numeric_series(assigned, sub_col, fallback=0.0)
                else:
                    sub_vals = np.zeros(len(assigned), dtype=float)
                subcategory_vals[cat_stem][sub_stem] = np.clip(sub_vals, 0.0, 100.0)
        weighted_subcategory_by_minutes[minutes] = subcategory_vals

    weighted_fixed = weighted_by_minutes.get(URBAN95_FIXED_MINUTES)
    if weighted_fixed is None:
        weighted_fixed = weighted_by_minutes.get(10) or weighted_by_minutes.get(5) or weighted_by_minutes.get(15)
    if weighted_fixed is None:
        weighted_fixed = np.zeros(len(assigned), dtype=float)

    weighted_categories_fixed = weighted_category_by_minutes.get(URBAN95_FIXED_MINUTES, {})
    weighted_subcategories_fixed = weighted_subcategory_by_minutes.get(URBAN95_FIXED_MINUTES, {})

    local_points_by_name: dict[str, list[tuple[float, float]]] = {}
    local_scores_by_name: dict[str, dict[str, list[tuple[float, float, float]]]] = {}
    for i, (_, row) in enumerate(assigned.iterrows()):
        name = str(row.get("neighborhood", ""))
        geom_proj = row.get("_centroid_proj")
        if geom_proj is None or geom_proj.is_empty:
            continue
        x = float(geom_proj.x)
        y = float(geom_proj.y)
        local_points_by_name.setdefault(name, []).append((x, y))
        score_bucket = local_scores_by_name.setdefault(name, {})
        score_bucket.setdefault("score_weighted", []).append((x, y, float(weighted_fixed[i])))
        for cat_stem in WEIGHTED_CATEGORY_STEMS:
            cat_key = f"score_weighted_{cat_stem}"
            cat_arr = weighted_categories_fixed.get(cat_stem)
            cat_val = float(cat_arr[i]) if cat_arr is not None else 0.0
            score_bucket.setdefault(cat_key, []).append((x, y, cat_val))
        for cat_stem in WEIGHTED_CATEGORY_STEMS:
            for sub_stem in weighted_sub_stems.get(cat_stem, []):
                sub_key = f"score_weighted_sub_{cat_stem}_{sub_stem}"
                sub_arr = weighted_subcategories_fixed.get(cat_stem, {}).get(sub_stem)
                sub_val = float(sub_arr[i]) if sub_arr is not None else 0.0
                score_bucket.setdefault(sub_key, []).append((x, y, sub_val))
        for minutes in WALK_MINUTES:
            e_key = f"score_expanded_{minutes}min"
            score_bucket.setdefault(e_key, []).append((x, y, float(expanded_pct_by_minutes[minutes][i])))
            for f_type in filter_types:
                f_norm = normalize_surface_filter_key(f_type)
                f_key = f"score_filter_{f_norm}_{minutes}min"
                score_bucket.setdefault(f_key, []).append((x, y, float(filter_pct_by_minutes[minutes][f_type][i])))

    geoms: list = []
    props: list[dict] = []

    hoods_proj = neighborhoods_projected[["Name", "geometry"]].copy()
    for _, hood_row in hoods_proj.iterrows():
        hood_name = str(hood_row.get("Name", "Unknown neighborhood"))
        poly = hood_row.geometry
        if poly is None or poly.is_empty:
            continue
        minx, miny, maxx, maxy = poly.bounds
        grid = hex_grid_for_polygon_bounds(minx, miny, maxx, maxy, HEX_CELL_SIDE_METERS)

        local_points = local_points_by_name.get(hood_name, [])
        local_scores = local_scores_by_name.get(hood_name, {})

        clipped_geoms: list = []
        cx_list: list[float] = []
        cy_list: list[float] = []
        for cell in grid:
            try:
                clipped = cell.intersection(poly)
            except Exception:
                continue
            if clipped is None or clipped.is_empty:
                continue
            if clipped.geom_type not in ("Polygon", "MultiPolygon"):
                continue
            centroid = clipped.centroid
            clipped_geoms.append(clipped)
            cx_list.append(float(centroid.x))
            cy_list.append(float(centroid.y))

        if not clipped_geoms:
            continue

        cx_arr = np.asarray(cx_list, dtype=float)
        cy_arr = np.asarray(cy_list, dtype=float)
        field_keys = ["score_weighted"]
        field_keys.extend(
            f"score_weighted_{cat_stem}" for cat_stem in WEIGHTED_CATEGORY_STEMS
        )
        for cat_stem in WEIGHTED_CATEGORY_STEMS:
            field_keys.extend(
                f"score_weighted_sub_{cat_stem}_{sub_stem}"
                for sub_stem in weighted_sub_stems.get(cat_stem, [])
            )
        field_keys.extend(f"score_expanded_{minutes}min" for minutes in WALK_MINUTES)
        for minutes in WALK_MINUTES:
            for f_type in filter_types:
                field_keys.append(
                    f"score_filter_{normalize_surface_filter_key(f_type)}_{minutes}min"
                )

        source_values = np.zeros((len(local_points), len(field_keys)), dtype=float)
        for field_index, key in enumerate(field_keys):
            samples = local_scores.get(key, [])
            if len(samples) != len(local_points):
                # Every generated field normally has one value per source row;
                # retain the scalar default if a sparse optional field is absent.
                continue
            source_values[:, field_index] = np.asarray(
                [float(sample[2]) for sample in samples], dtype=float
            )
        plan = build_idw_plan(
            np.asarray(local_points, dtype=float).reshape((-1, 2)),
            np.column_stack((cx_arr, cy_arr)),
            HEX_IDW_RADIUS_METERS,
            HEX_LOCAL_DATA_RADIUS_METERS,
        )
        field_values = apply_idw_plan(source_values, plan)
        field_values_by_key = {
            key: field_values[:, field_index] for field_index, key in enumerate(field_keys)
        }
        has_local = plan.local_data_mask
        sw_vals = field_values_by_key["score_weighted"]
        cat_vals = {
            cat_stem: field_values_by_key[f"score_weighted_{cat_stem}"]
            for cat_stem in WEIGHTED_CATEGORY_STEMS
        }
        sub_vals: dict[str, np.ndarray] = {}
        for cat_stem in WEIGHTED_CATEGORY_STEMS:
            for sub_stem in weighted_sub_stems.get(cat_stem, []):
                sub_key = f"score_weighted_sub_{cat_stem}_{sub_stem}"
                sub_vals[sub_key] = field_values_by_key[sub_key]
        expanded_vals = {
            minutes: field_values_by_key[f"score_expanded_{minutes}min"]
            for minutes in WALK_MINUTES
        }
        filter_vals: dict[str, np.ndarray] = {}
        for minutes in WALK_MINUTES:
            for f_type in filter_types:
                f_key = f"score_filter_{normalize_surface_filter_key(f_type)}_{minutes}min"
                filter_vals[f_key] = field_values_by_key[f_key]

        for i, clipped in enumerate(clipped_geoms):
            out_props = {
                "hex_id": f"H{i + 1}",
                "neighborhood_name": hood_name,
                "has_buildings": 1 if bool(has_local[i]) else 0,
            }
            out_props["score_weighted"] = round(
                max(0.0, min(100.0, float(sw_vals[i]))), 2
            )
            for cat_stem in WEIGHTED_CATEGORY_STEMS:
                cat_key = f"score_weighted_{cat_stem}"
                out_props[cat_key] = round(
                    max(0.0, min(100.0, float(cat_vals[cat_stem][i]))), 2
                )
            for cat_stem in WEIGHTED_CATEGORY_STEMS:
                for sub_stem in weighted_sub_stems.get(cat_stem, []):
                    sub_key = f"score_weighted_sub_{cat_stem}_{sub_stem}"
                    out_props[sub_key] = round(
                        max(0.0, min(100.0, float(sub_vals[sub_key][i]))), 2
                    )
            for minutes in WALK_MINUTES:
                e_key = f"score_expanded_{minutes}min"
                out_props[e_key] = round(
                    max(0.0, min(100.0, float(expanded_vals[minutes][i]))), 2
                )
                for f_type in filter_types:
                    f_norm = normalize_surface_filter_key(f_type)
                    f_key = f"score_filter_{f_norm}_{minutes}min"
                    out_props[f_key] = round(
                        max(0.0, min(100.0, float(filter_vals[f_key][i]))), 2
                    )

            geoms.append(clipped)
            props.append(out_props)

    if not geoms:
        return {"type": "FeatureCollection", "features": []}

    surface_gdf = gpd.GeoDataFrame(props, geometry=geoms, crs=neighborhoods_projected.crs)
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
    weighted_sub_stems = weighted_subcategory_stems_from_buildings(buildings)
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

            sw_col = f"score_weighted{sfx}"
            if sw_col in group.columns:
                sw_vals = pd.to_numeric(group[sw_col], errors="coerce").fillna(0)
                stats[f"avg_score_weighted{sfx}"] = round(float(sw_vals.mean()), 2)
                stats[f"coverage_weighted{sfx}"] = round(float((sw_vals > 0).mean() * 100), 1)
            else:
                stats[f"avg_score_weighted{sfx}"] = 0.0
                stats[f"coverage_weighted{sfx}"] = 0.0

            for cat_stem in WEIGHTED_CATEGORY_STEMS:
                cat_col = f"score_weighted_{cat_stem}{sfx}"
                if cat_col in group.columns:
                    cat_vals = pd.to_numeric(group[cat_col], errors="coerce").fillna(0)
                    stats[f"avg_score_weighted_{cat_stem}{sfx}"] = round(float(cat_vals.mean()), 2)
                else:
                    stats[f"avg_score_weighted_{cat_stem}{sfx}"] = 0.0
                for sub_stem in weighted_sub_stems.get(cat_stem, []):
                    sub_col = f"score_weighted_sub_{cat_stem}_{sub_stem}{sfx}"
                    out_col = f"avg_score_weighted_sub_{cat_stem}_{sub_stem}{sfx}"
                    if sub_col in group.columns:
                        sub_vals = pd.to_numeric(group[sub_col], errors="coerce").fillna(0)
                        stats[out_col] = round(float(sub_vals.mean()), 2)
                    else:
                        stats[out_col] = 0.0

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

        vals = {n: s.get(f"avg_score_weighted{sfx}", 0) for n, s in neighborhood_stats.items()}
        sorted_vals = sorted(vals.values())
        n_total = len(sorted_vals)
        for name, val in vals.items():
            rank = sum(1 for v in sorted_vals if v <= val)
            neighborhood_stats[name][f"pct_weighted_overall{sfx}"] = round(rank / n_total * 100) if n_total else 0

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
        sw_col = f"score_weighted{sfx}"
        if sw_col in buildings.columns:
            weighted_vals = pd.to_numeric(buildings[sw_col], errors="coerce").fillna(0)
            hc, he = np.histogram(weighted_vals, bins=20)
            citywide[f"distribution_weighted{sfx}"] = {
                "counts": hc.tolist(),
                "edges": [round(e, 2) for e in he.tolist()],
            }

        for cat_stem in WEIGHTED_CATEGORY_STEMS:
            cat_col = f"score_weighted_{cat_stem}{sfx}"
            if cat_col in buildings.columns:
                cat_vals = pd.to_numeric(buildings[cat_col], errors="coerce").fillna(0)
                citywide[f"avg_score_weighted_{cat_stem}{sfx}"] = round(float(cat_vals.mean()), 2)
            else:
                citywide[f"avg_score_weighted_{cat_stem}{sfx}"] = 0.0
            for sub_stem in weighted_sub_stems.get(cat_stem, []):
                sub_col = f"score_weighted_sub_{cat_stem}_{sub_stem}{sfx}"
                out_col = f"avg_score_weighted_sub_{cat_stem}_{sub_stem}{sfx}"
                if sub_col in buildings.columns:
                    sub_vals = pd.to_numeric(buildings[sub_col], errors="coerce").fillna(0)
                    citywide[out_col] = round(float(sub_vals.mean()), 2)
                else:
                    citywide[out_col] = 0.0

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

    ranking_weighted = []
    for name, stats in sorted(
        neighborhood_stats.items(),
        key=lambda x: x[1].get("avg_score_weighted_10min", 0),
        reverse=True,
    ):
        entry = {
            "name": name,
            "building_count": stats["building_count"],
            "avg_score_weighted_5min": stats.get("avg_score_weighted_5min", 0),
            "avg_score_weighted_10min": stats.get("avg_score_weighted_10min", 0),
            "avg_score_weighted_15min": stats.get("avg_score_weighted_15min", 0),
            "pct_weighted_overall_5min": stats.get("pct_weighted_overall_5min", 0),
            "pct_weighted_overall_10min": stats.get("pct_weighted_overall_10min", 0),
            "pct_weighted_overall_15min": stats.get("pct_weighted_overall_15min", 0),
            "coverage_weighted_10min": stats.get("coverage_weighted_10min", 0),
        }
        for cat_stem in WEIGHTED_CATEGORY_STEMS:
            for minutes in WALK_MINUTES:
                key = f"avg_score_weighted_{cat_stem}_{minutes}min"
                entry[key] = stats.get(key, 0)
            for sub_stem in weighted_sub_stems.get(cat_stem, []):
                for minutes in WALK_MINUTES:
                    sub_key = f"avg_score_weighted_sub_{cat_stem}_{sub_stem}_{minutes}min"
                    entry[sub_key] = stats.get(sub_key, 0)
        ranking_weighted.append(entry)
    citywide["neighborhood_ranking_weighted"] = ranking_weighted

    # Per-type neighborhood comparison (top/bottom for each type at 10min)
    type_comparisons = {}
    for t in existing_types:
        key = f"avg_{t}_10min"
        sorted_hoods = sorted(neighborhood_stats.items(), key=lambda x: x[1].get(key, 0), reverse=True)
        type_comparisons[t] = {
            "best": [{"name": n, "avg": s[key]} for n, s in sorted_hoods[:5]],
            "worst": [{"name": n, "avg": s[key]} for n, s in sorted_hoods[-5:]],
            "citywide_avg": citywide.get(f"avg_{t}_10min", 0),
        }
    citywide["type_comparisons"] = type_comparisons

    with open(DOCS_DATA_DIR / "citywide_stats.json", "w", encoding="utf-8") as f:
        json.dump(citywide, f, separators=(",", ":"), ensure_ascii=False)
    logging.info("  Wrote citywide_stats.json")

    logging.info("Done. Neighborhood and citywide stats generated.")


if __name__ == "__main__":
    main()
