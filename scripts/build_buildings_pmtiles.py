#!/usr/bin/env python3
"""
Build vector tiles for Urban95 building footprints as PMTiles for MapLibre.

Prerequisites
-------------
- **Docker** installed and running (daemon reachable from this machine).
- Pull images once before first run::

    docker pull ingmapping/tippecanoe
    docker pull protomaps/go-pmtiles

- Python package **pmtiles** (listed in ``requirements.txt``) is used only when
  the intermediate MBTiles is small (< 2 MiB); larger archives are converted
  via the ``protomaps/go-pmtiles`` Docker image.

Input/output defaults match the static site layout::

    docs/data/buildings_accessibility.geojson  →  docs/data/buildings_accessibility.pmtiles

Usage (from repository root)::

    python scripts/build_buildings_pmtiles.py
    python scripts/build_buildings_pmtiles.py --input path/to/buildings.geojson --output path/out.pmtiles

Tippecanoe uses ``--layer=buildings`` so the MapLibre ``source-layer`` must be
``buildings``. Polygon geometry is preserved with ``--no-line-simplification``
(no line simplification on building outlines). Zoom range 10–18 suits the Beer
Sheva urban map scale.
"""

from __future__ import annotations

import argparse
import logging
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

TIPPECANOE_IMAGE = "ingmapping/tippecanoe"
PMTILES_IMAGE = "protomaps/go-pmtiles"

DEFAULT_INPUT = Path("docs/data/buildings_accessibility.geojson")
DEFAULT_OUTPUT = Path("docs/data/buildings_accessibility.pmtiles")

SAFE_INPUT_NAME = "_docker_input.geojson"
SAFE_OUTPUT_MB = "_docker_output.mbtiles"
MBTILES_TO_PMTILES_THRESHOLD_MB = 2.0


def to_docker_path(path: Path) -> str:
    """Convert path to Docker-compatible format (for Windows/WSL)."""
    if sys.platform == "win32":
        abs_path = str(path.resolve()).replace("\\", "/")
        if ":" in abs_path:
            drive, rest = abs_path.split(":", 1)
            return f"/{drive.lower()}{rest}"
        return abs_path
    return str(path.resolve())


def run_tippecanoe_buildings(input_file: Path, output_mbtiles: Path) -> bool:
    """Run tippecanoe via Docker with ASCII-safe temp filenames."""
    temp_dir = input_file.parent / f"_tmp_tile_{uuid.uuid4().hex}"
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        shutil.copy2(input_file, temp_dir / SAFE_INPUT_NAME)

        docker_cmd = [
            "docker",
            "run",
            "--rm",
            "-v",
            f"{to_docker_path(temp_dir)}:/work",
            TIPPECANOE_IMAGE,
            "tippecanoe",
            "-o",
            f"/work/{SAFE_OUTPUT_MB}",
            f"/work/{SAFE_INPUT_NAME}",
            "--layer=buildings",
            "--force",
            "--minimum-zoom=10",
            "--maximum-zoom=18",
            "--no-feature-limit",
            "--no-tile-size-limit",
            "--no-line-simplification",
            "--detect-shared-borders",
            "--drop-densest-as-needed",
            "--quiet",
        ]

        result = subprocess.run(
            docker_cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

        success = (temp_dir / SAFE_OUTPUT_MB).exists()

        if result.returncode != 0 or not success:
            logger.error(
                "Tippecanoe failed for %s (exit code %s)",
                input_file.name,
                result.returncode,
            )
            logger.error("STDOUT: %s", result.stdout)
            logger.error("STDERR: %s", result.stderr)
            if not success:
                return False

        if output_mbtiles.exists():
            output_mbtiles.unlink()
        shutil.move(temp_dir / SAFE_OUTPUT_MB, output_mbtiles)

        return success
    except Exception as exc:
        logger.error("Tippecanoe exception for %s: %s", input_file.name, exc)
        return False
    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


def convert_mbtiles_to_pmtiles(mbtiles_path: Path, pmtiles_path: Path) -> bool:
    """Convert MBTiles to PMTiles (small files: Python; large: protomaps/go-pmtiles)."""
    try:
        if not mbtiles_path.exists():
            return False

        size_mb = mbtiles_path.stat().st_size / (1024 * 1024)

        if size_mb < MBTILES_TO_PMTILES_THRESHOLD_MB:
            from pmtiles.convert import mbtiles_to_pmtiles

            if pmtiles_path.exists():
                pmtiles_path.unlink()
            mbtiles_to_pmtiles(str(mbtiles_path), str(pmtiles_path), maxzoom=18)
            return pmtiles_path.exists()

        temp_dir = mbtiles_path.parent / f"_tmp_pmtiles_{uuid.uuid4().hex}"
        temp_dir.mkdir(parents=True, exist_ok=True)
        safe_in = "_in.mbtiles"
        safe_out = "_out.pmtiles"

        try:
            shutil.copy2(mbtiles_path, temp_dir / safe_in)

            docker_cmd = [
                "docker",
                "run",
                "--rm",
                "-v",
                f"{to_docker_path(temp_dir)}:/work",
                PMTILES_IMAGE,
                "convert",
                f"/work/{safe_in}",
                f"/work/{safe_out}",
            ]

            result = subprocess.run(docker_cmd, capture_output=True, text=True)

            success = (temp_dir / safe_out).exists()
            if result.returncode != 0 or not success:
                logger.error(
                    "PMTiles Docker conversion failed (exit code %s)",
                    result.returncode,
                )
                logger.error("STDOUT: %s", result.stdout)
                logger.error("STDERR: %s", result.stderr)
                if not success:
                    return False

            if pmtiles_path.exists():
                pmtiles_path.unlink()
            shutil.move(temp_dir / safe_out, pmtiles_path)
            return True
        finally:
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)

    except Exception as exc:
        logger.error("PMTiles conversion failed: %s", exc)
        return False


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build buildings_accessibility.pmtiles from GeoJSON via tippecanoe + PMTiles.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Input GeoJSON (default: {DEFAULT_INPUT})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output PMTiles path (default: {DEFAULT_OUTPUT})",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s: %(message)s",
    )

    input_path = args.input.resolve()
    output_path = args.output.resolve()

    if not input_path.is_file():
        logger.error("Input file not found: %s", input_path)
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)

    temp_mb = output_path.with_suffix(".mbtiles")
    logger.info("Tippecanoe Docker image: %s → layer buildings, zoom 10–18", TIPPECANOE_IMAGE)
    logger.info("Reading %s", input_path)

    if not run_tippecanoe_buildings(input_path, temp_mb):
        logger.error("Failed to produce MBTiles.")
        return 1

    logger.info("Converting MBTiles → PMTiles (%s)", output_path.name)
    if not convert_mbtiles_to_pmtiles(temp_mb, output_path):
        logger.error("Failed to convert to PMTiles.")
        if temp_mb.exists():
            temp_mb.unlink()
        return 1

    if temp_mb.exists():
        temp_mb.unlink()

    logger.info("Wrote %s", output_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
