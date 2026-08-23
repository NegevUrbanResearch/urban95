from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import geopandas as gpd

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "data" / "raw"
SURVEY_RAW_DIR = RAW_DIR / "survey_results"
OUTPUT_DIR = REPO_ROOT / "output"
DOCS_DATA_DIR = REPO_ROOT / "docs" / "data"
SCORED_BUILDINGS = OUTPUT_DIR / "buildings_scored.geojson"
METRIC_COL_PREFIXES = ("score_", "access_", "amen_", "num_", "clean_")

SURVEY_SOURCE_FILES = {
    "walkability_barrier": "01_חלק_ג_חסמי_הליכתיות.geojson",
    "crossing_hazard": "02_חלק_ג_נקודות_סיכון_חצייה.geojson",
    "loved_place": "03_חלק_ד_מקומות_אהובים.geojson",
    "community_anchor": "04_חלק_ו_עוגן_קהילתי.geojson",
}


@dataclass(frozen=True)
class Layer:
    id: str
    path: Path
    required: bool
    kind: str  # raw | intermediate | publish
    provisional: bool = False
    notes: str = ""


SHADE_SEED_NAMES = (
    "bsv_street_summer_shade_index.geojson",
    "bsv_open_spaces_summer_shade_index.geojson",
    "manifest.json",
)

LAYERS: dict[str, Layer] = {
    "buildings": Layer("buildings", RAW_DIR / "buildings.geojson.gz", True, "raw", False),
    "amenities_legacy": Layer(
        "amenities_legacy", RAW_DIR / "amenities_legacy.geojson", False, "raw", True
    ),
    "amenities_clean": Layer(
        "amenities_clean", RAW_DIR / "amenities_clean.geojson", True, "raw", True
    ),
    "trees": Layer("trees", RAW_DIR / "trees.geojson.gz", False, "raw", False),
    "parks": Layer("parks", RAW_DIR / "parks.geojson", False, "raw", True),
    "neighborhoods": Layer(
        "neighborhoods", RAW_DIR / "neighborhoods.geojson", False, "raw", True
    ),
    "street_lights": Layer(
        "street_lights", RAW_DIR / "street_lights.geojson", False, "raw", True
    ),
    "roads": Layer("roads", RAW_DIR / "roads.geojson", False, "raw", True),
    "urban_nature_areas": Layer(
        "urban_nature_areas", RAW_DIR / "urban_nature_areas.geojson", False, "raw", True
    ),
    "bus_stops": Layer("bus_stops", RAW_DIR / "bus_stops.geojson", False, "raw", True),
    "shade_street": Layer(
        "shade_street",
        RAW_DIR / "arcgis_shade" / "bsv_street_summer_shade_index.geojson",
        True,
        "raw",
        False,
    ),
    "shade_open_space": Layer(
        "shade_open_space",
        RAW_DIR / "arcgis_shade" / "bsv_open_spaces_summer_shade_index.geojson",
        True,
        "raw",
        False,
    ),
    "shade_si_street": Layer(
        "shade_si_street",
        OUTPUT_DIR / "shade_si" / "street_summer_si.geojson",
        True,
        "intermediate",
    ),
    "shade_si_open": Layer(
        "shade_si_open",
        OUTPUT_DIR / "shade_si" / "open_space_summer_si.geojson",
        True,
        "intermediate",
    ),
    "isochrone_cache": Layer(
        "isochrone_cache", OUTPUT_DIR / "isochrone_cache", False, "intermediate"
    ),
    "isochrones_intermediate": Layer(
        "isochrones_intermediate",
        OUTPUT_DIR / "isochrones" / "isochrones.geojson",
        False,
        "intermediate",
    ),
    "publish_buildings": Layer(
        "publish_buildings",
        DOCS_DATA_DIR / "buildings_accessibility.geojson",
        False,
        "publish",
    ),
    "publish_buildings_gz": Layer(
        "publish_buildings_gz",
        DOCS_DATA_DIR / "buildings_accessibility.geojson.gz",
        False,
        "publish",
    ),
    "publish_buildings_lookup": Layer(
        "publish_buildings_lookup",
        DOCS_DATA_DIR / "buildings_lookup.json",
        False,
        "publish",
    ),
    **{
        f"survey_raw_{category}": Layer(
            f"survey_raw_{category}", SURVEY_RAW_DIR / filename, False, "raw"
        )
        for category, filename in SURVEY_SOURCE_FILES.items()
    },
    "publish_survey": Layer(
        "publish_survey",
        DOCS_DATA_DIR / "survey_results.geojson",
        False,
        "publish",
    ),
}

# Shade authoritative source: data/raw/arcgis_shade/ (SHADE_SEED_NAMES).
SEED_MAP: list[tuple[Path, Path]] = [
    (RAW_DIR / "amenities_legacy.geojson", DOCS_DATA_DIR / "amenities_all.geojson"),
    (RAW_DIR / "amenities_clean.geojson", DOCS_DATA_DIR / "amenities_new.geojson"),
    (RAW_DIR / "parks.geojson", DOCS_DATA_DIR / "parks.geojson"),
    (RAW_DIR / "neighborhoods.geojson", DOCS_DATA_DIR / "neighborhoods.geojson"),
    (RAW_DIR / "street_lights.geojson", DOCS_DATA_DIR / "street_lights.geojson"),
    (RAW_DIR / "roads.geojson", DOCS_DATA_DIR / "roads.geojson"),
    (RAW_DIR / "urban_nature_areas.geojson", DOCS_DATA_DIR / "urban_nature_areas.geojson"),
    (RAW_DIR / "bus_stops.geojson", DOCS_DATA_DIR / "bus_stops.geojson"),
]


def layer(layer_id: str) -> Layer:
    try:
        return LAYERS[layer_id]
    except KeyError as exc:
        raise KeyError(f"Unknown layer id: {layer_id!r}") from exc


def strip_building_metric_columns(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    drop = [
        c
        for c in gdf.columns
        if c != gdf.geometry.name
        and (c == "summer_si" or any(c.startswith(p) for p in METRIC_COL_PREFIXES))
    ]
    return gdf.drop(columns=drop, errors="ignore")
