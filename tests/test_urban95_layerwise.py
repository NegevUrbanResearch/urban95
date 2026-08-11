from __future__ import annotations

import copy
import logging
import math
from contextlib import contextmanager

import geopandas as gpd
import numpy as np
import pandas as pd
import pytest
from shapely.geometry import LineString, Point, Polygon, box

from lib.urban95_layerwise import (
    PreparedUrban95Layers,
    prepare_urban95_layers,
    score_discrete_components,
    score_shade_overlay,
    score_streetlight_overlay,
    score_urban95_layerwise,
)
from lib.shade_si import prepare_shade_overlay
from lib.urban95_weights import (
    calc_environmental_quality,
    calc_family_services,
    calc_nature,
    calc_play,
    calc_safety_and_mobility,
    calculate_master_index,
)
from lib.urban95_status import STATUS_HIERARCHY, SourceAvailability


def _gdf(geometries, **columns):
    return gpd.GeoDataFrame(columns, geometry=list(geometries), crs="EPSG:2039")


def _scalar_discrete(buildings, layers):
    out = []
    for building in buildings.geometry:
        _, env = calc_environmental_quality(building, layers, include_details=True, precomputed_summer_si=0.0)
        _, nature = calc_nature(building, layers, include_details=True)
        _, play = calc_play(building, layers, include_details=True)
        _, safety = calc_safety_and_mobility(building, layers, include_details=True)
        _, family = calc_family_services(building, layers, include_details=True)
        out.append(
            {
                "trees": env["trees"],
                "roads": env["roads"],
                "parks": nature["parks"],
                "urban_nature_areas": nature["urban_nature_areas"],
                "playgrounds": play["playgrounds"],
                "bicycle_access": safety["bicycle_access"],
                "bus_stops": safety["bus_stops"],
                "shelters": safety["shelters"],
                "education": family["education"],
                "community": family["community"],
                "business": family["business"],
                "health": family["health"],
            }
        )
    return pd.DataFrame(out, index=buildings.index)


@pytest.fixture
def scoring_fixture():
    buildings = _gdf([Point(0, 0), Point(100, 0), Point(400, 0)])
    layers = {
        "trees": _gdf([Point(0, 0), Point(1, 0), Point(2, 0)]),
        "roads": _gdf(
            [LineString([(0, -1), (0, 1)]), LineString([(200, -1), (200, 1)])],
            maxspeed=["60", "not-a-speed"],
        ),
        "parks": _gdf([box(-50, -50, 50, 50), box(300, -1, 302, 1)]),
        "urban_nature_areas": _gdf([box(-1, -1, 1, 1)]),
        "playgrounds": _gdf([Point(300, 0)], amenity_type=["playgrounds"]),
        "bikes": _gdf([Point(0, 300)], amenity_type=[" BICYCLE_TRACK "]),
        "bus_stops": _gdf([Point(0, 0), Point(1, 0)]),
        "shelters": _gdf([Point(0, 50)], amenity_type=["shelters"]),
        "education": _gdf(
            [Point(150, 0)],
            amenity_type=["education"],
            amenity_subtype=["school"],
        ),
        "community": _gdf([Point(300, 0)], amenity_type=["community-centers"]),
        "business": _gdf([Point(0, 300)], amenity_type=["businesscenters"]),
        "health": _gdf(
            [Point(100, 100)],
            amenity_type=["health"],
            amenity_subtype=["clinic"],
        ),
    }
    return buildings, layers


@pytest.mark.parametrize("chunk_size", [1, 3, 64])
def test_layerwise_discrete_components_match_scalar(chunk_size, scoring_fixture):
    buildings, layers = scoring_fixture
    expected = _scalar_discrete(buildings, layers)
    prepared = prepare_urban95_layers(**layers)
    actual = score_discrete_components(buildings, prepared, chunk_size=chunk_size)
    pd.testing.assert_frame_equal(actual[expected.columns], expected, check_dtype=False)
    assert actual["school"].tolist() == [100.0, 100.0, 50.0]
    assert actual["kindergarten"].tolist() == [0.0, 0.0, 0.0]
    assert actual["clinic"].tolist() == [100.0, 100.0, 0.0]
    assert actual["tipat_halav"].tolist() == [0.0, 0.0, 0.0]


def test_child_access_diagnostics_preserve_parent_education_and_health_scores():
    buildings = _gdf(
        [
            box(100, 0, 110, 10),
            box(250, 0, 260, 10),
            box(400, 0, 410, 10),
            box(900, 0, 910, 10),
            box(740, 0, 750, 10),
            box(600, 0, 610, 10),
        ]
    )
    layers = {
        "education": _gdf(
            [Point(0, 5), Point(1000, 5)],
            amenity_type=["education", "education"],
            amenity_subtype=["school", "kindergarten"],
        ),
        "health": _gdf(
            [Point(0, 5), Point(1000, 5)],
            amenity_type=["health", "health"],
            amenity_subtype=["clinic", "tipat_halav"],
        ),
    }

    prepared = prepare_urban95_layers(**layers)
    discrete = score_discrete_components(buildings, prepared, chunk_size=2)
    result = score_urban95_layerwise(buildings, prepared, None, None, chunk_size=2)

    assert discrete["school"].tolist() == [100, 50, 0, 0, 0, 0]
    assert discrete["kindergarten"].tolist() == [0, 0, 0, 100, 50, 0]
    assert discrete["clinic"].tolist() == [100, 100, 0, 0, 0, 0]
    assert discrete["tipat_halav"].tolist() == [0, 0, 0, 100, 100, 0]

    assert result["u95_status_detail_family_services_education_school_10min"].tolist() == [
        "thriving", "functioning", "disappointing", "disappointing", "disappointing", "disappointing"
    ]
    assert result["u95_status_detail_family_services_education_kindergarten_10min"].tolist() == [
        "disappointing", "disappointing", "disappointing", "thriving", "functioning", "disappointing"
    ]
    assert result["u95_status_detail_family_services_health_clinic_10min"].tolist() == [
        "thriving", "thriving", "disappointing", "disappointing", "disappointing", "disappointing"
    ]
    assert result["u95_status_detail_family_services_health_tipat_halav_10min"].tolist() == [
        "disappointing", "disappointing", "disappointing", "thriving", "thriving", "disappointing"
    ]

    # Parent score still uses the complete union.
    assert result["u95_status_sub_family_services_education_10min"].tolist() == [
        "thriving", "functioning", "disappointing", "thriving", "functioning", "disappointing"
    ]
    assert result["u95_status_sub_family_services_health_10min"].tolist() == [
        "thriving", "thriving", "disappointing", "thriving", "thriving", "disappointing"
    ]


def test_diagnostic_subtypes_cannot_change_parent_category_or_overview(scoring_fixture):
    buildings, layers = scoring_fixture
    first = dict(layers)
    second = dict(layers)
    second["education"] = layers["education"].assign(amenity_subtype="kindergarten")
    second["health"] = layers["health"].assign(amenity_subtype="tipat_halav")
    shade = prepare_shade_overlay(_shade_gdf([box(-500, -500, 500, 500)], [0.4]), None)
    lights = _gdf([Point(0, 0)])

    first_result = score_urban95_layerwise(
        buildings,
        prepare_urban95_layers(**first),
        shade,
        lights,
        chunk_size=2,
    )
    second_result = score_urban95_layerwise(
        buildings,
        prepare_urban95_layers(**second),
        shade,
        lights,
        chunk_size=2,
    )

    for field in (
        "u95_status_sub_family_services_education_10min",
        "u95_status_sub_family_services_health_10min",
        "u95_status_family_services_10min",
        "u95_status_10min",
    ):
        assert first_result[field].tolist() == second_result[field].tolist()
    assert (
        first_result["u95_status_detail_family_services_education_school_10min"].tolist()
        != second_result["u95_status_detail_family_services_education_school_10min"].tolist()
    )


def test_near_edge_tree_buffer_counts_trees_outside_centroid_radius():
    """A tree near the facade but >20 m from the centroid must still score."""
    # 60 x 60 m footprint centered at origin; edge is 30 m from centroid.
    building = box(-30, -30, 30, 30)
    buildings = _gdf([building])
    # 15 m outside the east edge => 45 m from centroid, 15 m from footprint.
    trees = _gdf([Point(45, 0), Point(46, 0), Point(47, 0)])
    layers = {"trees": trees}
    prepared = prepare_urban95_layers(**layers)

    expected = _scalar_discrete(buildings, layers)
    actual = score_discrete_components(buildings, prepared, chunk_size=1)

    assert float(expected.loc[0, "trees"]) == 100.0
    assert actual.loc[0, "trees"] == expected.loc[0, "trees"]
    # Centroid-only semantics would have missed these trees.
    _, centroid_details = calc_environmental_quality(
        building.centroid,
        layers,
        include_details=True,
        precomputed_summer_si=0.0,
    )
    assert centroid_details["trees"] == 0.0


def test_prepare_sanitizes_normalizes_resets_indexes_and_does_not_mutate_inputs():
    roads = _gdf(
        [None, Point(), Point(0, 0), Point(1, 0)],
        max_speed=[60, 60, 40, 80],
    )
    bikes = _gdf([Point(0, 0), Point(1, 0)], amenity_type=[" BICYCLE_TRACK ", "other"])
    before_roads = copy.deepcopy(roads)
    before_bikes = copy.deepcopy(bikes)
    prepared = prepare_urban95_layers(roads=roads, bikes=bikes)
    assert isinstance(prepared, PreparedUrban95Layers)
    assert prepared.fast_roads.index.tolist() == [0]
    assert len(prepared.fast_roads) == 1
    assert len(prepared.bikes) == 1
    assert prepared.bikes.index.tolist() == [0]
    pd.testing.assert_frame_equal(roads, before_roads)
    pd.testing.assert_frame_equal(bikes, before_bikes)


@pytest.mark.parametrize(
    "layer_name",
    ["playgrounds", "bikes", "shelters", "education", "community", "business", "health"],
)
def test_typed_amenity_without_type_column_resolves_to_empty(layer_name):
    prepared = prepare_urban95_layers(**{layer_name: _gdf([Point(0, 0)])})
    prepared_name = "bikes" if layer_name == "bikes" else layer_name
    assert getattr(prepared, prepared_name).empty


def test_duplicate_invalid_and_post_sanitation_empty_sources_preserve_scalar_semantics():
    bowtie = Polygon([(0, 0), (2, 2), (0, 2), (2, 0), (0, 0)])
    layers = {
        "trees": _gdf([None, Point(), Point(0, 0), Point(0, 0)]),
        "parks": _gdf([bowtie]),
        "bus_stops": _gdf([Point(0, 0), Point(0, 0), Point(0, 0)]),
    }
    prepared = prepare_urban95_layers(**layers)
    assert prepared.parks.geometry.is_valid.all()
    actual = score_discrete_components(_gdf([Point(0, 0)], marker=[1]), prepared, chunk_size=1)
    assert actual.loc[0, "trees"] == 50.0
    assert actual.loc[0, "parks"] == 50.0
    assert actual.loc[0, "bus_stops"] == 100.0


def test_null_only_sources_keep_defaults_and_output_contract():
    buildings = gpd.GeoDataFrame(
        {"marker": [1, 2]},
        geometry=[Point(0, 0), Point(10, 0)],
        index=[7, 9],
        crs="EPSG:2039",
    )
    actual = score_discrete_components(
        buildings,
        prepare_urban95_layers(trees=_gdf([None, Point()])),
        chunk_size=1,
    )
    assert actual.index.tolist() == [7, 9]
    assert actual.columns.tolist() == [
        "trees", "roads", "parks", "urban_nature_areas", "playgrounds",
        "bicycle_access", "bus_stops", "shelters", "education", "community",
        "business", "health", "school", "kindergarten", "clinic", "tipat_halav",
    ]
    assert actual.dtypes.tolist() == [pd.api.types.pandas_dtype("float64")] * 16
    assert actual["trees"].tolist() == [0.0, 0.0]
    assert actual["roads"].isna().all()
    assert actual[["school", "kindergarten", "clinic", "tipat_halav"]].isna().all().all()


def test_discrete_boundaries_and_defaults_are_exact():
    buildings = _gdf([Point(0, 0), Point(100, 0), Point(300, 0), Point(301, 0)])
    layers = {
        "trees": _gdf([Point(20, 0)]),
        "roads": _gdf([LineString([(0, -1), (0, 1)])], maxspeed=[51]),
        "parks": _gdf([box(0, 0, 50, 60)]),
        "education": _gdf([Point(150, 0)], amenity_type=["education"]),
    }
    actual = score_discrete_components(buildings, prepare_urban95_layers(**layers), chunk_size=2)
    assert actual.loc[0, "trees"] == 50
    assert actual.loc[0, "roads"] == 0
    assert actual.loc[1, "roads"] == 0
    assert actual.loc[2, "roads"] == 50
    assert actual.loc[3, "roads"] == 100
    assert actual.loc[0, "parks"] == 100
    assert actual.loc[0, "education"] == 100
    assert actual.loc[2, "education"] == 100
    assert actual.loc[3, "education"] == 50


@pytest.mark.parametrize(
    ("radius", "expected"),
    [(299.8, 50.0), (300.2, 100.0)],
)
def test_fast_road_angular_candidate_envelope_is_complete(radius, expected):
    angle = math.pi / 64.0
    road_point = Point(radius * math.cos(angle), radius * math.sin(angle))
    roads = _gdf([road_point], maxspeed=[60])
    actual = score_discrete_components(
        _gdf([Point(0, 0)]),
        prepare_urban95_layers(roads=roads),
        chunk_size=1,
    )
    assert actual.loc[0, "roads"] == expected


def test_discrete_scorer_constructs_only_task3_buffers(monkeypatch):
    from lib import urban95_layerwise

    distances = []
    original = urban95_layerwise._buffer

    def recording_buffer(points, distance):
        distances.append(distance)
        return original(points, distance)

    monkeypatch.setattr(urban95_layerwise, "_buffer", recording_buffer)
    score_discrete_components(
        _gdf([Point(0, 0)]),
        prepare_urban95_layers(),
        chunk_size=1,
    )
    assert distances == []

    valid_empty = _gdf([])
    valid_empty_amenities = _gdf([], amenity_type=[])
    score_discrete_components(
        _gdf([Point(0, 0)]),
        prepare_urban95_layers(
            trees=valid_empty,
            roads=_gdf([], maxspeed=[]),
            parks=valid_empty,
            urban_nature_areas=valid_empty,
            playgrounds=valid_empty_amenities,
            bikes=valid_empty_amenities,
            bus_stops=valid_empty,
            shelters=valid_empty_amenities,
            education=valid_empty_amenities,
            community=valid_empty_amenities,
            business=valid_empty_amenities,
            health=valid_empty_amenities,
        ),
        chunk_size=1,
    )
    assert sorted(distances) == [20, 50, 300]


def test_pairs_passes_the_requested_chunk_size(monkeypatch):
    from lib import urban95_layerwise

    seen = []

    def fake_pairs(query, source, predicate, chunk_size):
        seen.append(chunk_size)
        yield (
            pd.array([], dtype="int64").to_numpy(),
            pd.array([], dtype="int64").to_numpy(),
        )

    monkeypatch.setattr(urban95_layerwise, "iter_query_pairs", fake_pairs)
    urban95_layerwise._pairs(
        gpd.GeoSeries([Point(0, 0), Point(1, 0), Point(2, 0)], crs="EPSG:2039"),
        _gdf([Point(0, 0)]),
        chunk_size=1,
    )
    assert seen == [1]


def test_extracted_streetlight_subscore_preserves_scalar_behavior():
    from lib.urban95_weights import calc_streetlight_subscore

    lights = _gdf([Point(0, 0), Point(0, 0)])
    point = Point(0, 0)
    _, details = calc_safety_and_mobility(
        point,
        {"street_lights": lights},
        include_details=True,
    )
    assert calc_streetlight_subscore(point, lights) == details["street_lights"]


def test_stage_uses_one_layerwise_score_call_without_scalar_overlay_helpers(monkeypatch):
    from stages import urban95_scoring

    buildings = _gdf([Point(0, 0)])
    layers = {
        "trees": _gdf([Point(0, 0)]),
        "roads": _gdf([], maxspeed=[]),
        "parks": _gdf([]),
        "urban_nature_areas": _gdf([]),
        "playgrounds": _gdf([]),
        "bikes": _gdf([]),
        "bus_stops": _gdf([]),
        "shelters": _gdf([]),
        "education": _gdf([]),
        "community": _gdf([]),
        "business": _gdf([]),
        "health": _gdf([]),
        "street_lights": _gdf([]),
        "shade_streets": None,
        "shade_open_spaces": None,
    }
    monkeypatch.setattr(urban95_scoring, "build_layers", lambda **_: layers)

    monkeypatch.setattr(
        "lib.urban95_weights.calc_environmental_quality",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("full environmental scorer should not run")),
    )
    monkeypatch.setattr(
        "lib.urban95_weights.calc_safety_and_mobility",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("full safety scorer should not run")),
    )
    result = urban95_scoring.append_urban95_statuses(buildings, workers=1)
    assert result.loc[0, "u95_status_sub_environmental_quality_trees_5min"] == "functioning"
    assert result.loc[0, "u95_status_sub_environmental_quality_shade_5min"] == "unknown"


def _shade_gdf(geometries, scores):
    return _gdf(geometries, summer_SI=scores)


def test_shade_overlay_preserves_scalar_overlap_order_and_half_up_ties():
    buildings = _gdf([Point(0, 0), Point(2000, 0)])
    streets = _shade_gdf(
        [box(-500, -500, 500, 500), box(1500, -500, 2500, 500)],
        [0.15, 0.35],
    )
    prepared = prepare_shade_overlay(streets, None)
    actual = score_shade_overlay(buildings, prepared, chunk_size=1)
    assert actual.tolist() == [0.2, 0.4]


def test_shade_overlay_drops_null_invalid_and_empty_rows():
    bowtie = Polygon([(0, 0), (200, 200), (0, 200), (200, 0), (0, 0)])
    buildings = _gdf([Point(0, 0)])
    raw = _shade_gdf([None, Point(), bowtie, box(-500, -500, 500, 500)], [0.8, 0.9, 0.2, 0.4])
    prepared = prepare_shade_overlay(raw, None)
    actual = score_shade_overlay(buildings, prepared, chunk_size=8)
    expected = round(float(prepare_shade_overlay(raw, None).iloc[-1].summer_SI), 1)
    assert actual.iloc[0] == pytest.approx(expected)


def test_streetlight_overlay_candidate_order_fallback_matches_scalar():
    from lib.urban95_weights import calc_streetlight_subscore

    buildings = _gdf([Point(0, 0), Point(100, 0)])
    lights = _gdf([Point(0, 0), Point(40, 0), Point(100, 0)])
    expected = pd.Series(
        [calc_streetlight_subscore(point, lights) for point in buildings.geometry],
        index=buildings.index,
        dtype=float,
    )
    actual = score_streetlight_overlay(buildings, lights, chunk_size=1)
    pd.testing.assert_series_equal(actual, expected)


def test_streetlight_subscore_mapping_includes_exact_30_and_50_boundaries():
    from lib.urban95_layerwise import _streetlight_percent_to_subscore

    assert _streetlight_percent_to_subscore(29.999999) == 0.0
    assert _streetlight_percent_to_subscore(30.0) == 50.0
    assert _streetlight_percent_to_subscore(50.0) == 50.0
    assert _streetlight_percent_to_subscore(50.000001) == 100.0


def test_full_layerwise_score_has_current_columns_and_preserves_index(scoring_fixture):
    buildings, layers = scoring_fixture
    prepared_discrete = prepare_urban95_layers(**layers)
    shade = prepare_shade_overlay(_shade_gdf([box(-500, -500, 500, 500)], [0.4]), None)
    result = score_urban95_layerwise(
        buildings,
        prepared_discrete,
        shade,
        _gdf([Point(0, 0)]),
        chunk_size=2,
    )
    assert result.index.tolist() == buildings.index.tolist()
    assert result.columns[0] == "summer_si"
    assert "u95_status_5min" in result.columns
    assert "u95_status_sub_safety_mobility_street_lights_15min" in result.columns
    assert not any(column.startswith("score_weighted") for column in result.columns)
    scalar_layers = dict(layers, street_lights=_gdf([Point(0, 0)]))
    for position, point in enumerate(buildings.geometry):
        scalar = calculate_master_index(
            float(point.x),
            float(point.y),
            scalar_layers,
            precomputed={"summer_si": float(result.iloc[position]["summer_si"])},
        )
        for minutes in (5, 10, 15):
            suffix = f"_{minutes}min"
            assert result.iloc[position][f"u95_status{suffix}"] == scalar["overview_status"]
            for category_stem in STATUS_HIERARCHY:
                assert result.iloc[position][f"u95_status_{category_stem}{suffix}"] == scalar["category_statuses"][category_stem]
                for indicator in STATUS_HIERARCHY[category_stem]:
                    column = f"u95_status_sub_{category_stem}_{indicator}{suffix}"
                    assert result.iloc[position][column] == scalar["subcategory_statuses"][category_stem][indicator]


def test_unavailable_roads_are_unknown_but_valid_empty_roads_are_thriving():
    buildings = _gdf([Point(0, 0)])
    unavailable = prepare_urban95_layers(roads=None)
    valid_empty = prepare_urban95_layers(roads=_gdf([], maxspeed=[]))

    unavailable_result = score_urban95_layerwise(buildings, unavailable, _shade_gdf([], []), _gdf([]), chunk_size=1)
    available_result = score_urban95_layerwise(buildings, valid_empty, _shade_gdf([], []), _gdf([]), chunk_size=1)

    assert unavailable_result.loc[0, "u95_status_sub_environmental_quality_roads_10min"] == "unknown"
    assert available_result.loc[0, "u95_status_sub_environmental_quality_roads_10min"] == "thriving"
    assert unavailable_result.loc[0, "u95_status_environmental_quality_10min"] == "unknown"


def test_layerwise_malformed_source_without_active_geometry_is_unknown_with_scalar_parity(
    scoring_fixture,
):
    buildings, layers = scoring_fixture
    malformed_parks = gpd.GeoDataFrame({"not_geometry": ["broken"]})
    layers = dict(layers, parks=malformed_parks)

    prepared = prepare_urban95_layers(**layers)
    shade = prepare_shade_overlay(_shade_gdf([box(-500, -500, 500, 500)], [0.4]), None)
    lights = _gdf([Point(0, 0)])
    result = score_urban95_layerwise(buildings, prepared, shade, lights, chunk_size=3)

    assert prepared.source_availability["parks"] == SourceAvailability(False, "schema_invalid")
    assert result["u95_status_sub_nature_parks_10min"].eq("unknown").all()
    assert not result["u95_status_play_10min"].eq("unknown").any()
    scalar_layers = dict(layers, street_lights=lights)
    for position, building in enumerate(buildings.geometry):
        scalar = calculate_master_index(
            float(building.x),
            float(building.y),
            scalar_layers,
            precomputed={"summer_si": 0.4},
        )
        assert result.iloc[position]["u95_status_10min"] == scalar["overview_status"]
        for category, children in STATUS_HIERARCHY.items():
            assert (
                result.iloc[position][f"u95_status_{category}_10min"]
                == scalar["category_statuses"][category]
            )
            for indicator in children:
                assert (
                    result.iloc[position][f"u95_status_sub_{category}_{indicator}_10min"]
                    == scalar["subcategory_statuses"][category][indicator]
                )


def test_malformed_roads_without_speed_schema_are_unknown_with_scalar_parity(scoring_fixture):
    buildings, layers = scoring_fixture
    malformed_roads = _gdf([LineString([(0, -10), (0, 10)])])
    layers = dict(layers, roads=malformed_roads)

    prepared = prepare_urban95_layers(**layers)
    shade = prepare_shade_overlay(_shade_gdf([box(-500, -500, 500, 500)], [0.4]), None)
    lights = _gdf([Point(0, 0)])
    result = score_urban95_layerwise(buildings, prepared, shade, lights, chunk_size=3)

    assert prepared.source_availability["roads"] == SourceAvailability(False, "schema_invalid")
    assert result["u95_status_sub_environmental_quality_roads_10min"].eq("unknown").all()
    assert result["u95_status_environmental_quality_10min"].eq("unknown").all()
    assert not result["u95_status_nature_10min"].eq("unknown").any()
    scalar_layers = dict(layers, street_lights=lights)
    for position, building in enumerate(buildings.geometry):
        scalar = calculate_master_index(
            float(building.x),
            float(building.y),
            scalar_layers,
            precomputed={"summer_si": 0.4},
        )
        assert scalar["subcategory_statuses"]["environmental_quality"]["roads"] == "unknown"
        assert result.iloc[position]["u95_status_10min"] == scalar["overview_status"]
        for category, children in STATUS_HIERARCHY.items():
            assert (
                result.iloc[position][f"u95_status_{category}_10min"]
                == scalar["category_statuses"][category]
            )
            for indicator in children:
                assert (
                    result.iloc[position][f"u95_status_sub_{category}_{indicator}_10min"]
                    == scalar["subcategory_statuses"][category][indicator]
                )


@pytest.mark.parametrize("reason", ["missing", "unreadable", "schema_invalid"])
def test_unavailable_source_reasons_all_produce_unknown(reason):
    buildings = _gdf([Point(0, 0)])
    prepared = prepare_urban95_layers(
        roads=_gdf([], maxspeed=[]),
        source_availability={"roads": SourceAvailability(False, reason)},
    )

    result = score_urban95_layerwise(buildings, prepared, _shade_gdf([], []), _gdf([]), chunk_size=1)

    assert result.loc[0, "u95_status_sub_environmental_quality_roads_10min"] == "unknown"


def test_valid_parent_with_absent_subtype_applies_normal_rule():
    buildings = _gdf([Point(0, 0)])
    parent = _gdf([Point(1000, 0)], amenity_type=["education"], amenity_subtype=["school"])
    prepared = prepare_urban95_layers(education=parent)

    result = score_urban95_layerwise(buildings, prepared, _shade_gdf([], []), _gdf([]), chunk_size=1)

    assert result.loc[0, "u95_status_detail_family_services_education_kindergarten_10min"] == "disappointing"


def test_indicator_failure_is_unknown_without_corrupting_unaffected_categories(monkeypatch, scoring_fixture):
    from lib import urban95_layerwise

    buildings, layers = scoring_fixture
    prepared = prepare_urban95_layers(**layers)
    monkeypatch.setattr(
        urban95_layerwise,
        "score_shade_overlay",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("shade failed")),
    )

    result = score_urban95_layerwise(buildings, prepared, _shade_gdf([], []), _gdf([]), chunk_size=1)

    assert result["u95_status_sub_environmental_quality_shade_10min"].eq("unknown").all()
    assert result["u95_status_environmental_quality_10min"].eq("unknown").all()
    assert result["u95_status_10min"].eq("unknown").all()
    assert not result["u95_status_nature_10min"].eq("unknown").any()


def test_layerwise_parks_failure_isolated_by_indicator_and_building(monkeypatch, scoring_fixture):
    from lib import urban95_layerwise
    from lib import urban95_weights

    buildings, layers = scoring_fixture
    prepared = prepare_urban95_layers(**layers)
    shade = prepare_shade_overlay(_shade_gdf([box(-500, -500, 500, 500)], [0.4]), None)
    lights = _gdf([Point(0, 0)])
    original = urban95_layerwise._pairs

    def fail_middle_park(query, source, chunk_size):
        if "_source_area_m2" in source.columns:
            if len(query) > 1:
                raise RuntimeError("parks batch failed")
            if query.iloc[0].centroid.x == pytest.approx(100.0):
                raise RuntimeError("parks building failed")
        return original(query, source, chunk_size)

    monkeypatch.setattr(urban95_layerwise, "_pairs", fail_middle_park)
    result = score_urban95_layerwise(
        buildings,
        prepared,
        shade,
        lights,
        chunk_size=3,
    )

    assert result["u95_status_sub_nature_parks_10min"].tolist() == [
        "thriving",
        "unknown",
        "functioning",
    ]
    assert result["u95_status_nature_10min"].tolist()[1] == "unknown"
    assert result["u95_status_10min"].tolist()[1] == "unknown"
    for field in (
        "u95_status_sub_nature_urban_nature_areas_10min",
        "u95_status_sub_play_playgrounds_10min",
        "u95_status_play_10min",
        "u95_status_sub_family_services_business_10min",
    ):
        assert not result[field].eq("unknown").any()
    assert result["u95_status_10min"].tolist()[0] != "unknown"
    assert result["u95_status_10min"].tolist()[2] != "unknown"

    original_scalar = urban95_weights._features_intersecting

    def fail_same_scalar_park(source, geometry):
        if (
            "_source_area_m2" in source.columns
            or source is layers["parks"]
        ) and geometry.centroid.x == pytest.approx(100.0):
            raise RuntimeError("parks building failed")
        return original_scalar(source, geometry)

    monkeypatch.setattr(urban95_weights, "_features_intersecting", fail_same_scalar_park)
    scalar_layers = dict(layers, street_lights=lights)
    for position, building in enumerate(buildings.geometry):
        scalar = calculate_master_index(
            float(building.x),
            float(building.y),
            scalar_layers,
            precomputed={"summer_si": 0.4},
        )
        assert result.iloc[position]["u95_status_10min"] == scalar["overview_status"]
        for category, children in STATUS_HIERARCHY.items():
            assert (
                result.iloc[position][f"u95_status_{category}_10min"]
                == scalar["category_statuses"][category]
            )
            for indicator in children:
                assert (
                    result.iloc[position][f"u95_status_sub_{category}_{indicator}_10min"]
                    == scalar["subcategory_statuses"][category][indicator]
                )


def test_layerwise_batch_buffer_failure_retries_once_per_building_with_scalar_parity(
    monkeypatch,
    scoring_fixture,
):
    from lib import urban95_layerwise

    buildings, layers = scoring_fixture
    prepared = prepare_urban95_layers(**layers)
    shade = prepare_shade_overlay(_shade_gdf([box(-500, -500, 500, 500)], [0.4]), None)
    lights = _gdf([Point(0, 0)])
    original = urban95_layerwise._buffer
    calls = []

    def fail_only_batch_300(geometries, distance):
        calls.append((len(geometries), distance))
        if len(geometries) > 1 and distance == 300:
            raise RuntimeError("batch buffer failed")
        return original(geometries, distance)

    monkeypatch.setattr(urban95_layerwise, "_buffer", fail_only_batch_300)
    result = score_urban95_layerwise(
        buildings,
        prepared,
        shade,
        lights,
        chunk_size=3,
    )

    assert calls.count((len(buildings), 300)) == 1
    assert sum(1 for count, distance in calls if count == 1 and distance == 300) == len(buildings)
    assert not result.filter(regex=r"^u95_status").eq("unknown").any().any()
    scalar_layers = dict(layers, street_lights=lights)
    for position, building in enumerate(buildings.geometry):
        scalar = calculate_master_index(
            float(building.x),
            float(building.y),
            scalar_layers,
            precomputed={"summer_si": 0.4},
        )
        assert result.iloc[position]["u95_status_10min"] == scalar["overview_status"]
        for category, children in STATUS_HIERARCHY.items():
            assert (
                result.iloc[position][f"u95_status_{category}_10min"]
                == scalar["category_statuses"][category]
            )
            for indicator in children:
                assert (
                    result.iloc[position][f"u95_status_sub_{category}_{indicator}_10min"]
                    == scalar["subcategory_statuses"][category][indicator]
                )


def urban95_scoring_stems():
    return {
        "Environmental Quality": "environmental_quality",
        "Nature": "nature",
        "Play": "play",
        "Safety & Mobility": "safety_mobility",
        "Family Services": "family_services",
    }


def test_streetlight_threaded_matches_serial_with_duplicates_overlaps_and_invalid_rows():
    building_count = 130  # 64-building work chunks => three ordered executor ranges.
    buildings = _gdf([Point(position * 2000, 0) for position in range(building_count)])
    light_geometries = [
        None,
        Point(),
        Polygon([(-10000, 0), (-9970, 30), (-10000, 30), (-9970, 0), (-10000, 0)]),
        Point(2000, 0),
        Point(2000, 0),
    ]
    expected = []
    for position in range(building_count):
        center_x = position * 2000
        tier = position % 3
        expected.append(float(tier * 50))
        if tier == 1:
            light_geometries.append(box(center_x - 150, -150, center_x + 150, 150))
        elif tier == 2:
            light_geometries.append(box(center_x - 220, -220, center_x + 220, 220))
    lights = _gdf(light_geometries)
    serial = score_streetlight_overlay(buildings, lights, chunk_size=32, workers=1)
    threaded = score_streetlight_overlay(buildings, lights, chunk_size=32, workers=4)
    assert serial.tolist() == expected
    pd.testing.assert_series_equal(threaded, serial, check_exact=True)


def test_streetlight_threaded_preserves_raw_30_and_50_boundary_mapping():
    from lib.urban95_layerwise import _streetlight_percent_to_subscore

    raw_boundary_scores = pd.Series(
        [_streetlight_percent_to_subscore(value) for value in (30.0, 50.0)],
        dtype=float,
    )
    assert raw_boundary_scores.tolist() == [50.0, 50.0]
    buildings = _gdf([Point(0, 0), Point(100, 0)])
    lights = _gdf([Point(0, 0), Point(0, 0), Point(100, 0), Point(100, 0)])
    serial = score_streetlight_overlay(buildings, lights, chunk_size=1, workers=1)
    threaded = score_streetlight_overlay(buildings, lights, chunk_size=1, workers=2)
    pd.testing.assert_series_equal(threaded, serial, check_exact=True)


def test_candidate_lists_falls_back_when_batch_order_disagrees(monkeypatch):
    from lib import urban95_layerwise

    source = _gdf([Point(-10, 0), Point(10, 0), Point(0, 10)])
    queries = gpd.GeoSeries([Point(0, 0).buffer(50)], crs="EPSG:2039")
    scalar = np.asarray(source.sindex.query(queries.iloc[0], predicate="intersects"), dtype=np.int64)
    forced_batch = scalar[::-1].copy()
    assert not np.array_equal(forced_batch, scalar)

    def reversed_pairs(_queries, _source, predicate, chunk_size):
        assert predicate == "intersects"
        assert chunk_size == 1
        yield np.zeros(len(forced_batch), dtype=np.int64), forced_batch

    monkeypatch.setattr(urban95_layerwise, "iter_query_pairs", reversed_pairs)
    actual = urban95_layerwise._candidate_lists(
        queries,
        source,
        predicate="intersects",
        chunk_size=1,
    )
    np.testing.assert_array_equal(actual[0], scalar)


def test_stage_forwards_workers_to_full_layerwise_scorer(monkeypatch):
    from stages import urban95_scoring

    buildings = _gdf([Point(0, 0)])
    layers = {
        "trees": _gdf([Point(0, 0)]),
        "street_lights": _gdf([Point(0, 0)]),
        "shade_streets": None,
        "shade_open_spaces": None,
    }
    seen = []
    monkeypatch.setattr(urban95_scoring, "build_layers", lambda **_: layers)

    def fake_full(*_args, chunk_size, workers):
        seen.append((chunk_size, workers))
        return pd.DataFrame({"summer_si": [0.0]}, index=buildings.index)

    monkeypatch.setattr(urban95_scoring, "score_urban95_layerwise", fake_full)
    urban95_scoring.append_urban95_statuses(buildings, workers=7)
    assert seen == [(urban95_scoring.SI_ATTACH_CHUNK_SIZE, 7)]


def test_empty_keyed_layers_use_layerwise_status_path(monkeypatch):
    from stages import urban95_scoring

    buildings = _gdf([Point(0, 0)])
    empty = _gdf([])
    layers = {
        name: empty.copy()
        for name in (
            "trees", "roads", "parks", "urban_nature_areas", "playgrounds", "bikes",
            "bus_stops", "shelters", "education", "community", "business", "health", "street_lights",
        )
    }
    layers.update({"shade_streets": None, "shade_open_spaces": None})
    layerwise_calls = []
    monkeypatch.setattr(urban95_scoring, "build_layers", lambda **_: layers)

    def fake_layerwise(*_args, **_kwargs):
        layerwise_calls.append(True)
        return pd.DataFrame({"u95_status_10min": ["unknown"]}, index=buildings.index)

    monkeypatch.setattr(urban95_scoring, "score_urban95_layerwise", fake_layerwise)
    result = urban95_scoring.append_urban95_statuses(buildings, workers=1)
    assert layerwise_calls == [True]
    assert result.loc[0, "u95_status_10min"] == "unknown"


class _RecordingProgress:
    created = []

    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        self.updates = []
        self.close_calls = 0
        type(self).created.append(self)

    def update(self, amount=1):
        self.updates.append(amount)

    def close(self):
        self.close_calls += 1


class _DisabledProgress:
    def __init__(self, *args, **kwargs):
        pass

    def update(self, amount=1):
        pass

    def close(self):
        pass


def test_score_only_progress_reports_shade_and_serial_streetlights(monkeypatch):
    from lib import urban95_layerwise

    _RecordingProgress.created = []
    monkeypatch.setattr(urban95_layerwise, "tqdm", _RecordingProgress)
    buildings = _gdf([Point(0, 0), Point(100, 0), Point(200, 0)])
    shade = prepare_shade_overlay(_shade_gdf([box(-500, -500, 500, 500)], [0.4]), None)
    lights = _gdf([Point(0, 0), Point(100, 0), Point(200, 0)])

    score_shade_overlay(buildings, shade, chunk_size=2)
    score_streetlight_overlay(buildings, lights, chunk_size=2, workers=1)

    assert len(_RecordingProgress.created) == 2
    shade_bar, lights_bar = _RecordingProgress.created
    assert shade_bar.kwargs == {"total": 3, "desc": "Urban95 shade", "unit": "building", "disable": None}
    assert shade_bar.updates == [1, 1, 1]
    assert shade_bar.close_calls == 1
    assert lights_bar.kwargs == {"total": 3, "desc": "Urban95 streetlights", "unit": "building", "disable": None}
    assert lights_bar.updates == [1, 1, 1]
    assert lights_bar.close_calls == 1


def test_progress_enabled_and_disabled_preserve_exact_overlay_outputs(monkeypatch):
    from lib import urban95_layerwise

    buildings = _gdf([Point(0, 0), Point(100, 0), Point(200, 0)])
    shade = prepare_shade_overlay(_shade_gdf([box(-500, -500, 500, 500)], [0.4]), None)
    lights = _gdf([Point(0, 0), Point(100, 0), Point(200, 0)])

    monkeypatch.setattr(urban95_layerwise, "tqdm", _RecordingProgress)
    enabled_shade = score_shade_overlay(buildings, shade, chunk_size=2)
    enabled_serial_lights = score_streetlight_overlay(buildings, lights, chunk_size=2, workers=1)
    enabled_threaded_lights = score_streetlight_overlay(buildings, lights, chunk_size=2, workers=2)

    monkeypatch.setattr(urban95_layerwise, "tqdm", _DisabledProgress)
    disabled_shade = score_shade_overlay(buildings, shade, chunk_size=2)
    disabled_serial_lights = score_streetlight_overlay(buildings, lights, chunk_size=2, workers=1)
    disabled_threaded_lights = score_streetlight_overlay(buildings, lights, chunk_size=2, workers=2)

    pd.testing.assert_series_equal(enabled_shade, disabled_shade, check_exact=True)
    pd.testing.assert_series_equal(enabled_serial_lights, disabled_serial_lights, check_exact=True)
    pd.testing.assert_series_equal(enabled_threaded_lights, disabled_threaded_lights, check_exact=True)


def test_threaded_streetlight_progress_updates_in_ordered_chunks(monkeypatch):
    from lib import urban95_layerwise

    _RecordingProgress.created = []
    monkeypatch.setattr(urban95_layerwise, "tqdm", _RecordingProgress)
    buildings = _gdf([Point(position * 2000, 0) for position in range(130)])
    lights = _gdf([Point(0, 0)])

    threaded = score_streetlight_overlay(buildings, lights, chunk_size=32, workers=4)

    bar = _RecordingProgress.created[0]
    assert bar.kwargs == {"total": 130, "desc": "Urban95 streetlights", "unit": "building", "disable": None}
    assert bar.updates == [64, 64, 2]
    assert sum(bar.updates) == 130
    assert bar.close_calls == 1
    assert threaded.index.tolist() == buildings.index.tolist()


def test_progress_bars_close_and_phase_logs_survive_isolated_overlay_exceptions(monkeypatch, caplog):
    from lib import urban95_layerwise

    _RecordingProgress.created = []
    monkeypatch.setattr(urban95_layerwise, "tqdm", _RecordingProgress)
    monkeypatch.setattr(
        "lib.shade_si.round_building_summer_si",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("shade boom")),
    )
    caplog.set_level(logging.INFO)
    shade = prepare_shade_overlay(_shade_gdf([box(-500, -500, 500, 500)], [0.4]), None)
    shade_result = score_shade_overlay(_gdf([Point(0, 0)]), shade, chunk_size=1)
    assert shade_result.isna().all()
    assert _RecordingProgress.created[0].close_calls == 1
    assert _RecordingProgress.created[0].updates == [1]
    assert [r.getMessage() for r in caplog.records if r.name == "core.perf"][-1].startswith(
        "score_phase=score.shade.intersections elapsed_s="
    )

    _RecordingProgress.created = []
    monkeypatch.setattr(
        gpd.GeoSeries,
        "union_all",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("lights boom")),
    )
    light_result = score_streetlight_overlay(
        _gdf([Point(0, 0), Point(100, 0)]),
        _gdf([Point(0, 0)]),
        chunk_size=1,
        workers=2,
    )
    assert light_result.isna().all()
    assert _RecordingProgress.created[0].close_calls == 1
    assert any(
        r.getMessage().startswith("score_phase=score.lights.unions elapsed_s=")
        for r in caplog.records
        if r.name == "core.perf"
    )


def test_shade_progress_counts_empty_success_and_marks_only_throwing_building_unknown(monkeypatch):
    from lib import urban95_layerwise

    _RecordingProgress.created = []
    monkeypatch.setattr(urban95_layerwise, "tqdm", _RecordingProgress)
    calls = {"round": 0}

    def round_or_raise(raw_value):
        calls["round"] += 1
        if calls["round"] == 2:
            raise RuntimeError("third building boom")
        return raw_value

    monkeypatch.setattr("lib.shade_si.round_building_summer_si", round_or_raise)
    shade = prepare_shade_overlay(_shade_gdf([box(-500, -500, 500, 500)], [0.4]), None)
    buildings = _gdf([Point(0, 0), Point(), Point(100, 0)])

    result = score_shade_overlay(buildings, shade, chunk_size=1)

    bar = _RecordingProgress.created[0]
    assert result.iloc[0] == 0.4
    assert result.iloc[1] == 0.0
    assert pd.isna(result.iloc[2])
    assert bar.updates == [1, 1, 1]
    assert bar.close_calls == 1


def test_layerwise_score_emits_required_phase_inventory_in_order(monkeypatch, caplog, scoring_fixture):
    from stages import urban95_scoring
    from lib import urban95_layerwise
    import core.perf as perf

    buildings, layers = scoring_fixture
    layers = dict(
        layers,
        street_lights=_gdf([Point(0, 0)]),
        shade_streets=_shade_gdf([box(-500, -500, 500, 500)], [0.4]),
        shade_open_spaces=None,
    )
    monkeypatch.setattr(urban95_scoring, "build_layers", lambda **_: layers)
    timing = {"depth": 0, "max_depth": 0}

    @contextmanager
    def tracked_phase(name):
        timing["depth"] += 1
        timing["max_depth"] = max(timing["max_depth"], timing["depth"])
        try:
            with perf.logged_phase(name):
                yield
        finally:
            timing["depth"] -= 1

    monkeypatch.setattr(urban95_scoring, "logged_phase", tracked_phase)
    monkeypatch.setattr(urban95_layerwise, "logged_phase", tracked_phase)
    caplog.set_level(logging.INFO)

    urban95_scoring.append_urban95_statuses(buildings.copy(), workers=1)

    names = [
        record.getMessage().split(" ", 1)[0].split("=", 1)[1]
        for record in caplog.records
        if record.name == "core.perf" and record.getMessage().startswith("score_phase=")
    ]
    assert names == [
        "score.layers.load",
        "score.discrete.prepare",
        "score.shade.prepare",
        "score.discrete.compute",
        "score.lights.prepare",
        "score.lights.candidates",
        "score.lights.unions",
        "score.assembly",
    ]
    assert timing["max_depth"] == 1
