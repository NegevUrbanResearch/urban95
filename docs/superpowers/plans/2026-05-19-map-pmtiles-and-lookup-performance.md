# Map PMTiles And Lookup Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the static Urban95 map substantially faster by moving render-heavy geodata to PMTiles and replacing large startup/interaction GeoJSON scans with compact lookup artifacts where the app needs random access or analysis.

**Architecture:** Treat map rendering and app analysis as separate data contracts. PMTiles/vector sources power visible map layers; compact JSON indexes power building click lookup, score calculation, isochrone lookup, and point-in-polygon analysis without requiring the browser to eagerly parse every large GeoJSON as a render source. Keep the current static-site/CDN architecture, but introduce a tiny helper-file split so artifact detection, source factories, and runtime lookup loaders do not make `docs/app.js` denser before the later full modularization pass.

**Tech Stack:** Python 3, Dockerized Tippecanoe, Dockerized `protomaps/go-pmtiles`, MapLibre GL JS, PMTiles protocol, Turf.js, existing static `docs/` app.

**Hard Constraints From User**
- No commits.
- No git worktrees.
- No automated tests added or run as completion gates.
- Keep changes scoped to `scripts/build_buildings_pmtiles.py`, generated `docs/data/*` artifacts, two small helper scripts under `docs/`, `docs/index.html`, and the minimum necessary `docs/app.js` wiring.

---

## Perspective Ensemble Summary

### Panel A - Council
- **Performance architecture:** PMTiles should carry visual geodata, but not analytical lookup. Counter-move: generate tiles and indexes in one script so the split is explicit and repeatable.
- **Static-site simplicity:** Avoid adding a server, bundler, or module system. Counter-move: keep all runtime loading as relative `./data/*` fetches and MapLibre sources.
- **Incremental risk:** Replacing all layer logic at once can break score semantics. Counter-move: stage the rollout by contract: buildings index first, neighborhood surface render next, isochrones lookup next, then optional point-layer display/index.
- **Operational maintenance:** More artifacts can drift. Counter-move: one build command emits all derived PMTiles/index files and logs a manifest.

### Panel B - Adversarial
- **Attack target:** “Convert all relevant layers to PMTiles and fix lookup” can fail if PMTiles is mistaken for a query database.
- **Failure scenario:** The app stops fetching GeoJSON, but building selection, score filtering, or isochrone counts silently become incomplete because rendered vector tiles only contain visible/current-tile features.
- **Mitigation:** Never use `queryRenderedFeatures` as the authoritative lookup for building-by-id, isochrone-by-building, or all-points-in-polygon. Use explicit compact indexes for those contracts.
- **Early warnings:** Selection works only after zooming, counts vary by viewport, score colors do not match old GeoJSON mode, or `features.length` assumptions crash when data becomes an index object.

**Conditional recommendation:** Build a best-practice hybrid: PMTiles for visible surfaces/layers, compact JSON indexes for non-render logic. This is the performant static-map architecture without pretending tiles can replace arbitrary lookup.

---

## Current Evidence

Largest local artifacts in `docs/data/`:

- `shade.geojson`: ~48 MB
- `buildings_accessibility.pmtiles`: ~39 MB
- `isochrones.geojson`: ~35 MB, `.gz` ~5.2 MB
- `neighborhood_surface.geojson`: ~27 MB
- `spatial_syntax_segments.geojson`: ~10.7 MB
- `roads.geojson`: ~6.1 MB
- `trees.geojson`: ~5.8 MB, `.gz` ~296 KB
- `street_lights.geojson`: ~3.5 MB, `.gz` ~198 KB
- `amenities_all.geojson`: ~2.9 MB, `.gz` ~208 KB

Runtime behavior in `docs/app.js`:

- Buildings render from `buildings_accessibility.pmtiles`, but startup still fetches `buildings_accessibility.geojson(.gz)` for centroids, scores, and feature-state colors.
- `isochrones.geojson(.gz)` is background-loaded at startup and indexed in memory by `building_id + "_" + minutes`.
- `neighborhood_surface.geojson` is loaded as a MapLibre GeoJSON fill source and is a strong visual PMTiles candidate.
- Trees and street lights are lazy-loaded but still use full GeoJSON arrays for both rendering and point-in-polygon logic.

---

## File Structure

- Modify: `scripts/build_buildings_pmtiles.py`
  - Generalize from a single buildings converter into a multi-artifact build script.
  - Keep existing default command working.
  - Add layer definitions for PMTiles outputs.
  - Add compact JSON index generation for lookup-heavy app contracts.
  - Emit a manifest with file sizes and skipped/missing inputs.

- Create: `docs/dataArtifacts.js`
  - Own generated artifact availability checks.
  - Own PMTiles URL/source helpers.
  - Own data URL constants for generated lookup and PMTiles artifacts.
  - Export helpers by attaching one small namespace to `window` because the app has no bundler.

- Create: `docs/runtimeData.js`
  - Own lookup-first loaders and adapters for buildings, isochrones, and points.
  - Preserve GeoJSON fallback behavior.
  - Export helpers by attaching one small namespace to `window`.

- Modify: `docs/app.js`
  - Consume helper namespaces instead of embedding all artifact/source/loading logic inline.
  - Keep UI, mode switching, map layers, score display, and selection behavior in place.
  - Make only the wiring changes needed for PMTiles sources, lookup runtime data, and feature-state selection.

- Modify: `docs/index.html`
  - Load the generated artifact availability script and helper scripts before `docs/app.js`.

- Generated: `docs/data/pmtiles_manifest.js`
  - Synchronous runtime availability map consumed by `docs/app.js` before map construction.

- Generated: `docs/data/buildings_accessibility.pmtiles`
  - Existing render PMTiles for buildings.

- Generated: `docs/data/neighborhood_surface.pmtiles`
  - Vector-tiled neighborhood score surface.

- Generated: `docs/data/roads.pmtiles`
  - Vector-tiled roads, ready for current/future display.

- Generated: `docs/data/spatial_syntax_segments.pmtiles`
  - Vector-tiled spatial syntax segments, ready for current/future display.

- Generated: `docs/data/trees.pmtiles`
  - Optional display PMTiles for all-tree rendering at detail zoom.

- Generated: `docs/data/street_lights.pmtiles`
  - Optional display PMTiles for all-street-light rendering at detail zoom.

- Generated: `docs/data/buildings_lookup.json`
  - Compact building centroid and score/property index.

- Generated: `docs/data/isochrones_lookup.json`
  - Compact isochrone lookup by building id and minutes, still GeoJSON geometry but no full `FeatureCollection` wrapper scan.

- Generated: `docs/data/points_lookup.json`
  - Compact amenities/trees/street-lights coordinate/type/name index for point-in-polygon counting.

- Generated: `docs/data/pmtiles_manifest.json`
  - Build output manifest for operational sanity checks.

---

### Task 1: Generalize The PMTiles Build Script

**Files:**
- Modify: `scripts/build_buildings_pmtiles.py`

- [ ] **Step 1: Rename the script purpose in-place without changing the filename**

Keep the filename for compatibility, but update the top docstring to say it builds Urban95 map performance artifacts, not only buildings.

Use this docstring shape:

```python
"""
Build Urban95 static-map performance artifacts.

The script produces:
- PMTiles for render-heavy GeoJSON layers.
- Compact JSON lookup artifacts for app logic that needs random access or
  all-feature analysis.

The filename remains build_buildings_pmtiles.py for compatibility with the
existing project workflow.
"""
```

- [ ] **Step 2: Replace single default input/output constants with layer specs**

Add a `TileLayerSpec` dataclass near the constants:

```python
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class TileLayerSpec:
    name: str
    input_path: Path
    output_path: Path
    source_layer: str
    minzoom: int
    maxzoom: int
    geometry: str
    tippecanoe_flags: tuple[str, ...] = field(default_factory=tuple)
```

Define the initial layer list:

```python
DEFAULT_TILE_LAYERS = [
    TileLayerSpec(
        name="buildings",
        input_path=Path("docs/data/buildings_accessibility.geojson"),
        output_path=Path("docs/data/buildings_accessibility.pmtiles"),
        source_layer="buildings",
        minzoom=10,
        maxzoom=18,
        geometry="polygon",
        tippecanoe_flags=("--no-line-simplification", "--detect-shared-borders"),
    ),
    TileLayerSpec(
        name="neighborhood_surface",
        input_path=Path("docs/data/neighborhood_surface.geojson"),
        output_path=Path("docs/data/neighborhood_surface.pmtiles"),
        source_layer="neighborhood_surface",
        minzoom=10,
        maxzoom=18,
        geometry="polygon",
        tippecanoe_flags=("--detect-shared-borders",),
    ),
    TileLayerSpec(
        name="roads",
        input_path=Path("docs/data/roads.geojson"),
        output_path=Path("docs/data/roads.pmtiles"),
        source_layer="roads",
        minzoom=10,
        maxzoom=18,
        geometry="line",
    ),
    TileLayerSpec(
        name="spatial_syntax_segments",
        input_path=Path("docs/data/spatial_syntax_segments.geojson"),
        output_path=Path("docs/data/spatial_syntax_segments.pmtiles"),
        source_layer="spatial_syntax_segments",
        minzoom=10,
        maxzoom=18,
        geometry="line",
    ),
    TileLayerSpec(
        name="trees",
        input_path=Path("docs/data/trees.geojson"),
        output_path=Path("docs/data/trees.pmtiles"),
        source_layer="trees",
        minzoom=13,
        maxzoom=18,
        geometry="point",
    ),
    TileLayerSpec(
        name="street_lights",
        input_path=Path("docs/data/street_lights.geojson"),
        output_path=Path("docs/data/street_lights.pmtiles"),
        source_layer="street_lights",
        minzoom=13,
        maxzoom=18,
        geometry="point",
    ),
]
```

- [ ] **Step 3: Replace `run_tippecanoe_buildings` with a generic function**

Change the function signature to:

```python
def run_tippecanoe_layer(spec: TileLayerSpec, output_mbtiles: Path) -> bool:
```

Build the command using `spec`:

```python
docker_cmd = [
    "docker",
    "run",
    "--rm",
    "-v",
    f"{to_docker_path(temp_dir)}:/work",
    TIPPECANOE_IMAGE,
    "tippecanoe",
    "-o",
    f"/work/{SAFE_OUTPUT_MB}",
    f"/work/{SAFE_INPUT_NAME}",
    f"--layer={spec.source_layer}",
    "--force",
    f"--minimum-zoom={spec.minzoom}",
    f"--maximum-zoom={spec.maxzoom}",
    "--drop-densest-as-needed",
    "--quiet",
    *spec.tippecanoe_flags,
]
```

Do not apply `--no-feature-limit` or `--no-tile-size-limit` globally. Those flags can create oversized viewport tiles and reintroduce render jank. Add them only through a layer-specific `tippecanoe_flags` value after inspecting tile sizes and confirming the layer requires lossless tiling.

- [ ] **Step 4: Preserve single-layer compatibility**

Update CLI options:

```python
parser.add_argument("--layer", choices=[spec.name for spec in DEFAULT_TILE_LAYERS] + ["all"], default="buildings")
parser.add_argument("--all", action="store_true", help="Build all configured PMTiles and lookup artifacts.")
parser.add_argument("--skip-lookups", action="store_true", help="Only build PMTiles.")
parser.add_argument("--input", type=Path, default=None, help="Override input path for single-layer mode.")
parser.add_argument("--output", type=Path, default=None, help="Override output PMTiles path for single-layer mode.")
```

Behavior:
- `python scripts/build_buildings_pmtiles.py` builds only buildings PMTiles, matching current intent.
- `python scripts/build_buildings_pmtiles.py --all` builds all configured PMTiles and lookup artifacts.
- `python scripts/build_buildings_pmtiles.py --layer neighborhood_surface` builds only that PMTiles.
- `--input/--output` are valid only when building one layer.

- [ ] **Step 5: Add PMTiles manifest writing**

Add:

```python
def write_manifest(entries: list[dict[str, Any]], manifest_path: Path) -> None:
    existing_entries: list[dict[str, Any]] = []
    if manifest_path.exists():
        try:
            existing = json.loads(manifest_path.read_text(encoding="utf-8"))
            existing_entries = existing.get("entries", []) if isinstance(existing.get("entries"), list) else []
        except Exception:
            existing_entries = []

    merged = {entry.get("name"): entry for entry in existing_entries if entry.get("name")}
    for entry in entries:
        merged[entry.get("name")] = entry

    payload = {
        "generated_by": "scripts/build_buildings_pmtiles.py",
        "entries": list(merged.values()),
    }
    manifest_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    available = {
        entry["name"]: {
            "status": entry.get("status"),
            "output": entry.get("output"),
            "source_layer": entry.get("source_layer"),
        }
        for entry in payload["entries"]
        if entry.get("status") == "built"
    }
    js_path = manifest_path.with_suffix(".js")
    js_payload = "window.URBAN95_GENERATED_ARTIFACTS = " + json.dumps(available, ensure_ascii=False, indent=2) + ";\n"
    js_path.write_text(js_payload, encoding="utf-8")
```

Manifest entries should include:

```python
{
    "name": spec.name,
    "input": str(spec.input_path),
    "output": str(spec.output_path),
    "source_layer": spec.source_layer,
    "status": "built" | "skipped_missing_input" | "failed",
    "bytes": output_path.stat().st_size if output_path.exists() else 0,
}
```

- [ ] **Step 6: Add orchestration helpers and wire them into `main()`**

Add these helpers:

```python
def selected_tile_specs(args: argparse.Namespace) -> list[TileLayerSpec]:
    by_name = {spec.name: spec for spec in DEFAULT_TILE_LAYERS}
    if args.all or args.layer == "all":
        return DEFAULT_TILE_LAYERS

    spec = by_name[args.layer]
    if args.input is not None or args.output is not None:
        spec = TileLayerSpec(
            name=spec.name,
            input_path=args.input or spec.input_path,
            output_path=args.output or spec.output_path,
            source_layer=spec.source_layer,
            minzoom=spec.minzoom,
            maxzoom=spec.maxzoom,
            geometry=spec.geometry,
            tippecanoe_flags=spec.tippecanoe_flags,
        )
    return [spec]


def build_tile_layer(spec: TileLayerSpec) -> dict[str, Any]:
    input_path = spec.input_path.resolve()
    output_path = spec.output_path.resolve()
    if not input_path.is_file():
        logger.warning("Skipping %s; missing input %s", spec.name, input_path)
        return {
            "name": spec.name,
            "input": str(spec.input_path),
            "output": str(spec.output_path),
            "source_layer": spec.source_layer,
            "status": "skipped_missing_input",
            "bytes": 0,
        }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_mb = output_path.with_suffix(".mbtiles")
    logger.info("Building %s: %s -> %s", spec.name, input_path, output_path)
    if not run_tippecanoe_layer(spec, temp_mb):
        return {
            "name": spec.name,
            "input": str(spec.input_path),
            "output": str(spec.output_path),
            "source_layer": spec.source_layer,
            "status": "failed",
            "bytes": 0,
        }

    ok = convert_mbtiles_to_pmtiles(temp_mb, output_path)
    if temp_mb.exists():
        temp_mb.unlink()

    return {
        "name": spec.name,
        "input": str(spec.input_path),
        "output": str(spec.output_path),
        "source_layer": spec.source_layer,
        "status": "built" if ok else "failed",
        "bytes": output_path.stat().st_size if ok and output_path.exists() else 0,
    }
```

Replace the current `main()` body after logging setup with:

```python
entries: list[dict[str, Any]] = []
for spec in selected_tile_specs(args):
    entries.append(build_tile_layer(spec))

if (args.all or args.layer == "all") and not args.skip_lookups:
    entries.append(build_buildings_lookup(Path("docs/data/buildings_accessibility.geojson"), Path("docs/data/buildings_lookup.json")))
    entries.append(build_isochrones_lookup(Path("docs/data/isochrones.geojson"), Path("docs/data/isochrones_lookup.json")))
    entries.append(build_points_lookup(Path("docs/data/points_lookup.json")))

manifest_path = Path("docs/data/pmtiles_manifest.json")
write_manifest(entries, manifest_path)
logger.info("Wrote %s", manifest_path)
return 1 if any(entry.get("status") == "failed" for entry in entries) else 0
```

- [ ] **Step 7: Manual verification command**

Run:

```bash
python scripts/build_buildings_pmtiles.py --help
```

Expected:
- Command exits `0`.
- Help mentions `--layer`, `--all`, `--skip-lookups`, `--input`, and `--output`.

---

### Task 2: Generate Compact Building Lookup

**Files:**
- Modify: `scripts/build_buildings_pmtiles.py`
- Generated: `docs/data/buildings_lookup.json`

- [ ] **Step 1: Add GeoJSON loading helper**

```python
def load_feature_collection(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        raise ValueError(f"Expected FeatureCollection: {path}")
    return data
```

- [ ] **Step 2: Add centroid fallback helper**

Use stored centroid fields first, then a simple coordinate average fallback for polygons:

```python
def extract_centroid(feature: dict[str, Any]) -> tuple[float | None, float | None]:
    props = feature.get("properties") or {}
    lng = props.get("centroid_lng")
    lat = props.get("centroid_lat")
    if isinstance(lng, (int, float)) and isinstance(lat, (int, float)):
        return float(lng), float(lat)

    coords = []

    def collect(value: Any) -> None:
        if (
            isinstance(value, list)
            and len(value) >= 2
            and isinstance(value[0], (int, float))
            and isinstance(value[1], (int, float))
        ):
            coords.append((float(value[0]), float(value[1])))
            return
        if isinstance(value, list):
            for child in value:
                collect(child)

    geom = feature.get("geometry") or {}
    collect(geom.get("coordinates"))
    if not coords:
        return None, None
    return sum(x for x, _ in coords) / len(coords), sum(y for _, y in coords) / len(coords)
```

- [ ] **Step 3: Add building property slimming helper**

Keep only fields used by `docs/app.js`: building id, centroid, score columns, count columns, neighborhood/name fields, and any field currently referenced by details panels.

```python
BUILDING_LOOKUP_PREFIXES = (
    "score_",
    "num_",
    "clean_",
    "amen_",
    "avg_",
)

BUILDING_LOOKUP_EXACT_FIELDS = {
    "building_id",
    "centroid_lng",
    "centroid_lat",
    "neighborhood",
    "neighborhood_name",
    "Name",
    "name",
}


def slim_building_properties(props: dict[str, Any]) -> dict[str, Any]:
    slim: dict[str, Any] = {}
    for key, value in props.items():
        if key in BUILDING_LOOKUP_EXACT_FIELDS or key.startswith(BUILDING_LOOKUP_PREFIXES):
            slim[key] = value
    return slim
```

- [ ] **Step 4: Add gzip helper for lookup artifacts**

Add this helper before any lookup builder:

```python
def write_gzip_copy(path: Path) -> Path | None:
    if not path.exists():
        return None

    import gzip

    gz_path = path.with_suffix(path.suffix + ".gz")
    with path.open("rb") as src, gzip.open(gz_path, "wb", compresslevel=9) as dst:
        shutil.copyfileobj(src, dst)
    return gz_path
```

- [ ] **Step 5: Add builder**

```python
def build_buildings_lookup(input_path: Path, output_path: Path) -> dict[str, Any]:
    fc = load_feature_collection(input_path)
    features = []
    for feature in fc["features"]:
        props = feature.get("properties") or {}
        building_id = props.get("building_id")
        lng, lat = extract_centroid(feature)
        if building_id is None or lng is None or lat is None:
            continue
        slim = slim_building_properties(props)
        slim["building_id"] = building_id
        slim["centroid_lng"] = lng
        slim["centroid_lat"] = lat
        features.append(slim)

    payload = {
        "schema": 1,
        "features": features,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    gz_path = write_gzip_copy(output_path)
    return {
        "name": "buildings_lookup",
        "output": str(output_path),
        "status": "built",
        "records": len(features),
        "bytes": output_path.stat().st_size,
        "gzip_bytes": gz_path.stat().st_size if gz_path and gz_path.exists() else 0,
    }
```

- [ ] **Step 6: Manual verification command**

Run:

```bash
python scripts/build_buildings_pmtiles.py --all
```

Expected:
- `docs/data/buildings_lookup.json` exists.
- Manifest entry for `buildings_lookup` has `status: built`.
- File is materially smaller than `docs/data/buildings_accessibility.geojson.gz` when possible, and much smaller than raw GeoJSON.

---

### Task 3: Generate Isochrone Lookup Without Eager FeatureCollection Scans

**Files:**
- Modify: `scripts/build_buildings_pmtiles.py`
- Generated: `docs/data/isochrones_lookup.json`

- [ ] **Step 1: Add isochrone lookup builder**

```python
def build_isochrones_lookup(input_path: Path, output_path: Path) -> dict[str, Any]:
    if not input_path.exists():
        return {"name": "isochrones_lookup", "output": str(output_path), "status": "skipped_missing_input", "records": 0, "bytes": 0}

    fc = load_feature_collection(input_path)
    by_building: dict[str, dict[str, Any]] = {}
    records = 0

    for feature in fc["features"]:
        props = feature.get("properties") or {}
        building_id = props.get("building_id")
        minutes = props.get("minutes")
        geometry = feature.get("geometry")
        if building_id is None or minutes is None or not geometry:
            continue
        bid = str(building_id)
        minute_key = str(int(minutes)) if isinstance(minutes, (int, float)) else str(minutes)
        by_building.setdefault(bid, {})[minute_key] = geometry
        records += 1

    payload = {
        "schema": 1,
        "by_building": by_building,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    gz_path = write_gzip_copy(output_path)
    return {
        "name": "isochrones_lookup",
        "output": str(output_path),
        "status": "built",
        "records": records,
        "bytes": output_path.stat().st_size,
        "gzip_bytes": gz_path.stat().st_size if gz_path and gz_path.exists() else 0,
    }
```

- [ ] **Step 2: Keep old isochrone GeoJSON as fallback**

Do not delete or stop generating `docs/data/isochrones.geojson`. The app fallback in Task 7 will use it when `isochrones_lookup.json` is missing.

- [ ] **Step 3: Manual verification command**

Run:

```bash
python scripts/build_buildings_pmtiles.py --all
```

Expected:
- `docs/data/isochrones_lookup.json` exists when `docs/data/isochrones.geojson` exists.
- Its top-level keys are `schema` and `by_building`.
- No PMTiles is generated for isochrones in this task because isochrones are lookup-first in the current app.

---

### Task 4: Generate Point Lookup For Amenities, Trees, And Street Lights

**Files:**
- Modify: `scripts/build_buildings_pmtiles.py`
- Generated: `docs/data/points_lookup.json`

- [ ] **Step 1: Add point extraction helper**

```python
def point_record(feature: dict[str, Any], source: str, fallback_type: str | None = None) -> dict[str, Any] | None:
    geom = feature.get("geometry") or {}
    coords = geom.get("coordinates")
    if geom.get("type") != "Point" or not isinstance(coords, list) or len(coords) < 2:
        return None
    props = feature.get("properties") or {}
    amenity_type = props.get("amenity_type") or fallback_type or source
    return {
        "source": source,
        "type": amenity_type,
        "lng": coords[0],
        "lat": coords[1],
        "name": props.get("name") or props.get("Name") or props.get("hebrew_name") or props.get("hebrew_nam") or "",
    }
```

- [ ] **Step 2: Add point lookup builder**

```python
def build_points_lookup(output_path: Path) -> dict[str, Any]:
    excluded_clean_types = {"bicycle_track"}
    inputs = [
        ("amenities_clean", Path("docs/data/amenities_new.geojson"), None),
        ("amenities_legacy", Path("docs/data/amenities_all.geojson"), None),
        ("trees", Path("docs/data/trees.geojson"), "trees"),
        ("street_lights", Path("docs/data/street_lights.geojson"), "street-lights"),
    ]
    payload: dict[str, Any] = {"schema": 1, "sources": {}}
    total = 0

    for source, path, fallback_type in inputs:
        if not path.exists():
            payload["sources"][source] = []
            continue
        fc = load_feature_collection(path)
        records = []
        for feature in fc["features"]:
            record = point_record(feature, source, fallback_type)
            if record is not None:
                if source == "amenities_clean" and record["type"] in excluded_clean_types:
                    continue
                records.append(record)
        payload["sources"][source] = records
        total += len(records)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    gz_path = write_gzip_copy(output_path)
    return {
        "name": "points_lookup",
        "output": str(output_path),
        "status": "built",
        "records": total,
        "bytes": output_path.stat().st_size,
        "gzip_bytes": gz_path.stat().st_size if gz_path and gz_path.exists() else 0,
    }
```

- [ ] **Step 3: Manual verification command**

Run:

```bash
python scripts/build_buildings_pmtiles.py --all
```

Expected:
- `docs/data/points_lookup.json` exists.
- It contains separate `amenities_clean`, `amenities_legacy`, `trees`, and `street_lights` arrays.
- Missing optional inputs produce empty arrays, not script failure.

---

### Task 5: Add PMTiles Sources For Visual Layers In The App

**Files:**
- Create: `docs/dataArtifacts.js`
- Modify: `docs/app.js`
- Modify: `docs/index.html`

- [ ] **Step 1: Create artifact/source helper file**

Create `docs/dataArtifacts.js`:

```javascript
(function () {
  const BASE = "./data";
  const generated = window.URBAN95_GENERATED_ARTIFACTS || {};

  const urls = {
    buildingsLookup: BASE + "/buildings_lookup.json",
    isochronesLookup: BASE + "/isochrones_lookup.json",
    pointsLookup: BASE + "/points_lookup.json",
    buildingsPmtiles: BASE + "/buildings_accessibility.pmtiles",
    neighborhoodSurfacePmtiles: BASE + "/neighborhood_surface.pmtiles",
    treesPmtiles: BASE + "/trees.pmtiles",
    streetLightsPmtiles: BASE + "/street_lights.pmtiles",
  };

  function hasGeneratedArtifact(name) {
    return Boolean(
      window.pmtiles &&
        generated[name] &&
        generated[name].status === "built"
    );
  }

  function pmtilesUrl(path) {
    return "pmtiles://" + new URL(path, window.location.href).href;
  }

  function vectorSourceOrGeojson(artifactName, pmtilesPath, fallbackData) {
    if (hasGeneratedArtifact(artifactName)) {
      return { type: "vector", url: pmtilesUrl(pmtilesPath) };
    }
    return { type: "geojson", data: fallbackData || { type: "FeatureCollection", features: [] } };
  }

  window.Urban95DataArtifacts = {
    urls,
    hasGeneratedArtifact,
    pmtilesUrl,
    vectorSourceOrGeojson,
  };
})();
```

- [ ] **Step 2: Load generated manifest and helper before the app script**

In `docs/index.html`, add these script tags after `pmtiles.js`, before `turf`, and before `app.js`:

```html
<script src="./data/pmtiles_manifest.js"></script>
<script src="dataArtifacts.js"></script>
```

If `pmtiles_manifest.js` is missing in an older checkout, the browser logs a 404 but `dataArtifacts.js` must still fall back to GeoJSON because the manifest object will be absent.

- [ ] **Step 3: Consume helper namespace in `docs/app.js`**

Near the current URL constants in `docs/app.js`, add:

```javascript
const urban95Artifacts = window.Urban95DataArtifacts;
const GENERATED_URLS = urban95Artifacts.urls;

const BUILDINGS_LOOKUP_URL = GENERATED_URLS.buildingsLookup;
const ISOCHRONES_LOOKUP_URL = GENERATED_URLS.isochronesLookup;
const POINTS_LOOKUP_URL = GENERATED_URLS.pointsLookup;
const BUILDINGS_PMTILES_URL = GENERATED_URLS.buildingsPmtiles;
const NEIGHBORHOOD_SURFACE_PMTILES_URL = GENERATED_URLS.neighborhoodSurfacePmtiles;
const TREES_PMTILES_URL = GENERATED_URLS.treesPmtiles;
const STREET_LIGHTS_PMTILES_URL = GENERATED_URLS.streetLightsPmtiles;

const hasGeneratedArtifact = urban95Artifacts.hasGeneratedArtifact;
const pmtilesUrl = urban95Artifacts.pmtilesUrl;
const vectorSourceOrGeojson = urban95Artifacts.vectorSourceOrGeojson;
```

Do not use `vectorSourceOrGeojson` for buildings because building feature-state needs `promoteId: "building_id"`. Keep the custom `_urban95BuildingsSource`, but use `BUILDINGS_PMTILES_URL` and `hasGeneratedArtifact("buildings")`.

- [ ] **Step 4: Change neighborhood surface source to vector only when artifact is available**

Update the existing buildings source to use the same artifact gate. Replace the `_urban95BuildingsSource` condition:

```javascript
_urban95PmtilesProtocol != null
```

with:

```javascript
hasGeneratedArtifact("buildings")
```

Keep the existing GeoJSON fallback branch unchanged, but change the vector URL to:

```javascript
url: pmtilesUrl(BUILDINGS_PMTILES_URL),
```

Also update `_urban95BuildingsFillLayer` and any selected-building vector layer checks to use `hasGeneratedArtifact("buildings")` when deciding whether to add `"source-layer": BUILDINGS_VECTOR_LAYER_ID`.

In the initial `sources` object, replace `"neighborhood-score-surface"` with:

```javascript
"neighborhood-score-surface": vectorSourceOrGeojson("neighborhood_surface", NEIGHBORHOOD_SURFACE_PMTILES_URL),
```

- [ ] **Step 5: Change neighborhood surface layer to include `source-layer` only in PMTiles artifact mode**

When adding `neighborhoods-surface`, wrap the layer object with `Object.assign`:

```javascript
const surfaceLayer = Object.assign(
  {
    id: "neighborhoods-surface",
    type: "fill",
    source: "neighborhood-score-surface",
    paint: {
      "fill-color": getNeighborhoodSurfaceColorExpression(getNeighborhoodSurfaceScorePropertyKey()),
      "fill-outline-color": getNeighborhoodSurfaceColorExpression(getNeighborhoodSurfaceScorePropertyKey()),
      "fill-opacity": getNeighborhoodHexSurfaceOpacityExpression(),
      "fill-antialias": true,
    },
    layout: { visibility: "none" },
  },
  hasGeneratedArtifact("neighborhood_surface") ? { "source-layer": "neighborhood_surface" } : {}
);
map.addLayer(surfaceLayer, surfaceBeforeId);
```

- [ ] **Step 6: Do not call `setData(neighborhoodSurfaceData)` in PMTiles artifact mode**

At the top of `updateNeighborhoodSurfaceData`, add:

```javascript
if (hasGeneratedArtifact("neighborhood_surface")) {
  if (map.getLayer("neighborhoods-surface")) {
    const scoreKey = getNeighborhoodSurfaceScorePropertyKey() || "score_weighted";
    const colorExpr = getNeighborhoodSurfaceColorExpression(scoreKey);
    const outlineExpr = currentMode === "house" ? "rgba(0,0,0,0)" : colorExpr;
    map.setPaintProperty("neighborhoods-surface", "fill-color", colorExpr);
    map.setPaintProperty("neighborhoods-surface", "fill-outline-color", outlineExpr);
  }
  return;
}
```

- [ ] **Step 7: Stop loading neighborhood surface GeoJSON only when PMTiles artifact is available**

In `applyHouseModeHexBackground`, replace the unconditional `loadNeighborhoodSurfaceData().then(...)` with:

```javascript
const surfaceReady = hasGeneratedArtifact("neighborhood_surface")
  ? Promise.resolve(null)
  : loadNeighborhoodSurfaceData();
surfaceReady.then(function () {
  // existing body
});
```

- [ ] **Step 8: Add lookup URLs to gzip fallback allow-list**

Update `shouldTryGzip` so the generated lookup URLs can use `.gz` files:

```javascript
url === BUILDINGS_LOOKUP_URL ||
url === ISOCHRONES_LOOKUP_URL ||
url === POINTS_LOOKUP_URL ||
```

- [ ] **Step 9: Manual verification command**

Run:

```bash
npm run start
```

Open `http://localhost:8080/docs/index.html`.

Expected:
- The app loads without console errors.
- House mode still shows the heatmap background.
- Neighborhood mode still shows the surface.
- The network panel does not fetch `neighborhood_surface.geojson` when `pmtiles_manifest.js` says `neighborhood_surface` is built.
- If `pmtiles_manifest.js` is temporarily renamed, the app falls back to `neighborhood_surface.geojson`.

---

### Task 6: Replace Building Startup GeoJSON With Compact Building Lookup

**Files:**
- Create: `docs/runtimeData.js`
- Modify: `docs/app.js`
- Modify: `docs/index.html`

- [ ] **Step 1: Create runtime data helper namespace**

Create `docs/runtimeData.js`:

```javascript
(function () {
  function normalizeBuildingLookup(payload) {
    if (!payload || !Array.isArray(payload.features)) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: payload.features.map(function (p) {
        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [Number(p.centroid_lng), Number(p.centroid_lat)],
          },
          properties: p,
        };
      }),
    };
  }

  function featureCollectionFromPointRecords(records) {
    return {
      type: "FeatureCollection",
      features: (records || []).map(function (record, index) {
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [record.lng, record.lat] },
          properties: {
            amenity_type: record.type,
            name: record.name,
            _lookupIndex: index,
          },
        };
      }),
    };
  }

  function createLoaders(fetchJsonWithGzipFallback, urls, fallbackUrls) {
    function loadBuildingsRuntimeData() {
      return fetchJsonWithGzipFallback(urls.buildingsLookup, { required: false })
        .then(function (payload) {
          if (payload && Array.isArray(payload.features)) {
            return normalizeBuildingLookup(payload);
          }
          return fetchJsonWithGzipFallback(fallbackUrls.buildings);
        })
        .catch(function () {
          return fetchJsonWithGzipFallback(fallbackUrls.buildings);
        });
    }

    function loadPointsLookup() {
      return fetchJsonWithGzipFallback(urls.pointsLookup, { required: false });
    }

    function loadIsochronesLookup() {
      return fetchJsonWithGzipFallback(urls.isochronesLookup, { required: false });
    }

    return {
      loadBuildingsRuntimeData,
      loadPointsLookup,
      loadIsochronesLookup,
    };
  }

  window.Urban95RuntimeData = {
    normalizeBuildingLookup,
    featureCollectionFromPointRecords,
    createLoaders,
  };
})();
```

- [ ] **Step 2: Load runtime helper before the app script**

In `docs/index.html`, add after `dataArtifacts.js` and before `app.js`:

```html
<script src="runtimeData.js"></script>
```

- [ ] **Step 3: Create runtime loaders in `docs/app.js`**

After `fetchJsonWithGzipFallback` is defined, add:

```javascript
const urban95RuntimeLoaders = window.Urban95RuntimeData.createLoaders(
  fetchJsonWithGzipFallback,
  GENERATED_URLS,
  {
    buildings: BUILDINGS_URL,
    isochrones: ISOCHRONES_URL,
    amenitiesClean: AMENITIES_CLEAN_URL,
    amenitiesLegacy: AMENITIES_LEGACY_URL,
  }
);
```

- [ ] **Step 4: Replace startup buildings fetch**

Change:

```javascript
fetchJsonWithGzipFallback(BUILDINGS_URL)
```

to:

```javascript
urban95RuntimeLoaders.loadBuildingsRuntimeData()
```

in the map load handler.

- [ ] **Step 5: Keep centroid build compatible**

The existing centroid loop already uses stored `centroid_lng`/`centroid_lat`; it should work with the normalized point features. Keep `feature: f` so existing score/detail code can read `building.feature.properties`.

- [ ] **Step 6: Preserve selected-building outline in PMTiles mode with feature-state**

Add a selected-outline layer over the buildings vector source when PMTiles is active:

```javascript
const BUILDINGS_SELECTED_STATE_KEY = "selected";

const _urban95BuildingsSelectedLayer = Object.assign(
  {
    id: "buildings-selected-outline-vector",
    type: "line",
    source: BUILDINGS_MAP_SOURCE_ID,
    paint: {
      "line-color": "#111827",
      "line-width": [
        "case",
        ["boolean", ["feature-state", BUILDINGS_SELECTED_STATE_KEY], false],
        3,
        0,
      ],
      "line-opacity": [
        "case",
        ["boolean", ["feature-state", BUILDINGS_SELECTED_STATE_KEY], false],
        1,
        0,
      ],
    },
  },
  hasGeneratedArtifact("buildings") ? { "source-layer": BUILDINGS_VECTOR_LAYER_ID } : {}
);
```

Add this layer after `buildings-fill` in the initial layer list only when `hasGeneratedArtifact("buildings")` is true. Track the previous selected building id:

```javascript
let selectedBuildingVectorId = null;

function setSelectedBuildingVectorState(buildingId) {
  if (!hasGeneratedArtifact("buildings")) return;
  if (selectedBuildingVectorId != null) {
    map.setFeatureState(
      { source: BUILDINGS_MAP_SOURCE_ID, sourceLayer: BUILDINGS_VECTOR_LAYER_ID, id: Number(selectedBuildingVectorId) },
      { [BUILDINGS_SELECTED_STATE_KEY]: false }
    );
  }
  selectedBuildingVectorId = buildingId;
  if (buildingId != null) {
    map.setFeatureState(
      { source: BUILDINGS_MAP_SOURCE_ID, sourceLayer: BUILDINGS_VECTOR_LAYER_ID, id: Number(buildingId) },
      { [BUILDINGS_SELECTED_STATE_KEY]: true }
    );
  }
}
```

Call `setSelectedBuildingVectorState(building.properties && building.properties.building_id)` in `selectBuilding`. Call `setSelectedBuildingVectorState(null)` in `clearRadiusSelection`.

- [ ] **Step 7: Avoid setting GeoJSON building source data in PMTiles mode**

Confirm no startup code calls `map.getSource("buildings").setData(fc)` when `hasGeneratedArtifact("buildings")` is true. Keep existing PMTiles feature-state color path.

- [ ] **Step 8: Manual verification**

Open the app and confirm:
- The network panel fetches `buildings_lookup.json`, not `buildings_accessibility.geojson`, when lookup exists.
- Building choropleth colors still update.
- Clicking near a building still selects the closest building.
- Selected building outline is still visible in PMTiles mode.
- Citywide and modal score summaries still render.

---

### Task 7: Replace Eager Isochrone FeatureCollection With On-Demand Lookup

**Files:**
- Modify: `docs/runtimeData.js`
- Modify: `docs/app.js`

- [ ] **Step 1: Add `isochronesLookupMode` state**

Near `isochroneIndex`:

```javascript
let isochronesLookupMode = "legacy";
```

- [ ] **Step 2: Add isochrone adapter to `docs/runtimeData.js`**

Inside `window.Urban95RuntimeData`, add:

```javascript
function compactIsochroneFeature(index, buildingId, minutes) {
  const byMinutes = index && index[String(buildingId)];
  const geometry = byMinutes && byMinutes[String(minutes)];
  if (!geometry) return null;
  return {
    type: "Feature",
    properties: { building_id: buildingId, minutes: minutes },
    geometry: geometry,
  };
}
```

Export it:

```javascript
window.Urban95RuntimeData = {
  normalizeBuildingLookup,
  featureCollectionFromPointRecords,
  createLoaders,
  compactIsochroneFeature,
};
```

- [ ] **Step 3: Update `loadIsochrones` to prefer lookup JSON**

Replace the current fetch body with lookup-first logic:

```javascript
urban95RuntimeLoaders.loadIsochronesLookup()
  .then(function (lookup) {
    if (lookup && lookup.by_building) {
      isochroneIndex = lookup.by_building;
      isochronesLookupMode = "compact";
      isochronesLoaded = true;
      loadingState.isochrones = true;
      updateLoadingProgress();
      if (waitingForIsochroneLoad) hideIsochroneLoadingScreen();
      if (selectedBuildingCentroid) selectBuilding(selectedBuildingCentroid, false);
      return null;
    }
    return fetchJsonWithGzipFallback(ISOCHRONES_URL);
  })
  .then(function (data) {
    if (!data) return;
    return urban95Perf.phase("loadIsochrones:indexAndFinish", function () {
      if (!data || !data.features) throw new Error("Invalid isochrone data");
      data.features.forEach(function (f) {
        const bid = f.properties.building_id;
        const mins = f.properties.minutes;
        isochroneIndex[bid + "_" + mins] = f;
      });
      isochronesLookupMode = "legacy";
      isochronesLoaded = true;
      loadingState.isochrones = true;
      updateLoadingProgress();
      if (waitingForIsochroneLoad) hideIsochroneLoadingScreen();
      if (selectedBuildingCentroid) selectBuilding(selectedBuildingCentroid, false);
    });
  })
```

Keep the existing `.catch(...)` behavior.

- [ ] **Step 4: Update `getIsochrone`**

```javascript
function getIsochrone(buildingId, minutes) {
  if (isochronesLookupMode === "compact") {
    return window.Urban95RuntimeData.compactIsochroneFeature(isochroneIndex, buildingId, minutes);
  }
  const key = buildingId + "_" + minutes;
  return isochroneIndex[key] || null;
}
```

- [ ] **Step 5: Stop background-loading isochrones on startup**

In the map load handler, replace this exact block:

```javascript
loadingState.isochrones = true;
updateLoadingProgress();
loadIsochrones({ background: true });
console.log("[Load] isochrones: background loading started");
```

with this exact block:

```javascript
loadingState.isochrones = true;
updateLoadingProgress();
console.log("[Load] isochrones: deferred until Amenities Focus needs walking areas");
```

Keep `loadingState.isochrones = true` for Urban95 startup progress if the active default score mode is weighted.

- [ ] **Step 6: Manual verification**

Open the app:
- Startup should not fetch `isochrones.geojson` or `isochrones_lookup.json` in default Urban95 mode.
- Switching to Amenities Focus should fetch `isochrones_lookup.json`.
- Selecting a building in Amenities Focus should draw the correct walking area.
- If `isochrones_lookup.json` is temporarily renamed, the app should fall back to `isochrones.geojson`.

---

### Task 8: Use Point Lookup For Analysis While Keeping PMTiles For Display

**Files:**
- Modify: `docs/runtimeData.js`
- Modify: `docs/app.js`

- [ ] **Step 1: Add point lookup loader**

```javascript
function loadPointsLookup() {
  return urban95RuntimeLoaders.loadPointsLookup();
}
```

- [ ] **Step 2: Use runtime helper for point-record FeatureCollections**

Use the existing helper:

```javascript
window.Urban95RuntimeData.featureCollectionFromPointRecords(records)
```

- [ ] **Step 3: Replace startup amenity GeoJSON fetches with lookup-first flow**

In the map load handler, replace the current `Promise.all([fetchJsonWithGzipFallback(AMENITIES_CLEAN_URL...), fetchJsonWithGzipFallback(AMENITIES_LEGACY_URL...)])` block with this shape:

```javascript
loadPointsLookup()
  .then(function (lookup) {
    const runtimeData = window.Urban95RuntimeData;
    if (lookup && lookup.sources) {
      return {
        cleanFc: runtimeData.featureCollectionFromPointRecords(lookup.sources.amenities_clean || []),
        legacyFc: runtimeData.featureCollectionFromPointRecords(lookup.sources.amenities_legacy || []),
        treesFc: runtimeData.featureCollectionFromPointRecords(lookup.sources.trees || []),
        streetLightsFc: runtimeData.featureCollectionFromPointRecords(lookup.sources.street_lights || []),
        source: "points_lookup",
      };
    }
    return Promise.all([
      fetchJsonWithGzipFallback(AMENITIES_CLEAN_URL, { required: true }),
      fetchJsonWithGzipFallback(AMENITIES_LEGACY_URL, { required: false }),
    ]).then(function (results) {
      return {
        cleanFc: filterCleanManifestPointFeatures(results[0]),
        legacyFc: results[1],
        treesFc: null,
        streetLightsFc: null,
        source: "geojson_fallback",
      };
    });
  })
  .then(function (payload) {
    const cleanFc = payload.cleanFc;
    const legacyFc = payload.legacyFc;

    allAmenitiesDataClean = cleanFc;
    const cleanScan = scanAmenityTypesFromFeatures(cleanFc);
    allAmenityTypesClean = cleanScan.types;
    typesWithDataClean = cleanScan.tw;

    if (legacyFc && (legacyFc.features || []).length > 0) {
      allAmenitiesDataLegacy = legacyFc;
      const legScan = scanAmenityTypesFromFeatures(legacyFc);
      allAmenityTypesLegacy = legScan.types;
      typesWithDataLegacy = legScan.tw;
    } else {
      allAmenitiesDataLegacy = null;
      allAmenityTypesLegacy = [];
      typesWithDataLegacy = new Set();
    }

    if (payload.treesFc && payload.treesFc.features.length > 0) {
      allTreesData = payload.treesFc;
      treesLoadStarted = true;
    }
    if (payload.streetLightsFc && payload.streetLightsFc.features.length > 0) {
      allStreetLightsData = payload.streetLightsFc;
      streetLightsLoadStarted = true;
    }

    applyScoreModeAmenities();
    loadingState.amenities = true;
    updateLoadingProgress();
  })
```

Keep the existing `.catch(...)` branch. This must try `points_lookup.json(.gz)` before amenity GeoJSON so it actually removes startup parse cost.

- [ ] **Step 4: Keep visual PMTiles point layers out of scope unless needed**

Do not remove the existing `trees` and `street-lights` GeoJSON MapLibre sources in this task. The lookup reduces analysis payload first. A later task may swap all-detail tree/light rendering to vector sources after behavior is proven.

- [ ] **Step 5: Manual verification**

In Amenities Focus:
- Filter list includes trees and street lights after lookup load.
- Selecting a building still counts amenities/trees/lights in the walking area.
- Startup network uses `points_lookup.json` or `points_lookup.json.gz` instead of eager `amenities_new.geojson` and `amenities_all.geojson` when the lookup exists.
- Point display still works through existing sources.

---

### Task 9: Optional Display PMTiles For Trees And Street Lights

**Files:**
- Modify: `docs/app.js`

- [ ] **Step 1: Add separate vector sources for all-detail point display**

Keep existing `trees` and `street-lights` GeoJSON sources for clipped/highlighted subsets. Add:

```javascript
"trees-vector": vectorSourceOrGeojson("trees", TREES_PMTILES_URL),
"street-lights-vector": vectorSourceOrGeojson("street_lights", STREET_LIGHTS_PMTILES_URL),
```

- [ ] **Step 2: Add all-detail vector layers with PMTiles source-layer**

Add tree vector layer only when the artifact is available:

```javascript
if (hasGeneratedArtifact("trees")) {
  map.addLayer({
    id: "tree-icons-vector",
    type: "symbol",
    source: "trees-vector",
    "source-layer": "trees",
    minzoom: URBAN95_DETAIL_POINTS_MIN_ZOOM,
    layout: {
      "icon-image": "park-alt1",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.55, 18, 1.1],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "visibility": "none",
    },
    paint: { "icon-color": AMENITY_TYPE_CONFIG.trees.color, "icon-opacity": 0.95 },
  });
}
```

Repeat for `street-light-icons-vector` only when `hasGeneratedArtifact("street_lights")` is true, with `source-layer: "street_lights"`.

- [ ] **Step 3: Wire vector layers into visibility helpers**

Update `setTreesAndLightsVisibility` and any layer-id arrays/helpers that currently reference only `tree-icons` and `street-light-icons` so they also include:

```javascript
const TREE_LAYER_IDS = ["tree-icons", "tree-icons-vector"];
const STREET_LIGHT_LAYER_IDS = ["street-light-icons", "street-light-icons-vector"];
```

Use a helper that checks `map.getLayer(layerId)` before setting visibility:

```javascript
function setLayerVisibilityIfPresent(layerId, visible) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
}
```

Replace direct visibility writes for tree/light layers with loops over these arrays.

- [ ] **Step 4: Add hover handlers for vector point layers**

Reuse the existing tree and street-light hover behavior for `tree-icons-vector` and `street-light-icons-vector`. Register handlers only when the layer exists:

```javascript
function bindPointHoverLayer(layerId, labelForFeature) {
  if (!map.getLayer(layerId)) return;
  map.on("mouseenter", layerId, () => {
    if (!_deckHovering) map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", layerId, () => {
    if (!_deckHovering) map.getCanvas().style.cursor = "";
    tooltip.style.display = "none";
  });
  map.on("mousemove", layerId, (e) => {
    if (_deckHovering || e.features.length === 0) return;
    tooltip.textContent = labelForFeature(e.features[0]);
    tooltip.style.display = "block";
    tooltip.style.left = (e.point.x + 12) + "px";
    tooltip.style.top = (e.point.y + 12) + "px";
  });
}
```

- [ ] **Step 5: Route weighted all-detail display to vector layers**

In `updateTreesSource`, when `scoreMode === "weighted"` and `hasGeneratedArtifact("trees")` is true:
- Do not call `source.setData(allTreesData)`.
- Set `tree-icons-vector` visibility based on zoom and current mode.
- Keep the legacy GeoJSON branch when `hasGeneratedArtifact("trees")` is false.

In `updateStreetLightsSource`, when `scoreMode === "weighted"` and `hasGeneratedArtifact("street_lights")` is true:
- Do not call `source.setData(allStreetLightsData)`.
- Set `street-light-icons-vector` visibility based on zoom and current mode.
- Keep the legacy GeoJSON branch when `hasGeneratedArtifact("street_lights")` is false.

Do not use `_urban95PmtilesProtocol` alone for this branch. Protocol availability does not prove the layer artifact exists.

Legacy rule to preserve:
- Do not call `source.setData(allTreesData)` / `source.setData(allStreetLightsData)`.
- Keep GeoJSON source for clipped Amenities Focus display.

- [ ] **Step 6: Manual verification**

At zoom >= detail threshold in Urban95 mode:
- Trees/lights appear.
- Network does not fetch full `trees.geojson` / `street_lights.geojson` solely for display.
- Tree/light toggles and mode transitions hide/show both legacy and vector layers consistently.
- Hover tooltips still work on vector tree/light layers.
- Amenities Focus clipped selection still works.

---

### Task 10: Final Manual Performance Verification And Cleanup

**Files:**
- Modify only if findings require small corrections: `scripts/build_buildings_pmtiles.py`, `docs/dataArtifacts.js`, `docs/runtimeData.js`, `docs/app.js`, `docs/index.html`

- [ ] **Step 1: Build all artifacts**

Run:

```bash
python scripts/build_buildings_pmtiles.py --all
```

Expected:
- Missing optional layers are logged as skipped, not fatal.
- `pmtiles_manifest.json` is written.
- Required artifacts for present inputs are written.

- [ ] **Step 2: Start local static server**

Run:

```bash
npm run start
```

Open:

```text
http://localhost:8080/docs/index.html
```

- [ ] **Step 3: Inspect generated PMTiles sizes before runtime review**

Read `docs/data/pmtiles_manifest.json` and check whether any PMTiles output is unexpectedly larger than its source GeoJSON or produces obvious runtime tile stalls. If a layer is too heavy, do not add global `--no-tile-size-limit`; instead tune that layer's `minzoom`, `maxzoom`, and simplification flags in `TileLayerSpec`, then rebuild only that layer:

```bash
python scripts/build_buildings_pmtiles.py --layer neighborhood_surface --skip-lookups
```

Expected:
- No layer uses global lossless tile flags by accident.
- Any layer-specific heavy-tile exception is documented in the manifest notes or implementation results.

- [ ] **Step 4: Inspect startup network behavior**

Expected in default Urban95 mode:
- Fetches `buildings_lookup.json`.
- Does not fetch `buildings_accessibility.geojson` when lookup exists.
- Does not fetch `neighborhood_surface.geojson` when PMTiles is active.
- Does not fetch `isochrones.geojson` at startup.

- [ ] **Step 5: Inspect interaction behavior**

Manual checks:
- Building click selects nearest building.
- Choropleth colors update when radius/filter controls change.
- Amenities Focus loads walking areas and displays selected isochrone.
- Neighborhood mode still shows aggregate surface and boundaries.
- Citywide modal still opens and charts render.

- [ ] **Step 6: Record performance notes**

Add a short dated note to the bottom of this plan under `Implementation Results` with:
- Generated artifact sizes.
- Which large GeoJSONs are no longer fetched at startup.
- Any remaining full GeoJSON loads and why they remain.

---

## Out Of Scope

- Broad modularization of `docs/app.js`.
- Changing the Python GIS scoring methodology.
- Adding a server/API.
- Removing legacy GeoJSON fallbacks.
- Making isochrones PMTiles-only.
- Automated tests.
- Commits or worktrees.

---

## Self-Review

- **Spec coverage:** The plan covers multi-layer PMTiles generation, deeper lookup fixes, app wiring, fallback behavior, and manual performance verification.
- **Placeholder scan:** No `TBD`, `TODO`, or unspecified “handle edge cases” steps remain.
- **Type consistency:** Generated lookup schemas match the JavaScript loader snippets: `features`, `by_building`, and `sources`.
- **Key architectural boundary:** PMTiles are used for rendering; JSON indexes are used for arbitrary lookup and analysis.

---

## Implementation Results

### 2026-05-19 SDD implementation pass

Implemented task-by-task with fresh implementation/review subagents. No commits or git worktrees were created. Automated tests were not added or used as completion gates; the final verification used the artifact build, syntax/page-load checks, and browser/CDP manual probes against the local static site.

Generated artifact sizes from fresh `python scripts/build_buildings_pmtiles.py --all`:

| Artifact | Records | Size | Gzip size |
|---|---:|---:|---:|
| `buildings_accessibility.pmtiles` | - | 31,060,967 bytes | - |
| `buildings_lookup.json` | 20,441 | 77,027,399 bytes | 3,838,068 bytes |
| `isochrones_lookup.json` | 61,323 | 31,218,096 bytes | 4,976,405 bytes |
| `neighborhood_surface.pmtiles` | - | 24,312,995 bytes | - |
| `points_lookup.json` | 101,367 | 6,443,142 bytes | 675,896 bytes |
| `roads.pmtiles` | - | 5,747,177 bytes | - |
| `spatial_syntax_segments.pmtiles` | - | 14,167,709 bytes | - |
| `street_lights.pmtiles` | - | 474,704 bytes | - |
| `trees.pmtiles` | - | 675,969 bytes | - |

Startup network evidence from `http://localhost:8080/docs/index.html` in default Urban95 mode:

- Fetched generated artifacts: `buildings_lookup.json.gz`, `points_lookup.json.gz`, `buildings_accessibility.pmtiles`, `neighborhood_surface.pmtiles`, `trees.pmtiles`, `street_lights.pmtiles`, and `pmtiles_manifest.js`.
- Did not fetch large startup GeoJSONs that the plan targeted: `buildings_accessibility.geojson(.gz)`, `neighborhood_surface.geojson`, `isochrones.geojson`, `isochrones_lookup.json(.gz)`, `amenities_new.geojson`, `amenities_all.geojson`, `trees.geojson(.gz)`, or `street_lights.geojson(.gz)`.
- `parks.geojson` still loads at startup because parks remain a normal visible GeoJSON layer outside this PMTiles/lookup scope.

Runtime/manual verification evidence:

- Fresh `python scripts/build_buildings_pmtiles.py --all` exited 0 and rebuilt all present PMTiles plus lookup artifacts.
- Port `8080` was already serving the repo via `node`; `http://localhost:8080/docs/index.html` returned 200.
- Browser probe with software WebGL loaded the map in 6.3 s with 20,441 building centroids, vector buildings source active, building fill visible, and tree/street-light vector layers present.
- Simulated house-mode map click selected nearest building `10220`; vector feature-state showed `{ selected: true }`.
- Amenities Focus loaded `isochrones_lookup.json.gz`, upgraded trees and street lights to authoritative full GeoJSON for analysis, and produced counts including `trees: 700` and `street-lights: 236` for the selected building.
- Neighborhood mode showed the aggregate surface layer with `visibility: visible`.
- Citywide mode opened the modal and rendered 2 Chart.js charts in the browser probe.

Remaining full GeoJSON loads and why:

- `parks.geojson` remains a startup GeoJSON render source; converting parks was not in this plan.
- `neighborhoods.geojson` still loads when entering neighborhood/citywide modes because the app needs neighborhood names, boundaries, and modal context.
- `trees.geojson.gz` and `street_lights.geojson.gz` are intentionally loaded only after switching to Amenities Focus, where point-in-polygon analysis and clipped display require authoritative full point sets rather than PMTiles.
- `neighborhood_charts.json` and `citywide_stats.json` remain JSON interaction payloads for neighborhood/citywide charts.

Deviations and notes:

- The generated `points_lookup.json` currently includes full tree and street-light records, so startup has compact point arrays available. The runtime still treats lookup tree/light data as non-authoritative for Amenities Focus and upgrades to full GeoJSON when analysis needs the original source contract.
- PMTiles are used only for visual layers. Building selection, centroids, isochrones, and point analysis use lookup/full JSON data, not `queryRenderedFeatures`.
