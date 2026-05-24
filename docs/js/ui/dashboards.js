(function () {
  var deps = null;
  var dashboardChromeBound = false;
  var modalRenderState = {
    neighborhood: { generation: 0 },
    citywide: { generation: 0 },
  };

  var REQUIRED_DEPENDENCY_TYPES = {
    map: "object",
    fetchJsonWithGzipFallback: "function",
    ensureChartJsLoaded: "function",
    urls: "object",
    scoreModel: "object",
    getScoreMode: "function",
    getScoreMinutes: "function",
    escapeHtml: "function",
    getNeighborhoodsData: "function",
    setNeighborhoodsData: "function",
    getNeighborhoodSurfaceData: "function",
    setNeighborhoodSurfaceData: "function",
    getNeighborhoodChartsPayload: "function",
    setNeighborhoodChartsPayload: "function",
    getCitywideStats: "function",
    setCitywideStats: "function",
    getSelectedNeighborhood: "function",
    setSelectedNeighborhood: "function",
    getCitywideCharts: "function",
    setCitywideCharts: "function",
    getNeighborhoodCharts: "function",
    setNeighborhoodCharts: "function",
    getAmenityConfig: "function",
    getNeighborhoodPercentileKey: "function",
    getNeighborhoodSurfaceScorePropertyKey: "function",
    getSelectedWeightedCategoryLabel: "function",
    getSelectedWeightedCategoryStem: "function",
    getWeightedAverageValueFromSource: "function",
    getCitywideWeightedAverageScore: "function",
    weightedCategoryHighlightsFromSource: "function",
    weightedNeighborhoodRankingRows: "function",
    weightedSubcategoryComparisonRows: "function",
    renderWeightedSubcategoryComparisonList: "function",
    buildHistogramDistributionFromScores: "function",
    collectBuildingScores: "function",
    getColorForValue: "function",
    percentileBreakpoints: "function",
    formatMetricNumber: "function",
    getOrdinalSuffix: "function",
    getScoreModeLabel: "function",
    tooltipEl: "object",
    switchMode: "function",
    requestAnimationFrame: "function",
    neighborhoodModal: "object",
    neighborhoodModalClose: "object",
    neighborhoodModalTitle: "object",
    neighborhoodModalSubtitle: "object",
    neighborhoodModalBody: "object",
    citywideModal: "object",
    citywideClose: "object",
    citywideTitle: "object",
    citywideSubtitle: "object",
    citywideBody: "object",
  };

  function configure(nextDeps) {
    deps = validateDeps(nextDeps || null);
    bindDashboardChrome();
  }

  function validateDeps(nextDeps) {
    if (!nextDeps) {
      throw new Error("Urban95Dashboards.configure missing required dependency: deps object");
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
        "Urban95Dashboards.configure missing required dependency: " + missing.join(", ")
      );
    }
    return nextDeps;
  }

  function requireDeps() {
    if (!deps) {
      throw new Error("Urban95Dashboards.configure must be called before dashboard functions");
    }
    return deps;
  }

  function getState(key) {
    var d = requireDeps();
    return d[key]();
  }

  function setState(key, value) {
    var d = requireDeps();
    d[key](value);
    return value;
  }

  function destroyCharts(stateKey) {
    var charts = getState(stateKey) || [];
    charts.forEach(function (chart) {
      if (chart && typeof chart.destroy === "function") chart.destroy();
    });
    setState(stateKey, []);
  }

  function bumpModalRenderToken(modalKey) {
    modalRenderState[modalKey].generation += 1;
    return modalRenderState[modalKey].generation;
  }

  function isModalRenderCurrent(modalKey, renderToken, modalEl) {
    return (
      modalEl &&
      modalEl.classList &&
      modalEl.classList.contains("show") &&
      modalRenderState[modalKey].generation === renderToken
    );
  }

  function loadNeighborhoodChartsPayload() {
    var d = requireDeps();
    var cached = d.getNeighborhoodChartsPayload();
    if (cached) return Promise.resolve(cached);
    return d.fetchJsonWithGzipFallback(d.urls.neighborhoodCharts)
      .then(function (data) {
        d.setNeighborhoodChartsPayload(data);
        return data;
      })
      .catch(function (err) {
        console.warn("Failed to load neighborhood_charts.json:", err);
        var fallback = { inventory_clean: {}, inventory_legacy: {} };
        d.setNeighborhoodChartsPayload(fallback);
        return fallback;
      });
  }

  function pieSlicesFromInventoryCounts(invObj) {
    var d = requireDeps();
    var labels = [];
    var values = [];
    var colors = [];
    if (!invObj || typeof invObj !== "object") return { labels: labels, values: values, colors: colors };
    Object.keys(invObj)
      .filter(function (type) {
        return type !== "trees" && type !== "street-lights";
      })
      .sort(function (a, b) {
        return (invObj[b] || 0) - (invObj[a] || 0);
      })
      .forEach(function (type) {
        var count = Number(invObj[type]) || 0;
        if (count <= 0) return;
        var config = d.getAmenityConfig(type);
        labels.push(config.label);
        values.push(count);
        colors.push(config.color);
      });
    return { labels: labels, values: values, colors: colors };
  }

  function loadNeighborhoods() {
    var d = requireDeps();
    var cached = d.getNeighborhoodsData();
    if (cached) return Promise.resolve(cached);
    return d.fetchJsonWithGzipFallback(d.urls.neighborhoods)
      .then(function (data) {
        d.setNeighborhoodsData(data);
        return data;
      })
      .catch(function (err) {
        console.error("Failed to load neighborhoods:", err);
        return { type: "FeatureCollection", features: [] };
      });
  }

  function loadNeighborhoodSurfaceData() {
    var d = requireDeps();
    var cached = d.getNeighborhoodSurfaceData();
    if (cached) return Promise.resolve(cached);
    return d.fetchJsonWithGzipFallback(d.urls.neighborhoodSurface)
      .then(function (data) {
        d.setNeighborhoodSurfaceData(data);
        return data;
      })
      .catch(function (err) {
        console.warn("Failed to load neighborhood_surface.geojson:", err);
        var fallback = { type: "FeatureCollection", features: [] };
        d.setNeighborhoodSurfaceData(fallback);
        return fallback;
      });
  }

  function getNeighborhoodHexSurfaceOpacityExpression() {
    return [
      "interpolate",
      ["linear"],
      ["zoom"],
      10,
      1,
      12,
      1,
      13,
      0.88,
      14.5,
      0.68,
      16.5,
      0.5,
      18.5,
      0.32,
      20,
      0.2,
      21,
      0.12,
      24,
      0.12,
    ];
  }

  function loadCitywideStats() {
    var d = requireDeps();
    var cached = d.getCitywideStats();
    if (cached) return Promise.resolve(cached);
    return d.fetchJsonWithGzipFallback(d.urls.citywideStats)
      .then(function (data) {
        d.setCitywideStats(data);
        return data;
      })
      .catch(function (err) {
        console.error("Failed to load citywide stats:", err);
        return null;
      });
  }

  function showNeighborhoodModal(feature) {
    var d = requireDeps();
    if (!feature || !feature.properties) return;
    d.setSelectedNeighborhood(feature);
    var renderToken = bumpModalRenderToken("neighborhood");
    var props = feature.properties;
    var scoreMinutes = d.getScoreMinutes();
    var sfx = "_" + scoreMinutes + "min";
    var isWeighted = d.getScoreMode() === "weighted";

    if (isWeighted) {
      loadCitywideStats().then(function () {
        if (modalRenderState.neighborhood.generation !== renderToken) return;
        var citywideStats = d.getCitywideStats();
        var selectedCategoryLabel = d.getSelectedWeightedCategoryLabel();
        var avgScore = d.getWeightedAverageValueFromSource(props, sfx);
        var cityAvgScore = d.getCitywideWeightedAverageScore(citywideStats, sfx);
        d.neighborhoodModalTitle.textContent = props.Name || "Unknown";
        d.neighborhoodModalSubtitle.textContent =
          d.formatMetricNumber(avgScore) + "/100 \u2022 " + selectedCategoryLabel;

        var body = d.neighborhoodModalBody;
        destroyCharts("getNeighborhoodCharts");

        var html = "";
        html += '<div class="cw-summary">';
        html += '<div class="cw-stat-card"><div class="cw-stat-value">' + (props.building_count || 0) + '</div><div class="cw-stat-label">Buildings</div></div>';
        html += '<div class="cw-stat-card"><div class="cw-stat-value">' + d.formatMetricNumber(avgScore) + '</div><div class="cw-stat-label">Neighborhood avg (' + selectedCategoryLabel + ')</div></div>';
        html += '<div class="cw-stat-card"><div class="cw-stat-value">' + d.formatMetricNumber(cityAvgScore) + '</div><div class="cw-stat-label">City avg (' + selectedCategoryLabel + ')</div></div>';
        html += '<div class="cw-stat-card"><div class="cw-stat-value">' + (props["coverage_weighted" + sfx] || 0) + '%</div><div class="cw-stat-label">Coverage</div></div>';
        html += "</div>";

        var selectedStem = d.getSelectedWeightedCategoryStem();
        if (!selectedStem) {
          var highlights = d.weightedCategoryHighlightsFromSource(props, sfx);
          html += '<div class="cw-section">';
          html += '<div class="cw-section-title">Urban95 category highlights</div>';
          html += '<div class="u95-highlight-grid">';
          highlights.forEach(function (item) {
            html += '<div class="u95-highlight-card">';
            html += '<div class="u95-highlight-name">' + item.label + "</div>";
            html += '<div class="u95-highlight-score">' + d.formatMetricNumber(item.score) + "</div>";
            html += '<div class="u95-highlight-meta">' + Math.round(item.weight * 100) + '% weight</div>';
            html += "</div>";
          });
          html += '</div></div>';
        }

        html += '<div class="cw-section">';
        html += '<div class="cw-section-title">Building score distribution (citywide)</div>';
        html += '<p style="font-size:12px;color:#64748b;margin:0 0 10px 0">Histogram of Urban95 scores across all buildings</p>';
        html += '<div class="cw-chart-container"><canvas id="hood-score-hist"></canvas></div>';
        html += '</div>';

        html += '<div class="cw-section">';
        html += '<div class="cw-section-title">Subcategory score comparison</div>';
        html += '<p style="font-size:12px;color:#64748b;margin:0 0 10px 0">Horizontal bars = neighborhood average, dashed marker = city average</p>';
        html += '<div class="u95-compare-container" id="hood-subcategory-compare-list"></div>';
        html += '</div>';

        body.innerHTML = html;
        d.neighborhoodModal.classList.add("show");
        d.ensureChartJsLoaded()
          .then(function () {
            d.requestAnimationFrame(function () {
              if (!isModalRenderCurrent("neighborhood", renderToken, d.neighborhoodModal)) return;
              renderNeighborhoodCharts({
                weighted: true,
                sfx: sfx,
                neighborhoodProps: props,
              });
            });
          })
          .catch(function (err) {
            console.error("Failed to load Chart.js:", err);
          });
      });
      return;
    }

    loadNeighborhoodChartsPayload().then(function (invPayload) {
      if (modalRenderState.neighborhood.generation !== renderToken) return;
      var invLegacy = (invPayload.inventory_legacy && invPayload.inventory_legacy[props.Name]) || {};
      var pct = props[d.getNeighborhoodPercentileKey(sfx)] || 0;

      d.neighborhoodModalTitle.textContent = props.Name || "Unknown";
      d.neighborhoodModalSubtitle.textContent =
        pct + d.getOrdinalSuffix(pct) + " percentile \u2022 " + scoreMinutes + "-min walk \u2022 " + d.getScoreModeLabel();

      var body = d.neighborhoodModalBody;
      destroyCharts("getNeighborhoodCharts");

      var html = "";
      html += '<div class="cw-summary">';
      html += '<div class="cw-stat-card"><div class="cw-stat-value">' + (props.building_count || 0) + '</div><div class="cw-stat-label">Buildings</div></div>';
      html += '<div class="cw-stat-card"><div class="cw-stat-value">' + pct + '%</div><div class="cw-stat-label">Citywide percentile</div></div>';
      html += '<div class="cw-stat-card"><div class="cw-stat-value">' + (props["coverage" + sfx] || 0) + '%</div><div class="cw-stat-label">Coverage</div></div>';
      html += "</div>";
      html += '<div class="cw-section">';
      html += '<div class="cw-section-title">Amenity breakdown</div>';
      html += '<p style="font-size:12px;color:#64748b;margin:0 0 10px 0">Point counts in this area (legacy taxonomy)</p>';
      html += '<div class="cw-chart-container cw-pie-chart"><canvas id="hood-amenity-pie"></canvas></div>';
      html += "</div>";

      var barSlices = pieSlicesFromInventoryCounts(invLegacy);
      if (barSlices.values.length > 0) {
        html += '<div class="cw-section">';
        html += '<div class="cw-section-title">Counts by type</div>';
        html += '<div class="cw-chart-container" style="height:' + Math.max(200, barSlices.values.length * 28) + 'px"><canvas id="hood-type-bar"></canvas></div>';
        html += "</div>";
      }

      body.innerHTML = html;
      d.neighborhoodModal.classList.add("show");
      d.ensureChartJsLoaded()
        .then(function () {
          d.requestAnimationFrame(function () {
            if (!isModalRenderCurrent("neighborhood", renderToken, d.neighborhoodModal)) return;
            renderNeighborhoodCharts({ weighted: false, invObj: invLegacy });
          });
        })
        .catch(function (err) {
          console.error("Failed to load Chart.js:", err);
        });
    });
  }

  function hideNeighborhoodModal() {
    var d = requireDeps();
    bumpModalRenderToken("neighborhood");
    var modal = d.neighborhoodModal;
    if (modal) modal.classList.remove("show");
    destroyCharts("getNeighborhoodCharts");
  }

  function renderNeighborhoodCharts(context) {
    var d = requireDeps();
    var citywideStats = d.getCitywideStats();
    var neighborhoodCharts = d.getNeighborhoodCharts();
    if (typeof Chart === "undefined") return;
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";

    if (context && context.weighted) {
      var sfx = context.sfx;
      var neighborhoodProps = context.neighborhoodProps || {};
      var selectedStem = d.getSelectedWeightedCategoryStem();
      var histCanvas = d.neighborhoodModalBody.querySelector("#hood-score-hist");
      if (histCanvas) {
        var dist =
          !selectedStem && citywideStats && citywideStats["distribution_weighted" + sfx]
            ? citywideStats["distribution_weighted" + sfx]
            : d.buildHistogramDistributionFromScores(d.collectBuildingScores(), 10);
        var labels = dist.edges.slice(0, -1).map(function (edge, index) {
          return edge + "-" + dist.edges[index + 1];
        });
        var breakpoints = [0, 25, 50, 75, 100];
        neighborhoodCharts.push(
          new Chart(histCanvas, {
            type: "bar",
            data: {
              labels: labels,
              datasets: [
                {
                  data: dist.counts,
                  backgroundColor: dist.edges.slice(0, -1).map(function (edge, index) {
                    var midpoint = (edge + dist.edges[index + 1]) / 2;
                    return d.getColorForValue(midpoint, breakpoints);
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
                y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 10 } }, title: { display: true, text: "Buildings", font: { size: 11 } } },
              },
            },
          })
        );
      }

      var subList = d.neighborhoodModalBody.querySelector("#hood-subcategory-compare-list");
      if (subList && citywideStats) {
        var rows = d.weightedSubcategoryComparisonRows(neighborhoodProps, citywideStats, sfx);
        d.renderWeightedSubcategoryComparisonList(subList, rows);
      }
      d.setNeighborhoodCharts(neighborhoodCharts);
      return;
    }

    var invObj = (context && context.invObj) || {};
    var pieCanvas = d.neighborhoodModalBody.querySelector("#hood-amenity-pie");
    var pie = pieSlicesFromInventoryCounts(invObj);
    if (pieCanvas && pie.values.length > 0) {
      neighborhoodCharts.push(
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
              legend: { position: "right", labels: { boxWidth: 12, padding: 10, font: { size: 11 } } },
            },
          },
        })
      );
    }

    var barCanvas = d.neighborhoodModalBody.querySelector("#hood-type-bar");
    if (barCanvas && pie.values.length > 0) {
      neighborhoodCharts.push(
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
    d.setNeighborhoodCharts(neighborhoodCharts);
  }

  function getNeighborhoodFeatureAtPoint(point) {
    var d = requireDeps();
    var hits = d.map.queryRenderedFeatures(point, { layers: ["neighborhoods-fill"] });
    if (!hits || hits.length === 0) return null;
    return hits[0];
  }

  function showNeighborhoodAreaTooltip(point, feature) {
    var d = requireDeps();
    var tooltip = d.tooltipEl;
    if (!feature || !feature.properties) {
      tooltip.style.display = "none";
      return;
    }
    var props = feature.properties || {};
    var hexId = props.hex_id || "Hex";
    var neighborhoodName = props.neighborhood_name || "Unknown neighborhood";
    var hasBuildings = Number(props.has_buildings) === 1;
    if (!hasBuildings) {
      tooltip.textContent = "Hexagon " + hexId + " in " + neighborhoodName + "\nNo residential buildings";
    } else {
      var scoreKey = d.getNeighborhoodSurfaceScorePropertyKey() || "score";
      var score = Math.max(0, Math.min(100, Number(props[scoreKey]) || 0));
      if (d.getScoreMode() === "weighted") {
        tooltip.textContent = hexId + " in " + neighborhoodName + "\nArea score " + d.formatMetricNumber(score) + "/100";
      } else {
        var pct = Math.round(score);
        tooltip.textContent =
          hexId + " in " + neighborhoodName + "\nArea score " + pct + d.getOrdinalSuffix(pct) + " percentile";
      }
    }
    tooltip.style.display = "block";
    tooltip.style.left = point.x + 12 + "px";
    tooltip.style.top = point.y + 12 + "px";
  }

  function showCitywideModal() {
    var d = requireDeps();
    var modal = d.citywideModal;
    if (modal && !modal.classList.contains("show")) {
      bumpModalRenderToken("citywide");
      modal.classList.add("show");
    }
  }

  function hideCitywideModal() {
    var d = requireDeps();
    bumpModalRenderToken("citywide");
    var modal = d.citywideModal;
    if (modal) modal.classList.remove("show");
    destroyCharts("getCitywideCharts");
  }

  function updateCitywideModalTitle() {
    var d = requireDeps();
    var titleEl = d.citywideTitle;
    var subtitleEl = d.citywideSubtitle;
    if (!titleEl || !subtitleEl) return;
    if (d.getScoreMode() === "weighted") {
      var label = d.getSelectedWeightedCategoryLabel();
      titleEl.textContent = "Beer Sheva \u2013 City Overview for " + label + " Score";
      subtitleEl.textContent =
        label === "Urban95"
          ? "Weighted Urban95 score across the city"
          : label + " subscore across the city";
    } else {
      titleEl.textContent = "Beer Sheva \u2013 City Overview";
      subtitleEl.textContent = "Accessibility across the city";
    }
  }

  function renderCitywideModal() {
    var d = requireDeps();
    var renderToken = bumpModalRenderToken("citywide");
    var body = d.citywideBody;
    var stats = d.getCitywideStats();
    if (!body || !stats) return;

    destroyCharts("getCitywideCharts");
    updateCitywideModalTitle();

    var scoreMinutes = d.getScoreMinutes();
    var sfx = "_" + scoreMinutes + "min";
    var isWeighted = d.getScoreMode() === "weighted";
    var html = "";

    if (isWeighted) {
      var selectedCategoryLabel = d.getSelectedWeightedCategoryLabel();
      var selectedStem = d.getSelectedWeightedCategoryStem();
      var highlights = d.weightedCategoryHighlightsFromSource(stats, sfx);
      html += '<div class="cw-summary">';
      html += '<div class="cw-stat-card"><div class="cw-stat-value">' + (stats.total_buildings || 0).toLocaleString() + '</div><div class="cw-stat-label">Buildings</div></div>';
      html += '<div class="cw-stat-card"><div class="cw-stat-value">' + d.formatMetricNumber(d.getCitywideWeightedAverageScore(stats, sfx)) + '</div><div class="cw-stat-label">City average (' + selectedCategoryLabel + ')</div></div>';
      html += "</div>";

      if (!selectedStem) {
        html += '<div class="cw-section">';
        html += '<div class="cw-section-title">Urban95 category highlights</div>';
        html += '<div class="u95-highlight-grid">';
        highlights.forEach(function (item) {
          html += '<div class="u95-highlight-card">';
          html += '<div class="u95-highlight-name">' + item.label + "</div>";
          html += '<div class="u95-highlight-score">' + d.formatMetricNumber(item.score) + "</div>";
          html += '<div class="u95-highlight-meta">' + Math.round(item.weight * 100) + '% weight</div>';
          html += "</div>";
        });
        html += '</div></div>';
      }

      html += '<div class="cw-section">';
      html += '<div class="cw-section-title">Building score distribution \u2013 ' + selectedCategoryLabel + "</div>";
      html += '<p style="font-size:12px;color:#64748b;margin:0 0 10px 0">Citywide distribution</p>';
      html += '<div class="cw-chart-container"><canvas id="cw-score-hist"></canvas></div>';
      html += "</div>";

      html += '<div class="cw-section">';
      html += '<div class="cw-section-title">Average ' + selectedCategoryLabel + " score by neighborhood</div>";
      html += '<div class="cw-chart-container" style="height:420px"><canvas id="cw-neighborhood-score-bar"></canvas></div>';
      html += "</div>";
    } else {
      var amenityTotal =
        stats.total_amenities != null
          ? stats.total_amenities
          : Object.values(stats.amenity_counts || {}).reduce(function (sum, value) {
              return sum + value;
            }, 0);
      html += '<div class="cw-summary">';
      html += '<div class="cw-stat-card"><div class="cw-stat-value">' + (stats.total_buildings || 0).toLocaleString() + '</div><div class="cw-stat-label">Buildings</div></div>';
      html += '<div class="cw-stat-card"><div class="cw-stat-value">' + amenityTotal.toLocaleString() + '</div><div class="cw-stat-label">Amenities</div></div>';
      html += "</div>";

      html += '<div class="cw-section">';
      html += '<div class="cw-section-title">Amenity inventory</div>';
      html += '<p style="font-size:12px;color:#64748b;margin:0 0 10px 0">Point counts by type (legacy taxonomy)</p>';
      html += '<div class="cw-chart-container cw-pie-chart"><canvas id="cw-amenity-pie"></canvas></div>';
      html += "</div>";

      var histDist =
        d.getScoreMode() === "expanded" && stats["distribution_expanded" + sfx]
          ? "Amenities Focus"
          : "reachability index";
      html += '<div class="cw-section">';
      html += '<div class="cw-section-title">Building score distribution \u2013 ' + histDist + "</div>";
      html += '<p style="font-size:12px;color:#64748b;margin:0 0 10px 0">' + scoreMinutes + "-min walk \u2022 Matches " + d.getScoreModeLabel() + " in Building mode</p>";
      html += '<div class="cw-chart-container"><canvas id="cw-score-hist"></canvas></div>';
      html += "</div>";

      var ranking = (stats.neighborhood_ranking || [])
        .slice()
        .sort(function (a, b) {
          return (Number(b["pct_overall" + sfx]) || 0) - (Number(a["pct_overall" + sfx]) || 0);
        });
      html += '<div class="cw-section">';
      html += '<div class="cw-section-title">Neighborhood ranking</div>';
      html += '<ul class="cw-ranking-list">';
      ranking.forEach(function (row, index) {
        var score = Number(row["avg_overall" + sfx]) || 0;
        var pct = Math.min(100, Math.max(0, Number(row["pct_overall" + sfx]) || 0));
        html += '<div class="cw-ranking-item">';
        html += '<div class="cw-rank-num">' + (index + 1) + "</div>";
        html += '<div class="cw-rank-name">' + row.name + "</div>";
        html += '<div class="cw-rank-bar-wrap"><div class="cw-rank-bar" style="width:' + pct + '%;background:#22c55e"></div></div>';
        html += '<div class="cw-rank-score"><strong>' + pct + '%</strong><span class="cw-rank-sub">' + d.formatMetricNumber(score) + " index</span></div>";
        html += "</div>";
      });
      html += "</ul></div>";
    }

    body.innerHTML = html;
    d.citywideModal.classList.add("show");
    d.ensureChartJsLoaded()
      .then(function () {
        d.requestAnimationFrame(function () {
          if (!isModalRenderCurrent("citywide", renderToken, d.citywideModal)) return;
          renderCitywideCharts(sfx);
        });
      })
      .catch(function (err) {
        console.error("Failed to load Chart.js:", err);
      });
  }

  function renderCitywideCharts(sfx) {
    var d = requireDeps();
    var citywideStats = d.getCitywideStats();
    var citywideCharts = d.getCitywideCharts();
    if (!citywideStats || typeof Chart === "undefined") return;

    Chart.defaults.font.family = "Inter, system-ui, sans-serif";

    if (d.getScoreMode() !== "weighted") {
      var pieCanvas = d.citywideBody.querySelector("#cw-amenity-pie");
      if (pieCanvas) {
        var counts = citywideStats.amenity_counts || {};
        var labels = [];
        var values = [];
        var colors = [];
        Object.entries(counts)
          .filter(function (entry) {
            return entry[0] !== "trees" && entry[0] !== "street-lights";
          })
          .sort(function (a, b) {
            return b[1] - a[1];
          })
          .forEach(function (entry) {
            var config = d.getAmenityConfig(entry[0]);
            labels.push(config.label);
            values.push(entry[1]);
            colors.push(config.color);
          });

        var pieChart = new Chart(pieCanvas, {
          type: "doughnut",
          data: {
            labels: labels,
            datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: "right", labels: { boxWidth: 12, padding: 8, font: { size: 11 } } },
            },
          },
        });
        citywideCharts.push(pieChart);
      }
    }

    var histCanvas = d.citywideBody.querySelector("#cw-score-hist");
    if (histCanvas) {
      var selectedWeightedStem = d.getScoreMode() === "weighted" ? d.getSelectedWeightedCategoryStem() : null;
      var dist = null;
      if (d.getScoreMode() === "weighted" && !selectedWeightedStem && citywideStats["distribution_weighted" + sfx]) {
        dist = citywideStats["distribution_weighted" + sfx];
      } else if (d.getScoreMode() === "expanded" && citywideStats["distribution_expanded" + sfx]) {
        dist = citywideStats["distribution_expanded" + sfx];
      } else {
        dist = citywideStats["distribution" + sfx];
      }
      if (d.getScoreMode() === "weighted" && selectedWeightedStem) {
        dist = d.buildHistogramDistributionFromScores(d.collectBuildingScores(), 10);
      }
      if (dist) {
        var buildingScores = d.collectBuildingScores();
        var breakpoints =
          d.getScoreMode() === "weighted" ? [0, 25, 50, 75, 100] : d.percentileBreakpoints(buildingScores);
        var histLabels = dist.edges.slice(0, -1).map(function (edge, index) {
          return edge + "-" + dist.edges[index + 1];
        });
        var histChart = new Chart(histCanvas, {
          type: "bar",
          data: {
            labels: histLabels,
            datasets: [
              {
                data: dist.counts,
                backgroundColor: dist.edges.slice(0, -1).map(function (edge, index) {
                  var midpoint = (edge + dist.edges[index + 1]) / 2;
                  return d.getColorForValue(midpoint, breakpoints);
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
              y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 10 } }, title: { display: true, text: "Buildings", font: { size: 11 } } },
            },
          },
        });
        citywideCharts.push(histChart);
      }
    }

    if (d.getScoreMode() === "weighted") {
      var neighborhoodCanvas = d.citywideBody.querySelector("#cw-neighborhood-score-bar");
      if (neighborhoodCanvas) {
        var ranking = d.weightedNeighborhoodRankingRows(citywideStats, sfx);
        var selectedStem = d.getSelectedWeightedCategoryStem();
        var selectedCategoryLabel = d.getSelectedWeightedCategoryLabel();
        var scoreKey = selectedStem ? "avg_score_weighted_" + selectedStem + sfx : "avg_score_weighted" + sfx;
        citywideCharts.push(
          new Chart(neighborhoodCanvas, {
            type: "bar",
            data: {
              labels: ranking.map(function (row) {
                return row.name;
              }),
              datasets: [
                {
                  label: "Average " + selectedCategoryLabel + " score",
                  data: ranking.map(function (row) {
                    return Number(row[scoreKey]) || 0;
                  }),
                  backgroundColor: "#2563eb",
                  borderRadius: 3,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              indexAxis: "y",
              plugins: { legend: { display: false } },
              scales: {
                x: { min: 0, max: 100, title: { display: true, text: "Score (0-100)" } },
                y: { ticks: { font: { size: 10 } } },
              },
            },
          })
        );
      }
    }
    d.setCitywideCharts(citywideCharts);
  }

  function bindDashboardChrome() {
    if (dashboardChromeBound || !deps) return;
    dashboardChromeBound = true;

    var citywideClose = deps.citywideClose;
    var citywideModal = deps.citywideModal;
    var neighborhoodModalClose = deps.neighborhoodModalClose;
    var neighborhoodModal = deps.neighborhoodModal;

    if (citywideClose) {
      citywideClose.addEventListener("click", function () {
        hideCitywideModal();
        deps.switchMode("house");
      });
    }
    if (citywideModal) {
      citywideModal.addEventListener("click", function (event) {
        if (event.target === this) {
          hideCitywideModal();
          deps.switchMode("house");
        }
      });
    }
    if (neighborhoodModalClose) {
      neighborhoodModalClose.addEventListener("click", hideNeighborhoodModal);
    }
    if (neighborhoodModal) {
      neighborhoodModal.addEventListener("click", function (event) {
        if (event.target === this) hideNeighborhoodModal();
      });
    }
  }

  window.Urban95Dashboards = {
    configure: configure,
    loadNeighborhoodChartsPayload: loadNeighborhoodChartsPayload,
    pieSlicesFromInventoryCounts: pieSlicesFromInventoryCounts,
    loadNeighborhoods: loadNeighborhoods,
    loadNeighborhoodSurfaceData: loadNeighborhoodSurfaceData,
    getNeighborhoodHexSurfaceOpacityExpression: getNeighborhoodHexSurfaceOpacityExpression,
    loadCitywideStats: loadCitywideStats,
    showNeighborhoodModal: showNeighborhoodModal,
    hideNeighborhoodModal: hideNeighborhoodModal,
    renderNeighborhoodCharts: renderNeighborhoodCharts,
    getNeighborhoodFeatureAtPoint: getNeighborhoodFeatureAtPoint,
    showNeighborhoodAreaTooltip: showNeighborhoodAreaTooltip,
    showCitywideModal: showCitywideModal,
    hideCitywideModal: hideCitywideModal,
    updateCitywideModalTitle: updateCitywideModalTitle,
    renderCitywideModal: renderCitywideModal,
    renderCitywideCharts: renderCitywideCharts,
  };
})();
