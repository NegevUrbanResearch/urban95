from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

import scripts.update_bs_data as update_bs_data


def test_preflight_run_all_start_checks_shade_and_isochrones_only(monkeypatch, capsys) -> None:
    seen: list[str] = []

    def fake_preflight(stage: str):
        seen.append(stage)
        return type("Report", (), {"ok": True, "missing_required": [], "missing_optional": [], "notes": []})()

    monkeypatch.setattr(update_bs_data, "preflight_stage", fake_preflight)
    update_bs_data._preflight_run_all_start()

    assert seen == ["shade", "isochrones"]
    output = capsys.readouterr().out
    assert "preflight stage=shade: OK" in output
    assert "preflight stage=isochrones: OK" in output


def test_preflight_run_all_start_fails_on_missing_required_input(monkeypatch) -> None:
    def fake_preflight(stage: str):
        ok = stage != "shade"
        return type(
            "Report",
            (),
            {
                "ok": ok,
                "missing_required": ["shade_street: missing"] if not ok else [],
                "missing_optional": [],
                "notes": [],
            },
        )()

    monkeypatch.setattr(update_bs_data, "preflight_stage", fake_preflight)

    with pytest.raises(RuntimeError, match="Pipeline preflight failed for shade"):
        update_bs_data._preflight_run_all_start()


def test_run_pipeline_invokes_pipeline_all_after_cold_start_preflight(monkeypatch) -> None:
    calls: list[object] = []

    monkeypatch.setattr(
        update_bs_data,
        "_preflight_run_all_start",
        lambda: calls.append("preflight"),
    )

    def fake_run(cmd, cwd, env, check):
        calls.append((cmd, cwd, env, check))
        return subprocess.CompletedProcess(cmd, 0)

    monkeypatch.setattr(update_bs_data.subprocess, "run", fake_run)

    update_bs_data.run_pipeline()

    assert calls[0] == "preflight"
    cmd, cwd, env, check = calls[1]
    assert cmd == [update_bs_data.sys.executable, "-m", "pipeline", "run", "all"]
    assert cwd == update_bs_data.REPO_ROOT
    assert env["PYTHONPATH"] == str(update_bs_data.SRC_DIR)
    assert "PROJ_DATA" in env
    assert Path(env["PROJ_DATA"], "proj.db").is_file()
    assert check is True
