from lib import buildings_lookup

# The performance-artifact script still imports this legacy helper at module load.
# It is not exercised by this unit test.
if not hasattr(buildings_lookup, "write_gzip_copy"):
    buildings_lookup.write_gzip_copy = lambda _path: None

from scripts.build_buildings_pmtiles import point_record


def test_point_record_preserves_amenity_subtype():
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
