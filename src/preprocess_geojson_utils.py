import gzip
import math
import warnings
from pathlib import Path

import geopandas as gpd
import pandas as pd


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
    from shapely.geometry import shape, mapping
    
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


def export_buildings_web_layer(
    buildings_gdf: gpd.GeoDataFrame,
    out_path: Path,
    simplify_tolerance_m: float = 1.5,
    drop_columns: list[str] | None = None,
    precision: int = 5,
) -> gpd.GeoDataFrame:
    """Simplify, trim columns, and write buildings GeoJSON for the web map."""
    buildings_web = simplify_geometries(buildings_gdf, simplify_tolerance_m)
    buildings_web = reduce_coordinate_precision(buildings_web, precision=precision)

    if drop_columns:
        cols_to_drop = [c for c in drop_columns if c in buildings_web.columns]
        if cols_to_drop:
            buildings_web = buildings_web.drop(columns=cols_to_drop)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    write_minimal_geojson(buildings_web, out_path, precision=precision)
    return buildings_web


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
