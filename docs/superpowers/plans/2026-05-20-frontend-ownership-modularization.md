# Frontend Ownership Modularization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use @superpowers:subagent-driven-development (recommended) or @superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue the static map frontend modularization by making config, state, and runtime-data ownership explicit while preserving current map behavior.

**Architecture:** Keep the no-bundler GitHub Pages contract: plain scripts under `docs/`, explicit `window.Urban95...` namespaces, and `docs/app.js` as the thin coordinator. This pass should extract ownership, not just move code: `Urban95Config` becomes the URL/source/layer contract, a new `Urban95AppState` owns mutable frontend state, and `Urban95RuntimeData` owns runtime data orchestration while preserving lookup-first analysis and PMTiles render-only behavior.

**Tech Stack:** HTML/CSS/vanilla JavaScript, MapLibre GL JS, PMTiles protocol, Turf.js, deck.gl, Chart.js, Node.js built-in `node:test`, existing `http-server`, optional temporary Playwright browser probes for manual verification.

---

## Hard Constraints

- No commits.
- No git worktrees.
- Preserve unrelated dirty or untracked files.
- Do not add a bundler, transpiler, TypeScript, package migration, or build output directory.
- Keep `docs/style.css` out of scope.
- Keep Python pipeline/scripts out of scope except for reading generated-data contracts.
- Do not change scoring formulas, UI labels, data filenames, generated artifact schemas, PMTiles generation behavior, or lookup-vs-render semantics.
- PMTiles remain render artifacts only. Lookup JSON and GeoJSON fallback paths remain the source for selection, scoring, isochrones, and point-in-polygon analysis.
- After each implementation task, run a spec-compliance review subagent first, then a code-quality review subagent. Do not start code-quality review until spec compliance is clean.

## Current Baseline

- Current `HEAD`: `16b3c7a refactor(map): modularize static map app`.
- `docs/app.js` is about 3,024 lines after the first split.
- Existing modules:
  - `docs/js/core/config.js`
  - `docs/js/core/dataArtifacts.js`
  - `docs/js/core/loaders.js`
  - `docs/js/core/runtimeData.js`
  - `docs/js/core/perfPanel.js`
  - `docs/js/scoring/scoreModel.js`
  - `docs/js/map/mapLayers.js`
  - `docs/js/map/mapRenderers.js`
  - `docs/js/map/selection.js`
  - `docs/js/ui/controls.js`
  - `docs/js/ui/scoreSidebar.js`
  - `docs/js/ui/infoModal.js`
  - `docs/js/ui/dashboards.js`
- Fresh verification before this plan:
  - `npm run test:frontend` passed `45/45`.
  - Browser smoke at `http://localhost:8080/docs/index.html` loaded with no page errors.
  - Startup browser probe requested PMTiles/lookup paths and did not request full `buildings_accessibility.geojson`, `isochrones.geojson`, `amenities_new.geojson`, or `amenities_all.geojson`.
  - Targeted building click opened the score sidebar for Building `#14181`.
  - Score-mode switch, neighborhood mode, neighborhood click, citywide mode, citywide modal, and mobile citywide smoke passed.

## Perspective Ensemble

### Panel A - Council

- **Ownership clarity:** Concern -> the first split reduced file size but left `app.js` as a large state bag. Flag -> modules still receive many app-owned callbacks and variables. Counter-move -> introduce `Urban95AppState` before extracting more UI or map behavior.
- **Static-site simplicity:** Concern -> ES modules or a bundler would make imports cleaner but change deployment risk. Flag -> this repo publishes directly from `docs/`. Counter-move -> stay with IIFE namespaces and strengthen script-order tests.
- **Runtime contract safety:** Concern -> PMTiles and lookup paths are easy to blur during refactors. Flag -> `app.js` still locally rebuilds URL/artifact constants and runtime loaders. Counter-move -> make config/artifact resolution explicit and test that no full startup GeoJSON fetch returns.
- **Reviewability:** Concern -> a giant extraction creates hard-to-review behavior drift. Flag -> score explain and map mode controller are tempting but too broad for the same pass. Counter-move -> limit this plan to config, state, and runtime orchestration.

### Tensions

- **Smaller files vs clearer ownership:** moving score sidebar or map mode code now would shrink `app.js`, but state extraction first makes later moves safer.
- **Strict contracts vs local flexibility:** centralizing URL and state contracts may require more explicit accessors, but it prevents silent duplication.
- **More tests vs faster refactor:** the current tests are already strong; this pass still needs targeted contract tests because ownership bugs can be invisible in simple browser smoke.

### Panel B - Adversarial

- **Attack target:** A medium modularization pass that claims maintainability improvement while accidentally preserving the same global coupling through a new state object.
- **State-monolith vector:** Vulnerability -> `Urban95AppState` could become a dump for every variable. Failure scenario -> modules still depend on dozens of loosely related getters, only now through a different namespace. Mitigation/probe -> expose grouped state slices and focused methods, and add tests for copy-safe Set/Map access.
- **Startup regression vector:** Vulnerability -> moving runtime orchestration could accidentally bypass generated artifacts. Failure scenario -> startup eagerly fetches large full GeoJSON again. Mitigation/probe -> keep the browser network proof in the final verification and add source-contract tests for `loadBuildingsRuntimeData`, points lookup, and PMTiles render-only boundaries.
- **Script-order vector:** Vulnerability -> new core modules must load before consumers. Failure scenario -> a blank map caused by `Urban95AppState` or expanded `Urban95RuntimeData` loading after `app.js`. Mitigation/probe -> update `tests/frontend/module_contracts.test.js` to assert script order and namespace shape.

### Strongest Attack

The strongest reason to reject this plan would be if `Urban95AppState` only centralizes variables without reducing dependency surfaces. That would create a new shared mutable object and make future debugging harder. The implementation must prove the opposite by removing duplicated URL constants, shrinking direct top-level state access in `app.js`, and making module dependencies more explicit.

### Falsifiers / Early Warnings

- `docs/app.js` shrinks but `Urban95AppState` exposes one huge generic `state` object that any module can mutate.
- Contract tests only assert namespace existence and do not verify behavior around Sets, Maps, cache clearing, or lookup-first runtime loading.
- Browser network proof shows full generated GeoJSON fetched on startup when PMTiles/lookup artifacts exist.
- Score-mode switch no longer waits for authoritative tree and street-light GeoJSON before refreshing selected-building analysis.

### Recommendation

Proceed with the medium pass: config contracts first, then `Urban95AppState`, then runtime orchestration. Defer score-explain extraction and map-mode-controller extraction to the next plan unless this pass leaves `app.js` in an unusually clean state.

---

## Target File Structure

```text
docs/
  index.html
  app.js
  js/
    core/
      appState.js
      config.js
      dataArtifacts.js
      loaders.js
      runtimeData.js
      perfPanel.js
    scoring/
      scoreModel.js
    map/
      mapLayers.js
      mapRenderers.js
      selection.js
    ui/
      controls.js
      scoreSidebar.js
      dashboards.js
      infoModal.js
tests/
  frontend/
    helpers/
      loadBrowserScript.js
    module_contracts.test.js
    score_model.test.js
```

## File Responsibilities

- `docs/js/core/config.js`: Authoritative static config: `BASE`, `ICONS_BASE`, data URLs, CDN URLs, source IDs, layer IDs, feature-state keys, mode names, zoom thresholds, and generated-artifact URL fallback names.
- `docs/js/core/dataArtifacts.js`: Generated artifact manifest adapter: artifact existence, PMTiles URL resolution, source-layer resolution, and render-source construction.
- `docs/js/core/appState.js`: Focused mutable state store for only UI/scoring state migrated in this pass: score mode, walk minutes, selected amenity filters, filter-type metadata, latest radius counts, and derived score caches. It must not own dataset payloads, selected building objects, runtime loader promises, map/deck overlay handles, dashboard chart instances, or a generic exported mutable object.
- `docs/js/core/runtimeData.js`: Runtime data adapters and loading orchestration: building lookup normalization, points lookup conversion/validation, compact isochrone lookup, trees/street-lights lazy GeoJSON loading, amenities clean/legacy switching support, and completeness warnings.
- `docs/app.js`: Bootstrap and coordinator: namespace validation, MapLibre construction, module configuration, event binding, and app startup sequencing. It should call focused module APIs rather than owning duplicated config/runtime/state logic.
- `tests/frontend/module_contracts.test.js`: Script order, namespace, config/artifact/runtime/state contract tests, and source-level guardrails for lookup-first analysis.
- `tests/frontend/score_model.test.js`: Existing score model behavior tests; do not broaden unless scoring behavior changes, which this plan should avoid.

## Task 1: Make Config And Artifact Contracts Authoritative

**Files:**
- Modify: `docs/js/core/config.js`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [x] **Step 1: Add failing config contract tests**

Add a test to `tests/frontend/module_contracts.test.js` after the core namespace test:

```javascript
test("config exposes authoritative runtime and fallback URLs", () => {
  const browser = createBrowserContext({
    URBAN95_GENERATED_ARTIFACTS: {
      buildings: {
        status: "built",
        output: "./data/buildings_accessibility.pmtiles",
        source_layer: "buildings",
      },
      buildings_lookup: {
        status: "built",
        output: "./data/custom_buildings_lookup.json",
        source_layer: "buildings_lookup",
      },
      isochrones_lookup: {
        status: "built",
        output: "./data/custom_isochrones_lookup.json",
        source_layer: "isochrones_lookup",
      },
      points_lookup: {
        status: "built",
        output: "./data/custom_points_lookup.json",
        source_layer: "points_lookup",
      },
    },
  });

  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/core/dataArtifacts.js", browser);

  assert.equal(browser.window.Urban95Config.urls.buildings, "./data/buildings_accessibility.geojson");
  assert.equal(browser.window.Urban95Config.urls.trees, "./data/trees.geojson");
  assert.equal(browser.window.Urban95Config.urls.streetLights, "./data/street_lights.geojson");
  assert.equal(browser.window.Urban95Config.generatedFallbacks.buildingsLookup, "./data/buildings_lookup.json");
  assert.equal(browser.window.Urban95Config.generatedFallbacks.isochronesLookup, "./data/isochrones_lookup.json");
  assert.equal(browser.window.Urban95Config.generatedFallbacks.pointsLookup, "./data/points_lookup.json");
  assert.equal(browser.window.Urban95DataArtifacts.urls.buildingsLookup, "./data/custom_buildings_lookup.json");
  assert.equal(browser.window.Urban95DataArtifacts.urls.isochronesLookup, "./data/custom_isochrones_lookup.json");
  assert.equal(browser.window.Urban95DataArtifacts.urls.pointsLookup, "./data/custom_points_lookup.json");
});
```

- [x] **Step 2: Run the failing config test**

Run:

```bash
npm run test:frontend
```

Expected before implementation: FAIL with `generatedFallbacks` missing from `Urban95Config`.

- [x] **Step 3: Extend `docs/js/core/config.js`**

Add generated fallback URL names and map contract constants to `window.Urban95Config`. Keep existing keys intact:

```javascript
  var generatedFallbacks = {
    buildingsLookup: BASE + "/buildings_lookup.json",
    isochronesLookup: BASE + "/isochrones_lookup.json",
    pointsLookup: BASE + "/points_lookup.json",
    buildingsPmtiles: BASE + "/buildings_accessibility.pmtiles",
    neighborhoodSurfacePmtiles: BASE + "/neighborhood_surface.pmtiles",
    treesPmtiles: BASE + "/trees.pmtiles",
    streetLightsPmtiles: BASE + "/street_lights.pmtiles",
  };

  var mapContracts = {
    buildingSourceLayerFallback: "buildings",
    neighborhoodSurfaceSourceLayerFallback: "neighborhood_surface",
  };
```

Then expose them:

```javascript
    generatedFallbacks: generatedFallbacks,
    mapContracts: mapContracts,
```

- [x] **Step 4: Route `app.js` URL setup through `Urban95Config`**

Replace the duplicated `BASE + ...` fallback literals at the top of `docs/app.js` with `Urban95Config.urls` and `Urban95Config.generatedFallbacks`. Preserve the same constant names for the rest of the file:

```javascript
const CONFIG_URLS = Urban95Config.urls || {};
const GENERATED_FALLBACKS = Urban95Config.generatedFallbacks || {};
const BUILDINGS_URL = CONFIG_URLS.buildings;
const BUILDINGS_LOOKUP_URL = GENERATED_URLS.buildingsLookup || GENERATED_FALLBACKS.buildingsLookup;
const PARKS_URL = CONFIG_URLS.parks;
const TREES_URL = CONFIG_URLS.trees;
const STREET_LIGHTS_URL = CONFIG_URLS.streetLights;
const AMENITIES_CLEAN_URL = CONFIG_URLS.amenitiesClean;
const AMENITIES_LEGACY_URL = CONFIG_URLS.amenitiesLegacy;
const ISOCHRONES_URL = CONFIG_URLS.isochrones;
const ISOCHRONES_LOOKUP_URL = GENERATED_URLS.isochronesLookup || GENERATED_FALLBACKS.isochronesLookup;
const POINTS_LOOKUP_URL = GENERATED_URLS.pointsLookup || GENERATED_FALLBACKS.pointsLookup;
const NEIGHBORHOODS_URL = CONFIG_URLS.neighborhoods;
const NEIGHBORHOOD_SURFACE_URL = CONFIG_URLS.neighborhoodSurface;
const BUILDINGS_PMTILES_URL = GENERATED_URLS.buildingsPmtiles || GENERATED_FALLBACKS.buildingsPmtiles;
const NEIGHBORHOOD_SURFACE_PMTILES_URL =
  GENERATED_URLS.neighborhoodSurfacePmtiles || GENERATED_FALLBACKS.neighborhoodSurfacePmtiles;
const TREES_PMTILES_URL = GENERATED_URLS.treesPmtiles || GENERATED_FALLBACKS.treesPmtiles;
const STREET_LIGHTS_PMTILES_URL = GENERATED_URLS.streetLightsPmtiles || GENERATED_FALLBACKS.streetLightsPmtiles;
const NEIGHBORHOOD_CHARTS_URL = CONFIG_URLS.neighborhoodCharts;
const CITYWIDE_STATS_URL = CONFIG_URLS.citywideStats;
```

Do not remove `BASE` or `ICONS_BASE` if still used elsewhere.

- [x] **Step 5: Run config-focused verification**

Run:

```bash
npm run test:frontend
```

Expected: all tests pass.

- [x] **Step 6: Spec-compliance review subagent**

Dispatch a read-only review subagent with this prompt:

```text
You are reviewing Task 1 of docs/superpowers/plans/2026-05-20-frontend-ownership-modularization.md in D:\Projects\Nur\urban95.

Do not edit files. Verify that config/artifact URL ownership moved toward Urban95Config without changing data filenames, generated artifact semantics, PMTiles render-only behavior, or no-bundler script loading. Check docs/js/core/config.js, docs/js/core/dataArtifacts.js, docs/app.js, docs/index.html, and tests/frontend/module_contracts.test.js.

Report findings first with file/line references. If clean, say SPEC COMPLIANCE CLEAN.
```

- [x] **Step 7: Code-quality review subagent**

Only after spec compliance is clean, dispatch:

```text
You are reviewing Task 1 code quality for docs/superpowers/plans/2026-05-20-frontend-ownership-modularization.md in D:\Projects\Nur\urban95.

Do not edit files. Look for maintainability issues, duplicated URL constants, brittle fallbacks, unclear namespace contracts, over-broad changes, and tests that are too weak or too coupled to formatting. Report findings first with file/line references. If clean, say CODE QUALITY CLEAN.
```

## Task 2: Add Focused `Urban95AppState`

**Files:**
- Create: `docs/js/core/appState.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [x] **Step 1: Add failing script-order and namespace tests**

Update the `index loads core frontend modules before app.js` test:

```javascript
  const runtimeIndex = requireScriptIndex(scripts, "./js/core/runtimeData.js");
  const appStateIndex = requireScriptIndex(scripts, "./js/core/appState.js");
  assert.ok(runtimeIndex < appStateIndex);
  assert.ok(appStateIndex < appIndex);
```

The intended order for this pass is `runtimeData.js` before `appState.js`, and `appState.js` before `app.js`. If implementation proves `appState.js` has no runtime dependency, keep at least the hard `appState.js < app.js` assertion and document the reason in the task notes.

Add a namespace test:

```javascript
test("app state exposes focused mutable state contracts", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/appState.js", browser);

  const state = browser.window.Urban95AppState.create();
  assert.equal(state.getScoreMode(), "weighted");
  assert.equal(state.getWalkMinutes(), 5);

  state.setScoreMode("expanded");
  state.setWalkMinutes(10);
  state.setSelectedAmenityTypes(new Set(["trees"]));
  state.setAllFilterTypes(["trees", "street-lights"]);
  const selectedTypes = state.getSelectedAmenityTypes();
  selectedTypes.add("street-lights");
  const filterTypes = state.getAllFilterTypes();
  filterTypes.push("school");

  assert.equal(state.getScoreMode(), "expanded");
  assert.equal(state.getWalkMinutes(), 10);
  assert.deepEqual(Array.from(state.getSelectedAmenityTypes()), ["trees"]);
  assert.deepEqual(state.getAllFilterTypes(), ["trees", "street-lights"]);

  state.setAmenitiesInRadiusIds(new Set(["a"]));
  const radiusIds = state.getAmenitiesInRadiusIds();
  radiusIds.add("b");
  assert.deepEqual(Array.from(state.getAmenitiesInRadiusIds()), ["a"]);

  state.setLatestRadiusCounts({ trees: 3 });
  const counts = state.getLatestRadiusCounts();
  counts.trees = 99;
  assert.equal(state.getLatestRadiusCounts().trees, 3);

  state.getPercentileSeriesCache().set("x", [1]);
  state.getBuildingAmenityStatKeyCache().set("y", new Set(["z"]));
  state.clearDerivedCaches();

  assert.equal(state.getPercentileSeriesCache().size, 0);
  assert.equal(state.getBuildingAmenityStatKeyCache().size, 0);
});
```

- [x] **Step 2: Run the failing app-state test**

Run:

```bash
npm run test:frontend
```

Expected before implementation: FAIL because `docs/js/core/appState.js` is not loaded and `Urban95AppState` is missing.

- [x] **Step 3: Create `docs/js/core/appState.js`**

Create an IIFE that exports `window.Urban95AppState.create`. The implementation should use private closure variables and focused accessors, not a generic exported `state` object:

```javascript
(function () {
  function copySet(value) {
    if (value instanceof Set) return new Set(value);
    if (Array.isArray(value)) return new Set(value);
    return new Set();
  }

  function create() {
    var walkMinutes = 5;
    var scoreMode = "weighted";
    var selectedAmenityTypes = new Set();
    var lastFilterRadioSelection = "all";
    var allFilterTypes = [];
    var amenitiesInRadiusIds = new Set();
    var latestRadiusCounts = {};
    var percentileSeriesCache = new Map();
    var buildingAmenityStatKeyCache = new Map();

    return {
      getWalkMinutes: function () { return walkMinutes; },
      setWalkMinutes: function (value) { walkMinutes = value; },
      getScoreMode: function () { return scoreMode; },
      setScoreMode: function (value) { scoreMode = value; },

      getSelectedAmenityTypes: function () { return new Set(selectedAmenityTypes); },
      setSelectedAmenityTypes: function (value) { selectedAmenityTypes = copySet(value); },
      getLastFilterRadioSelection: function () { return lastFilterRadioSelection; },
      setLastFilterRadioSelection: function (value) { lastFilterRadioSelection = value || "all"; },
      getAllFilterTypes: function () { return allFilterTypes.slice(); },
      setAllFilterTypes: function (value) { allFilterTypes = Array.isArray(value) ? value.slice() : []; },
      getAmenitiesInRadiusIds: function () { return new Set(amenitiesInRadiusIds); },
      setAmenitiesInRadiusIds: function (value) { amenitiesInRadiusIds = copySet(value); },
      clearRadiusIds: function () {
        amenitiesInRadiusIds.clear();
      },
      getLatestRadiusCounts: function () { return Object.assign({}, latestRadiusCounts); },
      setLatestRadiusCounts: function (value) {
        latestRadiusCounts = value && typeof value === "object" ? Object.assign({}, value) : {};
      },

      getPercentileSeriesCache: function () { return percentileSeriesCache; },
      getBuildingAmenityStatKeyCache: function () { return buildingAmenityStatKeyCache; },
      clearDerivedCaches: function () {
        percentileSeriesCache.clear();
        buildingAmenityStatKeyCache.clear();
      },
    };
  }

  window.Urban95AppState = { create: create };
})();
```

Only `getPercentileSeriesCache()` and `getBuildingAmenityStatKeyCache()` should return live mutable objects in this task. They are intentionally cache handles so existing score-series code can continue to call `.has()`, `.get()`, `.set()`, and `.clear()` without a broad score-explain rewrite. All Sets, arrays, and plain count objects exposed by `appState` should be defensive copies unless a later task explicitly documents a live handle.

- [x] **Step 4: Load `appState.js` before `app.js`**

In `docs/index.html`, add:

```html
    <script src="./js/core/appState.js"></script>
```

Place it after `./js/core/perfPanel.js` and before `./js/scoring/scoreModel.js`.

- [x] **Step 5: Instantiate state in `docs/app.js`**

Add namespace validation near the other core namespaces:

```javascript
const Urban95AppState = requireNamespace(window, "Urban95AppState");
const createAppState =
  requireNamespaceMember(Urban95AppState, "Urban95AppState", "create", "function");
const appState = createAppState();
```

Start with a mechanical migration of the most isolated fields:

```javascript
function getScoreMode() {
  return appState.getScoreMode();
}

function setScoreMode(value) {
  appState.setScoreMode(value);
}

function getWalkMinutesState() {
  return appState.getWalkMinutes();
}

function setWalkMinutesState(value) {
  appState.setWalkMinutes(value);
}
```

Then replace direct reads/writes for these fields first:

```text
scoreMode -> appState.getScoreMode() / appState.setScoreMode(value)
walkMinutes -> appState.getWalkMinutes() / appState.setWalkMinutes(value)
selectedAmenityTypes -> appState.getSelectedAmenityTypes() / appState.setSelectedAmenityTypes(value)
allFilterTypes -> appState.getAllFilterTypes() / appState.setAllFilterTypes(value)
lastFilterRadioSelection -> appState.getLastFilterRadioSelection() / appState.setLastFilterRadioSelection(value)
amenitiesInRadiusIds -> appState.getAmenitiesInRadiusIds() / appState.setAmenitiesInRadiusIds(value) / appState.clearRadiusIds()
latestRadiusCounts -> appState.getLatestRadiusCounts() / appState.setLatestRadiusCounts(value)
percentileSeriesCache -> appState.getPercentileSeriesCache()
buildingAmenityStatKeyCache -> appState.getBuildingAmenityStatKeyCache()
```

After this migration, remove the corresponding top-level variables from `docs/app.js`. Do not leave parallel `scoreMode`, `walkMinutes`, `selectedAmenityTypes`, `allFilterTypes`, `lastFilterRadioSelection`, `amenitiesInRadiusIds`, `latestRadiusCounts`, `percentileSeriesCache`, or `buildingAmenityStatKeyCache` variables in `app.js`. Keep the migration mechanical. Do not move score explain, dashboard, selected-building, dataset, or mode-controller logic in this task.

- [x] **Step 6: Update module configuration dependency wiring**

For `Urban95Controls.bind`, replace inline local variable access with state getters/setters:

```javascript
  getState: function () {
    return {
      scoreMode: appState.getScoreMode(),
      walkMinutes: appState.getWalkMinutes(),
      selectedAmenityTypes: appState.getSelectedAmenityTypes(),
      allFilterTypes: appState.getAllFilterTypes(),
      lastFilterRadioSelection: appState.getLastFilterRadioSelection(),
      currentMode: currentMode,
    };
  },
  setScoreMode: appState.setScoreMode,
  setWalkMinutes: appState.setWalkMinutes,
  setSelectedAmenityTypes: appState.setSelectedAmenityTypes,
  setAllFilterTypes: appState.setAllFilterTypes,
  setLastFilterRadioSelection: appState.setLastFilterRadioSelection,
```

If binding a method loses `this`, wrap it:

```javascript
  setScoreMode: function (value) { appState.setScoreMode(value); },
```

- [x] **Step 7: Run app-state verification**

Run:

```bash
npm run test:frontend
```

Expected: all tests pass.

- [x] **Step 8: Spec-compliance review subagent**

Dispatch:

```text
You are reviewing Task 2 of docs/superpowers/plans/2026-05-20-frontend-ownership-modularization.md in D:\Projects\Nur\urban95.

Do not edit files. Verify that docs/js/core/appState.js was added, loaded before app.js, and used to own focused mutable state without creating a generic globally mutable state object. Confirm behavior contracts are unchanged: score mode, walk minutes, selected amenity filters, derived caches, lookup-first analysis, and no-bundler loading.

Report findings first with file/line references. If clean, say SPEC COMPLIANCE CLEAN.
```

- [x] **Step 9: Code-quality review subagent**

Only after spec compliance is clean, dispatch:

```text
You are reviewing Task 2 code quality for docs/superpowers/plans/2026-05-20-frontend-ownership-modularization.md in D:\Projects\Nur\urban95.

Do not edit files. Look for appState becoming a dumping ground, mutation leaks through Sets/arrays, stale direct references in app.js, oversized dependency bags that got worse, and tests that miss copy-safety or cache behavior.

Report findings first with file/line references. If clean, say CODE QUALITY CLEAN.
```

## Task 3: Move Pure Runtime Helpers Behind `Urban95RuntimeData`

**Files:**
- Modify: `docs/js/core/runtimeData.js`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [x] **Step 1: Add failing runtime orchestration tests**

Add tests for new runtime helpers:

```javascript
test("runtime data validates point lookup sources and scans amenity types", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/runtimeData.js", browser);

  const runtime = browser.window.Urban95RuntimeData;
  assert.equal(runtime.hasValidPointsLookupSources(null), false);
  assert.equal(runtime.hasValidPointsLookupSources({ sources: { amenities: [] } }), false);
  assert.equal(
    runtime.hasValidPointsLookupSources({
      sources: {
        amenities: [{ lng: 34.8, lat: 31.2, type: "school" }],
      },
    }),
    true
  );

  const scan = runtime.scanAmenityTypesFromFeatures({
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { amenity_type: "school" } },
      { type: "Feature", properties: { amenity_type: "school" } },
      { type: "Feature", properties: { amenity_type: "park" } },
    ],
  });
  assert.deepEqual(scan.types, ["park", "school"]);
  assert.deepEqual(Array.from(scan.tw), ["park", "school"]);
});

test("runtime data warns when building score columns are incomplete", () => {
  const warnings = [];
  const browser = createBrowserContext({
    console: {
      ...console,
      warn(message) {
        warnings.push(String(message));
      },
    },
  });
  runBrowserScript("docs/js/core/runtimeData.js", browser);

  browser.window.Urban95RuntimeData.warnIfBuildingScoresIncomplete({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          building_id: 1,
          num_trees_5min: 2,
        },
      },
    ],
  });

  assert.ok(warnings.some((message) => message.includes("num_street_lights_*")));
  assert.ok(warnings.some((message) => message.includes("score_weighted_*")));
  assert.ok(warnings.some((message) => message.includes("score_weighted_sub_*")));
});
```

Add a small source-level guard that `app.js` no longer defines these helpers after extraction. This guard is secondary to the behavioral tests above. Also update the existing tests that currently assert local `app.js` loader/helper names so they validate `Urban95RuntimeData` ownership instead of preserving pre-refactor implementation shape:

```javascript
test("runtime orchestration helpers live in runtimeData instead of app coordinator", () => {
  const runtimeSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "core", "runtimeData.js"),
    "utf8"
  );
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");

  assert.match(runtimeSource, /function hasValidPointsLookupSources/);
  assert.match(runtimeSource, /function scanAmenityTypesFromFeatures/);
  assert.match(runtimeSource, /function warnIfBuildingScoresIncomplete/);
  assert.doesNotMatch(appSource, /function hasValidPointsLookupSources\s*\(/);
  assert.doesNotMatch(appSource, /function scanAmenityTypesFromFeatures\s*\(/);
  assert.doesNotMatch(appSource, /function warnIfBuildingScoresIncomplete\s*\(/);
});
```

- [x] **Step 2: Run the failing runtime test**

Run:

```bash
npm run test:frontend
```

Expected before implementation: FAIL because the helpers still live in `app.js`.

- [x] **Step 3: Move pure runtime helpers into `runtimeData.js`**

Move these functions from `docs/app.js` into `docs/js/core/runtimeData.js`:

```text
hasValidPointsLookupSources
warnIfBuildingScoresIncomplete
scanAmenityTypesFromFeatures
```

Expose them on `window.Urban95RuntimeData`:

```javascript
  window.Urban95RuntimeData = {
    normalizeBuildingLookup: normalizeBuildingLookup,
    featureCollectionFromPointRecords: featureCollectionFromPointRecords,
    compactIsochroneFeature: compactIsochroneFeature,
    hasValidPointsLookupSources: hasValidPointsLookupSources,
    warnIfBuildingScoresIncomplete: warnIfBuildingScoresIncomplete,
    scanAmenityTypesFromFeatures: scanAmenityTypesFromFeatures,
    createLoaders: createLoaders,
  };
```

- [x] **Step 4: Replace local app usage with runtime namespace members**

In `docs/app.js`, require the new members:

```javascript
const hasValidPointsLookupSources =
  requireNamespaceMember(Urban95RuntimeData, "Urban95RuntimeData", "hasValidPointsLookupSources", "function");
const warnIfBuildingScoresIncomplete =
  requireNamespaceMember(Urban95RuntimeData, "Urban95RuntimeData", "warnIfBuildingScoresIncomplete", "function");
const scanAmenityTypesFromFeatures =
  requireNamespaceMember(Urban95RuntimeData, "Urban95RuntimeData", "scanAmenityTypesFromFeatures", "function");
```

Remove the local function definitions from `docs/app.js`.

- [x] **Step 5: Run pure-runtime verification**

Run:

```bash
npm run test:frontend
```

Expected: all tests pass.

- [x] **Step 6: Spec-compliance review subagent**

Dispatch:

```text
You are reviewing Task 3 of docs/superpowers/plans/2026-05-20-frontend-ownership-modularization.md in D:\Projects\Nur\urban95.

Do not edit files. Verify pure runtime helpers moved behind Urban95RuntimeData without changing lookup-first analysis, warning behavior, generated/fallback URL behavior, or no-bundler loading. Confirm existing brittle app.js tests were updated to validate the new runtimeData ownership instead of preserving old local helper names.

Report findings first with file/line references. If clean, say SPEC COMPLIANCE CLEAN.
```

- [x] **Step 7: Code-quality review subagent**

Only after spec compliance is clean, dispatch:

```text
You are reviewing Task 3 code quality for docs/superpowers/plans/2026-05-20-frontend-ownership-modularization.md in D:\Projects\Nur\urban95.

Do not edit files. Look for hidden behavior changes, brittle source regex tests, duplicated helper implementations, and weak warning/lookup tests.

Report findings first with file/line references. If clean, say CODE QUALITY CLEAN.
```

## Task 4: Extract Point Data Loader Ownership

**Files:**
- Modify: `docs/js/core/runtimeData.js`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [x] **Step 1: Add point-data loader contract tests**

Add tests for `Urban95RuntimeData.createPointDataLoader` that prove in-flight and point-source state are owned by the runtime loader, not `appState` or `app.js` top-level variables:

```javascript
test("runtime point-data loader owns point source state and exposes loaded data", async () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/runtimeData.js", browser);

  const fetched = [];
  const loader = browser.window.Urban95RuntimeData.createPointDataLoader({
    urls: {
      trees: "./data/trees.geojson",
      streetLights: "./data/street_lights.geojson",
    },
    getScoreMode: () => "expanded",
    fetchJsonWithGzipFallback(url) {
      fetched.push(url);
      return Promise.resolve({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { amenity_type: "trees" } }],
      });
    },
    hasGeneratedArtifact: () => false,
    onSkippedTreesGeojson() {},
    onSkippedStreetLightsGeojson() {},
    onPointDataLoaded() {},
    onPointDataError(kind, err) {
      throw err;
    },
  });

  assert.equal(loader.getTreesDataSource(), "none");
  await loader.ensureExpandedPointDataLoaded();
  assert.deepEqual(fetched, ["./data/trees.geojson", "./data/street_lights.geojson"]);
  assert.equal(loader.getTreesDataSource(), "geojson");
  assert.equal(loader.getStreetLightsDataSource(), "geojson");
  assert.equal(loader.getAllTreesData().features.length, 1);
  assert.equal(loader.getAllStreetLightsData().features.length, 1);
  assert.equal(loader.canRefreshPointAnalysisAfterPointDataLoad(), true);
});
```

- [x] **Step 2: Run the failing point-data loader test**

Run:

```bash
npm run test:frontend
```

Expected before implementation: FAIL because `createPointDataLoader` does not exist.

- [x] **Step 3: Extract tree/street-light lazy loader factory**

Add a factory to `docs/js/core/runtimeData.js` that owns in-flight flags and source-state transitions while leaving UI refresh callbacks injected:

```javascript
  function createPointDataLoader(deps) {
    var allTreesData = null;
    var allStreetLightsData = null;
    var treesDataSource = "none";
    var streetLightsDataSource = "none";
    var treesLoadStarted = false;
    var streetLightsLoadStarted = false;
    var treesGeojsonLoadInFlight = false;
    var streetLightsGeojsonLoadInFlight = false;
    var treesGeojsonLoadPromise = null;
    var streetLightsGeojsonLoadPromise = null;

    function loadTreesIfNeeded() {
      var scoreMode = deps.getScoreMode();
      var needsAuthoritativeGeojson =
        scoreMode === "expanded" && treesDataSource !== "geojson";
      if (treesGeojsonLoadInFlight) return treesGeojsonLoadPromise || Promise.resolve(null);
      if (
        (treesLoadStarted && treesDataSource !== "lookup") ||
        (allTreesData && !needsAuthoritativeGeojson)
      ) {
        return Promise.resolve(null);
      }
      if (deps.hasGeneratedArtifact("trees") && scoreMode === "weighted") {
        deps.onSkippedTreesGeojson();
        return Promise.resolve(null);
      }

      treesLoadStarted = true;
      treesGeojsonLoadInFlight = true;
      treesGeojsonLoadPromise = deps.fetchJsonWithGzipFallback(deps.urls.trees)
        .then(function (treesData) {
          if (!treesData) throw new Error("Empty tree data");
          allTreesData = treesData;
          treesDataSource = "geojson";
          deps.onPointDataLoaded("trees", treesData);
          return loadStreetLightsIfNeeded();
        })
        .catch(function (err) {
          deps.onPointDataError("trees", err);
          treesLoadStarted = false;
        })
        .finally(function () {
          treesGeojsonLoadInFlight = false;
          treesGeojsonLoadPromise = null;
        });
      return treesGeojsonLoadPromise;
    }

    function loadStreetLightsIfNeeded() {
      var scoreMode = deps.getScoreMode();
      var needsAuthoritativeGeojson =
        scoreMode === "expanded" && streetLightsDataSource !== "geojson";
      if (streetLightsGeojsonLoadInFlight) return streetLightsGeojsonLoadPromise || Promise.resolve(null);
      if (
        (streetLightsLoadStarted && streetLightsDataSource !== "lookup") ||
        (allStreetLightsData && !needsAuthoritativeGeojson)
      ) {
        return Promise.resolve(null);
      }
      if (deps.hasGeneratedArtifact("street_lights") && scoreMode === "weighted") {
        deps.onSkippedStreetLightsGeojson();
        return Promise.resolve(null);
      }

      streetLightsLoadStarted = true;
      streetLightsGeojsonLoadInFlight = true;
      streetLightsGeojsonLoadPromise = deps.fetchJsonWithGzipFallback(deps.urls.streetLights)
        .then(function (data) {
          if (!data) throw new Error("Empty street light data");
          allStreetLightsData = data;
          streetLightsDataSource = "geojson";
          deps.onPointDataLoaded("street-lights", data);
        })
        .catch(function (err) {
          deps.onPointDataError("street-lights", err);
          streetLightsLoadStarted = false;
        })
        .finally(function () {
          streetLightsGeojsonLoadInFlight = false;
          streetLightsGeojsonLoadPromise = null;
        });
      return streetLightsGeojsonLoadPromise;
    }

    function ensureExpandedPointDataLoaded() {
      if (deps.getScoreMode() !== "expanded") return Promise.resolve(null);
      var loads = [];
      if (treesDataSource !== "geojson") loads.push(loadTreesIfNeeded());
      if (streetLightsDataSource !== "geojson") loads.push(loadStreetLightsIfNeeded());
      if (loads.length === 0) return Promise.resolve(null);
      return Promise.all(loads).then(function () { return null; });
    }

    function canRefreshPointAnalysisAfterPointDataLoad() {
      return (
        deps.getScoreMode() !== "expanded" ||
        (treesDataSource === "geojson" && streetLightsDataSource === "geojson")
      );
    }

    return {
      loadTreesIfNeeded: loadTreesIfNeeded,
      loadStreetLightsIfNeeded: loadStreetLightsIfNeeded,
      ensureExpandedPointDataLoaded: ensureExpandedPointDataLoaded,
      canRefreshPointAnalysisAfterPointDataLoad: canRefreshPointAnalysisAfterPointDataLoad,
      getAllTreesData: function () { return allTreesData; },
      getAllStreetLightsData: function () { return allStreetLightsData; },
      getTreesDataSource: function () { return treesDataSource; },
      getStreetLightsDataSource: function () { return streetLightsDataSource; },
    };
  }
```

Expose `createPointDataLoader` on `Urban95RuntimeData`.

- [x] **Step 4: Wire point-data loader in `app.js`**

Create the point-data loader in `docs/app.js` after `Urban95MapRenderers.configure` dependencies are available:

```javascript
const pointDataLoader = Urban95RuntimeData.createPointDataLoader({
  urls: {
    trees: TREES_URL,
    streetLights: STREET_LIGHTS_URL,
  },
  fetchJsonWithGzipFallback: fetchJsonWithGzipFallback,
  hasGeneratedArtifact: hasGeneratedArtifact,
  getScoreMode: function () {
    return appState.getScoreMode();
  },
  onSkippedTreesGeojson: function () {
    console.log("[Load] trees: skipped full GeoJSON fetch for weighted PMTiles display");
    Urban95MapRenderers.updateTreesSource();
  },
  onSkippedStreetLightsGeojson: function () {
    console.log("[Load] street-lights: skipped full GeoJSON fetch for weighted PMTiles display");
    Urban95MapRenderers.updateStreetLightsSource();
  },
  onPointDataLoaded: function (kind, data) {
    console.log("[Load] " + kind + ": features", (data.features || []).length);
    buildFilterItems(allAmenityTypes);
    Urban95MapRenderers.updateAmenitiesSource();
    Urban95MapRenderers.updateTreesSource();
    Urban95MapRenderers.updateStreetLightsSource();
    Urban95MapRenderers.updateBuildingColors();
    if (
      selectedBuildingCentroid &&
      pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad()
    ) {
      Urban95Selection.selectBuilding(selectedBuildingCentroid, false);
    }
  },
  onPointDataError: function (kind, err) {
    console.error("Failed to load " + kind + ":", err);
  },
});
```

Then replace local calls:

```text
loadTreesIfNeeded() -> pointDataLoader.loadTreesIfNeeded()
loadStreetLightsIfNeeded() -> pointDataLoader.loadStreetLightsIfNeeded()
ensureExpandedPointDataLoaded() -> pointDataLoader.ensureExpandedPointDataLoaded()
canRefreshPointAnalysisAfterPointDataLoad() -> pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad()
```

Remove the old local function definitions after the replacements compile.

- [x] **Step 5: Rewire point-data consumers**

Replace app/module reads of `allTreesData`, `allStreetLightsData`, `treesDataSource`, and `streetLightsDataSource` with point-data loader getters:

```text
allTreesData -> pointDataLoader.getAllTreesData()
allStreetLightsData -> pointDataLoader.getAllStreetLightsData()
treesDataSource -> pointDataLoader.getTreesDataSource()
streetLightsDataSource -> pointDataLoader.getStreetLightsDataSource()
```

Update the dependencies passed to `Urban95Controls.bind`, `Urban95MapRenderers.configure`, and any local helpers so they use the point-data loader getters. After this replacement, remove the corresponding top-level variables from `docs/app.js`.

- [x] **Step 6: Preserve score-mode amenity switching in `app.js` but use state accessors**

Keep `applyScoreModeAmenities` in `app.js` for this plan, but make it read/write through `appState`. It should still:

```text
expanded mode -> legacy amenities when available
weighted mode -> clean amenities
clear amenitiesInRadiusIds
rebuild filter items
sync score/filter UI
wait for authoritative tree/street-light GeoJSON in expanded mode
refresh map sources and selected building only after data is ready
```

Do not move score-mode UI or map renderer calls in this task.

- [x] **Step 7: Run point-data loader verification**

Run:

```bash
npm run test:frontend
```

Expected: all tests pass.

- [x] **Step 8: Browser network proof**

Use the existing live server or start one:

```bash
npm run start
```

Open:

```text
http://localhost:8080/docs/index.html
```

Verify manually or with a temporary Playwright probe:

```text
Startup loads without page errors.
Startup requests buildings_accessibility.pmtiles and buildings_lookup.json.gz when generated artifacts exist.
Startup does not request buildings_accessibility.geojson, isochrones.geojson, amenities_new.geojson, or amenities_all.geojson.
Switching to Amenities Focus can request points_lookup.json.gz, isochrones_lookup.json.gz, trees.geojson.gz, and street_lights.geojson.gz.
Building click opens the score sidebar.
Citywide mode opens the citywide modal.
```

Record exact observed request paths in the task notes.

- [x] **Step 9: Spec-compliance review subagent**

Dispatch:

```text
You are reviewing Task 4 of docs/superpowers/plans/2026-05-20-frontend-ownership-modularization.md in D:\Projects\Nur\urban95.

Do not edit files. Verify runtime helpers and point-data loading moved behind Urban95RuntimeData without changing lookup-first analysis, PMTiles render-only behavior, expanded-mode authoritative tree/street-light loading, selected-building refresh timing, or generated/fallback URL behavior.

Report findings first with file/line references. If clean, say SPEC COMPLIANCE CLEAN.
```

- [x] **Step 10: Code-quality review subagent**

Only after spec compliance is clean, dispatch:

```text
You are reviewing Task 4 code quality for docs/superpowers/plans/2026-05-20-frontend-ownership-modularization.md in D:\Projects\Nur\urban95.

Do not edit files. Look for hidden state duplication between app.js, appState.js, and runtimeData.js; callback bags that are too broad; promise/in-flight bugs; source-level tests that are brittle; and any accidental behavior changes disguised as refactor.

Report findings first with file/line references. If clean, say CODE QUALITY CLEAN.
```

## Task 5: Final Verification And Handoff Notes

**Files:**
- Modify: `docs/superpowers/plans/2026-05-20-frontend-ownership-modularization.md`
- Modify only if needed: `tests/frontend/module_contracts.test.js`

- [x] **Step 1: Run static frontend tests**

Run:

```bash
npm run test:frontend
```

Expected:

```text
# pass 45 or more
# fail 0
```

If the test count changes because new tests were added, record the exact pass count.

- [x] **Step 2: Run browser workflow proof**

Use `http://localhost:8080/docs/index.html`.

Verify:

```text
Initial load: no page errors.
Welcome modal can be dismissed.
Building mode: targeted building click opens the score sidebar with building id and score content.
Score model: switching to Amenities Focus succeeds.
Neighborhood mode: mode switch succeeds and neighborhood click does not throw.
Citywide mode: citywide modal opens and renders chart/dashboard content.
Mobile smoke at 390x844: initial load and citywide modal have no script errors.
Network: generated-artifact startup does not eagerly fetch full buildings/isochrones/amenities GeoJSON.
```

- [x] **Step 3: Check no accidental workflow violations**

Run:

```bash
git status --short
```

Expected: only intended plan/code/test files are modified. No commits and no git worktrees are created.

- [x] **Step 4: Add implementation result notes to this plan**

Append a section:

```markdown
---

## Implementation Results

- Date:
- Implementer:
- Tasks completed:
- Tests run:
- Browser verification:
- Subagent reviews:
- Known residual risks:
- Files changed:
- No commits:
- No git worktrees:
```

Fill every field with concrete results. For unknown or skipped verification, write `Not run` plus the reason.

- [x] **Step 5: Final spec-compliance review subagent**

Dispatch:

```text
You are doing the final spec-compliance review for docs/superpowers/plans/2026-05-20-frontend-ownership-modularization.md in D:\Projects\Nur\urban95.

Do not edit files. Verify every hard constraint and task goal: no commits, no worktrees, no bundler, lookup-first analysis preserved, PMTiles render-only behavior preserved, config ownership improved, app state ownership improved, runtime data orchestration improved, and browser verification recorded.

Report findings first with file/line references. If clean, say FINAL SPEC COMPLIANCE CLEAN.
```

- [x] **Step 6: Final code-quality review subagent**

Only after final spec compliance is clean, dispatch:

```text
You are doing the final code-quality review for docs/superpowers/plans/2026-05-20-frontend-ownership-modularization.md in D:\Projects\Nur\urban95.

Do not edit files. Review maintainability of the completed refactor. Focus on whether app.js is now a thinner coordinator, whether appState and runtimeData have clear boundaries, whether tests protect the important contracts, and whether the next extraction should be score explain or map mode controller.

Report findings first with file/line references. If clean, say FINAL CODE QUALITY CLEAN.
```

## Out Of Scope For This Plan

- Extracting `scoreSidebar` presentation helpers further.
- Extracting a house/neighborhood/citywide `mapModeController`.
- Splitting CSS.
- Adding Playwright as a project dependency.
- Changing generated data schemas or Python preprocessing.
- Optimizing PMTiles generation or changing Tippecanoe flags.

## Expected Outcome

- `docs/app.js` should lose roughly 800-1,200 lines or equivalent ownership complexity.
- `Urban95Config` should be the authoritative source for static URLs and generated fallback path names.
- `Urban95AppState` should own mutable state through focused accessors.
- `Urban95RuntimeData` should own runtime-data helper logic and point-data loading orchestration.
- Existing frontend tests should pass, with new tests covering script order, app-state contracts, and runtime helper ownership.
- Browser verification should prove the app still loads, selects buildings, switches score modes, opens neighborhood/citywide flows, and preserves generated-artifact startup behavior.

---

## Implementation Results

- Date: 2026-05-20
- Implementer: Codex, using task-by-task subagent-driven development.
- Tasks completed: Tasks 1-5 completed through per-task verification, spec-compliance review, and code-quality review gates.
- Tests run: `node --check docs/app.js`; `node --check docs/js/core/appState.js`; `node --check docs/js/core/runtimeData.js`; `node --check docs/js/core/config.js`; `node --check docs/js/core/dataArtifacts.js`; `node --check docs/js/map/mapLayers.js`; `npm run test:frontend` passed 69/69.
- Browser verification: Used `http://localhost:8081/docs/index.html` because port 8080 was already listening but timed out. Playwright workflow proof passed: initial load had no page errors; welcome modal dismissed; Amenities Focus switch succeeded; neighborhood mode and click did not throw; citywide mode opened dashboard/modal content; 390x844 mobile smoke had no script errors. Focused building proof clicked `(545, 522)` and opened the score sidebar for `Building #272` with score content.
- Browser network verification: Startup requests observed: `/docs/data/buildings_accessibility.pmtiles`, `/docs/data/buildings_lookup.json.gz`, `/docs/data/neighborhood_surface.pmtiles`, `/docs/data/parks.geojson`, `/docs/data/pmtiles_manifest.js`, `/docs/data/points_lookup.json.gz`, `/docs/data/street_lights.pmtiles`, `/docs/data/trees.pmtiles`. Startup did not request `/docs/data/buildings_accessibility.geojson`, `/docs/data/isochrones.geojson`, `/docs/data/amenities_new.geojson`, or `/docs/data/amenities_all.geojson`. After Amenities Focus path, `/docs/data/isochrones_lookup.json.gz`, `/docs/data/trees.geojson.gz`, and `/docs/data/street_lights.geojson.gz` were observed.
- Subagent reviews: Task 1 spec and code-quality clean; Task 2 spec and code-quality clean after cache API tightening; Task 3 spec and code-quality clean after runtime fail-fast coverage; Task 4 spec and code-quality clean after lookup-upgrade coverage and source-test cleanup. Final reviews pending below.
- Known residual risks: Browser proof used a temporary Playwright install outside the repo and a temporary local server on port 8081. The point-data loader callback bag remains intentionally coordinator-facing for this pass; future extraction can narrow it when map mode or score explain ownership moves.
- Files changed: `docs/app.js`, `docs/index.html`, `docs/js/core/appState.js`, `docs/js/core/config.js`, `docs/js/core/dataArtifacts.js`, `docs/js/core/runtimeData.js`, `docs/js/map/mapLayers.js`, `tests/frontend/module_contracts.test.js`, `docs/superpowers/plans/2026-05-20-frontend-ownership-modularization.md`.
- No commits: Confirmed. `git log -1 --oneline` remains `16b3c7a refactor(map): modularize static map app ...`.
- No git worktrees: Confirmed. `git worktree list` shows only `D:/Projects/Nur/urban95  16b3c7a [refactoring]`.
