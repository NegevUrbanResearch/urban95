import geopandas as gpd
import os
from shapely.geometry import Point
from shapely.ops import unary_union

def filter_geojson_by_distance(neighborhoods_path, data_folder, output_folder, max_distance_km=10):
    """
    Filter all GeoJSON files to only include features within max_distance_km from neighborhoods.
    
    Args:
        neighborhoods_path: Path to the neighborhoods GeoJSON file
        data_folder: Path to the folder containing all GeoJSON files
        output_folder: Path to the output folder for filtered files
        max_distance_km: Maximum distance in kilometers (default: 10)
    """
    # Create output folder if it doesn't exist
    os.makedirs(output_folder, exist_ok=True)
    
    # Load neighborhoods and create a buffer
    print("Loading neighborhoods...")
    neighborhoods = gpd.read_file(neighborhoods_path)
    
    # Ensure we're working in a projected CRS for accurate distance calculations
    # EPSG:32636 is UTM Zone 36N, suitable for Israel
    neighborhoods_proj = neighborhoods.to_crs(epsg=32636)
    
    # Create a unified buffer around all neighborhoods
    max_distance_m = max_distance_km * 1000  # Convert km to meters
    neighborhoods_union = unary_union(neighborhoods_proj.geometry)
    buffer_zone = neighborhoods_union.buffer(max_distance_m)
    
    print(f"Created {max_distance_km}km buffer around neighborhoods")
    
    # Get all geojson files in the data folder (excluding neighborhoods itself)
    geojson_files = [f for f in os.listdir(data_folder) 
                     if f.endswith('.geojson') and f != 'neighborhoods.geojson']
    
    print(f"\nFound {len(geojson_files)} GeoJSON files to filter")
    
    # Process each file
    for filename in geojson_files:
        input_path = os.path.join(data_folder, filename)
        output_path = os.path.join(output_folder, filename)
        
        print(f"\nProcessing {filename}...")
        
        try:
            # Load the GeoJSON file
            gdf = gpd.read_file(input_path)
            original_count = len(gdf)
            
            # Project to the same CRS as neighborhoods
            gdf_proj = gdf.to_crs(epsg=32636)
            
            # Filter features that are within the buffer zone
            gdf_filtered = gdf_proj[gdf_proj.geometry.within(buffer_zone) | 
                                    gdf_proj.geometry.intersects(buffer_zone)]
            
            # Convert back to original CRS (WGS84)
            gdf_filtered = gdf_filtered.to_crs(epsg=4326)
            
            filtered_count = len(gdf_filtered)
            removed_count = original_count - filtered_count
            
            # Save the filtered data
            gdf_filtered.to_file(output_path, driver='GeoJSON')
            
            print(f"  Original features: {original_count}")
            print(f"  Filtered features: {filtered_count}")
            print(f"  Removed features: {removed_count} ({removed_count/original_count*100:.1f}%)")
            
        except Exception as e:
            print(f"  Error processing {filename}: {str(e)}")
    
    # Copy neighborhoods file to output folder
    neighborhoods_output = os.path.join(output_folder, 'neighborhoods.geojson')
    neighborhoods.to_file(neighborhoods_output, driver='GeoJSON')
    print(f"\nCopied neighborhoods.geojson to output folder")
    
    print(f"\n✓ All files filtered and saved to {output_folder}")

if __name__ == "__main__":
    # Define paths
    neighborhoods_path = "data/neighborhoods.geojson"
    data_folder = "data"
    output_folder = "filtered"
    
    # Run the filtering with 10km distance
    filter_geojson_by_distance(
        neighborhoods_path=neighborhoods_path,
        data_folder=data_folder,
        output_folder=output_folder,
        max_distance_km=10
    )
