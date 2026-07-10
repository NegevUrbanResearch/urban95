"""Integration tests for ArcGIS shade SI scoring in urban95_weights and preprocessing."""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import pytest
from shapely.geometry import Point, Polygon

from lib.shade_si import (
    BUILDING_SI_FIELD,
    LAYER_OPEN_SPACE,
    LAYER_STREET,
    LAYER_TYPE_FIELD,
    METRIC_CRS,
    SCORE_FIELD,
    lookup_summer_si_at_point,
    round_building_summer_si,
    summer_si_to_subscore,
)
from lib.urban95_weights import calc_environmental_quality
from stages.urban95_scoring import append_weighted_urban95_scores

def _box(center_x: float, center_y: float, half_size: float = 5.0) -> Polygon:
    return Polygon(
        [
            (center_x - half_size, center_y - half_size),
            (center_x + half_size, center_y - half_size),
            (center_x + half_size, center_y + half_size),
            (center_x - half_size, center_y + half_size),
        ]
    )


def _write_si_layers(tmp_path: Path, street_score: float, open_space_score: float) -> Path:
    shade_dir = tmp_path / "shade_si"
    shade_dir.mkdir(parents=True, exist_ok=True)
    for filename, score, layer_type in (
        ("street_summer_si.geojson", street_score, LAYER_STREET),
        ("open_space_summer_si.geojson", open_space_score, LAYER_OPEN_SPACE),
    ):
        gdf = gpd.GeoDataFrame(
            {SCORE_FIELD: [score], LAYER_TYPE_FIELD: [layer_type]},
            geometry=[_box(100.0, 100.0)],
            crs=METRIC_CRS,
        )
        gdf.to_file(shade_dir / filename, driver="GeoJSON")
    return shade_dir


def _building_at(x: float, y: float) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        {"building_id": [0]},
        geometry=[_box(x, y, 2.0)],
        crs=METRIC_CRS,
    )


@pytest.mark.parametrize(
    ("summer_si", "expected_rounded_si", "expected_shade"),
    [
        (0.149, 0.1, 0.0),
        (0.15, 0.2, 50.0),
        (0.153, 0.2, 50.0),
        (0.186, 0.2, 50.0),
        (0.197, 0.2, 50.0),
        (0.35, 0.4, 100.0),
        (0.36, 0.4, 100.0),
        (None, 0.0, 0.0),
    ],
)
def test_calc_environmental_quality_maps_precomputed_si_to_shade_tiers(
    summer_si, expected_rounded_si, expected_shade
):
    score, details = calc_environmental_quality(
        Point(0.0, 0.0),
        {},
        include_details=True,
        precomputed_summer_si=summer_si,
    )
    baseline_score, _ = calc_environmental_quality(
        Point(0.0, 0.0),
        {},
        include_details=True,
        precomputed_summer_si=None,
    )

    assert details["shade"] == pytest.approx(expected_shade)
    assert details["summer_si"] == pytest.approx(expected_rounded_si)
    assert score - baseline_score == pytest.approx((expected_shade / 100.0) * 0.4 * 100)


def test_append_weighted_urban95_scores_preserves_and_exports_summer_si(tmp_path: Path):
    shade_dir = _write_si_layers(tmp_path, street_score=0.12, open_space_score=0.25)
    buildings = _building_at(100.0, 100.0)

    result = append_weighted_urban95_scores(
        buildings,
        shade_si_dir=shade_dir,
        workers=1,
    )

    assert BUILDING_SI_FIELD in result.columns
    assert result[BUILDING_SI_FIELD].iloc[0] == pytest.approx(round_building_summer_si((0.12 + 0.25) / 2.0))
    for minutes in (5, 10, 15):
        col = f"score_weighted_sub_environmental_quality_shade_{minutes}min"
        assert col in result.columns
        assert result[col].iloc[0] == pytest.approx(
            float(summer_si_to_subscore((0.12 + 0.25) / 2.0))
        )


def test_shade_subscore_columns_match_summer_si_to_subscore(tmp_path: Path):
    shade_dir = _write_si_layers(tmp_path, street_score=0.08, open_space_score=0.21)
    buildings = _building_at(100.0, 100.0)

    result = append_weighted_urban95_scores(
        buildings,
        shade_si_dir=shade_dir,
        workers=1,
    )

    expected = float(summer_si_to_subscore(result[BUILDING_SI_FIELD].iloc[0]))
    for minutes in (5, 10, 15):
        col = f"score_weighted_sub_environmental_quality_shade_{minutes}min"
        assert result[col].iloc[0] == pytest.approx(expected)


def test_production_scoring_does_not_call_per_point_lookup(tmp_path: Path, monkeypatch):
    shade_dir = _write_si_layers(tmp_path, street_score=0.18, open_space_score=0.09)
    buildings = _building_at(100.0, 100.0)

    def _forbidden_lookup(*_args, **_kwargs):
        raise AssertionError("lookup_summer_si_at_point must not run in production scoring")

    monkeypatch.setattr(
        "lib.shade_si.lookup_summer_si_at_point",
        _forbidden_lookup,
    )

    result = append_weighted_urban95_scores(
        buildings,
        shade_si_dir=shade_dir,
        workers=1,
    )

    assert result[BUILDING_SI_FIELD].iloc[0] == pytest.approx(round_building_summer_si((0.18 + 0.09) / 2.0))
    assert result["score_weighted_sub_environmental_quality_shade_5min"].iloc[0] == pytest.approx(0.0)


def test_lookup_helper_still_available_for_interactive_use():
    streets = gpd.GeoDataFrame(
        {SCORE_FIELD: [0.22], LAYER_TYPE_FIELD: [LAYER_STREET]},
        geometry=[_box(50.0, 50.0)],
        crs=METRIC_CRS,
    )
    open_spaces = gpd.GeoDataFrame(
        {SCORE_FIELD: [0.11], LAYER_TYPE_FIELD: [LAYER_OPEN_SPACE]},
        geometry=[_box(50.0, 50.0)],
        crs=METRIC_CRS,
    )

    value = lookup_summer_si_at_point(Point(50.0, 50.0), streets, open_spaces)

    assert value == pytest.approx((0.22 + 0.11) / 2.0)
