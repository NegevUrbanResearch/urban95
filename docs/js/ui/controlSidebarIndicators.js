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
    var expandedDetailParentIds = new Set();
    var lastObservedHeatmapId = null;
    var SURVEY_CATEGORY_STEM = "survey";

    function ensureExpandedForNewActiveHeatmap(activeHeatmapId) {
      if (!activeHeatmapId || activeHeatmapId === lastObservedHeatmapId) {
        lastObservedHeatmapId = activeHeatmapId || null;
        return;
      }
      var metric = scoreModel.buildWeightedMetricRegistry()[activeHeatmapId];
      if (metric && metric.scale !== "status") metric = null;
      if (metric) {
        if (metric.selectedWeightedStem) expandedCategoryStems.add(metric.selectedWeightedStem);
        if (metric.parentMetricId) expandedDetailParentIds.add(metric.parentMetricId);
      }
      lastObservedHeatmapId = activeHeatmapId;
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
      ensureExpandedForNewActiveHeatmap(activeHeatmapId);
      var weightedMarkup =
        readState().scoreMode === "weighted"
          ? markup.renderIndicatorsTreeMarkup({
              scoreModel: scoreModel,
              expandedStems: expandedCategoryStems,
              expandedDetailParentIds: expandedDetailParentIds,
              activeHeatmapId: activeHeatmapId,
              iconsRenderer: iconsRenderer,
              resolveShow: showController.resolve.bind(showController),
              getShowState: showController.getState.bind(showController),
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
        expandedCategoryStems.has(SURVEY_CATEGORY_STEM),
        iconsRenderer
      );
      el.indicatorsList.innerHTML =
        '<div class="indicators-tree" role="list" aria-label="Urban95 indicators">' +
        weightedMarkup +
        (auxiliaryMarkup ? auxiliaryMarkup : "") +
        surveyMarkup +
        "</div>";
      updateOverlayVisibility();
    }

    function toggleCategoryExpanded(categoryStem) {
      if (!categoryStem) return;
      var el = getEl();
      var group =
        el.indicatorsList && typeof el.indicatorsList.querySelector === "function"
          ? el.indicatorsList.querySelector(
              '.indicator-group[data-category-stem="' + categoryStem + '"]'
            )
          : null;
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

    function toggleDetailExpanded(parentMetricId) {
      if (!parentMetricId) return;
      if (expandedDetailParentIds.has(parentMetricId)) {
        expandedDetailParentIds.delete(parentMetricId);
      } else {
        expandedDetailParentIds.add(parentMetricId);
      }
      renderIndicatorsSection();
    }

    function syncSurveyMasterFromCategories() {
      if (!markup.SURVEY_MASTER_ROW || typeof markup.resolveSurveyVisibility !== "function") return;
      var visibility = markup.resolveSurveyVisibility(readState().layerVisibility);
      onSurveyVisibilityChanged(markup.SURVEY_MASTER_ROW, !!visibility.anyCategoryEnabled);
    }

    function toggleSurveyVisibility() {
      var surveyRows = markup.SURVEY_CATEGORY_ROWS || [];
      var visibility = markup.resolveSurveyVisibility
        ? markup.resolveSurveyVisibility(readState().layerVisibility)
        : { allCategoriesEnabled: false };
      // Match weighted category toggles: partial selection counts as off, so next click enables all.
      var nextVisible = !visibility.allCategoriesEnabled;

      surveyRows.forEach(function (row) {
        onSurveyVisibilityChanged(row, nextVisible);
      });
      if (markup.SURVEY_MASTER_ROW) {
        onSurveyVisibilityChanged(markup.SURVEY_MASTER_ROW, nextVisible);
      }
      renderIndicatorsSection();
    }

    function toggleSurveyMetric(metricId) {
      if (metricId === "survey") {
        toggleSurveyVisibility();
        return true;
      }
      var row =
        typeof markup.getSurveyRowByMetricId === "function"
          ? markup.getSurveyRowByMetricId(metricId)
          : null;
      if (!row) return false;
      var visibility = markup.resolveSurveyVisibility
        ? markup.resolveSurveyVisibility(readState().layerVisibility)
        : { categories: {} };
      var currentlyShowing = !!visibility.categories[row.id];
      onSurveyVisibilityChanged(row, !currentlyShowing);
      syncSurveyMasterFromCategories();
      renderIndicatorsSection();
      return true;
    }

    function handleIndicatorListClick(e) {
      var actionBtn = e.target.closest("[data-action]");
      if (actionBtn && !actionBtn.disabled) {
        var rowEl = actionBtn.closest("[data-metric-id]");
        if (!rowEl) return;

        if (actionBtn.getAttribute("data-action") === "collapse") {
          var detailParentId = rowEl.getAttribute("data-detail-parent-id");
          if (detailParentId) {
            toggleDetailExpanded(detailParentId);
            return;
          }
          toggleCategoryExpanded(rowEl.getAttribute("data-category-stem"));
          return;
        }

        var metricId = rowEl.getAttribute("data-metric-id");
        if (!metricId) return;

        if (actionBtn.getAttribute("data-action") === "heat") {
          if (markup.isSurveyMetricId && markup.isSurveyMetricId(metricId)) return;
          var currentHeatmapId = readState().activeHeatmapId;
          onHeatmapSelectionChanged(currentHeatmapId === metricId ? null : metricId);
          renderIndicatorsSection();
          renderLegend();
          return;
        }

        if (actionBtn.getAttribute("data-action") === "show") {
          if (markup.isSurveyMetricId && markup.isSurveyMetricId(metricId)) {
            toggleSurveyMetric(metricId);
            return;
          }
          if (!showController.toggle(metricId)) return;
          renderIndicatorsSection();
        }
        return;
      }

      var detailRow = e.target.closest(
        ".indicator-row--subcategory[data-detail-parent-id]"
      );
      if (detailRow) {
        toggleDetailExpanded(detailRow.getAttribute("data-detail-parent-id"));
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
      }
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
