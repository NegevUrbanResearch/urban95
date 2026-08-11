"""Amenities Focus per-neighborhood histograms."""

from __future__ import annotations

import geopandas as gpd
import numpy as np
from shapely.geometry import Point

from lib.neighborhood_distributions import build_per_neighborhood_distributions


def _buildings_gdf() -> gpd.GeoDataFrame:
    rows = [
        {"neighborhood": "A", "score_expanded_5min": 1.0, "score_expanded_10min": 2.0, "score_expanded_15min": 3.0},
        {"neighborhood": "A", "score_expanded_5min": 1.5, "score_expanded_10min": 2.5, "score_expanded_15min": 3.5},
        {"neighborhood": "A", "score_expanded_5min": np.nan, "score_expanded_10min": 2.2, "score_expanded_15min": 3.2},
        {"neighborhood": "B", "score_expanded_5min": 8.0, "score_expanded_10min": 9.0, "score_expanded_15min": 10.0},
        {"neighborhood": "B", "score_expanded_5min": 8.5, "score_expanded_10min": 9.5, "score_expanded_15min": 10.5},
        {"neighborhood": "C", "score_expanded_5min": np.nan, "score_expanded_10min": 11.0, "score_expanded_15min": 12.0},
    ]
    return gpd.GeoDataFrame(rows, geometry=[Point(i, 0) for i in range(len(rows))], crs="EPSG:4326")


def test_expanded_distributions_keep_shared_edges_and_weighted_histograms_are_absent():
    out = build_per_neighborhood_distributions(_buildings_gdf(), bins=5)

    assert "distributions_expanded" in out
    assert "distributions_weighted" not in out
    expanded = out["distributions_expanded"]
    assert "10min" in expanded["A"]
    assert "10min" in expanded["B"]
    assert expanded["A"]["10min"]["edges"] == expanded["B"]["10min"]["edges"]
    assert sum(expanded["A"]["10min"]["counts"]) == 3
    assert sum(expanded["A"]["5min"]["counts"]) == 2
    assert "5min" not in expanded.get("C", {})
