import geopandas as gpd
import numpy as np
import pytest
from shapely.geometry import Point, Polygon, box

from lib.spatial_pairs import count_pairs_by_group, iter_query_pairs


def _flatten(pairs):
    pairs = list(pairs)
    if not pairs:
        return np.array([], dtype=np.int64), np.array([], dtype=np.int64)
    return (
        np.concatenate([query for query, _ in pairs]),
        np.concatenate([source for _, source in pairs]),
    )


def test_iter_query_pairs_preserves_duplicate_matches_and_chunk_boundaries():
    queries = gpd.GeoSeries(
        [box(0, 0, 2, 2), box(10, 10, 12, 12)],
        index=[100, 200],
        crs=2039,
    )
    sources = gpd.GeoSeries(
        [Point(1, 1), Point(1, 1), Point(11, 11)],
        index=[50, 60, 70],
        crs=2039,
    )

    query, source = _flatten(
        iter_query_pairs(queries, sources, predicate="contains", chunk_size=1)
    )

    np.testing.assert_array_equal(query, [0, 0, 1])
    np.testing.assert_array_equal(source, [0, 1, 2])


def test_iter_query_pairs_uses_query_orientation_for_boundary_predicates():
    queries = gpd.GeoSeries([box(0, 0, 2, 2)], crs=2039)
    boundary = gpd.GeoSeries([Point(0, 1)], crs=2039)

    contains = list(iter_query_pairs(queries, boundary, predicate="contains", chunk_size=2))
    intersects = list(iter_query_pairs(queries, boundary, predicate="intersects", chunk_size=2))

    assert _flatten(contains)[0].tolist() == []
    assert _flatten(intersects)[0].tolist() == [0]


def test_iter_query_pairs_empty_inputs_and_source_position_indexes():
    empty_queries = gpd.GeoSeries([], dtype="geometry", index=[], crs=2039)
    sources = gpd.GeoSeries([Point(1, 1)], index=[99], crs=2039)
    assert list(iter_query_pairs(empty_queries, sources, predicate="contains", chunk_size=1)) == []

    queries = gpd.GeoSeries([box(0, 0, 2, 2)], index=[42], crs=2039)
    empty_sources = gpd.GeoSeries([], dtype="geometry", index=[], crs=2039)
    assert _flatten(iter_query_pairs(queries, empty_sources, predicate="contains", chunk_size=1))[0].tolist() == []


def test_iter_query_pairs_preserves_current_null_and_empty_source_index_behavior():
    queries = gpd.GeoSeries([box(0, 0, 2, 2)], crs=2039)
    sources = gpd.GeoSeries([None, Point(), Point(1, 1)], index=[10, 20, 30], crs=2039)

    query, source = _flatten(
        iter_query_pairs(queries, sources, predicate="contains", chunk_size=1)
    )

    np.testing.assert_array_equal(query, [0])
    np.testing.assert_array_equal(source, [2])


def test_iter_query_pairs_preserves_current_invalid_source_geometry_behavior():
    invalid_bowtie = Polygon([(0, 0), (2, 2), (0, 2), (2, 0), (0, 0)])
    assert not invalid_bowtie.is_valid
    queries = gpd.GeoSeries([box(-1, -1, 3, 3)], crs=2039)
    sources = gpd.GeoSeries([invalid_bowtie], index=[91], crs=2039)

    query, source = _flatten(
        iter_query_pairs(queries, sources, predicate="contains", chunk_size=1)
    )

    np.testing.assert_array_equal(query, [0])
    np.testing.assert_array_equal(source, [0])


def test_iter_query_pairs_results_are_invariant_across_chunk_sizes():
    queries = gpd.GeoSeries(
        [box(0, 0, 2, 2), box(10, 10, 12, 12), box(20, 20, 22, 22)],
        index=[100, 200, 300],
        crs=2039,
    )
    sources = gpd.GeoSeries(
        [Point(1, 1), Point(1, 1), Point(11, 11), Point(21, 21)],
        index=[50, 60, 70, 80],
        crs=2039,
    )

    results = [
        _flatten(iter_query_pairs(queries, sources, predicate="contains", chunk_size=size))
        for size in (1, 2, 10)
    ]

    for query, source in results[1:]:
        np.testing.assert_array_equal(query, results[0][0])
        np.testing.assert_array_equal(source, results[0][1])


def test_count_pairs_by_group_filters_unknown_codes_and_returns_matrix():
    query_positions = np.array([0, 0, 1, 1, 1], dtype=np.int64)
    source_positions = np.array([0, 1, 2, 3, 4], dtype=np.int64)
    source_group_codes = np.array([1, -1, 0, 2, -1], dtype=np.int16)

    counts = count_pairs_by_group(
        query_positions, source_positions, source_group_codes, query_count=2, group_count=3
    )

    np.testing.assert_array_equal(counts, [[0, 1, 0], [1, 0, 1]])
    assert counts.dtype.kind in "iu"


def test_count_pairs_by_group_empty_pairs_have_planned_shape():
    counts = count_pairs_by_group(
        np.array([], dtype=np.int64),
        np.array([], dtype=np.int64),
        np.array([0, -1], dtype=np.int16),
        query_count=3,
        group_count=2,
    )

    assert counts.shape == (3, 2)
    assert counts.tolist() == [[0, 0], [0, 0], [0, 0]]


@pytest.mark.parametrize(
    ("match_count", "expected_dtype"),
    [
        (255, np.dtype(np.uint8)),
        (256, np.dtype(np.uint16)),
        (65_535, np.dtype(np.uint16)),
        (65_536, np.dtype(np.uint32)),
    ],
)
def test_count_pairs_by_group_uses_smallest_safe_unsigned_dtype(
    match_count, expected_dtype
):
    counts = count_pairs_by_group(
        np.zeros(match_count, dtype=np.int64),
        np.zeros(match_count, dtype=np.int64),
        np.array([0], dtype=np.int8),
        query_count=1,
        group_count=1,
    )

    assert counts.dtype == expected_dtype
    assert counts.tolist() == [[match_count]]
