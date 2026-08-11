(function () {
  var palette = window.Urban95Palette;
  if (!palette) {
    throw new Error("Urban95ScoreSidebar requires Urban95Palette (load js/core/palette.js first)");
  }

  var deps = null;
  var sidebarChrome = null;
  var scoreExplainFitRaf = 0;

  var REQUIRED_DEPENDENCY_TYPES = {
    getScoreMode: "function",
    getSelectedAmenityTypes: "function",
    getAllFilterTypes: "function",
    getSelectedBuilding: "function",
    buildExplainScoreBreakdown: "function",
    buildPercentileMetrics: "function",
    getScoreModeLabel: "function",
    getScoreMinutes: "function",
    escapeHtml: "function",
    renderHorizonLabelCell: "function",
    renderHorizonSubLabelCell: "function",
    getWeightedCategoryIcon: "function",
    getWeightedSubcategoryIcon: "function",
    getScoreExplainRowIcon: "function",
    getScoreExplainPartialFilterSet: "function",
    isScoreExplainCategoryFilterHighlighted: "function",
    isScoreExplainRowFilterHighlighted: "function",
    formatScoreExplainRowValue: "function",
    horizonBarFillStyle: "function",
    horizonSubBarFillStyle: "function",
    explainRankBarColor: "function",
    heroPercentileMeterFillStyle: "function",
    getOrdinalSuffix: "function",
    formatMetricNumber: "function",
    formatScoreInteger: "function",
    buildBuildingDemographicContext: "function",
    setSidebarPadding: "function",
    restoreFocusAfterHide: "function",
    referenceRadiusMeters: "number",
    scoreExplainIconNeutral: "string",
    sidebarEl: "object",
    bodyEl: "object",
    emptyEl: "object",
    heroEl: "object",
    noteEl: "object",
    buildingContextEl: "object",
    buildingContextIdEl: "object",
    buildingContextCoordsEl: "object",
    closeButtonEl: "object",
    backdropEl: "object",
  };

  var SCORE_EXPLAIN_CONTENT_DESIGN = {
    bar: 34,
    subBar: 24,
    rowPad: 0.55,
    subRowPad: 0.28,
    font: 1,
    icon: 20,
    subIcon: 17,
    groupGap: 0,
    subsGap: 0.25,
    labelCol: "10.75rem",
  };

  function configure(nextDeps) {
    deps = validateDeps(nextDeps || null);
    sidebarChrome = Urban95SidebarChromeBindings.create({
      sidebarEl: deps.sidebarEl,
      backdropEl: deps.backdropEl,
      closeButtonEl: deps.closeButtonEl,
      bodyEl: deps.bodyEl,
      bodyOpenClass: "score-explain-open",
      onClose: function () {
        hideScoreExplainSidebar();
      },
      setSidebarPadding: deps.setSidebarPadding,
      getSidebarWidth: getSidebarWidth,
      restoreFocusAfterHide: deps.restoreFocusAfterHide,
      onResizeWhileOpen: scheduleFitScoreExplainSidebar,
    });
    sidebarChrome.bindGlobalHandlers();
  }

  function validateDeps(nextDeps) {
    if (!nextDeps) {
      throw new Error("Urban95ScoreSidebar.configure missing required dependency: deps object");
    }
    var missing = [];
    Object.keys(REQUIRED_DEPENDENCY_TYPES).forEach(function (key) {
      var expectedType = REQUIRED_DEPENDENCY_TYPES[key];
      var value = nextDeps[key];
      var valid = false;
      if (expectedType === "object") {
        valid = !!value;
      } else if (expectedType === "number") {
        valid = Number.isFinite(value);
      } else {
        valid = typeof value === expectedType;
      }
      if (!valid) {
        missing.push(key + " (" + expectedType + ")");
      }
    });
    if (missing.length > 0) {
      throw new Error(
        "Urban95ScoreSidebar.configure missing required dependency: " + missing.join(", ")
      );
    }
    return nextDeps;
  }

  function requireDeps() {
    if (!deps) {
      throw new Error("Urban95ScoreSidebar.configure must be called before sidebar functions");
    }
    return deps;
  }

  function perfSpan(name, meta, callback) {
    var perf = window.urban95Perf;
    if (perf && typeof perf.span === "function") return perf.span(name, meta, callback);
    return callback();
  }

  function perfMark(name, meta) {
    var perf = window.urban95Perf;
    if (perf && typeof perf.mark === "function") {
      perf.mark(name, meta);
    }
  }

  function getSelectedAmenityTypes(d) {
    if (!d) d = requireDeps();
    return typeof d.getSelectedAmenityTypes === "function" ? d.getSelectedAmenityTypes() : null;
  }

  function getSidebarWidth() {
    var d = requireDeps();
    if (!d.sidebarEl || typeof d.sidebarEl.getBoundingClientRect !== "function") return 400;
    return d.sidebarEl.getBoundingClientRect().width || 400;
  }

  function formatDemographicKidsCount(value) {
    if (!Number.isFinite(value)) return null;
    return Math.round(value);
  }

  function renderBuildingDemographicContextNote(context) {
    var d = requireDeps();
    if (!context || (!context.population && !context.socioeconomic)) return "";

    var chips = [];
    if (context.socioeconomic && context.socioeconomic.cluster != null) {
      chips.push(
        '<div class="demo-chip">' +
        '<span class="demo-chip-label">SES cluster</span>' +
        '<span class="demo-chip-value">' +
        d.escapeHtml(String(context.socioeconomic.cluster)) +
        "</span>" +
        '<span class="demo-chip-meta">census tract</span>' +
        "</div>"
      );
    }

    if (context.population) {
      var kids0to4 = formatDemographicKidsCount(context.population.kids0to4);
      var kids5to9 = formatDemographicKidsCount(context.population.kids5to9);
      if (kids0to4 != null || kids5to9 != null) {
        var ageCols = "";
        if (kids0to4 != null) {
          ageCols +=
            '<div class="demo-chip-age">' +
            '<span class="demo-chip-label">Ages 0\u20134</span>' +
            '<span class="demo-chip-value">' +
            d.escapeHtml(String(kids0to4)) +
            "</span></div>";
        }
        if (kids0to4 != null && kids5to9 != null) {
          ageCols += '<span class="demo-chip-divider" aria-hidden="true"></span>';
        }
        if (kids5to9 != null) {
          ageCols +=
            '<div class="demo-chip-age">' +
            '<span class="demo-chip-label">Ages 5\u20139</span>' +
            '<span class="demo-chip-value">' +
            d.escapeHtml(String(kids5to9)) +
            "</span></div>";
        }
        chips.push(
          '<div class="demo-chip demo-chip--ages">' +
          '<div class="demo-chip-ages">' +
          ageCols +
          "</div>" +
          '<span class="demo-chip-foot">200 m \u00d7 200 m grid cell</span>' +
          "</div>"
        );
      }
    }
    if (!chips.length) return "";

    return (
      '<div class="score-explain-demographics">' +
      '<p class="score-explain-demographics-kicker">Demographics</p>' +
      '<div class="score-explain-demographics-row">' +
      chips.join("") +
      "</div></div>"
    );
  }

  function renderUrban95ReferenceRadiusNote() {
    var d = requireDeps();
    return (
      '<div class="score-explain-radius-note"><span class="score-explain-radius-note-label">Reference radius</span>' +
      "<span>Urban95 uses a fixed " +
      d.referenceRadiusMeters +
      " m reference circle for most checks; trees use 20 m, shelters use 50 m.</span></div>"
    );
  }

  function renderWeightedEvidenceRows(rawEvidence) {
    var d = requireDeps();
    var html = "";
    (rawEvidence || []).forEach(function (evidence) {
      html += '<div class="urban95-status-evidence"><span>' + d.escapeHtml(evidence.label) +
        '</span><strong>' + d.escapeHtml(String(evidence.value)) +
        (evidence.unit ? " " + d.escapeHtml(evidence.unit) : "") + "</strong></div>";
    });
    return html;
  }

  function statusToken(status) {
    var token = status && status.token ? String(status.token) : "unknown";
    return /^(disappointing|functioning|thriving)$/.test(token) ? token : "unknown";
  }

  function renderStatusSignal(status, compact) {
    var d = requireDeps();
    var token = statusToken(status);
    var label = status && status.label ? status.label : "Unknown";
    var classes = "status-signal " + (compact ? "status-signal--row" : "status-signal--hero");
    var html = '<span class="urban95-status-readout urban95-status-readout--' + token +
      '" aria-label="Status: ' + d.escapeHtml(label) + '">';
    html += '<span class="' + classes + '" aria-hidden="true">';
    ["disappointing", "functioning", "thriving"].forEach(function (lamp) {
      html += '<i class="status-signal-lamp status-signal-lamp--' + lamp +
        (token === lamp ? " is-active" : "") + '"></i>';
    });
    html += '</span><span class="urban95-status-readout-label' +
      (token === "unknown" ? " is-unknown" : "") + '">' + d.escapeHtml(label) + "</span></span>";
    return html;
  }

  function renderStatusTag(status) {
    var d = requireDeps();
    var token = statusToken(status);
    var label = status && status.label ? status.label : "Unknown";
    return '<span class="urban95-status-tag urban95-status-tag--' + d.escapeHtml(token) +
      '"><span class="status-signal status-signal--row" aria-hidden="true">' +
      ["disappointing", "functioning", "thriving"].map(function (lamp) {
        return '<i class="status-signal-lamp status-signal-lamp--' + lamp +
          (token === lamp ? " is-active" : "") + '"></i>';
      }).join("") + '</span><span class="urban95-status-tag-label">' +
      d.escapeHtml(label) + "</span></span>";
  }

  function shadeInterpretation(rawEvidence) {
    var evidence = (rawEvidence || []).find(function (item) {
      return item && /summer.*si/i.test(String(item.label || ""));
    });
    var value = evidence ? Number(evidence.value) : NaN;
    if (!Number.isFinite(value)) return null;
    if (value < 0.1) return "Severe lack of shade";
    if (value < 0.2) return "Significant lack of shade";
    if (value < 0.4) return "Needs improvement";
    if (value < 0.6) return "Good shade";
    return "Excellent shade";
  }

  function renderShadeScale(rawEvidence) {
    var d = requireDeps();
    var evidence = (rawEvidence || []).find(function (item) {
      return item && /summer.*si/i.test(String(item.label || ""));
    });
    var value = evidence ? Number(evidence.value) : NaN;
    if (!Number.isFinite(value)) return renderWeightedEvidenceRows(rawEvidence);
    var clamped = Math.max(0, Math.min(1, value));
    var bucket = shadeInterpretation(rawEvidence) || "Unknown";
    var segments = [
      [10, "#e81014", "0.0", "Severe lack"],
      [10, "#fb9d3b", "0.1", "Significant lack"],
      [20, "#fafa64", "0.2–0.3", "Needs improvement"],
      [20, "#7da788", "0.4–0.5", "Good shade"],
      [40, "#388393", "0.6–1.0", "Excellent shade"],
    ];
    var html = '<div class="urban95-shade-scale" aria-label="Rounded summer SI ' +
      d.escapeHtml(String(value)) + ", " + d.escapeHtml(bucket) + '">';
    html += '<div class="urban95-shade-scale-head"><span>Official SI interpretation</span><strong>' +
      d.escapeHtml(bucket) + ' <small>SI ' + d.escapeHtml(String(value)) + "</small></strong></div>";
    html += '<div class="urban95-shade-scale-track" aria-hidden="true">';
    segments.forEach(function (segment) {
      html += '<i style="width:' + segment[0] + '%;background:' + segment[1] + '"></i>';
    });
    html += '<b class="urban95-shade-scale-pointer" style="left:' + d.escapeHtml(String(clamped * 100)) + '%"></b></div>';
    html += '<div class="urban95-shade-scale-labels" aria-hidden="true">';
    segments.forEach(function (segment) {
      html += '<span style="width:' + segment[0] + '%" title="' + d.escapeHtml(segment[3]) + '">' +
        d.escapeHtml(segment[2]) + "</span>";
    });
    return html + "</div></div>";
  }

  function renderWeightedSubrowDetails(subrow, activeMetric) {
    var d = requireDeps();
    var subActive = activeMetric && activeMetric.selectedWeightedSubStem === subrow.stem;
    var details = subrow.details || [];
    function isDetailActive(detail) {
      return activeMetric && activeMetric.kind === "diagnostic-access" &&
        (activeMetric.selectedWeightedDetailStem
          ? activeMetric.selectedWeightedDetailStem === detail.stem
          : activeMetric.label === detail.label);
    }
    var rowHtml = '<div class="urban95-status-row urban95-status-indicator' +
      (subActive ? " is-active-status-row" : "") + '" data-status-subrow="' +
      d.escapeHtml(subrow.stem || "") + '"><span class="urban95-status-row-name">' +
      d.renderHorizonLabelCell(subrow.label, d.getWeightedSubcategoryIcon(subrow.stem), "", null, {
        iconColor: d.scoreExplainIconNeutral, colorLabelText: false,
      }) + '</span>' + renderStatusTag(subrow.status) + "</div>";
    var evidenceHtml = subrow.stem === "shade"
      ? renderShadeScale(subrow.rawEvidence)
      : renderWeightedEvidenceRows(subrow.rawEvidence);
    if (!details.length) return rowHtml + evidenceHtml;

    var nestedOpen = subActive || details.some(isDetailActive);
    var html = '<details class="urban95-status-subcategory-disclosure"' +
      (nestedOpen ? " open" : "") + '><summary aria-label="' +
      d.escapeHtml(subrow.label + " inner indicators") + '">' + rowHtml +
      '</summary><div class="urban95-status-diagnostic-list">' + evidenceHtml;
    details.forEach(function (detail) {
      var detailActive = isDetailActive(detail);
      html += '<div class="urban95-status-row urban95-status-diagnostic' +
        (detailActive ? " is-active-status-row" : "") + '" data-status-detail="' +
        d.escapeHtml(detail.stem || "") + '"><span class="urban95-status-diagnostic-name"><i aria-hidden="true"></i><span>' +
        d.escapeHtml(detail.label) + '</span></span>' + renderStatusTag(detail.status) + "</div>";
      html += renderWeightedEvidenceRows(detail.rawEvidence);
    });
    return html + "</div></details>";
  }

  function renderScoreExplainSidebarWeighted(breakdown, demographicContext) {
    var d = requireDeps();
    var metric = typeof d.getActiveMetric === "function" ? d.getActiveMetric() : null;
    var categories = breakdown.weightedCategories || [];
    var isOverview = !metric || metric.kind === "weighted-overall";
    var status = breakdown.overallStatus || { label: "Unknown", color: "#9ca3af" };
    if (!isOverview) {
      if (breakdown.activeStatus) status = breakdown.activeStatus;
      var selected = categories.find(function (category) {
        return category.stem === metric.selectedWeightedStem;
      });
      if (metric.kind === "weighted-category" && selected) status = selected.status;
      if (metric.kind === "weighted-subcategory" && selected) {
        var sub = (selected.subrows || []).find(function (row) {
          return row.stem === metric.selectedWeightedSubStem;
        });
        if (sub) status = sub.status;
      }
    }
    var html = '<div class="urban95-status-detail">';
    categories.forEach(function (category) {
        var categoryActive = !isOverview && metric &&
          (category.stem === metric.selectedWeightedStem || category.stem === metric.parentStem);
        var categoryHighlighted = categoryActive || d.isScoreExplainCategoryFilterHighlighted(category);
        var disclosureLabel = category.label + " indicator details";
        html += '<details class="urban95-status-category-disclosure' +
          (categoryHighlighted ? " is-filter-highlight" : "") +
          (!isOverview && !categoryActive ? " is-filter-muted" : "") + '"' +
          (categoryActive ? " open" : "") + ' data-status-category="' +
          d.escapeHtml(category.stem || "") + '" style="--category-color:' +
          d.escapeHtml(category.color || palette.accent) + '">';
        html += '<summary aria-label="' + d.escapeHtml(disclosureLabel) + '"><span class="urban95-category-heading">' +
          d.renderHorizonLabelCell(category.label, d.getWeightedCategoryIcon(category.stem), "", category.color) +
          '</span>' + renderStatusTag(category.status) + "</summary>";
        html += '<div class="urban95-status-category-disclosure-body urban95-status-rows">';
        (category.subrows || []).forEach(function (subrow) {
          html += renderWeightedSubrowDetails(subrow, metric);
        });
        html += "</div></details>";
      });
    html += "</div>";
    html += renderBuildingDemographicContextNote(demographicContext);
    html += renderUrban95ReferenceRadiusNote();
    return html;
  }

  function renderScoreExplainSidebarExpanded(rows, demographicContext) {
    var d = requireDeps();
    if (!rows || rows.length === 0) return "";

    var sections = [];
    var cur = null;
    rows.forEach(function (row) {
      if (row.sectionTitle) {
        cur = { title: row.sectionTitle, rows: [] };
        sections.push(cur);
      } else if (cur) {
        cur.rows.push(row);
      }
    });

    var partialFilter = d.getScoreExplainPartialFilterSet();
    var html =
      '<div class="horizon-chart horizon-chart-expanded' +
      (partialFilter ? " score-explain-chart-partial-filter" : "") +
      '">';
    sections.forEach(function (sec) {
      var maxVal = sec.rows.reduce(function (m, r) {
        var v = Number(r.value);
        if (!Number.isFinite(v)) return m;
        return v > m ? v : m;
      }, 0);

      html += '<h3 class="score-explain-section-h">' + d.escapeHtml(sec.title || "") + "</h3>";

      sec.rows.forEach(function (row) {
        var pct = row.percentile;
        var barW = 0;
        if (pct != null) {
          barW = Math.min(100, Math.max(0, Number(pct) || 0));
        } else {
          var v = Number(row.value) || 0;
          barW = maxVal > 0 ? Math.min(100, Math.max(0, (v / maxVal) * 100)) : 0;
        }
        var barColor = pct != null ? d.explainRankBarColor(pct) : palette.accent;

        var highlighted = d.isScoreExplainRowFilterHighlighted(row);
        html += '<div class="horizon-group' + (highlighted ? " is-filter-highlight" : "") + '">';
        html += '<div class="horizon-row" tabindex="-1">';
        html += d.renderHorizonLabelCell(row.label, d.getScoreExplainRowIcon(row), "", null, {
          iconColor: d.scoreExplainIconNeutral,
          colorLabelText: false,
        });
        html +=
          '<div class="horizon-bar-container" aria-hidden="true"><div class="horizon-bar-fill" style="' +
          d.horizonBarFillStyle(barColor, barW) +
          '"></div></div>';
        html += '<span class="horizon-score">' + d.escapeHtml(d.formatScoreExplainRowValue(row)) + "</span></div>";
        html += "</div>";
      });
    });
    html += "</div>";
    html += renderBuildingDemographicContextNote(demographicContext);
    return html;
  }

  function getScoreExplainHeroLabel() {
    var d = requireDeps();
    if (d.getScoreMode() === "weighted") {
      var metric = typeof d.getActiveMetric === "function" ? d.getActiveMetric() : null;
      if (!metric || metric.kind === "weighted-overall") return "Urban95";
      return metric.label ? metric.label + " status" : "Urban95";
    }
    return "Citywide percentile";
  }

  function populateScoreExplainBuildingContext() {
    var d = requireDeps();
    var selectedBuilding = d.getSelectedBuilding();
    var buildingCtxEl = d.buildingContextEl;
    var idEl = d.buildingContextIdEl;
    var coordsEl = d.buildingContextCoordsEl;
    if (!buildingCtxEl || !idEl) return;

    if (!selectedBuilding || !selectedBuilding.feature) {
      buildingCtxEl.hidden = true;
      idEl.textContent = "";
      if (coordsEl) {
        coordsEl.textContent = "";
        coordsEl.hidden = true;
      }
      return;
    }

    var props = selectedBuilding.feature.properties || {};
    var bid = props.building_id;
    idEl.textContent = "Building #" + (bid != null ? String(bid) : "?");

    if (coordsEl && selectedBuilding.lat != null && selectedBuilding.lng != null) {
      coordsEl.textContent =
        Number(selectedBuilding.lat).toFixed(5) + ", " + Number(selectedBuilding.lng).toFixed(5);
      coordsEl.hidden = false;
    } else if (coordsEl) {
      coordsEl.textContent = "";
      coordsEl.hidden = true;
    }

    buildingCtxEl.hidden = false;
  }

  function populateScoreExplainSidebarHeader(breakdown, metrics) {
    var d = requireDeps();
    var heroEl = d.heroEl;
    var noteEl = d.noteEl;
    var weightedMode = d.getScoreMode() === "weighted";

    populateScoreExplainBuildingContext();

    if (!heroEl || !noteEl) return;

    if (!breakdown && !metrics) {
      heroEl.innerHTML = "";
      noteEl.innerHTML = "";
      return;
    }

    if (weightedMode) {
      var activeMetric = typeof d.getActiveMetric === "function" ? d.getActiveMetric() : null;
      var isOverview = !activeMetric || activeMetric.kind === "weighted-overall";
      var status = breakdown && !isOverview && breakdown.activeStatus
        ? breakdown.activeStatus
        : breakdown && breakdown.overallStatus
          ? breakdown.overallStatus
        : { label: "Unknown", color: "#9ca3af" };
      var heroHtml = '<div class="percentile-summary score-explain-sidebar-hero-compact">';
      heroHtml +=
        '<p class="score-explain-hero-kicker">' + d.escapeHtml(getScoreExplainHeroLabel()) + "</p>";
      heroHtml += '<div class="urban95-status-hero">' + renderStatusSignal(status, false) + "</div>";
      heroHtml += "</div>";
      heroEl.innerHTML = heroHtml;
      noteEl.innerHTML = "";
      return;
    }

    var op = null;
    if (metrics && metrics.overallPercentile != null) op = metrics.overallPercentile;
    if (op == null && breakdown && breakdown.overallPercentile != null) op = breakdown.overallPercentile;

    var expandedHeroHtml = '<div class="percentile-summary score-explain-sidebar-hero-compact">';
    expandedHeroHtml += '<p class="score-explain-hero-kicker">' + d.escapeHtml(getScoreExplainHeroLabel()) + "</p>";
    if (op != null) {
      expandedHeroHtml +=
        '<div class="percentile-value">' +
        d.escapeHtml(String(op)) +
        "<span>" +
        d.escapeHtml(d.getOrdinalSuffix(op)) +
        "</span><em>percentile</em></div>";
      expandedHeroHtml +=
        '<div class="percentile-meter" aria-hidden="true"><div class="percentile-meter-fill" style="' +
        d.heroPercentileMeterFillStyle(op) +
        '"></div></div>';
    } else {
      expandedHeroHtml += '<div class="percentile-value">-</div>';
      expandedHeroHtml +=
        '<div class="percentile-meter" aria-hidden="true"><div class="percentile-meter-fill" style="' +
        d.heroPercentileMeterFillStyle(0) +
        '"></div></div>';
    }
    expandedHeroHtml += "</div>";
    heroEl.innerHTML = expandedHeroHtml;
    noteEl.textContent = "";
  }

  function renderScoreExplainSidebarFormula(breakdown) {
    var d = requireDeps();
    if (breakdown && breakdown.formulaLine) {
      return (
        '<div class="score-explain-hero-note score-explain-formula-bottom score-explain-formula-card"><p>' +
        d.escapeHtml(breakdown.formulaLine) +
        "</p></div>"
      );
    }
    return "";
  }

  function getActiveMetricForMethodologyNote() {
    var d = requireDeps();
    if (typeof d.getActiveMetric !== "function") return false;
    return d.getActiveMetric();
  }

  function renderMetricMethodologyNote() {
    var d = requireDeps();
    var metric = getActiveMetricForMethodologyNote();
    var note = metric && typeof metric.explainNote === "string" ? metric.explainNote : "";
    if (!note) return "";
    return (
      '<p class="score-explain-shade-note">' +
      d.escapeHtml(note) +
      "</p>"
    );
  }

  function renderScoreExplainSidebar(breakdown, metrics, ctx) {
    void metrics;
    var d = requireDeps();
    var demographicContext = ctx && ctx.demographicContext ? ctx.demographicContext : null;
    var unavailable = d.getScoreMode() === "weighted"
      ? '<p class="score-explain-empty">Status details are unavailable for the current selection.</p>'
      : '<p class="score-explain-empty">Score breakdown is unavailable for the current selection.</p>';

    if (d.getScoreMode() === "weighted") {
      if (!breakdown || !Array.isArray(breakdown.weightedCategories) || breakdown.weightedCategories.length === 0) {
        return unavailable;
      }
      return (
        renderScoreExplainSidebarWeighted(breakdown, demographicContext) +
        renderScoreExplainSidebarFormula(breakdown)
      );
    }

    if (!breakdown || !Array.isArray(breakdown.rows) || breakdown.rows.length === 0) {
      return unavailable;
    }
    return (
      renderScoreExplainSidebarExpanded(breakdown.rows, demographicContext) +
      renderScoreExplainSidebarFormula(breakdown)
    );
  }

  function resetScoreExplainSidebarFit(body, inner) {
    if (body) {
      body.classList.remove("is-content-scaled", "is-chart-roomy");
      body.style.removeProperty("max-height");
      body.style.removeProperty("--sidebar-content-scale");
      body.style.removeProperty("--sidebar-content-bar-h");
      body.style.removeProperty("--sidebar-content-sub-bar-h");
      body.style.removeProperty("--sidebar-content-row-pad");
      body.style.removeProperty("--sidebar-content-sub-row-pad");
      body.style.removeProperty("--sidebar-content-font");
      body.style.removeProperty("--sidebar-content-icon");
      body.style.removeProperty("--sidebar-content-sub-icon");
      body.style.removeProperty("--sidebar-content-group-gap");
      body.style.removeProperty("--sidebar-content-subs-gap");
      body.style.removeProperty("--sidebar-fit-label-col");
      body.style.removeProperty("--sidebar-note-pad");
      body.style.removeProperty("--sidebar-note-font");
      body.style.removeProperty("--sidebar-note-gap");
    }
    if (inner) {
      inner.classList.remove("is-chart-fit-tight");
    }
  }

  function applyScoreExplainContentScale(body, inner, scale) {
    var s = Math.min(1, Math.max(0.34, scale));
    var textScale = Math.max(0.74, s);
    var d = SCORE_EXPLAIN_CONTENT_DESIGN;
    body.style.setProperty("--sidebar-content-scale", String(s));
    body.style.setProperty("--sidebar-content-bar-h", Math.max(14, Math.round(d.bar * s)) + "px");
    body.style.setProperty("--sidebar-content-sub-bar-h", Math.max(10, Math.round(d.subBar * s)) + "px");
    body.style.setProperty("--sidebar-content-row-pad", Math.max(0.12, d.rowPad * s) + "rem");
    body.style.setProperty("--sidebar-content-sub-row-pad", Math.max(0.08, d.subRowPad * s) + "rem");
    body.style.setProperty("--sidebar-content-font", String(textScale));
    body.style.setProperty("--sidebar-content-icon", Math.max(14, Math.round(d.icon * s)) + "px");
    body.style.setProperty("--sidebar-content-sub-icon", Math.max(12, Math.round(d.subIcon * s)) + "px");
    body.style.setProperty("--sidebar-content-group-gap", Math.max(0, Math.round(d.groupGap + 3 * s)) + "px");
    body.style.setProperty("--sidebar-content-subs-gap", Math.max(0.08, d.subsGap * s) + "rem");
    body.style.setProperty("--sidebar-note-pad", Math.max(6, Math.round(11 * s)) + "px");
    body.style.setProperty("--sidebar-note-font", Math.max(10.5, 12.5 * s) + "px");
    body.style.setProperty("--sidebar-note-gap", Math.max(6, Math.round(12 * s)) + "px");
    if (s < 1) {
      var labelRem = parseFloat(d.labelCol);
      body.style.setProperty("--sidebar-fit-label-col", Math.max(8.5, labelRem * s) + "rem");
    } else {
      body.style.removeProperty("--sidebar-fit-label-col");
    }
    body.classList.toggle("is-content-scaled", s < 1);
    inner.classList.toggle("is-chart-fit-tight", s < 0.9);
  }

  function outerBlockHeight(el) {
    if (!el) return 0;
    var style = getComputedStyle(el);
    return (
      el.scrollHeight +
      parseFloat(style.marginTop || "0") +
      parseFloat(style.marginBottom || "0")
    );
  }

  function fitScoreExplainSidebarToViewport() {
    var d = requireDeps();
    return perfSpan("scoreSidebar:fitToViewport", null, function () {
    var sidebar = d.sidebarEl;
    var inner = sidebar ? sidebar.querySelector(".score-explain-sidebar-inner") : null;
    var header = sidebar ? sidebar.querySelector(".score-explain-sidebar-header") : null;
    var body = d.bodyEl;
    if (!sidebar || !inner || !header || !body || !sidebar.classList.contains("is-open")) return;

    resetScoreExplainSidebarFit(body, inner);

    function availableBodyHeight() {
      var emptyEl = d.emptyEl;
      var reserved = header.offsetHeight;
      if (emptyEl && !emptyEl.hidden) reserved += emptyEl.offsetHeight;
      var bodyStyle = getComputedStyle(body);
      reserved += parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
      return Math.max(80, inner.clientHeight - reserved);
    }

    var available = availableBodyHeight();
    body.style.maxHeight = available + "px";

    var chart = body.querySelector(".horizon-chart");
    if (!chart) return;

    function contentHeight() {
      var total = chart.scrollHeight;
      Array.prototype.forEach.call(body.children, function (child) {
        if (child !== chart) total += outerBlockHeight(child);
      });
      return total;
    }

    var needed = contentHeight();
    body.classList.toggle("is-chart-roomy", needed < available * 0.92);

    if (needed <= available) return;

    var scale = (available / needed) * 0.98;
    applyScoreExplainContentScale(body, inner, scale);
    available = availableBodyHeight();
    body.style.maxHeight = available + "px";

    needed = contentHeight();
    if (needed > available) {
      scale = scale * (available / needed) * 0.98;
      applyScoreExplainContentScale(body, inner, scale);
      available = availableBodyHeight();
      body.style.maxHeight = available + "px";
    }

    body.classList.toggle("is-chart-roomy", contentHeight() < available * 0.92);
    });
  }

  function scheduleFitScoreExplainSidebar() {
    cancelAnimationFrame(scoreExplainFitRaf);
    scoreExplainFitRaf = requestAnimationFrame(function () {
      scoreExplainFitRaf = requestAnimationFrame(fitScoreExplainSidebarToViewport);
    });
  }

  function bindScoreExplainSidebarInteractions(root) {
    if (!root || root.getAttribute("data-score-explain-bound") === "1") return;
    root.setAttribute("data-score-explain-bound", "1");
    root.addEventListener("click", function (e) {
      var row = e.target.closest('.horizon-row[role="button"]');
      if (!row || !root.contains(row)) return;
      var group = row.closest(".horizon-group");
      var subs = group ? group.querySelector(".horizon-subs") : null;
      if (!subs) return;
      var open = subs.classList.toggle("is-open");
      row.classList.toggle("is-expanded", open);
      row.setAttribute("aria-expanded", open ? "true" : "false");
      scheduleFitScoreExplainSidebar();
    });
    root.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var row = e.target.closest('.horizon-row[role="button"]');
      if (!row || !root.contains(row)) return;
      e.preventDefault();
      row.click();
    });
  }

  function isScoreExplainSidebarOpen() {
    if (sidebarChrome) return sidebarChrome.isOpen();
    var el = deps && deps.sidebarEl ? deps.sidebarEl : null;
    return !!(el && el.classList.contains("is-open"));
  }

  function showScoreExplainSidebar() {
    requireDeps();
    return perfSpan("scoreSidebar:show", null, function () {
      if (!sidebarChrome) return;
      sidebarChrome.open();
      scheduleFitScoreExplainSidebar();
    });
  }

  function hideScoreExplainSidebar(options) {
    if (!isScoreExplainSidebarOpen()) return;
    if (!sidebarChrome) return;
    sidebarChrome.close(options);
  }

  function syncScoreExplainSidebar() {
    var d = requireDeps();
    return perfSpan("scoreSidebar:sync", function () {
      return {
        scoreMode: d.getScoreMode(),
        hasSelectedBuilding: !!d.getSelectedBuilding(),
        selectedAmenityTypes: getSelectedAmenityTypes(d) ? getSelectedAmenityTypes(d).size : "",
      };
    }, function () {
    var selectedBuilding = d.getSelectedBuilding();
    var selectedAmenityTypes = getSelectedAmenityTypes(d);
    var root = d.bodyEl;
    var emptyEl = d.emptyEl;
    if (!root) return;

    if (!selectedBuilding || !selectedBuilding.feature) {
      hideScoreExplainSidebar();
      return;
    }

    var demographicContext = null;
    if (selectedBuilding.lng != null && selectedBuilding.lat != null) {
      demographicContext = d.buildBuildingDemographicContext(selectedBuilding.lng, selectedBuilding.lat);
    }
    var demographicHtml = renderBuildingDemographicContextNote(demographicContext);

    if (
      d.getScoreMode() === "expanded" &&
      selectedAmenityTypes &&
      selectedAmenityTypes.size === 0
    ) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = "Select amenity types in the filter to see a score breakdown.";
      }
      root.innerHTML = demographicHtml;
      populateScoreExplainSidebarHeader(null, null);
      showScoreExplainSidebar();
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    var props = selectedBuilding.feature.properties || {};
    var breakdown = perfSpan("scoreSidebar:buildBreakdown", null, function () {
      return d.buildExplainScoreBreakdown(props);
    });
    var metrics = perfSpan("scoreSidebar:buildMetrics", null, function () {
      return d.buildPercentileMetrics(props);
    });

    if (!breakdown && !metrics) {
      if (emptyEl) {
        emptyEl.hidden = !!demographicHtml;
        emptyEl.textContent = d.getScoreMode() === "weighted"
          ? "Status data unavailable"
          : "Score data unavailable";
      }
      root.innerHTML = demographicHtml;
      populateScoreExplainSidebarHeader(null, null);
      showScoreExplainSidebar();
      return;
    }

    perfSpan("scoreSidebar:renderHtml", function () {
      return {
        scoreMode: d.getScoreMode(),
        hasBreakdown: !!breakdown,
        hasMetrics: !!metrics,
      };
    }, function () {
      populateScoreExplainSidebarHeader(breakdown, metrics);
      root.innerHTML = renderScoreExplainSidebar(breakdown, metrics, {
        building: selectedBuilding,
        demographicContext: demographicContext,
        scoreKind: d.getScoreModeLabel(),
        minutes: d.getScoreMinutes(),
      });
    });
    bindScoreExplainSidebarInteractions(root);
    showScoreExplainSidebar();
    scheduleFitScoreExplainSidebar();
    });
  }

  function showScoreExplainSidebarShell(building, options) {
    return perfSpan("scoreSidebar:showShell", null, function () {
      var d = requireDeps();
      var opts = options || {};
      var root = d.bodyEl;
      var emptyEl = d.emptyEl;
      var buildingId =
        building && building.feature && building.feature.properties
          ? building.feature.properties.building_id
          : building && building.properties
            ? building.properties.building_id
            : null;
      var sidebarWasOpen = isScoreExplainSidebarOpen();
      var hasExistingDetail = !!(root && root.innerHTML);
      var preserveExistingDetail =
        opts.preserveExistingDetail === true &&
        sidebarWasOpen &&
        hasExistingDetail;
      var shellMeta = function (extra) {
        return Object.assign({
          buildingId: buildingId,
          scoreMode: d.getScoreMode(),
          sidebarWasOpen: sidebarWasOpen,
          hasExistingDetail: hasExistingDetail,
          reason: opts.reason || "",
          requested: opts.preserveExistingDetail === true,
          preserved: preserveExistingDetail,
        }, extra || {});
      };
      if (!preserveExistingDetail) {
        perfMark("scoreSidebar:showShell:loadingVisible", function () {
          return shellMeta({ visible: true });
        });
      }
      if (!sidebarWasOpen || !hasExistingDetail) {
        perfMark("scoreSidebar:showShell:firstOpenLoading", function () {
          return shellMeta({ visible: !preserveExistingDetail });
        });
      }
      perfMark("scoreSidebar:showShell:preserveExistingDetail", function () {
        return shellMeta();
      });
      if (!preserveExistingDetail && root) {
        root.innerHTML = "";
      }
      if (emptyEl) {
        emptyEl.hidden = preserveExistingDetail;
        emptyEl.textContent = preserveExistingDetail ? "" : "Loading status details...";
      }
      if (!preserveExistingDetail) {
        populateScoreExplainSidebarHeader(null, null);
      }
      showScoreExplainSidebar();
    });
  }

  window.Urban95ScoreSidebar = {
    configure: configure,
    render: renderScoreExplainSidebar,
    show: showScoreExplainSidebar,
    showShell: showScoreExplainSidebarShell,
    hide: hideScoreExplainSidebar,
    sync: syncScoreExplainSidebar,
    isOpen: isScoreExplainSidebarOpen,
  };
})();
