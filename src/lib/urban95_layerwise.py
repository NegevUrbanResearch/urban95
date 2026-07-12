"""Prepared, chunked reductions for Urban95's discrete subcomponents.

The scalar functions in :mod:`lib.urban95_weights` remain the semantic oracle.
This module only replaces repeated per-building GeoPandas traversal with exact
integer pair reductions and nearest-distance reductions.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import re
import warnings

import geopandas as gpd
import numpy as np
import pandas as pd
from tqdm.auto import tqdm
from shapely import buffer as shapely_buffer
from shapely import box as shapely_box
from shapely import distance as shapely_distance
from shapely import make_valid as shapely_make_valid

from lib.spatial_pairs import count_pairs_by_group, iter_query_pairs
from core.perf import logged_phase


_EMPTY_CRS = "EPSG:2039"
_COMPONENT_COLUMNS = (
    "trees",
    "roads",
    "parks",
    "urban_nature_areas",
    "playgrounds",
    "bicycle_access",
    "bus_stops",
    "shelters",
    "education",
    "community",
    "business",
    "health",
)


@dataclass(frozen=True)
class PreparedUrban95Layers:
    """Sanitized, reset-index source layers used by the discrete scorer."""

    trees: gpd.GeoDataFrame
    fast_roads: gpd.GeoDataFrame
    parks: gpd.GeoDataFrame
    urban_nature_areas: gpd.GeoDataFrame
    playgrounds: gpd.GeoDataFrame
    bikes: gpd.GeoDataFrame
    bus_stops: gpd.GeoDataFrame
    shelters: gpd.GeoDataFrame
    education: gpd.GeoDataFrame
    community: gpd.GeoDataFrame
    business: gpd.GeoDataFrame
    health: gpd.GeoDataFrame


def _empty_layer(crs: object = _EMPTY_CRS) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame({"geometry": gpd.GeoSeries([], crs=crs)}, geometry="geometry", crs=crs)


def _sanitized(source: gpd.GeoDataFrame | None, target_crs: object = _EMPTY_CRS) -> gpd.GeoDataFrame:
    """Copy, repair, filter and reset one source without mutating its caller."""
    if source is None:
        return _empty_layer(target_crs)
    if not isinstance(source, gpd.GeoDataFrame):
        source = gpd.GeoDataFrame(source)
    geometry_name = getattr(source, "_geometry_column_name", "geometry")
    if geometry_name not in source.columns:
        return _empty_layer(source.crs if source.crs is not None else target_crs)
    crs = source.crs if source.crs is not None else target_crs
    out = source.copy(deep=True)
    if out.geometry.name != "geometry":
        out = out.rename_geometry("geometry")
    if out.empty:
        out = out.reset_index(drop=True)
        out = out.set_crs(crs, allow_override=True) if out.crs is None else out
        return out
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        mask = out.geometry.notna() & ~out.geometry.is_empty
        out = out.loc[mask].copy()
        if not out.empty:
            out["geometry"] = out.geometry.make_valid()
            mask = out.geometry.notna() & ~out.geometry.is_empty & out.geometry.is_valid
            out = out.loc[mask].copy()
    out = out.reset_index(drop=True)
    if out.crs is None:
        out = out.set_crs(crs, allow_override=True)
    return out


def _indexed(source: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Materialize exactly one spatial index on the final prepared frame."""
    _ = source.sindex
    return source


def _amenity_layer(
    source: gpd.GeoDataFrame | None,
    expected_type: str,
    target_crs: object,
) -> gpd.GeoDataFrame:
    out = _sanitized(source, target_crs)
    if "amenity_type" not in out.columns:
        return _indexed(out.iloc[0:0].copy().reset_index(drop=True))
    normalized = out["amenity_type"].astype(str).str.strip().str.lower()
    out = out.loc[normalized == expected_type].copy().reset_index(drop=True)
    return _indexed(out)


def _park_layer(source: gpd.GeoDataFrame | None, target_crs: object) -> gpd.GeoDataFrame:
    out = _sanitized(source, target_crs)
    out["_source_area_m2"] = out.geometry.area.astype(float) if len(out) else pd.Series(dtype=float)
    return _indexed(out)


def _road_layer(source: gpd.GeoDataFrame | None, target_crs: object) -> gpd.GeoDataFrame:
    out = _sanitized(source, target_crs)
    speed_column = next((name for name in ("maxspeed", "max_speed", "speed_limit") if name in out.columns), None)
    if speed_column is None or out.empty:
        return _indexed(_sanitized(None, target_crs))
    speed = pd.to_numeric(out[speed_column], errors="coerce")
    out = out.loc[speed > 50].copy().reset_index(drop=True)
    return _indexed(out)


def prepare_urban95_layers(
    *,
    trees: gpd.GeoDataFrame | None = None,
    roads: gpd.GeoDataFrame | None = None,
    parks: gpd.GeoDataFrame | None = None,
    urban_nature_areas: gpd.GeoDataFrame | None = None,
    playgrounds: gpd.GeoDataFrame | None = None,
    bikes: gpd.GeoDataFrame | None = None,
    bus_stops: gpd.GeoDataFrame | None = None,
    shelters: gpd.GeoDataFrame | None = None,
    education: gpd.GeoDataFrame | None = None,
    community: gpd.GeoDataFrame | None = None,
    business: gpd.GeoDataFrame | None = None,
    health: gpd.GeoDataFrame | None = None,
    target_crs: object = _EMPTY_CRS,
) -> PreparedUrban95Layers:
    """Prepare every discrete source once, preserving source-row semantics."""
    candidates = (trees, roads, parks, urban_nature_areas, playgrounds, bikes, bus_stops, shelters, education, community, business, health)
    source_crs = next((frame.crs for frame in candidates if isinstance(frame, gpd.GeoDataFrame) and frame.crs is not None), target_crs)
    return PreparedUrban95Layers(
        trees=_indexed(_sanitized(trees, source_crs)),
        fast_roads=_road_layer(roads, source_crs),
        parks=_park_layer(parks, source_crs),
        urban_nature_areas=_indexed(_sanitized(urban_nature_areas, source_crs)),
        playgrounds=_amenity_layer(playgrounds, "playgrounds", source_crs),
        bikes=_amenity_layer(bikes, "bicycle_track", source_crs),
        bus_stops=_indexed(_sanitized(bus_stops, source_crs)),
        shelters=_amenity_layer(shelters, "shelters", source_crs),
        education=_amenity_layer(education, "education", source_crs),
        community=_amenity_layer(community, "community-centers", source_crs),
        business=_amenity_layer(business, "businesscenters", source_crs),
        health=_amenity_layer(health, "health", source_crs),
    )


def _pairs(query: gpd.GeoSeries, source: gpd.GeoDataFrame, chunk_size: int) -> tuple[np.ndarray, np.ndarray]:
    if query.empty or source.empty:
        return np.empty(0, dtype=np.int64), np.empty(0, dtype=np.int64)
    query_parts = []
    source_parts = []
    for query_positions, source_positions in iter_query_pairs(
        query,
        source.geometry,
        predicate="intersects",
        chunk_size=chunk_size,
    ):
        if len(query_positions):
            query_parts.append(query_positions)
            source_parts.append(source_positions)
    if not query_parts:
        return np.empty(0, dtype=np.int64), np.empty(0, dtype=np.int64)
    if len(query_parts) == 1:
        return query_parts[0], source_parts[0]
    return np.concatenate(query_parts), np.concatenate(source_parts)


def _counts(query_positions: np.ndarray, source_positions: np.ndarray, source_count: int, query_count: int) -> np.ndarray:
    if query_count == 0:
        return np.empty(0, dtype=np.uint64)
    groups = np.zeros(max(0, source_count), dtype=np.int8)
    matrix = count_pairs_by_group(query_positions, source_positions, groups, query_count, 1)
    return matrix[:, 0]


def _presence(query_positions: np.ndarray, source_positions: np.ndarray, source_count: int, query_count: int) -> np.ndarray:
    return _counts(query_positions, source_positions, source_count, query_count) > 0


def _nearest(
    points: gpd.GeoSeries,
    query_positions: np.ndarray,
    source_positions: np.ndarray,
    source: gpd.GeoDataFrame,
) -> np.ndarray:
    minimum = np.full(len(points), np.inf, dtype=np.float64)
    if len(query_positions):
        exact_distances = np.asarray(
            shapely_distance(source.geometry.array[source_positions], points.array[query_positions]),
            dtype=np.float64,
        )
        np.minimum.at(minimum, query_positions, exact_distances)
    minimum[np.isinf(minimum)] = np.nan
    return minimum


def _buffer(points: gpd.GeoSeries, distance: float) -> gpd.GeoSeries:
    # GeoPandas 1.1 forwards its legacy ``resolution`` argument internally;
    # call Shapely directly so ``quad_segs=16`` is unambiguous across versions.
    return gpd.GeoSeries(shapely_buffer(points.array, distance, quad_segs=16), index=points.index, crs=points.crs)


def _square_envelope(points: gpd.GeoSeries, radius: float) -> gpd.GeoSeries:
    x = points.x.to_numpy(dtype=np.float64)
    y = points.y.to_numpy(dtype=np.float64)
    return gpd.GeoSeries(
        shapely_box(x - radius, y - radius, x + radius, y + radius),
        index=points.index,
        crs=points.crs,
    )


def score_discrete_components(
    buildings_metric: gpd.GeoDataFrame,
    prepared: PreparedUrban95Layers,
    chunk_size: int,
) -> pd.DataFrame:
    """Return scalar-compatible 0/50/100 discrete component values by building."""
    if isinstance(chunk_size, bool) or not isinstance(chunk_size, (int, np.integer)) or chunk_size <= 0:
        raise ValueError("chunk_size must be a positive integer")
    if not isinstance(prepared, PreparedUrban95Layers):
        raise TypeError("prepared must be PreparedUrban95Layers")

    points = buildings_metric.geometry.centroid.reset_index(drop=True)
    values = {name: np.zeros(len(points), dtype=np.float64) for name in _COMPONENT_COLUMNS}
    values["roads"][:] = 100.0
    for start in range(0, len(points), int(chunk_size)):
        stop = min(start + int(chunk_size), len(points))
        chunk_points = points.iloc[start:stop].reset_index(drop=True)
        buffer_20 = _buffer(chunk_points, 20)
        buffer_50 = _buffer(chunk_points, 50)
        buffer_300 = _buffer(chunk_points, 300)
        road_candidates = _square_envelope(chunk_points, 300)
        count = len(chunk_points)

        q, s = _pairs(buffer_20, prepared.trees, chunk_size)
        tree_counts = _counts(q, s, len(prepared.trees), count)
        values["trees"][start:stop] = np.where(tree_counts >= 3, 100.0, np.where(tree_counts >= 1, 50.0, 0.0))

        q, s = _pairs(road_candidates, prepared.fast_roads, chunk_size)
        roads_minimum = _nearest(chunk_points, q, s, prepared.fast_roads)
        values["roads"][start:stop] = np.where(
            np.isfinite(roads_minimum) & (roads_minimum <= 100),
            0.0,
            np.where(np.isfinite(roads_minimum) & (roads_minimum <= 300), 50.0, 100.0),
        )

        q, s = _pairs(buffer_300, prepared.parks, chunk_size)
        park_counts = _counts(q, s, len(prepared.parks), count)
        if len(q):
            large = prepared.parks["_source_area_m2"].to_numpy(dtype=float)[s] >= 3000.0
            large_counts = np.bincount(q[large], minlength=count)
            values["parks"][start:stop] = np.where(large_counts > 0, 100.0, np.where(park_counts > 0, 50.0, 0.0))

        for name, layer in (
            ("urban_nature_areas", prepared.urban_nature_areas),
            ("playgrounds", prepared.playgrounds),
            ("bicycle_access", prepared.bikes),
        ):
            q, s = _pairs(buffer_300, layer, chunk_size)
            values[name][start:stop] = _presence(q, s, len(layer), count) * 100.0

        q, s = _pairs(buffer_300, prepared.bus_stops, chunk_size)
        bus_counts = _counts(q, s, len(prepared.bus_stops), count)
        values["bus_stops"][start:stop] = np.where(bus_counts >= 3, 100.0, np.where(bus_counts >= 1, 50.0, 0.0))

        q, s = _pairs(buffer_50, prepared.shelters, chunk_size)
        values["shelters"][start:stop] = _presence(q, s, len(prepared.shelters), count) * 100.0

        q, s = _pairs(buffer_300, prepared.education, chunk_size)
        education_minimum = _nearest(chunk_points, q, s, prepared.education)
        values["education"][start:stop] = np.where(
            np.isfinite(education_minimum) & (education_minimum <= 150),
            100.0,
            np.where(np.isfinite(education_minimum) & (education_minimum <= 300), 50.0, 0.0),
        )

        for name, layer in (
            ("community", prepared.community),
            ("business", prepared.business),
            ("health", prepared.health),
        ):
            q, s = _pairs(buffer_300, layer, chunk_size)
            values[name][start:stop] = _presence(q, s, len(layer), count) * 100.0

    return pd.DataFrame(values, index=buildings_metric.index)


def _metric_centroids(buildings_metric: gpd.GeoDataFrame) -> gpd.GeoSeries:
    """Return building centroids in the metric CRS without mutating the frame."""
    if not isinstance(buildings_metric, gpd.GeoDataFrame):
        raise TypeError("buildings_metric must be a GeoDataFrame")
    frame = buildings_metric
    if frame.crs is not None and str(frame.crs) != _EMPTY_CRS:
        frame = frame.to_crs(_EMPTY_CRS)
    return frame.geometry.centroid.reset_index(drop=True)


def _overlay_buffers(points: gpd.GeoSeries, distance: float) -> gpd.GeoSeries:
    """Build the scalar-compatible circular buffers while retaining position order."""
    geometries = []
    for point in points:
        if point is None or point.is_empty:
            geometries.append(None)
        else:
            geometries.append(point.buffer(distance))
    return gpd.GeoSeries(geometries, index=points.index, crs=points.crs)


def _candidate_lists(
    query_geometries: gpd.GeoSeries,
    source: gpd.GeoDataFrame,
    *,
    predicate: str,
    chunk_size: int,
) -> list[np.ndarray]:
    """Collect chunk pairs and enforce scalar single-query traversal order."""
    candidates: list[list[int]] = [[] for _ in range(len(query_geometries))]
    if len(source) == 0 or len(query_geometries) == 0:
        return [np.empty(0, dtype=np.int64) for _ in range(len(query_geometries))]

    for query_positions, source_positions in iter_query_pairs(
        query_geometries,
        source.geometry,
        predicate=predicate,
        chunk_size=chunk_size,
    ):
        for query_position, source_position in zip(query_positions.tolist(), source_positions.tolist()):
            candidates[int(query_position)].append(int(source_position))

    spatial_index = source.sindex
    ordered: list[np.ndarray] = []
    for position, query_geometry in enumerate(query_geometries):
        if query_geometry is None or query_geometry.is_empty:
            scalar = np.empty(0, dtype=np.int64)
        else:
            scalar = np.asarray(spatial_index.query(query_geometry, predicate=predicate), dtype=np.int64)
        batched = np.asarray(candidates[position], dtype=np.int64)
        if not np.array_equal(batched, scalar):
            ordered.append(scalar)
        else:
            ordered.append(batched)
    return ordered


def _prepared_shade_input(prepared_shade: gpd.GeoDataFrame | None) -> gpd.GeoDataFrame:
    """Validate a prepared shade frame and preserve its positional source order."""
    from lib.shade_si import SCORE_FIELD, prepare_shade_overlay

    if prepared_shade is None or not isinstance(prepared_shade, gpd.GeoDataFrame):
        return gpd.GeoDataFrame(
            {SCORE_FIELD: pd.Series(dtype=float)},
            geometry=gpd.GeoSeries([], crs=_EMPTY_CRS),
            crs=_EMPTY_CRS,
        )
    if SCORE_FIELD not in prepared_shade.columns or prepared_shade.geometry.name not in prepared_shade.columns:
        return gpd.GeoDataFrame(
            {SCORE_FIELD: pd.Series(dtype=float)},
            geometry=gpd.GeoSeries([], crs=_EMPTY_CRS),
            crs=_EMPTY_CRS,
        )
    # ``si_layer`` is emitted by prepare_shade_overlay.  Raw test/standalone
    # frames lack it and are sanitized once here rather than in every chunk.
    if "si_layer" not in prepared_shade.columns:
        prepared_shade = prepare_shade_overlay(prepared_shade)
    out = prepared_shade.copy(deep=True)
    if out.crs is None:
        out = out.set_crs(_EMPTY_CRS)
    elif str(out.crs) != _EMPTY_CRS:
        out = out.to_crs(_EMPTY_CRS)
    return out.reset_index(drop=True)


def score_shade_overlay(
    buildings_metric: gpd.GeoDataFrame,
    prepared_shade: gpd.GeoDataFrame | None,
    chunk_size: int,
) -> pd.Series:
    """Return rounded building SI from exact chunked 300 m shade weighting."""
    if isinstance(chunk_size, bool) or not isinstance(chunk_size, (int, np.integer)) or chunk_size <= 0:
        raise ValueError("chunk_size must be a positive integer")
    from lib.shade_si import BUILDING_SHADE_RADIUS_M, SCORE_FIELD, round_building_summer_si

    points = _metric_centroids(buildings_metric)
    source = _prepared_shade_input(prepared_shade)
    values = np.zeros(len(points), dtype=np.float64)
    if len(source) == 0 or len(points) == 0:
        return pd.Series(values, index=buildings_metric.index, dtype=float)

    progress = tqdm(
        total=len(points),
        desc="Urban95 shade",
        unit="building",
        disable=None,
    )
    try:
        buffers = _overlay_buffers(points, BUILDING_SHADE_RADIUS_M)
        with logged_phase("score.shade.candidates"):
            ordered_candidates = _candidate_lists(
                buffers,
                source,
                predicate="intersects",
                chunk_size=int(chunk_size),
            )
        shade_geometries = source.geometry.to_numpy()
        shade_scores = pd.to_numeric(source[SCORE_FIELD], errors="coerce").to_numpy(dtype=float)
        with logged_phase("score.shade.intersections"):
            for position, (buffer_geometry, source_positions) in enumerate(zip(buffers, ordered_candidates)):
                if buffer_geometry is None or buffer_geometry.is_empty:
                    progress.update(1)
                    continue
                total_area = 0.0
                weighted_sum = 0.0
                for source_position in source_positions.tolist():
                    intersection_area = buffer_geometry.intersection(shade_geometries[source_position]).area
                    if intersection_area <= 0:
                        continue
                    total_area += intersection_area
                    weighted_sum += intersection_area * shade_scores[source_position]
                raw_value = weighted_sum / total_area if total_area > 0 else 0.0
                values[position] = round_building_summer_si(raw_value)
                progress.update(1)
    finally:
        progress.close()
    return pd.Series(values, index=buildings_metric.index, dtype=float)


def _prepared_lights_input(
    prepared_lights: gpd.GeoDataFrame | None,
    target_crs: object,
) -> gpd.GeoDataFrame:
    """Copy, repair/filter and prebuffer light geometry once."""
    if prepared_lights is None or not isinstance(prepared_lights, gpd.GeoDataFrame):
        return gpd.GeoDataFrame(
            {"_light_buffer": gpd.GeoSeries([], crs=target_crs)},
            geometry=gpd.GeoSeries([], crs=target_crs),
            crs=target_crs,
        )
    source = prepared_lights.copy(deep=True)
    if source.crs is None:
        source = source.set_crs(target_crs)
    elif target_crs is not None and str(source.crs) != str(target_crs):
        source = source.to_crs(target_crs)
    if source.empty or source.geometry.name not in source.columns:
        return gpd.GeoDataFrame(
            {"_light_buffer": gpd.GeoSeries([], crs=target_crs)},
            geometry=gpd.GeoSeries([], crs=target_crs),
            crs=target_crs,
        )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        mask = source.geometry.notna() & ~source.geometry.is_empty
        source = source.loc[mask].copy()
        if not source.empty:
            source["geometry"] = source.geometry.make_valid()
            mask = source.geometry.notna() & ~source.geometry.is_empty & source.geometry.is_valid
            source = source.loc[mask].copy()
    source = source.reset_index(drop=True)
    source["_light_buffer"] = [geometry.buffer(15) for geometry in source.geometry]
    _ = source.sindex
    return source


def _streetlight_percent_to_subscore(percent: float) -> float:
    if percent > 50:
        return 100.0
    if 30 <= percent <= 50:
        return 50.0
    return 0.0


def score_streetlight_overlay(
    buildings_metric: gpd.GeoDataFrame,
    prepared_lights: gpd.GeoDataFrame | None,
    chunk_size: int,
    workers: int = 1,
) -> pd.Series:
    """Return exact 0/50/100 light coverage tiers for each building centroid."""
    if isinstance(chunk_size, bool) or not isinstance(chunk_size, (int, np.integer)) or chunk_size <= 0:
        raise ValueError("chunk_size must be a positive integer")
    if isinstance(workers, bool) or not isinstance(workers, (int, np.integer)) or workers <= 0:
        raise ValueError("workers must be a positive integer")
    points = _metric_centroids(buildings_metric)
    with logged_phase("score.lights.prepare"):
        source = _prepared_lights_input(prepared_lights, points.crs or _EMPTY_CRS)
    values = np.zeros(len(points), dtype=np.float64)
    if len(source) == 0 or len(points) == 0:
        return pd.Series(values, index=buildings_metric.index, dtype=float)

    buffer_315 = _overlay_buffers(points, 315)
    buffer_300 = _overlay_buffers(points, 300)
    progress = tqdm(
        total=len(points),
        desc="Urban95 streetlights",
        unit="building",
        disable=None,
    )
    try:
        with logged_phase("score.lights.candidates"):
            ordered_candidates = _candidate_lists(
                buffer_315,
                source,
                predicate="intersects",
                chunk_size=int(chunk_size),
            )
        source_buffers = source["_light_buffer"].to_numpy()

        def score_range(bounds: tuple[int, int], update_each: bool = False) -> tuple[int, np.ndarray]:
            start, stop = bounds
            chunk_values = np.zeros(stop - start, dtype=np.float64)
            for offset, position in enumerate(range(start, stop)):
                building_buffer = buffer_300.iloc[position]
                source_positions = ordered_candidates[position]
                if building_buffer is None or building_buffer.is_empty or not source_positions.size:
                    if update_each:
                        progress.update(1)
                    continue
                local_buffers = [source_buffers[int(source_position)] for source_position in source_positions.tolist()]
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    unified_lights = gpd.GeoSeries(local_buffers, crs=points.crs).union_all()
                    if unified_lights is None or unified_lights.is_empty:
                        illuminated_area = 0.0
                    else:
                        union_geometry = unified_lights if unified_lights.is_valid else shapely_make_valid(unified_lights)
                        illuminated_area = 0.0 if union_geometry.is_empty else union_geometry.intersection(building_buffer).area
                percent = (illuminated_area / building_buffer.area) * 100 if building_buffer.area else 0.0
                chunk_values[offset] = _streetlight_percent_to_subscore(percent)
                if update_each:
                    progress.update(1)
            return start, chunk_values

        with logged_phase("score.lights.unions"):
            if int(workers) == 1:
                _, serial_values = score_range((0, len(points)), update_each=True)
                values[:] = serial_values
            else:
                work_chunk_size = 64
                work_ranges = [
                    (start, min(start + work_chunk_size, len(points)))
                    for start in range(0, len(points), work_chunk_size)
                ]
                effective_workers = min(int(workers), len(work_ranges))
                with ThreadPoolExecutor(max_workers=effective_workers) as executor:
                    for start, chunk_values in executor.map(score_range, work_ranges):
                        values[start : start + len(chunk_values)] = chunk_values
                        progress.update(len(chunk_values))
    finally:
        progress.close()
    return pd.Series(values, index=buildings_metric.index, dtype=float)


def score_urban95_layerwise(
    buildings_metric: gpd.GeoDataFrame,
    prepared_discrete: PreparedUrban95Layers,
    prepared_shade: gpd.GeoDataFrame | None,
    prepared_lights: gpd.GeoDataFrame | None,
    chunk_size: int,
    workers: int = 1,
) -> pd.DataFrame:
    """Assemble every published Urban95 score column from exact component arrays."""
    from core.geo_io import WALK_MINUTES
    from lib.shade_si import summer_si_to_subscore
    from lib.urban95_weights import CATEGORY_SUBCATEGORY_WEIGHTS, CATEGORY_WEIGHTS

    with logged_phase("score.discrete.compute"):
        discrete = score_discrete_components(buildings_metric, prepared_discrete, chunk_size=chunk_size)
    summer_si = score_shade_overlay(buildings_metric, prepared_shade, chunk_size=chunk_size)
    light_scores = score_streetlight_overlay(
        buildings_metric,
        prepared_lights,
        chunk_size=chunk_size,
        workers=workers,
    )
    with logged_phase("score.assembly"):
        n_rows = len(buildings_metric)
        subcategory_values: dict[tuple[str, str], np.ndarray] = {
            ("environmental_quality", "shade"): np.asarray(
                [float(summer_si_to_subscore(value)) for value in summer_si], dtype=np.float64
            ),
            ("environmental_quality", "trees"): discrete["trees"].to_numpy(dtype=np.float64),
            ("environmental_quality", "roads"): discrete["roads"].to_numpy(dtype=np.float64),
            ("nature", "parks"): discrete["parks"].to_numpy(dtype=np.float64),
            ("nature", "urban_nature_areas"): discrete["urban_nature_areas"].to_numpy(dtype=np.float64),
            ("play", "playgrounds"): discrete["playgrounds"].to_numpy(dtype=np.float64),
            ("safety_mobility", "street_lights"): light_scores.to_numpy(dtype=np.float64),
            ("safety_mobility", "bicycle_access"): discrete["bicycle_access"].to_numpy(dtype=np.float64),
            ("safety_mobility", "bus_stops"): discrete["bus_stops"].to_numpy(dtype=np.float64),
            ("safety_mobility", "shelters"): discrete["shelters"].to_numpy(dtype=np.float64),
            ("family_services", "education"): discrete["education"].to_numpy(dtype=np.float64),
            ("family_services", "community"): discrete["community"].to_numpy(dtype=np.float64),
            ("family_services", "business"): discrete["business"].to_numpy(dtype=np.float64),
            ("family_services", "health"): discrete["health"].to_numpy(dtype=np.float64),
        }
        category_stems = {
            "Environmental Quality": "environmental_quality",
            "Nature": "nature",
            "Play": "play",
            "Safety & Mobility": "safety_mobility",
            "Family Services": "family_services",
        }
        category_scores = {stem: np.zeros(n_rows, dtype=np.float64) for stem in category_stems.values()}
        weighted_scores = np.zeros(n_rows, dtype=np.float64)
        for row_position in range(n_rows):
            category_by_name: dict[str, float] = {}
            for category_name, sub_weights in CATEGORY_SUBCATEGORY_WEIGHTS.items():
                category_stem = category_stems[category_name]
                category_value = 0.0
                for sub_name, weight in sub_weights.items():
                    sub_stem = re.sub(r"[^a-z0-9]+", "_", str(sub_name).strip().lower().replace("&", "and")).strip("_")
                    component = float(subcategory_values[(category_stem, sub_stem)][row_position])
                    category_value += (component / 100.0) * weight
                category_score = category_value * 100.0
                category_by_name[category_name] = category_score
                category_scores[category_stem][row_position] = category_score
            weighted_scores[row_position] = round(
                sum(category_by_name[name] * CATEGORY_WEIGHTS[name] for name in CATEGORY_WEIGHTS),
                1,
            )

        output: dict[str, np.ndarray] = {"summer_si": summer_si.to_numpy(dtype=np.float64)}
        for minutes in WALK_MINUTES:
            suffix = f"_{minutes}min"
            output[f"score_weighted{suffix}"] = weighted_scores.copy()
            for stem in category_stems.values():
                output[f"score_weighted_{stem}{suffix}"] = category_scores[stem].copy()
            for (category_stem, sub_stem), values in subcategory_values.items():
                output[f"score_weighted_sub_{category_stem}_{sub_stem}{suffix}"] = values.copy()
        return pd.DataFrame(output, index=buildings_metric.index)


__all__ = [
    "PreparedUrban95Layers",
    "prepare_urban95_layers",
    "score_discrete_components",
    "score_shade_overlay",
    "score_streetlight_overlay",
    "score_urban95_layerwise",
]
