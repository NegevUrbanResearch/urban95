"""Reusable inverse-distance-weighting geometry planning for neighborhoods."""

from dataclasses import dataclass

import numpy as np
import pandas as pd
from shapely.geometry import Point
from shapely.strtree import STRtree


@dataclass(frozen=True)
class IDWPlan:
    """Reusable source/target geometry relation for neighborhood interpolation.

    ``in_radius_indptr`` and ``in_radius_source_positions`` form a compact CSR
    representation of every source row within the IDW radius for each target.
    The source positions are always in their original row order, preserving the
    scalar first-row tie behavior for exact and nearest fallback cases.
    """

    in_radius_indptr: np.ndarray
    in_radius_source_positions: np.ndarray
    in_radius_weights: np.ndarray
    exact_source_positions: np.ndarray
    nearest_source_positions: np.ndarray
    local_data_mask: np.ndarray
    target_count: int
    source_count: int


def _as_xy_array(values: np.ndarray, *, name: str) -> np.ndarray:
    array = np.asarray(values, dtype=float)
    if array.ndim == 2:
        if array.shape[1] != 2:
            raise ValueError(f"{name} must have shape (n, 2)")
        return array
    if array.ndim == 1:
        if array.size == 0:
            return np.empty((0, 2), dtype=float)
        if array.size != 2:
            raise ValueError(f"{name} must have shape (n, 2)")
        array = array.reshape(1, 2)
        return array
    raise ValueError(f"{name} must have shape (n, 2)")


def build_idw_plan(
    source_xy: np.ndarray,
    target_xy: np.ndarray,
    idw_radius_m: float,
    local_radius_m: float,
) -> IDWPlan:
    """Build one exact distance plan reusable across many value columns.

    The spatial index limits candidate enumeration to each radius; exact
    distances are then recomputed for the returned source positions so
    boundary inclusion and source-row ordering are explicit and deterministic.
    """
    sources = _as_xy_array(source_xy, name="source_xy")
    targets = _as_xy_array(target_xy, name="target_xy")
    target_count = len(targets)
    source_count = len(sources)
    in_radius_lists: list[list[int]] = [[] for _ in range(target_count)]
    exact_positions = np.full(target_count, -1, dtype=np.int64)
    nearest_positions = np.full(target_count, -1, dtype=np.int64)
    local_mask = np.zeros(target_count, dtype=bool)

    if target_count == 0 or source_count == 0:
        return IDWPlan(
            in_radius_indptr=np.zeros(target_count + 1, dtype=np.int64),
            in_radius_source_positions=np.empty(0, dtype=np.int64),
            in_radius_weights=np.empty(0, dtype=float),
            exact_source_positions=exact_positions,
            nearest_source_positions=nearest_positions,
            local_data_mask=local_mask,
            target_count=target_count,
            source_count=source_count,
        )

    source_points = [Point(float(x), float(y)) for x, y in sources]
    target_points = [Point(float(x), float(y)) for x, y in targets]
    tree = STRtree(source_points)
    idw_radius = max(0.0, float(idw_radius_m))
    local_radius = max(0.0, float(local_radius_m))

    def _query_within(radius: float) -> tuple[np.ndarray, np.ndarray]:
        pairs = np.asarray(tree.query(target_points, predicate="dwithin", distance=radius))
        if pairs.size == 0:
            return np.empty(0, dtype=np.int64), np.empty(0, dtype=np.int64)
        if pairs.ndim == 1:
            pairs = pairs.reshape(2, -1)
        return pairs[0].astype(np.int64, copy=False), pairs[1].astype(np.int64, copy=False)

    query_positions, source_positions = _query_within(idw_radius)
    if len(query_positions):
        # STRtree does not promise source-row order; sorting here preserves the
        # current scalar traversal order and deterministic floating reductions.
        order = np.lexsort((source_positions, query_positions))
        query_positions = query_positions[order]
        source_positions = source_positions[order]
        for query_position, source_position in zip(query_positions, source_positions):
            in_radius_lists[int(query_position)].append(int(source_position))

    local_query_positions, local_source_positions = _query_within(local_radius)
    if len(local_query_positions):
        local_deltas = sources[local_source_positions] - targets[local_query_positions]
        local_distances_squared = np.einsum("ij,ij->i", local_deltas, local_deltas)
        local_valid = local_distances_squared <= local_radius * local_radius
        local_mask[np.unique(local_query_positions[local_valid])] = True

    radius_squared = idw_radius * idw_radius
    for target_position, source_indices_list in enumerate(in_radius_lists):
        source_indices = np.asarray(source_indices_list, dtype=np.int64)
        if len(source_indices):
            deltas = sources[source_indices] - targets[target_position]
            distances_squared = np.einsum("ij,ij->i", deltas, deltas)
            retained = distances_squared <= radius_squared
            source_indices = source_indices[retained]
            distances_squared = distances_squared[retained]
            in_radius_lists[target_position] = source_indices.tolist()
            exact = np.flatnonzero(distances_squared < 1e-9)
            if len(exact):
                exact_positions[target_position] = int(source_indices[int(exact[0])])
            if len(source_indices):
                nearest_distance = float(np.min(distances_squared))
                nearest = np.flatnonzero(distances_squared == nearest_distance)
                nearest_positions[target_position] = int(source_indices[int(nearest[0])])
        if len(source_indices) == 0:
            distances_squared = np.sum((sources - targets[target_position]) ** 2, axis=1)
            nearest_distance = float(np.min(distances_squared))
            nearest = np.flatnonzero(distances_squared == nearest_distance)
            if len(nearest):
                nearest_positions[target_position] = int(nearest[0])

    indptr = np.zeros(target_count + 1, dtype=np.int64)
    for target_position, source_indices in enumerate(in_radius_lists):
        indptr[target_position + 1] = indptr[target_position] + len(source_indices)
    if indptr[-1]:
        flat_sources = np.asarray(
            [source_position for source_indices in in_radius_lists for source_position in source_indices],
            dtype=np.int64,
        )
        flat_weights = np.zeros(len(flat_sources), dtype=float)
        for target_position, source_indices in enumerate(in_radius_lists):
            start, stop = int(indptr[target_position]), int(indptr[target_position + 1])
            if stop == start:
                continue
            source_indices_array = np.asarray(source_indices, dtype=np.int64)
            deltas = sources[source_indices_array] - targets[target_position]
            distances_squared = np.einsum("ij,ij->i", deltas, deltas)
            non_exact = distances_squared >= 1e-9
            row_weights = flat_weights[start:stop]
            row_weights[non_exact] = 1.0 / distances_squared[non_exact]
            flat_weights[start:stop] = row_weights
    else:
        flat_sources = np.empty(0, dtype=np.int64)
        flat_weights = np.empty(0, dtype=float)

    return IDWPlan(
        in_radius_indptr=indptr,
        in_radius_source_positions=flat_sources,
        in_radius_weights=flat_weights,
        exact_source_positions=exact_positions,
        nearest_source_positions=nearest_positions,
        local_data_mask=local_mask,
        target_count=target_count,
        source_count=source_count,
    )


def apply_idw_plan(values: np.ndarray, plan: IDWPlan) -> np.ndarray:
    """Apply one IDW geometry plan to all source value columns."""
    source_values = np.asarray(values)
    was_vector = source_values.ndim == 1
    if source_values.ndim == 1:
        source_values = source_values[:, None]
    if source_values.ndim != 2 or source_values.shape[0] != plan.source_count:
        raise ValueError("values must have shape (plan.source_count, field_count)")
    if source_values.dtype.kind not in "biufc":
        source_values = pd.DataFrame(source_values).apply(pd.to_numeric, errors="coerce").to_numpy(dtype=float)
    else:
        source_values = source_values.astype(float, copy=False)
    source_values = np.where(np.isfinite(source_values), source_values, 0.0)
    result = np.zeros((plan.target_count, source_values.shape[1]), dtype=float)
    if plan.target_count == 0 or plan.source_count == 0:
        return result[:, 0] if was_vector else result

    starts = plan.in_radius_indptr[:-1]
    stops = plan.in_radius_indptr[1:]
    for target_position, (start, stop) in enumerate(zip(starts, stops)):
        start, stop = int(start), int(stop)
        if stop > start:
            source_positions = plan.in_radius_source_positions[start:stop]
            weights = plan.in_radius_weights[start:stop]
            denominator = float(weights.sum())
            if denominator > 0.0:
                result[target_position] = (source_values[source_positions] * weights[:, None]).sum(axis=0) / denominator
        exact_position = int(plan.exact_source_positions[target_position])
        if exact_position >= 0:
            result[target_position] = source_values[exact_position]
        elif stop == start:
            nearest_position = int(plan.nearest_source_positions[target_position])
            if nearest_position >= 0:
                result[target_position] = source_values[nearest_position]
    result[~plan.local_data_mask] = 0.0
    return result[:, 0] if was_vector else result
