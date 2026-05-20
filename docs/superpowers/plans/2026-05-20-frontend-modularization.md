# Frontend Modularization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the static Urban95 map frontend from a giant `docs/app.js` into grouped, no-bundler JavaScript modules with clean runtime contracts and regression tests.

**Architecture:** Keep the GitHub Pages static-site contract: plain `<script>` tags, CDN globals, no bundler, no build output directory, and `docs/` remains the published app. Introduce grouped IIFE modules under `docs/js/` that expose explicit `window.Urban95...` namespaces, while `docs/app.js` shrinks into the app coordinator. Preserve the PMTiles/rendering vs JSON lookup/analysis boundary: PMTiles are display artifacts, lookup/full JSON remains the source for selection, scoring, and point-in-polygon behavior.

**Tech Stack:** HTML/CSS/vanilla JavaScript, MapLibre GL JS, PMTiles protocol, Turf.js, deck.gl, Chart.js, Node.js built-in `node:test` for lightweight module/contract checks, existing `http-server` for manual browser verification.

**Hard Constraints**
- No commits.
- No git worktrees.
- Preserve unrelated dirty/untracked files.
- Do not add a bundler in this plan.
- Keep Python pipeline/scripts out of scope except for reading generated data contracts when needed.
- Keep `docs/style.css` as one file unless a task explicitly touches a UI module and needs a tiny CSS-adjacent cleanup. Do not split CSS in this plan.
- Do not change map behavior, scoring formulas, data filenames, generated artifact schemas, or PMTiles/lookup semantics as part of the modularization.

---

## Perspective Ensemble

### Panel A - Council
- **Static deployment simplicity:** Concern -> a bundler would make imports cleaner but change the deployment model. Flag -> adding Vite while behavior is still tangled would mix packaging migration with behavior-preserving refactor. Counter-move -> use grouped plain scripts first and keep `docs/` directly publishable.
- **Refactor safety:** Concern -> splitting by folder names alone can smear global state across many files. Flag -> `docs/app.js` currently shares mutable state between loaders, map rendering, selection, score sidebar, dashboards, and controls. Counter-move -> extract stable foundations first: config, loaders, perf, pure score model, then UI/map modules.
- **Performance contract:** Concern -> PMTiles can be mistaken for lookup storage. Flag -> building selection, isochrones, and point-in-polygon counts must not depend on current rendered vector tiles. Counter-move -> keep `runtimeData` and lookup loaders in `core/`, and add contract tests that check generated lookup usage remains addressable.
- **Testing pragmatism:** Concern -> no frontend test harness currently exists. Flag -> adding a heavy browser framework during a move increases setup cost. Counter-move -> start with Node `node:test` static/module contract checks plus manual browser verification; add Playwright later only if behavior bugs demand it.

### Panel B - Adversarial
- **Attack target:** A frontend modularization plan that claims safety because files are smaller.
- **Path/order failure:** Vulnerability -> plain scripts depend on strict load order. Failure scenario -> `app.js` runs before `Urban95Config` or `Urban95Loaders`, causing a blank map. Mitigation/probe -> add `tests/frontend/module_contracts.test.js` to parse `docs/index.html` script order and execute core modules in a VM.
- **State leakage failure:** Vulnerability -> modules read/write globals directly instead of exposing interfaces. Failure scenario -> `scoreSidebar.js` and `selection.js` both mutate selected-building state and disagree after a mode switch. Mitigation/probe -> keep shared state in `app.js` during early tasks; modules accept dependencies/arguments and return values where practical.
- **Scoring drift failure:** Vulnerability -> moving score helpers can accidentally change field names or calculations. Failure scenario -> colors/sidebar rankings differ from the current app while tests only assert namespace existence. Mitigation/probe -> score-model extraction must include fixture-style tests for representative weighted and expanded score calculations.
- **PMTiles contract failure:** Vulnerability -> map module extraction hides render-vs-lookup distinctions. Failure scenario -> building click works only after zooming because vector tiles became the source of truth. Mitigation/probe -> plan keeps selection/radius logic later, after config/loaders/score extraction, and manual checks include clicking in Building mode and Amenities Focus point counts.

### Falsifiers / Early Warnings
- `docs/app.js` shrinks but newly created modules still depend on arbitrary globals from each other.
- `docs/index.html` script order becomes hard to reason about or duplicates CDN/runtime dependencies.
- Tests only assert files exist and do not catch namespace/load-order mistakes.
- Default Urban95 startup fetches `buildings_accessibility.geojson(.gz)`, `isochrones.geojson`, or large amenity GeoJSONs again when generated lookup artifacts exist.
- Amenities Focus tree/light counts differ after module extraction.

---

## Target File Structure

```text
docs/
  index.html
  style.css
  app.js

  js/
    core/
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

  data/
    pmtiles_manifest.js
    ...

tests/
  frontend/
    helpers/
      loadBrowserScript.js
    module_contracts.test.js
    score_model.test.js
```

## File Responsibilities

- `docs/app.js`: App coordinator only. Owns app boot, central mutable state, mode orchestration, and dependency wiring during this refactor.
- `docs/js/core/config.js`: Data URLs, CDN URLs, icon base, mode names, source/layer IDs, feature-state keys, score state keys, zoom thresholds, and app constants.
- `docs/js/core/dataArtifacts.js`: Current generated artifact/PMTiles manifest helpers moved from `docs/dataArtifacts.js`.
- `docs/js/core/loaders.js`: Gzip JSON fetch, script-once loader, and lazy CDN loader helpers for deck.gl and Chart.js.
- `docs/js/core/runtimeData.js`: Current compact lookup adapters and loader factory moved from `docs/runtimeData.js`.
- `docs/js/core/perfPanel.js`: Current `urban95Perf` helper.
- `docs/js/scoring/scoreModel.js`: Pure score constants/math/format helpers that do not touch DOM, MapLibre, deck.gl, or app mutable state.
- `docs/js/map/mapLayers.js`: MapLibre source/layer factories and declarative layer definitions.
- `docs/js/map/mapRenderers.js`: Functions that update map/deck visual state from explicit arguments.
- `docs/js/map/selection.js`: Nearest-building indexing, selected building feature-state, isochrone lookup, radius inclusion logic.
- `docs/js/ui/controls.js`: DOM binding for filters, radius, score model, mode toggle, and point visibility controls.
- `docs/js/ui/scoreSidebar.js`: Building score sidebar rendering/open/close/fit behavior.
- `docs/js/ui/dashboards.js`: Neighborhood and citywide modal/chart rendering.
- `docs/js/ui/infoModal.js`: About/how-to modal behavior.
- `tests/frontend/helpers/loadBrowserScript.js`: Node VM helper for executing browser IIFE scripts with a fake `window`.
- `tests/frontend/module_contracts.test.js`: Static/script-order and namespace tests.
- `tests/frontend/score_model.test.js`: Pure score-model tests for extracted scoring helpers.

---

## Task 1: Add Frontend Test Harness And Guardrails

**Files:**
- Modify: `package.json`
- Create: `tests/frontend/helpers/loadBrowserScript.js`
- Create: `tests/frontend/module_contracts.test.js`

- [x] **Step 1: Add a frontend test script to `package.json`**

Modify the `scripts` object in `package.json` to include `test:frontend`:

```json
"scripts": {
  "start": "http-server . -c-1",
  "start:docs": "http-server docs -c-1",
  "test:frontend": "node --test tests/frontend/module_contracts.test.js"
}
```

- [x] **Step 2: Create the browser-script VM helper**

Create `tests/frontend/helpers/loadBrowserScript.js`:

```javascript
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createBrowserContext(overrides = {}) {
  const calls = [];
  const fakeWindow = {
    location: { href: "http://localhost:8080/docs/index.html" },
    URBAN95_GENERATED_ARTIFACTS: {},
    pmtiles: { Protocol: function Protocol() {} },
    console,
    document: {
      createElement(tagName) {
        return {
          tagName,
          async: false,
          set src(value) {
            this._src = value;
          },
          get src() {
            return this._src;
          },
          addEventListener(type, handler) {
            this["on" + type] = handler;
          },
        };
      },
      head: {
        appendChild(node) {
          calls.push({ type: "appendChild", node });
          if (typeof node.onload === "function") node.onload();
        },
      },
    },
    fetch() {
      throw new Error("fetch is not available in the module contract VM");
    },
    ...overrides,
  };
  fakeWindow.window = fakeWindow;
  fakeWindow.globalThis = fakeWindow;
  return { context: vm.createContext(fakeWindow), window: fakeWindow, calls };
}

function runBrowserScript(relativePath, browserContext) {
  const absolutePath = path.resolve(__dirname, "..", "..", "..", relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  vm.runInContext(source, browserContext.context, { filename: relativePath });
  return browserContext.window;
}

module.exports = {
  createBrowserContext,
  runBrowserScript,
};
```

- [x] **Step 3: Add script order and namespace tests**

Create `tests/frontend/module_contracts.test.js`:

```javascript
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserContext, runBrowserScript } = require("./helpers/loadBrowserScript");

function normalizeLocalScriptPath(scriptPath) {
  if (/^(?:[a-z]+:)?\/\//i.test(scriptPath)) return scriptPath;
  return path.posix.normalize(scriptPath).replace(/^(?:\.\/)+/, "");
}

function scriptSourcesFromIndex() {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "index.html"), "utf8");
  return [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map((match) => match[1]);
}

function requireScriptIndex(scripts, expectedPath) {
  const normalizedExpectedPath = normalizeLocalScriptPath(expectedPath);
  const scriptIndex = scripts.findIndex((scriptPath) => normalizeLocalScriptPath(scriptPath) === normalizedExpectedPath);
  assert.notEqual(scriptIndex, -1, "docs/index.html must load " + expectedPath);
  return scriptIndex;
}

test("index loads core frontend modules before app.js", () => {
  const scripts = scriptSourcesFromIndex();
  const appIndex = requireScriptIndex(scripts, "./app.js");

  assert.ok(requireScriptIndex(scripts, "./data/pmtiles_manifest.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/core/config.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/core/dataArtifacts.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/core/loaders.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/core/runtimeData.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/core/perfPanel.js") < appIndex);
});

test("core modules expose stable Urban95 namespaces", () => {
  const browser = createBrowserContext({
    URBAN95_GENERATED_ARTIFACTS: {
      buildings: {
        status: "built",
        output: "./data/buildings_accessibility.pmtiles",
        source_layer: "buildings",
      },
    },
  });

  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/core/dataArtifacts.js", browser);
  runBrowserScript("docs/js/core/loaders.js", browser);
  runBrowserScript("docs/js/core/runtimeData.js", browser);
  runBrowserScript("docs/js/core/perfPanel.js", browser);

  assert.equal(browser.window.Urban95Config.urls.buildings, "./data/buildings_accessibility.geojson");
  assert.equal(typeof browser.window.Urban95DataArtifacts.hasGeneratedArtifact, "function");
  assert.equal(typeof browser.window.Urban95Loaders.fetchJsonWithGzipFallback, "function");
  assert.equal(typeof browser.window.Urban95RuntimeData.createLoaders, "function");
  assert.equal(typeof browser.window.urban95Perf.phase, "function");
});

const buildingRenderedFeaturesLayerPattern =
  /(?:\bmap\s*\.\s*)?queryRenderedFeatures\s*\([\s\S]*?\{[\s\S]*?\blayers\s*:\s*\[[\s\S]*?(?:"[^"]*buildings[^"]*"|'[^']*buildings[^']*'|BUILDINGS_VECTOR_LAYER_ID)[\s\S]*?\][\s\S]*?\}[\s\S]*?\)/;

test("selection and runtime modules preserve lookup-first analysis contracts", () => {
  const runtimeSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "js", "core", "runtimeData.js"), "utf8");
  assert.match(runtimeSource, /loadBuildingsRuntimeData/);
  assert.match(runtimeSource, /loadIsochronesLookup/);
  assert.match(runtimeSource, /loadPointsLookup/);

  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  assert.match(appSource, /loadBuildingsRuntimeData/);
  assert.match(appSource, /loadPointsLookup/);
  assert.doesNotMatch(appSource, buildingRenderedFeaturesLayerPattern);
});
```

- [x] **Step 4: Run the test to verify it fails before modules move**

Run:

```bash
npm run test:frontend
```

Expected:
- The command exits non-zero.
- Failure mentions missing `./js/core/config.js` in `docs/index.html` or an `ENOENT` for `docs/js/core/config.js`.

---

## Task 2: Create Core Module Folder And Move Existing Helpers

**Files:**
- Create: `docs/js/core/config.js`
- Move: `docs/dataArtifacts.js` -> `docs/js/core/dataArtifacts.js`
- Move: `docs/runtimeData.js` -> `docs/js/core/runtimeData.js`
- Create: `docs/js/core/loaders.js`
- Create: `docs/js/core/perfPanel.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Test: `tests/frontend/module_contracts.test.js`

- [x] **Step 1: Create `docs/js/core/config.js`**

Create this file:

```javascript
(function () {
  var BASE = "./data";
  var ICONS_BASE = "./icons";

  var urls = {
    buildings: BASE + "/buildings_accessibility.geojson",
    parks: BASE + "/parks.geojson",
    trees: BASE + "/trees.geojson",
    streetLights: BASE + "/street_lights.geojson",
    amenitiesClean: BASE + "/amenities_new.geojson",
    amenitiesLegacy: BASE + "/amenities_all.geojson",
    isochrones: BASE + "/isochrones.geojson",
    neighborhoods: BASE + "/neighborhoods.geojson",
    neighborhoodSurface: BASE + "/neighborhood_surface.geojson",
    neighborhoodCharts: BASE + "/neighborhood_charts.json",
    citywideStats: BASE + "/citywide_stats.json",
  };

  var cdn = {
    deckGl: "https://unpkg.com/deck.gl@9.0.31/dist.min.js",
    chartJs: "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js",
  };

  var sources = {
    buildings: "buildings",
    trees: "trees",
    streetLights: "street-lights",
    neighborhoods: "neighborhoods",
    neighborhoodSurface: "neighborhood-surface",
  };

  var layers = {
    buildingsFill: "buildings-fill",
    buildingsSelected: "buildings-selected",
    treeIcons: "tree-icons",
    treeIconsVector: "tree-icons-vector",
    streetLightIcons: "street-light-icons",
    streetLightIconsVector: "street-light-icons-vector",
  };

  var stateKeys = {
    buildingScorePercent: "sym_pct",
    buildingSelected: "selected",
  };

  var modes = {
    house: "house",
    neighborhood: "neighborhood",
    citywide: "citywide",
    weighted: "weighted",
    expanded: "expanded",
  };

  var detailPointsMinZoom = 15;

  window.Urban95Config = {
    BASE: BASE,
    ICONS_BASE: ICONS_BASE,
    urls: urls,
    cdn: cdn,
    sources: sources,
    layers: layers,
    stateKeys: stateKeys,
    modes: modes,
    detailPointsMinZoom: detailPointsMinZoom,
  };
})();
```

- [x] **Step 2: Move helper files into `docs/js/core/`**

Move the files without changing their contents yet:

```text
docs/dataArtifacts.js -> docs/js/core/dataArtifacts.js
docs/runtimeData.js -> docs/js/core/runtimeData.js
```

- [x] **Step 3: Create `docs/js/core/loaders.js` from current app helpers**

Move the bodies of `shouldTryGzip`, `parseGzipJsonResponse`, `fetchJsonWithGzipFallback`, `loadExternalScriptOnce`, `ensureDeckGlLoaded`, and `ensureChartJsLoaded` from `docs/app.js` into this namespace:

```javascript
(function () {
  var loadedScripts = new Map();

  function shouldTryGzip(url) {
    var config = window.Urban95Config;
    var artifacts = window.Urban95DataArtifacts || {};
    var generatedUrls = artifacts.urls || {};
    return (
      url === config.urls.buildings ||
      url === generatedUrls.buildingsLookup ||
      url === config.urls.isochrones ||
      url === generatedUrls.isochronesLookup ||
      url === generatedUrls.pointsLookup ||
      url === config.urls.trees ||
      url === config.urls.streetLights ||
      url === config.urls.amenitiesLegacy
    );
  }

  async function parseGzipJsonResponse(response) {
    if (!response.ok) throw new Error("HTTP " + response.status);
    if (typeof DecompressionStream !== "function" || !response.body) {
      throw new Error("Browser does not support gzip stream decompression");
    }
    var decompressedStream = response.body.pipeThrough(new DecompressionStream("gzip"));
    var text = await new Response(decompressedStream).text();
    return JSON.parse(text);
  }

  async function fetchJsonWithGzipFallback(url, options) {
    var opts = options || {};
    var required = opts.required !== false;
    var loadStartedAt = performance.now();
    var loadMode = "plain";
    console.log("[Load] fetch start:", url);
    if (shouldTryGzip(url)) {
      var gzipUrl = url + ".gz";
      try {
        loadMode = "gzip";
        var gzFetchStartedAt = performance.now();
        var gzResponse = await fetch(gzipUrl);
        console.log(
          "[Load] gzip response received:",
          gzipUrl,
          Math.round(performance.now() - gzFetchStartedAt) + "ms",
          "status",
          gzResponse.status
        );
        var gzParseStartedAt = performance.now();
        var gzParsed = await parseGzipJsonResponse(gzResponse);
        console.log(
          "[Load] gzip parse done:",
          gzipUrl,
          Math.round(performance.now() - gzParseStartedAt) + "ms"
        );
        console.log(
          "[Load] fetch complete:",
          url,
          "mode=" + loadMode,
          "total=" + Math.round(performance.now() - loadStartedAt) + "ms"
        );
        return gzParsed;
      } catch (err) {
        console.warn("Compressed fetch failed, falling back to plain file:", gzipUrl, err);
        loadMode = "plain-fallback";
      }
    }

    var plainFetchStartedAt = performance.now();
    var response = await fetch(url);
    console.log(
      "[Load] plain response received:",
      url,
      Math.round(performance.now() - plainFetchStartedAt) + "ms",
      "status",
      response.status
    );
    if (!response.ok) {
      if (required) throw new Error("HTTP " + response.status + " " + url);
      console.warn(
        "[Load] optional fetch missing:",
        url,
        "mode=" + loadMode,
        "total=" + Math.round(performance.now() - loadStartedAt) + "ms"
      );
      return null;
    }
    var plainParseStartedAt = performance.now();
    var parsed = await response.json();
    console.log(
      "[Load] plain parse done:",
      url,
      Math.round(performance.now() - plainParseStartedAt) + "ms"
    );
    console.log(
      "[Load] fetch complete:",
      url,
      "mode=" + loadMode,
      "total=" + Math.round(performance.now() - loadStartedAt) + "ms"
    );
    return parsed;
  }

  function loadExternalScriptOnce(src) {
    if (loadedScripts.has(src)) {
      return loadedScripts.get(src);
    }
    var promise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error("Failed to load script: " + src));
      };
      document.head.appendChild(script);
    });
    loadedScripts.set(src, promise);
    return promise;
  }

  function ensureDeckGlLoaded() {
    if (window.deck) return Promise.resolve(window.deck);
    return loadExternalScriptOnce(window.Urban95Config.cdn.deckGl).then(function () {
      return window.deck;
    });
  }

  function ensureChartJsLoaded() {
    if (window.Chart) return Promise.resolve(window.Chart);
    return loadExternalScriptOnce(window.Urban95Config.cdn.chartJs).then(function () {
      return window.Chart;
    });
  }

  window.Urban95Loaders = {
    shouldTryGzip: shouldTryGzip,
    parseGzipJsonResponse: parseGzipJsonResponse,
    fetchJsonWithGzipFallback: fetchJsonWithGzipFallback,
    loadExternalScriptOnce: loadExternalScriptOnce,
    ensureDeckGlLoaded: ensureDeckGlLoaded,
    ensureChartJsLoaded: ensureChartJsLoaded,
  };
})();
```

If the current `docs/app.js` helper bodies differ from this snippet, preserve current behavior exactly and only wrap them in `window.Urban95Loaders`.

- [x] **Step 4: Create `docs/js/core/perfPanel.js` from current `urban95Perf`**

Move the entire current `var urban95Perf = (function () { ... })();` block from `docs/app.js` into `docs/js/core/perfPanel.js`.

The file must end by exposing the same global name:

```javascript
window.urban95Perf = urban95Perf;
```

- [x] **Step 5: Update `docs/index.html` script paths**

Replace the old helper script block:

```html
<script src="./data/pmtiles_manifest.js"></script>
<script src="dataArtifacts.js"></script>
<script src="runtimeData.js"></script>
<script src="https://unpkg.com/@turf/turf@6.5.0/turf.min.js"></script>
<script src="app.js"></script>
```

with:

```html
<script src="./data/pmtiles_manifest.js"></script>
<script src="./js/core/config.js"></script>
<script src="./js/core/dataArtifacts.js"></script>
<script src="./js/core/loaders.js"></script>
<script src="./js/core/runtimeData.js"></script>
<script src="./js/core/perfPanel.js"></script>
<script src="https://unpkg.com/@turf/turf@6.5.0/turf.min.js"></script>
<script src="./app.js"></script>
```

- [x] **Step 6: Update `docs/app.js` to consume core namespaces**

At the top of `docs/app.js`, replace local URL/CDN/config/helper definitions with namespace aliases:

```javascript
const Urban95Config = window.Urban95Config;
const Urban95Loaders = window.Urban95Loaders;
const BASE = Urban95Config.BASE;
const ICONS_BASE = Urban95Config.ICONS_BASE;
const DECK_GL_URL = Urban95Config.cdn.deckGl;
const CHART_JS_URL = Urban95Config.cdn.chartJs;
const BUILDINGS_URL = Urban95Config.urls.buildings;
const PARKS_URL = Urban95Config.urls.parks;
const TREES_URL = Urban95Config.urls.trees;
const STREET_LIGHTS_URL = Urban95Config.urls.streetLights;
const AMENITIES_CLEAN_URL = Urban95Config.urls.amenitiesClean;
const AMENITIES_LEGACY_URL = Urban95Config.urls.amenitiesLegacy;
const ISOCHRONES_URL = Urban95Config.urls.isochrones;
const NEIGHBORHOODS_URL = Urban95Config.urls.neighborhoods;
const NEIGHBORHOOD_SURFACE_URL = Urban95Config.urls.neighborhoodSurface;
const NEIGHBORHOOD_CHARTS_URL = Urban95Config.urls.neighborhoodCharts;
const CITYWIDE_STATS_URL = Urban95Config.urls.citywideStats;
const fetchJsonWithGzipFallback = Urban95Loaders.fetchJsonWithGzipFallback;
const ensureDeckGlLoaded = Urban95Loaders.ensureDeckGlLoaded;
const ensureChartJsLoaded = Urban95Loaders.ensureChartJsLoaded;
```

Keep existing generated artifact URL aliases (`BUILDINGS_LOOKUP_URL`, `ISOCHRONES_LOOKUP_URL`, `POINTS_LOOKUP_URL`, PMTiles URLs) wired through `window.Urban95DataArtifacts.urls`.

- [x] **Step 7: Remove moved helper bodies from `docs/app.js`**

Delete the original function/block definitions that were moved:

```javascript
function shouldTryGzip(...) { ... }
async function parseGzipJsonResponse(...) { ... }
async function fetchJsonWithGzipFallback(...) { ... }
var urban95Perf = (function () { ... })();
function loadExternalScriptOnce(...) { ... }
function ensureDeckGlLoaded(...) { ... }
function ensureChartJsLoaded(...) { ... }
```

Do not delete call sites; they should use aliases from Step 6.

- [x] **Step 8: Run tests**

Run:

```bash
npm run test:frontend
```

Expected:
- Command exits `0`.
- `core modules expose stable Urban95 namespaces` passes.

- [x] **Step 9: Run syntax checks**

Run:

```bash
node --check docs/app.js
node --check docs/js/core/config.js
node --check docs/js/core/dataArtifacts.js
node --check docs/js/core/loaders.js
node --check docs/js/core/runtimeData.js
node --check docs/js/core/perfPanel.js
```

Expected:
- All commands exit `0`.

---

## Task 3: Extract Pure Score Model

**Files:**
- Create: `docs/js/scoring/scoreModel.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Create: `tests/frontend/score_model.test.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [x] **Step 1: Create the score-model test before extraction**

Create `tests/frontend/score_model.test.js`:

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserContext, runBrowserScript } = require("./helpers/loadBrowserScript");

function loadScoreModel() {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  return browser.window.Urban95ScoreModel;
}

test("expanded partial score preserves raw selected sum above 100", () => {
  const scoreModel = loadScoreModel();
  const props = {
    amen_healthcare_5min: 80,
    amen_education_5min: 40,
  };

  const score = scoreModel.getBuildingOverallScore(props, 5, "expanded", {
    currentMode: "house",
    selectedAmenityTypes: ["healthcare", "education"],
    allFilterTypes: ["healthcare", "education", "commercial"],
  });
  assert.equal(score, 120);
});

test("weighted overall score prefers fixed Urban95 score in weighted mode", () => {
  const scoreModel = loadScoreModel();
  const props = {
    score_weighted: 72.4,
    score_expanded_10min: 33,
  };

  assert.equal(scoreModel.getBuildingOverallScore(props, 10, "weighted"), 72.4);
  assert.equal(scoreModel.getBuildingOverallScore(props, 10, "expanded"), 33);
});
```

- [x] **Step 2: Run the score-model test to verify it fails**

Run:

```bash
npm run test:frontend
```

Expected:
- Command exits non-zero.
- Failure references missing `docs/js/scoring/scoreModel.js`.

- [x] **Step 3: Create `docs/js/scoring/scoreModel.js`**

Move pure scoring constants and helpers from `docs/app.js` into `window.Urban95ScoreModel`.

The extracted module must include at least these existing constants/functions:

```javascript
AMENITY_TYPE_CONFIG
DEFAULT_CONFIG
getAmenityConfig
amenityTypeToBuildingStatKey
CLEAN_WEIGHTS
CLEAN_SCORE_COMPONENTS
WEIGHTED_CATEGORY_COMPONENTS
WEIGHTED_CATEGORY_BY_STEM
WEIGHTED_SUBCATEGORY_COMPONENTS
WEIGHTED_CATEGORY_LABEL_BY_STEM
cleanPtsPropertyName
hasCleanPtsBreakdown
filterTypeToCleanCountStem
cleanCountStemToWeightKey
filterTypeToCleanWeightKey
getBuildingCleanFilteredScore
getExpandedContributionForType
getFilteredContributionForType
percentileBreakpoints
collectBuildingScores
buildHistogramDistributionFromScores
getColorForValue
getBuildingOverallScore
computePercentileRank
bulkPercentileRanks
formatMetricNumber
formatScoreInteger
weightedCategoryHighlightsFromSource
getWeightedAverageValueFromSource
weightedSubcategoryComparisonRows
weightedNeighborhoodRankingRows
getCitywideWeightedAverageScore
getPercentileSeriesCacheKey
percentileForSeries
getBuildingAmenityStatKeysForMinutes
```

Expose them like this:

```javascript
(function () {
  // moved constants/functions keep their current bodies

  window.Urban95ScoreModel = {
    AMENITY_TYPE_CONFIG: AMENITY_TYPE_CONFIG,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    CLEAN_WEIGHTS: CLEAN_WEIGHTS,
    CLEAN_SCORE_COMPONENTS: CLEAN_SCORE_COMPONENTS,
    WEIGHTED_CATEGORY_COMPONENTS: WEIGHTED_CATEGORY_COMPONENTS,
    WEIGHTED_CATEGORY_BY_STEM: WEIGHTED_CATEGORY_BY_STEM,
    WEIGHTED_SUBCATEGORY_COMPONENTS: WEIGHTED_SUBCATEGORY_COMPONENTS,
    WEIGHTED_CATEGORY_LABEL_BY_STEM: WEIGHTED_CATEGORY_LABEL_BY_STEM,
    getAmenityConfig: getAmenityConfig,
    amenityTypeToBuildingStatKey: amenityTypeToBuildingStatKey,
    cleanPtsPropertyName: cleanPtsPropertyName,
    hasCleanPtsBreakdown: hasCleanPtsBreakdown,
    filterTypeToCleanCountStem: filterTypeToCleanCountStem,
    cleanCountStemToWeightKey: cleanCountStemToWeightKey,
    filterTypeToCleanWeightKey: filterTypeToCleanWeightKey,
    getBuildingCleanFilteredScore: getBuildingCleanFilteredScore,
    getExpandedContributionForType: getExpandedContributionForType,
    getFilteredContributionForType: getFilteredContributionForType,
    percentileBreakpoints: percentileBreakpoints,
    collectBuildingScores: collectBuildingScores,
    buildHistogramDistributionFromScores: buildHistogramDistributionFromScores,
    getColorForValue: getColorForValue,
    getBuildingOverallScore: getBuildingOverallScore,
    computePercentileRank: computePercentileRank,
    bulkPercentileRanks: bulkPercentileRanks,
    formatMetricNumber: formatMetricNumber,
    formatScoreInteger: formatScoreInteger,
    weightedCategoryHighlightsFromSource: weightedCategoryHighlightsFromSource,
    getWeightedAverageValueFromSource: getWeightedAverageValueFromSource,
    weightedSubcategoryComparisonRows: weightedSubcategoryComparisonRows,
    weightedNeighborhoodRankingRows: weightedNeighborhoodRankingRows,
    getCitywideWeightedAverageScore: getCitywideWeightedAverageScore,
    getPercentileSeriesCacheKey: getPercentileSeriesCacheKey,
    percentileForSeries: percentileForSeries,
    getBuildingAmenityStatKeysForMinutes: getBuildingAmenityStatKeysForMinutes,
  };
})();
```

If a moved function currently depends on `scoreMode`, `walkMinutes`, `selectedAmenityTypes`, `buildingsData`, `percentileSeriesCache`, or `buildingAmenityStatKeyCache`, change the function signature to accept that dependency explicitly. For compatibility in this task, leave a tiny wrapper in `docs/app.js` only when a call site cannot be updated mechanically.

- [x] **Step 4: Add `scoreModel.js` to `docs/index.html`**

Insert after core scripts and before `app.js`:

```html
<script src="./js/scoring/scoreModel.js"></script>
```

- [x] **Step 5: Update `docs/app.js` score call sites**

Add an alias near the top:

```javascript
const Urban95ScoreModel = window.Urban95ScoreModel;
```

Replace references to moved functions/constants with `Urban95ScoreModel` members where direct local names were removed.

Examples:

```javascript
const AMENITY_TYPE_CONFIG = Urban95ScoreModel.AMENITY_TYPE_CONFIG;
const getAmenityConfig = Urban95ScoreModel.getAmenityConfig;
const getBuildingOverallScore = Urban95ScoreModel.getBuildingOverallScore;
```

Keep local wrappers only for functions that still need app-owned state, and name them clearly:

```javascript
function getCurrentBuildingOverallScore(props, minutes) {
  return Urban95ScoreModel.getBuildingOverallScore(props, minutes, scoreMode);
}
```

- [x] **Step 6: Extend module contract test for score model**

In `tests/frontend/module_contracts.test.js`, add `./js/scoring/scoreModel.js` to the script-order assertion before `./app.js` and add:

```javascript
runBrowserScript("docs/js/scoring/scoreModel.js", browser);
assert.equal(typeof browser.window.Urban95ScoreModel.getBuildingOverallScore, "function");
```

- [x] **Step 7: Run tests and syntax checks**

Run:

```bash
npm run test:frontend
node --check docs/app.js
node --check docs/js/scoring/scoreModel.js
```

Expected:
- All commands exit `0`.

---

## Task 4: Extract Map Layer Factories Without Changing Map Behavior

**Files:**
- Create: `docs/js/map/mapLayers.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [x] **Step 1: Add map layer namespace test first**

In `tests/frontend/module_contracts.test.js`, extend the namespace test:

```javascript
runBrowserScript("docs/js/map/mapLayers.js", browser);
assert.equal(typeof browser.window.Urban95MapLayers.createBuildingsSource, "function");
assert.equal(typeof browser.window.Urban95MapLayers.createBuildingsFillLayer, "function");
```

Also add `./js/map/mapLayers.js` to the script-order assertion before `./app.js`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:frontend
```

Expected:
- Command exits non-zero because `docs/js/map/mapLayers.js` does not exist.

- [x] **Step 3: Create `docs/js/map/mapLayers.js`**

Move PMTiles protocol setup, building source construction, building fill/selected layer construction, and source/layer factory helpers from `docs/app.js` into this file.

Use this namespace shape:

```javascript
(function () {
  function createPmtilesProtocol() {
    return typeof pmtiles !== "undefined" && pmtiles.Protocol ? new pmtiles.Protocol() : null;
  }

  function createBuildingsSource(deps) {
    var artifacts = deps.artifacts;
    var pmtilesPath = deps.buildingsPmtilesPath;
    var source = artifacts.vectorSourceOrGeojson("buildings", pmtilesPath);
    if (source.type === "vector") {
      source.promoteId = "building_id";
    }
    return source;
  }

  function createBuildingsFillLayer(deps) {
    return {
      id: deps.layerId,
      type: "fill",
      source: deps.sourceId,
      "source-layer": deps.sourceLayer,
      paint: {
        "fill-color": deps.fillColorExpression,
        "fill-opacity": 0.72,
        "fill-outline-color": "rgba(15, 23, 42, 0.22)",
      },
    };
  }

  function createBuildingsSelectedLayer(deps) {
    return {
      id: deps.layerId,
      type: "line",
      source: deps.sourceId,
      "source-layer": deps.sourceLayer,
      paint: {
        "line-color": "#0f172a",
        "line-width": [
          "case",
          ["boolean", ["feature-state", deps.selectedStateKey], false],
          3,
          0,
        ],
        "line-opacity": [
          "case",
          ["boolean", ["feature-state", deps.selectedStateKey], false],
          0.95,
          0,
        ],
      },
    };
  }

  window.Urban95MapLayers = {
    createPmtilesProtocol: createPmtilesProtocol,
    createBuildingsSource: createBuildingsSource,
    createBuildingsFillLayer: createBuildingsFillLayer,
    createBuildingsSelectedLayer: createBuildingsSelectedLayer,
  };
})();
```

Preserve the exact current paint expressions from `docs/app.js` when moving the real implementation. The snippet above defines the interface; the implementation must match current behavior.

- [x] **Step 4: Add `mapLayers.js` to `docs/index.html`**

Insert before `app.js`:

```html
<script src="./js/map/mapLayers.js"></script>
```

- [x] **Step 5: Update `docs/app.js` to use `Urban95MapLayers`**

Replace local PMTiles protocol/source/layer construction with:

```javascript
const Urban95MapLayers = window.Urban95MapLayers;
const _urban95PmtilesProtocol = Urban95MapLayers.createPmtilesProtocol();
```

Keep `maplibregl.addProtocol("pmtiles", _urban95PmtilesProtocol.tile);` behavior exactly as it is today.

Replace building source/layer object creation with calls to:

```javascript
Urban95MapLayers.createBuildingsSource({
  artifacts: window.Urban95DataArtifacts,
  buildingsPmtilesPath: BUILDINGS_PMTILES_URL,
})
Urban95MapLayers.createBuildingsFillLayer(...)
Urban95MapLayers.createBuildingsSelectedLayer(...)
```

- [x] **Step 6: Run tests and syntax checks**

Run:

```bash
npm run test:frontend
node --check docs/app.js
node --check docs/js/map/mapLayers.js
```

Expected:
- All commands exit `0`.

---

## Task 5: Extract Score Sidebar As A UI Module

**Files:**
- Create: `docs/js/ui/scoreSidebar.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [x] **Step 1: Add score sidebar namespace test first**

In `tests/frontend/module_contracts.test.js`, add:

```javascript
runBrowserScript("docs/js/ui/scoreSidebar.js", browser);
assert.equal(typeof browser.window.Urban95ScoreSidebar.renderScoreExplainSidebar, "function");
assert.equal(typeof browser.window.Urban95ScoreSidebar.showScoreExplainSidebar, "function");
```

Also add `./js/ui/scoreSidebar.js` to the script-order assertion before `./app.js`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:frontend
```

Expected:
- Command exits non-zero because `docs/js/ui/scoreSidebar.js` does not exist.

- [x] **Step 3: Create `docs/js/ui/scoreSidebar.js`**

Move score-sidebar-only rendering and behavior from `docs/app.js` into `window.Urban95ScoreSidebar`.

Move functions that directly own `#score-explain-sidebar` behavior:

```javascript
renderScoreExplainSidebarWeighted
renderUrban95ReferenceRadiusNote
renderScoreExplainSidebarExpanded
getScoreExplainHeroLabel
populateScoreExplainBuildingContext
populateScoreExplainSidebarHeader
renderScoreExplainSidebar
resetScoreExplainSidebarFit
applyScoreExplainContentScale
fitScoreExplainSidebarToViewport
scheduleFitScoreExplainSidebar
bindScoreExplainSidebarInteractions
isScoreExplainSidebarOpen
setScoreExplainMapPadding
syncScoreExplainBackdrop
focusMapContainerAfterSidebar
showScoreExplainSidebar
hideScoreExplainSidebar
syncScoreExplainSidebar
```

Use a module factory that accepts app dependencies once:

```javascript
(function () {
  var deps = null;

  function configure(nextDeps) {
    deps = nextDeps;
  }

  function requireDeps() {
    if (!deps) {
      throw new Error("Urban95ScoreSidebar.configure must be called before using score sidebar functions");
    }
    return deps;
  }

  function renderScoreExplainSidebar(breakdown, metrics, ctx) {
    var d = requireDeps();
    // moved current function body, replacing direct globals with d.*
  }

  window.Urban95ScoreSidebar = {
    configure: configure,
    renderScoreExplainSidebar: renderScoreExplainSidebar,
    showScoreExplainSidebar: showScoreExplainSidebar,
    hideScoreExplainSidebar: hideScoreExplainSidebar,
    syncScoreExplainSidebar: syncScoreExplainSidebar,
    scheduleFitScoreExplainSidebar: scheduleFitScoreExplainSidebar,
    isScoreExplainSidebarOpen: isScoreExplainSidebarOpen,
  };
})();
```

Dependencies passed from `docs/app.js` must include the DOM nodes and helpers the sidebar uses:

```javascript
Urban95ScoreSidebar.configure({
  map: map,
  scoreModel: Urban95ScoreModel,
  escapeHtml: escapeHtml,
  buildExplainScoreBreakdown: buildExplainScoreBreakdown,
  buildPercentileMetrics: buildPercentileMetrics,
  getScoreMode: function () { return scoreMode; },
  getSelectedBuilding: function () { return selectedBuildingCentroid; },
});
```

Do not move `buildExplainScoreBreakdown` in this task unless it is already pure after Task 3. If it stays in `app.js`, inject it as shown.

- [x] **Step 4: Add `scoreSidebar.js` to `docs/index.html`**

Insert before `app.js`:

```html
<script src="./js/ui/scoreSidebar.js"></script>
```

- [x] **Step 5: Update `docs/app.js` call sites**

Add:

```javascript
const Urban95ScoreSidebar = window.Urban95ScoreSidebar;
```

After `map` and DOM references exist, call `Urban95ScoreSidebar.configure(...)`.

Replace direct calls:

```javascript
showScoreExplainSidebar()
hideScoreExplainSidebar()
syncScoreExplainSidebar()
scheduleFitScoreExplainSidebar()
isScoreExplainSidebarOpen()
```

with:

```javascript
Urban95ScoreSidebar.showScoreExplainSidebar()
Urban95ScoreSidebar.hideScoreExplainSidebar()
Urban95ScoreSidebar.syncScoreExplainSidebar()
Urban95ScoreSidebar.scheduleFitScoreExplainSidebar()
Urban95ScoreSidebar.isScoreExplainSidebarOpen()
```

- [x] **Step 6: Run tests and syntax checks**

Run:

```bash
npm run test:frontend
node --check docs/app.js
node --check docs/js/ui/scoreSidebar.js
```

Expected:
- All commands exit `0`.

---

## Task 6: Extract Info Modal And Dashboard UI Modules

**Files:**
- Create: `docs/js/ui/infoModal.js`
- Create: `docs/js/ui/dashboards.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [x] **Step 1: Add UI namespace tests first**

In `tests/frontend/module_contracts.test.js`, add:

```javascript
runBrowserScript("docs/js/ui/infoModal.js", browser);
runBrowserScript("docs/js/ui/dashboards.js", browser);
assert.equal(typeof browser.window.Urban95InfoModal.bind, "function");
assert.equal(typeof browser.window.Urban95Dashboards.configure, "function");
assert.equal(typeof browser.window.Urban95Dashboards.renderCitywideModal, "function");
```

Also add both files to the script-order assertion before `./app.js`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:frontend
```

Expected:
- Command exits non-zero because the UI files do not exist.

- [x] **Step 3: Create `docs/js/ui/infoModal.js`**

Move info-modal-only functions and event binding from `docs/app.js`:

```javascript
showModal
hideModal
modal tab switching handlers
modal close/start handlers
```

Expose:

```javascript
(function () {
  function bind(elements) {
    var infoModal = elements.infoModal;
    var infoBtn = elements.infoBtn;
    var modalClose = elements.modalClose;
    var modalStart = elements.modalStart;
    var modalTabs = elements.modalTabs;
    var tabContents = elements.tabContents;

    function showModal() {
      infoModal.classList.add("show");
    }

    function hideModal() {
      infoModal.classList.remove("show");
    }

    infoBtn.addEventListener("click", showModal);
    modalClose.addEventListener("click", hideModal);
    modalStart.addEventListener("click", hideModal);

    modalTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var target = tab.dataset.tab;
        modalTabs.forEach(function (item) {
          item.classList.toggle("active", item === tab);
          item.setAttribute("aria-selected", item === tab ? "true" : "false");
        });
        tabContents.forEach(function (content) {
          var active = content.id === "tab-" + target;
          content.classList.toggle("active", active);
          content.setAttribute("aria-hidden", active ? "false" : "true");
        });
      });
    });

    return {
      showModal: showModal,
      hideModal: hideModal,
    };
  }

  window.Urban95InfoModal = {
    bind: bind,
  };
})();
```

Preserve any existing backdrop/escape-key behavior from `docs/app.js` if present.

- [x] **Step 4: Create `docs/js/ui/dashboards.js`**

Move neighborhood/citywide modal rendering and chart functions from `docs/app.js` into a configured namespace:

```javascript
loadNeighborhoodChartsPayload
pieSlicesFromInventoryCounts
loadNeighborhoods
loadNeighborhoodSurfaceData
getNeighborhoodHexSurfaceOpacityExpression
loadCitywideStats
showNeighborhoodModal
hideNeighborhoodModal
renderNeighborhoodCharts
getNeighborhoodFeatureAtPoint
showNeighborhoodAreaTooltip
showCitywideModal
hideCitywideModal
updateCitywideModalTitle
renderCitywideModal
renderCitywideCharts
```

Expose at least:

```javascript
(function () {
  var deps = null;

  function configure(nextDeps) {
    deps = nextDeps;
  }

  function requireDeps() {
    if (!deps) {
      throw new Error("Urban95Dashboards.configure must be called before dashboard functions");
    }
    return deps;
  }

  // moved current function bodies

  window.Urban95Dashboards = {
    configure: configure,
    loadNeighborhoodChartsPayload: loadNeighborhoodChartsPayload,
    loadNeighborhoods: loadNeighborhoods,
    loadNeighborhoodSurfaceData: loadNeighborhoodSurfaceData,
    loadCitywideStats: loadCitywideStats,
    showNeighborhoodModal: showNeighborhoodModal,
    hideNeighborhoodModal: hideNeighborhoodModal,
    renderNeighborhoodCharts: renderNeighborhoodCharts,
    getNeighborhoodFeatureAtPoint: getNeighborhoodFeatureAtPoint,
    showNeighborhoodAreaTooltip: showNeighborhoodAreaTooltip,
    showCitywideModal: showCitywideModal,
    hideCitywideModal: hideCitywideModal,
    updateCitywideModalTitle: updateCitywideModalTitle,
    renderCitywideModal: renderCitywideModal,
    renderCitywideCharts: renderCitywideCharts,
  };
})();
```

Dependencies from `docs/app.js` must include:

```javascript
Urban95Dashboards.configure({
  map: map,
  fetchJsonWithGzipFallback: fetchJsonWithGzipFallback,
  ensureChartJsLoaded: ensureChartJsLoaded,
  urls: Urban95Config.urls,
  scoreModel: Urban95ScoreModel,
  getScoreMode: function () { return scoreMode; },
  getScoreMinutes: getScoreMinutes,
  escapeHtml: escapeHtml,
});
```

- [x] **Step 5: Add UI scripts to `docs/index.html`**

Insert before `app.js`:

```html
<script src="./js/ui/scoreSidebar.js"></script>
<script src="./js/ui/infoModal.js"></script>
<script src="./js/ui/dashboards.js"></script>
```

If `scoreSidebar.js` was already added in Task 5, do not duplicate it.

- [x] **Step 6: Update `docs/app.js` call sites**

Add aliases:

```javascript
const Urban95InfoModal = window.Urban95InfoModal;
const Urban95Dashboards = window.Urban95Dashboards;
```

Replace direct info-modal binding with:

```javascript
Urban95InfoModal.bind({
  infoModal: infoModal,
  infoBtn: infoBtn,
  modalClose: modalClose,
  modalStart: modalStart,
  modalTabs: modalTabs,
  tabContents: tabContents,
});
```

Replace dashboard direct calls with `Urban95Dashboards.*` calls where the functions moved.

- [x] **Step 7: Run tests and syntax checks**

Run:

```bash
npm run test:frontend
node --check docs/app.js
node --check docs/js/ui/infoModal.js
node --check docs/js/ui/dashboards.js
```

Expected:
- All commands exit `0`.

---

## Task 7: Extract Map Renderers And Selection Logic

**Files:**
- Create: `docs/js/map/mapRenderers.js`
- Create: `docs/js/map/selection.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [x] **Step 1: Add map module namespace tests first**

In `tests/frontend/module_contracts.test.js`, add:

```javascript
runBrowserScript("docs/js/map/mapRenderers.js", browser);
runBrowserScript("docs/js/map/selection.js", browser);
assert.equal(typeof browser.window.Urban95MapRenderers.setLayerVisibilityIfPresent, "function");
assert.equal(typeof browser.window.Urban95Selection.buildBuildingCentroidGridIndex, "function");
assert.equal(typeof browser.window.Urban95Selection.findClosestBuilding, "function");
```

Also add both files to the script-order assertion before `./app.js`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:frontend
```

Expected:
- Command exits non-zero because the map files do not exist.

- [x] **Step 3: Create `docs/js/map/mapRenderers.js`**

Move map/deck visual update helpers that do not own selection state:

```javascript
setLayerVisibilityIfPresent
setLayerVisibility
resetPointHoverState
setTreesVisibility
setStreetLightsVisibility
setTreesAndLightsVisibility
bindPointHoverLayer
applyShowPointsToggle
updateAmenitiesSource
updateTreesSource
updateStreetLightsSource
addAmenityLayers
buildAmenityIconAtlas
clusterVisibleAmenities
updateDeckAmenityLayers
scheduleDeckUpdate
initDeckAmenityOverlay
updateBuildingColors
updateAccessibilityLegendLabels
updateNeighborhoodSurfaceData
updateNeighborhoodColors
```

Use a configured namespace:

```javascript
(function () {
  var deps = null;

  function configure(nextDeps) {
    deps = nextDeps;
  }

  function requireDeps() {
    if (!deps) {
      throw new Error("Urban95MapRenderers.configure must be called before map renderer functions");
    }
    return deps;
  }

  function setLayerVisibilityIfPresent(layerId, visible) {
    var d = requireDeps();
    if (d.map.getLayer(layerId)) {
      d.map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    }
  }

  window.Urban95MapRenderers = {
    configure: configure,
    setLayerVisibilityIfPresent: setLayerVisibilityIfPresent,
    setLayerVisibility: setLayerVisibility,
    updateAmenitiesSource: updateAmenitiesSource,
    updateTreesSource: updateTreesSource,
    updateStreetLightsSource: updateStreetLightsSource,
    addAmenityLayers: addAmenityLayers,
    updateDeckAmenityLayers: updateDeckAmenityLayers,
    scheduleDeckUpdate: scheduleDeckUpdate,
    initDeckAmenityOverlay: initDeckAmenityOverlay,
    updateBuildingColors: updateBuildingColors,
    updateAccessibilityLegendLabels: updateAccessibilityLegendLabels,
    updateNeighborhoodSurfaceData: updateNeighborhoodSurfaceData,
    updateNeighborhoodColors: updateNeighborhoodColors,
  };
})();
```

Pass app state through dependency getters instead of copying state:

```javascript
Urban95MapRenderers.configure({
  map: map,
  config: Urban95Config,
  scoreModel: Urban95ScoreModel,
  getScoreMode: function () { return scoreMode; },
  getWalkMinutes: function () { return walkMinutes; },
  getSelectedAmenityTypes: function () { return selectedAmenityTypes; },
  getAllAmenitiesData: function () { return allAmenitiesData; },
  getAllTreesData: function () { return allTreesData; },
  getAllStreetLightsData: function () { return allStreetLightsData; },
});
```

- [x] **Step 4: Create `docs/js/map/selection.js`**

Move selection/radius analysis helpers:

```javascript
setSelectedBuildingVectorState
getBuildingCentroidGridKey
buildBuildingCentroidGridIndex
getClosestBuildingCandidates
findClosestBuilding
loadIsochrones
getIsochrone
isCoordinateInsidePolygon
getItemsInPolygon
easeInOutQuad
selectBuilding
updateRadiusInfo
clearRadiusSelection
buildUrban95ReferenceRadius
```

Expose:

```javascript
(function () {
  var deps = null;

  function configure(nextDeps) {
    deps = nextDeps;
  }

  function requireDeps() {
    if (!deps) {
      throw new Error("Urban95Selection.configure must be called before selection functions");
    }
    return deps;
  }

  // moved current function bodies

  window.Urban95Selection = {
    configure: configure,
    setSelectedBuildingVectorState: setSelectedBuildingVectorState,
    getBuildingCentroidGridKey: getBuildingCentroidGridKey,
    buildBuildingCentroidGridIndex: buildBuildingCentroidGridIndex,
    getClosestBuildingCandidates: getClosestBuildingCandidates,
    findClosestBuilding: findClosestBuilding,
    loadIsochrones: loadIsochrones,
    getIsochrone: getIsochrone,
    isCoordinateInsidePolygon: isCoordinateInsidePolygon,
    getItemsInPolygon: getItemsInPolygon,
    selectBuilding: selectBuilding,
    updateRadiusInfo: updateRadiusInfo,
    clearRadiusSelection: clearRadiusSelection,
    buildUrban95ReferenceRadius: buildUrban95ReferenceRadius,
  };
})();
```

Dependencies must include map, Turf, runtime loaders, score/sidebar/render callbacks, and state getter/setter functions. Keep state in `docs/app.js` for this plan; do not create a separate state store yet.

Preserve the existing tree/light analysis authority state machine exactly:

```javascript
treesDataSource === "lookup"      // compact startup point records only
treesDataSource === "geojson"     // authoritative full tree GeoJSON loaded for Amenities Focus
streetLightsDataSource === "lookup"
streetLightsDataSource === "geojson"
```

When `scoreMode === "expanded"`, `loadTreesIfNeeded()` and `loadStreetLightsIfNeeded()` must still upgrade lookup data to full GeoJSON before point-in-polygon analysis. When `scoreMode === "weighted"` and PMTiles artifacts exist, they must still skip full GeoJSON display loads.

- [x] **Step 5: Add map scripts to `docs/index.html`**

Insert before UI scripts and before `app.js`:

```html
<script src="./js/map/mapLayers.js"></script>
<script src="./js/map/mapRenderers.js"></script>
<script src="./js/map/selection.js"></script>
```

If `mapLayers.js` was already added in Task 4, do not duplicate it.

- [x] **Step 6: Update `docs/app.js` call sites**

Add aliases:

```javascript
const Urban95MapRenderers = window.Urban95MapRenderers;
const Urban95Selection = window.Urban95Selection;
```

Call `configure(...)` for both modules after `map` and state variables exist.

Replace direct calls to moved functions with namespace calls. For event handlers, keep orchestration in `docs/app.js` and call module functions:

```javascript
const nearest = Urban95Selection.findClosestBuilding(e.lngLat);
if (nearest) {
  Urban95Selection.selectBuilding(nearest, true);
}
```

- [x] **Step 7: Run tests and syntax checks**

Run:

```bash
npm run test:frontend
node --check docs/app.js
node --check docs/js/map/mapRenderers.js
node --check docs/js/map/selection.js
```

Expected:
- All commands exit `0`.

---

## Task 8: Extract Controls Binding And Shrink `app.js` Into Coordinator

**Files:**
- Create: `docs/js/ui/controls.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [x] **Step 1: Add controls namespace test first**

In `tests/frontend/module_contracts.test.js`, add:

```javascript
runBrowserScript("docs/js/ui/controls.js", browser);
assert.equal(typeof browser.window.Urban95Controls.bind, "function");
```

Also add `./js/ui/controls.js` to the script-order assertion before `./app.js`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:frontend
```

Expected:
- Command exits non-zero because `docs/js/ui/controls.js` does not exist.

- [x] **Step 3: Create `docs/js/ui/controls.js`**

Move DOM event binding and control-specific helpers:

```javascript
getScoreModeLabel
forceAllAmenityTypesSelected
syncFilterUiForScoreMode
updateShowPointsToggleLabel
describeTypeMix
updateFilterLabel
handleFilterRadioChange
buildFilterRowMarkup
buildFilterItems
openFilterPopup
closeFilterPopup
toggleFilterPopup
score model toggle binding
radius toggle binding
mode toggle binding
tree/light/amenity/heatmap toggle binding
```

Expose:

```javascript
(function () {
  function bind(deps) {
    // moved binding code, using deps getters/setters/callbacks
    return {
      updateFilterLabel: updateFilterLabel,
      buildFilterItems: buildFilterItems,
      closeFilterPopup: closeFilterPopup,
      syncFilterUiForScoreMode: syncFilterUiForScoreMode,
    };
  }

  window.Urban95Controls = {
    bind: bind,
  };
})();
```

Dependencies must include:

```javascript
Urban95Controls.bind({
  elements: {
    filterBtn: filterBtn,
    filterPopup: filterPopup,
    filterLabel: filterLabel,
    filterItems: filterItems,
    filterBackdrop: filterBackdrop,
    radiusToggle: radiusToggle,
    scoreModelToggle: scoreModelToggle,
    modeToggle: modeToggle,
    showTreesToggle: showTreesToggle,
    showLightsToggle: showLightsToggle,
    showAmenityPointsToggle: showAmenityPointsToggle,
    showHeatmapToggle: showHeatmapToggle,
  },
  scoreModel: Urban95ScoreModel,
  getState: function () {
    return {
      scoreMode: scoreMode,
      walkMinutes: walkMinutes,
      selectedAmenityTypes: selectedAmenityTypes,
      allFilterTypes: allFilterTypes,
      lastFilterRadioSelection: lastFilterRadioSelection,
    };
  },
  setScoreMode: function (value) { scoreMode = value; },
  setWalkMinutes: function (value) { walkMinutes = value; },
  setSelectedAmenityTypes: function (value) { selectedAmenityTypes = value; },
  callbacks: {
    applyScoreModeAmenities: applyScoreModeAmenities,
    updateBuildingColors: Urban95MapRenderers.updateBuildingColors,
    updateAccessibilityLegendLabels: Urban95MapRenderers.updateAccessibilityLegendLabels,
    updateRadiusInfo: Urban95Selection.updateRadiusInfo,
    switchMode: switchMode,
  },
});
```

- [x] **Step 4: Add `controls.js` to `docs/index.html`**

Insert before `app.js`:

```html
<script src="./js/ui/controls.js"></script>
```

- [x] **Step 5: Update `docs/app.js`**

Add:

```javascript
const Urban95Controls = window.Urban95Controls;
```

Replace direct control event binding with one `Urban95Controls.bind(...)` call. Keep `switchMode`, `enterHouseMode`, `enterNeighborhoodMode`, and `enterCitywideMode` in `docs/app.js` unless they are already thin wrappers around dashboard/map modules.

- [x] **Step 6: Run tests and syntax checks**

Run:

```bash
npm run test:frontend
node --check docs/app.js
node --check docs/js/ui/controls.js
```

Expected:
- All commands exit `0`.

---

## Task 9: Final Verification And Refactor Results Note

**Files:**
- Modify: `docs/superpowers/plans/2026-05-20-frontend-modularization.md`

- [x] **Step 1: Run full frontend static checks**

Run:

```bash
npm run test:frontend
node --check docs/app.js
node --check docs/js/core/config.js
node --check docs/js/core/dataArtifacts.js
node --check docs/js/core/loaders.js
node --check docs/js/core/runtimeData.js
node --check docs/js/core/perfPanel.js
node --check docs/js/scoring/scoreModel.js
node --check docs/js/map/mapLayers.js
node --check docs/js/map/mapRenderers.js
node --check docs/js/map/selection.js
node --check docs/js/ui/controls.js
node --check docs/js/ui/scoreSidebar.js
node --check docs/js/ui/dashboards.js
node --check docs/js/ui/infoModal.js
```

Expected:
- All commands exit `0`.

- [x] **Step 2: Run whitespace/diff hygiene**

Run:

```bash
git diff --check
```

Expected:
- Command exits `0`.

- [x] **Step 3: Start or reuse local server**

Run:

```bash
npm run start
```

Open:

```text
http://localhost:8080/docs/index.html
```

If port `8080` is already serving this repo, reuse it and record that fact in the implementation results. Do not kill unrelated processes.

- [ ] **Step 4: Manual browser verification**

Check these behaviors in the browser:

- Default Urban95 mode loads without console errors.
- Default startup still avoids eager fetching of `buildings_accessibility.geojson(.gz)`, `neighborhood_surface.geojson`, `isochrones.geojson`, `amenities_new.geojson`, `amenities_all.geojson`, `trees.geojson(.gz)`, and `street_lights.geojson(.gz)` when generated lookup/PMTiles artifacts exist.
- Default startup fetches `buildings_lookup.json(.gz)` and `points_lookup.json(.gz)` when those generated lookup artifacts exist.
- Building selection does not rely on `map.queryRenderedFeatures(...)` against the buildings vector layer.
- Building mode: clicking the map selects nearest building and shows the score sidebar.
- Building choropleth colors update when switching score model.
- Amenities Focus: switching mode loads walking areas and selected building radius counts still include amenities, trees, and street lights.
- Tree/light toggles still show/hide detail layers.
- Neighborhood mode: neighborhood surface and modal still work.
- City mode: citywide modal opens and Chart.js charts render.
- Info modal opens, switches tabs, and closes.
- Mobile-width viewport does not show obvious overlapping controls/sidebar content.

- [x] **Step 5: Add implementation results to this plan**

Append a dated section at the bottom of this file using the exact command results from this implementation pass:

```markdown
## Implementation Results

### 2026-05-20 frontend modularization pass

- No commits or git worktrees were created.
- `docs/app.js` line count before implementation: record the output of `(Get-Content docs\app.js).Count`.
- `docs/app.js` line count after implementation: record the output of `(Get-Content docs\app.js).Count`.
- Created module folders:
  - `docs/js/core/`
  - `docs/js/scoring/`
  - `docs/js/map/`
  - `docs/js/ui/`
- Verification:
  - `npm run test:frontend`: record pass/fail and the final test count.
  - `node --check ...`: record pass/fail for every checked JS file.
  - `git diff --check`: record pass/fail.
  - Browser manual checks: record which checklist items passed and any exact failures.
- Remaining follow-up:
  - Only list follow-up discovered during verification. If none exists, write `None from this pass`.
```

Do not claim completion until the actual command/browser results are recorded.

---

## Out Of Scope

- Python pipeline refactor.
- Bundler/Vite migration.
- ES module conversion.
- CSS file split.
- Changing score formulas or field names.
- Changing generated artifact schemas.
- Replacing manual browser verification with Playwright.
- Rebuilding PMTiles or lookup artifacts unless a manual verification finding proves it is necessary.
- Commits or git worktrees.

---

## Self-Review

- **Spec coverage:** The plan covers the frontend-only decision, grouped `docs/js/` structure, no-bundler constraint, existing helper migration, score/model/map/UI extraction, and testing/verification.
- **Placeholder scan:** No `TBD`, `TODO`, or unspecified "handle edge cases" instructions remain. Steps either give exact code shape, exact files, or exact verification commands.
- **Type consistency:** Module namespaces are consistently named `Urban95Config`, `Urban95DataArtifacts`, `Urban95Loaders`, `Urban95RuntimeData`, `urban95Perf`, `Urban95ScoreModel`, `Urban95MapLayers`, `Urban95MapRenderers`, `Urban95Selection`, `Urban95Controls`, `Urban95ScoreSidebar`, `Urban95Dashboards`, and `Urban95InfoModal`.
- **Contract boundary:** PMTiles remain render-only. Runtime lookup and full GeoJSON analysis contracts remain outside map vector-tile source truth.
- **Testing boundary:** Tests live under `tests/frontend/`, use Node built-ins only, and do not introduce a bundler or browser framework.

## Implementation Results

### 2026-05-20 frontend modularization pass

- No commits or git worktrees were created.
- `docs/app.js` line count before implementation: `5908`.
- `docs/app.js` line count after implementation: `3010`.
- Created module folders:
  - `docs/js/core/`
  - `docs/js/scoring/`
  - `docs/js/map/`
  - `docs/js/ui/`
- Verification:
  - `npm run test:frontend`: pass, `38/38` tests.
  - `node --check docs/app.js`: pass.
  - `node --check docs/js/core/config.js`: pass.
  - `node --check docs/js/core/dataArtifacts.js`: pass.
  - `node --check docs/js/core/loaders.js`: pass.
  - `node --check docs/js/core/runtimeData.js`: pass.
  - `node --check docs/js/core/perfPanel.js`: pass.
  - `node --check docs/js/scoring/scoreModel.js`: pass.
  - `node --check docs/js/map/mapLayers.js`: pass.
  - `node --check docs/js/map/mapRenderers.js`: pass.
  - `node --check docs/js/map/selection.js`: pass.
  - `node --check docs/js/ui/controls.js`: pass.
  - `node --check docs/js/ui/scoreSidebar.js`: pass.
  - `node --check docs/js/ui/dashboards.js`: pass.
  - `node --check docs/js/ui/infoModal.js`: pass.
  - `git diff --check`: pass; Git printed LF-to-CRLF warnings for `docs/app.js`, `docs/index.html`, and `package.json`.
  - Local server: `npm.cmd run start` started a server on port `8080`; `http://localhost:8080/docs/index.html`, `http://localhost:8080/docs/js/ui/controls.js`, and `http://localhost:8080/docs/js/map/selection.js` returned HTTP `200`.
  - Browser manual checks: not executed in this API environment; only the HTTP smoke checks above were performed.
- Review gates:
  - Task 7 spec review: approved after fixing the Amenities Focus tree/light authoritative GeoJSON reselection race.
  - Task 7 quality review: approved after adding full module-surface validation and injecting selection source IDs.
  - Task 8 spec review: approved.
  - Task 8 quality review: approved after removing dead pre-extraction control handlers and adding a real `Urban95Controls.bind` contract test.
- Remaining follow-up:
  - Run the visual/browser checklist manually in a real browser at `http://localhost:8080/docs/index.html`.

