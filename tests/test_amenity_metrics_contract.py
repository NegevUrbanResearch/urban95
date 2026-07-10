import geopandas as gpd
from shapely.geometry import Point, Polygon

from stages.amenity_metrics import compute_amenity_metrics


def test_amenity_metrics_golden_tree_count():
    # Two buildings in metric CRS. Building 0 at origin; building 1 far away.
    # 5/10/15min isochrones are nested boxes. One tree inside building 0 only.
    # Park overlaps 5min isochrone edge but centroid is outside (intersects ≠ within).
    buildings = gpd.GeoDataFrame(
        {"building_id": [0, 1]},
        geometry=[Point(0, 0), Point(1000, 1000)],
        crs="EPSG:2039",
    )
    iso = gpd.GeoDataFrame(
        {
            "building_id": [0, 0, 0, 1, 1, 1],
            "minutes": [5, 10, 15, 5, 10, 15],
        },
        geometry=[
            Polygon([(-50, -50), (50, -50), (50, 50), (-50, 50)]),
            Polygon([(-100, -100), (100, -100), (100, 100), (-100, 100)]),
            Polygon([(-150, -150), (150, -150), (150, 150), (-150, 150)]),
            Polygon([(950, 950), (1050, 950), (1050, 1050), (950, 1050)]),
            Polygon([(900, 900), (1100, 900), (1100, 1100), (900, 1100)]),
            Polygon([(850, 850), (1150, 850), (1150, 1150), (850, 1150)]),
        ],
        crs="EPSG:2039",
    )
    trees = gpd.GeoDataFrame(geometry=[Point(10, 10)], crs="EPSG:2039")
    # Park: overlaps x∈[40,50] of the 5min box; centroid (60,0) is outside → within would miss.
    parks = gpd.GeoDataFrame(
        geometry=[Polygon([(40, -10), (80, -10), (80, 10), (40, 10)])],
        crs="EPSG:2039",
    )
    amenities_legacy = gpd.GeoDataFrame(
        {"amenity_type": ["playground"]},
        # Outside 5min box, inside 10min — keeps score_expanded_5min tree-only (0.25).
        geometry=[Point(70, 0)],
        crs="EPSG:2039",
    )
    amenities_clean = gpd.GeoDataFrame(
        {"amenity_type": ["education"]},
        geometry=[Point(8, 8)],
        crs="EPSG:2039",
    )
    empty = gpd.GeoDataFrame(geometry=[], crs="EPSG:2039")
    out = compute_amenity_metrics(
        buildings,
        iso,
        amenities_legacy=amenities_legacy,
        trees=trees,
        street_lights=empty,
        parks=parks,
        amenities_clean=amenities_clean,
    )

    b0 = out.loc[out["building_id"] == 0].iloc[0]
    b1 = out.loc[out["building_id"] == 1].iloc[0]

    assert int(b0["num_trees_5min"]) == 1
    assert int(b0["num_trees_10min"]) == 1
    assert int(b0["num_trees_15min"]) == 1
    assert int(b1["num_trees_5min"]) == 0
    assert int(b1["num_trees_10min"]) == 0
    assert int(b1["num_trees_15min"]) == 0

    # One tree in 5min, no legacy amenities in 5min → 0 + 1*0.25 + 0
    assert float(b0["score_expanded_5min"]) == 0.25
    assert float(b1["score_expanded_5min"]) == 0.0

    # Parks use intersects: edge-overlap park counted for building 0 only
    assert float(b0["clean_pts_parks_5min"]) == 15.0
    assert float(b1["clean_pts_parks_5min"]) == 0.0

    # Legacy typed: playground only in 10min ring (no amen_*_5min column when empty)
    assert int(b0["num_amenities_5min"]) == 0
    assert int(b0["amen_playground_10min"]) == 1
    assert int(b1["amen_playground_10min"]) == 0
    assert float(b0["clean_pts_education_5min"]) == 7.5
    assert float(b1["clean_pts_education_5min"]) == 0.0
