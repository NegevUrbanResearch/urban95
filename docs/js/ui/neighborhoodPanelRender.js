(function () {
  "use strict";

  function populateHeaderWeighted(renderCtx, props, avgScore, cityAvg, categoryLabel) {
    var hero = renderCtx && renderCtx.heroEl;
    var meta = renderCtx && renderCtx.metaEl;
    if (!hero || !meta) return;

    var scoreVal = Math.min(100, Math.max(0, Number(avgScore) || 0));
    var scoreDisplay = renderCtx.formatScoreInteger(scoreVal);
    var kickerLabel =
      !categoryLabel || categoryLabel === "Urban95" || categoryLabel === "Amenities Focus"
        ? "Score"
        : categoryLabel + " score";

    hero.innerHTML =
      '<div class="percentile-summary score-explain-sidebar-hero-compact">' +
      '<p class="score-explain-hero-kicker">' +
      renderCtx.escapeHtml(kickerLabel) +
      "</p>" +
      '<div class="percentile-value">' +
      renderCtx.escapeHtml(scoreDisplay) +
      "<em>/100</em></div>" +
      '<div class="percentile-meter" aria-hidden="true"><div class="percentile-meter-fill" style="' +
      renderCtx.heroPercentileMeterFillStyle(scoreVal) +
      '"></div></div></div>';

    meta.innerHTML =
      '<div class="score-explain-building-ctx">' +
      '<div class="building-ctx-text">' +
      '<span class="building-ctx-id" dir="rtl" lang="he">' +
      renderCtx.escapeHtml((props && props.Name) || "Unknown") +
      "</span>" +
      '<span class="building-ctx-coords">City avg ' +
      renderCtx.formatMetricNumber(cityAvg) +
      "</span></div></div>";
  }

  function populateHeaderExpanded(renderCtx, props, pct, scoreMinutes) {
    var hero = renderCtx && renderCtx.heroEl;
    var meta = renderCtx && renderCtx.metaEl;
    if (!hero || !meta) return;

    var pctVal = pct != null ? pct : 0;
    var expandedHeroHtml = '<div class="percentile-summary score-explain-sidebar-hero-compact">';
    expandedHeroHtml +=
      '<p class="score-explain-hero-kicker">Citywide percentile</p>';
    expandedHeroHtml +=
      '<div class="percentile-value">' +
      renderCtx.escapeHtml(String(pctVal)) +
      "<span>" +
      renderCtx.escapeHtml(renderCtx.getOrdinalSuffix(pctVal)) +
      '</span><em>percentile</em></div>';
    expandedHeroHtml +=
      '<div class="percentile-meter" aria-hidden="true"><div class="percentile-meter-fill" style="' +
      renderCtx.heroPercentileMeterFillStyle(pctVal) +
      '"></div></div>';
    expandedHeroHtml += "</div>";
    hero.innerHTML = expandedHeroHtml;

    meta.innerHTML =
      '<div class="score-explain-building-ctx">' +
      '<div class="building-ctx-text">' +
      '<span class="building-ctx-id" dir="rtl" lang="he">' +
      renderCtx.escapeHtml((props && props.Name) || "Unknown") +
      "</span>" +
      '<span class="building-ctx-coords">' +
      renderCtx.escapeHtml(String(pctVal)) +
      renderCtx.escapeHtml(renderCtx.getOrdinalSuffix(pctVal)) +
      " percentile \u2022 " +
      renderCtx.escapeHtml(String(scoreMinutes)) +
      "-min walk</span></div></div>";
  }

  function buildBodyHTMLWeighted(renderCtx, props, sfx, avgScore, cityAvg, selectedCategoryLabel) {
    var html = "";
    html += '<div class="cw-summary">';
    html +=
      '<div class="cw-stat-card"><div class="cw-stat-value">' +
      (props.building_count || 0) +
      '</div><div class="cw-stat-label">Buildings</div></div>';
    html +=
      '<div class="cw-stat-card"><div class="cw-stat-value">' +
      renderCtx.formatMetricNumber(avgScore) +
      '</div><div class="cw-stat-label">Neighborhood avg (' +
      selectedCategoryLabel +
      ")</div></div>";
    html +=
      '<div class="cw-stat-card"><div class="cw-stat-value">' +
      renderCtx.formatMetricNumber(cityAvg) +
      '</div><div class="cw-stat-label">City avg (' +
      selectedCategoryLabel +
      ")</div></div>";
    html +=
      '<div class="cw-stat-card"><div class="cw-stat-value">' +
      (props["coverage_weighted" + sfx] || 0) +
      '%</div><div class="cw-stat-label">Coverage</div></div>';
    html += "</div>";

    var activeMetric = renderCtx.getActiveMetric ? renderCtx.getActiveMetric() : null;
    var selectedStem = activeMetric && activeMetric.selectedWeightedStem;
    var selectedSubStem = activeMetric && activeMetric.selectedWeightedSubStem;
    if (!selectedStem) {
      var highlights = renderCtx.weightedCategoryHighlightsFromSource(props, sfx);
      html += '<div class="cw-section">';
      html += '<div class="cw-section-title">Urban95 category highlights</div>';
      html += '<div class="u95-highlight-grid">';
      highlights.forEach(function (item) {
        html += '<div class="u95-highlight-card">';
        html += '<div class="u95-highlight-name">' + item.label + "</div>";
        html += '<div class="u95-highlight-score">' + renderCtx.formatMetricNumber(item.score) + "</div>";
        html += '<div class="u95-highlight-meta">' + Math.round(item.weight * 100) + "% weight</div>";
        html += "</div>";
      });
      html += "</div></div>";
    }

    html += '<div class="cw-section">';
    html += '<div class="cw-section-title">Building score distribution (citywide)</div>';
    html +=
      '<p class="sidebar-section-hint">Histogram of Urban95 scores across all buildings</p>';
    html += '<div class="cw-chart-container"><canvas id="hood-sidebar-score-hist"></canvas></div>';
    html += "</div>";

    html += '<div class="cw-section">';
    html += '<div class="cw-section-title">Subcategory score comparison</div>';
    html +=
      '<p class="sidebar-section-hint">Horizontal bars = neighborhood average, dashed marker = city average</p>';
    html += '<div class="u95-compare-container" id="hood-sidebar-subcategory-compare-list"></div>';
    html += "</div>";

    return html;
  }

  function buildBodyHTMLExpanded(renderCtx, props, sfx, pct, invLegacy) {
    var html = "";
    html += '<div class="cw-summary">';
    html +=
      '<div class="cw-stat-card"><div class="cw-stat-value">' +
      (props.building_count || 0) +
      '</div><div class="cw-stat-label">Buildings</div></div>';
    html +=
      '<div class="cw-stat-card"><div class="cw-stat-value">' +
      pct +
      '%</div><div class="cw-stat-label">Citywide percentile</div></div>';
    html +=
      '<div class="cw-stat-card"><div class="cw-stat-value">' +
      (props["coverage" + sfx] || 0) +
      '%</div><div class="cw-stat-label">Coverage</div></div>';
    html += "</div>";
    html += '<div class="cw-section">';
    html += '<div class="cw-section-title">Amenity breakdown</div>';
    html += '<p class="sidebar-section-hint">Point counts in this area (legacy taxonomy)</p>';
    html += '<div class="cw-chart-container cw-pie-chart"><canvas id="hood-sidebar-amenity-pie"></canvas></div>';
    html += "</div>";

    var barSlices = renderCtx.pieSlicesFromInventoryCounts(invLegacy);
    if (barSlices.values.length > 0) {
      html += '<div class="cw-section">';
      html += '<div class="cw-section-title">Counts by type</div>';
      html +=
        '<div class="cw-chart-container" style="height:' +
        Math.max(200, barSlices.values.length * 28) +
        'px"><canvas id="hood-sidebar-type-bar"></canvas></div>';
      html += "</div>";
    }

    return html;
  }

  function bindCharts(renderCtx, bodyEl, context, chartInstances) {
    if (!bodyEl || typeof Chart === "undefined") return;

    Chart.defaults.font.family = 'Inter, "Noto Sans Hebrew", system-ui, sans-serif';
    var citywideStats = renderCtx.getCitywideStats();

    if (context && context.weighted) {
      var sfx = context.sfx;
      var neighborhoodProps = context.neighborhoodProps || {};
      var activeMetric = renderCtx.getActiveMetric ? renderCtx.getActiveMetric() : null;
      var selectedStem = activeMetric && activeMetric.selectedWeightedStem;
      var selectedSubStem = activeMetric && activeMetric.selectedWeightedSubStem;
      var histCanvas = bodyEl.querySelector("#hood-sidebar-score-hist");
      if (histCanvas) {
        var dist = renderCtx.getWeightedHistogramDistribution(
          citywideStats,
          sfx,
          activeMetric,
          function () {
            return renderCtx.buildHistogramDistributionFromScores(renderCtx.collectBuildingScores(), 10);
          }
        );
        var labels = dist.edges.slice(0, -1).map(function (edge, index) {
          return Math.round(Number(edge)) + "-" + Math.round(Number(dist.edges[index + 1]));
        });
        var breakpoints = [0, 25, 50, 75, 100];
        chartInstances.push(
          new Chart(histCanvas, {
            type: "bar",
            data: {
              labels: labels,
              datasets: [
                {
                  data: dist.counts,
                  backgroundColor: dist.edges.slice(0, -1).map(function (edge, index) {
                    var midpoint = (edge + dist.edges[index + 1]) / 2;
                    return renderCtx.getColorForValue(midpoint, breakpoints);
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
      }

      var subList = bodyEl.querySelector("#hood-sidebar-subcategory-compare-list");
      if (subList && citywideStats) {
        var rows = renderCtx.weightedSubcategoryComparisonRows(neighborhoodProps, citywideStats, sfx);
        rows = rows.filter(function (row) {
          return row.hasData !== false;
        });
        if (selectedSubStem && selectedStem) {
          rows = rows.filter(function (row) {
            return row.categoryStem === selectedStem && row.subStem === selectedSubStem;
          });
        }
        if (rows.length === 0) {
          subList.innerHTML =
            '<div class="sidebar-section-hint">Neighborhood subcategory averages are unavailable for this metric in the current data export.</div>';
        } else {
          renderCtx.renderWeightedSubcategoryComparisonList(subList, rows);
        }
      }
    } else {
      var invObj = (context && context.invObj) || {};
      var pieCanvas = bodyEl.querySelector("#hood-sidebar-amenity-pie");
      var pie = renderCtx.pieSlicesFromInventoryCounts(invObj);
      if (pieCanvas && pie.values.length > 0) {
        chartInstances.push(
          new Chart(pieCanvas, {
            type: "doughnut",
            data: {
              labels: pie.labels,
              datasets: [{ data: pie.values, backgroundColor: pie.colors, borderWidth: 2, borderColor: "#fff" }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: "bottom", labels: { boxWidth: 12, padding: 10, font: { size: 11 } } },
              },
            },
          })
        );
      }

      var barCanvas = bodyEl.querySelector("#hood-sidebar-type-bar");
      if (barCanvas && pie.values.length > 0) {
        chartInstances.push(
          new Chart(barCanvas, {
            type: "bar",
            data: {
              labels: pie.labels,
              datasets: [{ data: pie.values, backgroundColor: pie.colors, borderRadius: 3 }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              indexAxis: "y",
              plugins: { legend: { display: false } },
              scales: {
                x: {
                  grid: { color: "#f3f4f6" },
                  ticks: { font: { size: 10 } },
                  title: { display: true, text: "Points in neighborhood", font: { size: 11 } },
                },
                y: { grid: { display: false }, ticks: { font: { size: 10 } } },
              },
            },
          })
        );
      }
    }

    chartInstances.forEach(function (chart) {
      if (chart && typeof chart.resize === "function") chart.resize();
    });
  }

  function destroyCharts(chartInstances) {
    chartInstances.forEach(function (c) {
      if (c) c.destroy();
    });
    chartInstances.length = 0;
  }

  window.Urban95NeighborhoodPanelRender = {
    populateHeaderWeighted: populateHeaderWeighted,
    populateHeaderExpanded: populateHeaderExpanded,
    buildBodyHTMLWeighted: buildBodyHTMLWeighted,
    buildBodyHTMLExpanded: buildBodyHTMLExpanded,
    bindCharts: bindCharts,
    destroyCharts: destroyCharts,
  };
})();
