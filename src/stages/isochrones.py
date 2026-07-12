"""Mapbox walking isochrone fetch/cache and intermediate export."""
from __future__ import annotations

import json
import logging
import math
import os
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from numbers import Real
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
_request_counter_lock = threading.Lock()
mapbox_requests_attempted = 0


def _reset_mapbox_request_counter() -> None:
    global mapbox_requests_attempted
    with _request_counter_lock:
        mapbox_requests_attempted = 0


def get_mapbox_requests_attempted() -> int:
    """Return actual HTTP attempts; ``run_isochrones`` resets this per run."""
    with _request_counter_lock:
        return int(mapbox_requests_attempted)


def _increment_mapbox_requests(count: int = 1) -> int:
    global mapbox_requests_attempted
    with _request_counter_lock:
        mapbox_requests_attempted += int(count)
        return int(mapbox_requests_attempted)


def _abort_forbidden_mapbox_requests(required: int, *, terminal: bool = False) -> None:
    """Abort a guarded run before token loading, session creation, or network I/O."""
    required = int(required)
    if os.getenv("PIPELINE_FORBID_MAPBOX") != "1" or (
        required <= 0 and not terminal
    ):
        return
    logging.error(
        "Mapbox requests forbidden: mapbox_requests_required=%d "
        "mapbox_requests_attempted=%d",
        required,
        get_mapbox_requests_attempted(),
    )
    raise RuntimeError("Mapbox requests forbidden by PIPELINE_FORBID_MAPBOX=1")


def _cache_payload_valid_without_mutation(cache_file: Path) -> bool:
    """Read-only cache validation used only by the acceptance guard."""
    if not cache_file.is_file():
        return False
    try:
        with open(cache_file, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return False
    return isinstance(data, dict) and isinstance(data.get("features"), list)


def _guarded_requests_required(cache_keys) -> int:
    return sum(
        not _cache_payload_valid_without_mutation(
            ISOCHRONE_CACHE_DIR / f"{cache_key}.json"
        )
        for cache_key in cache_keys
    )


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
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        logging.warning("Invalid JSON cache file, deleting: %s", cache_file.name)
        cache_file.unlink(missing_ok=True)
        return None
    if not isinstance(data, dict):
        logging.warning(
            "Invalid isochrone cache payload, deleting: %s", cache_file.name
        )
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

    forbid_mapbox = os.getenv("PIPELINE_FORBID_MAPBOX") == "1"
    if not forbid_mapbox:
        ISOCHRONE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_key = f"{lng:.5f}_{lat:.5f}"
    cache_file = ISOCHRONE_CACHE_DIR / f"{cache_key}.json"
    if forbid_mapbox:
        _abort_forbidden_mapbox_requests(
            0 if _cache_payload_valid_without_mutation(cache_file) else 1
        )
        ISOCHRONE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

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
        _abort_forbidden_mapbox_requests(1)
        session = _get_session()

        resp = None
        for attempt in range(6):
            _increment_mapbox_requests()
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
    forbid_mapbox = os.getenv("PIPELINE_FORBID_MAPBOX") == "1"
    if not forbid_mapbox:
        ISOCHRONE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    cache_to_bids: dict[str, list[int]] = defaultdict(list)
    cache_to_coords: dict[str, tuple[float, float]] = {}
    for _, row in centroids_wgs84.iterrows():
        bid = int(row["building_id"])
        lng, lat = row.geometry.x, row.geometry.y
        cache_key = f"{lng:.5f}_{lat:.5f}"
        cache_to_bids[cache_key].append(bid)
        cache_to_coords[cache_key] = (lng, lat)

    if forbid_mapbox:
        _abort_forbidden_mapbox_requests(
            _guarded_requests_required(cache_to_bids)
        )
        ISOCHRONE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

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
    _abort_forbidden_mapbox_requests(len(missing_keys))

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


def _warm_intermediate_isochrones_ok(
    path: Path,
    *,
    min_buildings: int,
    expected_keys: set[tuple[int, int]] | None = None,
    guard_report: dict[str, int] | None = None,
) -> bool:
    """Return whether a warm intermediate covers the current building workload.

    Checks schema via a one-row peek. With ``expected_keys``, requires the exact
    set of normalized ``(building_id, minutes)`` pairs with no duplicates or
    invalid values; otherwise it requires at least ``min_buildings`` unique
    ``building_id`` values. On mismatch, returns False so the caller falls
    through to the normal cache/API path.
    """
    if expected_keys is not None and guard_report is not None:
        guard_report["required_requests"] = len(
            {building_id for building_id, _ in expected_keys}
        )
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
        columns = ["building_id", "minutes"] if expected_keys is not None else ["building_id"]
        ids = gpd.read_file(path, columns=columns)
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
    if expected_keys is not None:
        if "minutes" not in ids.columns:
            logging.warning("Warm isochrones intermediate missing minutes column: %s", path)
            return False
        observed_keys: list[tuple[int, int]] = []
        invalid_count = 0
        for building_id, minutes in zip(ids["building_id"], ids["minutes"]):
            try:
                normalized_values = []
                for value in (building_id, minutes):
                    if isinstance(value, bool) or not isinstance(value, Real):
                        raise ValueError("non-numeric key")
                    numeric = float(value)
                    if not math.isfinite(numeric) or not numeric.is_integer():
                        raise ValueError("non-integral key")
                    normalized_values.append(int(value))
                normalized = (normalized_values[0], normalized_values[1])
                observed_keys.append(normalized)
            except (TypeError, ValueError, OverflowError):
                invalid_count += 1
        observed_set = set(observed_keys)
        expected_set = set(expected_keys)
        if guard_report is not None:
            guard_report["required_requests"] = len(
                {
                    building_id
                    for building_id, _ in expected_set - observed_set
                }
            )
        if (
            invalid_count
            or len(observed_keys) != len(observed_set)
            or observed_set != expected_set
        ):
            logging.warning(
                "Warm isochrones key mismatch: missing=%d extra=%d duplicate=%d "
                "invalid=%d (%s)",
                len(expected_set - observed_set),
                len(observed_set - expected_set),
                len(observed_keys) - len(observed_set),
                invalid_count,
                path,
            )
            return False
        return True
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
    _reset_mapbox_request_counter()

    buildings = load_raw_buildings()
    forbid_mapbox = os.getenv("PIPELINE_FORBID_MAPBOX") == "1"
    expected_keys = None
    if forbid_mapbox:
        expected_keys = {
            (int(building_id), int(minutes))
            for building_id in buildings["building_id"]
            for minutes in WALK_MINUTES
        }
    guard_report: dict[str, int] = {}
    # Reuse aggregated intermediate when it covers current buildings so a cold
    # per-centroid cache + missing .env does not force Mapbox.
    if _warm_intermediate_isochrones_ok(
        ISOCHRONES_OUTPUT_PATH,
        min_buildings=len(buildings),
        expected_keys=expected_keys,
        guard_report=guard_report if forbid_mapbox else None,
    ):
        logging.info(
            "Warm isochrones short-circuit: reusing existing %s (skip fetch/API)",
            ISOCHRONES_OUTPUT_PATH,
        )
        logging.info("mapbox_requests_attempted=%d", get_mapbox_requests_attempted())
        return ISOCHRONES_OUTPUT_PATH
    if forbid_mapbox:
        _abort_forbidden_mapbox_requests(
            guard_report.get("required_requests", len(buildings)),
            terminal=True,
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
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
    if forbid_mapbox:
        _abort_forbidden_mapbox_requests(
            _guarded_requests_required(cache_to_bids)
        )
    token = load_mapbox_token() if needs_api else None

    all_isochrones = _fetch_all_isochrones(centroids_wgs84, token=token)
    _write_isochrones_geojson(all_isochrones, ISOCHRONES_OUTPUT_PATH)
    logging.info("mapbox_requests_attempted=%d", get_mapbox_requests_attempted())
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
