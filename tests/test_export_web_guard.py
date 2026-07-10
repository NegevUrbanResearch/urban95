"""Guard: export_web must not publish buildings without score columns."""

from __future__ import annotations

import geopandas as gpd
import pytest
from shapely.geometry import Point

from stages.export_web import REQUIRED_BUILDING_SCORE_COLUMNS, assert_buildings_have_scores


def test_assert_buildings_have_scores_rejects_centroid_only():
    gdf = gpd.GeoDataFrame(
        {
            "building_id": [0],
            "centroid_lng": [34.7],
            "centroid_lat": [31.2],
        },
        geometry=[Point(34.7, 31.2)],
        crs="EPSG:4326",
    )
    with pytest.raises(ValueError, match="Refusing to publish"):
        assert_buildings_have_scores(gdf)


def test_assert_buildings_have_scores_accepts_required_columns():
    props = {c: [50.0] for c in REQUIRED_BUILDING_SCORE_COLUMNS}
    props["building_id"] = [0]
    gdf = gpd.GeoDataFrame(props, geometry=[Point(34.7, 31.2)], crs="EPSG:4326")
    assert_buildings_have_scores(gdf)
