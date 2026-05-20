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

const buildingRenderedFeaturesLayerPattern =
  /(?:\bmap\s*\.\s*)?queryRenderedFeatures\s*\([^)]*\{[^}]*\blayers\s*:\s*\[[^\]]*(?:"[^"]*buildings[^"]*"|'[^']*buildings[^']*'|BUILDINGS_VECTOR_LAYER_ID)[^\]]*\][^}]*\}[^)]*\)/;

test("index loads core frontend modules before app.js", () => {
  const scripts = scriptSourcesFromIndex();
  const appIndex = requireScriptIndex(scripts, "./app.js");

  assert.ok(requireScriptIndex(scripts, "./data/pmtiles_manifest.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/core/config.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/core/dataArtifacts.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/core/loaders.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/core/runtimeData.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/core/perfPanel.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/scoring/scoreModel.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/map/mapLayers.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/map/mapRenderers.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/map/selection.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/ui/controls.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/ui/scoreSidebar.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/ui/infoModal.js") < appIndex);
  assert.ok(requireScriptIndex(scripts, "./js/ui/dashboards.js") < appIndex);
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
  assert.match(appSource, /loadBuildingsRuntimeData/);
  assert.match(appSource, /loadPointsLookup/);
  assert.doesNotMatch(appSource, buildingRenderedFeaturesLayerPattern);
});

test("task-7 app coordinator wires map renderer and selection modules", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  assert.match(appSource, /const Urban95MapRenderers = requireNamespace\(window, "Urban95MapRenderers"\);/);
  assert.match(appSource, /const Urban95Selection = requireNamespace\(window, "Urban95Selection"\);/);
  assert.match(appSource, /Urban95MapRenderers\.configure\(\{/);
  assert.match(appSource, /Urban95Selection\.configure\(\{/);
  assert.match(appSource, /hasRadiusSelectionState:\s*function\s*\(\)\s*\{/);
  assert.match(appSource, /Urban95Selection\.buildBuildingCentroidGridIndex\(\);/);
  assert.match(appSource, /Urban95Selection\.findClosestBuilding\(e\.lngLat\)/);
  assert.match(appSource, /Urban95Selection\.selectBuilding\(closest,\s*true\)/);
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
  assert.match(appSource, /let treesGeojsonLoadPromise = null;/);
  assert.match(appSource, /let streetLightsGeojsonLoadPromise = null;/);
  assert.match(appSource, /if \(treesGeojsonLoadInFlight\) return treesGeojsonLoadPromise \|\| Promise\.resolve\(null\);/);
  assert.match(appSource, /return Promise\.all\(pointDataLoads\)\.then\(function \(\) \{/);
  assert.match(
    appSource,
    /return ensureExpandedPointDataLoaded\(\)\.then\(function \(\) \{[\s\S]*Urban95Selection\.selectBuilding\(selectedBuildingCentroid,\s*false\);[\s\S]*\}\);/
  );
  assert.match(
    appSource,
    /applyScoreModeAmenities\(\)\.then\(function \(\) \{[\s\S]*Urban95Selection\.updateRadiusInfo\(\);[\s\S]*\}\);/
  );
  assert.match(appSource, /function canRefreshPointAnalysisAfterPointDataLoad\(\) \{/);
  assert.match(
    appSource,
    /treesDataSource === "geojson" && streetLightsDataSource === "geojson"/
  );
  assert.match(
    appSource,
    /if \(selectedBuildingCentroid && canRefreshPointAnalysisAfterPointDataLoad\(\)\) \{[\s\S]*Urban95Selection\.selectBuilding\(selectedBuildingCentroid,\s*false\);/
  );
  const treesLoaderBlock = appSource.slice(
    appSource.indexOf("function loadTreesIfNeeded()"),
    appSource.indexOf("function loadStreetLightsIfNeeded()")
  );
  const streetLightsLoaderBlock = appSource.slice(
    appSource.indexOf("function loadStreetLightsIfNeeded()"),
    appSource.indexOf("function ensureExpandedPointDataLoaded()")
  );
  const guardedLoaderRefresh =
    /if \(selectedBuildingCentroid && canRefreshPointAnalysisAfterPointDataLoad\(\)\) \{\s*Urban95Selection\.selectBuilding\(selectedBuildingCentroid,\s*false\);/;
  assert.match(treesLoaderBlock, guardedLoaderRefresh);
  assert.match(streetLightsLoaderBlock, guardedLoaderRefresh);
  assert.doesNotMatch(
    treesLoaderBlock,
    /if \(selectedBuildingCentroid\) \{\s*Urban95Selection\.selectBuilding\(selectedBuildingCentroid,\s*false\);/
  );
  assert.doesNotMatch(
    streetLightsLoaderBlock,
    /if \(selectedBuildingCentroid\) \{\s*Urban95Selection\.selectBuilding\(selectedBuildingCentroid,\s*false\);/
  );
});

test("mode entry helpers do not redundantly clear building radius state after switchMode house cleanup", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  const neighborhoodStart = appSource.indexOf("function enterNeighborhoodMode()");
  const neighborhoodEnd = appSource.indexOf("function exitNeighborhoodMode()");
  const citywideStart = appSource.indexOf("function enterCitywideMode()");
  const citywideEnd = appSource.indexOf("// Neighborhood click handlers");

  assert.notEqual(neighborhoodStart, -1);
  assert.notEqual(neighborhoodEnd, -1);
  assert.notEqual(citywideStart, -1);
  assert.notEqual(citywideEnd, -1);

  const neighborhoodBody = appSource.slice(neighborhoodStart, neighborhoodEnd);
  const citywideBody = appSource.slice(citywideStart, citywideEnd);

  assert.match(appSource, /if \(prevMode === "house"\) \{\s*Urban95Selection\.clearRadiusSelection\(\);/);
  assert.doesNotMatch(neighborhoodBody, /Urban95Selection\.clearRadiusSelection\(\);/);
  assert.doesNotMatch(citywideBody, /Urban95Selection\.clearRadiusSelection\(\);/);
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
  let selectedAmenityTypes = new Set(["trees"]);
  let allFilterTypes = ["trees", "street-lights"];
  const binding = browser.window.Urban95Controls.bind({
    elements,
    scoreModel: browser.window.Urban95ScoreModel,
    getState() {
      return {
        scoreMode: "weighted",
        currentMode: "house",
        selectedAmenityTypes,
        allFilterTypes,
        lastFilterRadioSelection: "all",
      };
    },
    setScoreMode() {},
    setWalkMinutes() {},
    setSelectedAmenityTypes(value) {
      selectedAmenityTypes = value;
    },
    setAllFilterTypes(value) {
      allFilterTypes = value;
    },
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
    () => runBrowserScript("docs/app.js", browser),
    /window\.Urban95ScoreModel is required before docs\/app\.js/
  );
});

test("app.js fails fast when Urban95Loaders is missing", () => {
  const browser = createBrowserContext();

  assert.throws(
    () => runBrowserScript("docs/app.js", browser),
    /window\.Urban95Loaders is required before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95Loaders member is missing", () => {
  const browser = createBrowserContext();

  runBrowserScript("docs/js/core/loaders.js", browser);
  delete browser.window.Urban95Loaders.ensureDeckGlLoaded;

  assert.throws(
    () => runBrowserScript("docs/app.js", browser),
    /Urban95Loaders\.ensureDeckGlLoaded is required before docs\/app\.js/
  );
});

test("app.js fails fast when a required Urban95Loaders member has the wrong type", () => {
  const browser = createBrowserContext();

  runBrowserScript("docs/js/core/loaders.js", browser);
  browser.window.Urban95Loaders.ensureDeckGlLoaded = 123;

  assert.throws(
    () => runBrowserScript("docs/app.js", browser),
    /Urban95Loaders\.ensureDeckGlLoaded must be a function before docs\/app\.js/
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
    () => runBrowserScript("docs/app.js", browser),
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
    () => runBrowserScript("docs/app.js", browser),
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
    () => runBrowserScript("docs/app.js", browser),
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
    () => runBrowserScript("docs/app.js", browser),
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
    () => runBrowserScript("docs/app.js", browser),
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
    () => runBrowserScript("docs/app.js", browser),
    /Urban95Dashboards\.renderCitywideModal must be a function before docs\/app\.js/
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
    () => runBrowserScript("docs/app.js", browser),
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
    () => runBrowserScript("docs/app.js", browser),
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
    () => runBrowserScript("docs/app.js", browser),
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
    () => runBrowserScript("docs/app.js", browser),
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
    () => runBrowserScript("docs/app.js", browser),
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
    () => runBrowserScript("docs/app.js", browser),
    /Urban95Selection\.clearRadiusSelection must be a function before docs\/app\.js/
  );
});
