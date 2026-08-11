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
