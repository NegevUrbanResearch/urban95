import argparse
import logging
import re

import geopandas as gpd
from core.preflight import PreflightReport
from pipeline import cli
from stages import amenity_metrics
from stages import export_web as export_web_mod
from stages import urban95_scoring


def test_run_stage_logs_elapsed(monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    monkeypatch.setitem(cli.STAGE_HANDLERS, "shade", lambda: None)
    elapsed = cli.run_stage("shade")
    assert isinstance(elapsed, float)
    assert elapsed >= 0.0
    assert any("stage=shade" in r.message and "elapsed_s=" in r.message for r in caplog.records)


def test_cmd_run_all_logs_pipeline_total(monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    monkeypatch.setattr(cli, "preflight_stage", lambda step: PreflightReport(ok=True))
    monkeypatch.setattr(cli, "format_report", lambda *a, **k: "")
    monkeypatch.setattr(cli, "run_parallel_handlers", lambda stages: {s: 0.0 for s in stages})
    monkeypatch.setattr(cli, "_load_isochrones_gdf_for_all", lambda: gpd.GeoDataFrame())
    monkeypatch.setattr(
        amenity_metrics,
        "run_amenity_metrics_stage",
        lambda **kw: gpd.GeoDataFrame(),
    )
    monkeypatch.setattr(urban95_scoring, "run_score", lambda **kw: gpd.GeoDataFrame())
    monkeypatch.setattr(export_web_mod, "export_web", lambda buildings, **kwargs: None)
    monkeypatch.setattr(cli, "run_stage", lambda s: 0.0)

    rc = cli.cmd_run(argparse.Namespace(stage="all"))
    assert rc == 0

    total_msgs = [r.message for r in caplog.records if "pipeline_all_total_s=" in r.message]
    assert len(total_msgs) == 1
    match = re.search(r"pipeline_all_total_s=([0-9.]+)", total_msgs[0])
    assert match is not None
    assert float(match.group(1)) >= 0.0

    for stage in ("amenity_metrics", "score", "export_web"):
        assert any(
            f"stage={stage}" in r.message and "elapsed_s=" in r.message
            for r in caplog.records
        )
