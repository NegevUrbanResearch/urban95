"""Chunked vs serial SI attach must produce identical summer_si values."""

from __future__ import annotations

import geopandas as gpd
from shapely.geometry import box

from lib.shade_si import (
    LAYER_OPEN_SPACE,
    LAYER_STREET,
    LAYER_TYPE_FIELD,
    METRIC_CRS,
    SCORE_FIELD,
    attach_summer_si_to_buildings,
)


def _box(x, y, s=100.0):
    return box(x - s, y - s, x + s, y + s)


def test_chunked_si_attach_matches_serial():
    streets = gpd.GeoDataFrame(
        {SCORE_FIELD: [0.4], LAYER_TYPE_FIELD: [LAYER_STREET]},
        geometry=[_box(0, 0)],
        crs=METRIC_CRS,
    )
    opens = gpd.GeoDataFrame(
        {SCORE_FIELD: [0.2], LAYER_TYPE_FIELD: [LAYER_OPEN_SPACE]},
        geometry=[_box(0, 0)],
        crs=METRIC_CRS,
    )
    buildings = gpd.GeoDataFrame(
        {"building_id": list(range(5))},
        geometry=[_box(float(i), 0.0, 2.0) for i in range(5)],
        crs=METRIC_CRS,
    )
    serial = attach_summer_si_to_buildings(buildings.copy(), streets, opens, chunk_size=None)
    chunked = attach_summer_si_to_buildings(buildings.copy(), streets, opens, chunk_size=2)
    assert list(serial["summer_si"]) == list(chunked["summer_si"])
