"""Urban95 weighted score attachment using urban95_weights methodology."""
from __future__ import annotations

import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from tqdm.auto import tqdm

import geopandas as gpd

from core.geo_io import WALK_MINUTES, load_scored_buildings, write_scored_buildings
from core.perf import logged_phase
from core.paths import OUTPUT_DIR, SCORED_BUILDINGS
from lib.shade_si import BUILDING_SI_FIELD, attach_summer_si_to_buildings, prepare_shade_overlay
from lib.urban95_weights import (
    CATEGORY_SUBCATEGORY_WEIGHTS,
    build_layers,
    calculate_master_index,
    discrete_layer_kwargs,
)
from lib.urban95_layerwise import prepare_urban95_layers, score_urban95_layerwise

_DEFAULT_HIGH_WORKERS = max(16, min(64, (os.cpu_count() or 8) * 4))
INDEX_SCORE_WORKERS = max(1, int(os.getenv("INDEX_SCORE_WORKERS", _DEFAULT_HIGH_WORKERS)))
SI_ATTACH_CHUNK_SIZE = max(1, int(os.getenv("SI_ATTACH_CHUNK_SIZE", "2000")))


@dataclass(frozen=True)
class ScoringLayerOverrides:
    """Explicit prepared frames reused by the run-all scoring handoff."""

    trees: gpd.GeoDataFrame | None = None
    parks: gpd.GeoDataFrame | None = None
    street_lights: gpd.GeoDataFrame | None = None
    amenities_clean: gpd.GeoDataFrame | None = None

WEIGHTED_CATEGORY_STEMS = {
    "Environmental Quality": "environmental_quality",
    "Nature": "nature",
    "Play": "play",
    "Safety & Mobility": "safety_mobility",
    "Family Services": "family_services",
}

STALE_SCORE_PREFIXES = ("score_weighted",)
STALE_SCORE_EXACT = (BUILDING_SI_FIELD,)


def _weighted_component_stem(name: str) -> str:
    s = str(name or "").strip().lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = s.strip("_")
    return s or "component"


def _has_discrete_sources(layers: dict) -> bool:
    for name in (
        "trees", "roads", "parks", "urban_nature_areas", "playgrounds", "bikes",
        "bus_stops", "shelters", "education", "community", "business", "health", "street_lights",
    ):
        source = layers.get(name)
        if not isinstance(source, gpd.GeoDataFrame) or source.empty:
            continue
        geometry = source.geometry
        if bool((geometry.notna() & ~geometry.is_empty).any()):
            return True
    return False


def _append_layerwise_scores(
    buildings: gpd.GeoDataFrame,
    layers: dict,
    workers: int,
) -> gpd.GeoDataFrame:
    """Attach every published score column from the exact layer-wise scorer."""
    with logged_phase("score.discrete.prepare"):
        prepared_discrete = prepare_urban95_layers(**discrete_layer_kwargs(layers))
    with logged_phase("score.shade.prepare"):
        prepared_shade = prepare_shade_overlay(layers.get("shade_streets"), layers.get("shade_open_spaces"))
    scores = score_urban95_layerwise(
        buildings,
        prepared_discrete,
        prepared_shade,
        layers.get("street_lights"),
        chunk_size=SI_ATTACH_CHUNK_SIZE,
        workers=workers,
    )
    for column in scores.columns:
        buildings[column] = scores[column].to_numpy()
    return buildings


def append_weighted_urban95_scores(
    buildings: gpd.GeoDataFrame,
    shade_si_dir: Path | None = None,
    workers: int = INDEX_SCORE_WORKERS,
    reused_layers: ScoringLayerOverrides | None = None,
) -> gpd.GeoDataFrame:
    """Append Urban95 weighted score columns using src/urban95_weights.py methodology."""
    subcategory_weight_map = CATEGORY_SUBCATEGORY_WEIGHTS

    layer_kwargs = {"shade_si_dir": shade_si_dir, "target_epsg": 2039}
    if reused_layers is not None:
        layer_kwargs.update(
            trees=reused_layers.trees,
            parks=reused_layers.parks,
            street_lights=reused_layers.street_lights,
            amenities_clean=reused_layers.amenities_clean,
        )
    with logged_phase("score.layers.load"):
        layers = build_layers(**layer_kwargs)
    if _has_discrete_sources(layers):
        return _append_layerwise_scores(buildings, layers, workers)
    buildings = attach_summer_si_to_buildings(
        buildings,
        layers.get("shade_streets"),
        layers.get("shade_open_spaces"),
        chunk_size=SI_ATTACH_CHUNK_SIZE,
    )
    centroids = buildings.geometry.centroid

    total = len(buildings)

    weighted_scores = [0.0] * total
    category_scores = {stem: [0.0] * total for stem in WEIGHTED_CATEGORY_STEMS.values()}
    subcategory_defs = []
    for cat_name, sub_weights in subcategory_weight_map.items():
        cat_stem = WEIGHTED_CATEGORY_STEMS.get(cat_name)
        if not cat_stem:
            continue
        for sub_name in (sub_weights or {}).keys():
            sub_stem = _weighted_component_stem(sub_name)
            subcategory_defs.append((cat_name, cat_stem, sub_name, sub_stem))
    subcategory_scores = {
        (cat_stem, sub_stem): [0.0] * total
        for _, cat_stem, _, sub_stem in subcategory_defs
    }

    def _score_one(idx: int, x: float, y: float, summer_si: float):
        try:
            result = calculate_master_index(
                x,
                y,
                layers,
                precomputed={"summer_si": summer_si},
            )
            weighted = float(result.get("final_index", 0.0))
            cat = result.get("category_scores", {}) or {}
            sub = result.get("subcategory_scores", {}) or {}
            out_cat = {
                stem: float(cat.get(cat_name, 0.0))
                for cat_name, stem in WEIGHTED_CATEGORY_STEMS.items()
            }
            out_sub = {}
            for cat_name, cat_stem, sub_name, sub_stem in subcategory_defs:
                sub_vals = sub.get(cat_name, {}) or {}
                out_sub[(cat_stem, sub_stem)] = float(sub_vals.get(sub_name, 0.0))
            failed = False
        except Exception as exc:
            logging.warning("Urban95 scoring failed for building index %d: %s", idx, exc)
            weighted = 0.0
            out_cat = {stem: 0.0 for stem in WEIGHTED_CATEGORY_STEMS.values()}
            out_sub = {k: 0.0 for k in subcategory_scores.keys()}
            failed = True
        return idx, weighted, out_cat, out_sub, failed

    summer_si_values = buildings[BUILDING_SI_FIELD].astype(float).tolist()

    score_failures = 0
    if total > 0:
        with ThreadPoolExecutor(max_workers=max(1, int(workers))) as executor:
            futures = [
                executor.submit(
                    _score_one,
                    idx,
                    float(pt.x),
                    float(pt.y),
                    float(summer_si_values[idx]),
                )
                for idx, pt in enumerate(centroids)
            ]
            for future in tqdm(
                as_completed(futures),
                total=total,
                desc="Urban95 weighted score",
                unit="building",
                disable=None,
            ):
                idx, weighted, out_cat, out_sub, failed = future.result()
                if failed:
                    score_failures += 1
                weighted_scores[idx] = weighted
                for stem, val in out_cat.items():
                    category_scores[stem][idx] = val
                for key, val in out_sub.items():
                    if key in subcategory_scores:
                        subcategory_scores[key][idx] = val

    if score_failures:
        logging.warning(
            "Urban95 scoring: %d/%d building(s) failed and scored 0",
            score_failures,
            total,
        )

    for minutes in WALK_MINUTES:
        suffix = f"_{minutes}min"
        buildings[f"score_weighted{suffix}"] = weighted_scores
        for stem, vals in category_scores.items():
            buildings[f"score_weighted_{stem}{suffix}"] = vals
        for (cat_stem, sub_stem), vals in subcategory_scores.items():
            buildings[f"score_weighted_sub_{cat_stem}_{sub_stem}{suffix}"] = vals

    return buildings


def _drop_stale_score_columns(buildings: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    stale_cols = [
        c
        for c in buildings.columns
        if c in STALE_SCORE_EXACT or any(c.startswith(prefix) for prefix in STALE_SCORE_PREFIXES)
    ]
    if stale_cols:
        logging.info("Dropped %d stale score columns before rescoring.", len(stale_cols))
        buildings = buildings.drop(columns=stale_cols)
    return buildings


def run_score(
    *,
    buildings: gpd.GeoDataFrame | None = None,
    write_output: bool = True,
    reused_layers: ScoringLayerOverrides | None = None,
) -> gpd.GeoDataFrame:
    """Attach Urban95 weighted scores; optionally write SCORED_BUILDINGS."""
    if buildings is None:
        if not SCORED_BUILDINGS.is_file():
            raise FileNotFoundError(f"SCORED_BUILDINGS not found: {SCORED_BUILDINGS}")
        logging.info("Loading scored buildings from %s...", SCORED_BUILDINGS)
        buildings = load_scored_buildings(SCORED_BUILDINGS)

    shade_si_dir = OUTPUT_DIR / "shade_si"
    buildings = _drop_stale_score_columns(buildings)

    logging.info("Computing Urban95 weighted score columns using %d workers...", INDEX_SCORE_WORKERS)
    buildings = append_weighted_urban95_scores(
        buildings,
        shade_si_dir=shade_si_dir,
        workers=INDEX_SCORE_WORKERS,
        reused_layers=reused_layers,
    )
    if write_output:
        with logged_phase("score.output.write"):
            write_scored_buildings(buildings, SCORED_BUILDINGS)
    return buildings
