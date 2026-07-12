"""Compact buildings lookup JSON for web app random access."""
from __future__ import annotations

import gzip
import json
import logging
import math
from pathlib import Path
from typing import Any

from core.atomic_files import commit_staged_files, staged_output_paths

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


class BuildingLookupCollector:
    """Stream lookup records directly from the writer's serialized features."""

    def __init__(
        self,
        output_path: Path,
        *,
        input_path: Path | None = None,
        source_layer: str = "buildings_lookup",
        compresslevel: int = 6,
        physical_output_path: Path | None = None,
        physical_gzip_path: Path | None = None,
        commit_on_exit: bool = True,
    ) -> None:
        self.output_path = output_path
        self.input_path = input_path or output_path
        self.source_layer = source_layer
        self.compresslevel = compresslevel
        self.physical_output_path = physical_output_path
        self.physical_gzip_path = physical_gzip_path
        self.commit_on_exit = commit_on_exit
        self.record_count = 0
        self._first = True
        self._handles = ()
        self._plain_handle = None
        self._gzip_raw = None
        self._gzip_handle = None
        self._staged_context = None
        self._active_physical_output = None
        self._active_physical_gzip = None
        self._stack = None
        self._result: dict[str, Any] | None = None

    @property
    def result(self) -> dict[str, Any]:
        if self._result is None:
            raise RuntimeError("Building lookup collection has not completed.")
        return self._result

    def __enter__(self) -> BuildingLookupCollector:
        if self._stack is not None:
            raise RuntimeError("Building lookup collector is already open.")
        self.record_count = 0
        self._first = True
        self._result = None
        self._handles = ()
        self._plain_handle = None
        self._gzip_raw = None
        self._gzip_handle = None
        self._staged_context = None

        physical_output = self.physical_output_path
        physical_gzip = self.physical_gzip_path
        if physical_output is None and physical_gzip is None and self.commit_on_exit:
            gzip_path = self.output_path.with_name(f"{self.output_path.name}.gz")
            self._staged_context = staged_output_paths((self.output_path, gzip_path))
            staged = self._staged_context.__enter__()
            physical_output, physical_gzip = staged
        elif (
            physical_output is not None
            and physical_gzip is not None
            and not self.commit_on_exit
        ):
            pass
        else:
            raise ValueError(
                "physical output paths require both paths and commit_on_exit=False"
            )

        assert physical_output is not None and physical_gzip is not None
        self._active_physical_output = Path(physical_output)
        self._active_physical_gzip = Path(physical_gzip)
        try:
            physical_output.parent.mkdir(parents=True, exist_ok=True)
            physical_gzip.parent.mkdir(parents=True, exist_ok=True)
            self._plain_handle = Path(physical_output).open("wb")
            self._gzip_raw = Path(physical_gzip).open("wb")
            self._gzip_handle = gzip.GzipFile(
                filename=self.output_path.with_name(f"{self.output_path.name}.gz").name,
                mode="wb",
                fileobj=self._gzip_raw,
                compresslevel=self.compresslevel,
            )
            self._handles = (self._plain_handle, self._gzip_handle)
            self._stack = True
            self._write_bytes(b'{"schema":1,"features":[')
            return self
        except BaseException as original:
            cleanup_errors: list[BaseException] = []
            self._close_handles(cleanup_errors)
            if self._staged_context is not None:
                try:
                    self._staged_context.__exit__(type(original), original, original.__traceback__)
                except BaseException as exc:
                    cleanup_errors.append(exc)
                self._staged_context = None
            self._stack = None
            for cleanup_error in cleanup_errors:
                original.add_note(f"Building lookup collector cleanup failed: {cleanup_error}")
            raise original

    def _write_bytes(self, data: bytes) -> None:
        if self._stack is None:
            raise RuntimeError("Building lookup collector is not open.")
        for handle in self._handles:
            handle.write(data)

    def _close_handles(self, errors: list[BaseException]) -> None:
        if self._gzip_handle is not None:
            try:
                self._gzip_handle.close()
            except BaseException as exc:
                errors.append(exc)
        if self._gzip_raw is not None:
            try:
                self._gzip_raw.close()
            except BaseException as exc:
                errors.append(exc)
        if self._plain_handle is not None:
            try:
                self._plain_handle.close()
            except BaseException as exc:
                errors.append(exc)

    def __call__(self, feature: dict[str, Any]) -> None:
        if not isinstance(feature, dict):
            return
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            return

        building_id = properties.get("building_id")
        if building_id is None:
            return

        centroid_lng, centroid_lat = extract_centroid(feature)
        if centroid_lng is None or centroid_lat is None:
            return

        compact_properties = slim_building_properties(properties)
        compact_properties["building_id"] = building_id
        compact_properties["centroid_lng"] = centroid_lng
        compact_properties["centroid_lat"] = centroid_lat
        if not self._first:
            self._write_bytes(b",")
        self._first = False
        self._write_bytes(
            json.dumps(
                compact_properties,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
        )
        self.record_count += 1

    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        if self._stack is None:
            return False
        body_error = exc_value if exc_type is not None else None
        finalization_errors: list[BaseException] = []
        try:
            if body_error is None:
                try:
                    self._write_bytes(b"]}")
                except BaseException as exc:
                    finalization_errors.append(exc)
            self._close_handles(finalization_errors)

            pending_result: dict[str, Any] | None = None
            if body_error is None and not finalization_errors:
                try:
                    pending_result = manifest_entry(
                        name="buildings_lookup",
                        input_path=self.input_path,
                        output_path=self.output_path,
                        source_layer=self.source_layer,
                        status="built",
                        byte_count=Path(self._active_physical_output).stat().st_size,
                        extra_fields={
                            "records": self.record_count,
                            "gzip_bytes": Path(self._active_physical_gzip).stat().st_size,
                        },
                    )
                except BaseException as exc:
                    finalization_errors.append(exc)

            if body_error is None and not finalization_errors and self._staged_context is not None:
                try:
                    gzip_path = self.output_path.with_name(f"{self.output_path.name}.gz")
                    commit_staged_files(
                        (
                            (self._active_physical_output, self.output_path),
                            (self._active_physical_gzip, gzip_path),
                        )
                    )
                except BaseException as exc:
                    finalization_errors.append(exc)

            primary = body_error or (finalization_errors[0] if finalization_errors else None)
            if primary is not None and body_error is not None:
                for error in finalization_errors:
                    body_error.add_note(f"Building lookup finalization failed: {error}")
            if primary is None:
                assert pending_result is not None
                self._result = pending_result
            elif body_error is None:
                raise primary
            return False
        finally:
            self._stack = None
            self._handles = ()
            self._plain_handle = None
            self._gzip_raw = None
            self._gzip_handle = None
            self._active_physical_output = None
            self._active_physical_gzip = None
            if self._staged_context is not None:
                self._staged_context.__exit__(None, None, None)
                self._staged_context = None


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

    collector = BuildingLookupCollector(output_path, input_path=source_path)
    with collector:
        for feature in payload["features"]:
            collector(feature)
    return collector.result
