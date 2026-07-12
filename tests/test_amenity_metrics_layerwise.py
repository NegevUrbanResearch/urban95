import geopandas as gpd
import numpy as np
from shapely.geometry import Point, Polygon, box

from stages.amenity_metrics import CLEAN_WEIGHTS, compute_amenity_metrics


def _sources():
    # Native clean street-lights and raw street-lights intentionally overlap.
    legacy = gpd.GeoDataFrame(
        {"amenity_type": ["playground", "cafe"]},
        geometry=[Point(5, 5), Point(25, 25)],
        crs=2039,
    )
    clean = gpd.GeoDataFrame(
        {"amenity_type": ["education", "street-lights"]},
        geometry=[Point(5, 5), Point(5, 6)],
        crs=2039,
    )
    trees = gpd.GeoDataFrame(geometry=[Point(5, 7), Point(5, 7)], crs=2039)
    street_lights = gpd.GeoDataFrame(geometry=[Point(5, 8), Point(5, 8)], crs=2039)
    parks = gpd.GeoDataFrame(
        geometry=[Polygon([(9, 0), (12, 0), (12, 2), (9, 2)])], crs=2039
    )
    return legacy, clean, trees, street_lights, parks


def test_layerwise_matrix_path_preserves_predicates_duplicates_and_native_street_lights():
    buildings = gpd.GeoDataFrame(
        {"building_id": [7, 8]},
        geometry=[Point(0, 0), Point(100, 100)],
        crs=2039,
    )
    isochrones = gpd.GeoDataFrame(
        {"building_id": [7, 7, 8], "minutes": [5, 10, 5]},
        geometry=[box(0, 0, 10, 10), box(0, 0, 20, 20), box(90, 90, 110, 110)],
        crs=2039,
    )
    legacy, clean, trees, street_lights, parks = _sources()

    out = compute_amenity_metrics(
        buildings,
        isochrones,
        amenities_legacy=legacy,
        trees=trees,
        street_lights=street_lights,
        parks=parks,
        amenities_clean=clean,
    )

    b7 = out.loc[out["building_id"] == 7].iloc[0]
    b8 = out.loc[out["building_id"] == 8].iloc[0]
    assert int(b7["amen_playground_5min"]) == 1
    assert int(b7["num_trees_5min"]) == 2
    assert int(b7["num_street_lights_5min"]) == 2
    assert int(b7["num_amenities_5min"]) == 1
    assert float(b7["clean_pts_education_5min"]) == CLEAN_WEIGHTS["education"]
    assert float(b7["clean_pts_street_lights_5min"]) == CLEAN_WEIGHTS["street-lights"] * 3
    assert float(b7["clean_pts_parks_5min"]) == CLEAN_WEIGHTS["parks"]
    assert float(b7["score_expanded_5min"]) == 1 + 2 * 0.25 + 2 * 0.25
    assert int(b8["num_amenities_5min"]) == 0
    assert float(b8["score_clean_5min"]) == 0.0


def test_layerwise_path_keeps_empty_isochrone_output_contract():
    buildings = gpd.GeoDataFrame(
        {"building_id": [1]}, geometry=[Point(0, 0)], crs=2039
    )
    empty = gpd.GeoDataFrame(
        {"building_id": [], "minutes": []}, geometry=[], crs=2039
    )
    out = compute_amenity_metrics(
        buildings,
        empty,
        amenities_legacy=empty,
        trees=empty,
        street_lights=empty,
        parks=empty,
        amenities_clean=empty,
    )

    for minutes in (5, 10, 15):
        suffix = f"_{minutes}min"
        assert int(out.loc[0, f"num_amenities{suffix}"]) == 0
        assert int(out.loc[0, f"num_trees{suffix}"]) == 0
        assert float(out.loc[0, f"score_clean{suffix}"]) == 0.0
        assert float(out.loc[0, f"score_expanded{suffix}"]) == 0.0
        assert all(f"clean_pts_{key.replace('-', '_')}{suffix}" in out for key in CLEAN_WEIGHTS)


def test_duplicate_isochrone_key_uses_last_contour_without_deduplicating_sources():
    buildings = gpd.GeoDataFrame(
        {"building_id": [9]}, geometry=[Point(0, 0)], crs=2039
    )
    # The contours are disjoint. The first contains one distinct candidate;
    # the later retained contour contains two exact duplicate source rows.
    isochrones = gpd.GeoDataFrame(
        {"building_id": [9, 9], "minutes": [5, 5]},
        geometry=[box(0, 0, 2, 2), box(10, 10, 14, 14)],
        crs=2039,
    )
    legacy = gpd.GeoDataFrame(
        {"amenity_type": ["playground", "playground", "playground"]},
        geometry=[Point(1, 1), Point(11, 11), Point(11, 11)],
        crs=2039,
    )
    empty = gpd.GeoDataFrame(geometry=[], crs=2039)

    out = compute_amenity_metrics(
        buildings,
        isochrones,
        amenities_legacy=legacy,
        trees=empty,
        street_lights=empty,
        parks=empty,
        amenities_clean=empty,
    )

    row = out.iloc[0]
    assert int(row["amen_playground_5min"]) == 2
    assert int(row["num_amenities_5min"]) == 2
