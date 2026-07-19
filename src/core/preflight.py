"""Preflight checks for raw/intermediate/publish layers and pipeline stages."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from core.paths import LAYERS, SCORED_BUILDINGS, layer

# Run-all order (rescore is an alternate path, not part of `all`).
ALL_STAGES: tuple[str, ...] = (
    "shade",
    "isochrones",
    "amenity_metrics",
    "score",
    "export_web",
    "neighborhoods",
)
STANDALONE_STAGES: tuple[str, ...] = ("survey", "rescore")

STAGE_LAYER_IDS: dict[str, list[str]] = {
    "shade": ["shade_street", "shade_open_space"],
    "isochrones": ["buildings"],
    "amenity_metrics": ["buildings"],
    "score": ["buildings", "amenities_clean", "shade_si_street", "shade_si_open"],
    "export_web": [],
    "neighborhoods": [],
    "survey": [
        "survey_raw_walkability_barrier",
        "survey_raw_crossing_hazard",
        "survey_raw_loved_place",
        "survey_raw_community_anchor",
    ],
    "rescore": ["amenities_clean", "shade_si_street", "shade_si_open"],
}

# CLI `run` choices: run-all order + standalone alternates + synthetic `all`.
STAGES: tuple[str, ...] = (*ALL_STAGES, *STANDALONE_STAGES, "all")

if set(STAGE_LAYER_IDS) != set(ALL_STAGES) | set(STANDALONE_STAGES):
    raise RuntimeError("STAGE_LAYER_IDS keys must equal ALL_STAGES + STANDALONE_STAGES")
if tuple(STAGE_LAYER_IDS)[: len(ALL_STAGES)] != ALL_STAGES:
    raise RuntimeError("ALL_STAGES must be the STAGE_LAYER_IDS prefix")


@dataclass
class PreflightReport:
    ok: bool
    missing_required: list[str] = field(default_factory=list)
    missing_optional: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def merge(self, other: PreflightReport) -> PreflightReport:
        return PreflightReport(
            ok=self.ok and other.ok,
            missing_required=[*self.missing_required, *other.missing_required],
            missing_optional=[*self.missing_optional, *other.missing_optional],
            notes=[*self.notes, *other.notes],
        )


def _exists(path: Path) -> bool:
    return path.exists()


def _nonempty_dir(path: Path) -> bool:
    if not path.is_dir():
        return False
    try:
        next(path.iterdir())
    except StopIteration:
        return False
    return True


def _check_layer_ids(layer_ids: list[str]) -> PreflightReport:
    missing_required: list[str] = []
    missing_optional: list[str] = []
    for lid in layer_ids:
        L = layer(lid)
        if _exists(L.path):
            continue
        msg = f"{L.id}: {L.path}"
        if L.required:
            missing_required.append(msg)
        else:
            missing_optional.append(msg)
    return PreflightReport(
        ok=len(missing_required) == 0,
        missing_required=missing_required,
        missing_optional=missing_optional,
    )


def _check_stage_required_layer_ids(layer_ids: list[str]) -> PreflightReport:
    missing_required = [
        f"{layer_id}: {layer(layer_id).path}"
        for layer_id in layer_ids
        if not _exists(layer(layer_id).path)
    ]
    return PreflightReport(ok=not missing_required, missing_required=missing_required)


def preflight(kind: str) -> PreflightReport:
    """Check all layers of the given kind (raw | intermediate | publish)."""
    if kind not in ("raw", "intermediate", "publish"):
        raise ValueError(f"Unknown preflight kind: {kind!r}")
    ids = [L.id for L in LAYERS.values() if L.kind == kind]
    return _check_layer_ids(ids)


def _amenity_metrics_isochrones_ok() -> bool:
    iso = layer("isochrones_intermediate")
    cache = layer("isochrone_cache")
    if _exists(iso.path):
        return True
    return _nonempty_dir(cache.path) if _exists(cache.path) else False


def _published_buildings_ok() -> bool:
    gz = layer("publish_buildings_gz")
    plain = layer("publish_buildings")
    return _exists(gz.path) or _exists(plain.path)


def _scored_or_published_buildings_ok() -> bool:
    return _exists(SCORED_BUILDINGS) or _published_buildings_ok()


def preflight_stage(stage: str) -> PreflightReport:
    """Check inputs required before running a pipeline stage."""
    if stage not in STAGES:
        raise ValueError(f"Unknown stage: {stage!r}")

    if stage == "all":
        report = PreflightReport(ok=True)
        for s in ALL_STAGES:
            report = report.merge(preflight_stage(s))
        return report

    if stage == "survey":
        return _check_stage_required_layer_ids(STAGE_LAYER_IDS[stage])

    layer_ids = STAGE_LAYER_IDS[stage]
    report = _check_layer_ids(layer_ids)

    if stage == "amenity_metrics":
        if not _amenity_metrics_isochrones_ok():
            iso = layer("isochrones_intermediate")
            cache = layer("isochrone_cache")
            report.missing_required.append(
                f"isochrones: need {iso.path} or non-empty {cache.path}"
            )
            report.ok = False

    elif stage == "score":
        if not _exists(SCORED_BUILDINGS):
            report.missing_required.append(f"SCORED_BUILDINGS: {SCORED_BUILDINGS}")
            report.ok = False

    elif stage == "export_web":
        if not _exists(SCORED_BUILDINGS):
            report.missing_required.append(f"SCORED_BUILDINGS: {SCORED_BUILDINGS}")
            report.ok = False

    elif stage == "neighborhoods":
        if not _published_buildings_ok():
            gz = layer("publish_buildings_gz")
            plain = layer("publish_buildings")
            report.missing_required.append(
                f"published buildings: {gz.path} or {plain.path}"
            )
            report.ok = False

    elif stage == "rescore":
        if not _scored_or_published_buildings_ok():
            gz = layer("publish_buildings_gz")
            plain = layer("publish_buildings")
            report.missing_required.append(
                f"scored/published buildings: {SCORED_BUILDINGS} or "
                f"{gz.path} or {plain.path}"
            )
            report.ok = False

    return report


def format_report(report: PreflightReport, *, title: str = "preflight") -> str:
    lines = [f"{title}: {'OK' if report.ok else 'FAIL'}"]
    for msg in report.missing_required:
        lines.append(f"  missing required: {msg}")
    for msg in report.missing_optional:
        lines.append(f"  missing optional: {msg}")
    for note in report.notes:
        lines.append(f"  note: {note}")
    return "\n".join(lines)
