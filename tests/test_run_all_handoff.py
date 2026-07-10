from stages import amenity_metrics
from stages import export_web as export_web_mod
from stages import urban95_scoring
import geopandas as gpd
from shapely.geometry import Point, Polygon
from pipeline import cli

def test_run_all_passes_isochrones_and_single_scored_write(monkeypatch):
    calls = {"amenity_write": 0, "score_write": 0}
    monkeypatch.setattr(cli, "run_parallel_handlers", lambda stages: {s: 0.0 for s in stages})
    ok = type("R", (), {"ok": True, "missing_required": [], "omitted": []})()
    monkeypatch.setattr(cli, "preflight_stage", lambda s: ok)
    monkeypatch.setattr(cli, "format_report", lambda *a, **k: "ok")
    monkeypatch.setattr(cli, "_load_isochrones_gdf_for_all", lambda: {"injected": True})

    def fake_amenity(*, buildings=None, isochrones=None, write_output=True):
        assert isochrones == {"injected": True}
        if write_output:
            calls["amenity_write"] += 1
        return buildings if buildings is not None else gpd.GeoDataFrame()

    def fake_score(*, buildings=None, write_output=True):
        if write_output:
            calls["score_write"] += 1
        return buildings

    monkeypatch.setattr(amenity_metrics, "run_amenity_metrics_stage", fake_amenity)
    monkeypatch.setattr(urban95_scoring, "run_score", fake_score)
    monkeypatch.setattr(export_web_mod, "export_web", lambda buildings, **kwargs: None)
    monkeypatch.setattr(
        cli,
        "run_stage",
        lambda s: 0.0 if s == "neighborhoods" else (_ for _ in ()).throw(AssertionError(s)),
    )
    assert cli.run_all() == 0
    assert calls["amenity_write"] == 0
    assert calls["score_write"] == 1


def test_run_all_passes_isochrones_to_export(monkeypatch):
    """run_all should hand the in-memory isochrones GDF to export_web."""
    injected = {"injected": True}
    export_calls = []
    monkeypatch.setattr(cli, "run_parallel_handlers", lambda stages: {s: 0.0 for s in stages})
    ok = type("R", (), {"ok": True, "missing_required": [], "omitted": []})()
    monkeypatch.setattr(cli, "preflight_stage", lambda s: ok)
    monkeypatch.setattr(cli, "format_report", lambda *a, **k: "ok")
    monkeypatch.setattr(cli, "_load_isochrones_gdf_for_all", lambda: injected)

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
