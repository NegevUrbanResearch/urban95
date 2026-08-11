(function () {
  var deps = null;

  var REQUIRED_DEPENDENCY_TYPES = {
    map: "object",
    fetchJsonWithGzipFallback: "function",
    urls: "object",
    getScoreMode: "function",
    getNeighborhoodsData: "function",
    setNeighborhoodsData: "function",
    getNeighborhoodSurfaceData: "function",
    setNeighborhoodSurfaceData: "function",
    getNeighborhoodChartsPayload: "function",
    setNeighborhoodChartsPayload: "function",
    getCitywideStats: "function",
    setCitywideStats: "function",
    getAmenityConfig: "function",
    getNeighborhoodSurfaceScorePropertyKey: "function",
    formatMetricNumber: "function",
    getOrdinalSuffix: "function",
    tooltipEl: "object",
  };

  function configure(nextDeps) {
    deps = validateDeps(nextDeps || null);
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
    var scoreKey = d.getNeighborhoodSurfaceScorePropertyKey() || "score";
    if (d.getScoreMode() === "weighted") {
        var prefix = String(scoreKey).replace(/^u95_status(?=_|$)/, "u95");
        var reasonKey = prefix + "_summary_reason";
        var supportKey = prefix + "_support_count";
        var reason = props[reasonKey];
        var rawSupport = props[supportKey];
        var hasRawNumericSupport =
          (typeof rawSupport === "number" || (typeof rawSupport === "string" && rawSupport.trim() !== "")) &&
          Number.isFinite(Number(rawSupport));
        var support = hasRawNumericSupport ? Number(rawSupport) : NaN;
        var hasFiniteSupport = hasRawNumericSupport && support >= 0 && Number.isInteger(support);
        var supportLabel = Number.isFinite(support) ? " · " + support + " buildings" : "";
        var status = window.Urban95StatusScale && window.Urban95StatusScale.normalize
          ? window.Urban95StatusScale.normalize(props[scoreKey])
          : "unknown";
        var definitions = (window.Urban95StatusScale && window.Urban95StatusScale.definitions) || [];
        var definition = definitions.filter(function (item) { return item.token === status; })[0];
        var label = definition ? definition.label : "Unknown";
        var summary;
        if (reason === "no_buildings") {
          summary = "No buildings";
        } else if (!Object.prototype.hasOwnProperty.call(props, scoreKey) || !reason) {
          summary = "Summary unavailable";
        } else if (reason === "tie") {
          summary = "No unique most-common status";
        } else if (reason === "inferred_spatial") {
          summary = hasFiniteSupport
            ? "Inferred from nearby buildings \u00b7 " + label + " \u00b7 " + support + " buildings"
            : "Summary unavailable";
        } else if (reason === "predominantly_unknown") {
          summary = hasFiniteSupport ? "Predominantly unknown" + supportLabel : "Summary unavailable";
        } else if (reason === "predominant") {
          summary = hasFiniteSupport ? label + supportLabel : "Summary unavailable";
        } else {
          summary = "Summary unavailable";
        }
        tooltip.textContent = hexId + " in " + neighborhoodName + "\n" + summary;
    } else if (!hasBuildings) {
      tooltip.textContent = "Hexagon " + hexId + " in " + neighborhoodName + "\nNo residential buildings";
    } else {
        var score = Math.max(0, Math.min(100, Number(props[scoreKey]) || 0));
        var pct = Math.round(score);
        tooltip.textContent =
          hexId + " in " + neighborhoodName + "\nArea score " + pct + d.getOrdinalSuffix(pct) + " percentile";
    }
    tooltip.style.display = "block";
    tooltip.style.left = point.x + 12 + "px";
    tooltip.style.top = point.y + 12 + "px";
  }

  window.Urban95Dashboards = {
    configure: configure,
    loadNeighborhoodChartsPayload: loadNeighborhoodChartsPayload,
    pieSlicesFromInventoryCounts: pieSlicesFromInventoryCounts,
    loadNeighborhoods: loadNeighborhoods,
    loadNeighborhoodSurfaceData: loadNeighborhoodSurfaceData,
    getNeighborhoodHexSurfaceOpacityExpression: getNeighborhoodHexSurfaceOpacityExpression,
    loadCitywideStats: loadCitywideStats,
    getNeighborhoodFeatureAtPoint: getNeighborhoodFeatureAtPoint,
    showNeighborhoodAreaTooltip: showNeighborhoodAreaTooltip,
  };
})();
