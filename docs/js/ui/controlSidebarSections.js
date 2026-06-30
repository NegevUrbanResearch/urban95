(function () {
  function requireObject(value, name) {
    if (!value || typeof value !== "object") {
      throw new Error("Urban95ControlSidebarSections missing " + name);
    }
    return value;
  }

  function requireFunction(value, name) {
    if (typeof value !== "function") {
      throw new Error("Urban95ControlSidebarSections missing " + name);
    }
    return value;
  }

  function create(deps) {
    var config = requireObject(deps, "deps");
    var elements = requireObject(config.elements, "elements");
    var scoreModel = requireObject(config.scoreModel, "scoreModel");
    var showRegistry = requireObject(config.showRegistry, "showRegistry");
    var markup = requireObject(window.Urban95ControlSidebarMarkup, "Urban95ControlSidebarMarkup");
    var filtersModule = requireObject(window.Urban95ControlSidebarFilters, "Urban95ControlSidebarFilters");
    var indicatorsModule = requireObject(
      window.Urban95ControlSidebarIndicators,
      "Urban95ControlSidebarIndicators"
    );
    var getState = requireFunction(config.getState, "getState");
    var getActiveMetric =
      typeof config.getActiveMetric === "function" ? config.getActiveMetric : null;
    var setScoreMode = requireFunction(config.setScoreMode, "setScoreMode");
    var setWalkMinutes = requireFunction(config.setWalkMinutes, "setWalkMinutes");
    var setSelectedAmenityTypes = requireFunction(
      config.setSelectedAmenityTypes,
      "setSelectedAmenityTypes"
    );
    var setAllFilterTypes = requireFunction(config.setAllFilterTypes, "setAllFilterTypes");
    var setLastFilterRadioSelection = requireFunction(
      config.setLastFilterRadioSelection,
      "setLastFilterRadioSelection"
    );
    var getTypesWithData = requireFunction(config.getTypesWithData, "getTypesWithData");
    var getAllTreesData = requireFunction(config.getAllTreesData, "getAllTreesData");
    var getAllStreetLightsData = requireFunction(
      config.getAllStreetLightsData,
      "getAllStreetLightsData"
    );
    var callbacks = requireObject(config.callbacks, "callbacks");
    var onFilterSelectionChanged = requireFunction(
      callbacks.onFilterSelectionChanged,
      "callbacks.onFilterSelectionChanged"
    );
    var onScoreModeChanged = requireFunction(
      callbacks.onScoreModeChanged,
      "callbacks.onScoreModeChanged"
    );
    var onWalkMinutesChanged = requireFunction(
      callbacks.onWalkMinutesChanged,
      "callbacks.onWalkMinutesChanged"
    );
    var onModeToggleRequested = requireFunction(
      callbacks.onModeToggleRequested,
      "callbacks.onModeToggleRequested"
    );
    var onPointVisibilityChanged = requireFunction(
      callbacks.onPointVisibilityChanged,
      "callbacks.onPointVisibilityChanged"
    );
    var onHeatmapSelectionChanged = requireFunction(
      callbacks.onHeatmapSelectionChanged,
      "callbacks.onHeatmapSelectionChanged"
    );
    var onEscape = requireFunction(callbacks.onEscape, "callbacks.onEscape");
    var onBasemapChanged =
      typeof callbacks.onBasemapChanged === "function" ? callbacks.onBasemapChanged : null;
    var clearDerivedCaches = requireFunction(
      callbacks.clearDerivedCaches,
      "callbacks.clearDerivedCaches"
    );
    var showController = window.Urban95ControlSidebarShow.create({
      scoreModel: scoreModel,
      showRegistry: showRegistry,
      applyShowAction: requireFunction(
        callbacks.onMetricShowRequested,
        "callbacks.onMetricShowRequested"
      ),
      isShowActionEnabled: requireFunction(
        callbacks.isMetricShowEnabled,
        "callbacks.isMetricShowEnabled"
      ),
    });
    var amenityConfig = scoreModel.AMENITY_TYPE_CONFIG || {};
    var defaultConfig = scoreModel.DEFAULT_CONFIG || { color: "#6b7280" };
    var getAmenityConfig =
      typeof scoreModel.getAmenityConfig === "function"
        ? scoreModel.getAmenityConfig
        : function (type) {
            return amenityConfig[type] || defaultConfig;
          };
    var cachedElements = {};

    function readState() {
      return getState() || {};
    }

    function queryElements() {
      var root = elements.bodyEl;
      if (!root) return cachedElements;
      cachedElements = {
        walkFilterSection: root.querySelector("#walk-filter-section"),
        indicatorsSection: root.querySelector("#indicators-section"),
        indicatorsWeightedBlock: root.querySelector("#indicators-weighted-block"),
        indicatorsList: root.querySelector("#indicators-list"),
        filterBtn: root.querySelector("#filter-btn"),
        filterPopup: root.querySelector("#filter-popup"),
        filterLabel: root.querySelector("#filter-label"),
        filterItems: root.querySelector("#filter-items"),
        amenityFilterSection: root.querySelector("#amenity-filter-section"),
        radiusSection: root.querySelector("#radius-section"),
        radiusToggle: root.querySelector("#radius-toggle"),
        scoreModelToggle: root.querySelector("#score-model-toggle"),
        modeToggle: root.querySelector("#mode-toggle"),
        modeHint: root.querySelector("#mode-hint"),
        basemapToggle: root.querySelector("#basemap-toggle"),
      };
      if (typeof markup.forEachOverlayInputId === "function") {
        markup.forEachOverlayInputId(function (inputId) {
          cachedElements[inputId] = root.querySelector("#" + inputId);
        });
      }
      return cachedElements;
    }

    function getEl() {
      return queryElements();
    }

    function getScoreModeLabel(mode) {
      var resolvedMode = mode || readState().scoreMode;
      return resolvedMode === "weighted" ? "Urban95" : "Amenities Focus";
    }

    var filterController = filtersModule.create({
      markup: markup,
      getEl: getEl,
      readState: readState,
      getAmenityConfig: getAmenityConfig,
      getTypesWithData: getTypesWithData,
      getAllTreesData: getAllTreesData,
      getAllStreetLightsData: getAllStreetLightsData,
      setSelectedAmenityTypes: setSelectedAmenityTypes,
      setAllFilterTypes: setAllFilterTypes,
      setLastFilterRadioSelection: setLastFilterRadioSelection,
      clearDerivedCaches: clearDerivedCaches,
      onFilterSelectionChanged: onFilterSelectionChanged,
      onAfterFilterChanged: function () {
        indicatorsController.renderIndicatorsSection();
        renderLegend();
      },
      onEscape: onEscape,
      isTouchDevice: !!config.isTouchDevice,
      filterBackdrop: elements.filterBackdrop,
    });

    var iconsBase =
      typeof config.iconsBase === "string" && config.iconsBase
        ? config.iconsBase
        : window.Urban95Config && Urban95Config.ICONS_BASE
          ? Urban95Config.ICONS_BASE
          : "./icons";
    var indicatorsController = indicatorsModule.create({
      markup: markup,
      showController: showController,
      scoreModel: scoreModel,
      getEl: getEl,
      readState: readState,
      onPointVisibilityChanged: onPointVisibilityChanged,
      onHeatmapSelectionChanged: onHeatmapSelectionChanged,
      renderLegend: renderLegend,
      iconsBase: iconsBase,
    });

    function renderLegend() {
      if (!elements.legendEl) return;
      var metric = getActiveMetric ? getActiveMetric() : null;
      elements.legendEl.innerHTML = markup.renderLegendHtml(metric);
    }

    function setLegendVisible(visible) {
      if (!elements.legendEl) return;
      elements.legendEl.style.display = visible ? "" : "none";
    }

    function syncSidebarContent() {
      indicatorsController.renderIndicatorsSection();
      indicatorsController.syncWalkFilterVisibility();
      indicatorsController.syncIndicatorsVisibility();
      filterController.syncUiForMode();
      filterController.updateLabel();
      renderLegend();
    }

    function renderSidebarSkeleton() {
      if (!elements.bodyEl) return;
      if (elements.bodyEl.dataset.sidebarSkeleton === "1") {
        queryElements();
        return;
      }
      elements.bodyEl.innerHTML = markup.renderSidebarSkeletonHtml();
      elements.bodyEl.dataset.sidebarSkeleton = "1";
      queryElements();
    }

    function bindStaticEvents() {
      var el = getEl();
      filterController.bind();
      indicatorsController.bind();

      if (el.scoreModelToggle && el.scoreModelToggle.dataset.bound !== "1") {
        el.scoreModelToggle.dataset.bound = "1";
        el.scoreModelToggle.addEventListener("change", function (e) {
          var input = e && e.target;
          if (!input || input.name !== "score-model") return;
          var nextScoreMode =
            input.value === "expanded" || input.value === "weighted" ? input.value : "weighted";
          setScoreMode(nextScoreMode);
          clearDerivedCaches();
          onScoreModeChanged(nextScoreMode);
          syncSidebarContent();
        });
      }

      if (el.radiusToggle && el.radiusToggle.dataset.bound !== "1") {
        el.radiusToggle.dataset.bound = "1";
        el.radiusToggle.addEventListener("click", function (e) {
          var btn = e.target.closest(".radius-opt");
          if (!btn) return;
          var minutes = parseInt(btn.dataset.minutes, 10);
          if (!Number.isFinite(minutes)) return;
          setWalkMinutes(minutes);
          el.radiusToggle.querySelectorAll(".radius-opt").forEach(function (item) {
            item.classList.remove("active");
          });
          btn.classList.add("active");
          onWalkMinutesChanged(minutes);
          filterController.updateLabel();
          renderLegend();
        });
      }

      if (el.basemapToggle && el.basemapToggle.dataset.bound !== "1") {
        el.basemapToggle.dataset.bound = "1";
        el.basemapToggle.addEventListener("change", function (e) {
          var input = e && e.target;
          if (!input || input.name !== "basemap") return;
          var basemap = input.value === "satellite" ? "satellite" : "street";
          if (onBasemapChanged) onBasemapChanged(basemap);
        });
      }

      if (el.modeToggle && el.modeToggle.dataset.bound !== "1") {
        el.modeToggle.dataset.bound = "1";
        el.modeToggle.addEventListener("click", function (e) {
          var btn = e.target.closest(".mode-opt");
          if (!btn) return;
          onModeToggleRequested(btn.dataset.mode);
        });
      }
    }

    function getUiElements() {
      return getEl();
    }

    return {
      renderSidebarSkeleton: renderSidebarSkeleton,
      syncSidebarContent: syncSidebarContent,
      renderLegend: renderLegend,
      setLegendVisible: setLegendVisible,
      bindStaticEvents: bindStaticEvents,
      getUiElements: getUiElements,
      getScoreModeLabel: getScoreModeLabel,
      updateFilterLabel: filterController.updateLabel,
      buildFilterItems: filterController.buildItems,
      closeFilterPopup: filterController.closePopup,
      syncFilterUiForScoreMode: filterController.syncUiForMode,
      syncOverlayVisibility: indicatorsController.updateOverlayVisibility,
      syncWalkFilterVisibility: indicatorsController.syncWalkFilterVisibility,
      syncIndicatorsVisibility: indicatorsController.syncIndicatorsVisibility,
    };
  }

  window.Urban95ControlSidebarSections = {
    create: create,
  };
})();
