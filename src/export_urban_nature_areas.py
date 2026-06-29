"""
Export urban nature area polygons from SekerTevaIroni.gdb to docs/data/.

Run from repo root:
    python src/export_urban_nature_areas.py
"""
from __future__ import annotations

from pathlib import Path

import geopandas as gpd

from preprocess_accessibility import write_gzip_copy, write_minimal_geojson

REPO_ROOT = Path(__file__).resolve().parent.parent
GDB_PATH = REPO_ROOT / "docs" / "data" / "SekerTevaIroni.gdb"
LAYER_NAME = "אזור_טבע_עירוני"
OUTPUT_PATH = REPO_ROOT / "docs" / "data" / "urban_nature_areas.geojson"


def export_urban_nature_areas(
    gdb_path: Path = GDB_PATH,
    output_path: Path = OUTPUT_PATH,
) -> Path:
    if not gdb_path.exists():
        raise FileNotFoundError(f"File geodatabase not found: {gdb_path}")

    gdf = gpd.read_file(gdb_path, layer=LAYER_NAME)
    if gdf.empty:
        raise ValueError(f"No features found in layer {LAYER_NAME!r}")

    if gdf.crs is None:
        gdf = gdf.set_crs(epsg=2039)
    gdf = gdf.to_crs(epsg=4326)

    name_col = "שם_אתר" if "שם_אתר" in gdf.columns else "SitePolygonName"
    area_col = "AraeSqm" if "AraeSqm" in gdf.columns else "Shape_Area"

    export = gpd.GeoDataFrame(
        {
            "name": gdf[name_col].astype(str).str.strip(),
            "area": gdf[area_col],
            "classification": gdf.get("סיווג_האתר", ""),
            "site_id": gdf.get("SitePolygonID"),
        },
        geometry=gdf.geometry,
        crs="EPSG:4326",
    )
    export = export[export.geometry.notna() & ~export.geometry.is_empty].copy()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_minimal_geojson(export, output_path, precision=5)
    write_gzip_copy(output_path)
    return output_path


if __name__ == "__main__":
    path = export_urban_nature_areas()
    print(f"Wrote {path} ({path.stat().st_size // 1024} KB)")
