from __future__ import annotations

import json
import math
from collections.abc import Mapping
from pathlib import Path

from core.paths import SURVEY_SOURCE_FILES, layer

PUBLIC_PROPERTIES = ("question", "neighborhood", "comment")


def _load_collection(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if (
        not isinstance(payload, dict)
        or payload.get("type") != "FeatureCollection"
        or not isinstance(payload.get("features"), list)
    ):
        raise ValueError(f"{path}: expected GeoJSON FeatureCollection")
    return payload["features"]


def _sanitize_feature(feature: dict, category: str, path: Path, index: int) -> dict:
    if not isinstance(feature, dict):
        raise ValueError(f"{path} feature {index}: feature must be an object")
    geometry = feature.get("geometry")
    if not isinstance(geometry, dict):
        raise ValueError(f"{path} feature {index}: geometry must be an object")
    coordinates = geometry.get("coordinates")
    if geometry.get("type") != "Point" or not isinstance(coordinates, list) or len(coordinates) < 2:
        raise ValueError(f"{path} feature {index}: expected Point geometry")
    lon, lat = coordinates[0], coordinates[1]
    if not all(type(value) in (int, float) and math.isfinite(value) for value in (lon, lat)):
        raise ValueError(f"{path} feature {index}: coordinates must be finite numbers")
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise ValueError(f"{path} feature {index}: coordinates outside WGS84 bounds")
    properties = feature.get("properties")
    if not isinstance(properties, dict):
        raise ValueError(f"{path} feature {index}: properties must be an object")
    question = properties.get("question")
    neighborhood = properties.get("neighborhood")
    comment = properties.get("comment")
    if not isinstance(question, str) or not question:
        raise ValueError(f"{path} feature {index}: question must be a non-empty string")
    if not isinstance(neighborhood, str) or not neighborhood:
        raise ValueError(f"{path} feature {index}: neighborhood must be a non-empty string")
    if comment is None:
        comment = ""
    elif not isinstance(comment, str):
        raise ValueError(f"{path} feature {index}: comment must be a string or null")
    public = {"question": question, "neighborhood": neighborhood, "comment": comment}
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"survey_category": category, **public},
    }


def _raw_dedupe_key(feature: dict, category: str) -> str:
    return category + ":" + json.dumps(
        feature, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )


def publish_survey(raw_paths: Mapping[str, Path], web_output_path: Path) -> dict:
    features: list[dict] = []
    seen: set[str] = set()
    counts: dict[str, int] = {}
    skipped_invalid = 0
    skipped_duplicates = 0
    for category, path in raw_paths.items():
        counts[category] = 0
        for index, raw_feature in enumerate(_load_collection(path)):
            key = _raw_dedupe_key(raw_feature, category)
            if key in seen:
                skipped_duplicates += 1
                continue
            seen.add(key)
            try:
                feature = _sanitize_feature(raw_feature, category, path, index)
            except ValueError as exc:
                skipped_invalid += 1
                print(f"survey validation warning: {exc}")
                continue
            features.append(feature)
            counts[category] += 1
    web_output_path.parent.mkdir(parents=True, exist_ok=True)
    web_output_path.write_text(
        json.dumps(
            {"type": "FeatureCollection", "features": features},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    report = {
        "published_by_category": counts,
        "skipped_invalid": skipped_invalid,
        "skipped_duplicates": skipped_duplicates,
    }
    print(f"survey publication summary: {report}")
    return report


def publish_default_survey() -> dict:
    raw_paths = {
        category: layer(f"survey_raw_{category}").path
        for category in SURVEY_SOURCE_FILES
    }
    return publish_survey(raw_paths, layer("publish_survey").path)
