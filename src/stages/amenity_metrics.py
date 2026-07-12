"""Per-building amenity accessibility metrics from isochrones (no network)."""
from __future__ import annotations

import logging
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd

from core.geo_io import CRS_METRIC, WALK_MINUTES, write_scored_buildings
from core.paths import SCORED_BUILDINGS, strip_building_metric_columns
from lib.amenity_layers import (
    PreparedAmenityLayers,
    load_amenity_layers,
    normalize_clean_amenity_key,
    prepare_amenity_layers,
    prepare_legacy_amenities,
)
from lib.buildings_prep import load_raw_buildings
from lib.spatial_pairs import count_pairs_by_group, iter_query_pairs
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
        buildings[f"clean_pts_{_clean_pts_column_stem(wk)}{suffix}"] = 0.0


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
    iso = iso[["building_id", "minutes", "geometry"]].copy()
    return iso.drop_duplicates(
        ["building_id", "minutes"], keep="last"
    ).reset_index(drop=True)


def _categorical_codes(values: pd.Series) -> tuple[np.ndarray, tuple[str, ...]]:
    categorical = pd.Categorical(values)
    categories = tuple(str(value) for value in categorical.categories)
    return np.asarray(categorical.codes, dtype=np.int32), categories


def _query_layer_counts(
    query_geometries: gpd.GeoSeries,
    source: gpd.GeoDataFrame | None,
    *,
    predicate: str,
    source_group_codes: np.ndarray,
    group_count: int,
    chunk_size: int = 2048,
) -> np.ndarray:
    query_count = len(query_geometries)
    if source is None or len(source) == 0 or query_count == 0 or group_count == 0:
        return np.zeros((query_count, group_count), dtype=np.uint8)

    counts = np.zeros((query_count, group_count), dtype=np.uint64)
    for query_positions, source_positions in iter_query_pairs(
        query_geometries,
        source.geometry,
        predicate=predicate,
        chunk_size=chunk_size,
    ):
        counts += count_pairs_by_group(
            query_positions,
            source_positions,
            source_group_codes,
            query_count,
            group_count,
        )
    return counts


def _aggregate_by_building_and_minute(
    iso_gdf: gpd.GeoDataFrame,
    row_counts: np.ndarray,
    building_ids: np.ndarray,
) -> dict[int, np.ndarray]:
    """Reduce isochrone-row matrices to output-building rows for each minute."""
    result = {
        int(minutes): np.zeros((len(building_ids), row_counts.shape[1]), dtype=np.int64)
        for minutes in WALK_MINUTES
    }
    if len(iso_gdf) == 0 or row_counts.shape[0] == 0:
        return result

    output_positions = pd.Index(building_ids).get_indexer(iso_gdf["building_id"])
    minutes = iso_gdf["minutes"].astype(int).to_numpy()
    for walk_minutes in WALK_MINUTES:
        selected = np.flatnonzero(minutes == int(walk_minutes))
        if selected.size == 0:
            continue
        selected_output = output_positions[selected]
        valid = selected_output >= 0
        if valid.any():
            np.add.at(result[int(walk_minutes)], selected_output[valid], row_counts[selected[valid]])
    return result


def _aggregate_simple_counts(
    iso_gdf: gpd.GeoDataFrame,
    row_counts: np.ndarray,
    building_ids: np.ndarray,
) -> dict[int, np.ndarray]:
    grouped = _aggregate_by_building_and_minute(iso_gdf, row_counts.reshape(-1, 1), building_ids)
    return {minutes: values[:, 0] for minutes, values in grouped.items()}


def _source_codes_for_column(
    source: gpd.GeoDataFrame | None,
    column: str,
    normalizer=None,
) -> tuple[np.ndarray, tuple[str, ...]]:
    if source is None or len(source) == 0 or column not in source.columns:
        return np.array([], dtype=np.int32), ()
    values = source[column]
    if normalizer is not None:
        values = values.map(normalizer)
    return _categorical_codes(values)


def _apply_layerwise_metrics(
    buildings: gpd.GeoDataFrame,
    iso_gdf: gpd.GeoDataFrame,
    *,
    legacy_counts: np.ndarray,
    legacy_categories: tuple[str, ...],
    tree_counts: dict[int, np.ndarray],
    light_counts: dict[int, np.ndarray],
    park_counts: dict[int, np.ndarray],
    clean_counts: np.ndarray,
    clean_categories: tuple[str, ...],
) -> gpd.GeoDataFrame:
    out = buildings
    building_ids = out["building_id"].to_numpy()
    legacy_by_minute = _aggregate_by_building_and_minute(iso_gdf, legacy_counts, building_ids)
    clean_by_minute = _aggregate_by_building_and_minute(iso_gdf, clean_counts, building_ids)

    # Keep the legacy output order: amenity columns and their totals for all
    # walk bands, followed by simple layer counts for all bands.
    for minutes in WALK_MINUTES:
        suffix = f"_{minutes}min"
        row_mask = iso_gdf["minutes"].astype(int).to_numpy() == int(minutes)
        for category_index, category in enumerate(legacy_categories):
            if not row_mask.any() or legacy_counts[row_mask, category_index].sum() <= 0:
                continue
            column = f"amen_{str(category).replace(' ', '_')}{suffix}"
            out[column] = legacy_by_minute[int(minutes)][:, category_index].astype(int)

        metric_cols = [
            column
            for column in out.columns
            if column.startswith("amen_") and column.endswith(suffix)
        ]
        for column in metric_cols:
            out[column] = out[column].fillna(0).astype(int)
        out[f"num_amenities{suffix}"] = (
            out[metric_cols].sum(axis=1).astype(int) if metric_cols else 0
        )

    for minutes in WALK_MINUTES:
        suffix = f"_{minutes}min"
        out[f"num_trees{suffix}"] = tree_counts[int(minutes)].astype(int)

    for minutes in WALK_MINUTES:
        suffix = f"_{minutes}min"
        out[f"num_street_lights{suffix}"] = light_counts[int(minutes)].astype(int)

    for minutes in WALK_MINUTES:
        suffix = f"_{minutes}min"
        out[f"score_expanded{suffix}"] = (
            out[f"num_amenities{suffix}"].astype(float)
            + out[f"num_trees{suffix}"].astype(float) * 0.25
            + out[f"num_street_lights{suffix}"].astype(float) * 0.25
        )

        clean_detail = np.zeros((len(out), len(CLEAN_WEIGHTS)), dtype=float)
        clean_indices = {key: index for index, key in enumerate(clean_categories)}
        for detail_index, key in enumerate(CLEAN_WEIGHTS):
            if key in clean_indices:
                clean_detail[:, detail_index] += (
                    clean_by_minute[int(minutes)][:, clean_indices[key]] * CLEAN_WEIGHTS[key]
                )
        clean_detail[:, list(CLEAN_WEIGHTS).index("trees")] += (
            tree_counts[int(minutes)] * CLEAN_WEIGHTS["trees"]
        )
        clean_detail[:, list(CLEAN_WEIGHTS).index("parks")] += (
            park_counts[int(minutes)] * CLEAN_WEIGHTS["parks"]
        )
        # Raw street lights are kept in their own layer and added to any
        # native clean-manifest street-lights count here.
        clean_detail[:, list(CLEAN_WEIGHTS).index("street-lights")] += (
            light_counts[int(minutes)] * CLEAN_WEIGHTS["street-lights"]
        )

        for detail_index, key in enumerate(CLEAN_WEIGHTS):
            out[f"clean_pts_{_clean_pts_column_stem(key)}{suffix}"] = clean_detail[:, detail_index]
        out[f"score_clean{suffix}"] = clean_detail.sum(axis=1)
        sum_cols = [f"clean_pts_{_clean_pts_column_stem(key)}{suffix}" for key in CLEAN_WEIGHTS]
        max_diff = (out[f"score_clean{suffix}"] - out[sum_cols].sum(axis=1)).abs().max()
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
    """Compute amenity metrics through separate layer-wise pair matrices."""
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

    legacy_codes, legacy_categories = _source_codes_for_column(amenities_legacy, "amenity_type")
    clean_codes, clean_categories = _source_codes_for_column(
        amenities_clean, "amenity_type", normalize_clean_amenity_key
    )
    legacy_counts = _query_layer_counts(
        iso_gdf.geometry,
        amenities_legacy,
        predicate="contains",
        source_group_codes=legacy_codes,
        group_count=len(legacy_categories),
    )
    clean_counts = _query_layer_counts(
        iso_gdf.geometry,
        amenities_clean,
        predicate="contains",
        source_group_codes=clean_codes,
        group_count=len(clean_categories),
    )

    tree_codes = np.zeros(len(trees) if trees is not None else 0, dtype=np.int8)
    light_codes = np.zeros(len(street_lights) if street_lights is not None else 0, dtype=np.int8)
    park_codes = np.zeros(len(parks) if parks is not None else 0, dtype=np.int8)
    tree_row_counts = _query_layer_counts(
        iso_gdf.geometry,
        trees,
        predicate="contains",
        source_group_codes=tree_codes,
        group_count=1,
    )
    light_row_counts = _query_layer_counts(
        iso_gdf.geometry,
        street_lights,
        predicate="contains",
        source_group_codes=light_codes,
        group_count=1,
    )
    park_row_counts = _query_layer_counts(
        iso_gdf.geometry,
        parks,
        predicate="intersects",
        source_group_codes=park_codes,
        group_count=1,
    )
    building_ids = out["building_id"].to_numpy()
    return _apply_layerwise_metrics(
        out,
        iso_gdf,
        legacy_counts=legacy_counts,
        legacy_categories=legacy_categories,
        tree_counts=_aggregate_simple_counts(iso_gdf, tree_row_counts, building_ids),
        light_counts=_aggregate_simple_counts(iso_gdf, light_row_counts, building_ids),
        park_counts=_aggregate_simple_counts(iso_gdf, park_row_counts, building_ids),
        clean_counts=clean_counts,
        clean_categories=clean_categories,
    )


def run_amenity_metrics(
    buildings: gpd.GeoDataFrame,
    *,
    isochrones: gpd.GeoDataFrame | dict[int, dict[int, object]] | None = None,
    prepared_layers: PreparedAmenityLayers | None = None,
) -> gpd.GeoDataFrame:
    """Strip metric cols, join amenities via isochrones, return buildings with amenity metrics."""
    crs_metric = CRS_METRIC
    buildings = strip_building_metric_columns(buildings.copy())
    if prepared_layers is None:
        amenities_legacy, amenities_clean, trees_gdf, parks_gdf, street_lights_gdf, merged_path = (
            load_amenity_layers(crs_metric)
        )
        amenities_legacy, _ = prepare_legacy_amenities(amenities_legacy, merged_path, crs_metric)
    else:
        amenities_legacy = prepared_layers.amenities_legacy
        amenities_clean = prepared_layers.amenities_clean
        trees_gdf = prepared_layers.trees
        parks_gdf = prepared_layers.parks
        street_lights_gdf = prepared_layers.street_lights

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
    prepared_layers: PreparedAmenityLayers | None = None,
) -> gpd.GeoDataFrame:
    """Run amenity metrics and optionally write the scored-building artifact."""
    if buildings is None:
        buildings = load_raw_buildings()
    buildings = run_amenity_metrics(
        buildings,
        isochrones=isochrones,
        prepared_layers=prepared_layers,
    )
    if write_output:
        write_scored_buildings(buildings, SCORED_BUILDINGS)
    return buildings
