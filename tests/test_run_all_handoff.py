from stages import amenity_metrics
from stages import export_web as export_web_mod
from stages import urban95_scoring
import geopandas as gpd
from contextlib import contextmanager
from shapely.geometry import Point, Polygon
from pipeline import cli
from lib.amenity_layers import PreparedAmenityLayers
import logging
import pytest
import re


def _prepared_sentinel():
    frames = [
        gpd.GeoDataFrame({"marker": [name]}, geometry=[Point(i, 0)], crs="EPSG:2039")
        for i, name in enumerate(("legacy", "clean", "trees", "parks", "lights"))
    ]
    return PreparedAmenityLayers(*frames)


def test_run_all_passes_isochrones_and_single_scored_write(monkeypatch):
    calls = {"amenity_write": 0, "score_write": 0, "prepare": 0}
    prepared = _prepared_sentinel()
    export_calls = []
    monkeypatch.setattr(cli, "run_parallel_handlers", lambda stages: {s: 0.0 for s in stages})
    ok = type("R", (), {"ok": True, "missing_required": [], "omitted": []})()
    monkeypatch.setattr(cli, "preflight_stage", lambda s: ok)
    monkeypatch.setattr(cli, "format_report", lambda *a, **k: "ok")
    monkeypatch.setattr(cli, "_load_isochrones_gdf_for_all", lambda: {"injected": True})

    def fake_prepare(crs):
        assert crs == 2039
        calls["prepare"] += 1
        return prepared

    monkeypatch.setattr(amenity_metrics, "prepare_amenity_layers", fake_prepare)

    def fake_amenity(*, buildings=None, isochrones=None, write_output=True, prepared_layers=None):
        assert isochrones == {"injected": True}
        assert prepared_layers is prepared
        if write_output:
            calls["amenity_write"] += 1
        return buildings if buildings is not None else gpd.GeoDataFrame()

    def fake_score(*, buildings=None, write_output=True, reused_layers=None):
        assert reused_layers.trees is prepared.trees
        assert reused_layers.parks is prepared.parks
        assert reused_layers.street_lights is prepared.street_lights
        assert reused_layers.amenities_clean is prepared.amenities_clean
        if write_output:
            calls["score_write"] += 1
        return buildings

    monkeypatch.setattr(amenity_metrics, "run_amenity_metrics_stage", fake_amenity)
    monkeypatch.setattr(urban95_scoring, "run_score", fake_score)
    monkeypatch.setattr(
        export_web_mod,
        "export_web",
        lambda buildings, **kwargs: export_calls.append(kwargs),
    )
    monkeypatch.setattr(
        cli,
        "run_stage",
        lambda s: 0.0 if s == "neighborhoods" else (_ for _ in ()).throw(AssertionError(s)),
    )
    assert cli.run_all() == 0
    assert calls["amenity_write"] == 0
    assert calls["score_write"] == 1
    assert calls["prepare"] == 1
    assert len(export_calls) == 1
    assert export_calls[0]["isochrones_gdf"] == {"injected": True}
    assert export_calls[0]["trees_gdf"] is prepared.trees
    assert export_calls[0]["parks_gdf"] is prepared.parks
    assert export_calls[0]["amenities_legacy_gdf"] is prepared.amenities_legacy


@pytest.mark.parametrize("write_output", [True, False])
def test_run_score_output_write_phase_surrounds_writer_only_when_enabled(monkeypatch, caplog, write_output):
    buildings = gpd.GeoDataFrame({"building_id": [1]}, geometry=[Point(0, 0)], crs="EPSG:2039")
    monkeypatch.setattr(
        urban95_scoring,
        "append_weighted_urban95_scores",
        lambda frame, **_: frame,
    )
    writes = []
    events = []
    monkeypatch.setattr(
        urban95_scoring,
        "write_scored_buildings",
        lambda frame, path: (events.append("writer"), writes.append((frame, path))),
    )
    real_phase = urban95_scoring.logged_phase

    @contextmanager
    def tracked_phase(name):
        events.append(("phase-enter", name))
        try:
            with real_phase(name):
                yield
        finally:
            events.append(("phase-exit", name))

    monkeypatch.setattr(urban95_scoring, "logged_phase", tracked_phase)
    caplog.set_level(logging.INFO)

    urban95_scoring.run_score(buildings=buildings, write_output=write_output)

    phase_lines = [
        record.getMessage()
        for record in caplog.records
        if record.name == "core.perf" and record.getMessage().startswith("score_phase=")
    ]
    assert len(phase_lines) == int(write_output)
    if write_output:
        assert re.fullmatch(r"score_phase=score\.output\.write elapsed_s=\d+\.\d{3}", phase_lines[0])
        assert events == [("phase-enter", "score.output.write"), "writer", ("phase-exit", "score.output.write")]
    else:
        assert events == []
    assert len(writes) == int(write_output)


def test_run_all_passes_isochrones_to_export(monkeypatch):
    """run_all should hand the in-memory isochrones GDF to export_web."""
    injected = {"injected": True}
    prepared = _prepared_sentinel()
    export_calls = []
    monkeypatch.setattr(cli, "run_parallel_handlers", lambda stages: {s: 0.0 for s in stages})
    ok = type("R", (), {"ok": True, "missing_required": [], "omitted": []})()
    monkeypatch.setattr(cli, "preflight_stage", lambda s: ok)
    monkeypatch.setattr(cli, "format_report", lambda *a, **k: "ok")
    monkeypatch.setattr(cli, "_load_isochrones_gdf_for_all", lambda: injected)
    monkeypatch.setattr(amenity_metrics, "prepare_amenity_layers", lambda crs: prepared)

    monkeypatch.setattr(
        amenity_metrics,
        "run_amenity_metrics_stage",
        lambda **kw: gpd.GeoDataFrame(),
    )
    monkeypatch.setattr(
        urban95_scoring,
        "run_score",
        lambda **kw: gpd.GeoDataFrame({"building_id": [0]}),
    )

    def capture_export(buildings, **kwargs):
        export_calls.append({"buildings": buildings, **kwargs})

    monkeypatch.setattr(export_web_mod, "export_web", capture_export)
    monkeypatch.setattr(cli, "run_stage", lambda s: 0.0)
    assert cli.run_all() == 0
    assert len(export_calls) == 1
    assert export_calls[0]["isochrones_gdf"] is injected
    assert export_calls[0]["trees_gdf"] is prepared.trees
    assert export_calls[0]["parks_gdf"] is prepared.parks
    assert export_calls[0]["amenities_legacy_gdf"] is prepared.amenities_legacy


def test_amenity_stage_skips_get_building_isochrones_when_gdf_passed(monkeypatch):
    """Real stage path — not a full mock of run_amenity_metrics_stage."""
    buildings = gpd.GeoDataFrame(
        {"building_id": [0]},
        geometry=[Point(0, 0)],
        crs="EPSG:2039",
    )
    iso = gpd.GeoDataFrame(
        {"building_id": [0], "minutes": [5]},
        geometry=[Polygon([(-50, -50), (50, -50), (50, 50), (-50, -50)])],
        crs="EPSG:2039",
    )
    empty = gpd.GeoDataFrame(geometry=[], crs="EPSG:2039")

    def boom(*a, **k):
        raise AssertionError("get_building_isochrones must not be called")

    monkeypatch.setattr(amenity_metrics, "get_building_isochrones", boom)
    monkeypatch.setattr(
        amenity_metrics,
        "load_amenity_layers",
        lambda *args, **kwargs: (empty, empty, empty, empty, empty, None),
    )
    monkeypatch.setattr(
        amenity_metrics,
        "prepare_legacy_amenities",
        lambda legacy, merged_path, crs: (legacy, merged_path),
    )
    out = amenity_metrics.run_amenity_metrics_stage(
        buildings=buildings, isochrones=iso, write_output=False
    )
    assert len(out) == 1
    assert "building_id" in out.columns
