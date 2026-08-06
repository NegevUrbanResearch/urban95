(function () {
  var palette = window.Urban95Palette;
  if (!palette) {
    throw new Error(
      "Urban95ControlSidebarMarkup requires Urban95Palette (load js/core/palette.js first)"
    );
  }

  var OVERLAY_DEFAULTS = [
    {
      layerId: "urban-nature",
      inputId: "show-urban-nature-toggle",
      defaultChecked: false,
      snapshotVisibility: true,
    },
    {
      layerId: "trees",
      inputId: "show-trees-toggle",
      defaultChecked: true,
      snapshotVisibility: true,
    },
    {
      layerId: "street-lights",
      inputId: "show-lights-toggle",
      defaultChecked: false,
      snapshotVisibility: true,
    },
    {
      layerId: "schools",
      inputId: "show-schools-toggle",
      defaultChecked: false,
      snapshotVisibility: true,
    },
    {
      layerId: "bus-stops",
      inputId: "show-bus-stops-toggle",
      defaultChecked: false,
      snapshotVisibility: true,
    },
    {
      layerId: "amenities",
      inputId: "show-amenity-points-toggle",
      defaultChecked: true,
      snapshotVisibility: true,
    },
    {
      layerId: "roads",
      inputId: "show-roads-toggle",
      defaultChecked: false,
      snapshotVisibility: true,
    },
    {
      layerId: "kids-population",
      inputId: "show-kids-population-toggle",
      defaultChecked: false,
      snapshotVisibility: true,
    },
    {
      layerId: "socioeconomic",
      inputId: "show-socioeconomic-toggle",
      defaultChecked: false,
      snapshotVisibility: true,
    },
    {
      layerId: "survey",
      inputId: "show-survey-toggle",
      defaultChecked: false,
      snapshotVisibility: true,
    },
    {
      layerId: "survey:walkability_barrier",
      inputId: "show-survey-walkability-barrier-toggle",
      defaultChecked: false,
      snapshotVisibility: true,
    },
    {
      layerId: "survey:crossing_hazard",
      inputId: "show-survey-crossing-hazard-toggle",
      defaultChecked: false,
      snapshotVisibility: true,
    },
    {
      layerId: "survey:loved_place",
      inputId: "show-survey-loved-place-toggle",
      defaultChecked: false,
      snapshotVisibility: true,
    },
    {
      layerId: "survey:community_anchor",
      inputId: "show-survey-community-anchor-toggle",
      defaultChecked: false,
      snapshotVisibility: true,
    },
  ];

  var SURVEY_CATEGORY_ROWS = [
    {
      id: "walkability_barrier",
      layerId: "survey:walkability_barrier",
      inputId: "show-survey-walkability-barrier-toggle",
    },
    {
      id: "crossing_hazard",
      layerId: "survey:crossing_hazard",
      inputId: "show-survey-crossing-hazard-toggle",
    },
    {
      id: "loved_place",
      layerId: "survey:loved_place",
      inputId: "show-survey-loved-place-toggle",
    },
    {
      id: "community_anchor",
      layerId: "survey:community_anchor",
      inputId: "show-survey-community-anchor-toggle",
    },
  ];

  var SURVEY_MASTER_ROW = {
    id: "survey",
    layerId: "survey",
    inputId: "show-survey-toggle",
  };

  var AUXILIARY_LAYER_LABELS = {
    "kids-population": "Pop. Kids",
    socioeconomic: "SES Clusters",
  };

  var AUXILIARY_OVERLAY_ROWS = Object.keys(AUXILIARY_LAYER_LABELS)
    .map(function (layerId) {
      var overlay = OVERLAY_DEFAULTS.find(function (row) {
        return row.layerId === layerId;
      });
      if (!overlay) return null;
      return {
        id: layerId,
        layerId: overlay.layerId,
        inputId: overlay.inputId,
        label: AUXILIARY_LAYER_LABELS[layerId],
        defaultChecked: overlay.defaultChecked,
      };
    })
    .filter(Boolean);

  var MODE_TOGGLE_SVG = {
    house:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    neighborhood:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    citywide:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="6" width="5" height="14"/><rect x="7" y="3" width="5" height="17"/><rect x="13" y="8" width="5" height="12"/><rect x="19" y="5" width="4" height="15"/></svg>',
  };

  var SHOW_EYE_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';

  var HIDE_EYE_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function colorWithAlpha(hexColor, alpha) {
    if (typeof hexColor !== "string" || !hexColor.startsWith("#")) {
      return "rgba(107, 114, 128, " + alpha + ")";
    }
    var hex = hexColor.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map(function (ch) {
          return ch + ch;
        })
        .join("");
    }
    if (hex.length !== 6) {
      return "rgba(107, 114, 128, " + alpha + ")";
    }
    var value = parseInt(hex, 16);
    var r = (value >> 16) & 255;
    var g = (value >> 8) & 255;
    var b = value & 255;
    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
  }

  function getOverlayRowByLayerId(layerId) {
    return (
      OVERLAY_DEFAULTS.find(function (row) {
        return row.layerId === layerId;
      }) || null
    );
  }

  function getAuxiliaryRowByInputId(inputId) {
    return (
      AUXILIARY_OVERLAY_ROWS.find(function (row) {
        return row.inputId === inputId;
      }) || null
    );
  }

  function getSurveyRowByInputId(inputId) {
    return (
      [SURVEY_MASTER_ROW].concat(SURVEY_CATEGORY_ROWS).find(function (row) {
        return row.inputId === inputId;
      }) || null
    );
  }

  function resolveOverlayRowChecked(row, layerVisibility) {
    var layerId = row.layerId || row.id;
    var fallback = !!row.defaultChecked;
    if (layerVisibility && Object.prototype.hasOwnProperty.call(layerVisibility, layerId)) {
      return !!layerVisibility[layerId];
    }
    return fallback;
  }

  function buildOverlayVisibilitySnapshot(readChecked) {
    return OVERLAY_DEFAULTS.reduce(function (acc, row) {
      if (!row.snapshotVisibility) return acc;
      acc[row.layerId] =
        typeof readChecked === "function"
          ? !!readChecked(row.inputId, !!row.defaultChecked, row)
          : !!row.defaultChecked;
      return acc;
    }, {});
  }

  function resolveSurveyVisibility(layerVisibility) {
    var visibility = layerVisibility || {};
    var categories = SURVEY_CATEGORY_ROWS.reduce(function (result, row) {
      result[row.id] = window.Urban95RenderState
        ? window.Urban95RenderState.isLayerVisible(visibility, row.layerId, false)
        : visibility[row.layerId] === true;
      return result;
    }, {});
    var anyCategoryEnabled = SURVEY_CATEGORY_ROWS.some(function (row) {
      return !!categories[row.id];
    });
    var allCategoriesEnabled =
      SURVEY_CATEGORY_ROWS.length > 0 &&
      SURVEY_CATEGORY_ROWS.every(function (row) {
        return !!categories[row.id];
      });
    return {
      enabled: window.Urban95RenderState
        ? window.Urban95RenderState.isLayerVisible(visibility, "survey", false)
        : visibility.survey === true,
      categories: categories,
      anyCategoryEnabled: anyCategoryEnabled,
      allCategoriesEnabled: allCategoriesEnabled,
    };
  }

  function renderModeSectionShell() {
    return (
      '<section id="scale-section" class="control-section">' +
      '<div class="section-title">Scale</div>' +
      '<div class="mode-toggle" id="mode-toggle">' +
      '<button class="mode-opt active" data-mode="house" type="button">' +
      MODE_TOGGLE_SVG.house +
      "<span>Building</span></button>" +
      '<button class="mode-opt" data-mode="neighborhood" type="button">' +
      MODE_TOGGLE_SVG.neighborhood +
      "<span>Neighborhood</span></button>" +
      '<button class="mode-opt" data-mode="citywide" type="button">' +
      MODE_TOGGLE_SVG.citywide +
      "<span>City</span></button>" +
      "</div></section>"
    );
  }

  function renderScoreModeSectionShell() {
    return (
      '<section id="score-type-section" class="control-section">' +
      '<div class="section-title">Score Type</div>' +
      '<div class="metric-options segmented-options" id="score-model-toggle" role="radiogroup" aria-label="Building score">' +
      '<label class="radio-option"><input type="radio" name="score-model" value="weighted" checked /><span>Urban95</span></label>' +
      '<label class="radio-option"><input type="radio" name="score-model" value="expanded" /><span>Amenities Focus</span></label>' +
      "</div></section>"
    );
  }

  function renderWalkFilterSectionShell() {
    return (
      '<section id="walk-filter-section" class="control-section" hidden>' +
      '<div id="amenity-filter-section" class="walk-filter-block">' +
      '<div class="subsection-title">Filter</div>' +
      '<div class="filter-dropdown">' +
      '<button id="filter-btn" class="filter-btn" type="button">' +
      '<span class="filter-btn-label-wrap">' +
      '<span class="filter-label-prefix">Filter:</span>' +
      '<span id="filter-label">All types</span>' +
      "</span>" +
      '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M2 4l4 4 4-4"/></svg>' +
      "</button>" +
      '<div id="filter-popup" class="filter-popup">' +
      '<div id="filter-items"></div>' +
      "</div></div></div>" +
      '<div id="radius-section" class="walk-filter-block">' +
      '<div class="subsection-title">Walking Time</div>' +
      '<div class="radius-toggle" id="radius-toggle">' +
      '<button class="radius-opt active" data-minutes="5" type="button">5 min</button>' +
      '<button class="radius-opt" data-minutes="10" type="button">10 min</button>' +
      '<button class="radius-opt" data-minutes="15" type="button">15 min</button>' +
      "</div>" +
      '<div class="hint" id="mode-hint">Click map to analyze nearest building</div>' +
      "</div></section>"
    );
  }

  function renderIndicatorColumnTitlesMarkup() {
    var viewTitle = "Show companion map layers";
    var heatTitle = "Color the map by this indicator score";
    return (
      '<div class="indicator-actions-cols indicator-actions-cols--titles" aria-hidden="true">' +
      '<span class="indicator-action-title indicator-action-title--view" title="' +
      escapeHtml(viewTitle) +
      '">View</span>' +
      '<span class="indicator-action-title indicator-action-title--heat" title="' +
      escapeHtml(heatTitle) +
      '">Heatmap</span>' +
      "</div>"
    );
  }

  function renderIndicatorsSectionShell() {
    return (
      '<section id="indicators-section" class="control-section">' +
      '<div id="indicators-weighted-block" class="indicators-weighted-block" hidden>' +
      '<div class="indicators-section-head">' +
      '<div class="section-title">Indicators</div>' +
      renderIndicatorColumnTitlesMarkup() +
      "</div></div>" +
      '<div id="indicators-list" class="indicators-tree" role="tree" aria-label="Urban95 indicators"></div>' +
      "</section>"
    );
  }

  function renderBasemapSectionShell() {
    return (
      '<section id="display-section" class="control-section">' +
      '<div class="section-title">Display</div>' +
      '<div class="metric-options segmented-options" id="basemap-toggle" role="radiogroup" aria-label="Basemap">' +
      '<label class="radio-option"><input type="radio" name="basemap" value="street" checked /><span>Streets</span></label>' +
      '<label class="radio-option"><input type="radio" name="basemap" value="satellite" /><span>Satellite</span></label>' +
      "</div></section>"
    );
  }

  function renderSidebarSkeletonHtml() {
    return (
      renderModeSectionShell() +
      renderScoreModeSectionShell() +
      renderWalkFilterSectionShell() +
      renderIndicatorsSectionShell() +
      renderBasemapSectionShell()
    );
  }

  function buildIndicatorRowsFromMetricDefinitions(scoreModel) {
    var registry = scoreModel.buildWeightedMetricRegistry();
    var categories = scoreModel.WEIGHTED_CATEGORY_COMPONENTS || [];
    var subcats = scoreModel.WEIGHTED_SUBCATEGORY_COMPONENTS || {};
    var rows = [];

    rows.push({
      depth: 0,
      metricId: "u95.overall",
      label: registry["u95.overall"] ? registry["u95.overall"].label : "All",
      kind: "overall",
    });

    categories.forEach(function (category) {
      var categoryId = "u95.cat." + category.stem;
      rows.push({
        depth: 0,
        metricId: categoryId,
        label: category.label,
        kind: "category",
        color: category.color,
        stem: category.stem,
      });
      (subcats[category.stem] || []).forEach(function (sub) {
        rows.push({
          depth: 1,
          metricId: "u95.sub." + category.stem + "." + sub.stem,
          label: sub.label,
          kind: "subcategory",
          parentStem: category.stem,
          stem: sub.stem,
        });
      });
    });

    return rows;
  }

  function getAuxiliaryRows() {
    return AUXILIARY_OVERLAY_ROWS.map(function (row) {
      return Object.assign({ kind: "auxiliary", depth: 0 }, row);
    });
  }

  function forEachOverlayInputId(callback) {
    OVERLAY_DEFAULTS.forEach(function (row) {
      if (row.inputId) callback(row.inputId);
    });
  }

  function buildFilterRowMarkup(value, color, label) {
    var pillStyle =
      "--pill-color:" +
      color +
      ";" +
      "--pill-bg:" +
      colorWithAlpha(color, 0.14) +
      ";" +
      "--pill-border:" +
      colorWithAlpha(color, 0.35) +
      ";" +
      "--row-accent:" +
      color +
      ";" +
      "--row-accent-soft:" +
      colorWithAlpha(color, 0.1) +
      ";" +
      "--row-accent-strong:" +
      colorWithAlpha(color, 0.45) +
      ";";
    return (
      '<input type="radio" name="amenity-filter-only" value="' +
      value +
      '" />' +
      '<span class="filter-type-pill" style="' +
      pillStyle +
      '">' +
      label +
      "</span>"
    );
  }

  function renderIndicatorRow(options) {
    var row = options.row;
    var depthClass = row.depth > 0 ? " indicator-row--sub" : "";
    var kindClass = row.kind ? " indicator-row--" + row.kind : "";
    var showDisabled = !!options.showDisabled;
    var showActive = !!options.showActive;
    var heatActive = !!options.heatActive;
    var hideHeat = !!options.hideHeat;
    var showTitle = options.showTitle || "Show companion map layers";
    var heatTitle = options.heatTitle || "Color the map by this indicator score";
    var showAriaPressed = showActive ? "true" : "false";
    var heatAriaPressed = heatActive ? "true" : "false";
    var collapseMarkup = "";
    var iconsRenderer = options.iconsRenderer;
    var iconMarkup = options.leadingIconMarkup || row.leadingIconMarkup || "";
    var labelStyle = "";
    var heatMarkup = "";

    if (iconMarkup) {
      if (row.kind === "subcategory") {
        labelStyle = ' style="color:' + palette.slate + ';"';
      }
    } else if (iconsRenderer) {
      if (row.kind === "category" && row.stem) {
        iconMarkup = iconsRenderer.renderIcon(iconsRenderer.getCategoryIcon(row.stem), row.color);
      } else if (row.kind === "subcategory" && row.stem) {
        iconMarkup = iconsRenderer.renderIcon(
          iconsRenderer.getSubcategoryIcon(row.stem),
          iconsRenderer.ICON_NEUTRAL
        );
        labelStyle = ' style="color:' + palette.slate + ';"';
      }
    }

    if (row.kind === "category") {
      var expanded = !!options.expanded;
      collapseMarkup =
        '<button type="button" class="indicator-collapse-btn' +
        (expanded ? " is-expanded" : "") +
        '" data-action="collapse" aria-expanded="' +
        (expanded ? "true" : "false") +
        '" aria-label="' +
        escapeHtml((expanded ? "Collapse" : "Expand") + " " + row.label) +
        '">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>' +
        "</button>";
    }

    if (!hideHeat) {
      heatMarkup =
        '<button type="button" class="indicator-btn indicator-heat-btn indicator-btn--icon-only' +
        (heatActive ? " is-active" : "") +
        '" data-action="heat" title="' +
        escapeHtml(heatTitle) +
        '" aria-pressed="' +
        heatAriaPressed +
        '" aria-label="' +
        escapeHtml((heatActive ? "Hide" : "Show") + " heatmap for " + row.label) +
        '">' +
        '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">' +
        '<rect x="0.75" y="0.75" width="14.5" height="14.5" rx="3.25" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '<g stroke="currentColor" stroke-width="0.55">' +
        '<rect x="2" y="2" width="2.85" height="2.85" rx="0.35" fill="#fef6ab"/>' +
        '<rect x="5.05" y="2" width="2.85" height="2.85" rx="0.35" fill="#f27c7c"/>' +
        '<rect x="8.1" y="2" width="2.85" height="2.85" rx="0.35" fill="#fef6ab"/>' +
        '<rect x="11.15" y="2" width="2.85" height="2.85" rx="0.35" fill="#9fd1a1"/>' +
        '<rect x="2" y="5.05" width="2.85" height="2.85" rx="0.35" fill="#f49172"/>' +
        '<rect x="5.05" y="5.05" width="2.85" height="2.85" rx="0.35" fill="#fbb97f"/>' +
        '<rect x="8.1" y="5.05" width="2.85" height="2.85" rx="0.35" fill="#fef6ab"/>' +
        '<rect x="11.15" y="5.05" width="2.85" height="2.85" rx="0.35" fill="#60bd91"/>' +
        '<rect x="2" y="8.1" width="2.85" height="2.85" rx="0.35" fill="#f27c7c"/>' +
        '<rect x="5.05" y="8.1" width="2.85" height="2.85" rx="0.35" fill="#f49172"/>' +
        '<rect x="8.1" y="8.1" width="2.85" height="2.85" rx="0.35" fill="#9fd1a1"/>' +
        '<rect x="11.15" y="8.1" width="2.85" height="2.85" rx="0.35" fill="#60bd91"/>' +
        '<rect x="2" y="11.15" width="2.85" height="2.85" rx="0.35" fill="#f27c7c"/>' +
        '<rect x="5.05" y="11.15" width="2.85" height="2.85" rx="0.35" fill="#f27c7c"/>' +
        '<rect x="8.1" y="11.15" width="2.85" height="2.85" rx="0.35" fill="#fbb97f"/>' +
        '<rect x="11.15" y="11.15" width="2.85" height="2.85" rx="0.35" fill="#9fd1a1"/>' +
        "</g></svg>" +
        "</button>";
    } else {
      // Keep the View column aligned with other indicator rows.
      heatMarkup = '<span class="indicator-heat-spacer" aria-hidden="true"></span>';
    }

    return (
      '<div class="indicator-row' +
      depthClass +
      kindClass +
      '" data-metric-id="' +
      escapeHtml(row.metricId) +
      '"' +
      (row.parentStem ? ' data-parent-stem="' + escapeHtml(row.parentStem) + '"' : "") +
      (row.stem ? ' data-category-stem="' + escapeHtml(row.stem) + '"' : "") +
      ' role="treeitem"' +
      ">" +
      '<span class="indicator-label-wrap">' +
      collapseMarkup +
      iconMarkup +
      '<span class="indicator-label"' +
      labelStyle +
      ">" +
      escapeHtml(row.label) +
      "</span></span>" +
      '<span class="indicator-actions">' +
      '<span class="indicator-actions-cols">' +
      '<button type="button" class="indicator-btn indicator-show-btn' +
      (showDisabled ? " is-disabled" : "") +
      (showActive ? " is-active" : "") +
      '" data-action="show" title="' +
      escapeHtml(showTitle) +
      '"' +
      (showDisabled ? " disabled" : "") +
      ' aria-pressed="' +
      showAriaPressed +
      '" aria-label="' +
      escapeHtml((showActive ? "Hide" : "Show") + " layers for " + row.label) +
      '">' +
      (showActive ? SHOW_EYE_SVG : HIDE_EYE_SVG) +
      "</button>" +
      heatMarkup +
      "</span></span></div>"
    );
  }

  function renderIndicatorCategoryGroup(options) {
    var categoryRow = options.categoryRow;
    var subRows = options.subRows || [];
    var expanded = !!options.expanded;
    var hideHeat = !!options.hideHeat;
    var heatTitle = options.heatTitle || "Color the map by this indicator score";
    var defaultShowTitle = options.defaultShowTitle || "Show companion map layers";
    var categoryHtml = renderIndicatorRow({
      row: categoryRow,
      expanded: expanded,
      showDisabled: options.showDisabled,
      showActive: options.showActive,
      showTitle: options.showTitle,
      heatTitle: heatTitle,
      heatActive: options.heatActive,
      hideHeat: hideHeat,
      iconsRenderer: options.iconsRenderer,
      leadingIconMarkup: categoryRow.leadingIconMarkup,
    });
    var subHtml = subRows
      .map(function (sub) {
        var showResolution = options.resolveShow(sub.metricId);
        return renderIndicatorRow({
          row: sub,
          expanded: false,
          showDisabled: !showResolution.supported,
          showActive: options.isShowEnabled(sub.metricId),
          showTitle: showResolution.supported ? defaultShowTitle : showResolution.reason,
          heatTitle: heatTitle,
          heatActive: !!options.activeHeatmapId && options.activeHeatmapId === sub.metricId,
          hideHeat: hideHeat,
          iconsRenderer: options.iconsRenderer,
          leadingIconMarkup: sub.leadingIconMarkup,
        });
      })
      .join("");
    var footerHtml = options.footerHtml || "";
    var extraGroupClass = options.extraGroupClass ? " " + options.extraGroupClass : "";

    return (
      '<div class="indicator-group' +
      extraGroupClass +
      '" data-category-stem="' +
      escapeHtml(categoryRow.stem) +
      '">' +
      categoryHtml +
      '<div class="indicator-subs' +
      (expanded ? " is-open" : "") +
      '">' +
      '<div class="indicator-subs-inner">' +
      subHtml +
      footerHtml +
      "</div></div></div>"
    );
  }

  function renderIndicatorsTreeMarkup(options) {
    var rows = buildIndicatorRowsFromMetricDefinitions(options.scoreModel);
    var expandedStems = options.expandedStems || new Set();
    var activeHeatmapId = options.activeHeatmapId;
    var iconsRenderer = options.iconsRenderer;
    var resolveShow = options.resolveShow;
    var isShowEnabled = options.isShowEnabled;
    var heatTitle = "Color the map by this indicator score";
    var parts = [];
    var index = 0;

    while (index < rows.length) {
      var row = rows[index];
      if (row.kind === "overall") {
        var overallShow = resolveShow(row.metricId);
        parts.push(
          renderIndicatorRow({
            row: row,
            expanded: false,
            showDisabled: !overallShow.supported,
            showActive: isShowEnabled(row.metricId),
            showTitle: overallShow.supported
              ? "Show companion map layers"
              : overallShow.reason,
            heatTitle: heatTitle,
            heatActive: !!activeHeatmapId && activeHeatmapId === row.metricId,
            iconsRenderer: iconsRenderer,
          })
        );
        index += 1;
        continue;
      }

      if (row.kind === "category") {
        var categoryStem = row.stem;
        var subRows = [];
        index += 1;
        while (
          index < rows.length &&
          rows[index].kind === "subcategory" &&
          rows[index].parentStem === categoryStem
        ) {
          subRows.push(rows[index]);
          index += 1;
        }
        var categoryShow = resolveShow(row.metricId);
        parts.push(
          renderIndicatorCategoryGroup({
            categoryRow: row,
            subRows: subRows,
            expanded: expandedStems.has(categoryStem),
            showDisabled: !categoryShow.supported,
            showActive: isShowEnabled(row.metricId),
            showTitle: categoryShow.supported
              ? "Show companion map layers"
              : categoryShow.reason,
            heatTitle: heatTitle,
            heatActive: !!activeHeatmapId && activeHeatmapId === row.metricId,
            activeHeatmapId: activeHeatmapId,
            iconsRenderer: iconsRenderer,
            resolveShow: resolveShow,
            isShowEnabled: isShowEnabled,
          })
        );
        continue;
      }

      index += 1;
    }

    if (!parts.length) return "";
    return parts.join("");
  }

  function renderAuxiliarySegmentedRow(rows, layerVisibility) {
    if (!rows || !rows.length) return "";
    var options = rows
      .map(function (row) {
        var checked = resolveOverlayRowChecked(row, layerVisibility) ? " checked" : "";
        return (
          '<label class="segment-option">' +
          '<input type="checkbox" id="' +
          row.inputId +
          '"' +
          checked +
          " />" +
          "<span>" +
          escapeHtml(row.label) +
          "</span></label>"
        );
      })
      .join("");
    return (
      '<div class="indicator-row indicator-row--aux" data-overlay-segmented="demographics">' +
      '<div class="metric-options segmented-options" role="group" aria-label="Demographic overlays">' +
      options +
      "</div></div>"
    );
  }

  function renderSurveyCategorySwatch(category) {
    var shape = (category && category.shape) || "circle";
    var color = (category && category.color) || palette.gray;
    return (
      '<span class="survey-category-swatch" data-shape="' +
      escapeHtml(shape) +
      '" style="--survey-category-color:' +
      escapeHtml(color) +
      '">' +
      (shape === "heart" ? "♥" : "") +
      "</span>"
    );
  }

  function getSurveyRowByMetricId(metricId) {
    if (metricId === "survey") return SURVEY_MASTER_ROW;
    if (typeof metricId !== "string" || metricId.indexOf("survey.") !== 0) return null;
    var categoryId = metricId.slice("survey.".length);
    return (
      SURVEY_CATEGORY_ROWS.find(function (row) {
        return row.id === categoryId;
      }) || null
    );
  }

  function isSurveyMetricId(metricId) {
    return metricId === "survey" || (typeof metricId === "string" && metricId.indexOf("survey.") === 0);
  }

  function renderSurveyOverlayGroup(
    layerVisibility,
    surveyCategories,
    surveyAvailable,
    expanded,
    iconsRenderer
  ) {
    var visibility = resolveSurveyVisibility(layerVisibility);
    var categories = surveyCategories || {};
    var unavailable = surveyAvailable === false;
    var categoryColor = (categories.community_anchor || {}).color || palette.sky;
    var categoryRow = {
      depth: 0,
      metricId: "survey",
      label: "Community observations",
      kind: "category",
      stem: "survey",
      leadingIconMarkup: iconsRenderer
        ? iconsRenderer.renderIcon(iconsRenderer.getSubcategoryIcon("community"), categoryColor)
        : "",
    };
    var subRows = SURVEY_CATEGORY_ROWS.map(function (row) {
      var category = categories[row.id] || {};
      return {
        depth: 1,
        metricId: "survey." + row.id,
        label: category.label || row.id,
        kind: "subcategory",
        parentStem: "survey",
        stem: row.id,
        leadingIconMarkup: renderSurveyCategorySwatch(category),
      };
    });

    function resolveShow(_metricId) {
      if (unavailable) {
        return { supported: false, reason: "Community observations unavailable" };
      }
      return { supported: true, reason: "" };
    }

    function isShowEnabled(metricId) {
      // Unavailable survey must never render as pressed/active (a11y).
      if (unavailable) return false;
      if (metricId === "survey") return visibility.allCategoriesEnabled;
      var row = getSurveyRowByMetricId(metricId);
      if (!row) return false;
      return !!visibility.categories[row.id];
    }

    return renderIndicatorCategoryGroup({
      categoryRow: categoryRow,
      subRows: subRows,
      expanded: !!expanded,
      showDisabled: unavailable,
      showActive: unavailable ? false : visibility.allCategoriesEnabled,
      showTitle: unavailable
        ? "Community observations unavailable"
        : "Show companion map layers",
      defaultShowTitle: "Show companion map layers",
      heatActive: false,
      hideHeat: true,
      activeHeatmapId: null,
      resolveShow: resolveShow,
      isShowEnabled: isShowEnabled,
      extraGroupClass: "indicator-group--survey" + (unavailable ? " is-unavailable" : ""),
      footerHtml:
        '<div class="survey-overlay-scope">' +
        (unavailable
          ? "Community observations unavailable"
          : "Mapped responses from Ramot and Neve Ze’ev") +
        "</div>",
    });
  }

  function renderKidsPopulationLegendHtml(maxKids) {
    var max = Number.isFinite(maxKids) && maxKids > 0 ? maxKids : 1;
    var labels = [0, 0.25, 0.5, 0.75, 1]
      .map(function (fraction) {
        return "<span>" + Math.round(max * fraction) + "</span>";
      })
      .join("");

    return (
      '<div class="legend-block">' +
      '<div class="legend-title">Pop. Kids</div>' +
      '<div class="legend-subtitle">Ages 0\u20139 \u00b7 200 m grid cell</div>' +
      '<div class="legend-gradient legend-gradient--kids-population"></div>' +
      '<div class="legend-labels">' +
      labels +
      "</div></div>"
    );
  }

  function renderCompanionLegendHtml(spec) {
    if (!spec) return "";

    var axisGroups = Array.isArray(spec.axisGroups) ? spec.axisGroups : [];
    var axisGroupsHtml = axisGroups.length
      ? '<div class="legend-axis-groups">' +
          axisGroups
            .map(function (group) {
              var start = Number(group.start);
              var end = Number(group.end);
              var span = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
              var basis = span > 0 ? span * 100 : 0;
              var bucketName = String(group.bucketName || "");
              var hoverLabel = bucketName
                ? String(group.label || "") + " " + bucketName
                : String(group.label || "");
              return (
                '<span class="legend-axis-group" style="flex-basis:' +
                basis +
                '%" title="' +
                escapeHtml(hoverLabel) +
                '" aria-label="' +
                escapeHtml(hoverLabel) +
                '">' +
                escapeHtml(String(group.label || "")) +
                (bucketName
                  ? '<span class="legend-axis-tooltip" role="presentation">' +
                    escapeHtml(bucketName) +
                    "</span>"
                  : "") +
                "</span>"
              );
            })
            .join("") +
        "</div>"
      : "";
    var labels = Array.isArray(spec.labels) && spec.labels.length
      ? spec.labels
          .map(function (label) {
            return "<span>" + escapeHtml(String(label)) + "</span>";
          })
          .join("")
      : "";
    var itemsHtml = Array.isArray(spec.items) && spec.items.length
      ? '<div class="legend-items">' +
          spec.items
            .map(function (item) {
              return '<span class="legend-item-chip">' + escapeHtml(String(item)) + "</span>";
            })
            .join("") +
        "</div>"
      : "";

    var gradientStyle = spec.gradientStyle || "";

    return (
      '<div class="legend-block">' +
      '<div class="legend-title">' +
      escapeHtml(spec.title || "") +
      "</div>" +
      '<div class="legend-subtitle">' +
      escapeHtml(spec.subtitle || "") +
      "</div>" +
      '<div class="legend-gradient"' +
      (gradientStyle ? ' style="' + gradientStyle + '"' : "") +
      "></div>" +
      itemsHtml +
      (axisGroupsHtml || '<div class="legend-labels">' + labels + "</div>") +
      "</div>"
    );
  }

  function renderScoreLegendHtml(metric) {
    if (!metric) {
      return '<div class="legend-block"><div class="legend-empty">No heatmap active</div></div>';
    }

    var legendSpec = metric.legendSpec || {};
    var title = legendSpec.title || metric.label;
    var subtitle =
      legendSpec.subtitle ||
      (metric.scale === "percentile"
        ? "Amenities Focus \u00b7 percentile rank"
        : "Urban95 \u00b7 weighted score (0-100)");
    var labels = Array.isArray(legendSpec.labels) && legendSpec.labels.length
      ? legendSpec.labels
      : ["0", "25", "50", "75", "100"];
    var labelsHtml = labels
      .map(function (label) {
        return "<span>" + escapeHtml(String(label)) + "</span>";
      })
      .join("");

    return (
      '<div class="legend-block">' +
      '<div class="legend-title">' +
      escapeHtml(title) +
      "</div>" +
      '<div class="legend-subtitle">' +
      escapeHtml(subtitle) +
      "</div>" +
      '<div class="legend-gradient"></div>' +
      '<div id="legend-labels" class="legend-labels">' +
      labelsHtml +
      "</div>" +
      "</div>"
    );
  }
  function renderLegendHtml(metric, kidsLegend, companionLegendHtml) {
    var parts = [];
    if (kidsLegend && kidsLegend.visible) {
      parts.push(renderKidsPopulationLegendHtml(kidsLegend.maxKids));
    }
    if (companionLegendHtml) {
      parts.push(companionLegendHtml);
    }
    parts.push(renderScoreLegendHtml(metric));
    return parts.join("");
  }

  window.Urban95ControlSidebarMarkup = {
    OVERLAY_DEFAULTS: OVERLAY_DEFAULTS,
    AUXILIARY_OVERLAY_ROWS: AUXILIARY_OVERLAY_ROWS,
    SURVEY_CATEGORY_ROWS: SURVEY_CATEGORY_ROWS,
    SURVEY_MASTER_ROW: SURVEY_MASTER_ROW,
    escapeHtml: escapeHtml,
    getOverlayRowByLayerId: getOverlayRowByLayerId,
    getAuxiliaryRowByInputId: getAuxiliaryRowByInputId,
    getSurveyRowByInputId: getSurveyRowByInputId,
    getSurveyRowByMetricId: getSurveyRowByMetricId,
    isSurveyMetricId: isSurveyMetricId,
    resolveOverlayRowChecked: resolveOverlayRowChecked,
    resolveSurveyVisibility: resolveSurveyVisibility,
    buildOverlayVisibilitySnapshot: buildOverlayVisibilitySnapshot,
    forEachOverlayInputId: forEachOverlayInputId,
    renderSidebarSkeletonHtml: renderSidebarSkeletonHtml,
    buildIndicatorRowsFromMetricDefinitions: buildIndicatorRowsFromMetricDefinitions,
    getAuxiliaryRows: getAuxiliaryRows,
    buildFilterRowMarkup: buildFilterRowMarkup,
    renderIndicatorRow: renderIndicatorRow,
    renderIndicatorCategoryGroup: renderIndicatorCategoryGroup,
    renderIndicatorsTreeMarkup: renderIndicatorsTreeMarkup,
    renderAuxiliarySegmentedRow: renderAuxiliarySegmentedRow,
    renderSurveyOverlayGroup: renderSurveyOverlayGroup,
    renderLegendHtml: renderLegendHtml,
    renderCompanionLegendHtml: renderCompanionLegendHtml,
  };
})();
