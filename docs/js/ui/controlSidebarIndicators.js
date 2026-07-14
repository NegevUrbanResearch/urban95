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
      if (!activeHeatmapId) return;
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
      if (el.indicatorsSection) {
        el.indicatorsSection.classList.remove("is-basemap-only");
        el.indicatorsSection.classList.toggle(
          "is-neighborhood-scale",
          state.currentMode === "neighborhood"
        );
      }

      // Pop. Kids / SES stay available in house, neighborhood, and citywide.
      markup.getAuxiliaryRows().forEach(function (row) {
        var auxInput = el[row.inputId];
        if (!auxInput) return;
        var auxHost = auxInput.closest(".indicator-row--aux");
        if (auxHost) auxHost.style.display = "";
      });
    }

    function syncCategoryGroupExpanded(group, expanded) {
      var subs = group.querySelector(".indicator-subs");
      var btn = group.querySelector(".indicator-collapse-btn");
      var labelEl = group.querySelector(".indicator-row--category .indicator-label");
      var label = labelEl ? labelEl.textContent.trim() : "category";
      if (subs) subs.classList.toggle("is-open", expanded);
      if (btn) {
        btn.classList.toggle("is-expanded", expanded);
        btn.setAttribute("aria-expanded", expanded ? "true" : "false");
        btn.setAttribute("aria-label", (expanded ? "Collapse" : "Expand") + " " + label);
      }
    }

    function renderIndicatorsSection() {
      var el = getEl();
      if (!el.indicatorsList) return;
      var activeHeatmapId = readState().activeHeatmapId;
      ensureExpandedForActiveHeatmap(activeHeatmapId);
      var weightedMarkup =
        readState().scoreMode === "weighted"
          ? markup.renderIndicatorsTreeMarkup({
              scoreModel: scoreModel,
              expandedStems: expandedCategoryStems,
              activeHeatmapId: activeHeatmapId,
              iconsRenderer: iconsRenderer,
              resolveShow: showController.resolve.bind(showController),
              isShowEnabled: showController.isEnabled.bind(showController),
            })
          : "";
      var layerVisibility = readState().layerVisibility;
      var auxiliaryMarkup = markup.renderAuxiliarySegmentedRow(
        markup.getAuxiliaryRows(),
        layerVisibility
      );
      el.indicatorsList.innerHTML =
        weightedMarkup + (auxiliaryMarkup ? auxiliaryMarkup : "");
      updateOverlayVisibility();
    }

    function toggleCategoryExpanded(categoryStem) {
      if (!categoryStem) return;
      var el = getEl();
      var group =
        el.indicatorsList &&
        el.indicatorsList.querySelector(
          '.indicator-group[data-category-stem="' + categoryStem + '"]'
        );
      var willExpand = !expandedCategoryStems.has(categoryStem);
      if (willExpand) {
        expandedCategoryStems.add(categoryStem);
      } else {
        expandedCategoryStems.delete(categoryStem);
      }
      if (group) {
        syncCategoryGroupExpanded(group, willExpand);
        return;
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
          var currentHeatmapId = readState().activeHeatmapId;
          onHeatmapSelectionChanged(currentHeatmapId === metricId ? null : metricId);
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
