# Frontend Coordinator Shrink Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink `docs/app.js` by extracting stable frontend orchestration into focused no-bundler modules while preserving current map behavior, scoring behavior, PMTiles render-only contracts, and lookup-first analysis.

**Architecture:** Keep the GitHub Pages/static-site model: plain script tags, global `window.Urban95...` namespaces, no bundler, and `docs/app.js` as the final bootstrap coordinator. This pass extracts coordinator responsibilities that are already stable: runtime logging, startup loading, map event binding, and analysis mode orchestration. It does not split the large feature modules created in the previous modularization pass, except where a narrow dependency is required for this coordinator extraction.

**Tech Stack:** HTML/CSS/vanilla JavaScript, MapLibre GL JS, PMTiles, Turf.js, deck.gl, Chart.js, Node.js built-in `node:test`, existing `http-server`, optional temporary Playwright/browser probes for manual verification.

---

## Hard Constraints

- No commits.
- No git worktrees.
- Preserve unrelated dirty or untracked files.
- Do not add a bundler, transpiler, TypeScript, package migration, build output directory, or framework.
- Keep Python pipeline/scripts out of scope.
- Keep `docs/style.css` out of scope unless a browser smoke shows a regression caused by this plan.
- Do not change scoring formulas, UI labels, data filenames, generated artifact schemas, PMTiles generation behavior, map styling, or lookup-vs-render semantics.
- PMTiles remain render artifacts only. Lookup JSON and GeoJSON fallback paths remain authoritative for selection, scoring, isochrones, and point-in-polygon analysis.
- After each implementation task, run a spec-compliance review subagent first, then a code-quality review subagent. Do not start code-quality review until spec compliance is clean.
- Do not claim completion until `npm run test:frontend`, `git diff --check`, and a browser smoke/network proof are clean.

## Current Baseline

- Current `HEAD`: `1b697aa refactor(map): extract frontend ownership seams`.
- `docs/app.js` is about `2706` lines.
- Existing modules:
  - `docs/js/core/config.js`
  - `docs/js/core/dataArtifacts.js`
  - `docs/js/core/loaders.js`
  - `docs/js/core/runtimeData.js`
  - `docs/js/core/perfPanel.js`
  - `docs/js/core/appState.js`
  - `docs/js/scoring/scoreModel.js`
  - `docs/js/map/mapLayers.js`
  - `docs/js/map/mapRenderers.js`
  - `docs/js/map/selection.js`
  - `docs/js/ui/controls.js`
  - `docs/js/ui/scoreSidebar.js`
  - `docs/js/ui/infoModal.js`
  - `docs/js/ui/dashboards.js`
- Fresh pre-plan verification from planning session:
  - `npm run test:frontend` passed `69/69`.
  - `git status --short` was clean.

## Perspective Ensemble

### Panel A - Council

- **Coordinator clarity:** Concern -> `docs/app.js` still owns startup loading, event binding, mode transitions, and feature dependency wiring. Flag -> future changes still require reading a 2700-line coordinator. Counter-move -> extract stable orchestration into `Urban95Startup`, `Urban95MapEvents`, and `Urban95ModeController` with explicit dependency injection.
- **Static deployment simplicity:** Concern -> more script files increase load-order risk in a no-bundler app. Flag -> every new namespace must load before `app.js`. Counter-move -> add script-order and fail-fast namespace tests before each extraction.
- **Behavior safety:** Concern -> mode switching and startup loading are behavior-heavy. Flag -> a pure line-count refactor can accidentally alter selected-building cleanup, citywide modal display, lazy isochrones, or generated artifact startup fetches. Counter-move -> write source-level contract tests first and finish with browser smoke/network proof.
- **Debuggability vs console hygiene:** Concern -> current raw `console.log` calls are useful during perf investigations but noisy in normal use. Flag -> replacing all logs during a coordinator pass can blur behavior extraction with diagnostics policy. Counter-move -> introduce a small `Urban95Logger` first and route only touched startup/mode logs through it; leave full repo-wide log cleanup for the next pass.
- **Follow-up scope:** Concern -> `mapRenderers.js`, `dashboards.js`, and `scoreSidebar.js` are now large enough to deserve their own pass. Flag -> doing that here would turn a coordinator extraction into broad feature-module modularization. Counter-move -> document pass 2 and pass 3 in this plan, but keep implementation pass 1 focused.

### Tensions

- Smaller coordinator vs stable user behavior: startup and mode code are the right extraction target, but they need stronger verification than pure helper moves.
- More modules vs no-bundler simplicity: each new file must earn its load-order cost.
- Quiet production console vs diagnostic value: centralize logging now, but do not over-clean every log line until the logger contract exists.

### Panel B - Adversarial

- **Attack target:** A coordinator-shrink pass that claims maintainability improvement while moving behavior into new global modules without reducing coupling.
- **State-laundering vector:** Vulnerability -> `Urban95ModeController` becomes a new object with dozens of generic getters and setters. Failure scenario -> `app.js` is shorter, but debugging mode changes requires bouncing between `app.js`, `modeController.js`, `dashboards.js`, and `mapRenderers.js`. Mitigation/probe -> controller dependencies must be grouped by responsibility and expose explicit verbs such as `switchMode`, `enterHouseMode`, `applyHouseModeHexBackground`, and `bindNeighborhoodInteractions`.
- **Startup-regression vector:** Vulnerability -> extracted startup loading changes promise timing or fallback order. Failure scenario -> generated lookup artifacts exist but startup fetches full buildings/amenities/isochrones GeoJSON again, or the loading screen gets stuck after a partial failure. Mitigation/probe -> keep tests that scan for lookup-first behavior and run browser network proof after implementation.
- **Load-order vector:** Vulnerability -> new modules depend on `Urban95Dashboards`, `Urban95MapRenderers`, or `Urban95Selection` but are loaded before them. Failure scenario -> app fails before `app.js` with a missing namespace. Mitigation/probe -> update `docs/index.html` order and `tests/frontend/module_contracts.test.js` in the same task.
- **Logger false-cleanliness vector:** Vulnerability -> raw `console.log` lines get replaced by a logger that still eagerly builds expensive payloads. Failure scenario -> console is quieter, but startup still does unnecessary diagnostic work. Mitigation/probe -> logger calls should accept simple values or lazy functions for expensive payloads; tests should assert debug logging is quiet by default.
- **Dependency-dump vector:** Vulnerability -> `Urban95Startup.run(deps)` receives every coordinator variable as a flat bag. Failure scenario -> `app.js` shrinks but `startup.js` becomes a second coordinator with harder-to-read ownership. Mitigation/probe -> group dependencies by owner (`state`, `runtime`, `renderers`, `selection`, `loading`, `scoreData`, `callbacks`, `urls`) and add source-level guardrails against a long list of flat setter dependencies.

### Strongest Attack

The strongest reason to reject this pass is if it only moves orchestration into new files while keeping the same hidden global coupling. The plan must prove the extraction is real: `app.js` should stop owning direct mode-entry and map-event bodies, tests should fail fast when the new namespaces are missing, and browser proof should show the same observable startup/mode behavior.

### Falsifiers / Early Warnings

- `docs/app.js` shrinks, but new modules accept one giant `deps` object with most of `app.js` leaked into it.
- `npm run test:frontend` passes but browser startup fetches full generated GeoJSON artifacts that should remain deferred or lookup-backed.
- Mode switch smoke shows stale selected-building/radius state after leaving house mode.
- Console is quiet only because logs were deleted, not because there is an opt-in diagnostics path.
- A normal feature change now requires touching more files than before.

### Recommendation

Proceed with one focused coordinator-shrink plan. Do not fold the large-module split or full logging cleanup into this implementation. Put those into the next pass after `Urban95Startup`, `Urban95MapEvents`, and `Urban95ModeController` have stable contracts.

---

## Pass Boundaries

### This Plan: Pass 1 - Coordinator Shrink

Implement only:

- `Urban95Logger` minimal diagnostics contract.
- `Urban95Startup` startup/load sequencing.
- `Urban95MapEvents` map event binding for building, parks, zoom, and neighborhood interactions.
- `Urban95ModeController` house/neighborhood/citywide mode orchestration.
- Contract tests and browser proof for those extractions.

### Next Plan: Pass 2 - Large Module Ownership Split

Plan separately after pass 1 is verified:

- Split `docs/js/map/mapRenderers.js` by real rendering responsibility, likely amenity/deck rendering vs building/neighborhood rendering.
- Split `docs/js/ui/dashboards.js` by neighborhood vs citywide concerns if the interfaces are stable.
- Consider extracting score-explain helpers from `docs/app.js` or `docs/js/ui/scoreSidebar.js` only if they have a clean UI/data boundary.
- Keep script count reasonable and update load-order tests.

### Next Plan: Pass 3 - Runtime Logging Cleanup

Plan separately after `Urban95Logger` exists:

- Replace remaining raw runtime `console.log` calls with `Urban95Logger.debug` or `Urban95Logger.perf`.
- Keep `warn`/`error` for real user-impacting or data-contract failures.
- Gate debug/perf logs behind URL/localStorage switches.
- Add tests proving production default is quiet and lazy log payloads are not evaluated when disabled.

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
      logger.js
      runtimeData.js
      startup.js
      perfPanel.js
    map/
      mapEvents.js
      mapLayers.js
      mapRenderers.js
      modeController.js
      selection.js
    scoring/
      scoreModel.js
    ui/
      controls.js
      dashboards.js
      infoModal.js
      scoreSidebar.js
tests/
  frontend/
    helpers/
      loadBrowserScript.js
    module_contracts.test.js
    score_model.test.js
```

## File Responsibilities

- `docs/js/core/logger.js`: Small opt-in logging facade. Default `debug` and `perf` are quiet. Enabled by `?debug=1`, `?perf=1`, `localStorage.urban95_debug = "1"`, or `localStorage.urban95_perf = "1"`. `warn` and `error` proxy to console for real failures.
- `docs/js/core/startup.js`: Owns startup loading after MapLibre `load`: park pattern, icons, amenity layer init, building runtime/fallback load, park load, points lookup/fallback load, lazy tree trigger, deferred isochrone status, and house-mode heatmap startup call. It must receive grouped dependency facades rather than a flat dump of app variables.
- `docs/js/map/mapEvents.js`: Owns MapLibre event wiring that is not a feature renderer itself: building click, building cursor, parks tooltip, zoom-triggered lazy point loads, and neighborhood click/hover/tooltip events.
- `docs/js/map/modeController.js`: Owns mode switching and mode entry: `switchMode`, `setControlsForMode`, `enterHouseMode`, `enterNeighborhoodMode`, `enterCitywideMode`, `addNeighborhoodLayers`, and `applyHouseModeHexBackground`.
- `docs/app.js`: Keeps namespace validation, core object creation, module configuration, map construction, dependency assembly, and calls into startup/events/mode modules. It should not own long inline `map.on(...)` bodies or mode-entry bodies after this pass.
- `tests/frontend/module_contracts.test.js`: Adds script order, namespace, logger, startup, event, and mode-controller contract tests.

---

## Task 1: Add Minimal Logger Contract

**Files:**
- Create: `docs/js/core/logger.js`
- Modify: `docs/index.html`
- Modify: `tests/frontend/module_contracts.test.js`

- [ ] **Step 1: Add failing script-order and logger contract tests**

Add this helper near the top of `tests/frontend/module_contracts.test.js`, after `requireScriptIndex`:

```javascript
function runCoreLogger(browserOverrides) {
  const browser = createBrowserContext(browserOverrides || {});
  runBrowserScript("docs/js/core/logger.js", browser);
  return browser.window.Urban95Logger;
}
```

Extend the `index loads core frontend modules before app.js` test:

```javascript
  assert.ok(requireScriptIndex(scripts, "./js/core/logger.js") < appIndex);
```

Add these tests after the core namespace test:

```javascript
test("logger is quiet by default for debug and perf messages", () => {
  const messages = [];
  const logger = runCoreLogger({
    console: {
      log: function () {
        messages.push(Array.from(arguments));
      },
      warn: function () {},
      error: function () {},
    },
    location: { href: "http://localhost:8080/docs/index.html" },
    localStorage: {
      getItem: function () {
        return null;
      },
    },
  });

  let evaluated = false;
  logger.debug("debug message", function () {
    evaluated = true;
    return "payload";
  });
  logger.perf("perf message");

  assert.equal(messages.length, 0);
  assert.equal(evaluated, false);
});

test("logger enables debug and perf from URL flags", () => {
  const messages = [];
  const logger = runCoreLogger({
    console: {
      log: function () {
        messages.push(Array.from(arguments));
      },
      warn: function () {},
      error: function () {},
    },
    location: { href: "http://localhost:8080/docs/index.html?debug=1&perf=1" },
    localStorage: {
      getItem: function () {
        return null;
      },
    },
  });

  logger.debug("[Debug]", function () {
    return "payload";
  });
  logger.perf("[Perf]", 12);

  assert.deepEqual(messages[0], ["[Debug]", "payload"]);
  assert.deepEqual(messages[1], ["[Perf]", 12]);
});

test("logger warn and error remain visible", () => {
  const warnings = [];
  const errors = [];
  const logger = runCoreLogger({
    console: {
      log: function () {},
      warn: function () {
        warnings.push(Array.from(arguments));
      },
      error: function () {
        errors.push(Array.from(arguments));
      },
    },
  });

  logger.warn("warn", 1);
  logger.error("error", 2);

  assert.deepEqual(warnings, [["warn", 1]]);
  assert.deepEqual(errors, [["error", 2]]);
});
```

- [ ] **Step 2: Run the failing logger tests**

Run:

```bash
npm run test:frontend
```

Expected before implementation: FAIL with `docs/index.html must load ./js/core/logger.js` or a missing `docs/js/core/logger.js` file.

- [ ] **Step 3: Create `docs/js/core/logger.js`**

Create the file:

```javascript
(function () {
  function hasFlag(name) {
    var href = "";
    try {
      href = window.location && window.location.href ? String(window.location.href) : "";
    } catch (err) {
      href = "";
    }
    return new RegExp("[?&]" + name + "=1(?:&|$)").test(href);
  }

  function localStorageEnabled(key) {
    try {
      return window.localStorage && window.localStorage.getItem(key) === "1";
    } catch (err) {
      return false;
    }
  }

  function enabled(kind) {
    if (kind === "debug") return hasFlag("debug") || localStorageEnabled("urban95_debug");
    if (kind === "perf") return hasFlag("perf") || localStorageEnabled("urban95_perf");
    return false;
  }

  function materialize(args) {
    return Array.prototype.slice.call(args).map(function (value) {
      return typeof value === "function" ? value() : value;
    });
  }

  function logWhen(kind, args) {
    if (!enabled(kind)) return;
    console.log.apply(console, materialize(args));
  }

  window.Urban95Logger = {
    isDebugEnabled: function () {
      return enabled("debug");
    },
    isPerfEnabled: function () {
      return enabled("perf");
    },
    debug: function () {
      logWhen("debug", arguments);
    },
    perf: function () {
      logWhen("perf", arguments);
    },
    warn: function () {
      console.warn.apply(console, arguments);
    },
    error: function () {
      console.error.apply(console, arguments);
    },
  };
})();
```

- [ ] **Step 4: Load the logger before dependent modules**

In `docs/index.html`, add logger after `loaders.js` and before `runtimeData.js`:

```html
    <script src="./js/core/loaders.js"></script>
    <script src="./js/core/logger.js"></script>
    <script src="./js/core/runtimeData.js"></script>
```

- [ ] **Step 5: Run tests and review gates**

Run:

```bash
npm run test:frontend
git diff --check
```

Expected: both pass.

Spec-compliance review subagent prompt:

```text
Review Task 1 of docs/superpowers/plans/2026-05-20-frontend-coordinator-shrink.md for spec compliance only.
Check that the implementation added a no-bundler Urban95Logger, keeps debug/perf quiet by default, supports URL/localStorage opt-in, preserves warn/error visibility, and updates docs/index.html script order plus tests.
Do not review style unless it violates the plan. Report findings first with file/line references.
```

Code-quality review subagent prompt, only after spec review is clean:

```text
Review Task 1 of docs/superpowers/plans/2026-05-20-frontend-coordinator-shrink.md for code quality.
Focus on logger API clarity, lazy payload behavior, browser compatibility, script-order maintainability, and test usefulness.
Do not request broad logging cleanup beyond Task 1. Report findings first with file/line references.
```

---

## Task 2: Extract Startup Loading Orchestration

**Files:**
- Create: `docs/js/core/startup.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [ ] **Step 1: Add failing startup namespace and source-contract tests**

Extend `index loads core frontend modules before app.js`:

```javascript
  assert.ok(requireScriptIndex(scripts, "./js/core/startup.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/core/logger.js") < requireScriptIndex(scripts, "./js/core/startup.js"));
```

Extend the `core modules expose stable Urban95 namespaces` test after `runtimeData.js` and `logger.js` are loaded:

```javascript
  runBrowserScript("docs/js/core/logger.js", browser);
  runBrowserScript("docs/js/core/startup.js", browser);
  assert.equal(typeof browser.window.Urban95Startup.run, "function");
```

Add this source contract test near the other source-level app tests:

```javascript
test("startup orchestration lives in Urban95Startup instead of inline app load body", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const startupSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "core", "startup.js"),
    "utf8"
  );

  assert.match(appSource, /Urban95Startup\.run\s*\(/);
  assert.doesNotMatch(appSource, /map\.on\("load",\s*async function/);
  assert.match(startupSource, /loadBuildingsRuntimeData/);
  assert.match(startupSource, /loadPointsLookup/);
  assert.match(startupSource, /featureCollectionFromPointRecords/);
  assert.match(startupSource, /applyHouseModeHexBackground/);
  assert.match(startupSource, /Urban95Logger\.(?:debug|perf)/);
  assert.match(startupSource, /deps\.state/);
  assert.match(startupSource, /deps\.runtime/);
  assert.match(startupSource, /deps\.loading/);
  assert.doesNotMatch(startupSource, /setCleanAmenitiesData\s*=\s*requireFunction\(deps/);
});
```

- [ ] **Step 2: Run the failing startup tests**

Run:

```bash
npm run test:frontend
```

Expected before implementation: FAIL because `startup.js` does not exist or `Urban95Startup.run` is missing.

- [ ] **Step 3: Create `docs/js/core/startup.js`**

Create a module with this public shape and move the current `map.on("load", async function () { ... })` body into `run(deps)`:

```javascript
(function () {
  function requireFunction(deps, name) {
    if (!deps || typeof deps[name] !== "function") {
      throw new Error("Urban95Startup requires " + name);
    }
    return deps[name];
  }

  function requireObject(deps, name) {
    if (!deps || !deps[name]) {
      throw new Error("Urban95Startup requires " + name);
    }
    return deps[name];
  }

  async function run(deps) {
    var map = requireObject(deps, "map");
    var logger = requireObject(deps, "logger");
    var state = requireObject(deps, "state");
    var runtime = requireObject(deps, "runtime");
    var loading = requireObject(deps, "loading");
    var renderers = requireObject(deps, "renderers");
    var callbacks = requireObject(deps, "callbacks");
    var urls = requireObject(deps, "urls");

    var loadingState = requireObject(loading, "state");
    var runtimeLoaders = requireObject(runtime, "loaders");
    var pointDataLoader = requireObject(runtime, "pointDataLoader");
    var mapRenderers = requireObject(renderers, "mapRenderers");
    var selection = requireObject(renderers, "selection");

    var applyParkDotPattern = requireFunction(callbacks, "applyParkDotPattern");
    var setLoadingStatus = requireFunction(loading, "setStatus");
    var updateLoadingProgress = requireFunction(loading, "updateProgress");
    var loadAmenityIcons = requireFunction(callbacks, "loadAmenityIcons");
    var hasGeneratedArtifact = requireFunction(runtime, "hasGeneratedArtifact");
    var fetchJsonWithGzipFallback = requireFunction(runtime, "fetchJsonWithGzipFallback");
    var warnIfBuildingScoresIncomplete = requireFunction(runtime, "warnIfBuildingScoresIncomplete");
    var scanAmenityTypesFromFeatures = requireFunction(runtime, "scanAmenityTypesFromFeatures");
    var hasValidPointsLookupSources = requireFunction(runtime, "hasValidPointsLookupSources");
    var featureCollectionFromPointRecords = requireFunction(runtime, "featureCollectionFromPointRecords");
    var loadAmenitiesGeojsonFallback = requireFunction(runtime, "loadAmenitiesGeojsonFallback");
    var applyScoreModeAmenities = requireFunction(callbacks, "applyScoreModeAmenities");
    var applyHouseModeHexBackground = requireFunction(callbacks, "applyHouseModeHexBackground");

    var appLoadStartedAt = performance.now();
    logger.perf("[Load] app startup: map load event");
    loadingState.mapReady = true;
    updateLoadingProgress();
    applyParkDotPattern(map, document);

    setLoadingStatus("Loading icons...");
    var iconsStartedAt = performance.now();
    await loadAmenityIcons();
    logger.perf("[Load] icons: complete", function () {
      return Math.round(performance.now() - iconsStartedAt) + "ms";
    });
    loadingState.icons = true;
    updateLoadingProgress();

    var layerInitStartedAt = performance.now();
    mapRenderers.addAmenityLayers();
    mapRenderers.applyShowPointsToggle();
    logger.perf("[Load] layer init: complete", function () {
      return Math.round(performance.now() - layerInitStartedAt) + "ms";
    });

    setLoadingStatus("Loading buildings...");
    var buildingsStartedAt = performance.now();
    var buildingsLoad = hasGeneratedArtifact("buildings")
      ? runtimeLoaders.loadBuildingsRuntimeData()
      : fetchJsonWithGzipFallback(urls.buildings);

    buildingsLoad
      .then(function (fc) {
        logger.debug("[Load] buildings: features", function () {
          return (fc.features || []).length;
        });
        state.setBuildingsData(fc);
        if (!hasGeneratedArtifact("buildings")) {
          var buildingsSource = map.getSource(deps.buildingsMapSourceId);
          if (buildingsSource) buildingsSource.setData(fc);
        }
        warnIfBuildingScoresIncomplete(fc);
        state.clearDerivedCaches();

        var centroids = [];
        (fc.features || []).forEach(function (f) {
          if (!f.geometry) return;
          var props = f.properties || {};
          var storedLng = Number(props.centroid_lng);
          var storedLat = Number(props.centroid_lat);
          var hasStoredCentroid = Number.isFinite(storedLng) && Number.isFinite(storedLat);
          var centroid = hasStoredCentroid ? null : turf.centroid(f);
          centroids.push({
            lng: hasStoredCentroid ? storedLng : centroid.geometry.coordinates[0],
            lat: hasStoredCentroid ? storedLat : centroid.geometry.coordinates[1],
            properties: props,
            feature: f,
          });
        });
        state.setBuildingCentroids(centroids);
        selection.buildBuildingCentroidGridIndex();
        mapRenderers.updateBuildingColors();
        loadingState.buildings = true;
        updateLoadingProgress();
        logger.perf("[Load] buildings: complete total", function () {
          return Math.round(performance.now() - buildingsStartedAt) + "ms";
        });
      })
      .catch(function (err) {
        logger.error("Failed to load buildings:", err);
        loadingState.buildings = true;
        updateLoadingProgress();
      });

    setLoadingStatus("Loading parks...");
    fetchJsonWithGzipFallback(urls.parks, { required: false })
      .then(function (fc) {
        if (fc && map.getSource("parks")) map.getSource("parks").setData(fc);
        loadingState.parks = true;
        updateLoadingProgress();
      })
      .catch(function (err) {
        logger.error("Failed to load parks:", err);
        loadingState.parks = true;
        updateLoadingProgress();
      });

    setLoadingStatus("Loading amenities...");
    runtimeLoaders.loadPointsLookup()
      .then(function (lookup) {
        if (hasValidPointsLookupSources(lookup)) {
          var lookupSources = lookup && lookup.sources ? lookup.sources : {};
          return {
            source: "points_lookup",
            cleanFc: featureCollectionFromPointRecords(lookupSources.amenities_clean),
            legacyFc: Array.isArray(lookupSources.amenities_legacy)
              ? featureCollectionFromPointRecords(lookupSources.amenities_legacy)
              : null,
            treesFc: Array.isArray(lookupSources.trees)
              ? featureCollectionFromPointRecords(lookupSources.trees)
              : null,
            streetLightsFc: Array.isArray(lookupSources.street_lights)
              ? featureCollectionFromPointRecords(lookupSources.street_lights)
              : null,
          };
        }
        return loadAmenitiesGeojsonFallback();
      })
      .catch(function () {
        return loadAmenitiesGeojsonFallback();
      })
      .then(function (payload) {
        var cleanScan = scanAmenityTypesFromFeatures(payload.cleanFc);
        state.setCleanAmenitiesData(payload.cleanFc);
        state.setCleanAmenityScan(cleanScan);

        if (payload.legacyFc && (payload.legacyFc.features || []).length > 0) {
          state.setLegacyAmenitiesData(payload.legacyFc);
          state.setLegacyAmenityScan(scanAmenityTypesFromFeatures(payload.legacyFc));
        } else {
          state.setLegacyAmenitiesData(null);
          state.setLegacyAmenityScan({ types: [], tw: new Set() });
        }

        if (payload.source === "points_lookup" && payload.treesFc) {
          pointDataLoader.setPointLookupData({ trees: payload.treesFc });
        }
        if (payload.source === "points_lookup" && payload.streetLightsFc) {
          pointDataLoader.setPointLookupData({ streetLights: payload.streetLightsFc });
        }

        applyScoreModeAmenities();
        loadingState.amenities = true;
        updateLoadingProgress();
        if (map.getZoom() >= 13) pointDataLoader.loadTreesIfNeeded();
      })
      .catch(function (err) {
        logger.error("Failed to load amenities:", err);
        loadingState.amenities = true;
        updateLoadingProgress();
      });

    loadingState.trees = true;
    updateLoadingProgress();
    loadingState.isochrones = true;
    updateLoadingProgress();
    logger.debug("[Load] isochrones: deferred until Amenities Focus needs walking areas");
    logger.perf("[Load] app startup: async jobs queued in", function () {
      return Math.round(performance.now() - appLoadStartedAt) + "ms";
    });

    applyHouseModeHexBackground();
    map.getCanvas().style.cursor = "";
  }

  window.Urban95Startup = {
    run: run,
  };
})();
```

- [ ] **Step 4: Load `startup.js` before `app.js`**

In `docs/index.html`, add:

```html
    <script src="./js/core/startup.js"></script>
```

Place it after `runtimeData.js` and before `perfPanel.js`, or after `logger.js` and before `app.js`. Keep the test order consistent.

- [ ] **Step 5: Replace inline map load body in `docs/app.js`**

Add namespace validation near the other module validations:

```javascript
const Urban95Logger = requireNamespace(window, "Urban95Logger");
requireNamespaceMember(Urban95Logger, "Urban95Logger", "debug", "function");
requireNamespaceMember(Urban95Logger, "Urban95Logger", "perf", "function");
requireNamespaceMember(Urban95Logger, "Urban95Logger", "warn", "function");
requireNamespaceMember(Urban95Logger, "Urban95Logger", "error", "function");

const Urban95Startup = requireNamespace(window, "Urban95Startup");
requireNamespaceMember(Urban95Startup, "Urban95Startup", "run", "function");
```

Replace the existing inline `map.on("load", async function () { ... })` with:

```javascript
map.on("load", function () {
  Urban95Startup.run({
    map: map,
    logger: Urban95Logger,
    urls: {
      buildings: BUILDINGS_URL,
      parks: PARKS_URL,
    },
    buildingsMapSourceId: BUILDINGS_MAP_SOURCE_ID,
    loading: {
      state: loadingState,
      setStatus: setLoadingStatus,
      updateProgress: updateLoadingProgress,
    },
    runtime: {
      loaders: urban95RuntimeLoaders,
      pointDataLoader: pointDataLoader,
      hasGeneratedArtifact: hasGeneratedArtifact,
      fetchJsonWithGzipFallback: fetchJsonWithGzipFallback,
      warnIfBuildingScoresIncomplete: warnIfBuildingScoresIncomplete,
      scanAmenityTypesFromFeatures: scanAmenityTypesFromFeatures,
      hasValidPointsLookupSources: hasValidPointsLookupSources,
      featureCollectionFromPointRecords: featureCollectionFromPointRecords,
      loadAmenitiesGeojsonFallback: loadAmenitiesGeojsonFallback,
    },
    renderers: {
      mapRenderers: Urban95MapRenderers,
      selection: Urban95Selection,
    },
    callbacks: {
      applyParkDotPattern: applyParkDotPattern,
      loadAmenityIcons: loadAmenityIcons,
      applyScoreModeAmenities: applyScoreModeAmenities,
      applyHouseModeHexBackground: applyHouseModeHexBackground,
    },
    state: {
      clearDerivedCaches: clearDerivedCachesState,
      setBuildingsData: function (fc) {
        buildingsData = fc;
      },
      setBuildingCentroids: function (centroids) {
        buildingCentroids = centroids;
      },
      setCleanAmenitiesData: function (fc) {
        allAmenitiesDataClean = fc;
      },
      setLegacyAmenitiesData: function (fc) {
        allAmenitiesDataLegacy = fc;
      },
      setCleanAmenityScan: function (scan) {
        allAmenityTypesClean = scan.types;
        typesWithDataClean = scan.tw;
      },
      setLegacyAmenityScan: function (scan) {
        allAmenityTypesLegacy = scan.types;
        typesWithDataLegacy = scan.tw;
      },
    },
  });
});
```

- [ ] **Step 6: Run tests and review gates**

Run:

```bash
npm run test:frontend
git diff --check
```

Expected: both pass.

Spec-compliance review subagent prompt:

```text
Review Task 2 of docs/superpowers/plans/2026-05-20-frontend-coordinator-shrink.md for spec compliance only.
Check that startup loading moved to Urban95Startup.run without changing lookup-first behavior, PMTiles render-only behavior, generated-artifact fallback order, loading progress semantics, or lazy isochrone/tree behavior.
Report findings first with file/line references. Do not do code-quality review.
```

Code-quality review subagent prompt, only after spec review is clean:

```text
Review Task 2 of docs/superpowers/plans/2026-05-20-frontend-coordinator-shrink.md for code quality.
Focus on dependency shape, async readability, fail-fast validation, logger usage, and whether app.js genuinely became a coordinator.
Do not request unrelated module splits. Report findings first with file/line references.
```

---

## Task 3: Extract Analysis Mode Controller

**Files:**
- Create: `docs/js/map/modeController.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [ ] **Step 1: Add failing mode-controller tests**

Extend script-order test:

```javascript
  assert.ok(requireScriptIndex(scripts, "./js/map/modeController.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/ui/dashboards.js") < requireScriptIndex(scripts, "./js/map/modeController.js"));
```

Extend namespace test:

```javascript
  runBrowserScript("docs/js/map/modeController.js", browser);
  assert.equal(typeof browser.window.Urban95ModeController.create, "function");
```

Add source contract:

```javascript
test("mode orchestration lives in Urban95ModeController instead of app.js", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const modeSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "modeController.js"),
    "utf8"
  );

  assert.match(appSource, /Urban95ModeController\.create\s*\(/);
  assert.doesNotMatch(appSource, /function\s+switchMode\s*\(/);
  assert.doesNotMatch(appSource, /function\s+enterNeighborhoodMode\s*\(/);
  assert.doesNotMatch(appSource, /function\s+enterCitywideMode\s*\(/);
  assert.match(modeSource, /function\s+switchMode\s*\(/);
  assert.match(modeSource, /function\s+enterHouseMode\s*\(/);
  assert.match(modeSource, /function\s+enterNeighborhoodMode\s*\(/);
  assert.match(modeSource, /function\s+enterCitywideMode\s*\(/);
  assert.match(modeSource, /applyHouseModeHexBackground/);
});
```

- [ ] **Step 2: Run the failing mode-controller tests**

Run:

```bash
npm run test:frontend
```

Expected before implementation: FAIL because `modeController.js` does not exist or `Urban95ModeController.create` is missing.

- [ ] **Step 3: Create `docs/js/map/modeController.js`**

Create the module and move the existing mode-management functions into it:

```javascript
(function () {
  function requireFunction(deps, name) {
    if (!deps || typeof deps[name] !== "function") {
      throw new Error("Urban95ModeController requires " + name);
    }
    return deps[name];
  }

  function create(deps) {
    deps = deps || {};
    var map = deps.map;
    var logger = deps.logger;
    var mapRenderers = deps.mapRenderers;
    var dashboards = deps.dashboards;
    var selection = deps.selection;
    var perf = deps.perf;
    var getCurrentMode = requireFunction(deps, "getCurrentMode");
    var setCurrentMode = requireFunction(deps, "setCurrentMode");
    var setSelectedNeighborhood = requireFunction(deps, "setSelectedNeighborhood");
    var syncFilterUiForScoreMode = requireFunction(deps, "syncFilterUiForScoreMode");
    var updateFilterLabel = requireFunction(deps, "updateFilterLabel");
    var hasGeneratedArtifact = requireFunction(deps, "hasGeneratedArtifact");
    var sourceLayer = requireFunction(deps, "sourceLayer");
    var getNeighborhoodSurfaceColorExpression = requireFunction(deps, "getNeighborhoodSurfaceColorExpression");
    var getNeighborhoodSurfaceScorePropertyKey = requireFunction(deps, "getNeighborhoodSurfaceScorePropertyKey");

    function addNeighborhoodLayers() {
      if (map.getLayer("neighborhoods-fill")) return;
      logger.debug("[Neighborhood] Adding layers dynamically");
      var surfaceBeforeId = map.getLayer(deps.buildingsFillLayerId) ? deps.buildingsFillLayerId : undefined;
      map.addLayer(
        Object.assign(
          {
            id: "neighborhoods-surface",
            type: "fill",
            source: "neighborhood-score-surface",
            paint: {
              "fill-color": getNeighborhoodSurfaceColorExpression(getNeighborhoodSurfaceScorePropertyKey()),
              "fill-outline-color": getNeighborhoodSurfaceColorExpression(getNeighborhoodSurfaceScorePropertyKey()),
              "fill-opacity": dashboards.getNeighborhoodHexSurfaceOpacityExpression(),
              "fill-antialias": true,
            },
            layout: { visibility: "none" },
          },
          hasGeneratedArtifact("neighborhood_surface")
            ? {
                "source-layer": sourceLayer(
                  "neighborhood_surface",
                  deps.neighborhoodSurfaceSourceLayerFallback
                ),
              }
            : {}
        ),
        surfaceBeforeId
      );

      map.addLayer({
        id: "neighborhoods-fill",
        type: "fill",
        source: "neighborhoods",
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.6 },
        layout: { visibility: "none" },
      });
      map.addLayer({
        id: "neighborhoods-line",
        type: "line",
        source: "neighborhoods",
        paint: { "line-color": "#1e3a5f", "line-width": 2.5, "line-opacity": 0.9 },
        layout: { visibility: "none" },
      });
    }

    function applyHouseModeHexBackground() {
      if (getCurrentMode() !== "house") return;
      var surfaceLoad = hasGeneratedArtifact("neighborhood_surface")
        ? Promise.resolve(null)
        : dashboards.loadNeighborhoodSurfaceData();
      surfaceLoad.then(function () {
        if (getCurrentMode() !== "house") return;
        addNeighborhoodLayers();
        if (!map.getLayer("neighborhoods-surface")) return;
        if (map.getLayer(deps.buildingsFillLayerId)) {
          map.moveLayer("neighborhoods-surface", deps.buildingsFillLayerId);
        }
        map.setPaintProperty("neighborhoods-surface", "fill-opacity", deps.houseModeHexOpacity);
        map.setFilter("neighborhoods-surface", ["==", ["to-number", ["get", "has_buildings"], 0], 1]);
        var heatmapVisible = deps.showHeatmapToggle ? deps.showHeatmapToggle.checked : true;
        map.setLayoutProperty("neighborhoods-surface", "visibility", heatmapVisible ? "visible" : "none");
        mapRenderers.updateNeighborhoodSurfaceData();
      });
    }

    function setControlsForMode(mode) {
      var showPointsSection = document.getElementById("points-visibility-section");
      var legendSection = document.querySelector(".legend-section");
      if (mode === "house") {
        if (showPointsSection) showPointsSection.style.display = "";
        if (legendSection) legendSection.style.display = "";
        if (deps.modeHint) deps.modeHint.textContent = "Click map to analyze nearest building";
      } else if (mode === "neighborhood") {
        if (showPointsSection) showPointsSection.style.display = "none";
        if (legendSection) legendSection.style.display = "";
        if (deps.modeHint) deps.modeHint.textContent = "Click a neighborhood for details";
      } else {
        if (showPointsSection) showPointsSection.style.display = "none";
        if (legendSection) legendSection.style.display = "none";
        if (deps.modeHint) deps.modeHint.textContent = "";
      }
      syncFilterUiForScoreMode();
      updateFilterLabel();
    }

    function enterHouseMode() {
      return perf.phase("enterHouseMode", function () {
        setControlsForMode("house");
        if (map.getLayer(deps.buildingsFillLayerId)) {
          map.setLayoutProperty(deps.buildingsFillLayerId, "visibility", "visible");
          map.setPaintProperty(deps.buildingsFillLayerId, "fill-opacity", 1);
        }
        if (map.getLayer("neighborhoods-fill")) map.setLayoutProperty("neighborhoods-fill", "visibility", "none");
        if (map.getLayer("neighborhoods-line")) map.setLayoutProperty("neighborhoods-line", "visibility", "none");
        if (map.getLayer("neighborhoods-label")) map.setLayoutProperty("neighborhoods-label", "visibility", "none");
        mapRenderers.applyShowPointsToggle();
        mapRenderers.updateDeckAmenityLayers();
        mapRenderers.updateBuildingColors();
        applyHouseModeHexBackground();
      });
    }

    function enterNeighborhoodMode() {
      perf.phase("enterNeighborhoodMode:syncSetup", function () {
        logger.debug("[Neighborhood] Entering neighborhood mode");
        setControlsForMode("neighborhood");
        var radiusInfo = document.getElementById("radius-info");
        if (radiusInfo) radiusInfo.style.display = "none";
        if (map.getLayer(deps.buildingsFillLayerId)) {
          map.setLayoutProperty(deps.buildingsFillLayerId, "visibility", "none");
        }
        if (map.getLayer("parks-fill")) map.setLayoutProperty("parks-fill", "visibility", "none");
        if (map.getLayer("neighborhoods-surface")) {
          map.setPaintProperty(
            "neighborhoods-surface",
            "fill-opacity",
            dashboards.getNeighborhoodHexSurfaceOpacityExpression()
          );
          map.setFilter("neighborhoods-surface", null);
        }
        mapRenderers.setTreesAndLightsVisibility(false);
        mapRenderers.updateDeckAmenityLayers();
      });

      perf.phaseAsync(
        "enterNeighborhoodMode:loadsThenApply",
        dashboards.loadNeighborhoods().then(function (data) {
          var surfaceLoad = hasGeneratedArtifact("neighborhood_surface")
            ? Promise.resolve(null)
            : dashboards.loadNeighborhoodSurfaceData();
          return Promise.all([dashboards.loadNeighborhoodChartsPayload(), surfaceLoad]).then(function () {
            perf.phase("enterNeighborhoodMode:applyLayersFitBounds", function () {
              var src = map.getSource("neighborhoods");
              if (src) src.setData(data);
              addNeighborhoodLayers();
              mapRenderers.updateNeighborhoodColors();
              if (map.getLayer("neighborhoods-surface")) map.setLayoutProperty("neighborhoods-surface", "visibility", "visible");
              if (map.getLayer("neighborhoods-fill")) map.setLayoutProperty("neighborhoods-fill", "visibility", "visible");
              if (map.getLayer("neighborhoods-line")) map.setLayoutProperty("neighborhoods-line", "visibility", "visible");
              if (map.getLayer("neighborhoods-label")) map.setLayoutProperty("neighborhoods-label", "visibility", "visible");
              if (data.features.length > 0) {
                var bbox = turf.bbox(data);
                map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, duration: 600 });
              }
            });
          });
        })
      );
    }

    function enterCitywideMode() {
      setControlsForMode("citywide");
      dashboards.loadNeighborhoods().then(function (data) {
        dashboards.loadNeighborhoodChartsPayload().then(function () {
          var src = map.getSource("neighborhoods");
          if (src) src.setData(data);
          addNeighborhoodLayers();
          mapRenderers.updateNeighborhoodColors();
          if (map.getLayer("neighborhoods-surface")) map.setLayoutProperty("neighborhoods-surface", "visibility", "none");
          if (map.getLayer("neighborhoods-fill")) map.setLayoutProperty("neighborhoods-fill", "visibility", "visible");
          if (map.getLayer("neighborhoods-line")) map.setLayoutProperty("neighborhoods-line", "visibility", "visible");
          if (map.getLayer("neighborhoods-label")) map.setLayoutProperty("neighborhoods-label", "visibility", "visible");
        });
      });

      if (map.getLayer(deps.buildingsFillLayerId)) {
        map.setPaintProperty(deps.buildingsFillLayerId, "fill-opacity", 0.15);
        map.setPaintProperty(deps.buildingsFillLayerId, "fill-color", "#9ca3af");
      }
      mapRenderers.setTreesAndLightsVisibility(false);
      mapRenderers.updateDeckAmenityLayers();

      dashboards.loadCitywideStats().then(function (data) {
        if (!data) {
          var body = document.getElementById("citywide-body");
          if (body) body.innerHTML = '<div class="cw-section" style="text-align:center;padding:2em">Failed to load citywide data. Please reload the page.</div>';
        }
        dashboards.renderCitywideModal();
        dashboards.showCitywideModal();
      });
    }

    function switchMode(mode) {
      return perf.phase("switchMode", function () {
        if (mode === getCurrentMode()) return;
        var prevMode = getCurrentMode();
        setCurrentMode(mode);

        deps.modeToggle.querySelectorAll(".mode-opt").forEach(function (btn) {
          btn.classList.toggle("active", btn.dataset.mode === mode);
        });

        if (prevMode === "house") selection.clearRadiusSelection();
        if (prevMode === "neighborhood") {
          dashboards.hideNeighborhoodModal();
          setSelectedNeighborhood(null);
        }
        if (prevMode === "citywide") dashboards.hideCitywideModal();

        if (mode === "house") enterHouseMode();
        else if (mode === "neighborhood") enterNeighborhoodMode();
        else if (mode === "citywide") enterCitywideMode();
      });
    }

    return {
      addNeighborhoodLayers: addNeighborhoodLayers,
      applyHouseModeHexBackground: applyHouseModeHexBackground,
      enterHouseMode: enterHouseMode,
      enterNeighborhoodMode: enterNeighborhoodMode,
      enterCitywideMode: enterCitywideMode,
      switchMode: switchMode,
      setControlsForMode: setControlsForMode,
    };
  }

  window.Urban95ModeController = {
    create: create,
  };
})();
```

- [ ] **Step 4: Load `modeController.js` before `app.js`**

In `docs/index.html`, add:

```html
    <script src="./js/map/modeController.js"></script>
```

Place it after `dashboards.js` and before Turf/app if its dependency validation assumes dashboards/renderers/selection already exist.

- [ ] **Step 5: Wire the mode controller in `docs/app.js`**

Add namespace validation:

```javascript
const Urban95ModeController = requireNamespace(window, "Urban95ModeController");
requireNamespaceMember(Urban95ModeController, "Urban95ModeController", "create", "function");
```

Create the controller after `map`, DOM controls, and renderers/dashboards are configured:

```javascript
const modeController = Urban95ModeController.create({
  map: map,
  logger: Urban95Logger,
  perf: urban95Perf,
  mapRenderers: Urban95MapRenderers,
  dashboards: Urban95Dashboards,
  selection: Urban95Selection,
  buildingsFillLayerId: BUILDINGS_FILL_LAYER_ID,
  neighborhoodSurfaceSourceLayerFallback: NEIGHBORHOOD_SURFACE_SOURCE_LAYER_FALLBACK,
  houseModeHexOpacity: HOUSE_MODE_HEX_OPACITY,
  showHeatmapToggle: showHeatmapToggle,
  modeHint: modeHint,
  modeToggle: modeToggle,
  getCurrentMode: function () {
    return currentMode;
  },
  setCurrentMode: function (value) {
    currentMode = value;
  },
  setSelectedNeighborhood: function (value) {
    selectedNeighborhood = value;
  },
  syncFilterUiForScoreMode: syncFilterUiForScoreMode,
  updateFilterLabel: updateFilterLabel,
  hasGeneratedArtifact: hasGeneratedArtifact,
  sourceLayer: sourceLayer,
  getNeighborhoodSurfaceColorExpression: getNeighborhoodSurfaceColorExpression,
  getNeighborhoodSurfaceScorePropertyKey: getNeighborhoodSurfaceScorePropertyKey,
});
```

Replace direct references:

```javascript
const switchMode = modeController.switchMode;
const applyHouseModeHexBackground = modeController.applyHouseModeHexBackground;
const addNeighborhoodLayers = modeController.addNeighborhoodLayers;
```

Remove local function definitions for `addNeighborhoodLayers`, `applyHouseModeHexBackground`, `switchMode`, `setControlsForMode`, `enterHouseMode`, `enterNeighborhoodMode`, `exitNeighborhoodMode`, and `enterCitywideMode` once callers are wired.

- [ ] **Step 6: Run tests and review gates**

Run:

```bash
npm run test:frontend
git diff --check
```

Expected: both pass.

Spec-compliance review subagent prompt:

```text
Review Task 3 of docs/superpowers/plans/2026-05-20-frontend-coordinator-shrink.md for spec compliance only.
Check that mode orchestration moved into Urban95ModeController without changing house, neighborhood, or citywide behavior. Verify cleanup rules: leaving house clears radius selection, leaving neighborhood hides neighborhood modal and clears selected neighborhood, leaving citywide hides citywide modal. Verify PMTiles/lookup and neighborhood surface behavior are unchanged.
Report findings first with file/line references.
```

Code-quality review subagent prompt, only after spec review is clean:

```text
Review Task 3 of docs/superpowers/plans/2026-05-20-frontend-coordinator-shrink.md for code quality.
Focus on controller API shape, dependency grouping, hidden global coupling, readability, and whether app.js is thinner without creating a new monolith.
Do not ask for large-module splits in this task. Report findings first with file/line references.
```

---

## Task 4: Extract Map Event Binding

**Files:**
- Create: `docs/js/map/mapEvents.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [ ] **Step 1: Add failing map-events tests**

Extend script-order test:

```javascript
  assert.ok(requireScriptIndex(scripts, "./js/map/mapEvents.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/map/modeController.js") < requireScriptIndex(scripts, "./js/map/mapEvents.js"));
```

Extend namespace test:

```javascript
  runBrowserScript("docs/js/map/mapEvents.js", browser);
  assert.equal(typeof browser.window.Urban95MapEvents.bind, "function");
```

Add source contract:

```javascript
test("map event binding lives in Urban95MapEvents instead of inline app handlers", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const eventsSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "mapEvents.js"),
    "utf8"
  );

  assert.match(appSource, /Urban95MapEvents\.bind\s*\(/);
  assert.doesNotMatch(appSource, /map\.on\("click",\s*function\s*\(e\)\s*\{/);
  assert.doesNotMatch(appSource, /map\.on\("mousemove",\s*"parks-fill"/);
  assert.doesNotMatch(appSource, /map\.on\("zoomend"/);
  assert.match(eventsSource, /findClosestBuilding/);
  assert.match(eventsSource, /loadTreesIfNeeded/);
  assert.match(eventsSource, /showNeighborhoodModal/);
  assert.match(eventsSource, /showNeighborhoodAreaTooltip/);
});

test("map events register expected handlers and call injected dependencies", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapEvents.js", browser);

  const handlers = [];
  const calls = [];
  const canvas = {};
  const map = {
    on: function (eventName, layerOrHandler, maybeHandler) {
      handlers.push({
        eventName: eventName,
        layer: typeof layerOrHandler === "string" ? layerOrHandler : null,
        handler: typeof layerOrHandler === "function" ? layerOrHandler : maybeHandler,
      });
    },
    getCanvas: function () {
      return canvas;
    },
    getZoom: function () {
      return 14;
    },
    queryRenderedFeatures: function () {
      return [{ properties: { neighborhood: "A" } }];
    },
  };
  const tooltip = { style: {} };

  browser.window.Urban95MapEvents.bind({
    map: map,
    selection: {
      findClosestBuilding: function () {
        calls.push("findClosestBuilding");
        return { lng: 1, lat: 2 };
      },
      selectBuilding: function () {
        calls.push("selectBuilding");
      },
    },
    dashboards: {
      showNeighborhoodModal: function () {
        calls.push("showNeighborhoodModal");
      },
      getNeighborhoodFeatureAtPoint: function () {
        calls.push("getNeighborhoodFeatureAtPoint");
        return { properties: { name: "N" } };
      },
      showNeighborhoodAreaTooltip: function () {
        calls.push("showNeighborhoodAreaTooltip");
      },
    },
    mapRenderers: {
      updateTreesSource: function () {
        calls.push("updateTreesSource");
      },
      updateStreetLightsSource: function () {
        calls.push("updateStreetLightsSource");
      },
    },
    pointDataLoader: {
      loadTreesIfNeeded: function () {
        calls.push("loadTreesIfNeeded");
      },
      loadStreetLightsIfNeeded: function () {
        calls.push("loadStreetLightsIfNeeded");
      },
    },
    tooltip: tooltip,
    buildingsFillLayerId: "buildings-fill",
    getCurrentMode: function () {
      return "neighborhood";
    },
    getDeckHovering: function () {
      return false;
    },
    getLastDeckClickTime: function () {
      return 0;
    },
    getScoreMode: function () {
      return "weighted";
    },
    formatArea: function (area) {
      return area + " sqm";
    },
  });

  assert.ok(handlers.some((h) => h.eventName === "click" && h.layer === null));
  assert.ok(handlers.some((h) => h.eventName === "zoomend" && h.layer === null));
  assert.ok(handlers.some((h) => h.eventName === "mousemove" && h.layer === "parks-fill"));
  assert.ok(handlers.some((h) => h.eventName === "click" && h.layer === "neighborhoods-fill"));
  assert.ok(handlers.some((h) => h.eventName === "click" && h.layer === "neighborhoods-surface"));

  handlers.find((h) => h.eventName === "zoomend").handler();
  assert.ok(calls.includes("loadTreesIfNeeded"));
  assert.ok(calls.includes("loadStreetLightsIfNeeded"));
  assert.ok(calls.includes("updateTreesSource"));
  assert.ok(calls.includes("updateStreetLightsSource"));

  handlers.find((h) => h.eventName === "click" && h.layer === "neighborhoods-fill").handler({
    features: [{ properties: { name: "N" } }],
  });
  assert.ok(calls.includes("showNeighborhoodModal"));
});
```

- [ ] **Step 2: Run the failing map-events tests**

Run:

```bash
npm run test:frontend
```

Expected before implementation: FAIL because `mapEvents.js` does not exist or `Urban95MapEvents.bind` is missing.

- [ ] **Step 3: Create `docs/js/map/mapEvents.js`**

Create this module and move the existing inline map event handlers into it:

```javascript
(function () {
  function requireFunction(deps, name) {
    if (!deps || typeof deps[name] !== "function") {
      throw new Error("Urban95MapEvents requires " + name);
    }
    return deps[name];
  }

  function bind(deps) {
    deps = deps || {};
    var map = deps.map;
    var selection = deps.selection;
    var dashboards = deps.dashboards;
    var mapRenderers = deps.mapRenderers;
    var pointDataLoader = deps.pointDataLoader;
    var tooltip = deps.tooltip;
    var getCurrentMode = requireFunction(deps, "getCurrentMode");
    var getDeckHovering = requireFunction(deps, "getDeckHovering");
    var getLastDeckClickTime = requireFunction(deps, "getLastDeckClickTime");
    var getScoreMode = requireFunction(deps, "getScoreMode");
    var formatArea = requireFunction(deps, "formatArea");

    map.on("click", function (e) {
      if (getCurrentMode() !== "house") return;
      if (e.originalEvent.target !== map.getCanvas()) return;
      if (Date.now() - getLastDeckClickTime() < 300) return;
      var closest = selection.findClosestBuilding(e.lngLat);
      if (closest) selection.selectBuilding(closest, true);
    });

    map.on("mouseenter", deps.buildingsFillLayerId, function () {
      if (!getDeckHovering()) map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", deps.buildingsFillLayerId, function () {
      if (!getDeckHovering()) map.getCanvas().style.cursor = "";
    });

    map.on("mousemove", "parks-fill", function (e) {
      if (getDeckHovering()) return;
      map.getCanvas().style.cursor = "pointer";
      var p = e.features[0].properties;
      var lines = [p.name || "Unnamed Park"];
      if (p.area != null) lines.push("Area: " + formatArea(p.area));
      tooltip.textContent = lines.join("\n");
      tooltip.style.display = "block";
      tooltip.style.left = e.point.x + 12 + "px";
      tooltip.style.top = e.point.y + 12 + "px";
    });

    map.on("mouseleave", "parks-fill", function () {
      if (!getDeckHovering()) map.getCanvas().style.cursor = "";
      tooltip.style.display = "none";
    });

    map.on("zoomend", function () {
      if (map.getZoom() >= 13) {
        pointDataLoader.loadTreesIfNeeded();
        pointDataLoader.loadStreetLightsIfNeeded();
      }
      if (getScoreMode() === "weighted") {
        mapRenderers.updateTreesSource();
        mapRenderers.updateStreetLightsSource();
      }
    });

    map.on("click", "neighborhoods-fill", function (e) {
      if (getCurrentMode() !== "neighborhood") return;
      var feature = e.features && e.features.length > 0 ? e.features[0] : null;
      if (feature) dashboards.showNeighborhoodModal(feature);
    });

    map.on("click", "neighborhoods-surface", function (e) {
      if (getCurrentMode() !== "neighborhood") return;
      var neighborhoodFeature = dashboards.getNeighborhoodFeatureAtPoint(e.point);
      if (neighborhoodFeature) dashboards.showNeighborhoodModal(neighborhoodFeature);
    });

    map.on("mouseenter", "neighborhoods-fill", function () {
      if (getCurrentMode() === "neighborhood") map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseenter", "neighborhoods-surface", function () {
      if (getCurrentMode() === "neighborhood") map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "neighborhoods-fill", function () {
      if (getCurrentMode() === "neighborhood") {
        map.getCanvas().style.cursor = "";
        tooltip.style.display = "none";
      }
    });

    map.on("mouseleave", "neighborhoods-surface", function () {
      if (getCurrentMode() === "neighborhood") {
        map.getCanvas().style.cursor = "";
        tooltip.style.display = "none";
      }
    });

    map.on("mousemove", "neighborhoods-fill", function (e) {
      if (getCurrentMode() !== "neighborhood") return;
      var areaFeature = map.queryRenderedFeatures(e.point, { layers: ["neighborhoods-surface"] })[0];
      dashboards.showNeighborhoodAreaTooltip(e.point, areaFeature || null);
    });

    map.on("mousemove", "neighborhoods-surface", function (e) {
      if (getCurrentMode() !== "neighborhood" || !e.features || e.features.length === 0) return;
      dashboards.showNeighborhoodAreaTooltip(e.point, e.features[0]);
    });
  }

  window.Urban95MapEvents = {
    bind: bind,
  };
})();
```

- [ ] **Step 4: Load `mapEvents.js` before `app.js`**

In `docs/index.html`, add:

```html
    <script src="./js/map/mapEvents.js"></script>
```

Place it after `modeController.js` and before `app.js`.

- [ ] **Step 5: Wire map events in `docs/app.js`**

Add namespace validation:

```javascript
const Urban95MapEvents = requireNamespace(window, "Urban95MapEvents");
requireNamespaceMember(Urban95MapEvents, "Urban95MapEvents", "bind", "function");
```

Replace the inline map event handlers with:

```javascript
Urban95MapEvents.bind({
  map: map,
  selection: Urban95Selection,
  dashboards: Urban95Dashboards,
  mapRenderers: Urban95MapRenderers,
  pointDataLoader: pointDataLoader,
  tooltip: tooltip,
  buildingsFillLayerId: BUILDINGS_FILL_LAYER_ID,
  getCurrentMode: function () {
    return currentMode;
  },
  getDeckHovering: function () {
    return _deckHovering;
  },
  getLastDeckClickTime: function () {
    return _lastDeckClickTime;
  },
  getScoreMode: getScoreModeState,
  formatArea: formatArea,
});
```

Remove the corresponding inline `map.on(...)` blocks for:

- bare house-mode click
- building cursor enter/leave
- parks hover tooltip
- zoomend lazy point loading
- neighborhood click/hover/move handlers

Leave `Urban95InfoModal.bind(...)` in `app.js` for this pass unless review shows it is a clean one-line move.

- [ ] **Step 6: Run tests and review gates**

Run:

```bash
npm run test:frontend
git diff --check
```

Expected: both pass.

Spec-compliance review subagent prompt:

```text
Review Task 4 of docs/superpowers/plans/2026-05-20-frontend-coordinator-shrink.md for spec compliance only.
Check that map event behavior moved into Urban95MapEvents without changing building click selection, parks tooltip, zoom-triggered tree/street-light lazy loading, weighted-mode source refresh, or neighborhood click/tooltip behavior.
Report findings first with file/line references.
```

Code-quality review subagent prompt, only after spec review is clean:

```text
Review Task 4 of docs/superpowers/plans/2026-05-20-frontend-coordinator-shrink.md for code quality.
Focus on event binding dependency clarity, duplicated map access, cursor/tooltip cleanup, and whether app.js no longer owns long inline event bodies.
Do not request unrelated renderer/dashboard splits. Report findings first with file/line references.
```

---

## Task 5: Final Coordinator Audit And Browser Proof

**Files:**
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`
- Modify: `docs/superpowers/plans/2026-05-20-frontend-coordinator-shrink.md`

- [ ] **Step 1: Add final coordinator guardrail test**

Add this test:

```javascript
test("app coordinator delegates startup, modes, and map events", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  assert.match(appSource, /Urban95Startup\.run\s*\(/);
  assert.match(appSource, /Urban95ModeController\.create\s*\(/);
  assert.match(appSource, /Urban95MapEvents\.bind\s*\(/);
  assert.doesNotMatch(appSource, /map\.on\("mousemove",\s*"neighborhoods-/);
  assert.doesNotMatch(appSource, /map\.on\("mousemove",\s*"parks-fill"/);
  assert.doesNotMatch(appSource, /console\.log\("[Load]/);
  assert.doesNotMatch(appSource, /console\.log\("[Neighborhood]/);
});
```

- [ ] **Step 2: Replace any touched raw startup/mode/event `console.log` with logger calls**

In files created or touched by this plan, use:

```javascript
Urban95Logger.debug("[Label]", value);
Urban95Logger.perf("[Timing]", function () {
  return Math.round(performance.now() - startedAt) + "ms";
});
```

Keep existing `console.error` or `console.warn` only if they are outside touched code or if review prefers delaying full logging cleanup to pass 3. For touched code, prefer:

```javascript
Urban95Logger.error("Failed to load amenities:", err);
Urban95Logger.warn("Data warning:", detail);
```

- [ ] **Step 3: Run static verification**

Run:

```bash
npm run test:frontend
git diff --check
git status --short
```

Expected:

- `npm run test:frontend` passes.
- `git diff --check` reports no whitespace errors.
- `git status --short` shows only intended files from this plan.

- [ ] **Step 4: Run browser smoke/network proof**

Start the app:

```bash
npm run start
```

If port `8080` is busy or unresponsive, use:

```bash
npx http-server . -c-1 -p 8081
```

Run a browser probe using whichever local Playwright/Chromium setup is available. The proof must verify:

- `http://localhost:8080/docs/index.html` or `http://localhost:8081/docs/index.html` loads with no page errors.
- Startup requests generated PMTiles/lookup paths when artifacts exist.
- Startup does not eagerly request full `buildings_accessibility.geojson`, `isochrones.geojson`, `amenities_new.geojson`, or `amenities_all.geojson` when generated lookup artifacts exist.
- Clicking a building in house mode opens the score sidebar.
- Switching to Amenities Focus still loads/defer-loads isochrones as before.
- Switching to neighborhood mode shows neighborhood layers and clicking a neighborhood opens the modal.
- Switching to citywide mode opens the citywide modal.
- Mobile width smoke at `390px` has no obvious fatal layout overlap caused by this pass.

Record the exact URL, command, and observed result in an `Implementation Results` section appended to this plan.

- [ ] **Step 5: Final review gates**

Spec-compliance review subagent prompt:

```text
Review the completed implementation of docs/superpowers/plans/2026-05-20-frontend-coordinator-shrink.md for spec compliance only.
Check all hard constraints: no commits, no git worktrees, no bundler/tooling migration, Python out of scope, PMTiles render-only, lookup-first analysis, startup/mode/event behavior preserved, logger quiet by default, and required verification evidence present.
Report findings first with file/line references. Do not do code-quality review.
```

Code-quality review subagent prompt, only after spec review is clean:

```text
Review the completed implementation of docs/superpowers/plans/2026-05-20-frontend-coordinator-shrink.md for code quality.
Focus on whether app.js is now a clearer coordinator, whether new modules have coherent responsibilities, whether dependency injection is readable, whether logger usage is maintainable, and whether tests protect meaningful contracts.
Report findings first with file/line references.
```

- [ ] **Step 6: Append implementation results**

Append this section to this plan with real values from the implementation run:

```markdown
## Implementation Results

- Implemented by: [agent/model/session]
- Finished at: [timestamp]
- Files changed:
  - [path]
- Static verification:
  - `npm run test:frontend`: [result]
  - `git diff --check`: [result]
  - `git status --short`: [result]
- Browser proof:
  - URL: [local URL]
  - Startup page errors: [result]
  - Startup generated-artifact network proof: [result]
  - House/building click: [result]
  - Amenities Focus switch: [result]
  - Neighborhood mode: [result]
  - Citywide mode: [result]
  - Mobile 390px smoke: [result]
- Review gates:
  - Spec-compliance review: [clean or findings fixed]
  - Code-quality review: [clean or findings fixed]
- Follow-up notes:
  - Pass 2 large-module split candidates:
    - `docs/js/map/mapRenderers.js`
    - `docs/js/ui/dashboards.js`
    - `docs/js/ui/scoreSidebar.js`
  - Pass 3 logger cleanup candidates:
    - remaining raw runtime logs outside touched startup/mode/event code
```

## Plan Self-Review

- **Spec coverage:** This plan covers pass 1 only: coordinator shrink through logger, startup, mode controller, and map events. Pass 2 and pass 3 are intentionally documented but not implemented here.
- **Placeholder scan:** No `TBD`, `TODO`, or unspecified "handle edge cases" tasks remain. Each implementation task includes exact file paths, public API shape, test additions, verification commands, and review prompts.
- **Type consistency:** New namespaces are `Urban95Logger`, `Urban95Startup`, `Urban95ModeController`, and `Urban95MapEvents`. `app.js` should validate each namespace before use. The public methods used in tests match the planned module exports.
- **Execution style:** The writing-plans skill recommends frequent commits, but the user's explicit hard constraint is no commits. This plan replaces commit steps with `git diff --check`, `git status --short`, subagent review gates, and browser proof.

## Implementation Results

- Implemented by: Codex coordinator with fresh per-task implementation and review subagents.
- Finished at: 2026-05-20 19:21:55 +03:00.
- Files changed:
  - `docs/app.js`
  - `docs/index.html`
  - `docs/js/core/logger.js`
  - `docs/js/core/startup.js`
  - `docs/js/map/mapEvents.js`
  - `docs/js/map/modeController.js`
  - `tests/frontend/module_contracts.test.js`
  - `docs/superpowers/plans/2026-05-20-frontend-coordinator-shrink.md`
- Static verification:
  - `npm run test:frontend`: passed, 94/94 tests.
  - `git diff --check`: exit 0; Git reported LF-to-CRLF warnings for touched files, with no whitespace errors.
  - `git status --short`: only plan-scope modified/untracked files were present.
- Browser proof:
  - URL: `http://localhost:8081/docs/index.html` because port 8080 was occupied/unresponsive.
  - Command: temporary `npx playwright`/Chromium probe via `NODE_PATH` pointed at the npx Playwright cache.
  - Startup page errors: none.
  - Startup generated-artifact network proof: observed PMTiles, `buildings_lookup.json`, and `points_lookup.json` requests.
  - Full GeoJSON eager-load guard: no eager requests for `buildings_accessibility.geojson(.gz)`, `isochrones.geojson(.gz)`, `amenities_new.geojson(.gz)`, or `amenities_all.geojson(.gz)`.
  - House/building click: opened the score sidebar.
  - Amenities Focus switch: selected the expanded score model and requested `isochrones_lookup.json`.
  - Neighborhood mode: mode activated and a map click opened the neighborhood modal.
  - Citywide mode: opened the citywide modal.
  - Mobile 390px smoke: no page errors, no horizontal overflow, map and mode controls visible.
- Review gates:
  - Task 1: spec-compliance review clean after fixes; code-quality review clean after fixes.
  - Task 2: spec-compliance review clean after fixes; code-quality review clean after fixes.
  - Task 3: spec-compliance review clean after fixes; code-quality review clean after fixes.
  - Task 4: spec-compliance review clean; code-quality review clean after fixes.
  - Final Task 5: spec-compliance review clean after fixing the required guardrail test name; code-quality review clean.
- Design decisions:
  - Kept `Urban95ModeController` public API to `switchMode`, `addNeighborhoodLayers`, and `applyHouseModeHexBackground`; entry helpers remain private so `app.js` stays a coordinator rather than a second mode owner.
  - Used explicit UI element injection in `modeController.js` instead of document lookups inside the controller.
  - Kept `Urban95MapEvents` fixed to current layer IDs (`parks-fill`, `neighborhoods-fill`, `neighborhoods-surface`) because those are current map contracts.
  - Kept the browser probe temporary rather than adding Playwright as a project dependency.
- Deviations:
  - Port 8080 was already occupied and did not answer the smoke URL, so browser proof used the plan fallback port 8081.
  - Local `playwright` / `@playwright/test` packages were not installed; the browser probe used the npx Playwright cache with `NODE_PATH` instead of modifying package dependencies.
- Residual risks:
  - Task 4 quality review noted malformed neighborhood hover/click payloads have less direct test coverage than house click and park hover.
  - Future map layer renames still need coordinated changes to `mapEvents.js` and its contract tests.
- Follow-up notes:
  - Pass 2 large-module split candidates remain `docs/js/map/mapRenderers.js`, `docs/js/ui/dashboards.js`, and `docs/js/ui/scoreSidebar.js`.
  - Pass 3 logger cleanup candidates are remaining raw runtime logs outside touched startup/mode/event code.
