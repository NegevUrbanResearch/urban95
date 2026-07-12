from __future__ import annotations

import geopandas as gpd
import numpy as np
import pandas as pd
import pytest
from dataclasses import FrozenInstanceError
from shapely.geometry import Point, box

from core.geojson_utils import write_minimal_geojson
from lib import neighborhood_idw
from stages import neighborhoods
from stages.neighborhoods import apply_idw_plan, build_idw_plan


def _fieldwise_reference(source_xy, target_xy, values, radius, local_radius):
    source_xy = np.asarray(source_xy, dtype=float)
    target_xy = np.asarray(target_xy, dtype=float)
    values = np.asarray(values, dtype=float)
    if values.ndim == 1:
        values = values[:, None]
    out = np.zeros((len(target_xy), values.shape[1]), dtype=float)
    for target_position, (tx, ty) in enumerate(target_xy):
        if len(source_xy) == 0:
            continue
        d2 = (source_xy[:, 0] - tx) ** 2 + (source_xy[:, 1] - ty) ** 2
        exact = np.flatnonzero(d2 < 1e-9)
        if len(exact):
            out[target_position] = values[exact[0]]
        else:
            in_radius = d2 <= radius * radius
            if in_radius.any():
                weights = 1.0 / d2[in_radius]
                out[target_position] = (values[in_radius] * weights[:, None]).sum(axis=0) / weights.sum()
            else:
                nearest = np.flatnonzero(d2 == d2.min())[0]
                out[target_position] = values[nearest]
        if not (d2 <= local_radius * local_radius).any():
            out[target_position] = 0.0
    return out


def test_shared_idw_plan_matches_fieldwise_reference_and_preserves_boundaries():
    source_xy = np.array(
        [
            [0.0, 0.0],
            [0.0, 0.0],
            [100.0, 0.0],
            [-425.0, 0.0],
            [425.0, 0.0],
            [1000.0, 0.0],
        ]
    )
    target_xy = np.array(
        [
            [0.0, 0.0],
            [50.0, 0.0],
            [425.0, 0.0],
            [470.0, 0.0],
            [700.0, 0.0],
        ]
    )
    values = np.array(
        [
            [10.0, np.nan],
            [99.0, 9.0],
            [20.0, 2.0],
            [30.0, 3.0],
            [40.0, 4.0],
            [50.0, 5.0],
        ]
    )

    plan = build_idw_plan(source_xy, target_xy, idw_radius_m=425.0, local_radius_m=470.0)
    actual = apply_idw_plan(values, plan)
    expected = _fieldwise_reference(source_xy, target_xy, np.nan_to_num(values), 425.0, 470.0)

    np.testing.assert_allclose(actual, expected)
    assert plan.exact_source_positions[0] == 0
    assert plan.local_data_mask.tolist() == [True, True, True, True, True]


def test_idw_plan_keeps_all_in_radius_sources_and_first_nearest_tie():
    source_xy = np.array([[-1.0, 0.0], [1.0, 0.0], [0.0, 2.0], [0.0, -2.0]])
    target_xy = np.array([[0.0, 0.0], [10.0, 0.0]])
    values = np.arange(8, dtype=float).reshape(4, 2)
    plan = build_idw_plan(source_xy, target_xy, idw_radius_m=2.0, local_radius_m=2.0)

    assert plan.in_radius_indptr.tolist() == [0, 4, 4]
    assert plan.in_radius_source_positions.tolist() == [0, 1, 2, 3]
    assert plan.nearest_source_positions[1] == 1
    np.testing.assert_allclose(apply_idw_plan(values, plan)[1], 0.0)

    tie_plan = build_idw_plan(
        np.array([[8.0, 0.0], [12.0, 0.0]]),
        np.array([[10.0, 0.0]]),
        idw_radius_m=1.0,
        local_radius_m=5.0,
    )
    assert tie_plan.nearest_source_positions.tolist() == [0]


def test_empty_idw_plan_returns_zero_matrix_and_empty_local_mask():
    plan = build_idw_plan(np.empty((0, 2)), np.array([[1.0, 2.0], [3.0, 4.0]]), 425.0, 470.0)
    actual = apply_idw_plan(np.empty((0, 3)), plan)
    assert actual.shape == (2, 3)
    assert np.all(actual == 0.0)
    assert plan.local_data_mask.tolist() == [False, False]


def test_apply_idw_plan_coerces_invalid_and_null_values_to_zero():
    plan = build_idw_plan(
        np.array([[0.0, 0.0], [1.0, 0.0]]),
        np.array([[0.5, 0.0]]),
        idw_radius_m=2.0,
        local_radius_m=2.0,
    )
    values = np.array([[None, "not-a-number"], ["2.0", np.inf]], dtype=object)
    np.testing.assert_allclose(apply_idw_plan(values, plan), [[1.0, 0.0]])


def test_idw_radius_includes_exact_425m_and_excludes_just_outside():
    plan = build_idw_plan(
        np.array([[0.0, 0.0]]),
        np.array([[425.0, 0.0], [425.000001, 0.0]]),
        idw_radius_m=425.0,
        local_radius_m=500.0,
    )
    assert plan.in_radius_indptr.tolist() == [0, 1, 1]
    assert plan.in_radius_source_positions.tolist() == [0]


def test_local_mask_includes_exact_470m_and_excludes_just_outside():
    plan = build_idw_plan(
        np.array([[0.0, 0.0]]),
        np.array([[470.0, 0.0], [470.000001, 0.0]]),
        idw_radius_m=1.0,
        local_radius_m=470.0,
    )
    assert plan.local_data_mask.tolist() == [True, False]
    np.testing.assert_allclose(apply_idw_plan(np.array([7.0]), plan), [7.0, 0.0])


def test_several_exact_hits_use_first_source_row_for_every_target():
    plan = build_idw_plan(
        np.array([[0.0, 0.0], [0.00001, 0.0], [0.00002, 0.0]]),
        np.array([[0.0, 0.0], [0.00001, 0.0], [0.00002, 0.0]]),
        idw_radius_m=1.0,
        local_radius_m=1.0,
    )
    assert plan.exact_source_positions.tolist() == [0, 0, 0]
    np.testing.assert_allclose(apply_idw_plan(np.array([7.0, 9.0, 11.0]), plan), [7.0, 7.0, 7.0])


def test_candidate_rechecks_restore_global_nearest_and_exact_local_mask(monkeypatch):
    class AdversarialTree:
        def __init__(self, _sources):
            pass

        def query(self, _targets, *, predicate, distance):
            assert predicate == "dwithin"
            return np.array([[0], [2]], dtype=np.int64)

    monkeypatch.setattr(neighborhood_idw, "STRtree", AdversarialTree)
    plan = build_idw_plan(
        np.array([[0.0, 0.0], [5.0, 0.0], [100.0, 0.0]]),
        np.array([[10.0, 0.0]]),
        idw_radius_m=1.0,
        local_radius_m=2.0,
    )
    assert plan.in_radius_indptr.tolist() == [0, 0]
    assert plan.nearest_source_positions.tolist() == [1]
    assert plan.local_data_mask.tolist() == [False]


@pytest.mark.parametrize("malformed", [np.empty((0, 3)), np.empty((2, 0))])
def test_malformed_empty_coordinate_shapes_are_rejected(malformed):
    with pytest.raises(ValueError, match=r"shape \(n, 2\)"):
        build_idw_plan(malformed, np.empty((0, 2)), 425.0, 470.0)


def test_idw_plan_has_stable_arrays_and_does_not_mutate_inputs():
    source_xy = np.array([[0.0, 0.0], [2.0, 0.0]], dtype=float)
    target_xy = np.array([[1.0, 0.0]], dtype=float)
    values = np.array([[10.0], [20.0]], dtype=float)
    source_before = source_xy.copy()
    target_before = target_xy.copy()
    values_before = values.copy()

    plan = build_idw_plan(source_xy, target_xy, 2.0, 2.0)
    result = apply_idw_plan(values, plan)

    assert plan.in_radius_indptr.shape == (2,)
    assert plan.in_radius_indptr.dtype == np.int64
    assert plan.in_radius_source_positions.dtype == np.int64
    assert plan.in_radius_weights.dtype == float
    assert plan.exact_source_positions.shape == (1,)
    assert plan.nearest_source_positions.shape == (1,)
    assert plan.local_data_mask.dtype == bool
    assert result.shape == (1, 1)
    np.testing.assert_allclose(result, [[15.0]])
    np.testing.assert_array_equal(source_xy, source_before)
    np.testing.assert_array_equal(target_xy, target_before)
    np.testing.assert_array_equal(values, values_before)

    with pytest.raises(FrozenInstanceError):
        plan.target_count = 99


@pytest.mark.filterwarnings("ignore:Conversion of an array.*:DeprecationWarning")
def test_published_rounded_geometry_remains_neighborhood_assignment_boundary(tmp_path):
    unrounded = gpd.GeoDataFrame(
        {"building_id": [1]},
        geometry=[Point(34.8000049, 31.2500049)],
        crs="EPSG:4326",
    )
    published_path = tmp_path / "buildings_accessibility.geojson"
    write_minimal_geojson(unrounded, published_path, precision=5)
    published = neighborhoods.load_geodataframe(published_path)
    hoods = gpd.GeoDataFrame(
        {"Name": ["rounded-side"]},
        geometry=[box(34.79999, 31.24999, 34.800002, 31.25001)],
        crs="EPSG:4326",
    )

    def assignment(frame):
        metric = frame.to_crs(epsg=2039)
        centroids = metric.geometry.centroid
        points = gpd.GeoSeries(centroids, crs="EPSG:2039").to_crs(epsg=4326)
        point_frame = frame.copy().set_geometry(points)
        joined = gpd.sjoin(point_frame, hoods, predicate="within", how="left")
        return joined["Name"].iloc[0]

    assert published.geometry.iloc[0].x == 34.8
    assert assignment(published) == "rounded-side"
    assert pd.isna(assignment(unrounded))
    assert neighborhoods.BUILDINGS_CANDIDATES[0].name == "buildings_accessibility.geojson.gz"
