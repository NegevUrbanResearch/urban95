"""CLI entry for `python -m pipeline`."""

from __future__ import annotations

import argparse
import logging
import os
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed

from core.preflight import STAGES, format_report, preflight, preflight_stage

os.environ.setdefault("PROJ_DEBUG", "OFF")
os.environ.setdefault("PYPROJ_GLOBAL_CONTEXT", "ON")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


def cmd_check(_: argparse.Namespace) -> int:
    """Verify required raw inputs (and report optional gaps)."""
    report = preflight("raw")
    print(format_report(report, title="preflight raw"))
    if not report.ok:
        return 1
    return 0


def _run_shade() -> None:
    from stages.shade import preprocess_shade

    preprocess_shade()


def _run_isochrones() -> None:
    from stages.isochrones import run_isochrones

    run_isochrones()


def _run_amenity_metrics() -> None:
    from stages.amenity_metrics import run_amenity_metrics_stage

    run_amenity_metrics_stage()


def _run_score() -> None:
    from stages.urban95_scoring import run_score

    run_score()


def _run_export_web() -> None:
    from stages.export_web import export_web

    export_web()


def _run_neighborhoods() -> None:
    from stages.neighborhoods import main as preprocess_neighborhoods

    preprocess_neighborhoods()


def _run_rescore() -> None:
    from stages.rescore import rescore_urban95_weighted

    rescore_urban95_weighted()


def _run_survey() -> None:
    from stages.survey import publish_default_survey

    publish_default_survey()


STAGE_HANDLERS: dict[str, Callable[[], None]] = {
    "shade": _run_shade,
    "isochrones": _run_isochrones,
    "amenity_metrics": _run_amenity_metrics,
    "score": _run_score,
    "export_web": _run_export_web,
    "neighborhoods": _run_neighborhoods,
    "survey": _run_survey,
    "rescore": _run_rescore,
}


def run_stage(stage: str) -> float:
    """Execute one stage handler; return elapsed seconds. Preflight stays in cmd_run."""
    if stage == "all":
        raise ValueError("run_stage('all') is invalid; use cmd_run / run_all")
    handler = STAGE_HANDLERS.get(stage)
    if handler is None:
        raise ValueError(f"Unknown stage: {stage!r}")
    t0 = time.perf_counter()
    handler()
    elapsed = time.perf_counter() - t0
    logging.info("stage=%s elapsed_s=%.3f", stage, elapsed)
    return elapsed


def run_parallel_handlers(stages: list[str]) -> dict[str, float]:
    """Run STAGE_HANDLERS concurrently. Caller must preflight first on main thread."""
    elapsed: dict[str, float] = {}

    def _one(name: str) -> tuple[str, float]:
        return name, run_stage(name)

    with ThreadPoolExecutor(max_workers=len(stages)) as ex:
        futs = [ex.submit(_one, s) for s in stages]
        errors: list[Exception] = []
        for fut in as_completed(futs):
            try:
                name, sec = fut.result()
                elapsed[name] = sec
            except Exception as exc:
                errors.append(exc)
        if errors:
            raise errors[0]
    return elapsed


def _load_isochrones_gdf_for_all():
    from stages.isochrones import ISOCHRONES_OUTPUT_PATH, load_isochrones_gdf

    return load_isochrones_gdf(ISOCHRONES_OUTPUT_PATH)


def run_all() -> int:
    """Real entry for `python -m pipeline run all` (called from cmd_run)."""
    from stages import amenity_metrics, urban95_scoring
    from stages import export_web as export_web_mod
    from core.geo_io import CRS_METRIC

    for step in ("shade", "isochrones"):
        report = preflight_stage(step)
        print(format_report(report, title=f"preflight stage={step}"))
        if not report.ok:
            return 1
    t0 = time.perf_counter()
    run_parallel_handlers(["shade", "isochrones"])

    # Only preflight amenity_metrics here. Do NOT preflight score/export_web/neighborhoods
    # yet — those stages' disk checks require SCORED_BUILDINGS / published buildings that
    # the in-memory handoff has not written. Standalone `run score` / `run export_web`
    # still use their normal preflight in cmd_run.
    report = preflight_stage("amenity_metrics")
    print(format_report(report, title="preflight stage=amenity_metrics"))
    if not report.ok:
        return 1

    iso_gdf = _load_isochrones_gdf_for_all()
    prepared_layers = amenity_metrics.prepare_amenity_layers(CRS_METRIC)

    t_amenity = time.perf_counter()
    buildings = amenity_metrics.run_amenity_metrics_stage(
        isochrones=iso_gdf,
        write_output=False,
        prepared_layers=prepared_layers,
    )
    logging.info(
        "stage=amenity_metrics elapsed_s=%.3f", time.perf_counter() - t_amenity
    )

    t_score = time.perf_counter()
    buildings = urban95_scoring.run_score(
        buildings=buildings,
        write_output=True,
        reused_layers=urban95_scoring.ScoringLayerOverrides(
            trees=prepared_layers.trees,
            parks=prepared_layers.parks,
            street_lights=prepared_layers.street_lights,
            amenities_clean=prepared_layers.amenities_clean,
        ),
    )
    logging.info("stage=score elapsed_s=%.3f", time.perf_counter() - t_score)

    t_export = time.perf_counter()
    export_web_mod.export_web(
        buildings,
        isochrones_gdf=iso_gdf,
        trees_gdf=prepared_layers.trees,
        parks_gdf=prepared_layers.parks,
        amenities_legacy_gdf=prepared_layers.amenities_legacy,
    )
    logging.info("stage=export_web elapsed_s=%.3f", time.perf_counter() - t_export)

    report = preflight_stage("neighborhoods")
    print(format_report(report, title="preflight stage=neighborhoods"))
    if not report.ok:
        return 1
    run_stage("neighborhoods")
    logging.info("pipeline_all_total_s=%.3f", time.perf_counter() - t0)
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    """Run a pipeline stage."""
    if args.stage == "all":
        return run_all()
    report = preflight_stage(args.stage)
    print(format_report(report, title=f"preflight stage={args.stage}"))
    if not report.ok:
        return 1
    run_stage(args.stage)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pipeline",
        description="Urban95 data pipeline (raw → output → docs/data)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    check_p = sub.add_parser("check", help="Preflight required raw layers")
    check_p.set_defaults(func=cmd_check)

    run_p = sub.add_parser("run", help="Run a pipeline stage")
    run_p.add_argument(
        "stage",
        choices=STAGES,
        help="Stage to run",
    )
    run_p.set_defaults(func=cmd_run)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
