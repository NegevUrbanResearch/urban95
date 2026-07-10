import re
from pathlib import Path

import geopandas as gpd
import requests
from shapely.geometry import LineString

from core.paths import DOCS_DATA_DIR, layer

NEIGHBORHOODS_PATH = layer("neighborhoods").path
OUTPUT_PATH = DOCS_DATA_DIR / "roads.geojson"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def _parse_maxspeed_to_kmh(value):
    if value is None:
        return None

    s = str(value).strip().lower()
    if not s:
        return None

    # Handle common non-numeric tags.
    if s in {"none", "signals", "walk", "variable"}:
        return None

    # Supports values like "50", "50 km/h", "30;50", "35 mph".
    m = re.search(r"(\d+(?:\.\d+)?)", s)
    if not m:
        return None

    speed = float(m.group(1))
    if "mph" in s:
        speed *= 1.60934
    return round(speed, 1)


def _build_overpass_query(south, west, north, east):
    return f"""
[out:json][timeout:240];
(
  way["highway"]({south},{west},{north},{east});
);
out tags geom;
"""


def download_osm_roads(padding_degrees=0.01):
    if not NEIGHBORHOODS_PATH.exists():
        raise FileNotFoundError(f"Missing neighborhoods layer: {NEIGHBORHOODS_PATH}")

    neighborhoods = gpd.read_file(NEIGHBORHOODS_PATH)
    if neighborhoods.crs is None:
        neighborhoods = neighborhoods.set_crs(epsg=4326)
    else:
        neighborhoods = neighborhoods.to_crs(epsg=4326)

    minx, miny, maxx, maxy = neighborhoods.total_bounds
    south = miny - padding_degrees
    west = minx - padding_degrees
    north = maxy + padding_degrees
    east = maxx + padding_degrees

    query = _build_overpass_query(south, west, north, east)
    resp = requests.post(OVERPASS_URL, data={"data": query}, timeout=300)
    resp.raise_for_status()
    data = resp.json()

    features = []
    for el in data.get("elements", []):
        coords = el.get("geometry")
        if not coords or len(coords) < 2:
            continue

        line = LineString([(p["lon"], p["lat"]) for p in coords])
        tags = el.get("tags", {})
        maxspeed_raw = tags.get("maxspeed")
        maxspeed_numeric = _parse_maxspeed_to_kmh(maxspeed_raw)

        features.append(
            {
                "osm_id": el.get("id"),
                "highway": tags.get("highway"),
                "name": tags.get("name"),
                "maxspeed": maxspeed_raw,
                "maxspeed_numeric": maxspeed_numeric,
                "lanes": tags.get("lanes"),
                "oneway": tags.get("oneway"),
                "surface": tags.get("surface"),
                "geometry": line,
            }
        )

    roads = gpd.GeoDataFrame(features, geometry="geometry", crs="EPSG:4326")
    roads.to_file(OUTPUT_PATH, driver="GeoJSON")

    print(f"Wrote {len(roads)} roads to {OUTPUT_PATH}")
    has_speed = roads["maxspeed_numeric"].notna().sum() if "maxspeed_numeric" in roads.columns else 0
    print(f"Rows with parsed speed: {has_speed}")


if __name__ == "__main__":
    download_osm_roads()
