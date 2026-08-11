import geopandas as gpd
import numpy as np
import pandas as pd
import pytest
from shapely.geometry import Point, box

import stages.neighborhoods as neighborhoods_stage
from lib.neighborhood_idw import apply_idw_plan, build_idw_plan
from stages.neighborhoods import (
    add_status_summaries,
    assign_centroids_to_hexes,
    build_neighborhood_surface_geojson,
    status_metric_definitions,
    status_values,
    status_composition,
    status_summary,
)


def test_status_composition_normalizes_unexpected_values_and_uses_exact_denominators():
    stats = status_composition(
        pd.Series(["disappointing", "functioning", "thriving", "not-a-status"])
    )

    assert stats["u95_count_disappointing"] == 1
    assert stats["u95_count_functioning"] == 1
    assert stats["u95_count_thriving"] == 1
    assert stats["u95_count_unknown"] == 1
    assert stats["u95_pct_unknown"] == 25.0


def test_status_summary_reports_tie_empty_and_unknown_majority_reasons():
    tie = status_summary(pd.Series(["thriving", "functioning"]))
    assert tie["u95_status"] == "unknown"
    assert tie["u95_support_count"] == 2
    assert tie["u95_summary_reason"] == "tie"

    empty = status_summary(pd.Series([], dtype=object))
    assert empty["u95_status"] == "unknown"
    assert empty["u95_support_count"] == 0
    assert empty["u95_summary_reason"] == "no_buildings"

    unknown_majority = status_summary(pd.Series(["unknown", "unknown", "thriving"]))
    assert unknown_majority["u95_status"] == "unknown"
    assert unknown_majority["u95_support_count"] == 3
    assert unknown_majority["u95_summary_reason"] == "predominantly_unknown"


def test_area_summary_includes_overview_category_indicator_and_diagnostic_compositions():
    area = {}
    buildings = pd.DataFrame({
        "u95_status_10min": ["disappointing", "functioning", "thriving", "unknown"],
        "u95_status_environmental_quality_10min": ["thriving"] * 4,
        "u95_status_sub_environmental_quality_shade_10min": ["functioning"] * 4,
        "u95_status_detail_family_services_education_school_10min": ["unknown"] * 4,
    })
    add_status_summaries(area, buildings)

    for prefix in (
        "u95",
        "u95_environmental_quality",
        "u95_sub_environmental_quality_shade",
        "u95_detail_family_services_education_school",
    ):
        assert area[f"{prefix}_support_count"] == 4
        assert sum(area[f"{prefix}_count_{token}"] for token in (
            "disappointing", "functioning", "thriving", "unknown"
        )) == 4
    assert area["u95_status"] == "unknown"
    assert area["u95_summary_reason"] == "tie"
    assert area["u95_status_environmental_quality"] == "thriving"
    assert area["u95_status_sub_environmental_quality_shade"] == "functioning"
    assert area["u95_status_detail_family_services_education_school"] == "unknown"
    assert "avg_score_weighted_10min" not in area
    assert "neighborhood_ranking_weighted" not in area


def test_centroid_on_shared_edge_is_assigned_once_to_lexicographically_first_hex():
    hexes = [
        {"hex_id": "H2", "geometry": box(1, 0, 2, 1)},
        {"hex_id": "H1", "geometry": box(0, 0, 1, 1)},
    ]
    assignments = assign_centroids_to_hexes([Point(1, 0.5)], hexes)

    assert assignments == ["H1"]


def test_surface_publishes_categorical_statuses_once_per_centroid_without_compositions():
    hood = gpd.GeoDataFrame(
        {"Name": ["TestHood"]},
        geometry=[box(0, 0, 200, 200)],
        crs="EPSG:2039",
    )
    buildings = gpd.GeoDataFrame(
        {
            "building_id": [0, 1, 2, 3],
            "neighborhood": ["TestHood"] * 4,
            "u95_status_10min": ["disappointing", "functioning", "thriving", "unknown"],
            "u95_status_environmental_quality_10min": ["thriving"] * 4,
            "u95_status_sub_environmental_quality_shade_10min": ["functioning"] * 4,
            "u95_status_detail_family_services_education_school_10min": ["unknown"] * 4,
            "score_expanded_5min": [1.0, 2.0, 3.0, 4.0],
            "score_expanded_10min": [2.0, 3.0, 4.0, 5.0],
            "score_expanded_15min": [3.0, 4.0, 5.0, 6.0],
        },
        geometry=[Point(50, 50), Point(100, 100), Point(150, 150), Point(75, 125)],
        crs="EPSG:2039",
    )
    buildings["_centroid_proj"] = buildings.geometry

    fc = build_neighborhood_surface_geojson(hood, buildings, filter_types=[])
    assert fc["features"], "expected clipped hex features"

    props = [feature["properties"] for feature in fc["features"]]
    assert all("u95_status" in item for item in props)
    assert all("u95_status_environmental_quality" in item for item in props)
    assert all("u95_status_sub_environmental_quality_shade" in item for item in props)
    assert all("u95_status_detail_family_services_education_school" in item for item in props)
    assert all("score_weighted" not in item for item in props)
    assert all("u95_count_thriving" not in item for item in props)

    occupied_cells = [
        item
        for item in props
        if item["u95_summary_reason"] in {"predominant", "tie", "predominantly_unknown"}
    ]
    assert occupied_cells
    assert all(
        item["u95_status_environmental_quality"] == "thriving"
        and item["u95_environmental_quality_summary_reason"] == "predominant"
        for item in occupied_cells
    )

    empty_cells = [item for item in props if item["u95_summary_reason"] == "inferred_spatial"]
    assert empty_cells
    assert all(item["u95_support_count"] == len(buildings) for item in empty_cells)


def test_surface_keeps_amenities_focus_fallback_when_expanded_columns_are_unavailable():
    hood = gpd.GeoDataFrame(
        {"Name": ["TestHood"]}, geometry=[box(0, 0, 100, 100)], crs="EPSG:2039"
    )
    buildings = gpd.GeoDataFrame(
        {
            "neighborhood": ["TestHood", "TestHood"],
            "u95_status_10min": ["thriving", "functioning"],
            "num_amenities_5min": [4.0, 0.0],
            "num_amenities_10min": [5.0, 0.0],
            "num_amenities_15min": [6.0, 0.0],
            "num_trees_5min": [4.0, 0.0],
            "num_trees_10min": [4.0, 0.0],
            "num_trees_15min": [4.0, 0.0],
            "num_street_lights_5min": [4.0, 0.0],
            "num_street_lights_10min": [4.0, 0.0],
            "num_street_lights_15min": [4.0, 0.0],
        },
        geometry=[Point(25, 25), Point(75, 75)],
        crs="EPSG:2039",
    )
    buildings["_centroid_proj"] = buildings.geometry

    fc = build_neighborhood_surface_geojson(hood, buildings, filter_types=[])
    values = [feature["properties"]["score_expanded_10min"] for feature in fc["features"]]
    assert any(0 < value < 100 for value in values)


def _categorical_result(source_xy, statuses, target_xy=(0.0, 0.0)):
    plan = build_idw_plan(
        np.asarray(source_xy, dtype=float),
        np.asarray([target_xy], dtype=float),
        idw_radius_m=425.0,
        local_radius_m=470.0,
    )
    return neighborhoods_stage.apply_categorical_status_plan(statuses, plan)[0]


def _single_cell_surface(monkeypatch, hood_geometry, cell_geometry, buildings):
    monkeypatch.setattr(
        neighborhoods_stage,
        "hex_grid_for_polygon_bounds",
        lambda *_args: [cell_geometry],
    )
    hoods = gpd.GeoDataFrame(
        {"Name": ["TestHood"]},
        geometry=[hood_geometry],
        crs="EPSG:2039",
    )
    return build_neighborhood_surface_geojson(hoods, buildings, filter_types=[])


def test_observed_tie_uses_spatial_vote_without_overriding_unique_summaries(monkeypatch):
    buildings = gpd.GeoDataFrame(
        {
            "building_id": [1, 2],
            "neighborhood": ["TestHood", "TestHood"],
            "u95_status_10min": ["thriving", "functioning"],
            "u95_status_environmental_quality_10min": ["unknown", "unknown"],
            "u95_status_nature_10min": ["thriving", "thriving"],
        },
        geometry=[Point(1, 0), Point(9, 0)],
        crs="EPSG:2039",
    )
    buildings["_centroid_proj"] = buildings.geometry

    surface = _single_cell_surface(
        monkeypatch,
        box(-10, -10, 10, 10),
        box(-10, -10, 10, 10),
        buildings,
    )
    prop = surface["features"][0]["properties"]

    assert prop["u95_status"] == "thriving"
    assert prop["u95_summary_reason"] == "inferred_spatial"
    assert prop["u95_support_count"] == 2
    assert prop["u95_status_environmental_quality"] == "unknown"
    assert prop["u95_environmental_quality_summary_reason"] == "predominantly_unknown"
    assert prop["u95_environmental_quality_support_count"] == 2
    assert prop["u95_status_nature"] == "thriving"
    assert prop["u95_nature_summary_reason"] == "predominant"
    assert prop["u95_nature_support_count"] == 2


def test_categorical_plan_uses_inverse_distance_influence_within_425_metres():
    status, support = _categorical_result(
        source_xy=[(10.0, 0.0), (-10.0, 0.0), (20.0, 0.0)],
        statuses=["thriving", "thriving", "functioning"],
    )

    assert status == "thriving"
    assert support == 3


def test_categorical_plan_equal_influence_is_unknown():
    status, support = _categorical_result(
        source_xy=[(10.0, 0.0), (-10.0, 0.0)],
        statuses=["thriving", "functioning"],
    )

    assert status == "unknown"
    assert support == 2


def test_categorical_plan_unknown_can_have_the_greatest_influence():
    status, support = _categorical_result(
        source_xy=[(10.0, 0.0), (20.0, 0.0)],
        statuses=["unknown", "thriving"],
    )

    assert status == "unknown"
    assert support == 2


def test_categorical_plan_summarizes_every_exact_hit():
    status, support = _categorical_result(
        source_xy=[(0.0, 0.0), (0.0, 0.0), (0.0, 0.0)],
        statuses=["functioning", "thriving", "thriving"],
    )

    assert status == "thriving"
    assert support == 3


def test_surface_nearest_fallback_is_deterministic_after_building_id_sort(monkeypatch):
    buildings = gpd.GeoDataFrame(
        {
            "building_id": [10, 2],
            "neighborhood": ["TestHood", "TestHood"],
            "u95_status_10min": ["thriving", "functioning"],
        },
        geometry=[Point(500, 0), Point(-500, 0)],
        crs="EPSG:2039",
    )
    buildings["_centroid_proj"] = buildings.geometry

    surface = _single_cell_surface(
        monkeypatch,
        box(-600, -10, 600, 10),
        box(-1, -1, 1, 1),
        buildings,
    )
    prop = surface["features"][0]["properties"]

    assert prop["u95_status"] == "functioning"
    assert prop["u95_summary_reason"] == "inferred_spatial"
    assert prop["u95_support_count"] == 1


def test_surface_rejects_duplicate_neighborhood_names_before_generation():
    hoods = gpd.GeoDataFrame(
        {"Name": ["Repeated", "Repeated"]},
        geometry=[box(0, 0, 10, 10), box(20, 0, 30, 10)],
        crs="EPSG:2039",
    )
    buildings = gpd.GeoDataFrame(
        {"neighborhood": pd.Series(dtype=object)},
        geometry=gpd.GeoSeries([], crs="EPSG:2039"),
        crs="EPSG:2039",
    )

    with pytest.raises(ValueError, match="unique"):
        build_neighborhood_surface_geojson(hoods, buildings, filter_types=[])


def test_surface_rejects_null_neighborhood_names_before_generation():
    hoods = gpd.GeoDataFrame(
        {"Name": [None]},
        geometry=[box(0, 0, 10, 10)],
        crs="EPSG:2039",
    )
    buildings = gpd.GeoDataFrame(
        {"neighborhood": pd.Series(dtype=object)},
        geometry=gpd.GeoSeries([], crs="EPSG:2039"),
        crs="EPSG:2039",
    )

    with pytest.raises(ValueError, match="non-null"):
        build_neighborhood_surface_geojson(hoods, buildings, filter_types=[])


def test_surface_emits_unknown_cells_when_neighborhood_has_no_usable_centroids(monkeypatch):
    buildings = gpd.GeoDataFrame(
        {"neighborhood": pd.Series(dtype=object)},
        geometry=gpd.GeoSeries([], crs="EPSG:2039"),
        crs="EPSG:2039",
    )

    surface = _single_cell_surface(
        monkeypatch,
        box(-10, -10, 10, 10),
        box(-1, -1, 1, 1),
        buildings,
    )
    prop = surface["features"][0]["properties"]

    assert prop["u95_status"] == "unknown"
    assert prop["u95_summary_reason"] == "no_buildings"
    assert prop["u95_support_count"] == 0


def test_missing_status_field_contributes_unknown_to_spatial_inference(monkeypatch):
    buildings = gpd.GeoDataFrame(
        {"building_id": [1], "neighborhood": ["TestHood"]},
        geometry=[Point(100, 0)],
        crs="EPSG:2039",
    )
    buildings["_centroid_proj"] = buildings.geometry

    surface = _single_cell_surface(
        monkeypatch,
        box(-10, -10, 110, 10),
        box(-1, -1, 1, 1),
        buildings,
    )
    prop = surface["features"][0]["properties"]

    assert prop["u95_status"] == "unknown"
    assert prop["u95_summary_reason"] == "inferred_spatial"
    assert prop["u95_support_count"] == 1


def test_surface_amenities_values_and_470m_mask_match_shared_idw_plan(monkeypatch):
    cells = [box(-1, -1, 1, 1), box(999, -1, 1001, 1)]
    monkeypatch.setattr(
        neighborhoods_stage,
        "hex_grid_for_polygon_bounds",
        lambda *_args: cells,
    )
    hoods = gpd.GeoDataFrame(
        {"Name": ["TestHood"]},
        geometry=[box(-10, -10, 1010, 10)],
        crs="EPSG:2039",
    )
    buildings = gpd.GeoDataFrame(
        {
            "building_id": [1],
            "neighborhood": ["TestHood"],
            "u95_status_10min": ["thriving"],
            "score_expanded_5min": [5.0],
            "score_expanded_10min": [5.0],
            "score_expanded_15min": [5.0],
        },
        geometry=[Point(450, 0)],
        crs="EPSG:2039",
    )
    buildings["_centroid_proj"] = buildings.geometry

    surface = build_neighborhood_surface_geojson(hoods, buildings, filter_types=[])
    props = [feature["properties"] for feature in surface["features"]]
    plan = build_idw_plan(
        np.asarray([[450.0, 0.0]]),
        np.asarray([[0.0, 0.0], [1000.0, 0.0]]),
        idw_radius_m=425.0,
        local_radius_m=470.0,
    )
    expected = apply_idw_plan(np.asarray([100.0]), plan)

    assert [prop["score_expanded_10min"] for prop in props] == expected.tolist()
    assert [prop["has_buildings"] for prop in props] == plan.local_data_mask.astype(int).tolist()


def test_surface_infers_every_status_metric_independently(monkeypatch):
    buildings = gpd.GeoDataFrame(
        {
            "building_id": [1, 2],
            "neighborhood": ["TestHood", "TestHood"],
            "u95_status_10min": ["thriving", "thriving"],
            "u95_status_environmental_quality_10min": ["functioning", "functioning"],
        },
        geometry=[Point(100, 0), Point(150, 0)],
        crs="EPSG:2039",
    )
    buildings["_centroid_proj"] = buildings.geometry

    surface = _single_cell_surface(
        monkeypatch,
        box(-10, -10, 160, 10),
        box(-1, -1, 1, 1),
        buildings,
    )
    prop = surface["features"][0]["properties"]

    for status_key, prefix, source_column in status_metric_definitions():
        expected_sources = status_values(buildings, source_column)
        assert prop[status_key] in {"disappointing", "functioning", "thriving", "unknown"}
        assert prop[f"{prefix}_summary_reason"] == "inferred_spatial"
        assert prop[f"{prefix}_support_count"] == len(expected_sources)
