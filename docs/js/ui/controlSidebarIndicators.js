(function () {
  function requireObject(value, name) {
    if (!value || typeof value !== "object") {
      throw new Error("Urban95ControlSidebarIndicators missing " + name);
    }
    return value;
  }

  function requireFunction(value, name) {
    if (typeof value !== "function") {
      throw new Error("Urban95ControlSidebarIndicators missing " + name);
    }
    return value;
  }

  function create(deps) {
    var config = requireObject(deps || {}, "deps");
    var markup = requireObject(config.markup, "markup");
    var showController = requireObject(config.showController, "showController");
    var scoreModel = requireObject(config.scoreModel, "scoreModel");
    var getEl = requireFunction(config.getEl, "getEl");
    var readState = requireFunction(config.readState, "readState");
    var onPointVisibilityChanged = requireFunction(
      config.onPointVisibilityChanged,
      "onPointVisibilityChanged"
    );
    var onHeatmapSelectionChanged = requireFunction(
      config.onHeatmapSelectionChanged,
      "onHeatmapSelectionChanged"
    );
    var renderLegend = requireFunction(config.renderLegend, "renderLegend");
    var weightedIndicatorIcons = requireObject(
      window.Urban95WeightedIndicatorIcons,
      "Urban95WeightedIndicatorIcons"
    );
    if (typeof config.iconsBase !== "string" || !config.iconsBase) {
      throw new Error("Urban95ControlSidebarIndicators missing iconsBase");
    }
    var iconsBase = config.iconsBase;
    var iconsRenderer = weightedIndicatorIcons.create(iconsBase);
    var expandedCategoryStems = new Set();

    function ensureExpandedForActiveHeatmap(activeHeatmapId) {
      var match = /^u95\.sub\.([^.]+)\./.exec(activeHeatmapId);
      if (match) expandedCategoryStems.add(match[1]);
    }

    function syncWalkFilterVisibility() {
      var el = getEl();
      if (el.walkFilterSection) el.walkFilterSection.hidden = readState().scoreMode !== "expanded";
    }

    function syncIndicatorsVisibility() {
      var el = getEl();
      if (el.indicatorsWeightedBlock) {
        el.indicatorsWeightedBlock.hidden = readState().scoreMode !== "weighted";
      }
    }

    function updateOverlayVisibility() {
      var state = readState();
      var el = getEl();
      var showHouseLayers = state.currentMode === "house";
      if (el.indicatorsSection) {
        el.indicatorsSection.classList.toggle("is-basemap-only", !showHouseLayers);
      }

      markup.getAuxiliaryRows().forEach(function (row) {
        var auxInput = el[row.inputId];
        if (!auxInput) return;
        var auxHost = auxInput.closest(".indicator-row--aux");
        if (auxHost) auxHost.style.display = showHouseLayers ? "" : "none";
      });
    }

    function renderIndicatorRowMarkup(row, activeHeatmapId) {
      if (row.kind === "subcategory" && !expandedCategoryStems.has(row.parentStem)) {
        return "";
      }

      var showResolution = showController.resolve(row.metricId);
      return markup.renderIndicatorRow({
        row: row,
        expanded: row.kind === "category" ? expandedCategoryStems.has(row.stem) : false,
        showDisabled: !showResolution.supported,
        showActive: showController.isEnabled(row.metricId),
        showTitle: showResolution.supported ? "Toggle companion map layers" : showResolution.reason,
        heatActive: activeHeatmapId === row.metricId,
        iconsRenderer: iconsRenderer,
      });
    }

    function renderIndicatorsSection() {
      var el = getEl();
      if (!el.indicatorsList) return;
      var activeHeatmapId = readState().activeHeatmapId;
      ensureExpandedForActiveHeatmap(activeHeatmapId);
      var weightedRows =
        readState().scoreMode === "weighted"
          ? markup.buildIndicatorRowsFromMetricDefinitions(scoreModel).map(function (row) {
              return renderIndicatorRowMarkup(row, activeHeatmapId);
            })
          : [];
      var layerVisibility = readState().layerVisibility;
      var auxiliaryMarkup = markup.renderAuxiliarySegmentedRow(
        markup.getAuxiliaryRows(),
        layerVisibility
      );
      el.indicatorsList.innerHTML = weightedRows.concat(auxiliaryMarkup ? [auxiliaryMarkup] : []).join("");
      updateOverlayVisibility();
    }

    function toggleCategoryExpanded(categoryStem) {
      if (!categoryStem) return;
      if (expandedCategoryStems.has(categoryStem)) {
        expandedCategoryStems.delete(categoryStem);
      } else {
        expandedCategoryStems.add(categoryStem);
      }
      renderIndicatorsSection();
    }

    function handleIndicatorListClick(e) {
      var actionBtn = e.target.closest("[data-action]");
      if (actionBtn && !actionBtn.disabled) {
        var rowEl = actionBtn.closest("[data-metric-id]");
        if (!rowEl) return;

        if (actionBtn.getAttribute("data-action") === "collapse") {
          toggleCategoryExpanded(rowEl.getAttribute("data-category-stem"));
          return;
        }

        var metricId = rowEl.getAttribute("data-metric-id");
        if (!metricId) return;

        if (actionBtn.getAttribute("data-action") === "heat") {
          onHeatmapSelectionChanged(metricId);
          renderIndicatorsSection();
          renderLegend();
          return;
        }

        if (!showController.toggle(metricId)) return;
        renderIndicatorsSection();
        return;
      }

      var categoryRow = e.target.closest(".indicator-row--category[data-category-stem]");
      if (categoryRow) {
        toggleCategoryExpanded(categoryRow.getAttribute("data-category-stem"));
      }
    }

    function handleIndicatorListChange(e) {
      var input = e.target;
      if (!input || typeof input.id !== "string") return;
      var row = markup.getAuxiliaryRowByInputId(input.id);
      if (!row || !row.layerId) return;
      onPointVisibilityChanged(row);
      renderIndicatorsSection();
    }

    function bindIndicatorEvents() {
      var el = getEl();
      if (!el.indicatorsList || el.indicatorsList.dataset.bound === "1") return;
      el.indicatorsList.dataset.bound = "1";
      el.indicatorsList.addEventListener("click", handleIndicatorListClick);
      el.indicatorsList.addEventListener("change", handleIndicatorListChange);
    }

    function bind() {
      bindIndicatorEvents();
    }

    return {
      bind: bind,
      renderIndicatorsSection: renderIndicatorsSection,
      updateOverlayVisibility: updateOverlayVisibility,
      syncWalkFilterVisibility: syncWalkFilterVisibility,
      syncIndicatorsVisibility: syncIndicatorsVisibility,
    };
  }

  window.Urban95ControlSidebarIndicators = {
    create: create,
  };
})();
