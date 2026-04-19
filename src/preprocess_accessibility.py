import logging
import os
import warnings
import math
import re
import gzip
from pathlib import Path
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

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
import json
import time
import runpy

import requests
from dotenv import load_dotenv
from shapely.geometry import shape as shapely_shape
from tqdm.auto import tqdm

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
FILTERED_DIR = REPO_ROOT / "filtered"
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

# Columns to keep for trees (minimal - just need location)
TREE_KEEP_COLUMNS = ["geometry"]

# Columns to keep for buildings (remove display-only metadata)
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

# Amenity types to exclude from output (invalid or useless)
EXCLUDED_AMENITY_TYPES = {"none", "other", "private_establishment"}

# Geometry simplification tolerance in meters (for web output)
# Higher values = smaller files but less detailed shapes
BUILDING_SIMPLIFY_TOLERANCE_M = 1.5  # 1.5 meter tolerance for buildings (good balance of size/detail)
PARK_SIMPLIFY_TOLERANCE_M = 2.0  # Parks can use higher tolerance since they're larger shapes

WALK_MINUTES = [5, 10, 15]
ISOCHRONE_CACHE_DIR = OUTPUT_DIR / "isochrone_cache"
_DEFAULT_HIGH_WORKERS = max(16, min(64, (os.cpu_count() or 8) * 4))
INDEX_SCORE_WORKERS = max(1, int(os.getenv("INDEX_SCORE_WORKERS", _DEFAULT_HIGH_WORKERS)))
ISOCHRONE_FETCH_WORKERS = max(1, int(os.getenv("ISOCHRONE_FETCH_WORKERS", _DEFAULT_HIGH_WORKERS)))

# Weighted "clean" score (points per unit within walk isochrone). Only layers present in the
# merged manifest; roads/shadow omitted. Keys match amenity_type in amenities_new / street_lights.
CLEAN_WEIGHTS = {
    "trees": 4.0,
    "parks": 15.0,
    "playgrounds": 15.0,
    "street-lights": 3.75,
    "bus_stops": 7.5,
    "shelters": 10.0,
    "education": 7.5,
    "community-centers": 5.0,
    "businesscenters": 5.0,
    "health": 7.5,
}

WEIGHTED_CATEGORY_STEMS = {
    "Environmental Quality": "environmental_quality",
    "Nature": "nature",
    "Play": "play",
    "Safety & Mobility": "safety_mobility",
    "Family Services": "family_services",
}


def _clean_pts_column_stem(weight_key: str) -> str:
    return str(weight_key).replace("-", "_")


def _weighted_component_stem(name: str) -> str:
    s = str(name or "").strip().lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = s.strip("_")
    return s or "component"


def append_weighted_urban95_scores(
    buildings: gpd.GeoDataFrame,
    data_dir: Path,
    workers: int = INDEX_SCORE_WORKERS,
) -> gpd.GeoDataFrame:
    """Appends Urban95 weighted score columns using src/index calculation.py methodology."""
    module_path = REPO_ROOT / "src" / "index calculation.py"
    mod = runpy.run_path(str(module_path))
    build_layers = mod["build_layers_from_docs_data"]
    calculate_master_index = mod["calculate_master_index"]
    subcategory_weight_map = mod.get("CATEGORY_SUBCATEGORY_WEIGHTS", {}) or {}

    layers = build_layers(data_dir=data_dir, target_epsg=2039)
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

    def _score_one(idx: int, x: float, y: float):
        try:
            result = calculate_master_index(x, y, layers)
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
        except Exception:
            weighted = 0.0
            out_cat = {stem: 0.0 for stem in WEIGHTED_CATEGORY_STEMS.values()}
            out_sub = {k: 0.0 for k in subcategory_scores.keys()}
        return idx, weighted, out_cat, out_sub

    if total > 0:
        with ThreadPoolExecutor(max_workers=max(1, int(workers))) as executor:
            futures = [
                executor.submit(_score_one, idx, float(pt.x), float(pt.y))
                for idx, pt in enumerate(centroids)
            ]
            for future in tqdm(
                as_completed(futures),
                total=total,
                desc="Urban95 weighted score",
                unit="building",
            ):
                idx, weighted, out_cat, out_sub = future.result()
                weighted_scores[idx] = weighted
                for stem, val in out_cat.items():
                    category_scores[stem][idx] = val
                for key, val in out_sub.items():
                    if key in subcategory_scores:
                        subcategory_scores[key][idx] = val

    for minutes in WALK_MINUTES:
        suffix = f"_{minutes}min"
        buildings[f"score_weighted{suffix}"] = weighted_scores
        for stem, vals in category_scores.items():
            buildings[f"score_weighted_{stem}{suffix}"] = vals
        for (cat_stem, sub_stem), vals in subcategory_scores.items():
            buildings[f"score_weighted_sub_{cat_stem}_{sub_stem}{suffix}"] = vals

    return buildings


def _init_clean_pts_columns(buildings, suffix: str) -> None:
    for wk in CLEAN_WEIGHTS:
        stem = _clean_pts_column_stem(wk)
        buildings[f"clean_pts_{stem}{suffix}"] = 0.0


def _normalize_clean_amenity_key(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    s = str(value).strip().lower().replace(" ", "_")
    return s


def append_shelters_from_merged_to_legacy(
    amenities_legacy: gpd.GeoDataFrame,
    merged_path: Path,
    crs_metric: int,
    amenity_type_column: str,
) -> gpd.GeoDataFrame:
    """Adds shelter points from docs/data/amenities_new.geojson into the legacy amenity set for expanded scoring and amenities_all output."""
    if not merged_path.is_file():
        return amenities_legacy
    m = gpd.read_file(merged_path)
    if m.crs is None:
        m.set_crs(epsg=4326, inplace=True)
    m = repair_dataframe_encoding(m)
    m = m.to_crs(epsg=crs_metric)
    if "amenity_type" not in m.columns:
        return amenities_legacy
    sh = m[m["amenity_type"].map(_normalize_clean_amenity_key) == "shelters"].copy()
    if len(sh) == 0:
        return amenities_legacy
    sh["amenity_type"] = "shelters"
    if len(amenities_legacy) == 0:
        if amenity_type_column not in sh.columns:
            sh[amenity_type_column] = "shelters"
        return sh
    for c in amenities_legacy.columns:
        if c == amenities_legacy.geometry.name:
            continue
        if c not in sh.columns:
            sh[c] = None
    sh = sh[amenities_legacy.columns]
    out = gpd.GeoDataFrame(pd.concat([amenities_legacy, sh], ignore_index=True), crs=amenities_legacy.crs)
    logging.info("Appended %d shelter points from merged manifest to legacy amenities.", len(sh))
    return out


def repair_text_encoding(text: str) -> str:
    """Attempts to repair garbled text (Mojibake from double UTF-8 encoding).
    
    This fixes text that was UTF-8 encoded, then those bytes were incorrectly 
    interpreted as Latin-1, and then re-saved as UTF-8. This reverses that process
    by encoding to Latin-1 (to recover original UTF-8 bytes) then decoding as UTF-8.
    
    Handles both Hebrew (× patterns) and Arabic (Ø patterns) double-encoding.
    """
    if not isinstance(text, str) or not text:
        return text
    
    # Check if text contains Mojibake patterns:
    # - Hebrew double-encoded UTF-8 typically contains ×
    # - Arabic double-encoded UTF-8 typically contains Ø
    # - Other RTL scripts may have similar patterns with Ù, Ú, etc.
    mojibake_indicators = ("×", "Ø", "Ù", "Ú", "Û", "Ü")
    
    if not any(indicator in text for indicator in mojibake_indicators):
        return text
    
    try:
        # Reverse the double encoding: encode to latin-1, decode as utf-8
        repaired = text.encode("latin-1", errors="ignore").decode("utf-8", errors="ignore")
        
        # Verify the repair worked (repaired text should have actual RTL characters)
        # If repair produces empty or same result, return original
        if not repaired or repaired == text:
            return text
            
        return repaired
    except (UnicodeDecodeError, UnicodeEncodeError):
        return text


# Keep old function name as alias for backwards compatibility
repair_hebrew_encoding = repair_text_encoding


def repair_dataframe_encoding(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Repairs text encoding (Hebrew, Arabic, etc.) in string columns of a GeoDataFrame."""
    gdf = gdf.copy()
    
    for col in gdf.columns:
        if gdf[col].dtype == object:
            gdf[col] = gdf[col].apply(
                lambda x: repair_text_encoding(x) if isinstance(x, str) else x
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
    if str(path).endswith(".geojson.gz"):
        with gzip.open(path, "rt", encoding="utf-8") as f:
            data = json.load(f)
        gdf = gpd.GeoDataFrame.from_features(data.get("features") or [])
        if gdf.crs is None:
            gdf = gdf.set_crs(epsg=4326)
    else:
        gdf = gpd.read_file(path)
    gdf = _unique_columns(gdf)
    if gdf.crs is None:
        raise ValueError(f"Layer {path} has no CRS defined.")
    if gdf.crs.to_epsg() != target_crs:
        gdf = gdf.to_crs(epsg=target_crs)
    return gdf


def simplify_geometries(gdf: gpd.GeoDataFrame, tolerance_m: float) -> gpd.GeoDataFrame:
    """Simplifies polygon geometries using Douglas-Peucker algorithm.
    
    Args:
        gdf: GeoDataFrame with polygon geometries (should be in a metric CRS for accurate tolerance)
        tolerance_m: Simplification tolerance in meters. Higher = more simplification.
    
    Returns:
        GeoDataFrame with simplified geometries
    """
    simplified = gdf.copy()
    original_crs = simplified.crs
    
    # Convert to metric CRS if not already (EPSG:2039 is Israel TM Grid)
    if original_crs and original_crs.to_epsg() == 4326:
        simplified = simplified.to_crs(epsg=2039)
    
    # Make geometries valid before simplifying (fixes self-intersections, etc.)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        simplified["geometry"] = simplified.geometry.make_valid()
        # Simplify geometries, preserving topology
        simplified["geometry"] = simplified.geometry.simplify(tolerance_m, preserve_topology=True)
    
    # Convert back to original CRS if we changed it
    if original_crs and original_crs.to_epsg() == 4326:
        simplified = simplified.to_crs(original_crs)
    
    return simplified


def write_minimal_geojson(gdf: gpd.GeoDataFrame, path: Path, precision: int = 5) -> None:
    """Writes GeoJSON with minimal overhead (no CRS, reduced precision).
    
    This produces smaller files than geopandas default output by:
    - Omitting the CRS property (web maps default to WGS84)
    - Omitting the 'name' property
    - Using reduced coordinate precision
    """
    import json
    from shapely.geometry import mapping
    
    def _sanitize_json_value(value):
        """Converts pandas/numpy values to JSON-safe primitives."""
        if hasattr(value, "item"):
            value = value.item()
        if value is None:
            return None
        if isinstance(value, float):
            return value if math.isfinite(value) else 0.0
        if isinstance(value, dict):
            return {k: _sanitize_json_value(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [_sanitize_json_value(v) for v in value]
        try:
            if pd.isna(value):
                return None
        except Exception:
            pass
        return value

    features = []
    for _, row in gdf.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        
        geom_json = mapping(geom)
        geom_json = _round_geojson_coords(geom_json, precision)
        
        props = {}
        for k, v in row.items():
            if k == gdf.geometry.name:
                continue
            sanitized = _sanitize_json_value(v)
            if sanitized is not None:
                props[k] = sanitized
        
        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": geom_json
        })
    
    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    
    with open(path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, separators=(",", ":"), allow_nan=False)


def write_gzip_copy(path: Path, compresslevel: int = 6) -> Path | None:
    """Writes a .gz compressed sibling file for a GeoJSON/JSON payload."""
    if not path.exists() or path.suffix.lower() not in {".geojson", ".json"}:
        return None
    gz_path = path.with_suffix(path.suffix + ".gz")
    with open(path, "rb") as src, gzip.open(gz_path, "wb", compresslevel=compresslevel) as dst:
        dst.write(src.read())
    return gz_path


def reduce_coordinate_precision(gdf: gpd.GeoDataFrame, precision: int = 6) -> gpd.GeoDataFrame:
    """Reduces coordinate precision to save file size.
    
    Args:
        gdf: GeoDataFrame in WGS84 (EPSG:4326)
        precision: Number of decimal places (6 = ~10cm precision, 5 = ~1m precision)
    
    Returns:
        GeoDataFrame with rounded coordinates
    """
    from shapely import wkt
    from shapely.geometry import shape, mapping
    import json
    
    reduced = gdf.copy()
    
    def round_coords(geom):
        if geom is None or geom.is_empty:
            return geom
        # Convert to GeoJSON, round coordinates, convert back
        geojson = mapping(geom)
        rounded = _round_geojson_coords(geojson, precision)
        return shape(rounded)
    
    reduced["geometry"] = reduced.geometry.apply(round_coords)
    return reduced


def _round_geojson_coords(geojson: dict, precision: int) -> dict:
    """Recursively rounds coordinates in a GeoJSON geometry dict."""
    geom_type = geojson.get("type")
    coords = geojson.get("coordinates")
    
    if coords is None:
        return geojson
    
    def round_coord(c):
        if isinstance(c, (list, tuple)):
            if len(c) >= 2 and isinstance(c[0], (int, float)):
                # This is a coordinate pair/triple
                return [round(x, precision) for x in c]
            else:
                # This is a list of coordinates or rings
                return [round_coord(x) for x in c]
        return c
    
    return {"type": geom_type, "coordinates": round_coord(coords)}


_thread_local = threading.local()


def _get_session() -> requests.Session:
    """Returns a reusable requests session (connection pooling)."""
    session = getattr(_thread_local, "session", None)
    if session is None:
        session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=ISOCHRONE_FETCH_WORKERS,
            pool_maxsize=ISOCHRONE_FETCH_WORKERS,
        )
        session.mount("https://", adapter)
        _thread_local.session = session
    return session


def load_mapbox_token() -> str:
    """Loads the Mapbox access token from the .env file."""
    load_dotenv(REPO_ROOT / ".env")
    token = os.getenv("mapbox_access_token")
    if not token:
        raise ValueError("mapbox_access_token not found in .env file")
    return token


def _load_valid_cached_isochrone_payload(cache_file: Path):
    """Loads a cached isochrone payload and deletes it if invalid."""
    if not cache_file.exists():
        return None

    try:
        with open(cache_file) as f:
            data = json.load(f)
    except Exception:
        logging.warning("Invalid JSON cache file, deleting: %s", cache_file.name)
        cache_file.unlink(missing_ok=True)
        return None

    features = data.get("features")
    if not isinstance(features, list):
        logging.warning("Invalid isochrone cache payload, deleting: %s", cache_file.name)
        cache_file.unlink(missing_ok=True)
        return None

    return data


def fetch_isochrones(lng: float, lat: float, token: str, minutes: list = None) -> dict:
    """Fetches walking isochrone polygons from Mapbox API with local file caching.

    Returns a dict mapping minute values to Shapely polygons (WGS84).
    Cache hits skip the network entirely.
    """
    if minutes is None:
        minutes = WALK_MINUTES

    ISOCHRONE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_key = f"{lng:.5f}_{lat:.5f}"
    cache_file = ISOCHRONE_CACHE_DIR / f"{cache_key}.json"

    data = _load_valid_cached_isochrone_payload(cache_file)
    if data is None:
        contours = ",".join(str(m) for m in minutes)
        url = f"https://api.mapbox.com/isochrone/v1/mapbox/walking/{lng},{lat}"
        params = {
            "contours_minutes": contours,
            "polygons": "true",
            "access_token": token,
        }
        session = _get_session()

        resp = None
        for attempt in range(6):
            resp = session.get(url, params=params, timeout=(8, 25))
            if resp.status_code == 429:
                retry_after = resp.headers.get("Retry-After")
                if retry_after:
                    try:
                        wait = float(retry_after)
                    except ValueError:
                        wait = min(1.5 ** (attempt + 1), 12)
                else:
                    wait = min(1.5 ** (attempt + 1), 12)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            break
        else:
            if resp is not None:
                resp.raise_for_status()

        if not resp.text.strip():
            raise ValueError("Empty response from Mapbox API")

        data = resp.json()
        features = data.get("features")
        if not isinstance(features, list):
            message = data.get("message")
            if message:
                raise ValueError(f"Unexpected API response: {message}")
            raise ValueError(f"Unexpected API response: {list(data.keys())}")

        with open(cache_file, "w") as f:
            json.dump(data, f)

    result = {}
    for feature in data.get("features", []):
        contour = feature["properties"]["contour"]
        result[contour] = shapely_shape(feature["geometry"])
    return result


def compute_building_accessibility(
    amenity_type_column: str = "amenity_type",
) -> None:
    """Computes per-building accessibility metrics using Mapbox walking isochrones and writes optimized GeoJSON outputs."""
    OUTPUT_DIR.mkdir(exist_ok=True)
    token = load_mapbox_token()

    def first_existing_path(candidates: list[Path]) -> Path | None:
        for p in candidates:
            if p.is_file():
                return p
        return None

    buildings_candidates = [
        FILTERED_DIR / "buildings.geojson",
        DATA_DIR / "buildings.geojson",
        DOCS_DATA_DIR / "buildings_accessibility.geojson.gz",
        DOCS_DATA_DIR / "buildings_accessibility.geojson",
    ]
    legacy_amenities_candidates = [
        DATA_DIR / "amenities.geojson",
        FILTERED_DIR / "amenities.geojson",
        DOCS_DATA_DIR / "amenities_all.geojson",
    ]
    trees_candidates = [
        DATA_DIR / "sidewalks_and_trees.geojson",
        FILTERED_DIR / "sidewalks_and_trees.geojson",
        DOCS_DATA_DIR / "trees.geojson",
    ]
    parks_candidates = [
        DATA_DIR / "parks_and_greenspaces.geojson",
        FILTERED_DIR / "parks_and_greenspaces.geojson",
        DOCS_DATA_DIR / "parks.geojson",
    ]

    buildings_path = first_existing_path(buildings_candidates)
    legacy_amenities_path = first_existing_path(legacy_amenities_candidates)
    trees_path = first_existing_path(trees_candidates)
    parks_path = first_existing_path(parks_candidates)

    if buildings_path is None:
        candidate_text = ", ".join(str(p) for p in buildings_candidates)
        raise FileNotFoundError(
            f"No buildings layer found. Tried: {candidate_text}"
        )

    logging.info("Loading buildings from %s...", buildings_path)
    crs_metric = 2039
    buildings = load_layer(buildings_path, target_crs=crs_metric)
    if "Used" in buildings.columns:
        _n = len(buildings)
        buildings = buildings[buildings["Used"].astype(str).str.strip() == "מגורים"].copy()
        logging.info("Residential only (מגורים): %d of %d buildings", len(buildings), _n)
        if len(buildings) == 0:
            raise ValueError("No buildings left after filtering Used == מגורים")

    amenities_legacy = gpd.GeoDataFrame()
    if legacy_amenities_path is not None and legacy_amenities_path.is_file():
        amenities_legacy = load_layer(legacy_amenities_path, target_crs=crs_metric)
        logging.info("Repairing text encoding on legacy amenities (Hebrew/Arabic)...")
        amenities_legacy = repair_dataframe_encoding(amenities_legacy)
    else:
        logging.warning(
            "Missing %s — expanded (main-branch) scores will be zero. Place the legacy amenities file for expanded metrics.",
            legacy_amenities_path,
        )

    clean_parts = []
    merged_path = DOCS_DATA_DIR / "amenities_new.geojson"
    street_lights_gdf = None
    sl_path = DOCS_DATA_DIR / "street_lights.geojson"
    if merged_path.is_file():
        m = gpd.read_file(merged_path)
        if m.crs is None:
            m.set_crs(epsg=4326, inplace=True)
        m = repair_dataframe_encoding(m)
        try:
            m.to_crs(epsg=4326).to_file(merged_path, driver="GeoJSON")
        except OSError as e:
            logging.warning("Could not persist repaired text to %s: %s", merged_path, e)
        m = m.to_crs(epsg=crs_metric)
        clean_parts.append(m)
        logging.info("Loaded default manifest points: %s (%d features)", merged_path.name, len(m))
    if sl_path.is_file():
        sl = gpd.read_file(sl_path)
        if sl.crs is None:
            sl.set_crs(epsg=4326, inplace=True)
        sl = repair_dataframe_encoding(sl)
        try:
            sl.to_crs(epsg=4326).to_file(sl_path, driver="GeoJSON")
        except OSError as e:
            logging.warning("Could not persist repaired text to %s: %s", sl_path, e)
        street_lights_gdf = sl.to_crs(epsg=crs_metric)
        sl_tagged = street_lights_gdf.copy()
        sl_tagged["amenity_type"] = "street-lights"
        clean_parts.append(sl_tagged)
        logging.info("Loaded street lights (clean + expanded like trees): %s (%d features)", sl_path.name, len(sl_tagged))

    amenities_clean = gpd.GeoDataFrame()
    if clean_parts:
        amenities_clean = gpd.GeoDataFrame(pd.concat(clean_parts, ignore_index=True), crs=f"EPSG:{crs_metric}")

    trees_gdf = None
    if trees_path is not None and trees_path.exists():
        try:
            trees_gdf = load_layer(trees_path, target_crs=crs_metric)
        except Exception as e:
            logging.warning("Could not load trees: %s", e)
    parks_gdf = None
    if parks_path is not None and parks_path.exists():
        try:
            parks_gdf = load_layer(parks_path, target_crs=crs_metric)
        except Exception as e:
            logging.warning("Could not load parks: %s", e)

    logging.info("Preparing buildings...")
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

    logging.info("Computing Urban95 weighted score columns using %d workers...", INDEX_SCORE_WORKERS)
    buildings = append_weighted_urban95_scores(
        buildings,
        DOCS_DATA_DIR,
        workers=INDEX_SCORE_WORKERS,
    )

    logging.info("Preparing legacy amenities (expanded / main-branch taxonomy)...")
    legacy_type_col = amenity_type_column
    if len(amenities_legacy) > 0:
        if legacy_type_col not in amenities_legacy.columns:
            if legacy_type_col != "top_classi" and "top_classi" in amenities_legacy.columns:
                logging.warning(
                    "Legacy amenities missing '%s'; falling back to 'top_classi'.",
                    legacy_type_col,
                )
                legacy_type_col = "top_classi"
            else:
                raise KeyError(f"Expected column '{legacy_type_col}' in legacy amenities layer.")

        amenities_legacy = amenities_legacy.copy()
        amenities_legacy["amenity_type"] = (
            amenities_legacy[legacy_type_col]
            .astype(str)
            .str.strip()
            .str.lower()
            .str.replace(" ", "_", regex=False)
            .str.replace("/", "_", regex=False)
            .replace({"nan": None})
        )
        amenities_legacy = amenities_legacy[~amenities_legacy["amenity_type"].isna()]

    amenities_legacy = append_shelters_from_merged_to_legacy(
        amenities_legacy, merged_path, crs_metric, legacy_type_col
    )

    # Compute building centroids in WGS84 for Mapbox API
    logging.info("Computing building centroids...")
    centroids_metric = buildings.geometry.centroid
    centroids_wgs84 = gpd.GeoDataFrame(
        {"building_id": buildings["building_id"]},
        geometry=centroids_metric,
        crs=f"EPSG:{crs_metric}",
    ).to_crs(epsg=4326)

    # Fetch walking isochrones for all buildings
    total = len(centroids_wgs84)
    all_isochrones = {}
    failed_buildings = []
    ISOCHRONE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # Build task list and count cached
    cache_to_bids = defaultdict(list)
    cache_to_coords = {}
    cached_count = 0
    for _, row in centroids_wgs84.iterrows():
        bid = row["building_id"]
        lng, lat = row.geometry.x, row.geometry.y
        cache_key = f"{lng:.5f}_{lat:.5f}"
        is_cached = (ISOCHRONE_CACHE_DIR / f"{cache_key}.json").exists()
        if is_cached:
            cached_count += 1
        cache_to_bids[cache_key].append(bid)
        cache_to_coords[cache_key] = (lng, lat)

    api_needed = total - cached_count
    logging.info("Fetching isochrones: %d buildings (%d cached, %d need API calls)...", total, cached_count, api_needed)

    for cache_key, bids in cache_to_bids.items():
        cache_file = ISOCHRONE_CACHE_DIR / f"{cache_key}.json"
        if not cache_file.exists():
            continue
        lng, lat = cache_to_coords[cache_key]
        try:
            polys = fetch_isochrones(lng, lat, token)
            for bid in bids:
                all_isochrones[bid] = polys
        except Exception:
            for bid in bids:
                all_isochrones[bid] = {}
                failed_buildings.append((bid, lng, lat, cache_key))

    missing_keys = []
    for cache_key, bids in cache_to_bids.items():
        cache_file = ISOCHRONE_CACHE_DIR / f"{cache_key}.json"
        if cache_file.exists():
            continue
        lng, lat = cache_to_coords[cache_key]
        missing_keys.append((cache_key, lng, lat, bids))

    logging.info(
        "Isochrone API key fetches: %d unique centroids across %d buildings using %d workers.",
        len(missing_keys),
        sum(len(bids) for _, _, _, bids in missing_keys),
        ISOCHRONE_FETCH_WORKERS,
    )

    def _fetch_key_task(cache_key: str, lng: float, lat: float, bids_for_key: list[int]):
        try:
            polys = fetch_isochrones(lng, lat, token)
            return cache_key, polys, None, bids_for_key, lng, lat
        except Exception as exc:
            return cache_key, {}, exc, bids_for_key, lng, lat

    if missing_keys:
        with ThreadPoolExecutor(max_workers=ISOCHRONE_FETCH_WORKERS) as executor:
            futures = [
                executor.submit(_fetch_key_task, cache_key, lng, lat, bids)
                for cache_key, lng, lat, bids in missing_keys
            ]
            for future in tqdm(
                as_completed(futures),
                total=len(futures),
                desc="Isochrone API",
                unit="centroid",
            ):
                cache_key, polys, err, bids_for_key, lng, lat = future.result()
                if err is None:
                    for bid in bids_for_key:
                        all_isochrones[bid] = polys
                else:
                    for bid in bids_for_key:
                        all_isochrones[bid] = {}
                        failed_buildings.append((bid, lng, lat, cache_key))

    # Retry failed buildings in rounds with increasing delays
    max_retries = 3
    for retry_round in range(max_retries):
        if not failed_buildings:
            break
        delay = 1.5 * (retry_round + 1)
        grouped_failed = defaultdict(list)
        for bid, lng, lat, cache_key in failed_buildings:
            grouped_failed[(cache_key, lng, lat)].append(bid)

        logging.info(
            "Retry round %d/%d: %d failed key requests for %d buildings (%.1fs pre-delay)...",
            retry_round + 1,
            max_retries,
            len(grouped_failed),
            len(failed_buildings),
            delay,
        )

        time.sleep(delay)
        still_failed = []
        retry_items = [(k, lng, lat, bids) for (k, lng, lat), bids in grouped_failed.items()]
        with ThreadPoolExecutor(max_workers=ISOCHRONE_FETCH_WORKERS) as executor:
            futures = [
                executor.submit(_fetch_key_task, cache_key, lng, lat, bids)
                for cache_key, lng, lat, bids in retry_items
            ]
            for future in tqdm(
                as_completed(futures),
                total=len(futures),
                desc=f"Isochrone retry {retry_round + 1}",
                unit="centroid",
            ):
                cache_key, polys, err, bids_for_key, lng, lat = future.result()
                if err is None:
                    for bid in bids_for_key:
                        all_isochrones[bid] = polys
                else:
                    for bid in bids_for_key:
                        still_failed.append((bid, lng, lat, cache_key))

        recovered = len(failed_buildings) - len(still_failed)
        if recovered:
            logging.info("  Recovered %d buildings in round %d.", recovered, retry_round + 1)
        failed_buildings = still_failed

    if failed_buildings:
        logging.warning("%d buildings still failed after %d retries (will have zero metrics). They will be re-attempted on next run.", len(failed_buildings), max_retries)

    success_count = sum(1 for v in all_isochrones.values() if v)
    logging.info("Fetched isochrones for %d/%d buildings.", success_count, total)

    # Compute accessibility for each walking time threshold
    for minutes in WALK_MINUTES:
        suffix = f"_{minutes}min"
        logging.info("Computing %d-minute walking accessibility...", minutes)

        # Build GeoDataFrame of isochrone polygons for this threshold
        iso_records = []
        for bid, polys in all_isochrones.items():
            if minutes in polys:
                iso_records.append({"building_id": bid, "geometry": polys[minutes]})

        if not iso_records:
            logging.warning("No isochrone polygons for %d-min threshold.", minutes)
            buildings[f"num_amenities{suffix}"] = 0
            buildings[f"num_trees{suffix}"] = 0
            buildings[f"num_street_lights{suffix}"] = 0
            buildings[f"score_clean{suffix}"] = 0.0
            buildings[f"score_expanded{suffix}"] = 0.0
            _init_clean_pts_columns(buildings, suffix)
            continue

        iso_gdf = gpd.GeoDataFrame(iso_records, crs="EPSG:4326").to_crs(epsg=crs_metric)

        if len(amenities_legacy) > 0:
            joined = gpd.sjoin(
                amenities_legacy.set_geometry("geometry"),
                iso_gdf.set_geometry("geometry")[["building_id", "geometry"]],
                predicate="within",
                how="inner",
            )

            if len(joined) > 0:
                counts = (
                    joined.groupby(["building_id", "amenity_type"])
                    .size()
                    .reset_index(name="count")
                )
                pivot = counts.pivot(index="building_id", columns="amenity_type", values="count").fillna(0)
                pivot.columns = [f"amen_{str(c).replace(' ', '_')}{suffix}" for c in pivot.columns]
                pivot = pivot.reset_index()
                buildings = buildings.merge(pivot, on="building_id", how="left")

        metric_cols = [c for c in buildings.columns if c.startswith("amen_") and c.endswith(suffix)]
        for c in metric_cols:
            buildings[c] = buildings[c].fillna(0).astype(int)
        buildings[f"num_amenities{suffix}"] = buildings[metric_cols].sum(axis=1).astype(int) if metric_cols else 0

        if trees_gdf is not None:
            tree_join = gpd.sjoin(
                trees_gdf,
                iso_gdf.set_geometry("geometry")[["building_id", "geometry"]],
                predicate="within",
                how="inner",
            )
            tree_counts = tree_join.groupby("building_id").size()
            buildings[f"num_trees{suffix}"] = buildings["building_id"].map(tree_counts).fillna(0).astype(int)
        else:
            buildings[f"num_trees{suffix}"] = 0

        if street_lights_gdf is not None:
            sl_join = gpd.sjoin(
                street_lights_gdf,
                iso_gdf.set_geometry("geometry")[["building_id", "geometry"]],
                predicate="within",
                how="inner",
            )
            sl_counts = sl_join.groupby("building_id").size()
            buildings[f"num_street_lights{suffix}"] = buildings["building_id"].map(sl_counts).fillna(0).astype(int)
        else:
            buildings[f"num_street_lights{suffix}"] = 0

        buildings[f"score_expanded{suffix}"] = (
            buildings[f"num_amenities{suffix}"].astype(float)
            + buildings[f"num_trees{suffix}"].astype(float) * 0.25
            + buildings[f"num_street_lights{suffix}"].astype(float) * 0.25
        )

        bids = [int(b) for b in buildings["building_id"].unique()]
        clean_detail = {k: {bid: 0.0 for bid in bids} for k in CLEAN_WEIGHTS}

        nt = buildings.set_index("building_id")[f"num_trees{suffix}"]
        for bid, n in nt.items():
            ib = int(bid)
            clean_detail["trees"][ib] += CLEAN_WEIGHTS["trees"] * float(n)

        if parks_gdf is not None and len(parks_gdf) > 0:
            pj = gpd.sjoin(
                parks_gdf,
                iso_gdf.set_geometry("geometry")[["building_id", "geometry"]],
                predicate="intersects",
                how="inner",
            )
            if len(pj) > 0:
                pc = pj.groupby("building_id").size()
                for bid, c in pc.items():
                    ib = int(bid)
                    clean_detail["parks"][ib] += CLEAN_WEIGHTS["parks"] * float(c)

        if len(amenities_clean) > 0 and "amenity_type" in amenities_clean.columns:
            cj = gpd.sjoin(
                amenities_clean.set_geometry("geometry"),
                iso_gdf.set_geometry("geometry")[["building_id", "geometry"]],
                predicate="within",
                how="inner",
            )
            if len(cj) > 0:
                cj = cj.copy()
                cj["_ak"] = cj["amenity_type"].map(_normalize_clean_amenity_key)
                for (bid, ak), grp in cj.groupby(["building_id", "_ak"]):
                    if not ak or ak not in CLEAN_WEIGHTS:
                        continue
                    w = CLEAN_WEIGHTS[ak]
                    if w <= 0:
                        continue
                    ib = int(bid)
                    clean_detail[ak][ib] += w * float(len(grp))

        for wk in CLEAN_WEIGHTS:
            stem = _clean_pts_column_stem(wk)
            col = f"clean_pts_{stem}{suffix}"
            buildings[col] = buildings["building_id"].map(lambda b, k=wk: clean_detail[k].get(int(b), 0.0)).astype(float)

        clean_scores = {
            bid: sum(clean_detail[k][bid] for k in CLEAN_WEIGHTS) for bid in bids
        }
        sc_series = buildings["building_id"].map(lambda b: clean_scores.get(int(b), 0.0))
        buildings[f"score_clean{suffix}"] = sc_series.astype(float)

        sum_cols = [f"clean_pts_{_clean_pts_column_stem(wk)}{suffix}" for wk in CLEAN_WEIGHTS]
        pts_sum = buildings[sum_cols].sum(axis=1)
        max_diff = (buildings[f"score_clean{suffix}"] - pts_sum).abs().max()
        if max_diff > 1e-3:
            logging.warning(
                "clean_pts columns sum differs from score_clean (max abs diff=%s) for %smin.",
                max_diff,
                minutes,
            )

    # Export isochrone polygons as GeoJSON for the frontend
    DOCS_DATA_DIR.mkdir(exist_ok=True)
    logging.info("Building isochrone GeoJSON for web...")
    iso_features = []
    for bid, polys in all_isochrones.items():
        for mins, geom in polys.items():
            if geom is None or geom.is_empty:
                continue
            iso_features.append({
                "building_id": int(bid),
                "minutes": int(mins),
                "geometry": geom,
            })
    if iso_features:
        iso_export = gpd.GeoDataFrame(iso_features, crs="EPSG:4326")
        # Simplify isochrone polygons to reduce file size
        iso_export = simplify_geometries(iso_export, 5.0)
        iso_export = reduce_coordinate_precision(iso_export, precision=4)
        write_minimal_geojson(iso_export, DOCS_DATA_DIR / "isochrones.geojson", precision=4)
        iso_size = (DOCS_DATA_DIR / "isochrones.geojson").stat().st_size
        logging.info("Isochrones: %.1fMB (%d features)", iso_size / 1e6, len(iso_export))

    to_export = buildings.copy()
    geom_cols = [c for c in to_export.columns if c != to_export.geometry.name and hasattr(to_export[c].dtype, "name") and str(to_export[c].dtype.name).lower() == "geometry"]
    for c in geom_cols:
        to_export = to_export.drop(columns=[c])
    to_export = _unique_columns(to_export)
    buildings_wgs84 = to_export.to_crs(epsg=4326)
    amenities_wgs84 = amenities_legacy.to_crs(epsg=4326) if len(amenities_legacy) > 0 else gpd.GeoDataFrame()

    buildings_out = OUTPUT_DIR / "buildings_accessibility.geojson"
    logging.info("Writing buildings with accessibility metrics: %s", buildings_out)
    buildings_wgs84.to_file(buildings_out, driver="GeoJSON")

    if len(amenities_wgs84) == 0:
        amenities_filtered = gpd.GeoDataFrame()
    else:
        amenities_filtered = amenities_wgs84[
            ~amenities_wgs84["amenity_type"].isin(EXCLUDED_AMENITY_TYPES)
            & ~amenities_wgs84.geometry.is_empty
            & amenities_wgs84.geometry.notna()
        ]
    
    # Keep only essential columns for the amenities output
    amenity_cols = [c for c in AMENITY_KEEP_COLUMNS if c in amenities_filtered.columns]
    amenities_filtered = amenities_filtered[amenity_cols]
    
    amenities_all_path = OUTPUT_DIR / "amenities_all.geojson"
    if len(amenities_filtered) > 0:
        amenities_filtered.to_file(amenities_all_path, driver="GeoJSON")
        logging.info("Wrote %s (%d features)", amenities_all_path, len(amenities_filtered))
    else:
        logging.warning("No legacy amenities to write to %s (expanded metrics will be zero on site).", amenities_all_path)

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
    
    # Simplify building geometries for web (reduces file size significantly)
    logging.info("Simplifying building geometries (tolerance: %.1fm)...", BUILDING_SIMPLIFY_TOLERANCE_M)
    buildings_web = simplify_geometries(buildings_wgs84, BUILDING_SIMPLIFY_TOLERANCE_M)
    buildings_web = reduce_coordinate_precision(buildings_web, precision=5)
    
    # Drop unused columns from buildings
    cols_to_drop = [c for c in BUILDING_DROP_COLUMNS if c in buildings_web.columns]
    if cols_to_drop:
        buildings_web = buildings_web.drop(columns=cols_to_drop)
        logging.info("Dropped %d unused columns from buildings: %s", len(cols_to_drop), cols_to_drop)
    
    # Remove zero-value amenity columns to reduce file size
    amen_cols = [c for c in buildings_web.columns if c.startswith("amen_")]
    for col in amen_cols:
        if buildings_web[col].sum() == 0:
            buildings_web = buildings_web.drop(columns=[col])
            logging.info("Dropped zero-sum column: %s", col)
    
    # Write minimal GeoJSON (no CRS metadata, compact format)
    logging.info("Writing optimized GeoJSON files...")
    _sc = [c for c in buildings_web.columns if c.startswith("score_clean")]
    _se = [c for c in buildings_web.columns if c.startswith("score_expanded")]
    _sw = [c for c in buildings_web.columns if c.startswith("score_weighted")]
    _sl = [c for c in buildings_web.columns if c.startswith("num_street_lights")]
    logging.info(
        "Building score columns for web: score_clean=%s, score_expanded=%s, score_weighted=%s, num_street_lights=%s",
        bool(_sc),
        bool(_se),
        bool(_sw),
        bool(_sl),
    )
    write_minimal_geojson(buildings_web, DOCS_DATA_DIR / "buildings_accessibility.geojson", precision=5)
    buildings_file_size = (DOCS_DATA_DIR / "buildings_accessibility.geojson").stat().st_size
    logging.info("Buildings: %.1fMB (%d features)", buildings_file_size / 1e6, len(buildings_web))
    
    # Amenities with minimal output
    write_minimal_geojson(amenities_filtered, DOCS_DATA_DIR / "amenities_all.geojson", precision=5)
    amenities_file_size = (DOCS_DATA_DIR / "amenities_all.geojson").stat().st_size
    logging.info("Amenities: %.1fMB (%d features)", amenities_file_size / 1e6, len(amenities_filtered))
    
    if trees_wgs84 is not None:
        # Strip all properties from trees - only need geometry for visualization
        trees_web = trees_wgs84[TREE_KEEP_COLUMNS].copy()
        write_minimal_geojson(trees_web, DOCS_DATA_DIR / "trees.geojson", precision=5)
        trees_file_size = (DOCS_DATA_DIR / "trees.geojson").stat().st_size
        logging.info("Trees: %.1fMB (%d features, geometry only)", trees_file_size / 1e6, len(trees_web))
    
    if parks_wgs84 is not None:
        # Also simplify park geometries (usually large polygons, can use higher tolerance)
        parks_web = simplify_geometries(parks_wgs84, PARK_SIMPLIFY_TOLERANCE_M)
        write_minimal_geojson(parks_web, DOCS_DATA_DIR / "parks.geojson", precision=5)
        parks_file_size = (DOCS_DATA_DIR / "parks.geojson").stat().st_size
        logging.info("Parks: %.1fMB (%d features)", parks_file_size / 1e6, len(parks_web))

    buildings_web_path = DOCS_DATA_DIR / "buildings_accessibility.geojson"
    buildings_gz_path = write_gzip_copy(buildings_web_path)
    if buildings_gz_path is not None:
        raw_size = buildings_web_path.stat().st_size
        gz_size = buildings_gz_path.stat().st_size
        ratio = (gz_size / raw_size * 100.0) if raw_size else 0.0
        logging.info(
            "Compressed %s -> %s (%.1fMB -> %.1fMB, %.1f%%)",
            buildings_web_path.name,
            buildings_gz_path.name,
            raw_size / 1e6,
            gz_size / 1e6,
            ratio,
        )
    
    logging.info("Accessibility preprocessing complete.")


if __name__ == "__main__":
    compute_building_accessibility()
