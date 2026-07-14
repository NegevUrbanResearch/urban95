(function () {
  "use strict";

  function escape(renderCtx, value) {
    return renderCtx.escapeHtml(value == null ? "" : String(value));
  }

  function formatScoreInt(renderCtx, value) {
    if (renderCtx && typeof renderCtx.formatScoreInteger === "function") {
      return renderCtx.formatScoreInteger(value);
    }
    return String(Math.round(Number(value) || 0));
  }

  function formatMetric(renderCtx, value) {
    if (renderCtx && typeof renderCtx.formatMetricNumber === "function") {
      return renderCtx.formatMetricNumber(value);
    }
    return String(value);
  }

  function ordinalSuffix(renderCtx, value) {
    if (renderCtx && typeof renderCtx.getOrdinalSuffix === "function") {
      return renderCtx.getOrdinalSuffix(value);
    }
    return "";
  }

  function meterFillStyle(renderCtx, value0to100) {
    if (renderCtx && typeof renderCtx.heroPercentileMeterFillStyle === "function") {
      return renderCtx.heroPercentileMeterFillStyle(value0to100);
    }
    var clamped = Math.max(0, Math.min(100, Number(value0to100) || 0));
    return "width:" + clamped + "%";
  }

  function modeLabel(renderCtx) {
    if (renderCtx && typeof renderCtx.getScoreModeLabel === "function") {
      return renderCtx.getScoreModeLabel();
    }
    return "";
  }

  function scoreHeroKicker(label) {
    if (!label || label === "Urban95" || label === "Amenities Focus") return "Score";
    return label + " score";
  }

  function populateHeaderBriefing(renderCtx, opts) {
    var hero = renderCtx && renderCtx.heroEl;
    var meta = renderCtx && renderCtx.metaEl;

    if (hero) {
      hero.innerHTML =
        '<div class="percentile-summary score-explain-sidebar-hero-compact">' +
        '<div class="percentile-value">Beer Sheva</div>' +
        "</div>";
    }

    if (meta) {
      var metaText = "";
      if (opts.isExpanded && opts.scoreMinutes != null && opts.scoreMinutes !== "") {
        metaText = String(opts.scoreMinutes) + "-min walk";
      }
      if (!metaText) {
        meta.innerHTML = "";
        return;
      }
      meta.innerHTML =
        '<div class="score-explain-building-ctx">' +
        '<div class="building-ctx-text">' +
        '<span class="building-ctx-coords">' +
        escape(renderCtx, metaText) +
        "</span></div></div>";
    }
  }

  function populateHeaderSelection(renderCtx, opts, selection) {
    var hero = renderCtx && renderCtx.heroEl;
    var meta = renderCtx && renderCtx.metaEl;
    if (!hero || !meta) return;

    var name = selection.name || "Unknown";
    var isExpanded = !!opts.isExpanded;

    if (isExpanded) {
      var pctRaw =
        selection.percentileValue != null ? Number(selection.percentileValue) : NaN;
      var minutes = opts.scoreMinutes != null ? String(opts.scoreMinutes) : "";
      var walkMeta = minutes ? minutes + "-min walk" : "";

      if (Number.isFinite(pctRaw)) {
        var pctVal = Math.round(pctRaw);
        var suffix = ordinalSuffix(renderCtx, pctVal);
        var metaCoords =
          String(pctVal) +
          suffix +
          " percentile" +
          (walkMeta ? " \u2022 " + walkMeta : "");

        hero.innerHTML =
          '<div class="percentile-summary score-explain-sidebar-hero-compact">' +
          '<p class="score-explain-hero-kicker">Citywide percentile</p>' +
          '<div class="percentile-value">' +
          escape(renderCtx, String(pctVal)) +
          "<span>" +
          escape(renderCtx, suffix) +
          '</span><em>percentile</em></div>' +
          '<div class="percentile-meter" aria-hidden="true"><div class="percentile-meter-fill" style="' +
          meterFillStyle(renderCtx, pctVal) +
          '"></div></div></div>';

        meta.innerHTML =
          '<div class="score-explain-building-ctx">' +
          '<div class="building-ctx-text">' +
          '<span class="building-ctx-id" dir="rtl" lang="he">' +
          escape(renderCtx, name) +
          "</span>" +
          '<span class="building-ctx-coords">' +
          escape(renderCtx, metaCoords) +
          "</span></div></div>";
        return;
      }

      // Honest fallback: never invent percentile chrome from raw AF score.
      var scoreRawExpanded = Number(selection.scoreValue);
      var scoreOnlyDisplay = Number.isFinite(scoreRawExpanded)
        ? selection.scoreDisplay != null
          ? String(selection.scoreDisplay)
          : formatMetric(renderCtx, scoreRawExpanded)
        : "Unavailable";
      var scoreOnlyMeta =
        Number.isFinite(scoreRawExpanded)
          ? "Score " + scoreOnlyDisplay + (walkMeta ? " \u2022 " + walkMeta : "")
          : "Percentile unavailable" + (walkMeta ? " \u2022 " + walkMeta : "");

      hero.innerHTML =
        '<div class="percentile-summary score-explain-sidebar-hero-compact">' +
        '<p class="score-explain-hero-kicker">Citywide percentile</p>' +
        '<div class="percentile-value">Unavailable</div></div>';

      meta.innerHTML =
        '<div class="score-explain-building-ctx">' +
        '<div class="building-ctx-text">' +
        '<span class="building-ctx-id" dir="rtl" lang="he">' +
        escape(renderCtx, name) +
        "</span>" +
        '<span class="building-ctx-coords">' +
        escape(renderCtx, scoreOnlyMeta) +
        "</span></div></div>";
      return;
    }

    var scoreRawWeighted = Number(selection.scoreValue);
    var kickerLabel = scoreHeroKicker(opts.metricLabel || modeLabel(renderCtx));
    var cityAvgRaw = Number(selection.cityAvgValue);
    var cityAvgText = Number.isFinite(cityAvgRaw)
      ? formatMetric(renderCtx, cityAvgRaw)
      : selection.cityAvgDisplay != null
        ? String(selection.cityAvgDisplay)
        : "Unavailable";

    if (!Number.isFinite(scoreRawWeighted)) {
      hero.innerHTML =
        '<div class="percentile-summary score-explain-sidebar-hero-compact">' +
        '<p class="score-explain-hero-kicker">' +
        escape(renderCtx, kickerLabel) +
        '</p><div class="percentile-value">Unavailable</div></div>';
    } else {
      var scoreVal = Math.min(100, Math.max(0, scoreRawWeighted));
      var scoreDisplay = formatScoreInt(renderCtx, scoreVal);
      hero.innerHTML =
        '<div class="percentile-summary score-explain-sidebar-hero-compact">' +
        '<p class="score-explain-hero-kicker">' +
        escape(renderCtx, kickerLabel) +
        "</p>" +
        '<div class="percentile-value">' +
        escape(renderCtx, scoreDisplay) +
        "<em>/100</em></div>" +
        '<div class="percentile-meter" aria-hidden="true"><div class="percentile-meter-fill" style="' +
        meterFillStyle(renderCtx, scoreVal) +
        '"></div></div></div>';
    }

    meta.innerHTML =
      '<div class="score-explain-building-ctx">' +
      '<div class="building-ctx-text">' +
      '<span class="building-ctx-id" dir="rtl" lang="he">' +
      escape(renderCtx, name) +
      "</span>" +
      '<span class="building-ctx-coords">City avg ' +
      escape(renderCtx, cityAvgText) +
      "</span></div></div>";
  }

  function populateHeader(renderCtx, options) {
    var opts = options || {};
    var eyebrow = renderCtx && renderCtx.eyebrowEl;

    if (eyebrow) {
      eyebrow.hidden = false;
      eyebrow.textContent = "City";
    }

    if (opts.selection) {
      populateHeaderSelection(renderCtx, opts, opts.selection);
      return;
    }

    populateHeaderBriefing(renderCtx, opts);
  }

  function buildKpiHTML(renderCtx, model) {
    var html = '<div class="cw-summary">';
    var buildings =
      model.totalBuildings != null
        ? model.totalBuildings
        : model.stats && model.stats.total_buildings != null
          ? model.stats.total_buildings
          : 0;
    var buildingsDisplay =
      typeof buildings === "number" && typeof buildings.toLocaleString === "function"
        ? buildings.toLocaleString()
        : String(buildings);

    html +=
      '<div class="cw-stat-card"><div class="cw-stat-value">' +
      escape(renderCtx, buildingsDisplay) +
      '</div><div class="cw-stat-label">Buildings</div></div>';

    var avgDisplay =
      model.cityAverageDisplay != null ? model.cityAverageDisplay : "Unavailable";
    var avgLabel = model.cityAverageLabel || "City average";
    html +=
      '<div class="cw-stat-card"><div class="cw-stat-value">' +
      escape(renderCtx, avgDisplay) +
      '</div><div class="cw-stat-label">' +
      escape(renderCtx, avgLabel) +
      "</div></div>";

    if (model.coverage != null && model.coverage !== "") {
      html +=
        '<div class="cw-stat-card"><div class="cw-stat-value">' +
        escape(renderCtx, String(model.coverage)) +
        '%</div><div class="cw-stat-label">Coverage</div></div>';
    }

    html += "</div>";
    return html;
  }

  function buildDistributionHTML(renderCtx, model) {
    var html = '<div class="cw-section">';
    var title = model.distributionTitle || "Building score distribution";
    html +=
      '<div class="cw-section-title">' + escape(renderCtx, title) + "</div>";

    if (model.histogramAvailable === false || model.unavailable) {
      html +=
        '<p class="sidebar-section-hint">Score distribution is unavailable for this metric in the current data export.</p>';
    } else {
      if (model.distributionHint) {
        html +=
          '<p class="sidebar-section-hint">' +
          escape(renderCtx, model.distributionHint) +
          "</p>";
      }
      html +=
        '<div class="cw-chart-container"><canvas id="city-sidebar-score-hist"></canvas></div>';
    }
    html += "</div>";
    return html;
  }

  function gapBelowAvgLabel(model) {
    // Gap cuts use mean of map choropleth values (AF = percentiles), not the
    // spark's raw-score city average — keep copy distinct from spark "city avg".
    return model && model.isExpanded ? "Below mean map percentile" : "Below mean map score";
  }

  function buildGapControlsHTML(renderCtx, model) {
    var gap = model.gap || {};
    var mode = Urban95CityGapModes.normalizeMode(gap.mode);
    var belowAvgShort = "Below map avg";
    var modeLabels = [
      { id: Urban95CityGapModes.MODE_OFF, label: "Off" },
      { id: Urban95CityGapModes.MODE_BELOW_CITY_AVG, label: belowAvgShort },
      { id: Urban95CityGapModes.MODE_LARGE_WEAK, label: "Large weak places" },
    ];
    var html = '<div class="cw-section city-gap-section">';
    html += '<div class="cw-section-title">Show gaps</div>';
    html += '<div class="city-gap-modes" role="group" aria-label="Gap mode">';
    modeLabels.forEach(function (item) {
      var active = item.id === mode ? " is-active" : "";
      html +=
        '<button type="button" class="indicator-btn city-gap-mode-btn' +
        active +
        '" data-gap-mode="' +
        item.id +
        '" aria-pressed="' +
        (item.id === mode ? "true" : "false") +
        '">' +
        escape(renderCtx, item.label) +
        "</button>";
    });
    html += "</div>";

    if (
      mode !== Urban95CityGapModes.MODE_OFF &&
      !model.unavailable &&
      gap.belowCount != null &&
      gap.totalCount != null &&
      Number.isFinite(Number(gap.belowCount)) &&
      Number.isFinite(Number(gap.totalCount))
    ) {
      var countSuffix;
      if (mode === Urban95CityGapModes.MODE_LARGE_WEAK) {
        countSuffix = " large weak places";
        var gapBuildings = Number(gap.gapBuildingCount);
        var totalBuildings = Number(gap.totalBuildingCount);
        if (
          Number.isFinite(gapBuildings) &&
          Number.isFinite(totalBuildings) &&
          totalBuildings > 0
        ) {
          var pct = Math.round((gapBuildings / totalBuildings) * 100);
          countSuffix += " · " + pct + "% of buildings";
        }
      } else {
        countSuffix = " neighborhoods " + gapBelowAvgLabel(model).toLowerCase();
      }
      html +=
        '<p class="sidebar-section-hint city-gap-count">' +
        escape(renderCtx, String(gap.belowCount)) +
        " of " +
        escape(renderCtx, String(gap.totalCount)) +
        escape(renderCtx, countSuffix) +
        "</p>";
    }

    html += "</div>";
    return html;
  }

  function sparkColor(scoreValue) {
    var neighborhood = Math.max(0, Math.min(100, Number(scoreValue) || 0));
    if (neighborhood >= 70) return "#22c55e";
    if (neighborhood >= 40) return "#eab308";
    return "#ef4444";
  }

  function selectionUsesMaxRelativeSpark(renderCtx, selection) {
    if (selection && selection.sparkScale === "maxRelative") return true;
    if (selection && selection.sparkScale === "absolute100") return false;
    return (
      renderCtx &&
      typeof renderCtx.getScoreMode === "function" &&
      renderCtx.getScoreMode() === "expanded"
    );
  }

  function sparkBarPercents(scoreRaw, cityAvgRaw, useMaxRelative) {
    if (useMaxRelative) {
      var scaleMax = Math.max(scoreRaw, cityAvgRaw, 1);
      return {
        score: Math.max(0, Math.min(100, (scoreRaw / scaleMax) * 100)),
        city: Math.max(0, Math.min(100, (cityAvgRaw / scaleMax) * 100)),
      };
    }
    return {
      score: Math.max(0, Math.min(100, scoreRaw)),
      city: Math.max(0, Math.min(100, cityAvgRaw)),
    };
  }

  function buildSelectionStripHTML(renderCtx, model) {
    var selection = model.selection;
    if (!selection) return "";

    var scoreRaw = Number(selection.scoreValue);
    var cityAvgRaw = Number(selection.cityAvgValue);
    var scoreFinite = Number.isFinite(scoreRaw);
    var cityAvgFinite = Number.isFinite(cityAvgRaw);
    var scoreDisplayText =
      selection.scoreDisplay != null
        ? String(selection.scoreDisplay)
        : scoreFinite
          ? String(scoreRaw)
          : "Unavailable";
    var cityAvgDisplayText =
      selection.cityAvgDisplay != null
        ? String(selection.cityAvgDisplay)
        : cityAvgFinite
          ? String(cityAvgRaw)
          : "Unavailable";

    // Identity/score live in the sidebar header; body = spark + gap pill + primary CTA.
    var html = '<div class="cw-section city-selection-strip">';
    html += '<div class="cw-section-title">Selected neighborhood</div>';

    if (selection.showGapBadge) {
      var gapMode = Urban95CityGapModes.normalizeMode((model.gap && model.gap.mode) || "");
      var badgeText =
        gapMode === Urban95CityGapModes.MODE_LARGE_WEAK
          ? "Large weak places"
          : gapBelowAvgLabel(model);
      html +=
        '<span class="city-gap-badge" role="status">' +
        escape(renderCtx, badgeText) +
        "</span>";
    }

    if (!scoreFinite || !cityAvgFinite) {
      // Do not paint a fake 0-width spark when values are missing.
      html +=
        '<p class="sidebar-section-hint">Compare unavailable — neighborhood score ' +
        escape(renderCtx, scoreDisplayText) +
        ", city avg " +
        escape(renderCtx, cityAvgDisplayText) +
        ".</p>";
    } else {
      var useMaxRelative = selectionUsesMaxRelativeSpark(renderCtx, selection);
      var bars = sparkBarPercents(scoreRaw, cityAvgRaw, useMaxRelative);
      var scoreBar = bars.score;
      var cityAvgBar = bars.city;
      var barColor = useMaxRelative ? "#2563eb" : sparkColor(scoreBar);

      html += '<div class="u95-compare-container">';
      html +=
        '<div class="u95-compare-legend"><span class="u95-compare-legend-bar">This neighborhood</span>' +
        '<span class="u95-compare-legend-line">City avg</span></div>';
      html += '<div class="u95-compare-list"><div class="u95-compare-item">';
      html += '<div class="u95-compare-bar-wrap">';
      html +=
        '<div class="u95-compare-city-marker" style="left:' + cityAvgBar + '%"></div>';
      html +=
        '<div class="u95-compare-bar" style="width:' +
        scoreBar +
        "%;background:" +
        barColor +
        '"></div>';
      html += "</div>";
      html +=
        '<div class="u95-compare-score"><strong>' +
        escape(renderCtx, scoreDisplayText) +
        "</strong><span>city avg " +
        escape(renderCtx, cityAvgDisplayText) +
        "</span></div>";
      html += "</div></div></div>";
    }

    html +=
      '<button type="button" id="city-open-neighborhood" class="city-open-neighborhood-btn">Open neighborhood</button>';
    html += "</div>";
    return html;
  }

  function buildRankingHTML(renderCtx, model) {
    var html = '<div class="cw-section">';
    var title = model.rankingTitle || "Neighborhood ranking";
    html += '<div class="cw-section-title">' + escape(renderCtx, title) + "</div>";

    if (model.rankingAvailable === false || model.unavailable) {
      html +=
        '<p class="sidebar-section-hint">Neighborhood averages for this metric are unavailable in the current data export.</p>';
      html += "</div>";
      return html;
    }

    var rows = Array.isArray(model.rankingRows) ? model.rankingRows : [];
    if (rows.length === 0) {
      html +=
        '<p class="sidebar-section-hint">No neighborhood ranking data available.</p>';
      html += "</div>";
      return html;
    }

    html += '<div class="cw-ranking-list" role="list">';
    rows.forEach(function (row, index) {
      var active = row && row.isActive ? " is-active" : "";
      var name = (row && row.name) || "Unknown";
      var valueDisplay = row && row.valueDisplay != null ? String(row.valueDisplay) : "";
      var secondary =
        row && row.secondaryDisplay != null && row.secondaryDisplay !== ""
          ? String(row.secondaryDisplay)
          : null;
      var barWidth = row && row.barWidth != null ? Number(row.barWidth) : NaN;
      if (!Number.isFinite(barWidth)) {
        barWidth = row && row.choroplethValue != null ? Number(row.choroplethValue) : NaN;
      }
      if (!Number.isFinite(barWidth)) barWidth = 0;
      barWidth = Math.max(0, Math.min(100, barWidth));

      html +=
        '<button type="button" class="cw-ranking-item city-ranking-row' +
        active +
        '" role="listitem" data-neighborhood-name="' +
        escape(renderCtx, name) +
        '">';
      html += '<div class="cw-rank-num">' + (index + 1) + "</div>";
      html +=
        '<div class="cw-rank-name" dir="rtl" lang="he">' +
        escape(renderCtx, name) +
        "</div>";
      html +=
        '<div class="cw-rank-bar-wrap"><div class="cw-rank-bar" style="width:' +
        barWidth +
        '%;background:#22c55e"></div></div>';
      html += '<div class="cw-rank-score"><strong>' + escape(renderCtx, valueDisplay) + "</strong>";
      if (secondary) {
        html +=
          '<span class="cw-rank-sub">' + escape(renderCtx, secondary) + "</span>";
      }
      html += "</div></button>";
    });
    html += "</div></div>";
    return html;
  }

  function buildBodyHTML(renderCtx, model) {
    var m = model || {};
    var html = "";
    // Locked §8.1 order: KPIs → distribution → gap → selection strip → ranking
    html += buildKpiHTML(renderCtx, m);
    html += buildDistributionHTML(renderCtx, m);
    html += buildGapControlsHTML(renderCtx, m);
    html += buildSelectionStripHTML(renderCtx, m);
    html += buildRankingHTML(renderCtx, m);
    return html;
  }

  function destroyCharts(chartInstances) {
    if (!chartInstances) return;
    chartInstances.forEach(function (c) {
      if (c) c.destroy();
    });
    chartInstances.length = 0;
  }

  function bindCharts(renderCtx, bodyEl, chartOptions, chartInstances) {
    destroyCharts(chartInstances);
    if (!bodyEl || typeof Chart === "undefined") return;

    var opts = chartOptions || {};
    var histCanvas = bodyEl.querySelector("#city-sidebar-score-hist");
    if (!histCanvas) return;

    var edges = opts.edges;
    var counts = opts.counts;
    if (!edges || !counts || !edges.length || edges.length < 2) return;

    Chart.defaults.font.family = "Inter, system-ui, sans-serif";

    var breakpoints = opts.breakpoints;
    if (!breakpoints || !breakpoints.length) {
      if (
        !opts.isWeighted &&
        renderCtx &&
        typeof renderCtx.percentileBreakpoints === "function"
      ) {
        breakpoints = renderCtx.percentileBreakpoints(opts.buildingScores || []);
      } else {
        breakpoints = [0, 25, 50, 75, 100];
      }
    }

    var labels = edges.slice(0, -1).map(function (edge, index) {
      return Math.round(Number(edge)) + "-" + Math.round(Number(edges[index + 1]));
    });

    var getColor =
      renderCtx && typeof renderCtx.getColorForValue === "function"
        ? renderCtx.getColorForValue.bind(renderCtx)
        : function () {
            return "#2563eb";
          };

    chartInstances.push(
      new Chart(histCanvas, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              data: counts,
              backgroundColor: edges.slice(0, -1).map(function (edge, index) {
                var midpoint = (edge + edges[index + 1]) / 2;
                return getColor(midpoint, breakpoints);
              }),
              borderRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 9 } } },
            y: {
              grid: { color: "#f3f4f6" },
              ticks: { font: { size: 10 } },
              title: { display: true, text: "Buildings", font: { size: 11 } },
            },
          },
        },
      })
    );

    chartInstances.forEach(function (chart) {
      if (chart && typeof chart.resize === "function") chart.resize();
    });
  }

  window.Urban95CityPanelRender = {
    populateHeader: populateHeader,
    buildBodyHTML: buildBodyHTML,
    bindCharts: bindCharts,
    destroyCharts: destroyCharts,
  };
})();
