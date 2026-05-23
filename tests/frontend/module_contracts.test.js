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
  runBrowserScript("docs/js/scoring/scoreExplain.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);
  runBrowserScript("docs/js/ui/amenityMode.js", browser);
  runBrowserScript("docs/js/ui/controlActions.js", browser);
  runBrowserScript("docs/js/map/mapShell.js", browser);
  runBrowserScript("docs/js/map/neighborhoodScores.js", browser);
  runBrowserScript("docs/js/map/iconLoader.js", browser);
  runBrowserScript("docs/js/map/modeController.js", browser);
  runBrowserScript("docs/js/map/mapEvents.js", browser);
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
  const scoreContextIndex = requireScriptIndex(scripts, "./js/scoring/scoreContext.js");
  const scoreExplainIndex = requireScriptIndex(scripts, "./js/scoring/scoreExplain.js");
  const scoreSidebarChromeIndex = requireScriptIndex(scripts, "./js/ui/scoreSidebarChrome.js");
  const scoreSidebarIndex = requireScriptIndex(scripts, "./js/ui/scoreSidebar.js");
  const mapLayersIndex = requireScriptIndex(scripts, "./js/map/mapLayers.js");
  const mapShellIndex = requireScriptIndex(scripts, "./js/map/mapShell.js");
  assert.ok(requireScriptIndex(scripts, "./js/scoring/scoreModel.js") < scoreContextIndex);
  assert.ok(scoreContextIndex < scoreExplainIndex);
  assert.ok(scoreExplainIndex < scoreSidebarIndex);
  assert.ok(scoreSidebarChromeIndex < scoreSidebarIndex);
  assert.ok(scoreSidebarChromeIndex < mapLayersIndex);
  const neighborhoodScoresIndex = requireScriptIndex(scripts, "./js/map/neighborhoodScores.js");
  const iconLoaderIndex = requireScriptIndex(scripts, "./js/map/iconLoader.js");
  assert.ok(mapLayersIndex < iconLoaderIndex);
  assert.ok(mapShellIndex < neighborhoodScoresIndex);
  assert.ok(neighborhoodScoresIndex < iconLoaderIndex);
  assert.ok(mapLayersIndex < appIndex);
  assert.ok(iconLoaderIndex < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/map/mapRenderers.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/map/selection.js") < appIndex);
  const amenityModeIndex = requireScriptIndex(scripts, "./js/ui/amenityMode.js");
  const controlActionsIndex = requireScriptIndex(scripts, "./js/ui/controlActions.js");
  const controlsIndex = requireScriptIndex(scripts, "./js/ui/controls.js");
  assert.ok(scoreSidebarChromeIndex < amenityModeIndex);
  assert.ok(amenityModeIndex < mapLayersIndex);
  assert.ok(mapLayersIndex < mapShellIndex);
  assert.ok(mapShellIndex < appIndex);
  assert.ok(amenityModeIndex < controlsIndex);
  assert.ok(controlActionsIndex < controlsIndex);
  assert.ok(controlActionsIndex < appIndex);
  assert.ok(controlsIndex < appIndex);
  assert.ok(scoreSidebarIndex < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/ui/infoModal.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/ui/dashboards.js") < appIndex);
  const modeControllerIndex = requireScriptIndex(scripts, "./js/map/modeController.js");
  assert.ok(modeControllerIndex < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/ui/dashboards.js") < modeControllerIndex);
  const mapEventsIndex = requireScriptIndex(scripts, "./js/map/mapEvents.js");
  assert.ok(modeControllerIndex < mapEventsIndex);
  assert.ok(mapEventsIndex < appIndex);
  const appDependenciesIndex = requireScriptIndex(scripts, "./js/core/appDependencies.js");
  assert.ok(mapEventsIndex < appDependenciesIndex);
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
  runBrowserScript("docs/js/scoring/scoreExplain.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);
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
    "updateAccessibilityLegendLabels",
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
  assert.equal(typeof browser.window.Urban95Dashboards.showNeighborhoodModal, "function");
  assert.equal(typeof browser.window.Urban95Dashboards.renderCitywideModal, "function");
  assert.equal(typeof browser.window.Urban95Dashboards.hideNeighborhoodModal, "function");
  assert.equal(typeof browser.window.Urban95Dashboards.hideCitywideModal, "function");
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
  assert.equal(typeof browser.window.Urban95Dashboards.showCitywideModal, "function");
  assert.equal(typeof browser.window.Urban95Dashboards.renderNeighborhoodCharts, "function");
  assert.equal(typeof browser.window.Urban95Dashboards.renderCitywideCharts, "function");
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
      updateShowPointsToggleLabel: function () { calls.push("toggleLabel"); },
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
      updateShowPointsToggleLabel: function () { calls.push("toggleLabel"); },
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
      updateShowPointsToggleLabel: () => calls.push("updateShowPointsToggleLabel"),
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
      selectBuilding: (building, doFly) => calls.push(["selectBuilding", building, doFly]),
    },
  });

  await amenityMode.apply();

  assert.deepEqual(
    calls.filter((item) => item === "updateAmenitiesSource" || item === "updateTreesSource" || item === "updateStreetLightsSource"),
    [],
    "selected-building score-mode apply must not refresh point sources before selectBuilding"
  );
  assert.equal(calls.filter((item) => Array.isArray(item) && item[0] === "selectBuilding").length, 1);
  assert.ok(calls.includes("updateBuildingColors"));
});

test("control actions own score-mode, filter, walk-minute, escape, and heatmap reactions", async () => {
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
  const classListWithShow = {
    contains: function (name) {
      return name === "show";
    },
  };
  const classListWithoutShow = {
    contains: function () {
      return false;
    },
  };

  const actions = browser.window.Urban95ControlActions.create({
    perf: {
      session: function (name) {
        calls.push("session:" + name);
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
    dashboards: {
      showNeighborhoodModal: function () {
        calls.push("showNeighborhood");
      },
      renderCitywideModal: function () {
        calls.push("showCitywide");
      },
      updateCitywideModalTitle: function () {
        calls.push("citywideTitle");
      },
      hideNeighborhoodModal: function () {
        calls.push("hideNeighborhood");
      },
      hideCitywideModal: function () {
        calls.push("hideCitywide");
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
      getNeighborhoodModal: function () {
        return { classList: classListWithShow };
      },
      getCitywideModal: function () {
        return { classList: classListWithShow };
      },
    },
  });

  actions.onFilterSelectionChanged();
  await actions.onScoreModeChanged("expanded");
  state.scoreMode = "expanded";
  await actions.onScoreModeChanged("weighted");
  actions.onWalkMinutesChanged();
  await actions.onModeToggleRequested("citywide");
  actions.onHeatmapVisibilityChanged(false);
  state.currentMode = "citywide";
  actions.onEscape({ stopPropagation: function () { calls.push("stopPropagation"); } });

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
    "showIso",
    "loadIso:false",
    "amenityApply",
    "radiusInfo",
  ]);
  assertSubsequence([
    "session:score-model -> Urban95",
    "phase:scoreModelToggle:handler",
    "waitingIso",
    "isoDeferred",
    "amenityApply",
    "radiusInfo",
    "buildings",
    "surface",
    "selectBuilding:false",
  ]);
  assertSubsequence([
    "session:analysis mode -> citywide",
    "phase:modeToggle:click",
    "switch:citywide",
    "getLayer:neighborhoods-surface",
    "heatmap none",
    "scoreSidebarOpen",
    "hideCitywide",
    "switch:house",
  ]);

  assert.ok(!calls.includes("amenities"));
  assert.ok(!calls.includes("trees"));
  assert.ok(!calls.includes("lights"));
  assert.ok(calls.includes("showIso"));
  assert.ok(calls.includes("amenityApply"));
  assert.ok(calls.includes("radiusInfo"));
  assert.ok(calls.includes("switch:citywide"));
  assert.ok(calls.includes("heatmap none"));
  assert.ok(calls.includes("isoDeferred"));
  assert.ok(!calls.includes("mark:isochrones"));
});

test("filter changes with selected building recompute selection before point-source refresh", () => {
  const ControlActions = runControlActionsModule();
  const calls = [];
  const selectedBuilding = { properties: { building_id: 202 } };
  const actions = ControlActions.create({
    perf: { session: () => {}, phase: (_name, callback) => callback() },
    state: {
      getCurrentMode: () => "house",
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
    dashboards: {
      showNeighborhoodModal: () => {},
      renderCitywideModal: () => {},
      updateCitywideModalTitle: () => {},
      hideNeighborhoodModal: () => {},
      hideCitywideModal: () => {},
    },
    scoreSidebar: { isOpen: () => false, hide: () => {} },
    modeController: { switchMode: () => {} },
    map: { getLayer: () => false, setLayoutProperty: () => {} },
    ui: { getNeighborhoodModal: () => null, getCitywideModal: () => null },
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
    dashboards: {
      showNeighborhoodModal: () => {},
      renderCitywideModal: () => {},
      updateCitywideModalTitle: () => {},
      hideNeighborhoodModal: () => {},
      hideCitywideModal: () => {},
    },
    scoreSidebar: { isOpen: () => false, hide: () => {} },
    modeController: { switchMode: () => {} },
    map: { getLayer: () => false, setLayoutProperty: () => {} },
    ui: { getNeighborhoodModal: () => null, getCitywideModal: () => null },
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

test("app dependency validation is exposed through one namespace without leaking helper globals", () => {
  const dependenciesSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "core", "appDependencies.js"),
    "utf8"
  );
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");

  assert.match(dependenciesSource, /^\(function \(\) \{/m);
  assert.match(dependenciesSource, /window\.Urban95AppDependencies\s*=\s*\{/);
  assert.match(appSource, /}\s*=\s*window\.Urban95AppDependencies;/);

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

  assert.deepEqual(Object.keys(iconLoader).sort(), ["areIconsLoaded", "loadAmenityIcons"]);
  assert.deepEqual(Array.from(mapImages.keys()).sort(), ["marker", "park", "school"]);
  ["marker", "park", "school"].forEach(function (name) {
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

  assert.deepEqual(fetchedUrls, []);
  assert.deepEqual(imageUrls.sort(), [
    "./icons/marker%2Fdefault.svg",
    "./icons/park%20playground.svg",
  ]);
  assert.deepEqual(Array.from(mapImages.keys()).sort(), ["marker/default", "park playground"]);
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
  assert.equal(loading.state.icons, false);
  loading.mark("icons");
  loading.mark("buildings");
  assert.equal(loading.state.icons, true);
  assert.equal(loading.getLoadingState(), loading.state);
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
          addAmenityLayers: function () {},
          applyShowPointsToggle: function () {},
          updateBuildingColors: function () {},
        },
        selection: {},
        urls: {
          buildings: "./data/buildings_accessibility.geojson",
          parks: "./data/parks.geojson",
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
  assert.match(eventsSource, /showNeighborhoodModal/);
  assert.match(eventsSource, /showNeighborhoodAreaTooltip/);
});

test("special point render plan prefers generated vectors in weighted mode", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/mapRenderers.js", browser);

  browser.window.Urban95MapRenderers.configure({
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
      return false;
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
  assert.ok(calls.includes("showNeighborhoodModal"));
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
      showNeighborhoodModal: function () {},
      getNeighborhoodFeatureAtPoint: function () {
        return null;
      },
      showNeighborhoodAreaTooltip: function () {},
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
      showNeighborhoodModal: function () {},
      getNeighborhoodFeatureAtPoint: function () {},
      showNeighborhoodAreaTooltip: function () {},
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
      showNeighborhoodModal: function () {},
      getNeighborhoodFeatureAtPoint: function () {},
      showNeighborhoodAreaTooltip: function () {},
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
    /renderers:\s*\{\s*applyShowPointsToggle:\s*Urban95MapRenderers\.applyShowPointsToggle,\s*updateAmenitiesSource:\s*Urban95MapRenderers\.updateAmenitiesSource,\s*updateTreesSource:\s*Urban95MapRenderers\.updateTreesSource,\s*updateStreetLightsSource:\s*Urban95MapRenderers\.updateStreetLightsSource,\s*updateBuildingColors:\s*Urban95MapRenderers\.updateBuildingColors,\s*updateNeighborhoodSurfaceData:\s*Urban95MapRenderers\.updateNeighborhoodSurfaceData,\s*\}/s
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
    appLines <= 1200,
    "docs/app.js should stay at or below 1200 lines after final coordinator extraction, got " + appLines
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
  assert.doesNotMatch(appSource, /function\s+switchMode\s*\(/);
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

  assert.match(appSource, /pointsVisibilitySection:\s*pointsVisibilitySectionEl/);
  assert.match(appSource, /legendSection:\s*legendSectionEl/);
  assert.match(appSource, /radiusInfo:\s*radiusInfoEl/);
  assert.match(appSource, /citywideBody:\s*citywideBodyEl/);
  assert.doesNotMatch(modeSource, /documentRef/);
  assert.doesNotMatch(modeSource, /getElementById/);
  assert.doesNotMatch(modeSource, /querySelector\s*\(/);
});

test("control actions uses explicit modal accessors instead of document lookups", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const controlActionsSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "ui", "controlActions.js"),
    "utf8"
  );

  assert.match(
    appSource,
    /ui:\s*\{\s*getNeighborhoodModal:\s*function \(\) \{\s*return neighborhoodModalEl;\s*\},\s*getCitywideModal:\s*function \(\) \{\s*return citywideModalEl;\s*\},\s*\}/s
  );
  assert.match(controlActionsSource, /\["ui\.getNeighborhoodModal", ui\.getNeighborhoodModal\]/);
  assert.match(controlActionsSource, /\["ui\.getCitywideModal", ui\.getCitywideModal\]/);
  assert.match(controlActionsSource, /var getNeighborhoodModal = ui\.getNeighborhoodModal;/);
  assert.match(controlActionsSource, /var getCitywideModal = ui\.getCitywideModal;/);
  assert.doesNotMatch(controlActionsSource, /documentRef/);
  assert.doesNotMatch(controlActionsSource, /getElementById/);
  assert.doesNotMatch(controlActionsSource, /["']neighborhood-modal["']/);
  assert.doesNotMatch(controlActionsSource, /["']citywide-modal["']/);
});

test("control actions no longer requires or receives state.getScoreMode", () => {
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

  assert.doesNotMatch(controlActionsSource, /\["state\.getScoreMode", state\.getScoreMode\]/);
  assert.doesNotMatch(controlActionsCreateBlock, /getScoreMode:\s*getScoreModeState,/);
});

function createModeControllerHarness(overrides) {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/modeController.js", browser);

  const calls = [];
  const layers = new Set(["buildings-fill"]);
  let currentMode = "house";

  const deps = {
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
        hideNeighborhoodModal() {
          calls.push(["dashboards:hideNeighborhoodModal"]);
        },
        hideCitywideModal() {
          calls.push(["dashboards:hideCitywideModal"]);
        },
        renderCitywideModal() {
          calls.push(["dashboards:renderCitywideModal"]);
        },
        showCitywideModal() {
          calls.push(["dashboards:showCitywideModal"]);
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
    },
    ui: {
      modeToggle: {
        querySelectorAll() {
          return [];
        },
      },
      modeHint: { textContent: "" },
      showHeatmapToggle: { checked: true },
      pointsVisibilitySection: { style: { display: "initial" } },
      legendSection: { style: { display: "initial" } },
      radiusInfo: { style: { display: "block" } },
      citywideBody: { innerHTML: "" },
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
  assert.ok(
    citywideHarness.calls.some(
      (call) => call[0] === "logger:error" && String(call[1]).includes("citywide")
    )
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

test("amenities focus first switch loads isochrones in background until a building is selected", () => {
  const controlActionsSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "ui", "controlActions.js"),
    "utf8"
  );
  assert.match(controlActionsSource, /if \(nextScoreMode !== "weighted"\) \{/);
  assert.match(
    controlActionsSource,
    /var shouldBlockForSelectedBuilding =\s*!!state\.getSelectedBuilding\(\) && !state\.getIsochronesLoaded\(\);/
  );
  assert.match(
    controlActionsSource,
    /if \(shouldBlockForSelectedBuilding\) \{\s*loadingUi\.showIsochroneLoadingScreen\(\);/
  );
  assert.match(
    controlActionsSource,
    /selection\.loadIsochrones\(\{\s*background:\s*!shouldBlockForSelectedBuilding\s*\}\);/
  );
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
  assert.match(appSource, /const switchMode = modeController\.switchMode;/);
  assert.doesNotMatch(appSource, /exitNeighborhoodMode/);
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
  const makeElement = function () {
    return {
      style: {},
      disabled: false,
      textContent: "",
      innerHTML: "",
      className: "",
      checked: true,
      classList: {
        add() {},
        remove() {},
        contains() {
          return false;
        },
        toggle() {},
      },
      addEventListener(type, handler) {
        listeners.push({ type, handler });
      },
      setAttribute() {},
      contains() {
        return false;
      },
      querySelectorAll() {
        return [];
      },
      appendChild() {},
    };
  };
  browser.window.document.addEventListener = function (type, handler) {
    listeners.push({ type, handler });
  };

  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/ui/controls.js", browser);

  assert.throws(
    () => browser.window.Urban95Controls.bind({}),
    /Urban95Controls\.bind missing required dependency: elements/
  );

  const elements = {
    filterBtn: makeElement(),
    filterPopup: makeElement(),
    filterLabel: makeElement(),
    filterItems: makeElement(),
    filterBackdrop: makeElement(),
    amenityFilterSection: makeElement(),
    radiusSection: makeElement(),
    radiusToggle: makeElement(),
    scoreModelToggle: makeElement(),
    modeToggle: makeElement(),
    modeHint: makeElement(),
    showTreesToggle: makeElement(),
    showLightsToggle: makeElement(),
    showAmenityPointsToggle: makeElement(),
    showHeatmapToggle: makeElement(),
    urban95PointToggles: makeElement(),
    amenityPointsToggleWrap: makeElement(),
  };
  runBrowserScript("docs/js/core/appState.js", browser);
  const appState = browser.window.Urban95AppState.create();
  appState.setSelectedAmenityTypes(new Set(["trees"]));
  appState.setAllFilterTypes(["trees", "street-lights"]);
  const binding = browser.window.Urban95Controls.bind({
    elements,
    scoreModel: browser.window.Urban95ScoreModel,
    getState() {
      return {
        scoreMode: "weighted",
        currentMode: "house",
        selectedAmenityTypes: appState.getSelectedAmenityTypes(),
        allFilterTypes: appState.getAllFilterTypes(),
        lastFilterRadioSelection: appState.getLastFilterRadioSelection(),
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
      onHeatmapVisibilityChanged() {},
      onEscape() {},
      clearDerivedCaches() {},
    },
  });

  [
    "getScoreModeLabel",
    "updateFilterLabel",
    "buildFilterItems",
    "closeFilterPopup",
    "syncFilterUiForScoreMode",
    "updateShowPointsToggleLabel",
    "describeTypeMix",
  ].forEach(function (memberName) {
    assert.equal(typeof binding[memberName], "function");
  });
  assert.ok(listeners.some((entry) => entry.type === "keydown"));
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
    /scoreSidebar:\s*\{\s*isOpen:\s*Urban95ScoreSidebar\.isOpen,\s*hide:\s*Urban95ScoreSidebar\.hide,\s*\}/s
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
  assert.match(sidebarSource, /var restoreFocus = !options \|\| options\.restoreFocus !== false;/);
  assert.match(sidebarSource, /d\.setSidebarPadding\(true,\s*getSidebarWidth\(\)\)/);
  assert.match(sidebarSource, /d\.setSidebarPadding\(false,\s*0\)/);
  assert.match(sidebarSource, /if \(!isScoreExplainSidebarOpen\(\)\) return;/);
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

test("score explanation create fails fast when a required scoreModel member is missing", () => {
  const browser = createBrowserContext();
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
  assert.equal(explain.getWeightedCategoryIcon("nature"), "park");
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
    explain.renderHorizonLabelCell("Nature", "park", "", "#7CB342"),
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
  runBrowserScript("docs/js/scoring/scoreContext.js", browser);
  runBrowserScript("docs/js/scoring/scoreExplain.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);
  runBrowserScript("docs/js/ui/amenityMode.js", browser);
  runBrowserScript("docs/js/ui/controlActions.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
  runBrowserScript("docs/js/map/mapShell.js", browser);
  runBrowserScript("docs/js/map/neighborhoodScores.js", browser);
  runBrowserScript("docs/js/map/iconLoader.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebar.js", browser);
  runBrowserScript("docs/js/ui/infoModal.js", browser);
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
  delete browser.window.Urban95Dashboards.renderCitywideModal;

  assert.throws(
    () => runAppScript(browser),
    /Urban95Dashboards\.renderCitywideModal is required before docs\/app\.js/
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
  browser.window.Urban95Dashboards.renderCitywideModal = 123;

  assert.throws(
    () => runAppScript(browser),
    /Urban95Dashboards\.renderCitywideModal must be a function before docs\/app\.js/
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
  runBrowserScript("docs/js/scoring/scoreContext.js", browser);
  runBrowserScript("docs/js/scoring/scoreExplain.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebarChrome.js", browser);
  runBrowserScript("docs/js/ui/amenityMode.js", browser);
  runBrowserScript("docs/js/ui/controlActions.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
  runBrowserScript("docs/js/map/mapShell.js", browser);
  runBrowserScript("docs/js/map/neighborhoodScores.js", browser);
  runBrowserScript("docs/js/map/iconLoader.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebar.js", browser);
  runBrowserScript("docs/js/ui/infoModal.js", browser);
  runBrowserScript("docs/js/ui/dashboards.js", browser);
  runBrowserScript("docs/js/map/mapEvents.js", browser);
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
