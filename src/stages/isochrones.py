"""Mapbox walking isochrone fetch/cache and intermediate export."""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import geopandas as gpd
import requests
from dotenv import load_dotenv
from shapely.geometry import shape as shapely_shape
from tqdm.auto import tqdm

from core.geo_io import CRS_METRIC, WALK_MINUTES
from core.paths import OUTPUT_DIR, REPO_ROOT, layer
from lib.buildings_prep import load_raw_buildings

ISOCHRONE_CACHE_DIR = OUTPUT_DIR / "isochrone_cache"
ISOCHRONES_OUTPUT_PATH = layer("isochrones_intermediate").path
_DEFAULT_HIGH_WORKERS = max(16, min(64, (os.cpu_count() or 8) * 4))
ISOCHRONE_FETCH_WORKERS = max(1, int(os.getenv("ISOCHRONE_FETCH_WORKERS", _DEFAULT_HIGH_WORKERS)))

_thread_local = threading.local()


def _get_session() -> requests.Session:
    session = getattr(_thread_local, "session", None)
    if session is None:
        session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=ISOCHRONE_FETCH_WORKERS,
            pool_maxsize=ISOCHRONE_FETCH_WORKERS,
        )
        session.mount("https://", adapter)
        _thread_local.session = session
    return session


def load_mapbox_token() -> str:
    """Load the Mapbox access token from the .env file (isochrones stage only)."""
    load_dotenv(REPO_ROOT / ".env")
    token = os.getenv("mapbox_access_token")
    if not token:
        raise ValueError("mapbox_access_token not found in .env file")
    return token


def _load_valid_cached_isochrone_payload(cache_file: Path):
    if not cache_file.exists():
        return None
    try:
        with open(cache_file, encoding="utf-8") as handle:
            data = json.load(handle)
    except Exception:
        logging.warning("Invalid JSON cache file, deleting: %s", cache_file.name)
        cache_file.unlink(missing_ok=True)
        return None
    features = data.get("features")
    if not isinstance(features, list):
        logging.warning("Invalid isochrone cache payload, deleting: %s", cache_file.name)
        cache_file.unlink(missing_ok=True)
        return None
    return data


def _load_cached_isochrones_parallel(cache_keys: list[str]) -> dict[str, dict]:
    """Load valid cached isochrone FeatureCollections in parallel. Omits missing/invalid keys."""
    out: dict[str, dict] = {}
    if not cache_keys:
        return out

    def _load_one(key: str) -> tuple[str, dict | None]:
        cache_file = ISOCHRONE_CACHE_DIR / f"{key}.json"
        return key, _load_valid_cached_isochrone_payload(cache_file)

    workers = min(ISOCHRONE_FETCH_WORKERS, max(1, len(cache_keys)))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(_load_one, key) for key in cache_keys]
        for future in as_completed(futures):
            key, data = future.result()
            if data is not None:
                out[key] = data
    return out


def _payload_to_contour_polys(data: dict) -> dict:
    """Convert a Mapbox isochrone FeatureCollection payload to contour -> shapely geometry."""
    result = {}
    for feature in data.get("features", []):
        contour = feature["properties"]["contour"]
        result[contour] = shapely_shape(feature["geometry"])
    return result


def fetch_isochrones(lng: float, lat: float, token: str | None, minutes: list | None = None) -> dict:
    """Fetch walking isochrone polygons; cache hits skip the network entirely."""
    if minutes is None:
        minutes = WALK_MINUTES

    ISOCHRONE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_key = f"{lng:.5f}_{lat:.5f}"
    cache_file = ISOCHRONE_CACHE_DIR / f"{cache_key}.json"

    data = _load_valid_cached_isochrone_payload(cache_file)
    if data is None:
        if not token:
            raise ValueError(
                "Isochrone cache miss and no Mapbox token available "
                "(set mapbox_access_token in .env or warm the cache)"
            )
        contours = ",".join(str(m) for m in minutes)
        url = f"https://api.mapbox.com/isochrone/v1/mapbox/walking/{lng},{lat}"
        params = {
            "contours_minutes": contours,
            "polygons": "true",
            "access_token": token,
        }
        session = _get_session()

        resp = None
        for attempt in range(6):
            resp = session.get(url, params=params, timeout=(8, 25))
            if resp.status_code == 429:
                retry_after = resp.headers.get("Retry-After")
                if retry_after:
                    try:
                        wait = float(retry_after)
                    except ValueError:
                        wait = min(1.5 ** (attempt + 1), 12)
                else:
                    wait = min(1.5 ** (attempt + 1), 12)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            break
        else:
            if resp is not None:
                resp.raise_for_status()

        if not resp.text.strip():
            raise ValueError("Empty response from Mapbox API")

        data = resp.json()
        features = data.get("features")
        if not isinstance(features, list):
            message = data.get("message")
            if message:
                raise ValueError(f"Unexpected API response: {message}")
            raise ValueError(f"Unexpected API response: {list(data.keys())}")

        with open(cache_file, "w", encoding="utf-8") as handle:
            json.dump(data, handle)

    return _payload_to_contour_polys(data)


def _building_centroids_wgs84(buildings: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    centroids_metric = buildings.geometry.centroid
    return gpd.GeoDataFrame(
        {"building_id": buildings["building_id"]},
        geometry=centroids_metric,
        crs=f"EPSG:{CRS_METRIC}",
    ).to_crs(epsg=4326)


def _fetch_all_isochrones(
    centroids_wgs84: gpd.GeoDataFrame,
    *,
    token: str | None,
) -> dict[int, dict[int, object]]:
    """Return mapping building_id -> {minutes -> polygon in WGS84}."""
    total = len(centroids_wgs84)
    all_isochrones: dict[int, dict[int, object]] = {}
    failed_buildings: list[tuple[int, float, float, str]] = []
    ISOCHRONE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    cache_to_bids: dict[str, list[int]] = defaultdict(list)
    cache_to_coords: dict[str, tuple[float, float]] = {}
    for _, row in centroids_wgs84.iterrows():
        bid = int(row["building_id"])
        lng, lat = row.geometry.x, row.geometry.y
        cache_key = f"{lng:.5f}_{lat:.5f}"
        cache_to_bids[cache_key].append(bid)
        cache_to_coords[cache_key] = (lng, lat)

    present_keys = [
        cache_key
        for cache_key in cache_to_bids
        if (ISOCHRONE_CACHE_DIR / f"{cache_key}.json").exists()
    ]
    cached_payloads = _load_cached_isochrones_parallel(present_keys)
    for cache_key, data in cached_payloads.items():
        lng, lat = cache_to_coords[cache_key]
        bids = cache_to_bids[cache_key]
        try:
            polys = _payload_to_contour_polys(data)
            for bid in bids:
                all_isochrones[bid] = polys
        except Exception:
            for bid in bids:
                all_isochrones[bid] = {}
                failed_buildings.append((bid, lng, lat, cache_key))

    missing_keys = [
        (cache_key, cache_to_coords[cache_key][0], cache_to_coords[cache_key][1], bids)
        for cache_key, bids in cache_to_bids.items()
        if cache_key not in cached_payloads
    ]
    cached_count = sum(len(bids) for key, bids in cache_to_bids.items() if key in cached_payloads)
    api_needed = total - cached_count
    logging.info(
        "Fetching isochrones: %d buildings (%d cached, %d need API calls)...",
        total,
        cached_count,
        api_needed,
    )

    def _fetch_key_task(cache_key: str, lng: float, lat: float, bids_for_key: list[int]):
        try:
            polys = fetch_isochrones(lng, lat, token)
            return cache_key, polys, None, bids_for_key, lng, lat
        except Exception as exc:
            return cache_key, {}, exc, bids_for_key, lng, lat

    if missing_keys:
        logging.info(
            "Isochrone API key fetches: %d unique centroids across %d buildings using %d workers.",
            len(missing_keys),
            sum(len(bids) for _, _, _, bids in missing_keys),
            ISOCHRONE_FETCH_WORKERS,
        )
        with ThreadPoolExecutor(max_workers=ISOCHRONE_FETCH_WORKERS) as executor:
            futures = [
                executor.submit(_fetch_key_task, cache_key, lng, lat, bids)
                for cache_key, lng, lat, bids in missing_keys
            ]
            for future in tqdm(
                as_completed(futures),
                total=len(futures),
                desc="Isochrone API",
                unit="centroid",
            ):
                cache_key, polys, err, bids_for_key, lng, lat = future.result()
                if err is None:
                    for bid in bids_for_key:
                        all_isochrones[bid] = polys
                else:
                    for bid in bids_for_key:
                        all_isochrones[bid] = {}
                        failed_buildings.append((bid, lng, lat, cache_key))

    max_retries = 3
    for retry_round in range(max_retries):
        if not failed_buildings:
            break
        delay = 1.5 * (retry_round + 1)
        grouped_failed: dict[tuple[str, float, float], list[int]] = defaultdict(list)
        for bid, lng, lat, cache_key in failed_buildings:
            grouped_failed[(cache_key, lng, lat)].append(bid)

        logging.info(
            "Retry round %d/%d: %d failed key requests for %d buildings (%.1fs pre-delay)...",
            retry_round + 1,
            max_retries,
            len(grouped_failed),
            len(failed_buildings),
            delay,
        )
        time.sleep(delay)
        still_failed: list[tuple[int, float, float, str]] = []
        retry_items = [(k, lng, lat, bids) for (k, lng, lat), bids in grouped_failed.items()]
        with ThreadPoolExecutor(max_workers=ISOCHRONE_FETCH_WORKERS) as executor:
            futures = [
                executor.submit(_fetch_key_task, cache_key, lng, lat, bids)
                for cache_key, lng, lat, bids in retry_items
            ]
            for future in tqdm(
                as_completed(futures),
                total=len(futures),
                desc=f"Isochrone retry {retry_round + 1}",
                unit="centroid",
            ):
                cache_key, polys, err, bids_for_key, lng, lat = future.result()
                if err is None:
                    for bid in bids_for_key:
                        all_isochrones[bid] = polys
                else:
                    for bid in bids_for_key:
                        still_failed.append((bid, lng, lat, cache_key))

        recovered = len(failed_buildings) - len(still_failed)
        if recovered:
            logging.info("  Recovered %d buildings in round %d.", recovered, retry_round + 1)
        failed_buildings = still_failed

    if failed_buildings:
        logging.warning(
            "%d buildings still failed after %d retries (will have zero metrics).",
            len(failed_buildings),
            max_retries,
        )

    success_count = sum(1 for value in all_isochrones.values() if value)
    logging.info("Fetched isochrones for %d/%d buildings.", success_count, total)
    return all_isochrones


def _write_isochrones_geojson(all_isochrones: dict[int, dict[int, object]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    iso_features = []
    for bid, polys in all_isochrones.items():
        for mins, geom in polys.items():
            if geom is None or geom.is_empty:
                continue
            iso_features.append(
                {
                    "building_id": int(bid),
                    "minutes": int(mins),
                    "geometry": geom,
                }
            )
    if not iso_features:
        logging.warning("No isochrone polygons to write.")
        return
    iso_export = gpd.GeoDataFrame(iso_features, crs="EPSG:4326")
    iso_export.to_file(path, driver="GeoJSON")
    logging.info("Wrote %s (%d features)", path, len(iso_export))


def _warm_intermediate_isochrones_ok(path: Path, *, min_buildings: int) -> bool:
    """True when path is a usable warm intermediate matching current building count.

    Checks schema via a one-row peek, then requires a non-empty file whose unique
    ``building_id`` count is at least ``min_buildings``. On mismatch, returns False
    so the caller falls through to the normal cache/API path.
    """
    if not path.is_file() or path.stat().st_size <= 0:
        return False
    try:
        # Peek schema without loading the full intermediate twice when warm reuse wins.
        peek = gpd.read_file(path, rows=1)
    except Exception as exc:  # noqa: BLE001 — warm reuse must not crash on corrupt file
        logging.warning("Warm isochrones intermediate unreadable (%s): %s", path, exc)
        return False
    if peek.empty:
        return False
    missing = {"building_id", "minutes"} - set(peek.columns)
    if missing:
        logging.warning(
            "Warm isochrones intermediate missing columns %s: %s",
            sorted(missing),
            path,
        )
        return False
    try:
        ids = gpd.read_file(path, columns=["building_id"])
    except TypeError:
        # Older geopandas/fiona may not support columns=; fall back to full read.
        try:
            ids = gpd.read_file(path)
        except Exception as exc:  # noqa: BLE001
            logging.warning("Warm isochrones intermediate unreadable (%s): %s", path, exc)
            return False
    except Exception as exc:  # noqa: BLE001
        logging.warning("Warm isochrones intermediate unreadable (%s): %s", path, exc)
        return False
    if ids.empty or "building_id" not in ids.columns:
        return False
    n_unique = int(ids["building_id"].nunique())
    if n_unique < int(min_buildings):
        logging.warning(
            "Warm isochrones short-circuit skipped: unique building_id=%d < buildings=%d (%s)",
            n_unique,
            min_buildings,
            path,
        )
        return False
    return True


def run_isochrones() -> Path:
    """Write cache + output/isochrones/isochrones.geojson (building_id, minutes). Token only on cache miss."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    buildings = load_raw_buildings()
    # Reuse aggregated intermediate when it covers current buildings so a cold
    # per-centroid cache + missing .env does not force Mapbox.
    if _warm_intermediate_isochrones_ok(
        ISOCHRONES_OUTPUT_PATH, min_buildings=len(buildings)
    ):
        logging.info(
            "Warm isochrones short-circuit: reusing existing %s (skip fetch/API)",
            ISOCHRONES_OUTPUT_PATH,
        )
        return ISOCHRONES_OUTPUT_PATH

    centroids_wgs84 = _building_centroids_wgs84(buildings)

    cache_to_bids: dict[str, list[int]] = defaultdict(list)
    cache_to_coords: dict[str, tuple[float, float]] = {}
    for _, row in centroids_wgs84.iterrows():
        lng, lat = row.geometry.x, row.geometry.y
        cache_key = f"{lng:.5f}_{lat:.5f}"
        cache_to_bids[cache_key].append(int(row["building_id"]))
        cache_to_coords[cache_key] = (lng, lat)

    needs_api = any(
        not (ISOCHRONE_CACHE_DIR / f"{cache_key}.json").exists()
        for cache_key in cache_to_bids
    )
    token = load_mapbox_token() if needs_api else None

    all_isochrones = _fetch_all_isochrones(centroids_wgs84, token=token)
    _write_isochrones_geojson(all_isochrones, ISOCHRONES_OUTPUT_PATH)
    return ISOCHRONES_OUTPUT_PATH


def load_isochrones_gdf(path: Path | None = None) -> gpd.GeoDataFrame:
    """Load intermediate isochrones GeoJSON (building_id, minutes, geometry) in EPSG:4326."""
    src = path if path is not None else ISOCHRONES_OUTPUT_PATH
    if not src.is_file():
        raise FileNotFoundError(f"Isochrones intermediate not found: {src}")
    iso_gdf = gpd.read_file(src)
    if iso_gdf.crs is None:
        iso_gdf = iso_gdf.set_crs(epsg=4326)
    return iso_gdf.to_crs(epsg=4326)


def get_building_isochrones(buildings: gpd.GeoDataFrame) -> dict[int, dict[int, object]]:
    """Load isochrones for buildings from intermediate file or warm cache (no network)."""
    if ISOCHRONES_OUTPUT_PATH.is_file():
        iso_gdf = load_isochrones_gdf(ISOCHRONES_OUTPUT_PATH)
        result: dict[int, dict[int, object]] = defaultdict(dict)
        for _, row in iso_gdf.iterrows():
            bid = int(row["building_id"])
            mins = int(row["minutes"])
            result[bid][mins] = row.geometry
        return dict(result)

    centroids_wgs84 = _building_centroids_wgs84(buildings)
    return _fetch_all_isochrones(centroids_wgs84, token=None)
