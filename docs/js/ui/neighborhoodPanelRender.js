(function () {
  "use strict";

  function statusDefinitions() {
    return (window.Urban95StatusScale && window.Urban95StatusScale.definitions) || [];
  }

  function rawFiniteNumber(value) {
    if (typeof value !== "number" && (typeof value !== "string" || value.trim() === "")) {
      return null;
    }
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function resolveStatusComposition(props, metric) {
    var prefix = metric && metric.statusCompositionPrefix;
    if (!prefix || !props) return null;
    var definitions = statusDefinitions();
    if (definitions.length !== 4) return null;
    var parts = definitions.map(function (definition) {
      var countKey = prefix + "_count_" + definition.token;
      var pctKey = prefix + "_pct_" + definition.token;
      var hasCount = Object.prototype.hasOwnProperty.call(props, countKey);
      var hasPct = Object.prototype.hasOwnProperty.call(props, pctKey);
      var count = rawFiniteNumber(props[countKey]);
      var pct = rawFiniteNumber(props[pctKey]);
      if (!hasCount || !hasPct || count == null || count < 0 || pct == null || pct < 0 || pct > 100) {
        return null;
      }
      return {
        token: definition.token,
        label: definition.label,
        color: definition.color,
        count: count,
        pct: pct,
      };
    });
    return parts.indexOf(null) === -1 ? parts : null;
  }

  function renderStatusComposition(renderCtx, props, metric) {
    var escape = renderCtx && renderCtx.escapeHtml ? renderCtx.escapeHtml : String;
    var parts = resolveStatusComposition(props, metric);
    if (!parts) {
      if (metric && metric.kind === "diagnostic-access") {
        return '<p class="sidebar-section-hint">Neighborhood averages are not published for this access view.</p>';
      }
      return '<p class="sidebar-section-hint">Summary unavailable</p>';
    }
    var html = '<div class="u95-status-composition" role="list" aria-label="Status composition">';
    html += '<div class="u95-status-composition-bar" role="group" aria-label="Status composition bar">';
    parts.forEach(function (part) {
      var displayPct = Math.round(part.pct);
      var segmentLabel = part.label + ": " + part.count + " buildings (" + displayPct + "%)";
      html += '<span class="u95-status-composition-segment u95-status-composition-segment-' + escape(part.token) +
        '" style="width:' + escape(String(part.pct)) + '%;background:' + escape(part.color) +
        '" role="img" aria-label="' + escape(segmentLabel) + '" title="' + escape(segmentLabel) + '"></span>';
    });
    html += "</div>";
    parts.forEach(function (part) {
      var pct = part.pct == null ? "" : String(Math.round(part.pct)) + "%";
      html +=
        '<div class="u95-status-composition-part" role="listitem">' +
        '<span class="u95-status-composition-swatch" style="background:' + escape(part.color) + '"></span>' +
        '<span class="u95-status-composition-label">' + escape(part.label) + '</span>' +
        '<span class="u95-status-composition-value">' + escape(String(part.count)) +
        (pct ? ' · ' + escape(pct) : "") +
        '</span></div>';
    });
    return html + "</div>";
  }

  function statusLabel(value) {
    var scale = window.Urban95StatusScale;
    var token = scale && typeof scale.normalize === "function" ? scale.normalize(value) : "unknown";
    var definition = statusDefinitions().filter(function (item) { return item.token === token; })[0];
    return definition ? definition.label : "Unknown";
  }

  function statusSummaryLabel(props, metric) {
    if (!metric || !metric.areaStatusKey || !props ||
        !Object.prototype.hasOwnProperty.call(props, metric.areaStatusKey) ||
        !resolveStatusComposition(props, metric)) {
      return null;
    }
    return statusLabel(props[metric.areaStatusKey]);
  }

  function populateHeaderStatus(renderCtx, props, metric) {
    var hero = renderCtx && renderCtx.heroEl;
    var meta = renderCtx && renderCtx.metaEl;
    if (!hero || !meta) return;
    var label = (metric && metric.label) || "All indicators overview";
    var status = statusSummaryLabel(props, metric) || "Unavailable";
    hero.innerHTML =
      '<div class="percentile-summary score-explain-sidebar-hero-compact"><p class="score-explain-hero-kicker">' +
      renderCtx.escapeHtml(label) + '</p><div class="percentile-value">' +
      renderCtx.escapeHtml(status) + "</div></div>";
    meta.innerHTML =
      '<div class="score-explain-building-ctx"><div class="building-ctx-text"><span class="building-ctx-id" dir="rtl" lang="he">' +
      renderCtx.escapeHtml((props && props.Name) || "Unknown") +
      "</span></div></div>";
  }

  function buildBodyHTMLStatus(renderCtx, props, metric, categoryMetrics) {
    var html = '<div class="cw-summary"><div class="cw-stat-card"><div class="cw-stat-value">' +
      renderCtx.escapeHtml(String((props && props.building_count) || 0)) +
      '</div><div class="cw-stat-label">Buildings</div></div></div>';
    html += '<div class="cw-section"><div class="cw-section-title">Status composition</div>' +
      renderStatusComposition(renderCtx, props, metric) + "</div>";
    if (metric && metric.kind === "weighted-overall") {
      html += '<div class="cw-section"><div class="cw-section-title">Category status compositions</div>';
      (categoryMetrics || []).forEach(function (category) {
        html += '<div class="u95-status-category"><strong>' + renderCtx.escapeHtml(category.label) + "</strong>" +
          renderStatusComposition(renderCtx, props, category) + "</div>";
      });
      html += "</div>";
    }
    return html;
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
    resolveStatusComposition: resolveStatusComposition,
    renderStatusComposition: renderStatusComposition,
    statusSummaryLabel: statusSummaryLabel,
    populateHeaderStatus: populateHeaderStatus,
    buildBodyHTMLStatus: buildBodyHTMLStatus,
    populateHeaderExpanded: populateHeaderExpanded,
    buildBodyHTMLExpanded: buildBodyHTMLExpanded,
    bindCharts: bindCharts,
    destroyCharts: destroyCharts,
  };
})();
