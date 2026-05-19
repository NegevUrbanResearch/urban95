#!/usr/bin/env python3
"""
Build Urban95 static-map performance artifacts.

The script produces:
- PMTiles for render-heavy GeoJSON layers.
- Compact JSON lookup artifacts for app logic that needs random access or
  all-feature analysis.

The filename remains build_buildings_pmtiles.py for compatibility with the
existing project workflow.
"""

from __future__ import annotations

import argparse
import gzip
import json
import logging
import math
import shutil
import subprocess
import sys
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

TIPPECANOE_IMAGE = "ingmapping/tippecanoe"
PMTILES_IMAGE = "protomaps/go-pmtiles"

SAFE_INPUT_NAME = "_docker_input.geojson"
SAFE_OUTPUT_MB = "_docker_output.mbtiles"
MBTILES_TO_PMTILES_THRESHOLD_MB = 2.0

MANIFEST_PATH = Path("docs/data/pmtiles_manifest.json")
BUILDING_LOOKUP_MINUTES = (5, 10, 15)
BUILDING_LOOKUP_URBAN95_MINUTES = 10
BUILDING_LOOKUP_CLEAN_POINT_KEYS = (
    "trees",
    "parks",
    "playgrounds",
    "street_lights",
    "bus_stops",
    "shelters",
    "education",
    "community_centers",
    "businesscenters",
    "health",
)
BUILDING_LOOKUP_EXPANDED_AMENITY_KEYS = (
    "commercial",
    "education",
    "financial_services",
    "fitness",
    "healthcare",
    "parks_and_recreation",
    "public_establishment",
    "public_institutions",
    "religious_institutions",
    "senior_services_and_living",
    "services",
    "shelters",
    "tourism",
    "transportation",
)
BUILDING_LOOKUP_WEIGHTED_CATEGORY_STEMS = (
    "environmental_quality",
    "nature",
    "play",
    "safety_mobility",
    "family_services",
)
BUILDING_LOOKUP_WEIGHTED_SUBCATEGORY_STEMS = (
    ("environmental_quality", "shade"),
    ("environmental_quality", "trees"),
    ("environmental_quality", "roads"),
    ("nature", "parks"),
    ("play", "playgrounds"),
    ("safety_mobility", "street_lights"),
    ("safety_mobility", "bicycle_access"),
    ("safety_mobility", "bus_stops"),
    ("safety_mobility", "shelters"),
    ("family_services", "education"),
    ("family_services", "community"),
    ("family_services", "business"),
    ("family_services", "health"),
)
BUILDING_LOOKUP_EXACT_FIELDS = {
    "building_id",
    "centroid_lng",
    "centroid_lat",
    "neighborhood",
    "neighborhood_name",
    "Name",
    "name",
}


def build_lookup_allowed_fields() -> set[str]:
    fields = set(BUILDING_LOOKUP_EXACT_FIELDS)
    for minutes in BUILDING_LOOKUP_MINUTES:
        sfx = f"_{minutes}min"
        fields.update(
            {
                f"num_amenities{sfx}",
                f"num_trees{sfx}",
                f"num_street_lights{sfx}",
                f"score_expanded{sfx}",
                f"score_clean{sfx}",
            }
        )
        for key in BUILDING_LOOKUP_CLEAN_POINT_KEYS:
            fields.add(f"clean_pts_{key}{sfx}")
        for key in BUILDING_LOOKUP_EXPANDED_AMENITY_KEYS:
            fields.add(f"amen_{key}{sfx}")

    sfx = f"_{BUILDING_LOOKUP_URBAN95_MINUTES}min"
    fields.add(f"score_weighted{sfx}")
    for stem in BUILDING_LOOKUP_WEIGHTED_CATEGORY_STEMS:
        fields.add(f"score_weighted_{stem}{sfx}")
    for category_stem, subcategory_stem in BUILDING_LOOKUP_WEIGHTED_SUBCATEGORY_STEMS:
        fields.add(f"score_weighted_sub_{category_stem}_{subcategory_stem}{sfx}")
    return fields


BUILDING_LOOKUP_ALLOWED_FIELDS = build_lookup_allowed_fields()


@dataclass(frozen=True)
class TileLayerSpec:
    name: str
    input_path: Path
    output_path: Path
    source_layer: str
    minzoom: int
    maxzoom: int
    geometry: str
    tippecanoe_flags: tuple[str, ...] = field(default_factory=tuple)


DEFAULT_TILE_LAYERS = (
    TileLayerSpec(
        name="buildings",
        input_path=Path("docs/data/buildings_accessibility.geojson"),
        output_path=Path("docs/data/buildings_accessibility.pmtiles"),
        source_layer="buildings",
        minzoom=10,
        maxzoom=18,
        geometry="polygon",
        tippecanoe_flags=("--no-line-simplification", "--detect-shared-borders"),
    ),
    TileLayerSpec(
        name="neighborhood_surface",
        input_path=Path("docs/data/neighborhood_surface.geojson"),
        output_path=Path("docs/data/neighborhood_surface.pmtiles"),
        source_layer="neighborhood_surface",
        minzoom=10,
        maxzoom=18,
        geometry="polygon",
        tippecanoe_flags=("--detect-shared-borders",),
    ),
    TileLayerSpec(
        name="roads",
        input_path=Path("docs/data/roads.geojson"),
        output_path=Path("docs/data/roads.pmtiles"),
        source_layer="roads",
        minzoom=10,
        maxzoom=18,
        geometry="line",
    ),
    TileLayerSpec(
        name="spatial_syntax_segments",
        input_path=Path("docs/data/spatial_syntax_segments.geojson"),
        output_path=Path("docs/data/spatial_syntax_segments.pmtiles"),
        source_layer="spatial_syntax_segments",
        minzoom=10,
        maxzoom=18,
        geometry="line",
    ),
    TileLayerSpec(
        name="trees",
        input_path=Path("docs/data/trees.geojson"),
        output_path=Path("docs/data/trees.pmtiles"),
        source_layer="trees",
        minzoom=13,
        maxzoom=18,
        geometry="point",
    ),
    TileLayerSpec(
        name="street_lights",
        input_path=Path("docs/data/street_lights.geojson"),
        output_path=Path("docs/data/street_lights.pmtiles"),
        source_layer="street_lights",
        minzoom=13,
        maxzoom=18,
        geometry="point",
    ),
)

TILE_LAYER_BY_NAME = {spec.name: spec for spec in DEFAULT_TILE_LAYERS}


def to_docker_path(path: Path) -> str:
    """Convert path to Docker-compatible format (for Windows/WSL)."""
    if sys.platform == "win32":
        abs_path = str(path.resolve()).replace("\\", "/")
        if ":" in abs_path:
            drive, rest = abs_path.split(":", 1)
            return f"/{drive.lower()}{rest}"
        return abs_path
    return str(path.resolve())


def manifest_entry(
    *,
    name: str,
    input_path: Path,
    output_path: Path,
    source_layer: str,
    status: str,
    byte_count: int = 0,
    note: str | None = None,
    extra_fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    entry = {
        "name": name,
        "input": input_path.as_posix(),
        "output": output_path.as_posix(),
        "source_layer": source_layer,
        "status": status,
        "bytes": byte_count,
    }
    if note is not None:
        entry["note"] = note
    if extra_fields:
        entry.update(extra_fields)
    return entry


def resolve_companion_gzip_path(path: Path) -> Path:
    return path.with_name(f"{path.name}.gz")


def resolve_json_source_path(path: Path) -> Path:
    if path.is_file():
        return path
    gzip_path = resolve_companion_gzip_path(path)
    if gzip_path.is_file():
        return gzip_path
    raise FileNotFoundError(f"Input file not found: {path}")


def is_gzip_path(path: Path) -> bool:
    return path.name.endswith(".gz")


def browser_output_path(path: str) -> str:
    posix_path = Path(path).as_posix()
    if posix_path.startswith("docs/"):
        return "./" + posix_path[len("docs/") :]
    if posix_path.startswith("data/"):
        return "./" + posix_path
    return posix_path


def load_feature_collection(path: Path) -> dict[str, Any]:
    source_path = resolve_json_source_path(path)
    if is_gzip_path(source_path):
        with gzip.open(source_path, "rt", encoding="utf-8") as handle:
            payload = json.load(handle)
    else:
        with source_path.open("rt", encoding="utf-8") as handle:
            payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("Expected top-level JSON object.")
    if payload.get("type") != "FeatureCollection":
        raise ValueError("Expected GeoJSON FeatureCollection.")
    features = payload.get("features")
    if not isinstance(features, list):
        raise ValueError("Expected FeatureCollection.features list.")
    return payload


def gzip_manifest_fields(output_path: Path) -> dict[str, Any]:
    gzip_path = resolve_companion_gzip_path(output_path)
    if not gzip_path.exists():
        return {}
    return {
        "gzip_output": browser_output_path(gzip_path.as_posix()),
        "gzip_bytes": gzip_path.stat().st_size,
    }


def extract_centroid(feature: dict[str, Any]) -> tuple[float | None, float | None]:
    properties = feature.get("properties")
    if isinstance(properties, dict):
        lng = properties.get("centroid_lng")
        lat = properties.get("centroid_lat")
        if isinstance(lng, (int, float)) and isinstance(lat, (int, float)):
            return float(lng), float(lat)

    geometry = feature.get("geometry")
    if not isinstance(geometry, dict):
        return None, None

    coordinates = geometry.get("coordinates")
    if coordinates is None:
        return None, None

    pairs: list[tuple[float, float]] = []

    def collect_pairs(value: Any) -> None:
        if isinstance(value, (list, tuple)):
            if len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
                pairs.append((float(value[0]), float(value[1])))
                return
            for item in value:
                collect_pairs(item)

    collect_pairs(coordinates)
    if not pairs:
        return None, None

    lng_sum = sum(pair[0] for pair in pairs)
    lat_sum = sum(pair[1] for pair in pairs)
    pair_count = len(pairs)
    return lng_sum / pair_count, lat_sum / pair_count


def slim_building_properties(props: dict[str, Any]) -> dict[str, Any]:
    slimmed: dict[str, Any] = {}
    for key, value in props.items():
        if key in BUILDING_LOOKUP_ALLOWED_FIELDS:
            slimmed[key] = value
    return slimmed


def write_gzip_copy(path: Path) -> Path | None:
    if not path.exists():
        return None
    gzip_path = path.with_name(f"{path.name}.gz")
    with path.open("rb") as source, gzip.open(gzip_path, "wb") as target:
        shutil.copyfileobj(source, target)
    return gzip_path


def point_record(
    feature: dict[str, Any],
    source: str,
    fallback_type: str | None = None,
) -> dict[str, Any] | None:
    if not isinstance(feature, dict):
        return None

    geometry = feature.get("geometry")
    properties = feature.get("properties")
    if not isinstance(geometry, dict) or not isinstance(properties, dict):
        return None
    if geometry.get("type") != "Point":
        return None

    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, (list, tuple)) or len(coordinates) < 2:
        return None

    lng = coordinates[0]
    lat = coordinates[1]
    if (
        not isinstance(lng, (int, float))
        or not isinstance(lat, (int, float))
        or isinstance(lng, bool)
        or isinstance(lat, bool)
    ):
        return None
    lng_value = float(lng)
    lat_value = float(lat)
    if (
        not math.isfinite(lng_value)
        or not math.isfinite(lat_value)
        or lng_value < -180.0
        or lng_value > 180.0
        or lat_value < -90.0
        or lat_value > 90.0
    ):
        return None

    record_type = properties.get("amenity_type") or fallback_type or source
    if not isinstance(record_type, str):
        record_type = str(record_type)

    name = (
        properties.get("name")
        or properties.get("Name")
        or properties.get("hebrew_name")
        or properties.get("hebrew_nam")
        or ""
    )
    if not isinstance(name, str):
        name = str(name)

    return {
        "type": record_type,
        "lng": lng_value,
        "lat": lat_value,
        "name": name,
    }


def run_tippecanoe_layer(spec: TileLayerSpec, source_path: Path, output_mbtiles: Path) -> bool:
    """Run tippecanoe via Docker with ASCII-safe temp filenames."""
    temp_dir = output_mbtiles.parent / f"_tmp_tile_{uuid.uuid4().hex}"
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        safe_input_path = temp_dir / SAFE_INPUT_NAME
        if is_gzip_path(source_path):
            with gzip.open(source_path, "rb") as source, safe_input_path.open("wb") as target:
                shutil.copyfileobj(source, target)
        else:
            shutil.copy2(source_path, safe_input_path)

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
            f"--layer={spec.source_layer}",
            "--force",
            f"--minimum-zoom={spec.minzoom}",
            f"--maximum-zoom={spec.maxzoom}",
            *spec.tippecanoe_flags,
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
        if result.returncode != 0:
            logger.error(
                "Tippecanoe failed for %s (exit code %s)",
                source_path.name,
                result.returncode,
            )
            logger.error("STDOUT: %s", result.stdout)
            logger.error("STDERR: %s", result.stderr)
            return False
        if not success:
            logger.error("Tippecanoe did not produce an output file for %s", source_path.name)
            logger.error("STDOUT: %s", result.stdout)
            logger.error("STDERR: %s", result.stderr)
            return False

        if output_mbtiles.exists():
            output_mbtiles.unlink()
        shutil.move(temp_dir / SAFE_OUTPUT_MB, output_mbtiles)
        return True
    except Exception as exc:
        logger.error("Tippecanoe exception for %s: %s", source_path.name, exc)
        return False
    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


def convert_mbtiles_to_pmtiles(
    mbtiles_path: Path,
    pmtiles_path: Path,
    maxzoom: int,
) -> bool:
    """Convert MBTiles to PMTiles (small files: Python; large: protomaps/go-pmtiles)."""
    try:
        if not mbtiles_path.exists():
            return False

        size_mb = mbtiles_path.stat().st_size / (1024 * 1024)

        if size_mb < MBTILES_TO_PMTILES_THRESHOLD_MB:
            from pmtiles.convert import mbtiles_to_pmtiles

            if pmtiles_path.exists():
                pmtiles_path.unlink()
            mbtiles_to_pmtiles(str(mbtiles_path), str(pmtiles_path), maxzoom=maxzoom)
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

            result = subprocess.run(
                docker_cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )

            success = (temp_dir / safe_out).exists()
            if result.returncode != 0:
                logger.error(
                    "PMTiles Docker conversion failed (exit code %s)",
                    result.returncode,
                )
                logger.error("STDOUT: %s", result.stdout)
                logger.error("STDERR: %s", result.stderr)
                return False
            if not success:
                logger.error("PMTiles Docker conversion did not produce an output file")
                logger.error("STDOUT: %s", result.stdout)
                logger.error("STDERR: %s", result.stderr)
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


def build_tile_layer(spec: TileLayerSpec) -> dict[str, Any]:
    try:
        source_path = resolve_json_source_path(spec.input_path)
    except FileNotFoundError:
        input_path = spec.input_path.resolve()
        logger.warning("Skipping %s; input file not found: %s", spec.name, input_path)
        return manifest_entry(
            name=spec.name,
            input_path=spec.input_path,
            output_path=spec.output_path,
            source_layer=spec.source_layer,
            status="skipped_missing_input",
        )

    input_path = source_path.resolve()
    output_path = spec.output_path.resolve()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_mbtiles = output_path.with_suffix(".mbtiles")

    logger.info(
        "Building %s (%s, zoom %s-%s)",
        spec.name,
        spec.geometry,
        spec.minzoom,
        spec.maxzoom,
    )
    logger.info("Reading %s", input_path)

    if not run_tippecanoe_layer(spec, input_path, temp_mbtiles):
        if temp_mbtiles.exists():
            temp_mbtiles.unlink()
        if output_path.exists():
            output_path.unlink()
        return manifest_entry(
            name=spec.name,
            input_path=source_path,
            output_path=spec.output_path,
            source_layer=spec.source_layer,
            status="failed",
        )

    logger.info("Converting MBTiles -> PMTiles (%s)", output_path.name)
    if not convert_mbtiles_to_pmtiles(temp_mbtiles, output_path, maxzoom=spec.maxzoom):
        if temp_mbtiles.exists():
            temp_mbtiles.unlink()
        if output_path.exists():
            output_path.unlink()
        return manifest_entry(
            name=spec.name,
            input_path=source_path,
            output_path=spec.output_path,
            source_layer=spec.source_layer,
            status="failed",
        )

    if temp_mbtiles.exists():
        temp_mbtiles.unlink()

    logger.info("Wrote %s", output_path)
    return manifest_entry(
        name=spec.name,
        input_path=source_path,
        output_path=spec.output_path,
        source_layer=spec.source_layer,
        status="built",
        byte_count=output_path.stat().st_size if output_path.exists() else 0,
    )


def build_buildings_lookup(input_path: Path, output_path: Path) -> dict[str, Any]:
    try:
        source_path = resolve_json_source_path(input_path)
        payload = load_feature_collection(source_path)
    except FileNotFoundError:
        logger.warning("Skipping buildings_lookup; input file not found: %s", input_path.resolve())
        return manifest_entry(
            name="buildings_lookup",
            input_path=input_path,
            output_path=output_path,
            source_layer="buildings_lookup",
            status="skipped_missing_input",
            note="Input file not found.",
        )
    except (OSError, json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.error("Failed to load buildings lookup source %s: %s", input_path, exc)
        return manifest_entry(
            name="buildings_lookup",
            input_path=input_path,
            output_path=output_path,
            source_layer="buildings_lookup",
            status="failed",
            note=str(exc),
        )

    compact_features: list[dict[str, Any]] = []
    for feature in payload["features"]:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            continue

        building_id = properties.get("building_id")
        if building_id is None:
            continue

        centroid_lng, centroid_lat = extract_centroid(feature)
        if centroid_lng is None or centroid_lat is None:
            continue

        compact_properties = slim_building_properties(properties)
        compact_properties["building_id"] = building_id
        compact_properties["centroid_lng"] = centroid_lng
        compact_properties["centroid_lat"] = centroid_lat
        compact_features.append(compact_properties)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            {"schema": 1, "features": compact_features},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    gzip_path = write_gzip_copy(output_path)

    extra_fields: dict[str, Any] = {
        "records": len(compact_features),
        "gzip_bytes": gzip_path.stat().st_size if gzip_path is not None and gzip_path.exists() else 0,
    }
    return manifest_entry(
        name="buildings_lookup",
        input_path=source_path,
        output_path=output_path,
        source_layer="buildings_lookup",
        status="built",
        byte_count=output_path.stat().st_size,
        extra_fields=extra_fields,
    )


def build_isochrones_lookup(input_path: Path, output_path: Path) -> dict[str, Any]:
    expected_minute_keys = {str(minutes) for minutes in BUILDING_LOOKUP_MINUTES}

    try:
        source_path = resolve_json_source_path(input_path)
        payload = load_feature_collection(input_path)
    except FileNotFoundError:
        logger.warning("Skipping isochrones_lookup; input file not found: %s", input_path.resolve())
        return manifest_entry(
            name="isochrones_lookup",
            input_path=input_path,
            output_path=output_path,
            source_layer="isochrones_lookup",
            status="skipped_missing_input",
            byte_count=0,
            note="Input file not found for isochrones lookup generation.",
            extra_fields={"records": 0},
        )
    except (OSError, json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.error("Failed to load isochrones lookup source %s: %s", input_path, exc)
        return manifest_entry(
            name="isochrones_lookup",
            input_path=input_path,
            output_path=output_path,
            source_layer="isochrones_lookup",
            status="failed",
            note=f"Invalid isochrones input: {exc}",
        )

    def is_finite_position(value: Any) -> bool:
        return (
            isinstance(value, list)
            and len(value) >= 2
            and isinstance(value[0], (int, float))
            and math.isfinite(value[0])
            and isinstance(value[1], (int, float))
            and math.isfinite(value[1])
        )

    def has_nested_positions(value: Any, depth: int) -> bool:
        if not isinstance(value, list) or not value:
            return False
        if depth == 0:
            return is_finite_position(value)
        return all(has_nested_positions(child, depth - 1) for child in value)

    def is_plausible_isochrone_geometry(value: Any) -> bool:
        if not isinstance(value, dict):
            return False
        geom_type = value.get("type")
        coordinates = value.get("coordinates")
        if geom_type == "Polygon":
            return has_nested_positions(coordinates, 2)
        if geom_type == "MultiPolygon":
            return has_nested_positions(coordinates, 3)
        return False

    by_building: dict[str, dict[str, Any]] = {}
    for feature in payload["features"]:
        if not isinstance(feature, dict):
            continue

        properties = feature.get("properties")
        geometry = feature.get("geometry")
        if not isinstance(properties, dict) or not isinstance(geometry, dict):
            continue

        building_id = properties.get("building_id")
        minutes = properties.get("minutes")
        if building_id is None or minutes is None:
            continue

        building_key = str(building_id)
        if isinstance(minutes, bool):
            note = (
                "Invalid isochrone lookup minutes for "
                f"building_id={building_key}: {minutes!r}."
            )
            logger.error("%s", note)
            return manifest_entry(
                name="isochrones_lookup",
                input_path=source_path,
                output_path=output_path,
                source_layer="isochrones_lookup",
                status="failed",
                byte_count=0,
                note=note,
                extra_fields={"records": 0},
            )

        if isinstance(minutes, int):
            minute_key = str(minutes)
        elif isinstance(minutes, float):
            if not minutes.is_integer():
                note = (
                    "Invalid isochrone lookup minutes for "
                    f"building_id={building_key}: {minutes!r}."
                )
                logger.error("%s", note)
                return manifest_entry(
                    name="isochrones_lookup",
                    input_path=source_path,
                    output_path=output_path,
                    source_layer="isochrones_lookup",
                    status="failed",
                    byte_count=0,
                    note=note,
                    extra_fields={"records": 0},
                )
            minute_key = str(int(minutes))
        else:
            minute_key = str(minutes)

        if minute_key not in expected_minute_keys:
            note = (
                "Invalid isochrone lookup minutes for "
                f"building_id={building_key}: {minutes!r}."
            )
            logger.error("%s", note)
            return manifest_entry(
                name="isochrones_lookup",
                input_path=source_path,
                output_path=output_path,
                source_layer="isochrones_lookup",
                status="failed",
                byte_count=0,
                note=note,
                extra_fields={"records": 0},
            )

        building_bucket = by_building.setdefault(building_key, {})
        if minute_key in building_bucket:
            note = (
                "Duplicate isochrone lookup entry for "
                f"building_id={building_key}, minutes={minute_key}."
            )
            logger.error("%s", note)
            return manifest_entry(
                name="isochrones_lookup",
                input_path=source_path,
                output_path=output_path,
                source_layer="isochrones_lookup",
                status="failed",
                byte_count=0,
                note=note,
                extra_fields={"records": 0},
            )
        if not is_plausible_isochrone_geometry(geometry):
            note = (
                "Invalid isochrone lookup geometry for "
                f"building_id={building_key}, minutes={minute_key}."
            )
            logger.error("%s", note)
            return manifest_entry(
                name="isochrones_lookup",
                input_path=source_path,
                output_path=output_path,
                source_layer="isochrones_lookup",
                status="failed",
                byte_count=0,
                note=note,
                extra_fields={"records": 0},
            )
        building_bucket[minute_key] = geometry

    shipped_by_building = {
        building_key: building_bucket
        for building_key, building_bucket in by_building.items()
        if set(building_bucket.keys()) == expected_minute_keys
    }
    skipped_partial_buildings = len(by_building) - len(shipped_by_building)
    records = sum(len(building_bucket) for building_bucket in shipped_by_building.values())

    payload_out = {"schema": 1, "by_building": shipped_by_building}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload_out, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    gzip_path = write_gzip_copy(output_path)

    extra_fields: dict[str, Any] = {
        "records": records,
        "gzip_bytes": gzip_path.stat().st_size if gzip_path is not None and gzip_path.exists() else 0,
    }
    if skipped_partial_buildings:
        extra_fields["skipped_partial_buildings"] = skipped_partial_buildings
    return manifest_entry(
        name="isochrones_lookup",
        input_path=source_path,
        output_path=output_path,
        source_layer="isochrones_lookup",
        status="built",
        byte_count=output_path.stat().st_size,
        extra_fields=extra_fields,
    )


def build_points_lookup(output_path: Path) -> dict[str, Any]:
    excluded_clean_types = {"bicycle_track"}
    source_specs = (
        ("amenities_clean", Path("docs/data/amenities_new.geojson"), None),
        ("amenities_legacy", Path("docs/data/amenities_all.geojson"), None),
        ("trees", Path("docs/data/trees.geojson"), "trees"),
        ("street_lights", Path("docs/data/street_lights.geojson"), "street-lights"),
    )

    payload_out: dict[str, Any] = {
        "schema": 1,
        "sources": {
            "amenities_clean": [],
            "amenities_legacy": [],
            "trees": [],
            "street_lights": [],
        },
    }
    source_counts: dict[str, int] = {}
    missing_sources: list[str] = []

    for source_name, input_path, fallback_type in source_specs:
        try:
            payload = load_feature_collection(input_path)
        except FileNotFoundError:
            logger.warning(
                "Points lookup optional input missing for %s: %s",
                source_name,
                input_path.resolve(),
            )
            source_counts[source_name] = 0
            missing_sources.append(source_name)
            continue
        except (OSError, json.JSONDecodeError, ValueError, TypeError) as exc:
            logger.error("Failed to load points lookup source %s: %s", input_path, exc)
            return manifest_entry(
                name="points_lookup",
                input_path=Path("docs/data"),
                output_path=output_path,
                source_layer="points_lookup",
                status="failed",
                note=f"Invalid {source_name} input: {exc}",
            )

        records: list[dict[str, Any]] = []
        for feature in payload["features"]:
            record = point_record(feature, source_name, fallback_type=fallback_type)
            if record is None:
                continue
            if source_name == "amenities_clean" and record["type"] in excluded_clean_types:
                continue
            records.append(record)

        payload_out["sources"][source_name] = records
        source_counts[source_name] = len(records)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload_out, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    gzip_path = write_gzip_copy(output_path)
    records_total = sum(source_counts.values())
    extra_fields: dict[str, Any] = {
        "records": records_total,
        "gzip_bytes": gzip_path.stat().st_size if gzip_path is not None and gzip_path.exists() else 0,
        "source_counts": source_counts,
    }
    note: str | None = None
    if missing_sources:
        extra_fields["missing_sources"] = missing_sources
        note = "Built with empty arrays for missing optional point sources."

    return manifest_entry(
        name="points_lookup",
        input_path=Path("docs/data"),
        output_path=output_path,
        source_layer="points_lookup",
        status="built",
        byte_count=output_path.stat().st_size,
        note=note,
        extra_fields=extra_fields,
    )


def selected_tile_specs(args: argparse.Namespace) -> list[TileLayerSpec]:
    if args.all or args.layer == "all":
        selected = list(DEFAULT_TILE_LAYERS)
    else:
        selected = [TILE_LAYER_BY_NAME[args.layer]]

    if (args.input or args.output) and len(selected) != 1:
        raise ValueError("--input and --output can only be used when building one layer.")

    if len(selected) == 1 and (args.input or args.output):
        spec = selected[0]
        selected = [
            TileLayerSpec(
                name=spec.name,
                input_path=args.input or spec.input_path,
                output_path=args.output or spec.output_path,
                source_layer=spec.source_layer,
                minzoom=spec.minzoom,
                maxzoom=spec.maxzoom,
                geometry=spec.geometry,
                tippecanoe_flags=spec.tippecanoe_flags,
            )
        ]

    return selected


def write_manifest(entries: list[dict[str, Any]], manifest_path: Path) -> None:
    existing_entries_by_name: dict[str, dict[str, Any]] = {}
    if manifest_path.exists():
        try:
            existing_payload = json.loads(manifest_path.read_text(encoding="utf-8"))
            for entry in existing_payload.get("entries", []):
                name = entry.get("name")
                if isinstance(name, str):
                    if (
                        entry.get("status") == "built"
                        and isinstance(entry.get("output"), str)
                        and not Path(entry["output"]).exists()
                    ):
                        entry = {
                            **entry,
                            "status": "skipped_missing_input",
                            "bytes": 0,
                            "note": "Output file missing when manifest was refreshed.",
                        }
                    existing_entries_by_name[name] = entry
        except json.JSONDecodeError:
            logger.warning("Existing manifest is invalid JSON; rewriting %s", manifest_path)

    for entry in entries:
        existing_entries_by_name[entry["name"]] = entry

    merged_entries = sorted(existing_entries_by_name.values(), key=lambda item: item["name"])
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_payload = {
        "generated_by": "scripts/build_buildings_pmtiles.py",
        "entries": merged_entries,
    }
    manifest_path.write_text(
        json.dumps(manifest_payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    built_entries = {
        entry["name"]: (
            {
                "status": entry["status"],
                "output": browser_output_path(entry["output"]),
                "source_layer": entry["source_layer"],
                **gzip_manifest_fields(Path(entry["output"])),
            }
        )
        for entry in merged_entries
        if entry.get("status") == "built"
    }
    manifest_path.with_suffix(".js").write_text(
        "window.URBAN95_GENERATED_ARTIFACTS = "
        + json.dumps(built_entries, indent=2, ensure_ascii=False)
        + ";\n",
        encoding="utf-8",
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build Urban95 PMTiles layers and optional lookup artifacts.",
    )
    layer_choices = [spec.name for spec in DEFAULT_TILE_LAYERS] + ["all"]
    parser.add_argument(
        "--layer",
        choices=layer_choices,
        default="buildings",
        help="Layer to build (default: buildings). Use 'all' to build every tile layer.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Build all PMTiles layers and, unless skipped, lookup artifacts.",
    )
    parser.add_argument(
        "--skip-lookups",
        action="store_true",
        help="Skip lookup artifact generation when building all layers.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=None,
        help="Override the input GeoJSON path for a single-layer build.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Override the output PMTiles path for a single-layer build.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s: %(message)s",
    )

    try:
        specs = selected_tile_specs(args)
    except ValueError as exc:
        logger.error("%s", exc)
        return 1

    entries = [build_tile_layer(spec) for spec in specs]

    build_all = args.all or args.layer == "all"
    if build_all and not args.skip_lookups:
        entries.append(
            build_buildings_lookup(
                Path("docs/data/buildings_accessibility.geojson"),
                Path("docs/data/buildings_lookup.json"),
            )
        )
        entries.append(
            build_isochrones_lookup(
                Path("docs/data/isochrones.geojson"),
                Path("docs/data/isochrones_lookup.json"),
            )
        )
        entries.append(build_points_lookup(Path("docs/data/points_lookup.json")))

    write_manifest(entries, MANIFEST_PATH)
    return 1 if any(entry["status"] == "failed" for entry in entries) else 0


if __name__ == "__main__":
    sys.exit(main())
