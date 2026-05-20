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
    var getCurrentMode = requireFunction(deps.getCurrentMode, "deps.getCurrentMode");
    var getSelectedAmenityTypes = requireFunction(
      deps.getSelectedAmenityTypes,
      "deps.getSelectedAmenityTypes"
    );
    var getAllFilterTypes = requireFunction(deps.getAllFilterTypes, "deps.getAllFilterTypes");
    var getSelectedWeightedCategoryStem = requireFunction(
      deps.getSelectedWeightedCategoryStem,
      "deps.getSelectedWeightedCategoryStem"
    );
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
        var selectedStem = getSelectedWeightedCategoryStem();
        if (selectedStem) return "avg_score_weighted_" + selectedStem + sfx;
        return "avg_score_weighted_" + fixedMinutes + "min";
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
      if (getScoreMode() === "weighted") {
        var selectedStem = getSelectedWeightedCategoryStem();
        if (selectedStem) return "score_weighted_" + selectedStem;
        return "score_weighted";
      }
      var sfx = "_" + getScoreMinutes() + "min";
      if (getScoreMode() === "expanded") {
        if (getCurrentMode() !== "house") {
          return "score_expanded" + sfx;
        }
        if (getSelectedAmenityTypes().size === getAllFilterTypes().length) {
          return "score_expanded" + sfx;
        }
        if (getSelectedAmenityTypes().size === 1) {
          var selectedType = Array.from(getSelectedAmenityTypes())[0] || "";
          var scenarioType = selectedType === "health" ? "healthcare" : selectedType;
          return "score_filter_" + normalizeSurfaceFilterKey(scenarioType) + sfx;
        }
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
