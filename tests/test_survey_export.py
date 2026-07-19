from __future__ import annotations

import json
from pathlib import Path

from stages.survey import publish_survey


def _write_collection(path: Path, features: list[dict]) -> None:
    path.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False),
        encoding="utf-8",
    )


def _feature(*, coordinates=(34.78, 31.25), comment="×ª×’×•×‘×”", submission_id="7") -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": list(coordinates)},
        "properties": {
            "question": "×©××œ×”",
            "neighborhood": "×¨×ž×•×ª",
            "comment": comment,
            "submission_id": submission_id,
        },
    }


def test_publish_survey_combines_sanitizes_and_deduplicates(tmp_path: Path) -> None:
    first = tmp_path / "first.geojson"
    second = tmp_path / "second.geojson"
    duplicate = _feature()
    _write_collection(first, [duplicate, duplicate])
    _write_collection(second, [_feature(coordinates=(34.79, 31.26), comment="")])
    output = tmp_path / "survey_results.geojson"

    report = publish_survey(
        {"walkability_barrier": first, "loved_place": second},
        output,
    )
    published = json.loads(output.read_text(encoding="utf-8"))

    assert report == {
        "published_by_category": {"walkability_barrier": 1, "loved_place": 1},
        "skipped_invalid": 0,
        "skipped_duplicates": 1,
    }
    assert len(published["features"]) == 2
    assert published["features"][0]["properties"] == {
        "survey_category": "walkability_barrier",
        "question": "×©××œ×”",
        "neighborhood": "×¨×ž×•×ª",
        "comment": "×ª×’×•×‘×”",
    }
    assert all("submission_id" not in feature["properties"] for feature in published["features"])

    malformed = tmp_path / "malformed.geojson"
    malformed.write_text("[]", encoding="utf-8")
    try:
        publish_survey({"walkability_barrier": malformed}, output)
    except ValueError as exc:
        assert str(malformed) in str(exc)
        assert "expected GeoJSON FeatureCollection" in str(exc)
    else:
        raise AssertionError("expected malformed top-level JSON to be rejected")


def test_publish_survey_skips_bad_features_but_keeps_distinct_submissions(tmp_path: Path) -> None:
    source = tmp_path / "mixed.geojson"
    first = _feature(submission_id="7")
    second = _feature(submission_id="8")
    invalid_comment = _feature(comment={"not": "public text"})
    invalid = True
    _write_collection(source, [first, second, invalid_comment, invalid])
    output = tmp_path / "out.geojson"

    report = publish_survey({"walkability_barrier": source}, output)
    published = json.loads(output.read_text(encoding="utf-8"))

    assert report == {
        "published_by_category": {"walkability_barrier": 2},
        "skipped_invalid": 2,
        "skipped_duplicates": 0,
    }
    assert len(published["features"]) == 2
