#!/usr/bin/env python
"""
Interactive map generation script for Urban95 spatial data.
Creates an HTML map with all GeoJSON layers, optimized for file size.

NOTE: Before running this script, run convert_crs.py to convert all GeoJSON files
      to EPSG:4326 (WGS84). This ensures all data is in the same projection.
"""

from pathlib import Path
import geopandas as gpd
import folium
from folium import plugins
import numpy as np

# Configuration
DATA_DIR = Path("data")
OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

# Maximum features per layer to keep map size manageable
MAX_FEATURES_PER_LAYER = {
    'buildings': 5000,
    'roads': 10000,
    'sidewalks_and_trees': 10000,
    'amenities': 5000,
    'parks_and_greenspaces': 2000,
    'population': 3000,
    'neighborhoods': 100
}

# Simplification tolerance (in degrees, adjust based on CRS)
SIMPLIFY_TOLERANCE = {
    'buildings': 0.0001,
    'roads': 0.00005,
    'sidewalks_and_trees': 0.0001,
    'amenities': 0.0002,
    'parks_and_greenspaces': 0.0001,
    'population': 0.0002,
    'neighborhoods': 0.0001
}

# Color scheme for different layers
LAYER_COLORS = {
    'buildings': '#8B4513',
    'roads': '#696969',
    'sidewalks_and_trees': '#228B22',
    'amenities': '#FF4500',
    'parks_and_greenspaces': '#32CD32',
    'population': '#4169E1',
    'neighborhoods': '#FFD700'
}


def simplify_geometry(geom, tolerance):
    """Simplify geometry to reduce file size."""
    if geom is None or geom.is_empty:
        return geom
    try:
        simplified = geom.simplify(tolerance, preserve_topology=True)
        return simplified
    except:
        return geom


def load_and_prepare_geojson(filepath, layer_name):
    """Load GeoJSON and prepare it for visualization with size optimization."""
    print(f"Loading {layer_name}...")
    
    try:
        # For very large files, use chunking if possible
        file_size_mb = filepath.stat().st_size / (1024 * 1024)
        print(f"  File size: {file_size_mb:.2f} MB")
        
        # Try reading with different encodings for problematic files
        try:
            gdf = gpd.read_file(filepath)
        except UnicodeDecodeError:
            print(f"  Trying alternative encoding...")
            gdf = gpd.read_file(filepath, encoding='latin-1')
        
        # Get basic stats before processing
        original_count = len(gdf)
        print(f"  Original feature count: {original_count:,}")
        
        # Verify CRS is EPSG:4326 (data should be preprocessed)
        if gdf.crs is None:
            print(f"  Warning: No CRS found. Assuming EPSG:4326 (run convert_crs.py first)")
            gdf.set_crs('EPSG:4326', inplace=True)
        elif gdf.crs != 'EPSG:4326':
            print(f"  Warning: CRS is {gdf.crs}, expected EPSG:4326. Run convert_crs.py first to convert.")
            print(f"  Attempting conversion...")
            try:
                gdf = gdf.to_crs('EPSG:4326')
                print(f"  Converted to EPSG:4326")
            except Exception as e:
                print(f"  Error: CRS conversion failed: {e}")
                return None
        
        # Sample if too many features (do this early to save memory)
        max_features = MAX_FEATURES_PER_LAYER.get(layer_name, 5000)
        if len(gdf) > max_features:
            print(f"  Sampling to {max_features:,} features...")
            gdf = gdf.sample(n=max_features, random_state=42)
        
        # Simplify geometries
        tolerance = SIMPLIFY_TOLERANCE.get(layer_name, 0.0001)
        print(f"  Simplifying geometries (tolerance: {tolerance})...")
        gdf['geometry'] = gdf['geometry'].apply(
            lambda x: simplify_geometry(x, tolerance)
        )
        
        # Remove empty geometries
        gdf = gdf[~gdf.geometry.is_empty]
        
        print(f"  Final feature count: {len(gdf):,}")
        return gdf
        
    except Exception as e:
        print(f"  Error loading {layer_name}: {e}")
        import traceback
        traceback.print_exc()
        return None


def create_interactive_map():
    """Create an interactive HTML map with all layers."""
    print("="*60)
    print("CREATING INTERACTIVE MAP")
    print("="*60 + "\n")
    
    geojson_files = list(DATA_DIR.glob("*.geojson"))
    
    # Process all datasets and cache them
    processed_layers = {}
    all_bounds_wgs84 = []
    
    for filepath in geojson_files:
        layer_name = filepath.stem
        try:
            gdf = load_and_prepare_geojson(filepath, layer_name)
            if gdf is not None and len(gdf) > 0:
                processed_layers[layer_name] = gdf
                # Should already be in WGS84 from load_and_prepare_geojson
                bounds = gdf.total_bounds
                if bounds is not None and not np.isnan(bounds).any():
                    # Verify these are valid lat/lon
                    if -180 <= bounds[0] <= 180 and -90 <= bounds[1] <= 90:
                        all_bounds_wgs84.append(bounds)
        except Exception as e:
            print(f"  Error processing {layer_name}: {e}")
            pass
    
    # Calculate map center and bounds
    if all_bounds_wgs84:
        all_bounds_wgs84 = np.array(all_bounds_wgs84)
        min_lon = all_bounds_wgs84[:, 0].min()
        min_lat = all_bounds_wgs84[:, 1].min()
        max_lon = all_bounds_wgs84[:, 2].max()
        max_lat = all_bounds_wgs84[:, 3].max()
        
        center_lat = (min_lat + max_lat) / 2
        center_lon = (min_lon + max_lon) / 2
        
        print(f"\nMap bounds: [{min_lon:.6f}, {min_lat:.6f}, {max_lon:.6f}, {max_lat:.6f}]")
        print(f"Map center: [{center_lat:.6f}, {center_lon:.6f}]")
    else:
        # Default to Beer Sheva coordinates
        center_lat, center_lon = 31.25, 34.79
        min_lat, min_lon, max_lat, max_lon = 31.2, 34.7, 31.3, 34.9
        print(f"\nUsing default center: [{center_lat:.6f}, {center_lon:.6f}]")
    
    # Create base map
    m = folium.Map(
        location=[center_lat, center_lon],
        zoom_start=12,
        tiles='OpenStreetMap'
    )
    
    # Fit bounds if we have valid bounds
    if len(all_bounds_wgs84) > 0:
        m.fit_bounds([[min_lat, min_lon], [max_lat, max_lon]], padding=(20, 20))
    
    # Add tile layers
    folium.TileLayer('CartoDB positron', name='CartoDB Positron').add_to(m)
    folium.TileLayer('CartoDB dark_matter', name='CartoDB Dark').add_to(m)
    
    # Add each processed layer to the map
    layer_control_data = {}
    
    for layer_name, gdf in processed_layers.items():
        print(f"\nAdding {layer_name} to map...")
        
        color = LAYER_COLORS.get(layer_name, '#000000')
        
        # Create feature group for this layer
        fg = folium.FeatureGroup(name=layer_name.replace('_', ' ').title())
        
        # Add features based on geometry type
        if gdf.geometry.type.isin(['Point', 'MultiPoint']).any():
            points = gdf[gdf.geometry.type.isin(['Point', 'MultiPoint'])]
            for idx, row in points.iterrows():
                if row.geometry.geom_type == 'Point':
                    folium.CircleMarker(
                        location=[row.geometry.y, row.geometry.x],
                        radius=3,
                        popup=folium.Popup(str(row.drop('geometry').to_dict()), max_width=300),
                        color=color,
                        fill=True,
                        fillColor=color,
                        weight=1
                    ).add_to(fg)
        
        if gdf.geometry.type.isin(['LineString', 'MultiLineString']).any():
            lines = gdf[gdf.geometry.type.isin(['LineString', 'MultiLineString'])]
            # Sample if still too many
            if len(lines) > 5000:
                lines = lines.sample(n=5000, random_state=42)
            
            # Use GeoJson for better performance with many features
            if len(lines) > 100:
                # Convert to GeoJSON format for folium
                geojson_data = lines.to_json()
                folium.GeoJson(
                    geojson_data,
                    style_function=lambda feature: {
                        'color': color,
                        'weight': 1.5,
                        'opacity': 0.7
                    },
                    tooltip=folium.GeoJsonTooltip(fields=[c for c in lines.columns if c != 'geometry'][:5])
                ).add_to(fg)
            else:
                # For smaller datasets, add individual features
                for idx, row in lines.iterrows():
                    try:
                        if row.geometry.geom_type == 'LineString':
                            coords = [[lat, lon] for lon, lat in row.geometry.coords]
                        else:
                            coords = []
                            for line in row.geometry.geoms:
                                coords.extend([[lat, lon] for lon, lat in line.coords])
                        
                        folium.PolyLine(
                            coords,
                            popup=folium.Popup(str(row.drop('geometry').to_dict()), max_width=300),
                            color=color,
                            weight=1.5,
                            opacity=0.7
                        ).add_to(fg)
                    except:
                        pass
        
        if gdf.geometry.type.isin(['Polygon', 'MultiPolygon']).any():
            polygons = gdf[gdf.geometry.type.isin(['Polygon', 'MultiPolygon'])]
            # Sample if still too many
            if len(polygons) > 3000:
                polygons = polygons.sample(n=3000, random_state=42)
            
            # Use GeoJson for better performance with many features
            if len(polygons) > 100:
                # Convert to GeoJSON format for folium
                geojson_data = polygons.to_json()
                folium.GeoJson(
                    geojson_data,
                    style_function=lambda feature: {
                        'fillColor': color,
                        'color': color,
                        'weight': 1,
                        'fillOpacity': 0.3,
                        'opacity': 0.7
                    },
                    tooltip=folium.GeoJsonTooltip(fields=[c for c in polygons.columns if c != 'geometry'][:5])
                ).add_to(fg)
            else:
                # For smaller datasets, add individual features
                for idx, row in polygons.iterrows():
                    try:
                        if row.geometry.geom_type == 'Polygon':
                            coords = [[lat, lon] for lon, lat in row.geometry.exterior.coords]
                        else:
                            coords = []
                            for poly in row.geometry.geoms:
                                coords.extend([[lat, lon] for lon, lat in poly.exterior.coords])
                        
                        folium.Polygon(
                            coords,
                            popup=folium.Popup(str(row.drop('geometry').to_dict()), max_width=300),
                            color=color,
                            fill=True,
                            fillColor=color,
                            fillOpacity=0.3,
                            weight=1,
                            opacity=0.7
                        ).add_to(fg)
                    except:
                        pass
        
        fg.add_to(m)
        layer_control_data[layer_name] = len(gdf)
    
    # Add layer control
    folium.LayerControl(collapsed=False).add_to(m)
    
    # Add fullscreen button
    plugins.Fullscreen().add_to(m)
    
    # Add measure tool
    plugins.MeasureControl().add_to(m)
    
    # Save map
    map_file = OUTPUT_DIR / "map.html"
    m.save(str(map_file))
    
    file_size_mb = map_file.stat().st_size / (1024 * 1024)
    print(f"\n\nMap saved to {map_file}")
    print(f"Map file size: {file_size_mb:.2f} MB")
    
    if file_size_mb > 5:
        print("WARNING: Map file size exceeds 5 MB. Consider further simplification.")
    
    return map_file


def main():
    """Main function to generate map."""
    print("Urban95 Interactive Map Generator")
    print("="*60)
    
    # Create interactive map
    map_file = create_interactive_map()
    
    print("\n" + "="*60)
    print("MAP GENERATION COMPLETE")
    print("="*60)
    print(f"\nInteractive map: {map_file}")
    print("\nOpen the HTML file in a web browser to view the interactive map.")


if __name__ == "__main__":
    main()
