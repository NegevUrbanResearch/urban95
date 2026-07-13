(function () {
  "use strict";

  var chartInstances = [];
  var renderGeneration = 0;
  var sidebarChrome = null;
  var deps = null;

  var gapMode = Urban95CityGapModes.DEFAULT_MODE;

  var REQUIRED_DEPENDENCY_TYPES = {
    getScoreMode: "function",
    getScoreMinutes: "function",
    getCitySelection: "function",
    setCitySelection: "function",
    loadCitywideStats: "function",
    getCitywideStats: "function",
    getNeighborhoodsData: "function",
    ensureChartJsLoaded: "function",
    requestAnimationFrame: "function",
    setSidebarPadding: "function",
    restoreFocusAfterHide: "function",
    fitBounds: "function",
    bbox: "function",
    onGapStateChanged: "function",
    onSelectionChanged: "function",
    onOpenNeighborhood: "function",
    getNeighborhoodAverageKey: "function",
    bulkPercentileRanks: "function",
    getWeightedNeighborhoodMetricValue: "function",
    hasWeightedNeighborhoodMetricData: "function",
    renderDeps: "object",
    sidebarEl: "object",
    heroEl: "object",
    eyebrowEl: "object",
    metaEl: "object",
    bodyEl: "object",
    emptyEl: "object",
    closeButtonEl: "object",
    backdropEl: "object",
  };

  function validateDeps(nextDeps) {
    if (!nextDeps) {
      throw new Error("Urban95CitySidebar.configure missing required dependency: deps object");
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
        "Urban95CitySidebar.configure missing required dependency: " + missing.join(", ")
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

  function getGapState() {
    var mode = Urban95CityGapModes.normalizeMode(gapMode);
    return {
      mode: mode,
      enabled: mode !== Urban95CityGapModes.MODE_OFF,
    };
  }

  function buildingCountFromEntry(entry) {
    var props = entry && entry.feature && entry.feature.properties;
    var c = Number(props && props.building_count);
    return Number.isFinite(c) && c > 0 ? c : 0;
  }

  function collectEligibleGapNeighborhoods(entries) {
    var eligible = [];
    (entries || []).forEach(function (entry) {
      if (!Number.isFinite(entry.rawAvg)) return;
      if (!Number.isFinite(entry.choroplethValue)) return;
      eligible.push({
        name: entry.name,
        choroplethValue: entry.choroplethValue,
        buildingCount: buildingCountFromEntry(entry),
      });
    });
    return eligible;
  }

  function collectChoroplethCuts(entries) {
    return Urban95CityGapModes.buildGapCuts(collectEligibleGapNeighborhoods(entries));
  }

  function getSelection() {
    if (!deps) return null;
    return deps.getCitySelection();
  }

  function resolveNeighborhoodFeatureByName(name) {
    if (!name || !deps) return null;
    var data = deps.getNeighborhoodsData();
    var features = data && data.features;
    if (!features || !features.length) return null;
    for (var i = 0; i < features.length; i++) {
      var feature = features[i];
      var props = feature && feature.properties;
      if (props && props.Name === name) return feature;
    }
    return null;
  }

  function fitFeatureBounds(feature) {
    if (!deps || !feature || typeof deps.fitBounds !== "function") return;
    var box = deps.bbox(feature);
    if (!box || box.length < 4) return;
    deps.fitBounds(
      [
        [box[0], box[1]],
        [box[2], box[3]],
      ],
      { padding: 40, duration: 600 }
    );
  }

  function meanFinite(values) {
    var sum = 0;
    var count = 0;
    (values || []).forEach(function (value) {
      var n = Number(value);
      if (Number.isFinite(n)) {
        sum += n;
        count += 1;
      }
    });
    if (count === 0) return null;
    return sum / count;
  }

  function formatDisplay(renderCtx, value, unavailableLabel) {
    if (value == null || value === "" || !Number.isFinite(Number(value))) {
      return unavailableLabel != null ? unavailableLabel : "Unavailable";
    }
    if (renderCtx && typeof renderCtx.formatMetricNumber === "function") {
      return renderCtx.formatMetricNumber(value);
    }
    return String(value);
  }

  function metricLabelForMode(renderCtx, isWeighted) {
    if (isWeighted) {
      var metric = renderCtx && typeof renderCtx.getActiveMetric === "function"
        ? renderCtx.getActiveMetric()
        : null;
      if (!metric || metric.kind === "weighted-overall") return "Urban95";
      return metric.label || "Urban95";
    }
    if (renderCtx && typeof renderCtx.getScoreModeLabel === "function") {
      return renderCtx.getScoreModeLabel() || "Amenities Focus";
    }
    return "Amenities Focus";
  }

  function buildChoroplethEntries(sfx, isWeighted, activeMetric) {
    var avgKey = deps.getNeighborhoodAverageKey(sfx);
    var neighborhoodsData = deps.getNeighborhoodsData();
    var feats = (neighborhoodsData && neighborhoodsData.features) || [];
    var entries = [];

    if (!avgKey || feats.length === 0) {
      return { avgKey: avgKey, entries: entries, unavailable: isWeighted };
    }

    if (isWeighted) {
      var sampleProps = (feats[0] && feats[0].properties) || {};
      if (!deps.hasWeightedNeighborhoodMetricData(activeMetric, sampleProps)) {
        return { avgKey: avgKey, entries: entries, unavailable: true };
      }
    }

    var rawAverages = feats.map(function (feature) {
      var props = (feature && feature.properties) || {};
      return Number(props[avgKey]);
    });

    // AF: finite raw avgs only for bulkPercentileRanks (parity with map paint).
    var ranks = null;
    if (!isWeighted) {
      var rankInputs = [];
      var rankFeatIndices = [];
      rawAverages.forEach(function (raw, index) {
        if (!Number.isFinite(raw)) return;
        rankFeatIndices.push(index);
        rankInputs.push(raw);
      });
      var finiteRanks = deps.bulkPercentileRanks(rankInputs);
      ranks = new Array(rawAverages.length);
      rankFeatIndices.forEach(function (featIndex, rankIndex) {
        ranks[featIndex] = finiteRanks[rankIndex];
      });
    }

    feats.forEach(function (feature, index) {
      var props = (feature && feature.properties) || {};
      var name = props.Name || "Unknown";
      var rawAvg = rawAverages[index];
      var choroplethValue;
      if (isWeighted) {
        choroplethValue = Number.isFinite(rawAvg)
          ? Math.max(0, Math.min(100, rawAvg))
          : NaN;
      } else {
        choroplethValue = ranks[index] != null ? ranks[index] : NaN;
      }
      entries.push({
        name: name,
        feature: feature,
        rawAvg: rawAvg,
        choroplethValue: choroplethValue,
        scoreValue: Number.isFinite(rawAvg) ? rawAvg : NaN,
      });
    });

    return { avgKey: avgKey, entries: entries, unavailable: false };
  }

  function buildRankingRows(entries, gap, selectedName, isWeighted, renderCtx) {
    // Same eligibility as countInGap / map city_gap_eligible: finite rawAvg.
    // Missing AF avgs are excluded from bulkPercentileRanks (map + sidebar parity).
    var rows = entries
      .filter(function (entry) {
        return Number.isFinite(entry.rawAvg) && Number.isFinite(entry.choroplethValue);
      })
      .map(function (entry) {
        return {
          name: entry.name,
          choroplethValue: entry.choroplethValue,
          scoreValue: entry.scoreValue,
          isActive: !!(selectedName && entry.name === selectedName),
          valueDisplay: isWeighted
            ? formatDisplay(renderCtx, entry.choroplethValue)
            : String(Math.round(entry.choroplethValue)) + "%",
          secondaryDisplay: isWeighted
            ? null
            : Number.isFinite(entry.scoreValue)
              ? formatDisplay(renderCtx, entry.scoreValue) + " index"
              : null,
          barWidth: entry.choroplethValue,
        };
      });

    rows.sort(function (a, b) {
      if (gap.enabled) {
        return a.choroplethValue - b.choroplethValue;
      }
      return b.choroplethValue - a.choroplethValue;
    });
    return rows;
  }

  function countInGap(entries, gap, cuts) {
    var total = 0;
    var below = 0;
    var totalBuildingCount = 0;
    var gapBuildingCount = 0;
    entries.forEach(function (entry) {
      if (!Number.isFinite(entry.rawAvg)) return;
      if (!Number.isFinite(entry.choroplethValue)) return;
      total += 1;
      var buildings = buildingCountFromEntry(entry);
      totalBuildingCount += buildings;
      if (Urban95CityGapModes.isInGap(entry.choroplethValue, gap.mode, cuts, entry.name)) {
        below += 1;
        gapBuildingCount += buildings;
      }
    });
    return {
      belowCount: below,
      totalCount: total,
      gapBuildingCount: gapBuildingCount,
      totalBuildingCount: totalBuildingCount,
    };
  }

  function buildSelectionModel(selection, entries, sfx, isWeighted, gap, renderCtx, cityAverage, cuts) {
    if (!selection || !selection.properties) return null;
    var name = selection.properties.Name || "Unknown";
    var entry = null;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].name === name) {
        entry = entries[i];
        break;
      }
    }

    var scoreValue = entry ? entry.scoreValue : Number(selection.properties["avg_overall" + sfx]);
    var cityAvgValue = cityAverage;
    var showGapBadge = false;
    if (
      gap.enabled &&
      entry &&
      Number.isFinite(entry.rawAvg) &&
      Number.isFinite(entry.choroplethValue)
    ) {
      showGapBadge = Urban95CityGapModes.isInGap(
        entry.choroplethValue,
        gap.mode,
        cuts,
        entry.name
      );
    }

    var percentileDisplay = null;
    var percentileValue = null;
    // AF: finite-only rank inputs (missing → NaN choroplethValue), matching mapRenderers.
    if (
      !isWeighted &&
      entry &&
      Number.isFinite(entry.choroplethValue) &&
      Number.isFinite(entry.scoreValue)
    ) {
      var pct = Math.round(entry.choroplethValue);
      var suffix =
        renderCtx && typeof renderCtx.getOrdinalSuffix === "function"
          ? renderCtx.getOrdinalSuffix(pct)
          : "";
      percentileValue = pct;
      percentileDisplay = pct + suffix + " map percentile";
    } else if (isWeighted && entry && Number.isFinite(entry.choroplethValue)) {
      // Published percentile only — do not invent ranks.
      var pctKey = null;
      if (renderCtx && typeof renderCtx.getNeighborhoodPercentileKey === "function") {
        pctKey = renderCtx.getNeighborhoodPercentileKey(sfx);
      }
      var publishedPct = pctKey != null ? Number(selection.properties[pctKey]) : NaN;
      if (Number.isFinite(publishedPct)) {
        var u95Pct = Math.round(publishedPct);
        var u95Suffix =
          renderCtx && typeof renderCtx.getOrdinalSuffix === "function"
            ? renderCtx.getOrdinalSuffix(u95Pct)
            : "";
        percentileValue = u95Pct;
        percentileDisplay = u95Pct + u95Suffix + " percentile";
      }
    }

    return {
      name: name,
      // Keep missing values non-finite — render must not coerce Unavailable → 0 meter/spark.
      scoreValue: Number.isFinite(scoreValue) ? scoreValue : NaN,
      cityAvgValue: Number.isFinite(cityAvgValue) ? cityAvgValue : NaN,
      scoreDisplay: formatDisplay(renderCtx, scoreValue),
      cityAvgDisplay: formatDisplay(renderCtx, cityAvgValue),
      percentileDisplay: percentileDisplay,
      percentileValue: percentileValue,
      showGapBadge: showGapBadge,
      sparkScale: isWeighted ? "absolute100" : "maxRelative",
    };
  }

  function resolveHistogram(stats, sfx, isWeighted, activeMetric, renderCtx) {
    var dist = null;
    if (isWeighted) {
      if (renderCtx && typeof renderCtx.getWeightedHistogramDistribution === "function") {
        dist = renderCtx.getWeightedHistogramDistribution(
          stats,
          sfx,
          activeMetric,
          function () {
            if (
              typeof renderCtx.buildHistogramDistributionFromScores === "function" &&
              typeof renderCtx.collectBuildingScores === "function"
            ) {
              return renderCtx.buildHistogramDistributionFromScores(
                renderCtx.collectBuildingScores(),
                10
              );
            }
            return null;
          }
        );
      }
    } else if (stats["distribution_expanded" + sfx]) {
      dist = stats["distribution_expanded" + sfx];
    } else {
      dist = stats["distribution" + sfx];
    }

    if (!dist || !dist.edges || !dist.counts) {
      return { available: false, chartOptions: null };
    }

    var buildingScores =
      renderCtx && typeof renderCtx.collectBuildingScores === "function"
        ? renderCtx.collectBuildingScores()
        : [];
    var breakpoints = isWeighted
      ? [0, 25, 50, 75, 100]
      : renderCtx && typeof renderCtx.percentileBreakpoints === "function"
        ? renderCtx.percentileBreakpoints(buildingScores)
        : [0, 25, 50, 75, 100];

    return {
      available: true,
      chartOptions: {
        isWeighted: isWeighted,
        edges: dist.edges,
        counts: dist.counts,
        breakpoints: breakpoints,
        buildingScores: buildingScores,
      },
    };
  }

  function hasFiniteChoroplethEntries(entries) {
    for (var i = 0; i < (entries || []).length; i++) {
      if (Number.isFinite(entries[i].choroplethValue)) return true;
    }
    return false;
  }

  function buildModel(stats, renderCtx) {
    var scoreMinutes = deps.getScoreMinutes();
    var sfx = "_" + scoreMinutes + "min";
    var isWeighted = deps.getScoreMode() === "weighted";
    var gap = getGapState();
    var selection = deps.getCitySelection();
    var selectedName = selection && selection.properties ? selection.properties.Name : null;
    var activeMetric =
      renderCtx && typeof renderCtx.getActiveMetric === "function"
        ? renderCtx.getActiveMetric()
        : null;
    var label = metricLabelForMode(renderCtx, isWeighted);

    // TODO: share choropleth eligibility with updateNeighborhoodColors when extracting a helper.
    var choropleth = buildChoroplethEntries(sfx, isWeighted, activeMetric);
    var rankingAvailable =
      !choropleth.unavailable && hasFiniteChoroplethEntries(choropleth.entries);
    var unavailable = !rankingAvailable;

    var cityAverage = null;
    if (isWeighted) {
      cityAverage = deps.getWeightedNeighborhoodMetricValue(
        stats,
        sfx,
        activeMetric,
        stats && stats.neighborhood_ranking_weighted
      );
    } else {
      cityAverage = Number(stats["avg_overall" + sfx]);
      if (!Number.isFinite(cityAverage)) {
        var ranking = stats.neighborhood_ranking || [];
        cityAverage = meanFinite(
          ranking.map(function (row) {
            return row && row["avg_overall" + sfx];
          })
        );
      }
    }

    var gapCuts = rankingAvailable
      ? collectChoroplethCuts(choropleth.entries)
      : { mean: NaN, largeWeakNames: {} };
    var rankingRows = rankingAvailable
      ? buildRankingRows(choropleth.entries, gap, selectedName, isWeighted, renderCtx)
      : [];
    var gapCounts = rankingAvailable
      ? countInGap(choropleth.entries, gap, gapCuts)
      : {
          belowCount: null,
          totalCount: null,
          gapBuildingCount: null,
          totalBuildingCount: null,
        };

    var hist = unavailable
      ? { available: false, chartOptions: null }
      : resolveHistogram(stats, sfx, isWeighted, activeMetric, renderCtx);

    var coverage = null;
    if (!isWeighted) {
      var coverageValue = stats["coverage_" + scoreMinutes + "min"];
      if (coverageValue != null && coverageValue !== "") {
        coverage = coverageValue;
      }
    }

    // Keep selection strip whenever city selection is set (name + Open CTA);
    // score / city-avg displays may be Unavailable when values are missing.
    var selectionModel = buildSelectionModel(
      selection,
      choropleth.entries,
      sfx,
      isWeighted,
      gap,
      renderCtx,
      cityAverage,
      gapCuts
    );

    return {
      stats: stats,
      totalBuildings: stats.total_buildings || 0,
      cityAverageDisplay: Number.isFinite(cityAverage)
        ? formatDisplay(renderCtx, cityAverage)
        : "Unavailable",
      cityAverageLabel: "City average (" + label + ")",
      coverage: coverage,
      unavailable: unavailable,
      histogramAvailable: !unavailable && hist.available,
      distributionTitle: "Building score distribution – " + label,
      distributionHint: isWeighted
        ? "Citywide distribution"
        : scoreMinutes + "-min walk • Matches " + label + " in Building mode",
      gap: {
        mode: gap.mode,
        enabled: gap.enabled,
        belowCount: gapCounts.belowCount,
        totalCount: gapCounts.totalCount,
        gapBuildingCount: gapCounts.gapBuildingCount,
        totalBuildingCount: gapCounts.totalBuildingCount,
      },
      selection: selectionModel,
      rankingAvailable: rankingAvailable,
      rankingTitle: isWeighted
        ? "Average " + label + " score by neighborhood"
        : "Neighborhood ranking",
      rankingRows: rankingRows,
      chartOptions: hist.chartOptions,
      metricLabel: label,
      scoreMinutes: scoreMinutes,
      isExpanded: !isWeighted,
    };
  }

  function wireBodyHandlers(token, selectionFeature) {
    var body = deps.bodyEl;
    if (!body) return;

    var modeButtons = body.querySelectorAll("[data-gap-mode]");
    for (var i = 0; i < modeButtons.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          if (token !== renderGeneration) return;
          setGapMode(btn.getAttribute("data-gap-mode"));
        });
      })(modeButtons[i]);
    }

    var rows = body.querySelectorAll(".city-ranking-row");
    for (var r = 0; r < rows.length; r++) {
      (function (row) {
        row.addEventListener("click", function () {
          if (token !== renderGeneration) return;
          var name = row.getAttribute("data-neighborhood-name");
          var feature = resolveNeighborhoodFeatureByName(name);
          if (!feature) return;
          setSelection(feature);
          fitFeatureBounds(feature);
        });
      })(rows[r]);
    }

    var openBtn = body.querySelector("#city-open-neighborhood");
    if (openBtn && selectionFeature) {
      openBtn.addEventListener("click", function () {
        if (token !== renderGeneration) return;
        // Capture feature at wire time — leaving citywide clears citySelection.
        deps.onOpenNeighborhood(selectionFeature);
      });
    }
  }

  function finalizeSidebarAndBindCharts(token, renderCtx, chartOptions, selectionFeature) {
    Urban95CityPanelRender.destroyCharts(chartInstances);
    if (deps.emptyEl) {
      deps.emptyEl.hidden = true;
      deps.emptyEl.textContent = "";
    }
    sidebarChrome.open();
    wireBodyHandlers(token, selectionFeature);
    deps.ensureChartJsLoaded().then(function () {
      if (token !== renderGeneration) return;
      deps.requestAnimationFrame(function () {
        if (token !== renderGeneration) return;
        if (!chartOptions) return;
        Urban95CityPanelRender.bindCharts(
          renderCtx,
          deps.bodyEl,
          chartOptions,
          chartInstances
        );
      });
    });
  }

  function showEmpty(message) {
    // Destroy charts before clearing body (empty paths skip finalizeSidebarAndBindCharts).
    Urban95CityPanelRender.destroyCharts(chartInstances);
    if (deps.emptyEl) {
      deps.emptyEl.hidden = false;
      deps.emptyEl.textContent = message || "City overview unavailable.";
    }
    if (deps.bodyEl) {
      deps.bodyEl.innerHTML = "";
    }
    if (sidebarChrome) {
      sidebarChrome.open();
    }
  }

  function configure(nextDeps) {
    deps = validateDeps(nextDeps || null);
    sidebarChrome = Urban95SidebarChromeBindings.create({
      sidebarEl: deps.sidebarEl,
      backdropEl: deps.backdropEl,
      closeButtonEl: deps.closeButtonEl,
      bodyEl: deps.bodyEl,
      bodyOpenClass: "city-sidebar-open",
      onClose: function () {
        dismiss();
      },
      setSidebarPadding: deps.setSidebarPadding,
      getSidebarWidth: getSidebarWidth,
      restoreFocusAfterHide: deps.restoreFocusAfterHide,
    });
    sidebarChrome.bindGlobalHandlers();
  }

  // Open chrome + map padding without loading briefing content.
  // Used on City enter so fitBounds runs after sidebar reservation is applied.
  function openShell() {
    if (!deps) {
      throw new Error("Urban95CitySidebar.configure must be called before openShell");
    }
    if (!sidebarChrome) return;
    if (deps.emptyEl) {
      deps.emptyEl.hidden = false;
      deps.emptyEl.textContent = "Loading city overview...";
    }
    Urban95CityPanelRender.destroyCharts(chartInstances);
    if (deps.bodyEl) {
      deps.bodyEl.innerHTML = "";
    }
    sidebarChrome.open();
  }

  function sync() {
    if (!deps) {
      throw new Error("Urban95CitySidebar.configure must be called before sync");
    }

    var token = ++renderGeneration;
    if (deps.emptyEl) {
      deps.emptyEl.hidden = false;
      deps.emptyEl.textContent = "Loading city overview...";
    }
    Urban95CityPanelRender.destroyCharts(chartInstances);
    if (deps.bodyEl) {
      deps.bodyEl.innerHTML = "";
    }

    var renderCtx = Object.assign(
      {
        heroEl: deps.heroEl,
        metaEl: deps.metaEl,
        eyebrowEl: deps.eyebrowEl,
        getScoreMode: deps.getScoreMode,
        getScoreMinutes: deps.getScoreMinutes,
      },
      deps.renderDeps
    );

    deps
      .loadCitywideStats()
      .then(function () {
        if (token !== renderGeneration) return;
        var stats = deps.getCitywideStats();
        if (!stats) {
          showEmpty("Citywide stats are unavailable.");
          return;
        }

        var model = buildModel(stats, renderCtx);
        Urban95CityPanelRender.populateHeader(renderCtx, {
          metricLabel: model.metricLabel,
          scoreMinutes: model.scoreMinutes,
          isExpanded: model.isExpanded,
          selection: model.selection || null,
        });
        deps.bodyEl.innerHTML = Urban95CityPanelRender.buildBodyHTML(renderCtx, model);
        finalizeSidebarAndBindCharts(
          token,
          renderCtx,
          model.chartOptions,
          deps.getCitySelection()
        );
      })
      .catch(function (err) {
        if (token !== renderGeneration) return;
        console.error("Failed to load citywide stats for City sidebar:", err);
        showEmpty("Failed to load city overview.");
      });
  }

  function hide(options) {
    options = options || {};
    if (options.clearSelection) {
      if (!deps) {
        throw new Error("Urban95CitySidebar.configure must be called before hide({ clearSelection: true })");
      }
      deps.setCitySelection(null);
      deps.onSelectionChanged(null);
    }
    renderGeneration++;
    Urban95CityPanelRender.destroyCharts(chartInstances);
    if (sidebarChrome) {
      sidebarChrome.close(options);
    }
  }

  // Clear selection + highlight, then hide — without sync (Escape / chrome close).
  // Active City re-click must keep using setSelection(null) so sync reopens the briefing.
  function dismiss() {
    hide({ clearSelection: true });
  }

  function isOpen() {
    if (sidebarChrome) return sidebarChrome.isOpen();
    return !!(deps && deps.sidebarEl && deps.sidebarEl.classList.contains("is-open"));
  }

  function setSelection(feature) {
    if (!deps) {
      throw new Error("Urban95CitySidebar.configure must be called before setSelection");
    }
    deps.setCitySelection(feature || null);
    deps.onSelectionChanged(feature || null);
    sync();
  }

  function setGapMode(mode, options) {
    if (!deps) {
      throw new Error("Urban95CitySidebar.configure must be called before setGapMode");
    }
    options = options || {};
    gapMode = Urban95CityGapModes.normalizeMode(mode);
    deps.onGapStateChanged();
    if (options.sync === false) return;
    sync();
  }

  // Mode-centric: setGapState(mode, options). Enter City resets with mode "off".
  function setGapState(mode, options) {
    if (!deps) {
      throw new Error("Urban95CitySidebar.configure must be called before setGapState");
    }
    setGapMode(mode, options);
  }

  window.Urban95CitySidebar = {
    configure: configure,
    openShell: openShell,
    sync: sync,
    hide: hide,
    dismiss: dismiss,
    isOpen: isOpen,
    setSelection: setSelection,
    getSelection: getSelection,
    setGapMode: setGapMode,
    setGapState: setGapState,
    getGapState: getGapState,
  };
})();
