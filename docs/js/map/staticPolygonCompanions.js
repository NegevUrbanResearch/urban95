(function () {
  var SI_LAYER_LABELS = {
    street: "Street",
    open_space: "Open space",
  };

  var SHADE_HEATMAP_METRIC_ID = "u95.sub.environmental_quality.shade";
  var BUILDING_WEIGHTED_LAYER_LABEL = "300 m area-weighted shade value";

  var SI_COLOR_STOPS = [
    { si: 0, color: "#e81014" },
    { si: 0.1, color: "#fb9d3b" },
    { si: 0.2, color: "#fafa64" },
    { si: 0.4, color: "#7da788" },
    { si: 0.6, color: "#388393" },
    { si: 1.0, color: "#007298" },
  ];

  var SI_INTERPRETATION_BUCKETS = [
    { maxExclusive: 0.10, label: "Severe lack", rangeLabel: "0.0 Severe lack" },
    { maxExclusive: 0.20, label: "Significant lack", rangeLabel: "0.1 Significant lack" },
    { maxExclusive: 0.40, label: "Needs improvement", rangeLabel: "0.2-0.3 Needs improvement" },
    { maxExclusive: 0.60, label: "Good shade", rangeLabel: "0.4-0.5 Good shade" },
    { maxExclusive: Infinity, label: "Excellent shade", rangeLabel: "0.6-1.0 Excellent shade" },
  ];

  var SI_ROUNDED_AXIS_GROUPS = [
    { start: 0, end: 0.1, label: "0.0", bucketName: "Severe lack" },
    { start: 0.1, end: 0.2, label: "0.1", bucketName: "Significant lack" },
    { start: 0.2, end: 0.4, label: "0.2-0.3", bucketName: "Needs improvement" },
    { start: 0.4, end: 0.6, label: "0.4-0.5", bucketName: "Good shade" },
    { start: 0.6, end: 1.0, label: "0.6-1.0", bucketName: "Excellent shade" },
  ];

  function formatShadeIndex(value, decimals) {
    var si = Number(value);
    var places = Number.isFinite(decimals) ? decimals : 2;
    return Number.isFinite(si) ? si.toFixed(places) : "-";
  }

  function formatSiLayer(value) {
    if (!value) return null;
    var key = String(value);
    return SI_LAYER_LABELS[key] || key;
  }

  function classifyShadeIndex(value) {
    var si = Number(value);
    if (!Number.isFinite(si)) return null;
    for (var i = 0; i < SI_INTERPRETATION_BUCKETS.length; i++) {
      if (si < SI_INTERPRETATION_BUCKETS[i].maxExclusive) {
        return SI_INTERPRETATION_BUCKETS[i].label;
      }
    }
    return null;
  }

  function buildSiFillColorExpression(stops) {
    var expr = [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "summer_SI"], 0],
    ];
    stops.forEach(function (stop) {
      expr.push(stop.si, stop.color);
    });
    return expr;
  }

  function formatSiLegendLabel(si) {
    if (si === 0) return "0";
    if (si === 1) return "1.0";
    return Number(si).toFixed(2);
  }

  function buildLegendLabelsFromStops(stops) {
    return stops.map(function (stop) {
      return formatSiLegendLabel(stop.si);
    });
  }

  function buildSiLegendGradientStyle(stops) {
    var maxSi = stops.length ? stops[stops.length - 1].si : 1;
    var parts = stops.map(function (stop) {
      var pct = maxSi > 0 ? (stop.si / maxSi) * 100 : 0;
      return stop.color + " " + pct + "%";
    });
    return "background: linear-gradient(to right, " + parts.join(", ") + ");";
  }

  function buildSurfaceShadeTooltip(properties) {
    properties = properties || {};
    var lines = [];
    lines.push("Shade Index: " + formatShadeIndex(properties.summer_SI, 2));
    var shadeClass = classifyShadeIndex(properties.summer_SI);
    if (shadeClass) {
      lines.push("Class: " + shadeClass);
    }
    var layerLabel = formatSiLayer(properties.si_layer);
    if (layerLabel) {
      lines.push("Layer: " + layerLabel);
    }
    return lines;
  }

  function buildBuildingShadeTooltip(properties) {
    properties = properties || {};
    var lines = [];
    lines.push("Shade Index: " + formatShadeIndex(properties.summer_si, 1));
    var shadeClass = classifyShadeIndex(properties.summer_si);
    if (shadeClass) {
      lines.push("Class: " + shadeClass);
    }
    lines.push("Layer: " + BUILDING_WEIGHTED_LAYER_LABEL);
    return lines;
  }

  var REGISTRY = {
    "shade-si": {
      key: "shade-si",
      sourceId: "shade-si",
      fillLayerId: "shade-si-fill",
      urlKey: "shadeSi",
      metricIds: [SHADE_HEATMAP_METRIC_ID],
      visibilityModes: ["house", "citywide"],
      legend: {
        title: "Shade Index",
        subtitle: "Rounded building SI classes",
        stops: SI_COLOR_STOPS,
        labels: buildLegendLabelsFromStops(SI_COLOR_STOPS),
        items: [],
        axisGroups: SI_ROUNDED_AXIS_GROUPS,
      },
      paint: {
        "fill-color": buildSiFillColorExpression(SI_COLOR_STOPS),
        "fill-opacity": 0.6,
        "fill-outline-color": "rgba(22, 101, 52, 0.3)",
      },
      formatTooltip: buildSurfaceShadeTooltip,
      formatBuildingTooltip: buildBuildingShadeTooltip,
    },
  };

  function getEntry(key) {
    return REGISTRY[key] || null;
  }

  function getEntryForMetricId(metricId) {
    if (!metricId) return null;
    var keys = Object.keys(REGISTRY);
    for (var i = 0; i < keys.length; i++) {
      var entry = REGISTRY[keys[i]];
      if ((entry.metricIds || []).indexOf(metricId) >= 0) {
        return entry;
      }
    }
    return null;
  }

  function getLegendSpec(key) {
    var entry = getEntry(key);
    if (!entry || !entry.legend) return null;
    return {
      title: entry.legend.title,
      subtitle: entry.legend.subtitle,
      stops: entry.legend.stops.slice(),
      labels: entry.legend.labels.slice(),
      items: entry.legend.items.slice(),
      axisGroups: entry.legend.axisGroups ? entry.legend.axisGroups.slice() : [],
      gradientStyle: buildSiLegendGradientStyle(entry.legend.stops),
    };
  }

  function getFillLayerId(canonicalKey) {
    var entry = getEntry(canonicalKey);
    return entry ? entry.fillLayerId : null;
  }

  function formatBuildingTooltipForMetric(metricId, properties) {
    var entry = getEntryForMetricId(metricId);
    if (!entry || typeof entry.formatBuildingTooltip !== "function") return null;
    return entry.formatBuildingTooltip(properties);
  }

  function forEachEntry(callback) {
    Object.keys(REGISTRY).forEach(function (key) {
      callback(REGISTRY[key], key);
    });
  }

  function buildSources(emptyFeatureCollection) {
    var emptyData =
      emptyFeatureCollection && typeof emptyFeatureCollection === "object"
        ? emptyFeatureCollection
        : { type: "FeatureCollection", features: [] };
    var sources = {};
    forEachEntry(function (entry) {
      sources[entry.sourceId] = { type: "geojson", data: emptyData };
    });
    return sources;
  }

  function buildLayers() {
    var layers = [];
    forEachEntry(function (entry) {
      layers.push({
        id: entry.fillLayerId,
        type: "fill",
        source: entry.sourceId,
        paint: entry.paint,
        layout: { visibility: "none" },
      });
    });
    return layers;
  }

  window.Urban95StaticPolygonCompanions = {
    SI_COLOR_STOPS: SI_COLOR_STOPS,
    SI_INTERPRETATION_BUCKETS: SI_INTERPRETATION_BUCKETS,
    classifyShadeIndex: classifyShadeIndex,
    formatShadeIndex: formatShadeIndex,
    getEntry: getEntry,
    getEntryForMetricId: getEntryForMetricId,
    getLegendSpec: getLegendSpec,
    getFillLayerId: getFillLayerId,
    formatBuildingTooltipForMetric: formatBuildingTooltipForMetric,
    forEachEntry: forEachEntry,
    buildSources: buildSources,
    buildLayers: buildLayers,
  };
})();
