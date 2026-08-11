"""Per-neighborhood Amenities Focus histograms with shared bin edges.

Publishes into ``neighborhood_charts.json`` as ``distributions_expanded``.

Histogram policy vs citywide (``stages/neighborhoods.py`` citywide_stats):
citywide score distributions use ``fillna(0)`` before ``np.histogram``. For
compare overlays we need edges that reflect actual score ranges, so this helper
**drops non-finite values** (``dropna`` / finite mask) when computing shared
edges and when counting per neighborhood. Zeros that appear in the data remain;
missing scores are not coerced to zero.
"""

from __future__ import annotations

import geopandas as gpd
import numpy as np
import pandas as pd

WALK_MINUTES = (5, 10, 15)
_MODES = (("distributions_expanded", "score_expanded"),)


def _finite_numeric(series: pd.Series) -> np.ndarray:
    vals = pd.to_numeric(series, errors="coerce")
    arr = vals.to_numpy(dtype=float, copy=False)
    return arr[np.isfinite(arr)]


def build_per_neighborhood_distributions(
    buildings: gpd.GeoDataFrame,
    *,
    neighborhood_col: str = "neighborhood",
    bins: int = 20,
) -> dict:
    """Build shared-edge per-neighborhood histograms for Amenities Focus scores.

    Returns::

        {
          "distributions_expanded": { ... },
        }

    Shared edges per (mode, minutes) come from all finite building values.
    Neighborhoods with zero finite buildings for a column are omitted for that
    minutes key.
    """
    out: dict = {"distributions_expanded": {}}
    if buildings is None or len(buildings) == 0 or neighborhood_col not in buildings.columns:
        return out

    for out_key, col_prefix in _MODES:
        mode_payload: dict = {}
        for minutes in WALK_MINUTES:
            col = f"{col_prefix}_{minutes}min"
            if col not in buildings.columns:
                continue
            minutes_key = f"{minutes}min"
            all_finite = _finite_numeric(buildings[col])
            if all_finite.size == 0:
                continue
            _counts, edges = np.histogram(all_finite, bins=bins)
            edges_list = [round(float(e), 2) for e in edges.tolist()]

            for name, grp in buildings.groupby(neighborhood_col, dropna=True):
                hood_finite = _finite_numeric(grp[col])
                if hood_finite.size == 0:
                    continue
                counts, _ = np.histogram(hood_finite, bins=edges)
                name_key = str(name)
                hood_entry = mode_payload.setdefault(name_key, {})
                hood_entry[minutes_key] = {
                    "counts": [int(c) for c in counts.tolist()],
                    "edges": list(edges_list),
                }
        out[out_key] = mode_payload
    return out
