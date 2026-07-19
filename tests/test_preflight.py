"""Non-vacuous preflight stage checks."""
from __future__ import annotations

import core.preflight as preflight_mod
from core.preflight import ALL_STAGES, preflight_stage


def test_amenity_metrics_fails_without_isochrones(monkeypatch):
    # Buildings present; isochrones intermediate + cache absent.
    monkeypatch.setattr(preflight_mod, "_exists", lambda path: "buildings" in str(path))
    monkeypatch.setattr(preflight_mod, "_nonempty_dir", lambda path: False)

    report = preflight_stage("amenity_metrics")
    assert report.ok is False
    assert any("isochrones" in m for m in report.missing_required)


def test_amenity_metrics_ok_with_isochrones_file(monkeypatch):
    def fake_exists(path):
        s = str(path).replace("\\", "/")
        if s.endswith("buildings.geojson.gz"):
            return True
        if s.endswith("isochrones/isochrones.geojson"):
            return True
        return False

    monkeypatch.setattr(preflight_mod, "_exists", fake_exists)
    monkeypatch.setattr(preflight_mod, "_nonempty_dir", lambda path: False)

    report = preflight_stage("amenity_metrics")
    assert report.ok is True
    assert not any("isochrones" in m for m in report.missing_required)


def test_export_web_requires_scored_buildings(monkeypatch):
    monkeypatch.setattr(preflight_mod, "_exists", lambda path: False)
    report = preflight_stage("export_web")
    assert report.ok is False
    assert any("SCORED_BUILDINGS" in m for m in report.missing_required)


def test_score_requires_scored_buildings(monkeypatch):
    monkeypatch.setattr(preflight_mod, "_exists", lambda path: False)
    report = preflight_stage("score")
    assert report.ok is False
    assert any("SCORED_BUILDINGS" in m for m in report.missing_required)


def test_survey_is_standalone_and_requires_all_raw_exports(monkeypatch):
    monkeypatch.setattr(preflight_mod, "_exists", lambda path: False)

    report = preflight_stage("survey")

    assert "survey" not in ALL_STAGES
    assert report.ok is False
    assert len(report.missing_required) == 4
