"""Per-building amenity accessibility metrics from isochrones (no network).

Approach (vectorized):
1. One isochrone GDF with ``building_id``, ``minutes`` (metric CRS).
2. For each layer, **one** ``sjoin`` against all minutes, then
   ``groupby(["building_id", "minutes"])``.
3. Sequential layer joins (simplest/safest for correctness).
"""
from __future__ import annotations

import logging
from typing import Any

import geopandas as gpd
import pandas as pd

from core.geo_io import CRS_METRIC, WALK_MINUTES, write_scored_buildings
from core.paths import SCORED_BUILDINGS, strip_building_metric_columns
from lib.amenity_layers import load_amenity_layers, normalize_clean_amenity_key, prepare_legacy_amenities
from lib.buildings_prep import load_raw_buildings
from stages.isochrones import get_building_isochrones

CLEAN_WEIGHTS = {
    "trees": 4.0,
    "parks": 15.0,
    "playgrounds": 15.0,
    "street-lights": 3.75,
    "bus_stops": 7.5,
    "shelters": 10.0,
    "education": 7.5,
    "community-centers": 5.0,
    "businesscenters": 5.0,
    "health": 7.5,
}


def _clean_pts_column_stem(weight_key: str) -> str:
    return str(weight_key).replace("-", "_")


def _init_clean_pts_columns(buildings: gpd.GeoDataFrame, suffix: str) -> None:
    for wk in CLEAN_WEIGHTS:
        stem = _clean_pts_column_stem(wk)
        buildings[f"clean_pts_{stem}{suffix}"] = 0.0


def _isochrones_dict_to_gdf(
    all_isochrones: dict[int, dict[int, object]],
) -> gpd.GeoDataFrame:
    records: list[dict[str, Any]] = []
    for bid, polys in all_isochrones.items():
        for minutes, geom in polys.items():
            records.append({"building_id": int(bid), "minutes": int(minutes), "geometry": geom})
    if not records:
        return gpd.GeoDataFrame(
            columns=["building_id", "minutes", "geometry"],
            geometry="geometry",
            crs="EPSG:4326",
        )
    return gpd.GeoDataFrame(records, crs="EPSG:4326")


def _normalize_iso_metric(
    isochrones: gpd.GeoDataFrame,
    crs_metric: int = CRS_METRIC,
) -> gpd.GeoDataFrame:
    iso = isochrones.copy()
    if iso.crs is None:
        iso = iso.set_crs(epsg=4326)
    iso = iso.to_crs(epsg=crs_metric)
    return iso[["building_id", "minutes", "geometry"]].copy()


def _sjoin_size_by_building_minutes(
    features: gpd.GeoDataFrame | None,
    iso_gdf: gpd.GeoDataFrame,
    *,
    predicate: str,
) -> pd.Series:
    """One sjoin → groupby([building_id, minutes]).size()."""
    if features is None or len(features) == 0 or len(iso_gdf) == 0:
        return pd.Series(dtype="int64")
    right = iso_gdf.set_geometry("geometry")[["building_id", "minutes", "geometry"]]
    joined = gpd.sjoin(
        features.set_geometry("geometry"),
        right,
        predicate=predicate,
        how="inner",
    )
    if len(joined) == 0:
        return pd.Series(dtype="int64")
    return joined.groupby(["building_id", "minutes"]).size()


def _sjoin_legacy_typed(
    amenities_legacy: gpd.GeoDataFrame,
    iso_gdf: gpd.GeoDataFrame,
) -> pd.DataFrame:
    """One sjoin → rows of building_id, minutes, amenity_type, count."""
    empty = pd.DataFrame(columns=["building_id", "minutes", "amenity_type", "count"])
    if len(amenities_legacy) == 0 or len(iso_gdf) == 0:
        return empty
    if "amenity_type" not in amenities_legacy.columns:
        return empty
    right = iso_gdf.set_geometry("geometry")[["building_id", "minutes", "geometry"]]
    joined = gpd.sjoin(
        amenities_legacy.set_geometry("geometry"),
        right,
        predicate="within",
        how="inner",
    )
    if len(joined) == 0:
        return empty
    return (
        joined.groupby(["building_id", "minutes", "amenity_type"])
        .size()
        .reset_index(name="count")
    )


def _sjoin_clean_typed(
    amenities_clean: gpd.GeoDataFrame,
    iso_gdf: gpd.GeoDataFrame,
) -> pd.DataFrame:
    """One sjoin → rows of building_id, minutes, amenity_key, count."""
    empty = pd.DataFrame(columns=["building_id", "minutes", "amenity_key", "count"])
    if len(amenities_clean) == 0 or "amenity_type" not in amenities_clean.columns:
        return empty
    if len(iso_gdf) == 0:
        return empty
    right = iso_gdf.set_geometry("geometry")[["building_id", "minutes", "geometry"]]
    joined = gpd.sjoin(
        amenities_clean.set_geometry("geometry"),
        right,
        predicate="within",
        how="inner",
    )
    if len(joined) == 0:
        return empty
    joined = joined.copy()
    joined["amenity_key"] = joined["amenity_type"].map(normalize_clean_amenity_key)
    return (
        joined.groupby(["building_id", "minutes", "amenity_key"])
        .size()
        .reset_index(name="count")
    )


def _apply_simple_counts(
    buildings: gpd.GeoDataFrame,
    counts: pd.Series,
    col_stem: str,
) -> None:
    """Map (building_id, minutes) counts onto num_*_{minutes}min columns."""
    for minutes in WALK_MINUTES:
        suffix = f"_{minutes}min"
        col = f"{col_stem}{suffix}"
        if counts.empty:
            buildings[col] = 0
            continue
        level_names = list(counts.index.names)
        if "minutes" in level_names:
            try:
                minute_counts = counts.xs(int(minutes), level="minutes")
            except KeyError:
                buildings[col] = 0
                continue
        else:
            buildings[col] = 0
            continue
        buildings[col] = buildings["building_id"].map(minute_counts).fillna(0).astype(int)


def _apply_legacy_and_scores(
    buildings: gpd.GeoDataFrame,
    *,
    legacy_typed: pd.DataFrame,
    tree_counts: pd.Series,
    light_counts: pd.Series,
    park_counts: pd.Series,
    clean_typed: pd.DataFrame,
) -> gpd.GeoDataFrame:
    """Merge layer pivots onto buildings and compute expanded/clean scores (main thread)."""
    out = buildings

    for minutes in WALK_MINUTES:
        suffix = f"_{minutes}min"
        if not legacy_typed.empty:
            sub = legacy_typed[legacy_typed["minutes"].astype(int) == int(minutes)]
            if len(sub) > 0:
                pivot = (
                    sub.groupby(["building_id", "amenity_type"])["count"]
                    .sum()
                    .reset_index()
                    .pivot(index="building_id", columns="amenity_type", values="count")
                    .fillna(0)
                )
                pivot.columns = [
                    f"amen_{str(c).replace(' ', '_')}{suffix}" for c in pivot.columns
                ]
                pivot = pivot.reset_index()
                out = out.merge(pivot, on="building_id", how="left")

        metric_cols = [c for c in out.columns if c.startswith("amen_") and c.endswith(suffix)]
        for col in metric_cols:
            out[col] = out[col].fillna(0).astype(int)
        out[f"num_amenities{suffix}"] = (
            out[metric_cols].sum(axis=1).astype(int) if metric_cols else 0
        )

    _apply_simple_counts(out, tree_counts, "num_trees")
    _apply_simple_counts(out, light_counts, "num_street_lights")

    for minutes in WALK_MINUTES:
        suffix = f"_{minutes}min"
        out[f"score_expanded{suffix}"] = (
            out[f"num_amenities{suffix}"].astype(float)
            + out[f"num_trees{suffix}"].astype(float) * 0.25
            + out[f"num_street_lights{suffix}"].astype(float) * 0.25
        )

        bids = [int(b) for b in out["building_id"].unique()]
        clean_detail = {k: {bid: 0.0 for bid in bids} for k in CLEAN_WEIGHTS}

        nt = out.set_index("building_id")[f"num_trees{suffix}"]
        for bid, n in nt.items():
            clean_detail["trees"][int(bid)] += CLEAN_WEIGHTS["trees"] * float(n)

        if not park_counts.empty:
            try:
                pc = park_counts.xs(int(minutes), level="minutes")
            except KeyError:
                pc = pd.Series(dtype="int64")
            for bid, count in pc.items():
                clean_detail["parks"][int(bid)] += CLEAN_WEIGHTS["parks"] * float(count)

        if not clean_typed.empty:
            sub = clean_typed[clean_typed["minutes"].astype(int) == int(minutes)]
            for _, row in sub.iterrows():
                ak = row["amenity_key"]
                if not ak or ak not in CLEAN_WEIGHTS:
                    continue
                weight = CLEAN_WEIGHTS[ak]
                if weight <= 0:
                    continue
                clean_detail[ak][int(row["building_id"])] += weight * float(row["count"])

        for wk in CLEAN_WEIGHTS:
            stem = _clean_pts_column_stem(wk)
            col = f"clean_pts_{stem}{suffix}"
            out[col] = (
                out["building_id"]
                .map(lambda b, key=wk: clean_detail[key].get(int(b), 0.0))
                .astype(float)
            )

        clean_scores = {bid: sum(clean_detail[k][bid] for k in CLEAN_WEIGHTS) for bid in bids}
        out[f"score_clean{suffix}"] = (
            out["building_id"].map(lambda b: clean_scores.get(int(b), 0.0)).astype(float)
        )

        sum_cols = [f"clean_pts_{_clean_pts_column_stem(wk)}{suffix}" for wk in CLEAN_WEIGHTS]
        pts_sum = out[sum_cols].sum(axis=1)
        max_diff = (out[f"score_clean{suffix}"] - pts_sum).abs().max()
        if max_diff > 1e-3:
            logging.warning(
                "clean_pts columns sum differs from score_clean (max abs diff=%s) for %smin.",
                max_diff,
                minutes,
            )

    return out


def compute_amenity_metrics(
    buildings: gpd.GeoDataFrame,
    isochrones: gpd.GeoDataFrame,
    *,
    amenities_legacy: gpd.GeoDataFrame,
    trees: gpd.GeoDataFrame | None,
    street_lights: gpd.GeoDataFrame | None,
    parks: gpd.GeoDataFrame | None,
    amenities_clean: gpd.GeoDataFrame,
    crs_metric: int = CRS_METRIC,
) -> gpd.GeoDataFrame:
    """Pure join path: one sjoin per layer against all minutes, then groupby + merge."""
    out = buildings.copy()
    iso_gdf = _normalize_iso_metric(isochrones, crs_metric)

    if len(iso_gdf) == 0:
        for minutes in WALK_MINUTES:
            suffix = f"_{minutes}min"
            out[f"num_amenities{suffix}"] = 0
            out[f"num_trees{suffix}"] = 0
            out[f"num_street_lights{suffix}"] = 0
            out[f"score_clean{suffix}"] = 0.0
            out[f"score_expanded{suffix}"] = 0.0
            _init_clean_pts_columns(out, suffix)
        return out

    legacy_typed = _sjoin_legacy_typed(amenities_legacy, iso_gdf)
    tree_counts = _sjoin_size_by_building_minutes(trees, iso_gdf, predicate="within")
    light_counts = _sjoin_size_by_building_minutes(
        street_lights, iso_gdf, predicate="within"
    )
    park_counts = _sjoin_size_by_building_minutes(parks, iso_gdf, predicate="intersects")
    clean_typed = _sjoin_clean_typed(amenities_clean, iso_gdf)

    return _apply_legacy_and_scores(
        out,
        legacy_typed=legacy_typed,
        tree_counts=tree_counts,
        light_counts=light_counts,
        park_counts=park_counts,
        clean_typed=clean_typed,
    )


def run_amenity_metrics(
    buildings: gpd.GeoDataFrame,
    *,
    isochrones: gpd.GeoDataFrame | dict[int, dict[int, object]] | None = None,
) -> gpd.GeoDataFrame:
    """Strip metric cols, join amenities via isochrones, return buildings with amenity metrics (no network)."""
    crs_metric = CRS_METRIC
    buildings = strip_building_metric_columns(buildings.copy())

    amenities_legacy, amenities_clean, trees_gdf, parks_gdf, street_lights_gdf, merged_path = (
        load_amenity_layers(crs_metric)
    )
    amenities_legacy, _ = prepare_legacy_amenities(amenities_legacy, merged_path, crs_metric)

    if isochrones is None:
        iso_gdf = _isochrones_dict_to_gdf(get_building_isochrones(buildings))
    elif isinstance(isochrones, dict):
        iso_gdf = _isochrones_dict_to_gdf(isochrones)
    else:
        iso_gdf = isochrones

    return compute_amenity_metrics(
        buildings,
        iso_gdf,
        amenities_legacy=amenities_legacy,
        trees=trees_gdf,
        street_lights=street_lights_gdf,
        parks=parks_gdf,
        amenities_clean=amenities_clean,
        crs_metric=crs_metric,
    )


def run_amenity_metrics_stage(
    *,
    buildings: gpd.GeoDataFrame | None = None,
    isochrones: gpd.GeoDataFrame | dict[int, dict[int, object]] | None = None,
    write_output: bool = True,
) -> gpd.GeoDataFrame:
    """If isochrones is provided, do NOT call get_building_isochrones / disk reload.
    GeoDataFrame form: columns building_id, minutes, geometry (any CRS; reproject inside).
    dict form: same as get_building_isochrones return value.
    """
    if buildings is None:
        buildings = load_raw_buildings()

    buildings = run_amenity_metrics(buildings, isochrones=isochrones)
    if write_output:
        write_scored_buildings(buildings, SCORED_BUILDINGS)
    return buildings
