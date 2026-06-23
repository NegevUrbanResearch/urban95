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
        hide();
      },
      setSidebarPadding: deps.setSidebarPadding,
      getSidebarWidth: getSidebarWidth,
      restoreFocusAfterHide: deps.restoreFocusAfterHide,
    });
    sidebarChrome.bindGlobalHandlers();
  }

  function show(feature) {
    if (!deps) {
      throw new Error("Urban95NeighborhoodSidebar.configure must be called before show");
    }
    deps.setSelectedNeighborhood(feature);
    sync(feature);
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
    if (deps.eyebrowEl) {
      deps.eyebrowEl.hidden = true;
    }
    var renderCtx = Object.assign(
      { heroEl: deps.heroEl, metaEl: deps.metaEl, eyebrowEl: deps.eyebrowEl },
      deps.renderDeps
    );

    if (isWeighted) {
      deps.loadCitywideStats().then(function () {
        if (token !== renderGeneration) return;
        var citywideStats = deps.getCitywideStats();
        var selectedCategoryLabel = renderCtx.getSelectedWeightedCategoryLabel();
        var avgScore = renderCtx.getWeightedAverageValueFromSource(props, sfx);
        var cityAvgScore = renderCtx.getCitywideWeightedAverageScore(citywideStats, sfx);
        Urban95NeighborhoodPanelRender.populateHeaderWeighted(
          renderCtx,
          props,
          avgScore,
          cityAvgScore,
          selectedCategoryLabel
        );
        deps.bodyEl.innerHTML = Urban95NeighborhoodPanelRender.buildBodyHTMLWeighted(
          renderCtx,
          props,
          sfx,
          avgScore,
          cityAvgScore,
          selectedCategoryLabel
        );
        finalizeSidebarAndBindCharts(token, renderCtx, {
          weighted: true,
          sfx: sfx,
          neighborhoodProps: props,
        });
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
    renderGeneration++;
    Urban95NeighborhoodPanelRender.destroyCharts(chartInstances);
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
    sync: sync,
    hide: hide,
    isOpen: isOpen,
  };
})();
