(function () {
  var deps = null;
  var globalBindingsAttached = false;
  var scoreExplainFitRaf = 0;
  var previousFocusedElement = null;

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
    bindGlobalSidebarChrome();
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

  function getSelectedAmenityTypes(d) {
    if (!d) d = requireDeps();
    return typeof d.getSelectedAmenityTypes === "function" ? d.getSelectedAmenityTypes() : null;
  }

  function getSidebarWidth() {
    var d = requireDeps();
    if (!d.sidebarEl || typeof d.sidebarEl.getBoundingClientRect !== "function") return 400;
    return d.sidebarEl.getBoundingClientRect().width || 400;
  }

  function captureSidebarFocusOrigin(sidebarEl) {
    var activeEl = document.activeElement;
    if (
      activeEl &&
      activeEl !== document.body &&
      activeEl !== sidebarEl &&
      (!sidebarEl || typeof sidebarEl.contains !== "function" || !sidebarEl.contains(activeEl))
    ) {
      previousFocusedElement = activeEl;
      return;
    }
    previousFocusedElement = null;
  }

  function renderUrban95ReferenceRadiusNote() {
    var d = requireDeps();
    return (
      '<div class="score-explain-radius-note"><span class="score-explain-radius-note-label">Reference radius</span>' +
      "<span>Urban95 uses a fixed " +
      d.referenceRadiusMeters +
      " m reference circle for most checks; trees and bike access use 20 m, shelters use 50 m.</span></div>"
    );
  }

  function renderScoreExplainSidebarWeighted(categories) {
    var d = requireDeps();
    var partialFilter = d.getScoreExplainPartialFilterSet();
    var html =
      '<div class="horizon-chart' + (partialFilter ? " score-explain-chart-partial-filter" : "") + '">';
    categories.forEach(function (cat, idx) {
      var pct = Math.min(100, Math.max(0, Number(cat.value) || 0));
      var color = cat.color || "#2563eb";
      var highlighted = d.isScoreExplainCategoryFilterHighlighted(cat);
      html += '<div class="horizon-group' + (highlighted ? " is-filter-highlight" : "") + '" data-cat-idx="' + idx + '"';
      if (highlighted) {
        html += ' style="--filter-highlight-color:' + d.escapeHtml(color) + '"';
      }
      html += ">";
      html += '<div class="horizon-row" tabindex="0" role="button" aria-expanded="false">';
      html +=
        d.renderHorizonLabelCell(cat.label, d.getWeightedCategoryIcon(cat.stem), "", color);
      html +=
        '<div class="horizon-bar-container" aria-hidden="true"><div class="horizon-bar-fill" style="' +
        d.horizonBarFillStyle(color, pct) +
        '"></div></div>';
      html +=
        '<span class="horizon-score-cell"><span class="horizon-score">' +
        d.escapeHtml(d.formatScoreInteger(Number(cat.value) || 0)) +
        '</span><span class="horizon-score-weight">&times;' +
        d.escapeHtml((cat.weight * 100).toFixed(0)) +
        "%</span></span></div>";
      html += '<div class="horizon-subs"><div class="horizon-subs-inner">';
      var subrows = cat.subrows || [];
      subrows.forEach(function (sub, subIdx) {
        var sv = sub.value != null ? Math.min(100, Math.max(0, Number(sub.value) || 0)) : 0;
        html += '<div class="horizon-sub-row">';
        html += d.renderHorizonSubLabelCell(sub.label, d.getWeightedSubcategoryIcon(sub.stem), null);
        html +=
          '<div class="horizon-sub-bar-container" aria-hidden="true"><div class="horizon-sub-bar-fill" style="' +
          d.horizonSubBarFillStyle(color, sv, subIdx, subrows.length) +
          '"></div></div>';
        html +=
          '<span class="horizon-score">' +
          d.escapeHtml(sub.value != null ? d.formatScoreInteger(sv) : "-") +
          "</span></div>";
      });
      html += "</div></div></div>";
    });
    html += "</div>";
    html += renderUrban95ReferenceRadiusNote();
    return html;
  }

  function renderScoreExplainSidebarExpanded(rows) {
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
        var barColor = pct != null ? d.explainRankBarColor(pct) : "#2563eb";

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
    return html;
  }

  function getScoreExplainHeroLabel() {
    var d = requireDeps();
    if (d.getScoreMode() === "weighted") return d.getScoreModeLabel() + " score";
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
      var scoreVal = null;
      if (metrics && metrics.overallScore != null) scoreVal = Number(metrics.overallScore);
      if ((scoreVal == null || !Number.isFinite(scoreVal)) && breakdown && breakdown.overallScoreLabel != null) {
        scoreVal = Number(String(breakdown.overallScoreLabel).replace(/,/g, ""));
      }
      if (!Number.isFinite(scoreVal)) scoreVal = 0;
      scoreVal = Math.min(100, Math.max(0, scoreVal));
      var heroHtml = '<div class="percentile-summary score-explain-sidebar-hero-compact">';
      heroHtml +=
        '<p class="score-explain-hero-kicker">' + d.escapeHtml(getScoreExplainHeroLabel()) + "</p>";
      heroHtml +=
        '<div class="percentile-value">' +
        d.escapeHtml(d.formatScoreInteger(scoreVal)) +
        "<em>/100</em></div>";
      heroHtml +=
        '<div class="percentile-meter" aria-hidden="true"><div class="percentile-meter-fill" style="' +
        d.heroPercentileMeterFillStyle(scoreVal) +
        '"></div></div>';
      heroHtml += "</div>";
      heroEl.innerHTML = heroHtml;

      if (breakdown && breakdown.formulaLine) {
        noteEl.innerHTML =
          '<details class="score-explain-formula-fold"><summary>Urban95 equation</summary><p>' +
          d.escapeHtml(breakdown.formulaLine) +
          "</p></details>";
      } else {
        noteEl.innerHTML = "";
      }
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

    if (breakdown && breakdown.formulaLine) {
      noteEl.innerHTML = "<p>" + d.escapeHtml(breakdown.formulaLine) + "</p>";
    } else {
      noteEl.textContent = "";
    }
  }

  function renderScoreExplainSidebar(breakdown, metrics, ctx) {
    void metrics;
    void ctx;
    var d = requireDeps();
    var unavailable =
      '<p class="score-explain-empty">Score breakdown is unavailable for the current selection.</p>';

    if (d.getScoreMode() === "weighted") {
      if (!breakdown || !Array.isArray(breakdown.weightedCategories) || breakdown.weightedCategories.length === 0) {
        return unavailable;
      }
      return renderScoreExplainSidebarWeighted(breakdown.weightedCategories);
    }

    if (!breakdown || !Array.isArray(breakdown.rows) || breakdown.rows.length === 0) {
      return unavailable;
    }
    return renderScoreExplainSidebarExpanded(breakdown.rows);
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
    }
    if (inner) {
      inner.classList.remove("is-chart-fit-tight", "is-chart-fit-ultra");
    }
  }

  function applyScoreExplainContentScale(body, inner, scale) {
    var s = Math.min(1, Math.max(0.48, scale));
    var d = SCORE_EXPLAIN_CONTENT_DESIGN;
    body.style.setProperty("--sidebar-content-scale", String(s));
    body.style.setProperty("--sidebar-content-bar-h", Math.max(14, Math.round(d.bar * s)) + "px");
    body.style.setProperty("--sidebar-content-sub-bar-h", Math.max(10, Math.round(d.subBar * s)) + "px");
    body.style.setProperty("--sidebar-content-row-pad", Math.max(0.12, d.rowPad * s) + "rem");
    body.style.setProperty("--sidebar-content-sub-row-pad", Math.max(0.08, d.subRowPad * s) + "rem");
    body.style.setProperty("--sidebar-content-font", String(s));
    body.style.setProperty("--sidebar-content-icon", Math.max(14, Math.round(d.icon * s)) + "px");
    body.style.setProperty("--sidebar-content-sub-icon", Math.max(12, Math.round(d.subIcon * s)) + "px");
    body.style.setProperty("--sidebar-content-group-gap", Math.max(0, Math.round(d.groupGap + 3 * s)) + "px");
    body.style.setProperty("--sidebar-content-subs-gap", Math.max(0.08, d.subsGap * s) + "rem");
    if (s < 1) {
      var labelRem = parseFloat(d.labelCol);
      body.style.setProperty("--sidebar-fit-label-col", Math.max(8.5, labelRem * s) + "rem");
    } else {
      body.style.removeProperty("--sidebar-fit-label-col");
    }
    body.classList.toggle("is-content-scaled", s < 1);
    inner.classList.toggle("is-chart-fit-tight", s < 0.9);
    inner.classList.toggle("is-chart-fit-ultra", s < 0.76);
  }

  function fitScoreExplainSidebarToViewport() {
    var d = requireDeps();
    var sidebar = d.sidebarEl;
    var inner = sidebar ? sidebar.querySelector(".score-explain-sidebar-inner") : null;
    var header = sidebar ? sidebar.querySelector(".score-explain-sidebar-header") : null;
    var body = d.bodyEl;
    if (!sidebar || !inner || !header || !body || !sidebar.classList.contains("is-open")) return;

    resetScoreExplainSidebarFit(body, inner);

    var emptyEl = d.emptyEl;
    var reserved = header.offsetHeight;
    if (emptyEl && !emptyEl.hidden) reserved += emptyEl.offsetHeight;
    var bodyStyle = getComputedStyle(body);
    reserved += parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);

    var available = Math.max(80, inner.clientHeight - reserved);
    body.style.maxHeight = available + "px";

    var chart = body.querySelector(".horizon-chart");
    if (!chart) return;

    function contentHeight() {
      return body.scrollHeight;
    }

    var needed = contentHeight();
    body.classList.toggle("is-chart-roomy", needed < available * 0.92);

    if (needed <= available) return;

    var scale = (available / needed) * 0.98;
    applyScoreExplainContentScale(body, inner, scale);

    needed = contentHeight();
    if (needed > available) {
      scale = scale * (available / needed) * 0.98;
      applyScoreExplainContentScale(body, inner, scale);
    }

    body.classList.toggle("is-chart-roomy", contentHeight() < available * 0.92);
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
    var el = deps && deps.sidebarEl ? deps.sidebarEl : null;
    return !!(el && el.classList.contains("is-open"));
  }

  function setScoreExplainMapPadding(open) {
    var d = requireDeps();
    if (open) {
      d.setSidebarPadding(true, getSidebarWidth());
      return;
    }
    d.setSidebarPadding(false, 0);
  }

  function syncScoreExplainBackdrop() {
    var d = requireDeps();
    var backdrop = d.backdropEl;
    if (!backdrop) return;
    if (!isScoreExplainSidebarOpen()) {
      backdrop.hidden = true;
      return;
    }
    var isMobile = window.matchMedia("(max-width: 768px)").matches;
    backdrop.hidden = !isMobile;
  }

  function focusMapContainerAfterSidebar() {
    var d = requireDeps();
    var target = previousFocusedElement;
    previousFocusedElement = null;
    if (target && typeof target.focus === "function") {
      try {
        target.focus({ preventScroll: true });
        return;
      } catch (_err) {
        // Fall through to the app-owned fallback when the prior focus target is gone.
      }
    }
    d.restoreFocusAfterHide();
  }

  function showScoreExplainSidebar() {
    var d = requireDeps();
    var el = d.sidebarEl;
    if (!el) return;
    var wasOpen = el.classList.contains("is-open");
    if (!wasOpen) captureSidebarFocusOrigin(el);
    el.classList.add("is-open");
    el.removeAttribute("aria-hidden");
    if (document.body && document.body.classList) {
      document.body.classList.add("score-explain-open");
    }
    setScoreExplainMapPadding(true);
    syncScoreExplainBackdrop();
    scheduleFitScoreExplainSidebar();
    if (!wasOpen && d.closeButtonEl) {
      d.closeButtonEl.focus({ preventScroll: true });
    }
  }

  function hideScoreExplainSidebar(options) {
    var d = requireDeps();
    if (!isScoreExplainSidebarOpen()) return;
    var el = d.sidebarEl;
    var restoreFocus = !options || options.restoreFocus !== false;
    if (!el) return;
    el.classList.remove("is-open");
    el.setAttribute("aria-hidden", "true");
    if (document.body && document.body.classList) {
      document.body.classList.remove("score-explain-open");
    }
    setScoreExplainMapPadding(false);
    syncScoreExplainBackdrop();
    if (restoreFocus) {
      focusMapContainerAfterSidebar();
    } else {
      previousFocusedElement = null;
    }
  }

  function syncScoreExplainSidebar() {
    var d = requireDeps();
    var selectedBuilding = d.getSelectedBuilding();
    var selectedAmenityTypes = getSelectedAmenityTypes(d);
    var root = d.bodyEl;
    var emptyEl = d.emptyEl;
    if (!root) return;

    if (!selectedBuilding || !selectedBuilding.feature) {
      hideScoreExplainSidebar();
      return;
    }
    if (selectedAmenityTypes && selectedAmenityTypes.size === 0) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = "Select amenity types in the filter to see a score breakdown.";
      }
      root.innerHTML = "";
      populateScoreExplainSidebarHeader(null, null);
      showScoreExplainSidebar();
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    var props = selectedBuilding.feature.properties || {};
    var breakdown = d.buildExplainScoreBreakdown(props);
    var metrics = d.buildPercentileMetrics(props);

    if (!breakdown && !metrics) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = "Score data unavailable";
      }
      root.innerHTML = "";
      populateScoreExplainSidebarHeader(null, null);
      showScoreExplainSidebar();
      return;
    }

    populateScoreExplainSidebarHeader(breakdown, metrics);
    root.innerHTML = renderScoreExplainSidebar(breakdown, metrics, {
      building: selectedBuilding,
      scoreKind: d.getScoreModeLabel(),
      minutes: d.getScoreMinutes(),
    });
    bindScoreExplainSidebarInteractions(root);
    showScoreExplainSidebar();
    scheduleFitScoreExplainSidebar();
  }

  function bindGlobalSidebarChrome() {
    if (globalBindingsAttached || !deps) return;
    globalBindingsAttached = true;

    var closeBtn = deps.closeButtonEl;
    var backdrop = deps.backdropEl;
    var body = deps.bodyEl;

    if (closeBtn) closeBtn.addEventListener("click", hideScoreExplainSidebar);
    if (backdrop) backdrop.addEventListener("click", hideScoreExplainSidebar);
    if (body) {
      body.addEventListener(
        "wheel",
        function (e) {
          if (isScoreExplainSidebarOpen()) e.preventDefault();
        },
        { passive: false }
      );
    }
    window.addEventListener("resize", function () {
      if (isScoreExplainSidebarOpen()) {
        setScoreExplainMapPadding(true);
        syncScoreExplainBackdrop();
        scheduleFitScoreExplainSidebar();
      }
    });
  }

  window.Urban95ScoreSidebar = {
    configure: configure,
    render: renderScoreExplainSidebar,
    show: showScoreExplainSidebar,
    hide: hideScoreExplainSidebar,
    sync: syncScoreExplainSidebar,
    isOpen: isScoreExplainSidebarOpen,
    renderScoreExplainSidebarWeighted: renderScoreExplainSidebarWeighted,
    renderScoreExplainSidebarExpanded: renderScoreExplainSidebarExpanded,
    populateScoreExplainBuildingContext: populateScoreExplainBuildingContext,
    populateScoreExplainSidebarHeader: populateScoreExplainSidebarHeader,
    renderScoreExplainSidebar: renderScoreExplainSidebar,
    resetScoreExplainSidebarFit: resetScoreExplainSidebarFit,
    applyScoreExplainContentScale: applyScoreExplainContentScale,
    fitScoreExplainSidebarToViewport: fitScoreExplainSidebarToViewport,
    scheduleFitScoreExplainSidebar: scheduleFitScoreExplainSidebar,
    bindScoreExplainSidebarInteractions: bindScoreExplainSidebarInteractions,
    isScoreExplainSidebarOpen: isScoreExplainSidebarOpen,
    setScoreExplainMapPadding: setScoreExplainMapPadding,
    syncScoreExplainBackdrop: syncScoreExplainBackdrop,
    focusMapContainerAfterSidebar: focusMapContainerAfterSidebar,
    showScoreExplainSidebar: showScoreExplainSidebar,
    hideScoreExplainSidebar: hideScoreExplainSidebar,
    syncScoreExplainSidebar: syncScoreExplainSidebar,
  };
})();
