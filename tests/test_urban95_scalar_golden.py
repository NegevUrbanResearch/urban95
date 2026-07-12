from __future__ import annotations

import copy
import json
import math
import subprocess
import sys
from pathlib import Path

import geopandas as gpd
import pytest
from shapely import make_valid
from shapely.geometry import LineString, Point, Polygon, box


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "urban95_scalar_golden.json"
EXPECTED_GROUPS = {
    "buffer_boundaries",
    "street_light_coverage",
    "park_thresholds",
    "service_thresholds",
    "shade_weighting",
    "shade_rounding",
    "complete_rows",
    "invalid_inputs",
}
EXPECTED_CASE_IDS = {
    "buffer_boundaries": {
        "buffer_15m_axis_diagonal_midsegment",
        "buffer_20m_axis_diagonal_midsegment",
        "buffer_50m_axis_diagonal_midsegment",
        "buffer_300m_axis_diagonal_midsegment",
        "buffer_315m_axis_diagonal_midsegment",
    },
    "street_light_coverage": {
        "lights_none",
        "lights_one_center",
        "lights_duplicate_center_union",
        "lights_overlap_union",
        "lights_candidate_boundary_touch_315",
        "lights_candidate_just_outside_315",
        "lights_30_percent_just_below",
        "lights_30_percent_exact",
        "lights_30_percent_just_above",
        "lights_50_percent_just_below",
        "lights_50_percent_exact",
        "lights_50_percent_just_above",
    },
    "park_thresholds": {
        "park_area_just_below_3000",
        "park_area_exact_3000",
        "park_area_just_above_3000",
        "park_distance_just_inside_300",
        "park_distance_exact_touch_300",
        "park_distance_just_outside_300",
        "park_large_source_boundary_touch",
        "parks_overlapping_small_not_aggregated",
        "parks_missing_layer",
    },
    "service_thresholds": {
        "trees_count_0",
        "trees_count_1",
        "trees_count_2",
        "trees_count_3",
        "fast_road_distance_0",
        "fast_road_distance_exact_100",
        "fast_road_distance_just_above_100",
        "fast_road_distance_exact_300",
        "fast_road_distance_just_above_300",
        "road_speed_just_below_50",
        "road_speed_exact_50_not_fast",
        "road_speed_just_above_50_fast",
        "road_maxspeed_numeric_string_fast",
        "road_maxspeed_malformed_string",
        "road_max_speed_alias_fast",
        "road_speed_limit_alias_fast",
        "road_speed_column_missing",
        "bus_count_0",
        "bus_count_1",
        "bus_count_2",
        "bus_count_3",
        "bike_presence_exact_300",
        "shelter_presence_exact_50",
        "education_distance_0",
        "education_distance_exact_150",
        "education_distance_just_above_150",
        "education_distance_exact_300",
        "education_distance_just_above_300",
        "community_presence_exact_300",
        "business_presence_exact_300",
        "health_presence_exact_300",
        "urban_nature_presence_exact_300",
        "playground_presence_exact_300",
    },
    "shade_weighting": {
        "shade_empty_layers",
        "shade_empty_point",
        "shade_no_intersection",
        "shade_overlap_sources_counted_separately",
        "shade_spatial_index_traversal_order",
        "shade_order_sensitive_half_up_tie",
        "shade_invalid_bowtie_repaired",
        "shade_boundary_partial_area",
        "shade_nonfinite_and_nonarea_dropped",
        "shade_raw_tie_then_stored_half_up",
    },
    "shade_rounding": {
        "si_just_below_015",
        "si_tie_015",
        "si_just_above_015",
        "si_just_below_035",
        "si_tie_035",
        "si_just_above_035",
        "si_official_010_just_below",
        "si_official_010_exact",
        "si_project_020_just_below",
        "si_project_020_exact",
        "si_project_020_just_above",
        "si_project_040_just_below",
        "si_project_040_exact",
        "si_project_040_just_above",
        "si_official_060_just_below",
        "si_official_060_exact",
        "si_null_supported",
        "si_nonnumeric_string_supported",
        "si_numeric_string_supported",
        "si_nan_encoded",
        "si_positive_infinity_encoded",
    },
    "complete_rows": {"complete_adversarial_building", "complete_missing_layers_building"},
    "invalid_inputs": {
        "master_index_nonnumeric_x_exception",
        "master_index_null_x_exception",
    },
}
EXPECTED_SOURCE_HASHES = {
    "src/lib/urban95_weights.py": "c3340432eddac331f5aa2e3ef7b18ae356331196f4f92b73c04d9186f64a5237",
    "src/lib/shade_si.py": "abc6fb4bcd6c5df1a9e29dcae76c7d7f881063c0b233c12d31b346b8452b7928",
    "src/stages/urban95_scoring.py": "558881887011e9a2475d89cc6ef0e5c5a509d4444e429c703f7b14261344b6b6",
    "src/core/geo_io.py": "8e10a169c1558255ab958a30d13d76241caf11bace383ebf8554fbcf0ce9ce5a",
}
EXPECTED_CAPTURE_RUNTIME = {
    "python": "3.13.4",
    "geopandas": "1.1.3",
    "shapely": "2.1.2",
    "geos": "3.13.1",
    "pandas": "3.0.2",
}
MANDATORY_CASE_FIELDS = {
    "buffer_boundaries": {"id", "description", "radius_m", "center", "candidates", "expected"},
    "street_light_coverage": {"id", "description", "point", "lights", "expected"},
    "park_thresholds": {"id", "description", "point", "layers", "expected"},
    "service_thresholds": {"id", "description", "function", "point", "layers", "expected"},
    "shade_weighting": {
        "id",
        "description",
        "point_geometry",
        "streets",
        "open_spaces",
        "expected",
    },
    "shade_rounding": {"id", "description", "input", "expected"},
    "complete_rows": {"id", "description", "point", "precomputed_summer_si", "layers", "expected"},
    "invalid_inputs": {"id", "description", "x_coord", "y_coord", "expected"},
}
MANDATORY_EXPECTED_FIELDS = {
    "buffer_boundaries": {"intersects"},
    "street_light_coverage": {
        "illuminated_area",
        "illuminated_percentage",
        "street_lights_subscore",
        "isolated_category_score",
    },
    "park_thresholds": {"category_score", "details"},
    "service_thresholds": {"category_score", "details"},
    "shade_weighting": {
        "prepared_surface_count",
        "candidate_positions",
        "intersection_areas",
        "total_area",
        "weighted_sum",
        "raw_summer_si",
        "stored_summer_si",
    },
    "shade_rounding": {"stored_summer_si", "project_subscore", "official_classification"},
    "complete_rows": {"master_result", "published_columns"},
    "invalid_inputs": {"exception_type", "message_regex"},
}


def _load_fixture() -> dict:
    def reject_nonfinite(token: str):
        raise ValueError(f"non-finite JSON literal: {token}")

    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"), parse_constant=reject_nonfinite)


def _geometry(spec: dict):
    kind = spec["type"]
    if kind == "Point":
        return Point(spec["coordinates"])
    if kind == "EmptyPoint":
        return Point()
    if kind == "LineString":
        return LineString(spec["coordinates"])
    if kind == "Box":
        return box(*spec["bounds"])
    if kind == "Polygon":
        return Polygon(spec["coordinates"][0], spec["coordinates"][1:])
    raise AssertionError(f"unknown geometry spec {kind!r}")


def _layer(layer_spec: dict) -> gpd.GeoDataFrame:
    features = layer_spec.get("features", [])
    properties = [
        {
            key: _decode_scalar_value(value)
            if isinstance(value, dict) and value.get("kind") == "nonfinite"
            else value
            for key, value in feature.get("properties", {}).items()
        }
        for feature in features
    ]
    geometries = [_geometry(feature["geometry"]) for feature in features]
    return gpd.GeoDataFrame(properties, geometry=geometries, crs="EPSG:2039")


def _layers(layer_specs: dict) -> dict[str, gpd.GeoDataFrame]:
    return {name: _layer(spec) for name, spec in layer_specs.items()}


def _assert_nested_exact(actual, expected) -> None:
    if isinstance(expected, dict):
        assert set(actual) == set(expected)
        for key in expected:
            _assert_nested_exact(actual[key], expected[key])
    elif isinstance(expected, list):
        assert len(actual) == len(expected)
        for actual_item, expected_item in zip(actual, expected, strict=True):
            _assert_nested_exact(actual_item, expected_item)
    else:
        assert actual == expected


def _validate_fixture_schema(fixture: dict) -> None:
    assert fixture["schema_version"] == 1
    assert fixture["crs"] == "EPSG:2039"
    assert set(fixture["case_groups"]) == EXPECTED_GROUPS
    assert fixture["capture_runtime_provenance"] == EXPECTED_CAPTURE_RUNTIME
    assert "STRtree" in fixture["traversal_runtime_characterization"]
    provenance = {item["path"]: item["sha256"] for item in fixture["reference_source_provenance"]}
    assert provenance == EXPECTED_SOURCE_HASHES
    for group, expected_ids in EXPECTED_CASE_IDS.items():
        cases = fixture["case_groups"][group]
        actual_ids = {case["id"] for case in cases}
        assert actual_ids == expected_ids
        assert len(cases) == len(actual_ids)
        for case in cases:
            assert MANDATORY_CASE_FIELDS[group] <= set(case)
            assert MANDATORY_EXPECTED_FIELDS[group] <= set(case["expected"])
            assert case["description"].strip()
            if group == "buffer_boundaries":
                assert all({"position", "point"} <= set(candidate) for candidate in case["candidates"])
                assert len(case["candidates"]) == len(case["expected"]["intersects"])


def _decode_scalar_value(spec):
    if not isinstance(spec, dict):
        return spec
    if spec.get("kind") == "nonfinite":
        return {"NaN": math.nan, "+Infinity": math.inf, "-Infinity": -math.inf}[spec["value"]]
    raise AssertionError(f"unsupported encoded scalar value: {spec!r}")


def test_scalar_golden_fixture_has_required_schema_and_case_groups():
    assert FIXTURE_PATH.is_file(), f"missing frozen scalar fixture: {FIXTURE_PATH}"
    fixture = _load_fixture()
    _validate_fixture_schema(fixture)
    assert fixture["numeric_tolerances"]["raw_float_abs"] == 1e-9
    assert fixture["numeric_tolerances"]["geometry_area_abs"] == 1e-9
    assert fixture["numeric_tolerances"]["near_boundary_epsilon_m"] == 1e-7
    for source in fixture["reference_source_provenance"]:
        assert len(source["sha256"]) == 64
        int(source["sha256"], 16)


def test_fixture_is_consumable_without_importing_scalar_modules():
    script = r"""
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
data = json.loads(path.read_text(encoding="utf-8"), parse_constant=lambda token: (_ for _ in ()).throw(ValueError(token)))
assert data["schema_version"] == 1
assert data["crs"] == "EPSG:2039"
for group, cases in data["case_groups"].items():
    assert isinstance(group, str) and cases
    for case in cases:
        assert isinstance(case["id"], str)
        assert "expected" in case
assert not any(name.startswith("lib.") or name.startswith("stages.") for name in sys.modules)
"""
    result = subprocess.run(
        [sys.executable, "-I", "-c", script, str(FIXTURE_PATH)],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_frozen_buffer_boundary_predicates_match_scalar_helper():
    from lib.urban95_weights import _features_intersecting

    fixture = _load_fixture()
    for case in fixture["case_groups"]["buffer_boundaries"]:
        center = Point(case["center"])
        scalar_buffer = center.buffer(case["radius_m"])
        candidates = gpd.GeoDataFrame(
            {"position": [candidate["position"] for candidate in case["candidates"]]},
            geometry=[Point(candidate["point"]) for candidate in case["candidates"]],
            crs=fixture["crs"],
        )
        selected = set(_features_intersecting(candidates, scalar_buffer)["position"])
        actual = [candidate["position"] in selected for candidate in case["candidates"]]
        assert actual == case["expected"]["intersects"], case["id"]


def _raw_light_coverage(point: Point, light_layer: gpd.GeoDataFrame) -> tuple[float, float]:
    from lib.urban95_weights import _features_intersecting

    building_buffer = point.buffer(300)
    lights_near = _features_intersecting(light_layer, point.buffer(315))
    if lights_near.empty:
        return 0.0, 0.0
    light_union = lights_near.geometry.buffer(15).union_all()
    if light_union is None or light_union.is_empty:
        return 0.0, 0.0
    repaired = light_union if light_union.is_valid else make_valid(light_union)
    illuminated_area = 0.0 if repaired.is_empty else repaired.intersection(building_buffer).area
    return illuminated_area, illuminated_area / building_buffer.area * 100.0


def test_frozen_street_light_union_coverage_and_tiers_match_scalar():
    from lib.urban95_weights import calc_safety_and_mobility

    fixture = _load_fixture()
    tolerance = fixture["numeric_tolerances"]["geometry_area_abs"]
    for case in fixture["case_groups"]["street_light_coverage"]:
        lights = _layer(case["lights"])
        point = Point(case["point"])
        area, percentage = _raw_light_coverage(point, lights)
        category, details = calc_safety_and_mobility(
            point, {"street_lights": lights}, include_details=True
        )
        assert area == pytest.approx(case["expected"]["illuminated_area"], abs=tolerance, rel=0.0)
        assert percentage == pytest.approx(
            case["expected"]["illuminated_percentage"], abs=tolerance, rel=0.0
        )
        assert details["street_lights"] == case["expected"]["street_lights_subscore"]
        assert category == case["expected"]["isolated_category_score"]


def test_frozen_park_source_area_presence_and_edge_semantics_match_scalar():
    from lib.urban95_weights import calc_nature

    fixture = _load_fixture()
    for case in fixture["case_groups"]["park_thresholds"]:
        category, details = calc_nature(
            Point(case["point"]), _layers(case["layers"]), include_details=True
        )
        _assert_nested_exact(
            {"category_score": category, "details": details},
            case["expected"],
        )


def test_frozen_service_distance_count_speed_and_weight_branches_match_scalar():
    from lib.urban95_weights import (
        calc_environmental_quality,
        calc_family_services,
        calc_nature,
        calc_play,
        calc_safety_and_mobility,
    )

    functions = {
        "environmental_quality": lambda point, layers: calc_environmental_quality(
            point, layers, include_details=True, precomputed_summer_si=0.0
        ),
        "nature": lambda point, layers: calc_nature(point, layers, include_details=True),
        "play": lambda point, layers: calc_play(point, layers, include_details=True),
        "safety_mobility": lambda point, layers: calc_safety_and_mobility(
            point, layers, include_details=True
        ),
        "family_services": lambda point, layers: calc_family_services(
            point, layers, include_details=True
        ),
    }
    fixture = _load_fixture()
    for case in fixture["case_groups"]["service_thresholds"]:
        category, details = functions[case["function"]](Point(case["point"]), _layers(case["layers"]))
        _assert_nested_exact(
            {"category_score": category, "details": details},
            case["expected"],
        )


def test_frozen_shade_sanitization_overlap_order_weighting_and_storage_match_scalar():
    from lib.shade_si import (
        BUILDING_SI_FIELD,
        SCORE_FIELD,
        _prepare_combined_si_layers,
        attach_summer_si_to_buildings,
        lookup_summer_si_at_point,
    )

    fixture = _load_fixture()
    tolerance = fixture["numeric_tolerances"]["raw_float_abs"]
    for case in fixture["case_groups"]["shade_weighting"]:
        streets = _layer(case["streets"])
        open_spaces = _layer(case["open_spaces"])
        point = _geometry(case["point_geometry"])
        prepared = _prepare_combined_si_layers(streets, open_spaces)
        query_order = (
            prepared.sindex.query(point.buffer(300), predicate="intersects").tolist()
            if not point.is_empty and len(prepared)
            else []
        )
        intersection_areas = []
        total_area = 0.0
        weighted_sum = 0.0
        scalar_buffer = point.buffer(300)
        for position in query_order:
            area = scalar_buffer.intersection(prepared.geometry.iloc[position]).area
            if area <= 0:
                continue
            intersection_areas.append(area)
            total_area += area
            weighted_sum += area * float(prepared[SCORE_FIELD].iloc[position])
        raw = lookup_summer_si_at_point(point, streets, open_spaces)
        buildings = gpd.GeoDataFrame(geometry=[point], crs=fixture["crs"])
        stored = attach_summer_si_to_buildings(buildings, streets, open_spaces)[BUILDING_SI_FIELD].iloc[0]
        expected = case["expected"]
        assert len(prepared) == expected["prepared_surface_count"]
        assert query_order == expected["candidate_positions"]
        assert intersection_areas == pytest.approx(
            expected["intersection_areas"], abs=tolerance, rel=0.0
        )
        assert total_area == pytest.approx(expected["total_area"], abs=tolerance, rel=0.0)
        assert weighted_sum == pytest.approx(expected["weighted_sum"], abs=tolerance, rel=0.0)
        assert raw == pytest.approx(expected["raw_summer_si"], abs=tolerance, rel=0.0)
        assert stored == expected["stored_summer_si"]
        if "alternate_candidate_positions" in expected:
            alternate_total = 0.0
            alternate_weighted = 0.0
            for position in expected["alternate_candidate_positions"]:
                area = scalar_buffer.intersection(prepared.geometry.iloc[position]).area
                alternate_total += area
                alternate_weighted += area * float(prepared[SCORE_FIELD].iloc[position])
            alternate_raw = alternate_weighted / alternate_total
            from lib.shade_si import round_building_summer_si

            assert alternate_weighted == expected["alternate_weighted_sum"]
            assert alternate_raw == expected["alternate_raw_summer_si"]
            assert round_building_summer_si(alternate_raw) == expected["alternate_stored_summer_si"]
            assert abs(raw - 0.35) <= 1e-12
            assert raw != alternate_raw
            assert stored != expected["alternate_stored_summer_si"]


def test_frozen_si_half_up_project_and_official_boundaries_match_scalar():
    from lib.shade_si import classify_summer_si, round_building_summer_si, summer_si_to_subscore

    fixture = _load_fixture()
    for case in fixture["case_groups"]["shade_rounding"]:
        value = _decode_scalar_value(case["input"])
        expected = case["expected"]
        assert round_building_summer_si(value) == expected["stored_summer_si"]
        assert summer_si_to_subscore(value) == expected["project_subscore"]
        assert classify_summer_si(value) == expected["official_classification"]


def _published_scalar_row(case: dict) -> dict:
    from core.geo_io import WALK_MINUTES
    from lib.urban95_weights import calculate_master_index
    from stages.urban95_scoring import WEIGHTED_CATEGORY_STEMS, _weighted_component_stem

    result = calculate_master_index(
        case["point"][0],
        case["point"][1],
        _layers(case["layers"]),
        precomputed={"summer_si": _decode_scalar_value(case["precomputed_summer_si"])},
    )
    scalar_row = {"summer_si": result["subcategory_scores"]["Environmental Quality"]["summer_si"]}
    for minutes in WALK_MINUTES:
        suffix = f"_{minutes}min"
        scalar_row[f"score_weighted{suffix}"] = result["final_index"]
        for category_name, category_stem in WEIGHTED_CATEGORY_STEMS.items():
            scalar_row[f"score_weighted_{category_stem}{suffix}"] = result["category_scores"][
                category_name
            ]
            for subcategory_name, value in result["subcategory_scores"][category_name].items():
                if subcategory_name == "summer_si":
                    continue
                subcategory_stem = _weighted_component_stem(subcategory_name)
                scalar_row[
                    f"score_weighted_sub_{category_stem}_{subcategory_stem}{suffix}"
                ] = value
    return {"master_result": result, "published_columns": scalar_row}


def test_frozen_complete_rows_match_every_scalar_intermediate_and_5_10_15_copy_contract():
    fixture = _load_fixture()
    for case in fixture["case_groups"]["complete_rows"]:
        actual = _published_scalar_row(case)
        _assert_nested_exact(actual, case["expected"])
        published = actual["published_columns"]
        stems = [name.removesuffix("_5min") for name in published if name.endswith("_5min")]
        assert stems
        for stem in stems:
            assert published[f"{stem}_5min"] == published[f"{stem}_10min"]
            assert published[f"{stem}_5min"] == published[f"{stem}_15min"]


def test_real_append_stage_writes_exact_full_inventory_and_zeroes_only_failing_row(monkeypatch):
    from stages import urban95_scoring

    fixture = _load_fixture()
    expected_valid = fixture["case_groups"]["complete_rows"][0]["expected"]
    expected_score_columns = {
        name: value for name, value in expected_valid["published_columns"].items() if name != "summer_si"
    }
    buildings = gpd.GeoDataFrame(
        {"building_id": [101, 202]},
        geometry=[Point(0.0, 0.0), Point(1.0, 0.0)],
        crs="EPSG:2039",
    )
    calls = []

    monkeypatch.setattr(urban95_scoring, "build_layers", lambda **_: {})

    def fake_attach(frame, streets, open_spaces, *, chunk_size):
        assert streets is None and open_spaces is None
        assert chunk_size == urban95_scoring.SI_ATTACH_CHUNK_SIZE
        out = frame.copy()
        out["summer_si"] = [0.4, 0.2]
        return out

    def fake_scalar(x, y, layers, precomputed):
        calls.append((x, y, precomputed["summer_si"]))
        if x == 1.0:
            raise RuntimeError("literal scorer failure")
        return copy.deepcopy(expected_valid["master_result"])

    monkeypatch.setattr(urban95_scoring, "attach_summer_si_to_buildings", fake_attach)
    monkeypatch.setattr(urban95_scoring, "calculate_master_index", fake_scalar)

    actual = urban95_scoring.append_weighted_urban95_scores(buildings, workers=1)
    assert calls == [(0.0, 0.0, 0.4), (1.0, 0.0, 0.2)]
    assert set(actual.columns) == {
        "building_id",
        "geometry",
        "summer_si",
        *expected_score_columns,
    }
    assert actual.loc[0, "summer_si"] == 0.4
    assert actual.loc[1, "summer_si"] == 0.2
    for column, expected in expected_score_columns.items():
        assert actual.loc[0, column] == expected
        assert actual.loc[1, column] == 0.0

    missing_time_writes = actual.drop(
        columns=[column for column in expected_score_columns if column.endswith(("_10min", "_15min"))]
    )
    with pytest.raises(AssertionError):
        assert set(missing_time_writes.columns) == {
            "building_id",
            "geometry",
            "summer_si",
            *expected_score_columns,
        }


def test_frozen_invalid_coordinate_exception_semantics_match_scalar():
    from lib.urban95_weights import calculate_master_index

    fixture = _load_fixture()
    exception_types = {"TypeError": TypeError, "ValueError": ValueError}
    for case in fixture["case_groups"]["invalid_inputs"]:
        expected = case["expected"]
        with pytest.raises(exception_types[expected["exception_type"]], match=expected["message_regex"]):
            calculate_master_index(case["x_coord"], case["y_coord"], {})


def test_mutating_a_literal_expected_value_is_detected():
    fixture = _load_fixture()
    case = fixture["case_groups"]["complete_rows"][0]
    actual = _published_scalar_row(case)
    mutated_expected = copy.deepcopy(case["expected"])
    mutated_expected["master_result"]["final_index"] += 0.1
    with pytest.raises(AssertionError):
        _assert_nested_exact(actual, mutated_expected)


def test_sub_tolerance_mutations_of_stored_and_published_outputs_are_detected_exactly():
    fixture = _load_fixture()
    case = fixture["case_groups"]["complete_rows"][0]
    actual = _published_scalar_row(case)
    for path in (
        ("published_columns", "summer_si"),
        ("published_columns", "score_weighted_10min"),
        ("master_result", "category_scores", "Nature"),
        ("master_result", "subcategory_weights", "Nature", "parks"),
    ):
        mutated = copy.deepcopy(case["expected"])
        target = mutated
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] += 5e-10
        with pytest.raises(AssertionError):
            _assert_nested_exact(actual, mutated)


def test_case_deletion_and_tiny_exact_value_mutations_are_detected():
    fixture = _load_fixture()
    deleted = copy.deepcopy(fixture)
    deleted["case_groups"]["service_thresholds"].pop()
    with pytest.raises(AssertionError):
        _validate_fixture_schema(deleted)

    mutated = copy.deepcopy(fixture)
    mutated["case_groups"]["shade_rounding"][0]["expected"]["stored_summer_si"] += 5e-10
    actual = _load_fixture()["case_groups"]["shade_rounding"][0]["expected"]
    with pytest.raises(AssertionError):
        _assert_nested_exact(actual, mutated["case_groups"]["shade_rounding"][0]["expected"])
