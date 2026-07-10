"""Compact buildings lookup JSON for web app random access."""
from __future__ import annotations

import gzip
import json
import logging
import math
import shutil
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

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
    ("nature", "urban_nature_areas"),
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
    "summer_si",
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
