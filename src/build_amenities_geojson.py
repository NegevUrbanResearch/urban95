#!/usr/bin/env python3
"""
Merge per-layer GeoJSON under new-data/new-data into docs/data/amenities_new.geojson.
Road and street-light layers are omitted here: roads are not shown as points; street lights
are written to street_lights.geojson for a separate map symbol layer (like trees).
Each geometry is reduced to a point (centroid). Coordinates in Israeli TM (EPSG:2039)
are reprojected to WGS84 (EPSG:4326). Already-valid lon/lat pairs are left unchanged.

Run once when raw inputs change (after unzipping new-data.zip):

  python -m src.build_amenities_geojson
"""

import json
import sys
from pathlib import Path
from typing import Optional, Tuple

from pyproj import Transformer
from shapely.geometry import shape

REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS_DATA = REPO_ROOT / "docs" / "data"

# Israeli Transverse Mercator → WGS84
_TRANSFORMER = Transformer.from_crs("EPSG:2039", "EPSG:4326", always_xy=True)


def _is_wgs84_lonlat(lon: float, lat: float) -> bool:
    return -180 <= lon <= 180 and -90 <= lat <= 90 and lon == lon and lat == lat


def _to_wgs84_pair(x: float, y: float) -> Optional[Tuple[float, float]]:
    if _is_wgs84_lonlat(x, y):
        return x, y
    try:
        lon, lat = _TRANSFORMER.transform(x, y)
    except Exception:
        return None
    if not _is_wgs84_lonlat(lon, lat):
        return None
    return lon, lat


def _centroid_xy(geom: dict) -> Optional[Tuple[float, float]]:
    if not geom or "coordinates" not in geom:
        return None
    try:
        g = shape(geom)
        if g.is_empty:
            return None
        c = g.centroid
        return float(c.x), float(c.y)
    except Exception:
        return None


EXCLUDE_FROM_AMENITIES = frozenset(
    ("trees", "parks", "roads", "street-light")
)


def _append_point_features(fc_path: Path, tag_amenity_type: Optional[str]) -> tuple:
    """Returns (feature dicts, skipped count)."""
    out = []
    skipped = 0
    with fc_path.open(encoding="utf-8") as f:
        data = json.load(f)
    for feat in data.get("features") or []:
        geom = feat.get("geometry")
        xy = _centroid_xy(geom)
        if not xy:
            skipped += 1
            continue
        pair = _to_wgs84_pair(xy[0], xy[1])
        if not pair:
            skipped += 1
            continue
        lon, lat = pair
        props = dict(feat.get("properties") or {})
        if tag_amenity_type is not None:
            props["amenity_type"] = tag_amenity_type
        out.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": props,
            }
        )
    return out, skipped


def main() -> None:
    input_dir = REPO_ROOT / "new-data" / "new-data"
    out_path = DOCS_DATA / "amenities_new.geojson"
    street_out = DOCS_DATA / "street_lights.geojson"

    if not input_dir.is_dir():
        print(
            "Missing folder:",
            input_dir,
            "\nUnzip new-data.zip so layers exist at new-data/new-data/",
            file=sys.stderr,
        )
        sys.exit(1)

    DOCS_DATA.mkdir(parents=True, exist_ok=True)

    features = []
    skipped = 0

    for path in sorted(input_dir.glob("*.geojson")):
        stem = path.stem
        if stem in EXCLUDE_FROM_AMENITIES:
            continue

        layer_feats, sk = _append_point_features(path, stem)
        features.extend(layer_feats)
        skipped += sk

    out = {"type": "FeatureCollection", "features": features}
    out_path.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(features)} features to {out_path}")
    if skipped:
        print(f"Skipped {skipped} amenity features (empty geometry or bad coordinates)")

    street_path = input_dir / "street-light.geojson"
    if street_path.is_file():
        sl_feats, sl_sk = _append_point_features(street_path, None)
        street_out.write_text(
            json.dumps({"type": "FeatureCollection", "features": sl_feats}, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"Wrote {len(sl_feats)} features to {street_out}")
        if sl_sk:
            print(f"Skipped {sl_sk} street-light features (empty geometry or bad coordinates)")
    else:
        print("No street-light.geojson in input folder; skipping street_lights.geojson")


if __name__ == "__main__":
    main()
