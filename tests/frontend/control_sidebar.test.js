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

  const showController =
    options.showController ||
    {
      resolve() {
        return { supported: false, reason: "n/a" };
      },
      getState() {
        return "off";
      },
      isEnabled() {
        return false;
      },
      toggle() {
        return false;
      },
    };
  const scoreModel =
    options.scoreModel ||
    {
      buildWeightedMetricRegistry() {
        return {};
      },
      WEIGHTED_CATEGORY_COMPONENTS: [],
      WEIGHTED_SUBCATEGORY_COMPONENTS: {},
    };

  const indicators = browser.window.Urban95ControlSidebarIndicators.create({
    markup: browser.window.Urban95ControlSidebarMarkup,
    showController,
    scoreModel,
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

  return { elements, indicators, indicatorsList, state, auxHosts, showController };
}

function createDetailCollapseTarget(parentMetricId) {
  const row = {
    getAttribute(name) {
      if (name === "data-detail-parent-id") return parentMetricId;
      if (name === "data-metric-id") return parentMetricId;
      return null;
    },
  };
  const action = {
    disabled: false,
    getAttribute(name) {
      return name === "data-action" ? "collapse" : null;
    },
    closest(selector) {
      return selector === "[data-metric-id]" ? row : null;
    },
  };
  return {
    closest(selector) {
      if (selector === "[data-action]") return action;
      return null;
    },
  };
}

function createDetailLabelTarget(parentMetricId) {
  const row = {
    getAttribute(name) {
      if (name === "data-detail-parent-id") return parentMetricId;
      return null;
    },
  };
  return {
    closest(selector) {
      if (selector === "[data-action]") return null;
      if (selector === ".indicator-row--subcategory[data-detail-parent-id]") return row;
      if (selector === ".indicator-row--category[data-category-stem]") return null;
      return null;
    },
  };
}

test("control sidebar renders accessible nested Education and Health detail groups", () => {
  const browser = createBrowserContext();
  loadControlSidebarModules(browser);
  const harness = createMockIndicatorsHarness(browser, {
    scoreModel: browser.window.Urban95ScoreModel,
  });

  harness.indicators.bind();
  harness.indicators.renderIndicatorsSection();
  const html = harness.indicatorsList.innerHTML;

  assert.match(html, /data-metric-id="u95\.sub\.family_services\.education"/);
  assert.match(html, /data-metric-id="u95\.detail\.family_services\.education\.school"/);
  assert.match(html, /data-metric-id="u95\.detail\.family_services\.health\.tipat_halav"/);
  assert.match(html, /class="indicators-tree" role="list"/);
  assert.doesNotMatch(html, /role="tree"|role="treeitem"/);
  assert.match(html, /class="indicator-group[^>]*"[^>]*role="listitem"/);
  assert.match(html, /aria-controls="indicator-subs-family-services"/);
  assert.match(html, /id="indicator-subs-family-services"[^>]*role="list"/);
  assert.match(html, /aria-controls="indicator-details-u95-sub-family-services-health"/);
  assert.match(html, /id="indicator-details-u95-sub-family-services-health"[^>]*role="list"/);
  assert.match(html, /data-metric-id="u95\.sub\.family_services\.community"/);
  assert.match(html, /data-metric-id="u95\.sub\.family_services\.business"/);

  // Rendering an active child heatmap expands both ancestors.
  harness.state.activeHeatmapId = "u95.detail.family_services.health.tipat_halav";
  harness.indicators.renderIndicatorsSection();
  assert.match(
    harness.indicatorsList.innerHTML,
    /data-category-stem="family_services"[\s\S]*?indicator-subs is-open/
  );
  assert.match(
    harness.indicatorsList.innerHTML,
    /data-detail-parent-id="u95\.sub\.family_services\.health"[\s\S]*?indicator-detail-subs is-open/
  );

  // Explicit collapse persists while the same child heatmap remains active.
  harness.indicatorsList._handlers.click({
    target: createDetailCollapseTarget("u95.sub.family_services.health"),
  });
  harness.indicators.renderIndicatorsSection();
  assert.doesNotMatch(
    harness.indicatorsList.innerHTML,
    /data-detail-parent-id="u95\.sub\.family_services\.health"[\s\S]*?indicator-detail-subs is-open/
  );
});

test("control sidebar toggles a nested detail group when its label is clicked", () => {
  const browser = createBrowserContext();
  loadControlSidebarModules(browser);
  const harness = createMockIndicatorsHarness(browser, {
    scoreModel: browser.window.Urban95ScoreModel,
  });

  harness.indicators.bind();
  harness.indicators.renderIndicatorsSection();
  harness.indicatorsList._handlers.click({
    target: createDetailLabelTarget("u95.sub.family_services.health"),
  });

  assert.match(
    harness.indicatorsList.innerHTML,
    /data-detail-parent-id="u95\.sub\.family_services\.health"[\s\S]*?indicator-detail-subs is-open/
  );
});

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

  function actionKey(action) {
    if (action.kind === "point-layer") return action.kind + ":" + action.layer;
    if (action.kind === "amenity-display-key") return action.kind + ":" + action.key;
    return JSON.stringify(action);
  }

  const enabled = new Set([
    "point-layer:education-school",
    "amenity-display-key:health:clinic",
  ]);
  const showController = browser.window.Urban95ControlSidebarShow.create({
    scoreModel,
    showRegistry,
    applyShowAction(action, nextEnabled) {
      const key = actionKey(action);
      if (nextEnabled) enabled.add(key);
      else enabled.delete(key);
    },
    isShowActionEnabled(action) {
      return enabled.has(actionKey(action));
    },
  });
  const resolve = function (metricId) {
    return JSON.parse(JSON.stringify(showController.resolve(metricId).actions));
  };

  assert.deepEqual(resolve("u95.sub.family_services.education"), [
    { kind: "point-layer", layer: "education-school" },
    { kind: "point-layer", layer: "education-kindergarten" },
  ]);
  assert.deepEqual(resolve("u95.detail.family_services.education.school"), [
    { kind: "point-layer", layer: "education-school" },
  ]);
  assert.deepEqual(resolve("u95.detail.family_services.education.kindergarten"), [
    { kind: "point-layer", layer: "education-kindergarten" },
  ]);
  assert.deepEqual(resolve("u95.sub.family_services.health"), [
    { kind: "amenity-display-key", key: "health:clinic" },
    { kind: "amenity-display-key", key: "health:tipat_halav" },
  ]);
  assert.deepEqual(resolve("u95.detail.family_services.health.clinic"), [
    { kind: "amenity-display-key", key: "health:clinic" },
  ]);
  assert.deepEqual(resolve("u95.detail.family_services.health.tipat_halav"), [
    { kind: "amenity-display-key", key: "health:tipat_halav" },
  ]);

  assert.equal(showController.getState("u95.sub.family_services.education"), "mixed");
  assert.equal(showController.getState("u95.sub.family_services.health"), "mixed");
  showController.toggle("u95.sub.family_services.education");
  showController.toggle("u95.sub.family_services.health");
  assert.equal(showController.getState("u95.sub.family_services.education"), "on");
  assert.equal(showController.getState("u95.sub.family_services.health"), "on");
  showController.toggle("u95.sub.family_services.education");
  showController.toggle("u95.sub.family_services.health");
  assert.equal(showController.getState("u95.sub.family_services.education"), "off");
  assert.equal(showController.getState("u95.sub.family_services.health"), "off");
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
    "education-school": false,
    "education-kindergarten": false,
    "bus-stops": false,
    amenities: true,
    roads: false,
    "kids-population": false,
    socioeconomic: false,
    survey: false,
    "survey:walkability_barrier": false,
    "survey:crossing_hazard": false,
    "survey:loved_place": false,
    "survey:community_anchor": false,
  });
});

test("survey controls default all categories off", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/controlSidebarMarkup.js", browser);
  const markup = browser.window.Urban95ControlSidebarMarkup;
  const defaults = markup.buildOverlayVisibilitySnapshot(function (_inputId, fallback) {
    return fallback;
  });

  assert.equal(defaults.survey, false);
  assert.equal(defaults["survey:walkability_barrier"], false);
  assert.equal(defaults["survey:crossing_hazard"], false);
  assert.equal(defaults["survey:loved_place"], false);
  assert.equal(defaults["survey:community_anchor"], false);
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
      anyCategoryEnabled: true,
      allCategoriesEnabled: false,
    }
  );
});

function createSurveyMetricShowTarget(metricId) {
  const rowEl = {
    getAttribute(name) {
      return name === "data-metric-id" ? metricId : name === "data-category-stem" ? "survey" : null;
    },
    closest(selector) {
      return selector === "[data-metric-id]" ? this : null;
    },
  };
  return {
    disabled: false,
    getAttribute(name) {
      return name === "data-action" ? "show" : null;
    },
    closest(selector) {
      if (selector === "[data-action]") return this;
      if (selector === "[data-metric-id]") return rowEl;
      return null;
    },
  };
}

function createSurveyCollapseTarget() {
  const rowEl = {
    getAttribute(name) {
      return name === "data-metric-id" ? "survey" : name === "data-category-stem" ? "survey" : null;
    },
    closest(selector) {
      return selector === "[data-metric-id]" ? this : null;
    },
  };
  return {
    disabled: false,
    getAttribute(name) {
      return name === "data-action" ? "collapse" : null;
    },
    closest(selector) {
      if (selector === "[data-action]") return this;
      if (selector === "[data-metric-id]") return rowEl;
      return null;
    },
  };
}

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
  harness.indicatorsList._handlers.click({ target: createSurveyMetricShowTarget("survey") });

  assert.deepEqual(calls, [
    "survey:survey:walkability_barrier",
    "survey:survey:crossing_hazard",
    "survey:survey:loved_place",
    "survey:survey:community_anchor",
    "survey:survey",
  ]);
});

test("survey parent uses the shared indicator row controls with independent category toggles", () => {
  const browser = createBrowserContext();
  loadControlSidebarModules(browser);
  const calls = [];
  let harness;
  harness = createMockIndicatorsHarness(browser, {
    state: {
      layerVisibility: {
        survey: false,
        "survey:walkability_barrier": false,
        "survey:crossing_hazard": false,
        "survey:loved_place": false,
        "survey:community_anchor": false,
      },
    },
    onSurveyVisibilityChanged(row, enabled) {
      calls.push(row.layerId + ":" + (enabled ? "on" : "off"));
      harness.state.layerVisibility[row.layerId] = !!enabled;
    },
  });

  harness.indicators.bind();
  harness.indicators.renderIndicatorsSection();

  assert.match(harness.indicatorsList.innerHTML, /horizon-icon/);
  assert.match(harness.indicatorsList.innerHTML, /community-centers\.svg/);
  assert.match(harness.indicatorsList.innerHTML, /data-metric-id="survey"/);
  assert.match(
    harness.indicatorsList.innerHTML,
    /data-metric-id="survey"[^>]*>[\s\S]*?data-action="show"[^>]*aria-pressed="false"/
  );
  assert.match(harness.indicatorsList.innerHTML, /indicator-heat-spacer/);
  assert.doesNotMatch(
    harness.indicatorsList.innerHTML,
    /data-metric-id="survey"[^>]*>[\s\S]*?data-action="heat"/
  );

  harness.indicatorsList._handlers.click({
    target: createSurveyMetricShowTarget("survey.crossing_hazard"),
  });

  assert.equal(harness.state.layerVisibility["survey:crossing_hazard"], true);
  assert.equal(harness.state.layerVisibility["survey:walkability_barrier"], false);
  assert.equal(harness.state.layerVisibility.survey, true);
  assert.match(
    harness.indicatorsList.innerHTML,
    /data-metric-id="survey\.crossing_hazard"[^>]*>[\s\S]*?aria-pressed="true"/
  );
  assert.match(
    harness.indicatorsList.innerHTML,
    /data-metric-id="survey\.walkability_barrier"[^>]*>[\s\S]*?aria-pressed="false"/
  );
  assert.match(
    harness.indicatorsList.innerHTML,
    /data-metric-id="survey"[^>]*>[\s\S]*?aria-pressed="false"/
  );

  calls.length = 0;
  harness.indicatorsList._handlers.click({ target: createSurveyMetricShowTarget("survey") });

  assert.deepEqual(calls, [
    "survey:walkability_barrier:on",
    "survey:crossing_hazard:on",
    "survey:loved_place:on",
    "survey:community_anchor:on",
    "survey:on",
  ]);
  assert.match(
    harness.indicatorsList.innerHTML,
    /data-metric-id="survey"[^>]*>[\s\S]*?data-action="show"[^>]*aria-pressed="true"/
  );
});

test("survey control renders as a collapsed indicator group and expands with preserved visibility", () => {
  const browser = createBrowserContext();
  loadControlSidebarModules(browser);
  const harness = createMockIndicatorsHarness(browser, {
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
  assert.match(harness.indicatorsList.innerHTML, /data-category-stem="survey"/);
  assert.match(harness.indicatorsList.innerHTML, /data-action="collapse" aria-expanded="false"/);
  assert.doesNotMatch(harness.indicatorsList.innerHTML, /indicator-subs is-open/);
  assert.match(
    harness.indicatorsList.innerHTML,
    /data-metric-id="survey"[^>]*>[\s\S]*?data-action="show"[^>]*aria-pressed="true"/
  );
  assert.match(
    harness.indicatorsList.innerHTML,
    /data-metric-id="survey\.walkability_barrier"[^>]*>[\s\S]*?aria-pressed="false"/
  );
  assert.match(
    harness.indicatorsList.innerHTML,
    /data-metric-id="survey\.crossing_hazard"[^>]*>[\s\S]*?aria-pressed="true"/
  );

  const categoryRow = {
    getAttribute(name) {
      return name === "data-category-stem" ? "survey" : null;
    },
  };
  const categoryLabel = {
    closest(selector) {
      if (selector === "[data-action]" || selector === "input") return null;
      return selector === ".indicator-row--category[data-category-stem]" ? categoryRow : null;
    },
  };
  harness.indicatorsList._handlers.click({ target: categoryLabel });

  assert.match(harness.indicatorsList.innerHTML, /indicator-subs is-open/);
  assert.match(harness.indicatorsList.innerHTML, /data-action="collapse" aria-expanded="true"/);

  harness.indicatorsList._handlers.click({ target: createSurveyCollapseTarget() });

  assert.doesNotMatch(harness.indicatorsList.innerHTML, /indicator-subs is-open/);
  assert.match(harness.indicatorsList.innerHTML, /data-action="collapse" aria-expanded="false"/);
  assert.match(
    harness.indicatorsList.innerHTML,
    /data-metric-id="survey\.walkability_barrier"[^>]*>[\s\S]*?aria-pressed="false"/
  );
  assert.match(
    harness.indicatorsList.innerHTML,
    /data-metric-id="survey\.crossing_hazard"[^>]*>[\s\S]*?aria-pressed="true"/
  );
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
  assert.match(
    html,
    /data-metric-id="survey"[^>]*>[\s\S]*?data-action="show"[^>]* disabled/
  );
  assert.match(
    html,
    /data-metric-id="survey\.walkability_barrier"[^>]*>[\s\S]*?data-action="show"[^>]* disabled/
  );
  assert.doesNotMatch(
    html,
    /data-metric-id="survey\.walkability_barrier"[^>]*>[\s\S]*?aria-pressed="true"/
  );
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
