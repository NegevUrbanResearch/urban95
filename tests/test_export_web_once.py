from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point

from core.geojson_utils import (
    _write_minimal_geojson_stream as real_write_minimal_geojson_stream,
    write_minimal_geojson as real_write_minimal_geojson,
)
from stages.export_web import export_web, REQUIRED_BUILDING_SCORE_COLUMNS


def test_export_web_writes_buildings_once(monkeypatch, tmp_path):
    writes: list[str] = []
    stream_calls: list[str] = []
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
        real_write_minimal_geojson(gdf, path, **kw)

    # Count stage writes while retaining the real serializer and observer callback.
    monkeypatch.setattr("stages.export_web.write_minimal_geojson", capture_write)

    def capture_stream(gdf, path, **kw):
        stream_calls.append(Path(path).name)
        return real_write_minimal_geojson_stream(gdf, path, **kw)

    monkeypatch.setattr("stages.export_web._write_minimal_geojson_stream", capture_stream)
    monkeypatch.setattr(
        "stages.export_web.export_buildings_web_layer",
        lambda gdf, out_path=None, **kw: gdf,  # keep building preparation out of this write-count test
    )
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
        lambda lid: type(
            "L",
            (),
            {
                "path": tmp_path
                / (
                    out_name
                    if lid == "publish_buildings"
                    else "buildings_lookup.json"
                )
            },
        )(),
    )
    export_web(gdf)
    assert len(stream_calls) == 1
    assert stream_calls[0] != out_name
