from __future__ import annotations

import ast
import gzip
import json
import os
from pathlib import Path

import geopandas as gpd
import numpy as np
import pytest
from shapely.geometry import LineString, Point, Polygon, shape

from core.geojson_utils import (
    _write_minimal_geojson_stream,
    serialize_minimal_feature,
    write_minimal_geojson,
)
from core.atomic_files import commit_staged_files, staged_output_paths
from lib.buildings_lookup import (
    BuildingLookupCollector,
    build_buildings_lookup,
    extract_centroid,
)
import stages.export_web as export_web_stage


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "export_writer_contract"


def _export_fixture() -> gpd.GeoDataFrame:
    rows = json.loads((FIXTURE_DIR / "input.json").read_text(encoding="utf-8"))
    records = []
    for index, row in enumerate(rows):
        props = {key: value for key, value in row.items() if key != "geometry"}
        if index == 0:
            props["npint"] = np.int64(props["npint"])
            props["npfloat"] = np.float64(props["npfloat"])
            props["finite"] = float("nan")
        elif index == 1:
            props["npint"] = np.int64(props["npint"])
            props["npfloat"] = np.float64(props["npfloat"])
            props["finite"] = float("inf")
        else:
            props["npint"] = np.int64(props["npint"])
            props["npfloat"] = np.float64(props["npfloat"])
        geometry = None if row["geometry"] is None else shape(row["geometry"])
        records.append({**props, "geometry": geometry})
    return gpd.GeoDataFrame(records, geometry="geometry", crs="EPSG:4326")


def test_streamed_geojson_matches_authoritative_bytes(tmp_path):
    plain = tmp_path / "buildings.geojson"
    zipped = tmp_path / "buildings.geojson.gz"
    observed = []

    write_minimal_geojson(
        _export_fixture(),
        plain,
        precision=6,
        gzip_path=zipped,
        feature_observer=observed.append,
    )

    expected_bytes = ast.literal_eval(
        (FIXTURE_DIR / "authoritative.bytes").read_text(encoding="ascii")
    )
    assert plain.read_bytes() == expected_bytes
    with gzip.open(zipped, "rb") as handle:
        assert handle.read() == expected_bytes
    observed_bytes = json.dumps(
        {"type": "FeatureCollection", "features": observed},
        ensure_ascii=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    assert observed_bytes == expected_bytes


def test_missing_text_is_omitted_while_numeric_zero_and_nonfinite_stay_numeric(tmp_path):
    frame = gpd.GeoDataFrame(
        {
            "name": ["present", np.nan],
            "numeric": [0.0, np.nan],
        },
        geometry=[Point(34.5, 31.2), Point(34.6, 31.3)],
        crs="EPSG:4326",
    )
    output = tmp_path / "missing_text.geojson"

    write_minimal_geojson(frame, output)

    features = json.loads(output.read_text(encoding="utf-8"))["features"]
    assert features[1]["properties"].get("name") is None
    assert "name" not in features[1]["properties"]
    assert features[0]["properties"]["numeric"] == 0.0
    assert features[1]["properties"]["numeric"] == 0.0


def test_export_web_requires_overview_status_even_with_legacy_weighted_score():
    buildings = gpd.GeoDataFrame(
        {
            "building_id": [1],
            "score_weighted_10min": [42.0],
            "score_expanded_10min": [70.0],
        },
        geometry=[Point(34.5, 31.2)],
        crs="EPSG:4326",
    )

    with pytest.raises(ValueError, match="u95_status_10min"):
        export_web_stage.assert_buildings_have_scores(buildings)


def test_building_lookup_collector_uses_exact_rounded_feature_coordinates(tmp_path):
    frame = gpd.GeoDataFrame(
        {
            "building_id": [42],
            "u95_status_10min": ["functioning"],
            "score_weighted_10min": [42.0],
            "access_school_10min": [100.0],
            "access_kindergarten_10min": [50.0],
            "access_clinic_10min": [0.0],
            "access_tipat_halav_10min": [100.0],
        },
        geometry=[LineString([(0.0000005, 1.0000005), (1.0000005, 2.0000005)])],
        crs="EPSG:4326",
    )
    row = next(frame.itertuples(index=False, name=None))
    feature = serialize_minimal_feature(row, tuple(frame.columns), "geometry", 6)
    assert feature is not None
    output = tmp_path / "buildings_lookup.json"
    collector = BuildingLookupCollector(output, input_path=tmp_path / "buildings.geojson")
    with collector:
        collector(feature)
    result = collector.result

    assert result["status"] == "built"
    payload = json.loads(output.read_text(encoding="utf-8"))
    assert payload == {
        "schema": 1,
        "features": [
            {
                "building_id": 42,
                "u95_status_10min": "functioning",
                "access_school_10min": 100.0,
                "access_kindergarten_10min": 50.0,
                "access_clinic_10min": 0.0,
                "access_tipat_halav_10min": 100.0,
                "centroid_lng": 0.5000005,
                "centroid_lat": 1.5000010000000001,
            }
        ],
    }
    with gzip.open(output.with_name("buildings_lookup.json.gz"), "rt", encoding="utf-8") as handle:
        assert json.load(handle) == payload


def test_building_lookup_collector_streams_without_retaining_records(tmp_path):
    output = tmp_path / "buildings_lookup.json"
    collector = BuildingLookupCollector(output, input_path=tmp_path / "buildings.geojson")
    feature = {
        "type": "Feature",
        "properties": {"building_id": 1, "u95_status_10min": "functioning", "score_weighted_10min": 42.0},
        "geometry": {"type": "Point", "coordinates": [34.5, 31.2]},
    }

    with collector:
        for building_id in range(1_000):
            feature["properties"]["building_id"] = building_id
            collector(feature)

    assert collector.record_count == 1_000
    assert collector.result["records"] == 1_000


def test_legacy_buildings_lookup_helper_preserves_manifest_and_bytes(tmp_path):
    source = tmp_path / "buildings.geojson"
    output = tmp_path / "buildings_lookup.json"
    frame = gpd.GeoDataFrame(
        {"building_id": [7], "u95_status_10min": ["functioning"], "score_weighted_10min": [42.0]},
        geometry=[Point(34.5, 31.2)],
        crs="EPSG:4326",
    )
    write_minimal_geojson(frame, source, precision=5)

    result = build_buildings_lookup(source, output)

    assert result["status"] == "built"
    assert result["input"] == source.as_posix()
    assert result["output"] == output.as_posix()
    assert result["records"] == 1
    assert result["bytes"] == len(output.read_bytes())
    assert result["gzip_bytes"] == output.with_name(f"{output.name}.gz").stat().st_size
    assert json.loads(output.read_text(encoding="utf-8")) == {
        "schema": 1,
        "features": [
            {
                "building_id": 7,
                "u95_status_10min": "functioning",
                "centroid_lng": 34.5,
                "centroid_lat": 31.2,
            }
        ],
    }
    with gzip.open(output.with_name(f"{output.name}.gz"), "rb") as handle:
        assert handle.read() == output.read_bytes()


def test_streaming_writer_uses_level_six_and_closes_plain_on_gzip_open_failure(
    monkeypatch, tmp_path
):
    plain = tmp_path / "buildings.geojson"
    zipped = tmp_path / "buildings.geojson.gz"
    real_open = gzip.GzipFile
    levels = []

    def capture_open(*args, compresslevel=9, **kwargs):
        levels.append(compresslevel)
        return real_open(*args, compresslevel=compresslevel, **kwargs)

    monkeypatch.setattr("core.geojson_utils.gzip.GzipFile", capture_open)
    write_minimal_geojson(_export_fixture(), plain, gzip_path=zipped)
    assert levels == [6]

    def fail_open(*args, **kwargs):
        raise OSError("gzip open failed")

    plain.write_bytes(b"plain-sentinel")
    zipped.write_bytes(b"gzip-sentinel")
    before = sorted(path.name for path in tmp_path.iterdir())
    frame = _export_fixture()
    before = sorted(p.name for p in tmp_path.iterdir())
    monkeypatch.setattr("core.geojson_utils.gzip.GzipFile", fail_open)
    with pytest.raises(OSError, match="gzip open failed"):
        write_minimal_geojson(_export_fixture(), plain, gzip_path=zipped)
    assert plain.read_bytes() == b"plain-sentinel"
    assert zipped.read_bytes() == b"gzip-sentinel"
    assert sorted(path.name for path in tmp_path.iterdir()) == before
    assert sorted(p.name for p in tmp_path.iterdir()) == before


def test_commit_staged_files_restores_existing_and_absent_paths_on_install_failure(
    monkeypatch, tmp_path
):
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"
    first.write_bytes(b"first-old")
    staged = []
    with staged_output_paths((first, second)) as paths:
        paths[0].write_bytes(b"first-new")
        paths[1].write_bytes(b"second-new")
        staged.extend(paths)
        real_replace = os.replace
        calls = 0

        def fail_later(source, destination):
            nonlocal calls
            calls += 1
            if calls == 3:
                raise OSError("install failed")
            return real_replace(source, destination)

        monkeypatch.setattr("core.atomic_files.os.replace", fail_later)
        with pytest.raises(OSError, match="install failed"):
            commit_staged_files(tuple(zip(paths, (first, second), strict=True)))
    assert first.read_bytes() == b"first-old"
    assert not second.exists()
    assert sorted(p.name for p in tmp_path.iterdir()) == ["first.json"]


def test_lookup_collector_reentry_resets_state_after_success_and_failed_enter(tmp_path):
    output = tmp_path / "lookup.json"
    feature = {
        "type": "Feature",
        "properties": {"building_id": 1},
        "geometry": {"type": "Point", "coordinates": [34.5, 31.2]},
    }
    collector = BuildingLookupCollector(output)
    with collector:
        collector(feature)
    with collector:
        collector(feature)
    assert collector.result["records"] == 1
    assert json.loads(output.read_text(encoding="utf-8"))["features"] == [
        {"building_id": 1, "centroid_lng": 34.5, "centroid_lat": 31.2}
    ]


def test_staged_gzip_header_uses_canonical_filename(tmp_path):
    plain = tmp_path / "buildings.geojson"
    zipped = tmp_path / "buildings.geojson.gz"
    write_minimal_geojson(_export_fixture(), plain, gzip_path=zipped)
    header_name = zipped.stem.encode()
    assert zipped.read_bytes()[10 : 10 + len(header_name)] == header_name


def test_writer_body_error_remains_primary_when_gzip_close_also_fails(monkeypatch, tmp_path):
    plain = tmp_path / "buildings.geojson"
    zipped = tmp_path / "buildings.geojson.gz"
    plain.write_bytes(b"plain-sentinel")
    zipped.write_bytes(b"gzip-sentinel")
    before = sorted(path.name for path in tmp_path.iterdir())
    real_close = gzip.GzipFile.close

    def close_then_fail(self):
        real_close(self)
        raise OSError("gzip close failed")

    def observer(_feature):
        raise ValueError("observer failed")

    monkeypatch.setattr("core.geojson_utils.gzip.GzipFile.close", close_then_fail)
    with pytest.raises(ValueError, match="observer failed") as raised:
        write_minimal_geojson(
            _export_fixture(),
            plain,
            gzip_path=zipped,
            feature_observer=observer,
        )
    assert any("gzip close failed" in note for note in raised.value.__notes__)
    assert plain.read_bytes() == b"plain-sentinel"
    assert zipped.read_bytes() == b"gzip-sentinel"
    assert sorted(path.name for path in tmp_path.iterdir()) == before


def test_writer_gzip_construction_failure_preserves_original_when_cleanup_fails(monkeypatch, tmp_path):
    plain = tmp_path / "buildings.geojson"
    zipped = tmp_path / "buildings.geojson.gz"
    plain.write_bytes(b"plain-sentinel")
    zipped.write_bytes(b"gzip-sentinel")
    before = sorted(path.name for path in tmp_path.iterdir())
    frame = _export_fixture()
    def open_then_fail(*args, **kwargs):
        raise OSError("gzip construction failed")

    class Handle:
        closed = False

        def close(self):
            raise OSError("plain cleanup failed")

    monkeypatch.setattr("core.geojson_utils.gzip.GzipFile", open_then_fail)
    monkeypatch.setattr("core.geojson_utils.Path.open", lambda *_args, **_kwargs: Handle())
    with pytest.raises(OSError, match="gzip construction failed") as raised:
        write_minimal_geojson(frame, plain, gzip_path=zipped)
    assert any("cleanup failed" in note for note in getattr(raised.value, "__notes__", ()))
    monkeypatch.undo()
    assert plain.read_bytes() == b"plain-sentinel"
    assert zipped.read_bytes() == b"gzip-sentinel"
    assert sorted(path.name for path in tmp_path.iterdir()) == before


def test_writer_close_failure_without_body_error_preserves_canonicals_and_inventory(
    monkeypatch, tmp_path
):
    plain = tmp_path / "buildings.geojson"
    zipped = tmp_path / "buildings.geojson.gz"
    plain.write_bytes(b"plain-sentinel")
    zipped.write_bytes(b"gzip-sentinel")
    before = sorted(path.name for path in tmp_path.iterdir())
    real_close = gzip.GzipFile.close

    def close_then_fail(self):
        real_close(self)
        raise OSError("writer close failed")

    monkeypatch.setattr("core.geojson_utils.gzip.GzipFile.close", close_then_fail)
    with pytest.raises(OSError, match="writer close failed"):
        write_minimal_geojson(_export_fixture(), plain, gzip_path=zipped)
    assert plain.read_bytes() == b"plain-sentinel"
    assert zipped.read_bytes() == b"gzip-sentinel"
    assert sorted(path.name for path in tmp_path.iterdir()) == before


def test_collector_close_failure_preserves_canonical_pair(tmp_path, monkeypatch):
    output = tmp_path / "lookup.json"
    zipped = output.with_name(f"{output.name}.gz")
    output.write_bytes(b"lookup-sentinel")
    zipped.write_bytes(b"lookup-gzip-sentinel")
    before = sorted(path.name for path in tmp_path.iterdir())
    real_close = gzip.GzipFile.close

    def close_then_fail(self):
        real_close(self)
        raise OSError("lookup gzip close failed")

    monkeypatch.setattr("lib.buildings_lookup.gzip.GzipFile.close", close_then_fail)
    collector = BuildingLookupCollector(output)
    with pytest.raises(OSError, match="lookup gzip close failed"):
        with collector:
            collector(
                {
                    "properties": {"building_id": 1},
                    "geometry": {"type": "Point", "coordinates": [1, 2]},
                }
            )
    assert output.read_bytes() == b"lookup-sentinel"
    assert zipped.read_bytes() == b"lookup-gzip-sentinel"
    assert sorted(path.name for path in tmp_path.iterdir()) == before


def test_commit_backup_phase_failure_leaves_canonical_and_directory_clean(monkeypatch, tmp_path):
    canonical = tmp_path / "payload.json"
    canonical.write_bytes(b"sentinel")
    before = sorted(path.name for path in tmp_path.iterdir())
    with staged_output_paths((canonical,)) as staged:
        staged[0].write_bytes(b"new")

        def fail_backup(*_args, **_kwargs):
            raise OSError("backup failed")

        monkeypatch.setattr("core.atomic_files.os.replace", fail_backup)
        with pytest.raises(OSError, match="backup failed"):
            commit_staged_files(((staged[0], canonical),))
    assert canonical.read_bytes() == b"sentinel"
    assert sorted(path.name for path in tmp_path.iterdir()) == before


def test_commit_backup_failure_after_prior_backup_restores_all(monkeypatch, tmp_path):
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"
    first.write_bytes(b"first-sentinel")
    second.write_bytes(b"second-sentinel")
    before = sorted(path.name for path in tmp_path.iterdir())
    with staged_output_paths((first, second)) as staged:
        staged[0].write_bytes(b"first-new")
        staged[1].write_bytes(b"second-new")
        real_replace = os.replace
        calls = 0

        def fail_second_backup(source, destination):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("second backup failed")
            return real_replace(source, destination)

        monkeypatch.setattr("core.atomic_files.os.replace", fail_second_backup)
        with pytest.raises(OSError, match="second backup failed"):
            commit_staged_files(tuple(zip(staged, (first, second), strict=True)))
    assert first.read_bytes() == b"first-sentinel"
    assert second.read_bytes() == b"second-sentinel"
    assert sorted(path.name for path in tmp_path.iterdir()) == before


def test_collector_body_error_remains_primary_when_close_fails(monkeypatch, tmp_path):
    output = tmp_path / "lookup.json"
    zipped = output.with_name(f"{output.name}.gz")
    output.write_bytes(b"lookup-sentinel")
    zipped.write_bytes(b"lookup-gzip-sentinel")
    before = sorted(path.name for path in tmp_path.iterdir())
    real_close = gzip.GzipFile.close

    def close_then_fail(self):
        real_close(self)
        raise OSError("lookup close failed")

    monkeypatch.setattr("lib.buildings_lookup.gzip.GzipFile.close", close_then_fail)
    collector = BuildingLookupCollector(output)
    with pytest.raises(ValueError, match="lookup body failed") as raised:
        with collector:
            raise ValueError("lookup body failed")
    assert any("lookup close failed" in note for note in raised.value.__notes__)
    assert sorted(path.name for path in tmp_path.iterdir()) == before


def test_collector_reentry_after_failed_enter_resets_state(monkeypatch, tmp_path):
    output = tmp_path / "lookup.json"
    real_gzip_file = gzip.GzipFile
    calls = 0

    def fail_once(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise OSError("open failed")
        return real_gzip_file(*args, **kwargs)

    monkeypatch.setattr("lib.buildings_lookup.gzip.GzipFile", fail_once)
    collector = BuildingLookupCollector(output)
    with pytest.raises(OSError, match="open failed"):
        collector.__enter__()
    with collector:
        collector(
            {
                "properties": {"building_id": 5},
                "geometry": {"type": "Point", "coordinates": [1, 2]},
            }
        )
    assert collector.result["records"] == 1
    assert json.loads(output.read_text(encoding="utf-8"))["features"][0]["building_id"] == 5


def test_collector_failed_enter_preserves_original_when_cleanup_fails(monkeypatch, tmp_path):
    output = tmp_path / "lookup.json"
    before = sorted(path.name for path in tmp_path.iterdir())

    def fail_constructor(*args, **kwargs):
        raise OSError("collector constructor failed")

    class Handle:
        closed = False

        def close(self):
            raise OSError("collector cleanup failed")

    monkeypatch.setattr("lib.buildings_lookup.gzip.GzipFile", fail_constructor)
    monkeypatch.setattr("lib.buildings_lookup.Path.open", lambda *_args, **_kwargs: Handle())
    collector = BuildingLookupCollector(output)
    with pytest.raises(OSError, match="collector constructor failed") as raised:
        collector.__enter__()
    assert collector._stack is None
    assert any("cleanup failed" in note for note in getattr(raised.value, "__notes__", ()))
    monkeypatch.undo()
    assert sorted(path.name for path in tmp_path.iterdir()) == before


def test_collector_staged_metadata_failure_preserves_canonicals_and_inventory(
    monkeypatch, tmp_path
):
    output = tmp_path / "lookup.json"
    zipped = output.with_name(f"{output.name}.gz")
    output.write_bytes(b"lookup-sentinel")
    zipped.write_bytes(b"lookup-gzip-sentinel")
    before = sorted(path.name for path in tmp_path.iterdir())
    real_stat = Path.stat
    real_commit = commit_staged_files
    commit_called = False

    def fail_staged_stat(path, *args, **kwargs):
        if path.name.endswith(".stage"):
            raise OSError("staged metadata failed")
        return real_stat(path, *args, **kwargs)

    def capture_commit(pairs):
        nonlocal commit_called
        commit_called = True
        return real_commit(pairs)

    monkeypatch.setattr("lib.buildings_lookup.Path.stat", fail_staged_stat)
    monkeypatch.setattr("lib.buildings_lookup.commit_staged_files", capture_commit)
    collector = BuildingLookupCollector(output, input_path=tmp_path / "buildings.geojson")
    with pytest.raises(OSError, match="staged metadata failed"):
        with collector:
            collector(
                {
                    "properties": {"building_id": 1},
                    "geometry": {"type": "Point", "coordinates": [1, 2]},
                }
            )
    assert output.read_bytes() == b"lookup-sentinel"
    assert zipped.read_bytes() == b"lookup-gzip-sentinel"
    assert sorted(path.name for path in tmp_path.iterdir()) == before
    assert not commit_called


def test_staged_writer_and_lookup_preserve_fixed_time_gzip_bytes(monkeypatch, tmp_path):
    monkeypatch.setattr("core.geojson_utils.gzip.time.time", lambda: 1_700_000_000)
    monkeypatch.setattr("lib.buildings_lookup.gzip.time.time", lambda: 1_700_000_000)
    frame = _export_fixture()
    staged_dir = tmp_path / "staged"
    direct_dir = tmp_path / "direct"
    staged_dir.mkdir()
    direct_dir.mkdir()
    staged_plain = staged_dir / "buildings.geojson"
    staged_gzip = staged_dir / "buildings.geojson.gz"
    direct_plain = direct_dir / "buildings.geojson"
    direct_gzip = direct_dir / "buildings.geojson.gz"
    write_minimal_geojson(frame, staged_plain, precision=6, gzip_path=staged_gzip)
    _write_minimal_geojson_stream(
        frame,
        direct_plain,
        precision=6,
        gzip_path=direct_gzip,
        canonical_gzip_path=direct_gzip,
    )
    assert staged_gzip.read_bytes() == direct_gzip.read_bytes()

    staged_lookup = staged_dir / "buildings_lookup.json"
    direct_lookup = direct_dir / "buildings_lookup.json"
    with BuildingLookupCollector(staged_lookup, input_path=staged_plain):
        pass
    direct_physical = direct_dir / ".lookup.stage"
    direct_physical_gzip = direct_dir / ".lookup.stage.gz"
    direct_collector = BuildingLookupCollector(
        direct_lookup,
        input_path=direct_plain,
        physical_output_path=direct_physical,
        physical_gzip_path=direct_physical_gzip,
        commit_on_exit=False,
    )
    with direct_collector:
        pass
    assert staged_lookup.with_name(f"{staged_lookup.name}.gz").read_bytes() == direct_physical_gzip.read_bytes()


def test_export_web_four_file_commit_failure_preserves_inventory(monkeypatch, tmp_path):
    docs_data = tmp_path / "docs_data"
    docs_data.mkdir()
    buildings_path = docs_data / "buildings_accessibility.geojson"
    buildings_gzip_path = docs_data / "buildings_accessibility.geojson.gz"
    lookup_path = docs_data / "buildings_lookup.json"
    lookup_gzip_path = docs_data / "buildings_lookup.json.gz"
    canonical = (buildings_path, buildings_gzip_path, lookup_path, lookup_gzip_path)
    # Mix existing and originally absent destinations so rollback exercises both paths.
    for path in (buildings_path, lookup_gzip_path):
        path.write_bytes(f"sentinel:{path.name}".encode())
    before = sorted(path.name for path in docs_data.iterdir())
    monkeypatch.setattr(export_web_stage, "DOCS_DATA_DIR", docs_data)
    monkeypatch.setattr(export_web_stage, "AMENITIES_NEW_PATH", docs_data / "amenities_new.geojson")
    monkeypatch.setattr(export_web_stage, "STREET_LIGHTS_PATH", docs_data / "street_lights.geojson")
    monkeypatch.setattr(export_web_stage, "ISOCHRONES_WEB_PATH", docs_data / "isochrones.geojson")
    monkeypatch.setattr(
        export_web_stage,
        "layer",
        lambda layer_id: type("Layer", (), {"path": {
            "publish_buildings": buildings_path,
            "publish_buildings_lookup": lookup_path,
        }[layer_id]})(),
    )
    monkeypatch.setattr(export_web_stage, "_sync_raw_layer_to_docs", lambda *a, **k: None)
    monkeypatch.setattr(
        export_web_stage,
        "_resolve_amenities_legacy",
        lambda *a, **k: gpd.GeoDataFrame(geometry=[], crs="EPSG:4326"),
    )
    monkeypatch.setattr(export_web_stage, "_resolve_trees", lambda *a, **k: None)
    monkeypatch.setattr(export_web_stage, "_resolve_parks", lambda *a, **k: None)
    monkeypatch.setattr(export_web_stage, "get_building_isochrones", lambda *a, **k: {})
    props = {"building_id": [1], "u95_status_10min": ["functioning"], "score_weighted_10min": [42.0], "score_expanded_10min": [40.0]}
    buildings = gpd.GeoDataFrame(props, geometry=[Point(34.7, 31.2)], crs="EPSG:4326")

    real_replace = os.replace
    replace_calls = []
    call_count = 0

    def fail_later_install(source, destination):
        nonlocal call_count
        call_count += 1
        replace_calls.append((Path(source), Path(destination)))
        if call_count == 6:
            raise OSError("four-file install failed")
        return real_replace(source, destination)

    monkeypatch.setattr("core.atomic_files.os.replace", fail_later_install)
    with pytest.raises(OSError, match="four-file install failed"):
        export_web_stage.export_web(buildings)
    assert [destination for _, destination in replace_calls[2:6]] == list(canonical)
    assert sorted(path.name for path in docs_data.iterdir()) == before
    assert buildings_path.read_bytes() == f"sentinel:{buildings_path.name}".encode()
    assert lookup_gzip_path.read_bytes() == f"sentinel:{lookup_gzip_path.name}".encode()
    assert not buildings_gzip_path.exists()
    assert not lookup_path.exists()


def _metric_polygon(x: float, y: float, size: float = 20.0) -> Polygon:
    return Polygon(
        [(x, y), (x + size, y), (x + size, y + size), (x, y + size), (x, y)]
    )


@pytest.mark.filterwarnings("ignore:Conversion of an array.*:DeprecationWarning")
def test_export_web_integrates_streaming_lookup_gzip_policy_and_isochrone_crs(
    monkeypatch, tmp_path
):
    docs_data = tmp_path / "docs_data"
    raw = tmp_path / "raw"
    raw.mkdir()
    docs_data.mkdir()

    amenities_clean = raw / "amenities_clean.geojson"
    street_lights = raw / "street_lights.geojson"
    gpd.GeoDataFrame(
        {
            "amenity_type": ["education", "education", "health", "health"],
            "amenity_subtype": ["school", "kindergarten", "clinic", "tipat_halav"],
        },
        geometry=[
            Point(34.8, 31.25),
            Point(34.801, 31.251),
            Point(34.802, 31.252),
            Point(34.803, 31.253),
        ],
        crs="EPSG:4326",
    ).to_file(amenities_clean, driver="GeoJSON")
    gpd.GeoDataFrame(
        {"kind": ["light"]},
        geometry=[Point(34.81, 31.26)],
        crs="EPSG:4326",
    ).to_file(street_lights, driver="GeoJSON")

    paths = {
        "amenities_clean": amenities_clean,
        "street_lights": street_lights,
        "publish_buildings": docs_data / "buildings_accessibility.geojson",
        "publish_buildings_lookup": docs_data / "buildings_lookup.json",
    }
    monkeypatch.setattr(export_web_stage, "DOCS_DATA_DIR", docs_data)
    monkeypatch.setattr(export_web_stage, "AMENITIES_NEW_PATH", docs_data / "amenities_new.geojson")
    monkeypatch.setattr(export_web_stage, "STREET_LIGHTS_PATH", docs_data / "street_lights.geojson")
    monkeypatch.setattr(export_web_stage, "ISOCHRONES_WEB_PATH", docs_data / "isochrones.geojson")
    monkeypatch.setattr(
        export_web_stage,
        "layer",
        lambda layer_id: type("Layer", (), {"path": paths[layer_id]})(),
    )

    simplify_crs = []
    isochrone_projection_targets = []
    real_simplify = export_web_stage.simplify_geometries
    real_to_crs = gpd.GeoDataFrame.to_crs

    def capture_simplify(frame, tolerance):
        if "minutes" in frame.columns:
            simplify_crs.append(frame.crs.to_epsg())
        return real_simplify(frame, tolerance)

    monkeypatch.setattr(export_web_stage, "simplify_geometries", capture_simplify)

    def capture_to_crs(frame, *args, **kwargs):
        if "minutes" in frame.columns:
            isochrone_projection_targets.append(kwargs.get("epsg"))
        return real_to_crs(frame, *args, **kwargs)

    monkeypatch.setattr(gpd.GeoDataFrame, "to_crs", capture_to_crs)

    buildings = gpd.GeoDataFrame(
        {
            "building_id": [42],
            "u95_status_10min": ["functioning"],
            "score_weighted_10min": [42.0],
            "score_expanded_10min": [70.0],
        },
        geometry=[_metric_polygon(180_000, 570_000)],
        crs="EPSG:2039",
    )
    amenities_legacy = gpd.GeoDataFrame(
        {"amenity_type": ["school"], "name": ["school"]},
        geometry=[Point(180_010, 570_010)],
        crs="EPSG:2039",
    )
    trees = gpd.GeoDataFrame(
        geometry=[_metric_polygon(180_020, 570_020)], crs="EPSG:2039"
    )
    parks = gpd.GeoDataFrame(geometry=[], crs="EPSG:2039")
    isochrones = gpd.GeoDataFrame(
        {"building_id": [42], "minutes": [10]},
        geometry=[_metric_polygon(180_000, 570_000, size=200.0)],
        crs="EPSG:2039",
    ).to_crs(epsg=3857)
    isochrone_projection_targets.clear()

    export_web_stage.export_web(
        buildings,
        isochrones_gdf=isochrones,
        trees_gdf=trees,
        parks_gdf=parks,
        amenities_legacy_gdf=amenities_legacy,
    )

    assert simplify_crs == [2039]
    assert isochrone_projection_targets == [2039, 4326]
    assert not (docs_data / "amenities_new.geojson.gz").exists()
    companion_names = [
        "buildings_accessibility.geojson",
        "buildings_lookup.json",
        "street_lights.geojson",
        "amenities_all.geojson",
        "trees.geojson",
        "isochrones.geojson",
    ]
    for name in companion_names:
        plain = docs_data / name
        with gzip.open(docs_data / f"{name}.gz", "rb") as handle:
            assert handle.read() == plain.read_bytes()

    building_feature = json.loads(
        (docs_data / "buildings_accessibility.geojson").read_text(encoding="utf-8")
    )["features"][0]
    lookup_record = json.loads(
        (docs_data / "buildings_lookup.json").read_text(encoding="utf-8")
    )["features"][0]
    expected_lng, expected_lat = extract_centroid(building_feature)
    assert "score_weighted_10min" not in building_feature["properties"]
    assert building_feature["properties"]["u95_status_10min"] == "functioning"
    assert lookup_record["building_id"] == 42
    assert "score_weighted_10min" not in lookup_record
    assert lookup_record["u95_status_10min"] == "functioning"
    assert lookup_record["centroid_lng"] == expected_lng
    assert lookup_record["centroid_lat"] == expected_lat
