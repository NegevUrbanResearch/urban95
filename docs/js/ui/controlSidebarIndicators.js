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
    var onSurveyVisibilityChanged = requireFunction(
      config.onSurveyVisibilityChanged,
      "onSurveyVisibilityChanged"
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
    var surveyGroupExpanded = false;

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
      var surveyMarkup = markup.renderSurveyOverlayGroup(
        layerVisibility,
        window.Urban95Config ? window.Urban95Config.surveyCategories : {},
        readState().surveyAvailable !== false,
        surveyGroupExpanded,
        iconsRenderer
      );
      el.indicatorsList.innerHTML =
        weightedMarkup + (auxiliaryMarkup ? auxiliaryMarkup : "") + surveyMarkup;
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

    function toggleSurveyGroupExpanded() {
      surveyGroupExpanded = !surveyGroupExpanded;
      renderIndicatorsSection();
    }

    function toggleSurveyVisibility() {
      var surveyRows = markup.SURVEY_CATEGORY_ROWS || [];
      var masterRow = markup.SURVEY_MASTER_ROW;
      var state = readState();
      var currentlyVisible = markup.resolveSurveyVisibility
        ? markup.resolveSurveyVisibility(state.layerVisibility).enabled
        : false;
      var nextVisible = !currentlyVisible;
      var el = getEl();

      if (nextVisible) {
        surveyRows.forEach(function (row) {
          if (el[row.inputId]) el[row.inputId].checked = true;
          onSurveyVisibilityChanged(row);
        });
      }
      if (masterRow) {
        if (el[masterRow.inputId]) el[masterRow.inputId].checked = nextVisible;
        onSurveyVisibilityChanged(masterRow);
      }
      renderIndicatorsSection();
    }

    function handleIndicatorListClick(e) {
      var actionBtn = e.target.closest("[data-action]");
      if (actionBtn && !actionBtn.disabled) {
        if (actionBtn.getAttribute("data-action") === "survey-collapse") {
          toggleSurveyGroupExpanded();
          return;
        }
        if (actionBtn.getAttribute("data-action") === "survey-show") {
          toggleSurveyVisibility();
          return;
        }
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

      var surveyRow = e.target.closest(".indicator-row--survey[data-survey-group]");
      if (surveyRow && !e.target.closest("input")) {
        toggleSurveyGroupExpanded();
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
      var auxiliaryRow = markup.getAuxiliaryRowByInputId(input.id);
      if (auxiliaryRow && auxiliaryRow.layerId) {
        onPointVisibilityChanged(auxiliaryRow);
        renderIndicatorsSection();
        return;
      }
      var surveyRow = markup.getSurveyRowByInputId(input.id);
      if (!surveyRow || !surveyRow.layerId) return;
      onSurveyVisibilityChanged(surveyRow);
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
