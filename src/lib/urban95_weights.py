import logging
import math
import warnings
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely import make_valid
from shapely.geometry import Point

from core.paths import layer
from lib.shade_si import load_prepared_si_layers, round_building_summer_si, summer_si_to_subscore
from lib.urban95_status import (
    INDICATOR_SOURCE_REQUIREMENTS,
    SOURCE_AVAILABILITY_KEY,
    STATUS_DIAGNOSTICS,
    STATUS_HIERARCHY,
    SourceAvailability,
    aggregate_status,
    attainment_from_score,
    equal_mean,
    source_is_available,
    status_from_attainment,
)

# ==========================================
# Direct-indicator geometry rules
# ==========================================

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
        "source_availability": layers.get(SOURCE_AVAILABILITY_KEY),
    }


def _equal_category_score(category: str, details: dict) -> float | None:
    attainment = equal_mean(
        attainment_from_score(details.get(child))
        for child in STATUS_HIERARCHY[category]
    )
    return None if attainment is None else attainment * 100.0


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
    building,
    layers: dict,
    include_details: bool = False,
    precomputed_summer_si=None,
):
    """
    חישוב איכות סביבה: צל, עצים, וכבישים מהירים.

    Distances and buffers are measured from the building footprint edge
    (near-edge). A Point geometry keeps the historical centroid-equivalent
    behavior used by click scoring and point fixtures.
    """
    buffer_20m = building.buffer(20)

    # 1. צל (Shade)
    try:
        summer_si = round_building_summer_si(precomputed_summer_si)
        shade_score = summer_si_to_subscore(summer_si) / 100.0
    except Exception as exc:
        logging.warning("Urban95 shade calculation failed: %s", exc)
        summer_si = None
        shade_score = None

    # 2. עצים (Trees)
    trees_score = 0.0
    try:
        if "trees" in layers and not layers["trees"].empty:
            trees_in_buffer = _features_intersecting(layers["trees"], buffer_20m)
            trees_count = len(trees_in_buffer)

            if trees_count >= 3:
                trees_score = 1.0
            elif 1 <= trees_count <= 2:
                trees_score = 0.5
    except Exception as exc:
        logging.warning("Urban95 trees calculation failed: %s", exc)
        trees_score = None

    # 3. כבישים (Roads)
    roads_score = 1.0
    try:
        if "roads" in layers and not layers["roads"].empty:
            roads_df = layers["roads"]
            speed_col = next(
                (
                    candidate
                    for candidate in ("maxspeed", "max_speed", "speed_limit")
                    if candidate in roads_df.columns
                ),
                None,
            )
            fast_roads = (
                roads_df[pd.to_numeric(roads_df[speed_col], errors="coerce") > 50]
                if speed_col is not None
                else roads_df.iloc[0:0]
            )
            if not fast_roads.empty:
                min_dist = fast_roads.geometry.distance(building).min()
                if min_dist <= 100:
                    roads_score = 0.0
                elif min_dist <= 300:
                    roads_score = 0.5
    except Exception as exc:
        logging.warning("Urban95 roads calculation failed: %s", exc)
        roads_score = None

    # חישוב סופי לקטגוריה
    details = {
        "shade": None if shade_score is None else shade_score * 100,
        "summer_si": summer_si,
        "trees": None if trees_score is None else trees_score * 100,
        "roads": None if roads_score is None else roads_score * 100,
    }
    final_score = _equal_category_score("environmental_quality", details)
    if not include_details:
        return final_score
    return final_score, details


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


def _mark_availability(
    frame: gpd.GeoDataFrame,
    available: bool,
    reason: str,
) -> gpd.GeoDataFrame:
    frame.attrs[SOURCE_AVAILABILITY_KEY] = SourceAvailability(available, reason)
    return frame


def _frame_availability(value: object, *, required_columns: tuple[str, ...] = ()) -> SourceAvailability:
    if value is None:
        return SourceAvailability(False, "missing")
    if not isinstance(value, gpd.GeoDataFrame):
        return SourceAvailability(False, "schema_invalid")
    geometry_name = getattr(value, "_geometry_column_name", None)
    if not geometry_name or geometry_name not in value.columns:
        return SourceAvailability(False, "schema_invalid")
    if any(column not in value.columns for column in required_columns):
        return SourceAvailability(False, "schema_invalid")
    return SourceAvailability(True, "available")


def _source_frame_availability(source_key: str, value: object) -> SourceAvailability:
    availability = _frame_availability(value)
    if availability.available and source_key == "roads" and not any(
        column in value.columns
        for column in ("maxspeed", "max_speed", "speed_limit")
    ):
        return SourceAvailability(False, "schema_invalid")
    return availability


def _load_optional_raw(layer_id: str, target_epsg: int) -> gpd.GeoDataFrame:
    L = layer(layer_id)
    if not L.path.is_file():
        logging.info("metric omitted: %s", layer_id)
        return _mark_availability(
            gpd.GeoDataFrame(geometry=[], crs=f"EPSG:{target_epsg}"),
            False,
            "missing",
        )
    try:
        frame = _load_geojson(L.path, target_epsg)
    except Exception as exc:
        logging.warning("Urban95 source %s unavailable: %s", layer_id, exc)
        return _mark_availability(
            gpd.GeoDataFrame(geometry=[], crs=f"EPSG:{target_epsg}"),
            False,
            "unreadable",
        )
    return _mark_availability(frame, True, "available")


def _explicit_override_frame(value, target_epsg: int) -> gpd.GeoDataFrame:
    if value is None:
        return _mark_availability(
            gpd.GeoDataFrame(geometry=[], crs=f"EPSG:{target_epsg}"),
            False,
            "missing",
        )
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
    availability: dict[str, SourceAvailability] = {}
    for layer_id in OPTIONAL_RAW_LAYER_IDS:
        if layer_id == "trees" and trees is not _LAYER_OVERRIDE_UNSET:
            layers[layer_id] = _explicit_override_frame(trees, target_epsg)
        elif layer_id == "parks" and parks is not _LAYER_OVERRIDE_UNSET:
            layers[layer_id] = _explicit_override_frame(parks, target_epsg)
        elif layer_id == "street_lights" and street_lights is not _LAYER_OVERRIDE_UNSET:
            layers[layer_id] = _explicit_override_frame(street_lights, target_epsg)
        else:
            layers[layer_id] = _load_optional_raw(layer_id, target_epsg)
        availability[layer_id] = layers[layer_id].attrs.get(
            SOURCE_AVAILABILITY_KEY,
            _frame_availability(layers[layer_id]),
        )
        if (
            layer_id == "roads"
            and availability[layer_id].available
            and not any(
                column in layers[layer_id].columns
                for column in ("maxspeed", "max_speed", "speed_limit")
            )
        ):
            availability[layer_id] = SourceAvailability(False, "schema_invalid")

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
        amenity_availability = _frame_availability(
            amenities_clean,
            required_columns=("amenity_type",),
        )
    else:
        amenities_clean_path = layer("amenities_clean").path
        if not amenities_clean_path.is_file():
            logging.info("metric omitted: amenities_clean")
            amenities_clean_frame = gpd.GeoDataFrame(geometry=[], crs=f"EPSG:{target_epsg}")
            amenity_availability = SourceAvailability(False, "missing")
        else:
            try:
                amenities_clean_frame = _load_geojson(amenities_clean_path, target_epsg)
                amenity_availability = _frame_availability(
                    amenities_clean_frame,
                    required_columns=("amenity_type",),
                )
            except Exception as exc:
                logging.warning("Urban95 source amenities_clean unavailable: %s", exc)
                amenities_clean_frame = gpd.GeoDataFrame(geometry=[], crs=f"EPSG:{target_epsg}")
                amenity_availability = SourceAvailability(False, "unreadable")

    has_amenity_type = amenity_availability.available
    if has_amenity_type and "amenity_subtype" in amenities_clean_frame.columns:
        parent = amenities_clean_frame["amenity_type"].astype(str).str.strip().str.lower()
        subtype = amenities_clean_frame["amenity_subtype"].fillna("").astype(str)
        allowed = {
            "education": {"", "school", "kindergarten"},
            "health": {"", "clinic", "tipat_halav"},
        }
        invalid = [
            value
            for parent_name, allowed_values in allowed.items()
            for value in subtype[parent == parent_name]
            if value not in allowed_values
        ]
        if invalid:
            amenity_availability = SourceAvailability(False, "schema_invalid")
            has_amenity_type = False

    for target_name, source_type in amenity_type_map.items():
        if has_amenity_type:
            subset = amenities_clean_frame[
                amenities_clean_frame["amenity_type"].astype(str).str.strip().str.lower() == source_type
            ].copy()
            layers[target_name] = _sanitize_layer(subset)
        else:
            layers[target_name] = amenities_clean_frame.iloc[0:0].copy()

        availability[target_name] = amenity_availability

    layers[SOURCE_AVAILABILITY_KEY] = availability

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
    availability = layers[SOURCE_AVAILABILITY_KEY]
    street_exists = street_path.is_file()
    open_space_exists = open_space_path.is_file()
    if street_exists and open_space_exists:
        try:
            streets, open_spaces = load_prepared_si_layers(street_path, open_space_path)
            availability["shade_streets"] = SourceAvailability(True, "available")
            availability["shade_open_spaces"] = SourceAvailability(True, "available")
        except Exception as exc:
            logging.warning("Urban95 shade sources unavailable: %s", exc)
            streets = gpd.GeoDataFrame(geometry=[], crs=f"EPSG:{target_epsg}")
            open_spaces = gpd.GeoDataFrame(geometry=[], crs=f"EPSG:{target_epsg}")
            availability["shade_streets"] = SourceAvailability(False, "unreadable")
            availability["shade_open_spaces"] = SourceAvailability(False, "unreadable")
    else:
        streets = gpd.GeoDataFrame(geometry=[], crs=f"EPSG:{target_epsg}")
        open_spaces = gpd.GeoDataFrame(geometry=[], crs=f"EPSG:{target_epsg}")
        availability["shade_streets"] = SourceAvailability(
            False,
            "paired_source_missing" if street_exists else "missing",
        )
        availability["shade_open_spaces"] = SourceAvailability(
            False,
            "paired_source_missing" if open_space_exists else "missing",
        )
    layers["shade_streets"] = streets
    layers["shade_open_spaces"] = open_spaces
    return layers


def calc_nature(building, layers: dict, include_details: bool = False):
    """
    חישוב טבע: גודל פארקים ואזורי טבע עירוני בטווח 300 מ' מקצה המבנה.
    """
    buffer_300m = building.buffer(300)
    parks_score = 0.0
    urban_nature_score = 0.0

    try:
        if "parks" in layers and not layers["parks"].empty:
            parks_in_buffer = _features_intersecting(layers["parks"], buffer_300m)
            if not parks_in_buffer.empty:
                parks_score = 1.0 if any(parks_in_buffer.geometry.area >= 3000) else 0.5
    except Exception as exc:
        logging.warning("Urban95 parks calculation failed: %s", exc)
        parks_score = None

    try:
        if "urban_nature_areas" in layers and not layers["urban_nature_areas"].empty:
            urban_nature_in_buffer = _features_intersecting(
                layers["urban_nature_areas"],
                buffer_300m,
            )
            if not urban_nature_in_buffer.empty:
                urban_nature_score = 1.0
    except Exception as exc:
        logging.warning("Urban95 urban-nature calculation failed: %s", exc)
        urban_nature_score = None

    details = {
        "parks": None if parks_score is None else parks_score * 100,
        "urban_nature_areas": (
            None if urban_nature_score is None else urban_nature_score * 100
        ),
    }
    final_score = _equal_category_score("nature", details)
    if not include_details:
        return final_score
    return final_score, details


def calc_play(building, layers: dict, include_details: bool = False):
    """
    חישוב משחק: הימצאות גן שעשועים בטווח 300 מ' מקצה המבנה.
    """
    buffer_300m = building.buffer(300)
    playgrounds_score = 0.0

    try:
        if "playgrounds" in layers and not layers["playgrounds"].empty:
            playgrounds_in_buffer = _features_intersecting(
                layers["playgrounds"],
                buffer_300m,
            )
            if not playgrounds_in_buffer.empty:
                playgrounds_score = 1.0
    except Exception as exc:
        logging.warning("Urban95 playgrounds calculation failed: %s", exc)
        playgrounds_score = None

    details = {
        "playgrounds": None if playgrounds_score is None else playgrounds_score * 100
    }
    final_score = _equal_category_score("play", details)
    if not include_details:
        return final_score
    return final_score, details


def calc_streetlight_subscore(building, street_lights: gpd.GeoDataFrame | None) -> float:
    """Return the scalar street-light overlay tier without other safety work."""
    buffer_300m = building.buffer(300)
    lights_score = 0.0
    if street_lights is not None and not street_lights.empty:
        lights_near = _features_intersecting(street_lights, building.buffer(315))
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


def calc_safety_and_mobility(building, layers: dict, include_details: bool = False):
    """
    חישוב בטיחות ותנועה: תאורה, אופניים, תחנות אוטובוס ומקלטים.
    טווחים נמדדים מקצה המבנה (near-edge).
    """
    buffer_300m = building.buffer(300)
    buffer_50m = building.buffer(50)

    # 1. תאורת רחוב
    try:
        lights_score = calc_streetlight_subscore(
            building,
            layers.get("street_lights"),
        ) / 100.0
    except Exception as exc:
        logging.warning("Urban95 street-light calculation failed: %s", exc)
        lights_score = None

    # 2. אופניים
    bike_score = 0.0
    try:
        if "bikes" in layers and not layers["bikes"].empty:
            if not _features_intersecting(layers["bikes"], buffer_300m).empty:
                bike_score = 1.0
    except Exception as exc:
        logging.warning("Urban95 bicycle calculation failed: %s", exc)
        bike_score = None
            
    # 3. תחנות אוטובוס
    bus_score = 0.0
    try:
        if "bus_stops" in layers and not layers["bus_stops"].empty:
            bus_count = len(_features_intersecting(layers["bus_stops"], buffer_300m))
            if bus_count >= 3:
                bus_score = 1.0
            elif 1 <= bus_count <= 2:
                bus_score = 0.5
    except Exception as exc:
        logging.warning("Urban95 bus-stop calculation failed: %s", exc)
        bus_score = None

    # 4. מקלטים
    shelters_score = 0.0
    try:
        if "shelters" in layers and not layers["shelters"].empty:
            if not _features_intersecting(layers["shelters"], buffer_50m).empty:
                shelters_score = 1.0
    except Exception as exc:
        logging.warning("Urban95 shelter calculation failed: %s", exc)
        shelters_score = None

    details = {
        "street_lights": None if lights_score is None else lights_score * 100,
        "bicycle_access": None if bike_score is None else bike_score * 100,
        "bus_stops": None if bus_score is None else bus_score * 100,
        "shelters": None if shelters_score is None else shelters_score * 100,
    }
    final_score = _equal_category_score("safety_mobility", details)
    if not include_details:
        return final_score
    return final_score, details


def calc_family_services(building, layers: dict, include_details: bool = False):
    """
    חישוב שירותים למשפחה: מרחקים למוסדות חינוך, קהילה, מסחר ובריאות.
    מרחקים נמדדים מקצה המבנה (near-edge).
    """
    buffer_300m = building.buffer(300)
    
    # פונקציית עזר למציאת המרחק המינימלי לשכבה מסוימת
    def get_min_distance(layer_name):
        if layer_name in layers and not layers[layer_name].empty:
            features_in_300m = _features_intersecting(layers[layer_name], buffer_300m)
            if not features_in_300m.empty:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", RuntimeWarning)
                    return features_in_300m.geometry.distance(building).min()
        return None

    # 1. חינוך
    education_score = 0.0
    try:
        edu_dist = get_min_distance("education")
        if edu_dist is not None:
            if edu_dist <= 150:
                education_score = 1.0
            elif edu_dist <= 300:
                education_score = 0.5
    except Exception as exc:
        logging.warning("Urban95 education calculation failed: %s", exc)
        education_score = None

    # 2. מרכז קהילתי
    try:
        community_score = 1.0 if get_min_distance("community") is not None else 0.0
    except Exception as exc:
        logging.warning("Urban95 community calculation failed: %s", exc)
        community_score = None
    
    # 3. בתי עסק
    try:
        business_score = 1.0 if get_min_distance("business") is not None else 0.0
    except Exception as exc:
        logging.warning("Urban95 business calculation failed: %s", exc)
        business_score = None
    
    # 4. בריאות
    try:
        health_score = 1.0 if get_min_distance("health") is not None else 0.0
    except Exception as exc:
        logging.warning("Urban95 health calculation failed: %s", exc)
        health_score = None

    details = {
        "education": None if education_score is None else education_score * 100,
        "community": None if community_score is None else community_score * 100,
        "business": None if business_score is None else business_score * 100,
        "health": None if health_score is None else health_score * 100,
    }
    final_score = _equal_category_score("family_services", details)
    if not include_details:
        return final_score
    return final_score, details

# ==========================================
# Scalar status assembly
# ==========================================

def calculate_master_index(
    x_coord: float,
    y_coord: float,
    layers: dict,
    precomputed: dict | None = None,
    building_geometry=None,
):
    """
    הפונקציה הראשית. מופעלת בלחיצה על המפה או לניקוד מבנה.
    הקואורדינטות צריכות להיות ברשת ישראל החדשה (EPSG:2039) או להמיר אותן.
    When ``building_geometry`` is provided, all fixed-distance Urban95 rules use
    near-edge distance from that footprint; otherwise a click Point is used.
    """
    building = building_geometry if building_geometry is not None else Point(x_coord, y_coord)
    precomputed = precomputed or {}
    summer_si = precomputed.get("summer_si")

    # 1. שליחת הגיאומטריה והשכבות לכל קטגוריה וקבלת ציונים
    calculators = {
        "environmental_quality": lambda: calc_environmental_quality(
            building,
            layers,
            include_details=True,
            precomputed_summer_si=summer_si,
        ),
        "nature": lambda: calc_nature(building, layers, include_details=True),
        "play": lambda: calc_play(building, layers, include_details=True),
        "safety_mobility": lambda: calc_safety_and_mobility(building, layers, include_details=True),
        "family_services": lambda: calc_family_services(building, layers, include_details=True),
    }
    direct_scores: dict[str, dict[str, object]] = {}
    for category, children in STATUS_HIERARCHY.items():
        try:
            _, details = calculators[category]()
        except Exception as exc:
            logging.warning("Urban95 %s calculation failed: %s", category, exc)
            details = {child: None for child in children}
        direct_scores[category] = details
    
    # 2. Assemble equal-mean category and overview statuses.
    records = layers.get(SOURCE_AVAILABILITY_KEY)

    def source_available(source_key: str) -> bool:
        if source_key in ("shade_streets", "shade_open_spaces") and "summer_si" in precomputed:
            try:
                return math.isfinite(float(precomputed["summer_si"]))
            except Exception:
                return False
        inferred = _source_frame_availability(source_key, layers.get(source_key))
        if isinstance(records, dict):
            return source_is_available(records, source_key) and inferred.available
        return inferred.available

    for (category, indicator), requirements in INDICATOR_SOURCE_REQUIREMENTS.items():
        if not all(source_available(source_key) for source_key in requirements):
            direct_scores[category][indicator] = None

    category_attainments = {
        category: equal_mean(
            attainment_from_score(direct_scores[category].get(child))
            for child in children
        )
        for category, children in STATUS_HIERARCHY.items()
    }
    subcategory_statuses = {
        category: {
            child: status_from_attainment(
                attainment_from_score(direct_scores[category].get(child))
            )
            for child in children
        }
        for category, children in STATUS_HIERARCHY.items()
    }

    diagnostic_statuses: dict[str, dict[str, dict[str, str]]] = {}
    for (category, parent), children in STATUS_DIAGNOSTICS.items():
        parent_available = all(
            source_available(source_key)
            for source_key in INDICATOR_SOURCE_REQUIREMENTS[(category, parent)]
        )
        parent_layer = layers.get(parent)
        diagnostic_statuses.setdefault(category, {}).setdefault(parent, {})
        for child in children:
            if not parent_available or not isinstance(parent_layer, gpd.GeoDataFrame):
                score = None
            else:
                try:
                    if "amenity_subtype" in parent_layer.columns:
                        child_layer = parent_layer.loc[parent_layer["amenity_subtype"] == child].copy()
                    else:
                        child_layer = parent_layer.iloc[0:0].copy()
                    child_layers = dict(layers)
                    child_layers[parent] = child_layer
                    _, family_details = calc_family_services(building, child_layers, include_details=True)
                    score = family_details[parent]
                except Exception as exc:
                    logging.warning("Urban95 diagnostic %s calculation failed: %s", child, exc)
                    score = None
            diagnostic_statuses[category][parent][child] = status_from_attainment(
                attainment_from_score(score)
            )

    return {
        "overview_status": aggregate_status(category_attainments.values()),
        "category_statuses": {
            name: status_from_attainment(value)
            for name, value in category_attainments.items()
        },
        "subcategory_statuses": subcategory_statuses,
        "diagnostic_statuses": diagnostic_statuses,
    }
