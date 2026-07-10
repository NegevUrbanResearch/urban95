import geopandas as gpd
from shapely.geometry import Point

from core.paths import (
    DOCS_DATA_DIR,
    LAYERS,
    RAW_DIR,
    SEED_MAP,
    layer,
    strip_building_metric_columns,
)


def test_required_raw_layers():
    assert layer("buildings").required and layer("amenities_clean").required and layer("shade_street").required


def test_seed_map_includes_bus_stops_and_buildings():
    dests = [str(d).replace("\\", "/") for d, _ in SEED_MAP]
    assert any(d.endswith("buildings.geojson.gz") for d in dests)
    assert any(d.endswith("bus_stops.geojson") for d in dests)


def test_strip_building_metric_columns_keeps_geometry_and_non_metrics():
    gdf = gpd.GeoDataFrame(
        {
            "building_id": [1],
            "score_urban95": [80.0],
            "amen_school_5min": [2],
            "num_trees": [5],
            "clean_name": ["x"],
            "summer_si": [0.4],
            "geometry": [Point(34.8, 31.2)],
        },
        crs="EPSG:4326",
    )
    out = strip_building_metric_columns(gdf)
    assert list(out.columns) == ["building_id", "geometry"]
    assert out.geometry.name == "geometry"
    assert out.iloc[0]["building_id"] == 1


def test_seed_map_parents_are_raw_and_docs_data():
    for dest, source in SEED_MAP:
        assert dest.parent == RAW_DIR
        assert source.parent == DOCS_DATA_DIR


def test_seed_map_matches_provisional_layer_paths():
    # Drift guard: every provisional layer path is a SEED_MAP dest, and vice versa.
    assert {p for p, _ in SEED_MAP} == {L.path for L in LAYERS.values() if L.provisional}


def test_layer_unknown_id_raises_clear_keyerror():
    try:
        layer("not_a_real_layer")
    except KeyError as exc:
        assert "not_a_real_layer" in str(exc)
    else:
        raise AssertionError("expected KeyError")
