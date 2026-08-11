(function () {
  "use strict";

  var palette = window.Urban95Palette;
  if (!palette) {
    throw new Error(
      "Urban95NeighborhoodCompareRender requires Urban95Palette (load js/core/palette.js first)"
    );
  }

  // Slot colors: Environmental Quality (sky) + Family Services (lavender).
  var SLOT_A_COLOR = palette.sky;
  var SLOT_B_COLOR = palette.lavender;
  var SLOT_A_FILL = "rgba(58, 173, 224, 0.55)";
  var SLOT_B_FILL = "rgba(143, 92, 232, 0.5)";
  var TOP_GAP_COUNT = 3;

  function clampScore(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function nameOf(feature) {
    return (feature && feature.properties && feature.properties.Name) || "Unknown";
  }

  function buildingCountOf(feature) {
    var n = Number(feature && feature.properties && feature.properties.building_count);
    return Number.isFinite(n) ? n : 0;
  }

  function statusToken(value) {
    var scale = window.Urban95StatusScale;
    var token = scale && typeof scale.normalize === "function" ? scale.normalize(value) : "unknown";
    return /^(disappointing|functioning|thriving)$/.test(token) ? token : "unknown";
  }

  function statusLabel(token) {
    var definitions = (window.Urban95StatusScale && window.Urban95StatusScale.definitions) || [];
    var item = definitions.filter(function (definition) {
      return definition.token === token;
    })[0];
    return item ? item.label : "Unknown";
  }

  function renderStatusOverlayMarkerHtml(escapeHtml, identity, token) {
    return '<i class="u95-status-overlay-marker u95-status-overlay-marker--' + identity +
      '" data-status="' + escapeHtml(token) + '" aria-hidden="true"></i>';
  }

  function renderStatusOverlayReadoutHtml(escapeHtml, identity, token) {
    return '<span class="u95-status-overlay-readout u95-status-overlay-readout--' + identity +
      '" data-status="' + escapeHtml(token) + '"><i aria-hidden="true"></i><span>' +
      escapeHtml(statusLabel(token)) + "</span></span>";
  }

  function renderCombinedStatusOverlayReadoutHtml(escapeHtml, token) {
    return '<span class="u95-status-overlay-readout u95-status-overlay-readout--combined" data-status="' +
      escapeHtml(token) + '"><i aria-hidden="true"></i><span>' +
      escapeHtml(statusLabel(token)) + "</span></span>";
  }

  function renderSharedStatusOverlayHtml(escapeHtml, nameA, statusA, nameB, statusB, size) {
    var tokenA = statusToken(statusA);
    var tokenB = statusToken(statusB);
    var knownTokens = { disappointing: true, functioning: true, thriving: true };
    var signalClass = size === "hero" ? "status-signal--hero" : "status-signal--row";
    var tokens = ["disappointing", "functioning", "thriving"];
    var ariaLabel = nameA + ": " + statusLabel(tokenA) + "; " + nameB + ": " + statusLabel(tokenB);
    var html = '<span class="u95-status-overlay u95-status-overlay--' + (size === "hero" ? "hero" : "row") +
      '" aria-label="' + escapeHtml(ariaLabel) + '" data-status-first="' + escapeHtml(tokenA) +
      '" data-status-second="' + escapeHtml(tokenB) + '"><span class="status-signal ' + signalClass +
      '" aria-hidden="true">';
    tokens.forEach(function (token) {
      html += '<i class="status-signal-lamp status-signal-lamp--' + token +
        (tokenA === token || tokenB === token ? " is-active" : "") + '"></i>';
    });
    html += "</span>";
    if (knownTokens[tokenA]) html += renderStatusOverlayMarkerHtml(escapeHtml, "first", tokenA);
    else html += '<i class="u95-status-overlay-anchor u95-status-overlay-anchor--first" data-status="unknown" aria-hidden="true"></i>';
    if (knownTokens[tokenB]) html += renderStatusOverlayMarkerHtml(escapeHtml, "second", tokenB);
    else html += '<i class="u95-status-overlay-anchor u95-status-overlay-anchor--second" data-status="unknown" aria-hidden="true"></i>';
    html += '<span class="u95-status-overlay-status" aria-hidden="true">' +
      (tokenA === tokenB
        ? renderCombinedStatusOverlayReadoutHtml(escapeHtml, tokenA)
        : renderStatusOverlayReadoutHtml(escapeHtml, "first", tokenA) +
          renderStatusOverlayReadoutHtml(escapeHtml, "second", tokenB)) + "</span></span>";
    return html;
  }

  function renderStatusOverlayLegendHtml(escapeHtml, nameA, nameB) {
    return '<div class="u95-status-overlay-legend" role="group" aria-label="Compared neighborhoods">' +
      '<span class="u95-status-overlay-legend-item u95-status-overlay-legend-item--first">' +
      '<i class="u95-status-overlay-legend-marker" aria-hidden="true"></i><span dir="rtl" lang="he">' + escapeHtml(nameA) +
      "</span></span>" +
      '<span class="u95-status-overlay-legend-item u95-status-overlay-legend-item--second">' +
      '<i class="u95-status-overlay-legend-marker" aria-hidden="true"></i><span dir="rtl" lang="he">' + escapeHtml(nameB) +
      "</span></span></div>";
  }

  function renderStatusMetricLabelHtml(host, escapeHtml, metric, kind) {
    if (kind === "diagnostic") {
      return '<span class="u95-neighborhood-compare-spine-label">' +
        escapeHtml(metric.label) + "</span>";
    }
    var iconFn = kind === "category" ? host.getWeightedCategoryIcon : host.getWeightedSubcategoryIcon;
    var stem = kind === "category" ? metric.selectedWeightedStem : metric.selectedWeightedSubStem;
    var icon = typeof iconFn === "function" ? iconFn(stem) : "";
    if (typeof host.renderHorizonLabelCell === "function" && icon) {
      if (kind === "category") {
        return host.renderHorizonLabelCell(metric.label, icon, "", metric.color || null);
      }
      return host.renderHorizonLabelCell(metric.label, icon, "", null, {
        iconColor: host.scoreExplainIconNeutral || "#64748b",
        colorLabelText: false,
      });
    }
    return '<span class="u95-neighborhood-compare-spine-label">' + escapeHtml(metric.label) + "</span>";
  }

  function buildStatusOverlayRowHtml(host, escapeHtml, metric, propsA, propsB, nameA, nameB, kind, rowClass, tagName) {
    var statusA = metric && metric.areaStatusKey ? propsA[metric.areaStatusKey] : "unknown";
    var statusB = metric && metric.areaStatusKey ? propsB[metric.areaStatusKey] : "unknown";
    var tag = tagName === "summary" ? "summary" : "div";
    return "<" + tag + ' class="u95-neighborhood-compare-overlay-row ' + rowClass +
      '" dir="ltr" data-status-metric="' + escapeHtml(metric.id || "") +
      '"><span class="u95-neighborhood-compare-spine">' +
      renderStatusMetricLabelHtml(host, escapeHtml, metric, kind) + "</span>" +
      renderSharedStatusOverlayHtml(escapeHtml, nameA, statusA, nameB, statusB, "row") +
      "</" + tag + ">";
  }

  function avgNeighborhoodBuildingCount(citywideStats) {
    var ranking =
      (citywideStats && citywideStats.neighborhood_ranking_weighted) ||
      (citywideStats && citywideStats.neighborhood_ranking) ||
      [];
    var sum = 0;
    var n = 0;
    for (var i = 0; i < ranking.length; i++) {
      var count = Number(ranking[i] && ranking[i].building_count);
      if (!Number.isFinite(count) || count < 0) continue;
      sum += count;
      n += 1;
    }
    if (n === 0) return null;
    return Math.round(sum / n);
  }

  function minutesKey(scoreMinutes) {
    return String(scoreMinutes) + "min";
  }

  function heNameHtml(escapeHtml, name) {
    return (
      '<span class="hood-he" dir="rtl" lang="he">' + escapeHtml(name) + "</span>"
    );
  }

  function buildPairChipsHtml(escapeHtml, nameA, nameB) {
    return (
      '<div class="hood-compare-chips" role="group" aria-label="Compared neighborhoods">' +
      '<button type="button" class="hood-compare-chip hood-compare-chip-a" data-compare-remove-slot="0" title="Remove">' +
      '<span class="hood-compare-chip-swatch" aria-hidden="true"></span>' +
      '<span class="hood-compare-chip-name">' +
      heNameHtml(escapeHtml, nameA) +
      '</span><span class="hood-compare-chip-x" aria-hidden="true">\u00d7</span>' +
      '<span class="sr-only">Remove</span></button>' +
      '<span class="hood-compare-vs">vs</span>' +
      '<button type="button" class="hood-compare-chip hood-compare-chip-b" data-compare-remove-slot="1" title="Remove">' +
      '<span class="hood-compare-chip-swatch" aria-hidden="true"></span>' +
      '<span class="hood-compare-chip-name">' +
      heNameHtml(escapeHtml, nameB) +
      '</span><span class="hood-compare-chip-x" aria-hidden="true">\u00d7</span>' +
      '<span class="sr-only">Remove</span></button></div>'
    );
  }

  function buildHeroRowHtml(escapeHtml, formatFn, value, pct, cityPct, name, slotClass, barClass, unitLabel) {
    return (
      '<div class="hood-compare-hero-row">' +
      '<div class="hood-compare-hero-row-head">' +
      '<span class="hood-compare-hero-score ' +
      slotClass +
      '">' +
      escapeHtml(formatFn(value)) +
      "<em>" +
      escapeHtml(unitLabel) +
      "</em></span>" +
      '<span class="hood-compare-hero-name ' +
      slotClass +
      '">' +
      heNameHtml(escapeHtml, name) +
      "</span></div>" +
      '<div class="hood-compare-hero-bar-track" aria-hidden="true">' +
      '<div class="hood-compare-hero-bar ' +
      barClass +
      '" style="width:' +
      pct +
      '%"></div>' +
      '<div class="hood-compare-hero-city" style="left:' +
      cityPct +
      '%"></div></div></div>'
    );
  }

  // Dual 0–100 bars (same grammar as the gap ledger): length = score, dashed = city.
  function buildHeroHtml(escapeHtml, formatFn, valueA, valueB, cityValue, kicker, nameA, nameB, options) {
    options = options || {};
    var unitLabel = options.unitLabel != null ? options.unitLabel : "/100";
    var cityLabel = options.cityLabel || "City avg";
    var aPct = clampScore(valueA);
    var bPct = clampScore(valueB);
    var cityPct = clampScore(cityValue);
    var aria =
      nameA +
      " " +
      formatFn(valueA) +
      ", " +
      nameB +
      " " +
      formatFn(valueB) +
      ", " +
      cityLabel +
      " " +
      formatFn(cityValue);
    return (
      '<div class="percentile-summary score-explain-sidebar-hero-compact hood-compare-hero">' +
      '<p class="score-explain-hero-kicker">' +
      escapeHtml(kicker) +
      "</p>" +
      '<div class="hood-compare-hero-bars" role="group" aria-label="' +
      escapeHtml(aria) +
      '">' +
      buildHeroRowHtml(
        escapeHtml,
        formatFn,
        valueA,
        aPct,
        cityPct,
        nameA,
        "hood-compare-slot-a",
        "hood-compare-bar-a",
        unitLabel
      ) +
      buildHeroRowHtml(
        escapeHtml,
        formatFn,
        valueB,
        bPct,
        cityPct,
        nameB,
        "hood-compare-slot-b",
        "hood-compare-bar-b",
        unitLabel
      ) +
      "</div></div>"
    );
  }

  function buildUnavailableHeroHtml(escapeHtml, kicker) {
    return (
      '<div class="percentile-summary score-explain-sidebar-hero-compact hood-compare-hero">' +
      '<p class="score-explain-hero-kicker">' +
      escapeHtml(kicker) +
      '</p><div class="percentile-value">Unavailable</div></div>'
    );
  }

  function buildSummaryHtml(escapeHtml, cards) {
    var html = '<div class="cw-summary hood-compare-summary">';
    (cards || []).forEach(function (card) {
      var labelHtml = card.labelIsHebrew
        ? heNameHtml(escapeHtml, card.label)
        : escapeHtml(card.label);
      var sublabelHtml = "";
      if (card.sublabel) {
        sublabelHtml =
          '<div class="cw-stat-sublabel">' +
          (card.sublabelIsHebrew
            ? heNameHtml(escapeHtml, card.sublabel)
            : escapeHtml(card.sublabel)) +
          "</div>";
      }
      html +=
        '<div class="cw-stat-card' +
        (card.wide ? " hood-compare-summary-wide" : "") +
        '">' +
        '<div class="cw-stat-value' +
        (card.valueClass ? " " + card.valueClass : "") +
        '">' +
        escapeHtml(card.value) +
        '</div><div class="cw-stat-label">' +
        labelHtml +
        "</div>" +
        sublabelHtml +
        "</div>";
    });
    html += "</div>";
    return html;
  }

  function sortLedgerByScoreA(rows) {
    return (rows || []).slice().sort(function (left, right) {
      return Number(right.valueA) - Number(left.valueA);
    });
  }

  function buildCompareRow(escapeHtml, formatFn, row, scaleMax) {
    var maxScale = scaleMax > 0 ? scaleMax : 100;
    var aPct = Math.max(0, Math.min(100, (Number(row.valueA) / maxScale) * 100));
    var bPct = Math.max(0, Math.min(100, (Number(row.valueB) / maxScale) * 100));
    // Number.isFinite does not coerce; null/undefined must not become a fake city=0 tick.
    var showCity = Number.isFinite(row.city);
    var cityValue = showCity ? row.city : null;
    var cityPct = showCity
      ? Math.max(0, Math.min(100, (cityValue / maxScale) * 100))
      : 0;
    var cityTickHtml = showCity
      ? '<div class="u95-compare-city-marker" style="left:' + cityPct + '%"></div>'
      : "";
    var cityMetaHtml = showCity
      ? "<span>city avg " + escapeHtml(formatFn(cityValue)) + "</span>"
      : "";
    return (
      '<div class="u95-compare-item">' +
      '<div class="u95-compare-name">' +
      escapeHtml(row.label) +
      "</div>" +
      '<div class="u95-compare-bar-wrap hood-compare-bar-wrap" aria-hidden="true">' +
      cityTickHtml +
      '<div class="hood-compare-bar-track">' +
      '<div class="u95-compare-bar hood-compare-bar-a" style="width:' +
      aPct +
      '%"></div></div>' +
      '<div class="hood-compare-bar-track">' +
      '<div class="u95-compare-bar hood-compare-bar-b" style="width:' +
      bPct +
      '%"></div></div></div>' +
      '<div class="u95-compare-score">' +
      "<strong>" +
      '<span class="hood-compare-slot-a">' +
      escapeHtml(formatFn(row.valueA)) +
      '</span> \u00b7 <span class="hood-compare-slot-b">' +
      escapeHtml(formatFn(row.valueB)) +
      "</span></strong>" +
      cityMetaHtml +
      "</div></div>"
    );
  }

  function sortTopGaps(rows) {
    return (rows || [])
      .slice()
      .filter(function (row) {
        return row && Number.isFinite(row.gap);
      })
      .sort(function (left, right) {
        return right.gap - left.gap;
      });
  }

  function buildTopGapsHtml(escapeHtml, formatFn, rows, nameA, nameB) {
    var top = sortTopGaps(rows).slice(0, TOP_GAP_COUNT);
    if (top.length === 0) return "";
    var html =
      '<div class="cw-section hood-compare-gaps">' +
      '<div class="cw-section-title">Where they differ most</div>' +
      '<ul class="cw-ranking-list">';
    top.forEach(function (row, index) {
      var leadName = row.valueB >= row.valueA ? nameB : nameA;
      var leadClass =
        row.valueB >= row.valueA ? "hood-compare-slot-b" : "hood-compare-slot-a";
      html +=
        '<li class="cw-ranking-item">' +
        '<div class="cw-rank-num">' +
        (index + 1) +
        "</div>" +
        '<div class="cw-rank-name">' +
        escapeHtml(row.label) +
        "</div>" +
        '<div class="cw-rank-score"><strong class="' +
        leadClass +
        '">' +
        heNameHtml(escapeHtml, leadName) +
        '</strong><span class="cw-rank-lead-by"> by ' +
        escapeHtml(formatFn(row.gap)) +
        "</span>" +
        '<span class="cw-rank-sub">' +
        escapeHtml(formatFn(row.valueA)) +
        " vs " +
        escapeHtml(formatFn(row.valueB)) +
        "</span></div></li>";
    });
    html += "</ul></div>";
    return html;
  }

  function buildGapLedgerHtml(escapeHtml, formatFn, rows, options) {
    options = options || {};
    var nameA = options.nameA || "Neighborhood 1";
    var nameB = options.nameB || "Neighborhood 2";
    var html =
      '<div class="cw-section">' +
      '<div class="cw-section-title">' +
      escapeHtml(options.title || "Gap ledger") +
      "</div>";
    if (options.hint) {
      html += '<p class="sidebar-section-hint">' + escapeHtml(options.hint) + "</p>";
    }
    var showCityLegend = options.showCity !== false;
    html += '<div class="u95-compare-container">';
    // Keep legend items LTR so the color swatch stays before the name; order A → B → city.
    html +=
      '<div class="u95-compare-legend">' +
      '<span class="u95-compare-legend-bar hood-compare-legend-a"><span class="hood-compare-legend-name">' +
      heNameHtml(escapeHtml, nameA) +
      "</span></span>" +
      '<span class="u95-compare-legend-bar hood-compare-legend-b"><span class="hood-compare-legend-name">' +
      heNameHtml(escapeHtml, nameB) +
      "</span></span>" +
      (showCityLegend ? '<span class="u95-compare-legend-line">City avg</span>' : "") +
      "</div>";
    html += '<div class="u95-compare-list">';
    var scaleMax = options.scaleMax != null ? options.scaleMax : 100;
    sortLedgerByScoreA(rows).forEach(function (row) {
      html += buildCompareRow(escapeHtml, formatFn, row, scaleMax);
    });
    html += "</div></div></div>";
    return html;
  }

  function buildDisclosureHtml(escapeHtml, fullRows, formatFn, options) {
    if (!fullRows || fullRows.length === 0) return "";
    options = options || {};
    var html =
      '<details class="cw-section hood-compare-disclosure">' +
      "<summary>" +
      escapeHtml(options.summary || "Show full comparison") +
      "</summary>" +
      '<div class="u95-compare-container"><div class="u95-compare-list">';
    var scaleMax = options.scaleMax != null ? options.scaleMax : 100;
    sortLedgerByScoreA(fullRows).forEach(function (row) {
      html += buildCompareRow(escapeHtml, formatFn, row, scaleMax);
    });
    html += "</div></div></details>";
    return html;
  }

  function buildInventoryCompareRows(invA, invB, getAmenityConfig) {
    var keys = {};
    Object.keys(invA || {}).forEach(function (key) {
      keys[key] = true;
    });
    Object.keys(invB || {}).forEach(function (key) {
      keys[key] = true;
    });
    var rows = Object.keys(keys)
      .filter(function (key) {
        return key !== "trees" && key !== "street-lights";
      })
      .map(function (key) {
        var a = Number((invA && invA[key]) || 0) || 0;
        var b = Number((invB && invB[key]) || 0) || 0;
        var label = key;
        if (typeof getAmenityConfig === "function") {
          var cfg = getAmenityConfig(key);
          if (cfg && cfg.label) label = cfg.label;
        }
        return {
          kind: "inventory",
          label: label,
          valueA: a,
          valueB: b,
          city: null,
          gap: Math.abs(a - b),
          hasData: a > 0 || b > 0,
        };
      })
      .filter(function (row) {
        return row.hasData;
      })
      .sort(function (left, right) {
        return right.valueA - left.valueA;
      });
    return rows;
  }

  function lookupDistribution(payload, modeKey, name, minKey) {
    if (!payload || !payload[modeKey] || !name) return null;
    var byName = payload[modeKey][name];
    if (!byName || !byName[minKey]) return null;
    var dist = byName[minKey];
    if (!dist || !Array.isArray(dist.counts) || !Array.isArray(dist.edges)) return null;
    if (dist.edges.length < 2 || dist.counts.length === 0) return null;
    return dist;
  }

  function buildHistSectionHtml(escapeHtml, hasDist, filterActive) {
    if (!hasDist) return "";
    var html =
      '<div class="cw-section">' +
      '<div class="cw-section-title">Building score distribution</div>';
    if (filterActive) {
      html +=
        '<p class="sidebar-section-hint">Overall building scores (not filtered)</p>';
    } else {
      html +=
        '<p class="sidebar-section-hint">Overlapping histograms of overall building scores in each neighborhood</p>';
    }
    html +=
      '<div class="cw-chart-container">' +
      '<canvas id="hood-compare-score-hist"></canvas></div></div>';
    return html;
  }

  function bindDualHistogram(host, distA, distB, nameA, nameB) {
    if (!host || !host.bodyEl || typeof Chart === "undefined") return;
    if (!distA || !distB) return;
    var canvas = host.bodyEl.querySelector("#hood-compare-score-hist");
    if (!canvas) return;
    var edges = distA.edges.length >= distB.edges.length ? distA.edges : distB.edges;
    var labels = edges.slice(0, -1).map(function (edge, index) {
      return Math.round(Number(edge)) + "\u2013" + Math.round(Number(edges[index + 1]));
    });
    var countsA = distA.counts;
    var countsB = distB.counts;
    if (countsA.length !== labels.length || countsB.length !== labels.length) {
      // Shared-edge publish should match; if not, omit rather than mislead.
      canvas.parentNode.innerHTML =
        '<p class="sidebar-section-hint">Histogram edges do not align for this pair.</p>';
      return;
    }
    Chart.defaults.font.family = 'Inter, "Noto Sans Hebrew", system-ui, sans-serif';
    host.chartInstances.push(
      new Chart(canvas, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: nameA,
              data: countsA,
              backgroundColor: SLOT_A_FILL,
              borderColor: SLOT_A_COLOR,
              borderWidth: 1,
              borderRadius: 2,
              grouped: false,
              categoryPercentage: 1.0,
              barPercentage: 1.0,
              order: 1,
            },
            {
              label: nameB,
              data: countsB,
              backgroundColor: SLOT_B_FILL,
              borderColor: SLOT_B_COLOR,
              borderWidth: 1,
              borderRadius: 2,
              grouped: false,
              categoryPercentage: 1.0,
              barPercentage: 1.0,
              order: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              labels: { boxWidth: 10, font: { size: 10 } },
            },
          },
          scales: {
            x: {
              stacked: false,
              grid: { display: false },
              ticks: { maxRotation: 45, font: { size: 9 }, maxTicksLimit: 8 },
            },
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

  function bindChipHandlers(rootEl, removeSlot) {
    if (!rootEl || typeof removeSlot !== "function") return;
    if (typeof rootEl.querySelectorAll !== "function") return;
    var buttons = rootEl.querySelectorAll("[data-compare-remove-slot]");
    for (var i = 0; i < buttons.length; i++) {
      (function (button) {
        button.addEventListener("click", function (event) {
          event.preventDefault();
          var slot = Number(button.getAttribute("data-compare-remove-slot"));
          if (!Number.isFinite(slot)) return;
          removeSlot(slot);
        });
      })(buttons[i]);
    }
  }

  function populateShell(host, chipsHtml, spineHtml) {
    if (host.eyebrowEl) {
      host.eyebrowEl.hidden = true;
      host.eyebrowEl.textContent = "";
    }
    if (host.heroEl) {
      host.heroEl.innerHTML = chipsHtml + spineHtml;
    }
    if (host.metaEl) {
      host.metaEl.innerHTML = "";
    }
  }

  function finishRender(host, bodyHtml, afterOpen) {
    Urban95NeighborhoodPanelRender.destroyCharts(host.chartInstances);
    if (host.emptyEl) {
      host.emptyEl.hidden = true;
      host.emptyEl.textContent = "";
    }
    if (host.bodyEl) {
      host.bodyEl.innerHTML = bodyHtml;
    }
    if (typeof host.openChrome === "function") {
      host.openChrome();
    }
    bindChipHandlers(host.heroEl, host.removeSlot);
    bindChipHandlers(host.bodyEl, host.removeSlot);
    if (typeof afterOpen === "function") {
      host.ensureChartJsLoaded().then(function () {
        if (host.isStale && host.isStale()) return;
        host.requestAnimationFrame(function () {
          if (host.isStale && host.isStale()) return;
          afterOpen();
          host.chartInstances.forEach(function (chart) {
            if (chart && typeof chart.resize === "function") chart.resize();
          });
        });
      });
    }
  }

  function renderStatusCompare(state, host, activeMetric) {
    var featureA = state.slots[0];
    var featureB = state.slots[1];
    var propsA = featureA.properties || {};
    var propsB = featureB.properties || {};
    var nameA = nameOf(featureA);
    var nameB = nameOf(featureB);
    var escapeHtml = host.escapeHtml;
    var chipsHtml = buildPairChipsHtml(escapeHtml, nameA, nameB);
    var activeStatusA = activeMetric && activeMetric.areaStatusKey ? propsA[activeMetric.areaStatusKey] : "unknown";
    var activeStatusB = activeMetric && activeMetric.areaStatusKey ? propsB[activeMetric.areaStatusKey] : "unknown";
    var spineHtml = '<div class="u95-neighborhood-compare-hero" dir="ltr">' +
      '<p class="score-explain-hero-kicker">' + escapeHtml(activeMetric.label || "All indicators overview") + "</p>" +
      renderStatusOverlayLegendHtml(escapeHtml, nameA, nameB) +
      '<div class="u95-status-overlay-hero-fixture">' +
      renderSharedStatusOverlayHtml(escapeHtml, nameA, activeStatusA, nameB, activeStatusB, "hero") +
      "</div></div>";
    populateShell(host, chipsHtml, spineHtml);

    var registry = window.Urban95ScoreModel && window.Urban95ScoreModel.buildWeightedMetricRegistry
      ? window.Urban95ScoreModel.buildWeightedMetricRegistry()
      : {};
    var metrics = Object.keys(registry).map(function (id) { return registry[id]; });
    var categories = metrics.filter(function (metric) { return metric && metric.kind === "weighted-category"; });
    var subcategories = metrics.filter(function (metric) { return metric && metric.kind === "weighted-subcategory"; });
    var diagnostics = metrics.filter(function (metric) { return metric && metric.kind === "diagnostic-access"; });
    var bodyHtml = '<section class="u95-neighborhood-compare-indicators"><div class="cw-section-title">Categories &amp; indicators</div>';
    categories.forEach(function (metric) {
      var categoryStem = metric.selectedWeightedStem || "";
      var categorySubcategories = subcategories.filter(function (subcategory) {
        return subcategory.selectedWeightedStem === categoryStem;
      });
      var isActiveCategory = activeMetric &&
        (activeMetric.selectedWeightedStem === categoryStem || activeMetric.parentStem === categoryStem) &&
        activeMetric.kind !== "weighted-overall";
      bodyHtml += '<details class="u95-neighborhood-compare-category-group" data-category-stem="' +
        escapeHtml(categoryStem) + '" style="--category-color:' +
        escapeHtml(metric.color || "#64748b") + '"' + (isActiveCategory ? " open" : "") + ">";
      bodyHtml += buildStatusOverlayRowHtml(host, escapeHtml, metric, propsA, propsB, nameA, nameB,
        "category", "u95-neighborhood-compare-category-row", "summary");
      bodyHtml += '<div class="u95-neighborhood-compare-indicator-list">';
      categorySubcategories.forEach(function (subcategory) {
        var subcategoryDiagnostics = diagnostics.filter(function (diagnostic) {
          return diagnostic.parentMetricId === subcategory.id;
        });
        if (subcategoryDiagnostics.length === 0) {
          bodyHtml += buildStatusOverlayRowHtml(host, escapeHtml, subcategory, propsA, propsB,
            nameA, nameB, "subcategory", "u95-neighborhood-compare-indicator-row");
          return;
        }
        var isActiveSubcategory = activeMetric && (activeMetric.id === subcategory.id ||
          subcategoryDiagnostics.some(function (diagnostic) { return diagnostic.id === activeMetric.id; }));
        bodyHtml += '<details class="u95-neighborhood-compare-subcategory-group"' +
          (isActiveSubcategory ? " open" : "") + ">";
        bodyHtml += buildStatusOverlayRowHtml(host, escapeHtml, subcategory, propsA, propsB,
          nameA, nameB, "subcategory", "u95-neighborhood-compare-indicator-row", "summary");
        bodyHtml += '<div class="u95-neighborhood-compare-diagnostic-list">';
        subcategoryDiagnostics.forEach(function (diagnostic) {
          bodyHtml += buildStatusOverlayRowHtml(host, escapeHtml, diagnostic, propsA, propsB,
            nameA, nameB, "diagnostic", "u95-neighborhood-compare-diagnostic-row");
        });
        bodyHtml += "</div></details>";
      });
      bodyHtml += "</div></details>";
    });
    bodyHtml += "</section>";
    finishRender(host, bodyHtml);
  }

  function renderWeighted(state, host) {
    var activeMetric = host.getActiveMetric ? host.getActiveMetric() : null;
    if (activeMetric && activeMetric.scale === "status") {
      renderStatusCompare(state, host, activeMetric);
      return;
    }
    var featureA = state.slots[0];
    var featureB = state.slots[1];
    var nameA = nameOf(featureA);
    var nameB = nameOf(featureB);
    var escapeHtml = host.escapeHtml;
    populateShell(
      host,
      buildPairChipsHtml(escapeHtml, nameA, nameB),
      buildUnavailableHeroHtml(escapeHtml, "Urban95")
    );
    finishRender(
      host,
      '<div class="cw-section"><p class="sidebar-section-hint">Summary unavailable</p></div>'
    );
  }

  function renderExpanded(state, host) {
    var featureA = state.slots[0];
    var featureB = state.slots[1];
    var propsA = featureA.properties || {};
    var propsB = featureB.properties || {};
    var nameA = nameOf(featureA);
    var nameB = nameOf(featureB);
    var escapeHtml = host.escapeHtml;
    var formatMetricNumber = host.formatMetricNumber;
    var scoreMinutes = host.getScoreMinutes();
    var sfx = "_" + scoreMinutes + "min";
    var pctKey = host.getNeighborhoodPercentileKey(sfx);

    host.loadNeighborhoodChartsPayload().then(function (chartsPayload) {
      if (host.isStale && host.isStale()) return;
      var pctA = Number(propsA[pctKey]);
      var pctB = Number(propsB[pctKey]);
      if (!Number.isFinite(pctA)) pctA = 0;
      if (!Number.isFinite(pctB)) pctB = 0;
      // Citywide percentile spine: city reference is the 50th percentile.
      var cityPct = 50;

      var formatPct = function (v) {
        return String(Math.round(Number(v) || 0));
      };
      var chipsHtml = buildPairChipsHtml(escapeHtml, nameA, nameB);
      var spineHtml = buildHeroHtml(
        escapeHtml,
        formatPct,
        pctA,
        pctB,
        cityPct,
        "Citywide percentile (" + scoreMinutes + "-min)",
        nameA,
        nameB,
        { unitLabel: "pct", cityLabel: "City median" }
      );

      populateShell(host, chipsHtml, spineHtml);

      var invLegacy = (chartsPayload && chartsPayload.inventory_legacy) || {};
      var invA = invLegacy[nameA] || {};
      var invB = invLegacy[nameB] || {};
      var allRows = buildInventoryCompareRows(invA, invB, host.getAmenityConfig);
      var previewCount = Math.min(6, allRows.length);
      var previewRows = allRows.slice(0, previewCount);
      var showingPartial = allRows.length > previewCount;
      var scaleMax = 1;
      allRows.forEach(function (row) {
        scaleMax = Math.max(scaleMax, row.valueA, row.valueB);
      });

      var distA = lookupDistribution(
        chartsPayload,
        "distributions_expanded",
        nameA,
        minutesKey(scoreMinutes)
      );
      var distB = lookupDistribution(
        chartsPayload,
        "distributions_expanded",
        nameB,
        minutesKey(scoreMinutes)
      );
      var hasDist = !!(distA && distB);

      var citywideStats =
        typeof host.getCitywideStats === "function" ? host.getCitywideStats() || {} : {};
      var avgBuildings = avgNeighborhoodBuildingCount(citywideStats);
      var summaryCards = [
        {
          value: String(buildingCountOf(featureA)),
          label: "Buildings",
          sublabel: nameA,
          sublabelIsHebrew: true,
          valueClass: "hood-compare-slot-a",
        },
        {
          value: String(buildingCountOf(featureB)),
          label: "Buildings",
          sublabel: nameB,
          sublabelIsHebrew: true,
          valueClass: "hood-compare-slot-b",
        },
        {
          value: formatPct(cityPct),
          label: "City score median",
          valueClass: "hood-compare-slot-city",
        },
      ];
      if (avgBuildings != null) {
        summaryCards.push({
          value: String(avgBuildings),
          label: "Avg buildings / neighborhood",
          valueClass: "hood-compare-slot-city",
        });
      }
      var bodyHtml = "";
      bodyHtml += buildSummaryHtml(escapeHtml, summaryCards);
      bodyHtml +=
        '<p class="sidebar-section-hint">Inventory counts are not density-adjusted; neighborhoods differ in building count.</p>';
      bodyHtml += buildHistSectionHtml(escapeHtml, hasDist, false);
      bodyHtml += buildTopGapsHtml(escapeHtml, formatMetricNumber, allRows, nameA, nameB);
      bodyHtml += buildGapLedgerHtml(escapeHtml, formatMetricNumber, previewRows, {
        title: "Inventory composition gaps",
        scaleMax: scaleMax,
        showCity: false,
        nameA: nameA,
        nameB: nameB,
      });
      if (showingPartial) {
        bodyHtml += buildDisclosureHtml(escapeHtml, allRows, formatMetricNumber, {
          summary: "Show full inventory comparison",
          scaleMax: scaleMax,
        });
      }

      finishRender(host, bodyHtml, function () {
        if (hasDist) bindDualHistogram(host, distA, distB, nameA, nameB);
      });
    });
  }

  function render(state, host) {
    if (!host) {
      throw new Error("Urban95NeighborhoodCompareRender.render requires host");
    }
    if (!state || !state.slots || !state.slots[0] || !state.slots[1]) {
      if (typeof host.hide === "function") host.hide({ clearSelection: true });
      return;
    }
    if (host.emptyEl) {
      host.emptyEl.hidden = false;
      host.emptyEl.textContent = "Loading comparison...";
    }
    if (host.bodyEl) host.bodyEl.innerHTML = "";

    var scoreMode = host.getScoreMode();
    if (scoreMode === "weighted") {
      renderWeighted(state, host);
      return;
    }
    renderExpanded(state, host);
  }

  window.Urban95NeighborhoodCompareRender = {
    render: render,
    SLOT_A_COLOR: SLOT_A_COLOR,
    SLOT_B_COLOR: SLOT_B_COLOR,
  };
})();
