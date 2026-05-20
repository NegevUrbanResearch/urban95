# Final App Coordinator Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `docs/app.js` the final no-bundler bootstrap coordinator by moving remaining feature ownership into focused plain-script modules.

**Architecture:** Keep the static GitHub Pages architecture: global `window.Urban95...` namespaces, explicit script ordering in `docs/index.html`, and no bundler or framework. `docs/app.js` should only validate namespaces, create shared state/runtime objects, gather DOM handles, configure modules, and bind startup/events/controls/modals. Feature logic for score explanation, loading UI, map/sidebar chrome, amenity-mode switching, and control reactions moves into dedicated modules with injected dependencies.

**Tech Stack:** HTML/CSS/vanilla JavaScript, MapLibre GL JS, Turf.js, deck.gl, Chart.js, Node.js built-in `node:test`, existing `http-server`, optional temporary Playwright/browser probe.

---

## Hard Constraints

- No commits.
- No git worktrees.
- Preserve unrelated dirty or untracked files.
- Do not add a bundler, transpiler, TypeScript, framework, package migration, build output directory, ESLint, Prettier, or new test runner.
- Keep Python pipeline/scripts out of scope.
- Keep `docs/style.css` out of scope unless browser smoke reveals a regression caused by this plan.
- Do not change scoring formulas, UI labels, data filenames, generated artifact schemas, PMTiles generation behavior, map styling, or lookup-vs-render semantics.
- PMTiles remain render artifacts only. Lookup JSON and GeoJSON fallback paths remain authoritative for selection, scoring, isochrones, and point-in-polygon analysis.
- Do not split `docs/js/map/mapRenderers.js`, `docs/js/ui/dashboards.js`, or `docs/js/map/selection.js` internally in this plan. This is the final `docs/app.js` ownership extraction pass, not a broad module-family refactor.
- After each implementation task, run a spec-compliance review subagent first, then a code-quality review subagent. Do not start code-quality review until spec compliance is clean.
- Do not claim completion until `npm run test:frontend`, `git diff --check`, `git status --short`, and browser smoke/network proof are clean.

## Current Baseline

- Current `HEAD`: `eae1d97 refactor(map): shrink map coordinator seams`.
- `docs/app.js` is about `2539` lines.
- `git status --short` was clean during planning.
- Existing frontend modules:
  - `docs/js/core/config.js`
  - `docs/js/core/dataArtifacts.js`
  - `docs/js/core/loaders.js`
  - `docs/js/core/logger.js`
  - `docs/js/core/runtimeData.js`
  - `docs/js/core/startup.js`
  - `docs/js/core/perfPanel.js`
  - `docs/js/core/appState.js`
  - `docs/js/scoring/scoreModel.js`
  - `docs/js/map/mapLayers.js`
  - `docs/js/map/mapRenderers.js`
  - `docs/js/map/selection.js`
  - `docs/js/map/modeController.js`
  - `docs/js/map/mapEvents.js`
  - `docs/js/ui/controls.js`
  - `docs/js/ui/scoreSidebar.js`
  - `docs/js/ui/infoModal.js`
  - `docs/js/ui/dashboards.js`

## Perspective Ensemble

### Panel A - Council

- **Coordinator boundary:** Concern -> a "final pass" can still leave `app.js` as a feature graveyard. Flag -> score explanation, loading UI, control reactions, and amenity-mode application are still implemented inline. Counter-move -> add final guardrail tests that ban those function bodies from `app.js` and require explicit module calls instead.
- **No-bundler load order:** Concern -> every extracted file creates another global namespace and order risk. Flag -> `scoreSidebar.js` and `dashboards.js` will depend on new utility modules. Counter-move -> keep new modules few and load them immediately before their consumers: score explain before score sidebar/dashboards, loading UI before selection/startup usage, app actions before controls binding.
- **Behavior safety:** Concern -> control callbacks and score-mode switching touch many visible surfaces. Flag -> moving them can break selected building refresh, modal refresh, neighborhood surface updates, or isochrone blocking behavior. Counter-move -> write source and behavioral contract tests first, then finish with browser proof for house, Amenities Focus, neighborhood, citywide, and mobile.
- **Dependency clarity:** Concern -> moving code into modules with one huge dependency bag would only hide the coupling. Flag -> `app.js` already injects many getters/setters into renderer, selection, dashboards, and controls. Counter-move -> group dependencies by `state`, `runtime`, `ui`, `integrations`, `loading`, and `callbacks`, and add source tests that reject known legacy app-owned functions.
- **Scope discipline:** Concern -> `mapRenderers.js`, `dashboards.js`, and `scoreSidebar.js` are large enough to tempt a second refactor inside the final pass. Flag -> broad feature-module decomposition would increase verification surface. Counter-move -> move only logic currently owned by `app.js`; do not reorganize internals of already-extracted modules.

### Tensions

- Smaller `app.js` vs fewer script files: final coordinator clarity is worth several focused modules, but each module must have a stable responsibility and load-order test.
- Complete extraction vs verification cost: this pass should be broad enough to be final for `app.js`, but every moved behavior needs targeted contracts and browser proof.
- Pure ownership vs pragmatic wiring: some tiny state getters/setters may stay in `app.js` because the coordinator still owns shared mutable app state.

### Panel B - Adversarial

- **Attack target:** A final extraction pass that makes `app.js` shorter while making the app harder to reason about through scattered feature ownership.
- **Dependency-laundering vector:** Vulnerability -> new modules accept generic `deps` with dozens of callbacks. Failure scenario -> a mode bug requires tracing `app.js` -> `controlActions.js` -> `amenityMode.js` -> `scoreExplain.js` -> `scoreSidebar.js`. Mitigation/probe -> each new module owns one domain, validates grouped dependencies, and exposes verbs that match user-visible behavior.
- **Behavior-regression vector:** Vulnerability -> score-mode and filter callbacks are order-sensitive. Failure scenario -> Amenities Focus switches models but leaves stale radius counts, stale sidebar, or stale citywide/neighborhood modal contents. Mitigation/probe -> add tests for control action call order and run browser smoke that switches score model with a selected building.
- **False-finality vector:** Vulnerability -> the plan declares the last `app.js` pass but leaves large helpers like `buildExplainScoreBreakdown` or loading UI in place. Failure scenario -> next change again starts with "one more app.js pass." Mitigation/probe -> final source guardrail test lists banned app-owned helper names and a maximum line-count budget.
- **Review fatigue vector:** Vulnerability -> too many subagent gates produce shallow approvals. Failure scenario -> reviewers say "clean" while app-source guardrails miss real behavior ownership. Mitigation/probe -> each review prompt has a narrow task-specific checklist and the final review includes app-source ownership assertions.

### Strongest Attack

The strongest way to sink this plan is to show that it moves code out of `app.js` but leaves ownership ambiguous. If score explanation still depends on half a dozen app-private helpers, or controls still call back into app-owned reaction bodies, then the final pass is mostly cosmetic. The implementation must prove a sharper boundary through tests: `app.js` delegates score explanation, loading UI, amenity switching, and control reactions to named modules, and only keeps shared state wiring.

### Falsifiers / Early Warnings

- `docs/app.js` remains above roughly `1200` lines after the pass.
- Source tests still find `buildExplainScoreBreakdown`, `updateLoadingProgress`, `applyScoreModeAmenities`, or `handleControlsScoreModeChanged` in `docs/app.js`.
- New modules expose generic names like `runStuff`, `handleChange`, or ungrouped flat dependency lists.
- Browser proof shows stale selected-building sidebar after score-mode or walk-minute changes.
- Network proof shows the startup path eagerly fetching full GeoJSON artifacts when lookup/PMTiles artifacts exist.

### Recommendation

Proceed with one final `app.js` ownership extraction pass. Keep already-extracted large modules intact, but move all remaining app-owned feature logic into six small ownership modules: `loadingUi`, `scoreExplain`, `scoreSidebarChrome`, `iconLoader`, `amenityMode`, and `controlActions`. Finish with guardrail tests that make another broad `app.js` pass unnecessary.

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
      loadingUi.js
      perfPanel.js
    map/
      iconLoader.js
      mapEvents.js
      mapLayers.js
      mapRenderers.js
      modeController.js
      selection.js
    scoring/
      scoreModel.js
      scoreExplain.js
    ui/
      amenityMode.js
      controlActions.js
      controls.js
      dashboards.js
      infoModal.js
      scoreSidebar.js
      scoreSidebarChrome.js
tests/
  frontend/
    helpers/
      loadBrowserScript.js
    module_contracts.test.js
    score_model.test.js
```

## Final Ownership Boundaries

- `docs/app.js`: namespace validation, app-state object creation, map creation, constant extraction from config/contracts, DOM lookup, module configuration, startup call, event/control/modal binding. It may keep tiny getters/setters that bridge shared mutable state, but it must not build score-explain payloads, mutate loading UI, implement control reactions, or choose amenity datasets.
- `docs/js/core/loadingUi.js`: Loading-state lifecycle, progress/status DOM updates, isochrone blocking overlay, timeout hide behavior, and `waitingForIsochroneLoad` state.
- `docs/js/ui/scoreSidebarChrome.js`: Sidebar map padding and focus restoration behavior tied to sidebar open/close.
- `docs/js/scoring/scoreExplain.js`: Score-explanation presentation helpers and data builders: row icons, horizon label/bar helpers, color helpers, percentile series builders, `buildExplainScoreBreakdown`, and weighted subcategory comparison rendering.
- `docs/js/map/iconLoader.js`: MapLibre image registration for amenity SVG icons, including fetch/blob loading, direct image fallback, and non-fatal warning behavior.
- `docs/js/ui/amenityMode.js`: Score-mode amenity source selection: clean-vs-legacy data choice, filter-data refresh, point-data lazy expansion, renderer refresh, selected-building refresh, and warning when legacy Amenities Focus data is missing.
- `docs/js/ui/controlActions.js`: Control reaction bodies currently in `app.js`: filter selection, score-mode change, walk-minute change, mode toggle request, Escape, heatmap visibility, and derived-cache clearing.

---

## Task 1: Add Final Script-Order And App Ownership Guardrails

**Files:**
- Modify: `tests/frontend/module_contracts.test.js`

- [ ] **Step 1: Add failing script-order assertions**

In `tests/frontend/module_contracts.test.js`, extend `index loads core frontend modules before app.js` with these exact assertions:

```javascript
  const loadingUiIndex = requireScriptIndex(scripts, "./js/core/loadingUi.js");
  assert.ok(startupIndex < loadingUiIndex);
  assert.ok(loadingUiIndex < appIndex);

  const scoreExplainIndex = requireScriptIndex(scripts, "./js/scoring/scoreExplain.js");
  const scoreSidebarChromeIndex = requireScriptIndex(scripts, "./js/ui/scoreSidebarChrome.js");
  const scoreSidebarIndex = requireScriptIndex(scripts, "./js/ui/scoreSidebar.js");
  assert.ok(requireScriptIndex(scripts, "./js/scoring/scoreModel.js") < scoreExplainIndex);
  assert.ok(scoreExplainIndex < scoreSidebarIndex);
  assert.ok(scoreSidebarChromeIndex < scoreSidebarIndex);

  const iconLoaderIndex = requireScriptIndex(scripts, "./js/map/iconLoader.js");
  assert.ok(requireScriptIndex(scripts, "./js/map/mapLayers.js") < iconLoaderIndex);
  assert.ok(iconLoaderIndex < appIndex);

  const amenityModeIndex = requireScriptIndex(scripts, "./js/ui/amenityMode.js");
  const controlActionsIndex = requireScriptIndex(scripts, "./js/ui/controlActions.js");
  const controlsIndex = requireScriptIndex(scripts, "./js/ui/controls.js");
  assert.ok(amenityModeIndex < controlsIndex);
  assert.ok(controlActionsIndex < controlsIndex);
  assert.ok(controlActionsIndex < appIndex);
```

- [ ] **Step 2: Add failing namespace assertions**

In `core modules expose stable Urban95 namespaces`, after the existing UI module loads, add:

```javascript
  runBrowserScript("docs/js/core/loadingUi.js", browser);
  runBrowserScript("docs/js/scoring/scoreExplain.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);
  runBrowserScript("docs/js/map/iconLoader.js", browser);
  runBrowserScript("docs/js/ui/amenityMode.js", browser);
  runBrowserScript("docs/js/ui/controlActions.js", browser);

  assert.equal(typeof browser.window.Urban95LoadingUi.create, "function");
  assert.equal(typeof browser.window.Urban95ScoreExplain.create, "function");
  assert.equal(typeof browser.window.Urban95ScoreSidebarChrome.create, "function");
  assert.equal(typeof browser.window.Urban95IconLoader.create, "function");
  assert.equal(typeof browser.window.Urban95AmenityMode.create, "function");
  assert.equal(typeof browser.window.Urban95ControlActions.create, "function");
```

- [ ] **Step 3: Add final app-source guardrail test**

Add this test near the other source-level app tests:

```javascript
test("app.js is final coordinator only after ownership extraction", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const appLines = appSource.split(/\r?\n/).length;

  assert.ok(appLines <= 1200, "docs/app.js should stay at or below 1200 lines after final coordinator extraction, got " + appLines);

  [
    /function\s+buildExplainScoreBreakdown\b/,
    /function\s+fillExplainSeries\b/,
    /function\s+renderHorizonIcon\b/,
    /function\s+horizonBarFillStyle\b/,
    /function\s+updateLoadingProgress\b/,
    /function\s+showIsochroneLoadingScreen\b/,
    /function\s+hideIsochroneLoadingScreen\b/,
    /function\s+loadAmenityIcons\b/,
    /function\s+applyScoreModeAmenities\b/,
    /function\s+handleControlsFilterSelectionChanged\b/,
    /function\s+handleControlsScoreModeChanged\b/,
    /function\s+handleControlsWalkMinutesChanged\b/,
    /function\s+handleControlsEscape\b/,
    /function\s+renderWeightedSubcategoryComparisonList\b/,
  ].forEach(function (pattern) {
    assert.doesNotMatch(appSource, pattern);
  });

  [
    /Urban95LoadingUi\.create\s*\(/,
    /Urban95ScoreExplain\.create\s*\(/,
    /Urban95ScoreSidebarChrome\.create\s*\(/,
    /Urban95IconLoader\.create\s*\(/,
    /Urban95AmenityMode\.create\s*\(/,
    /Urban95ControlActions\.create\s*\(/,
    /Urban95Startup\.run\s*\(/,
    /Urban95Controls\.bind\s*\(/,
    /Urban95MapEvents\.bind\s*\(/,
  ].forEach(function (pattern) {
    assert.match(appSource, pattern);
  });
});
```

- [ ] **Step 4: Run failing tests**

Run:

```bash
npm run test:frontend
```

Expected before implementation: FAIL because the new files are not loaded and namespaces do not exist.

- [ ] **Step 5: Review gates**

Spec-compliance review subagent prompt:

```text
Review Task 1 of docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md for spec compliance only.
Check that tests fail for missing final extraction modules, script order is guarded, and app.js final coordinator guardrails ban score explanation, loading UI, icon loading, amenity-mode, and control-action function bodies.
Report findings first with file/line references. Do not do code-quality review.
```

Code-quality review subagent prompt, only after spec review is clean:

```text
Review Task 1 of docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md for code quality.
Focus on whether the source guardrails are meaningful without being brittle against harmless whitespace or formatting, and whether the 1200-line budget is a useful final app.js boundary.
Report findings first with file/line references.
```

---

## Task 2: Extract Loading UI Ownership

**Files:**
- Create: `docs/js/core/loadingUi.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [ ] **Step 1: Add loading UI behavior tests**

Add this test:

```javascript
test("loading UI owns progress, status, isochrone overlay, and timeout state", () => {
  const browser = createBrowserContext({
    setTimeout: function (callback) {
      browser.timeoutCallback = callback;
      return 1;
    },
  });
  runBrowserScript("docs/js/core/loadingUi.js", browser);

  const loadingScreen = {
    classList: {
      names: new Set(),
      contains(name) { return this.names.has(name); },
      add(name) { this.names.add(name); },
      remove(name) { this.names.delete(name); },
    },
  };
  const loadingStatus = { textContent: "" };
  const loadingProgressBar = { style: { width: "" } };
  const warnings = [];

  const loading = browser.window.Urban95LoadingUi.create({
    elements: { loadingScreen, loadingStatus, loadingProgressBar },
    logger: { warn: function () { warnings.push(Array.from(arguments)); } },
    setTimeout: function (callback) {
      browser.timeoutCallback = callback;
      return 1;
    },
    timeoutMs: 10,
  });

  loading.setStatus("Loading buildings...");
  assert.equal(loadingStatus.textContent, "Loading buildings...");

  loading.mark("icons");
  loading.mark("buildings");
  assert.equal(loadingProgressBar.style.width, "29%");

  loading.showIsochroneLoadingScreen();
  assert.equal(loading.getWaitingForIsochroneLoad(), true);
  assert.equal(loadingProgressBar.style.width, "100%");
  assert.equal(loadingStatus.textContent, "Loading walking areas for Amenities Focus...");

  browser.timeoutCallback();
  assert.equal(loadingScreen.classList.contains("hidden"), false);
  assert.deepEqual(warnings, []);

  loading.hideIsochroneLoadingScreen();
  assert.equal(loading.getWaitingForIsochroneLoad(), false);
  ["parks", "trees", "amenities", "isochrones", "mapReady"].forEach(function (key) {
    loading.mark(key);
  });
  assert.equal(loadingProgressBar.style.width, "100%");
});
```

- [ ] **Step 2: Create `docs/js/core/loadingUi.js`**

Create this module:

```javascript
(function () {
  var DEFAULT_KEYS = ["icons", "buildings", "parks", "trees", "amenities", "isochrones", "mapReady"];

  function requireObject(value, name) {
    if (!value || typeof value !== "object") throw new Error("Urban95LoadingUi.create missing " + name);
    return value;
  }

  function create(deps) {
    deps = deps || {};
    var elements = requireObject(deps.elements, "elements");
    var logger = deps.logger || { warn: function () {} };
    var setTimeoutFn = typeof deps.setTimeout === "function" ? deps.setTimeout : window.setTimeout.bind(window);
    var timeoutMs = Number.isFinite(deps.timeoutMs) ? deps.timeoutMs : 60000;
    var loadingScreen = elements.loadingScreen || null;
    var loadingStatus = elements.loadingStatus || null;
    var loadingProgressBar = elements.loadingProgressBar || null;
    var loadingState = {};
    var waitingForIsochroneLoad = false;

    DEFAULT_KEYS.forEach(function (key) {
      loadingState[key] = false;
    });

    function hideLoadingScreen() {
      if (loadingScreen && loadingScreen.classList && !loadingScreen.classList.contains("hidden")) {
        setTimeoutFn(function () {
          loadingScreen.classList.add("hidden");
        }, 300);
      }
    }

    function updateProgress() {
      var items = DEFAULT_KEYS.map(function (key) {
        return !!loadingState[key];
      });
      var loaded = items.filter(Boolean).length;
      var percent = Math.round((loaded / items.length) * 100);
      if (loadingProgressBar) loadingProgressBar.style.width = percent + "%";
      if (loaded === items.length) hideLoadingScreen();
    }

    function mark(key) {
      if (!Object.prototype.hasOwnProperty.call(loadingState, key)) {
        throw new Error("Urban95LoadingUi unknown loading key: " + key);
      }
      loadingState[key] = true;
      updateProgress();
    }

    function setStatus(message) {
      if (loadingStatus) loadingStatus.textContent = message;
    }

    function showIsochroneLoadingScreen() {
      waitingForIsochroneLoad = true;
      if (loadingScreen && loadingScreen.classList) loadingScreen.classList.remove("hidden");
      if (loadingProgressBar) loadingProgressBar.style.width = "100%";
      setStatus("Loading walking areas for Amenities Focus...");
    }

    function hideIsochroneLoadingScreen() {
      waitingForIsochroneLoad = false;
      if (DEFAULT_KEYS.every(function (key) { return !!loadingState[key]; })) hideLoadingScreen();
    }

    setTimeoutFn(function () {
      if (!loadingScreen || !loadingScreen.classList || loadingScreen.classList.contains("hidden")) return;
      if (waitingForIsochroneLoad) return;
      if (logger && typeof logger.warn === "function") logger.warn("Loading timeout - forcing hide");
      hideLoadingScreen();
    }, timeoutMs);

    return {
      state: loadingState,
      mark: mark,
      setStatus: setStatus,
      updateProgress: updateProgress,
      hideLoadingScreen: hideLoadingScreen,
      showIsochroneLoadingScreen: showIsochroneLoadingScreen,
      hideIsochroneLoadingScreen: hideIsochroneLoadingScreen,
      getWaitingForIsochroneLoad: function () {
        return waitingForIsochroneLoad;
      },
    };
  }

  window.Urban95LoadingUi = { create: create };
})();
```

- [ ] **Step 3: Load `loadingUi.js`**

In `docs/index.html`, add after `startup.js` and before `perfPanel.js`:

```html
    <script src="./js/core/loadingUi.js"></script>
```

- [ ] **Step 4: Wire loading UI in `docs/app.js`**

Replace the loading-state block in `docs/app.js` with:

```javascript
const loadingUi = Urban95LoadingUi.create({
  elements: {
    loadingScreen: document.getElementById("loading-screen"),
    loadingStatus: document.querySelector(".loading-status"),
    loadingProgressBar: document.querySelector(".loading-progress-bar"),
  },
  logger: Urban95Logger,
});
```

Then replace call sites:

```javascript
setLoadingStatus(message)
```

with:

```javascript
loadingUi.setStatus(message)
```

Replace:

```javascript
updateLoadingProgress()
```

with:

```javascript
loadingUi.updateProgress()
```

Replace:

```javascript
showIsochroneLoadingScreen()
hideIsochroneLoadingScreen()
waitingForIsochroneLoad
loadingState
```

with:

```javascript
loadingUi.showIsochroneLoadingScreen()
loadingUi.hideIsochroneLoadingScreen()
loadingUi.getWaitingForIsochroneLoad()
loadingUi.state
```

In the `Urban95Startup.run` loading dependency group, use:

```javascript
    loading: {
      setStatus: loadingUi.setStatus,
      markMapReady: function () {
        loadingUi.mark("mapReady");
      },
      markIconsLoaded: function () {
        loadingUi.mark("icons");
      },
      markBuildingsLoaded: function () {
        loadingUi.mark("buildings");
      },
      markParksLoaded: function () {
        loadingUi.mark("parks");
      },
      markAmenitiesLoaded: function () {
        loadingUi.mark("amenities");
      },
      markTreesDeferred: function () {
        loadingUi.mark("trees");
      },
      markIsochronesDeferred: function () {
        loadingUi.mark("isochrones");
      },
    },
```

- [ ] **Step 5: Run tests and review gates**

Run:

```bash
npm run test:frontend
git diff --check
```

Expected after implementation: tests pass except later final guardrail assertions that depend on not-yet-extracted modules may still fail if Task 1 guardrail was added before all tasks. If running the full suite at this point, expected failures must be limited to not-yet-implemented final modules or app-source bans from later tasks.

Spec-compliance review subagent prompt:

```text
Review Task 2 of docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md for spec compliance only.
Check that loading UI ownership moved to Urban95LoadingUi, app.js uses loadingUi state/methods, selection/startup still receive equivalent loading hooks, and timeout/isochrone blocking semantics are preserved.
Report findings first with file/line references.
```

Code-quality review subagent prompt, only after spec review is clean:

```text
Review Task 2 of docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md for code quality.
Focus on dependency validation, loading-state readability, timeout behavior, and whether app.js no longer owns loading UI mutations.
Report findings first with file/line references.
```

---

## Task 3: Extract Score Sidebar Chrome And Score Explanation Ownership

**Files:**
- Create: `docs/js/ui/scoreSidebarChrome.js`
- Create: `docs/js/scoring/scoreExplain.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Modify: `docs/js/ui/scoreSidebar.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [ ] **Step 1: Add score sidebar chrome and score explanation tests**

Add this test:

```javascript
test("score sidebar chrome owns map padding and focus restoration", () => {
  const browser = createBrowserContext({
    matchMedia: function (query) {
      return { matches: query === "(max-width: 768px)" ? false : false };
    },
  });
  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);

  const calls = [];
  const canvas = {
    setAttribute: function () {},
    focus: function () { calls.push("canvas-focus"); },
  };
  const map = {
    getPadding: function () { return { top: 1, right: 2, bottom: 3, left: 4 }; },
    setPadding: function (padding) { calls.push(["padding", padding]); },
    resize: function () { calls.push("resize"); },
    getCanvas: function () { return canvas; },
  };

  const chrome = browser.window.Urban95ScoreSidebarChrome.create({
    map: map,
    document: {
      getElementById: function () { return null; },
    },
    matchMedia: browser.window.matchMedia,
  });

  chrome.setSidebarPadding(true, 360);
  chrome.setSidebarPadding(false, 0);
  chrome.restoreFocusAfterHide();

  assert.deepEqual(calls[0], ["padding", { top: 1, right: 360, bottom: 3, left: 4 }]);
  assert.equal(calls[1], "resize");
  assert.deepEqual(calls[2], ["padding", { top: 1, right: 2, bottom: 3, left: 4 }]);
  assert.equal(calls[3], "resize");
  assert.equal(calls[4], "canvas-focus");
});
```

Add this test:

```javascript
test("score explanation module builds weighted breakdowns without app.js helpers", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/scoring/scoreExplain.js", browser);

  const scoreExplain = browser.window.Urban95ScoreExplain.create({
    scoreModel: {
      CLEAN_WEIGHTS: { trees: 0.25 },
      CLEAN_SCORE_COMPONENTS: [],
      WEIGHTED_CATEGORY_COMPONENTS: [
        { stem: "nature", label: "Nature", weight: 0.15, color: "#22c55e" },
      ],
      WEIGHTED_SUBCATEGORY_COMPONENTS: {
        nature: [{ stem: "parks", label: "Parks", weight: 0.5 }],
      },
      WEIGHTED_CATEGORY_BY_STEM: {
        nature: { label: "Nature" },
      },
      amenityTypeToBuildingStatKey: function (type) { return type; },
      getAmenityConfig: function (type) { return { label: type, icon: "marker" }; },
      hasCleanPtsBreakdown: function () { return false; },
      cleanPtsPropertyName: function (key, minutes) { return key + "_" + minutes; },
      computePercentileRank: function () { return 50; },
      formatMetricNumber: function (value) { return String(Math.round(Number(value) || 0)); },
      formatScoreInteger: function (value) { return String(Math.round(Number(value) || 0)); },
      getFilteredContributionForType: function () { return 0; },
      getExpandedContributionForType: function () { return 0; },
    },
    iconsBase: "./icons",
    state: {
      getScoreMode: function () { return "weighted"; },
      getScoreMinutes: function () { return 10; },
      getWalkMinutes: function () { return 10; },
      getSelectedAmenityTypes: function () { return new Set(["nature"]); },
      getAllFilterTypes: function () { return ["nature"]; },
      getBuildingsData: function () { return { features: [] }; },
      getLatestRadiusCounts: function () { return {}; },
      hasPercentileSeries: function () { return false; },
      getPercentileSeries: function () { return null; },
      setPercentileSeries: function () {},
      getBuildingAmenityStatKeysForMinutes: function () { return new Set(); },
      getBuildingOverallScore: function (props) { return Number(props.score_weighted_10min) || 0; },
    },
  });

  const breakdown = scoreExplain.buildExplainScoreBreakdown({
    score_weighted_10min: 72,
    score_weighted_nature_10min: 64,
    score_weighted_sub_nature_parks_10min: 55,
  });

  assert.equal(breakdown.overallScoreLabel, "72");
  assert.equal(breakdown.weightedCategories.length, 1);
  assert.equal(breakdown.weightedCategories[0].subrows[0].value, 55);
  assert.equal(scoreExplain.getWeightedCategoryIcon("nature"), "park");
  assert.match(scoreExplain.renderHorizonIcon("park", "#22c55e"), /horizon-icon/);
});
```

- [ ] **Step 2: Create `docs/js/ui/scoreSidebarChrome.js`**

Create this module:

```javascript
(function () {
  function cloneMapPadding(padding) {
    return {
      top: Number(padding && padding.top) || 0,
      right: Number(padding && padding.right) || 0,
      bottom: Number(padding && padding.bottom) || 0,
      left: Number(padding && padding.left) || 0,
    };
  }

  function create(deps) {
    deps = deps || {};
    var map = deps.map;
    var doc = deps.document || window.document;
    var matchMediaFn = deps.matchMedia || window.matchMedia.bind(window);
    if (!map) throw new Error("Urban95ScoreSidebarChrome.create missing map");
    var paddingActive = false;
    var paddingSnapshot = null;

    function readMapPaddingSnapshot() {
      if (typeof map.getPadding === "function") return cloneMapPadding(map.getPadding());
      if (map.transform && map.transform.padding) return cloneMapPadding(map.transform.padding);
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }

    function setSidebarPadding(open, width) {
      var isMobile = matchMediaFn("(max-width: 768px)").matches;
      if (open && !isMobile) {
        if (!paddingActive) paddingSnapshot = readMapPaddingSnapshot();
        paddingActive = true;
        map.setPadding(Object.assign({}, paddingSnapshot, { right: Math.round(width || 0) }));
        map.resize();
        return;
      }
      if (paddingActive && paddingSnapshot) map.setPadding(paddingSnapshot);
      paddingActive = false;
      paddingSnapshot = null;
      map.resize();
    }

    function restoreFocusAfterHide() {
      var canvas = typeof map.getCanvas === "function" ? map.getCanvas() : null;
      if (canvas) {
        canvas.setAttribute("tabindex", "-1");
        canvas.focus({ preventScroll: true });
        return;
      }
      var mapEl = doc.getElementById ? doc.getElementById("map") : null;
      if (mapEl) {
        mapEl.setAttribute("tabindex", "-1");
        mapEl.focus({ preventScroll: true });
      }
    }

    return {
      setSidebarPadding: setSidebarPadding,
      restoreFocusAfterHide: restoreFocusAfterHide,
    };
  }

  window.Urban95ScoreSidebarChrome = { create: create };
})();
```

- [ ] **Step 3: Create `docs/js/scoring/scoreExplain.js`**

Create `Urban95ScoreExplain.create(deps)` by moving these exact responsibilities from `docs/app.js`:

```javascript
SCORE_EXPLAIN_WEIGHTED_CATEGORY_ICONS
SCORE_EXPLAIN_WEIGHTED_SUB_ICONS
SCORE_EXPLAIN_CLEAN_ICON_BY_KEY
SCORE_EXPLAIN_ROW_ICON_BY_LABEL
getWeightedCategoryIcon
getWeightedSubcategoryIcon
getCleanComponentIcon
getScoreExplainRowIcon
renderHorizonIcon
SCORE_EXPLAIN_ICON_NEUTRAL
getScoreExplainRowIconColor
getScoreExplainPartialFilterSet
isScoreExplainRowFilterHighlighted
isScoreExplainCategoryFilterHighlighted
parseColorChannels
channelsToCss
mixChannels
mixColorWithWhite
horizonBarFillStyle
horizonSubBarFillStyle
renderHorizonLabelCell
renderHorizonSubLabelCell
getSelectedWeightedCategoryStem
getSelectedWeightedCategoryLabel
buildFilteredFormulaLine
fillExplainSeries
getOrdinalSuffix
formatScoreExplainRowValue
renderWeightedSubcategoryComparisonList
getPercentileSeriesForMinutes
buildPercentileMetrics
percentileForSeries
buildExplainScoreBreakdown
escapeHtml
explainRankBarColor
heroPercentileMeterFillStyle
```

The module must expose at least:

```javascript
window.Urban95ScoreExplain = {
  create: create,
};
```

`create(deps)` must return:

```javascript
{
  escapeHtml,
  renderHorizonLabelCell,
  renderHorizonSubLabelCell,
  getWeightedCategoryIcon,
  getWeightedSubcategoryIcon,
  getScoreExplainRowIcon,
  getScoreExplainRowIconColor,
  getScoreExplainPartialFilterSet,
  isScoreExplainCategoryFilterHighlighted,
  isScoreExplainRowFilterHighlighted,
  formatScoreExplainRowValue,
  horizonBarFillStyle,
  horizonSubBarFillStyle,
  explainRankBarColor,
  heroPercentileMeterFillStyle,
  getOrdinalSuffix,
  buildExplainScoreBreakdown,
  buildPercentileMetrics,
  renderWeightedSubcategoryComparisonList,
  getSelectedWeightedCategoryStem,
  getSelectedWeightedCategoryLabel,
  scoreExplainIconNeutral: SCORE_EXPLAIN_ICON_NEUTRAL,
}
```

Use grouped dependencies:

```javascript
const scoreExplain = Urban95ScoreExplain.create({
  scoreModel: Urban95ScoreModel,
  iconsBase: ICONS_BASE,
  state: {
    getScoreMode: getScoreModeState,
    getScoreMinutes: getScoreMinutes,
    getWalkMinutes: getWalkMinutesState,
    getSelectedAmenityTypes: getSelectedAmenityTypesState,
    getAllFilterTypes: getAllFilterTypesState,
    getBuildingsData: function () { return buildingsData; },
    getLatestRadiusCounts: getLatestRadiusCountsState,
    hasPercentileSeries: hasPercentileSeriesState,
    getPercentileSeries: getPercentileSeriesState,
    setPercentileSeries: setPercentileSeriesState,
    getBuildingAmenityStatKeysForMinutes: getCurrentBuildingAmenityStatKeysForMinutes,
    getBuildingOverallScore: getCurrentBuildingOverallScore,
  },
});
```

- [ ] **Step 4: Load score modules**

In `docs/index.html`, add after `scoreModel.js` and before `mapLayers.js`:

```html
    <script src="./js/scoring/scoreExplain.js"></script>
    <script src="./js/ui/scoreSidebarChrome.js"></script>
```

- [ ] **Step 5: Wire score modules in `docs/app.js`**

Add namespace validation:

```javascript
const Urban95ScoreExplain = requireNamespace(window, "Urban95ScoreExplain");
requireNamespaceMember(Urban95ScoreExplain, "Urban95ScoreExplain", "create", "function");
const Urban95ScoreSidebarChrome = requireNamespace(window, "Urban95ScoreSidebarChrome");
requireNamespaceMember(Urban95ScoreSidebarChrome, "Urban95ScoreSidebarChrome", "create", "function");
```

Create module instances:

```javascript
const scoreSidebarChrome = Urban95ScoreSidebarChrome.create({
  map: map,
  document: document,
  matchMedia: window.matchMedia.bind(window),
});

const scoreExplain = Urban95ScoreExplain.create({
  scoreModel: Urban95ScoreModel,
  iconsBase: ICONS_BASE,
  state: {
    getScoreMode: getScoreModeState,
    getScoreMinutes: getScoreMinutes,
    getWalkMinutes: getWalkMinutesState,
    getSelectedAmenityTypes: getSelectedAmenityTypesState,
    getAllFilterTypes: getAllFilterTypesState,
    getBuildingsData: function () {
      return buildingsData;
    },
    getLatestRadiusCounts: getLatestRadiusCountsState,
    hasPercentileSeries: hasPercentileSeriesState,
    getPercentileSeries: getPercentileSeriesState,
    setPercentileSeries: setPercentileSeriesState,
    getBuildingAmenityStatKeysForMinutes: getCurrentBuildingAmenityStatKeysForMinutes,
    getBuildingOverallScore: getCurrentBuildingOverallScore,
  },
});
```

Then update `Urban95ScoreSidebar.configure` so the moved helpers come from `scoreExplain` and `scoreSidebarChrome`:

```javascript
  escapeHtml: scoreExplain.escapeHtml,
  renderHorizonLabelCell: scoreExplain.renderHorizonLabelCell,
  renderHorizonSubLabelCell: scoreExplain.renderHorizonSubLabelCell,
  getWeightedCategoryIcon: scoreExplain.getWeightedCategoryIcon,
  getWeightedSubcategoryIcon: scoreExplain.getWeightedSubcategoryIcon,
  getScoreExplainRowIcon: scoreExplain.getScoreExplainRowIcon,
  getScoreExplainPartialFilterSet: scoreExplain.getScoreExplainPartialFilterSet,
  isScoreExplainCategoryFilterHighlighted: scoreExplain.isScoreExplainCategoryFilterHighlighted,
  isScoreExplainRowFilterHighlighted: scoreExplain.isScoreExplainRowFilterHighlighted,
  formatScoreExplainRowValue: scoreExplain.formatScoreExplainRowValue,
  horizonBarFillStyle: scoreExplain.horizonBarFillStyle,
  horizonSubBarFillStyle: scoreExplain.horizonSubBarFillStyle,
  explainRankBarColor: scoreExplain.explainRankBarColor,
  heroPercentileMeterFillStyle: scoreExplain.heroPercentileMeterFillStyle,
  getOrdinalSuffix: scoreExplain.getOrdinalSuffix,
  buildExplainScoreBreakdown: scoreExplain.buildExplainScoreBreakdown,
  buildPercentileMetrics: scoreExplain.buildPercentileMetrics,
  setSidebarPadding: scoreSidebarChrome.setSidebarPadding,
  restoreFocusAfterHide: scoreSidebarChrome.restoreFocusAfterHide,
  scoreExplainIconNeutral: scoreExplain.scoreExplainIconNeutral,
```

Update `Urban95Dashboards.configure` dependencies:

```javascript
  escapeHtml: scoreExplain.escapeHtml,
  getSelectedWeightedCategoryLabel: scoreExplain.getSelectedWeightedCategoryLabel,
  getSelectedWeightedCategoryStem: scoreExplain.getSelectedWeightedCategoryStem,
  renderWeightedSubcategoryComparisonList: scoreExplain.renderWeightedSubcategoryComparisonList,
  getOrdinalSuffix: scoreExplain.getOrdinalSuffix,
```

- [ ] **Step 6: Remove moved helpers from `docs/app.js`**

Delete the moved helper constants and functions from `docs/app.js`. Keep only tiny score-state bridge functions like `getCurrentScoreModelContext`, `getCurrentBuildingOverallScore`, and `getScoreMinutes` if still needed by several modules.

- [ ] **Step 7: Run tests and review gates**

Run:

```bash
npm run test:frontend
git diff --check
```

Expected: tests pass except known later guardrail failures for not-yet-extracted `amenityMode` and `controlActions` if those files have not been implemented yet.

Spec-compliance review subagent prompt:

```text
Review Task 3 of docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md for spec compliance only.
Check that score explanation and sidebar chrome ownership left app.js, scoreSidebar and dashboards receive equivalent helpers, formulas and labels are unchanged, and no map/sidebar padding behavior regressed.
Report findings first with file/line references.
```

Code-quality review subagent prompt, only after spec review is clean:

```text
Review Task 3 of docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md for code quality.
Focus on scoreExplain dependency shape, lack of app-private leakage, reusable pure helpers, and whether scoreSidebarChrome is focused.
Report findings first with file/line references.
```

---

## Task 4: Extract Map Icon Loading Ownership

**Files:**
- Create: `docs/js/map/iconLoader.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [ ] **Step 1: Add icon loader behavior test**

Add this test:

```javascript
test("icon loader registers amenity icons with fallback and non-fatal warnings", async () => {
  const objectUrls = [];
  const browser = createBrowserContext({
    Blob: function Blob(parts, options) {
      this.parts = parts;
      this.options = options;
    },
    URL: {
      createObjectURL: function (blob) {
        objectUrls.push(blob);
        return "blob://icon";
      },
      revokeObjectURL: function (url) {
        objectUrls.push("revoked:" + url);
      },
    },
  });
  runBrowserScript("docs/js/map/iconLoader.js", browser);

  const added = [];
  const warnings = [];
  function FakeImage() {
    var image = this;
    Object.defineProperty(image, "src", {
      set: function () {
        if (typeof image.onload === "function") image.onload();
      },
    });
  }
  browser.window.Image = FakeImage;

  const loader = browser.window.Urban95IconLoader.create({
    map: {
      hasImage: function () { return false; },
      addImage: function (name, image, options) { added.push({ name, image, options }); },
    },
    iconsBase: "./icons",
    scoreModel: {
      AMENITY_TYPE_CONFIG: {
        park: { icon: "park" },
        school: { icon: "school" },
      },
      DEFAULT_CONFIG: { icon: "marker" },
    },
    fetch: function () {
      return Promise.resolve({
        ok: true,
        text: function () { return Promise.resolve("<svg></svg>"); },
      });
    },
    Image: FakeImage,
    Blob: browser.window.Blob,
    URL: browser.window.URL,
    logger: {
      warn: function () { warnings.push(Array.from(arguments)); },
    },
  });

  await loader.loadAmenityIcons();

  assert.deepEqual(added.map(function (entry) { return entry.name; }).sort(), ["marker", "park", "school"]);
  assert.equal(added[0].options.sdf, true);
  assert.deepEqual(warnings, []);
  assert.equal(loader.areIconsLoaded(), true);
});
```

- [ ] **Step 2: Create `docs/js/map/iconLoader.js`**

Create this module:

```javascript
(function () {
  function create(deps) {
    deps = deps || {};
    var map = deps.map;
    var iconsBase = deps.iconsBase;
    var scoreModel = deps.scoreModel || {};
    var fetchFn = deps.fetch || window.fetch.bind(window);
    var ImageCtor = deps.Image || window.Image;
    var BlobCtor = deps.Blob || window.Blob;
    var urlApi = deps.URL || window.URL;
    var logger = deps.logger || { warn: function () {} };
    var iconsLoaded = false;

    if (!map) throw new Error("Urban95IconLoader.create missing map");
    if (!iconsBase) throw new Error("Urban95IconLoader.create missing iconsBase");

    function iconNamesFromScoreModel() {
      var names = new Set();
      var config = scoreModel.AMENITY_TYPE_CONFIG || {};
      Object.keys(config).forEach(function (key) {
        if (config[key] && config[key].icon) names.add(config[key].icon);
      });
      if (scoreModel.DEFAULT_CONFIG && scoreModel.DEFAULT_CONFIG.icon) {
        names.add(scoreModel.DEFAULT_CONFIG.icon);
      }
      return Array.from(names);
    }

    function addImageIfMissing(iconName, image) {
      if (!map.hasImage(iconName)) map.addImage(iconName, image, { sdf: true });
    }

    function loadDirect(iconName, resolve) {
      var image = new ImageCtor();
      image.crossOrigin = "anonymous";
      image.onload = function () {
        addImageIfMissing(iconName, image);
        resolve();
      };
      image.onerror = function () {
        logger.warn("Failed to load icon:", iconName);
        resolve();
      };
      image.src = iconsBase + "/" + iconName + ".svg";
    }

    function loadOne(iconName) {
      return new Promise(function (resolve) {
        fetchFn(iconsBase + "/" + iconName + ".svg")
          .then(function (response) {
            if (!response.ok) throw new Error("Network response was not ok");
            return response.text();
          })
          .then(function (svgText) {
            var blob = new BlobCtor([svgText], { type: "image/svg+xml" });
            var url = urlApi.createObjectURL(blob);
            var image = new ImageCtor();
            image.onload = function () {
              addImageIfMissing(iconName, image);
              urlApi.revokeObjectURL(url);
              resolve();
            };
            image.onerror = function () {
              logger.warn("Failed to create image for icon:", iconName);
              urlApi.revokeObjectURL(url);
              resolve();
            };
            image.src = url;
          })
          .catch(function () {
            loadDirect(iconName, resolve);
          });
      });
    }

    function loadAmenityIcons() {
      return Promise.all(iconNamesFromScoreModel().map(loadOne)).then(function () {
        iconsLoaded = true;
      });
    }

    return {
      loadAmenityIcons: loadAmenityIcons,
      areIconsLoaded: function () {
        return iconsLoaded;
      },
    };
  }

  window.Urban95IconLoader = { create: create };
})();
```

- [ ] **Step 3: Load `iconLoader.js`**

In `docs/index.html`, add after `mapLayers.js` and before `mapRenderers.js`:

```html
    <script src="./js/map/iconLoader.js"></script>
```

- [ ] **Step 4: Wire icon loader in `docs/app.js`**

Add namespace validation:

```javascript
const Urban95IconLoader = requireNamespace(window, "Urban95IconLoader");
requireNamespaceMember(Urban95IconLoader, "Urban95IconLoader", "create", "function");
```

Create:

```javascript
const iconLoader = Urban95IconLoader.create({
  map: map,
  iconsBase: ICONS_BASE,
  scoreModel: Urban95ScoreModel,
  fetch: fetch.bind(window),
  Image: Image,
  Blob: Blob,
  URL: URL,
  logger: Urban95Logger,
});
```

Replace startup callback:

```javascript
loadAmenityIcons: loadAmenityIcons,
```

with:

```javascript
loadAmenityIcons: iconLoader.loadAmenityIcons,
```

Delete `let iconsLoaded = false;` and `async function loadAmenityIcons()` from `docs/app.js` unless another module still reads `iconsLoaded`. If another module reads that flag during implementation, replace the read with `iconLoader.areIconsLoaded()`.

- [ ] **Step 5: Run tests and review gates**

Run:

```bash
npm run test:frontend
git diff --check
```

Expected: tests pass except final guardrail failures for not-yet-extracted `amenityMode` and `controlActions` if those tasks are pending.

Spec-compliance review subagent prompt:

```text
Review Task 4 of docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md for spec compliance only.
Check that amenity SVG icon loading moved from app.js to Urban95IconLoader, fetch/blob loading and direct-image fallback are preserved, warnings remain non-fatal, and startup receives iconLoader.loadAmenityIcons.
Report findings first with file/line references.
```

Code-quality review subagent prompt, only after spec review is clean:

```text
Review Task 4 of docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md for code quality.
Focus on browser compatibility, dependency injection, URL cleanup, icon-name collection, and whether the module owns only MapLibre icon registration.
Report findings first with file/line references.
```

---

## Task 5: Extract Amenity Mode Ownership

**Files:**
- Create: `docs/js/ui/amenityMode.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [ ] **Step 1: Add amenity mode behavior test**

Add this test:

```javascript
test("amenity mode owns clean-vs-legacy selection and refresh order", async () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/amenityMode.js", browser);

  const calls = [];
  const state = {
    scoreMode: "expanded",
    cleanData: { features: [{ properties: { amenity_type: "park" } }] },
    legacyData: { features: [{ properties: { amenity_type: "school" } }] },
    selectedBuilding: { lng: 1, lat: 2 },
    currentMode: "house",
    allAmenitiesData: null,
    allAmenityTypes: [],
    typesWithData: new Set(),
  };

  const amenityMode = browser.window.Urban95AmenityMode.create({
    perf: { phase: function (name, callback) { calls.push("phase:" + name); return callback(); } },
    logger: { warn: function () { calls.push("warn"); } },
    state: {
      getScoreMode: function () { return state.scoreMode; },
      getCleanData: function () { return state.cleanData; },
      getCleanTypes: function () { return ["park"]; },
      getCleanTypesWithData: function () { return new Set(["park"]); },
      getLegacyData: function () { return state.legacyData; },
      getLegacyTypes: function () { return ["school"]; },
      getLegacyTypesWithData: function () { return new Set(["school"]); },
      setAllAmenitiesData: function (value) { state.allAmenitiesData = value; calls.push("setData"); },
      setAllAmenityTypes: function (value) { state.allAmenityTypes = value; calls.push("setTypes"); },
      setTypesWithData: function (value) { state.typesWithData = value; calls.push("setTypesWithData"); },
      clearRadiusIds: function () { calls.push("clearRadius"); },
      getCurrentMode: function () { return state.currentMode; },
      getSelectedBuilding: function () { return state.selectedBuilding; },
    },
    ui: {
      buildFilterItems: function () { calls.push("buildFilterItems"); },
      syncFilterUiForScoreMode: function () { calls.push("syncFilter"); },
      updateShowPointsToggleLabel: function () { calls.push("toggleLabel"); },
    },
    pointDataLoader: {
      ensureExpandedPointDataLoaded: function () { calls.push("ensureExpanded"); return Promise.resolve(); },
      canRefreshPointAnalysisAfterPointDataLoad: function () { return true; },
    },
    renderers: {
      applyShowPointsToggle: function () { calls.push("applyShowPoints"); },
      updateAmenitiesSource: function () { calls.push("amenitiesSource"); },
      updateTreesSource: function () { calls.push("treesSource"); },
      updateStreetLightsSource: function () { calls.push("lightsSource"); },
      updateBuildingColors: function () { calls.push("buildingColors"); },
      updateNeighborhoodSurfaceData: function () { calls.push("surfaceData"); },
    },
    selection: {
      selectBuilding: function () { calls.push("selectBuilding"); },
    },
  });

  await amenityMode.apply();

  assert.equal(state.allAmenitiesData, state.legacyData);
  assert.deepEqual(state.allAmenityTypes, ["school"]);
  assert.deepEqual(Array.from(state.typesWithData), ["school"]);
  assert.deepEqual(calls, [
    "phase:applyScoreModeAmenities",
    "setData",
    "setTypes",
    "setTypesWithData",
    "clearRadius",
    "buildFilterItems",
    "syncFilter",
    "toggleLabel",
    "ensureExpanded",
    "applyShowPoints",
    "amenitiesSource",
    "treesSource",
    "lightsSource",
    "buildingColors",
    "surfaceData",
    "selectBuilding",
  ]);
});
```

- [ ] **Step 2: Create `docs/js/ui/amenityMode.js`**

Create this module:

```javascript
(function () {
  function requireFunction(value, name) {
    if (typeof value !== "function") throw new Error("Urban95AmenityMode.create missing " + name);
    return value;
  }

  function hasFeatures(fc) {
    return !!fc && Array.isArray(fc.features) && fc.features.length > 0;
  }

  function create(deps) {
    deps = deps || {};
    var perf = deps.perf || { phase: function (_name, callback) { return callback(); } };
    var logger = deps.logger || { warn: function () {} };
    var state = deps.state || {};
    var ui = deps.ui || {};
    var renderers = deps.renderers || {};
    var selection = deps.selection || {};
    var pointDataLoader = deps.pointDataLoader || {};

    [
      ["state.getScoreMode", state.getScoreMode],
      ["state.getCleanData", state.getCleanData],
      ["state.getCleanTypes", state.getCleanTypes],
      ["state.getCleanTypesWithData", state.getCleanTypesWithData],
      ["state.getLegacyData", state.getLegacyData],
      ["state.getLegacyTypes", state.getLegacyTypes],
      ["state.getLegacyTypesWithData", state.getLegacyTypesWithData],
      ["state.setAllAmenitiesData", state.setAllAmenitiesData],
      ["state.setAllAmenityTypes", state.setAllAmenityTypes],
      ["state.setTypesWithData", state.setTypesWithData],
      ["state.clearRadiusIds", state.clearRadiusIds],
      ["state.getCurrentMode", state.getCurrentMode],
      ["state.getSelectedBuilding", state.getSelectedBuilding],
      ["ui.buildFilterItems", ui.buildFilterItems],
      ["ui.syncFilterUiForScoreMode", ui.syncFilterUiForScoreMode],
      ["ui.updateShowPointsToggleLabel", ui.updateShowPointsToggleLabel],
      ["pointDataLoader.ensureExpandedPointDataLoaded", pointDataLoader.ensureExpandedPointDataLoaded],
      ["pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad", pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad],
      ["renderers.applyShowPointsToggle", renderers.applyShowPointsToggle],
      ["renderers.updateAmenitiesSource", renderers.updateAmenitiesSource],
      ["renderers.updateTreesSource", renderers.updateTreesSource],
      ["renderers.updateStreetLightsSource", renderers.updateStreetLightsSource],
      ["renderers.updateBuildingColors", renderers.updateBuildingColors],
      ["renderers.updateNeighborhoodSurfaceData", renderers.updateNeighborhoodSurfaceData],
      ["selection.selectBuilding", selection.selectBuilding],
    ].forEach(function (entry) {
      requireFunction(entry[1], entry[0]);
    });

    function apply() {
      return perf.phase("applyScoreModeAmenities", function () {
        var scoreMode = state.getScoreMode();
        var legacyData = state.getLegacyData();
        var useLegacy = scoreMode === "expanded" && hasFeatures(legacyData);
        if (scoreMode === "expanded" && !useLegacy && logger && typeof logger.warn === "function") {
          logger.warn("amenities_all.geojson missing or empty; Amenities Focus mode may be incomplete.");
        }
        if (useLegacy) {
          state.setAllAmenitiesData(legacyData);
          state.setAllAmenityTypes(state.getLegacyTypes().slice());
          state.setTypesWithData(new Set(state.getLegacyTypesWithData()));
        } else {
          state.setAllAmenitiesData(state.getCleanData());
          state.setAllAmenityTypes(state.getCleanTypes().slice());
          state.setTypesWithData(new Set(state.getCleanTypesWithData()));
        }
        state.clearRadiusIds();
        ui.buildFilterItems();
        ui.syncFilterUiForScoreMode();
        ui.updateShowPointsToggleLabel();
        return pointDataLoader.ensureExpandedPointDataLoaded().then(function () {
          renderers.applyShowPointsToggle();
          renderers.updateAmenitiesSource();
          renderers.updateTreesSource();
          renderers.updateStreetLightsSource();
          if (state.getCurrentMode() === "house") {
            renderers.updateBuildingColors();
            renderers.updateNeighborhoodSurfaceData();
          }
          if (state.getSelectedBuilding() && pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad()) {
            selection.selectBuilding(state.getSelectedBuilding(), false);
          }
        });
      });
    }

    return { apply: apply };
  }

  window.Urban95AmenityMode = { create: create };
})();
```

- [ ] **Step 3: Load amenity mode module**

In `docs/index.html`, add after `scoreSidebarChrome.js` and before `mapLayers.js`:

```html
    <script src="./js/ui/amenityMode.js"></script>
```

- [ ] **Step 4: Wire `Urban95AmenityMode` in `docs/app.js`**

Add namespace validation:

```javascript
const Urban95AmenityMode = requireNamespace(window, "Urban95AmenityMode");
requireNamespaceMember(Urban95AmenityMode, "Urban95AmenityMode", "create", "function");
```

Create:

```javascript
const amenityMode = Urban95AmenityMode.create({
  perf: urban95Perf,
  logger: Urban95Logger,
  state: {
    getScoreMode: getScoreModeState,
    getCleanData: function () { return allAmenitiesDataClean; },
    getCleanTypes: function () { return allAmenityTypesClean; },
    getCleanTypesWithData: function () { return typesWithDataClean; },
    getLegacyData: function () { return allAmenitiesDataLegacy; },
    getLegacyTypes: function () { return allAmenityTypesLegacy; },
    getLegacyTypesWithData: function () { return typesWithDataLegacy; },
    setAllAmenitiesData: function (value) { allAmenitiesData = value; },
    setAllAmenityTypes: function (value) { allAmenityTypes = value; },
    setTypesWithData: function (value) { typesWithData = value; },
    clearRadiusIds: clearRadiusIdsState,
    getCurrentMode: function () { return currentMode; },
    getSelectedBuilding: function () { return selectedBuildingCentroid; },
  },
  ui: {
    buildFilterItems: function () { buildFilterItems(allAmenityTypes); },
    syncFilterUiForScoreMode: syncFilterUiForScoreMode,
    updateShowPointsToggleLabel: updateShowPointsToggleLabel,
  },
  pointDataLoader: pointDataLoader,
  renderers: Urban95MapRenderers,
  selection: Urban95Selection,
});
```

Replace all `applyScoreModeAmenities` callback references with:

```javascript
amenityMode.apply
```

Delete `function applyScoreModeAmenities()` from `docs/app.js`.

- [ ] **Step 5: Run tests and review gates**

Run:

```bash
npm run test:frontend
git diff --check
```

Expected: tests pass except final control-action extraction guardrails if Task 6 is not implemented yet.

Spec-compliance review subagent prompt:

```text
Review Task 5 of docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md for spec compliance only.
Check that clean-vs-legacy amenity selection, warning behavior, clear-radius behavior, point-data expansion, renderer refresh order, and selected-building refresh moved from app.js to Urban95AmenityMode without changing semantics.
Report findings first with file/line references.
```

Code-quality review subagent prompt, only after spec review is clean:

```text
Review Task 5 of docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md for code quality.
Focus on explicit dependency grouping, call-order readability, and whether the module owns only amenity-mode application.
Report findings first with file/line references.
```

---

## Task 6: Extract Control Action Ownership

**Files:**
- Create: `docs/js/ui/controlActions.js`
- Modify: `docs/index.html`
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`

- [ ] **Step 1: Add control action behavior test**

Add this test:

```javascript
test("control actions own score-mode, filter, walk-minute, escape, and heatmap reactions", async () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/controlActions.js", browser);

  const calls = [];
  let mode = "house";
  let selectedBuilding = { lng: 1, lat: 2 };
  let isochronesLoaded = false;
  let waitingForIsochrones = false;
  const modals = {
    neighborhood: { classList: { contains: function () { return true; } } },
    citywide: { classList: { contains: function () { return true; } } },
  };

  const actions = browser.window.Urban95ControlActions.create({
    perf: {
      session: function (name) { calls.push("session:" + name); },
      phase: function (name, callback) { calls.push("phase:" + name); return callback(); },
    },
    state: {
      getCurrentMode: function () { return mode; },
      getSelectedBuilding: function () { return selectedBuilding; },
      getSelectedNeighborhood: function () { return { properties: { name: "N" } }; },
      getIsochronesLoaded: function () { return isochronesLoaded; },
      setIsochronesDeferred: function () { calls.push("isochronesDeferred"); },
    },
    loading: {
      showIsochroneLoadingScreen: function () { waitingForIsochrones = true; calls.push("showIso"); },
      hideIsochroneLoadingScreen: function () { waitingForIsochrones = false; calls.push("hideIso"); },
      getWaitingForIsochroneLoad: function () { return waitingForIsochrones; },
      markIsochronesDeferred: function () { calls.push("markIso"); },
    },
    amenityMode: {
      apply: function () { calls.push("amenityApply"); return Promise.resolve(); },
    },
    renderers: {
      updateAmenitiesSource: function () { calls.push("amenities"); },
      updateTreesSource: function () { calls.push("trees"); },
      updateStreetLightsSource: function () { calls.push("lights"); },
      updateBuildingColors: function () { calls.push("buildings"); },
      updateNeighborhoodColors: function () { calls.push("neighborhoodColors"); },
      updateNeighborhoodSurfaceData: function () { calls.push("surface"); },
    },
    selection: {
      selectBuilding: function () { calls.push("selectBuilding"); },
      updateRadiusInfo: function () { calls.push("radiusInfo"); },
      loadIsochrones: function (opts) { calls.push(["loadIso", opts]); },
      clearRadiusSelection: function () { calls.push("clearRadiusSelection"); },
    },
    dashboards: {
      showNeighborhoodModal: function () { calls.push("showNeighborhood"); },
      hideNeighborhoodModal: function () { calls.push("hideNeighborhood"); },
      renderCitywideModal: function () { calls.push("renderCitywide"); },
      updateCitywideModalTitle: function () { calls.push("cityTitle"); },
      hideCitywideModal: function () { calls.push("hideCitywide"); },
    },
    scoreSidebar: {
      isOpen: function () { return false; },
      hide: function () { calls.push("hideSidebar"); },
    },
    controls: {
      clearDerivedCaches: function () { calls.push("clearDerived"); },
    },
    ui: {
      getNeighborhoodModal: function () { return modals.neighborhood; },
      getCitywideModal: function () { return modals.citywide; },
    },
    map: {
      getLayer: function () { return true; },
      setLayoutProperty: function (_layer, _prop, value) { calls.push(["heatmap", value]); },
    },
    switchMode: function (nextMode) { calls.push("switch:" + nextMode); mode = nextMode; },
    pointDataLoader: {
      canRefreshPointAnalysisAfterPointDataLoad: function () { return true; },
    },
  });

  actions.onFilterSelectionChanged();
  await actions.onScoreModeChanged("expanded");
  actions.onWalkMinutesChanged();
  actions.onModeToggleRequested("citywide");
  actions.onHeatmapVisibilityChanged(false);
  actions.onEscape({ stopPropagation: function () { calls.push("stop"); } });

  assert.ok(calls.includes("amenities"));
  assert.ok(calls.includes("showIso"));
  assert.ok(calls.includes("amenityApply"));
  assert.ok(calls.includes("radiusInfo"));
  assert.ok(calls.includes("switch:citywide"));
  assert.ok(calls.some(function (call) { return Array.isArray(call) && call[0] === "heatmap" && call[1] === "none"; }));
});
```

- [ ] **Step 2: Create `docs/js/ui/controlActions.js`**

Create `Urban95ControlActions.create(deps)` and move the bodies of these functions from `docs/app.js`:

```javascript
clearControlDerivedCaches
handleControlsFilterSelectionChanged
handleControlsScoreModeChanged
handleControlsWalkMinutesChanged
handleControlsModeToggleRequested
handleControlsEscape
handleControlsHeatmapVisibilityChange
```

The returned API must be:

```javascript
return {
  clearDerivedCaches: clearDerivedCaches,
  onFilterSelectionChanged: onFilterSelectionChanged,
  onScoreModeChanged: onScoreModeChanged,
  onWalkMinutesChanged: onWalkMinutesChanged,
  onModeToggleRequested: onModeToggleRequested,
  onPointVisibilityChanged: renderers.applyShowPointsToggle,
  onHeatmapVisibilityChanged: onHeatmapVisibilityChanged,
  onEscape: onEscape,
};
```

Preserve these behavior details:

```javascript
// Filter changes refresh all point/building sources, then selected building radius, then open modal surfaces.
// Score-mode changes start a perf session, load isochrones when leaving weighted mode, mark isochrones deferred when returning weighted, apply amenity mode, refresh selected radius and open modal contents.
// Walk-minute changes refresh house/neighborhood/citywide surfaces according to current mode.
// Escape hides score sidebar first, then house radius, then neighborhood modal, then citywide modal and switches back to house.
// Heatmap visibility only mutates neighborhoods-surface when current mode is house and the layer exists.
```

- [ ] **Step 3: Load control actions**

In `docs/index.html`, add after `amenityMode.js` and before `controls.js`:

```html
    <script src="./js/ui/controlActions.js"></script>
```

- [ ] **Step 4: Wire control actions in `docs/app.js`**

Add namespace validation:

```javascript
const Urban95ControlActions = requireNamespace(window, "Urban95ControlActions");
requireNamespaceMember(Urban95ControlActions, "Urban95ControlActions", "create", "function");
```

Create:

```javascript
const controlActions = Urban95ControlActions.create({
  perf: urban95Perf,
  state: {
    getCurrentMode: function () { return currentMode; },
    getSelectedBuilding: function () { return selectedBuildingCentroid; },
    getSelectedNeighborhood: function () { return selectedNeighborhood; },
    getIsochronesLoaded: function () { return isochronesLoaded; },
    setIsochronesDeferred: function () {
      loadingUi.state.isochrones = true;
      loadingUi.updateProgress();
    },
  },
  loading: loadingUi,
  amenityMode: amenityMode,
  renderers: Urban95MapRenderers,
  selection: Urban95Selection,
  dashboards: Urban95Dashboards,
  scoreSidebar: Urban95ScoreSidebar,
  controls: {
    clearDerivedCaches: clearDerivedCachesState,
  },
  ui: {
    getNeighborhoodModal: function () { return document.getElementById("neighborhood-modal"); },
    getCitywideModal: function () { return document.getElementById("citywide-modal"); },
  },
  map: map,
  switchMode: switchMode,
  pointDataLoader: pointDataLoader,
});
```

Then update `Urban95Controls.bind` callbacks:

```javascript
  callbacks: {
    applyScoreModeAmenities: amenityMode.apply,
    updateBuildingColors: Urban95MapRenderers.updateBuildingColors,
    updateAccessibilityLegendLabels: Urban95MapRenderers.updateAccessibilityLegendLabels,
    updateRadiusInfo: Urban95Selection.updateRadiusInfo,
    switchMode: switchMode,
    onFilterSelectionChanged: controlActions.onFilterSelectionChanged,
    onScoreModeChanged: controlActions.onScoreModeChanged,
    onWalkMinutesChanged: controlActions.onWalkMinutesChanged,
    onModeToggleRequested: controlActions.onModeToggleRequested,
    onPointVisibilityChanged: controlActions.onPointVisibilityChanged,
    onHeatmapVisibilityChanged: controlActions.onHeatmapVisibilityChanged,
    onEscape: controlActions.onEscape,
    clearDerivedCaches: controlActions.clearDerivedCaches,
  },
```

Delete the moved control handler functions from `docs/app.js`.

- [ ] **Step 5: Run tests and review gates**

Run:

```bash
npm run test:frontend
git diff --check
```

Expected: all frontend tests pass unless later final-audit tests have not yet been added or updated.

Spec-compliance review subagent prompt:

```text
Review Task 6 of docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md for spec compliance only.
Check that control reaction bodies moved to Urban95ControlActions, behavior order is preserved for filter/score-mode/walk-minute/Escape/heatmap actions, and app.js now only wires callbacks into Urban95Controls.bind.
Report findings first with file/line references.
```

Code-quality review subagent prompt, only after spec review is clean:

```text
Review Task 6 of docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md for code quality.
Focus on whether controlActions has cohesive verbs, explicit dependencies, readable mode branching, and no accidental renderer/dashboard internal refactor.
Report findings first with file/line references.
```

---

## Task 7: Final Coordinator Audit, Browser Proof, And Results

**Files:**
- Modify: `docs/app.js`
- Modify: `tests/frontend/module_contracts.test.js`
- Modify: `docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md`

- [ ] **Step 1: Add final no-app-feature-logic source audit**

Update the Task 1 final coordinator test if implementation names differ only by module instance names. It must still assert:

```javascript
assert.ok(appLines <= 1200);
assert.doesNotMatch(appSource, /function\s+buildExplainScoreBreakdown\b/);
assert.doesNotMatch(appSource, /function\s+updateLoadingProgress\b/);
assert.doesNotMatch(appSource, /function\s+applyScoreModeAmenities\b/);
assert.doesNotMatch(appSource, /function\s+handleControlsScoreModeChanged\b/);
assert.match(appSource, /Urban95LoadingUi\.create\s*\(/);
assert.match(appSource, /Urban95ScoreExplain\.create\s*\(/);
assert.match(appSource, /Urban95ScoreSidebarChrome\.create\s*\(/);
assert.match(appSource, /Urban95IconLoader\.create\s*\(/);
assert.match(appSource, /Urban95AmenityMode\.create\s*\(/);
assert.match(appSource, /Urban95ControlActions\.create\s*\(/);
```

- [ ] **Step 2: Run static verification**

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

- [ ] **Step 3: Run browser smoke/network proof**

Start the app:

```bash
npm run start
```

If port `8080` is busy or unresponsive, use:

```bash
npx http-server . -c-1 -p 8081
```

Run a browser probe using the available local Playwright/Chromium setup. Prefer this inline Node probe from the repository root after the server is running; set `URBAN95_SMOKE_URL` to the fallback URL if port 8080 was not used:

```powershell
$env:URBAN95_SMOKE_URL='http://localhost:8080/docs/index.html'
@'
const url = process.env.URBAN95_SMOKE_URL || "http://localhost:8080/docs/index.html";
async function main() {
  let chromium;
  try {
    chromium = require("playwright").chromium;
  } catch (err) {
    chromium = require("@playwright/test").chromium;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const pageErrors = [];
  const requests = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  async function isVisible(selector) {
    return await page.locator(selector).evaluate((node) => {
      const style = window.getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden" && !node.hidden;
    }).catch(() => false);
  }
  async function clickMapCenter() {
    const box = await page.locator("#map canvas").boundingBox();
    if (!box) throw new Error("Map canvas bounding box unavailable");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector("#map canvas", { timeout: 60000 });
  const forbidden = [
    "buildings_accessibility.geojson",
    "isochrones.geojson",
    "amenities_new.geojson",
    "amenities_all.geojson",
  ].filter((name) => requests.some((requestUrl) => requestUrl.includes(name)));
  const generated = requests.filter((requestUrl) =>
    /buildings_accessibility\.pmtiles|buildings_lookup\.json|points_lookup\.json/.test(requestUrl)
  );
  await clickMapCenter();
  await page.waitForTimeout(800);
  const houseSidebarVisible = await isVisible("#score-explain-sidebar");

  await page.locator('input[name="score-model"][value="expanded"]').check({ force: true });
  await page.waitForTimeout(1200);
  const amenitiesSelected = await page.locator('input[name="score-model"][value="expanded"]').isChecked();
  const isochroneLookupRequested = requests.some((requestUrl) => requestUrl.includes("isochrones_lookup.json"));

  await page.locator('#radius-toggle [data-minutes="15"]').click({ force: true });
  await page.waitForTimeout(800);
  const minutes15Active = await page.locator('#radius-toggle [data-minutes="15"]').evaluate((node) =>
    node.classList.contains("active")
  );

  await page.locator('input[name="score-model"][value="weighted"]').check({ force: true });
  await page.waitForTimeout(800);
  await page.locator('#mode-toggle [data-mode="neighborhood"]').click({ force: true });
  await page.waitForTimeout(1000);
  await clickMapCenter();
  await page.waitForTimeout(1000);
  const neighborhoodModalVisible = await isVisible("#neighborhood-modal");
  await page.locator("#filter-btn").click({ force: true });
  await page.waitForTimeout(300);
  const filterPopupVisible = await isVisible("#filter-popup");
  const firstSpecificFilter = page.locator('#filter-items input[name="amenity-filter-only"]:not([value="all"])').first();
  const filterOptionCount = await firstSpecificFilter.count();
  if (filterOptionCount > 0) {
    await firstSpecificFilter.check({ force: true });
    await page.waitForTimeout(800);
  }
  const neighborhoodModalAfterFilterVisible = await isVisible("#neighborhood-modal");

  await page.locator('#mode-toggle [data-mode="citywide"]').click({ force: true });
  await page.waitForTimeout(1000);
  const citywideModalVisible = await isVisible("#citywide-modal");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const citywideAfterEscapeVisible = await isVisible("#citywide-modal");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  console.log(JSON.stringify({
    url,
    pageErrors,
    generatedRequests: generated,
    forbiddenEagerGeojsonRequests: forbidden,
    houseSidebarVisible,
    amenitiesSelected,
    isochroneLookupRequested,
    minutes15Active,
    neighborhoodModalVisible,
    filterPopupVisible,
    filterOptionCount,
    neighborhoodModalAfterFilterVisible,
    citywideModalVisible,
    citywideAfterEscapeVisible,
    mobileOverflow,
  }, null, 2));
  if (pageErrors.length > 0) throw new Error("Page errors: " + pageErrors.join("; "));
  if (generated.length === 0) throw new Error("No generated PMTiles/lookup startup requests observed");
  if (forbidden.length > 0) throw new Error("Forbidden eager GeoJSON requests: " + forbidden.join(", "));
  if (!houseSidebarVisible) throw new Error("House/building click did not open score sidebar");
  if (!amenitiesSelected) throw new Error("Amenities Focus radio was not selected");
  if (!isochroneLookupRequested) throw new Error("Amenities Focus did not request isochrones_lookup.json");
  if (!minutes15Active) throw new Error("15-minute walk control did not become active");
  if (!neighborhoodModalVisible) throw new Error("Neighborhood click did not open neighborhood modal");
  if (!filterPopupVisible) throw new Error("Filter popup did not open while neighborhood modal was visible");
  if (filterOptionCount > 0 && !neighborhoodModalAfterFilterVisible) throw new Error("Neighborhood modal disappeared after filter selection");
  if (!citywideModalVisible) throw new Error("Citywide mode did not open citywide modal");
  if (citywideAfterEscapeVisible) throw new Error("Escape did not hide citywide modal");
  if (mobileOverflow) throw new Error("Mobile 390px smoke found horizontal overflow");
  await browser.close();
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
'@ | node
```

If local Playwright is not installed, use the same temporary-cache pattern from the prior coordinator pass without modifying project dependencies:

```powershell
$pwRoot = npm exec --yes --package playwright -- node -e "console.log(require.resolve('playwright'))"
$env:NODE_PATH = Split-Path (Split-Path $pwRoot)
$env:URBAN95_SMOKE_URL='http://localhost:8081/docs/index.html'
@'
const { chromium } = require("playwright");
console.log("playwright available:", !!chromium);
'@ | node
```

Then rerun the full probe above in the same PowerShell session. The proof must verify:

- `http://localhost:8080/docs/index.html` or `http://localhost:8081/docs/index.html` loads with no page errors.
- Startup requests generated PMTiles/lookup paths when artifacts exist.
- Startup does not eagerly request full `buildings_accessibility.geojson`, `isochrones.geojson`, `amenities_new.geojson`, or `amenities_all.geojson` when generated lookup artifacts exist.
- Clicking a building in house mode opens the score sidebar.
- Switching to Amenities Focus still loads/defer-loads isochrones as before and refreshes sidebar/radius state for the selected building.
- Switching walk minutes in Amenities Focus updates the selected building sidebar/radius state.
- Switching to neighborhood mode shows neighborhood layers and clicking a neighborhood opens the modal.
- Switching filters while a neighborhood modal is open refreshes modal content without page errors.
- Switching to citywide mode opens the citywide modal.
- Pressing Escape from citywide mode hides the citywide modal and returns to house mode.
- Mobile width smoke at `390px` has no obvious fatal layout overlap caused by this pass.

- [ ] **Step 4: Final review gates**

Spec-compliance review subagent prompt:

```text
Review the completed implementation of docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md for spec compliance only.
Check all hard constraints: no commits, no git worktrees, no bundler/tooling migration, Python out of scope, PMTiles render-only, lookup-first analysis, app.js final coordinator-only boundary, startup/mode/event/control/sidebar behavior preserved, and required verification evidence present.
Report findings first with file/line references. Do not do code-quality review.
```

Code-quality review subagent prompt, only after spec review is clean:

```text
Review the completed implementation of docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md for code quality.
Focus on whether app.js is now a clear bootstrap coordinator, whether new modules have coherent responsibilities, whether dependency injection is readable, whether tests protect meaningful contracts, and whether future app.js work should be unnecessary.
Report findings first with file/line references.
```

- [ ] **Step 5: Append implementation results**

Append this section with real values from the implementation run:

```markdown
## Implementation Results

- Implemented by: record the agent/model/session that executed the plan.
- Finished at: record the local timestamp with timezone.
- Files changed:
  - record each changed path.
- Static verification:
  - `npm run test:frontend`: record pass/fail and test count.
  - `git diff --check`: record pass/fail and any warnings.
  - `git status --short`: record the exact intended changed files.
- Browser proof:
  - URL: record the local URL used.
  - Startup page errors: record the observed result.
  - Startup generated-artifact network proof: record the observed PMTiles/lookup requests.
  - Full GeoJSON eager-load guard: record whether forbidden eager requests occurred.
  - House/building click: record the observed result.
  - Amenities Focus switch: record the observed result.
  - Walk-minute switch with selected building: record the observed result.
  - Neighborhood mode/modal/filter refresh: record the observed result.
  - Citywide mode/Escape: record the observed result.
  - Mobile 390px smoke: record the observed result.
- Final app.js audit:
  - Line count: record the final `docs/app.js` line count.
  - Remaining responsibilities: list the remaining coordinator responsibilities.
  - Removed responsibilities: list the ownerships moved out of `docs/app.js`.
- Review gates:
  - Spec-compliance review: record clean or findings fixed.
  - Code-quality review: record clean or findings fixed.
- Residual risks:
  - record any residual risk, or state that none were identified beyond existing module size in `mapRenderers.js`, `dashboards.js`, and `scoreSidebar.js`.
```

## Plan Self-Review

- **Spec coverage:** The plan covers the user's requested final `docs/app.js` ownership pass and explicitly preserves no commits, no worktrees, subagent verification, and perspective-ensemble review. The planned modules cover the remaining app-owned feature logic: loading UI, score/sidebar explanation, icon loading, amenity-mode selection, and control actions.
- **Placeholder scan:** The plan contains no `TBD`, `TODO`, bracket placeholders, or unspecified "handle edge cases" implementation steps. The future `Implementation Results` section uses explicit instructions to record real execution evidence.
- **Type consistency:** New namespaces are `Urban95LoadingUi`, `Urban95ScoreExplain`, `Urban95ScoreSidebarChrome`, `Urban95IconLoader`, `Urban95AmenityMode`, and `Urban95ControlActions`. Public methods used in tests match the planned module exports.
- **Execution style:** The writing-plans skill recommends frequent commits, but the user's explicit hard constraints are no commits and no git worktrees. This plan replaces commit steps with tests, `git diff --check`, `git status --short`, subagent review gates, and browser proof.

## Implementation Results

- Implemented by: Codex parent orchestrator with GPT-5.4 implementation/review subagents; GPT-5.5 low was used once for the Task 7 architecture-heavy line-count unblock.
- Finished at: 2026-05-21 01:50:24 +03:00.
- Files changed:
  - `docs/app.js`
  - `docs/index.html`
  - `docs/js/core/appDependencies.js`
  - `docs/js/core/appStartupBridge.js`
  - `docs/js/core/loadingUi.js`
  - `docs/js/core/pointDataSources.js`
  - `docs/js/map/iconLoader.js`
  - `docs/js/map/mapShell.js`
  - `docs/js/map/neighborhoodScores.js`
  - `docs/js/map/selection.js`
  - `docs/js/scoring/scoreContext.js`
  - `docs/js/scoring/scoreExplain.js`
  - `docs/js/ui/amenityMode.js`
  - `docs/js/ui/controlActions.js`
  - `docs/js/ui/scoreSidebarChrome.js`
  - `tests/frontend/module_contracts.test.js`
  - `docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md`
- Static verification:
  - `npm run test:frontend`: pass, 116/116 tests.
  - `git diff --check`: pass; Git reported only CRLF working-copy warnings for existing text files.
  - `git status --short`: intended changed files only:
    - `M docs/app.js`
    - `M docs/index.html`
    - `M docs/js/map/selection.js`
    - `M tests/frontend/module_contracts.test.js`
    - `?? docs/js/core/appDependencies.js`
    - `?? docs/js/core/appStartupBridge.js`
    - `?? docs/js/core/loadingUi.js`
    - `?? docs/js/core/pointDataSources.js`
    - `?? docs/js/map/iconLoader.js`
    - `?? docs/js/map/mapShell.js`
    - `?? docs/js/map/neighborhoodScores.js`
    - `?? docs/js/scoring/scoreContext.js`
    - `?? docs/js/scoring/scoreExplain.js`
    - `?? docs/js/ui/amenityMode.js`
    - `?? docs/js/ui/controlActions.js`
    - `?? docs/js/ui/scoreSidebarChrome.js`
    - `?? docs/superpowers/plans/2026-05-20-final-app-coordinator-extraction.md`
- Browser proof:
  - URL: `http://localhost:8080/docs/index.html`.
  - Startup page errors: `[]`.
  - Startup generated-artifact network proof: observed `buildings_accessibility.pmtiles`, `buildings_lookup.json.gz`, and `points_lookup.json.gz`.
  - Full GeoJSON eager-load guard: no eager requests for `buildings_accessibility.geojson`, `isochrones.geojson`, `amenities_new.geojson`, or `amenities_all.geojson`.
  - House/building click: score sidebar opened.
  - Amenities Focus switch: radio selected and `isochrones_lookup.json` requested.
  - Walk-minute switch with selected building: 15-minute control became active.
  - Neighborhood mode/modal/filter refresh: neighborhood modal opened; filter popup opened from controls; changing a filter while the neighborhood modal was open kept the modal visible with no page errors.
  - Citywide mode/Escape: citywide modal opened after closing the neighborhood modal; Escape hid citywide modal.
  - Mobile 390px smoke: no horizontal overflow detected.
- Final app.js audit:
  - Line count: 1157.
  - Remaining responsibilities: consume `Urban95AppDependencies`, create shared app state, initialize map/source contracts, gather DOM handles, configure modules with explicit getters/setters, bind controls/startup/events/modals.
  - Removed responsibilities: loading/progress UI, score explanation builders, score context helpers, sidebar chrome, icon loading, point-data fallback/filtering, map shell creation, neighborhood score/surface helpers, amenity-mode application, and control reaction bodies.
- Review gates:
  - Spec-compliance review: clean after fixing the remaining app-owned helper extraction; final note was pending only this results append.
  - Code-quality review: clean after fixing the accidental global dependency surface and strengthening order-sensitive `controlActions` tests.
- Residual risks:
  - Some source-level frontend contract tests remain regex/string driven and may need maintenance during harmless future refactors.
  - Large existing modules (`mapRenderers.js`, `dashboards.js`, and `scoreSidebar.js`) remain intentionally unsplit by this plan, so feature work inside those domains may still require coordinator wiring changes even though another broad `app.js` ownership pass should not be needed.
