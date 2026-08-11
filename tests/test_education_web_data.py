"""Published education-layer text contract."""

from __future__ import annotations

from collections import Counter
import json
from pathlib import Path

import geopandas as gpd
import pytest
from shapely.geometry import Point

from lib import amenity_layers


EDUCATION_WEB_DATA = Path(__file__).resolve().parents[1] / "docs" / "data" / "education.geojson"
DOCS_DATA = EDUCATION_WEB_DATA.parent
MOJIBAKE_MARKERS = ("\u00d7", "\u00c3", "\u00c2")


def _features(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))["features"]


def coordinate_key(feature):
    lng, lat = feature["geometry"]["coordinates"]
    return round(float(lng), 5), round(float(lat), 5)


def test_published_education_labels_are_valid_hebrew_without_mojibake():
    payload = json.loads(EDUCATION_WEB_DATA.read_text(encoding="utf-8"))
    properties = [feature["properties"] for feature in payload["features"]]

    assert properties[0]["Institutio"] == "\u05d3\u05d5\u05d2\u05d9\u05ea"
    assert properties[0]["type"] == "\u05d2\u05df \u05d9\u05dc\u05d3\u05d9\u05dd"

    labels = [
        value
        for feature_properties in properties
        for value in feature_properties.values()
        if isinstance(value, str)
    ]
    assert all(marker not in label for label in labels for marker in MOJIBAKE_MARKERS)


def test_published_education_and_health_subtypes_are_complete():
    education = _features(DOCS_DATA / "education.geojson")
    clean = _features(DOCS_DATA / "amenities_new.geojson")
    clean_education = [
        feature for feature in clean
        if feature.get("properties", {}).get("amenity_type") == "education"
    ]
    health = [
        feature for feature in clean
        if feature.get("properties", {}).get("amenity_type") == "health"
    ]

    education_counts = Counter(
        feature.get("properties", {}).get("amenity_subtype") for feature in education
    )
    clean_education_counts = Counter(
        feature.get("properties", {}).get("amenity_subtype") for feature in clean_education
    )
    health_counts = Counter(
        feature.get("properties", {}).get("amenity_subtype") for feature in health
    )

    assert education_counts == {"school": 94, "kindergarten": 412}
    assert clean_education_counts == education_counts
    assert health_counts == {"clinic": 45, "tipat_halav": 14}

    expected_by_type = {
        "גן ילדים": "kindergarten",
        "בית ספר": "school",
        "על יסודי": "school",
        "מרכז מדעים": "school",
        "חווה חקלאי": "school",
    }
    assert all(
        feature["properties"]["amenity_subtype"]
        == expected_by_type[feature["properties"]["type"]]
        for feature in education
    )
    assert Counter(
        (coordinate_key(feature), feature["properties"]["amenity_subtype"])
        for feature in clean_education
    ) == Counter(
        (coordinate_key(feature), feature["properties"]["amenity_subtype"])
        for feature in education
    )


def test_clean_amenity_subtype_validator_requires_exact_complete_contract():
    frame = gpd.GeoDataFrame(
        {
            "amenity_type": ["education", "education", "health", "health", "playgrounds"],
            "amenity_subtype": ["school", "kindergarten", "clinic", "tipat_halav", None],
        },
        geometry=[Point(index, 0) for index in range(5)],
        crs="EPSG:2039",
    )

    amenity_layers.validate_clean_amenity_subtypes(frame)

    invalid = frame.copy()
    invalid.loc[3, "amenity_subtype"] = "Tipat Halav"
    with pytest.raises(ValueError, match="Invalid amenity_subtype for health"):
        amenity_layers.validate_clean_amenity_subtypes(invalid)

    missing_school = frame.drop(index=0)
    with pytest.raises(ValueError) as exc_info:
        amenity_layers.validate_clean_amenity_subtypes(missing_school)
    message = str(exc_info.value)
    assert "Missing required amenity_subtype for education" in message
    assert "affected parent records=1" in message
    assert "missing subtype counts={'school': 0}" in message

    empty = frame.iloc[0:0].copy()
    with pytest.raises(ValueError, match="amenities_clean is empty"):
        amenity_layers.validate_clean_amenity_subtypes(empty)
