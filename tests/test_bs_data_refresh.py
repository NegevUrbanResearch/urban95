from __future__ import annotations

import gzip
import json
from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point, Polygon

from lib.bs_data_refresh import (
    BUILDINGS_CANONICAL_NAME,
    BUILDINGS_SOURCE_NAME,
    TREES_CANONICAL_NAME,
    TREES_SOURCE_NAME,
    count_residential_buildings,
    load_canonical_gzip,
    prepare_canonical_inputs,
    validate_buildings_source,
    validate_trees_source,
    write_canonical_gzip,
)


def _write_geojson(path: Path, features: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"type": "FeatureCollection", "features": features}
    path.write_text(json.dumps(payload), encoding="utf-8")


def _sample_building_feature(*, used: str = "מגורים") -> dict:
    return {
        "type": "Feature",
        "properties": {
            "Used": used,
            "floors": 2,
            "appartment": 4,
            "Not_reside": 0,
            "lon": 34.8,
            "lat": 31.2,
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[34.8, 31.2], [34.801, 31.2], [34.801, 31.201], [34.8, 31.2]]],
        },
    }


def _sample_tree_feature() -> dict:
    return {
        "type": "Feature",
        "properties": {
            "plate_num": 123,
            "tree_speci": "אקליפטוס",
            "street_nam": "הרצל",
            "neighborho": "רמות",
            "itm_x": 178851.0,
            "itm_y": 573942.0,
            "lon": 34.801,
            "lat": 31.201,
        },
        "geometry": {"type": "Point", "coordinates": [34.801, 31.201]},
    }


def test_validate_buildings_source_requires_used_and_wgs84(tmp_path: Path) -> None:
    path = tmp_path / BUILDINGS_SOURCE_NAME
    _write_geojson(
        path,
        [
            _sample_building_feature(),
            _sample_building_feature(used="מסחרי"),
        ],
    )
    gdf = validate_buildings_source(path)
    assert len(gdf) == 2
    assert count_residential_buildings(gdf) == 1


def test_validate_trees_source_requires_point_geometry(tmp_path: Path) -> None:
    path = tmp_path / TREES_SOURCE_NAME
    _write_geojson(path, [_sample_tree_feature()])
    gdf = validate_trees_source(path)
    assert len(gdf) == 1
    assert set(gdf.columns) >= {"tree_speci", "street_nam", "lon", "lat"}


def test_prepare_canonical_inputs_preserves_attributes(tmp_path: Path) -> None:
    buildings_source = tmp_path / BUILDINGS_SOURCE_NAME
    trees_source = tmp_path / TREES_SOURCE_NAME
    _write_geojson(buildings_source, [_sample_building_feature(), _sample_building_feature(used="מסחרי")])
    _write_geojson(trees_source, [_sample_tree_feature()])

    result = prepare_canonical_inputs(tmp_path)

    buildings = load_canonical_gzip(tmp_path / BUILDINGS_CANONICAL_NAME)
    trees = load_canonical_gzip(tmp_path / TREES_CANONICAL_NAME)

    assert result.buildings.feature_count == 2
    assert result.buildings.residential_count == 1
    assert result.trees.feature_count == 1
    assert set(buildings.columns) >= {"Used", "floors", "appartment"}
    assert set(trees.columns) >= {"tree_speci", "street_nam", "neighborho", "itm_x", "itm_y"}
    assert (tmp_path / BUILDINGS_CANONICAL_NAME).exists()
    assert (tmp_path / TREES_CANONICAL_NAME).exists()


def test_write_canonical_gzip_roundtrip(tmp_path: Path) -> None:
    gdf = gpd.GeoDataFrame(
        {"building_id": [1], "Used": ["מגורים"]},
        geometry=[Polygon([(34.8, 31.2), (34.801, 31.2), (34.801, 31.201), (34.8, 31.2)])],
        crs="EPSG:4326",
    )
    output = tmp_path / BUILDINGS_CANONICAL_NAME
    nbytes = write_canonical_gzip(gdf, output)
    assert nbytes > 0
    loaded = load_canonical_gzip(output)
    assert len(loaded) == 1
    assert loaded.iloc[0]["Used"] == "מגורים"


def test_validate_trees_source_rejects_polygon_geometry(tmp_path: Path) -> None:
    path = tmp_path / TREES_SOURCE_NAME
    gdf = gpd.GeoDataFrame(
        {"lon": [34.8], "lat": [31.2]},
        geometry=[Point(34.8, 31.2).buffer(0.001)],
        crs="EPSG:4326",
    )
    gdf.to_file(path, driver="GeoJSON")
    try:
        validate_trees_source(path)
    except ValueError as exc:
        assert "unsupported geometry types" in str(exc)
    else:
        raise AssertionError("expected ValueError for polygon trees")


def test_canonical_gzip_is_valid_json(tmp_path: Path) -> None:
    gdf = gpd.GeoDataFrame(
        {"lon": [34.8], "lat": [31.2]},
        geometry=[Point(34.8, 31.2)],
        crs="EPSG:4326",
    )
    output = tmp_path / TREES_CANONICAL_NAME
    write_canonical_gzip(gdf, output)
    with gzip.open(output, "rt", encoding="utf-8") as handle:
        payload = json.load(handle)
    assert payload["type"] == "FeatureCollection"
    assert len(payload["features"]) == 1
