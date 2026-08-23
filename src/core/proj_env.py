"""Align PROJ_DATA with the PROJ library actually loaded by Fiona/GDAL.

Anaconda often exports PROJ_DATA pointing at an older proj.db, while Fiona
ships a newer bundled libproj. That mismatch prints repeated:
  PROJ: ... DATABASE.LAYOUT.VERSION.MINOR = 2 whereas a number >= 3 is expected
without stopping the pipeline. Point PROJ_DATA/PROJ_LIB at a matching
database (prefer Fiona's own proj_data) before geospatial imports run.
"""
from __future__ import annotations

import os
from pathlib import Path


def resolve_proj_data_dir() -> Path | None:
    """Return a proj.db directory compatible with the active Fiona/PROJ stack."""
    candidates: list[Path] = []

    try:
        import fiona

        candidates.append(Path(fiona.__file__).resolve().parent / "proj_data")
    except Exception:
        pass

    candidates.extend(
        [
            Path("/opt/homebrew/share/proj"),
            Path("/usr/local/share/proj"),
        ]
    )

    for candidate in candidates:
        if (candidate / "proj.db").is_file():
            return candidate
    return None


def _looks_like_stale_conda_proj(path: Path | None) -> bool:
    if path is None:
        return False
    text = str(path).lower()
    return "anaconda" in text or "miniconda" in text


def configure_proj_data(*, force: bool = False) -> Path | None:
    """Set PROJ_DATA/PROJ_LIB for this process and child subprocesses.

    Replaces missing/invalid PROJ_DATA, and also replaces the common stale
    Anaconda share/proj path that mismatches Fiona's bundled libproj.
    Leaves other explicit valid overrides alone unless force=True.
    """
    chosen = resolve_proj_data_dir()
    if chosen is None:
        return None

    current = os.environ.get("PROJ_DATA") or os.environ.get("PROJ_LIB")
    current_path = Path(current) if current else None
    current_ok = bool(current_path and (current_path / "proj.db").is_file())

    if not force and current_ok and not _looks_like_stale_conda_proj(current_path):
        return current_path

    os.environ["PROJ_DATA"] = str(chosen)
    os.environ["PROJ_LIB"] = str(chosen)
    try:
        import pyproj

        pyproj.datadir.set_data_dir(str(chosen))
    except Exception:
        pass
    return chosen
