from __future__ import annotations

import os
from pathlib import Path

from core.proj_env import configure_proj_data, resolve_proj_data_dir


def test_resolve_proj_data_dir_finds_proj_db() -> None:
    path = resolve_proj_data_dir()
    assert path is not None
    assert (path / "proj.db").is_file()


def test_configure_proj_data_replaces_stale_conda_path(monkeypatch) -> None:
    monkeypatch.setenv("PROJ_DATA", "/opt/anaconda3/share/proj")
    monkeypatch.setenv("PROJ_LIB", "/opt/anaconda3/share/proj")
    chosen = configure_proj_data(force=True)
    assert chosen is not None
    assert os.environ["PROJ_DATA"] == str(chosen)
    assert os.environ["PROJ_LIB"] == str(chosen)
    assert not str(chosen).endswith("/share/proj")
    assert (chosen / "proj.db").is_file()


def test_configure_proj_data_keeps_non_conda_override(monkeypatch, tmp_path: Path) -> None:
    override = tmp_path / "proj"
    override.mkdir()
    (override / "proj.db").write_bytes(b"placeholder")
    monkeypatch.setenv("PROJ_DATA", str(override))
    monkeypatch.setenv("PROJ_LIB", str(override))
    result = configure_proj_data()
    assert result == override
    assert os.environ["PROJ_DATA"] == str(override)
