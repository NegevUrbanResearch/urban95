"""Preprocesses building-level accessibility data into neighborhood and citywide statistics.

Outputs:
  - docs/data/neighborhoods.geojson  (enriched with per-amenity averages and percentile ranks)
  - docs/data/citywide_stats.json    (aggregate statistics for dashboard)
"""

import json
import logging
import os
import warnings
from pathlib import Path

os.environ["PROJ_DEBUG"] = "OFF"
os.environ["PYPROJ_GLOBAL_CONTEXT"] = "ON"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

import geopandas as gpd
import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS_DATA_DIR = REPO_ROOT / "docs" / "data"

BUILDINGS_PATH = DOCS_DATA_DIR / "buildings_accessibility.geojson"
NEIGHBORHOODS_PATH = DOCS_DATA_DIR / "neighborhoods.geojson"
AMENITIES_PATH = DOCS_DATA_DIR / "amenities_all.geojson"
TREES_PATH = DOCS_DATA_DIR / "trees.geojson"

WALK_MINUTES = [5, 10, 15]

AMENITY_TYPES = [
    "healthcare", "education", "commercial", "services",
    "religious_institutions", "parks_and_recreation", "public_institutions",
    "fitness", "transportation", "financial_services", "tourism",
    "senior_services_and_living",
]


def load_geojson(path):
    with open(path) as f:
        return json.load(f)


def main():
    logging.info("Loading buildings...")
    buildings = gpd.read_file(BUILDINGS_PATH)
    logging.info("  %d buildings loaded", len(buildings))

    logging.info("Loading neighborhoods...")
    neighborhoods = gpd.read_file(NEIGHBORHOODS_PATH)
    logging.info("  %d neighborhoods loaded", len(neighborhoods))

    # Neighborhoods are in Web Mercator (EPSG:3857) but GeoJSON lacks CRS metadata
    hood_bounds = neighborhoods.total_bounds
    if hood_bounds[0] > 100000:
        logging.info("  Detected projected coordinates, setting CRS to EPSG:3857")
        neighborhoods = neighborhoods.set_crs(epsg=3857, allow_override=True)
        neighborhoods = neighborhoods.to_crs(epsg=4326)

    # Ensure same CRS
    if buildings.crs and neighborhoods.crs and buildings.crs != neighborhoods.crs:
        neighborhoods = neighborhoods.to_crs(buildings.crs)

    # Compute building centroids for spatial join (project to metric CRS for accuracy)
    buildings_projected = buildings.to_crs(epsg=2039)
    buildings["_centroid"] = buildings_projected.geometry.centroid.to_crs(epsg=4326)
    buildings_pts = buildings.set_geometry("_centroid")

    logging.info("Assigning buildings to neighborhoods...")
    joined = gpd.sjoin(buildings_pts, neighborhoods[["Name", "geometry"]], predicate="within", how="left")
    buildings["neighborhood"] = joined["Name"]
    unassigned = buildings["neighborhood"].isna().sum()
    logging.info("  %d buildings unassigned (outside all neighborhoods)", unassigned)

    # Determine which amenity columns actually exist in buildings
    existing_types = []
    for t in AMENITY_TYPES:
        col5 = f"amen_{t}_5min"
        if col5 in buildings.columns:
            existing_types.append(t)
    logging.info("  %d amenity types found in data", len(existing_types))

    # Build neighborhood stats
    neighborhood_stats = {}
    assigned = buildings[buildings["neighborhood"].notna()]

    for name, group in assigned.groupby("neighborhood"):
        stats = {"name": name, "building_count": len(group)}

        for minutes in WALK_MINUTES:
            sfx = f"_{minutes}min"

            amenity_col = f"num_amenities{sfx}"
            tree_col = f"num_trees{sfx}"
            a_vals = pd.to_numeric(group[amenity_col], errors="coerce").fillna(0)
            t_vals = pd.to_numeric(group[tree_col], errors="coerce").fillna(0)
            overall = a_vals + t_vals * 0.25

            stats[f"avg_overall{sfx}"] = round(float(overall.mean()), 2)
            stats[f"med_overall{sfx}"] = round(float(overall.median()), 2)
            stats[f"avg_amenities{sfx}"] = round(float(a_vals.mean()), 2)
            stats[f"avg_trees{sfx}"] = round(float(t_vals.mean()), 2)

            # Coverage: % of buildings with at least 1 amenity
            stats[f"coverage{sfx}"] = round(float((a_vals > 0).mean() * 100), 1)

            for t in existing_types:
                col = f"amen_{t}{sfx}"
                vals = pd.to_numeric(group[col], errors="coerce").fillna(0)
                stats[f"avg_{t}{sfx}"] = round(float(vals.mean()), 2)

        neighborhood_stats[name] = stats

    # Compute percentile rankings across neighborhoods for each metric
    logging.info("Computing percentile rankings...")
    for minutes in WALK_MINUTES:
        sfx = f"_{minutes}min"

        # Overall percentile
        vals = {n: s[f"avg_overall{sfx}"] for n, s in neighborhood_stats.items()}
        sorted_vals = sorted(vals.values())
        n_total = len(sorted_vals)
        for name, val in vals.items():
            rank = sum(1 for v in sorted_vals if v <= val)
            neighborhood_stats[name][f"pct_overall{sfx}"] = round(rank / n_total * 100)

        # Per-type percentiles
        for t in existing_types:
            key = f"avg_{t}{sfx}"
            vals = {n: s[key] for n, s in neighborhood_stats.items()}
            sorted_vals = sorted(vals.values())
            for name, val in vals.items():
                rank = sum(1 for v in sorted_vals if v <= val)
                neighborhood_stats[name][f"pct_{t}{sfx}"] = round(rank / n_total * 100)

        # Trees percentile
        vals = {n: s[f"avg_trees{sfx}"] for n, s in neighborhood_stats.items()}
        sorted_vals = sorted(vals.values())
        for name, val in vals.items():
            rank = sum(1 for v in sorted_vals if v <= val)
            neighborhood_stats[name][f"pct_trees{sfx}"] = round(rank / n_total * 100)

    # Enrich neighborhoods GeoJSON and write with WGS84 coordinates
    logging.info("Enriching neighborhoods GeoJSON...")
    from shapely.geometry import mapping as shapely_mapping

    enriched_features = []
    for _, row in neighborhoods.iterrows():
        name = row.get("Name", "")
        stats = neighborhood_stats.get(name, {})

        props = {"Name": name}
        for k, v in stats.items():
            if k != "name":
                props[k] = v

        geom = row.geometry
        if geom is None or geom.is_empty:
            continue

        geom_json = shapely_mapping(geom)
        # Round coordinates
        def round_coords(c, prec=5):
            if isinstance(c, (list, tuple)):
                if len(c) >= 2 and isinstance(c[0], (int, float)):
                    return [round(x, prec) for x in c]
                return [round_coords(x, prec) for x in c]
            return c
        geom_json["coordinates"] = round_coords(geom_json["coordinates"])

        enriched_features.append({
            "type": "Feature",
            "properties": props,
            "geometry": geom_json
        })

    enriched_geojson = {"type": "FeatureCollection", "features": enriched_features}
    with open(DOCS_DATA_DIR / "neighborhoods.geojson", "w") as f:
        json.dump(enriched_geojson, f, separators=(",", ":"), ensure_ascii=False)
    logging.info("  Wrote enriched neighborhoods.geojson (%d features)", len(enriched_features))

    # Citywide statistics
    logging.info("Computing citywide statistics...")
    citywide = {"total_buildings": len(buildings)}

    # Amenity counts from amenities file
    amenities_data = load_geojson(AMENITIES_PATH)
    type_counts = {}
    for feat in amenities_data["features"]:
        t = feat["properties"].get("amenity_type", "other")
        type_counts[t] = type_counts.get(t, 0) + 1
    citywide["amenity_counts"] = type_counts
    citywide["total_amenities"] = sum(type_counts.values())

    # Tree count
    trees_data = load_geojson(TREES_PATH)
    citywide["total_trees"] = len(trees_data["features"])

    # Per walking-time averages
    for minutes in WALK_MINUTES:
        sfx = f"_{minutes}min"
        a_col = f"num_amenities{sfx}"
        t_col = f"num_trees{sfx}"
        a_vals = pd.to_numeric(buildings[a_col], errors="coerce").fillna(0)
        t_vals = pd.to_numeric(buildings[t_col], errors="coerce").fillna(0)
        overall = a_vals + t_vals * 0.25

        citywide[f"avg_overall{sfx}"] = round(float(overall.mean()), 2)
        citywide[f"med_overall{sfx}"] = round(float(overall.median()), 2)
        citywide[f"avg_amenities{sfx}"] = round(float(a_vals.mean()), 2)
        citywide[f"avg_trees{sfx}"] = round(float(t_vals.mean()), 2)
        citywide[f"coverage{sfx}"] = round(float((a_vals > 0).mean() * 100), 1)

        # Distribution buckets for histogram (overall score)
        hist_counts, hist_edges = np.histogram(overall, bins=20)
        citywide[f"distribution{sfx}"] = {
            "counts": hist_counts.tolist(),
            "edges": [round(e, 1) for e in hist_edges.tolist()]
        }

        # Per-type averages
        for t in existing_types:
            col = f"amen_{t}{sfx}"
            vals = pd.to_numeric(buildings[col], errors="coerce").fillna(0)
            citywide[f"avg_{t}{sfx}"] = round(float(vals.mean()), 2)

    # Neighborhood ranking table (sorted by overall score, 10min)
    ranking = []
    for name, stats in sorted(neighborhood_stats.items(), key=lambda x: x[1].get("avg_overall_10min", 0), reverse=True):
        ranking.append({
            "name": name,
            "building_count": stats["building_count"],
            "avg_overall_5min": stats.get("avg_overall_5min", 0),
            "avg_overall_10min": stats.get("avg_overall_10min", 0),
            "avg_overall_15min": stats.get("avg_overall_15min", 0),
            "pct_overall_5min": stats.get("pct_overall_5min", 0),
            "pct_overall_10min": stats.get("pct_overall_10min", 0),
            "pct_overall_15min": stats.get("pct_overall_15min", 0),
            "coverage_10min": stats.get("coverage_10min", 0),
        })
    citywide["neighborhood_ranking"] = ranking

    # Per-type neighborhood comparison (top/bottom for each type at 10min)
    type_comparisons = {}
    for t in existing_types:
        key = f"avg_{t}_10min"
        sorted_hoods = sorted(neighborhood_stats.items(), key=lambda x: x[1].get(key, 0), reverse=True)
        type_comparisons[t] = {
            "best": [{"name": n, "avg": s[key]} for n, s in sorted_hoods[:5]],
            "worst": [{"name": n, "avg": s[key]} for n, s in sorted_hoods[-5:]],
            "citywide_avg": citywide.get(f"avg_{t}_10min", 0),
        }
    citywide["type_comparisons"] = type_comparisons

    with open(DOCS_DATA_DIR / "citywide_stats.json", "w") as f:
        json.dump(citywide, f, separators=(",", ":"), ensure_ascii=False)
    logging.info("  Wrote citywide_stats.json")

    logging.info("Done. Neighborhood and citywide stats generated.")


if __name__ == "__main__":
    main()
