from pathlib import Path
import geopandas as gpd
from shapely.geometry import Point
from stages.export_web import export_web, REQUIRED_BUILDING_SCORE_COLUMNS

def test_export_web_writes_buildings_once(monkeypatch, tmp_path):
    writes: list[str] = []
    out_name = "buildings_accessibility.geojson"
    monkeypatch.setattr("stages.export_web.DOCS_DATA_DIR", tmp_path)

    def capture_write(gdf, path, **kw):
        path = Path(path)
        writes.append(path.name)
        assert not any(
            c.startswith("amen_") and float(gdf[c].sum()) == 0
            for c in gdf.columns if c != gdf.geometry.name
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('{"type":"FeatureCollection","features":[]}', encoding="utf-8")

    # Patch both the export_web binding AND prevent helper from writing via utils
    monkeypatch.setattr("stages.export_web.write_minimal_geojson", capture_write)
    monkeypatch.setattr(
        "stages.export_web.export_buildings_web_layer",
        lambda gdf, out_path=None, **kw: gdf,  # prepare-only stub until helper is fixed
    )
    monkeypatch.setattr("stages.export_web.write_gzip_copy", lambda p: None)
    monkeypatch.setattr("stages.export_web.build_buildings_lookup", lambda *a, **k: {"status": "built"})
    monkeypatch.setattr("stages.export_web._sync_raw_layer_to_docs", lambda *a, **k: None)
    monkeypatch.setattr(
        "stages.export_web._resolve_amenities_legacy",
        lambda *a, **k: gpd.GeoDataFrame(geometry=[], crs="EPSG:4326"),
    )
    monkeypatch.setattr("stages.export_web._resolve_trees", lambda *a, **k: None)
    monkeypatch.setattr("stages.export_web._resolve_parks", lambda *a, **k: None)
    monkeypatch.setattr("stages.export_web.get_building_isochrones", lambda *a, **k: {})
    props = {c: [50.0] for c in REQUIRED_BUILDING_SCORE_COLUMNS}
    props["building_id"] = [0]
    props["amen_dead_10min"] = [0]
    gdf = gpd.GeoDataFrame(props, geometry=[Point(34.7, 31.2)], crs="EPSG:4326")
    monkeypatch.setattr(
        "stages.export_web.layer",
        lambda lid: type("L", (), {"path": tmp_path / out_name})(),
    )
    export_web(gdf)
    assert writes.count(out_name) == 1
    # After prepare-only lands, also assert core.geojson_utils.write_minimal_geojson
    # was not used for buildings (optional second assert via monkeypatch on that module).
