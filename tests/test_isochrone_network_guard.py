import json
import logging
import math
import re

import geopandas as gpd
import pytest
from shapely.geometry import Point

from core.geo_io import WALK_MINUTES
from stages import isochrones


def _buildings() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        {"building_id": [101, 202]},
        geometry=[Point(0, 0), Point(10, 0)],
        crs="EPSG:2039",
    )


def _write_warm_aggregate(path, keys):
    frame = gpd.GeoDataFrame(
        {
            "building_id": [building_id for building_id, _ in keys],
            "minutes": [minutes for _, minutes in keys],
        },
        geometry=[Point(34.7, 31.2) for _ in keys],
        crs="EPSG:4326",
    )
    frame.to_file(path, driver="GeoJSON")


def _all_keys():
    return [(building_id, minutes) for building_id in (101, 202) for minutes in WALK_MINUTES]


def _raise_boundary(name):
    def _raise(*_args, **_kwargs):
        raise AssertionError(f"{name} must not be reached")

    return _raise


def _forbid_network_and_writes(monkeypatch):
    monkeypatch.setattr(isochrones, "load_mapbox_token", _raise_boundary("token loading"))
    monkeypatch.setattr(isochrones.requests, "Session", _raise_boundary("session construction"))
    monkeypatch.setattr(isochrones.requests, "get", _raise_boundary("requests.get"))
    monkeypatch.setattr(isochrones, "_get_session", _raise_boundary("session lookup"))
    monkeypatch.setattr(
        isochrones,
        "_write_isochrones_geojson",
        _raise_boundary("aggregate write"),
    )


@pytest.mark.parametrize("payload", [b"{not-json", b"\xff", b"[]", b"null", b'"text"'])
def test_malformed_or_non_object_cache_is_unavailable_for_guard(tmp_path, payload):
    cache_path = tmp_path / "cache.json"
    cache_path.write_bytes(payload)

    assert not isochrones._cache_payload_valid_without_mutation(cache_path)
    assert cache_path.read_bytes() == payload


@pytest.mark.parametrize("payload", [b"{not-json", b"\xff"])
def test_malformed_cache_reader_degrades_to_unavailable(tmp_path, payload, caplog):
    cache_path = tmp_path / "cache.json"
    cache_path.write_bytes(payload)

    assert isochrones._load_valid_cached_isochrone_payload(cache_path) is None
    assert not cache_path.exists()
    assert any("Invalid JSON cache file" in record.message for record in caplog.records)


@pytest.mark.parametrize("payload", [b"[]", b"null", b'"text"'])
def test_non_object_cache_reader_degrades_to_unavailable(tmp_path, payload, caplog):
    cache_path = tmp_path / "cache.json"
    cache_path.write_bytes(payload)

    assert isochrones._load_valid_cached_isochrone_payload(cache_path) is None
    assert not cache_path.exists()
    assert any("Invalid isochrone cache payload" in record.message for record in caplog.records)


def test_missing_and_unreadable_cache_are_unavailable_for_guard(monkeypatch, tmp_path):
    missing = tmp_path / "missing.json"
    assert not isochrones._cache_payload_valid_without_mutation(missing)
    assert isochrones._load_valid_cached_isochrone_payload(missing) is None

    unreadable = tmp_path / "unreadable.json"
    unreadable.write_text("{}", encoding="utf-8")

    def fail_open(*_args, **_kwargs):
        raise OSError("permission denied")

    monkeypatch.setattr(isochrones, "open", fail_open, raising=False)
    assert not isochrones._cache_payload_valid_without_mutation(unreadable)
    assert isochrones._load_valid_cached_isochrone_payload(unreadable) is None
    assert not unreadable.exists()


def test_valid_cache_payload_is_available_to_guard_and_reader(tmp_path):
    cache_path = tmp_path / "cache.json"
    payload = {"type": "FeatureCollection", "features": []}
    cache_path.write_text(json.dumps(payload), encoding="utf-8")

    assert isochrones._cache_payload_valid_without_mutation(cache_path)
    assert isochrones._load_valid_cached_isochrone_payload(cache_path) == payload
    assert cache_path.exists()


@pytest.mark.parametrize(
    "reader",
    [
        isochrones._cache_payload_valid_without_mutation,
        isochrones._load_valid_cached_isochrone_payload,
    ],
)
def test_unexpected_runtimeerror_from_cache_reader_propagates(monkeypatch, tmp_path, reader):
    cache_path = tmp_path / "cache.json"
    cache_path.write_text("{}", encoding="utf-8")

    def fail_json_load(*_args, **_kwargs):
        raise RuntimeError("programmer error")

    monkeypatch.setattr(isochrones.json, "load", fail_json_load)
    with pytest.raises(RuntimeError, match="programmer error"):
        reader(cache_path)


def test_forbid_mapbox_reuses_complete_warm_aggregate_without_session(
    monkeypatch, tmp_path, caplog
):
    warm_path = tmp_path / "isochrones.geojson"
    _write_warm_aggregate(warm_path, _all_keys())
    before = warm_path.read_bytes()
    monkeypatch.setattr(isochrones, "load_raw_buildings", _buildings)
    monkeypatch.setattr(isochrones, "ISOCHRONES_OUTPUT_PATH", warm_path)
    monkeypatch.setattr(isochrones, "ISOCHRONE_CACHE_DIR", tmp_path / "cache")
    monkeypatch.setenv("PIPELINE_FORBID_MAPBOX", "1")
    _forbid_network_and_writes(monkeypatch)

    caplog.set_level(logging.INFO)
    assert isochrones.run_isochrones() == warm_path

    assert warm_path.read_bytes() == before
    assert any("mapbox_requests_attempted=0" in record.message for record in caplog.records)


def test_unguarded_incomplete_nonempty_aggregate_keeps_legacy_short_circuit(
    monkeypatch, tmp_path
):
    warm_path = tmp_path / "isochrones.geojson"
    _write_warm_aggregate(warm_path, _all_keys()[:-1])
    before = warm_path.read_bytes()
    monkeypatch.setattr(isochrones, "load_raw_buildings", _buildings)
    monkeypatch.setattr(isochrones, "ISOCHRONES_OUTPUT_PATH", warm_path)
    monkeypatch.setattr(isochrones, "ISOCHRONE_CACHE_DIR", tmp_path / "cache")
    monkeypatch.delenv("PIPELINE_FORBID_MAPBOX", raising=False)
    _forbid_network_and_writes(monkeypatch)

    assert isochrones.run_isochrones() == warm_path
    assert warm_path.read_bytes() == before


def test_forbid_mapbox_aborts_before_network_when_warm_keys_missing(
    monkeypatch, tmp_path, caplog
):
    warm_path = tmp_path / "isochrones.geojson"
    _write_warm_aggregate(warm_path, _all_keys()[:-1])
    before = warm_path.read_bytes()
    monkeypatch.setattr(isochrones, "load_raw_buildings", _buildings)
    monkeypatch.setattr(isochrones, "ISOCHRONES_OUTPUT_PATH", warm_path)
    monkeypatch.setattr(isochrones, "ISOCHRONE_CACHE_DIR", tmp_path / "cache")
    monkeypatch.setenv("PIPELINE_FORBID_MAPBOX", "1")
    _forbid_network_and_writes(monkeypatch)

    caplog.set_level(logging.INFO)
    with pytest.raises(RuntimeError, match="Mapbox requests forbidden"):
        isochrones.run_isochrones()

    assert warm_path.read_bytes() == before
    required = [
        int(match.group(1))
        for record in caplog.records
        if (match := re.search(r"mapbox_requests_required=(\d+)", record.message))
    ]
    assert required and required[-1] > 0
    assert any("mapbox_requests_attempted=0" in record.message for record in caplog.records)


def test_forbid_mapbox_preserves_corrupt_present_cache_before_abort(
    monkeypatch, tmp_path, caplog
):
    warm_path = tmp_path / "isochrones.geojson"
    _write_warm_aggregate(warm_path, _all_keys()[:-1])
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    centroids = isochrones._building_centroids_wgs84(_buildings())
    centroid = centroids.iloc[0].geometry
    cache_path = cache_dir / f"{centroid.x:.5f}_{centroid.y:.5f}.json"
    cache_path.write_bytes(b"{corrupt-cache")
    other_centroid = centroids.iloc[1].geometry
    other_cache = cache_dir / f"{other_centroid.x:.5f}_{other_centroid.y:.5f}.json"
    other_cache.write_text(
        json.dumps({"type": "FeatureCollection", "features": []}),
        encoding="utf-8",
    )
    warm_before = warm_path.read_bytes()
    cache_before = cache_path.read_bytes()
    monkeypatch.setattr(isochrones, "load_raw_buildings", _buildings)
    monkeypatch.setattr(isochrones, "ISOCHRONES_OUTPUT_PATH", warm_path)
    monkeypatch.setattr(isochrones, "ISOCHRONE_CACHE_DIR", cache_dir)
    monkeypatch.setenv("PIPELINE_FORBID_MAPBOX", "1")
    _forbid_network_and_writes(monkeypatch)

    caplog.set_level(logging.INFO)
    with pytest.raises(RuntimeError, match="Mapbox requests forbidden"):
        isochrones.run_isochrones()

    assert warm_path.read_bytes() == warm_before
    assert cache_path.read_bytes() == cache_before
    assert any("mapbox_requests_required=" in record.message for record in caplog.records)
    assert any("mapbox_requests_attempted=0" in record.message for record in caplog.records)


def test_forbid_mapbox_invalid_warm_is_terminal_even_when_all_caches_exist(
    monkeypatch, tmp_path, caplog
):
    warm_path = tmp_path / "isochrones.geojson"
    _write_warm_aggregate(warm_path, _all_keys()[:-1])
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    centroids = isochrones._building_centroids_wgs84(_buildings())
    cache_paths = []
    payloads = [
        {"type": "FeatureCollection", "features": []},
        {"type": "FeatureCollection", "features": [{"properties": {}}]},
    ]
    for row, payload in zip(centroids.itertuples(), payloads):
        cache_path = cache_dir / f"{row.geometry.x:.5f}_{row.geometry.y:.5f}.json"
        cache_path.write_text(json.dumps(payload), encoding="utf-8")
        cache_paths.append(cache_path)
    warm_before = warm_path.read_bytes()
    cache_before = {path: path.read_bytes() for path in cache_paths}
    monkeypatch.setattr(isochrones, "load_raw_buildings", _buildings)
    monkeypatch.setattr(isochrones, "ISOCHRONES_OUTPUT_PATH", warm_path)
    monkeypatch.setattr(isochrones, "ISOCHRONE_CACHE_DIR", cache_dir)
    monkeypatch.setenv("PIPELINE_FORBID_MAPBOX", "1")
    _forbid_network_and_writes(monkeypatch)
    monkeypatch.setattr(
        isochrones,
        "_building_centroids_wgs84",
        _raise_boundary("centroid/cache preparation"),
    )
    monkeypatch.setattr(
        isochrones,
        "_guarded_requests_required",
        _raise_boundary("cache inspection"),
    )
    monkeypatch.setattr(
        isochrones,
        "_fetch_all_isochrones",
        _raise_boundary("cache rebuild"),
    )

    caplog.set_level(logging.INFO)
    with pytest.raises(RuntimeError, match="Mapbox requests forbidden"):
        isochrones.run_isochrones()

    assert warm_path.read_bytes() == warm_before
    assert {path: path.read_bytes() for path in cache_paths} == cache_before
    assert any("mapbox_requests_required=1" in record.message for record in caplog.records)
    assert any("mapbox_requests_attempted=0" in record.message for record in caplog.records)


def test_forbid_mapbox_absent_aggregate_aborts_before_centroid_cache_work(
    monkeypatch, tmp_path, caplog
):
    warm_path = tmp_path / "missing-isochrones.geojson"
    output_dir = tmp_path / "output"
    assert not output_dir.exists()
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    centroids = isochrones._building_centroids_wgs84(_buildings())
    cache_paths = []
    for row in centroids.itertuples():
        cache_path = cache_dir / f"{row.geometry.x:.5f}_{row.geometry.y:.5f}.json"
        cache_path.write_text(
            json.dumps({"type": "FeatureCollection", "features": []}),
            encoding="utf-8",
        )
        cache_paths.append(cache_path)
    cache_before = {path: path.read_bytes() for path in cache_paths}
    monkeypatch.setattr(isochrones, "load_raw_buildings", _buildings)
    monkeypatch.setattr(isochrones, "OUTPUT_DIR", output_dir)
    monkeypatch.setattr(isochrones, "ISOCHRONES_OUTPUT_PATH", warm_path)
    monkeypatch.setattr(isochrones, "ISOCHRONE_CACHE_DIR", cache_dir)
    monkeypatch.setenv("PIPELINE_FORBID_MAPBOX", "1")
    _forbid_network_and_writes(monkeypatch)
    monkeypatch.setattr(
        isochrones,
        "_building_centroids_wgs84",
        _raise_boundary("centroid/cache preparation"),
    )
    monkeypatch.setattr(
        isochrones,
        "_guarded_requests_required",
        _raise_boundary("cache inspection"),
    )
    monkeypatch.setattr(
        isochrones,
        "_fetch_all_isochrones",
        _raise_boundary("cache rebuild"),
    )

    caplog.set_level(logging.INFO)
    with pytest.raises(RuntimeError, match="Mapbox requests forbidden"):
        isochrones.run_isochrones()

    assert not output_dir.exists()
    assert not warm_path.exists()
    assert {path: path.read_bytes() for path in cache_paths} == cache_before
    assert any("mapbox_requests_required=2" in record.message for record in caplog.records)
    assert any("mapbox_requests_attempted=0" in record.message for record in caplog.records)


@pytest.mark.parametrize(
    ("case", "keys"),
    [
        ("missing", _all_keys()[:-1]),
        ("extra", _all_keys() + [(303, 5)]),
        ("duplicate", _all_keys() + [_all_keys()[0]]),
        ("null", _all_keys()[:-1] + [(None, 15)]),
        ("bool", _all_keys()[:-1] + [(True, 15)]),
        ("non_integral", _all_keys()[:-1] + [(202, 15.5)]),
        ("non_finite", _all_keys()[:-1] + [(202, math.inf)]),
    ],
)
def test_forbid_mapbox_rejects_invalid_warm_keys_without_mutation(
    monkeypatch, tmp_path, case, keys
):
    warm_path = tmp_path / f"{case}.geojson"
    warm_path.write_bytes(b"guarded-warm-sentinel")
    before = warm_path.read_bytes()
    frame = gpd.GeoDataFrame(
        {
            "building_id": [building_id for building_id, _ in keys],
            "minutes": [minutes for _, minutes in keys],
        },
        geometry=[Point(34.7, 31.2) for _ in keys],
        crs="EPSG:4326",
    )

    def fake_read_file(_path, **kwargs):
        if kwargs.get("rows") == 1:
            return frame.iloc[:1]
        return frame

    monkeypatch.setattr(isochrones.gpd, "read_file", fake_read_file)
    monkeypatch.setattr(isochrones, "load_raw_buildings", _buildings)
    monkeypatch.setattr(isochrones, "ISOCHRONES_OUTPUT_PATH", warm_path)
    monkeypatch.setattr(isochrones, "ISOCHRONE_CACHE_DIR", tmp_path / "cache")
    monkeypatch.setenv("PIPELINE_FORBID_MAPBOX", "1")
    _forbid_network_and_writes(monkeypatch)

    with pytest.raises(RuntimeError, match="Mapbox requests forbidden"):
        isochrones.run_isochrones()

    assert warm_path.read_bytes() == before


def test_actual_http_attempt_counter_increments_at_session_get(monkeypatch, tmp_path):
    class Response:
        status_code = 200
        headers = {}
        text = '{"type":"FeatureCollection","features":[]}'

        def raise_for_status(self):
            return None

        def json(self):
            return {"type": "FeatureCollection", "features": []}

    class Session:
        def get(self, *_args, **_kwargs):
            assert isochrones.get_mapbox_requests_attempted() == 1
            return Response()

    monkeypatch.delenv("PIPELINE_FORBID_MAPBOX", raising=False)
    monkeypatch.setattr(isochrones, "ISOCHRONE_CACHE_DIR", tmp_path)
    monkeypatch.setattr(isochrones, "_get_session", Session)
    isochrones._reset_mapbox_request_counter()

    assert isochrones.fetch_isochrones(34.7, 31.2, "token") == {}
    assert isochrones.get_mapbox_requests_attempted() == 1
