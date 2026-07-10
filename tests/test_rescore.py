from pathlib import Path

import stages.rescore as rescore


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
