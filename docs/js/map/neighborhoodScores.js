(function () {
  function requireFunction(value, name) {
    if (typeof value !== "function") {
      throw new Error("Urban95NeighborhoodScores.create requires " + name);
    }
    return value;
  }

  function requireNumber(value, name) {
    if (typeof value !== "number") {
      throw new Error("Urban95NeighborhoodScores.create requires " + name);
    }
    return value;
  }

  function requireObject(value, name) {
    if (!value || typeof value !== "object") {
      throw new Error("Urban95NeighborhoodScores.create requires " + name);
    }
    return value;
  }

  function normalizeSurfaceFilterKey(value) {
    return (
      String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[^0-9a-z]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "") || "other"
    );
  }

  function getNeighborhoodSurfaceColorExpression(scoreProperty) {
    var scoreKey = scoreProperty || "score";
    return [
      "case",
      ["==", ["to-number", ["get", "has_buildings"], 0], 0],
      "#9ca3af",
      [
        "interpolate",
        ["linear"],
        ["to-number", ["get", scoreKey], 0],
        0, "#ef4444",
        25, "#f97316",
        50, "#eab308",
        75, "#84cc16",
        100, "#22c55e",
      ],
    ];
  }

  function create(deps) {
    deps = deps || {};
    var turf = requireObject(deps.turf, "deps.turf");
    requireFunction(turf.bbox, "deps.turf.bbox");

    var getScoreMode = requireFunction(deps.getScoreMode, "deps.getScoreMode");
    var getWalkMinutes = requireFunction(deps.getWalkMinutes, "deps.getWalkMinutes");
    var getActiveMetric = requireFunction(deps.getActiveMetric, "deps.getActiveMetric");
    var fixedMinutes = requireNumber(deps.fixedMinutes, "deps.fixedMinutes");

    function getZoomForPolygon(polygon) {
      var bbox = turf.bbox(polygon);
      var sw = [bbox[0], bbox[1]];
      var ne = [bbox[2], bbox[3]];
      var dLng = ne[0] - sw[0];
      var dLat = ne[1] - sw[1];
      var maxSpan = Math.max(dLng, dLat);
      if (maxSpan <= 0) return 15;
      var zoom = Math.log2(0.01 / maxSpan) + 15;
      return Math.min(Math.max(zoom, 12), 18);
    }

    function getNeighborhoodAverageKey(sfx) {
      if (getScoreMode() === "weighted") {
        var metric = getActiveMetric();
        return metric ? metric.neighborhoodAverageKey || null : null;
      }
      return "avg_overall" + sfx;
    }

    function getNeighborhoodPercentileKey(sfx) {
      if (getScoreMode() === "weighted") return "pct_weighted_overall_" + fixedMinutes + "min";
      return "pct_overall" + sfx;
    }

    function getScoreMinutes() {
      if (getScoreMode() === "weighted") return fixedMinutes;
      return getWalkMinutes();
    }

    function getNeighborhoodSurfaceScorePropertyKey() {
      var metric = getActiveMetric();
      if (getScoreMode() === "weighted") {
        return metric ? metric.surfacePropertyKey || null : null;
      }
      if (getScoreMode() === "expanded") {
        return metric ? metric.surfacePropertyKey : null;
      }
      return null;
    }

    return {
      getZoomForPolygon: getZoomForPolygon,
      getNeighborhoodAverageKey: getNeighborhoodAverageKey,
      getNeighborhoodPercentileKey: getNeighborhoodPercentileKey,
      getScoreMinutes: getScoreMinutes,
      normalizeSurfaceFilterKey: normalizeSurfaceFilterKey,
      getNeighborhoodSurfaceScorePropertyKey: getNeighborhoodSurfaceScorePropertyKey,
      getNeighborhoodSurfaceColorExpression: getNeighborhoodSurfaceColorExpression,
    };
  }

  window.Urban95NeighborhoodScores = { create: create };
})();
