import geopandas as gpd
import pandas as pd
import plotly.graph_objects as go
from shapely import make_valid
from shapely.geometry import Point
from pathlib import Path
import warnings

from shade_si import load_prepared_si_layers, round_building_summer_si, summer_si_to_subscore

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

DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "docs" / "data"
DEFAULT_SHADE_SI_DIR = Path(__file__).resolve().parent.parent / "output" / "shade_si"
STREET_SI_FILENAME = "street_summer_si.geojson"
OPEN_SPACE_SI_FILENAME = "open_space_summer_si.geojson"


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


def build_layers_from_docs_data(data_dir: Path | str = DEFAULT_DATA_DIR, target_epsg: int = 2039) -> dict:
    """
    טוען שכבות מ-docs/data וממפה אותן לשמות שהמודל מצפה להם.
    """
    data_dir = Path(data_dir)
    layers = {
        "trees": _load_geojson(data_dir / "trees.geojson", target_epsg),
        "roads": _load_geojson(data_dir / "roads.geojson", target_epsg),
        "parks": _load_geojson(data_dir / "parks.geojson", target_epsg),
        "urban_nature_areas": _load_geojson(data_dir / "urban_nature_areas.geojson", target_epsg),
        "street_lights": _load_geojson(data_dir / "street_lights.geojson", target_epsg),
        "bus_stops": _load_geojson(data_dir / "bus_stops.geojson", target_epsg),
    }

    amenity_type_map = {
        "playgrounds": "playgrounds",
        "shelters": "shelters",
        "education": "education",
        "health": "health",
        "community": "community-centers",
        "business": "businesscenters",
        "bikes": "bicycle_track",
    }

    amenities_new = _load_geojson(data_dir / "amenities_new.geojson", target_epsg)
    has_amenity_type = "amenity_type" in amenities_new.columns

    for target_name, source_type in amenity_type_map.items():
        split_path = data_dir / f"{source_type}.geojson"
        if split_path.exists():
            layers[target_name] = _load_geojson(split_path, target_epsg)
            continue

        if has_amenity_type:
            subset = amenities_new[
                amenities_new["amenity_type"].astype(str).str.strip().str.lower() == source_type
            ].copy()
            layers[target_name] = _sanitize_layer(subset)
        else:
            layers[target_name] = amenities_new.iloc[0:0].copy()

    return layers


def build_layers(
    data_dir: Path | str = DEFAULT_DATA_DIR,
    shade_si_dir: Path | str | None = DEFAULT_SHADE_SI_DIR,
    target_epsg: int = 2039,
) -> dict:
    """Load scoring layers from docs/data and prepared ArcGIS SI artifacts."""
    layers = build_layers_from_docs_data(data_dir=data_dir, target_epsg=target_epsg)
    if shade_si_dir is None:
        return layers

    shade_si_dir = Path(shade_si_dir)
    street_path = shade_si_dir / STREET_SI_FILENAME
    open_space_path = shade_si_dir / OPEN_SPACE_SI_FILENAME
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


def calc_safety_and_mobility(point: Point, layers: dict, include_details: bool = False):
    """
    חישוב בטיחות ותנועה: תאורה, אופניים, תחנות אוטובוס ומקלטים.
    """
    buffer_300m = point.buffer(300)
    buffer_50m = point.buffer(50)
    
    # 1. תאורת רחוב - משקל 0.15
    lights_score = 0.0
    if "street_lights" in layers and not layers["street_lights"].empty:
        lights_near = _features_intersecting(layers["street_lights"], point.buffer(315))
        if not lights_near.empty:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)
                lights_buffers = lights_near.geometry.buffer(15)
                unified_lights = lights_buffers.union_all()
                if unified_lights is None or unified_lights.is_empty:
                    illuminated_area = 0.0
                else:
                    ul = unified_lights if unified_lights.is_valid else make_valid(unified_lights)
                    if ul.is_empty:
                        illuminated_area = 0.0
                    else:
                        illuminated_area = ul.intersection(buffer_300m).area
            percent_illuminated = (illuminated_area / buffer_300m.area) * 100
            
            if percent_illuminated > 50:
                lights_score = 1.0
            elif 30 <= percent_illuminated <= 50:
                lights_score = 0.5

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
# פונקציית ה-MAIN ליצירת האינדקס והגרף
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

    # 3. יצירת גרף העמודות באמצעות Plotly
    categories = list(category_scores.keys())
    scores = [round(val, 1) for val in category_scores.values()]

    fig = go.Figure()
    fig.add_trace(go.Bar(
        y=categories,
        x=scores,
        orientation='h',
        marker=dict(color=scores, colorscale='Blues', cmin=0, cmax=100),
        text=[f"{val}" for val in scores],
        textposition='auto',
    ))

    fig.update_layout(
        title=dict(text=f"<b>Playfulness Index: {total_index}/100</b>", font=dict(size=22)),
        xaxis=dict(range=[0, 100], showgrid=False, visible=False),
        yaxis=dict(autorange="reversed", showgrid=False),
        plot_bgcolor='rgba(0,0,0,0)',
        paper_bgcolor='rgba(0,0,0,0)',
        margin=dict(l=10, r=10, t=40, b=10),
        height=300
    )

    return {
        "final_index": total_index,
        "category_scores": category_scores,
        "subcategory_scores": subcategory_scores,
        "subcategory_weights": CATEGORY_SUBCATEGORY_WEIGHTS,
        "chart": fig
    }
