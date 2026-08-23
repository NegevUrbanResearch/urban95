#!/usr/bin/env python3
"""Validate municipal Beer Sheva inputs and refresh pipeline publish artifacts."""
from __future__ import annotations

import argparse
import logging
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = REPO_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from core.preflight import format_report, preflight_stage  # noqa: E402
from core.proj_env import configure_proj_data  # noqa: E402
from lib.bs_data_refresh import (  # noqa: E402
    BUILDINGS_SOURCE_NAME,
    TREES_SOURCE_NAME,
    prepare_canonical_inputs,
)

# Fix Anaconda PROJ_DATA vs Fiona bundled libproj mismatch before any I/O.
configure_proj_data()

logger = logging.getLogger(__name__)


def _format_bytes(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes} B"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    return f"{num_bytes / (1024 * 1024):.1f} MB"


def _print_prepare_summary(result) -> None:
    for label, stats in (("Buildings", result.buildings), ("Trees", result.trees)):
        residential = (
            f", {stats.residential_count} residential"
            if stats.residential_count is not None
            else ""
        )
        print(
            f"{label}: {stats.feature_count} source features{residential} "
            f"-> {_format_bytes(stats.bytes_written)} at {stats.output_path}"
        )


def _pipeline_env() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(SRC_DIR)
    configure_proj_data()
    proj_data = os.environ.get("PROJ_DATA")
    if proj_data:
        env["PROJ_DATA"] = proj_data
        env["PROJ_LIB"] = proj_data
    return env


def _preflight_run_all_start() -> None:
    for stage in ("shade", "isochrones"):
        report = preflight_stage(stage)
        print(format_report(report, title=f"preflight stage={stage}"))
        if not report.ok:
            raise RuntimeError(
                f"Pipeline preflight failed for {stage}; fix missing inputs before rebuilding."
            )


def run_pipeline() -> None:
    # `pipeline run all` supports a cold rebuild. Its own implementation only
    # requires `shade` and `isochrones` inputs up front because later stages
    # consume in-memory handoffs instead of pre-existing output files.
    _preflight_run_all_start()

    cmd = [sys.executable, "-m", "pipeline", "run", "all"]
    logger.info("Running: %s", " ".join(cmd))
    subprocess.run(cmd, cwd=REPO_ROOT, env=_pipeline_env(), check=True)


def run_pmtiles() -> None:
    script = REPO_ROOT / "scripts" / "build_buildings_pmtiles.py"
    cmd = [sys.executable, str(script), "--all"]
    logger.info("Running: %s", " ".join(cmd))
    subprocess.run(cmd, cwd=REPO_ROOT, env=_pipeline_env(), check=True)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Validate data/raw/buildings_BS.geojson and data/raw/trees_BS.geojson, "
            "write canonical gzip raw inputs, and optionally rebuild publish artifacts."
        ),
    )
    parser.add_argument(
        "--prepare-only",
        action="store_true",
        help="Validate sources and write data/raw/*.geojson.gz without running the pipeline.",
    )
    parser.add_argument(
        "--skip-pmtiles",
        action="store_true",
        help="Run the pipeline but skip PMTiles and lookup regeneration.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    args = parse_args(argv)

    print(f"Beer Sheva data refresh under {REPO_ROOT / 'data' / 'raw'}")
    print(f"Sources: {BUILDINGS_SOURCE_NAME}, {TREES_SOURCE_NAME}")

    try:
        result = prepare_canonical_inputs()
    except (FileNotFoundError, ValueError) as exc:
        logger.error("%s", exc)
        return 1

    _print_prepare_summary(result)

    if args.prepare_only:
        print("Prepare-only complete.")
        return 0

    try:
        run_pipeline()
        if not args.skip_pmtiles:
            run_pmtiles()
    except subprocess.CalledProcessError as exc:
        logger.error("Rebuild command failed with exit code %s", exc.returncode)
        return exc.returncode or 1
    except RuntimeError as exc:
        logger.error("%s", exc)
        return 1

    print("Beer Sheva data refresh complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
