(function () {
  "use strict";

  var chartInstances = [];
  var renderGeneration = 0;
  var sidebarChrome = null;
  var deps = null;

  var REQUIRED_DEPENDENCY_TYPES = {
    getScoreMode: "function",
    getScoreMinutes: "function",
    setSelectedNeighborhood: "function",
    loadCitywideStats: "function",
    loadNeighborhoodChartsPayload: "function",
    getCitywideStats: "function",
    ensureChartJsLoaded: "function",
    requestAnimationFrame: "function",
    setSidebarPadding: "function",
    restoreFocusAfterHide: "function",
    renderDeps: "object",
    sidebarEl: "object",
    heroEl: "object",
    metaEl: "object",
    bodyEl: "object",
    emptyEl: "object",
    closeButtonEl: "object",
    backdropEl: "object",
  };

  function validateDeps(nextDeps) {
    if (!nextDeps) {
      throw new Error("Urban95NeighborhoodSidebar.configure missing required dependency: deps object");
    }
    var missing = [];
    Object.keys(REQUIRED_DEPENDENCY_TYPES).forEach(function (key) {
      var expectedType = REQUIRED_DEPENDENCY_TYPES[key];
      var value = nextDeps[key];
      var valid = false;
      if (expectedType === "object") {
        valid = !!value;
      } else {
        valid = typeof value === expectedType;
      }
      if (!valid) {
        missing.push(key + " (" + expectedType + ")");
      }
    });
    if (missing.length > 0) {
      throw new Error(
        "Urban95NeighborhoodSidebar.configure missing required dependency: " + missing.join(", ")
      );
    }
    return nextDeps;
  }

  function getSidebarWidth() {
    if (!deps || !deps.sidebarEl || typeof deps.sidebarEl.getBoundingClientRect !== "function") {
      return 400;
    }
    return deps.sidebarEl.getBoundingClientRect().width || 400;
  }

  function getRenderStateHelper(name) {
    if (!deps || typeof deps[name] !== "function") {
      throw new Error("Urban95NeighborhoodSidebar requires " + name);
    }
    return deps[name];
  }

  function finalizeSidebarAndBindCharts(token, renderCtx, chartOptions) {
    Urban95NeighborhoodPanelRender.destroyCharts(chartInstances);
    if (deps.emptyEl) {
      deps.emptyEl.hidden = true;
      deps.emptyEl.textContent = "";
    }
    sidebarChrome.open();
    deps.ensureChartJsLoaded().then(function () {
      if (token !== renderGeneration) return;
      deps.requestAnimationFrame(function () {
        if (token !== renderGeneration) return;
        Urban95NeighborhoodPanelRender.bindCharts(
          renderCtx,
          deps.bodyEl,
          chartOptions,
          chartInstances
        );
      });
    });
  }

  function configure(nextDeps) {
    deps = validateDeps(nextDeps || null);
    sidebarChrome = Urban95SidebarChromeBindings.create({
      sidebarEl: deps.sidebarEl,
      backdropEl: deps.backdropEl,
      closeButtonEl: deps.closeButtonEl,
      bodyEl: deps.bodyEl,
      bodyOpenClass: "neighborhood-sidebar-open",
      onClose: function () {
        hide({ clearSelection: true });
      },
      setSidebarPadding: deps.setSidebarPadding,
      getSidebarWidth: getSidebarWidth,
      restoreFocusAfterHide: deps.restoreFocusAfterHide,
    });
    sidebarChrome.bindGlobalHandlers();
  }

  function clearProgressiveCompareCue() {
    if (!deps || !deps.eyebrowEl) return;
    deps.eyebrowEl.hidden = true;
    deps.eyebrowEl.textContent = "";
  }

  function show(feature) {
    if (!deps) {
      throw new Error("Urban95NeighborhoodSidebar.configure must be called before show");
    }
    deps.setSelectedNeighborhood(feature);
    clearProgressiveCompareCue();
    sync(feature);
  }

  function buildCompareHost(token) {
    var renderCtx = Object.assign(
      { heroEl: deps.heroEl, metaEl: deps.metaEl, eyebrowEl: deps.eyebrowEl },
      deps.renderDeps || {}
    );
    return {
      token: token,
      isStale: function () {
        return token !== renderGeneration;
      },
      chartInstances: chartInstances,
      openChrome: function () {
        if (deps.emptyEl) {
          deps.emptyEl.hidden = true;
          deps.emptyEl.textContent = "";
        }
        sidebarChrome.open();
      },
      hide: hide,
      removeSlot: typeof deps.removeCompareSlot === "function" ? deps.removeCompareSlot : null,
      getScoreMode: deps.getScoreMode,
      getScoreMinutes: deps.getScoreMinutes,
      loadCitywideStats: deps.loadCitywideStats,
      loadNeighborhoodChartsPayload: deps.loadNeighborhoodChartsPayload,
      getCitywideStats: deps.getCitywideStats,
      ensureChartJsLoaded: deps.ensureChartJsLoaded,
      requestAnimationFrame: deps.requestAnimationFrame,
      getWeightedNeighborhoodMetricValue: getRenderStateHelper("getWeightedNeighborhoodMetricValue"),
      hasWeightedNeighborhoodMetricData: function () {
        if (typeof deps.hasWeightedNeighborhoodMetricData !== "function") return true;
        return deps.hasWeightedNeighborhoodMetricData.apply(null, arguments);
      },
      getActiveMetric: renderCtx.getActiveMetric,
      getNeighborhoodPercentileKey: renderCtx.getNeighborhoodPercentileKey,
      getAmenityConfig: renderCtx.getAmenityConfig,
      renderStatusComposition: Urban95NeighborhoodPanelRender.renderStatusComposition,
      statusSummaryLabel: Urban95NeighborhoodPanelRender.statusSummaryLabel,
      renderHorizonLabelCell: renderCtx.renderHorizonLabelCell,
      getWeightedCategoryIcon: renderCtx.getWeightedCategoryIcon,
      getWeightedSubcategoryIcon: renderCtx.getWeightedSubcategoryIcon,
      scoreExplainIconNeutral: renderCtx.scoreExplainIconNeutral,
      escapeHtml: renderCtx.escapeHtml,
      formatMetricNumber: renderCtx.formatMetricNumber,
      formatScoreInteger: renderCtx.formatScoreInteger,
      heroPercentileMeterFillStyle: renderCtx.heroPercentileMeterFillStyle,
      getOrdinalSuffix: renderCtx.getOrdinalSuffix,
      heroEl: deps.heroEl,
      metaEl: deps.metaEl,
      eyebrowEl: deps.eyebrowEl,
      bodyEl: deps.bodyEl,
      emptyEl: deps.emptyEl,
    };
  }

  // Compare dispatch — body owned by deps.renderCompare (neighborhoodCompareRender).
  function showCompare(state) {
    if (!deps) {
      throw new Error("Urban95NeighborhoodSidebar.configure must be called before showCompare");
    }
    var slot0 = state && state.slots ? state.slots[0] : null;
    var slot1 = state && state.slots ? state.slots[1] : null;
    if (!slot0 || !slot1) {
      hide({ clearSelection: true });
      return;
    }
    deps.setSelectedNeighborhood(slot0);
    clearProgressiveCompareCue();
    if (typeof deps.renderCompare === "function") {
      var token = ++renderGeneration;
      deps.renderCompare(state, buildCompareHost(token));
      return;
    }
    if (deps.eyebrowEl) {
      deps.eyebrowEl.hidden = true;
      deps.eyebrowEl.textContent = "";
    }
    sync(slot0);
  }

  function sync(feature) {
    if (!deps) {
      throw new Error("Urban95NeighborhoodSidebar.configure must be called before sync");
    }
    if (!feature || !feature.properties) {
      hide();
      return;
    }

    var token = ++renderGeneration;
    if (deps.emptyEl) {
      deps.emptyEl.hidden = false;
      deps.emptyEl.textContent = "Loading neighborhood details...";
    }
    if (deps.bodyEl) {
      deps.bodyEl.innerHTML = "";
    }
    var props = feature.properties;
    var scoreMinutes = deps.getScoreMinutes();
    var sfx = "_" + scoreMinutes + "min";
    var isWeighted = deps.getScoreMode() === "weighted";
    var renderCtx = Object.assign(
      { heroEl: deps.heroEl, metaEl: deps.metaEl, eyebrowEl: deps.eyebrowEl },
      deps.renderDeps
    );

    if (isWeighted) {
      deps.loadCitywideStats().then(function () {
        if (token !== renderGeneration) return;
        var citywideStats = deps.getCitywideStats();
        var activeMetric = renderCtx.getActiveMetric ? renderCtx.getActiveMetric() : null;
        var registry = window.Urban95ScoreModel && window.Urban95ScoreModel.buildWeightedMetricRegistry
          ? window.Urban95ScoreModel.buildWeightedMetricRegistry()
          : {};
        activeMetric = activeMetric || registry["u95.overall"];
        var categoryMetrics = Object.keys(registry).map(function (id) { return registry[id]; }).filter(function (metric) {
          return metric && metric.kind === "weighted-category";
        });
        Urban95NeighborhoodPanelRender.populateHeaderStatus(renderCtx, props, activeMetric);
        deps.bodyEl.innerHTML = Urban95NeighborhoodPanelRender.buildBodyHTMLStatus(
          renderCtx, props, activeMetric, categoryMetrics
        );
        finalizeSidebarAndBindCharts(token, renderCtx, { weighted: false, invObj: {} });
      });
      return;
    }

    deps.loadNeighborhoodChartsPayload().then(function (invPayload) {
      if (token !== renderGeneration) return;
      var invLegacy =
        (invPayload.inventory_legacy && invPayload.inventory_legacy[props.Name]) || {};
      var pct = props[renderCtx.getNeighborhoodPercentileKey(sfx)] || 0;
      Urban95NeighborhoodPanelRender.populateHeaderExpanded(renderCtx, props, pct, scoreMinutes);
      deps.bodyEl.innerHTML = Urban95NeighborhoodPanelRender.buildBodyHTMLExpanded(
        renderCtx,
        props,
        sfx,
        pct,
        invLegacy
      );
      finalizeSidebarAndBindCharts(token, renderCtx, { weighted: false, invObj: invLegacy });
    });
  }

  function hide(options) {
    options = options || {};
    if (options.clearSelection) {
      if (!deps) {
        throw new Error(
          "Urban95NeighborhoodSidebar.configure must be called before hide({ clearSelection: true })"
        );
      }
      if (typeof deps.clearCompareSelection === "function") {
        deps.clearCompareSelection();
        return;
      }
      deps.setSelectedNeighborhood(null);
    }
    renderGeneration++;
    Urban95NeighborhoodPanelRender.destroyCharts(chartInstances);
    clearProgressiveCompareCue();
    if (sidebarChrome) {
      sidebarChrome.close(options);
    }
  }

  function isOpen() {
    if (sidebarChrome) return sidebarChrome.isOpen();
    return !!(deps && deps.sidebarEl && deps.sidebarEl.classList.contains("is-open"));
  }

  window.Urban95NeighborhoodSidebar = {
    configure: configure,
    show: show,
    showCompare: showCompare,
    sync: sync,
    hide: hide,
    isOpen: isOpen,
  };
})();
