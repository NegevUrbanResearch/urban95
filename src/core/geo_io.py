"""Shared GeoJSON/GeoDataFrame I/O helpers."""
from __future__ import annotations

import gzip
import json
import logging
from pathlib import Path

import geopandas as gpd
import pandas as pd

CRS_METRIC = 2039
WALK_MINUTES = [5, 10, 15]


def repair_text_encoding(text: str) -> str:
    """Repair Mojibake from double UTF-8 encoding (Hebrew/Arabic)."""
    if not isinstance(text, str) or not text:
        return text

    mojibake_indicators = ("×", "Ø", "Ù", "Ú", "Û", "Ü")
    if not any(indicator in text for indicator in mojibake_indicators):
        return text

    try:
        repaired = text.encode("latin-1", errors="ignore").decode("utf-8", errors="ignore")
        if not repaired or repaired == text:
            return text
        return repaired
    except (UnicodeDecodeError, UnicodeEncodeError):
        return text


repair_hebrew_encoding = repair_text_encoding


def repair_dataframe_encoding(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Repair text encoding in string columns of a GeoDataFrame."""
    gdf = gdf.copy()
    for col in gdf.columns:
        if gdf[col].dtype == object:
            gdf[col] = gdf[col].apply(
                lambda x: repair_text_encoding(x) if isinstance(x, str) else x
            )
    return gdf


def unique_columns(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Rename duplicate column names so GeoDataFrame can be written to GeoJSON."""
    cols = list(gdf.columns)
    if len(cols) == len(set(cols)):
        return gdf
    seen: dict[str, int] = {}
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


def load_layer(path: Path, target_crs: int = CRS_METRIC) -> gpd.GeoDataFrame:
    """Load a GeoJSON/shape layer and reproject it to target_crs."""
    if str(path).endswith(".geojson.gz"):
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            data = json.load(handle)
        gdf = gpd.GeoDataFrame.from_features(data.get("features") or [])
        if gdf.crs is None:
            gdf = gdf.set_crs(epsg=4326)
    else:
        gdf = gpd.read_file(path)
    gdf = unique_columns(gdf)
    if gdf.crs is None:
        raise ValueError(f"Layer {path} has no CRS defined.")
    if gdf.crs.to_epsg() != target_crs:
        gdf = gdf.to_crs(epsg=target_crs)
    return gdf


def write_scored_buildings(buildings: gpd.GeoDataFrame, path: Path) -> None:
    """Write scored buildings GeoJSON to output (metric CRS preserved)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    to_export = buildings.copy()
    geom_cols = [
        c
        for c in to_export.columns
        if c != to_export.geometry.name
        and hasattr(to_export[c].dtype, "name")
        and str(to_export[c].dtype.name).lower() == "geometry"
    ]
    for col in geom_cols:
        to_export = to_export.drop(columns=[col])
    to_export = unique_columns(to_export)
    to_export.to_file(path, driver="GeoJSON")
    logging.info("Wrote %s (%d features)", path, len(to_export))


def load_scored_buildings(path: Path, target_crs: int = CRS_METRIC) -> gpd.GeoDataFrame:
    """Load scored buildings from output or published web layer."""
    return load_layer(path, target_crs=target_crs)
