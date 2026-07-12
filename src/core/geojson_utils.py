import gzip
import json
import math
import warnings
from pathlib import Path
from typing import Callable, Collection, Sequence

import geopandas as gpd
import pandas as pd
from shapely.geometry import mapping

from core.atomic_files import commit_staged_files, staged_output_paths


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


def sanitize_json_value(value):
    """Convert pandas/numpy values to the same JSON-safe primitives as before."""
    if hasattr(value, "item"):
        value = value.item()
    if value is None:
        return None
    if isinstance(value, float):
        return value if math.isfinite(value) else 0.0
    if isinstance(value, dict):
        return {k: sanitize_json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize_json_value(v) for v in value]
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    return value


def serialize_minimal_feature(
    row: tuple,
    columns: Sequence[str],
    geometry_name: str,
    precision: int,
    null_omitting_columns: Collection[str] = (),
) -> dict | None:
    """Serialize one dataframe row using the legacy minimal Feature contract."""
    values = dict(zip(columns, row, strict=True))
    geometry = values.pop(geometry_name)
    if geometry is None or geometry.is_empty:
        return None

    properties = {}
    for name, value in values.items():
        if name in null_omitting_columns:
            try:
                if bool(pd.isna(value)):
                    continue
            except (TypeError, ValueError):
                pass
        sanitized = sanitize_json_value(value)
        if sanitized is not None:
            properties[name] = sanitized

    return {
        "type": "Feature",
        "properties": properties,
        "geometry": _round_geojson_coords(mapping(geometry), precision),
    }


def write_minimal_geojson(
    gdf: gpd.GeoDataFrame,
    path: Path,
    precision: int = 5,
    gzip_path: Path | None = None,
    feature_observer: Callable[[dict], None] | None = None,
    compresslevel: int = 6,
) -> None:
    """Writes GeoJSON with minimal overhead (no CRS, reduced precision).
    
    This produces smaller files than geopandas default output by:
    - Omitting the CRS property (web maps default to WGS84)
    - Omitting the 'name' property
    - Using reduced coordinate precision
    """
    destinations = (path,) if gzip_path is None else (path, gzip_path)
    with staged_output_paths(destinations) as staged:
        physical_path = staged[0]
        physical_gzip_path = staged[1] if gzip_path is not None else None
        _write_minimal_geojson_stream(
            gdf,
            physical_path,
            precision=precision,
            gzip_path=physical_gzip_path,
            canonical_gzip_path=gzip_path,
            feature_observer=feature_observer,
            compresslevel=compresslevel,
        )
        commit_staged_files(tuple(zip(staged, destinations, strict=True)))


def _write_minimal_geojson_stream(
    gdf: gpd.GeoDataFrame,
    path: Path,
    *,
    precision: int = 5,
    gzip_path: Path | None = None,
    canonical_gzip_path: Path | None = None,
    feature_observer: Callable[[dict], None] | None = None,
    compresslevel: int = 6,
) -> None:
    """Write one plain stream and optional gzip stream to physical paths."""
    columns = tuple(gdf.columns)
    geometry_name = getattr(gdf, "_geometry_column_name", None) or "geometry"
    null_omitting_columns = frozenset(
        name
        for name in columns
        if name != geometry_name
        and (
            pd.api.types.is_object_dtype(gdf[name].dtype)
            or pd.api.types.is_string_dtype(gdf[name].dtype)
        )
    )
    prefix = b'{"type":"FeatureCollection","features":['
    suffix = b"]}"

    plain_handle = path.open("wb")
    gzip_raw = None
    gzip_handle = None
    try:
        if gzip_path is not None:
            gzip_raw = gzip_path.open("wb")
            canonical = canonical_gzip_path or gzip_path
            gzip_handle = gzip.GzipFile(
                filename=canonical.name,
                mode="wb",
                fileobj=gzip_raw,
                compresslevel=compresslevel,
            )
        handles = [plain_handle] + ([gzip_handle] if gzip_handle is not None else [])

        def write_bytes(data: bytes) -> None:
            for handle in handles:
                handle.write(data)

        body_error: BaseException | None = None
        close_errors: list[BaseException] = []
        try:
            write_bytes(prefix)
            first = True
            for row in gdf.itertuples(index=False, name=None):
                feature = serialize_minimal_feature(
                    row,
                    columns,
                    geometry_name,
                    precision,
                    null_omitting_columns,
                )
                if feature is None:
                    continue
                if not first:
                    write_bytes(b",")
                first = False
                encoded = json.dumps(
                    feature,
                    ensure_ascii=True,
                    separators=(",", ":"),
                    allow_nan=False,
                ).encode("utf-8")
                write_bytes(encoded)
                if feature_observer is not None:
                    feature_observer(feature)
            write_bytes(suffix)
        except BaseException as exc:
            body_error = exc
        finally:
            if gzip_handle is not None:
                try:
                    gzip_handle.close()
                except BaseException as exc:
                    close_errors.append(exc)
            if gzip_raw is not None:
                try:
                    gzip_raw.close()
                except BaseException as exc:
                    close_errors.append(exc)
            try:
                plain_handle.close()
            except BaseException as exc:
                close_errors.append(exc)
        if body_error is not None:
            for close_error in close_errors:
                body_error.add_note(f"GeoJSON stream finalization failed: {close_error}")
            raise body_error
        if close_errors:
            raise close_errors[0]
    except BaseException as original:
        # If construction failed, cleanup must never mask the construction error.
        cleanup_errors: list[BaseException] = []
        if gzip_handle is None and gzip_raw is not None and not gzip_raw.closed:
            try:
                gzip_raw.close()
            except BaseException as exc:
                cleanup_errors.append(exc)
        if gzip_handle is None and not plain_handle.closed:
            try:
                plain_handle.close()
            except BaseException as exc:
                cleanup_errors.append(exc)
        for cleanup_error in cleanup_errors:
            original.add_note(f"GeoJSON stream cleanup failed: {cleanup_error}")
        raise original


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
    out_path: Path | None = None,
    *,
    simplify_tolerance_m: float = 1.5,
    drop_columns: list[str] | None = None,
    precision: int = 5,
) -> gpd.GeoDataFrame:
    """Simplify/trim only. Does NOT write disk. export_web is the sole writer."""
    buildings_web = simplify_geometries(buildings_gdf, simplify_tolerance_m)
    if buildings_web.crs is not None:
        buildings_web = buildings_web.to_crs(epsg=4326)

    if drop_columns:
        cols_to_drop = [c for c in drop_columns if c in buildings_web.columns]
        if cols_to_drop:
            buildings_web = buildings_web.drop(columns=cols_to_drop)

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
