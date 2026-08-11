from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point

import stages.rescore as rescore
import stages.urban95_scoring as urban95_scoring


def test_resolve_buildings_path_prefers_scored_buildings(tmp_path, monkeypatch):
    scored = tmp_path / "buildings_scored.geojson"
    gz = tmp_path / "buildings_accessibility.geojson.gz"
    plain = tmp_path / "buildings_accessibility.geojson"
    scored.write_text("{}")
    gz.write_bytes(b"\x1f\x8b")
    plain.write_text("{}")

    monkeypatch.setattr(rescore, "SCORED_BUILDINGS", scored)
    monkeypatch.setattr(rescore, "BUILDINGS_GZ", gz)
    monkeypatch.setattr(rescore, "BUILDINGS_GEOJSON", plain)

    assert rescore._resolve_buildings_path() == scored


def test_resolve_buildings_path_falls_back_to_publish_layers(tmp_path, monkeypatch):
    gz = tmp_path / "buildings_accessibility.geojson.gz"
    plain = tmp_path / "buildings_accessibility.geojson"
    scored = tmp_path / "buildings_scored.geojson"
    plain.write_text("{}")

    monkeypatch.setattr(rescore, "SCORED_BUILDINGS", scored)
    monkeypatch.setattr(rescore, "BUILDINGS_GZ", gz)
    monkeypatch.setattr(rescore, "BUILDINGS_GEOJSON", plain)

    assert rescore._resolve_buildings_path() == plain


def test_drop_stale_score_columns_removes_access_diagnostics_from_both_scorers():
    buildings = gpd.GeoDataFrame(
        {
            "access_school_10min": [100.0],
            "score_weighted_10min": [80.0],
            "unrelated": ["kept"],
        },
        geometry=[Point(0, 0)],
        crs="EPSG:2039",
    )

    for drop_stale in (rescore._drop_stale_score_columns, urban95_scoring._drop_stale_score_columns):
        result = drop_stale(buildings)
        assert "access_school_10min" not in result.columns
        assert "score_weighted_10min" not in result.columns
        assert result["unrelated"].tolist() == ["kept"]


def test_rescore_publishes_statuses_without_stale_weighted_fields(monkeypatch):
    buildings = gpd.GeoDataFrame(
        {
            "building_id": [1],
            "score_weighted_10min": [42.0],
            "score_expanded_10min": [70.0],
        },
        geometry=[Point(0, 0)],
        crs="EPSG:2039",
    )
    published = []

    monkeypatch.setattr(rescore, "_ensure_shade_si_prepared", lambda: None)
    monkeypatch.setattr(rescore, "_resolve_buildings_path", lambda: Path("buildings.geojson"))
    monkeypatch.setattr(rescore, "load_layer", lambda *_args, **_kwargs: buildings.copy())

    def append_statuses(frame, **_kwargs):
        assert "score_weighted_10min" not in frame.columns
        frame["u95_status_10min"] = "functioning"
        return frame

    monkeypatch.setattr(rescore, "append_urban95_statuses", append_statuses)
    monkeypatch.setattr(rescore, "write_scored_buildings", lambda frame, _path: published.append(frame.copy()))
    monkeypatch.setattr(rescore, "export_web", lambda frame: published.append(frame.copy()))
    monkeypatch.setattr(rescore, "_log_status_distribution", lambda _frame: None)

    rescore.rescore_urban95_statuses()

    assert len(published) == 2
    for frame in published:
        assert "score_weighted_10min" not in frame.columns
        assert frame.loc[0, "u95_status_10min"] == "functioning"
