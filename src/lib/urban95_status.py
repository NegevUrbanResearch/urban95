from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass

STATUS_DISAPPOINTING = "disappointing"
STATUS_FUNCTIONING = "functioning"
STATUS_THRIVING = "thriving"
STATUS_UNKNOWN = "unknown"
STATUS_TOKENS = (
    STATUS_DISAPPOINTING,
    STATUS_FUNCTIONING,
    STATUS_THRIVING,
    STATUS_UNKNOWN,
)

STATUS_HIERARCHY = {
    "environmental_quality": ("shade", "trees", "roads"),
    "nature": ("parks", "urban_nature_areas"),
    "play": ("playgrounds",),
    "safety_mobility": ("street_lights", "bicycle_access", "bus_stops", "shelters"),
    "family_services": ("education", "community", "business", "health"),
}

STATUS_DIAGNOSTICS = {
    ("family_services", "education"): ("school", "kindergarten"),
    ("family_services", "health"): ("clinic", "tipat_halav"),
}

INDICATOR_SOURCE_REQUIREMENTS = {
    ("environmental_quality", "shade"): ("shade_streets", "shade_open_spaces"),
    ("environmental_quality", "trees"): ("trees",),
    ("environmental_quality", "roads"): ("roads",),
    ("nature", "parks"): ("parks",),
    ("nature", "urban_nature_areas"): ("urban_nature_areas",),
    ("play", "playgrounds"): ("playgrounds",),
    ("safety_mobility", "street_lights"): ("street_lights",),
    ("safety_mobility", "bicycle_access"): ("bikes",),
    ("safety_mobility", "bus_stops"): ("bus_stops",),
    ("safety_mobility", "shelters"): ("shelters",),
    ("family_services", "education"): ("education",),
    ("family_services", "community"): ("community",),
    ("family_services", "business"): ("business",),
    ("family_services", "health"): ("health",),
}

SOURCE_AVAILABILITY_KEY = "__source_availability__"


@dataclass(frozen=True)
class SourceAvailability:
    available: bool
    reason: str


def source_is_available(records: object, source_key: str) -> bool:
    if not isinstance(records, dict):
        return False
    record = records.get(source_key)
    if isinstance(record, SourceAvailability):
        return record.available
    if isinstance(record, dict):
        return record.get("available") is True
    return False


def _finite_unit(value: object) -> float | None:
    try:
        numeric = float(value)
    except Exception:
        return None
    if not math.isfinite(numeric) or numeric < 0.0 or numeric > 1.0:
        return None
    return numeric


def attainment_from_score(value: object) -> float | None:
    try:
        numeric = float(value)
    except Exception:
        return None
    if not math.isfinite(numeric) or numeric < 0.0 or numeric > 100.0:
        return None
    return numeric / 100.0


def equal_mean(values: Iterable[object]) -> float | None:
    normalized = [_finite_unit(value) for value in values]
    if not normalized or any(value is None for value in normalized):
        return None
    return sum(value for value in normalized if value is not None) / len(normalized)


def status_from_attainment(value: object) -> str:
    numeric = _finite_unit(value)
    if numeric is None:
        return STATUS_UNKNOWN
    if numeric < 0.25:
        return STATUS_DISAPPOINTING
    if numeric < 0.75:
        return STATUS_FUNCTIONING
    return STATUS_THRIVING


def aggregate_status(values: Iterable[object]) -> str:
    return status_from_attainment(equal_mean(values))


def category_status_field(category: str, suffix: str) -> str:
    return f"u95_status_{category}{suffix}"


def indicator_status_field(category: str, indicator: str, suffix: str) -> str:
    return f"u95_status_sub_{category}_{indicator}{suffix}"


def diagnostic_status_field(category: str, parent: str, child: str, suffix: str) -> str:
    return f"u95_status_detail_{category}_{parent}_{child}{suffix}"


def status_composition_prefix(
    category: str | None = None,
    indicator: str | None = None,
    parent: str | None = None,
    child: str | None = None,
) -> str:
    if child is not None:
        return f"u95_detail_{category}_{parent}_{child}"
    if indicator is not None:
        return f"u95_sub_{category}_{indicator}"
    if category is not None:
        return f"u95_{category}"
    return "u95"
