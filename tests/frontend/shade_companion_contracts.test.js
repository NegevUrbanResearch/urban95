const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserContext, runBrowserScript } = require("./helpers/loadBrowserScript");

function runCoreStartup(browserOverrides) {
  const browser = createBrowserContext(browserOverrides || {});
  runBrowserScript("docs/js/core/startup.js", browser);
  return browser.window.Urban95Startup;
}

function createOverlayVisibilityHarness(browser, mode) {
  const layoutCalls = [];
  const overlayVisibility = browser.window.Urban95OverlayVisibility.create({
    getLayerVisibility: function () {
      return { "shade-si": true };
    },
    setLayerVisibility: function () {},
    getWeightedShownAmenityTypes: function () {
      return new Set();
    },
    setWeightedShownAmenityTypes: function () {},
    getCurrentMode: function () {
      return mode;
    },
    map: {
      getLayer: function (layerId) {
        return layerId === "shade-si-fill" ? {} : null;
      },
      setLayoutProperty: function (layerId, property, value) {
        layoutCalls.push({ layerId, property, value });
      },
    },
  });

  return { overlayVisibility, layoutCalls };
}

function createControlActionsDeps(overrides) {
  overrides = overrides || {};
  return {
    perf: {
      session: function () {},
      phase: function (_name, callback) { return callback(); },
      mark: function () {},
      span: function (_name, _meta, callback) { return callback(); },
    },
    state: {
      getCurrentMode: function () { return "house"; },
      getScoreMode: function () { return "weighted"; },
      getSelectedBuilding: function () { return null; },
      getSelectedNeighborhood: function () { return null; },
      clearDerivedCaches: function () {},
      getActiveHeatmapId: function () { return "u95.sub.environmental_quality.shade"; },
      setActiveHeatmapId: overrides.setActiveHeatmapId || function () {},
      getIsochronesLoaded: function () { return true; },
    },
    pointDataLoader: {
      canRefreshPointAnalysisAfterPointDataLoad: function () { return false; },
    },
    loadingUi: {
      showIsochroneLoadingScreen: function () {},
      getWaitingForIsochroneLoad: function () { return false; },
      hideIsochroneLoadingScreen: function () {},
      mark: function () {},
    },
    amenityMode: {
      apply: function () { return Promise.resolve({}); },
    },
    renderers: {
      applyShowPointsToggle: function () {},
      updateAmenitiesSource: function () {},
      updateTreesSource: function () {},
      updateStreetLightsSource: function () {},
      updateBuildingColors: function () {},
      updateNeighborhoodSurfaceData: function () {},
      updateNeighborhoodColors: function () {},
      updateDeckAmenityLayers: function () {},
    },
    selection: {
      loadIsochrones: function () {},
      selectBuilding: function () {},
      updateRadiusInfo: function () {},
      clearRadiusSelection: function () {},
    },
    citySidebar: {
      isOpen: function () { return false; },
      sync: function () {},
      hide: function () {},
      dismiss: function () {},
      setSelection: function () {},
    },
    scoreSidebar: {
      isOpen: function () { return false; },
      hide: function () {},
      sync: function () {},
    },
    neighborhoodSidebar: {
      show: function () {},
      sync: function () {},
      hide: function () {},
      isOpen: function () { return false; },
    },
    modeController: {
      switchMode: function () {},
    },
    map: {},
    ui: {
      clearTooltip: overrides.clearTooltip || function () {},
    },
    controls: {
      refreshLegend: function () {},
    },
  };
}

test("shade SI config and dependency exports are wired", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/config.js", browser);
  assert.equal(browser.window.Urban95Config.urls.shadeSi, "./data/shade_si.geojson");

  const dependenciesSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "core", "appDependencies.js"),
    "utf8"
  );
  assert.match(dependenciesSource, /var SHADE_SI_URL = requireStringMember\(CONFIG_URLS, "Urban95Config\.urls", "shadeSi"\);/);
  assert.match(dependenciesSource, /SHADE_SI_URL: SHADE_SI_URL,/);
});

test("static polygon companion registry defines shade-si map artifacts", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/staticPolygonCompanions.js", browser);
  const companions = browser.window.Urban95StaticPolygonCompanions;
  const entry = companions.getEntry("shade-si");

  assert.ok(entry);
  assert.equal(entry.sourceId, "shade-si");
  assert.equal(entry.fillLayerId, "shade-si-fill");
  assert.equal(entry.urlKey, "shadeSi");
  assert.equal(companions.getFillLayerId("shade-si"), "shade-si-fill");

  const sources = companions.buildSources({ type: "FeatureCollection", features: [] });
  assert.ok(sources["shade-si"]);
  const layers = companions.buildLayers();
  const fillLayer = layers.find((layer) => layer.id === "shade-si-fill");
  assert.ok(fillLayer);
  assert.equal(fillLayer.source, "shade-si");
  assert.equal(fillLayer.layout.visibility, "none");
  assert.ok(Array.isArray(fillLayer.paint["fill-color"]));

  const legend = companions.getLegendSpec("shade-si");
  assert.ok(legend);
  assert.equal(legend.title, "Shade Index");
  assert.equal(legend.subtitle, "Rounded building SI classes");
  assert.deepEqual(
    Array.from(legend.stops, (stop) => stop.color),
    ["#e81014", "#fb9d3b", "#fafa64", "#7da788", "#388393", "#007298"]
  );
  assert.equal(legend.stops[0].si, 0);
  assert.equal(legend.stops[5].si, 1);
  assert.match(legend.gradientStyle, /linear-gradient/);
  assert.deepEqual(Array.from(legend.labels), ["0", "0.10", "0.20", "0.40", "0.60", "1.0"]);
  assert.deepEqual(Array.from(legend.items), []);
  assert.deepEqual(
    Array.from(legend.axisGroups, (group) => group.label),
    ["0.0", "0.1", "0.2-0.3", "0.4-0.5", "0.6-1.0"]
  );
  assert.deepEqual(
    Array.from(legend.axisGroups, (group) => group.bucketName),
    ["Severe lack", "Significant lack", "Needs improvement", "Good shade", "Excellent shade"]
  );
});

test("control sidebar markup renders official shade bucket legend from registry spec", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/staticPolygonCompanions.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarMarkup.js", browser);
  const companions = browser.window.Urban95StaticPolygonCompanions;
  const markup = browser.window.Urban95ControlSidebarMarkup;
  const spec = companions.getLegendSpec("shade-si");

  const html = markup.renderCompanionLegendHtml(spec);
  assert.match(html, /linear-gradient\(to right, #e81014 0%, #fb9d3b 10%/);
  assert.match(html, /Shade Index/);
  assert.match(html, /Rounded building SI classes/);
  assert.match(html, /legend-axis-groups/);
  assert.match(html, /0\.2-0\.3/);
  assert.match(html, /0\.6-1\.0/);
  assert.match(html, /title="0\.2-0\.3 Needs improvement"/);
  assert.match(html, /aria-label="0\.6-1\.0 Excellent shade"/);
  assert.match(html, /legend-axis-tooltip/);
  assert.match(html, />Needs improvement<\/span>/);
  assert.doesNotMatch(html, /legend-item-chip/);
});

test("control sidebar markup renders weighted shade legend with standard score scale", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarMarkup.js", browser);
  const scoreModel = browser.window.Urban95ScoreModel;
  const markup = browser.window.Urban95ControlSidebarMarkup;
  const metric = scoreModel.getWeightedMetric("u95.sub.environmental_quality.shade");

  assert.equal(metric.legendSpec, undefined);
  assert.match(metric.explainNote, /rounded to 1 decimal/i);
  assert.match(metric.explainNote, /0\.15 -> 0\.2/i);
  assert.match(metric.explainNote, /0\.35 -> 0\.4/i);
  assert.match(metric.explainNote, /300 m area-weighted summer_SI/i);
  assert.match(metric.explainNote, /0\.20-<0\.40 = 50/i);
  assert.match(metric.explainNote, />=0\.60 excellent shade/i);

  const html = markup.renderLegendHtml(metric, null, "");

  assert.match(html, /Shade/);
  assert.match(html, /Urban95 · weighted score \(0-100\)/);
  assert.match(html, /<span>0<\/span><span>25<\/span><span>50<\/span><span>75<\/span><span>100<\/span>/);
  assert.doesNotMatch(html, /Rounded 300 m building SI/);
});

test("control sidebar legend gates companion blocks by visibility and mode", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/staticPolygonCompanions.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarMarkup.js", browser);
  const companions = browser.window.Urban95StaticPolygonCompanions;
  const markup = browser.window.Urban95ControlSidebarMarkup;

  function buildCompanionLegendHtml(isVisible, mode) {
    const parts = [];
    companions.forEachEntry(function (entry, key) {
      const modeOk = (entry.visibilityModes || []).indexOf(mode) >= 0;
      if (!isVisible(entry.sourceId) || !modeOk) return;
      const spec = companions.getLegendSpec(key);
      if (spec) parts.push(markup.renderCompanionLegendHtml(spec));
    });
    return parts.join("");
  }

  const hidden = markup.renderLegendHtml(null, null, buildCompanionLegendHtml(() => false, "house"));
  assert.doesNotMatch(hidden, /linear-gradient\(to right, #e81014/);

  const visible = markup.renderLegendHtml(
    null,
    null,
    buildCompanionLegendHtml((layerId) => layerId === "shade-si", "house")
  );
  assert.match(visible, /Shade Index/);
  assert.match(visible, /Rounded building SI classes/);

  const wrongMode = markup.renderLegendHtml(
    null,
    null,
    buildCompanionLegendHtml((layerId) => layerId === "shade-si", "neighborhood")
  );
  assert.doesNotMatch(wrongMode, /Shade Index/);
});

test("app.js wires isCanonicalLayerVisible for registry-driven companion legends", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  assert.match(appSource, /isCanonicalLayerVisible:\s*function\s*\(/);
  assert.doesNotMatch(appSource, /getShadeSiLegend:/);
});

test("score explain sidebar includes compact shade methodology note", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  const scoreSidebarSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "ui", "scoreSidebar.js"),
    "utf8"
  );
  const controlSidebarMarkupSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "ui", "controlSidebarMarkup.js"),
    "utf8"
  );
  const metric = browser.window.Urban95ScoreModel.getWeightedMetric("u95.sub.environmental_quality.shade");

  assert.match(scoreSidebarSource, /score-explain-shade-note/);
  assert.match(metric.explainNote, /rounded to 1 decimal/i);
  assert.match(metric.explainNote, /0\.15 -> 0\.2/i);
  assert.match(metric.explainNote, /0\.35 -> 0\.4/i);
  assert.match(metric.explainNote, /official SI interpretation bands/i);
  assert.match(metric.explainNote, /Urban95 keeps a ternary/i);
  assert.doesNotMatch(scoreSidebarSource, /u95\.sub\.environmental_quality\.shade/);
  assert.doesNotMatch(controlSidebarMarkupSource, /u95\.sub\.environmental_quality\.shade/);
});

test("mapShell consumes static polygon companion factory without shade-only branch", () => {
  const mapShellSource = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "docs", "js", "map", "mapShell.js"),
    "utf8"
  );

  assert.match(mapShellSource, /Urban95StaticPolygonCompanions/);
  assert.match(mapShellSource, /buildSources/);
  assert.match(mapShellSource, /buildLayers/);
  assert.doesNotMatch(mapShellSource, /["']shade-si-fill["']/);
});

test("weighted shade show action maps to canonical shade-si layer", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/ui/weightedMetricShowRegistry.js", browser);
  const scoreModel = browser.window.Urban95ScoreModel;
  const showRegistry = browser.window.Urban95WeightedMetricShowRegistry;
  const spec = showRegistry.getWeightedShowLayerSpec(scoreModel, "u95.sub.environmental_quality.shade");

  assert.equal(spec.layer, "shade-si");
  assert.equal(
    showRegistry.resolveWeightedShowActions(scoreModel, "u95.sub.environmental_quality.shade")[0].layer,
    "shade-si"
  );
});

test("static polygon companion visibility sync maps shade-si to shade-si-fill", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/staticPolygonCompanions.js", browser);
  runBrowserScript("docs/js/map/renderState.js", browser);
  runBrowserScript("docs/js/ui/overlayVisibility.js", browser);

  const visibleOverlay = createOverlayVisibilityHarness(browser, "house");
  visibleOverlay.overlayVisibility.applyStaticPolygonCompanionsVisibility();
  assert.deepEqual(visibleOverlay.layoutCalls, [
    { layerId: "shade-si-fill", property: "visibility", value: "visible" },
  ]);

  const citywideOverlay = createOverlayVisibilityHarness(browser, "citywide");
  citywideOverlay.overlayVisibility.applyStaticPolygonCompanionsVisibility();
  assert.deepEqual(citywideOverlay.layoutCalls, [
    { layerId: "shade-si-fill", property: "visibility", value: "visible" },
  ]);

  const hiddenOverlay = createOverlayVisibilityHarness(browser, "neighborhood");
  hiddenOverlay.overlayVisibility.applyStaticPolygonCompanionsVisibility();
  assert.deepEqual(hiddenOverlay.layoutCalls, [
    { layerId: "shade-si-fill", property: "visibility", value: "none" },
  ]);
});

test("map events bind shade-si-fill tooltip with official class fields", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/staticPolygonCompanions.js", browser);
  runBrowserScript("docs/js/map/mapEvents.js", browser);

  const handlers = [];
  const tooltip = { style: { display: "none", left: "", top: "" }, textContent: "" };
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
    selection: { findClosestBuilding: function () {}, selectBuilding: function () {} },
    dashboards: { getNeighborhoodFeatureAtPoint: function () {}, showNeighborhoodAreaTooltip: function () {} },
    neighborhoodSidebar: { show: function () {} },
    citySidebar: { setSelection: function () {} },
    mapRenderers: { updateTreesSource: function () {}, updateStreetLightsSource: function () {} },
    pointDataLoader: { loadTreesIfNeeded: function () {}, loadStreetLightsIfNeeded: function () {} },
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

  const shadeMousemove = handlers.find(
    (handler) => handler.eventName === "mousemove" && handler.layer === "shade-si-fill"
  );
  assert.ok(shadeMousemove);

  shadeMousemove.handler({
    features: [{ properties: { summer_SI: 0.114664361887, si_layer: "street" } }],
    point: { x: 10, y: 20 },
  });

  assert.match(tooltip.textContent, /Shade Index:\s*0\.11/);
  assert.match(tooltip.textContent, /Class:\s*Significant lack/);
  assert.match(tooltip.textContent, /Layer:\s*Street/);
  assert.doesNotMatch(tooltip.textContent, /BDAR \/ Derech Tzel/);
});

test("map events show rounded building shade tooltip when shade heatmap is active", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/staticPolygonCompanions.js", browser);
  runBrowserScript("docs/js/map/mapEvents.js", browser);

  const handlers = [];
  const tooltip = { style: { display: "none", left: "", top: "" }, textContent: "" };
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
    selection: { findClosestBuilding: function () {}, selectBuilding: function () {} },
    dashboards: { getNeighborhoodFeatureAtPoint: function () {}, showNeighborhoodAreaTooltip: function () {} },
    neighborhoodSidebar: { show: function () {} },
    citySidebar: { setSelection: function () {} },
    mapRenderers: { updateTreesSource: function () {}, updateStreetLightsSource: function () {} },
    pointDataLoader: { loadTreesIfNeeded: function () {}, loadStreetLightsIfNeeded: function () {} },
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
    getActiveHeatmapId: function () {
      return "u95.sub.environmental_quality.shade";
    },
    getBuildingHoverProperties: function (properties) {
      assert.deepEqual(properties, { building_id: 42 });
      return { building_id: 42, summer_si: 0.2 };
    },
    formatArea: function (area) {
      return area + " sqm";
    },
  });

  const buildingMousemove = handlers.find(
    (handler) => handler.eventName === "mousemove" && handler.layer === "buildings-fill"
  );
  assert.ok(buildingMousemove);

  buildingMousemove.handler({
    features: [{ properties: { building_id: 42 } }],
    point: { x: 12, y: 24 },
  });

  assert.match(tooltip.textContent, /Shade Index:\s*0\.2/);
  assert.match(tooltip.textContent, /Class:\s*Needs improvement/);
  assert.match(tooltip.textContent, /Layer:\s*Building weighted average/);
});

test("map events clear stale building shade tooltip when active heatmap is no longer shade", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/map/staticPolygonCompanions.js", browser);
  runBrowserScript("docs/js/map/mapEvents.js", browser);

  const handlers = [];
  const canvas = { style: { cursor: "pointer" } };
  const tooltip = { style: { display: "block", left: "12px", top: "24px" }, textContent: "stale shade tooltip" };
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
      return [];
    },
  };

  browser.window.Urban95MapEvents.bind({
    map: map,
    selection: { findClosestBuilding: function () {}, selectBuilding: function () {} },
    dashboards: { getNeighborhoodFeatureAtPoint: function () {}, showNeighborhoodAreaTooltip: function () {} },
    neighborhoodSidebar: { show: function () {} },
    citySidebar: { setSelection: function () {} },
    mapRenderers: { updateTreesSource: function () {}, updateStreetLightsSource: function () {} },
    pointDataLoader: { loadTreesIfNeeded: function () {}, loadStreetLightsIfNeeded: function () {} },
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
    getActiveHeatmapId: function () {
      return "u95.sub.environmental_quality.trees";
    },
    formatArea: function (area) {
      return area + " sqm";
    },
  });

  const buildingMousemove = handlers.find(
    (handler) => handler.eventName === "mousemove" && handler.layer === "buildings-fill"
  );
  assert.ok(buildingMousemove);

  buildingMousemove.handler({
    features: [{ properties: { summer_si: 0.2 } }],
    point: { x: 12, y: 24 },
  });

  assert.equal(canvas.style.cursor, "");
  assert.equal(tooltip.style.display, "none");
  assert.equal(tooltip.textContent, "");
});

test("control actions clear active shade tooltip immediately when heatmap changes", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/controlActions.js", browser);
  const calls = [];
  const actions = browser.window.Urban95ControlActions.create(
    createControlActionsDeps({
      setActiveHeatmapId: function (value) {
        calls.push(["setActiveHeatmapId", value]);
      },
      clearTooltip: function () {
        calls.push(["clearTooltip"]);
      },
    })
  );

  actions.setActiveHeatmap("u95.sub.environmental_quality.trees");

  assert.deepEqual(calls.slice(0, 2), [
    ["setActiveHeatmapId", "u95.sub.environmental_quality.trees"],
    ["clearTooltip"],
  ]);
});

test("startup loads shadeSi with gzip fallback and syncs companion visibility", async () => {
  const startup = runCoreStartup();
  const fetchCalls = [];
  const companionSyncCalls = [];
  const sources = {
    "shade-si": {
      setDataCalls: 0,
      setData: function () {
        this.setDataCalls += 1;
      },
    },
  };

  await startup.run({
    logger: {
      debug: function () {},
      perf: function () {},
      warn: function () {},
      error: function () {},
    },
    state: {
      buildings: { setData: function () {}, setCentroids: function () {} },
      amenities: {
        setCleanData: function () {},
        setCleanTypes: function () {},
        setLegacyData: function () {},
        setLegacyTypes: function () {},
        clearLegacyData: function () {},
      },
    },
    runtime: {
      performance: { now: function () { return 0; } },
      map: {
        getSource: function (sourceId) {
          return sources[sourceId] || null;
        },
        getZoom: function () {
          return 14;
        },
        getCanvas: function () {
          return { style: {} };
        },
      },
      document: {},
      turf: { centroid: function () { return { geometry: { coordinates: [0, 0] } }; } },
      loaders: { loadBuildingsRuntimeData: function () { return Promise.resolve({ features: [] }); } },
      pointDataLoader: {
        setPointLookupData: function () {},
        loadTreesIfNeeded: function () {},
      },
      hasGeneratedArtifact: function () {
        return false;
      },
      fetchJsonWithGzipFallback: function (url, options) {
        fetchCalls.push({ url, options });
        if (url === "./data/shade_si.geojson") {
          return Promise.resolve({
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: { summer_SI: 0.2 }, geometry: { type: "Polygon", coordinates: [] } }],
          });
        }
        return Promise.resolve({ type: "FeatureCollection", features: [] });
      },
      featureCollectionFromPointRecords: function () {
        return { type: "FeatureCollection", features: [] };
      },
      hasValidPointsLookupSources: function () {
        return false;
      },
      warnIfBuildingScoresIncomplete: function () {},
      scanAmenityTypesFromFeatures: function () {
        return { types: new Set(), tw: new Set() };
      },
      buildingsMapSourceId: "buildings",
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
      loadPointsLookup: function () { return Promise.reject(new Error("skip")); },
      loadAmenitiesGeojsonFallback: function () {
        return Promise.resolve({ source: "geojson", cleanFc: { features: [] }, legacyFc: null, treesFc: null, streetLightsFc: null });
      },
      applyScoreModeAmenities: function () {},
      clearDerivedCaches: function () {},
      applyHouseModeHexBackground: function () {},
      applyUrbanNatureVisibility: function () {},
      applyStaticPolygonCompanionsVisibility: function () {
        companionSyncCalls.push("sync");
      },
    },
    renderers: {
      applyParkDotPattern: function () {},
      applyUrbanNatureDotPattern: function () {},
      addAmenityLayers: function () {},
      applyShowPointsToggle: function () {},
      updateBuildingColors: function () {},
    },
    selection: { buildBuildingCentroidGridIndex: function () {} },
    urls: {
      buildings: "./data/buildings_accessibility.geojson",
      parks: "./data/parks.geojson",
      urbanNatureAreas: "./data/urban_nature_areas.geojson",
      shadeSi: "./data/shade_si.geojson",
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  const shadeFetch = fetchCalls.find((call) => call.url === "./data/shade_si.geojson");
  assert.ok(shadeFetch);
  assert.equal(shadeFetch.options.required, false);
  assert.equal(sources["shade-si"].setDataCalls, 1);
  assert.ok(companionSyncCalls.includes("sync"));
});

test("weighted shade icon uses garden and app.js avoids shade-only visibility branch", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/scoring/weightedIndicatorIcons.js", browser);
  const icons = browser.window.Urban95WeightedIndicatorIcons.create("./icons");
  assert.equal(icons.getSubcategoryIcon("shade"), "garden");

  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "app.js"), "utf8");
  assert.match(appSource, /syncStaticPolygonCompanionsVisibility/);
  assert.doesNotMatch(appSource, /function applyShadeSiVisibility/);
  assert.doesNotMatch(appSource, /shade-si-fill/);
});
