"""Small GeoPandas spatial-index pair and grouped-count helpers."""
from __future__ import annotations

from collections.abc import Iterator

import geopandas as gpd
import numpy as np


def iter_query_pairs(
    query_geometries: gpd.GeoSeries,
    indexed_geometries: gpd.GeoSeries,
    predicate: str,
    chunk_size: int,
) -> Iterator[tuple[np.ndarray, np.ndarray]]:
    """Yield positional query/source matches from a source spatial index.

    GeoPandas evaluates ``predicate(query_geometry, indexed_geometry)``.  The
    series are reset once so the returned arrays always contain zero-based
    positions, independent of either input index labels.
    """
    if isinstance(chunk_size, bool) or not isinstance(chunk_size, (int, np.integer)):
        raise ValueError("chunk_size must be a positive integer")
    if chunk_size <= 0:
        raise ValueError("chunk_size must be a positive integer")

    queries = query_geometries.reset_index(drop=True)
    sources = indexed_geometries.reset_index(drop=True)
    source_index = sources.sindex
    for start in range(0, len(queries), int(chunk_size)):
        stop = min(start + int(chunk_size), len(queries))
        query_positions, source_positions = source_index.query(
            queries.iloc[start:stop], predicate=predicate
        )
        query_positions = np.asarray(query_positions, dtype=np.int64) + start
        source_positions = np.asarray(source_positions, dtype=np.int64)
        yield query_positions, source_positions


def _count_dtype(max_count: int) -> np.dtype:
    if max_count <= np.iinfo(np.uint8).max:
        return np.dtype(np.uint8)
    if max_count <= np.iinfo(np.uint16).max:
        return np.dtype(np.uint16)
    if max_count <= np.iinfo(np.uint32).max:
        return np.dtype(np.uint32)
    return np.dtype(np.uint64)


def count_pairs_by_group(
    query_positions: np.ndarray,
    source_positions: np.ndarray,
    source_group_codes: np.ndarray,
    query_count: int,
    group_count: int,
) -> np.ndarray:
    """Reduce positional pairs into a compact ``query x category`` matrix."""
    query_positions = np.asarray(query_positions, dtype=np.int64)
    source_positions = np.asarray(source_positions, dtype=np.int64)
    source_group_codes = np.asarray(source_group_codes)
    if query_positions.shape != source_positions.shape:
        raise ValueError("query_positions and source_positions must have equal shape")
    if query_count < 0 or group_count < 0:
        raise ValueError("query_count and group_count must be non-negative")

    flat_size = int(query_count) * int(group_count)
    if query_positions.size == 0 or flat_size == 0:
        return np.zeros((int(query_count), int(group_count)), dtype=np.uint8)

    matched_codes = source_group_codes[source_positions]
    valid = (matched_codes >= 0) & (matched_codes < int(group_count))
    valid &= (query_positions >= 0) & (query_positions < int(query_count))
    flat = query_positions[valid] * int(group_count) + matched_codes[valid]
    counts = np.bincount(flat.astype(np.int64, copy=False), minlength=flat_size)
    return counts.reshape(int(query_count), int(group_count)).astype(
        _count_dtype(int(counts.max(initial=0))), copy=False
    )
