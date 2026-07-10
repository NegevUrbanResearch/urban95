"""Tests for lib/shade_si.py."""

from __future__ import annotations

import logging
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import GeometryCollection, LineString, Point, Polygon
from shapely.geometry.base import BaseGeometry

from lib.shade_si import (
    BUILDING_SI_FIELD,
    BUILDING_SHADE_RADIUS_M,
    LAYER_OPEN_SPACE,
    LAYER_STREET,
    LAYER_TYPE_FIELD,
    METRIC_CRS,
    OFFICIAL_SI_INTERPRETATION_BUCKETS,
    SCORE_FIELD,
    attach_summer_si_to_buildings,
    classify_summer_si,
    load_prepared_si_layers,
    load_raw_si_layers,
    lookup_summer_si_at_point,
    round_building_summer_si,
    sanitize_polygonal_finite_si_surfaces,
    summer_si_to_subscore,
)
from stages.shade import preprocess_shade


def _box(center_x: float, center_y: float, half_size: float = 5.0) -> Polygon:
    return Polygon(
        [
            (center_x - half_size, center_y - half_size),
            (center_x + half_size, center_y - half_size),
            (center_x + half_size, center_y + half_size),
            (center_x - half_size, center_y + half_size),
        ]
    )


def _si_layer(features: list[tuple[object, object]], layer_type: str) -> gpd.GeoDataFrame:
    geoms = [geom for geom, _ in features]
    scores = [score for _, score in features]
    return gpd.GeoDataFrame(
        {SCORE_FIELD: scores, LAYER_TYPE_FIELD: layer_type},
        geometry=geoms,
        crs=METRIC_CRS,
    )


def _building(x: float, y: float, half_size: float = 2.0) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        {"building_id": [1]},
        geometry=[_box(x, y, half_size)],
        crs=METRIC_CRS,
    )


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (0.14, 0.1),
        (0.15, 0.2),
        (0.25, 0.3),
        (0.34, 0.3),
        (0.35, 0.4),
        (0.45, 0.5),
        (None, 0.0),
        (float("nan"), 0.0),
    ],
)
def test_round_building_summer_si_uses_half_up_ties(value, expected):
    assert round_building_summer_si(value) == pytest.approx(expected)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (0.0, 0),
        (0.10, 0),
        (0.10, 0),
        (0.20, 50),
        (0.40, 100),
        (0.85, 100),
        (None, 0),
        (float("nan"), 0),
    ],
)
def test_summer_si_to_subscore_tiers(value, expected):
    assert summer_si_to_subscore(value) == expected


@pytest.mark.parametrize(
    ("raw_value", "rounded_value", "expected_score"),
    [
        (0.153, 0.2, 50),
        (0.186, 0.2, 50),
        (0.197, 0.2, 50),
        (0.149, 0.1, 0),
        (0.15, 0.2, 50),
        (0.35, 0.4, 100),
        (0.36, 0.4, 100),
    ],
)
def test_building_summer_si_rounding_precedes_score_mapping(raw_value, rounded_value, expected_score):
    rounded = round_building_summer_si(raw_value)
    assert rounded == pytest.approx(rounded_value)
    assert summer_si_to_subscore(raw_value) == expected_score
    assert summer_si_to_subscore(rounded) == expected_score


@pytest.mark.parametrize(
    ("value", "expected_label"),
    [
        (0.09, "Severe lack"),
        (0.10, "Significant lack"),
        (0.20, "Needs improvement"),
        (0.40, "Good shade"),
        (0.60, "Excellent shade"),
    ],
)
def test_classify_summer_si_uses_official_bucket_labels(value, expected_label):
    assert classify_summer_si(value) == expected_label
    assert expected_label in [bucket["label"] for bucket in OFFICIAL_SI_INTERPRETATION_BUCKETS]


def test_attach_summer_si_uses_area_weighted_mean_not_highest_value():
    buildings = _building(0.0, 0.0)
    streets = _si_layer(
        [
            (_box(0.0, 0.0, 50.0), 0.10),
            (_box(120.0, 0.0, 5.0), 0.90),
        ],
        LAYER_STREET,
    )
    open_spaces = _si_layer([], LAYER_OPEN_SPACE)

    result = attach_summer_si_to_buildings(buildings, streets, open_spaces)

    expected = round_building_summer_si(
        ((100.0 * 100.0) * 0.10 + (10.0 * 10.0) * 0.90) / ((100.0 * 100.0) + (10.0 * 10.0))
    )
    assert result[BUILDING_SI_FIELD].iloc[0] == pytest.approx(expected)


def test_attach_summer_si_repairs_invalid_polygons_and_drops_non_area_geometries(caplog):
    buildings = _building(0.0, 0.0)
    invalid_bowtie = Polygon([(0.0, 0.0), (40.0, 40.0), (0.0, 40.0), (40.0, 0.0), (0.0, 0.0)])
    streets = gpd.GeoDataFrame(
        {SCORE_FIELD: [0.20, 0.90], LAYER_TYPE_FIELD: [LAYER_STREET, LAYER_STREET]},
        geometry=[invalid_bowtie, LineString([(0.0, 0.0), (20.0, 20.0)])],
        crs=METRIC_CRS,
    )
    open_spaces = _si_layer([], LAYER_OPEN_SPACE)

    caplog.set_level(logging.WARNING, logger="shade_si")
    result = attach_summer_si_to_buildings(buildings, streets, open_spaces)

    assert result[BUILDING_SI_FIELD].iloc[0] == pytest.approx(0.2)
    assert "repaired 1 invalid geometries" in caplog.text
    assert "dropped 1 empty/non-area geometries" in caplog.text


def test_sanitize_polygonal_finite_si_surfaces_returns_only_valid_polygonal_rows():
    invalid_bowtie = Polygon([(0.0, 0.0), (40.0, 40.0), (0.0, 40.0), (40.0, 0.0), (0.0, 0.0)])
    dirty = gpd.GeoDataFrame(
        {SCORE_FIELD: [0.20, float("nan"), 0.90], LAYER_TYPE_FIELD: [LAYER_STREET] * 3},
        geometry=[invalid_bowtie, _box(60.0, 0.0, 10.0), LineString([(0.0, 0.0), (20.0, 20.0)])],
        crs=METRIC_CRS,
    )

    sanitized = sanitize_polygonal_finite_si_surfaces(dirty)

    assert sanitized[SCORE_FIELD].tolist() == pytest.approx([0.20])
    assert len(sanitized) == 1
    geometry = sanitized.geometry.iloc[0]
    assert isinstance(geometry, BaseGeometry)
    assert geometry.geom_type in {"Polygon", "MultiPolygon"}
    assert geometry.is_valid
    assert geometry.area > 0


def test_preprocess_shade_sanitizes_prepared_layers_before_writing(tmp_path: Path):
    street_raw = tmp_path / "street.geojson"
    open_space_raw = tmp_path / "open_space.geojson"
    output_dir = tmp_path / "output"
    calibration_path = tmp_path / "shade_si_calibration.json"
    web_output_path = tmp_path / "shade_si.geojson"

    invalid_bowtie = Polygon([(0.0, 0.0), (40.0, 40.0), (0.0, 40.0), (40.0, 0.0), (0.0, 0.0)])
    gpd.GeoDataFrame(
        {SCORE_FIELD: [0.20, 0.90], LAYER_TYPE_FIELD: [LAYER_STREET, LAYER_STREET]},
        geometry=[invalid_bowtie, LineString([(0.0, 0.0), (20.0, 20.0)])],
        crs=METRIC_CRS,
    ).to_file(street_raw, driver="GeoJSON")
    gpd.GeoDataFrame(
        {SCORE_FIELD: [0.35], LAYER_TYPE_FIELD: [LAYER_OPEN_SPACE]},
        geometry=[_box(100.0, 100.0, 15.0)],
        crs=METRIC_CRS,
    ).to_file(open_space_raw, driver="GeoJSON")

    preprocess_shade(
        street_raw_path=street_raw,
        open_space_raw_path=open_space_raw,
        output_dir=output_dir,
        calibration_path=calibration_path,
        web_output_path=web_output_path,
    )

    prepared_streets = gpd.read_file(output_dir / "street_summer_si.geojson")
    prepared_open_spaces = gpd.read_file(output_dir / "open_space_summer_si.geojson")

    assert prepared_streets[SCORE_FIELD].tolist() == pytest.approx([0.20])
    assert prepared_streets.geometry.iloc[0].geom_type in {"Polygon", "MultiPolygon"}
    assert prepared_streets.geometry.iloc[0].is_valid
    assert prepared_open_spaces[SCORE_FIELD].tolist() == pytest.approx([0.35])
    assert web_output_path.is_file()


def test_attach_summer_si_ignores_polygons_outside_300m_centroid_buffer():
    buildings = _building(0.0, 0.0)
    streets = _si_layer(
        [
            (_box(0.0, 0.0, 20.0), 0.12),
            (_box(BUILDING_SHADE_RADIUS_M + 20.0, 0.0, 5.0), 0.95),
        ],
        LAYER_STREET,
    )
    open_spaces = _si_layer([], LAYER_OPEN_SPACE)

    result = attach_summer_si_to_buildings(buildings, streets, open_spaces)

    assert result[BUILDING_SI_FIELD].iloc[0] == pytest.approx(0.1)


def test_attach_summer_si_mixed_valid_and_invalid_scores_drop_non_finite_rows():
    buildings = _building(0.0, 0.0)
    streets = _si_layer(
        [
            (_box(0.0, 0.0, 20.0), 0.24),
            (_box(60.0, 0.0, 40.0), float("nan")),
        ],
        LAYER_STREET,
    )
    open_spaces = _si_layer([], LAYER_OPEN_SPACE)

    result = attach_summer_si_to_buildings(buildings, streets, open_spaces)

    assert result[BUILDING_SI_FIELD].iloc[0] == pytest.approx(0.2)


def test_attach_summer_si_all_non_area_geometries_return_zero_without_crashing():
    buildings = _building(0.0, 0.0)
    streets = gpd.GeoDataFrame(
        {SCORE_FIELD: [0.20, 0.45], LAYER_TYPE_FIELD: [LAYER_STREET, LAYER_STREET]},
        geometry=[LineString([(0.0, 0.0), (20.0, 20.0)]), Point(10.0, 10.0)],
        crs=METRIC_CRS,
    )
    open_spaces = _si_layer([], LAYER_OPEN_SPACE)

    result = attach_summer_si_to_buildings(buildings, streets, open_spaces)

    assert result[BUILDING_SI_FIELD].iloc[0] == pytest.approx(0.0)


def test_attach_summer_si_geometry_collection_scores_only_polygonal_surface():
    buildings = _building(0.0, 0.0)
    streets = _si_layer(
        [
            (
                GeometryCollection(
                    [
                        _box(0.0, 0.0, 20.0),
                        LineString([(0.0, 0.0), (200.0, 0.0)]),
                        Point(150.0, 0.0),
                    ]
                ),
                0.33,
            )
        ],
        LAYER_STREET,
    )
    open_spaces = _si_layer([], LAYER_OPEN_SPACE)

    result = attach_summer_si_to_buildings(buildings, streets, open_spaces)

    assert result[BUILDING_SI_FIELD].iloc[0] == pytest.approx(0.3)


def test_attach_summer_si_unions_overlapping_polygon_parts_within_one_source_feature():
    buildings = _building(0.0, 0.0)
    duplicate_low_score_surface = GeometryCollection(
        [
            _box(-60.0, 0.0, 10.0),
            _box(-60.0, 0.0, 10.0),
        ]
    )
    streets = _si_layer(
        [
            (duplicate_low_score_surface, 0.20),
            (_box(60.0, 0.0, 10.0), 0.80),
        ],
        LAYER_STREET,
    )
    open_spaces = _si_layer([], LAYER_OPEN_SPACE)

    result = attach_summer_si_to_buildings(buildings, streets, open_spaces)

    assert result[BUILDING_SI_FIELD].iloc[0] == pytest.approx(0.5)


def test_attach_summer_si_adjacent_6040_6041_style_buildings_weight_to_zero_tier():
    buildings = gpd.GeoDataFrame(
        {"building_id": [6040, 6041]},
        geometry=[_box(0.0, 0.0, 2.0), _box(15.0, 0.0, 2.0)],
        crs=METRIC_CRS,
    )
    streets = _si_layer([], LAYER_STREET)
    open_spaces = _si_layer(
        [
            (_box(0.0, 0.0, 50.0), 0.17),
            (_box(120.0, 0.0, 10.0), 0.45),
        ],
        LAYER_OPEN_SPACE,
    )

    result = attach_summer_si_to_buildings(buildings, streets, open_spaces)

    expected = round_building_summer_si(
        ((100.0 * 100.0) * 0.17 + (20.0 * 20.0) * 0.45) / ((100.0 * 100.0) + (20.0 * 20.0))
    )
    assert result[BUILDING_SI_FIELD].tolist() == pytest.approx([expected, expected])
    assert [summer_si_to_subscore(value) for value in result[BUILDING_SI_FIELD]] == [50, 50]


def test_attach_summer_si_preserves_non_contiguous_building_index_mapping():
    buildings = gpd.GeoDataFrame(
        {"building_id": [7101, 7109]},
        geometry=[_box(0.0, 0.0, 2.0), _box(800.0, 0.0, 2.0)],
        crs=METRIC_CRS,
        index=pd.Index([11, 29], name="building_row"),
    )
    streets = _si_layer(
        [
            (_box(20.0, 0.0), 0.17),
            (_box(820.0, 0.0), 0.41),
        ],
        LAYER_STREET,
    )
    open_spaces = _si_layer([], LAYER_OPEN_SPACE)

    result = attach_summer_si_to_buildings(buildings, streets, open_spaces)

    assert result.index.tolist() == [11, 29]
    assert result[BUILDING_SI_FIELD].to_dict() == pytest.approx({11: 0.2, 29: 0.4})


def test_attach_summer_si_beyond_300m_radius_is_zero():
    buildings = _building(0.0, 0.0)
    far = BUILDING_SHADE_RADIUS_M + 50.0
    streets = _si_layer([(_box(far, 0.0), 0.30)], LAYER_STREET)
    open_spaces = _si_layer([(_box(0.0, far), 0.40)], LAYER_OPEN_SPACE)

    result = attach_summer_si_to_buildings(buildings, streets, open_spaces)

    assert result[BUILDING_SI_FIELD].iloc[0] == pytest.approx(0.0)


def test_attach_summer_si_radius_contract_uses_300m_buffer():
    assert BUILDING_SHADE_RADIUS_M == 300.0

    buildings = _building(0.0, 0.0)
    streets = _si_layer(
        [
            (_box(299.0, 0.0, 0.5), 0.20),
            (_box(301.0, 0.0, 0.5), 0.90),
        ],
        LAYER_STREET,
    )
    open_spaces = _si_layer([], LAYER_OPEN_SPACE)

    result = attach_summer_si_to_buildings(buildings, streets, open_spaces)

    assert result[BUILDING_SI_FIELD].iloc[0] == pytest.approx(0.2)


def test_attach_summer_si_empty_buildings():
    buildings = gpd.GeoDataFrame(geometry=[], crs=METRIC_CRS)
    streets = _si_layer([(_box(0.0, 0.0), 0.15)], LAYER_STREET)
    open_spaces = _si_layer([(_box(0.0, 0.0), 0.15)], LAYER_OPEN_SPACE)

    result = attach_summer_si_to_buildings(buildings, streets, open_spaces)

    assert BUILDING_SI_FIELD in result.columns
    assert len(result) == 0


def test_lookup_summer_si_at_point_uses_area_weighted_mean():
    streets = _si_layer(
        [
            (_box(0.0, 0.0, 20.0), 0.10),
            (_box(80.0, 0.0, 10.0), 0.50),
        ],
        LAYER_STREET,
    )
    open_spaces = _si_layer([], LAYER_OPEN_SPACE)

    value = lookup_summer_si_at_point(Point(0.0, 0.0), streets, open_spaces)

    expected = ((40.0 * 40.0) * 0.10 + (20.0 * 20.0) * 0.50) / ((40.0 * 40.0) + (20.0 * 20.0))
    assert value == pytest.approx(expected)


def test_lookup_summer_si_at_point_miss_returns_zero():
    streets = _si_layer([(_box(BUILDING_SHADE_RADIUS_M + 100.0, 0.0), 0.30)], LAYER_STREET)
    open_spaces = _si_layer([], LAYER_OPEN_SPACE)

    value = lookup_summer_si_at_point(Point(0.0, 0.0), streets, open_spaces)

    assert value == pytest.approx(0.0)


def test_load_raw_si_layers_missing_file(tmp_path: Path):
    street = tmp_path / "street.geojson"
    open_space = tmp_path / "open_space.geojson"
    street.write_text('{"type":"FeatureCollection","features":[]}', encoding="utf-8")

    with pytest.raises(FileNotFoundError, match="Open-space"):
        load_raw_si_layers(street, open_space)


def test_load_raw_si_layers_missing_crs(tmp_path: Path, monkeypatch):
    street = tmp_path / "street.geojson"
    open_space = tmp_path / "open_space.geojson"
    street.write_text("{}", encoding="utf-8")
    open_space.write_text("{}", encoding="utf-8")

    no_crs = gpd.GeoDataFrame(
        {SCORE_FIELD: [0.15]},
        geometry=[_box(0.0, 0.0)],
        crs=None,
    )

    def _fake_read(_path):
        return no_crs.copy()

    monkeypatch.setattr(gpd, "read_file", _fake_read)

    with pytest.raises(ValueError, match="no CRS"):
        load_raw_si_layers(street, open_space)


def test_load_raw_si_layers_missing_score_field(tmp_path: Path):
    street = tmp_path / "street.geojson"
    open_space = tmp_path / "open_space.geojson"
    gdf = gpd.GeoDataFrame(
        {"other": [1.0]},
        geometry=[_box(0.0, 0.0)],
        crs="EPSG:4326",
    )
    gdf.to_file(street, driver="GeoJSON")
    gdf.to_file(open_space, driver="GeoJSON")

    with pytest.raises(ValueError, match=SCORE_FIELD):
        load_raw_si_layers(street, open_space)


def test_load_raw_si_layers_non_numeric_scores(tmp_path: Path):
    street = tmp_path / "street.geojson"
    open_space = tmp_path / "open_space.geojson"
    gdf = gpd.GeoDataFrame(
        {SCORE_FIELD: ["bad", "values"]},
        geometry=[_box(0.0, 0.0), _box(1.0, 1.0)],
        crs="EPSG:4326",
    )
    gdf.to_file(street, driver="GeoJSON")
    gdf.to_file(open_space, driver="GeoJSON")

    with pytest.raises(ValueError, match="no numeric"):
        load_raw_si_layers(street, open_space)


def test_load_raw_si_layers_reprojects_open_space_and_returns_epsg_2039(tmp_path: Path):
    street = tmp_path / "street.geojson"
    open_space = tmp_path / "open_space.geojson"

    street_gdf = gpd.GeoDataFrame(
        {SCORE_FIELD: [0.12]},
        geometry=[_box(34.8, 31.2, 0.001)],
        crs="EPSG:4326",
    )
    open_space_gdf = gpd.GeoDataFrame(
        {SCORE_FIELD: [0.18]},
        geometry=[_box(34.81, 31.21, 0.001)],
        crs="EPSG:4326",
    )
    street_gdf.to_file(street, driver="GeoJSON")
    open_space_gdf.to_file(open_space, driver="GeoJSON")

    streets, open_spaces = load_raw_si_layers(street, open_space)

    assert streets.crs.to_string() == METRIC_CRS
    assert open_spaces.crs.to_string() == METRIC_CRS
    assert streets[LAYER_TYPE_FIELD].iloc[0] == LAYER_STREET
    assert open_spaces[LAYER_TYPE_FIELD].iloc[0] == LAYER_OPEN_SPACE
    assert streets[SCORE_FIELD].iloc[0] == pytest.approx(0.12)
    assert open_spaces[SCORE_FIELD].iloc[0] == pytest.approx(0.18)


def test_load_prepared_si_layers_delegates_to_raw_loader(tmp_path: Path):
    street = tmp_path / "street.geojson"
    open_space = tmp_path / "open_space.geojson"

    gdf = gpd.GeoDataFrame(
        {SCORE_FIELD: [0.20]},
        geometry=[_box(1000.0, 1000.0)],
        crs=METRIC_CRS,
    )
    gdf.to_file(street, driver="GeoJSON")
    gdf.to_file(open_space, driver="GeoJSON")

    streets, open_spaces = load_prepared_si_layers(street, open_space)

    assert len(streets) == 1
    assert len(open_spaces) == 1


def test_load_raw_si_layers_coerces_numeric_strings(tmp_path: Path):
    street = tmp_path / "street.geojson"
    open_space = tmp_path / "open_space.geojson"

    gdf = gpd.GeoDataFrame(
        {SCORE_FIELD: ["0.15"]},
        geometry=[_box(1000.0, 1000.0)],
        crs=METRIC_CRS,
    )
    gdf.to_file(street, driver="GeoJSON")
    gdf.to_file(open_space, driver="GeoJSON")

    streets, _ = load_raw_si_layers(street, open_space)

    assert streets[SCORE_FIELD].iloc[0] == pytest.approx(0.15)
