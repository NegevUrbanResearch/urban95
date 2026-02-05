import logging
import os
import warnings
from pathlib import Path

# Suppress PROJ/GDAL version mismatch warnings before importing geopandas
os.environ["PROJ_DEBUG"] = "OFF"
os.environ["PYPROJ_GLOBAL_CONTEXT"] = "ON"


class _ProjFilter(logging.Filter):
    """Filter out PROJ version mismatch warnings."""
    def filter(self, record):
        return "PROJ" not in record.getMessage()


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
for handler in logging.root.handlers:
    handler.addFilter(_ProjFilter())

import geopandas as gpd
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
OUTPUT_DIR = REPO_ROOT / "output"
DOCS_DATA_DIR = REPO_ROOT / "docs" / "data"  # Web-accessible output for deployment

# Columns to keep in output files (reduces file size and removes clutter)
AMENITY_KEEP_COLUMNS = [
    "name",
    "hebrew_nam",
    "english_na",
    "amenity_type",
    "top_classi",
    "subcategor",
    "geometry",
]

# Amenity types to exclude from output (invalid or useless)
EXCLUDED_AMENITY_TYPES = {"none", "other", "private_establishment"}


def repair_hebrew_encoding(text: str) -> str:
    """Attempts to repair garbled Hebrew text (Mojibake from double UTF-8 encoding).
    
    This fixes text that was UTF-8 encoded, then those bytes were incorrectly 
    interpreted as Latin-1, and then re-saved as UTF-8. This reverses that process
    by encoding to Latin-1 (to recover original UTF-8 bytes) then decoding as UTF-8.
    """
    if not isinstance(text, str) or not text:
        return text
    
    # Check if text contains Mojibake patterns (double-encoded UTF-8 typically starts with ×)
    if "×" not in text:
        return text
    
    try:
        # Reverse the double encoding: encode to latin-1, decode as utf-8
        repaired = text.encode("latin-1", errors="ignore").decode("utf-8", errors="ignore")
        return repaired
    except (UnicodeDecodeError, UnicodeEncodeError):
        return text


def repair_dataframe_encoding(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Repairs Hebrew encoding in string columns of a GeoDataFrame."""
    gdf = gdf.copy()
    
    for col in gdf.columns:
        if gdf[col].dtype == object:
            gdf[col] = gdf[col].apply(
                lambda x: repair_hebrew_encoding(x) if isinstance(x, str) else x
            )
    
    return gdf


def _unique_columns(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Renames duplicate column names so GeoDataFrame can be written to GeoJSON."""
    cols = list(gdf.columns)
    if len(cols) == len(set(cols)):
        return gdf
    seen = {}
    new_cols = []
    for c in cols:
        if c in seen:
            seen[c] += 1
            new_cols.append(f"{c}_{seen[c]}")
        else:
            seen[c] = 0
            new_cols.append(c)
    out = gdf.copy()
    out.columns = new_cols
    return out


def load_layer(path: Path, target_crs: int) -> gpd.GeoDataFrame:
    """Loads a GeoJSON/shape layer and reprojects it to target_crs."""
    gdf = gpd.read_file(path)
    gdf = _unique_columns(gdf)
    if gdf.crs is None:
        raise ValueError(f"Layer {path} has no CRS defined.")
    if gdf.crs.to_epsg() != target_crs:
        gdf = gdf.to_crs(epsg=target_crs)
    return gdf


def compute_building_accessibility(
    buffer_m: float = 100.0,
    amenity_type_column: str = "top_classi",
) -> None:
    """Computes per-building accessibility metrics for each amenity type and writes optimized GeoJSON outputs."""
    OUTPUT_DIR.mkdir(exist_ok=True)

    buildings_path = DATA_DIR / "buildings.geojson"
    amenities_path = DATA_DIR / "amenities.geojson"
    trees_path = DATA_DIR / "sidewalks_and_trees.geojson"
    parks_path = DATA_DIR / "parks_and_greenspaces.geojson"

    logging.info("Loading buildings and amenities...")
    crs_metric = 2039
    buildings = load_layer(buildings_path, target_crs=crs_metric)
    amenities = load_layer(amenities_path, target_crs=crs_metric)
    
    logging.info("Repairing Hebrew text encoding...")
    amenities = repair_dataframe_encoding(amenities)

    trees_gdf = None
    if trees_path.exists():
        try:
            trees_gdf = load_layer(trees_path, target_crs=crs_metric)
        except Exception as e:
            logging.warning("Could not load trees: %s", e)
    parks_gdf = None
    if parks_path.exists():
        try:
            parks_gdf = load_layer(parks_path, target_crs=crs_metric)
        except Exception as e:
            logging.warning("Could not load parks: %s", e)

    logging.info("Preparing building buffers...")
    buildings = buildings.reset_index(drop=True)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        valid = ~buildings.geometry.is_empty
        try:
            valid = valid & buildings.geometry.is_valid
        except Exception:
            pass
    buildings = buildings[valid].copy()
    buildings["building_id"] = buildings.index
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        buildings["buffer_m"] = buildings.geometry.buffer(buffer_m)

    logging.info("Preparing amenities with type classification...")
    amenities = amenities.copy()
    if amenity_type_column not in amenities.columns:
        raise KeyError(f"Expected column '{amenity_type_column}' in amenities layer.")

    amenities["amenity_type"] = (
        amenities[amenity_type_column]
        .astype(str)
        .str.strip()
        .str.lower()
        .str.replace(" ", "_", regex=False)
        .str.replace("/", "_", regex=False)
        .replace({"nan": None})
    )
    amenities = amenities[~amenities["amenity_type"].isna()]

    logging.info("Running spatial join between amenities and building buffers...")
    joined = gpd.sjoin(
        amenities.set_geometry("geometry"),
        buildings.set_geometry("buffer_m")[["building_id", "buffer_m", "geometry"]],
        predicate="within",
        how="left",
    )

    logging.info("Aggregating counts per building and amenity type...")
    counts = (
        joined.dropna(subset=["building_id"])
        .groupby(["building_id", "amenity_type"])
        .size()
        .reset_index(name="count")
    )

    pivot = counts.pivot(index="building_id", columns="amenity_type", values="count").fillna(0)
    pivot.columns = [f"amen_{str(c).replace(' ', '_')}" for c in pivot.columns]
    pivot = pivot.reset_index()

    logging.info("Merging accessibility metrics back to buildings...")
    buildings = buildings.merge(pivot, on="building_id", how="left")
    metric_cols = [c for c in buildings.columns if c.startswith("amen_")]
    for c in metric_cols:
        buildings[c] = buildings[c].fillna(0).astype(int)
    buildings["num_amenities"] = buildings[metric_cols].sum(axis=1).astype(int)

    if trees_gdf is not None:
        logging.info("Computing num_trees per building...")
        tree_join = gpd.sjoin(
            trees_gdf,
            buildings.set_geometry("buffer_m")[["building_id", "buffer_m"]],
            predicate="within",
            how="left",
        )
        tree_counts = tree_join.dropna(subset=["building_id"]).groupby("building_id").size()
        buildings["num_trees"] = buildings["building_id"].map(tree_counts).fillna(0).astype(int)
    else:
        buildings["num_trees"] = 0

    to_export = buildings.drop(columns=["buffer_m"], errors="ignore")
    geom_cols = [c for c in to_export.columns if c != to_export.geometry.name and hasattr(to_export[c].dtype, "name") and str(to_export[c].dtype.name).lower() == "geometry"]
    for c in geom_cols:
        to_export = to_export.drop(columns=[c])
    to_export = _unique_columns(to_export)
    buildings_wgs84 = to_export.to_crs(epsg=4326)
    amenities_wgs84 = amenities.to_crs(epsg=4326)

    buildings_out = OUTPUT_DIR / "buildings_accessibility.geojson"
    logging.info("Writing buildings with accessibility metrics: %s", buildings_out)
    buildings_wgs84.to_file(buildings_out, driver="GeoJSON")

    # Filter amenities: exclude invalid types and null geometries
    amenities_filtered = amenities_wgs84[
        ~amenities_wgs84["amenity_type"].isin(EXCLUDED_AMENITY_TYPES)
        & ~amenities_wgs84.geometry.is_empty
        & amenities_wgs84.geometry.notna()
    ]
    
    # Keep only essential columns for the amenities output
    amenity_cols = [c for c in AMENITY_KEEP_COLUMNS if c in amenities_filtered.columns]
    amenities_filtered = amenities_filtered[amenity_cols]
    
    amenities_all_path = OUTPUT_DIR / "amenities_all.geojson"
    amenities_filtered.to_file(amenities_all_path, driver="GeoJSON")
    logging.info("Wrote %s (%d features)", amenities_all_path, len(amenities_filtered))

    logging.info("Writing per-amenity-type point layers for heatmaps...")
    for amen_type, subset in amenities_filtered.groupby("amenity_type"):
        safe_name = str(amen_type).replace(" ", "_").replace("/", "_").replace("\\", "_")
        out_path = OUTPUT_DIR / f"amenities_{safe_name}.geojson"
        logging.info("  %s: %d features -> %s", amen_type, len(subset), out_path)
        subset.to_file(out_path, driver="GeoJSON")

    trees_wgs84 = None
    if trees_gdf is not None:
        # Compute centroids in projected CRS (metric) then convert to WGS84
        trees_gdf = trees_gdf.set_geometry(trees_gdf.geometry.centroid)
        trees_wgs84 = trees_gdf.to_crs(epsg=4326)
        out_trees = OUTPUT_DIR / "trees.geojson"
        trees_wgs84.to_file(out_trees, driver="GeoJSON")
        logging.info("Wrote %s", out_trees)
    
    parks_wgs84 = None
    if parks_gdf is not None:
        parks_wgs84 = parks_gdf.to_crs(epsg=4326)
        out_parks = OUTPUT_DIR / "parks.geojson"
        parks_wgs84.to_file(out_parks, driver="GeoJSON")
        logging.info("Wrote %s", out_parks)

    # Write web-accessible files to docs/data/ for website deployment
    logging.info("Writing web files to docs/data/...")
    DOCS_DATA_DIR.mkdir(exist_ok=True)
    
    buildings_wgs84.to_file(DOCS_DATA_DIR / "buildings_accessibility.geojson", driver="GeoJSON")
    amenities_filtered.to_file(DOCS_DATA_DIR / "amenities_all.geojson", driver="GeoJSON")
    
    if trees_wgs84 is not None:
        trees_wgs84.to_file(DOCS_DATA_DIR / "trees.geojson", driver="GeoJSON")
    if parks_wgs84 is not None:
        parks_wgs84.to_file(DOCS_DATA_DIR / "parks.geojson", driver="GeoJSON")
    
    logging.info("Accessibility preprocessing complete.")


if __name__ == "__main__":
    compute_building_accessibility()
