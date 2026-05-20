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

function loadAppCoordinatorNamespaces(browser) {
  runBrowserScript("docs/js/core/logger.js", browser);
  runBrowserScript("docs/js/core/startup.js", browser);
}

function runAppScript(browser) {
  loadAppCoordinatorNamespaces(browser);
  runBrowserScript("docs/js/map/modeController.js", browser);
  runBrowserScript("docs/js/map/mapEvents.js", browser);
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
  const startupIndex = requireScriptIndex(scripts, "./js/core/startup.js");
  assert.ok(runtimeIndex < startupIndex);
  const appStateIndex = requireScriptIndex(scripts, "./js/core/appState.js");
  assert.ok(startupIndex < appStateIndex);
  assert.ok(appStateIndex < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/core/perfPanel.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/scoring/scoreModel.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/map/mapLayers.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/map/mapRenderers.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/map/selection.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/ui/controls.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/ui/scoreSidebar.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/ui/infoModal.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/ui/dashboards.js") < appIndex);
  const modeControllerIndex = requireScriptIndex(scripts, "./js/map/modeController.js");
  assert.ok(modeControllerIndex < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/ui/dashboards.js") < modeControllerIndex);
  const mapEventsIndex = requireScriptIndex(scripts, "./js/map/mapEvents.js");
  assert.ok(modeControllerIndex < mapEventsIndex);
  assert.ok(mapEventsIndex < appIndex);
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
  runBrowserScript("docs/js/core/startup.js", browser);
  runBrowserScript("docs/js/core/perfPanel.js", browser);
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
  runBrowserScript("docs/js/map/mapRenderers.js", browser);
  runBrowserScript("docs/js/map/selection.js", browser);
  runBrowserScript("docs/js/ui/controls.js", browser);
  runBrowserScript("docs/js/ui/scoreSidebar.js", browser);
  runBrowserScript("docs/js/ui/infoModal.js", browser);
  runBrowserScript("docs/js/ui/dashboards.js", browser);

  assert.equal(browser.window.Urban95Config.urls.buildings, "./data/buildings_accessibility.geojson");
  assert.equal(typeof browser.window.Urban95DataArtifacts.hasGeneratedArtifact, "function");
  assert.equal(typeof browser.window.Urban95Loaders.fetchJsonWithGzipFallback, "function");
  assert.equal(typeof browser.window.Urban95RuntimeData.createLoaders, "function");
  assert.equal(typeof browser.window.Urban95Startup.run, "function");
  assert.equal(typeof browser.window.urban95Perf.phase, "function");
  assert.equal(typeof browser.window.Urban95ScoreModel.getBuildingOverallScore, "function");
  assert.equal(typeof browser.window.Urban95MapLayers.resolveBuildingContracts, "function");
  assert.equal(typeof browser.window.Urban95MapLayers.createPmtilesProtocol, "function");
  assert.equal(typeof browser.window.Urban95MapLayers.createBuildingsSource, "function");
  assert.equal(typeof browser.window.Urban95MapLayers.createBuildingsFillLayer, "function");
  assert.equal(typeof browser.window.Urban95MapLayers.createBuildingsSelectedLayer, "function");
  assert.equal(typeof browser.window.Urban95MapLayers.applyParkDotPattern, "function");
  [
    "configure",
    "setLayerVisibilityIfPresent",
    "setLayerVisibility",
    "resetPointHoverState",
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

test("startup module exposes Urban95Startup.run", () => {
  const startup = runCoreStartup();
  assert.ok(startup);
  assert.equal(typeof startup.run, "function");
});

test("startup extraction keeps grouped dependency seams in source", () => {
  const appSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "app.js"),
    "utf8"
  );
  const startupSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "core", "startup.js"),
    "utf8"
  );

  assert.match(appSource, /Urban95Startup\.run\(\s*\{/);
  assert.doesNotMatch(appSource, /map\.on\("load",\s*async function/);
  [
    "state:",
    "runtime:",
    "loading:",
    "callbacks:",
    "renderers:",
    "selection:",
    "urls:",
  ].forEach(function (groupName) {
    assert.match(appSource, new RegExp(groupName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
  assert.doesNotMatch(appSource, /scoreData:/);
  assert.match(appSource, /Urban95Startup\.run\(\{[\s\S]*\}\)\.catch\(function \(error\) \{/);
  assert.match(appSource, /Urban95Logger\.error\("Failed to start app:", error\);/);
  assert.doesNotMatch(appSource, /setCleanAmenitiesData\s*:/);
  assert.doesNotMatch(appSource, /setLegacyAmenitiesData\s*:/);
  assert.doesNotMatch(appSource, /setBuildingsData\s*:/);
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

  handlers.find((handler) => handler.eventName === "zoomend").handler();
  assert.ok(calls.includes("loadTreesIfNeeded"));
  assert.ok(calls.includes("loadStreetLightsIfNeeded"));
  assert.ok(calls.includes("updateTreesSource"));
  assert.ok(calls.includes("updateStreetLightsSource"));

  handlers.find(
    (handler) => handler.eventName === "click" && handler.layer === "neighborhoods-fill"
  ).handler({
    features: [{ properties: { name: "N" } }],
  });
  assert.ok(calls.includes("showNeighborhoodModal"));
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

  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
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
  assert.match(runtimeSource, /loadBuildingsRuntimeData/);
  assert.match(runtimeSource, /loadIsochronesLookup/);
  assert.match(runtimeSource, /loadPointsLookup/);

  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const startupSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "core", "startup.js"),
    "utf8"
  );
  assert.match(appSource, /Urban95Startup\.run\(\s*\{/);
  assert.match(startupSource, /loadBuildingsRuntimeData/);
  assert.match(startupSource, /loadPointsLookup/);
  assert.doesNotMatch(appSource, buildingRenderedFeaturesLayerPattern);
});

test("task-7 app coordinator wires map renderer and selection modules", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const startupSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "core", "startup.js"),
    "utf8"
  );
  const mapEventsSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "mapEvents.js"),
    "utf8"
  );
  assert.match(appSource, /const Urban95MapRenderers = requireNamespace\(window, "Urban95MapRenderers"\);/);
  assert.match(appSource, /const Urban95Selection = requireNamespace\(window, "Urban95Selection"\);/);
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
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  assert.match(appSource, /const Urban95Controls = requireNamespace\(window, "Urban95Controls"\);/);
  assert.match(appSource, /controlsBinding = Urban95Controls\.bind\(\{/);
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
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");

  assert.match(appSource, /Urban95Startup\.run\(/);
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
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  assert.match(
    appSource,
    /const shouldBlockForSelectedBuilding = !!selectedBuildingCentroid && !isochronesLoaded;/
  );
  assert.match(appSource, /if \(shouldBlockForSelectedBuilding\) \{\s*showIsochroneLoadingScreen\(\);/);
  assert.match(
    appSource,
    /Urban95Selection\.loadIsochrones\(\{\s*background:\s*!shouldBlockForSelectedBuilding\s*\}\);/
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
});

test("mode controller keeps house cleanup centralized in switchMode", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const modeSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "modeController.js"),
    "utf8"
  );

  const neighborhoodStart = modeSource.indexOf("function enterNeighborhoodMode()");
  const neighborhoodEnd = modeSource.indexOf("function exitNeighborhoodMode()");
  const citywideStart = modeSource.indexOf("function enterCitywideMode()");
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
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const selectionSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "selection.js"),
    "utf8"
  );
  assert.match(appSource, /const BUILDING_LAYER_CONTRACTS = resolveBuildingContracts\(\{/);
  assert.match(appSource, /const BUILDINGS_MAP_SOURCE_ID = BUILDING_LAYER_CONTRACTS\.sourceId;/);
  assert.match(appSource, /const BUILDINGS_FILL_LAYER_ID = BUILDING_LAYER_CONTRACTS\.fillLayerId;/);
  assert.match(appSource, /const BUILDINGS_SELECTED_STATE_KEY = BUILDING_LAYER_CONTRACTS\.selectedStateKey;/);
  assert.match(appSource, /\[BUILDINGS_MAP_SOURCE_ID\]\s*:\s*_urban95BuildingsSource/);
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
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  assert.match(appSource, /function requireNamespace\s*\(/);
  assert.match(appSource, /function requireScoreModelMember\s*\(/);
  assert.match(appSource, /const Urban95ScoreModel = requireNamespace\(window, "Urban95ScoreModel"\);/);
  assert.match(appSource, /const percentileBreakpoints = requireScoreModelMember\(Urban95ScoreModel, "percentileBreakpoints"\);/);
  assert.match(appSource, /const formatMetricNumber = requireScoreModelMember\(Urban95ScoreModel, "formatMetricNumber"\);/);

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
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  assert.match(appSource, /const Urban95ScoreSidebar = requireNamespace\(window, "Urban95ScoreSidebar"\);/);
  assert.match(appSource, /Urban95ScoreSidebar\.configure\(\{/);
  assert.match(appSource, /Urban95ScoreSidebar\.isOpen\(\)/);
  assert.match(appSource, /Urban95ScoreSidebar\.hide\(\)/);
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
  assert.match(appSource, /setSidebarPadding:\s*setScoreSidebarMapPadding/);
  assert.match(appSource, /restoreFocusAfterHide:\s*focusMapAfterScoreSidebar/);
  assert.match(appSource, /syncScoreSidebar:\s*Urban95ScoreSidebar\.sync/);
  assert.match(appSource, /hideScoreSidebar:\s*Urban95ScoreSidebar\.hide/);
  assert.match(selectionSource, /d\.hideScoreSidebar\(\{\s*restoreFocus:\s*false\s*\}\)/);
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
    () => runBrowserScript("docs/app.js", browser),
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
    () => runBrowserScript("docs/app.js", browser),
    /window\.Urban95Startup is required before docs\/app\.js/
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
  runBrowserScript("docs/js/map/mapLayers.js", browser);
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
  runBrowserScript("docs/js/core/startup.js", browser);
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/map/mapLayers.js", browser);
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
    () => runBrowserScript("docs/app.js", browser),
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
    () => runBrowserScript("docs/app.js", browser),
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
    () => runBrowserScript("docs/app.js", browser),
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
