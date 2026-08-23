#!/usr/bin/env python3
"""Seed data/raw/ from published stand-ins and local shade sources."""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

# Allow `python scripts/seed_provisional_raw.py` without PYTHONPATH when run from repo root.
_REPO_ROOT = Path(__file__).resolve().parent.parent
_SRC = _REPO_ROOT / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from core.paths import (  # noqa: E402
    DOCS_DATA_DIR,
    RAW_DIR,
    REPO_ROOT,
    SEED_MAP,
    SHADE_SEED_NAMES,
)

BEER_SHEVA_NAME = "amenities_beer_sheva.geojson"
BEER_SHEVA_CANDIDATES = (
    DOCS_DATA_DIR / BEER_SHEVA_NAME,
    REPO_ROOT / "new-data" / BEER_SHEVA_NAME,
    REPO_ROOT / BEER_SHEVA_NAME,
)

# Required SEED_MAP dests that must have a source available (or already exist).
_REQUIRED_SEED_DEST_SUFFIXES = (
    "amenities_clean.geojson",
)


def _norm(path: Path) -> str:
    return str(path).replace("\\", "/")


def _copy_if_missing(dest: Path, source: Path) -> str:
    """Copy source → dest when dest is absent. Returns status label."""
    if dest.exists():
        return "exists"
    if not source.exists():
        return "missing_source"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, dest)
    return "copied"


def _seed_map_pairs() -> list[tuple[str, Path, Path, str]]:
    results: list[tuple[str, Path, Path, str]] = []
    for dest, source in SEED_MAP:
        status = _copy_if_missing(dest, source)
        results.append((_norm(dest), dest, source, status))
        print(f"  [{status}] {_norm(dest)} <- {_norm(source)}")
    return results


def _seed_shade() -> tuple[bool, list[str]]:
    """Ensure SHADE_SEED_NAMES exist under data/raw/arcgis_shade/.

    Authoritative location is data/raw/arcgis_shade/ (collaborators commit these files).
    Legacy data/arcgis_shade/ was removed; if still present locally, copies once into raw.
    Returns (ok, missing_required_names). Required = the two .geojson shade layers;
    manifest.json is optional.
    """
    dest_dir = RAW_DIR / "arcgis_shade"
    legacy_dir = REPO_ROOT / "data" / "arcgis_shade"
    missing_required: list[str] = []
    required_names = {n for n in SHADE_SEED_NAMES if n.endswith(".geojson")}

    print(f"Shade: {_norm(dest_dir)} (authoritative)")
    for name in SHADE_SEED_NAMES:
        dest = dest_dir / name
        if dest.exists():
            print(f"  [exists] {_norm(dest)}")
            continue
        legacy_source = legacy_dir / name
        if legacy_source.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(legacy_source, dest)
            print(f"  [copied] {_norm(dest)} <- {_norm(legacy_source)} (legacy)")
            continue
        print(f"  [missing] {_norm(dest)}")
        if name in required_names:
            missing_required.append(name)
    return (len(missing_required) == 0, missing_required)


def _seed_beer_sheva() -> None:
    dest = RAW_DIR / BEER_SHEVA_NAME
    if dest.exists():
        print(f"  [exists] {_norm(dest)}")
        return
    for candidate in BEER_SHEVA_CANDIDATES:
        if candidate.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(candidate, dest)
            print(f"  [copied] {_norm(dest)} <- {_norm(candidate)}")
            return
    print(
        f"WARN: {BEER_SHEVA_NAME} not found in docs/data/, new-data/, or repo root; "
        "skipping (parked inventory, not scored)."
    )


def main() -> int:
    print(f"Seeding provisional raw under {RAW_DIR}")
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    print("SEED_MAP:")
    seed_results = _seed_map_pairs()

    print("amenities_beer_sheva:")
    _seed_beer_sheva()

    shade_ok, shade_missing = _seed_shade()

    errors: list[str] = []
    for dest_str, dest, source, status in seed_results:
        if any(dest_str.endswith(suf) for suf in _REQUIRED_SEED_DEST_SUFFIXES):
            if not dest.exists():
                errors.append(
                    f"required seed missing: {_norm(dest)} "
                    f"(source {_norm(source)} status={status})"
                )

    if not shade_ok:
        for name in shade_missing:
            errors.append(
                f"required shade layer missing under data/raw/arcgis_shade/: {name}"
            )

    if errors:
        print("ERROR: seed incomplete:", file=sys.stderr)
        for msg in errors:
            print(f"  - {msg}", file=sys.stderr)
        return 1

    print("Seed complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
