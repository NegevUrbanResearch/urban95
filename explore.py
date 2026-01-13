import geopandas as gpd

gdf = gpd.read_file("data/buildings.geojson")
print(gdf.head())