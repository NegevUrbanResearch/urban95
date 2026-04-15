"""Preprocesses building-level accessibility data into neighborhood and citywide statistics.

Outputs:
  - docs/data/neighborhoods.geojson  (enriched with per-amenity averages and percentile ranks)
  - docs/data/neighborhood_charts.json  (per-hood POI inventory: clean vs legacy taxonomy)
  - docs/data/citywide_stats.json    (aggregate statistics for dashboard)
"""

import json
import logging
import os
import re
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
AMENITIES_NEW_PATH = DOCS_DATA_DIR / "amenities_new.geojson"
AMENITIES_LEGACY_PATH = DOCS_DATA_DIR / "amenities_all.geojson"
TREES_PATH = DOCS_DATA_DIR / "trees.geojson"

WALK_MINUTES = [5, 10, 15]

EXCLUDED_CLEAN_MANIFEST_INVENTORY_TYPES = frozenset({"bicycle_track"})


def amenity_stat_keys_from_buildings(buildings: gpd.GeoDataFrame) -> list:
    """Reads amen_<key>_<5|10|15>min columns from buildings_accessibility (any taxonomy)."""
    keys = set()
    for col in buildings.columns:
        m = re.match(r"^amen_(.+)_(?:5|10|15)min$", str(col))
        if m:
            keys.add(m.group(1))
    return sorted(keys)


def amenity_type_counts_from_geojson(path: Path, exclude_types: frozenset | None = None) -> dict:
    exclude_types = exclude_types or frozenset()
    data = load_geojson(path)
    type_counts: dict = {}
    for feat in data.get("features") or []:
        t = (feat.get("properties") or {}).get("amenity_type", "other")
        if t in exclude_types:
            continue
        type_counts[t] = type_counts.get(t, 0) + 1
    return type_counts


def inventory_counts_per_neighborhood(
    hoods_wgs84: gpd.GeoDataFrame,
    points_path: Path,
    exclude_amenity_types: frozenset | None = None,
):
    """Point-in-polygon counts by amenity_type for each neighborhood Name."""
    if not points_path.is_file():
        return {}
    pts = gpd.read_file(points_path)
    if pts.crs is None:
        pts = pts.set_crs(epsg=4326)
    elif pts.crs != hoods_wgs84.crs:
        pts = pts.to_crs(hoods_wgs84.crs)
    if "amenity_type" not in pts.columns:
        return {}
    if exclude_amenity_types:
        pts = pts[~pts["amenity_type"].isin(exclude_amenity_types)]
        if len(pts) == 0:
            return {}
    h = hoods_wgs84[["Name", "geometry"]].copy().rename(columns={"Name": "hood_name"})
    j = gpd.sjoin(pts, h, predicate="within", how="inner")
    if len(j) == 0:
        return {}
    out = {}
    for name, grp in j.groupby("hood_name", dropna=True):
        vc = grp["amenity_type"].value_counts()
        out[str(name)] = {str(k): int(v) for k, v in vc.items()}
    return out


def percentile_ranks_across_hoods(values_by_name: dict) -> dict:
    """Percentile rank (0–100) of each neighborhood's value among all neighborhoods."""
    names = list(values_by_name.keys())
    vals = [values_by_name[n] for n in names]
    sorted_vals = sorted(vals)
    n_total = len(sorted_vals)
    if n_total == 0:
        return {}
    out = {}
    for n in names:
        val = values_by_name[n]
        rank = sum(1 for v in sorted_vals if v <= val)
        out[n] = round(rank / n_total * 100)
    return out


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

    existing_types = amenity_stat_keys_from_buildings(buildings)
    logging.info("  %d amenity stat keys in buildings: %s", len(existing_types), existing_types[:12])

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

            sc_col = f"score_clean{sfx}"
            if sc_col in group.columns:
                sc_vals = pd.to_numeric(group[sc_col], errors="coerce").fillna(0)
                stats[f"avg_score_clean{sfx}"] = round(float(sc_vals.mean()), 2)
                stats[f"coverage_clean{sfx}"] = round(float((sc_vals > 0).mean() * 100), 1)
            else:
                stats[f"avg_score_clean{sfx}"] = 0.0
                stats[f"coverage_clean{sfx}"] = 0.0

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

        # Filtered score: overall percentile across neighborhoods
        vals = {n: s.get(f"avg_score_clean{sfx}", 0) for n, s in neighborhood_stats.items()}
        sorted_vals = sorted(vals.values())
        n_total = len(sorted_vals)
        for name, val in vals.items():
            rank = sum(1 for v in sorted_vals if v <= val)
            neighborhood_stats[name][f"pct_clean_overall{sfx}"] = round(rank / n_total * 100) if n_total else 0

    # Point-in-polygon inventory (clean vs legacy taxonomy) for neighborhood/city pies
    logging.info("Computing per-neighborhood POI inventory (clean vs legacy)...")
    inv_clean = inventory_counts_per_neighborhood(
        neighborhoods, AMENITIES_NEW_PATH, exclude_amenity_types=EXCLUDED_CLEAN_MANIFEST_INVENTORY_TYPES
    )
    inv_legacy = inventory_counts_per_neighborhood(neighborhoods, AMENITIES_LEGACY_PATH)

    clean_types = set()
    for d in inv_clean.values():
        clean_types.update(d.keys())
    for t in sorted(clean_types):
        counts_by_hood = {n: inv_clean.get(n, {}).get(t, 0) for n in neighborhood_stats.keys()}
        pr = percentile_ranks_across_hoods(counts_by_hood)
        for name in neighborhood_stats:
            neighborhood_stats[name][f"pct_inv_clean_{t}"] = pr.get(name, 0)

    leg_types = set()
    for d in inv_legacy.values():
        leg_types.update(d.keys())
    for t in sorted(leg_types):
        counts_by_hood = {n: inv_legacy.get(n, {}).get(t, 0) for n in neighborhood_stats.keys()}
        pr = percentile_ranks_across_hoods(counts_by_hood)
        for name in neighborhood_stats:
            neighborhood_stats[name][f"pct_inv_legacy_{t}"] = pr.get(name, 0)

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

    charts_payload = {"inventory_clean": inv_clean, "inventory_legacy": inv_legacy}
    with open(DOCS_DATA_DIR / "neighborhood_charts.json", "w") as f:
        json.dump(charts_payload, f, separators=(",", ":"), ensure_ascii=False)
    logging.info("  Wrote neighborhood_charts.json")

    # Citywide statistics
    logging.info("Computing citywide statistics...")
    citywide = {"total_buildings": len(buildings)}

    # Pie chart: legacy POI inventory (same taxonomy as building amen_* / neighborhood breakdown).
    if AMENITIES_LEGACY_PATH.is_file():
        legacy_counts = amenity_type_counts_from_geojson(AMENITIES_LEGACY_PATH)
        citywide["amenity_counts"] = legacy_counts
        logging.info("  citywide amenity_counts: legacy file %s (%d types)", AMENITIES_LEGACY_PATH.name, len(legacy_counts))
    elif AMENITIES_NEW_PATH.is_file():
        fallback = amenity_type_counts_from_geojson(
            AMENITIES_NEW_PATH, exclude_types=EXCLUDED_CLEAN_MANIFEST_INVENTORY_TYPES
        )
        citywide["amenity_counts"] = fallback
        logging.info("  citywide amenity_counts: manifest only %s (no amenities_all)", AMENITIES_NEW_PATH.name)
    else:
        citywide["amenity_counts"] = {}

    if AMENITIES_NEW_PATH.is_file():
        citywide["amenity_counts_clean"] = amenity_type_counts_from_geojson(
            AMENITIES_NEW_PATH, exclude_types=EXCLUDED_CLEAN_MANIFEST_INVENTORY_TYPES
        )

    citywide["total_amenities"] = sum((citywide.get("amenity_counts") or {}).values())
    citywide["total_amenities_clean"] = sum((citywide.get("amenity_counts_clean") or {}).values())

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

        # Histograms: match building score modes (same columns as house-mode choropleth)
        sc_col = f"score_clean{sfx}"
        if sc_col in buildings.columns:
            clean_vals = pd.to_numeric(buildings[sc_col], errors="coerce").fillna(0)
            hc, he = np.histogram(clean_vals, bins=20)
            citywide[f"distribution_clean{sfx}"] = {
                "counts": hc.tolist(),
                "edges": [round(e, 2) for e in he.tolist()],
            }
        se_col = f"score_expanded{sfx}"
        if se_col in buildings.columns:
            exp_vals = pd.to_numeric(buildings[se_col], errors="coerce").fillna(0)
            hc, he = np.histogram(exp_vals, bins=20)
            citywide[f"distribution_expanded{sfx}"] = {
                "counts": hc.tolist(),
                "edges": [round(e, 2) for e in he.tolist()],
            }

        hist_counts, hist_edges = np.histogram(overall, bins=20)
        citywide[f"distribution{sfx}"] = {
            "counts": hist_counts.tolist(),
            "edges": [round(e, 1) for e in hist_edges.tolist()],
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

    ranking_clean = []
    for name, stats in sorted(
        neighborhood_stats.items(),
        key=lambda x: x[1].get("avg_score_clean_10min", 0),
        reverse=True,
    ):
        ranking_clean.append({
            "name": name,
            "building_count": stats["building_count"],
            "avg_score_clean_5min": stats.get("avg_score_clean_5min", 0),
            "avg_score_clean_10min": stats.get("avg_score_clean_10min", 0),
            "avg_score_clean_15min": stats.get("avg_score_clean_15min", 0),
            "pct_clean_overall_5min": stats.get("pct_clean_overall_5min", 0),
            "pct_clean_overall_10min": stats.get("pct_clean_overall_10min", 0),
            "pct_clean_overall_15min": stats.get("pct_clean_overall_15min", 0),
            "coverage_clean_10min": stats.get("coverage_clean_10min", 0),
        })
    citywide["neighborhood_ranking_clean"] = ranking_clean

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
