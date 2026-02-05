import os
from pathlib import Path

import geopandas as gpd
from shapely.ops import unary_union

REPO_ROOT = Path(__file__).resolve().parent.parent


def filter_geojson_by_distance(
    neighborhoods_path,
    data_folder,
    output_folder,
    max_distance_km=10,
):
    """Filter all GeoJSON files to only include features within max_distance_km from neighborhoods."""
    os.makedirs(output_folder, exist_ok=True)

    # Israeli Transverse Mercator (meters), same as preprocess_accessibility.py
    crs_metric = 2039
    print("Loading neighborhoods...")
    neighborhoods = gpd.read_file(neighborhoods_path)
    neighborhoods_proj = neighborhoods.to_crs(epsg=crs_metric)

    max_distance_m = max_distance_km * 1000
    neighborhoods_union = unary_union(neighborhoods_proj.geometry)
    buffer_zone = neighborhoods_union.buffer(max_distance_m)

    print(f"Created {max_distance_km}km buffer around neighborhoods")

    geojson_files = [
        f
        for f in os.listdir(data_folder)
        if f.endswith(".geojson") and f != "neighborhoods.geojson"
    ]
    print(f"\nFound {len(geojson_files)} GeoJSON files to filter")

    for filename in geojson_files:
        input_path = os.path.join(data_folder, filename)
        output_path = os.path.join(output_folder, filename)
        print(f"\nProcessing {filename}...")

        try:
            gdf = gpd.read_file(input_path)
            original_count = len(gdf)
            gdf_proj = gdf.to_crs(epsg=crs_metric)
            gdf_filtered = gdf_proj[
                gdf_proj.geometry.within(buffer_zone)
                | gdf_proj.geometry.intersects(buffer_zone)
            ]
            gdf_filtered = gdf_filtered.to_crs(epsg=4326)
            filtered_count = len(gdf_filtered)
            removed_count = original_count - filtered_count
            gdf_filtered.to_file(output_path, driver="GeoJSON")
            print(f"  Original features: {original_count}")
            print(f"  Filtered features: {filtered_count}")
            print(f"  Removed features: {removed_count} ({removed_count/original_count*100:.1f}%)")
        except Exception as e:
            print(f"  Error processing {filename}: {str(e)}")

    neighborhoods_output = os.path.join(output_folder, "neighborhoods.geojson")
    neighborhoods.to_file(neighborhoods_output, driver="GeoJSON")
    print("\nCopied neighborhoods.geojson to output folder")
    print(f"\n✓ All files filtered and saved to {output_folder}")


if __name__ == "__main__":
    filter_geojson_by_distance(
        neighborhoods_path=REPO_ROOT / "data" / "neighborhoods.geojson",
        data_folder=str(REPO_ROOT / "data"),
        output_folder=str(REPO_ROOT / "filtered"),
        max_distance_km=10,
    )
