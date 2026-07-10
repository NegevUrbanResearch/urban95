import json
from stages.isochrones import _load_cached_isochrones_parallel

def test_parallel_cache_reads_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr("stages.isochrones.ISOCHRONE_CACHE_DIR", tmp_path)
    key = "34.78000_31.25000"
    payload = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"contour": 5}, "geometry": {
            "type": "Polygon", "coordinates": [[[0,0],[1,0],[1,1],[0,0]]]
        }}
    ]}
    (tmp_path / f"{key}.json").write_text(json.dumps(payload), encoding="utf-8")
    out = _load_cached_isochrones_parallel([key])
    assert key in out
    assert out[key]["features"][0]["properties"]["contour"] == 5
