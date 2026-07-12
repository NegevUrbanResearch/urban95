"""Publish scored buildings and companion layers to docs/data."""
from __future__ import annotations

import logging
from pathlib import Path

import geopandas as gpd

from core.geo_io import CRS_METRIC, load_scored_buildings, repair_dataframe_encoding
from core.atomic_files import commit_staged_files, staged_output_paths
from core.geojson_utils import (
    export_buildings_web_layer,
    simplify_geometries,
    _write_minimal_geojson_stream,
    write_minimal_geojson,
)
from core.paths import DOCS_DATA_DIR, SCORED_BUILDINGS, layer
from lib.amenity_layers import load_amenity_layers, prepare_legacy_amenities
from lib.buildings_lookup import BuildingLookupCollector
from lib.buildings_prep import BUILDING_DROP_COLUMNS, BUILDING_SIMPLIFY_TOLERANCE_M, PARK_SIMPLIFY_TOLERANCE_M
from stages.isochrones import get_building_isochrones

AMENITY_KEEP_COLUMNS = [
    "name",
    "hebrew_nam",
    "english_na",
    "amenity_type",
    "top_classi",
    "subcategor",
    "geometry",
]
TREE_KEEP_COLUMNS = ["geometry"]
EXCLUDED_AMENITY_TYPES = {"none", "other", "private_establishment"}
ISOCHRONE_SIMPLIFY_TOLERANCE_M = 5.0

AMENITIES_NEW_PATH = DOCS_DATA_DIR / "amenities_new.geojson"
STREET_LIGHTS_PATH = DOCS_DATA_DIR / "street_lights.geojson"
ISOCHRONES_WEB_PATH = DOCS_DATA_DIR / "isochrones.geojson"

# Refuse to publish centroid-only / unscored buildings (wipes the live map indicators).
REQUIRED_BUILDING_SCORE_COLUMNS = (
    "score_weighted_10min",
    "score_expanded_10min",
)


def assert_buildings_have_scores(buildings: gpd.GeoDataFrame) -> None:
    """Fail loud if buildings lack score columns the web app needs."""
    missing = [c for c in REQUIRED_BUILDING_SCORE_COLUMNS if c not in buildings.columns]
    if missing:
        raise ValueError(
            "Refusing to publish buildings without score columns "
            f"{missing}. Run amenity_metrics + score (or restore scored "
            "artifacts) before export_web — a centroid-only layer will "
            "wipe buildings_lookup indicators."
        )


def _sync_raw_layer_to_docs(
    raw_layer_id: str,
    docs_path: Path,
    *,
    precision: int = 5,
    gzip_companion: bool = False,
) -> None:
    raw_path = layer(raw_layer_id).path
    if not raw_path.is_file():
        logging.info("Skipping docs sync for %s (raw layer missing)", raw_layer_id)
        return
    gdf = gpd.read_file(raw_path)
    if gdf.crs is None:
        gdf = gdf.set_crs(epsg=4326)
    gdf = repair_dataframe_encoding(gdf)
    gdf = gdf.to_crs(epsg=4326)
    write_minimal_geojson(
        gdf,
        docs_path,
        precision=precision,
        gzip_path=(
            docs_path.with_name(f"{docs_path.name}.gz")
            if gzip_companion
            else None
        ),
    )
    logging.info("Synced %s -> %s (%d features)", raw_path.name, docs_path.name, len(gdf))


def _prepare_amenities_all(amenities_legacy_gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if len(amenities_legacy_gdf) == 0:
        return gpd.GeoDataFrame()
    amenities_wgs84 = amenities_legacy_gdf.to_crs(epsg=4326)
    amenities_filtered = amenities_wgs84[
        ~amenities_wgs84["amenity_type"].isin(EXCLUDED_AMENITY_TYPES)
        & ~amenities_wgs84.geometry.is_empty
        & amenities_wgs84.geometry.notna()
    ]
    amenity_cols = [c for c in AMENITY_KEEP_COLUMNS if c in amenities_filtered.columns]
    return amenities_filtered[amenity_cols]


def _isochrones_web_gdf(buildings: gpd.GeoDataFrame, isochrones_gdf: gpd.GeoDataFrame | None) -> gpd.GeoDataFrame | None:
    if isochrones_gdf is not None:
        iso_export = isochrones_gdf.copy()
        if iso_export.crs is None:
            iso_export = iso_export.set_crs(epsg=4326)
    else:
        all_isochrones = get_building_isochrones(buildings)
        iso_features = []
        for bid, polys in all_isochrones.items():
            for mins, geom in polys.items():
                if geom is None or geom.is_empty:
                    continue
                iso_features.append(
                    {
                        "building_id": int(bid),
                        "minutes": int(mins),
                        "geometry": geom,
                    }
                )
        if not iso_features:
            return None
        iso_export = gpd.GeoDataFrame(iso_features, crs="EPSG:4326")

    if iso_export.crs.to_epsg() == CRS_METRIC:
        iso_metric = iso_export
    else:
        iso_metric = iso_export.to_crs(epsg=CRS_METRIC)
    iso_metric = simplify_geometries(iso_metric, ISOCHRONE_SIMPLIFY_TOLERANCE_M)
    return iso_metric.to_crs(epsg=4326)


def _resolve_amenities_legacy(
    amenities_legacy_gdf: gpd.GeoDataFrame | None,
) -> gpd.GeoDataFrame:
    if amenities_legacy_gdf is not None:
        return amenities_legacy_gdf
    amenities_legacy, _, _, _, _, merged_path = load_amenity_layers(CRS_METRIC)
    amenities_legacy, _ = prepare_legacy_amenities(amenities_legacy, merged_path, CRS_METRIC)
    return amenities_legacy


def _resolve_trees(trees_gdf: gpd.GeoDataFrame | None) -> gpd.GeoDataFrame | None:
    if trees_gdf is not None:
        return trees_gdf
    trees_path = layer("trees").path
    if not trees_path.is_file():
        return None
    trees = gpd.read_file(trees_path)
    if trees.crs is None:
        trees = trees.set_crs(epsg=4326)
    trees = repair_dataframe_encoding(trees)
    return trees.to_crs(epsg=CRS_METRIC)


def _resolve_parks(parks_gdf: gpd.GeoDataFrame | None) -> gpd.GeoDataFrame | None:
    if parks_gdf is not None:
        return parks_gdf
    parks_path = layer("parks").path
    if not parks_path.is_file():
        return None
    parks = gpd.read_file(parks_path)
    if parks.crs is None:
        parks = parks.set_crs(epsg=4326)
    parks = repair_dataframe_encoding(parks)
    return parks.to_crs(epsg=CRS_METRIC)


def export_web(
    buildings: gpd.GeoDataFrame | None = None,
    *,
    isochrones_gdf: gpd.GeoDataFrame | None = None,
    trees_gdf: gpd.GeoDataFrame | None = None,
    parks_gdf: gpd.GeoDataFrame | None = None,
    amenities_legacy_gdf: gpd.GeoDataFrame | None = None,
) -> None:
    """Write web layers and stream the compact buildings lookup with its gzip."""
    if buildings is None:
        if not SCORED_BUILDINGS.is_file():
            raise FileNotFoundError(f"SCORED_BUILDINGS not found: {SCORED_BUILDINGS}")
        logging.info("Loading scored buildings from %s...", SCORED_BUILDINGS)
        buildings = load_scored_buildings(SCORED_BUILDINGS)

    assert_buildings_have_scores(buildings)

    DOCS_DATA_DIR.mkdir(parents=True, exist_ok=True)

    logging.info("Syncing raw amenity manifest layers to docs/data...")
    _sync_raw_layer_to_docs("amenities_clean", AMENITIES_NEW_PATH)
    _sync_raw_layer_to_docs(
        "street_lights", STREET_LIGHTS_PATH, gzip_companion=True
    )

    out_path = layer("publish_buildings").path

    logging.info(
        "Simplifying building geometries (tolerance: %.1fm)...",
        BUILDING_SIMPLIFY_TOLERANCE_M,
    )
    cols_to_drop = [c for c in BUILDING_DROP_COLUMNS if c in buildings.columns]
    buildings_web = export_buildings_web_layer(
        buildings,
        out_path,
        simplify_tolerance_m=BUILDING_SIMPLIFY_TOLERANCE_M,
        drop_columns=BUILDING_DROP_COLUMNS,
        precision=5,
    )
    if cols_to_drop:
        logging.info("Dropped %d unused columns from buildings: %s", len(cols_to_drop), cols_to_drop)

    amen_cols = [c for c in buildings_web.columns if c.startswith("amen_")]
    for col in amen_cols:
        if buildings_web[col].sum() == 0:
            buildings_web = buildings_web.drop(columns=[col])
            logging.info("Dropped zero-sum column: %s", col)

    lookup_path = layer("publish_buildings_lookup").path
    buildings_gzip_path = out_path.with_name(f"{out_path.name}.gz")
    lookup_gzip_path = lookup_path.with_name(f"{lookup_path.name}.gz")
    with staged_output_paths(
        (out_path, buildings_gzip_path, lookup_path, lookup_gzip_path)
    ) as staged:
        staged_buildings, staged_buildings_gzip, staged_lookup, staged_lookup_gzip = staged
        building_lookup_collector = BuildingLookupCollector(
            lookup_path,
            input_path=out_path,
            physical_output_path=staged_lookup,
            physical_gzip_path=staged_lookup_gzip,
            commit_on_exit=False,
        )
        with building_lookup_collector:
            _write_minimal_geojson_stream(
                buildings_web,
                staged_buildings,
                precision=5,
                gzip_path=staged_buildings_gzip,
                canonical_gzip_path=buildings_gzip_path,
                feature_observer=building_lookup_collector,
            )
        lookup_result = building_lookup_collector.result
        if not isinstance(lookup_result, dict) or lookup_result.get("status") != "built":
            raise RuntimeError(
                "Buildings lookup regeneration failed: "
                f"{lookup_result.get('note', lookup_result.get('status')) if isinstance(lookup_result, dict) else lookup_result}"
            )
        records = lookup_result.get("records")
        byte_count = lookup_result.get("bytes")
        if not isinstance(records, int) or records < 0 or not isinstance(byte_count, int) or byte_count < 0:
            raise RuntimeError("Buildings lookup regeneration returned an invalid manifest")
        commit_staged_files(
            (
                (staged_buildings, out_path),
                (staged_buildings_gzip, buildings_gzip_path),
                (staged_lookup, lookup_path),
                (staged_lookup_gzip, lookup_gzip_path),
            )
        )
    raw_size = out_path.stat().st_size
    logging.info("Buildings: %.1fMB (%d features)", raw_size / 1e6, len(buildings_web))

    amenities_legacy = _resolve_amenities_legacy(amenities_legacy_gdf)
    amenities_filtered = _prepare_amenities_all(amenities_legacy)
    amenities_all_path = DOCS_DATA_DIR / "amenities_all.geojson"
    write_minimal_geojson(
        amenities_filtered,
        amenities_all_path,
        precision=5,
        gzip_path=amenities_all_path.with_name(f"{amenities_all_path.name}.gz"),
    )
    if len(amenities_filtered):
        logging.info(
            "Amenities: %.1fMB (%d features)",
            amenities_all_path.stat().st_size / 1e6,
            len(amenities_filtered),
        )
    else:
        logging.warning("No legacy amenities for %s (expanded map layer will be empty).", amenities_all_path.name)

    trees_metric = _resolve_trees(trees_gdf)
    if trees_metric is not None:
        trees_metric = trees_metric.set_geometry(trees_metric.geometry.centroid)
        trees_web = trees_metric.to_crs(epsg=4326)[TREE_KEEP_COLUMNS].copy()
        trees_path = DOCS_DATA_DIR / "trees.geojson"
        write_minimal_geojson(
            trees_web,
            trees_path,
            precision=5,
            gzip_path=trees_path.with_name(f"{trees_path.name}.gz"),
        )
        logging.info(
            "Trees: %.1fMB (%d features, geometry only)",
            trees_path.stat().st_size / 1e6,
            len(trees_web),
        )

    parks_metric = _resolve_parks(parks_gdf)
    if parks_metric is not None:
        parks_web = simplify_geometries(parks_metric, PARK_SIMPLIFY_TOLERANCE_M).to_crs(epsg=4326)
        parks_path = DOCS_DATA_DIR / "parks.geojson"
        write_minimal_geojson(parks_web, parks_path, precision=5)
        logging.info("Parks: %.1fMB (%d features)", parks_path.stat().st_size / 1e6, len(parks_web))

    logging.info("Building isochrone GeoJSON for web...")
    iso_export = _isochrones_web_gdf(buildings, isochrones_gdf)
    if iso_export is not None and len(iso_export):
        write_minimal_geojson(
            iso_export,
            ISOCHRONES_WEB_PATH,
            precision=4,
            gzip_path=ISOCHRONES_WEB_PATH.with_name(f"{ISOCHRONES_WEB_PATH.name}.gz"),
        )
        logging.info(
            "Isochrones: %.1fMB (%d features)",
            ISOCHRONES_WEB_PATH.stat().st_size / 1e6,
            len(iso_export),
        )

    logging.info("Regenerating buildings lookup from serialized %s features...", out_path.name)
    logging.info(
        "Wrote %s (%d records, %.1fKB)",
        lookup_path.name,
        records or 0,
        lookup_path.stat().st_size / 1e3,
    )
