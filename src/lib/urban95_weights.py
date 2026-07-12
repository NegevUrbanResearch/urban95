import logging
import warnings
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely import make_valid
from shapely.geometry import Point

from core.paths import layer
from lib.shade_si import load_prepared_si_layers, round_building_summer_si, summer_si_to_subscore

# ==========================================
# הגדרות ומשקלים
# ==========================================

CATEGORY_WEIGHTS = {
    "Environmental Quality": 0.20,
    "Nature": 0.15,
    "Play": 0.15,
    "Safety & Mobility": 0.25,
    "Family Services": 0.25
}

CATEGORY_SUBCATEGORY_WEIGHTS = {
    "Environmental Quality": {
        "shade": 0.4,
        "trees": 0.2,
        "roads": 0.4,
    },
    "Nature": {
        "parks": 0.5,
        "urban_nature_areas": 0.5,
    },
    "Play": {
        "playgrounds": 1.0,
    },
    "Safety & Mobility": {
        "street_lights": 0.15,
        "bicycle_access": 0.15,
        "bus_stops": 0.3,
        "shelters": 0.4,
    },
    "Family Services": {
        "education": 0.3,
        "community": 0.2,
        "business": 0.2,
        "health": 0.3,
    },
}


STREET_SI_FILENAME = "street_summer_si.geojson"
OPEN_SPACE_SI_FILENAME = "open_space_summer_si.geojson"

OPTIONAL_RAW_LAYER_IDS = (
    "trees",
    "roads",
    "parks",
    "urban_nature_areas",
    "street_lights",
    "bus_stops",
)

_LAYER_OVERRIDE_UNSET = object()

# Explicit source contract shared with the batch discrete scorer.  This is a
# named mapping rather than a registry so the scalar oracle remains unchanged
# and every source used by the published model stays visible at the call site.
def discrete_layer_kwargs(layers: dict) -> dict:
    return {
        "trees": layers.get("trees"),
        "roads": layers.get("roads"),
        "parks": layers.get("parks"),
        "urban_nature_areas": layers.get("urban_nature_areas"),
        "playgrounds": layers.get("playgrounds"),
        "bikes": layers.get("bikes"),
        "bus_stops": layers.get("bus_stops"),
        "shelters": layers.get("shelters"),
        "education": layers.get("education"),
        "community": layers.get("community"),
        "business": layers.get("business"),
        "health": layers.get("health"),
    }


def _sanitize_layer(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if gdf.empty:
        return gdf
    out = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        out["geometry"] = out.geometry.make_valid()
    out = out[out.geometry.notna() & ~out.geometry.is_empty].copy()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        valid_mask = out.geometry.is_valid
    return out[valid_mask].copy()


def _features_intersecting(layer: gpd.GeoDataFrame, geom):
    if layer.empty:
        return layer.iloc[0:0]
    try:
        idx = layer.sindex.query(geom, predicate="intersects")
        if len(idx) == 0:
            return layer.iloc[0:0]
        return layer.iloc[idx]
    except Exception:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            return layer[layer.geometry.intersects(geom)]

# ==========================================
# פונקציות הקטגוריות (Geo-Spatial Logic)
# ==========================================

def calc_environmental_quality(
    point: Point,
    layers: dict,
    include_details: bool = False,
    precomputed_summer_si=None,
):
    """
    חישוב איכות סביבה: צל, עצים, וכבישים מהירים.
    """
    buffer_20m = point.buffer(20)

    # 1. צל (Shade) - משקל 0.4
    summer_si = round_building_summer_si(precomputed_summer_si)
    shade_score = summer_si_to_subscore(summer_si) / 100.0

    # 2. עצים (Trees) - משקל 0.2
    trees_score = 0.0
    if "trees" in layers and not layers["trees"].empty:
        trees_in_buffer = _features_intersecting(layers["trees"], buffer_20m)
        trees_count = len(trees_in_buffer)
        
        if trees_count >= 3:
            trees_score = 1.0
        elif 1 <= trees_count <= 2:
            trees_score = 0.5

    # 3. כבישים (Roads) - משקל 0.4
    roads_score = 1.0 # ברירת מחדל: 1 (אין כביש מהיר קרוב)
    if "roads" in layers and not layers["roads"].empty:
        roads_df = layers["roads"]
        speed_col = None
        for candidate in ("maxspeed", "max_speed", "speed_limit"):
            if candidate in roads_df.columns:
                speed_col = candidate
                break

        if speed_col is not None:
            numeric_speed = pd.to_numeric(roads_df[speed_col], errors="coerce")
            fast_roads = roads_df[numeric_speed > 50]
        else:
            fast_roads = roads_df.iloc[0:0]
        
        # מרחק לכביש המהיר הקרוב ביותר
        if not fast_roads.empty:
            distances = fast_roads.geometry.distance(point)
            min_dist = distances.min()
            
            if min_dist <= 100:
                roads_score = 0.0
            elif 100 < min_dist <= 300:
                roads_score = 0.5

    # חישוב סופי לקטגוריה
    final_score = ((shade_score * 0.4) + (trees_score * 0.2) + (roads_score * 0.4)) * 100
    if not include_details:
        return final_score
    return final_score, {
        "shade": shade_score * 100,
        "summer_si": summer_si,
        "trees": trees_score * 100,
        "roads": roads_score * 100,
    }


def _load_geojson(path: Path, target_epsg: int = 2039) -> gpd.GeoDataFrame:
    if not path.exists():
        return gpd.GeoDataFrame(geometry=[], crs=f"EPSG:{target_epsg}")

    gdf = gpd.read_file(path)
    if gdf.empty:
        return gpd.GeoDataFrame(gdf, geometry=gdf.geometry.name, crs=f"EPSG:{target_epsg}")

    if gdf.crs is None:
        gdf = gdf.set_crs(epsg=4326)

    out = gdf.to_crs(epsg=target_epsg)
    return _sanitize_layer(out)


def _load_optional_raw(layer_id: str, target_epsg: int) -> gpd.GeoDataFrame:
    L = layer(layer_id)
    if not L.path.is_file():
        logging.info("metric omitted: %s", layer_id)
        return gpd.GeoDataFrame(geometry=[], crs=f"EPSG:{target_epsg}")
    return _load_geojson(L.path, target_epsg)


def _explicit_override_frame(value, target_epsg: int) -> gpd.GeoDataFrame:
    if value is None:
        return gpd.GeoDataFrame(geometry=[], crs=f"EPSG:{target_epsg}")
    return value


def build_layers_from_raw(
    target_epsg: int = 2039,
    *,
    trees=_LAYER_OVERRIDE_UNSET,
    parks=_LAYER_OVERRIDE_UNSET,
    street_lights=_LAYER_OVERRIDE_UNSET,
    amenities_clean=_LAYER_OVERRIDE_UNSET,
) -> dict:
    """Load scoring layers from data/raw and map them to model layer names."""
    layers = {}
    for layer_id in OPTIONAL_RAW_LAYER_IDS:
        if layer_id == "trees" and trees is not _LAYER_OVERRIDE_UNSET:
            layers[layer_id] = _explicit_override_frame(trees, target_epsg)
        elif layer_id == "parks" and parks is not _LAYER_OVERRIDE_UNSET:
            layers[layer_id] = _explicit_override_frame(parks, target_epsg)
        elif layer_id == "street_lights" and street_lights is not _LAYER_OVERRIDE_UNSET:
            layers[layer_id] = _explicit_override_frame(street_lights, target_epsg)
        else:
            layers[layer_id] = _load_optional_raw(layer_id, target_epsg)

    amenity_type_map = {
        "playgrounds": "playgrounds",
        "shelters": "shelters",
        "education": "education",
        "health": "health",
        "community": "community-centers",
        "business": "businesscenters",
        "bikes": "bicycle_track",
    }

    if amenities_clean is not _LAYER_OVERRIDE_UNSET:
        amenities_clean_frame = _explicit_override_frame(amenities_clean, target_epsg)
        has_amenity_type = "amenity_type" in amenities_clean_frame.columns
    else:
        amenities_clean_path = layer("amenities_clean").path
        if not amenities_clean_path.is_file():
            logging.info("metric omitted: amenities_clean")
            amenities_clean_frame = gpd.GeoDataFrame(geometry=[], crs=f"EPSG:{target_epsg}")
            has_amenity_type = False
        else:
            amenities_clean_frame = _load_geojson(amenities_clean_path, target_epsg)
            has_amenity_type = "amenity_type" in amenities_clean_frame.columns

    for target_name, source_type in amenity_type_map.items():
        if has_amenity_type:
            subset = amenities_clean_frame[
                amenities_clean_frame["amenity_type"].astype(str).str.strip().str.lower() == source_type
            ].copy()
            layers[target_name] = _sanitize_layer(subset)
        else:
            layers[target_name] = amenities_clean_frame.iloc[0:0].copy()

    return layers


def build_layers(
    shade_si_dir: Path | str | None = None,
    target_epsg: int = 2039,
    *,
    trees=_LAYER_OVERRIDE_UNSET,
    parks=_LAYER_OVERRIDE_UNSET,
    street_lights=_LAYER_OVERRIDE_UNSET,
    amenities_clean=_LAYER_OVERRIDE_UNSET,
) -> dict:
    """Load scoring layers from data/raw and prepared ArcGIS SI artifacts."""
    layers = build_layers_from_raw(
        target_epsg=target_epsg,
        trees=trees,
        parks=parks,
        street_lights=street_lights,
        amenities_clean=amenities_clean,
    )
    if shade_si_dir is not None:
        shade_si_dir = Path(shade_si_dir)
        street_path = shade_si_dir / STREET_SI_FILENAME
        open_space_path = shade_si_dir / OPEN_SPACE_SI_FILENAME
    else:
        street_path = layer("shade_si_street").path
        open_space_path = layer("shade_si_open").path
    streets, open_spaces = load_prepared_si_layers(street_path, open_space_path)
    layers["shade_streets"] = streets
    layers["shade_open_spaces"] = open_spaces
    return layers


def calc_nature(point: Point, layers: dict, include_details: bool = False):
    """
    חישוב טבע: גודל פארקים ואזורי טבע עירוני בטווח 300 מ'.
    """
    buffer_300m = point.buffer(300)
    parks_score = 0.0
    urban_nature_score = 0.0
    nature_weights = CATEGORY_SUBCATEGORY_WEIGHTS["Nature"]

    if "parks" in layers and not layers["parks"].empty:
        parks_in_buffer = _features_intersecting(layers["parks"], buffer_300m)

        if not parks_in_buffer.empty:
            # בודק אם יש לפחות פארק אחד גדול מ-3 דונם (3000 מ"ר)
            has_large_park = any(parks_in_buffer.geometry.area >= 3000)
            if has_large_park:
                parks_score = 1.0
            else:
                parks_score = 0.5  # יש פארק אבל קטן מ-3 דונם

    if "urban_nature_areas" in layers and not layers["urban_nature_areas"].empty:
        urban_nature_in_buffer = _features_intersecting(layers["urban_nature_areas"], buffer_300m)
        if not urban_nature_in_buffer.empty:
            urban_nature_score = 1.0

    final_score = (
        (parks_score * nature_weights["parks"])
        + (urban_nature_score * nature_weights["urban_nature_areas"])
    ) * 100
    if not include_details:
        return final_score
    return final_score, {
        "parks": parks_score * 100,
        "urban_nature_areas": urban_nature_score * 100,
    }


def calc_play(point: Point, layers: dict, include_details: bool = False):
    """
    חישוב משחק: הימצאות גן שעשועים בטווח 300 מ'.
    """
    buffer_300m = point.buffer(300)
    playgrounds_score = 0.0
    
    if "playgrounds" in layers and not layers["playgrounds"].empty:
        playgrounds_in_buffer = _features_intersecting(layers["playgrounds"], buffer_300m)
        if not playgrounds_in_buffer.empty:
            playgrounds_score = 1.0
            
    final_score = playgrounds_score * 100
    if not include_details:
        return final_score
    return final_score, {"playgrounds": playgrounds_score * 100}


def calc_streetlight_subscore(point: Point, street_lights: gpd.GeoDataFrame | None) -> float:
    """Return the scalar street-light overlay tier without other safety work."""
    buffer_300m = point.buffer(300)
    lights_score = 0.0
    if street_lights is not None and not street_lights.empty:
        lights_near = _features_intersecting(street_lights, point.buffer(315))
        if not lights_near.empty:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)
                lights_buffers = lights_near.geometry.buffer(15)
                unified_lights = lights_buffers.union_all()
                if unified_lights is None or unified_lights.is_empty:
                    illuminated_area = 0.0
                else:
                    ul = unified_lights if unified_lights.is_valid else make_valid(unified_lights)
                    illuminated_area = (
                        0.0
                        if ul.is_empty
                        else ul.intersection(buffer_300m).area
                    )
            percent_illuminated = (illuminated_area / buffer_300m.area) * 100
            if percent_illuminated > 50:
                lights_score = 1.0
            elif 30 <= percent_illuminated <= 50:
                lights_score = 0.5
    return lights_score * 100


def calc_safety_and_mobility(point: Point, layers: dict, include_details: bool = False):
    """
    חישוב בטיחות ותנועה: תאורה, אופניים, תחנות אוטובוס ומקלטים.
    """
    buffer_300m = point.buffer(300)
    buffer_50m = point.buffer(50)

    # 1. תאורת רחוב - משקל 0.15
    lights_score = calc_streetlight_subscore(point, layers.get("street_lights")) / 100.0

    # 2. אופניים - משקל 0.15
    bike_score = 0.0
    if "bikes" in layers and not layers["bikes"].empty:
        if not _features_intersecting(layers["bikes"], buffer_300m).empty:
            bike_score = 1.0
            
    # 3. תחנות אוטובוס - משקל 0.3
    bus_score = 0.0
    if "bus_stops" in layers and not layers["bus_stops"].empty:
        bus_count = len(_features_intersecting(layers["bus_stops"], buffer_300m))
        if bus_count >= 3:
            bus_score = 1.0
        elif 1 <= bus_count <= 2:
            bus_score = 0.5

    # 4. מקלטים - משקל 0.4
    shelters_score = 0.0
    if "shelters" in layers and not layers["shelters"].empty:
        if not _features_intersecting(layers["shelters"], buffer_50m).empty:
            shelters_score = 1.0

    final_score = ((lights_score * 0.15) + (bike_score * 0.15) + (bus_score * 0.3) + (shelters_score * 0.4)) * 100
    if not include_details:
        return final_score
    return final_score, {
        "street_lights": lights_score * 100,
        "bicycle_access": bike_score * 100,
        "bus_stops": bus_score * 100,
        "shelters": shelters_score * 100,
    }


def calc_family_services(point: Point, layers: dict, include_details: bool = False):
    """
    חישוב שירותים למשפחה: מרחקים למוסדות חינוך, קהילה, מסחר ובריאות.
    """
    buffer_300m = point.buffer(300)
    
    # פונקציית עזר למציאת המרחק המינימלי לשכבה מסוימת
    def get_min_distance(layer_name):
        if layer_name in layers and not layers[layer_name].empty:
            features_in_300m = _features_intersecting(layers[layer_name], buffer_300m)
            if not features_in_300m.empty:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", RuntimeWarning)
                    return features_in_300m.geometry.distance(point).min()
        return None

    # 1. חינוך - משקל 0.3
    education_score = 0.0
    edu_dist = get_min_distance("education")
    if edu_dist is not None:
        if edu_dist <= 150:
            education_score = 1.0
        elif 150 < edu_dist <= 300:
            education_score = 0.5

    # 2. מרכז קהילתי - משקל 0.2
    community_score = 1.0 if get_min_distance("community") is not None else 0.0
    
    # 3. בתי עסק - משקל 0.2
    business_score = 1.0 if get_min_distance("business") is not None else 0.0
    
    # 4. בריאות - משקל 0.3
    health_score = 1.0 if get_min_distance("health") is not None else 0.0

    final_score = ((education_score * 0.3) + (community_score * 0.2) + (business_score * 0.2) + (health_score * 0.3)) * 100
    if not include_details:
        return final_score
    return final_score, {
        "education": education_score * 100,
        "community": community_score * 100,
        "business": business_score * 100,
        "health": health_score * 100,
    }

# ==========================================
# פונקציית ה-MAIN ליצירת האינדקס
# ==========================================

def calculate_master_index(
    x_coord: float,
    y_coord: float,
    layers: dict,
    precomputed: dict | None = None,
):
    """
    הפונקציה הראשית. מופעלת בלחיצה על המפה.
    הקואורדינטות צריכות להיות ברשת ישראל החדשה (EPSG:2039) או להמיר אותן.
    """
    clicked_point = Point(x_coord, y_coord)
    precomputed = precomputed or {}
    summer_si = precomputed.get("summer_si")

    # 1. שליחת הנקודה והשכבות לכל קטגוריה וקבלת ציונים
    env_score, env_sub = calc_environmental_quality(
        clicked_point,
        layers,
        include_details=True,
        precomputed_summer_si=summer_si,
    )
    nature_score, nature_sub = calc_nature(clicked_point, layers, include_details=True)
    play_score, play_sub = calc_play(clicked_point, layers, include_details=True)
    safety_score, safety_sub = calc_safety_and_mobility(clicked_point, layers, include_details=True)
    family_score, family_sub = calc_family_services(clicked_point, layers, include_details=True)

    category_scores = {
        "Environmental Quality": env_score,
        "Nature": nature_score,
        "Play": play_score,
        "Safety & Mobility": safety_score,
        "Family Services": family_score,
    }
    subcategory_scores = {
        "Environmental Quality": env_sub,
        "Nature": nature_sub,
        "Play": play_sub,
        "Safety & Mobility": safety_sub,
        "Family Services": family_sub,
    }
    
    # 2. חישוב האינדקס הכללי לפי המשקלים
    total_index = 0.0
    for cat_name, score in category_scores.items():
        total_index += score * CATEGORY_WEIGHTS[cat_name]
        
    total_index = round(total_index, 1)

    return {
        "final_index": total_index,
        "category_scores": category_scores,
        "subcategory_scores": subcategory_scores,
        "subcategory_weights": CATEGORY_SUBCATEGORY_WEIGHTS,
    }
