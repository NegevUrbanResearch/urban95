import geopandas as gpd
import numpy as np
from shapely.geometry import Point, box

from stages.neighborhoods import (
    HEX_IDW_RADIUS_METERS,
    build_neighborhood_surface_geojson,
    idw_score,
    idw_scores_batch,
)


def _idw_score_scalar(cx, cy, samples, radius_m):
    """Reference scalar IDW (pre-vectorization semantics) for equivalence checks."""
    if not samples:
        return 0.0
    r2 = radius_m * radius_m
    nearest_d2 = float("inf")
    nearest_score = 0.0
    num = 0.0
    den = 0.0
    for sx, sy, sv in samples:
        dx = sx - cx
        dy = sy - cy
        d2 = dx * dx + dy * dy
        if d2 < 1e-9:
            return float(sv)
        if d2 < nearest_d2:
            nearest_d2 = d2
            nearest_score = float(sv)
        if d2 > r2:
            continue
        w = 1.0 / d2
        num += float(sv) * w
        den += w
    if den <= 0:
        return nearest_score
    return num / den


def test_surface_hex_has_nonzero_score_weighted_near_building():
    hood = gpd.GeoDataFrame(
        {"Name": ["TestHood"]},
        geometry=[box(0, 0, 200, 200)],
        crs="EPSG:2039",
    )
    buildings = gpd.GeoDataFrame(
        {
            "building_id": [0, 1],
            "score_weighted_10min": [80.0, 40.0],
            "neighborhood": ["TestHood", "TestHood"],
        },
        geometry=[Point(50, 50), Point(150, 150)],
        crs="EPSG:2039",
    )
    # Required by build_neighborhood_surface_geojson (see stages/neighborhoods.py ~366)
    buildings["_centroid_proj"] = buildings.geometry
    fc = build_neighborhood_surface_geojson(hood, buildings, filter_types=[])
    assert fc["features"], "expected at least one hex feature"
    scored = [
        f["properties"]["score_weighted"]
        for f in fc["features"]
        if f["properties"].get("has_buildings") == 1
    ]
    assert scored, "expected hexes with has_buildings=1"
    assert max(scored) > 0
    assert "score_weighted" in fc["features"][0]["properties"]


def test_idw_batch_matches_scalar_within_tol():
    samples = [(50.0, 50.0, 80.0), (150.0, 150.0, 40.0), (100.0, 80.0, 60.0)]
    queries = [(50.0, 50.0), (100.0, 100.0), (0.0, 0.0), (200.0, 200.0), (75.0, 125.0)]
    cx = np.asarray([q[0] for q in queries], dtype=float)
    cy = np.asarray([q[1] for q in queries], dtype=float)
    batch = idw_scores_batch(cx, cy, samples, HEX_IDW_RADIUS_METERS)
    scalar = np.asarray(
        [_idw_score_scalar(x, y, samples, HEX_IDW_RADIUS_METERS) for x, y in queries],
        dtype=float,
    )
    assert np.max(np.abs(batch - scalar)) <= 1e-6
    # Single-point wrapper stays consistent with batch
    for i, (x, y) in enumerate(queries):
        assert abs(idw_score(x, y, samples, HEX_IDW_RADIUS_METERS) - float(batch[i])) <= 1e-6
