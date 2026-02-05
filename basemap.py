import geopandas as gpd
import folium
from folium import Element
import logging
import os

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def get_amenity_style(top_classi):
    """קובע את סגנון האייקון לפי סוג השירות"""
    val = str(top_classi).lower()
    mapping = {
        'healthcare': ('medkit', 'red'), 'education': ('graduation-cap', 'blue'),
        'commercial': ('shopping-cart', 'orange'), 'services': ('briefcase', 'gray'),
        'religious': ('place-of-worship', 'purple'), 'parks': ('tree', 'green'),
        'public': ('building', 'darkblue'), 'fitness': ('dumbbell', 'green'),
        'transportation': ('bus', 'black'), 'financial': ('bank', 'blue')
    }
    for k, style in mapping.items():
        if k in val: return style
    return 'info-sign', 'cadetblue'

def create_spatial_map(output_name='interactive_map.html'):
    # 1. Loading and Cleaning
    logging.info("Loading layers...")
    try:
        buildings = gpd.read_file('./*/buildings.geojson')
        trees = gpd.read_file('./*/sidewalks_and_trees.geojson')
        amenities = gpd.read_file('./*/amenities.geojson')
        parks = gpd.read_file('./*/parks_and_greenspaces.geojson')
        neighborhoods = gpd.read_file('./*/neighborhoods.geojson')
    except Exception as e:
        logging.error(f"Error loading files: {e}")
        return

    # Column Protection
    neigh_col = 'Name' if 'Name' in neighborhoods.columns else 'name'
    neighborhoods['neigh_id'] = neighborhoods[neigh_col]

    # 2. Metric Processing & Stats
    logging.info("Calculating spatial statistics...")
    b_metric = buildings.to_crs(epsg=2039)
    t_metric = trees.to_crs(epsg=2039)
    a_metric = amenities.to_crs(epsg=2039)
    n_metric = neighborhoods.to_crs(epsg=2039)

    b_metric['buffer_100m'] = b_metric.geometry.buffer(100)
    
    # חישובי הצטלבויות
    buildings['num_trees'] = gpd.sjoin(t_metric, b_metric.set_geometry('buffer_100m'), predicate='within').groupby('index_right').size().reindex(buildings.index, fill_value=0)
    buildings['num_amenities'] = gpd.sjoin(a_metric, b_metric.set_geometry('buffer_100m'), predicate='within').groupby('index_right').size().reindex(buildings.index, fill_value=0)
    buildings_with_neigh = gpd.sjoin(buildings, neighborhoods[['neigh_id', 'geometry']], how='left', predicate='within')

    # 4. Map Setup
    center = n_metric.to_crs(epsg=4326).geometry.unary_union.centroid
    m = folium.Map(location=[center.y, center.x], zoom_start=17, tiles='CartoDB positron')

    # 5. Neighborhood Bundles
    logging.info("Generating interactive neighborhood layers...")
    for name in neighborhoods['neigh_id'].unique():
        neigh_group = folium.FeatureGroup(name=f"Neighborhood: {name}", show=False)
        poly = neighborhoods[neighborhoods['neigh_id'] == name].geometry.iloc[0]

        local_buildings = buildings_with_neigh[buildings_with_neigh['neigh_id'] == name]
        local_trees = trees[trees.geometry.intersects(poly)]
        local_parks = parks[parks.geometry.intersects(poly)]
        local_amenities = amenities[amenities.geometry.intersects(poly.buffer(0.001))]

        # A. Trees
        for _, tree in local_trees.iterrows():
            geom = tree.geometry.centroid if tree.geometry.type != 'Point' else tree.geometry
            folium.CircleMarker(location=[geom.y, geom.x], radius=1.2, color='green', fill=True, fill_opacity=0.6, interactive=False).add_to(neigh_group)

        # B. Parks
        folium.GeoJson(local_parks, style_function=lambda x: {'fillColor': '#228B22', 'fillOpacity': 0.25, 'weight': 1, 'interactive': False}).add_to(neigh_group)

        # C. Buildings
        folium.GeoJson(
            local_buildings,
            style_function=lambda x: {'fillColor': '#454545', 'color': 'black', 'weight': 1, 'fillOpacity': 0.4},
            tooltip=folium.GeoJsonTooltip(
                fields=['num_trees', 'num_amenities'],
                aliases=['Trees (100m):', 'Amenities (100m):'],
                sticky=True
            )
        ).add_to(neigh_group)

        # D. Amenities
        for _, row in local_amenities.iterrows():
            geom = row.geometry.centroid if row.geometry.type != 'Point' else row.geometry
            icon_name, icon_color = get_amenity_style(row.get('top_classi', 'other'))
            folium.Marker(
                location=[geom.y, geom.x],
                icon=folium.Icon(color=icon_color, icon=icon_name, prefix='fa'),
                popup=folium.Popup(f"<b>Type:</b> {row.get('top_classi')}<br><b>Sub:</b> {row.get('subcategor', '')}", max_width=250)
            ).add_to(neigh_group)

        neigh_group.add_to(m)

    folium.LayerControl(collapsed=False).add_to(m)

    # 6. JavaScript UI
    map_id = m.get_name()
    slider_html = f"""
    <div id="ui-container" style="position: fixed; bottom: 30px; left: 30px; width: 180px; z-index: 9999;
         background: white; padding: 15px; border: 2px solid orange; border-radius: 12px; font-family: sans-serif; box-shadow: 2px 2px 10px rgba(0,0,0,0.2);">
        <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px;">Analysis Radius: <span id="r-val">100</span>m</div>
        <input id="r-slider" type="range" min="50" max="500" value="100" style="width: 100%;">
        <div style="font-size: 10px; color: gray; margin-top: 5px;">* Double-click to show radius</div>
    </div>
    """
    m.get_root().html.add_child(Element(slider_html))

    custom_js = f"""
        var radius = 100;
        var currentCircle = null;
        document.getElementById('r-slider').oninput = function() {{
            radius = parseInt(this.value);
            document.getElementById('r-val').innerText = radius;
        }};
        setTimeout(function() {{
            var mapObj = window['{map_id}'];
            mapObj.on('dblclick', function(e) {{
                if (currentCircle) {{ mapObj.removeLayer(currentCircle); }}
                currentCircle = L.circle(e.latlng, {{
                    radius: radius, color: '#FF8C00', fillColor: '#FFA500', fillOpacity: 0.25, dashArray: '8, 8', weight: 3, interactive: false
                }}).addTo(mapObj);
            }});
        }}, 2000);
    """
    m.get_root().script.add_child(Element(custom_js))

    # שמירה מקומית בתיקיית הסקריפט
    m.save(output_name)
    logging.info(f"Map successfully saved as {output_name} in {os.getcwd()}")

if __name__ == "__main__":
    create_spatial_map()