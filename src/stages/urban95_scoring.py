"""Urban95 equal-mean status attachment."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd

from core.geo_io import load_scored_buildings, write_scored_buildings
from core.paths import OUTPUT_DIR, SCORED_BUILDINGS
from core.perf import logged_phase
from lib.shade_si import BUILDING_SI_FIELD, prepare_shade_overlay
from lib.urban95_layerwise import prepare_urban95_layers, score_urban95_layerwise
from lib.urban95_status import SourceAvailability
from lib.urban95_weights import build_layers, discrete_layer_kwargs

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


STALE_SCORE_PREFIXES = ("score_weighted", "u95_status", "access_")
STALE_SCORE_EXACT = (BUILDING_SI_FIELD,)


def _append_layerwise_statuses(
    buildings: gpd.GeoDataFrame,
    layers: dict,
    workers: int,
) -> gpd.GeoDataFrame:
    """Attach every published status column from the exact layer-wise scorer."""
    with logged_phase("score.discrete.prepare"):
        layer_kwargs = discrete_layer_kwargs(layers)
        if not isinstance(layer_kwargs.get("source_availability"), dict):
            layer_kwargs["source_availability"] = {
                source_key: SourceAvailability(
                    isinstance(source, gpd.GeoDataFrame),
                    "available" if isinstance(source, gpd.GeoDataFrame) else "missing",
                )
                for source_key, source in layers.items()
            }
        prepared_discrete = prepare_urban95_layers(**layer_kwargs)
    with logged_phase("score.shade.prepare"):
        prepared_shade = prepare_shade_overlay(
            layers.get("shade_streets"),
            layers.get("shade_open_spaces"),
        )
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


def append_urban95_statuses(
    buildings: gpd.GeoDataFrame,
    shade_si_dir: Path | None = None,
    workers: int = INDEX_SCORE_WORKERS,
    reused_layers: ScoringLayerOverrides | None = None,
) -> gpd.GeoDataFrame:
    """Append canonical Urban95 status fields without a numeric overview score."""
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
    return _append_layerwise_statuses(buildings, layers, workers)


def _drop_stale_score_columns(buildings: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    stale_cols = [
        column
        for column in buildings.columns
        if column in STALE_SCORE_EXACT
        or any(column.startswith(prefix) for prefix in STALE_SCORE_PREFIXES)
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
    """Attach Urban95 statuses; optionally write SCORED_BUILDINGS."""
    if buildings is None:
        if not SCORED_BUILDINGS.is_file():
            raise FileNotFoundError(f"SCORED_BUILDINGS not found: {SCORED_BUILDINGS}")
        logging.info("Loading scored buildings from %s...", SCORED_BUILDINGS)
        buildings = load_scored_buildings(SCORED_BUILDINGS)

    shade_si_dir = OUTPUT_DIR / "shade_si"
    buildings = _drop_stale_score_columns(buildings)

    logging.info("Computing Urban95 status columns using %d workers...", INDEX_SCORE_WORKERS)
    buildings = append_urban95_statuses(
        buildings,
        shade_si_dir=shade_si_dir,
        workers=INDEX_SCORE_WORKERS,
        reused_layers=reused_layers,
    )
    if write_output:
        with logged_phase("score.output.write"):
            write_scored_buildings(buildings, SCORED_BUILDINGS)
    return buildings
