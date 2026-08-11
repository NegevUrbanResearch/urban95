import gzip
import importlib.util
import json
import sys
from pathlib import Path

from lib import buildings_lookup


def load_pmtiles_script():
    script_path = Path(__file__).parents[1] / "scripts" / "build_buildings_pmtiles.py"
    spec = importlib.util.spec_from_file_location("urban95_build_buildings_pmtiles", script_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(spec.name, None)
        raise
    return module


def test_pmtiles_script_imports_and_writes_equivalent_gzip_json(tmp_path):
    pmtiles_script = load_pmtiles_script()
    payload = {"schema": 1, "features": [{"building_id": 7}]}
    output = tmp_path / "lookup.json"
    output.write_text(json.dumps(payload), encoding="utf-8")

    gzip_path = pmtiles_script.write_gzip_copy(output)

    assert pmtiles_script.write_gzip_copy is buildings_lookup.write_gzip_copy
    assert gzip_path == tmp_path / "lookup.json.gz"
    with gzip.open(gzip_path, "rb") as handle:
        compressed_payload = handle.read()
    assert compressed_payload == output.read_bytes()
    assert json.loads(compressed_payload) == payload


def test_point_record_preserves_amenity_subtype():
    point_record = load_pmtiles_script().point_record
    record = point_record(
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [34.8, 31.2]},
            "properties": {
                "amenity_type": "health",
                "amenity_subtype": "clinic",
                "name": "Clinic",
            },
        },
        "amenities_clean",
    )

    assert record["subtype"] == "clinic"
