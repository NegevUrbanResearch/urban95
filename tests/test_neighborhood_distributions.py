"""Shared-edge per-neighborhood building-score distributions."""

from __future__ import annotations

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point

from lib.neighborhood_distributions import build_per_neighborhood_distributions


def _buildings_gdf() -> gpd.GeoDataFrame:
    # Two hoods with distinct ranges so shared edges must span both.
    # NaNs must not be filled into edges (dropna policy).
    rows = [
        # Neighborhood A
        {"neighborhood": "A", "score_weighted_5min": 10.0, "score_weighted_10min": 20.0, "score_weighted_15min": 30.0,
         "score_expanded_5min": 1.0, "score_expanded_10min": 2.0, "score_expanded_15min": 3.0},
        {"neighborhood": "A", "score_weighted_5min": 12.0, "score_weighted_10min": 22.0, "score_weighted_15min": 32.0,
         "score_expanded_5min": 1.5, "score_expanded_10min": 2.5, "score_expanded_15min": 3.5},
        {"neighborhood": "A", "score_weighted_5min": np.nan, "score_weighted_10min": 24.0, "score_weighted_15min": 34.0,
         "score_expanded_5min": np.nan, "score_expanded_10min": 2.2, "score_expanded_15min": 3.2},
        # Neighborhood B
        {"neighborhood": "B", "score_weighted_5min": 40.0, "score_weighted_10min": 50.0, "score_weighted_15min": 60.0,
         "score_expanded_5min": 8.0, "score_expanded_10min": 9.0, "score_expanded_15min": 10.0},
        {"neighborhood": "B", "score_weighted_5min": 42.0, "score_weighted_10min": 52.0, "score_weighted_15min": 62.0,
         "score_expanded_5min": 8.5, "score_expanded_10min": 9.5, "score_expanded_15min": 10.5},
        # Empty hood for a column: C has no finite weighted_5min → omit C from that key path
        {"neighborhood": "C", "score_weighted_5min": np.nan, "score_weighted_10min": 70.0, "score_weighted_15min": 80.0,
         "score_expanded_5min": np.nan, "score_expanded_10min": 11.0, "score_expanded_15min": 12.0},
    ]
    gdf = gpd.GeoDataFrame(rows, geometry=[Point(i, 0) for i in range(len(rows))], crs="EPSG:4326")
    return gdf


def test_shared_edges_count_sums_and_10min_present():
    buildings = _buildings_gdf()
    out = build_per_neighborhood_distributions(buildings, bins=5)

    assert "distributions_weighted" in out
    assert "distributions_expanded" in out

    weighted = out["distributions_weighted"]
    expanded = out["distributions_expanded"]

    # 10min key present for both modes / hoods with data
    assert "10min" in weighted["A"]
    assert "10min" in weighted["B"]
    assert "10min" in expanded["A"]
    assert "10min" in expanded["B"]

    # Shared edges A vs B for same mode/minutes
    assert weighted["A"]["10min"]["edges"] == weighted["B"]["10min"]["edges"]
    assert expanded["A"]["10min"]["edges"] == expanded["B"]["10min"]["edges"]
    assert weighted["A"]["5min"]["edges"] == weighted["B"]["5min"]["edges"]

    # Count sums equal finite building counts in that hood/column
    assert sum(weighted["A"]["10min"]["counts"]) == 3
    assert sum(weighted["B"]["10min"]["counts"]) == 2
    assert sum(weighted["A"]["5min"]["counts"]) == 2  # one NaN dropped
    assert sum(expanded["A"]["10min"]["counts"]) == 3

    # Edges span citywide finite range (A low + B high), not fillna(0)
    edges_w10 = weighted["A"]["10min"]["edges"]
    assert edges_w10[0] <= 20.0
    assert edges_w10[-1] >= 52.0

    # Hood with zero finite values for a column is omitted for that minutes key
    assert "5min" not in weighted.get("C", {})
