"""Load and filter raw residential buildings for pipeline stages."""
from __future__ import annotations

import logging
import warnings

import geopandas as gpd

from core.geo_io import CRS_METRIC, load_layer, unique_columns
from core.paths import layer

EXCLUDED_NON_RESIDENTIAL_NEIGHBORHOODS = {"עמק שרה", "אזור התעשייה"}

BUILDING_DROP_COLUMNS = [
    "background",
    "Entrances",
    "Not_reside",
    "Used",
    "RuleID",
    "Name",
    "Shape_Leng",
    "Shape_Area",
    "height",
]

BUILDING_SIMPLIFY_TOLERANCE_M = 1.5
PARK_SIMPLIFY_TOLERANCE_M = 2.0


def load_raw_buildings(*, crs_metric: int = CRS_METRIC) -> gpd.GeoDataFrame:
    """Load residential buildings with neighborhood exclusions and building_id assigned."""
    buildings_path = layer("buildings").path
    if not buildings_path.is_file():
        raise FileNotFoundError(f"No buildings layer found. Expected: {buildings_path}")

    logging.info("Loading buildings from %s...", buildings_path)
    buildings = load_layer(buildings_path, target_crs=crs_metric)
    if "Used" in buildings.columns:
        total = len(buildings)
        buildings = buildings[buildings["Used"].astype(str).str.strip() == "מגורים"].copy()
        logging.info("Residential only (מגורים): %d of %d buildings", len(buildings), total)
        if len(buildings) == 0:
            raise ValueError("No buildings left after filtering Used == מגורים")

    neighborhoods_path = layer("neighborhoods").path
    if not neighborhoods_path.is_file():
        logging.info("metric omitted: neighborhoods")
        logging.warning(
            "Skipping non-residential neighborhood exclusion (neighborhoods.geojson not found)."
        )
    else:
        neighborhoods = load_layer(neighborhoods_path, target_crs=crs_metric)
        if "Name" not in neighborhoods.columns:
            logging.warning(
                "Skipping non-residential neighborhood exclusion (%s has no Name column).",
                neighborhoods_path,
            )
        else:
            excluded = neighborhoods[
                neighborhoods["Name"]
                .astype(str)
                .str.strip()
                .isin(EXCLUDED_NON_RESIDENTIAL_NEIGHBORHOODS)
            ].copy()
            if excluded.empty:
                logging.warning(
                    "Skipping non-residential neighborhood exclusion (target names not found in %s).",
                    neighborhoods_path,
                )
            else:
                centroids = gpd.GeoDataFrame(
                    {"_building_index": buildings.index},
                    geometry=buildings.geometry.centroid,
                    crs=buildings.crs,
                )
                joined = gpd.sjoin(
                    centroids,
                    excluded[["geometry"]],
                    predicate="within",
                    how="left",
                )
                mask = joined["index_right"].isna().to_numpy()
                dropped = int((~mask).sum())
                buildings = buildings.iloc[mask].copy()
                logging.info(
                    "Excluded %d buildings in non-residential neighborhoods: %s",
                    dropped,
                    ", ".join(sorted(EXCLUDED_NON_RESIDENTIAL_NEIGHBORHOODS)),
                )

    buildings = buildings.reset_index(drop=True)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        valid = ~buildings.geometry.is_empty
        try:
            valid = valid & buildings.geometry.is_valid
        except (NotImplementedError, TypeError) as exc:
            logging.warning("Skipping geometry.is_valid filter: %s", exc)
    buildings = buildings[valid].copy()
    buildings["building_id"] = buildings.index
    return unique_columns(buildings)
