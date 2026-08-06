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

function readAppCoordinatorSource() {
  return [
    fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "js", "core", "appDependencies.js"), "utf8"),
    fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8"),
  ].join("\n");
}

function requireScriptIndex(scripts, expectedPath) {
  const normalizedExpectedPath = normalizeLocalScriptPath(expectedPath);
  const scriptIndex = scripts.findIndex((scriptPath) => normalizeLocalScriptPath(scriptPath) === normalizedExpectedPath);
  assert.notEqual(scriptIndex, -1, "docs/index.html must load " + expectedPath);
  return scriptIndex;
}

function runQueuedTimer(timers, timerOrder, predicate) {
  for (let index = 0; index < timerOrder.length; index += 1) {
    const timerId = timerOrder[index];
    const timer = timers.get(timerId);
    if (!timer) continue;
    if (predicate && !predicate(timer, timerId)) continue;
    timerOrder.splice(index, 1);
    timers.delete(timerId);
    timer.callback();
    return { id: timerId, delay: timer.delay };
  }
  return null;
}

function findQueuedTimer(timers, timerOrder, predicate) {
  for (let index = 0; index < timerOrder.length; index += 1) {
    const timerId = timerOrder[index];
    const timer = timers.get(timerId);
    if (!timer) continue;
    if (predicate && !predicate(timer, timerId)) continue;
    return { id: timerId, delay: timer.delay };
  }
  return null;
}

function runCoreLogger(browserOverrides) {
  const browser = createBrowserContext(browserOverrides || {});
  runBrowserScript("docs/js/core/logger.js", browser);
  return browser.window.Urban95Logger;
}

function runCoreStartup(browserOverrides) {
  const browser = createBrowserContext(browserOverrides || {});
  runBrowserScript("docs/js/core/startup.js", browser);
  return browser.window.Urban95Startup;
}

function runAmenityModeModule() {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/amenityMode.js", browser);
  return browser.window.Urban95AmenityMode;
}

function runControlActionsModule() {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/controlActions.js", browser);
  return browser.window.Urban95ControlActions;
}

function loadNeighborhoodSidebarModules(browser) {
  runBrowserScript("docs/js/ui/sidebarChromeBindings.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodSelection.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodPanelRender.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodCompareRender.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodSidebar.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodCompareApply.js", browser);
}

function loadCitySidebarModules(browser) {
  if (
    browser.window.Urban95CityGapModes &&
    browser.window.Urban95CityPanelRender &&
    browser.window.Urban95CitySidebar
  ) {
    return;
  }
  runBrowserScript("docs/js/ui/cityGapThresholds.js", browser);
  runBrowserScript("docs/js/ui/cityPanelRender.js", browser);
  runBrowserScript("docs/js/ui/citySidebar.js", browser);
}

function createCitySidebarControlStub(calls) {
  return {
    isOpen: function () {
      if (calls) calls.push("citySidebar:isOpen");
      return false;
    },
    sync: function () {
      if (calls) calls.push("citySidebar:sync");
    },
    hide: function () {
      if (calls) calls.push("citySidebar:hide");
    },
    dismiss: function () {
      if (calls) calls.push("citySidebar:dismiss");
    },
    setSelection: function (value) {
      if (calls) calls.push("citySidebar:setSelection:" + (value == null ? "null" : "feature"));
    },
  };
}

function loadRenderState(browser) {
  if (!browser.window.Urban95RenderState) {
    runBrowserScript("docs/js/map/renderState.js", browser);
  }
  return browser.window.Urban95RenderState;
}

function loadShowRegistry(browser) {
  if (!browser.window.Urban95WeightedMetricShowRegistry) {
    runBrowserScript("docs/js/ui/weightedMetricShowRegistry.js", browser);
  }
  return browser.window.Urban95WeightedMetricShowRegistry;
}

function runPerfPanel(browserOverrides) {
  const browser = createBrowserContext(browserOverrides || {});
  runBrowserScript("docs/js/core/perfPanel.js", browser);
  return browser.window.urban95Perf;
}

function loadAppCoordinatorNamespaces(browser) {
  runBrowserScript("docs/js/core/logger.js", browser);
  runBrowserScript("docs/js/core/startup.js", browser);
  runBrowserScript("docs/js/core/loadingUi.js", browser);
  runBrowserScript("docs/js/core/pointDataSources.js", browser);
  runBrowserScript("docs/js/core/appStartupBridge.js", browser);
}

function runAppScript(browser) {
  loadAppCoordinatorNamespaces(browser);
  runBrowserScript("docs/js/scoring/scoreContext.js", browser);
  runBrowserScript("docs/js/scoring/weightedIndicatorIcons.js", browser);
  runBrowserScript("docs/js/scoring/scoreExplain.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);
  loadNeighborhoodSidebarModules(browser);
  loadCitySidebarModules(browser);
  runBrowserScript("docs/js/ui/amenityMode.js", browser);
  runBrowserScript("docs/js/ui/controlActions.js", browser);
  runBrowserScript("docs/js/map/staticPolygonCompanions.js", browser);
  runBrowserScript("docs/js/map/mapShell.js", browser);
  runBrowserScript("docs/js/map/neighborhoodScores.js", browser);
  runBrowserScript("docs/js/map/renderState.js", browser);
  runBrowserScript("docs/js/map/iconLoader.js", browser);
  runBrowserScript("docs/js/map/neighborhoodSelectionHighlight.js", browser);
  runBrowserScript("docs/js/map/modeController.js", browser);
  runBrowserScript("docs/js/map/mapEvents.js", browser);
  runBrowserScript("docs/js/map/surveyOverlay.js", browser);
  runBrowserScript("docs/js/map/auxiliaryOverlays.js", browser);
  runBrowserScript("docs/js/ui/overlayVisibility.js", browser);
  runBrowserScript("docs/js/ui/weightedMetricShowRegistry.js", browser);
  runBrowserScript("docs/js/core/appDependencies.js", browser);
  return runBrowserScript("docs/app.js", browser);
}

const buildingRenderedFeaturesLayerPattern =
  /(?:\bmap\s*\.\s*)?queryRenderedFeatures\s*\([^)]*\{[^}]*\blayers\s*:\s*\[[^\]]*(?:"[^"]*buildings[^"]*"|'[^']*buildings[^']*'|BUILDINGS_VECTOR_LAYER_ID)[^\]]*\][^}]*\}[^)]*\)/;

test("index loads core frontend modules before app.js", () => {
  const scripts = scriptSourcesFromIndex();
  const appIndex = requireScriptIndex(scripts, "./app.js");

  assert.ok(requireScriptIndex(scripts, "./data/pmtiles_manifest.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/core/config.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/core/dataArtifacts.js") < appIndex);
  const loadersIndex = requireScriptIndex(scripts, "./js/core/loaders.js");
  const loggerIndex = requireScriptIndex(scripts, "./js/core/logger.js");
  assert.ok(loadersIndex < loggerIndex);
  const runtimeIndex = requireScriptIndex(scripts, "./js/core/runtimeData.js");
  assert.ok(loggerIndex < runtimeIndex);
  const pointDataSourcesIndex = requireScriptIndex(scripts, "./js/core/pointDataSources.js");
  assert.ok(runtimeIndex < pointDataSourcesIndex);
  const startupIndex = requireScriptIndex(scripts, "./js/core/startup.js");
  assert.ok(pointDataSourcesIndex < startupIndex);
  const loadingUiIndex = requireScriptIndex(scripts, "./js/core/loadingUi.js");
  assert.ok(startupIndex < loadingUiIndex);
  assert.ok(loadingUiIndex < appIndex);
  const appStartupBridgeIndex = requireScriptIndex(scripts, "./js/core/appStartupBridge.js");
  assert.ok(loadingUiIndex < appStartupBridgeIndex);
  assert.ok(appStartupBridgeIndex < appIndex);
  const appStateIndex = requireScriptIndex(scripts, "./js/core/appState.js");
  assert.ok(startupIndex < appStateIndex);
  assert.ok(appStateIndex < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/core/perfPanel.js") < appIndex);
  const desktopOnlyGateIndex = requireScriptIndex(scripts, "./js/core/desktopOnlyGate.js");
  assert.ok(desktopOnlyGateIndex < appIndex);
  const mapLibreIndex = scripts.findIndex((scriptPath) => scriptPath.includes("maplibre-gl"));
  assert.notEqual(mapLibreIndex, -1);
  assert.ok(desktopOnlyGateIndex < mapLibreIndex);
  const scoreContextIndex = requireScriptIndex(scripts, "./js/scoring/scoreContext.js");
  const weightedIndicatorIconsIndex = requireScriptIndex(
    scripts,
    "./js/scoring/weightedIndicatorIcons.js"
  );
  const scoreExplainIndex = requireScriptIndex(scripts, "./js/scoring/scoreExplain.js");
  const scoreSidebarChromeIndex = requireScriptIndex(scripts, "./js/ui/scoreSidebarChrome.js");
  const scoreSidebarIndex = requireScriptIndex(scripts, "./js/ui/scoreSidebar.js");
  const mapLayersIndex = requireScriptIndex(scripts, "./js/map/mapLayers.js");
  const staticPolygonCompanionsIndex = requireScriptIndex(
    scripts,
    "./js/map/staticPolygonCompanions.js"
  );
  const mapShellIndex = requireScriptIndex(scripts, "./js/map/mapShell.js");
  assert.ok(requireScriptIndex(scripts, "./js/scoring/scoreModel.js") < scoreContextIndex);
  assert.ok(scoreContextIndex < weightedIndicatorIconsIndex);
  assert.ok(weightedIndicatorIconsIndex < scoreExplainIndex);
  assert.ok(scoreExplainIndex < scoreSidebarIndex);
  assert.ok(scoreSidebarChromeIndex < scoreSidebarIndex);
  assert.ok(scoreSidebarChromeIndex < mapLayersIndex);
  const neighborhoodScoresIndex = requireScriptIndex(scripts, "./js/map/neighborhoodScores.js");
  const iconLoaderIndex = requireScriptIndex(scripts, "./js/map/iconLoader.js");
  assert.ok(mapLayersIndex < iconLoaderIndex);
  assert.ok(mapLayersIndex < staticPolygonCompanionsIndex);
  assert.ok(staticPolygonCompanionsIndex < mapShellIndex);
  assert.ok(mapShellIndex < neighborhoodScoresIndex);
  assert.ok(neighborhoodScoresIndex < iconLoaderIndex);
  assert.ok(mapLayersIndex < appIndex);
  assert.ok(iconLoaderIndex < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/map/mapRenderers.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/map/selection.js") < appIndex);
  const amenityModeIndex = requireScriptIndex(scripts, "./js/ui/amenityMode.js");
  const controlActionsIndex = requireScriptIndex(scripts, "./js/ui/controlActions.js");
  const weightedMetricShowRegistryIndex = requireScriptIndex(
    scripts,
    "./js/ui/weightedMetricShowRegistry.js"
  );
  const controlSidebarShowIndex = requireScriptIndex(scripts, "./js/ui/controlSidebarShow.js");
  const controlsIndex = requireScriptIndex(scripts, "./js/ui/controls.js");
  assert.ok(scoreSidebarChromeIndex < amenityModeIndex);
  assert.ok(amenityModeIndex < mapLayersIndex);
  assert.ok(mapLayersIndex < mapShellIndex);
  assert.ok(mapShellIndex < appIndex);
  assert.ok(amenityModeIndex < controlsIndex);
  assert.ok(controlActionsIndex < controlsIndex);
  assert.ok(weightedMetricShowRegistryIndex < controlSidebarShowIndex);
  assert.ok(controlActionsIndex < appIndex);
  assert.ok(controlsIndex < appIndex);
  assert.ok(scoreSidebarIndex < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/ui/infoModal.js") < appIndex);
  const sidebarChromeBindingsIndex = requireScriptIndex(scripts, "./js/ui/sidebarChromeBindings.js");
  assert.ok(scoreSidebarChromeIndex < sidebarChromeBindingsIndex);
  assert.ok(sidebarChromeBindingsIndex < amenityModeIndex);
  const neighborhoodSelectionIndex = requireScriptIndex(scripts, "./js/ui/neighborhoodSelection.js");
  const neighborhoodPanelRenderIndex = requireScriptIndex(scripts, "./js/ui/neighborhoodPanelRender.js");
  const neighborhoodCompareRenderIndex = requireScriptIndex(
    scripts,
    "./js/ui/neighborhoodCompareRender.js"
  );
  const neighborhoodSidebarIndex = requireScriptIndex(scripts, "./js/ui/neighborhoodSidebar.js");
  const neighborhoodCompareApplyIndex = requireScriptIndex(
    scripts,
    "./js/ui/neighborhoodCompareApply.js"
  );
  const neighborhoodSelectionHighlightIndex = requireScriptIndex(
    scripts,
    "./js/map/neighborhoodSelectionHighlight.js"
  );
  const cityGapThresholdsIndex = requireScriptIndex(scripts, "./js/ui/cityGapThresholds.js");
  const cityPanelRenderIndex = requireScriptIndex(scripts, "./js/ui/cityPanelRender.js");
  const citySidebarIndex = requireScriptIndex(scripts, "./js/ui/citySidebar.js");
  const dashboardsIndex = requireScriptIndex(scripts, "./js/ui/dashboards.js");
  assert.ok(requireScriptIndex(scripts, "./js/ui/infoModal.js") < neighborhoodPanelRenderIndex);
  assert.ok(neighborhoodSelectionIndex < neighborhoodSidebarIndex);
  assert.ok(neighborhoodPanelRenderIndex < neighborhoodCompareRenderIndex);
  assert.ok(neighborhoodCompareRenderIndex < neighborhoodSidebarIndex);
  assert.ok(neighborhoodSidebarIndex < neighborhoodCompareApplyIndex);
  assert.ok(neighborhoodCompareApplyIndex < cityGapThresholdsIndex);
  assert.ok(neighborhoodSelectionHighlightIndex < requireScriptIndex(scripts, "./js/map/mapRenderers.js"));
  assert.ok(neighborhoodSidebarIndex < cityGapThresholdsIndex);
  assert.ok(cityGapThresholdsIndex < cityPanelRenderIndex);
  assert.ok(cityPanelRenderIndex < citySidebarIndex);
  assert.ok(citySidebarIndex < dashboardsIndex);
  assert.ok(dashboardsIndex < appIndex);
  const modeControllerIndex = requireScriptIndex(scripts, "./js/map/modeController.js");
  assert.ok(modeControllerIndex < appIndex);
  assert.ok(dashboardsIndex < modeControllerIndex);
  const mapEventsIndex = requireScriptIndex(scripts, "./js/map/mapEvents.js");
  const auxiliaryOverlaysIndex = requireScriptIndex(scripts, "./js/map/auxiliaryOverlays.js");
  assert.ok(modeControllerIndex < mapEventsIndex);
  assert.ok(mapEventsIndex < auxiliaryOverlaysIndex);
  assert.ok(auxiliaryOverlaysIndex < appIndex);
  const appDependenciesIndex = requireScriptIndex(scripts, "./js/core/appDependencies.js");
  assert.ok(auxiliaryOverlaysIndex < appDependenciesIndex);
  assert.ok(appDependenciesIndex < appIndex);
});

test("logger keeps debug and perf quiet by default without materializing lazy payloads", () => {
  const calls = [];
  let payloadEvaluations = 0;
  const logger = runCoreLogger({
    console: {
      log() {
        calls.push({ level: "log", args: Array.from(arguments) });
      },
      warn() {
        calls.push({ level: "warn", args: Array.from(arguments) });
      },
      error() {
        calls.push({ level: "error", args: Array.from(arguments) });
      },
    },
  });

  logger.debug(function () {
    payloadEvaluations++;
    return "debug payload";
  });
  logger.perf(function () {
    payloadEvaluations++;
    return "perf payload";
  });

  assert.equal(payloadEvaluations, 0);
  assert.deepEqual(calls, []);
  assert.equal(typeof logger.isDebugEnabled, "function");
  assert.equal(typeof logger.isPerfEnabled, "function");
  assert.equal(logger.isDebugEnabled(), false);
  assert.equal(logger.isPerfEnabled(), false);
});

test("logger enables debug and perf with URL flags", () => {
  const calls = [];
  const logger = runCoreLogger({
    location: {
      href: "http://localhost:8080/docs/index.html?debug=1&perf=1",
      search: "?debug=1&perf=1",
    },
    console: {
      log() {
        calls.push({ level: "log", args: Array.from(arguments) });
      },
      warn() {
        calls.push({ level: "warn", args: Array.from(arguments) });
      },
      error() {
        calls.push({ level: "error", args: Array.from(arguments) });
      },
    },
  });

  logger.debug(function () {
    return ["debug payload", 1];
  });
  logger.perf(function () {
    return ["perf payload", 2];
  });

  assert.equal(logger.isDebugEnabled(), true);
  assert.equal(logger.isPerfEnabled(), true);
  assert.deepEqual(calls, [
    { level: "log", args: [["debug payload", 1]] },
    { level: "log", args: [["perf payload", 2]] },
  ]);
});

test("logger enables localStorage flags and keeps warn and error visible", () => {
  const calls = [];
  const logger = runCoreLogger({
    localStorage: {
      getItem(key) {
        if (key === "urban95_debug" || key === "urban95_perf") return "1";
        return null;
      },
    },
    console: {
      log() {
        calls.push({ level: "log", args: Array.from(arguments) });
      },
      warn() {
        calls.push({ level: "warn", args: Array.from(arguments) });
      },
      error() {
        calls.push({ level: "error", args: Array.from(arguments) });
      },
    },
  });

  logger.warn("warn payload", 1);
  logger.error("error payload", 2);
  logger.debug(function () {
    return "debug storage";
  });
  logger.perf(function () {
    return "perf storage";
  });

  assert.equal(logger.isDebugEnabled(), true);
  assert.equal(logger.isPerfEnabled(), true);
  assert.deepEqual(calls, [
    { level: "warn", args: ["warn payload", 1] },
    { level: "error", args: ["error payload", 2] },
    { level: "log", args: ["debug storage"] },
    { level: "log", args: ["perf storage"] },
  ]);
});

test("logger parses URL flags when URLSearchParams is unavailable", () => {
  const calls = [];
  const logger = runCoreLogger({
    URLSearchParams: undefined,
    location: {
      href: "http://localhost:8080/docs/index.html?debug=1&perf=1",
      search: "?debug=1&perf=1",
    },
    console: {
      log() {
        calls.push({ level: "log", args: Array.from(arguments) });
      },
      warn() {
        calls.push({ level: "warn", args: Array.from(arguments) });
      },
      error() {
        calls.push({ level: "error", args: Array.from(arguments) });
      },
    },
  });

  logger.debug("debug fallback");
  logger.perf("perf fallback");

  assert.equal(logger.isDebugEnabled(), true);
  assert.equal(logger.isPerfEnabled(), true);
  assert.deepEqual(calls, [
    { level: "log", args: ["debug fallback"] },
    { level: "log", args: ["perf fallback"] },
  ]);
});

test("logger stays disabled when localStorage access throws", () => {
  const calls = [];
  let payloadEvaluations = 0;
  const logger = runCoreLogger({
    localStorage: {
      getItem() {
        throw new Error("storage blocked");
      },
    },
    console: {
      log() {
        calls.push({ level: "log", args: Array.from(arguments) });
      },
      warn() {
        calls.push({ level: "warn", args: Array.from(arguments) });
      },
      error() {
        calls.push({ level: "error", args: Array.from(arguments) });
      },
    },
  });

  logger.debug(function () {
    payloadEvaluations++;
    return "debug blocked";
  });
  logger.perf(function () {
    payloadEvaluations++;
    return "perf blocked";
  });

  assert.equal(logger.isDebugEnabled(), false);
  assert.equal(logger.isPerfEnabled(), false);
  assert.equal(payloadEvaluations, 0);
  assert.deepEqual(calls, []);
});

test("perf panel exposes compact metadata helpers without eager disabled metadata", () => {
  let metaEvaluations = 0;
  const perf = runPerfPanel();

  assert.equal(perf.enabled, false);
  assert.equal(typeof perf.mark, "function");
  assert.equal(typeof perf.span, "function");
  assert.equal(typeof perf.spanAsync, "function");
  assert.equal(typeof perf.counter, "function");
  assert.equal(typeof perf.recordResourceSummary, "function");

  perf.mark("disabled-mark", function () {
    metaEvaluations += 1;
    return { expensive: true };
  });
  perf.counter("disabled-counter", function () {
    metaEvaluations += 1;
    return { expensive: true };
  });
  const spanResult = perf.span("disabled-span", function () {
    metaEvaluations += 1;
    return { expensive: true };
  }, function () {
    return 42;
  });

  assert.equal(spanResult, 42);
  assert.equal(metaEvaluations, 0);
  assert.equal(perf.records.length, 0);
});

test("perf panel records scalar-only metadata and preserves phase behavior", async () => {
  const perf = runPerfPanel({
    location: {
      href: "http://localhost:8080/docs/index.html?perf=1",
      search: "?perf=1",
    },
    document: {
      readyState: "loading",
      addEventListener() {},
      getElementById() {
        return null;
      },
    },
    performance: {
      now() {
        return 10;
      },
      getEntriesByType() {
        return [];
      },
    },
  });

  assert.equal(perf.enabled, true);
  assert.equal(perf.phase("legacy-phase", () => "ok"), "ok");
  assert.equal(perf.span("span-with-meta", {
    scalar: "value",
    count: 2,
    flag: true,
    objectValue: { too: "big" },
    long: "x".repeat(150),
  }, () => "span-ok"), "span-ok");
  assert.equal(await perf.phaseAsync("legacy-async", Promise.resolve("async-ok")), "async-ok");
  assert.equal(
    await perf.spanAsync("async-with-meta", () => ({ lazy: "yes" }), () => Promise.resolve("span-async-ok")),
    "span-async-ok"
  );

  const spanRecord = perf.records.find((record) => record.name === "span-with-meta");
  assert.equal(spanRecord.kind, "span");
  assert.deepEqual(
    {
      scalar: spanRecord.meta.scalar,
      count: spanRecord.meta.count,
      flag: spanRecord.meta.flag,
      objectValue: spanRecord.meta.objectValue,
    },
    {
      scalar: "value",
      count: 2,
      flag: true,
      objectValue: "[object Object]",
    }
  );
  assert.equal(spanRecord.meta.long.length, 120);
  assert.ok(perf.records.some((record) => record.kind === "phase" && record.name === "legacy-phase"));
  assert.ok(perf.records.some((record) => record.kind === "phaseAsync" && record.name === "legacy-async"));
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
  runBrowserScript("docs/js/core/pointDataSources.js", browser);
  runBrowserScript("docs/js/core/appStartupBridge.js", browser);
  runBrowserScript("docs/js/core/startup.js", browser);
  runBrowserScript("docs/js/core/perfPanel.js", browser);
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/scoring/scoreContext.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
  runBrowserScript("docs/js/map/mapShell.js", browser);
  runBrowserScript("docs/js/map/neighborhoodScores.js", browser);
  runBrowserScript("docs/js/map/mapShell.js", browser);
  runBrowserScript("docs/js/map/mapRenderers.js", browser);
  runBrowserScript("docs/js/map/selection.js", browser);
  runBrowserScript("docs/js/ui/controls.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebar.js", browser);
  runBrowserScript("docs/js/ui/infoModal.js", browser);
  runBrowserScript("docs/js/ui/dashboards.js", browser);
  runBrowserScript("docs/js/core/loadingUi.js", browser);
  runBrowserScript("docs/js/core/appStartupBridge.js", browser);
  runBrowserScript("docs/js/scoring/weightedIndicatorIcons.js", browser);
  runBrowserScript("docs/js/scoring/scoreExplain.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);
  loadNeighborhoodSidebarModules(browser);
  loadCitySidebarModules(browser);
  runBrowserScript("docs/js/map/iconLoader.js", browser);
  runBrowserScript("docs/js/ui/amenityMode.js", browser);
  runBrowserScript("docs/js/ui/controlActions.js", browser);

  assert.equal(browser.window.Urban95Config.urls.buildings, "./data/buildings_accessibility.geojson");
  assert.equal(typeof browser.window.Urban95DataArtifacts.hasGeneratedArtifact, "function");
  assert.equal(typeof browser.window.Urban95Loaders.fetchJsonWithGzipFallback, "function");
  assert.equal(typeof browser.window.Urban95RuntimeData.createLoaders, "function");
  assert.equal(typeof browser.window.Urban95Startup.run, "function");
  assert.equal(typeof browser.window.urban95Perf.phase, "function");
  assert.equal(typeof browser.window.urban95Perf.mark, "function");
  assert.equal(typeof browser.window.urban95Perf.span, "function");
  assert.equal(typeof browser.window.urban95Perf.spanAsync, "function");
  assert.equal(typeof browser.window.urban95Perf.counter, "function");
  assert.equal(typeof browser.window.urban95Perf.recordResourceSummary, "function");
  assert.equal(typeof browser.window.Urban95ScoreModel.getBuildingOverallScore, "function");
  assert.equal(typeof browser.window.Urban95MapLayers.resolveBuildingContracts, "function");
  assert.equal(typeof browser.window.Urban95MapLayers.createPmtilesProtocol, "function");
  assert.equal(typeof browser.window.Urban95MapLayers.createBuildingsSource, "function");
  assert.equal(typeof browser.window.Urban95MapLayers.createBuildingsFillLayer, "function");
  assert.equal(typeof browser.window.Urban95MapLayers.createBuildingsSelectedLayer, "function");
  assert.equal(typeof browser.window.Urban95MapLayers.applyParkDotPattern, "function");
  assert.equal(typeof browser.window.Urban95MapLayers.applyUrbanNatureDotPattern, "function");
  assert.equal(typeof browser.window.Urban95MapShell.createBaseMap, "function");
  [
    "configure",
    "setLayerVisibilityIfPresent",
    "setLayerVisibility",
    "resetPointHoverState",
    "getSpecialPointRenderPlan",
    "applySpecialPointRenderPlan",
    "setTreesVisibility",
    "setStreetLightsVisibility",
    "setTreesAndLightsVisibility",
    "bindPointHoverLayer",
    "applyShowPointsToggle",
    "updateAmenitiesSource",
    "updateTreesSource",
    "updateStreetLightsSource",
    "addAmenityLayers",
    "buildAmenityIconAtlas",
    "clusterVisibleAmenities",
    "updateDeckAmenityLayers",
    "scheduleDeckUpdate",
    "initDeckAmenityOverlay",
    "updateBuildingColors",
    "updateNeighborhoodSurfaceData",
    "updateNeighborhoodColors",
  ].forEach(function (memberName) {
    assert.equal(typeof browser.window.Urban95MapRenderers[memberName], "function");
  });
  [
    "configure",
    "setSelectedBuildingVectorState",
    "getBuildingCentroidGridKey",
    "buildBuildingCentroidGridIndex",
    "getClosestBuildingCandidates",
    "findClosestBuilding",
    "loadIsochrones",
    "getIsochrone",
    "isCoordinateInsidePolygon",
    "getItemsInPolygon",
    "easeInOutQuad",
    "selectBuilding",
    "updateRadiusInfo",
    "clearRadiusSelection",
    "buildUrban95ReferenceRadius",
  ].forEach(function (memberName) {
    assert.equal(typeof browser.window.Urban95Selection[memberName], "function");
  });
  assert.equal(typeof browser.window.Urban95Controls.bind, "function");
  assert.equal(typeof browser.window.Urban95ScoreSidebar.show, "function");
  assert.equal(typeof browser.window.Urban95ScoreSidebar.hide, "function");
  assert.equal(typeof browser.window.Urban95ScoreSidebar.sync, "function");
  assert.equal(typeof browser.window.Urban95LoadingUi.create, "function");
  assert.equal(typeof browser.window.Urban95PointDataSources.create, "function");
  assert.equal(typeof browser.window.Urban95AppStartupBridge.bindStartup, "function");
  assert.equal(typeof browser.window.Urban95ScoreContext.create, "function");
  assert.equal(typeof browser.window.Urban95ScoreExplain.create, "function");
  assert.equal(typeof browser.window.Urban95ScoreSidebarChrome.create, "function");
  assert.equal(typeof browser.window.Urban95NeighborhoodScores.create, "function");
  assert.equal(typeof browser.window.Urban95IconLoader.create, "function");
  assert.equal(typeof browser.window.Urban95AmenityMode.create, "function");
  assert.equal(typeof browser.window.Urban95ControlActions.create, "function");
  assert.equal(typeof browser.window.Urban95InfoModal.bind, "function");
  assert.equal(typeof browser.window.Urban95Dashboards.configure, "function");
  assert.equal(typeof browser.window.Urban95SidebarChromeBindings.create, "function");
  assert.equal(typeof browser.window.Urban95NeighborhoodPanelRender.bindCharts, "function");
  assert.equal(typeof browser.window.Urban95NeighborhoodSidebar.configure, "function");
  assert.equal(typeof browser.window.Urban95NeighborhoodSidebar.show, "function");
  assert.equal(typeof browser.window.Urban95NeighborhoodSidebar.sync, "function");
  assert.equal(typeof browser.window.Urban95NeighborhoodSidebar.hide, "function");
  assert.equal(typeof browser.window.Urban95NeighborhoodSidebar.isOpen, "function");
  assert.equal(typeof browser.window.Urban95CityGapModes.normalizeMode, "function");
  assert.equal(typeof browser.window.Urban95CityGapModes.computeCuts, "function");
  assert.equal(typeof browser.window.Urban95CityGapModes.isInGap, "function");
  assert.equal(typeof browser.window.Urban95CityGapModes.cutForMode, "function");
  assert.equal(typeof browser.window.Urban95CityGapModes.compareOpForMode, "function");
  // Element-wise: MODES array is created in a vm realm (deepEqual fails cross-realm).
  assert.equal(browser.window.Urban95CityGapModes.MODES.length, 3);
  assert.equal(browser.window.Urban95CityGapModes.MODES[0], "off");
  assert.equal(browser.window.Urban95CityGapModes.MODES[1], "below_city_avg");
  assert.equal(browser.window.Urban95CityGapModes.MODES[2], "large_weak");
  assert.equal(browser.window.Urban95CityGapModes.MODE_OFF, "off");
  assert.equal(browser.window.Urban95CityGapModes.MODE_BELOW_CITY_AVG, "below_city_avg");
  assert.equal(browser.window.Urban95CityGapModes.MODE_LARGE_WEAK, "large_weak");
  assert.equal(browser.window.Urban95CityGapModes.DEFAULT_MODE, "off");
  assert.equal(browser.window.Urban95CityGapModes.normalizeMode("lt40"), "off");
  assert.equal(browser.window.Urban95CityGapModes.normalizeMode("lt50"), "off");
  assert.equal(browser.window.Urban95CityGapModes.normalizeMode("lt60"), "off");
  assert.equal(browser.window.Urban95CityGapModes.normalizeMode("bottom_quartile"), "off");
  assert.equal(typeof browser.window.Urban95CityGapModes.computeLargeWeakNames, "function");
  assert.equal(typeof browser.window.Urban95CityGapModes.buildGapCuts, "function");
  assert.equal(typeof browser.window.Urban95CityPanelRender.populateHeader, "function");
  assert.equal(typeof browser.window.Urban95CityPanelRender.buildBodyHTML, "function");
  assert.equal(typeof browser.window.Urban95CityPanelRender.bindCharts, "function");
  assert.equal(typeof browser.window.Urban95CityPanelRender.destroyCharts, "function");
  assert.equal(typeof browser.window.Urban95CitySidebar.configure, "function");
  assert.equal(typeof browser.window.Urban95CitySidebar.openShell, "function");
  assert.equal(typeof browser.window.Urban95CitySidebar.sync, "function");
  assert.equal(typeof browser.window.Urban95CitySidebar.hide, "function");
  assert.equal(typeof browser.window.Urban95CitySidebar.dismiss, "function");
  assert.equal(typeof browser.window.Urban95CitySidebar.isOpen, "function");
  assert.equal(typeof browser.window.Urban95CitySidebar.setSelection, "function");
  assert.equal(typeof browser.window.Urban95CitySidebar.setGapMode, "function");
  assert.equal(typeof browser.window.Urban95CitySidebar.setGapState, "function");
  assert.equal(typeof browser.window.Urban95CitySidebar.getGapState, "function");
  assert.equal(typeof browser.window.Urban95Dashboards.loadNeighborhoods, "function");
  assert.equal(typeof browser.window.Urban95Dashboards.loadNeighborhoodSurfaceData, "function");
  assert.equal(typeof browser.window.Urban95Dashboards.loadNeighborhoodChartsPayload, "function");
  assert.equal(typeof browser.window.Urban95Dashboards.loadCitywideStats, "function");
  assert.equal(typeof browser.window.Urban95Dashboards.getNeighborhoodFeatureAtPoint, "function");
  assert.equal(typeof browser.window.Urban95Dashboards.showNeighborhoodAreaTooltip, "function");
  assert.equal(
    typeof browser.window.Urban95Dashboards.getNeighborhoodHexSurfaceOpacityExpression,
    "function"
  );
  assert.equal(typeof browser.window.Urban95Dashboards.pieSlicesFromInventoryCounts, "function");
  assert.equal(typeof browser.window.Urban95NeighborhoodPanelRender.destroyCharts, "function");
  runBrowserScript("docs/js/map/modeController.js", browser);
  assert.equal(typeof browser.window.Urban95ModeController.create, "function");
  runBrowserScript("docs/js/map/mapEvents.js", browser);
  assert.equal(typeof browser.window.Urban95MapEvents.bind, "function");
});

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
      syncOverlayVisibility: function () { calls.push("toggleLabel"); },
    },
    pointDataLoader: {
      ensureExpandedPointDataLoaded: function () { calls.push("ensureExpanded"); return Promise.resolve(); },
      canRefreshPointAnalysisAfterPointDataLoad: function () { return true; },
    },
    renderers: {
      syncPointLayerVisibility: function () { calls.push("syncPointLayerVisibility"); },
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
    "syncPointLayerVisibility",
    "buildingColors",
    "surfaceData",
    "selectBuilding",
  ]);
});

test("amenity mode falls back to clean data and warns when expanded legacy amenities are empty", async () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/amenityMode.js", browser);

  const calls = [];
  const state = {
    scoreMode: "expanded",
    cleanData: { features: [{ properties: { amenity_type: "park" } }] },
    legacyData: { features: [] },
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
      syncOverlayVisibility: function () { calls.push("toggleLabel"); },
    },
    pointDataLoader: {
      ensureExpandedPointDataLoaded: function () { calls.push("ensureExpanded"); return Promise.resolve(); },
      canRefreshPointAnalysisAfterPointDataLoad: function () { return true; },
    },
    renderers: {
      syncPointLayerVisibility: function () { calls.push("syncPointLayerVisibility"); },
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

  assert.equal(state.allAmenitiesData, state.cleanData);
  assert.deepEqual(state.allAmenityTypes, ["park"]);
  assert.deepEqual(Array.from(state.typesWithData), ["park"]);
  assert.deepEqual(calls, [
    "phase:applyScoreModeAmenities",
    "warn",
    "setData",
    "setTypes",
    "setTypesWithData",
    "clearRadius",
    "buildFilterItems",
    "syncFilter",
    "toggleLabel",
    "ensureExpanded",
    "syncPointLayerVisibility",
    "buildingColors",
    "surfaceData",
    "selectBuilding",
  ]);
});

test("amenity mode selected-building apply lets selection own radius-derived point refresh", async () => {
  const AmenityMode = runAmenityModeModule();
  const calls = [];
  const selectedBuilding = { properties: { building_id: 101 }, lng: 34.8, lat: 31.25 };
  const state = {
    getScoreMode: () => "expanded",
    getCleanData: () => ({ type: "FeatureCollection", features: [{ properties: { amenity_type: "school" } }] }),
    getCleanTypes: () => ["school"],
    getCleanTypesWithData: () => new Set(["school"]),
    getLegacyData: () => ({ type: "FeatureCollection", features: [{ properties: { amenity_type: "school" } }] }),
    getLegacyTypes: () => ["school"],
    getLegacyTypesWithData: () => new Set(["school"]),
    setAllAmenitiesData: () => calls.push("setAllAmenitiesData"),
    setAllAmenityTypes: () => calls.push("setAllAmenityTypes"),
    setTypesWithData: () => calls.push("setTypesWithData"),
    clearRadiusIds: () => calls.push("clearRadiusIds"),
    getCurrentMode: () => "house",
    getSelectedBuilding: () => selectedBuilding,
  };
  const amenityMode = AmenityMode.create({
    perf: { phase: (_name, callback) => callback() },
    logger: { warn: () => {} },
    state,
    ui: {
      buildFilterItems: () => calls.push("buildFilterItems"),
      syncFilterUiForScoreMode: () => calls.push("syncFilterUiForScoreMode"),
      syncOverlayVisibility: () => calls.push("syncOverlayVisibility"),
    },
    pointDataLoader: {
      ensureExpandedPointDataLoaded: () => Promise.resolve({ upgradedKinds: ["trees", "street-lights"] }),
      canRefreshPointAnalysisAfterPointDataLoad: () => true,
    },
    renderers: {
      syncPointLayerVisibility: () => calls.push("syncPointLayerVisibility"),
      applyShowPointsToggle: () => calls.push("applyShowPointsToggle"),
      updateAmenitiesSource: () => calls.push("updateAmenitiesSource"),
      updateTreesSource: () => calls.push("updateTreesSource"),
      updateStreetLightsSource: () => calls.push("updateStreetLightsSource"),
      updateBuildingColors: () => calls.push("updateBuildingColors"),
      updateNeighborhoodSurfaceData: () => calls.push("updateNeighborhoodSurfaceData"),
    },
    selection: {
      selectBuilding: (building, doFly, options) =>
        calls.push(["selectBuilding", building, doFly, options]),
    },
  });

  const result = await amenityMode.apply();

  assert.equal(result.refreshedSelectedBuilding, true);
  assert.deepEqual(
    calls.filter((item) => item === "updateAmenitiesSource" || item === "updateTreesSource" || item === "updateStreetLightsSource"),
    [],
    "selected-building score-mode apply must not refresh point sources before selectBuilding"
  );
  assert.equal(calls.filter((item) => Array.isArray(item) && item[0] === "selectBuilding").length, 1);
  const selectBuildingCall = calls.find((item) => Array.isArray(item) && item[0] === "selectBuilding");
  assert.equal(selectBuildingCall[0], "selectBuilding");
  assert.equal(selectBuildingCall[1], selectedBuilding);
  assert.equal(selectBuildingCall[2], false);
  assert.equal(selectBuildingCall[3].suppressIsochroneLoadingOverlay, true);
  assert.ok(calls.includes("updateBuildingColors"));
});

test("amenity mode no-selection apply reports fallback refresh result", async () => {
  const AmenityMode = runAmenityModeModule();
  const calls = [];
  const state = {
    getScoreMode: () => "expanded",
    getCleanData: () => ({ type: "FeatureCollection", features: [{ properties: { amenity_type: "school" } }] }),
    getCleanTypes: () => ["school"],
    getCleanTypesWithData: () => new Set(["school"]),
    getLegacyData: () => ({ type: "FeatureCollection", features: [{ properties: { amenity_type: "school" } }] }),
    getLegacyTypes: () => ["school"],
    getLegacyTypesWithData: () => new Set(["school"]),
    setAllAmenitiesData: () => calls.push("setAllAmenitiesData"),
    setAllAmenityTypes: () => calls.push("setAllAmenityTypes"),
    setTypesWithData: () => calls.push("setTypesWithData"),
    clearRadiusIds: () => calls.push("clearRadiusIds"),
    getCurrentMode: () => "house",
    getSelectedBuilding: () => null,
  };
  const amenityMode = AmenityMode.create({
    perf: { phase: (_name, callback) => callback() },
    logger: { warn: () => {} },
    state,
    ui: {
      buildFilterItems: () => calls.push("buildFilterItems"),
      syncFilterUiForScoreMode: () => calls.push("syncFilterUiForScoreMode"),
      syncOverlayVisibility: () => calls.push("syncOverlayVisibility"),
    },
    pointDataLoader: {
      ensureExpandedPointDataLoaded: () => Promise.resolve({ upgradedKinds: [] }),
      canRefreshPointAnalysisAfterPointDataLoad: () => true,
    },
    renderers: {
      syncPointLayerVisibility: () => calls.push("syncPointLayerVisibility"),
      applyShowPointsToggle: () => calls.push("applyShowPointsToggle"),
      updateAmenitiesSource: () => calls.push("updateAmenitiesSource"),
      updateTreesSource: () => calls.push("updateTreesSource"),
      updateStreetLightsSource: () => calls.push("updateStreetLightsSource"),
      updateBuildingColors: () => calls.push("updateBuildingColors"),
      updateNeighborhoodSurfaceData: () => calls.push("updateNeighborhoodSurfaceData"),
    },
    selection: {
      selectBuilding: (building, doFly) => calls.push(["selectBuilding", building, doFly]),
    },
  });

  const result = await amenityMode.apply();

  assert.equal(result.refreshedSelectedBuilding, false);
  assert.ok(calls.includes("updateAmenitiesSource"));
  assert.ok(calls.includes("updateTreesSource"));
  assert.ok(calls.includes("updateStreetLightsSource"));
  assert.equal(calls.filter((item) => Array.isArray(item) && item[0] === "selectBuilding").length, 0);
});

test("control actions own score-mode, filter, walk-minute, and escape reactions", async () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/controlActions.js", browser);

  const calls = [];
  const state = {
    currentMode: "house",
    scoreMode: "weighted",
    selectedBuilding: { lng: 1, lat: 2 },
    selectedNeighborhood: { properties: { id: 5 } },
    canRefreshPointAnalysisAfterPointDataLoad: true,
  };
  let citySidebarOpen = false;

  const actions = browser.window.Urban95ControlActions.create({
    perf: {
      session: function (name) {
        calls.push("session:" + name);
      },
      span: function (name, _meta, callback) {
        calls.push("span:" + name);
        return callback();
      },
      phase: function (name, callback) {
        calls.push("phase:" + name);
        return callback();
      },
    },
    state: {
      getCurrentMode: function () {
        return state.currentMode;
      },
      getScoreMode: function () {
        return state.scoreMode;
      },
      getActiveHeatmapId: function () {
        return "u95.overall";
      },
      setActiveHeatmapId: function () {},
      getSelectedBuilding: function () {
        return state.selectedBuilding;
      },
      getSelectedNeighborhood: function () {
        return state.selectedNeighborhood;
      },
      clearDerivedCaches: function () {
        calls.push("clearDerivedCaches");
      },
      setIsochronesDeferred: function () {
        calls.push("isoDeferred");
      },
      getIsochronesLoaded: function () {
        return false;
      },
    },
    pointDataLoader: {
      canRefreshPointAnalysisAfterPointDataLoad: function () {
        return state.canRefreshPointAnalysisAfterPointDataLoad;
      },
    },
    loadingUi: {
      showIsochroneLoadingScreen: function () {
        calls.push("showIso");
      },
      getWaitingForIsochroneLoad: function () {
        calls.push("waitingIso");
        return false;
      },
      hideIsochroneLoadingScreen: function () {
        calls.push("hideIso");
      },
      mark: function (name) {
        calls.push("mark:" + name);
      },
    },
    amenityMode: {
      apply: function () {
        calls.push("amenityApply");
        return Promise.resolve();
      },
    },
    renderers: {
      applyShowPointsToggle: function () {
        calls.push("showPoints");
      },
      updateAmenitiesSource: function () {
        calls.push("amenities");
      },
      updateTreesSource: function () {
        calls.push("trees");
      },
      updateStreetLightsSource: function () {
        calls.push("lights");
      },
      updateBuildingColors: function () {
        calls.push("buildings");
      },
      updateNeighborhoodSurfaceData: function () {
        calls.push("surface");
      },
      updateNeighborhoodColors: function () {
        calls.push("neighborhoodColors");
      },
    },
    selection: {
      loadIsochrones: function (options) {
        calls.push("loadIso:" + String(options.background));
      },
      selectBuilding: function (_centroid, shouldAnimate) {
        calls.push("selectBuilding:" + String(shouldAnimate));
      },
      updateRadiusInfo: function () {
        calls.push("radiusInfo");
      },
      clearRadiusSelection: function () {
        calls.push("clearRadius");
      },
    },
    scoreSidebar: {
      isOpen: function () {
        calls.push("scoreSidebarOpen");
        return false;
      },
      hide: function () {
        calls.push("scoreSidebarHide");
      },
    },
    neighborhoodSidebar: {
      show: function () {
        calls.push("showNeighborhood");
      },
      sync: function () {
        calls.push("syncNeighborhood");
      },
      hide: function () {
        calls.push("hideNeighborhood");
      },
      isOpen: function () {
        return false;
      },
    },
    compareApply: {
      resync: function () {
        calls.push("compareApply:resync");
      },
      clearAll: function () {
        calls.push("compareApply:clearAll");
      },
    },
    citySidebar: {
      isOpen: function () {
        calls.push("citySidebar:isOpen");
        return citySidebarOpen;
      },
      sync: function () {
        calls.push("citySidebar:sync");
      },
      hide: function () {
        calls.push("citySidebar:hide");
        citySidebarOpen = false;
      },
      dismiss: function () {
        calls.push("citySidebar:dismiss");
        citySidebarOpen = false;
      },
      setSelection: function (value) {
        calls.push("citySidebar:setSelection:" + (value == null ? "null" : "feature"));
        citySidebarOpen = true;
      },
    },
    modeController: {
      switchMode: function (mode) {
        calls.push("switch:" + mode);
      },
    },
    map: {
      getLayer: function (id) {
        calls.push("getLayer:" + id);
        return { id: id };
      },
      setLayoutProperty: function (id, property, value) {
        calls.push("heatmap " + value);
      },
    },
    ui: {
      clearTooltip: function () {},
    },
  });

  actions.onFilterSelectionChanged();
  await actions.onScoreModeChanged("expanded");
  state.scoreMode = "expanded";
  await actions.onScoreModeChanged("weighted");
  actions.onWalkMinutesChanged();
  await actions.onModeToggleRequested("citywide");
  state.currentMode = "citywide";
  citySidebarOpen = true;
  actions.onEscape({ stopPropagation: function () { calls.push("stopPropagation"); } });
  assert.equal(state.currentMode, "citywide");
  assert.ok(!calls.includes("switch:house"));

  const escapeDismissIndex = calls.indexOf("citySidebar:dismiss");
  assert.notEqual(escapeDismissIndex, -1);
  const callsAfterDismiss = calls.slice(escapeDismissIndex + 1);
  assert.ok(!callsAfterDismiss.includes("switch:house"));

  citySidebarOpen = false;
  const callCountBeforeClosedEscape = calls.length;
  actions.onEscape({ stopPropagation: function () { calls.push("stopPropagation"); } });
  assert.equal(calls.slice(callCountBeforeClosedEscape).includes("citySidebar:dismiss"), false);
  assert.ok(!calls.slice(callCountBeforeClosedEscape).includes("switch:house"));

  await actions.onModeToggleRequested("citywide");
  assert.ok(calls.includes("citySidebar:setSelection:null"));

  function assertSubsequence(sequence) {
    let cursor = 0;
    sequence.forEach(function (expected) {
      const foundAt = calls.indexOf(expected, cursor);
      assert.notEqual(foundAt, -1, "expected " + expected + " after " + calls.slice(0, cursor).join(", "));
      cursor = foundAt + 1;
    });
  }

  assertSubsequence([
    "buildings",
    "selectBuilding:false",
    "surface",
  ]);
  assertSubsequence([
    "session:score-model -> Amenities Focus",
    "phase:scoreModelToggle:handler",
    "loadIso:true",
    "span:scoreModelToggle:applyScoreModeAmenities",
    "amenityApply",
    "span:scoreModelToggle:updateRadiusInfo",
    "radiusInfo",
  ]);
  assertSubsequence([
    "session:score-model -> Urban95",
    "phase:scoreModelToggle:handler",
    "waitingIso",
    "isoDeferred",
    "span:scoreModelToggle:applyScoreModeAmenities",
    "amenityApply",
    "span:scoreModelToggle:updateRadiusInfo",
    "radiusInfo",
    "surface",
    "selectBuilding:false",
    "buildings",
  ]);
  assertSubsequence([
    "session:analysis mode -> citywide",
    "phase:modeToggle:click",
    "switch:citywide",
    "scoreSidebarOpen",
    "citySidebar:isOpen",
    "citySidebar:dismiss",
    "stopPropagation",
  ]);

  assert.ok(!calls.includes("amenities"));
  assert.ok(!calls.includes("trees"));
  assert.ok(!calls.includes("lights"));
  assert.equal(calls.includes("showIso"), false);
  assert.ok(calls.includes("amenityApply"));
  assert.ok(calls.includes("radiusInfo"));
  assert.ok(calls.includes("switch:citywide"));
  assert.ok(calls.includes("isoDeferred"));
  assert.ok(!calls.includes("mark:isochrones"));
});

test("control actions skip direct radius sync when amenity mode reselected the building", async () => {
  const ControlActions = runControlActionsModule();
  const calls = [];
  const actions = ControlActions.create({
    perf: {
      session: () => {},
      mark: () => {},
      phase: (_name, callback) => callback(),
      span: (name, _meta, callback) => {
        calls.push("span:" + name);
        return callback();
      },
    },
    state: {
      getCurrentMode: () => "house",
      getScoreMode: () => "expanded",
      getActiveHeatmapId: () => "u95.overall",
      setActiveHeatmapId: () => {},
      getSelectedBuilding: () => ({ lng: 1, lat: 2 }),
      getSelectedNeighborhood: () => null,
      clearDerivedCaches: () => {},
      getIsochronesLoaded: () => true,
      setIsochronesDeferred: () => {},
    },
    pointDataLoader: { canRefreshPointAnalysisAfterPointDataLoad: () => true },
    loadingUi: {
      showIsochroneLoadingScreen: () => {},
      getWaitingForIsochroneLoad: () => false,
      hideIsochroneLoadingScreen: () => {},
      mark: () => {},
    },
    amenityMode: { apply: () => Promise.resolve({ refreshedSelectedBuilding: true }) },
    renderers: {
      applyShowPointsToggle: () => {},
      updateAmenitiesSource: () => {},
      updateTreesSource: () => {},
      updateStreetLightsSource: () => {},
      updateBuildingColors: () => {},
      updateNeighborhoodSurfaceData: () => {},
      updateNeighborhoodColors: () => {},
    },
    selection: {
      loadIsochrones: () => Promise.resolve(),
      selectBuilding: () => {},
      updateRadiusInfo: () => calls.push("updateRadiusInfo"),
      clearRadiusSelection: () => {},
    },
    citySidebar: createCitySidebarControlStub(),
    scoreSidebar: { isOpen: () => false, hide: () => {} },
    neighborhoodSidebar: {
      show: () => {},
      sync: () => {},
      hide: () => {},
      isOpen: () => false,
    },
    compareApply: {
      resync: () => {},
      clearAll: () => {},
    },
    modeController: { switchMode: () => {} },
    map: { getLayer: () => false, setLayoutProperty: () => {} },
    ui: { clearTooltip: () => {} },
  });

  await actions.onScoreModeChanged("expanded");

  assert.equal(calls.includes("span:scoreModelToggle:updateRadiusInfo"), false);
  assert.equal(calls.includes("updateRadiusInfo"), false);
});

test("control actions selected-building cold expanded switch keeps isochrones backgrounded without global overlay", async () => {
  const ControlActions = runControlActionsModule();
  const calls = [];
  const actions = ControlActions.create({
    perf: {
      session: () => {},
      mark: () => {},
      phase: (_name, callback) => callback(),
      span: (_name, _meta, callback) => callback(),
    },
    state: {
      getCurrentMode: () => "house",
      getScoreMode: () => "expanded",
      getActiveHeatmapId: () => "u95.overall",
      setActiveHeatmapId: () => {},
      getSelectedBuilding: () => ({ lng: 1, lat: 2, properties: { building_id: 55 } }),
      getSelectedNeighborhood: () => null,
      clearDerivedCaches: () => {},
      getIsochronesLoaded: () => false,
      setIsochronesDeferred: () => {},
    },
    pointDataLoader: { canRefreshPointAnalysisAfterPointDataLoad: () => true },
    loadingUi: {
      showIsochroneLoadingScreen: () => calls.push("showIso"),
      getWaitingForIsochroneLoad: () => false,
      hideIsochroneLoadingScreen: () => {},
      mark: () => {},
    },
    amenityMode: { apply: () => Promise.resolve({ refreshedSelectedBuilding: false }) },
    renderers: {
      applyShowPointsToggle: () => {},
      updateAmenitiesSource: () => {},
      updateTreesSource: () => {},
      updateStreetLightsSource: () => {},
      updateBuildingColors: () => {},
      updateNeighborhoodSurfaceData: () => {},
      updateNeighborhoodColors: () => {},
    },
    selection: {
      loadIsochrones: (options) => {
        calls.push(["loadIsochrones", options]);
        return Promise.resolve();
      },
      selectBuilding: () => {},
      updateRadiusInfo: () => {},
      clearRadiusSelection: () => {},
    },
    citySidebar: createCitySidebarControlStub(),
    scoreSidebar: { isOpen: () => false, hide: () => {} },
    neighborhoodSidebar: {
      show: () => {},
      sync: () => {},
      hide: () => {},
      isOpen: () => false,
    },
    compareApply: {
      resync: () => {},
      clearAll: () => {},
    },
    modeController: { switchMode: () => {} },
    map: { getLayer: () => false, setLayoutProperty: () => {} },
    ui: { clearTooltip: () => {} },
  });

  await actions.onScoreModeChanged("expanded");

  assert.equal(calls.includes("showIso"), false);
  const loadIsochronesCalls = calls.filter(
    (entry) => Array.isArray(entry) && entry[0] === "loadIsochrones"
  );
  assert.equal(loadIsochronesCalls.length, 1);
  assert.equal(loadIsochronesCalls[0][0], "loadIsochrones");
  assert.equal(loadIsochronesCalls[0][1].background, true);
});

test("control actions keep direct radius sync when amenity mode did not refresh the building", async () => {
  const ControlActions = runControlActionsModule();
  const calls = [];
  const actions = ControlActions.create({
    perf: {
      session: () => {},
      mark: () => {},
      phase: (_name, callback) => callback(),
      span: (name, _meta, callback) => {
        calls.push("span:" + name);
        return callback();
      },
    },
    state: {
      getCurrentMode: () => "house",
      getScoreMode: () => "expanded",
      getActiveHeatmapId: () => "u95.overall",
      setActiveHeatmapId: () => {},
      getSelectedBuilding: () => ({ lng: 1, lat: 2 }),
      getSelectedNeighborhood: () => null,
      clearDerivedCaches: () => {},
      getIsochronesLoaded: () => true,
      setIsochronesDeferred: () => {},
    },
    pointDataLoader: { canRefreshPointAnalysisAfterPointDataLoad: () => true },
    loadingUi: {
      showIsochroneLoadingScreen: () => {},
      getWaitingForIsochroneLoad: () => false,
      hideIsochroneLoadingScreen: () => {},
      mark: () => {},
    },
    amenityMode: { apply: () => Promise.resolve({ refreshedSelectedBuilding: false }) },
    renderers: {
      applyShowPointsToggle: () => {},
      updateAmenitiesSource: () => {},
      updateTreesSource: () => {},
      updateStreetLightsSource: () => {},
      updateBuildingColors: () => {},
      updateNeighborhoodSurfaceData: () => {},
      updateNeighborhoodColors: () => {},
    },
    selection: {
      loadIsochrones: () => Promise.resolve(),
      selectBuilding: () => {},
      updateRadiusInfo: () => calls.push("updateRadiusInfo"),
      clearRadiusSelection: () => {},
    },
    citySidebar: createCitySidebarControlStub(),
    scoreSidebar: { isOpen: () => false, hide: () => {} },
    neighborhoodSidebar: {
      show: () => {},
      sync: () => {},
      hide: () => {},
      isOpen: () => false,
    },
    compareApply: {
      resync: () => {},
      clearAll: () => {},
    },
    modeController: { switchMode: () => {} },
    map: { getLayer: () => false, setLayoutProperty: () => {} },
    ui: { clearTooltip: () => {} },
  });

  await actions.onScoreModeChanged("expanded");

  assert.ok(calls.includes("span:scoreModelToggle:updateRadiusInfo"));
  assert.ok(calls.includes("updateRadiusInfo"));
});

test("control actions do not direct-sync stale rapid toggles when amenity mode reselected", async () => {
  const ControlActions = runControlActionsModule();
  const calls = [];
  const pending = [];
  const actions = ControlActions.create({
    perf: {
      session: () => {},
      mark: () => {},
      phase: (_name, callback) => callback(),
      span: (name, _meta, callback) => {
        calls.push("span:" + name);
        return callback();
      },
    },
    state: {
      getCurrentMode: () => "house",
      getScoreMode: () => "expanded",
      getActiveHeatmapId: () => "u95.overall",
      setActiveHeatmapId: () => {},
      getSelectedBuilding: () => ({ lng: 1, lat: 2 }),
      getSelectedNeighborhood: () => null,
      clearDerivedCaches: () => {},
      getIsochronesLoaded: () => true,
      setIsochronesDeferred: () => {},
    },
    pointDataLoader: { canRefreshPointAnalysisAfterPointDataLoad: () => true },
    loadingUi: {
      showIsochroneLoadingScreen: () => {},
      getWaitingForIsochroneLoad: () => false,
      hideIsochroneLoadingScreen: () => {},
      mark: () => {},
    },
    amenityMode: {
      apply: () => new Promise((resolve) => pending.push(resolve)),
    },
    renderers: {
      applyShowPointsToggle: () => {},
      updateAmenitiesSource: () => {},
      updateTreesSource: () => {},
      updateStreetLightsSource: () => {},
      updateBuildingColors: () => {},
      updateNeighborhoodSurfaceData: () => {},
      updateNeighborhoodColors: () => {},
    },
    selection: {
      loadIsochrones: () => Promise.resolve(),
      selectBuilding: () => {},
      updateRadiusInfo: () => calls.push("updateRadiusInfo"),
      clearRadiusSelection: () => {},
    },
    citySidebar: createCitySidebarControlStub(),
    scoreSidebar: { isOpen: () => false, hide: () => {} },
    neighborhoodSidebar: {
      show: () => {},
      sync: () => {},
      hide: () => {},
      isOpen: () => false,
    },
    compareApply: {
      resync: () => {},
      clearAll: () => {},
    },
    modeController: { switchMode: () => {} },
    map: { getLayer: () => false, setLayoutProperty: () => {} },
    ui: { clearTooltip: () => {} },
  });

  const first = actions.onScoreModeChanged("expanded");
  const second = actions.onScoreModeChanged("weighted");

  assert.equal(pending.length, 2);
  pending[1]({ refreshedSelectedBuilding: true });
  await second;
  pending[0]({ refreshedSelectedBuilding: true });
  await first;

  assert.equal(calls.includes("span:scoreModelToggle:updateRadiusInfo"), false);
  assert.equal(calls.includes("updateRadiusInfo"), false);
});

test("control actions no-selection score-mode path keeps sidebar closed and skips direct radius sync", async () => {
  const ControlActions = runControlActionsModule();
  const calls = [];
  const actions = ControlActions.create({
    perf: {
      session: () => {},
      mark: () => {},
      phase: (_name, callback) => callback(),
      span: (name, _meta, callback) => {
        calls.push("span:" + name);
        return callback();
      },
    },
    state: {
      getCurrentMode: () => "house",
      getScoreMode: () => "expanded",
      getActiveHeatmapId: () => "u95.overall",
      setActiveHeatmapId: () => {},
      getSelectedBuilding: () => null,
      getSelectedNeighborhood: () => null,
      clearDerivedCaches: () => {},
      getIsochronesLoaded: () => true,
      setIsochronesDeferred: () => {},
    },
    pointDataLoader: { canRefreshPointAnalysisAfterPointDataLoad: () => true },
    loadingUi: {
      showIsochroneLoadingScreen: () => {},
      getWaitingForIsochroneLoad: () => false,
      hideIsochroneLoadingScreen: () => {},
      mark: () => {},
    },
    amenityMode: {
      apply: () => {
        calls.push("updateAmenitiesSource");
        return Promise.resolve({ refreshedSelectedBuilding: false });
      },
    },
    renderers: {
      applyShowPointsToggle: () => {},
      updateAmenitiesSource: () => {},
      updateTreesSource: () => {},
      updateStreetLightsSource: () => {},
      updateBuildingColors: () => {},
      updateNeighborhoodSurfaceData: () => {},
      updateNeighborhoodColors: () => {},
    },
    selection: {
      loadIsochrones: () => Promise.resolve(),
      selectBuilding: () => calls.push("selectBuilding"),
      updateRadiusInfo: () => calls.push("updateRadiusInfo"),
      clearRadiusSelection: () => {},
    },
    citySidebar: createCitySidebarControlStub(),
    scoreSidebar: {
      isOpen: () => {
        calls.push("scoreSidebar:isOpen");
        return false;
      },
      hide: () => calls.push("scoreSidebar:hide"),
    },
    neighborhoodSidebar: {
      show: () => {},
      sync: () => {},
      hide: () => {},
      isOpen: () => false,
    },
    compareApply: {
      resync: () => {},
      clearAll: () => {},
    },
    modeController: { switchMode: () => {} },
    map: { getLayer: () => false, setLayoutProperty: () => {} },
    ui: { clearTooltip: () => {} },
  });

  await actions.onScoreModeChanged("expanded");

  assert.ok(calls.includes("updateAmenitiesSource"));
  assert.equal(calls.includes("span:scoreModelToggle:updateRadiusInfo"), false);
  assert.equal(calls.includes("updateRadiusInfo"), false);
  assert.equal(calls.includes("selectBuilding"), false);
  assert.equal(calls.includes("scoreSidebar:isOpen"), false);
  assert.equal(calls.includes("scoreSidebar:hide"), false);
});

test("filter changes with selected building recompute selection before point-source refresh", () => {
  const ControlActions = runControlActionsModule();
  const calls = [];
  const selectedBuilding = { properties: { building_id: 202 } };
  const actions = ControlActions.create({
    perf: { session: () => {}, phase: (_name, callback) => callback() },
    state: {
      getCurrentMode: () => "house",
      getScoreMode: () => "expanded",
      getActiveHeatmapId: () => "u95.overall",
      setActiveHeatmapId: () => {},
      getSelectedBuilding: () => selectedBuilding,
      getSelectedNeighborhood: () => null,
      clearDerivedCaches: () => {},
      getIsochronesLoaded: () => true,
      setIsochronesDeferred: () => {},
    },
    pointDataLoader: { canRefreshPointAnalysisAfterPointDataLoad: () => true },
    loadingUi: {
      showIsochroneLoadingScreen: () => {},
      getWaitingForIsochroneLoad: () => false,
      hideIsochroneLoadingScreen: () => {},
      mark: () => {},
    },
    amenityMode: { apply: () => Promise.resolve() },
    renderers: {
      applyShowPointsToggle: () => {},
      updateAmenitiesSource: () => calls.push("updateAmenitiesSource"),
      updateTreesSource: () => calls.push("updateTreesSource"),
      updateStreetLightsSource: () => calls.push("updateStreetLightsSource"),
      updateBuildingColors: () => calls.push("updateBuildingColors"),
      updateNeighborhoodSurfaceData: () => calls.push("updateNeighborhoodSurfaceData"),
      updateNeighborhoodColors: () => calls.push("updateNeighborhoodColors"),
    },
    selection: {
      loadIsochrones: () => Promise.resolve(),
      selectBuilding: () => calls.push("selectBuilding"),
      updateRadiusInfo: () => {},
      clearRadiusSelection: () => {},
    },
    citySidebar: createCitySidebarControlStub(),
    scoreSidebar: { isOpen: () => false, hide: () => {} },
    neighborhoodSidebar: {
      show: () => {},
      sync: () => {},
      hide: () => {},
      isOpen: () => false,
    },
    compareApply: {
      resync: () => {},
      clearAll: () => {},
    },
    modeController: { switchMode: () => {} },
    map: { getLayer: () => false, setLayoutProperty: () => {} },
    ui: { clearTooltip: () => {} },
  });

  actions.onFilterSelectionChanged();

  assert.deepEqual(calls, [
    "updateBuildingColors",
    "selectBuilding",
    "updateNeighborhoodSurfaceData",
  ]);
});

test("filter changes refresh point sources when selected-building recompute is unavailable", () => {
  const ControlActions = runControlActionsModule();
  const calls = [];
  const selectedBuilding = { properties: { building_id: 303 } };
  const actions = ControlActions.create({
    perf: { session: () => {}, phase: (_name, callback) => callback() },
    state: {
      getCurrentMode: () => "house",
      getScoreMode: () => "expanded",
      getActiveHeatmapId: () => "u95.overall",
      setActiveHeatmapId: () => {},
      getSelectedBuilding: () => selectedBuilding,
      getSelectedNeighborhood: () => null,
      clearDerivedCaches: () => {},
      getIsochronesLoaded: () => true,
      setIsochronesDeferred: () => {},
    },
    pointDataLoader: { canRefreshPointAnalysisAfterPointDataLoad: () => false },
    loadingUi: {
      showIsochroneLoadingScreen: () => {},
      getWaitingForIsochroneLoad: () => false,
      hideIsochroneLoadingScreen: () => {},
      mark: () => {},
    },
    amenityMode: { apply: () => Promise.resolve() },
    renderers: {
      applyShowPointsToggle: () => {},
      updateAmenitiesSource: () => calls.push("updateAmenitiesSource"),
      updateTreesSource: () => calls.push("updateTreesSource"),
      updateStreetLightsSource: () => calls.push("updateStreetLightsSource"),
      updateBuildingColors: () => calls.push("updateBuildingColors"),
      updateNeighborhoodSurfaceData: () => calls.push("updateNeighborhoodSurfaceData"),
      updateNeighborhoodColors: () => calls.push("updateNeighborhoodColors"),
    },
    selection: {
      loadIsochrones: () => Promise.resolve(),
      selectBuilding: () => calls.push("selectBuilding"),
      updateRadiusInfo: () => {},
      clearRadiusSelection: () => {},
    },
    citySidebar: createCitySidebarControlStub(),
    scoreSidebar: { isOpen: () => false, hide: () => {} },
    neighborhoodSidebar: {
      show: () => {},
      sync: () => {},
      hide: () => {},
      isOpen: () => false,
    },
    compareApply: {
      resync: () => {},
      clearAll: () => {},
    },
    modeController: { switchMode: () => {} },
    map: { getLayer: () => false, setLayoutProperty: () => {} },
    ui: { clearTooltip: () => {} },
  });

  actions.onFilterSelectionChanged();

  assert.deepEqual(calls, [
    "updateBuildingColors",
    "updateAmenitiesSource",
    "updateTreesSource",
    "updateStreetLightsSource",
    "updateNeighborhoodSurfaceData",
  ]);
});

test("walk-minute selected building recompute precedes global recolor", () => {
  const ControlActions = runControlActionsModule();
  const calls = [];
  const rafQueue = [];
  const selectedBuilding = { properties: { building_id: 404 } };
  const actions = ControlActions.create({
    perf: {
      session: () => {},
      mark: (name, meta) => {
        void meta;
        calls.push(name);
      },
      phase: (_name, callback) => callback(),
      span: (name, meta, callback) => {
        void meta;
        calls.push(name);
        return callback();
      },
    },
    state: {
      getCurrentMode: () => "house",
      getScoreMode: () => "expanded",
      getActiveHeatmapId: () => "u95.overall",
      setActiveHeatmapId: () => {},
      getSelectedBuilding: () => selectedBuilding,
      getSelectedNeighborhood: () => null,
      clearDerivedCaches: () => {},
      getIsochronesLoaded: () => true,
      getWalkMinutes: () => 10,
      setIsochronesDeferred: () => {},
    },
    pointDataLoader: { canRefreshPointAnalysisAfterPointDataLoad: () => true },
    loadingUi: {
      showIsochroneLoadingScreen: () => {},
      getWaitingForIsochroneLoad: () => false,
      hideIsochroneLoadingScreen: () => {},
      mark: () => {},
    },
    amenityMode: { apply: () => Promise.resolve() },
    renderers: {
      applyShowPointsToggle: () => {},
      updateAmenitiesSource: () => calls.push("updateAmenitiesSource"),
      updateTreesSource: () => calls.push("updateTreesSource"),
      updateStreetLightsSource: () => calls.push("updateStreetLightsSource"),
      updateBuildingColors: () => calls.push("updateBuildingColors"),
      updateNeighborhoodSurfaceData: () => calls.push("updateNeighborhoodSurfaceData"),
      updateNeighborhoodColors: () => calls.push("updateNeighborhoodColors"),
    },
    selection: {
      loadIsochrones: () => Promise.resolve(),
      selectBuilding: (_building, doFly) => calls.push("selectBuilding:" + doFly),
      updateRadiusInfo: () => {},
      clearRadiusSelection: () => {},
    },
    citySidebar: createCitySidebarControlStub(),
    scoreSidebar: { isOpen: () => false, hide: () => {} },
    neighborhoodSidebar: {
      show: () => {},
      sync: () => {},
      hide: () => {},
      isOpen: () => false,
    },
    compareApply: {
      resync: () => {},
      clearAll: () => {},
    },
    modeController: { switchMode: () => {} },
    map: { getLayer: () => false, setLayoutProperty: () => {} },
    ui: { clearTooltip: () => {} },
    requestAnimationFrame: (callback) => {
      rafQueue.push(callback);
      return rafQueue.length;
    },
  });

  actions.onWalkMinutesChanged();

  assert.deepEqual(calls.slice(0, 4), [
    "walkMinutesToggle:start",
    "walkMinutesToggle:updateNeighborhoodSurfaceData",
    "updateNeighborhoodSurfaceData",
    "walkMinutesToggle:selectBuilding",
  ]);
  assert.ok(!calls.includes("updateBuildingColors"));
  assert.ok(calls.includes("selectBuilding:false"));
  assert.equal(rafQueue.length, 1);

  rafQueue.shift()();

  assert.deepEqual(calls, [
    "walkMinutesToggle:start",
    "walkMinutesToggle:updateNeighborhoodSurfaceData",
    "updateNeighborhoodSurfaceData",
    "walkMinutesToggle:selectBuilding",
    "selectBuilding:false",
    "walkMinutesToggle:updateBuildingColors",
    "updateBuildingColors",
  ]);
});

test("app dependency validation is exposed through one namespace without leaking helper globals", () => {
  const dependenciesSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "core", "appDependencies.js"),
    "utf8"
  );
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");

  assert.match(dependenciesSource, /^\(function \(\) \{/m);
  assert.match(dependenciesSource, /window\.Urban95AppDependencies\s*=\s*\{/);
  assert.match(appSource, /}\s*=\s*window\.Urban95AppDependencies;/);
  assert.match(dependenciesSource, /Urban95RenderState:\s*Urban95RenderState/);
  assert.match(dependenciesSource, /Urban95OverlayVisibility:\s*Urban95OverlayVisibility/);
  assert.match(appSource, /Urban95RenderState,/);
  assert.match(appSource, /Urban95OverlayVisibility,/);
  assert.doesNotMatch(appSource, /window\.Urban95RenderState/);

  [
    /window\.requireNamespace\s*=/,
    /window\.urban95RuntimeLoaders\s*=/,
    /window\.createAppState\s*=/,
    /window\.fetchJsonWithGzipFallback\s*=/,
  ].forEach(function (pattern) {
    assert.doesNotMatch(dependenciesSource, pattern);
  });
});

test("icon loader registers amenity icons with fallback and non-fatal warnings", async () => {
  const warnings = [];
  const objectUrls = [];
  const revokedUrls = [];
  function FakeBlob(parts, options) {
    this.parts = parts;
    this.type = options && options.type;
  }
  const fakeUrl = {
    createObjectURL(blob) {
      objectUrls.push(blob);
      return "blob:icon-" + objectUrls.length;
    },
    revokeObjectURL(url) {
      revokedUrls.push(url);
    },
  };
  function FakeImage() {
    this.crossOrigin = null;
  }
  Object.defineProperty(FakeImage.prototype, "src", {
    get() {
      return this._src;
    },
    set(value) {
      this._src = value;
      if (typeof this.onload === "function") this.onload();
    },
  });

  const mapImages = new Map();
  const browser = createBrowserContext({
    fetch(url) {
      return Promise.resolve({
        ok: true,
        text() {
          return Promise.resolve("<svg data-url=\"" + url + "\"></svg>");
        },
      });
    },
    Blob: FakeBlob,
    URL: fakeUrl,
    Image: FakeImage,
  });

  runBrowserScript("docs/js/map/iconLoader.js", browser);

  const iconLoader = browser.window.Urban95IconLoader.create({
    map: {
      hasImage(name) {
        return mapImages.has(name);
      },
      addImage(name, image, options) {
        mapImages.set(name, { image, options });
      },
    },
    iconsBase: "./icons",
    scoreModel: {
      AMENITY_TYPE_CONFIG: {
        park: { icon: "park" },
        school: { icon: "school" },
      },
      DEFAULT_CONFIG: { icon: "marker" },
    },
    fetch: browser.window.fetch,
    Image: browser.window.Image,
    Blob: browser.window.Blob,
    URL: browser.window.URL,
    logger: {
      warn(message) {
        warnings.push(message);
      },
    },
  });

  await iconLoader.loadAmenityIcons();

  // MAP_LAYER_ICONS (park-alt1, lighthouse, bus, marker, town-hall) always load,
  // plus amenity/default icons from the injected scoreModel config.
  const expectedIconNames = [
    "bus",
    "lighthouse",
    "marker",
    "park",
    "park-alt1",
    "school",
    "town-hall",
  ];
  assert.deepEqual(Object.keys(iconLoader).sort(), ["areIconsLoaded", "loadAmenityIcons"]);
  assert.deepEqual(Array.from(mapImages.keys()).sort(), expectedIconNames);
  expectedIconNames.forEach(function (name) {
    assert.equal(mapImages.get(name).options.sdf, true);
  });
  assert.deepEqual(warnings, []);
  assert.equal(iconLoader.areIconsLoaded(), true);
});

test("icon loader falls back to direct image loading when blob URL support is unavailable", async () => {
  const warnings = [];
  const fetchedUrls = [];
  const imageUrls = [];
  function FakeImage() {
    this.crossOrigin = null;
  }
  Object.defineProperty(FakeImage.prototype, "src", {
    get() {
      return this._src;
    },
    set(value) {
      this._src = value;
      imageUrls.push(value);
      if (typeof this.onload === "function") this.onload();
    },
  });

  const mapImages = new Map();
  const browser = createBrowserContext({
    fetch(url) {
      fetchedUrls.push(url);
      return Promise.resolve({
        ok: true,
        text() {
          return Promise.resolve("<svg></svg>");
        },
      });
    },
    Image: FakeImage,
  });

  runBrowserScript("docs/js/map/iconLoader.js", browser);

  const iconLoader = browser.window.Urban95IconLoader.create({
    map: {
      hasImage(name) {
        return mapImages.has(name);
      },
      addImage(name, image, options) {
        mapImages.set(name, { image, options });
      },
    },
    iconsBase: "./icons",
    scoreModel: {
      AMENITY_TYPE_CONFIG: {
        "park playground": { icon: "park playground" },
      },
      DEFAULT_CONFIG: { icon: "marker/default" },
    },
    fetch: browser.window.fetch,
    Image: browser.window.Image,
    logger: {
      warn(message) {
        warnings.push(message);
      },
    },
  });

  await iconLoader.loadAmenityIcons();

  // Direct-image path still registers MAP_LAYER_ICONS plus scoreModel icons.
  assert.deepEqual(fetchedUrls, []);
  assert.deepEqual(imageUrls.sort(), [
    "./icons/bus.svg",
    "./icons/lighthouse.svg",
    "./icons/marker%2Fdefault.svg",
    "./icons/marker.svg",
    "./icons/park%20playground.svg",
    "./icons/park-alt1.svg",
    "./icons/town-hall.svg",
  ]);
  assert.deepEqual(Array.from(mapImages.keys()).sort(), [
    "bus",
    "lighthouse",
    "marker",
    "marker/default",
    "park playground",
    "park-alt1",
    "town-hall",
  ]);
  assert.deepEqual(warnings, []);
  assert.equal(iconLoader.areIconsLoaded(), true);
});

test("startup module exposes Urban95Startup.run", () => {
  const startup = runCoreStartup();
  assert.ok(startup);
  assert.equal(typeof startup.run, "function");
});

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
  const perfRecords = [];

  const loading = browser.window.Urban95LoadingUi.create({
    elements: { loadingScreen, loadingStatus, loadingProgressBar },
    logger: { warn: function () { warnings.push(Array.from(arguments)); } },
    setTimeout: function (callback) {
      browser.timeoutCallback = callback;
      return 1;
    },
    perf: {
      mark: function (name, metaFactory) {
        perfRecords.push([name, metaFactory ? metaFactory() : null]);
      },
    },
    timeoutMs: 10,
  });

  loading.setStatus("Loading buildings...");
  assert.equal(loadingStatus.textContent, "Loading buildings...");
  assert.equal(loading.state.icons, false);
  loading.mark("icons");
  loading.mark("buildings");
  assert.equal(loading.state.icons, true);
  assert.equal(loading.getLoadingState(), loading.state);
  assert.equal(loadingProgressBar.style.width, "29%");
  loading.showIsochroneLoadingScreen({ reason: "scoreModeToggle" });
  assert.equal(loading.getWaitingForIsochroneLoad(), true);
  assert.equal(loadingProgressBar.style.width, "100%");
  assert.equal(loadingStatus.textContent, "Loading walking areas for Amenities Focus...");
  browser.timeoutCallback();
  assert.equal(loadingScreen.classList.contains("hidden"), false);
  assert.deepEqual(warnings, []);
  loading.hideIsochroneLoadingScreen({ reason: "isochronesLoaded" });
  assert.equal(loading.getWaitingForIsochroneLoad(), false);
  assert.deepEqual(perfRecords.map(function (entry) { return entry[0]; }), [
    "loadingOverlay:show",
    "loadingOverlay:hideRequested",
  ]);
  assert.equal(perfRecords[0][1].reason, "scoreModeToggle");
  assert.equal(perfRecords[1][1].reason, "isochronesLoaded");
  assert.equal(perfRecords[1][1].allKeysLoaded, false);
  ["parks", "trees", "amenities", "isochrones", "mapReady"].forEach(function (key) { loading.mark(key); });
  assert.equal(loadingProgressBar.style.width, "100%");
});

test("loading UI warns and force-hides when timeout fires before completion", () => {
  const scheduled = [];
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/loadingUi.js", browser);

  const loadingScreen = {
    classList: {
      names: new Set(),
      contains(name) { return this.names.has(name); },
      add(name) { this.names.add(name); },
      remove(name) { this.names.delete(name); },
    },
  };
  const warnings = [];
  const loading = browser.window.Urban95LoadingUi.create({
    elements: {
      loadingScreen,
      loadingStatus: { textContent: "" },
      loadingProgressBar: { style: { width: "" } },
    },
    logger: { warn: function () { warnings.push(Array.from(arguments)); } },
    setTimeout: function (callback, delay) {
      scheduled.push({ callback: callback, delay: delay });
      return scheduled.length;
    },
    timeoutMs: 10,
  });

  assert.equal(loadingScreen.classList.contains("hidden"), false);
  assert.equal(scheduled.length, 1);
  scheduled[0].callback();
  assert.deepEqual(warnings, [["Loading timeout - forcing hide"]]);
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[1].delay, 300);
  assert.equal(loadingScreen.classList.contains("hidden"), false);
  scheduled[1].callback();
  assert.equal(loadingScreen.classList.contains("hidden"), true);
});

test("loading UI does not warn on timeout after all loading keys are marked complete", () => {
  const scheduled = [];
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/loadingUi.js", browser);

  const loadingScreen = {
    classList: {
      names: new Set(),
      contains(name) { return this.names.has(name); },
      add(name) { this.names.add(name); },
      remove(name) { this.names.delete(name); },
    },
  };
  const warnings = [];
  const loading = browser.window.Urban95LoadingUi.create({
    elements: {
      loadingScreen,
      loadingStatus: { textContent: "" },
      loadingProgressBar: { style: { width: "" } },
    },
    logger: { warn: function () { warnings.push(Array.from(arguments)); } },
    setTimeout: function (callback, delay) {
      scheduled.push({ callback: callback, delay: delay });
      return scheduled.length;
    },
    timeoutMs: 10,
  });

  ["icons", "buildings", "parks", "trees", "amenities", "isochrones", "mapReady"].forEach(function (key) {
    loading.mark(key);
  });

  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[1].delay, 300);
  scheduled[0].callback();
  assert.deepEqual(warnings, []);
  assert.equal(loadingScreen.classList.contains("hidden"), false);
  scheduled[1].callback();
  assert.equal(loadingScreen.classList.contains("hidden"), true);
});

test("startup extraction keeps grouped dependency seams in source", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const startupSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "core", "startup.js"),
    "utf8"
  );
  const startupBridgeSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "core", "appStartupBridge.js"),
    "utf8"
  );

  assert.match(appSource, /Urban95AppStartupBridge\.bindStartup\(\s*\{/);
  assert.doesNotMatch(appSource, /map\.on\("load",\s*async function/);
  [
    "state:",
    "runtime:",
    "loadingUi:",
    "callbacks:",
    "renderers:",
    "selection:",
    "urls:",
  ].forEach(function (groupName) {
    assert.match(appSource, new RegExp(groupName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
  assert.doesNotMatch(appSource, /scoreData:/);
  assert.match(startupBridgeSource, /opts\.startup\.run\(\{[\s\S]*\}\)\.catch\(function \(error\) \{/);
  assert.match(startupBridgeSource, /opts\.logger\.error\("Failed to start app:", error\);/);
  assert.doesNotMatch(startupSource, /setCleanAmenitiesData\s*=/);
  assert.doesNotMatch(startupSource, /setLegacyAmenitiesData\s*=/);
  assert.doesNotMatch(startupSource, /setBuildingsData\s*=/);
  assert.match(startupSource, /window\.Urban95Startup\s*=\s*\{/);
  assert.match(startupSource, /run:\s*(?:async\s+)?function\s*\(/);
  assert.doesNotMatch(startupSource, /setCleanAmenitiesData\s*=\s*requireFunction/);
});

test("startup amenities progress does not wait on applyScoreModeAmenities promise", () => {
  const startupSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "core", "startup.js"),
    "utf8"
  );

  assert.doesNotMatch(startupSource, /callbacks\.applyScoreModeAmenities\(\)\.then/);

  const applyIndex = startupSource.indexOf("callbacks.applyScoreModeAmenities();");
  const markLoadedIndex = startupSource.indexOf("loading.markAmenitiesLoaded();");
  const perfIndex = startupSource.indexOf('"[Load] amenities: complete total"');
  const treesIndex = startupSource.indexOf("runtime.pointDataLoader.loadTreesIfNeeded();");

  assert.notEqual(applyIndex, -1, "startup must call applyScoreModeAmenities()");
  assert.notEqual(markLoadedIndex, -1, "startup must mark amenities loaded");
  assert.notEqual(perfIndex, -1, "startup must log amenities completion perf");
  assert.notEqual(treesIndex, -1, "startup must trigger lazy trees after amenities");
  assert.ok(applyIndex < markLoadedIndex, "applyScoreModeAmenities should happen before loading mark");
  assert.ok(markLoadedIndex < perfIndex, "loading mark should happen before completion perf log");
  assert.ok(perfIndex < treesIndex, "tree trigger should remain after completion logging");
});

test("startup validates nested grouped dependencies with helpful errors", async () => {
  const startup = runCoreStartup();

  await assert.rejects(
    function () {
      return startup.run({});
    },
    /deps\.logger\.debug must be a function/
  );

  await assert.rejects(
    function () {
      return startup.run({
        logger: {
          debug: function () {},
          perf: function () {},
          warn: function () {},
          error: function () {},
        },
        state: {
          buildings: {
            setData: function () {},
            setCentroids: function () {},
          },
          amenities: {
            setCleanData: function () {},
            setCleanTypes: function () {},
            setLegacyData: function () {},
            setLegacyTypes: function () {},
            clearLegacyData: function () {},
          },
        },
        runtime: {
          performance: {
            now: function () { return 0; },
          },
          map: {
            getSource: function () {},
            getZoom: function () { return 13; },
            getCanvas: function () { return { style: {} }; },
          },
          loaders: {
            loadBuildingsRuntimeData: function () { return Promise.resolve({ features: [] }); },
          },
          pointDataLoader: {
            setPointLookupData: function () {},
            loadTreesIfNeeded: function () {},
          },
          hasGeneratedArtifact: function () { return false; },
          fetchJsonWithGzipFallback: function () { return Promise.resolve({ features: [] }); },
          featureCollectionFromPointRecords: function () { return { features: [] }; },
          hasValidPointsLookupSources: function () { return false; },
          warnIfBuildingScoresIncomplete: function () {},
          scanAmenityTypesFromFeatures: function () { return { types: [], tw: new Set() }; },
          turf: {
            centroid: function () { return { geometry: { coordinates: [0, 0] } }; },
          },
          document: {},
        },
        loading: {
          setStatus: function () {},
          markMapReady: function () {},
          markIconsLoaded: function () {},
          markBuildingsLoaded: function () {},
          markParksLoaded: function () {},
          markAmenitiesLoaded: function () {},
          markTreesDeferred: function () {},
          markIsochronesDeferred: function () {},
        },
        callbacks: {
          loadAmenityIcons: function () { return Promise.resolve(); },
          loadPointsLookup: function () { return Promise.resolve({}); },
          loadAmenitiesGeojsonFallback: function () {
            return Promise.resolve({
              source: "geojson",
              cleanFc: { features: [] },
              legacyFc: null,
              treesFc: null,
              streetLightsFc: null,
            });
          },
          applyScoreModeAmenities: function () {},
          clearDerivedCaches: function () {},
          applyHouseModeHexBackground: function () {},
        },
        renderers: {
          applyParkDotPattern: function () {},
          applyUrbanNatureDotPattern: function () {},
          addAmenityLayers: function () {},
          applyShowPointsToggle: function () {},
          updateBuildingColors: function () {},
        },
        selection: {},
        urls: {
          buildings: "./data/buildings_accessibility.geojson",
          parks: "./data/parks.geojson",
          urbanNatureAreas: "./data/urban_nature_areas.geojson",
          shadeSi: "./data/shade_si.geojson",
        },
      });
    },
    /deps\.selection\.buildBuildingCentroidGridIndex must be a function/
  );
});

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
  assert.match(eventsSource, /compareApply\.applyClick/);
  assert.match(eventsSource, /showNeighborhoodAreaTooltip/);
});

test("survey overlay loads before app dependencies and guards building clicks", () => {
  const scripts = scriptSourcesFromIndex();
  const surveyIndex = requireScriptIndex(scripts, "./js/map/surveyOverlay.js");
  const dependenciesIndex = requireScriptIndex(scripts, "./js/core/appDependencies.js");
  assert.ok(surveyIndex < dependenciesIndex);

  const mapEvents = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "mapEvents.js"),
    "utf8"
  );
  assert.match(mapEvents, /isSurveyClick/);

  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapEvents.js", browser);
  const canvas = { style: {} };
  let genericClickHandler = null;
  let closestBuildingCalls = 0;
  const map = {
    on(eventName, layerIdOrHandler) {
      if (eventName === "click" && typeof layerIdOrHandler === "function") {
        genericClickHandler = layerIdOrHandler;
      }
    },
    getCanvas() {
      return canvas;
    },
    getZoom() {
      return 15;
    },
    queryRenderedFeatures() {
      return [];
    },
  };

  browser.window.Urban95MapEvents.bind({
    map,
    selection: {
      findClosestBuilding() {
        closestBuildingCalls += 1;
        return null;
      },
      selectBuilding() {},
    },
    dashboards: {
      getNeighborhoodFeatureAtPoint() {
        return null;
      },
      showNeighborhoodAreaTooltip() {},
    },
    compareApply: { applyClick() {} },
    citySidebar: { setSelection() {} },
    mapRenderers: { updateTreesSource() {}, updateStreetLightsSource() {} },
    pointDataLoader: { loadTreesIfNeeded() {}, loadStreetLightsIfNeeded() {} },
    tooltip: { style: {}, textContent: "" },
    buildingsFillLayerId: "buildings-fill",
    getCurrentMode() {
      return "house";
    },
    getDeckHovering() {
      return false;
    },
    getLastDeckClickTime() {
      return 0;
    },
    getScoreMode() {
      return "weighted";
    },
    formatArea() {
      return "";
    },
    isSurveyClick() {
      return true;
    },
  });

  assert.equal(typeof genericClickHandler, "function");
  genericClickHandler({
    originalEvent: { target: canvas },
    point: { x: 20, y: 30 },
    lngLat: { lng: 34.8, lat: 31.2 },
  });
  assert.equal(closestBuildingCalls, 0);
});

test("survey overlay marks a missing optional payload unavailable without installing map state", async () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/surveyOverlay.js", browser);

  let availability = [];
  let installCalls = 0;
  const overlay = browser.window.Urban95SurveyOverlay.create({
    map: {
      addSource() {
        installCalls += 1;
      },
      addLayer() {
        installCalls += 1;
      },
      addImage() {
        installCalls += 1;
      },
    },
    maplibregl: {},
    tooltip: { style: {}, classList: { add() {}, remove() {} } },
    surveyResultsUrl: "./data/survey_results.geojson",
    categories: {},
    fetchJson() {
      return Promise.resolve(null);
    },
    getLayerVisibility() {
      return {};
    },
    onAvailabilityChanged(value) {
      availability.push(value);
    },
  });

  assert.equal(await overlay.load(), false);
  assert.deepEqual(availability, [false]);
  assert.equal(installCalls, 0);
});

test("survey click popup gives the observation card an unconstrained fitted shell", () => {
  const overlaySource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "surveyOverlay.js"),
    "utf8"
  );
  const styleSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "style.css"),
    "utf8"
  );

  assert.match(overlaySource, /className:\s*["']survey-observation-popup["']/);
  assert.match(overlaySource, /maxWidth:\s*["']none["']/);
  assert.match(
    styleSource,
    /\.survey-observation-popup\s+\.maplibregl-popup-content\s*\{[^}]*padding:\s*0;[^}]*overflow:\s*hidden;/s
  );
});

test("survey overlay installs decoded category symbols once and shares labeled cards across hover and click", async () => {
  const popupInstances = [];
  function createElement(tagName) {
    return {
      tagName,
      children: [],
      className: "",
      textContent: "",
      dir: "",
      style: {
        values: {},
        setProperty(name, value) {
          this.values[name] = value;
        },
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      replaceChildren() {
        this.children = Array.from(arguments);
        this.textContent = "";
      },
    };
  }
  function fieldRows(card) {
    return (card.children || []).filter((field) => field.className === "survey-observation-card__field").map((field) => ({
      className: field.className,
      label: field.children[0] && field.children[0].textContent,
      value: field.children[1] && field.children[1].textContent,
      valueDir: field.children[1] && field.children[1].dir,
    }));
  }
  function cardShape(node) {
    return {
      className: node.className,
      textContent: node.textContent,
      dir: node.dir,
      children: (node.children || []).map(cardShape),
    };
  }
  const browser = createBrowserContext({
    Image: function Image() {
      this.decode = function () {
        return Promise.resolve();
      };
    },
    document: {
      createElement(tagName) {
        if (tagName === "canvas") {
          return {
            getContext() {
              return {
                drawImage() {},
                getImageData() {
                  return { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) };
                },
              };
            },
          };
        }
        return createElement(tagName);
      },
    },
  });
  runBrowserScript("docs/js/map/surveyOverlay.js", browser);

  const sources = new Map();
  const images = new Map();
  const layers = new Map([["selected-building-outline", { id: "selected-building-outline" }]]);
  const handlers = {};
  const layoutCalls = [];
  const map = {
    getSource(id) {
      return sources.get(id);
    },
    addSource(id, source) {
      sources.set(id, source);
    },
    removeSource(id) {
      sources.delete(id);
    },
    hasImage(id) {
      return images.has(id);
    },
    addImage(id, imageData) {
      images.set(id, imageData);
    },
    removeImage(id) {
      images.delete(id);
    },
    getLayer(id) {
      return layers.get(id);
    },
    addLayer(layer, beforeId) {
      layers.set(layer.id, layer);
      layer.beforeId = beforeId;
    },
    removeLayer(id) {
      layers.delete(id);
    },
    on(eventName, layerId, handler) {
      handlers[eventName + ":" + layerId] = handler;
    },
    setLayoutProperty(id, property, value) {
      layoutCalls.push({ id, property, value });
    },
    queryRenderedFeatures(_point, options) {
      return options.layers.includes("community-survey-walkability-barrier") ? [{}] : [];
    },
    getCanvas() {
      return { style: {} };
    },
  };
  const visibility = {
    survey: false,
    "survey:walkability_barrier": true,
    "survey:crossing_hazard": true,
    "survey:loved_place": true,
    "survey:community_anchor": true,
  };
  const availability = [];
  const tooltip = Object.assign(createElement("div"), { style: {}, classList: { add() {}, remove() {} } });
  const categories = {
    walkability_barrier: { label: "Barrier", color: "#f59e0b" },
    crossing_hazard: { label: "Hazard", color: "#dc2626" },
    loved_place: { label: "Loved", color: "#db2777" },
    community_anchor: { label: "Anchor", color: "#7c3aed" },
  };
  const overlay = browser.window.Urban95SurveyOverlay.create({
    map,
    maplibregl: {
      Popup: function Popup() {
        this.setLngLat = function () { return this; };
        this.setDOMContent = function (content) {
          this.content = content;
          return this;
        };
        this.addTo = function () {
          popupInstances.push(this);
          return this;
        };
        this.on = function () { return this; };
        this.remove = function () {
          this.removed = true;
        };
      },
    },
    tooltip,
    surveyResultsUrl: "./data/survey_results.geojson",
    categories,
    fetchJson() {
      return Promise.resolve({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [34.8, 31.2] },
            properties: {
              survey_category: "walkability_barrier",
              question: "Where is walking difficult?",
              neighborhood: "Ramot",
              comment: "A safe test comment",
            },
          },
        ],
      });
    },
    getLayerVisibility() {
      return visibility;
    },
    onAvailabilityChanged(value) {
      availability.push(value);
    },
  });

  assert.equal(await overlay.load(), true);
  assert.equal(await overlay.load(), true);
  assert.equal(sources.size, 1);
  assert.equal(images.size, 4);
  assert.ok([...images.values()].every((imageData) => imageData.width === 32 && imageData.height === 32));
  const surveyLayers = [...layers.values()].filter((layer) => layer.source === "community-survey");
  assert.equal(surveyLayers.length, 4);
  assert.deepEqual(
    JSON.parse(JSON.stringify(surveyLayers.map((layer) => layer.filter))),
    [
      ["==", ["get", "survey_category"], "walkability_barrier"],
      ["==", ["get", "survey_category"], "crossing_hazard"],
      ["==", ["get", "survey_category"], "loved_place"],
      ["==", ["get", "survey_category"], "community_anchor"],
    ]
  );
  assert.ok(surveyLayers.every((layer) => layer.beforeId === "selected-building-outline"));
  assert.deepEqual(availability, [true]);
  assert.equal(overlay.getBeforeLayerId(), "community-survey-walkability-barrier");
  assert.equal(overlay.isSurveyClick({ point: { x: 10, y: 10 } }), false);
  assert.equal(
    layoutCalls.filter((call) => call.property === "visibility" && call.value === "none").length,
    4
  );

  visibility.survey = true;
  overlay.syncVisibility();
  assert.equal(overlay.isSurveyClick({ point: { x: 10, y: 10 } }), true);
  const observation = {
    lngLat: [34.8, 31.2],
    point: { x: 10, y: 20 },
    features: [
      {
        geometry: { type: "Point", coordinates: [34.8, 31.2] },
        properties: {
          question: "Where is walking difficult?",
          neighborhood: "רמות",
          comment: "אין מעבר בטוח",
        },
      },
    ],
  };
  handlers["mousemove:community-survey-walkability-barrier"](observation);
  handlers["click:community-survey-walkability-barrier"](observation);
  assert.equal(popupInstances.length, 1);
  assert.equal((tooltip.children[0] || {}).className, "survey-observation-card");
  assert.equal(popupInstances[0].content.className, "survey-observation-card");
  assert.equal(tooltip.children[0].style.values["--survey-category-color"], "#f59e0b");
  assert.equal(popupInstances[0].content.style.values["--survey-category-color"], "#f59e0b");
  assert.equal(tooltip.children[0].children[0].className, "survey-observation-card__header");
  assert.equal(popupInstances[0].content.children[0].className, "survey-observation-card__header");
  assert.deepEqual(cardShape(popupInstances[0].content), cardShape(tooltip.children[0]));
  const partialObservation = {
    lngLat: [34.8, 31.2],
    point: { x: 10, y: 20 },
    features: [
      {
        geometry: { type: "Point", coordinates: [34.8, 31.2] },
        properties: { question: "", neighborhood: "רמות", comment: "" },
      },
    ],
  };
  handlers["mousemove:community-survey-walkability-barrier"](partialObservation);
  handlers["click:community-survey-walkability-barrier"](partialObservation);
  assert.deepEqual(cardShape(popupInstances[1].content), cardShape(tooltip.children[0]));
  assert.equal(tooltip.children[0].children.length, 2);
  assert.equal(tooltip.children[0].children[1].className, "survey-observation-card__neighborhood");
  visibility["survey:walkability_barrier"] = false;
  overlay.syncVisibility();
  assert.equal(popupInstances[0].removed, true);
});

test("special point render plan prefers generated vectors in weighted mode", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    map: {
      getZoom: function () {
        return 14;
      },
    },
    hasGeneratedArtifact: function (artifactKey) {
      return artifactKey === "trees";
    },
    getCurrentMode: function () {
      return "house";
    },
    getScoreMode: function () {
      return "weighted";
    },
    urban95DetailPointsMinZoom: 13,
  });

  const plan = browser.window.Urban95MapRenderers.getSpecialPointRenderPlan({
    artifactKey: "trees",
    filterType: "trees",
    getWeightedToggle: function () {
      return true;
    },
    getData: function () {
      return {
        type: "FeatureCollection",
        features: [{ id: 1 }],
      };
    },
    getInRadiusIds: function () {
      return new Set([0]);
    },
    isOnlyFilter: function () {
      return false;
    },
  });

  assert.equal(plan.geojsonVisible, false);
  assert.equal(plan.vectorVisible, true);
  assert.equal(plan.features, null);
});

test("special point render plan clears weighted GeoJSON source when hidden without vector artifact", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  const data = {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { id: 1 } }],
  };

  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    map: {
      getZoom: function () {
        return 12;
      },
    },
    hasGeneratedArtifact: function () {
      return false;
    },
    getCurrentMode: function () {
      return "house";
    },
    getScoreMode: function () {
      return "weighted";
    },
    urban95DetailPointsMinZoom: 13,
  });

  const plan = browser.window.Urban95MapRenderers.getSpecialPointRenderPlan({
    artifactKey: "trees",
    filterType: "trees",
    getWeightedToggle: function () {
      return true;
    },
    getData: function () {
      return data;
    },
    getInRadiusIds: function () {
      return new Set([0]);
    },
    isOnlyFilter: function () {
      return false;
    },
  });

  assert.equal(plan.geojsonVisible, false);
  assert.equal(plan.vectorVisible, false);
  assert.equal(plan.features.type, "FeatureCollection");
  assert.equal(plan.features.features.length, 0);
});

test("special point render plan returns in-radius GeoJSON subset in expanded mode", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  const data = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { id: 1 } },
      { type: "Feature", properties: { id: 2 } },
      { type: "Feature", properties: { id: 3 } },
    ],
  };

  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    map: {
      getZoom: function () {
        return 12;
      },
    },
    hasGeneratedArtifact: function () {
      return false;
    },
    getCurrentMode: function () {
      return "house";
    },
    getScoreMode: function () {
      return "expanded";
    },
    urban95DetailPointsMinZoom: 13,
    getSelectedAmenityTypes: function () {
      return new Set(["parks", "trees"]);
    },
    getAllFilterTypes: function () {
      return ["parks", "trees", "street-lights"];
    },
  });

  const plan = browser.window.Urban95MapRenderers.getSpecialPointRenderPlan({
    artifactKey: "trees",
    filterType: "trees",
    getWeightedToggle: function () {
      return true;
    },
    getData: function () {
      return data;
    },
    getInRadiusIds: function () {
      return new Set([1, 2]);
    },
    isOnlyFilter: function () {
      return false;
    },
  });

  assert.equal(plan.geojsonVisible, true);
  assert.equal(plan.vectorVisible, false);
  assert.equal(plan.features.type, "FeatureCollection");
  assert.equal(plan.features.features.length, 2);
  assert.equal(plan.features.features[0], data.features[1]);
  assert.equal(plan.features.features[1], data.features[2]);
});

test("special point render plan respects tree and light toggles in expanded mode", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapRenderers.js", browser);
  let treeLayerVisible = false;

  const data = {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { id: 1 } }],
  };

  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    map: {
      getZoom: function () {
        return 12;
      },
    },
    hasGeneratedArtifact: function () {
      return false;
    },
    getCurrentMode: function () {
      return "house";
    },
    getScoreMode: function () {
      return "expanded";
    },
    urban95DetailPointsMinZoom: 13,
    getSelectedAmenityTypes: function () {
      return new Set(["trees"]);
    },
    getAllFilterTypes: function () {
      return ["trees", "street-lights"];
    },
    getLayerVisibility: function () {
      return { trees: treeLayerVisible };
    },
  });

  const plan = browser.window.Urban95MapRenderers.getSpecialPointRenderPlan({
    artifactKey: "trees",
    filterType: "trees",
    getWeightedToggle: function () {
      return false;
    },
    getData: function () {
      return data;
    },
    getInRadiusIds: function () {
      return new Set([0]);
    },
    isOnlyFilter: function () {
      return true;
    },
  });

  assert.equal(plan.geojsonVisible, true);
  assert.equal(plan.vectorVisible, false);
  assert.equal(plan.features.type, "FeatureCollection");
  assert.equal(plan.features.features.length, 0);
});

test("map renderers keep deck-update caller diagnostics on explicit, scheduled, and late deck-init paths", async () => {
  const timers = new Map();
  const timerOrder = [];
  let nextTimerId = 0;
  let idleCallback = null;
  const browser = createBrowserContext({
    setTimeout(callback, delay) {
      nextTimerId += 1;
      timers.set(nextTimerId, { callback, delay });
      timerOrder.push(nextTimerId);
      return nextTimerId;
    },
    clearTimeout(timerId) {
      timers.delete(timerId);
    },
  });
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  const counters = [];
  let visibleAmenityFeatures = [];
  let deckUpdateTimer = null;
  let deckAmenityOverlay = null;
  let resolveDeckLoaded;
  const deckLoaded = new Promise((resolve) => {
    resolveDeckLoaded = resolve;
  });
  const sources = {
    amenities: { setData() {} },
    trees: { setData() {} },
    "street-lights": { setData() {} },
  };
  browser.window.deck = {
    MapboxOverlay: function MapboxOverlay(options) {
      this.options = options;
      this.setProps = function (props) {
        this.props = props;
      };
    },
  };

  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    urban95Perf: {
      counter(name, meta) {
        counters.push({ name, meta: typeof meta === "function" ? meta() : meta });
      },
      phase(_name, callback) {
        return callback();
      },
      span(_name, _meta, callback) {
        return callback();
      },
    },
    map: {
      getLayer() {
        return null;
      },
      setLayoutProperty() {},
      getSource(id) {
        return sources[id] || null;
      },
      getZoom() {
        return 14;
      },
      getCanvas() {
        return { style: {} };
      },
      addControl() {},
      on() {},
      once(eventName, callback) {
        if (eventName === "idle") idleCallback = callback;
      },
    },
    tooltipEl: { style: {}, textContent: "" },
    treeLayerIds: [],
    streetLightLayerIds: [],
    treesAndLightsLayerIds: [],
    hasGeneratedArtifact() {
      return false;
    },
    getCurrentMode() {
      return "house";
    },
    getScoreMode() {
      return "expanded";
    },
    urban95DetailPointsMinZoom: 13,
    amenityClusterMinZoom: 13,
    amenityClusterMaxCount: 9,
    getSelectedAmenityTypes() {
      return new Set(["parks"]);
    },
    getAllFilterTypes() {
      return ["parks", "trees", "street-lights"];
    },
    getVisibleAmenityFeatures() {
      return visibleAmenityFeatures;
    },
    setVisibleAmenityFeatures(value) {
      visibleAmenityFeatures = value;
    },
    getAllAmenitiesData() {
      return {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { amenity_type: "parks" } }],
      };
    },
    getAmenitiesInRadiusIds() {
      return new Set([0]);
    },
    getAllTreesData() {
      return { type: "FeatureCollection", features: [] };
    },
    getTreesInRadiusIds() {
      return new Set();
    },
    getAllStreetLightsData() {
      return { type: "FeatureCollection", features: [] };
    },
    getStreetLightsInRadiusIds() {
      return new Set();
    },
    getDeckAmenityOverlay() {
      return deckAmenityOverlay;
    },
    setDeckAmenityOverlay(value) {
      deckAmenityOverlay = value;
    },
    setDeckHovering() {},
    getDeckHovering() {
      return false;
    },
    ensureDeckGlLoaded() {
      return deckLoaded;
    },
    getDeckUpdateTimer() {
      return deckUpdateTimer;
    },
    setDeckUpdateTimer(value) {
      deckUpdateTimer = value;
    },
  });

  browser.window.Urban95MapRenderers.applyShowPointsToggle();
  const beforeSyncCounters = counters.length;
  browser.window.Urban95MapRenderers.syncPointLayerVisibility();
  const syncCounters = counters.slice(beforeSyncCounters).filter(
    (entry) => entry.name === "renderer:updateDeckAmenityLayers:start"
  );
  assert.equal(syncCounters.length, 0);
  const beforeDeckInitCounters = counters.length;
  browser.window.Urban95MapRenderers.updateAmenitiesSource();
  const initPendingCounters = counters.slice(beforeDeckInitCounters).filter(
    (entry) => entry.name === "renderer:deckAmenityLayers" && entry.meta && entry.meta.branch === "initPending"
  );
  assert.equal(initPendingCounters.length, 1);
  const sourceStartCounter = counters.find(
    (entry) => entry.name === "renderer:updateAmenitiesSource:start"
  );
  assert.equal(sourceStartCounter.meta.caller, "direct");
  assert.equal(sourceStartCounter.meta.visibleFeatures, 0);
  assert.equal(sourceStartCounter.meta.radiusFilterActive, true);
  assert.equal(deckAmenityOverlay, null);
  resolveDeckLoaded();
  await deckLoaded;
  await Promise.resolve();
  browser.window.Urban95MapRenderers.scheduleDeckUpdate("moveend");
  const moveendScheduleCounter = counters.find(
    (entry) => entry.name === "renderer:scheduleDeckUpdate" && entry.meta.reason === "moveend"
  );
  assert.equal(moveendScheduleCounter.meta.scoreMode, "expanded");
  assert.equal(moveendScheduleCounter.meta.mode, "house");
  assert.equal(moveendScheduleCounter.meta.visibleFeatures, 1);
  assert.equal(moveendScheduleCounter.meta.replacedPending, false);
  const firstTimer = runQueuedTimer(timers, timerOrder, (timer) => timer.delay === 80);
  assert.ok(firstTimer != null);
  assert.equal(firstTimer.delay, 80);
  assert.equal(
    counters.filter((entry) => entry.name === "renderer:scheduleDeckUpdate:execute").length,
    0
  );
  assert.equal(typeof idleCallback, "function");
  idleCallback();
  assert.ok(
    counters.some(
      (entry) =>
        entry.name === "renderer:scheduleDeckUpdate:execute" &&
        entry.meta.reason === "moveend" &&
        entry.meta.scoreMode === "expanded" &&
        entry.meta.visibleFeatures === 1
    )
  );
  browser.window.Urban95MapRenderers.scheduleDeckUpdate("zoomend");
  const secondTimer = runQueuedTimer(timers, timerOrder, (timer) => timer.delay === 80);
  assert.ok(secondTimer != null);
  assert.equal(
    counters.filter((entry) => entry.name === "renderer:scheduleDeckUpdate:execute").length,
    1
  );
  idleCallback();

  const deckCounters = counters.filter(
    (entry) => entry.name === "renderer:updateDeckAmenityLayers:start"
  );
  assert.ok(deckCounters.length >= 3);
  assert.ok(deckCounters.some((entry) => entry.meta && entry.meta.caller === "applyShowPointsToggle"));
  assert.ok(deckCounters.some((entry) => entry.meta && entry.meta.caller === "updateAmenitiesSource"));
  assert.ok(
    deckCounters.some(
      (entry) =>
        entry.meta &&
        entry.meta.caller === "ensureDeckGlLoaded" &&
        entry.meta.scoreMode === "expanded" &&
        entry.meta.mode === "house"
    )
  );
  assert.ok(
    counters.some(
      (entry) =>
        entry.name === "renderer:scheduleDeckUpdate:skip" &&
        entry.meta &&
        entry.meta.reason === "moveend"
    )
  );
  assert.ok(
    counters.some(
      (entry) =>
        entry.name === "renderer:scheduleDeckUpdate:skip" &&
        entry.meta &&
        entry.meta.reason === "zoomend"
    )
  );
});

test("map renderers updateAmenitiesSource records caller and transaction diagnostics", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  const counters = [];
  let visibleAmenityFeatures = [];
  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    urban95Perf: {
      counter(name, meta) {
        counters.push({ name, meta: typeof meta === "function" ? meta() : meta });
      },
      phase(_name, callback) {
        return callback();
      },
      span(_name, _meta, callback) {
        return callback();
      },
    },
    map: {
      getSource(id) {
        return id === "amenities" ? { setData() {} } : null;
      },
      getZoom() {
        return 16;
      },
      getCanvas() {
        return { style: {} };
      },
    },
    getCurrentMode() {
      return "house";
    },
    getScoreMode() {
      return "expanded";
    },
    getSelectedAmenityTypes() {
      return new Set(["parks"]);
    },
    getAllFilterTypes() {
      return ["parks"];
    },
    getAllAmenitiesData() {
      return {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { amenity_type: "parks" }, geometry: { type: "Point", coordinates: [0, 0] } },
        ],
      };
    },
    getAmenitiesInRadiusIds() {
      return new Set([0]);
    },
    getVisibleAmenityFeatures() {
      return visibleAmenityFeatures;
    },
    setVisibleAmenityFeatures(value) {
      visibleAmenityFeatures = value;
    },
    getDeckAmenityOverlay() {
      return null;
    },
    setDeckHovering() {},
    ensureDeckGlLoaded() {
      return new Promise(() => {});
    },
    amenityClusterMinZoom: 13,
    amenityClusterMaxCount: 9,
  });

  browser.window.Urban95MapRenderers.updateAmenitiesSource({
    caller: "selection:pointSourceRefresh",
    selectionTransactionId: 12,
    selectedBuildingId: 87,
  });

  const start = counters.find((entry) => entry.name === "renderer:updateAmenitiesSource:start");
  const end = counters.find((entry) => entry.name === "renderer:updateAmenitiesSource:end");
  assert.equal(start.meta.caller, "selection:pointSourceRefresh");
  assert.equal(start.meta.selectionTransactionId, 12);
  assert.equal(start.meta.selectedBuildingId, 87);
  assert.equal(start.meta.radiusFilterActive, true);
  assert.equal(end.meta.caller, "selection:pointSourceRefresh");
  assert.equal(end.meta.allFeatures, 1);
  assert.equal(end.meta.visibleFeatures, 1);
});

test("map renderers can defer deck updates while keeping amenity source data and visible features fresh", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  const counters = [];
  const sourceSets = [];
  let visibleAmenityFeatures = [];
  let overlaySetPropsCount = 0;
  const sources = {
    amenities: {
      setData(data) {
        sourceSets.push(data);
      },
    },
  };

  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    urban95Perf: {
      counter(name, meta) {
        counters.push({ name, meta: typeof meta === "function" ? meta() : meta });
      },
      phase(_name, callback) {
        return callback();
      },
      span(_name, _meta, callback) {
        return callback();
      },
    },
    map: {
      getSource(id) {
        return sources[id] || null;
      },
      getZoom() {
        return 16;
      },
      getCanvas() {
        return { width: 1200, height: 800, style: {} };
      },
      getCenter() {
        return { lng: 34.79, lat: 31.25 };
      },
      getBearing() {
        return 0;
      },
      getPitch() {
        return 0;
      },
    },
    getCurrentMode() {
      return "house";
    },
    getScoreMode() {
      return "expanded";
    },
    getSelectedAmenityTypes() {
      return new Set(["parks"]);
    },
    getAllFilterTypes() {
      return ["parks", "trees", "street-lights"];
    },
    getAllAmenitiesData() {
      return {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { amenity_type: "parks", name: "Playground A" },
            geometry: { type: "Point", coordinates: [34.79, 31.25] },
          },
          {
            type: "Feature",
            properties: { amenity_type: "parks", name: "Playground B" },
            geometry: { type: "Point", coordinates: [34.8, 31.26] },
          },
        ],
      };
    },
    getAmenitiesInRadiusIds() {
      return new Set([1]);
    },
    getVisibleAmenityFeatures() {
      return visibleAmenityFeatures;
    },
    setVisibleAmenityFeatures(value) {
      visibleAmenityFeatures = value;
    },
    getDeckAmenityOverlay() {
      return {
        setProps() {
          overlaySetPropsCount += 1;
        },
      };
    },
    setDeckHovering() {},
    getDeckHovering() {
      return false;
    },
    getAmenityConfig() {
      return { label: "Parks", color: "#2563eb" };
    },
    amenityClusterMinZoom: 13,
    amenityClusterDissolveZoom: 18,
    amenityClusterPixelRadius: 40,
    amenityClusterMaxCount: 9,
  });

  browser.window.Urban95MapRenderers.updateAmenitiesSource({
    caller: "selection:pointSourceRefresh",
    selectionTransactionId: 44,
    selectedBuildingId: 87,
    deferDeckRender: true,
  });

  assert.equal(sourceSets.length, 1);
  assert.equal(sourceSets[0].features.length, 2);
  assert.equal(visibleAmenityFeatures.length, 2);
  assert.equal(visibleAmenityFeatures[0].properties._inRadius, false);
  assert.equal(visibleAmenityFeatures[1].properties._inRadius, true);
  assert.equal(overlaySetPropsCount, 0);
  assert.ok(
    counters.some(
      (entry) =>
        entry.name === "renderer:updateAmenitiesSource:end" &&
        entry.meta &&
        entry.meta.branch === "visible" &&
        entry.meta.visibleFeatures === 2
    )
  );
});

test("map renderers clear existing deck layers when the amenity points toggle turns off", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  let showAmenityPointsChecked = true;
  const overlay = {
    propsHistory: [],
    setProps(props) {
      this.propsHistory.push(props);
      this.props = props;
    },
  };

  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    urban95Perf: {
      counter() {},
      phase(_name, callback) {
        return callback();
      },
      span(_name, _meta, callback) {
        return callback();
      },
    },
    map: {
      getZoom() {
        return 16;
      },
      project(coordinates) {
        return { x: coordinates[0] * 1000, y: coordinates[1] * 1000 };
      },
      getCanvas() {
        return { width: 1200, height: 800, style: {} };
      },
      getCenter() {
        return { lng: 34.79, lat: 31.25 };
      },
      getBearing() {
        return 0;
      },
      getPitch() {
        return 0;
      },
    },
    tooltipEl: { style: {}, textContent: "" },
    getCurrentMode() {
      return "house";
    },
    getScoreMode() {
      return "expanded";
    },
    getSelectedAmenityTypes() {
      return new Set(["parks"]);
    },
    getVisibleAmenityFeatures() {
      return [
        {
          type: "Feature",
          properties: { amenity_type: "parks", _inRadius: true },
          geometry: { type: "Point", coordinates: [34.79, 31.25] },
        },
      ];
    },
    getDeckAmenityOverlay() {
      return overlay;
    },
    getDeckHovering() {
      return false;
    },
    setDeckHovering() {},
    getAmenityConfig() {
      return { label: "Parks", color: "#2563eb" };
    },
    getLayerVisibility() {
      return { amenities: showAmenityPointsChecked };
    },
    amenityClusterMinZoom: 13,
    amenityClusterDissolveZoom: 18,
    amenityClusterPixelRadius: 40,
    amenityClusterMaxCount: 9,
  });

  browser.window.deck = makeDeckLayerConstructors([]);
  installFakeCanvas(browser.window.document);

  browser.window.Urban95MapRenderers.updateDeckAmenityLayers({ caller: "initial" });
  assert.ok(Array.isArray(overlay.props.layers));
  assert.equal(overlay.props.layers.length, 2);

  showAmenityPointsChecked = false;
  browser.window.Urban95MapRenderers.updateDeckAmenityLayers({ caller: "toggleOff" });

  assert.ok(Array.isArray(overlay.propsHistory[overlay.propsHistory.length - 1].layers));
  assert.equal(overlay.propsHistory[overlay.propsHistory.length - 1].layers.length, 0);
});

test("map renderers clear existing deck layers when house render gating becomes false", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  let currentMode = "house";
  let zoom = 16;
  const overlay = {
    propsHistory: [],
    setProps(props) {
      this.propsHistory.push(props);
      this.props = props;
    },
  };

  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    urban95Perf: {
      counter() {},
      phase(_name, callback) {
        return callback();
      },
      span(_name, _meta, callback) {
        return callback();
      },
    },
    map: {
      getZoom() {
        return zoom;
      },
      project(coordinates) {
        return { x: coordinates[0] * 1000, y: coordinates[1] * 1000 };
      },
      getCanvas() {
        return { width: 1200, height: 800, style: {} };
      },
      getCenter() {
        return { lng: 34.79, lat: 31.25 };
      },
      getBearing() {
        return 0;
      },
      getPitch() {
        return 0;
      },
    },
    tooltipEl: { style: {}, textContent: "" },
    getCurrentMode() {
      return currentMode;
    },
    getScoreMode() {
      return "expanded";
    },
    getSelectedAmenityTypes() {
      return new Set(["parks"]);
    },
    getVisibleAmenityFeatures() {
      return [
        {
          type: "Feature",
          properties: { amenity_type: "parks", _inRadius: true },
          geometry: { type: "Point", coordinates: [34.79, 31.25] },
        },
      ];
    },
    getDeckAmenityOverlay() {
      return overlay;
    },
    getDeckHovering() {
      return false;
    },
    setDeckHovering() {},
    getAmenityConfig() {
      return { label: "Parks", color: "#2563eb" };
    },
    amenityClusterMinZoom: 13,
    amenityClusterDissolveZoom: 18,
    amenityClusterPixelRadius: 40,
    amenityClusterMaxCount: 9,
  });

  browser.window.deck = makeDeckLayerConstructors([]);
  installFakeCanvas(browser.window.document);

  browser.window.Urban95MapRenderers.updateDeckAmenityLayers({ caller: "initial" });
  assert.equal(overlay.props.layers.length, 2);

  currentMode = "neighborhood";
  browser.window.Urban95MapRenderers.updateDeckAmenityLayers({ caller: "modeChange" });
  assert.ok(Array.isArray(overlay.propsHistory[overlay.propsHistory.length - 1].layers));
  assert.equal(overlay.propsHistory[overlay.propsHistory.length - 1].layers.length, 0);

  currentMode = "house";
  browser.window.Urban95MapRenderers.updateDeckAmenityLayers({ caller: "rerender" });
  assert.equal(overlay.props.layers.length, 2);

  zoom = 12;
  browser.window.Urban95MapRenderers.updateDeckAmenityLayers({ caller: "zoomHidden" });
  assert.ok(Array.isArray(overlay.propsHistory[overlay.propsHistory.length - 1].layers));
  assert.equal(overlay.propsHistory[overlay.propsHistory.length - 1].layers.length, 0);
});

function makeDeckLayerConstructors(layerConstructs) {
  return {
    IconLayer: function IconLayer(options) {
      layerConstructs.push({ type: "IconLayer", options });
      this.options = options;
    },
    TextLayer: function TextLayer(options) {
      layerConstructs.push({ type: "TextLayer", options });
      this.options = options;
    },
  };
}

function installFakeCanvas(documentRef) {
  const originalCreateElement = documentRef.createElement.bind(documentRef);
  documentRef.createElement = function createElement(tagName) {
    const element = originalCreateElement(tagName);
    if (String(tagName).toLowerCase() === "canvas") {
      element.getContext = function getContext() {
        return {
          save() {},
          restore() {},
          beginPath() {},
          rect() {},
          clip() {},
          arc() {},
          fill() {},
          moveTo() {},
          closePath() {},
          stroke() {},
        };
      };
    }
    return element;
  };
}

test("map renderers reuse amenity icon atlas when exact icon key set repeats", () => {
  const browser = createBrowserContext();
  installFakeCanvas(browser.window.document);
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  const counters = [];
  const spans = [];
  const layerConstructs = [];
  let visibleAmenityFeatures = [
    {
      type: "Feature",
      properties: { amenity_type: "parks", _inRadius: true },
      geometry: { type: "Point", coordinates: [34.79, 31.25] },
    },
  ];
  const overlay = {
    propsHistory: [],
    setProps(props) {
      this.propsHistory.push(props);
      this.props = props;
    },
  };
  const sources = {
    amenities: {
      setData() {},
    },
  };

  browser.window.deck = makeDeckLayerConstructors(layerConstructs);
  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    urban95Perf: {
      counter(name, meta) {
        counters.push({ name, meta: typeof meta === "function" ? meta() : meta });
      },
      phase(_name, callback) {
        return callback();
      },
      span(name, meta, callback) {
        const result = callback();
        spans.push({ name, meta: typeof meta === "function" ? meta() : meta });
        return result;
      },
    },
    map: {
      getZoom() {
        return 16;
      },
      project() {
        return { x: 100, y: 100 };
      },
      getCanvas() {
        return { width: 1440, height: 1100, style: {} };
      },
      getCenter() {
        return { lng: 34.79, lat: 31.25 };
      },
      getBearing() {
        return 0;
      },
      getPitch() {
        return 0;
      },
    },
    tooltipEl: { style: {}, textContent: "" },
    getCurrentMode() {
      return "house";
    },
    getScoreMode() {
      return "expanded";
    },
    getSelectedAmenityTypes() {
      return new Set(["parks"]);
    },
    getVisibleAmenityFeatures() {
      return visibleAmenityFeatures;
    },
    getDeckAmenityOverlay() {
      return overlay;
    },
    getDeckHovering() {
      return false;
    },
    setDeckHovering() {},
    getAmenityConfig() {
      return { label: "Parks", color: "#2563eb" };
    },
    amenityClusterMinZoom: 13,
    amenityClusterDissolveZoom: 18,
    amenityClusterPixelRadius: 40,
    amenityClusterMaxCount: 9,
  });

  browser.window.Urban95MapRenderers.updateDeckAmenityLayers({ caller: "first" });
  const firstAtlas = overlay.props.layers[0].options.iconAtlas;
  const firstMapping = overlay.props.layers[0].options.iconMapping;
  const firstIconLayer = overlay.props.layers[0];

  visibleAmenityFeatures = [
    {
      type: "Feature",
      properties: { amenity_type: "parks", _inRadius: true },
      geometry: { type: "Point", coordinates: [34.8, 31.26] },
    },
  ];
  browser.window.Urban95MapRenderers.updateDeckAmenityLayers({ caller: "second" });

  assert.equal(overlay.propsHistory.length, 2);
  assert.notEqual(overlay.props.layers[0].options.data[0].position[0], 34.79);
  assert.equal(overlay.props.layers[0].options.iconAtlas, firstAtlas);
  assert.equal(overlay.props.layers[0].options.iconMapping, firstMapping);
  assert.equal(firstIconLayer.options.getIcon(firstIconLayer.options.data[0]), "parks:1|1|0|1");
  assert.equal(
    overlay.props.layers[0].options.getIcon(overlay.props.layers[0].options.data[0]),
    "parks:1|1|0|1"
  );
  assert.equal(
    spans.filter(function (entry) {
      return entry.name === "renderer:buildAmenityIconAtlas";
    }).length,
    2
  );
  assert.ok(counters.some((entry) => entry.name === "renderer:amenityIconAtlas:cacheHit"));
  assert.ok(counters.some((entry) => entry.name === "renderer:amenityIconAtlas:cacheMiss"));
});

test("map renderers keep cluster data fresh when reused atlas keys stay the same", () => {
  const browser = createBrowserContext();
  installFakeCanvas(browser.window.document);
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  const layerConstructs = [];
  const tooltipEl = { style: {}, textContent: "" };
  let fitBoundsArgs = null;
  let visibleAmenityFeatures = [
    {
      type: "Feature",
      properties: { amenity_type: "parks", _inRadius: true, name: "First A" },
      geometry: { type: "Point", coordinates: [34.79, 31.25] },
    },
    {
      type: "Feature",
      properties: { amenity_type: "parks", _inRadius: true, name: "First B" },
      geometry: { type: "Point", coordinates: [34.79001, 31.25001] },
    },
  ];
  const overlay = {
    setProps(props) {
      this.props = props;
    },
  };

  browser.window.deck = makeDeckLayerConstructors(layerConstructs);
  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    urban95Perf: {
      counter() {},
      phase(_name, callback) { return callback(); },
      span(_name, _meta, callback) { return callback(); },
    },
    map: {
      getZoom() { return 16; },
      project(coordinates) { return { x: coordinates[0] * 1000, y: coordinates[1] * 1000 }; },
      getCanvas() { return { width: 1440, height: 1100, style: {} }; },
      getCenter() { return { lng: 34.79, lat: 31.25 }; },
      getBearing() { return 0; },
      getPitch() { return 0; },
      fitBounds(bounds, options) { fitBoundsArgs = { bounds, options }; },
      once(_eventName, callback) { callback(); },
      easeTo() {},
    },
    tooltipEl,
    getCurrentMode() { return "house"; },
    getScoreMode() { return "expanded"; },
    getSelectedAmenityTypes() { return new Set(["parks"]); },
    getVisibleAmenityFeatures() { return visibleAmenityFeatures; },
    getDeckAmenityOverlay() { return overlay; },
    getDeckHovering() { return false; },
    setDeckHovering() {},
    setLastDeckClickTime() {},
    getAmenityConfig() { return { label: "Parks", color: "#2563eb" }; },
    amenityClusterMinZoom: 13,
    amenityClusterDissolveZoom: 18,
    amenityClusterPixelRadius: 40,
    amenityClusterMaxCount: 9,
  });

  browser.window.Urban95MapRenderers.updateDeckAmenityLayers({ caller: "first" });
  const firstAtlas = overlay.props.layers[0].options.iconAtlas;

  visibleAmenityFeatures = [
    {
      type: "Feature",
      properties: { amenity_type: "parks", _inRadius: true, name: "Second A" },
      geometry: { type: "Point", coordinates: [34.8, 31.26] },
    },
    {
      type: "Feature",
      properties: { amenity_type: "parks", _inRadius: true, name: "Second B" },
      geometry: { type: "Point", coordinates: [34.80001, 31.26001] },
    },
  ];
  browser.window.Urban95MapRenderers.updateDeckAmenityLayers({ caller: "second" });

  const iconLayer = overlay.props.layers[0];
  const textLayer = overlay.props.layers[1];
  const cluster = iconLayer.options.data[0];
  assert.equal(iconLayer.options.iconAtlas, firstAtlas);
  assert.equal(iconLayer.options.getIcon(cluster), "parks:2|1|1|2");
  assert.equal(textLayer.options.data[0], cluster);
  assert.equal(textLayer.options.getText(cluster), "2");
  assert.equal(JSON.stringify(cluster.sampleNames), JSON.stringify(["Second A", "Second B"]));
  assert.equal(JSON.stringify(cluster.members), JSON.stringify([[34.8, 31.26], [34.80001, 31.26001]]));

  iconLayer.options.onHover({ object: cluster, x: 10, y: 20 });
  assert.match(tooltipEl.textContent, /Second A/);

  iconLayer.options.onClick({ object: cluster });
  assert.ok(fitBoundsArgs);
  assert.equal(JSON.stringify(fitBoundsArgs.bounds), JSON.stringify([[34.8, 31.26], [34.80001, 31.26001]]));
});

test("map renderers rebuild amenity icon atlas when exact icon key set changes", () => {
  const browser = createBrowserContext();
  installFakeCanvas(browser.window.document);
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  const spans = [];
  let visibleAmenityFeatures = [
    {
      type: "Feature",
      properties: { amenity_type: "parks", _inRadius: true },
      geometry: { type: "Point", coordinates: [34.79, 31.25] },
    },
  ];
  const overlay = {
    setProps(props) {
      this.props = props;
    },
  };
  browser.window.deck = makeDeckLayerConstructors([]);
  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    urban95Perf: {
      counter() {},
      phase(_name, callback) {
        return callback();
      },
      span(name, meta, callback) {
        const result = callback();
        spans.push({ name, meta: typeof meta === "function" ? meta() : meta });
        return result;
      },
    },
    map: {
      getZoom() {
        return 16;
      },
      project() {
        return { x: 100, y: 100 };
      },
      getCanvas() {
        return { width: 1440, height: 1100, style: {} };
      },
      getCenter() {
        return { lng: 34.79, lat: 31.25 };
      },
      getBearing() {
        return 0;
      },
      getPitch() {
        return 0;
      },
    },
    tooltipEl: { style: {}, textContent: "" },
    getCurrentMode() {
      return "house";
    },
    getScoreMode() {
      return "expanded";
    },
    getSelectedAmenityTypes() {
      return new Set(["parks", "schools"]);
    },
    getVisibleAmenityFeatures() {
      return visibleAmenityFeatures;
    },
    getDeckAmenityOverlay() {
      return overlay;
    },
    getDeckHovering() {
      return false;
    },
    setDeckHovering() {},
    getAmenityConfig(type) {
      return { label: type, color: type === "schools" ? "#dc2626" : "#2563eb" };
    },
    amenityClusterMinZoom: 13,
    amenityClusterDissolveZoom: 18,
    amenityClusterPixelRadius: 40,
    amenityClusterMaxCount: 9,
  });

  browser.window.Urban95MapRenderers.updateDeckAmenityLayers({ caller: "first" });
  const firstAtlas = overlay.props.layers[0].options.iconAtlas;

  visibleAmenityFeatures = [
    {
      type: "Feature",
      properties: { amenity_type: "schools", _inRadius: true },
      geometry: { type: "Point", coordinates: [34.8, 31.26] },
    },
  ];
  browser.window.Urban95MapRenderers.updateDeckAmenityLayers({ caller: "second" });

  assert.notEqual(overlay.props.layers[0].options.iconAtlas, firstAtlas);
  assert.equal(
    spans.filter(function (entry) {
      return entry.name === "renderer:buildAmenityIconAtlas";
    }).length,
    2
  );
});

test("map renderers skip duplicate scheduled deck updates when render state is unchanged", () => {
  const timers = new Map();
  const timerOrder = [];
  let nextTimerId = 0;
  let idleCallback = null;
  const browser = createBrowserContext({
    setTimeout(callback, delay) {
      nextTimerId += 1;
      timers.set(nextTimerId, { callback, delay });
      timerOrder.push(nextTimerId);
      return nextTimerId;
    },
    clearTimeout(timerId) {
      timers.delete(timerId);
    },
  });
  installFakeCanvas(browser.window.document);
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  const counters = [];
  const spans = [];
  let zoom = 16;
  let center = { lng: 34.79, lat: 31.25 };
  let allAmenitiesData = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { amenity_type: "parks", name: "First A" },
        geometry: { type: "Point", coordinates: [34.79, 31.25] },
      },
      {
        type: "Feature",
        properties: { amenity_type: "parks", name: "First B" },
        geometry: { type: "Point", coordinates: [34.79001, 31.25001] },
      },
    ],
  };
  let amenitiesInRadiusIds = new Set([0]);
  let visibleAmenityFeatures = [];
  const overlay = {
    propsHistory: [],
    setProps(props) {
      this.propsHistory.push(props);
      this.props = props;
    },
  };
  const sources = {
    amenities: {
      setData() {},
    },
  };

  browser.window.deck = makeDeckLayerConstructors([]);
  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    urban95Perf: {
      counter(name, meta) {
        counters.push({ name, meta: typeof meta === "function" ? meta() : meta });
      },
      phase(_name, callback) {
        return callback();
      },
      span(name, meta, callback) {
        const result = callback();
        spans.push({ name, meta: typeof meta === "function" ? meta() : meta });
        return result;
      },
    },
    map: {
      getSource(id) {
        return sources[id] || null;
      },
      getZoom() {
        return zoom;
      },
      project(coordinates) {
        return { x: coordinates[0] * 1000, y: coordinates[1] * 1000 };
      },
      getCanvas() {
        return { width: 1440, height: 1100, style: {} };
      },
      getCenter() {
        return center;
      },
      getBearing() {
        return 0;
      },
      getPitch() {
        return 0;
      },
      once(eventName, callback) {
        if (eventName === "idle") idleCallback = callback;
      },
    },
    tooltipEl: { style: {}, textContent: "" },
    getCurrentMode() {
      return "house";
    },
    getScoreMode() {
      return "expanded";
    },
    getSelectedAmenityTypes() {
      return new Set(["parks"]);
    },
    getAllFilterTypes() {
      return ["parks", "trees", "street-lights"];
    },
    getAllAmenitiesData() {
      return allAmenitiesData;
    },
    getAmenitiesInRadiusIds() {
      return amenitiesInRadiusIds;
    },
    getVisibleAmenityFeatures() {
      return visibleAmenityFeatures;
    },
    setVisibleAmenityFeatures(value) {
      visibleAmenityFeatures = value;
    },
    getDeckAmenityOverlay() {
      return overlay;
    },
    getDeckHovering() {
      return false;
    },
    setDeckHovering() {},
    getAmenityConfig() {
      return { label: "Parks", color: "#2563eb" };
    },
    getDeckUpdateTimer() {
      return null;
    },
    setDeckUpdateTimer() {},
    amenityClusterMinZoom: 13,
    amenityClusterDissolveZoom: 18,
    amenityClusterPixelRadius: 40,
    amenityClusterMaxCount: 9,
  });

  browser.window.Urban95MapRenderers.updateAmenitiesSource({ caller: "initial" });
  const initialPropsCount = overlay.propsHistory.length;
  const initialClusterSpanCount = spans.filter((entry) => entry.name === "renderer:clusterVisibleAmenities").length;

  browser.window.Urban95MapRenderers.scheduleDeckUpdate("moveend");
  assert.ok(runQueuedTimer(timers, timerOrder, (timer) => timer.delay === 80));
  assert.equal(overlay.propsHistory.length, initialPropsCount);
  assert.equal(typeof idleCallback, "function");
  idleCallback();

  assert.equal(overlay.propsHistory.length, initialPropsCount);
  assert.equal(
    spans.filter((entry) => entry.name === "renderer:clusterVisibleAmenities").length,
    initialClusterSpanCount
  );
  assert.ok(
    counters.some(
      (entry) =>
        entry.name === "renderer:scheduleDeckUpdate:skip" &&
        entry.meta &&
        entry.meta.reason === "moveend"
    )
  );

  center = { lng: 34.791, lat: 31.251 };
  browser.window.Urban95MapRenderers.scheduleDeckUpdate("zoomend");
  assert.ok(runQueuedTimer(timers, timerOrder, (timer) => timer.delay === 80));
  idleCallback();
  assert.equal(overlay.propsHistory.length, initialPropsCount + 1);

  allAmenitiesData = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { amenity_type: "parks", name: "Second A" },
        geometry: { type: "Point", coordinates: [34.8, 31.26] },
      },
      {
        type: "Feature",
        properties: { amenity_type: "parks", name: "Second B" },
        geometry: { type: "Point", coordinates: [34.80001, 31.26001] },
      },
    ],
  };
  amenitiesInRadiusIds = new Set([0, 1]);
  browser.window.Urban95MapRenderers.updateAmenitiesSource({
    caller: "selection:pointSourceRefresh",
    deferDeckRender: true,
  });
  browser.window.Urban95MapRenderers.scheduleDeckUpdate("moveend");
  assert.ok(runQueuedTimer(timers, timerOrder, (timer) => timer.delay === 80));
  idleCallback();
  assert.equal(overlay.propsHistory.length, initialPropsCount + 2);
});

test("map renderers coalesce camera deck schedules until idle and keep non-camera schedules timer-driven", () => {
  const timers = new Map();
  const timerOrder = [];
  let nextTimerId = 0;
  const idleCallbacks = [];
  const browser = createBrowserContext({
    setTimeout(callback, delay) {
      nextTimerId += 1;
      timers.set(nextTimerId, { callback, delay });
      timerOrder.push(nextTimerId);
      return nextTimerId;
    },
    clearTimeout(timerId) {
      timers.delete(timerId);
    },
  });
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  const counters = [];
  let visibleAmenityFeatures = [{ id: 1 }];
  let deckUpdateTimer = null;
  let deckAmenityOverlay = {
    setProps() {},
  };

  browser.window.deck = makeDeckLayerConstructors([]);
  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    urban95Perf: {
      counter(name, meta) {
        counters.push({ name, meta: typeof meta === "function" ? meta() : meta });
      },
      phase(_name, callback) {
        return callback();
      },
      span(_name, _meta, callback) {
        return callback();
      },
    },
    map: {
      getLayer() {
        return null;
      },
      setLayoutProperty() {},
      getSource() {
        return { setData() {} };
      },
      getZoom() {
        return 14;
      },
      getCanvas() {
        return { style: {} };
      },
      addControl() {},
      on() {},
      once(eventName, callback) {
        if (eventName === "idle") idleCallbacks.push(callback);
      },
    },
    tooltipEl: { style: {}, textContent: "" },
    treeLayerIds: [],
    streetLightLayerIds: [],
    treesAndLightsLayerIds: [],
    hasGeneratedArtifact() {
      return false;
    },
    getCurrentMode() {
      return "house";
    },
    getScoreMode() {
      return "expanded";
    },
    urban95DetailPointsMinZoom: 13,
    amenityClusterMinZoom: 13,
    amenityClusterMaxCount: 9,
    getSelectedAmenityTypes() {
      return new Set(["parks"]);
    },
    getAllFilterTypes() {
      return ["parks"];
    },
    getVisibleAmenityFeatures() {
      return visibleAmenityFeatures;
    },
    setVisibleAmenityFeatures(value) {
      visibleAmenityFeatures = value;
    },
    getAllAmenitiesData() {
      return {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { amenity_type: "parks" } }],
      };
    },
    getAmenitiesInRadiusIds() {
      return new Set([0]);
    },
    getAllTreesData() {
      return { type: "FeatureCollection", features: [] };
    },
    getTreesInRadiusIds() {
      return new Set();
    },
    getAllStreetLightsData() {
      return { type: "FeatureCollection", features: [] };
    },
    getStreetLightsInRadiusIds() {
      return new Set();
    },
    getDeckAmenityOverlay() {
      return deckAmenityOverlay;
    },
    setDeckAmenityOverlay(value) {
      deckAmenityOverlay = value;
    },
    setDeckHovering() {},
    getDeckHovering() {
      return false;
    },
    ensureDeckGlLoaded() {
      return Promise.resolve();
    },
    getDeckUpdateTimer() {
      return deckUpdateTimer;
    },
    setDeckUpdateTimer(value) {
      deckUpdateTimer = value;
    },
  });

  browser.window.Urban95MapRenderers.scheduleDeckUpdate("moveend");
  assert.ok(runQueuedTimer(timers, timerOrder, (timer) => timer.delay === 80));
  assert.equal(
    counters.filter((entry) => entry.name === "renderer:scheduleDeckUpdate:execute").length,
    0
  );
  browser.window.Urban95MapRenderers.scheduleDeckUpdate("zoomend");
  assert.ok(runQueuedTimer(timers, timerOrder, (timer) => timer.delay === 80));
  assert.equal(
    counters.filter((entry) => entry.name === "renderer:scheduleDeckUpdate:execute").length,
    0
  );

  assert.equal(idleCallbacks.length, 2);
  idleCallbacks.shift()();
  assert.equal(
    counters.filter((entry) => entry.name === "renderer:scheduleDeckUpdate:execute").length,
    0
  );
  idleCallbacks.shift()();
  const executeCounters = counters.filter((entry) => entry.name === "renderer:scheduleDeckUpdate:execute");
  assert.equal(executeCounters.length, 1);
  assert.equal(executeCounters[0].meta.reason, "zoomend");

  browser.window.Urban95MapRenderers.scheduleDeckUpdate("selection:settled");
  assert.ok(runQueuedTimer(timers, timerOrder, (timer) => timer.delay === 80));
  const finalExecuteCounters = counters.filter((entry) => entry.name === "renderer:scheduleDeckUpdate:execute");
  assert.equal(finalExecuteCounters.length, 2);
  assert.equal(finalExecuteCounters[1].meta.reason, "selection:settled");
});

test("map renderers fall back when idle never fires for camera deck schedules", () => {
  const timers = new Map();
  const timerOrder = [];
  let nextTimerId = 0;
  let idleCallback = null;
  const browser = createBrowserContext({
    setTimeout(callback, delay) {
      nextTimerId += 1;
      timers.set(nextTimerId, { callback, delay });
      timerOrder.push(nextTimerId);
      return nextTimerId;
    },
    clearTimeout(timerId) {
      timers.delete(timerId);
    },
  });
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  const counters = [];
  let deckUpdateTimer = null;
  let zoom = 16;
  let center = { lng: 34.79, lat: 31.25 };
  let visibleAmenityFeatures = [];
  const overlay = {
    propsHistory: [],
    setProps(props) {
      this.propsHistory.push(props);
      this.props = props;
    },
  };
  installFakeCanvas(browser.window.document);
  browser.window.deck = makeDeckLayerConstructors([]);
  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    urban95Perf: {
      counter(name, meta) {
        counters.push({ name, meta: typeof meta === "function" ? meta() : meta });
      },
      phase(_name, callback) {
        return callback();
      },
      span(_name, _meta, callback) {
        return callback();
      },
    },
    map: {
      getLayer() {
        return null;
      },
      setLayoutProperty() {},
      getSource() {
        return { setData() {} };
      },
      getZoom() {
        return zoom;
      },
      project(coordinates) {
        return { x: coordinates[0] * 1000, y: coordinates[1] * 1000 };
      },
      getCanvas() {
        return { width: 1440, height: 1100, style: {} };
      },
      getCenter() {
        return center;
      },
      getBearing() {
        return 0;
      },
      getPitch() {
        return 0;
      },
      addControl() {},
      on() {},
      once(eventName, callback) {
        if (eventName === "idle") idleCallback = callback;
      },
    },
    tooltipEl: { style: {}, textContent: "" },
    treeLayerIds: [],
    streetLightLayerIds: [],
    treesAndLightsLayerIds: [],
    hasGeneratedArtifact() {
      return false;
    },
    getCurrentMode() {
      return "house";
    },
    getScoreMode() {
      return "expanded";
    },
    urban95DetailPointsMinZoom: 13,
    amenityClusterMinZoom: 13,
    amenityClusterMaxCount: 9,
    getSelectedAmenityTypes() {
      return new Set(["parks"]);
    },
    getAllFilterTypes() {
      return ["parks"];
    },
    getVisibleAmenityFeatures() {
      return visibleAmenityFeatures;
    },
    setVisibleAmenityFeatures(value) {
      visibleAmenityFeatures = value;
    },
    getAllAmenitiesData() {
      return {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { amenity_type: "parks" } }],
      };
    },
    getAmenitiesInRadiusIds() {
      return new Set([0]);
    },
    getAllTreesData() {
      return { type: "FeatureCollection", features: [] };
    },
    getTreesInRadiusIds() {
      return new Set();
    },
    getAllStreetLightsData() {
      return { type: "FeatureCollection", features: [] };
    },
    getStreetLightsInRadiusIds() {
      return new Set();
    },
    getDeckAmenityOverlay() {
      return overlay;
    },
    setDeckAmenityOverlay() {},
    setDeckHovering() {},
    getDeckHovering() {
      return false;
    },
    getAmenityConfig() {
      return { label: "Parks", color: "#2563eb" };
    },
    ensureDeckGlLoaded() {
      return Promise.resolve();
    },
    getDeckUpdateTimer() {
      return deckUpdateTimer;
    },
    setDeckUpdateTimer(value) {
      deckUpdateTimer = value;
    },
  });

  browser.window.Urban95MapRenderers.updateAmenitiesSource({ caller: "initial" });
  const initialPropsCount = overlay.propsHistory.length;

  browser.window.Urban95MapRenderers.scheduleDeckUpdate("moveend");
  const debounceTimer = runQueuedTimer(timers, timerOrder, (timer) => timer.delay === 80);
  assert.ok(debounceTimer != null);
  assert.equal(debounceTimer.delay, 80);
  assert.equal(
    counters.filter((entry) => entry.name === "renderer:scheduleDeckUpdate:execute").length,
    0
  );

  const fallbackTimer = runQueuedTimer(timers, timerOrder);
  assert.ok(fallbackTimer != null);
  assert.ok(fallbackTimer.delay > 0);
  assert.equal(overlay.propsHistory.length, initialPropsCount);
  const executeCounters = counters.filter((entry) => entry.name === "renderer:scheduleDeckUpdate:execute");
  assert.equal(executeCounters.length, 1);
  assert.equal(executeCounters[0].meta.reason, "moveend");
  assert.equal(executeCounters[0].meta.fallback, true);
  const skipCounters = counters.filter((entry) => entry.name === "renderer:scheduleDeckUpdate:skip");
  assert.equal(skipCounters.length, 1);
  assert.equal(skipCounters[0].meta.reason, "moveend");
  assert.equal(skipCounters[0].meta.fallback, true);
  idleCallback();
  assert.equal(counters.filter((entry) => entry.name === "renderer:scheduleDeckUpdate:execute").length, 1);
  assert.equal(counters.filter((entry) => entry.name === "renderer:scheduleDeckUpdate:skip").length, 1);
  assert.equal(overlay.propsHistory.length, initialPropsCount);
});

test("map renderers reconfigure clears pending debounce timers from prior deps", () => {
  const timers = new Map();
  const timerOrder = [];
  let nextTimerId = 0;
  const browser = createBrowserContext({
    setTimeout(callback, delay) {
      nextTimerId += 1;
      timers.set(nextTimerId, { callback, delay });
      timerOrder.push(nextTimerId);
      return nextTimerId;
    },
    clearTimeout(timerId) {
      timers.delete(timerId);
    },
  });
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  const firstCounters = [];
  let firstDeckUpdateTimer = null;
  const firstOverlay = {
    setProps() {},
  };
  browser.window.deck = makeDeckLayerConstructors([]);
  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    urban95Perf: {
      counter(name, meta) {
        firstCounters.push({ name, meta: typeof meta === "function" ? meta() : meta });
      },
      phase(_name, callback) {
        return callback();
      },
      span(_name, _meta, callback) {
        return callback();
      },
    },
    map: {
      getLayer() {
        return null;
      },
      setLayoutProperty() {},
      getSource() {
        return { setData() {} };
      },
      getZoom() {
        return 14;
      },
      getCenter() {
        return { lng: 34.79, lat: 31.25 };
      },
      getBearing() {
        return 0;
      },
      getPitch() {
        return 0;
      },
      getCanvas() {
        return { style: {} };
      },
      addControl() {},
      on() {},
    },
    tooltipEl: { style: {}, textContent: "" },
    treeLayerIds: [],
    streetLightLayerIds: [],
    treesAndLightsLayerIds: [],
    hasGeneratedArtifact() {
      return false;
    },
    getCurrentMode() {
      return "house";
    },
    getScoreMode() {
      return "expanded";
    },
    urban95DetailPointsMinZoom: 13,
    amenityClusterMinZoom: 13,
    amenityClusterMaxCount: 9,
    getSelectedAmenityTypes() {
      return new Set(["parks"]);
    },
    getAllFilterTypes() {
      return ["parks"];
    },
    getVisibleAmenityFeatures() {
      return [{ id: 1 }];
    },
    setVisibleAmenityFeatures() {},
    getAllAmenitiesData() {
      return {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { amenity_type: "parks" } }],
      };
    },
    getAmenitiesInRadiusIds() {
      return new Set([0]);
    },
    getAllTreesData() {
      return { type: "FeatureCollection", features: [] };
    },
    getTreesInRadiusIds() {
      return new Set();
    },
    getAllStreetLightsData() {
      return { type: "FeatureCollection", features: [] };
    },
    getStreetLightsInRadiusIds() {
      return new Set();
    },
    getDeckAmenityOverlay() {
      return firstOverlay;
    },
    setDeckAmenityOverlay() {},
    setDeckHovering() {},
    getDeckHovering() {
      return false;
    },
    ensureDeckGlLoaded() {
      return Promise.resolve();
    },
    getDeckUpdateTimer() {
      return firstDeckUpdateTimer;
    },
    setDeckUpdateTimer(value) {
      firstDeckUpdateTimer = value;
    },
  });

  browser.window.Urban95MapRenderers.scheduleDeckUpdate("selection:settled");
  const pendingDebounce = findQueuedTimer(timers, timerOrder, (timer) => timer.delay === 80);
  assert.ok(pendingDebounce != null);

  const secondCounters = [];
  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    urban95Perf: {
      counter(name, meta) {
        secondCounters.push({ name, meta: typeof meta === "function" ? meta() : meta });
      },
      phase(_name, callback) {
        return callback();
      },
      span(_name, _meta, callback) {
        return callback();
      },
    },
    map: {
      getLayer() {
        return null;
      },
      setLayoutProperty() {},
      getSource() {
        return { setData() {} };
      },
      getZoom() {
        return 14;
      },
      getCanvas() {
        return { style: {} };
      },
      addControl() {},
      on() {},
    },
    tooltipEl: { style: {}, textContent: "" },
    treeLayerIds: [],
    streetLightLayerIds: [],
    treesAndLightsLayerIds: [],
    hasGeneratedArtifact() {
      return false;
    },
    getCurrentMode() {
      return "neighborhood";
    },
    getScoreMode() {
      return "expanded";
    },
    urban95DetailPointsMinZoom: 13,
    amenityClusterMinZoom: 13,
    amenityClusterMaxCount: 9,
    getSelectedAmenityTypes() {
      return new Set(["parks"]);
    },
    getAllFilterTypes() {
      return ["parks"];
    },
    getVisibleAmenityFeatures() {
      return [];
    },
    setVisibleAmenityFeatures() {},
    getAllAmenitiesData() {
      return {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { amenity_type: "parks" } }],
      };
    },
    getAmenitiesInRadiusIds() {
      return new Set([0]);
    },
    getAllTreesData() {
      return { type: "FeatureCollection", features: [] };
    },
    getTreesInRadiusIds() {
      return new Set();
    },
    getAllStreetLightsData() {
      return { type: "FeatureCollection", features: [] };
    },
    getStreetLightsInRadiusIds() {
      return new Set();
    },
    getDeckAmenityOverlay() {
      return firstOverlay;
    },
    setDeckAmenityOverlay() {},
    setDeckHovering() {},
    getDeckHovering() {
      return false;
    },
    ensureDeckGlLoaded() {
      return Promise.resolve();
    },
    getDeckUpdateTimer() {
      return null;
    },
    setDeckUpdateTimer() {},
  });

  const flushedOldDebounce = runQueuedTimer(timers, timerOrder, (timer) => timer.delay === 80);
  assert.equal(flushedOldDebounce, null);
  assert.equal(
    firstCounters.filter((entry) => entry.name === "renderer:scheduleDeckUpdate:execute").length,
    0
  );
  assert.equal(
    secondCounters.filter((entry) => entry.name === "renderer:scheduleDeckUpdate:execute").length,
    0
  );
});

test("map renderers idle listener fallback unsubscribes when map.once is unavailable", () => {
  const timers = new Map();
  const timerOrder = [];
  let nextTimerId = 0;
  const idleListeners = new Set();
  const browser = createBrowserContext({
    setTimeout(callback, delay) {
      nextTimerId += 1;
      timers.set(nextTimerId, { callback, delay });
      timerOrder.push(nextTimerId);
      return nextTimerId;
    },
    clearTimeout(timerId) {
      timers.delete(timerId);
    },
  });
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  const counters = [];
  let deckUpdateTimer = null;
  const overlay = {
    setProps() {},
  };
  browser.window.deck = makeDeckLayerConstructors([]);
  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    urban95Perf: {
      counter(name, meta) {
        counters.push({ name, meta: typeof meta === "function" ? meta() : meta });
      },
      phase(_name, callback) {
        return callback();
      },
      span(_name, _meta, callback) {
        return callback();
      },
    },
    map: {
      getLayer() {
        return null;
      },
      setLayoutProperty() {},
      getSource() {
        return { setData() {} };
      },
      getZoom() {
        return 14;
      },
      getCenter() {
        return { lng: 34.79, lat: 31.25 };
      },
      getBearing() {
        return 0;
      },
      getPitch() {
        return 0;
      },
      getCanvas() {
        return { style: {} };
      },
      addControl() {},
      on(eventName, callback) {
        if (eventName === "idle") idleListeners.add(callback);
      },
      off(eventName, callback) {
        if (eventName === "idle") idleListeners.delete(callback);
      },
    },
    tooltipEl: { style: {}, textContent: "" },
    treeLayerIds: [],
    streetLightLayerIds: [],
    treesAndLightsLayerIds: [],
    hasGeneratedArtifact() {
      return false;
    },
    getCurrentMode() {
      return "neighborhood";
    },
    getScoreMode() {
      return "expanded";
    },
    urban95DetailPointsMinZoom: 13,
    amenityClusterMinZoom: 13,
    amenityClusterMaxCount: 9,
    getSelectedAmenityTypes() {
      return new Set(["parks"]);
    },
    getAllFilterTypes() {
      return ["parks"];
    },
    getVisibleAmenityFeatures() {
      return [];
    },
    setVisibleAmenityFeatures() {},
    getAllAmenitiesData() {
      return {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { amenity_type: "parks" } }],
      };
    },
    getAmenitiesInRadiusIds() {
      return new Set([0]);
    },
    getAllTreesData() {
      return { type: "FeatureCollection", features: [] };
    },
    getTreesInRadiusIds() {
      return new Set();
    },
    getAllStreetLightsData() {
      return { type: "FeatureCollection", features: [] };
    },
    getStreetLightsInRadiusIds() {
      return new Set();
    },
    getDeckAmenityOverlay() {
      return overlay;
    },
    setDeckAmenityOverlay() {},
    setDeckHovering() {},
    getDeckHovering() {
      return false;
    },
    ensureDeckGlLoaded() {
      return Promise.resolve();
    },
    getDeckUpdateTimer() {
      return deckUpdateTimer;
    },
    setDeckUpdateTimer(value) {
      deckUpdateTimer = value;
    },
  });

  browser.window.Urban95MapRenderers.scheduleDeckUpdate("moveend");
  assert.ok(runQueuedTimer(timers, timerOrder, (timer) => timer.delay === 80));
  assert.equal(idleListeners.size, 1);
  idleListeners.forEach((listener) => listener());
  assert.equal(idleListeners.size, 0);
  browser.window.Urban95MapRenderers.scheduleDeckUpdate("zoomend");
  assert.ok(runQueuedTimer(timers, timerOrder, (timer) => timer.delay === 80));
  assert.equal(idleListeners.size, 1);
});

test("map renderers prefer unsubscribe-capable idle listeners over once for superseded camera schedules", () => {
  const timers = new Map();
  const timerOrder = [];
  let nextTimerId = 0;
  const idleListeners = new Set();
  const browser = createBrowserContext({
    setTimeout(callback, delay) {
      nextTimerId += 1;
      timers.set(nextTimerId, { callback, delay });
      timerOrder.push(nextTimerId);
      return nextTimerId;
    },
    clearTimeout(timerId) {
      timers.delete(timerId);
    },
  });
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  const counters = [];
  let deckUpdateTimer = null;
  const overlay = {
    setProps() {},
  };
  browser.window.deck = makeDeckLayerConstructors([]);
  browser.window.Urban95MapRenderers.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    urban95Perf: {
      counter(name, meta) {
        counters.push({ name, meta: typeof meta === "function" ? meta() : meta });
      },
      phase(_name, callback) {
        return callback();
      },
      span(_name, _meta, callback) {
        return callback();
      },
    },
    map: {
      getLayer() {
        return null;
      },
      setLayoutProperty() {},
      getSource() {
        return { setData() {} };
      },
      getZoom() {
        return 14;
      },
      getCenter() {
        return { lng: 34.79, lat: 31.25 };
      },
      getBearing() {
        return 0;
      },
      getPitch() {
        return 0;
      },
      getCanvas() {
        return { style: {} };
      },
      addControl() {},
      once() {
        throw new Error("idle registration should prefer on/off over once");
      },
      on(eventName, callback) {
        if (eventName === "idle") idleListeners.add(callback);
      },
      off(eventName, callback) {
        if (eventName === "idle") idleListeners.delete(callback);
      },
    },
    tooltipEl: { style: {}, textContent: "" },
    treeLayerIds: [],
    streetLightLayerIds: [],
    treesAndLightsLayerIds: [],
    hasGeneratedArtifact() {
      return false;
    },
    getCurrentMode() {
      return "neighborhood";
    },
    getScoreMode() {
      return "expanded";
    },
    urban95DetailPointsMinZoom: 13,
    amenityClusterMinZoom: 13,
    amenityClusterMaxCount: 9,
    getSelectedAmenityTypes() {
      return new Set(["parks"]);
    },
    getAllFilterTypes() {
      return ["parks"];
    },
    getVisibleAmenityFeatures() {
      return [];
    },
    setVisibleAmenityFeatures() {},
    getAllAmenitiesData() {
      return {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { amenity_type: "parks" } }],
      };
    },
    getAmenitiesInRadiusIds() {
      return new Set([0]);
    },
    getAllTreesData() {
      return { type: "FeatureCollection", features: [] };
    },
    getTreesInRadiusIds() {
      return new Set();
    },
    getAllStreetLightsData() {
      return { type: "FeatureCollection", features: [] };
    },
    getStreetLightsInRadiusIds() {
      return new Set();
    },
    getDeckAmenityOverlay() {
      return overlay;
    },
    setDeckAmenityOverlay() {},
    setDeckHovering() {},
    getDeckHovering() {
      return false;
    },
    ensureDeckGlLoaded() {
      return Promise.resolve();
    },
    getDeckUpdateTimer() {
      return deckUpdateTimer;
    },
    setDeckUpdateTimer(value) {
      deckUpdateTimer = value;
    },
  });

  browser.window.Urban95MapRenderers.scheduleDeckUpdate("moveend");
  assert.ok(runQueuedTimer(timers, timerOrder, (timer) => timer.delay === 80));
  assert.equal(idleListeners.size, 1);

  browser.window.Urban95MapRenderers.scheduleDeckUpdate("zoomend");
  assert.ok(runQueuedTimer(timers, timerOrder, (timer) => timer.delay === 80));
  assert.equal(idleListeners.size, 1);

  idleListeners.forEach((listener) => listener());
  const executeCounters = counters.filter((entry) => entry.name === "renderer:scheduleDeckUpdate:execute");
  assert.equal(executeCounters.length, 1);
  assert.equal(executeCounters[0].meta.reason, "zoomend");
});

test("map events register expected handlers and call injected dependencies", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapEvents.js", browser);

  const handlers = [];
  const calls = [];
  const canvas = { style: {} };
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
      getNeighborhoodFeatureAtPoint: function () {
        calls.push("getNeighborhoodFeatureAtPoint");
        return { properties: { name: "N" } };
      },
      showNeighborhoodAreaTooltip: function () {
        calls.push("showNeighborhoodAreaTooltip");
      },
    },
    compareApply: {
      applyClick: function () {
        calls.push("compareApply.applyClick");
      },
    },
    citySidebar: {
      setSelection: function () {
        calls.push("citySidebar.setSelection");
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

  assert.ok(handlers.some((handler) => handler.eventName === "click" && handler.layer === null));
  assert.ok(handlers.some((handler) => handler.eventName === "zoomend" && handler.layer === null));
  assert.ok(
    handlers.some((handler) => handler.eventName === "mousemove" && handler.layer === "parks-fill")
  );
  assert.ok(
    handlers.some((handler) => handler.eventName === "click" && handler.layer === "neighborhoods-fill")
  );
  assert.ok(
    handlers.some(
      (handler) => handler.eventName === "click" && handler.layer === "neighborhoods-surface"
    )
  );
  ["sourcedataloading", "sourcedata", "data", "movestart", "moveend", "idle"].forEach(function (eventName) {
    assert.equal(
      handlers.some((handler) => handler.eventName === eventName),
      false,
      "disabled perf must not register diagnostic " + eventName + " listener"
    );
  });

  handlers.find((handler) => handler.eventName === "zoomend").handler();
  assert.ok(calls.includes("updateTreesSource"));
  assert.ok(calls.includes("updateStreetLightsSource"));

  handlers.find(
    (handler) => handler.eventName === "click" && handler.layer === "neighborhoods-fill"
  ).handler({
    features: [{ properties: { name: "N" } }],
  });
  assert.ok(calls.includes("compareApply.applyClick"));
});

test("map events zoomend skips authoritative tree and light loads", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapEvents.js", browser);

  const handlers = [];
  const calls = [];
  const map = {
    on: function (eventName, layerOrHandler, maybeHandler) {
      handlers.push({
        eventName: eventName,
        layer: typeof layerOrHandler === "string" ? layerOrHandler : null,
        handler: typeof layerOrHandler === "function" ? layerOrHandler : maybeHandler,
      });
    },
    getCanvas: function () {
      return { style: {} };
    },
    getZoom: function () {
      return 14;
    },
    queryRenderedFeatures: function () {
      return [];
    },
  };

  browser.window.Urban95MapEvents.bind({
    map: map,
    selection: {
      findClosestBuilding: function () {},
      selectBuilding: function () {},
    },
    dashboards: {
      getNeighborhoodFeatureAtPoint: function () {
        return null;
      },
      showNeighborhoodAreaTooltip: function () {},
    },
    compareApply: {
      applyClick: function () {},
    },
    citySidebar: {
      setSelection: function () {},
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
    tooltip: { style: {} },
    buildingsFillLayerId: "buildings-fill",
    getCurrentMode: function () {
      return "house";
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
      return String(area);
    },
  });

  handlers.find((handler) => handler.eventName === "zoomend").handler();
  assert.deepEqual(calls, ["updateTreesSource", "updateStreetLightsSource"]);
});

test("map events ignore malformed house click and park hover payloads", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapEvents.js", browser);

  const handlers = [];
  const calls = [];
  const canvas = { style: {} };
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
      return 12;
    },
    queryRenderedFeatures: function () {
      return [];
    },
  };
  const tooltip = { textContent: "stale", style: { display: "block", left: "1px", top: "2px" } };

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
      getNeighborhoodFeatureAtPoint: function () {},
      showNeighborhoodAreaTooltip: function () {},
    },
    compareApply: {
      applyClick: function () {},
    },
    citySidebar: {
      setSelection: function () {},
    },
    mapRenderers: {
      updateTreesSource: function () {},
      updateStreetLightsSource: function () {},
    },
    pointDataLoader: {
      loadTreesIfNeeded: function () {},
      loadStreetLightsIfNeeded: function () {},
    },
    tooltip: tooltip,
    buildingsFillLayerId: "buildings-fill",
    getCurrentMode: function () {
      return "house";
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

  const houseClick = handlers.find((handler) => handler.eventName === "click" && handler.layer === null);
  const parksMousemove = handlers.find(
    (handler) => handler.eventName === "mousemove" && handler.layer === "parks-fill"
  );

  assert.doesNotThrow(function () {
    houseClick.handler();
    houseClick.handler({});
    houseClick.handler({ originalEvent: {} });
    houseClick.handler({ originalEvent: { target: canvas } });
    houseClick.handler({ originalEvent: { target: {} }, lngLat: { lng: 1, lat: 2 } });
  });
  assert.deepEqual(calls, []);

  assert.doesNotThrow(function () {
    parksMousemove.handler();
    parksMousemove.handler({});
    parksMousemove.handler({ features: [] });
    parksMousemove.handler({ features: [{}], point: { x: 1, y: 2 } });
    parksMousemove.handler({ features: [{ properties: {} }] });
  });
  assert.equal(tooltip.textContent, "stale");
  assert.equal(tooltip.style.display, "block");
});

test("park hover hides tooltip when deck hover takes over", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapEvents.js", browser);

  const handlers = [];
  let deckHovering = false;
  const canvas = { style: {} };
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
      return 12;
    },
    queryRenderedFeatures: function () {
      return [];
    },
  };
  const tooltip = { textContent: "", style: {} };

  browser.window.Urban95MapEvents.bind({
    map: map,
    selection: {
      findClosestBuilding: function () {},
      selectBuilding: function () {},
    },
    dashboards: {
      getNeighborhoodFeatureAtPoint: function () {},
      showNeighborhoodAreaTooltip: function () {},
    },
    compareApply: {
      applyClick: function () {},
    },
    citySidebar: {
      setSelection: function () {},
    },
    mapRenderers: {
      updateTreesSource: function () {},
      updateStreetLightsSource: function () {},
    },
    pointDataLoader: {
      loadTreesIfNeeded: function () {},
      loadStreetLightsIfNeeded: function () {},
    },
    tooltip: tooltip,
    buildingsFillLayerId: "buildings-fill",
    getCurrentMode: function () {
      return "house";
    },
    getDeckHovering: function () {
      return deckHovering;
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

  const parksMousemove = handlers.find(
    (handler) => handler.eventName === "mousemove" && handler.layer === "parks-fill"
  );

  parksMousemove.handler({
    features: [{ properties: { name: "Park", area: 4 } }],
    point: { x: 10, y: 20 },
  });
  assert.equal(canvas.style.cursor, "pointer");
  assert.equal(tooltip.style.display, "block");

  deckHovering = true;
  parksMousemove.handler({
    features: [{ properties: { name: "Park", area: 4 } }],
    point: { x: 10, y: 20 },
  });

  assert.equal(canvas.style.cursor, "");
  assert.equal(tooltip.style.display, "none");
});

test("map events fail fast when required dependencies are missing", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapEvents.js", browser);

  assert.throws(
    function () {
      browser.window.Urban95MapEvents.bind({});
    },
    /Urban95MapEvents requires deps\.map/
  );

  assert.throws(
    function () {
      browser.window.Urban95MapEvents.bind({
        map: {
          on: function () {},
          getCanvas: function () {},
          getZoom: function () {},
          queryRenderedFeatures: function () {},
        },
        selection: {
          selectBuilding: function () {},
        },
        dashboards: {},
        compareApply: {},
        citySidebar: {},
        mapRenderers: {},
        pointDataLoader: {},
        tooltip: { style: {} },
        buildingsFillLayerId: "buildings-fill",
        getCurrentMode: function () {},
        getDeckHovering: function () {},
        getLastDeckClickTime: function () {},
        getScoreMode: function () {},
        formatArea: function () {},
      });
    },
    /Urban95MapEvents requires deps\.selection\.findClosestBuilding/
  );
});

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

  state.setPercentileSeries("x", { overall: [1] });
  const cachedSeries = state.getPercentileSeries("x");
  cachedSeries.overall.push(2);
  assert.deepEqual(state.getPercentileSeries("x").overall, [1]);

  state.setBuildingAmenityStatKeys("y", new Set(["z"]));
  const cachedStatKeys = state.getBuildingAmenityStatKeys("y");
  cachedStatKeys.add("w");
  assert.deepEqual(Array.from(state.getBuildingAmenityStatKeys("y")), ["z"]);

  assert.equal(state.getPercentileSeriesCacheSize(), 1);
  assert.equal(state.getBuildingAmenityStatKeyCacheSize(), 1);
  state.clearDerivedCaches();

  assert.equal(state.getPercentileSeriesCacheSize(), 0);
  assert.equal(state.getBuildingAmenityStatKeyCacheSize(), 0);
});

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
  assert.equal(browser.window.Urban95Config.urls.shadeSi, "./data/shade_si.geojson");
  assert.equal(browser.window.Urban95Config.generatedFallbacks.buildingsLookup, "./data/buildings_lookup.json");
  assert.equal(browser.window.Urban95Config.generatedFallbacks.isochronesLookup, "./data/isochrones_lookup.json");
  assert.equal(browser.window.Urban95Config.generatedFallbacks.pointsLookup, "./data/points_lookup.json");
  assert.equal(browser.window.Urban95Config.generatedFallbacks.buildingsPmtiles, "./data/buildings_accessibility.pmtiles");
  assert.equal(browser.window.Urban95Config.generatedFallbacks.neighborhoodSurfacePmtiles, "./data/neighborhood_surface.pmtiles");
  assert.equal(browser.window.Urban95Config.generatedFallbacks.treesPmtiles, "./data/trees.pmtiles");
  assert.equal(browser.window.Urban95Config.generatedFallbacks.streetLightsPmtiles, "./data/street_lights.pmtiles");
  assert.equal(browser.window.Urban95Config.mapContracts.buildingSourceLayerFallback, "buildings");
  assert.equal(
    browser.window.Urban95Config.mapContracts.neighborhoodSurfaceSourceLayerFallback,
    "neighborhood_surface"
  );
  assert.equal(browser.window.Urban95DataArtifacts.urls.buildingsLookup, "./data/custom_buildings_lookup.json");
  assert.equal(browser.window.Urban95DataArtifacts.urls.isochronesLookup, "./data/custom_isochrones_lookup.json");
  assert.equal(browser.window.Urban95DataArtifacts.urls.pointsLookup, "./data/custom_points_lookup.json");
});

test("runtime data validates point lookup sources and scans amenity types", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/runtimeData.js", browser);

  const runtime = browser.window.Urban95RuntimeData;
  assert.equal(runtime.hasValidPointsLookupSources(null), false);
  assert.equal(runtime.hasValidPointsLookupSources({ sources: { amenities: [] } }), false);
  assert.equal(
    runtime.hasValidPointsLookupSources({
      sources: {
        amenities_clean: [{ lng: 34.8, lat: 31.2, type: "school" }],
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
  assert.deepEqual(Array.from(scan.types), ["park", "school"]);
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

test("runtime building fallback does not request ignored plain GeoJSON", async () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/runtimeData.js", browser);

  const calls = [];
  const loaders = browser.window.Urban95RuntimeData.createLoaders(
    (url, options) => {
      calls.push({ url, options: options || {} });
      if (url === "./data/buildings_lookup.json") return Promise.resolve(null);
      return Promise.resolve({ type: "FeatureCollection", features: [] });
    },
    { buildingsLookup: "./data/buildings_lookup.json" },
    { buildings: "./data/buildings_accessibility.geojson" }
  );

  const loaded = await loaders.loadBuildingsRuntimeData();

  assert.deepEqual(loaded, { type: "FeatureCollection", features: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { url: "./data/buildings_lookup.json", options: { required: false } },
    { url: "./data/buildings_accessibility.geojson", options: { plainFallback: false } },
  ]);
});

test("runtime building fallback is requested once when fallback gzip fails", async () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/runtimeData.js", browser);

  const calls = [];
  const loaders = browser.window.Urban95RuntimeData.createLoaders(
    (url, options) => {
      calls.push({ url, options: options || {} });
      if (url === "./data/buildings_lookup.json") return Promise.resolve(null);
      return Promise.reject(new Error("missing gzip"));
    },
    { buildingsLookup: "./data/buildings_lookup.json" },
    { buildings: "./data/buildings_accessibility.geojson" }
  );

  await assert.rejects(() => loaders.loadBuildingsRuntimeData(), /missing gzip/);

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { url: "./data/buildings_lookup.json", options: { required: false } },
    { url: "./data/buildings_accessibility.geojson", options: { plainFallback: false } },
  ]);
});

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

test("runtime point-data loader upgrades lookup point state to authoritative geojson in expanded mode", async () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/runtimeData.js", browser);

  const fetched = [];
  const loadedKinds = [];
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
        features: [{ type: "Feature", properties: { source: url } }],
      });
    },
    hasGeneratedArtifact: () => true,
    onSkippedTreesGeojson() {},
    onSkippedStreetLightsGeojson() {},
    onPointDataLoaded(kind) {
      loadedKinds.push(kind);
    },
    onPointDataError(kind, err) {
      throw err;
    },
  });

  loader.setPointLookupData({
    trees: { type: "FeatureCollection", features: [{ type: "Feature", properties: { source: "lookup-trees" } }] },
    streetLights: {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: { source: "lookup-lights" } }],
    },
  });

  assert.equal(loader.getTreesDataSource(), "lookup");
  assert.equal(loader.getStreetLightsDataSource(), "lookup");
  assert.equal(loader.canRefreshPointAnalysisAfterPointDataLoad(), false);

  await loader.ensureExpandedPointDataLoaded();

  assert.deepEqual(fetched, ["./data/trees.geojson", "./data/street_lights.geojson"]);
  assert.deepEqual(loadedKinds, ["trees", "street-lights"]);
  assert.equal(loader.getTreesDataSource(), "geojson");
  assert.equal(loader.getStreetLightsDataSource(), "geojson");
  assert.equal(loader.getAllTreesData().features[0].properties.source, "./data/trees.geojson");
  assert.equal(
    loader.getAllStreetLightsData().features[0].properties.source,
    "./data/street_lights.geojson"
  );
  assert.equal(loader.canRefreshPointAnalysisAfterPointDataLoad(), true);
});

test("runtime point-data loader does not chain tree geojson loads into street-light loads", async () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/runtimeData.js", browser);

  const fetched = [];
  const loadedKinds = [];
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
        features: [{ type: "Feature", properties: { source: url } }],
      });
    },
    hasGeneratedArtifact: () => false,
    onSkippedTreesGeojson() {},
    onSkippedStreetLightsGeojson() {},
    onPointDataLoaded(kind) {
      loadedKinds.push(kind);
    },
    onPointDataError(kind, err) {
      throw err;
    },
  });

  const result = await loader.loadTreesIfNeeded();

  assert.equal(result.features[0].properties.source, "./data/trees.geojson");
  assert.deepEqual(fetched, ["./data/trees.geojson"]);
  assert.deepEqual(loadedKinds, ["trees"]);
  assert.equal(loader.getTreesDataSource(), "geojson");
  assert.equal(loader.getStreetLightsDataSource(), "none");
});

test("runtime point-data loader passes defer refresh policy to expanded point-data callbacks", async () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/runtimeData.js", browser);

  const calls = [];
  const loader = browser.window.Urban95RuntimeData.createPointDataLoader({
    urls: {
      trees: "./data/trees.geojson",
      streetLights: "./data/street_lights.geojson",
    },
    getScoreMode: () => "expanded",
    fetchJsonWithGzipFallback(url) {
      return Promise.resolve({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { source: url } }],
      });
    },
    hasGeneratedArtifact: () => false,
    onSkippedTreesGeojson() {},
    onSkippedStreetLightsGeojson() {},
    onPointDataLoaded(kind, data, context) {
      calls.push({
        kind: kind,
        source: data.features[0].properties.source,
        context: context,
      });
    },
    onPointDataError(kind, err) {
      throw err;
    },
  });

  const result = await loader.ensureExpandedPointDataLoaded({ refreshPolicy: "defer" });

  assert.deepEqual(Array.from(result.upgradedKinds || []), ["trees", "street-lights"]);
  assert.deepEqual(calls.map(function (call) {
    return {
      kind: call.kind,
      source: call.source,
      refreshPolicy: call.context && call.context.refreshPolicy,
    };
  }), [
    {
      kind: "trees",
      source: "./data/trees.geojson",
      refreshPolicy: "defer",
    },
    {
      kind: "street-lights",
      source: "./data/street_lights.geojson",
      refreshPolicy: "defer",
    },
  ]);
});

test("runtime point-data loader reports no upgraded kinds once expanded point sources are authoritative", async () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/runtimeData.js", browser);

  const loader = browser.window.Urban95RuntimeData.createPointDataLoader({
    urls: {
      trees: "./data/trees.geojson",
      streetLights: "./data/street_lights.geojson",
    },
    getScoreMode: () => "expanded",
    fetchJsonWithGzipFallback(url) {
      return Promise.resolve({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { source: url } }],
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

  await loader.ensureExpandedPointDataLoaded({ refreshPolicy: "defer" });
  const result = await loader.ensureExpandedPointDataLoaded({ refreshPolicy: "defer" });

  assert.deepEqual(Array.from(result.upgradedKinds || []), []);
});

test("runtime orchestration helpers live in runtimeData instead of app coordinator", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/runtimeData.js", browser);

  [
    "hasValidPointsLookupSources",
    "scanAmenityTypesFromFeatures",
    "warnIfBuildingScoresIncomplete",
  ].forEach(function (memberName) {
    assert.equal(typeof browser.window.Urban95RuntimeData[memberName], "function");
  });

  const appSource = readAppCoordinatorSource();
  assert.doesNotMatch(appSource, /function hasValidPointsLookupSources\s*\(/);
  assert.doesNotMatch(appSource, /function scanAmenityTypesFromFeatures\s*\(/);
  assert.doesNotMatch(appSource, /function warnIfBuildingScoresIncomplete\s*\(/);
  assert.match(
    appSource,
    /requireNamespaceMember\(urban95RuntimeData,\s*"Urban95RuntimeData",\s*"hasValidPointsLookupSources",\s*"function"\)/
  );
  assert.match(
    appSource,
    /requireNamespaceMember\(urban95RuntimeData,\s*"Urban95RuntimeData",\s*"warnIfBuildingScoresIncomplete",\s*"function"\)/
  );
  assert.match(
    appSource,
    /requireNamespaceMember\(urban95RuntimeData,\s*"Urban95RuntimeData",\s*"scanAmenityTypesFromFeatures",\s*"function"\)/
  );
});

test("data artifacts fail fast when generated fallback config is incomplete", () => {
  const browser = createBrowserContext();

  runBrowserScript("docs/js/core/config.js", browser);
  delete browser.window.Urban95Config.generatedFallbacks.pointsLookup;

  assert.throws(
    () => runBrowserScript("docs/js/core/dataArtifacts.js", browser),
    /Urban95Config\.generatedFallbacks\.pointsLookup is required before dataArtifacts\.js/
  );
});

test("data artifacts fail fast when config is missing", () => {
  const browser = createBrowserContext();

  assert.throws(
    () => runBrowserScript("docs/js/core/dataArtifacts.js", browser),
    /window\.Urban95Config is required before dataArtifacts\.js/
  );
});

test("data artifacts resolve generated fallback URLs from config", () => {
  const browser = createBrowserContext();

  runBrowserScript("docs/js/core/config.js", browser);
  browser.window.Urban95Config.generatedFallbacks = {
    buildingsLookup: "./custom/buildings_lookup.json",
    isochronesLookup: "./custom/isochrones_lookup.json",
    pointsLookup: "./custom/points_lookup.json",
    buildingsPmtiles: "./custom/buildings.pmtiles",
    neighborhoodSurfacePmtiles: "./custom/neighborhood_surface.pmtiles",
    treesPmtiles: "./custom/trees.pmtiles",
    streetLightsPmtiles: "./custom/street_lights.pmtiles",
  };
  runBrowserScript("docs/js/core/dataArtifacts.js", browser);

  assert.deepEqual(JSON.parse(JSON.stringify(browser.window.Urban95DataArtifacts.urls)), {
    buildingsLookup: "./custom/buildings_lookup.json",
    isochronesLookup: "./custom/isochrones_lookup.json",
    pointsLookup: "./custom/points_lookup.json",
    buildingsPmtiles: "./custom/buildings.pmtiles",
    neighborhoodSurfacePmtiles: "./custom/neighborhood_surface.pmtiles",
    treesPmtiles: "./custom/trees.pmtiles",
    streetLightsPmtiles: "./custom/street_lights.pmtiles",
  });
});

test("data artifacts prefer geojson for neighborhood surface even when pmtiles exist", () => {
  const browser = createBrowserContext({
    URBAN95_GENERATED_ARTIFACTS: {
      buildings: { status: "built", output: "./data/buildings_accessibility.pmtiles" },
      neighborhood_surface: { status: "built", output: "./data/neighborhood_surface.pmtiles" },
    },
  });

  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/core/dataArtifacts.js", browser);

  assert.equal(
    browser.window.Urban95Config.generatedArtifactPolicies.neighborhood_surface.useGeneratedAsset,
    false
  );
  assert.equal(browser.window.Urban95DataArtifacts.hasGeneratedArtifact("buildings"), true);
  assert.equal(browser.window.Urban95DataArtifacts.hasGeneratedArtifact("neighborhood_surface"), false);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        browser.window.Urban95DataArtifacts.vectorSourceOrGeojson(
          "neighborhood_surface",
          "./data/neighborhood_surface.pmtiles"
        )
      )
    ),
    { type: "geojson", data: { type: "FeatureCollection", features: [] } }
  );
});

test("map layer factories honor explicit field-level API", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapLayers.js", browser);

  const calls = [];
  const artifacts = {
    vectorSourceOrGeojson(artifactName, pmtilesPath) {
      calls.push({ artifactName, pmtilesPath });
      return { type: "vector", url: "pmtiles://x" };
    },
  };

  const source = browser.window.Urban95MapLayers.createBuildingsSource({
    artifacts,
    buildingsPmtilesPath: "./data/x.pmtiles",
  });
  assert.deepEqual(calls, [{ artifactName: "buildings", pmtilesPath: "./data/x.pmtiles" }]);
  assert.equal(source.type, "vector");
  assert.equal(source.url, "pmtiles://x");
  assert.equal(source.promoteId, "building_id");

  const fillLayer = browser.window.Urban95MapLayers.createBuildingsFillLayer({
    layerId: "custom-fill",
    sourceId: "custom-source",
    sourceLayer: "custom-layer",
    fillColorExpression: ["literal", 123],
  });
  assert.equal(fillLayer.id, "custom-fill");
  assert.equal(fillLayer.source, "custom-source");
  assert.equal(fillLayer["source-layer"], "custom-layer");
  assert.deepEqual(fillLayer.paint["fill-color"], ["literal", 123]);

  const selectedLayer = browser.window.Urban95MapLayers.createBuildingsSelectedLayer({
    layerId: "custom-selected",
    sourceId: "custom-source",
    sourceLayer: "custom-layer",
    selectedStateKey: "custom_selected",
  });
  assert.equal(selectedLayer.id, "custom-selected");
  assert.equal(selectedLayer.source, "custom-source");
  assert.equal(selectedLayer["source-layer"], "custom-layer");
  assert.match(JSON.stringify(selectedLayer.paint["line-width"]), /custom_selected/);
  assert.match(JSON.stringify(selectedLayer.paint["line-opacity"]), /custom_selected/);
});

test("building fill layer default expression does not require map contracts", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapLayers.js", browser);

  const fillLayer = browser.window.Urban95MapLayers.createBuildingsFillLayer({});

  assert.equal(fillLayer.id, "buildings-fill");
  assert.deepEqual(JSON.parse(JSON.stringify(fillLayer.paint["fill-color"].slice(0, 4))), [
    "interpolate",
    ["linear"],
    ["coalesce", ["feature-state", "sym_pct"], 0],
    0,
  ]);
});

test("map layer contracts use config-owned source-layer fallbacks", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapLayers.js", browser);

  const contracts = browser.window.Urban95MapLayers.resolveBuildingContracts({
    config: {
      mapContracts: {
        buildingSourceLayerFallback: "custom_buildings_layer",
      },
    },
    artifacts: {
      sourceLayer(_artifactName, fallbackLayer) {
        return fallbackLayer;
      },
    },
  });

  assert.equal(contracts.vectorLayerId, "custom_buildings_layer");
});

test("map layer contracts require config-owned building source-layer fallback", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapLayers.js", browser);

  assert.throws(
    () =>
      browser.window.Urban95MapLayers.resolveBuildingContracts({
        config: { mapContracts: {} },
        artifacts: {
          sourceLayer(_artifactName, fallbackLayer) {
            return fallbackLayer;
          },
        },
      }),
    /Urban95Config\.mapContracts\.buildingSourceLayerFallback is required before mapLayers\.js/
  );
});

test("dense polygon PMTiles preserve features instead of dropping densest tiles", () => {
  const scriptSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "scripts", "build_buildings_pmtiles.py"),
    "utf8"
  );
  assert.match(
    scriptSource,
    /name="buildings",[\s\S]*"--no-feature-limit",[\s\S]*"--no-tile-size-limit",/
  );
  assert.match(
    scriptSource,
    /name="neighborhood_surface",[\s\S]*"--no-feature-limit",[\s\S]*"--no-tile-size-limit",/
  );
  assert.match(
    scriptSource,
    /if \([\s\S]*"--no-feature-limit" not in spec\.tippecanoe_flags[\s\S]*"--no-tile-size-limit" not in spec\.tippecanoe_flags[\s\S]*\):[\s\S]*"--drop-densest-as-needed"/
  );
});

test("selection and runtime modules preserve lookup-first analysis contracts", () => {
  const runtimeSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "js", "core", "runtimeData.js"), "utf8");
  const selectionSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "selection.js"),
    "utf8"
  );
  assert.match(runtimeSource, /loadBuildingsRuntimeData/);
  assert.match(runtimeSource, /loadIsochronesLookup/);
  assert.match(runtimeSource, /loadPointsLookup/);

  const appSource = readAppCoordinatorSource();
  const startupSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "core", "startup.js"),
    "utf8"
  );
  assert.match(appSource, /Urban95AppStartupBridge\.bindStartup\(\s*\{/);
  assert.match(appSource, /markIsochronesLoaded:\s*function\s*\(\)\s*\{\s*loadingUi\.mark\("isochrones"\);/);
  assert.match(startupSource, /loadBuildingsRuntimeData/);
  assert.match(startupSource, /loadPointsLookup/);
  assert.match(selectionSource, /d\.markIsochronesLoaded\(\);[\s\S]*compact lookup ready/);
  assert.match(selectionSource, /d\.markIsochronesLoaded\(\);[\s\S]*complete total/);
  assert.match(selectionSource, /console\.error\("Failed to load isochrones:", err\);[\s\S]*d\.markIsochronesLoaded\(\);/);
  assert.doesNotMatch(selectionSource, /getLoadingState\(\)\.isochrones\s*=\s*true/);
  assert.doesNotMatch(appSource, /Urban95Selection\.configure\(\{[\s\S]*getLoadingState:/);
  assert.doesNotMatch(appSource, buildingRenderedFeaturesLayerPattern);
});

test("task-7 app coordinator wires map renderer and selection modules", () => {
  const appSource = readAppCoordinatorSource();
  const startupSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "core", "startup.js"),
    "utf8"
  );
  const mapEventsSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "mapEvents.js"),
    "utf8"
  );
  assert.match(appSource, /(?:const|var) Urban95MapRenderers = requireNamespace\(window, "Urban95MapRenderers"\);/);
  assert.match(appSource, /(?:const|var) Urban95Selection = requireNamespace\(window, "Urban95Selection"\);/);
  assert.match(appSource, /Urban95MapRenderers\.configure\(\{/);
  assert.match(appSource, /Urban95Selection\.configure\(\{/);
  assert.match(appSource, /hasRadiusSelectionState:\s*function\s*\(\)\s*\{/);
  assert.match(appSource, /buildBuildingCentroidGridIndex:\s*Urban95Selection\.buildBuildingCentroidGridIndex/);
  assert.match(appSource, /Urban95MapEvents\.bind\(\{/);
  assert.match(appSource, /selection:\s*Urban95Selection/);
  assert.match(appSource, /mapRenderers:\s*Urban95MapRenderers/);
  assert.match(startupSource, /selection\.buildBuildingCentroidGridIndex\(\);/);
  assert.match(mapEventsSource, /selection\.findClosestBuilding\(e\.lngLat\)/);
  assert.match(mapEventsSource, /selection\.selectBuilding\(closest,\s*true\)/);
  assert.doesNotMatch(appSource, /function setSelectedBuildingVectorState\s*\(/);
  assert.doesNotMatch(appSource, /function buildBuildingCentroidGridIndex\s*\(/);
  assert.doesNotMatch(appSource, /function findClosestBuilding\s*\(/);
  assert.doesNotMatch(appSource, /function selectBuilding\s*\(/);
});

test("task-8 app coordinator wires the controls module", () => {
  const appSource = readAppCoordinatorSource();
  assert.match(appSource, /(?:const|var) Urban95Controls = requireNamespace\(window, "Urban95Controls"\);/);
  assert.match(appSource, /controlsBinding = Urban95Controls\.bind\(\{/);
});

test("task-5 app coordinator passes focused grouped amenity mode dependencies", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const amenityModeCreateBlock = appSource.match(
    /const amenityMode = Urban95AmenityMode\.create\(\{[\s\S]*?\n\}\);/
  );

  assert.ok(amenityModeCreateBlock, "app.js should create amenityMode with an explicit dependency block");
  const amenityModeSource = amenityModeCreateBlock[0];

  assert.match(
    amenityModeSource,
    /pointDataLoader:\s*\{\s*ensureExpandedPointDataLoaded:\s*pointDataLoader\.ensureExpandedPointDataLoaded,\s*canRefreshPointAnalysisAfterPointDataLoad:\s*pointDataLoader\.canRefreshPointAnalysisAfterPointDataLoad,\s*\}/s
  );
  assert.match(
    amenityModeSource,
    /renderers:\s*\{\s*syncPointLayerVisibility:\s*Urban95MapRenderers\.syncPointLayerVisibility,\s*applyShowPointsToggle:\s*Urban95MapRenderers\.applyShowPointsToggle,\s*updateAmenitiesSource:\s*Urban95MapRenderers\.updateAmenitiesSource,\s*updateTreesSource:\s*Urban95MapRenderers\.updateTreesSource,\s*updateStreetLightsSource:\s*Urban95MapRenderers\.updateStreetLightsSource,\s*updateBuildingColors:\s*Urban95MapRenderers\.updateBuildingColors,\s*updateNeighborhoodSurfaceData:\s*Urban95MapRenderers\.updateNeighborhoodSurfaceData,\s*\}/s
  );
  assert.match(
    amenityModeSource,
    /selection:\s*\{\s*selectBuilding:\s*Urban95Selection\.selectBuilding,\s*\}/s
  );
  assert.doesNotMatch(amenityModeSource, /pointDataLoader:\s*pointDataLoader/);
  assert.doesNotMatch(amenityModeSource, /renderers:\s*Urban95MapRenderers/);
  assert.doesNotMatch(amenityModeSource, /selection:\s*Urban95Selection/);
});

test("app.js is final coordinator only after ownership extraction", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const appLines = appSource.split(/\r?\n/).length;
  const appOwnedHelperPattern = function (name) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      [
        "\\bfunction\\s+" + escapedName + "\\b",
        "\\b(?:const|let|var)\\s+" + escapedName + "\\s*=\\s*(?:async\\s+)?(?:function\\b|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)",
        "\\b" + escapedName + "\\s*:\\s*(?:async\\s+)?(?:function\\b|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)",
        "\\b" + escapedName + "\\s*\\([^)]*\\)\\s*\\{",
      ].join("|")
    );
  };

  assert.ok(
    appLines <= 1700,
    "docs/app.js should stay at or below 1700 lines after final coordinator extraction, got " + appLines
  );

  // Keep the plan's exact bans, but also catch common app-owned reassignment styles for the same helpers.
  [
    appOwnedHelperPattern("buildExplainScoreBreakdown"),
    appOwnedHelperPattern("fillExplainSeries"),
    appOwnedHelperPattern("renderHorizonIcon"),
    appOwnedHelperPattern("horizonBarFillStyle"),
    appOwnedHelperPattern("updateLoadingProgress"),
    appOwnedHelperPattern("showIsochroneLoadingScreen"),
    appOwnedHelperPattern("hideIsochroneLoadingScreen"),
    appOwnedHelperPattern("loadAmenityIcons"),
    appOwnedHelperPattern("applyScoreModeAmenities"),
    appOwnedHelperPattern("handleControlsFilterSelectionChanged"),
    appOwnedHelperPattern("handleControlsScoreModeChanged"),
    appOwnedHelperPattern("handleControlsWalkMinutesChanged"),
    appOwnedHelperPattern("handleControlsModeToggleRequested"),
    appOwnedHelperPattern("handleControlsEscape"),
    appOwnedHelperPattern("handleControlsHeatmapVisibilityChange"),
    appOwnedHelperPattern("clearControlDerivedCaches"),
    appOwnedHelperPattern("renderWeightedSubcategoryComparisonList"),
    appOwnedHelperPattern("getCurrentScoreModelContext"),
    appOwnedHelperPattern("getCurrentBuildingCleanFilteredScore"),
    appOwnedHelperPattern("getCurrentBuildingOverallScore"),
    appOwnedHelperPattern("collectCurrentBuildingScores"),
    appOwnedHelperPattern("getWeightedAverageValueFromCurrentSelection"),
    appOwnedHelperPattern("weightedNeighborhoodRankingRowsForCurrentSelection"),
    appOwnedHelperPattern("getCitywideWeightedAverageScoreForCurrentSelection"),
    appOwnedHelperPattern("getCurrentPercentileSeriesCacheKey"),
    appOwnedHelperPattern("getCurrentBuildingAmenityStatKeysForMinutes"),
    appOwnedHelperPattern("loadPointsLookup"),
    appOwnedHelperPattern("loadAmenitiesGeojsonFallback"),
    appOwnedHelperPattern("filterCleanManifestPointFeatures"),
    appOwnedHelperPattern("getZoomForPolygon"),
    appOwnedHelperPattern("getNeighborhoodAverageKey"),
    appOwnedHelperPattern("getNeighborhoodPercentileKey"),
    appOwnedHelperPattern("getScoreMinutes"),
    appOwnedHelperPattern("normalizeSurfaceFilterKey"),
    appOwnedHelperPattern("getNeighborhoodSurfaceScorePropertyKey"),
    appOwnedHelperPattern("getNeighborhoodSurfaceColorExpression"),
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
    /Urban95OverlayVisibility\.create\s*\(/,
    /Urban95AppStartupBridge\.bindStartup\s*\(/,
    /Urban95Controls\.bind\s*\(/,
    /Urban95MapEvents\.bind\s*\(/,
  ].forEach(function (pattern) {
    assert.match(appSource, pattern);
  });
});

test("mode orchestration lives in Urban95ModeController instead of app.js", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const modeSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "modeController.js"),
    "utf8"
  );

  assert.match(appSource, /Urban95ModeController\.create\s*\(/);
  assert.match(appSource, /function\s+switchMode\s*\(\s*mode\s*\)\s*\{[\s\S]*modeController\.switchMode\s*\(\s*mode\s*\)/);
  assert.doesNotMatch(appSource, /function\s+enterNeighborhoodMode\s*\(/);
  assert.doesNotMatch(appSource, /function\s+enterCitywideMode\s*\(/);
  assert.doesNotMatch(appSource, /const\s+exitNeighborhoodMode\s*=\s*modeController\.exitNeighborhoodMode/);
  assert.doesNotMatch(appSource, /\bexitNeighborhoodMode\s*\(/);
  assert.match(modeSource, /function\s+switchMode\s*\(/);
  assert.match(modeSource, /function\s+enterHouseMode\s*\(/);
  assert.match(modeSource, /function\s+enterNeighborhoodMode\s*\(/);
  assert.match(modeSource, /function\s+enterCitywideMode\s*\(/);
  assert.match(modeSource, /function\s+exitNeighborhoodMode\s*\(/);
  assert.match(modeSource, /applyHouseModeHexBackground/);
});

test("app coordinator delegates startup, modes, and map events", () => {
  const appSource = readAppCoordinatorSource();

  assert.match(appSource, /Urban95AppStartupBridge\.bindStartup\(/);
  assert.match(appSource, /Urban95ModeController\.create\(/);
  assert.match(appSource, /Urban95MapEvents\.bind\(/);
  assert.doesNotMatch(appSource, /map\.on\(\s*["']mousemove["']\s*,\s*["'][^"']*neighborhood/i);
  assert.doesNotMatch(appSource, /map\.on\(\s*["']mousemove["']\s*,\s*["']parks-fill["']/);
  assert.doesNotMatch(appSource, /console\.log\(\s*["']\[Load\]/);
  assert.doesNotMatch(appSource, /console\.log\(\s*["']\[Neighborhood\]/);
});

test("mode controller uses explicit UI element injection instead of document lookups", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const modeSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "modeController.js"),
    "utf8"
  );

  assert.match(appSource, /radiusInfo:\s*radiusInfoEl/);
  assert.match(appSource, /citySidebar:\s*Urban95CitySidebar/);
  assert.doesNotMatch(appSource, /citywideBody:\s*citywideBodyEl/);
  assert.doesNotMatch(modeSource, /documentRef/);
  assert.doesNotMatch(modeSource, /getElementById/);
  assert.doesNotMatch(modeSource, /querySelector\s*\(/);
});

test("control actions uses explicit city sidebar accessors instead of document lookups", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const controlActionsSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "ui", "controlActions.js"),
    "utf8"
  );

  assert.match(
    appSource,
    /citySidebar:\s*\{\s*isOpen:\s*Urban95CitySidebar\.isOpen,\s*sync:\s*Urban95CitySidebar\.sync,\s*hide:\s*Urban95CitySidebar\.hide,\s*dismiss:\s*Urban95CitySidebar\.dismiss,\s*setSelection:\s*Urban95CitySidebar\.setSelection,\s*\}/s
  );
  assert.match(
    appSource,
    /ui:\s*\{\s*clearTooltip:\s*function \(\) \{\s*tooltip\.textContent = "";\s*tooltip\.style\.display = "none";\s*\},\s*\}/s
  );
  assert.match(controlActionsSource, /\["neighborhoodSidebar\.show", neighborhoodSidebar\.show\]/);
  assert.match(controlActionsSource, /\["neighborhoodSidebar\.sync", neighborhoodSidebar\.sync\]/);
  assert.match(controlActionsSource, /\["neighborhoodSidebar\.hide", neighborhoodSidebar\.hide\]/);
  assert.match(controlActionsSource, /\["neighborhoodSidebar\.isOpen", neighborhoodSidebar\.isOpen\]/);
  assert.match(controlActionsSource, /\["citySidebar\.isOpen", citySidebar\.isOpen\]/);
  assert.match(controlActionsSource, /\["citySidebar\.sync", citySidebar\.sync\]/);
  assert.match(controlActionsSource, /\["citySidebar\.hide", citySidebar\.hide\]/);
  assert.match(controlActionsSource, /\["citySidebar\.dismiss", citySidebar\.dismiss\]/);
  assert.match(controlActionsSource, /\["citySidebar\.setSelection", citySidebar\.setSelection\]/);
  assert.match(controlActionsSource, /var clearTooltip =\s*typeof ui\.clearTooltip === "function" \? ui\.clearTooltip : function \(\) \{\};/);
  assert.match(controlActionsSource, /clearTooltip\(\);\s*clearDerivedCaches\(\);/);
  assert.doesNotMatch(controlActionsSource, /documentRef/);
  assert.doesNotMatch(controlActionsSource, /getElementById/);
  assert.doesNotMatch(controlActionsSource, /["']neighborhood-modal["']/);
  assert.doesNotMatch(controlActionsSource, /["']citywide-modal["']/);
});

test("control actions requires and receives state.getScoreMode", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const controlActionsSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "ui", "controlActions.js"),
    "utf8"
  );
  const controlActionsCreateStart = appSource.indexOf("const controlActions = Urban95ControlActions.create({");
  assert.notEqual(controlActionsCreateStart, -1);
  const controlsBindStart = appSource.indexOf("controlsBinding = Urban95Controls.bind({", controlActionsCreateStart);
  assert.notEqual(controlsBindStart, -1);
  const controlActionsCreateBlock = appSource.slice(controlActionsCreateStart, controlsBindStart);

  assert.match(controlActionsSource, /\["state\.getScoreMode", state\.getScoreMode\]/);
  assert.match(controlActionsCreateBlock, /getScoreMode:\s*getScoreModeState,/);
  assert.match(controlActionsSource, /state\.getScoreMode\(\) === "weighted"/);
});

function createModeControllerHarness(overrides) {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/cityGapThresholds.js", browser);
  runBrowserScript("docs/js/map/modeController.js", browser);

  const calls = [];
  const layers = new Set(["buildings-fill"]);
  let currentMode = "house";

  const deps = {
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    runtime: {
      map: {
        getLayer(id) {
          calls.push(["map:getLayer", id]);
          return layers.has(id);
        },
        addLayer(layer) {
          layers.add(layer.id);
          calls.push(["map:addLayer", layer.id]);
        },
        moveLayer(id, beforeId) {
          calls.push(["map:moveLayer", id, beforeId]);
        },
        setPaintProperty(layerId, propertyName, value) {
          calls.push(["map:setPaintProperty", layerId, propertyName, value]);
        },
        setFilter(layerId, filter) {
          calls.push(["map:setFilter", layerId, filter]);
        },
        setLayoutProperty(layerId, propertyName, value) {
          calls.push(["map:setLayoutProperty", layerId, propertyName, value]);
        },
        getSource(id) {
          calls.push(["map:getSource", id]);
          return {
            setData(data) {
              calls.push(["source:setData", id, data && data.features && data.features.length]);
            },
          };
        },
        fitBounds(bounds, options) {
          calls.push(["map:fitBounds", bounds, options]);
        },
      },
      perf: {
        phase(_name, fn) {
          return fn();
        },
        phaseAsync(_name, promise) {
          return promise;
        },
      },
      logger: {
        debug() {},
        warn() {
          calls.push(["logger:warn"].concat(Array.from(arguments)));
        },
        error() {
          calls.push(["logger:error"].concat(Array.from(arguments)));
        },
      },
    },
    integrations: {
      dashboards: {
        getNeighborhoodHexSurfaceOpacityExpression() {
          return 0.8;
        },
        loadNeighborhoodSurfaceData() {
          calls.push(["dashboards:loadNeighborhoodSurfaceData"]);
          return Promise.resolve({ type: "FeatureCollection", features: [] });
        },
        loadNeighborhoods() {
          calls.push(["dashboards:loadNeighborhoods"]);
          return Promise.resolve({ type: "FeatureCollection", features: [] });
        },
        loadNeighborhoodChartsPayload() {
          calls.push(["dashboards:loadNeighborhoodChartsPayload"]);
          return Promise.resolve({});
        },
        loadCitywideStats() {
          calls.push(["dashboards:loadCitywideStats"]);
          return Promise.resolve({});
        },
      },
      neighborhoodSidebar: {
        hide() {
          calls.push(["neighborhoodSidebar:hide"]);
        },
      },
      citySidebar: {
        openShell() {
          calls.push(["citySidebar:openShell"]);
        },
        sync() {
          calls.push(["citySidebar:sync"]);
        },
        hide(options) {
          calls.push(["citySidebar:hide", options]);
        },
        setSelection(value) {
          calls.push(["citySidebar:setSelection", value]);
        },
        setGapState(mode, options) {
          calls.push(["citySidebar:setGapState", mode, options || null]);
        },
      },
      scoreSidebar: {
        hide(options) {
          calls.push(["scoreSidebar:hide", options]);
        },
      },
      mapRenderers: {
        applyShowPointsToggle() {
          calls.push(["renderers:applyShowPointsToggle"]);
        },
        updateDeckAmenityLayers() {
          calls.push(["renderers:updateDeckAmenityLayers"]);
        },
        updateBuildingColors() {
          calls.push(["renderers:updateBuildingColors"]);
        },
        updateNeighborhoodSurfaceData() {
          calls.push(["renderers:updateNeighborhoodSurfaceData"]);
        },
        setTreesAndLightsVisibility(value) {
          calls.push(["renderers:setTreesAndLightsVisibility", value]);
        },
        updateNeighborhoodColors() {
          calls.push(["renderers:updateNeighborhoodColors"]);
        },
      },
      selection: {
        clearRadiusSelection() {
          calls.push(["selection:clearRadiusSelection"]);
        },
      },
      selectionHighlight: {
        applyCitySelection(feature) {
          calls.push(["highlight:applyCitySelection", feature]);
        },
      },
      compareApply: {
        clearAll(options) {
          calls.push(["compareApply:clearAll", options || null]);
        },
      },
    },
    ui: {
      modeToggle: {
        querySelectorAll() {
          return [];
        },
      },
      modeHint: { textContent: "" },
      indicatorsSection: {
        style: { display: "initial" },
        classList: { toggle() {} },
      },
      radiusInfo: { style: { display: "block" } },
    },
    state: {
      getCurrentMode() {
        return currentMode;
      },
      setCurrentMode(value) {
        currentMode = value;
      },
      setSelectedNeighborhood(value) {
        calls.push(["state:setSelectedNeighborhood", value]);
      },
      setCitySelection(value) {
        calls.push(["state:setCitySelection", value]);
      },
    },
    scoring: {
      getActiveMetric() {
        return { surfacePropertyKey: "score_weighted" };
      },
    },
    contracts: {
      buildingsFillLayerId: "buildings-fill",
      neighborhoodSurfaceSourceLayerFallback: "neighborhood_surface",
      houseModeHexOpacity: 0.3,
    },
    assets: {
      syncFilterUiForScoreMode() {
        calls.push(["assets:syncFilterUiForScoreMode"]);
      },
      updateFilterLabel() {
        calls.push(["assets:updateFilterLabel"]);
      },
      hasGeneratedArtifact() {
        return false;
      },
      sourceLayer(_artifactName, fallback) {
        return fallback;
      },
      getNeighborhoodSurfaceColorExpression() {
        return ["literal", "#000"];
      },
      getNeighborhoodSurfaceScorePropertyKey() {
        return "score";
      },
      setLegendVisible(value) {
        calls.push(["assets:setLegendVisible", value]);
      },
    },
    geo: {
      turf: {
        bbox() {
          return [0, 0, 1, 1];
        },
      },
    },
  };

  if (overrides) overrides(deps, calls, layers);

  return {
    controller: browser.window.Urban95ModeController.create(deps),
    calls,
    deps,
    layers,
    setCurrentMode(value) {
      currentMode = value;
    },
  };
}

test("mode controller fails fast for malformed nested dependencies", () => {
  assert.throws(
    () =>
      createModeControllerHarness(function (deps) {
        delete deps.runtime.perf.phaseAsync;
      }),
    /Urban95ModeController requires deps\.runtime\.perf\.phaseAsync/
  );

  assert.throws(
    () =>
      createModeControllerHarness(function (deps) {
        delete deps.integrations.dashboards.loadNeighborhoods;
      }),
    /Urban95ModeController requires deps\.integrations\.dashboards\.loadNeighborhoods/
  );

  assert.throws(
    () =>
      createModeControllerHarness(function (deps) {
        delete deps.ui.radiusInfo;
      }),
    /Urban95ModeController requires deps\.ui\.radiusInfo/
  );

  assert.throws(
    () =>
      createModeControllerHarness(function (deps) {
        delete deps.geo.turf.bbox;
      }),
    /Urban95ModeController requires deps\.geo\.turf\.bbox/
  );
});

test("mode controller logs async failures without unhandled rejections", async () => {
  const houseError = new Error("surface failed");
  const houseHarness = createModeControllerHarness(function (deps) {
    deps.integrations.dashboards.loadNeighborhoodSurfaceData = function () {
      return Promise.reject(houseError);
    };
  });

  await houseHarness.controller.applyHouseModeHexBackground();
  assert.ok(
    houseHarness.calls.some(
      (call) => call[0] === "logger:error" && String(call[1]).includes("house-mode surface")
    )
  );

  const neighborhoodError = new Error("neighborhood failed");
  const neighborhoodHarness = createModeControllerHarness(function (deps) {
    deps.integrations.dashboards.loadNeighborhoods = function () {
      return Promise.reject(neighborhoodError);
    };
  });

  neighborhoodHarness.setCurrentMode("house");
  await neighborhoodHarness.controller.switchMode("neighborhood");
  assert.ok(
    neighborhoodHarness.calls.some(
      (call) => call[0] === "logger:error" && String(call[1]).includes("neighborhood mode")
    )
  );

  const citywideError = new Error("citywide failed");
  const citywideHarness = createModeControllerHarness(function (deps) {
    deps.integrations.dashboards.loadNeighborhoodChartsPayload = function () {
      return Promise.reject(citywideError);
    };
  });

  await citywideHarness.controller.switchMode("citywide");
  assert.ok(citywideHarness.calls.some(
      (call) => call[0] === "logger:error" && String(call[1]).includes("citywide")
    )
  );
});

test("mode controller citywide enter hides buildings, keeps legend, opens city sidebar, and fits bounds", async () => {
  const harness = createModeControllerHarness(function (deps) {
    deps.integrations.dashboards.loadNeighborhoods = function () {
      return Promise.resolve({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [] } }],
      });
    };
  });

  await harness.controller.switchMode("citywide");

  assert.ok(
    harness.calls.some(function (call) {
      return (
        call[0] === "map:setLayoutProperty" &&
        call[1] === "buildings-fill" &&
        call[2] === "visibility" &&
        call[3] === "none"
      );
    })
  );
  assert.equal(
    harness.calls.some(function (call) {
      return call[0] === "map:setPaintProperty" && call[1] === "buildings-fill" && call[2] === "fill-opacity";
    }),
    false
  );
  assert.ok(
    harness.calls.some(function (call) {
      return call[0] === "assets:setLegendVisible" && call[1] === true;
    })
  );
  assert.ok(
    harness.calls.some(function (call) {
      return (
        call[0] === "citySidebar:setGapState" &&
        call[1] === "off" &&
        call[2] &&
        call[2].sync === false
      );
    })
  );
  // Enter City must reset gap to relative DEFAULT_MODE ("off"), never absolute lt40/50/60.
  assert.equal(
    harness.calls.some(function (call) {
      return (
        call[0] === "citySidebar:setGapState" &&
        (call[1] === "lt40" || call[1] === "lt50" || call[1] === "lt60")
      );
    }),
    false
  );
  assert.ok(
    harness.calls.some(function (call) {
      return call[0] === "citySidebar:openShell";
    })
  );
  assert.ok(
    harness.calls.some(function (call) {
      return call[0] === "citySidebar:sync";
    })
  );
  const setGapStateIndex = harness.calls.findIndex(function (call) {
    return call[0] === "citySidebar:setGapState";
  });
  const openShellIndex = harness.calls.findIndex(function (call) {
    return call[0] === "citySidebar:openShell";
  });
  const syncIndex = harness.calls.findIndex(function (call) {
    return call[0] === "citySidebar:sync";
  });
  const colorsIndex = harness.calls.findIndex(function (call) {
    return call[0] === "renderers:updateNeighborhoodColors";
  });
  const fitBoundsIndex = harness.calls.findIndex(function (call) {
    return call[0] === "map:fitBounds";
  });
  assert.ok(setGapStateIndex !== -1);
  assert.ok(openShellIndex !== -1);
  assert.ok(syncIndex !== -1);
  assert.ok(colorsIndex !== -1);
  assert.ok(fitBoundsIndex !== -1);
  assert.ok(setGapStateIndex < colorsIndex);
  assert.ok(colorsIndex < openShellIndex);
  // Task 2 polish: pad/openShell before fitBounds, then sync content.
  assert.ok(openShellIndex < fitBoundsIndex);
  assert.ok(fitBoundsIndex < syncIndex);
  assert.ok(
    harness.calls.some(function (call) {
      return (
        call[0] === "map:fitBounds" &&
        call[2] &&
        call[2].padding === 40 &&
        call[2].duration === 600
      );
    })
  );
});

test("mode controller ignores stale neighborhood async commits after switching back to house mode", async () => {
  let resolveNeighborhoods;
  const neighborhoodsPromise = new Promise(function (resolve) {
    resolveNeighborhoods = resolve;
  });
  const harness = createModeControllerHarness(function (deps, calls) {
    deps.integrations.dashboards.loadNeighborhoods = function () {
      calls.push(["dashboards:loadNeighborhoods:deferred"]);
      return neighborhoodsPromise;
    };
  });

  const pendingNeighborhoodSwitch = harness.controller.switchMode("neighborhood");
  await Promise.resolve();
  await harness.controller.switchMode("house");

  const callCountBeforeResolve = harness.calls.length;
  resolveNeighborhoods({ type: "FeatureCollection", features: [{ type: "Feature", properties: {} }] });
  await pendingNeighborhoodSwitch;

  const postResolveCalls = harness.calls.slice(callCountBeforeResolve);
  assert.equal(
    postResolveCalls.some(function (call) {
      return call[0] === "source:setData" && call[1] === "neighborhoods";
    }),
    false
  );
  assert.equal(
    postResolveCalls.some(function (call) {
      return (
        call[0] === "map:setLayoutProperty" &&
        (call[1] === "neighborhoods-fill" ||
          call[1] === "neighborhoods-line" ||
          call[1] === "neighborhoods-label") &&
        call[2] === "visibility" &&
        call[3] === "visible"
      );
    }),
    false
  );
  assert.equal(
    postResolveCalls.some(function (call) {
      return call[0] === "map:fitBounds";
    }),
    false
  );
});

test("mode controller does not register diagnostic settle listeners when perf is disabled", async () => {
  const harness = createModeControllerHarness(function (deps, calls) {
    deps.runtime.map.once = function (eventName) {
      calls.push(["map:once", eventName]);
    };
    deps.runtime.perf.enabled = false;
    deps.integrations.dashboards.loadNeighborhoods = function () {
      calls.push(["dashboards:loadNeighborhoods"]);
      return Promise.resolve({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {} }],
      });
    };
  });

  await harness.controller.switchMode("neighborhood");

  assert.ok(
    harness.calls.some(function (call) {
      return call[0] === "map:fitBounds";
    })
  );
  assert.equal(
    harness.calls.some(function (call) {
      return call[0] === "map:once";
    }),
    false
  );
});

test("mode controller public API only exposes app-consumed methods", () => {
  const harness = createModeControllerHarness();

  assert.deepEqual(Object.keys(harness.controller).sort(), [
    "addNeighborhoodLayers",
    "applyHouseModeHexBackground",
    "switchMode",
  ]);
  [
    "enterHouseMode",
    "enterNeighborhoodMode",
    "enterCitywideMode",
    "exitNeighborhoodMode",
    "setControlsForMode",
  ].forEach(function (memberName) {
    assert.equal(harness.controller[memberName], undefined);
  });
});

test("app constants are initialized before configure calls that read them", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const referenceRadiusIndex = appSource.indexOf("const URBAN95_REFERENCE_RADIUS_METERS");
  const fixedMinutesIndex = appSource.indexOf("const URBAN95_FIXED_MINUTES");
  const centroidGridIndex = appSource.indexOf("const BUILDING_CENTROID_GRID_CELL_DEGREES");
  const sidebarConfigureIndex = appSource.indexOf("Urban95ScoreSidebar.configure({");
  const selectionConfigureIndex = appSource.indexOf("Urban95Selection.configure({");

  assert.notEqual(referenceRadiusIndex, -1);
  assert.notEqual(fixedMinutesIndex, -1);
  assert.notEqual(centroidGridIndex, -1);
  assert.notEqual(sidebarConfigureIndex, -1);
  assert.notEqual(selectionConfigureIndex, -1);
  assert.ok(referenceRadiusIndex < sidebarConfigureIndex);
  assert.ok(referenceRadiusIndex < selectionConfigureIndex);
  assert.ok(fixedMinutesIndex < sidebarConfigureIndex);
  assert.ok(centroidGridIndex < selectionConfigureIndex);
});

test("amenities focus waits for authoritative tree and street-light GeoJSON before reselecting", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const runtimeSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "core", "runtimeData.js"),
    "utf8"
  );
  assert.match(runtimeSource, /createPointDataLoader/);
  assert.match(appSource, /createPointDataLoader/);
  assert.match(appSource, /pointDataLoader\./);
  assert.doesNotMatch(
    appSource,
    /function loadTreesIfNeeded\s*\(/
  );
  assert.doesNotMatch(
    appSource,
    /function loadStreetLightsIfNeeded\s*\(/
  );
  assert.match(
    appSource,
    /onPointDataLoaded:\s*function\s*\(kind,\s*data,\s*context\)\s*\{[\s\S]*var refreshPolicy = context && context\.refreshPolicy \? context\.refreshPolicy : "immediate";[\s\S]*if \(refreshPolicy === "defer"\) \{[\s\S]*return;\s*\}/
  );
});

test("mode controller keeps house cleanup centralized in switchMode", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const modeSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "modeController.js"),
    "utf8"
  );

  const neighborhoodStart = modeSource.indexOf("function enterNeighborhoodMode(token)");
  const neighborhoodEnd = modeSource.indexOf("function exitNeighborhoodMode()");
  const citywideStart = modeSource.indexOf("function enterCitywideMode(token)");
  const citywideEnd = modeSource.indexOf("function switchMode(mode)");

  assert.notEqual(neighborhoodStart, -1);
  assert.notEqual(neighborhoodEnd, -1);
  assert.notEqual(citywideStart, -1);
  assert.notEqual(citywideEnd, -1);

  const neighborhoodBody = modeSource.slice(neighborhoodStart, neighborhoodEnd);
  const citywideBody = modeSource.slice(citywideStart, citywideEnd);

  assert.match(modeSource, /if \(prevMode === "house"\) \{\s*selection\.clearRadiusSelection\(\);/);
  assert.doesNotMatch(neighborhoodBody, /clearRadiusSelection\(\);/);
  assert.doesNotMatch(citywideBody, /clearRadiusSelection\(\);/);
  assert.match(appSource, /function\s+switchMode\s*\(\s*mode\s*\)\s*\{[\s\S]*modeController\.switchMode\s*\(\s*mode\s*\)/);
  assert.doesNotMatch(appSource, /exitNeighborhoodMode/);
});

function createSelectionDeferredSidebarTestContext() {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/selection.js", browser);

  const calls = [];
  const perfRecords = [];
  const rafQueue = [];
  const moveendHandlers = [];
  const radiusSource = {
    setData(data) {
      const count =
        data && Array.isArray(data.features) ? data.features.length : data && data.type === "Feature" ? 1 : 0;
      calls.push([
        "radius:setData",
        data && data.properties && data.properties.building_id ? data.properties.building_id : count,
      ]);
    },
  };
  const selectedBuildingSource = {
    setData(data) {
      const buildingId =
        data &&
        Array.isArray(data.features) &&
        data.features[0] &&
        data.features[0].properties &&
        data.features[0].properties.building_id;
      calls.push(["building:setData", buildingId == null ? null : buildingId]);
    },
  };
  const state = {
    selectedBuildingVectorId: null,
    sidebarShellShown: false,
  };
  const isochroneIndex = {
    "87_5": {
      type: "Feature",
      properties: { building_id: 87, matchCoord: 1 },
      geometry: { type: "Polygon", coordinates: [] },
    },
    "88_5": {
      type: "Feature",
      properties: { building_id: 88, matchCoord: 2 },
      geometry: { type: "Polygon", coordinates: [] },
    },
  };
  const deps = {
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    map: {
      getSource(id) {
        return id === "radius-source" ? radiusSource : selectedBuildingSource;
      },
      getLayer() {
        return false;
      },
      easeTo(options) {
        calls.push(["easeTo", options.center[0], options.center[1], options.zoom]);
      },
      once(eventName, callback) {
        if (eventName === "moveend") moveendHandlers.push(callback);
      },
      getZoom() {
        return 15;
      },
      setFeatureState() {},
      removeFeatureState() {},
    },
    turf: {
      distance() {
        return 0;
      },
      bbox() {
        return [0, 0, 10, 10];
      },
      booleanPointInPolygon(coord, polygon) {
        return coord[0] === polygon.properties.matchCoord;
      },
    },
    urban95Perf: {
      phase(_name, fn) {
        return fn();
      },
      span(_name, _meta, fn) {
        return fn();
      },
      mark(name, meta) {
        perfRecords.push({ name, meta: typeof meta === "function" ? meta() : meta });
      },
    },
    hasGeneratedArtifact() {
      return false;
    },
    getScoreMode() {
      return "expanded";
    },
    getWalkMinutes() {
      return 5;
    },
    getIsochronesLoaded() {
      return true;
    },
    getIsochronesLookupMode() {
      return "legacy";
    },
    getIsochroneIndex() {
      return isochroneIndex;
    },
    compactIsochroneFeature() {
      throw new Error("compactIsochroneFeature should not run in this test");
    },
    getSelectedAmenityTypes() {
      return new Set(["park"]);
    },
    getAllFilterTypes() {
      return ["park"];
    },
    getAllAmenitiesData() {
      return {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { amenity_type: "park" },
            geometry: { type: "Point", coordinates: [1, 1] },
          },
          {
            type: "Feature",
            properties: { amenity_type: "park" },
            geometry: { type: "Point", coordinates: [2, 2] },
          },
          {
            type: "Feature",
            properties: { amenity_type: "park" },
            geometry: { type: "Point", coordinates: [2, 3] },
          },
        ],
      };
    },
    getAllTreesData() {
      return { type: "FeatureCollection", features: [] };
    },
    getAllStreetLightsData() {
      return { type: "FeatureCollection", features: [] };
    },
    radiusSourceId: "radius-source",
    selectedBuildingSourceId: "selected-building-source",
    getSelectedBuildingVectorId() {
      return state.selectedBuildingVectorId;
    },
    setSelectedBuildingVectorId(value) {
      state.selectedBuildingVectorId = value;
      calls.push(["setSelectedBuildingVectorId", value]);
    },
    setSelectedBuilding(building) {
      calls.push([
        "setSelectedBuilding",
        building && building.feature && building.feature.properties
          ? building.feature.properties.building_id
          : null,
      ]);
    },
    setAmenitiesInRadiusIds(value) {
      calls.push(["setAmenitiesInRadiusIds", Array.from(value.values()).sort((a, b) => a - b)]);
    },
    setTreesInRadiusIds(value) {
      calls.push(["setTreesInRadiusIds", value.size]);
    },
    setStreetLightsInRadiusIds(value) {
      calls.push(["setStreetLightsInRadiusIds", value.size]);
    },
    setLatestRadiusCounts(value) {
      calls.push(["setLatestRadiusCounts", value.park || 0]);
    },
    updateAmenitiesSource(meta) {
      calls.push(["updateAmenitiesSource", meta || null]);
    },
    updateTreesSource() {
      calls.push(["updateTreesSource"]);
    },
    updateStreetLightsSource() {
      calls.push(["updateStreetLightsSource"]);
    },
    showScoreExplainSidebarShell(building, options) {
      state.sidebarShellShown = true;
      calls.push([
        "showScoreExplainSidebarShell",
        building && building.feature && building.feature.properties
          ? building.feature.properties.building_id
          : null,
        options ? JSON.parse(JSON.stringify(options)) : null,
      ]);
    },
    syncScoreSidebar() {
      calls.push([
        "syncScoreSidebar",
        state.selectedBuildingVectorId,
      ]);
    },
    hideScoreSidebar(options) {
      calls.push(["hideScoreSidebar", options.restoreFocus]);
    },
    requestAnimationFrame(callback) {
      rafQueue.push(callback);
      calls.push(["requestAnimationFrame", rafQueue.length]);
      return rafQueue.length;
    },
    getZoomForPolygon(polygon) {
      calls.push([
        "getZoomForPolygon",
        polygon.properties.building_id || "radius",
        state.sidebarShellShown,
      ]);
      return polygon.properties.building_id === 87 ? 16 : 17;
    },
    getCurrentMode() {
      return "house";
    },
    radiusInfoEl: { style: { display: "block" } },
    hasRadiusSelectionState() {
      return false;
    },
  };

  const buildingA = {
    lng: 34.7941,
    lat: 31.25104,
    properties: { building_id: 87 },
    feature: {
      type: "Feature",
      properties: { building_id: 87 },
      geometry: { type: "Polygon", coordinates: [] },
    },
  };
  const buildingB = {
    lng: 34.795,
    lat: 31.252,
    properties: { building_id: 88 },
    feature: {
      type: "Feature",
      properties: { building_id: 88 },
      geometry: { type: "Polygon", coordinates: [] },
    },
  };

  browser.window.Urban95Selection.configure(deps);

  return {
    browser,
    calls,
    perfRecords,
    rafQueue,
    buildingA,
    buildingB,
    flushRafQueue() {
      while (rafQueue.length > 0) {
        rafQueue.shift()();
      }
    },
    flushMoveendHandlers() {
      while (moveendHandlers.length > 0) {
        moveendHandlers.shift()();
      }
    },
  };
}

test("selection commits selected building shell before deferred sidebar detail work", () => {
  const context = createSelectionDeferredSidebarTestContext();

  context.browser.window.Urban95Selection.selectBuilding(context.buildingA, true);
  context.browser.window.Urban95Selection.selectBuilding(context.buildingB, false);
  const preFlushCalls = context.calls.slice();

  assert.deepEqual(
    preFlushCalls.filter((call) => call[0] === "setSelectedBuilding").map((call) => call[1]),
    [87, 88]
  );
  assert.deepEqual(
    preFlushCalls.filter((call) => call[0] === "building:setData").map((call) => call[1]),
    [87, 88]
  );
  assert.deepEqual(
    preFlushCalls.filter((call) => call[0] === "radius:setData").map((call) => call[1]),
    [87, 88]
  );
  assert.deepEqual(
    preFlushCalls.filter((call) => call[0] === "showScoreExplainSidebarShell"),
    [
      ["showScoreExplainSidebarShell", 87, { preserveExistingDetail: true, reason: "amenitiesHouseSwitch" }],
      ["showScoreExplainSidebarShell", 88, { preserveExistingDetail: true, reason: "amenitiesHouseSwitch" }],
    ]
  );
  assert.equal(
    preFlushCalls.some((call) => call[0] === "syncScoreSidebar"),
    false
  );
  assert.equal(
    preFlushCalls.some((call) => call[0] === "setAmenitiesInRadiusIds"),
    false
  );
  assert.equal(
    preFlushCalls.some((call) => call[0] === "setLatestRadiusCounts"),
    false
  );
  assert.equal(
    preFlushCalls.some((call) => call[0] === "updateAmenitiesSource"),
    false
  );
  assert.equal(
    preFlushCalls.some((call) => call[0] === "updateTreesSource"),
    false
  );
  assert.equal(
    preFlushCalls.some((call) => call[0] === "updateStreetLightsSource"),
    false
  );
  assert.deepEqual(
    preFlushCalls.slice(0, 11),
    [
      ["setSelectedBuilding", 87],
      ["setSelectedBuildingVectorId", 87],
      ["building:setData", 87],
      ["getZoomForPolygon", 87, false],
      ["radius:setData", 87],
      ["showScoreExplainSidebarShell", 87, { preserveExistingDetail: true, reason: "amenitiesHouseSwitch" }],
      ["requestAnimationFrame", 1],
      ["easeTo", 34.7941, 31.25104, 16],
      ["setSelectedBuilding", 88],
      ["setSelectedBuildingVectorId", 88],
      ["building:setData", 88],
    ]
  );
  assert.deepEqual(
    preFlushCalls.slice(11, 13),
    [
      ["radius:setData", 88],
      ["showScoreExplainSidebarShell", 88, { preserveExistingDetail: true, reason: "amenitiesHouseSwitch" }],
    ]
  );
  assert.deepEqual(
    preFlushCalls.filter((call) => call[0] === "getZoomForPolygon"),
    [["getZoomForPolygon", 87, false]]
  );

  context.flushMoveendHandlers();

  const easeStartRecords = context.perfRecords.filter((record) => record.name === "selection:easeTo:start");
  const easeMoveendRecords = context.perfRecords.filter((record) => record.name === "selection:easeTo:moveend");
  assert.deepEqual(easeStartRecords.map((record) => record.meta.buildingId), [87]);
  assert.deepEqual(easeMoveendRecords.map((record) => record.meta.buildingId), [87]);
  assert.equal(easeStartRecords[0].meta.cameraToken, 1);
  assert.equal(easeStartRecords[0].meta.zoom, 16);
  assert.equal(easeMoveendRecords[0].meta.cameraToken, 1);
  assert.equal(easeMoveendRecords[0].meta.staleCameraToken, true);

  context.flushRafQueue();

  assert.deepEqual(
    context.calls.filter((call) => call[0] === "syncScoreSidebar").map((call) => call[1]),
    [88]
  );
  assert.equal(
    context.calls.some((call) => call[0] === "syncScoreSidebar" && call[1] === 87),
    false
  );
  assert.deepEqual(
    context.calls.filter((call) => call[0] === "setAmenitiesInRadiusIds").map((call) => call[1]),
    [[1, 2]]
  );
  assert.deepEqual(
    context.calls.filter((call) => call[0] === "setLatestRadiusCounts").map((call) => call[1]),
    [2]
  );
});

test("selection defers deck rebuild metadata only for flying house refreshes", () => {
  const flyContext = createSelectionDeferredSidebarTestContext();
  flyContext.browser.window.Urban95Selection.selectBuilding(flyContext.buildingA, true);
  flyContext.flushRafQueue();

  const flyRefresh = flyContext.calls.find((call) => call[0] === "updateAmenitiesSource");
  assert.equal(flyRefresh[1].caller, "selection:pointSourceRefresh");
  assert.equal(flyRefresh[1].selectedBuildingId, 87);
  assert.equal(flyRefresh[1].deferDeckRender, true);

  const reselectContext = createSelectionDeferredSidebarTestContext();
  reselectContext.browser.window.Urban95Selection.selectBuilding(reselectContext.buildingA, false);
  reselectContext.flushRafQueue();

  const reselectRefresh = reselectContext.calls.find((call) => call[0] === "updateAmenitiesSource");
  assert.equal(reselectRefresh[1].caller, "selection:pointSourceRefresh");
  assert.equal(reselectRefresh[1].selectedBuildingId, 87);
  assert.notEqual(reselectRefresh[1].deferDeckRender, true);
});

test("selection clear invalidates deferred selected-building work", () => {
  const context = createSelectionDeferredSidebarTestContext();

  context.browser.window.Urban95Selection.selectBuilding(context.buildingA, true);
  context.browser.window.Urban95Selection.clearRadiusSelection();
  context.flushRafQueue();

  assert.deepEqual(
    context.calls.filter((call) => call[0] === "showScoreExplainSidebarShell").map((call) => call[1]),
    [87]
  );
  assert.equal(
    context.calls.some((call) => call[0] === "syncScoreSidebar"),
    false
  );
  assert.equal(
    context.calls.some((call) => call[0] === "syncScoreSidebar" && call[1] === 87),
    false
  );
  assert.deepEqual(
    context.calls.filter((call) => call[0] === "setAmenitiesInRadiusIds").map((call) => call[1]),
    [[]]
  );
  assert.deepEqual(
    context.calls.filter((call) => call[0] === "setLatestRadiusCounts").map((call) => call[1]),
    [0]
  );

  context.flushMoveendHandlers();

  const easeMoveendRecords = context.perfRecords.filter((record) => record.name === "selection:easeTo:moveend");
  assert.deepEqual(easeMoveendRecords.map((record) => record.meta.buildingId), [87]);
  assert.equal(easeMoveendRecords[0].meta.cameraToken, 1);
  assert.equal(easeMoveendRecords[0].meta.staleCameraToken, true);
});

test("selection pending-isochrone path tags the loading overlay reason", () => {
  const browser = createBrowserContext({
    performance: {
      now() {
        return 1;
      },
    },
  });
  runBrowserScript("docs/js/map/selection.js", browser);

  const showOverlayCalls = [];
  const calls = [];
  let isochroneLoadPromise = null;
  const deps = {
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    map: {
      getSource() {
        return {
          setData(data) {
            const count = data && Array.isArray(data.features) ? data.features.length : 0;
            calls.push(["radius:setData", count]);
          },
        };
      },
      getLayer() {
        return false;
      },
      easeTo() {},
      getZoom() {
        return 15;
      },
      setFeatureState() {},
      removeFeatureState() {},
    },
    turf: {
      distance() {
        return 0;
      },
      circle() {
        return { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: {} };
      },
    },
    urban95Perf: {
      phase(_name, fn) {
        return fn();
      },
      span(_name, _meta, fn) {
        return fn();
      },
      mark() {},
    },
    hasGeneratedArtifact() {
      return false;
    },
    getScoreMode() {
      return "expanded";
    },
    getWalkMinutes() {
      return 10;
    },
    getIsochronesLoaded() {
      return false;
    },
    getIsochroneLoadPromise() {
      return isochroneLoadPromise;
    },
    setIsochroneLoadPromise(value) {
      isochroneLoadPromise = value;
      calls.push(["setIsochroneLoadPromise", value ? "set" : "clear"]);
    },
    setLoadingStatus(message) {
      calls.push(["setLoadingStatus", message]);
    },
    loadIsochronesLookup() {
      calls.push(["loadIsochronesLookup"]);
      return new Promise(function () {});
    },
    fetchJsonWithGzipFallback() {
      throw new Error("fetchJsonWithGzipFallback should not run in this test");
    },
    isochronesUrl: "./data/isochrones.geojson",
    getSelectedBuilding() {
      return null;
    },
    radiusSourceId: "radius-source",
    selectedBuildingSourceId: "selected-building-source",
    getSelectedBuildingVectorId() {
      return null;
    },
    setSelectedBuildingVectorId() {},
    setSelectedBuilding() {},
    setAmenitiesInRadiusIds() {},
    setTreesInRadiusIds() {},
    setStreetLightsInRadiusIds() {},
    setLatestRadiusCounts() {},
    updateAmenitiesSource() {
      calls.push(["updateAmenitiesSource"]);
    },
    updateTreesSource() {
      calls.push(["updateTreesSource"]);
    },
    updateStreetLightsSource() {
      calls.push(["updateStreetLightsSource"]);
    },
    showScoreExplainSidebarShell(_building, options) {
      calls.push(["showScoreExplainSidebarShell", options || null]);
    },
    syncScoreSidebar() {},
    hideScoreSidebar() {},
    requestAnimationFrame(callback) {
      calls.push(["requestAnimationFrame"]);
      return callback();
    },
    getZoomForPolygon() {
      return 16;
    },
    getCurrentMode() {
      return "house";
    },
    radiusInfoEl: { style: { display: "block" } },
    hasRadiusSelectionState() {
      return false;
    },
    showIsochroneLoadingScreen(meta) {
      showOverlayCalls.push(meta);
    },
    getWaitingForIsochroneLoad() {
      return false;
    },
    hideIsochroneLoadingScreen() {},
    markIsochronesLoaded() {},
    setIsochroneIndex() {},
    setIsochronesLookupMode() {},
    setIsochronesLoaded() {},
    compactIsochroneFeature() {
      throw new Error("compactIsochroneFeature should not run in this test");
    },
  };

  browser.window.Urban95Selection.configure(deps);
  browser.window.Urban95Selection.selectBuilding(
    { lng: 34.8, lat: 31.2, properties: { building_id: 7 }, feature: { type: "Feature" } },
    false
  );

  assert.equal(showOverlayCalls.length, 1);
  assert.equal(showOverlayCalls[0].reason, "selectedBuildingPendingIsochrones");
  assert.deepEqual(
    calls.filter((call) => call[0] === "showScoreExplainSidebarShell"),
    [["showScoreExplainSidebarShell", null]]
  );
  assert.ok(calls.some((call) => call[0] === "loadIsochronesLookup"));
});

test("selection pending-isochrone path can suppress the global overlay while preserving pending radius and source refresh work", () => {
  const browser = createBrowserContext({
    performance: {
      now() {
        return 1;
      },
    },
  });
  runBrowserScript("docs/js/map/selection.js", browser);

  const calls = [];
  const showOverlayCalls = [];
  let isochroneLoadPromise = null;
  const deps = {
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    map: {
      getSource() {
        return {
          setData(data) {
            const count = Array.isArray(data && data.features) ? data.features.length : 0;
            calls.push(["setData", count]);
          },
        };
      },
      getLayer() {
        return false;
      },
      easeTo() {
        calls.push(["easeTo"]);
      },
      getZoom() {
        return 15;
      },
      setFeatureState() {},
      removeFeatureState() {},
    },
    turf: {
      distance() {
        return 0;
      },
      circle() {
        return { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: {} };
      },
    },
    urban95Perf: {
      phase(_name, fn) {
        return fn();
      },
      span(_name, _meta, fn) {
        return fn();
      },
      mark() {},
    },
    hasGeneratedArtifact() {
      return false;
    },
    getScoreMode() {
      return "expanded";
    },
    getWalkMinutes() {
      return 10;
    },
    getIsochronesLoaded() {
      return false;
    },
    getIsochroneLoadPromise() {
      return isochroneLoadPromise;
    },
    setIsochroneLoadPromise(value) {
      isochroneLoadPromise = value;
      calls.push(["setIsochroneLoadPromise", value ? "set" : "clear"]);
    },
    setLoadingStatus(message) {
      calls.push(["setLoadingStatus", message]);
    },
    loadIsochronesLookup() {
      calls.push(["loadIsochronesLookup"]);
      return new Promise(function () {});
    },
    fetchJsonWithGzipFallback() {
      throw new Error("fetchJsonWithGzipFallback should not run in this test");
    },
    isochronesUrl: "./data/isochrones.geojson",
    getSelectedBuilding() {
      return null;
    },
    radiusSourceId: "radius-source",
    selectedBuildingSourceId: "selected-building-source",
    getSelectedBuildingVectorId() {
      return null;
    },
    setSelectedBuildingVectorId() {},
    setSelectedBuilding(building) {
      calls.push(["setSelectedBuilding", building && building.properties ? building.properties.building_id : null]);
    },
    setAmenitiesInRadiusIds(value) {
      calls.push(["setAmenitiesInRadiusIds", value.size]);
    },
    setTreesInRadiusIds(value) {
      calls.push(["setTreesInRadiusIds", value.size]);
    },
    setStreetLightsInRadiusIds(value) {
      calls.push(["setStreetLightsInRadiusIds", value.size]);
    },
    setLatestRadiusCounts(value) {
      calls.push(["setLatestRadiusCounts", Object.keys(value).length]);
    },
    updateAmenitiesSource() {
      calls.push(["updateAmenitiesSource"]);
    },
    updateTreesSource() {
      calls.push(["updateTreesSource"]);
    },
    updateStreetLightsSource() {
      calls.push(["updateStreetLightsSource"]);
    },
    showScoreExplainSidebarShell(_building, options) {
      calls.push(["showScoreExplainSidebarShell", options || null]);
    },
    syncScoreSidebar() {},
    hideScoreSidebar() {},
    requestAnimationFrame(callback) {
      calls.push(["requestAnimationFrame"]);
      return callback();
    },
    getZoomForPolygon() {
      return 16;
    },
    getCurrentMode() {
      return "house";
    },
    radiusInfoEl: { style: { display: "block" } },
    hasRadiusSelectionState() {
      return false;
    },
    showIsochroneLoadingScreen(meta) {
      showOverlayCalls.push(meta);
    },
    getWaitingForIsochroneLoad() {
      return false;
    },
    hideIsochroneLoadingScreen() {},
    markIsochronesLoaded() {},
    setIsochroneIndex() {},
    setIsochronesLookupMode() {},
    setIsochronesLoaded() {},
    compactIsochroneFeature() {
      throw new Error("compactIsochroneFeature should not run in this test");
    },
  };

  browser.window.Urban95Selection.configure(deps);
  browser.window.Urban95Selection.selectBuilding(
    { lng: 34.8, lat: 31.2, properties: { building_id: 7 }, feature: { type: "Feature" } },
    false,
    { suppressIsochroneLoadingOverlay: true }
  );

  assert.deepEqual(showOverlayCalls, []);
  assert.ok(calls.some((call) => call[0] === "setData" && call[1] === 0));
  assert.deepEqual(
    calls.filter((call) => call[0] === "showScoreExplainSidebarShell"),
    [["showScoreExplainSidebarShell", null]]
  );
  assert.ok(calls.some((call) => call[0] === "loadIsochronesLookup"));
  assert.ok(calls.some((call) => call[0] === "setLoadingStatus" && call[1] === "Loading walking areas..."));
});

test("background isochrone failure does not poison a later direct selected-building retry", async () => {
  const consoleErrors = [];
  const browser = createBrowserContext({
    performance: {
      now() {
        return 1;
      },
    },
    setTimeout(callback) {
      callback();
      return 1;
    },
    console: {
      log() {},
      error() {
        consoleErrors.push(Array.from(arguments));
      },
    },
  });
  runBrowserScript("docs/js/map/selection.js", browser);
  runBrowserScript("docs/js/ui/controlActions.js", browser);

  const calls = [];
  const overlayCalls = [];
  const selectedBuilding = {
    lng: 34.8,
    lat: 31.2,
    properties: { building_id: 7 },
    feature: { type: "Feature", properties: { building_id: 7 } },
  };
  let isochroneLoadPromise = null;
  let isochronesLoaded = false;
  let selectedBuildingState = selectedBuilding;
  let shouldFailLookup = true;

  browser.window.Urban95Selection.configure({
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    map: {
      getSource() {
        return {
          setData(data) {
            const count = Array.isArray(data && data.features) ? data.features.length : 0;
            calls.push(["setData", count]);
          },
        };
      },
      getLayer() {
        return false;
      },
      easeTo() {
        calls.push(["easeTo"]);
      },
      getZoom() {
        return 15;
      },
      setFeatureState() {},
      removeFeatureState() {},
    },
    turf: {
      distance() {
        return 0;
      },
      circle() {
        return { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: {} };
      },
    },
    urban95Perf: {
      phase(_name, fn) {
        return fn();
      },
      span(_name, _meta, fn) {
        return fn();
      },
      mark() {},
    },
    hasGeneratedArtifact() {
      return false;
    },
    getScoreMode() {
      return "expanded";
    },
    getWalkMinutes() {
      return 10;
    },
    getIsochronesLoaded() {
      return isochronesLoaded;
    },
    getIsochroneLoadPromise() {
      return isochroneLoadPromise;
    },
    setIsochroneLoadPromise(value) {
      isochroneLoadPromise = value;
      calls.push(["setIsochroneLoadPromise", value ? "set" : "clear"]);
    },
    setLoadingStatus(message) {
      calls.push(["setLoadingStatus", message]);
    },
    loadIsochronesLookup() {
      calls.push(["loadIsochronesLookup", shouldFailLookup ? "fail" : "retry"]);
      if (shouldFailLookup) {
        return Promise.reject(new Error("lookup failed"));
      }
      return new Promise(function () {});
    },
    fetchJsonWithGzipFallback() {
      throw new Error("fetchJsonWithGzipFallback should not run in this test");
    },
    isochronesUrl: "./data/isochrones.geojson",
    getSelectedBuilding() {
      return selectedBuildingState;
    },
    radiusSourceId: "radius-source",
    selectedBuildingSourceId: "selected-building-source",
    getSelectedBuildingVectorId() {
      return null;
    },
    setSelectedBuildingVectorId() {},
    setSelectedBuilding(building) {
      selectedBuildingState = building;
      calls.push(["setSelectedBuilding", building && building.properties ? building.properties.building_id : null]);
    },
    setAmenitiesInRadiusIds() {},
    setTreesInRadiusIds() {},
    setStreetLightsInRadiusIds() {},
    setLatestRadiusCounts() {},
    updateAmenitiesSource() {
      calls.push(["updateAmenitiesSource"]);
    },
    updateTreesSource() {
      calls.push(["updateTreesSource"]);
    },
    updateStreetLightsSource() {
      calls.push(["updateStreetLightsSource"]);
    },
    showScoreExplainSidebarShell() {
      calls.push(["showScoreExplainSidebarShell"]);
    },
    syncScoreSidebar() {},
    hideScoreSidebar() {},
    requestAnimationFrame(callback) {
      return callback();
    },
    getZoomForPolygon() {
      return 16;
    },
    getCurrentMode() {
      return "house";
    },
    radiusInfoEl: { style: { display: "block" } },
    hasRadiusSelectionState() {
      return false;
    },
    showIsochroneLoadingScreen(meta) {
      overlayCalls.push(meta);
    },
    getWaitingForIsochroneLoad() {
      return overlayCalls.length > 0;
    },
    hideIsochroneLoadingScreen() {
      calls.push(["hideIsochroneLoadingScreen"]);
    },
    markIsochronesLoaded() {
      calls.push(["markIsochronesLoaded"]);
    },
    setIsochroneIndex() {},
    setIsochronesLookupMode() {},
    setIsochronesLoaded(value) {
      isochronesLoaded = value;
      calls.push(["setIsochronesLoaded", value]);
    },
    compactIsochroneFeature() {
      throw new Error("compactIsochroneFeature should not run in this test");
    },
  });

  const actions = browser.window.Urban95ControlActions.create({
    perf: {
      session() {},
      mark() {},
      phase(_name, callback) {
        return callback();
      },
      span(_name, _meta, callback) {
        return callback();
      },
    },
    state: {
      getCurrentMode: () => "house",
      getScoreMode: () => "expanded",
      getActiveHeatmapId: () => "u95.overall",
      setActiveHeatmapId: () => {},
      getSelectedBuilding: () => selectedBuildingState,
      getSelectedNeighborhood: () => null,
      clearDerivedCaches: () => {},
      getIsochronesLoaded: () => isochronesLoaded,
      setIsochronesDeferred: () => calls.push(["setIsochronesDeferred"]),
    },
    pointDataLoader: {
      canRefreshPointAnalysisAfterPointDataLoad: () => true,
    },
    loadingUi: {
      showIsochroneLoadingScreen(meta) {
        overlayCalls.push(meta);
      },
      getWaitingForIsochroneLoad() {
        return overlayCalls.length > 0;
      },
      hideIsochroneLoadingScreen() {
        calls.push(["loadingUi.hideIsochroneLoadingScreen"]);
      },
      mark() {},
    },
    amenityMode: {
      apply: () => Promise.resolve({ refreshedSelectedBuilding: false }),
    },
    renderers: {
      applyShowPointsToggle: () => {},
      updateAmenitiesSource: () => {},
      updateTreesSource: () => {},
      updateStreetLightsSource: () => {},
      updateBuildingColors: () => {},
      updateNeighborhoodSurfaceData: () => {},
      updateNeighborhoodColors: () => {},
    },
    selection: {
      loadIsochrones: browser.window.Urban95Selection.loadIsochrones,
      selectBuilding: browser.window.Urban95Selection.selectBuilding,
      updateRadiusInfo: () => {},
      clearRadiusSelection: () => {},
    },
    citySidebar: createCitySidebarControlStub(),
    scoreSidebar: {
      isOpen: () => false,
      hide: () => {},
    },
    neighborhoodSidebar: {
      show: () => {},
      sync: () => {},
      hide: () => {},
      isOpen: () => false,
    },
    compareApply: {
      resync: () => {},
      clearAll: () => {},
    },
    modeController: {
      switchMode: () => {},
    },
    map: {
      getLayer: () => false,
      setLayoutProperty: () => {},
    },
    ui: {
      clearTooltip: () => {},
    },
  });

  await actions.onScoreModeChanged("expanded");
  await new Promise(function (resolve) {
    setImmediate(resolve);
  });

  assert.deepEqual(overlayCalls, []);
  assert.ok(calls.some((call) => call[0] === "loadIsochronesLookup" && call[1] === "fail"));
  assert.ok(consoleErrors.length >= 1);
  assert.ok(
    consoleErrors.some(function (entry) {
      var text = entry
        .map(function (value) {
          if (value && typeof value.message === "string") return value.message;
          return value == null ? "" : String(value);
        })
        .join(" ");
      return text.trim().length > 0;
    })
  );

  shouldFailLookup = false;
  browser.window.Urban95Selection.selectBuilding(selectedBuilding, false);

  assert.equal(overlayCalls.length, 1);
  assert.equal(overlayCalls[0].reason, "selectedBuildingPendingIsochrones");
  assert.ok(calls.some((call) => call[0] === "setLoadingStatus" && call[1] === "Loading walking areas..."));
  assert.deepEqual(
    calls.filter((call) => call[0] === "loadIsochronesLookup").map((call) => call[1]),
    ["fail", "retry"]
  );
});

test("selection clearRadiusSelection uses injected radius-state guard for no-op clears", () => {
  const selectionSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "selection.js"),
    "utf8"
  );

  assert.match(selectionSource, /hasRadiusOverlayData/);
  assert.match(selectionSource, /hasSelectedBuildingOverlayData/);
  assert.match(
    selectionSource,
    /deps\.hasRadiusSelectionState\s*=\s*typeof deps\.hasRadiusSelectionState === "function"/
  );
});

test("selection clearRadiusSelection no-ops only when state and overlay sources are already empty", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/selection.js", browser);

  const calls = [];
  const radiusSource = {
    setData(data) {
      calls.push(["radius:setData", data.type]);
    },
  };
  const selectedBuildingSource = {
    setData(data) {
      calls.push(["building:setData", data.type]);
    },
  };
  let hasRadiusSelectionState = false;
  const deps = {
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    map: {
      getSource(id) {
        return id === "radius-source" ? radiusSource : selectedBuildingSource;
      },
      getLayer() {
        return false;
      },
      setFeatureState() {},
      removeFeatureState() {},
    },
    radiusSourceId: "radius-source",
    selectedBuildingSourceId: "selected-building-source",
    hasGeneratedArtifact() {
      return false;
    },
    hasRadiusSelectionState() {
      return hasRadiusSelectionState;
    },
    setSelectedBuilding(value) {
      calls.push(["setSelectedBuilding", value]);
    },
    getSelectedBuildingVectorId() {
      return null;
    },
    setSelectedBuildingVectorId(value) {
      calls.push(["setSelectedBuildingVectorId", value]);
    },
    setAmenitiesInRadiusIds(value) {
      calls.push(["setAmenitiesInRadiusIds", value.size]);
    },
    setTreesInRadiusIds(value) {
      calls.push(["setTreesInRadiusIds", value.size]);
    },
    setStreetLightsInRadiusIds(value) {
      calls.push(["setStreetLightsInRadiusIds", value.size]);
    },
    setLatestRadiusCounts(value) {
      calls.push(["setLatestRadiusCounts", Object.keys(value).length]);
    },
    updateAmenitiesSource() {
      calls.push(["updateAmenitiesSource"]);
    },
    updateTreesSource() {
      calls.push(["updateTreesSource"]);
    },
    updateStreetLightsSource() {
      calls.push(["updateStreetLightsSource"]);
    },
    radiusInfoEl: { style: { display: "block" } },
    hideScoreSidebar(options) {
      calls.push(["hideScoreSidebar", options.restoreFocus]);
    },
  };

  browser.window.Urban95Selection.configure(deps);
  browser.window.Urban95Selection.clearRadiusSelection();
  assert.deepEqual(calls, []);

  hasRadiusSelectionState = true;
  browser.window.Urban95Selection.clearRadiusSelection();
  assert.ok(calls.some((call) => call[0] === "radius:setData"));
  assert.ok(calls.some((call) => call[0] === "building:setData"));
  assert.equal(deps.radiusInfoEl.style.display, "none");

  calls.length = 0;
  hasRadiusSelectionState = false;
  browser.window.Urban95Selection.clearRadiusSelection();
  assert.deepEqual(calls, []);
});

test("selection clearRadiusSelection clears module-owned overlay data even when app state is already empty", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/selection.js", browser);

  const calls = [];
  const radiusSource = {
    setData(data) {
      calls.push(["radius:setData", data.type]);
    },
  };
  const selectedBuildingSource = {
    setData(data) {
      calls.push(["building:setData", data.type]);
    },
  };
  const deps = {
    renderState: loadRenderState(browser),
    showRegistry: loadShowRegistry(browser),
    map: {
      getSource(id) {
        return id === "radius-source" ? radiusSource : selectedBuildingSource;
      },
      getLayer() {
        return false;
      },
      easeTo() {
        calls.push(["easeTo"]);
      },
      getZoom() {
        return 15;
      },
      setFeatureState() {},
      removeFeatureState() {},
    },
    radiusSourceId: "radius-source",
    selectedBuildingSourceId: "selected-building-source",
    hasRadiusSelectionState() {
      return false;
    },
    hasGeneratedArtifact() {
      return false;
    },
    getScoreMode() {
      return "weighted";
    },
    getSelectedBuildingVectorId() {
      return null;
    },
    setSelectedBuilding(value) {
      calls.push(["setSelectedBuilding", value]);
    },
    setSelectedBuildingVectorId(value) {
      calls.push(["setSelectedBuildingVectorId", value]);
    },
    setAmenitiesInRadiusIds(value) {
      calls.push(["setAmenitiesInRadiusIds", value.size]);
    },
    setTreesInRadiusIds(value) {
      calls.push(["setTreesInRadiusIds", value.size]);
    },
    setStreetLightsInRadiusIds(value) {
      calls.push(["setStreetLightsInRadiusIds", value.size]);
    },
    setLatestRadiusCounts(value) {
      calls.push(["setLatestRadiusCounts", Object.keys(value).length]);
    },
    updateAmenitiesSource() {
      calls.push(["updateAmenitiesSource"]);
    },
    updateTreesSource() {
      calls.push(["updateTreesSource"]);
    },
    updateStreetLightsSource() {
      calls.push(["updateStreetLightsSource"]);
    },
    radiusInfoEl: { style: { display: "block" } },
    hideScoreSidebar(options) {
      calls.push(["hideScoreSidebar", options.restoreFocus]);
    },
    syncScoreSidebar() {},
    getCurrentMode() {
      return "house";
    },
    turf: {
      circle() {
        return { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: {} };
      },
    },
    urban95Perf: {
      phase(_name, fn) {
        return fn();
      },
    },
    getZoomForPolygon() {
      return 16;
    },
  };

  browser.window.Urban95Selection.configure(deps);
  browser.window.Urban95Selection.selectBuilding(
    { lng: 34.8, lat: 31.2, properties: { building_id: 7 }, feature: { type: "Feature" } },
    false
  );
  calls.length = 0;

  browser.window.Urban95Selection.clearRadiusSelection();
  assert.ok(calls.some((call) => call[0] === "radius:setData"));
  assert.ok(calls.some((call) => call[0] === "building:setData"));
  assert.equal(deps.radiusInfoEl.style.display, "none");
});

test("task-4 app coordinator uses exported building source/layer/state contracts", () => {
  const appSource = readAppCoordinatorSource();
  const selectionSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "selection.js"),
    "utf8"
  );
  const mapShellSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "mapShell.js"),
    "utf8"
  );
  assert.match(appSource, /(?:const|var) BUILDING_LAYER_CONTRACTS = resolveBuildingContracts\(\{/);
  assert.match(appSource, /(?:const|var) BUILDINGS_MAP_SOURCE_ID = BUILDING_LAYER_CONTRACTS\.sourceId;/);
  assert.match(appSource, /(?:const|var) BUILDINGS_FILL_LAYER_ID = BUILDING_LAYER_CONTRACTS\.fillLayerId;/);
  assert.match(appSource, /(?:const|var) BUILDINGS_SELECTED_STATE_KEY = BUILDING_LAYER_CONTRACTS\.selectedStateKey;/);
  assert.match(mapShellSource, /\[opts\.buildingsMapSourceId \|\| "buildings"\]: opts\.buildingsSource/);
  assert.match(appSource, /buildingsSelectedStateKey:\s*BUILDINGS_SELECTED_STATE_KEY/);
  assert.match(selectionSource, /Object\.fromEntries\(\[\[d\.buildingsSelectedStateKey,\s*false\]\]\)/);
  assert.match(selectionSource, /Object\.fromEntries\(\[\[d\.buildingsSelectedStateKey,\s*true\]\]\)/);
  assert.doesNotMatch(appSource, /\{\s*selected:\s*(?:false|true)\s*\}/);
});

test("task-7 selection receives coordinator-owned source ids explicitly", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const selectionSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "selection.js"),
    "utf8"
  );
  assert.match(appSource, /selectedBuildingSourceId:\s*"selected-building"/);
  assert.match(appSource, /radiusSourceId:\s*"radius-circle"/);
  assert.match(selectionSource, /d\.map\.getSource\(d\.selectedBuildingSourceId\)/);
  assert.match(selectionSource, /d\.map\.getSource\(d\.radiusSourceId\)/);
  assert.doesNotMatch(selectionSource, /getSource\("selected-building"\)/);
  assert.doesNotMatch(selectionSource, /getSource\("radius-circle"\)/);
});

test("controls bind validates dependencies and returns the coordinator surface", () => {
  const browser = createBrowserContext();
  const listeners = [];
  const elementById = {};
  const makeElement = function (id) {
    const el = {
      id: id || "",
      style: {},
      disabled: false,
      hidden: false,
      textContent: "",
      innerHTML: "",
      className: "",
      checked: true,
      dataset: {},
      classList: {
        _classes: new Set(),
        add(name) {
          this._classes.add(name);
        },
        remove(name) {
          this._classes.delete(name);
        },
        contains(name) {
          return this._classes.has(name);
        },
        toggle(name, force) {
          if (force === true) {
            this._classes.add(name);
            return true;
          }
          if (force === false) {
            this._classes.delete(name);
            return false;
          }
          if (this._classes.has(name)) {
            this._classes.delete(name);
            return false;
          }
          this._classes.add(name);
          return true;
        },
      },
      addEventListener(type, handler) {
        listeners.push({ type, handler });
      },
      setAttribute() {},
      contains() {
        return false;
      },
      querySelector(selector) {
        const idMatch = typeof selector === "string" ? selector.match(/^#([\w-]+)$/) : null;
        return idMatch ? elementById[idMatch[1]] || null : null;
      },
      querySelectorAll() {
        return [];
      },
      appendChild() {},
      getBoundingClientRect() {
        return { width: 320 };
      },
    };
    if (id) elementById[id] = el;
    return el;
  };
  browser.window.document.addEventListener = function (type, handler) {
    listeners.push({ type, handler });
  };
  browser.window.addEventListener = function (type, handler) {
    listeners.push({ type, handler });
  };

  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/scoring/weightedIndicatorIcons.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarMarkup.js", browser);
  runBrowserScript("docs/js/ui/weightedMetricShowRegistry.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarShow.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarFilters.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarIndicators.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarSections.js", browser);
  runBrowserScript("docs/js/ui/controls.js", browser);

  assert.throws(
    () => browser.window.Urban95Controls.bind({}),
    /Urban95Controls\.bind missing required dependency: elements/
  );

  const bodyEl = makeElement();
  Object.defineProperty(bodyEl, "innerHTML", {
    configurable: true,
    enumerable: true,
    get() {
      return bodyEl._html || "";
    },
    set(value) {
      bodyEl._html = value;
      const idMatches = String(value).match(/id="([^"]+)"/g) || [];
      idMatches.forEach(function (match) {
        makeElement(match.slice(4, -1));
      });
    },
  });
  bodyEl.dataset = {};

  runBrowserScript("docs/js/core/appState.js", browser);
  const appState = browser.window.Urban95AppState.create();
  appState.setSelectedAmenityTypes(new Set(["trees"]));
  appState.setAllFilterTypes(["trees", "street-lights"]);
  let scoreMode = "weighted";
  let currentMode = "house";
  const binding = browser.window.Urban95Controls.bind({
    elements: {
      bodyEl,
      sidebarEl: makeElement(),
      legendEl: makeElement(),
      filterBackdrop: makeElement(),
    },
    scoreModel: browser.window.Urban95ScoreModel,
    showRegistry: loadShowRegistry(browser),
    getState() {
      return {
        scoreMode,
        currentMode,
        selectedAmenityTypes: appState.getSelectedAmenityTypes(),
        allFilterTypes: appState.getAllFilterTypes(),
        lastFilterRadioSelection: appState.getLastFilterRadioSelection(),
        layerVisibility: {},
      };
    },
    setScoreMode() {},
    setWalkMinutes() {},
    setSelectedAmenityTypes(value) {
      appState.setSelectedAmenityTypes(value);
    },
    setAllFilterTypes(value) {
      appState.setAllFilterTypes(value);
    },
    setLastFilterRadioSelection(value) {
      appState.setLastFilterRadioSelection(value);
    },
    getTypesWithData() {
      return new Set();
    },
    getAllTreesData() {
      return null;
    },
    getAllStreetLightsData() {
      return null;
    },
    callbacks: {
      onFilterSelectionChanged() {},
      onScoreModeChanged() {},
      onWalkMinutesChanged() {},
      onModeToggleRequested() {},
      onPointVisibilityChanged() {},
      onSurveyVisibilityChanged() {},
      onHeatmapSelectionChanged() {},
      onEscape() {},
      onMetricShowRequested() {},
      isMetricShowEnabled() {
        return false;
      },
      clearDerivedCaches() {},
    },
  });

  [
    "getScoreModeLabel",
    "updateFilterLabel",
    "buildFilterItems",
    "closeFilterPopup",
    "syncFilterUiForScoreMode",
    "syncOverlayVisibility",
  ].forEach(function (memberName) {
    assert.equal(typeof binding[memberName], "function");
  });

  const ui = binding.getUiElements();
  binding.syncOverlayVisibility();
  assert.equal(ui.indicatorsSection.classList.contains("is-basemap-only"), false);

  currentMode = "neighborhood";
  binding.syncOverlayVisibility();
  assert.equal(ui.indicatorsSection.classList.contains("is-basemap-only"), false);

  currentMode = "citywide";
  binding.syncOverlayVisibility();
  assert.equal(ui.indicatorsSection.classList.contains("is-basemap-only"), false);

  currentMode = "house";
  binding.syncOverlayVisibility();
  assert.equal(ui.indicatorsSection.classList.contains("is-basemap-only"), false);

  assert.ok(listeners.some((entry) => entry.type === "keydown"));
});

test("controls binding fails fast when onHeatmapSelectionChanged is missing", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/scoring/weightedIndicatorIcons.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarMarkup.js", browser);
  runBrowserScript("docs/js/ui/weightedMetricShowRegistry.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarShow.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarFilters.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarIndicators.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarSections.js", browser);
  runBrowserScript("docs/js/ui/controls.js", browser);

  const makeElement = () => ({
    dataset: {},
    style: {},
    hidden: false,
    innerHTML: "",
    addEventListener() {},
    getBoundingClientRect() {
      return { width: 320 };
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    classList: { add() {}, remove() {}, toggle() {} },
  });

  assert.throws(
    () =>
      browser.window.Urban95Controls.bind({
        elements: {
          sidebarEl: makeElement(),
          bodyEl: makeElement(),
          legendEl: makeElement(),
          filterBackdrop: makeElement(),
        },
        scoreModel: browser.window.Urban95ScoreModel,
    showRegistry: loadShowRegistry(browser),
        getState() {
          return {
            scoreMode: "weighted",
            currentMode: "house",
            selectedAmenityTypes: new Set(),
            allFilterTypes: [],
            lastFilterRadioSelection: "all",
          };
        },
        setScoreMode() {},
        setWalkMinutes() {},
        setSelectedAmenityTypes() {},
        setAllFilterTypes() {},
        setLastFilterRadioSelection() {},
        getTypesWithData() {
          return new Set();
        },
        getAllTreesData() {
          return null;
        },
        getAllStreetLightsData() {
          return null;
        },
        callbacks: {
          onFilterSelectionChanged() {},
          onScoreModeChanged() {},
          onWalkMinutesChanged() {},
          onModeToggleRequested() {},
          onPointVisibilityChanged() {},
          onSurveyVisibilityChanged() {},
          onEscape() {},
          clearDerivedCaches() {},
        },
      }),
    /callbacks\.onHeatmapSelectionChanged/
  );
});

test("task-3 app coordinator binds score model helpers without reimplementing extracted pure helpers", () => {
  const appSource = readAppCoordinatorSource();
  assert.match(appSource, /function requireNamespace\s*\(/);
  assert.match(appSource, /function requireScoreModelMember\s*\(/);
  assert.match(appSource, /(?:const|var) Urban95ScoreModel = requireNamespace\(window, "Urban95ScoreModel"\);/);
  assert.match(appSource, /(?:const|var) percentileBreakpoints = requireScoreModelMember\(Urban95ScoreModel, "percentileBreakpoints"\);/);
  assert.match(appSource, /(?:const|var) formatMetricNumber = requireScoreModelMember\(Urban95ScoreModel, "formatMetricNumber"\);/);

  assert.doesNotMatch(appSource, /function percentileBreakpoints\s*\(/);
  assert.doesNotMatch(appSource, /function buildHistogramDistributionFromScores\s*\(/);
  assert.doesNotMatch(appSource, /function getColorForValue\s*\(/);
  assert.doesNotMatch(appSource, /function computePercentileRank\s*\(/);
  assert.doesNotMatch(appSource, /function bulkPercentileRanks\s*\(/);
  assert.doesNotMatch(appSource, /function formatMetricNumber\s*\(/);
  assert.doesNotMatch(appSource, /function formatScoreInteger\s*\(/);
  assert.doesNotMatch(appSource, /function weightedCategoryHighlightsFromSource\s*\(/);
  assert.doesNotMatch(appSource, /function weightedSubcategoryComparisonRows\s*\(/);
});

test("task-5 app coordinator wires the score sidebar module instead of keeping local sidebar logic", () => {
  const appSource = readAppCoordinatorSource();
  const controlActionsSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "ui", "controlActions.js"),
    "utf8"
  );
  assert.match(appSource, /(?:const|var) Urban95ScoreSidebar = requireNamespace\(window, "Urban95ScoreSidebar"\);/);
  assert.match(appSource, /Urban95ScoreSidebar\.configure\(\{/);
  assert.match(
    appSource,
    /scoreSidebar:\s*\{\s*isOpen:\s*Urban95ScoreSidebar\.isOpen,\s*hide:\s*Urban95ScoreSidebar\.hide,\s*sync:\s*Urban95ScoreSidebar\.sync,\s*\}/s
  );
  assert.match(controlActionsSource, /scoreSidebar\.isOpen\(\)/);
  assert.match(controlActionsSource, /scoreSidebar\.hide\(\)/);
  assert.doesNotMatch(appSource, /function renderScoreExplainSidebarWeighted\s*\(/);
  assert.doesNotMatch(appSource, /function showScoreExplainSidebar\s*\(/);
  assert.doesNotMatch(appSource, /function hideScoreExplainSidebar\s*\(/);
  assert.doesNotMatch(appSource, /function syncScoreExplainSidebar\s*\(/);
});

test("score sidebar configure fails fast when required dependencies are missing", () => {
  const browser = createBrowserContext({
    document: {
      getElementById() {
        return null;
      },
    },
    addEventListener() {},
  });

  runBrowserScript("docs/js/ui/scoreSidebar.js", browser);

  assert.throws(
    () => browser.window.Urban95ScoreSidebar.configure({}),
    /Urban95ScoreSidebar\.configure missing required dependency/
  );
});

test("info modal bind fails fast when required dependencies are missing", () => {
  const browser = createBrowserContext();

  runBrowserScript("docs/js/ui/infoModal.js", browser);

  assert.throws(
    () => browser.window.Urban95InfoModal.bind({}),
    /Urban95InfoModal\.bind missing required dependency/
  );
});

test("dashboards configure fails fast when required dependencies are missing", () => {
  const browser = createBrowserContext();

  runBrowserScript("docs/js/ui/dashboards.js", browser);

  assert.throws(
    () => browser.window.Urban95Dashboards.configure({}),
    /Urban95Dashboards\.configure missing required dependency/
  );
});

test("task-5 sidebar contract uses injected padding callback and restoreFocus-aware hide", () => {
  const sidebarSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "ui", "scoreSidebar.js"),
    "utf8"
  );
  assert.match(sidebarSource, /setSidebarPadding\s*:\s*"function"/);
  assert.match(sidebarSource, /restoreFocusAfterHide\s*:\s*"function"/);
  assert.match(sidebarSource, /function hideScoreExplainSidebar\s*\(\s*options\s*\)/);
  assert.match(sidebarSource, /sidebarChrome\.close\(options\)/);
  assert.match(sidebarSource, /sidebarChrome\.open\(\)/);
});

test("score sidebar shell records opt-in perf span without building breakdown content", () => {
  function createClassList() {
    const names = new Set();
    return {
      add(name) {
        names.add(name);
      },
      remove(name) {
        names.delete(name);
      },
      contains(name) {
        return names.has(name);
      },
      toggle(name, force) {
        if (force === true) {
          names.add(name);
          return true;
        }
        if (force === false) {
          names.delete(name);
          return false;
        }
        if (names.has(name)) {
          names.delete(name);
          return false;
        }
        names.add(name);
        return true;
      },
    };
  }

  function createElement(overrides) {
    return Object.assign(
      {
        hidden: false,
        innerHTML: "",
        textContent: "",
        style: {
          setProperty() {},
          removeProperty() {},
        },
        classList: createClassList(),
        attrs: {},
        listeners: [],
        focusCalls: [],
        children: [],
        setAttribute(name, value) {
          this.attrs[name] = value;
        },
        removeAttribute(name) {
          delete this.attrs[name];
        },
        getAttribute(name) {
          return this.attrs[name];
        },
        addEventListener(type, handler) {
          this.listeners.push({ type, handler });
        },
        appendChild(child) {
          this.children.push(child);
          return child;
        },
        focus(options) {
          this.focusCalls.push(options);
        },
        contains() {
          return false;
        },
        querySelector() {
          return null;
        },
        getBoundingClientRect() {
          return { width: 400 };
        },
      },
      overrides || {}
    );
  }

  let now = 0;
  const sidebarEl = createElement();
  const bodyEl = createElement();
  const emptyEl = createElement();
  const heroEl = createElement();
  const noteEl = createElement();
  const buildingContextEl = createElement({ hidden: true });
  const buildingContextIdEl = createElement();
  const buildingContextCoordsEl = createElement({ hidden: true });
  const closeButtonEl = createElement();
  const backdropEl = createElement({ hidden: true });
  const browser = createBrowserContext({
    location: {
      href: "http://localhost:8080/docs/index.html?perf=1",
      search: "?perf=1",
    },
    performance: {
      now() {
        now += 1;
        return now;
      },
      getEntriesByType() {
        return [];
      },
    },
    matchMedia() {
      return { matches: false };
    },
    requestAnimationFrame() {
      return 1;
    },
    cancelAnimationFrame() {},
    setInterval() {
      return 1;
    },
    clearInterval() {},
    addEventListener() {},
    document: {
      readyState: "loading",
      activeElement: null,
      body: createElement(),
      addEventListener() {},
      createElement() {
        return createElement();
      },
      getElementById() {
        return null;
      },
    },
  });

  runBrowserScript("docs/js/core/perfPanel.js", browser);
  runBrowserScript("docs/js/ui/sidebarChromeBindings.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebar.js", browser);

  let breakdownCalls = 0;
  let metricsCalls = 0;
  const building = {
    feature: {
      properties: {
        building_id: 87,
      },
    },
    lat: 31.251,
    lng: 34.791,
  };

  browser.window.Urban95ScoreSidebar.configure({
    getScoreMode() {
      return "weighted";
    },
    getSelectedAmenityTypes() {
      return new Set(["parks"]);
    },
    getAllFilterTypes() {
      return [];
    },
    getSelectedBuilding() {
      return building;
    },
    buildExplainScoreBreakdown() {
      breakdownCalls += 1;
      return null;
    },
    buildPercentileMetrics() {
      metricsCalls += 1;
      return null;
    },
    getScoreModeLabel() {
      return "Urban95";
    },
    getScoreMinutes() {
      return 10;
    },
    escapeHtml(value) {
      return String(value);
    },
    renderHorizonLabelCell() {
      return "";
    },
    renderHorizonSubLabelCell() {
      return "";
    },
    getWeightedCategoryIcon() {
      return "park";
    },
    getWeightedSubcategoryIcon() {
      return "tree";
    },
    getScoreExplainRowIcon() {
      return "circle";
    },
    getScoreExplainPartialFilterSet() {
      return null;
    },
    isScoreExplainCategoryFilterHighlighted() {
      return false;
    },
    isScoreExplainRowFilterHighlighted() {
      return false;
    },
    formatScoreExplainRowValue() {
      return "0";
    },
    horizonBarFillStyle() {
      return "";
    },
    horizonSubBarFillStyle() {
      return "";
    },
    explainRankBarColor() {
      return "#2563eb";
    },
    heroPercentileMeterFillStyle() {
      return "";
    },
    getOrdinalSuffix() {
      return "th";
    },
    formatMetricNumber(value) {
      return String(value);
    },
    formatScoreInteger(value) {
      return String(value);
    },
    buildBuildingDemographicContext() {
      return null;
    },
    setSidebarPadding() {},
    restoreFocusAfterHide() {},
    referenceRadiusMeters: 100,
    scoreExplainIconNeutral: "#64748b",
    sidebarEl,
    bodyEl,
    emptyEl,
    heroEl,
    noteEl,
    buildingContextEl,
    buildingContextIdEl,
    buildingContextCoordsEl,
    closeButtonEl,
    backdropEl,
  });

  browser.window.Urban95ScoreSidebar.showShell(building);

  assert.equal(breakdownCalls, 0);
  assert.equal(metricsCalls, 0);
  assert.equal(bodyEl.innerHTML, "");
  assert.equal(emptyEl.hidden, false);
  assert.equal(emptyEl.textContent, "Loading score details...");
  assert.equal(buildingContextEl.hidden, false);
  assert.equal(buildingContextIdEl.textContent, "Building #87");
  assert.equal(buildingContextCoordsEl.textContent, "31.25100, 34.79100");
  assert.ok(sidebarEl.classList.contains("is-open"));
  assert.ok(browser.window.urban95Perf.records.some((record) => record.kind === "span" && record.name === "scoreSidebar:showShell"));
  assert.ok(
    browser.window.urban95Perf.records.some(
      (record) =>
        record.kind === "mark" &&
        record.name === "scoreSidebar:showShell:loadingVisible" &&
        record.meta &&
        record.meta.buildingId === 87 &&
        record.meta.scoreMode === "weighted" &&
        record.meta.sidebarWasOpen === false &&
        record.meta.hasExistingDetail === false
    )
  );
  assert.ok(
    browser.window.urban95Perf.records.some(
      (record) =>
        record.kind === "mark" &&
        record.name === "scoreSidebar:showShell:firstOpenLoading" &&
        record.meta &&
        record.meta.sidebarWasOpen === false &&
        record.meta.hasExistingDetail === false
    )
  );
  assert.ok(
    browser.window.urban95Perf.records.some(
      (record) =>
        record.kind === "mark" &&
        record.name === "scoreSidebar:showShell:preserveExistingDetail" &&
        record.meta &&
        record.meta.preserved === false
    )
  );
  assert.equal(
    browser.window.urban95Perf.records.some((record) => record.name === "scoreSidebar:buildBreakdown"),
    false
  );
  assert.equal(
    browser.window.urban95Perf.records.some((record) => record.name === "scoreSidebar:buildMetrics"),
    false
  );

  bodyEl.innerHTML = "<p>Existing amenity detail</p>";
  emptyEl.hidden = false;
  emptyEl.textContent = "Loading score details...";
  browser.window.Urban95ScoreSidebar.showShell(building, {
    preserveExistingDetail: true,
    reason: "amenitiesHouseSwitch",
  });

  assert.equal(bodyEl.innerHTML, "<p>Existing amenity detail</p>");
  assert.equal(emptyEl.hidden, true);
  assert.equal(emptyEl.textContent, "");
  assert.equal(breakdownCalls, 0);
  assert.equal(metricsCalls, 0);
  assert.ok(
    browser.window.urban95Perf.records.some(
      (record) =>
        record.kind === "mark" &&
        record.name === "scoreSidebar:showShell:preserveExistingDetail" &&
        record.meta &&
        record.meta.requested === true &&
        record.meta.preserved === true &&
        record.meta.reason === "amenitiesHouseSwitch"
    )
  );
});

test("task-5 app coordinator injects sidebar chrome and uses non-focus-stealing cleanup hides", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const selectionSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "selection.js"),
    "utf8"
  );
  assert.match(appSource, /const scoreExplainSidebarEl = document\.getElementById\("score-explain-sidebar"\);/);
  assert.match(appSource, /const scoreExplainSidebarBodyEl = document\.getElementById\("score-explain-sidebar-body"\);/);
  assert.match(appSource, /const scoreExplainSidebarCloseButtonEl = document\.getElementById\("score-explain-sidebar-close"\);/);
  assert.match(appSource, /const scoreExplainBackdropEl = document\.getElementById\("score-explain-backdrop"\);/);
  assert.match(appSource, /sidebarEl:\s*scoreExplainSidebarEl/);
  assert.match(appSource, /bodyEl:\s*scoreExplainSidebarBodyEl/);
  assert.match(appSource, /closeButtonEl:\s*scoreExplainSidebarCloseButtonEl/);
  assert.match(appSource, /backdropEl:\s*scoreExplainBackdropEl/);
  assert.match(appSource, /const scoreSidebarChrome = Urban95ScoreSidebarChrome\.create\(\{/);
  assert.match(appSource, /setSidebarPadding:\s*scoreSidebarChrome\.setSidebarPadding/);
  assert.match(appSource, /restoreFocusAfterHide:\s*scoreSidebarChrome\.restoreFocusAfterHide/);
  assert.match(appSource, /scoreExplainIconNeutral:\s*scoreExplain\.scoreExplainIconNeutral/);
  assert.match(appSource, /syncScoreSidebar:\s*Urban95ScoreSidebar\.sync/);
  assert.match(appSource, /hideScoreSidebar:\s*Urban95ScoreSidebar\.hide/);
  assert.match(selectionSource, /d\.hideScoreSidebar\(\{\s*restoreFocus:\s*false\s*\}\)/);
});

test("score sidebar chrome owns map padding and focus restoration", () => {
  const mapCalls = [];
  const canvas = {
    attrs: {},
    focusCalls: [],
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    focus(options) {
      this.focusCalls.push(options);
    },
  };
  const mapElement = {
    attrs: {},
    focusCalls: [],
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    focus(options) {
      this.focusCalls.push(options);
    },
  };
  const browser = createBrowserContext({
    matchMedia() {
      return { matches: false };
    },
    document: {
      getElementById(id) {
        if (id === "map") return mapElement;
        return null;
      },
    },
  });
  const map = {
    currentPadding: { top: 12, right: 24, bottom: 36, left: 48 },
    getPadding() {
      mapCalls.push({ type: "getPadding" });
      return this.currentPadding;
    },
    setPadding(nextPadding) {
      mapCalls.push({ type: "setPadding", value: nextPadding });
      this.currentPadding = Object.assign({}, nextPadding);
    },
    resize() {
      mapCalls.push({ type: "resize" });
    },
    getCanvas() {
      mapCalls.push({ type: "getCanvas" });
      return canvas;
    },
  };

  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);

  const chrome = browser.window.Urban95ScoreSidebarChrome.create({
    map: map,
    document: browser.window.document,
    matchMedia: browser.window.matchMedia,
  });

  const before = JSON.parse(JSON.stringify(map.currentPadding));
  chrome.setSidebarPadding(true, 360);
  chrome.setSidebarPadding(false, 0);
  chrome.restoreFocusAfterHide();

  assert.equal(typeof chrome.cloneMapPadding, "undefined");
  assert.deepEqual(before, { top: 12, right: 24, bottom: 36, left: 48 });
  assert.deepEqual(JSON.parse(JSON.stringify(mapCalls)), [
    { type: "getPadding" },
    { type: "setPadding", value: { top: 12, right: 360, bottom: 36, left: 48 } },
    { type: "resize" },
    { type: "setPadding", value: { top: 12, right: 24, bottom: 36, left: 48 } },
    { type: "resize" },
    { type: "getCanvas" },
  ]);
  assert.deepEqual(canvas.attrs, { tabindex: "-1" });
  assert.deepEqual(JSON.parse(JSON.stringify(canvas.focusCalls)), [{ preventScroll: true }]);
  assert.deepEqual(mapElement.focusCalls, []);
});

test("score sidebar always keeps the bar-based desktop breakdown instead of ultra compaction", () => {
  const styleSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "style.css"), "utf8");
  const sidebarSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "ui", "scoreSidebar.js"),
    "utf8"
  );

  assert.match(styleSource, /--score-sidebar-width:\s*clamp\(300px,\s*26vw,\s*380px\);/);
  assert.match(sidebarSource, /var textScale = Math\.max\(0\.74, s\);/);
  assert.match(styleSource, /\.score-explain-sidebar-inner\.is-chart-fit-tight \.score-explain-sidebar-hero-compact \.percentile-value/);
  assert.match(styleSource, /\.score-explain-sidebar-inner\.is-chart-fit-tight \.score-explain-building-ctx/);
  assert.doesNotMatch(sidebarSource, /is-chart-fit-ultra/);
  assert.doesNotMatch(styleSource, /is-chart-fit-ultra/);
});

test("score sidebar chrome does not reapply unchanged open padding during camera flight", () => {
  const mapCalls = [];
  const browser = createBrowserContext({
    matchMedia() {
      return { matches: false };
    },
    document: {
      getElementById() {
        return null;
      },
    },
  });
  const map = {
    currentPadding: { top: 0, right: 0, bottom: 0, left: 0 },
    getPadding() {
      mapCalls.push({ type: "getPadding" });
      return this.currentPadding;
    },
    setPadding(nextPadding) {
      mapCalls.push({ type: "setPadding", value: nextPadding });
      this.currentPadding = Object.assign({}, nextPadding);
    },
    resize() {
      mapCalls.push({ type: "resize" });
    },
  };

  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);

  const chrome = browser.window.Urban95ScoreSidebarChrome.create({
    map: map,
    document: browser.window.document,
    matchMedia: browser.window.matchMedia,
  });

  chrome.setSidebarPadding(true, 421);
  chrome.setSidebarPadding(true, 421);
  chrome.setSidebarPadding(false, 0);

  assert.deepEqual(JSON.parse(JSON.stringify(mapCalls)), [
    { type: "getPadding" },
    { type: "setPadding", value: { top: 0, right: 421, bottom: 0, left: 0 } },
    { type: "resize" },
    { type: "setPadding", value: { top: 0, right: 0, bottom: 0, left: 0 } },
    { type: "resize" },
  ]);
});

test("score sidebar chrome can resize an unchanged open sidebar without reapplying padding", () => {
  const mapCalls = [];
  const browser = createBrowserContext({
    matchMedia() {
      return { matches: false };
    },
    document: {
      getElementById() {
        return null;
      },
    },
  });
  const map = {
    currentPadding: { top: 0, right: 0, bottom: 0, left: 0 },
    getPadding() {
      mapCalls.push({ type: "getPadding" });
      return this.currentPadding;
    },
    setPadding(nextPadding) {
      mapCalls.push({ type: "setPadding", value: nextPadding });
      this.currentPadding = Object.assign({}, nextPadding);
    },
    resize() {
      mapCalls.push({ type: "resize" });
    },
  };

  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);

  const chrome = browser.window.Urban95ScoreSidebarChrome.create({
    map: map,
    document: browser.window.document,
    matchMedia: browser.window.matchMedia,
  });

  chrome.setSidebarPadding(true, 421);
  chrome.setSidebarPadding(true, 421, { forceResize: true });

  assert.deepEqual(JSON.parse(JSON.stringify(mapCalls)), [
    { type: "getPadding" },
    { type: "setPadding", value: { top: 0, right: 421, bottom: 0, left: 0 } },
    { type: "resize" },
    { type: "resize" },
  ]);
});

test("score sidebar chrome records opt-in padding and resize diagnostics", () => {
  const browser = createBrowserContext({
    matchMedia() {
      return { matches: false };
    },
    document: {
      getElementById() {
        return null;
      },
    },
  });
  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);

  const records = [];
  const mapCalls = [];
  const chrome = browser.window.Urban95ScoreSidebarChrome.create({
    map: {
      setPadding(padding) {
        mapCalls.push(["setPadding", padding.right]);
      },
      resize() {
        mapCalls.push(["resize"]);
      },
      getPadding() {
        return { top: 0, right: 0, bottom: 0, left: 0 };
      },
      getCanvas() {
        return { setAttribute() {}, focus() {} };
      },
    },
    document: browser.window.document,
    matchMedia: browser.window.matchMedia,
    perf: {
      mark(name, metaFactory) {
        records.push([name, metaFactory ? metaFactory() : null]);
      },
    },
  });

  chrome.setSidebarPadding(true, 421);
  chrome.setSidebarPadding(true, 421);
  chrome.setSidebarPadding(true, 421, { forceResize: true });

  assert.deepEqual(records.map((entry) => entry[0]), [
    "scoreSidebarChrome:setPadding",
    "scoreSidebarChrome:resize",
    "scoreSidebarChrome:paddingUnchanged",
    "scoreSidebarChrome:paddingUnchanged",
    "scoreSidebarChrome:resize",
  ]);
  assert.deepEqual(mapCalls, [["setPadding", 421], ["resize"], ["resize"]]);
  assert.equal(records[0][1].open, true);
  assert.equal(records[0][1].width, 421);
  assert.equal(records[0][1].right, 421);
  assert.equal(records[0][1].mobile, false);
  assert.equal(records[2][1].forceResize, false);
  assert.equal(records[3][1].forceResize, true);
});

test("score sidebar chrome reservations replace same-side baseline padding but preserve the opposite side", () => {
  const mapCalls = [];
  const browser = createBrowserContext({
    matchMedia() {
      return { matches: false };
    },
    document: {
      getElementById() {
        return null;
      },
    },
  });
  const map = {
    currentPadding: { top: 10, right: 24, bottom: 30, left: 48 },
    getPadding() {
      mapCalls.push({ type: "getPadding" });
      return this.currentPadding;
    },
    setPadding(nextPadding) {
      mapCalls.push({ type: "setPadding", value: nextPadding });
      this.currentPadding = Object.assign({}, nextPadding);
    },
    resize() {
      mapCalls.push({ type: "resize" });
    },
  };

  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);

  const chrome = browser.window.Urban95ScoreSidebarChrome.create({
    map: map,
    document: browser.window.document,
    matchMedia: browser.window.matchMedia,
  });

  chrome.setSidebarReservation("left", 300);
  chrome.setSidebarReservation("right", 360);
  chrome.setSidebarReservation("right", 0);
  chrome.setSidebarReservation("left", 0);

  assert.equal(typeof chrome.setSidebarReservation, "function");
  assert.deepEqual(JSON.parse(JSON.stringify(mapCalls)), [
    { type: "getPadding" },
    { type: "setPadding", value: { top: 10, right: 24, bottom: 30, left: 300 } },
    { type: "resize" },
    { type: "setPadding", value: { top: 10, right: 360, bottom: 30, left: 300 } },
    { type: "resize" },
    { type: "setPadding", value: { top: 10, right: 24, bottom: 30, left: 300 } },
    { type: "resize" },
    { type: "setPadding", value: { top: 10, right: 24, bottom: 30, left: 48 } },
    { type: "resize" },
  ]);
});

test("score explanation create fails fast when a required scoreModel member is missing", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/scoring/weightedIndicatorIcons.js", browser);
  runBrowserScript("docs/js/scoring/scoreExplain.js", browser);

  assert.throws(
    () =>
      browser.window.Urban95ScoreExplain.create({
        scoreModel: {
          CLEAN_SCORE_COMPONENTS: [],
          CLEAN_WEIGHTS: {},
          WEIGHTED_CATEGORY_COMPONENTS: [],
          WEIGHTED_CATEGORY_BY_STEM: {},
          WEIGHTED_SUBCATEGORY_COMPONENTS: {},
          getAmenityConfig() {
            return { icon: "marker" };
          },
          filterTypeToCleanWeightKey() {
            return null;
          },
          hasCleanPtsBreakdown() {
            return false;
          },
          cleanPtsPropertyName() {
            return "";
          },
          getFilteredContributionForType() {
            return 0;
          },
          amenityTypeToBuildingStatKey(type) {
            return type;
          },
          getExpandedContributionForType() {
            return 0;
          },
          formatScoreInteger(value) {
            return String(value);
          },
          getPercentileSeriesCacheKey() {
            return "k";
          },
          computePercentileRank() {
            return 0;
          },
        },
        iconsBase: "./icons",
        state: {
          getScoreMode() {
            return "weighted";
          },
          getScoreMinutes() {
            return 10;
          },
          getWalkMinutes() {
            return 10;
          },
          getSelectedAmenityTypes() {
            return new Set();
          },
          getAllFilterTypes() {
            return [];
          },
          getBuildingsData() {
            return { features: [] };
          },
          getLatestRadiusCounts() {
            return {};
          },
          hasPercentileSeries() {
            return false;
          },
          getPercentileSeries() {
            return null;
          },
          setPercentileSeries() {},
          getBuildingAmenityStatKeysForMinutes() {
            return new Set();
          },
          getBuildingOverallScore() {
            return 0;
          },
        },
      }),
    /Urban95ScoreExplain\.create requires scoreModel\.formatMetricNumber \(function\)/
  );
});

test("score explanation module builds weighted breakdowns without app.js helpers", () => {
  const browser = createBrowserContext();
  const explainSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "scoring", "scoreExplain.js"),
    "utf8"
  );
  runBrowserScript("docs/js/scoring/weightedIndicatorIcons.js", browser);
  runBrowserScript("docs/js/scoring/scoreExplain.js", browser);

  const state = {
    scoreMode: "weighted",
    scoreMinutes: 10,
    walkMinutes: 10,
    selectedAmenityTypes: new Set(["nature"]),
    allFilterTypes: ["nature"],
    buildingsData: { features: [] },
    latestRadiusCounts: {},
    percentileSeries: Object.create(null),
  };
  const fakeScoreModel = {
    WEIGHTED_CATEGORY_COMPONENTS: [
      { stem: "nature", label: "Nature", weight: 1, color: "#7CB342" },
    ],
    WEIGHTED_CATEGORY_BY_STEM: {
      nature: { stem: "nature", label: "Nature", weight: 1, color: "#7CB342" },
    },
    WEIGHTED_SUBCATEGORY_COMPONENTS: {
      nature: [{ stem: "parks", label: "Parks", weight: 1 }],
    },
    CLEAN_SCORE_COMPONENTS: [],
    CLEAN_WEIGHTS: {},
    getAmenityConfig() {
      return { icon: "marker", color: "#64748b", label: "Other" };
    },
    amenityTypeToBuildingStatKey(type) {
      return type;
    },
    getExpandedContributionForType() {
      return 0;
    },
    getFilteredContributionForType() {
      return 0;
    },
    filterTypeToCleanWeightKey() {
      return null;
    },
    hasCleanPtsBreakdown() {
      return false;
    },
    cleanPtsPropertyName() {
      return "";
    },
    getPercentileSeriesCacheKey(minutes) {
      return "weighted:" + minutes;
    },
    computePercentileRank() {
      return null;
    },
    formatMetricNumber(value) {
      return String(Math.round(Number(value) || 0));
    },
    formatScoreInteger(value) {
      return String(Math.round(Number(value) || 0));
    },
    getBuildingOverallScore() {
      return 72;
    },
  };
  const explain = browser.window.Urban95ScoreExplain.create({
    scoreModel: fakeScoreModel,
    iconsBase: "./icons",
    getActiveMetric() {
      return { kind: "weighted-category", selectedWeightedStem: "nature" };
    },
    state: {
      getScoreMode() {
        return state.scoreMode;
      },
      getScoreMinutes() {
        return state.scoreMinutes;
      },
      getWalkMinutes() {
        return state.walkMinutes;
      },
      getSelectedAmenityTypes() {
        return state.selectedAmenityTypes;
      },
      getAllFilterTypes() {
        return state.allFilterTypes;
      },
      getBuildingsData() {
        return state.buildingsData;
      },
      getLatestRadiusCounts() {
        return state.latestRadiusCounts;
      },
      hasPercentileSeries(cacheKey) {
        return Object.prototype.hasOwnProperty.call(state.percentileSeries, cacheKey);
      },
      getPercentileSeries(cacheKey) {
        return state.percentileSeries[cacheKey];
      },
      setPercentileSeries(cacheKey, value) {
        state.percentileSeries[cacheKey] = value;
      },
      getPercentileSeriesCacheKey(minutes) {
        return fakeScoreModel.getPercentileSeriesCacheKey(minutes);
      },
      getBuildingAmenityStatKeysForMinutes() {
        return new Set();
      },
      getBuildingOverallScore(props, minutes) {
        return fakeScoreModel.getBuildingOverallScore(props, minutes);
      },
    },
  });
  const props = {
    score_weighted_10min: 72,
    score_weighted_nature_10min: 72,
    score_weighted_sub_nature_parks_10min: 55,
  };

  const breakdown = explain.buildExplainScoreBreakdown(props);

  assert.equal(breakdown.overallScoreLabel, "72");
  assert.equal(breakdown.weightedCategories.length, 1);
  assert.equal(breakdown.weightedCategories[0].subrows[0].value, 55);
  assert.equal(
    breakdown.formulaLine,
    "Urban95 score = (0.20×Environmental Quality) + (0.15×Nature) + (0.15×Play) + (0.25×Safety & Mobility) + (0.25×Family Services)."
  );
  assert.match(explainSource, /weight \+ " pts × \("/);
  assert.match(explainSource, /Amenities Focus index = POI count \+ \\u00bc× trees \+ \\u00bc× street lights\./);
  assert.match(explainSource, /Partial Amenities Focus index = sum of selected POI counts plus \\u00bc× trees and \\u00bc× lights when selected\./);
  assert.equal(
    breakdown.weightedCategories[0].subrows[0].valueLabel,
    "55 / 100"
  );
  assert.equal(explain.getWeightedCategoryIcon("nature"), "nature");
  assert.equal(typeof explain.renderHorizonIcon, "undefined");
  assert.equal(typeof explain.buildFilteredFormulaLine, "undefined");
  assert.equal(typeof explain.parseColorChannels, "undefined");
  assert.equal(typeof explain.channelsToCss, "undefined");
  assert.equal(typeof explain.mixChannels, "undefined");
  assert.equal(typeof explain.mixColorWithWhite, "undefined");
  assert.equal(typeof explain.fillExplainSeries, "undefined");
  assert.equal(typeof explain.getPercentileSeriesForMinutes, "undefined");
  assert.equal(typeof explain.percentileForSeries, "undefined");
  assert.match(
    explain.renderHorizonLabelCell("Nature", "nature", "", "#4a9e49"),
    /horizon-icon/
  );
});

test("score sidebar chrome create fails fast when map is missing required methods", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);
  const documentStub = {
    getElementById() {
      return null;
    },
  };

  assert.throws(
    () =>
      browser.window.Urban95ScoreSidebarChrome.create({
        map: {
          resize() {},
        },
        document: documentStub,
        matchMedia: browser.window.matchMedia,
      }),
    /Urban95ScoreSidebarChrome\.create requires map\.setPadding \(function\)/
  );

  assert.throws(
    () =>
      browser.window.Urban95ScoreSidebarChrome.create({
        map: {
          setPadding() {},
        },
        document: documentStub,
        matchMedia: browser.window.matchMedia,
      }),
    /Urban95ScoreSidebarChrome\.create requires map\.resize \(function\)/
  );
});

test("app.js fails fast when Urban95ScoreModel is missing", () => {
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

  assert.throws(
    () => runAppScript(browser),
    /window\.Urban95ScoreModel is required before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95Config is missing", () => {
  const browser = createBrowserContext();

  assert.throws(
    () => runAppScript(browser),
    /window\.Urban95Config is required before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95DataArtifacts is missing", () => {
  const browser = createBrowserContext();

  runBrowserScript("docs/js/core/config.js", browser);

  assert.throws(
    () => runAppScript(browser),
    /window\.Urban95DataArtifacts is required before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95DataArtifacts member is missing", () => {
  const browser = createBrowserContext();

  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/core/dataArtifacts.js", browser);
  delete browser.window.Urban95DataArtifacts.hasGeneratedArtifact;

  assert.throws(
    () => runAppScript(browser),
    /Urban95DataArtifacts\.hasGeneratedArtifact is required before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95DataArtifacts member has the wrong type", () => {
  const browser = createBrowserContext();

  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/core/dataArtifacts.js", browser);
  browser.window.Urban95DataArtifacts.sourceLayer = 123;

  assert.throws(
    () => runAppScript(browser),
    /Urban95DataArtifacts\.sourceLayer must be a function before docs\/app\.js/
  );
});

test("app.js fails fast when a required generated URL is missing", () => {
  const browser = createBrowserContext();

  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/core/dataArtifacts.js", browser);
  delete browser.window.Urban95DataArtifacts.urls.pointsLookup;

  assert.throws(
    () => runAppScript(browser),
    /Urban95DataArtifacts\.urls\.pointsLookup is required before docs\/app\.js/
  );
});

test("app.js fails fast when a required map contract is missing", () => {
  const browser = createBrowserContext();

  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/core/dataArtifacts.js", browser);
  delete browser.window.Urban95Config.mapContracts.neighborhoodSurfaceSourceLayerFallback;

  assert.throws(
    () => runAppScript(browser),
    /Urban95Config\.mapContracts\.neighborhoodSurfaceSourceLayerFallback is required before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95Logger is missing", () => {
  const browser = createBrowserContext();

  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/core/dataArtifacts.js", browser);
  runBrowserScript("docs/js/core/loaders.js", browser);
  delete browser.window.Urban95Logger;

  assert.throws(
    () => runBrowserScript("docs/js/core/appDependencies.js", browser),
    /window\.Urban95Logger is required before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95Loaders is missing", () => {
  const browser = createBrowserContext();

  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/core/dataArtifacts.js", browser);

  assert.throws(
    () => runAppScript(browser),
    /window\.Urban95Loaders is required before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95Loaders member is missing", () => {
  const browser = createBrowserContext();

  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/core/dataArtifacts.js", browser);
  runBrowserScript("docs/js/core/loaders.js", browser);
  delete browser.window.Urban95Loaders.ensureDeckGlLoaded;

  assert.throws(
    () => runAppScript(browser),
    /Urban95Loaders\.ensureDeckGlLoaded is required before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95Loaders member has the wrong type", () => {
  const browser = createBrowserContext();

  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/core/dataArtifacts.js", browser);
  runBrowserScript("docs/js/core/loaders.js", browser);
  browser.window.Urban95Loaders.ensureDeckGlLoaded = 123;

  assert.throws(
    () => runAppScript(browser),
    /Urban95Loaders\.ensureDeckGlLoaded must be a function before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95Startup is missing", () => {
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
  runBrowserScript("docs/js/core/logger.js", browser);
  delete browser.window.Urban95Startup;

  assert.throws(
    () => runBrowserScript("docs/js/core/appDependencies.js", browser),
    /window\.Urban95Startup is required before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95LoadingUi is missing", () => {
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
  runBrowserScript("docs/js/core/logger.js", browser);
  runBrowserScript("docs/js/core/startup.js", browser);

  assert.throws(
    () => runBrowserScript("docs/js/core/appDependencies.js", browser),
    /window\.Urban95LoadingUi is required before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95LoadingUi.create is missing", () => {
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
  runBrowserScript("docs/js/core/logger.js", browser);
  runBrowserScript("docs/js/core/startup.js", browser);
  runBrowserScript("docs/js/core/loadingUi.js", browser);
  browser.window.Urban95LoadingUi = {};

  assert.throws(
    () => runBrowserScript("docs/js/core/appDependencies.js", browser),
    /Urban95LoadingUi\.create is required before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95LoadingUi.create has the wrong type", () => {
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
  runBrowserScript("docs/js/core/logger.js", browser);
  runBrowserScript("docs/js/core/startup.js", browser);
  runBrowserScript("docs/js/core/loadingUi.js", browser);
  browser.window.Urban95LoadingUi.create = 123;

  assert.throws(
    () => runBrowserScript("docs/js/core/appDependencies.js", browser),
    /Urban95LoadingUi\.create must be a function before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95RuntimeData is missing", () => {
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

  assert.throws(
    () => runAppScript(browser),
    /window\.Urban95RuntimeData is required before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95RuntimeData member is missing", () => {
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
  delete browser.window.Urban95RuntimeData.featureCollectionFromPointRecords;

  assert.throws(
    () => runAppScript(browser),
    /Urban95RuntimeData\.featureCollectionFromPointRecords is required before docs\/app\.js/
  );
});

test("app.js fails fast when required Task 3 Urban95RuntimeData members are missing", () => {
  [
    "hasValidPointsLookupSources",
    "warnIfBuildingScoresIncomplete",
    "scanAmenityTypesFromFeatures",
  ].forEach(function (memberName) {
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
    delete browser.window.Urban95RuntimeData[memberName];

    assert.throws(
      () => runAppScript(browser),
      new RegExp("Urban95RuntimeData\\." + memberName + " is required before docs\\/app\\.js")
    );
  });
});

function loadAppStatePrerequisites(browser) {
  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/core/dataArtifacts.js", browser);
  runBrowserScript("docs/js/core/loaders.js", browser);
  runBrowserScript("docs/js/core/runtimeData.js", browser);
  runBrowserScript("docs/js/core/perfPanel.js", browser);
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/ui/weightedMetricShowRegistry.js", browser);
  runBrowserScript("docs/js/scoring/scoreContext.js", browser);
  runBrowserScript("docs/js/scoring/weightedIndicatorIcons.js", browser);
  runBrowserScript("docs/js/scoring/scoreExplain.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);
  runBrowserScript("docs/js/ui/sidebarChromeBindings.js", browser);
  runBrowserScript("docs/js/ui/amenityMode.js", browser);
  runBrowserScript("docs/js/ui/controlActions.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
  runBrowserScript("docs/js/map/mapShell.js", browser);
  runBrowserScript("docs/js/map/neighborhoodScores.js", browser);
  runBrowserScript("docs/js/map/iconLoader.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebar.js", browser);
  runBrowserScript("docs/js/ui/infoModal.js", browser);
  runBrowserScript("docs/js/map/neighborhoodSelectionHighlight.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodSelection.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodPanelRender.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodCompareRender.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodSidebar.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodCompareApply.js", browser);
  loadCitySidebarModules(browser);
  runBrowserScript("docs/js/ui/dashboards.js", browser);
  runBrowserScript("docs/js/map/modeController.js", browser);
  runBrowserScript("docs/js/map/mapEvents.js", browser);
  runBrowserScript("docs/js/map/mapRenderers.js", browser);
  runBrowserScript("docs/js/map/selection.js", browser);
  runBrowserScript("docs/js/ui/controls.js", browser);
}

test("app.js fails fast when Urban95AppState is missing", () => {
  const browser = createBrowserContext({
    URBAN95_GENERATED_ARTIFACTS: {
      buildings: {
        status: "built",
        output: "./data/buildings_accessibility.pmtiles",
        source_layer: "buildings",
      },
    },
  });

  loadAppStatePrerequisites(browser);

  assert.throws(
    () => runAppScript(browser),
    /window\.Urban95AppState is required before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95IconLoader is missing", () => {
  const browser = createBrowserContext({
    URBAN95_GENERATED_ARTIFACTS: {
      buildings: {
        status: "built",
        output: "./data/buildings_accessibility.pmtiles",
        source_layer: "buildings",
      },
    },
  });

  loadAppCoordinatorNamespaces(browser);
  loadAppStatePrerequisites(browser);
  runBrowserScript("docs/js/core/appState.js", browser);
  browser.window.Urban95IconLoader = undefined;

  assert.throws(
    () => runBrowserScript("docs/js/core/appDependencies.js", browser),
    /window\.Urban95IconLoader is required before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95IconLoader.create has the wrong type", () => {
  const browser = createBrowserContext({
    URBAN95_GENERATED_ARTIFACTS: {
      buildings: {
        status: "built",
        output: "./data/buildings_accessibility.pmtiles",
        source_layer: "buildings",
      },
    },
  });

  loadAppCoordinatorNamespaces(browser);
  loadAppStatePrerequisites(browser);
  runBrowserScript("docs/js/core/appState.js", browser);
  browser.window.Urban95IconLoader = { create: 123 };

  assert.throws(
    () => runBrowserScript("docs/js/core/appDependencies.js", browser),
    /Urban95IconLoader\.create must be a function before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95AppState.create has the wrong type", () => {
  const browser = createBrowserContext({
    URBAN95_GENERATED_ARTIFACTS: {
      buildings: {
        status: "built",
        output: "./data/buildings_accessibility.pmtiles",
        source_layer: "buildings",
      },
    },
  });

  loadAppStatePrerequisites(browser);
  runBrowserScript("docs/js/core/appState.js", browser);
  browser.window.Urban95AppState.create = 123;

  assert.throws(
    () => runAppScript(browser),
    /Urban95AppState\.create must be a function before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95ScoreModel member is missing", () => {
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
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  delete browser.window.Urban95ScoreModel.formatMetricNumber;

  assert.throws(
    () => runAppScript(browser),
    /Urban95ScoreModel\.formatMetricNumber is required before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95ScoreModel member is undefined", () => {
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
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  browser.window.Urban95ScoreModel.formatMetricNumber = undefined;

  assert.throws(
    () => runAppScript(browser),
    /Urban95ScoreModel\.formatMetricNumber is required before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95MapLayers is missing", () => {
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
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);

  assert.throws(
    () => runAppScript(browser),
    /window\.Urban95MapLayers is required before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95ScoreSidebar is missing", () => {
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
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);

  assert.throws(
    () => runAppScript(browser),
    /window\.Urban95ScoreSidebar is required before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95Dashboards member is missing", () => {
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
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebar.js", browser);
  runBrowserScript("docs/js/ui/infoModal.js", browser);
  runBrowserScript("docs/js/ui/dashboards.js", browser);
  delete browser.window.Urban95Dashboards.loadCitywideStats;

  assert.throws(
    () => runAppScript(browser),
    /Urban95Dashboards\.loadCitywideStats is required before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95Dashboards member has the wrong type", () => {
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
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebar.js", browser);
  runBrowserScript("docs/js/ui/infoModal.js", browser);
  runBrowserScript("docs/js/ui/dashboards.js", browser);
  browser.window.Urban95Dashboards.loadCitywideStats = 123;

  assert.throws(
    () => runAppScript(browser),
    /Urban95Dashboards\.loadCitywideStats must be a function before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95CitySidebar member is missing", () => {
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
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebar.js", browser);
  runBrowserScript("docs/js/ui/infoModal.js", browser);
  runBrowserScript("docs/js/ui/sidebarChromeBindings.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodPanelRender.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodCompareRender.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodSidebar.js", browser);
  loadCitySidebarModules(browser);
  runBrowserScript("docs/js/ui/dashboards.js", browser);
  delete browser.window.Urban95CitySidebar.getGapState;

  assert.throws(
    () => runAppScript(browser),
    /Urban95CitySidebar\.getGapState is required before docs\/app\.js/
  );
});

function loadModeControllerAppPrerequisites(browser) {
  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/core/dataArtifacts.js", browser);
  runBrowserScript("docs/js/core/loaders.js", browser);
  runBrowserScript("docs/js/core/logger.js", browser);
  runBrowserScript("docs/js/core/runtimeData.js", browser);
  runBrowserScript("docs/js/core/pointDataSources.js", browser);
  runBrowserScript("docs/js/core/startup.js", browser);
  runBrowserScript("docs/js/core/loadingUi.js", browser);
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/ui/weightedMetricShowRegistry.js", browser);
  runBrowserScript("docs/js/scoring/scoreContext.js", browser);
  runBrowserScript("docs/js/scoring/weightedIndicatorIcons.js", browser);
  runBrowserScript("docs/js/scoring/scoreExplain.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);
  runBrowserScript("docs/js/ui/sidebarChromeBindings.js", browser);
  runBrowserScript("docs/js/ui/amenityMode.js", browser);
  runBrowserScript("docs/js/ui/controlActions.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
  runBrowserScript("docs/js/map/mapShell.js", browser);
  runBrowserScript("docs/js/map/neighborhoodScores.js", browser);
  runBrowserScript("docs/js/map/renderState.js", browser);
  runBrowserScript("docs/js/map/iconLoader.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebar.js", browser);
  runBrowserScript("docs/js/ui/infoModal.js", browser);
  runBrowserScript("docs/js/map/neighborhoodSelectionHighlight.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodSelection.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodPanelRender.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodCompareRender.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodSidebar.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodCompareApply.js", browser);
  loadCitySidebarModules(browser);
  runBrowserScript("docs/js/ui/dashboards.js", browser);
  runBrowserScript("docs/js/map/mapEvents.js", browser);
  runBrowserScript("docs/js/ui/overlayVisibility.js", browser);
}

test("app.js fails fast when Urban95ModeController is missing", () => {
  const browser = createBrowserContext({
    URBAN95_GENERATED_ARTIFACTS: {
      buildings: {
        status: "built",
        output: "./data/buildings_accessibility.pmtiles",
        source_layer: "buildings",
      },
    },
  });

  loadModeControllerAppPrerequisites(browser);

  assert.throws(
    () => runBrowserScript("docs/js/core/appDependencies.js", browser),
    /window\.Urban95ModeController is required before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95ModeController.create is missing", () => {
  const browser = createBrowserContext({
    URBAN95_GENERATED_ARTIFACTS: {
      buildings: {
        status: "built",
        output: "./data/buildings_accessibility.pmtiles",
        source_layer: "buildings",
      },
    },
  });

  loadModeControllerAppPrerequisites(browser);
  browser.window.Urban95ModeController = {};

  assert.throws(
    () => runBrowserScript("docs/js/core/appDependencies.js", browser),
    /Urban95ModeController\.create is required before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95ModeController.create has the wrong type", () => {
  const browser = createBrowserContext({
    URBAN95_GENERATED_ARTIFACTS: {
      buildings: {
        status: "built",
        output: "./data/buildings_accessibility.pmtiles",
        source_layer: "buildings",
      },
    },
  });

  loadModeControllerAppPrerequisites(browser);
  browser.window.Urban95ModeController = { create: 123 };

  assert.throws(
    () => runBrowserScript("docs/js/core/appDependencies.js", browser),
    /Urban95ModeController\.create must be a function before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95MapLayers member is missing", () => {
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
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
  delete browser.window.Urban95MapLayers.createBuildingsSource;

  assert.throws(
    () => runAppScript(browser),
    /Urban95MapLayers\.createBuildingsSource is required before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95MapLayers member has the wrong type", () => {
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
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
  browser.window.Urban95MapLayers.createBuildingsSource = 123;

  assert.throws(
    () => runAppScript(browser),
    /Urban95MapLayers\.createBuildingsSource must be a function before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95MapRenderers is missing", () => {
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
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebar.js", browser);
  runBrowserScript("docs/js/ui/infoModal.js", browser);
  runBrowserScript("docs/js/ui/dashboards.js", browser);

  assert.throws(
    () => runAppScript(browser),
    /window\.Urban95MapRenderers is required before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95MapRenderers member has the wrong type", () => {
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
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
  runBrowserScript("docs/js/map/mapRenderers.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebar.js", browser);
  runBrowserScript("docs/js/ui/infoModal.js", browser);
  runBrowserScript("docs/js/ui/dashboards.js", browser);
  browser.window.Urban95MapRenderers.updateAmenitiesSource = 123;

  assert.throws(
    () => runAppScript(browser),
    /Urban95MapRenderers\.updateAmenitiesSource must be a function before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95Selection is missing", () => {
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
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
  runBrowserScript("docs/js/map/mapRenderers.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebar.js", browser);
  runBrowserScript("docs/js/ui/infoModal.js", browser);
  runBrowserScript("docs/js/ui/dashboards.js", browser);

  assert.throws(
    () => runAppScript(browser),
    /window\.Urban95Selection is required before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95Selection member has the wrong type", () => {
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
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
  runBrowserScript("docs/js/map/mapRenderers.js", browser);
  runBrowserScript("docs/js/map/selection.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebar.js", browser);
  runBrowserScript("docs/js/ui/infoModal.js", browser);
  runBrowserScript("docs/js/ui/dashboards.js", browser);
  browser.window.Urban95Selection.clearRadiusSelection = 123;

  assert.throws(
    () => runAppScript(browser),
    /Urban95Selection\.clearRadiusSelection must be a function before docs\/app\.js/
  );
});

function createDesktopOnlyGateDocument() {
  const overlay = {
    hidden: true,
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    },
  };
  const loadingScreen = {
    classList: {
      classes: new Set(),
      add(className) {
        this.classes.add(className);
      },
      contains(className) {
        return this.classes.has(className);
      },
    },
  };
  const body = {
    classList: {
      classes: new Set(),
      add(className) {
        this.classes.add(className);
      },
      remove(className) {
        this.classes.delete(className);
      },
    },
  };
  const byId = {
    "desktop-only-overlay": overlay,
    "loading-screen": loadingScreen,
  };
  return {
    body,
    readyState: "complete",
    getElementById(id) {
      return byId[id] || null;
    },
  };
}

function runDesktopOnlyGateModule(overrides) {
  const browser = createBrowserContext(overrides || {});
  runBrowserScript("docs/js/core/desktopOnlyGate.js", browser);
  return browser.window.Urban95DesktopOnlyGate;
}

test("index includes city sidebar markup and removes citywide modal", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "index.html"), "utf8");
  assert.match(html, /id="city-sidebar"/);
  assert.match(html, /id="city-sidebar-body"/);
  assert.match(html, /id="city-sidebar-close"/);
  assert.doesNotMatch(html, /id="citywide-modal"/);
  assert.doesNotMatch(html, /id="citywide-body"/);
});

test("index includes desktop-only overlay markup", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "index.html"), "utf8");
  assert.match(html, /id="desktop-only-overlay"/);
  assert.match(html, /id="desktop-only-title"/);
  assert.match(
    html,
    /Please open this site on a laptop or desktop browser to explore the interactive map\./
  );
});

test("desktopOnlyGate exports viewport gate helpers", () => {
  const gate = runDesktopOnlyGateModule({
    document: createDesktopOnlyGateDocument(),
    matchMedia(query) {
      return { matches: query === "(max-width: 768px)", addEventListener() {} };
    },
  });

  assert.equal(gate.MOBILE_QUERY, "(max-width: 768px)");
  assert.equal(typeof gate.hasBypass, "function");
  assert.equal(typeof gate.isMobileViewport, "function");
  assert.equal(typeof gate.shouldBlock, "function");
  assert.equal(typeof gate.apply, "function");
  assert.equal(typeof gate.bind, "function");
});

test("desktopOnlyGate blocks mobile viewports and hides the loading screen", () => {
  const documentRef = createDesktopOnlyGateDocument();
  const gate = runDesktopOnlyGateModule({
    document: documentRef,
    matchMedia(query) {
      return { matches: query === "(max-width: 768px)", addEventListener() {} };
    },
  });

  const mobileResult = gate.apply({
    document: documentRef,
    matchMedia(query) {
      return { matches: query === "(max-width: 768px)" };
    },
  });

  assert.equal(mobileResult.blocked, true);
  assert.equal(documentRef.getElementById("desktop-only-overlay").hidden, false);
  assert.equal(documentRef.getElementById("desktop-only-overlay").getAttribute("aria-hidden"), "false");
  assert.ok(documentRef.body.classList.classes.has("desktop-only-blocked"));
  assert.ok(documentRef.getElementById("loading-screen").classList.classes.has("hidden"));

  const desktopResult = gate.apply({
    document: documentRef,
    matchMedia() {
      return { matches: false };
    },
  });

  assert.equal(desktopResult.blocked, false);
  assert.equal(documentRef.getElementById("desktop-only-overlay").hidden, true);
  assert.equal(documentRef.getElementById("desktop-only-overlay").getAttribute("aria-hidden"), "true");
  assert.equal(documentRef.body.classList.classes.has("desktop-only-blocked"), false);
});

test("desktopOnlyGate supports ?desktop bypass for testing", () => {
  const documentRef = createDesktopOnlyGateDocument();
  const gate = runDesktopOnlyGateModule({
    document: documentRef,
    location: { search: "?desktop=1" },
    matchMedia() {
      return { matches: true };
    },
  });

  assert.equal(gate.hasBypass({ search: "?desktop=1" }), true);
  assert.equal(
    gate.apply({
      document: documentRef,
      location: { search: "?desktop=1" },
      matchMedia() {
        return { matches: true };
      },
    }).blocked,
    false
  );
});

test("weighted metric registry fields exist in generated neighborhood artifacts", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);

  const registry = browser.window.Urban95ScoreModel.buildWeightedMetricRegistry();
  const metrics = Object.values(registry).filter((metric) => metric && metric.kind.indexOf("weighted") === 0);
  const neighborhoodSurface = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "data", "neighborhood_surface.geojson"), "utf8")
  );
  const citywideStats = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "data", "citywide_stats.json"), "utf8")
  );
  const surfaceProps = ((neighborhoodSurface.features || [])[0] || {}).properties || {};
  const rankingRows = citywideStats.neighborhood_ranking_weighted || [];

  metrics.forEach((metric) => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(surfaceProps, metric.surfacePropertyKey),
      metric.id + " missing surface field " + metric.surfacePropertyKey
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(citywideStats, metric.neighborhoodAverageKey) ||
        rankingRows.some((row) => Object.prototype.hasOwnProperty.call(row, metric.neighborhoodAverageKey)),
      metric.id + " missing citywide/ranking field " + metric.neighborhoodAverageKey
    );
  });
});
