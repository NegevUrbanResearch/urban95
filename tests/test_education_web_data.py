"""Published education-layer text contract."""

from __future__ import annotations

import json
from pathlib import Path


EDUCATION_WEB_DATA = Path(__file__).resolve().parents[1] / "docs" / "data" / "education.geojson"
MOJIBAKE_MARKERS = ("\u00d7", "\u00c3", "\u00c2")


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
