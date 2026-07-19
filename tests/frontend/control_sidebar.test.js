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
    indicatorsSection: { classList: { toggle() {}, remove() {} } },
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
      [
        "show-survey-toggle",
        "show-survey-walkability-barrier-toggle",
        "show-survey-crossing-hazard-toggle",
        "show-survey-loved-place-toggle",
        "show-survey-community-anchor-toggle",
      ].forEach(function (inputId) {
        if (value.indexOf('id="' + inputId + '"') === -1) return;
        elements[inputId] = {
          id: inputId,
          type: "checkbox",
          checked:
            typeof options.checkedFromHtml === "function"
              ? options.checkedFromHtml(value, inputId)
              : false,
          dataset: {},
          closest(selector) {
            if (selector === ".survey-overlay-group" || selector === ".control-overlay-toggle") {
              return { style: {} };
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
    onSurveyVisibilityChanged: options.onSurveyVisibilityChanged || function () {},
    onHeatmapSelectionChanged: options.onHeatmapSelectionChanged || function () {},
    renderLegend() {},
    iconsBase: "./icons",
  });

  return { elements, indicators, indicatorsList, state, auxHosts };
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
    survey: false,
    "survey:walkability_barrier": true,
    "survey:crossing_hazard": true,
    "survey:loved_place": true,
    "survey:community_anchor": true,
  });
});

test("survey controls default master off with every category enabled", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/controlSidebarMarkup.js", browser);
  const markup = browser.window.Urban95ControlSidebarMarkup;
  const defaults = markup.buildOverlayVisibilitySnapshot(function (_inputId, fallback) {
    return fallback;
  });

  assert.equal(defaults.survey, false);
  assert.equal(defaults["survey:walkability_barrier"], true);
  assert.equal(defaults["survey:crossing_hazard"], true);
  assert.equal(defaults["survey:loved_place"], true);
  assert.equal(defaults["survey:community_anchor"], true);
});

test("survey visibility resolves parent and category state separately", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/controlSidebarMarkup.js", browser);
  const markup = browser.window.Urban95ControlSidebarMarkup;
  const state = {
    survey: false,
    "survey:walkability_barrier": true,
    "survey:crossing_hazard": false,
    "survey:loved_place": true,
    "survey:community_anchor": false,
  };

  assert.deepEqual(
    JSON.parse(JSON.stringify(markup.resolveSurveyVisibility(state))),
    {
      enabled: false,
      categories: {
        walkability_barrier: true,
        crossing_hazard: false,
        loved_place: true,
        community_anchor: false,
      },
    }
  );
});

test("survey parent show action uses the isolated survey visibility callback", () => {
  const browser = createBrowserContext();
  loadControlSidebarModules(browser);
  const calls = [];
  const harness = createMockIndicatorsHarness(browser, {
    onPointVisibilityChanged: function () {
      calls.push("point");
    },
    onSurveyVisibilityChanged: function (row) {
      calls.push("survey:" + row.layerId);
    },
  });

  harness.indicators.bind();
  harness.indicators.renderIndicatorsSection();
  const masterShowButton = {
    disabled: false,
    getAttribute(name) {
      return name === "data-action" ? "survey-show" : null;
    },
    closest(selector) {
      return selector === "[data-action]" ? this : null;
    },
  };
  harness.indicatorsList._handlers.click({ target: masterShowButton });

  assert.deepEqual(calls, [
    "survey:survey:walkability_barrier",
    "survey:survey:crossing_hazard",
    "survey:survey:loved_place",
    "survey:survey:community_anchor",
    "survey:survey",
  ]);
});

test("survey parent uses the standard icon and eye control while enabling every category by default", () => {
  const browser = createBrowserContext();
  loadControlSidebarModules(browser);
  const calls = [];
  let harness;
  harness = createMockIndicatorsHarness(browser, {
    checkedFromHtml(value, inputId) {
      return value.indexOf('id="' + inputId + '" checked') !== -1;
    },
    state: {
      layerVisibility: {
        survey: false,
        "survey:walkability_barrier": false,
        "survey:crossing_hazard": false,
        "survey:loved_place": false,
        "survey:community_anchor": false,
      },
    },
    onSurveyVisibilityChanged(row) {
      calls.push(row.layerId);
      harness.state.layerVisibility[row.layerId] = !!harness.elements[row.inputId].checked;
    },
  });

  harness.indicators.bind();
  harness.indicators.renderIndicatorsSection();

  assert.match(harness.indicatorsList.innerHTML, /horizon-icon/);
  assert.match(harness.indicatorsList.innerHTML, /town-hall\.svg/);
  assert.match(
    harness.indicatorsList.innerHTML,
    /class="indicator-btn indicator-show-btn" data-action="survey-show"[^>]*aria-pressed="false"/
  );
  assert.match(
    harness.indicatorsList.innerHTML,
    /id="show-survey-walkability-barrier-toggle" disabled/
  );
  assert.doesNotMatch(
    harness.indicatorsList.innerHTML,
    /id="show-survey-walkability-barrier-toggle" checked/
  );

  const masterShowButton = {
    disabled: false,
    getAttribute(name) {
      return name === "data-action" ? "survey-show" : null;
    },
    closest(selector) {
      return selector === "[data-action]" ? this : null;
    },
  };
  harness.indicatorsList._handlers.click({ target: masterShowButton });

  assert.deepEqual(calls, [
    "survey:walkability_barrier",
    "survey:crossing_hazard",
    "survey:loved_place",
    "survey:community_anchor",
    "survey",
  ]);
  assert.match(
    harness.indicatorsList.innerHTML,
    /class="indicator-btn indicator-show-btn is-active" data-action="survey-show"[^>]*aria-pressed="true"/
  );
  [
    "show-survey-walkability-barrier-toggle",
    "show-survey-crossing-hazard-toggle",
    "show-survey-loved-place-toggle",
    "show-survey-community-anchor-toggle",
  ].forEach(function (inputId) {
    assert.equal(harness.elements[inputId].checked, true);
  });

  const crossingHazard = harness.elements["show-survey-crossing-hazard-toggle"];
  crossingHazard.checked = false;
  harness.indicatorsList._handlers.change({ target: crossingHazard });

  assert.equal(harness.state.layerVisibility["survey:crossing_hazard"], false);
  assert.equal(harness.elements["show-survey-crossing-hazard-toggle"].checked, false);
});

test("survey control renders as a collapsed indicator group and expands with preserved visibility", () => {
  const browser = createBrowserContext();
  loadControlSidebarModules(browser);
  const harness = createMockIndicatorsHarness(browser, {
    checkedFromHtml(value, inputId) {
      return value.indexOf('id="' + inputId + '" checked') !== -1;
    },
    state: {
      layerVisibility: {
        survey: true,
        "survey:walkability_barrier": false,
        "survey:crossing_hazard": true,
        "survey:loved_place": false,
        "survey:community_anchor": true,
      },
    },
  });

  harness.indicators.bind();
  harness.indicators.renderIndicatorsSection();

  assert.match(harness.indicatorsList.innerHTML, /indicator-group--survey/);
  assert.match(harness.indicatorsList.innerHTML, /data-action="survey-collapse" aria-expanded="false"/);
  assert.doesNotMatch(harness.indicatorsList.innerHTML, /indicator-subs is-open/);
  assert.match(
    harness.indicatorsList.innerHTML,
    /data-action="survey-show"[^>]*aria-pressed="true"/
  );
  assert.equal(harness.elements["show-survey-walkability-barrier-toggle"].checked, false);
  assert.equal(harness.elements["show-survey-crossing-hazard-toggle"].checked, true);

  const categoryRow = {};
  const categoryLabel = {
    closest(selector) {
      if (selector === "[data-action]" || selector === "input") return null;
      return selector === ".indicator-row--survey[data-survey-group]" ? categoryRow : null;
    },
  };
  harness.indicatorsList._handlers.click({ target: categoryLabel });

  assert.match(harness.indicatorsList.innerHTML, /indicator-subs is-open/);
  assert.match(harness.indicatorsList.innerHTML, /data-action="survey-collapse" aria-expanded="true"/);

  const collapseButton = {
    disabled: false,
    getAttribute(name) {
      return name === "data-action" ? "survey-collapse" : null;
    },
    closest(selector) {
      return selector === "[data-action]" ? this : null;
    },
  };
  harness.indicatorsList._handlers.click({ target: collapseButton });

  assert.doesNotMatch(harness.indicatorsList.innerHTML, /indicator-subs is-open/);
  assert.match(harness.indicatorsList.innerHTML, /data-action="survey-collapse" aria-expanded="false"/);
  assert.equal(harness.elements["show-survey-walkability-barrier-toggle"].checked, false);
  assert.equal(harness.elements["show-survey-crossing-hazard-toggle"].checked, true);
});

test("survey indicator group keeps unavailable controls disabled", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/controlSidebarMarkup.js", browser);
  const markup = browser.window.Urban95ControlSidebarMarkup;

  const html = markup.renderSurveyOverlayGroup(
    { survey: false, "survey:walkability_barrier": true },
    {},
    false,
    false
  );

  assert.match(html, /indicator-group--survey is-unavailable/);
  assert.match(html, /id="show-survey-toggle"[^>]* disabled/);
  assert.match(html, /id="show-survey-walkability-barrier-toggle" disabled/);
  assert.doesNotMatch(html, /id="show-survey-walkability-barrier-toggle" checked/);
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

test("control sidebar auxiliary toggles stay visible in citywide mode", () => {
  const browser = createBrowserContext();
  loadControlSidebarModules(browser);

  const harness = createMockIndicatorsHarness(browser, {
    state: { currentMode: "citywide" },
  });
  const classState = { "is-basemap-only": false, "is-neighborhood-scale": false };
  harness.elements.indicatorsSection.classList = {
    toggle(name, force) {
      classState[name] = !!force;
    },
    remove(name) {
      classState[name] = false;
    },
    contains(name) {
      return !!classState[name];
    },
  };

  harness.indicators.renderIndicatorsSection();

  assert.equal(classState["is-basemap-only"], false);
  assert.equal(harness.auxHosts["show-kids-population-toggle"].style.display, "");
  assert.equal(harness.auxHosts["show-socioeconomic-toggle"].style.display, "");
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
