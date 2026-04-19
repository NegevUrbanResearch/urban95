import argparse
import logging
import os
import time
from pathlib import Path

os.environ["PROJ_DEBUG"] = "OFF"
os.environ["PYPROJ_GLOBAL_CONTEXT"] = "ON"

import geopandas as gpd
import momepy
import networkx as nx
import numpy as np
import pandas as pd
from shapely.geometry import box


REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS_DATA_DIR = REPO_ROOT / "docs" / "data"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a citywide spatial syntax layer from roads."
    )
    parser.add_argument(
        "--roads-path",
        type=Path,
        default=DOCS_DATA_DIR / "roads.geojson",
        help="Input roads GeoJSON path.",
    )
    parser.add_argument(
        "--segments-out",
        type=Path,
        default=DOCS_DATA_DIR / "spatial_syntax_segments.geojson",
        help="Output segment-level spatial syntax GeoJSON.",
    )
    parser.add_argument(
        "--zones-out",
        type=Path,
        default=DOCS_DATA_DIR / "spatial_syntax_zones.geojson",
        help="Output grid-zone spatial syntax GeoJSON.",
    )
    parser.add_argument(
        "--target-epsg",
        type=int,
        default=2039,
        help="Projected CRS EPSG used for metric calculations.",
    )
    parser.add_argument(
        "--cell-size",
        type=float,
        default=250.0,
        help="Grid cell size in meters for the zone layer.",
    )
    parser.add_argument(
        "--betweenness-samples",
        type=int,
        default=300,
        help="Sample size (k) for approximate betweenness. Use 0 for exact.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for betweenness node sampling.",
    )
    parser.add_argument(
        "--keep-empty-zones",
        action="store_true",
        help="Keep grid cells without nearby street segments.",
    )
    return parser.parse_args()


def _percent_rank(values: pd.Series) -> pd.Series:
    if values.empty:
        return values
    return values.rank(pct=True, method="average") * 100.0


def _load_roads(roads_path: Path, target_epsg: int) -> gpd.GeoDataFrame:
    roads = gpd.read_file(roads_path)
    if roads.crs is None:
        roads = roads.set_crs(epsg=4326)
    roads = roads.to_crs(epsg=target_epsg)
    roads = roads[roads.geometry.notna() & ~roads.geometry.is_empty].copy()
    roads = roads[roads.geometry.geom_type.isin(["LineString", "MultiLineString"])].copy()
    roads = roads.explode(index_parts=False, ignore_index=True)
    roads = roads[roads.geometry.length > 0].copy()
    if roads.empty:
        raise ValueError("No usable road geometries were found in input layer.")
    return roads


def _build_primal_graph(roads: gpd.GeoDataFrame) -> nx.Graph:
    graph = momepy.gdf_to_nx(
        roads,
        approach="primal",
        multigraph=False,
        directed=False,
        length="mm_len",
    )
    if graph.number_of_nodes() == 0 or graph.number_of_edges() == 0:
        raise ValueError("Road graph is empty after conversion.")
    return graph


def _compute_node_centrality(
    graph: nx.Graph, betweenness_samples: int, seed: int
) -> tuple[dict, dict]:
    closeness = nx.closeness_centrality(graph, distance="mm_len", wf_improved=True)
    node_count = graph.number_of_nodes()

    if betweenness_samples and 0 < betweenness_samples < node_count:
        betweenness = nx.betweenness_centrality(
            graph,
            k=betweenness_samples,
            weight="mm_len",
            normalized=True,
            seed=seed,
        )
    else:
        betweenness = nx.betweenness_centrality(
            graph,
            weight="mm_len",
            normalized=True,
        )

    return closeness, betweenness


def _graph_to_segments(
    graph: nx.Graph, closeness: dict, betweenness: dict, crs
) -> gpd.GeoDataFrame:
    records = []
    for u, v, edge_data in graph.edges(data=True):
        geom = edge_data.get("geometry")
        if geom is None:
            continue

        row = {k: val for k, val in edge_data.items() if k != "geometry"}
        row["closeness_node_mean"] = (closeness.get(u, 0.0) + closeness.get(v, 0.0)) / 2.0
        row["betweenness_node_mean"] = (
            betweenness.get(u, 0.0) + betweenness.get(v, 0.0)
        ) / 2.0
        row["geometry"] = geom
        records.append(row)

    segments = gpd.GeoDataFrame(records, geometry="geometry", crs=crs)
    if segments.empty:
        raise ValueError("No edge geometries were exported from the road graph.")

    segments["syntax_closeness_pct"] = _percent_rank(segments["closeness_node_mean"])
    segments["syntax_betweenness_pct"] = _percent_rank(segments["betweenness_node_mean"])
    segments["score_syntax"] = (
        (segments["syntax_closeness_pct"] * 0.6)
        + (segments["syntax_betweenness_pct"] * 0.4)
    ).round(3)
    return segments


def _build_square_grid(bounds: tuple[float, float, float, float], cell_size: float, crs):
    minx, miny, maxx, maxy = bounds
    xs = np.arange(minx, maxx + cell_size, cell_size)
    ys = np.arange(miny, maxy + cell_size, cell_size)

    cells = []
    cell_id = 0
    for x in xs[:-1]:
        for y in ys[:-1]:
            cells.append({"cell_id": cell_id, "geometry": box(x, y, x + cell_size, y + cell_size)})
            cell_id += 1

    return gpd.GeoDataFrame(cells, geometry="geometry", crs=crs)


def _aggregate_segments_to_zones(
    segments: gpd.GeoDataFrame, cell_size: float, keep_empty_zones: bool
) -> gpd.GeoDataFrame:
    grid = _build_square_grid(segments.total_bounds, cell_size=cell_size, crs=segments.crs)
    segment_pts = segments[["score_syntax", "syntax_closeness_pct", "syntax_betweenness_pct"]].copy()
    segment_pts["geometry"] = segments.geometry.centroid
    segment_pts = gpd.GeoDataFrame(segment_pts, geometry="geometry", crs=segments.crs)

    joined = gpd.sjoin(
        segment_pts,
        grid[["cell_id", "geometry"]],
        how="left",
        predicate="within",
    )
    joined = joined.dropna(subset=["cell_id"]).copy()

    agg = (
        joined.groupby("cell_id")
        .agg(
            score_syntax=("score_syntax", "mean"),
            syntax_closeness_pct=("syntax_closeness_pct", "mean"),
            syntax_betweenness_pct=("syntax_betweenness_pct", "mean"),
            segment_count=("score_syntax", "size"),
        )
        .reset_index()
    )

    zones = grid.merge(agg, on="cell_id", how="left")
    if not keep_empty_zones:
        zones = zones[zones["segment_count"].fillna(0) > 0].copy()
    zones["score_syntax"] = zones["score_syntax"].round(3)
    zones["syntax_closeness_pct"] = zones["syntax_closeness_pct"].round(3)
    zones["syntax_betweenness_pct"] = zones["syntax_betweenness_pct"].round(3)
    return zones


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
    args = parse_args()
    t0 = time.time()

    if not args.roads_path.exists():
        raise FileNotFoundError(f"Road layer was not found: {args.roads_path}")

    logging.info("Loading roads from %s", args.roads_path)
    roads = _load_roads(args.roads_path, target_epsg=args.target_epsg)
    logging.info("Loaded %d road segments", len(roads))

    logging.info("Building primal street graph")
    graph = _build_primal_graph(roads)
    logging.info(
        "Graph has %d nodes and %d edges",
        graph.number_of_nodes(),
        graph.number_of_edges(),
    )

    logging.info("Computing node centrality metrics")
    closeness, betweenness = _compute_node_centrality(
        graph=graph,
        betweenness_samples=args.betweenness_samples,
        seed=args.seed,
    )

    logging.info("Converting graph centrality to segment scores")
    segments = _graph_to_segments(graph, closeness=closeness, betweenness=betweenness, crs=roads.crs)

    logging.info("Aggregating segment scores into %sm grid cells", int(args.cell_size))
    zones = _aggregate_segments_to_zones(
        segments=segments,
        cell_size=args.cell_size,
        keep_empty_zones=args.keep_empty_zones,
    )

    args.segments_out.parent.mkdir(parents=True, exist_ok=True)
    args.zones_out.parent.mkdir(parents=True, exist_ok=True)

    segments.to_crs(epsg=4326).to_file(args.segments_out, driver="GeoJSON")
    zones.to_crs(epsg=4326).to_file(args.zones_out, driver="GeoJSON")

    elapsed = time.time() - t0
    logging.info("Wrote segment layer to %s", args.segments_out)
    logging.info("Wrote zone layer to %s", args.zones_out)
    logging.info("Done in %.1f seconds", elapsed)


if __name__ == "__main__":
    main()
