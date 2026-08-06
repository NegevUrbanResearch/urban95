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
        var neighborhoodRanking =
          citywideStats && citywideStats.neighborhood_ranking_weighted;
        var missingWeightedSubcategoryData =
          !!(
            activeMetric &&
            (
              !getRenderStateHelper("hasWeightedNeighborhoodMetricData")(activeMetric, props) ||
              !getRenderStateHelper("hasWeightedNeighborhoodMetricData")(
                activeMetric,
                citywideStats,
                neighborhoodRanking
              )
            )
          );
        var selectedCategoryLabel =
          !activeMetric || activeMetric.kind === "weighted-overall"
            ? "Urban95"
            : activeMetric.label || "Urban95";
        if (missingWeightedSubcategoryData) {
          if (renderCtx.heroEl) {
            var unavailableKicker =
              activeMetric && activeMetric.kind !== "weighted-overall" && activeMetric.label
                ? activeMetric.label + " score"
                : "Score";
            renderCtx.heroEl.innerHTML =
              '<div class="percentile-summary score-explain-sidebar-hero-compact">' +
              '<p class="score-explain-hero-kicker">' +
              renderCtx.escapeHtml(unavailableKicker) +
              '</p><div class="percentile-value">Unavailable</div></div>';
          }
          if (renderCtx.metaEl) {
            renderCtx.metaEl.innerHTML =
              '<div class="score-explain-building-ctx"><div class="building-ctx-text">' +
              '<span class="building-ctx-id" dir="rtl" lang="he">' +
              renderCtx.escapeHtml((props && props.Name) || "Unknown") +
              '</span><span class="building-ctx-coords">This subcategory is not present in the current neighborhood export.</span></div></div>';
          }
          deps.bodyEl.innerHTML =
            '<div class="cw-section"><p class="sidebar-section-hint">Neighborhood-level Urban95 subcategory summaries are unavailable for this metric in the current data export.</p></div>';
          finalizeSidebarAndBindCharts(token, renderCtx, {
            weighted: true,
            sfx: sfx,
            neighborhoodProps: props,
          });
          return;
        }
        var avgScore = getRenderStateHelper("getWeightedNeighborhoodMetricValue")(
          props,
          sfx,
          activeMetric
        );
        var cityAvgScore = getRenderStateHelper("getWeightedNeighborhoodMetricValue")(
          citywideStats,
          sfx,
          activeMetric,
          neighborhoodRanking
        );
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
