from __future__ import annotations

import geopandas as gpd
from shapely.geometry import Point, box

from lib import buildings_prep
from lib.buildings_prep import EXCLUDED_NON_RESIDENTIAL_NEIGHBORHOODS, load_raw_buildings


def test_excluded_neighborhood_set_includes_industrial_areas() -> None:
    assert "אזור התעשייה" in EXCLUDED_NON_RESIDENTIAL_NEIGHBORHOODS
    assert "עמק שרה" in EXCLUDED_NON_RESIDENTIAL_NEIGHBORHOODS
    assert "אזור תעשייה קריית יהודית" in EXCLUDED_NON_RESIDENTIAL_NEIGHBORHOODS


def test_load_raw_buildings_excludes_industrial_neighborhoods(tmp_path, monkeypatch) -> None:
    buildings = gpd.GeoDataFrame(
        {
            "Used": ["מגורים", "מגורים", "מגורים", "מסחרי"],
            "geometry": [
                box(0, 0, 1, 1),
                box(10.2, 10.2, 10.4, 10.4),
                box(20.2, 20.2, 20.4, 20.4),
                box(10.2, 10.2, 10.3, 10.3),
            ],
        },
        crs="EPSG:2039",
    )
    # Non-contiguous index reproduces the historical sjoin alignment bug.
    buildings.index = [0, 10, 25, 40]

    neighborhoods = gpd.GeoDataFrame(
        {
            "Name": ["אזור התעשייה", "עמק שרה", "רמות"],
            "geometry": [
                box(10, 10, 11, 11),
                box(20, 20, 21, 21),
                box(100, 100, 101, 101),
            ],
        },
        crs="EPSG:2039",
    )

    buildings_path = tmp_path / "buildings.geojson.gz"
    neighborhoods_path = tmp_path / "neighborhoods.geojson"
    buildings_path.write_bytes(b"placeholder")
    neighborhoods_path.write_text("placeholder", encoding="utf-8")

    class _Layer:
        def __init__(self, path):
            self.path = path

    def fake_layer(layer_id: str):
        if layer_id == "buildings":
            return _Layer(buildings_path)
        if layer_id == "neighborhoods":
            return _Layer(neighborhoods_path)
        raise KeyError(layer_id)

    def fake_load_layer(path, target_crs=2039):
        if path == buildings_path:
            return buildings.copy()
        if path == neighborhoods_path:
            return neighborhoods.copy()
        raise FileNotFoundError(path)

    monkeypatch.setattr(buildings_prep, "layer", fake_layer)
    monkeypatch.setattr(buildings_prep, "load_layer", fake_load_layer)

    out = load_raw_buildings(crs_metric=2039)
    assert len(out) == 1
    assert list(out["building_id"]) == [0]
    assert out.geometry.centroid.iloc[0].equals(Point(0.5, 0.5))
