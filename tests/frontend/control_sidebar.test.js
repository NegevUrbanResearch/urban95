const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserContext, runBrowserScript } = require("./helpers/loadBrowserScript");

function loadControlSidebarModules(browser) {
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/scoring/weightedIndicatorIcons.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarMarkup.js", browser);
  runBrowserScript("docs/js/ui/weightedMetricShowRegistry.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarShow.js", browser);
  runBrowserScript("docs/js/ui/controlSidebarIndicators.js", browser);
}

function createMockIndicatorsHarness(browser, options) {
  options = options || {};
  const auxHosts = {};
  const elements = {
    indicatorsSection: { classList: { toggle() {} } },
    indicatorsWeightedBlock: { hidden: false },
  };
  const indicatorsList = {
    dataset: {},
    _handlers: {},
    addEventListener(type, handler) {
      this._handlers[type] = handler;
    },
  };

  Object.defineProperty(indicatorsList, "innerHTML", {
    configurable: true,
    enumerable: true,
    get() {
      return this._html || "";
    },
    set(value) {
      this._html = value;
      ["show-kids-population-toggle", "show-socioeconomic-toggle"].forEach(function (inputId) {
        auxHosts[inputId] = { style: {} };
        elements[inputId] = {
          id: inputId,
          type: "checkbox",
          checked:
            typeof options.checkedFromHtml === "function"
              ? options.checkedFromHtml(value, inputId)
              : false,
          dataset: {},
          closest(selector) {
            if (
              selector === ".indicator-row--aux" ||
              selector === ".control-overlay-toggle" ||
              selector === ".toggle"
            ) {
              return auxHosts[inputId];
            }
            return null;
          },
        };
      });
    },
  });
  elements.indicatorsList = indicatorsList;

  const state = Object.assign(
    {
      scoreMode: "weighted",
      currentMode: "house",
      activeHeatmapId: "u95.overall",
      layerVisibility: {},
    },
    options.state || {}
  );

  const indicators = browser.window.Urban95ControlSidebarIndicators.create({
    markup: browser.window.Urban95ControlSidebarMarkup,
    showController: {
      resolve() {
        return { supported: false, reason: "n/a" };
      },
      isEnabled() {
        return false;
      },
      toggle() {
        return false;
      },
    },
    scoreModel: {
      buildWeightedMetricRegistry() {
        return {};
      },
      WEIGHTED_CATEGORY_COMPONENTS: [],
      WEIGHTED_SUBCATEGORY_COMPONENTS: {},
    },
    getEl() {
      return elements;
    },
    readState() {
      return state;
    },
    onPointVisibilityChanged: options.onPointVisibilityChanged || function () {},
    onHeatmapSelectionChanged: options.onHeatmapSelectionChanged || function () {},
    renderLegend() {},
    iconsBase: "./icons",
  });

  return { elements, indicators, indicatorsList, state };
}

test("control sidebar show actions come from UI registry instead of score model exports", () => {
  const browser = createBrowserContext();
  loadControlSidebarModules(browser);

  const scoreModel = browser.window.Urban95ScoreModel;
  const showRegistry = browser.window.Urban95WeightedMetricShowRegistry;
  assert.equal(scoreModel.getWeightedShowLayerSpec, undefined);
  assert.equal(scoreModel.resolveWeightedShowActions, undefined);

  const sidebarShow = browser.window.Urban95ControlSidebarShow.create({
    scoreModel: {
      buildWeightedMetricRegistry: scoreModel.buildWeightedMetricRegistry,
      WEIGHTED_CATEGORY_COMPONENTS: scoreModel.WEIGHTED_CATEGORY_COMPONENTS,
      WEIGHTED_SUBCATEGORY_COMPONENTS: scoreModel.WEIGHTED_SUBCATEGORY_COMPONENTS,
    },
    showRegistry,
    applyShowAction() {},
    isShowActionEnabled() {
      return false;
    },
  });

  const fromRegistry = JSON.parse(
    JSON.stringify(showRegistry.resolveWeightedShowActions(scoreModel, "u95.cat.safety_mobility"))
  );
  const fromSidebar = JSON.parse(
    JSON.stringify(sidebarShow.resolve("u95.cat.safety_mobility").actions)
  );

  assert.deepEqual(fromSidebar, fromRegistry);
  assert.deepEqual(fromRegistry, [
    { kind: "point-layer", layer: "street-lights" },
    { kind: "point-layer", layer: "bus-stops" },
    { kind: "amenity-types", types: ["shelters"] },
  ]);
});

test("control sidebar overlay defaults seed canonical layer visibility", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/controlSidebarMarkup.js", browser);

  const defaults = browser.window.Urban95ControlSidebarMarkup.buildOverlayVisibilitySnapshot(
    function (_inputId, fallback) {
      return fallback;
    }
  );

  assert.deepEqual(JSON.parse(JSON.stringify(defaults)), {
    "urban-nature": false,
    trees: true,
    "street-lights": false,
    schools: false,
    "bus-stops": false,
    amenities: true,
    roads: false,
    "kids-population": false,
    socioeconomic: false,
  });
});

test("control sidebar auxiliary rows reflect canonical visibility", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/controlSidebarMarkup.js", browser);

  const markup = browser.window.Urban95ControlSidebarMarkup;
  const kidsRow = markup.AUXILIARY_OVERLAY_ROWS.find(function (row) {
    return row.id === "kids-population";
  });

  assert.equal(markup.resolveOverlayRowChecked(kidsRow, { "kids-population": true }), true);
  assert.equal(markup.resolveOverlayRowChecked(kidsRow, { "kids-population": false }), false);
  assert.equal(markup.resolveOverlayRowChecked(kidsRow, {}), false);
});

test("control sidebar auxiliary toggles update canonical visibility on change", () => {
  const browser = createBrowserContext();
  loadControlSidebarModules(browser);

  const calls = [];
  let layerVisibility = {};
  const harness = createMockIndicatorsHarness(browser, {
    onPointVisibilityChanged(row) {
      calls.push(row.id);
      layerVisibility = Object.assign({}, layerVisibility, {
        [row.layerId]: true,
      });
    },
  });

  harness.indicators.bind();
  harness.indicators.renderIndicatorsSection();

  const kidsInput = harness.elements["show-kids-population-toggle"];
  kidsInput.checked = true;
  harness.indicatorsList._handlers.change({ target: kidsInput });

  assert.deepEqual(calls, ["kids-population"]);
  assert.equal(layerVisibility["kids-population"], true);
});

test("control sidebar auxiliary toggles keep checked state after rerender", () => {
  const browser = createBrowserContext();
  loadControlSidebarModules(browser);

  const harness = createMockIndicatorsHarness(browser, {
    checkedFromHtml(value, inputId) {
      return value.indexOf('id="' + inputId + '" checked') !== -1;
    },
    state: {
      layerVisibility: { "kids-population": true, socioeconomic: false },
    },
  });

  harness.indicators.renderIndicatorsSection();
  assert.equal(harness.elements["show-kids-population-toggle"].checked, true);

  harness.state.activeHeatmapId = "u95.cat.safety_mobility";
  harness.indicators.renderIndicatorsSection();
  assert.equal(harness.elements["show-kids-population-toggle"].checked, true);
});

test("control sidebar point visibility refreshes amenities only in weighted mode", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/controlActions.js", browser);

  function createActions(scoreMode) {
    const calls = [];
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
        getScoreMode: () => scoreMode,
        getSelectedBuilding: () => null,
        getSelectedNeighborhood: () => null,
        clearDerivedCaches: () => {},
        getActiveHeatmapId: () => "u95.overall",
        setActiveHeatmapId: () => {},
        getIsochronesLoaded: () => true,
        setIsochronesDeferred: () => {},
      },
      pointDataLoader: {
        canRefreshPointAnalysisAfterPointDataLoad: () => false,
      },
      loadingUi: {
        showIsochroneLoadingScreen: () => {},
        getWaitingForIsochroneLoad: () => false,
        hideIsochroneLoadingScreen: () => {},
        mark: () => {},
      },
      amenityMode: {
        apply: () => Promise.resolve({ refreshedSelectedBuilding: false }),
      },
      renderers: {
        applyShowPointsToggle: () => calls.push("applyShowPointsToggle"),
        updateAmenitiesSource: () => calls.push("updateAmenitiesSource"),
        updateTreesSource: () => {},
        updateStreetLightsSource: () => {},
        updateBuildingColors: () => {},
        updateNeighborhoodSurfaceData: () => {},
        updateNeighborhoodColors: () => {},
        updateDeckAmenityLayers: () => calls.push("updateDeckAmenityLayers"),
      },
      selection: {
        loadIsochrones: () => Promise.resolve(),
        selectBuilding: () => {},
        updateRadiusInfo: () => {},
        clearRadiusSelection: () => {},
      },
      citySidebar: {
      isOpen: () => false,
      sync: () => {},
      hide: () => {},
      dismiss: () => {},
      setSelection: () => {},
    },
      scoreSidebar: {
        isOpen: () => false,
        hide: () => {},
        sync: () => {},
      },
      neighborhoodSidebar: {
        show: () => {},
        sync: () => {},
        hide: () => {},
        isOpen: () => false,
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
    return { actions, calls };
  }

  const weighted = createActions("weighted");
  weighted.actions.onPointVisibilityChanged();
  assert.ok(weighted.calls.includes("updateAmenitiesSource"));

  const expanded = createActions("expanded");
  expanded.actions.onPointVisibilityChanged();
  assert.equal(expanded.calls.includes("updateAmenitiesSource"), false);
  assert.ok(expanded.calls.includes("applyShowPointsToggle"));
});
