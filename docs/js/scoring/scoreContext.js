(function () {
  function requireFunction(value, name) {
    if (typeof value !== "function") {
      throw new Error("Urban95ScoreContext.create requires " + name);
    }
    return value;
  }

  function requireNumber(value, name) {
    if (typeof value !== "number") {
      throw new Error("Urban95ScoreContext.create requires " + name);
    }
    return value;
  }

  function create(deps) {
    deps = deps || {};
    var scoreModel = deps.scoreModel || {};
    var state = deps.state || {};

    var getCurrentMode = requireFunction(deps.getCurrentMode, "deps.getCurrentMode");
    var getBuildingsData = requireFunction(deps.getBuildingsData, "deps.getBuildingsData");
    var fixedMinutes = requireNumber(deps.fixedMinutes, "deps.fixedMinutes");

    [
      "getBuildingCleanFilteredScore",
      "getBuildingOverallScore",
      "collectBuildingScores",
      "getPercentileSeriesCacheKey",
      "getBuildingAmenityStatKeysForMinutes",
      "resolveActiveMetric",
      "normalizeStatus",
    ].forEach(function (memberName) {
      requireFunction(scoreModel[memberName], "deps.scoreModel." + memberName);
    });

    [
      "getSelectedAmenityTypes",
      "getAllFilterTypes",
      "getScoreMode",
      "getWalkMinutes",
      "getActiveHeatmapId",
      "hasBuildingAmenityStatKeys",
      "getBuildingAmenityStatKeys",
      "setBuildingAmenityStatKeys",
    ].forEach(function (memberName) {
      requireFunction(state[memberName], "deps.state." + memberName);
    });

    function getActiveHeatmapIdFromState() {
      return state.getActiveHeatmapId();
    }

    function getActiveMetric(overrides) {
      var next = Object.assign(
        {
          scoreMode: state.getScoreMode(),
          walkMinutes: state.getWalkMinutes(),
          selectedAmenityTypes: Array.from(state.getSelectedAmenityTypes()),
          activeHeatmapId: getActiveHeatmapIdFromState(),
        },
        overrides || {}
      );
      return scoreModel.resolveActiveMetric(next);
    }

    function getCurrentScoreModelContext(overrides) {
      return Object.assign(
        {
          fixedMinutes: fixedMinutes,
          currentMode: getCurrentMode(),
          selectedAmenityTypes: Array.from(state.getSelectedAmenityTypes()),
          allFilterTypes: state.getAllFilterTypes(),
        },
        overrides || {}
      );
    }

    function getCurrentBuildingCleanFilteredScore(props, minutes) {
      return scoreModel.getBuildingCleanFilteredScore(
        props,
        minutes,
        Array.from(state.getSelectedAmenityTypes()),
        state.getAllFilterTypes(),
        getCurrentMode()
      );
    }

    function getCurrentBuildingOverallScore(props, minutes) {
      if (state.getScoreMode() === "weighted") {
        var metric = getActiveMetric();
        return scoreModel.normalizeStatus(
          metric && metric.buildingPropertyKey && props && props[metric.buildingPropertyKey]
        );
      }
      return scoreModel.getBuildingOverallScore(
        props,
        minutes,
        state.getScoreMode(),
        getCurrentScoreModelContext()
      );
    }

    function collectCurrentBuildingScores() {
      var buildingsData = getBuildingsData();
      if (!buildingsData || !Array.isArray(buildingsData.features) || buildingsData.features.length === 0) {
        return [];
      }
      var metric = getActiveMetric();
      if (!metric) return [];
      if (state.getScoreMode() === "weighted" && metric.id && metric.id.indexOf("u95.") === 0) {
        if (!metric.buildingPropertyKey) return [];
        return buildingsData.features
          .map(function (feature) {
            return scoreModel.normalizeStatus(
              feature && feature.properties && feature.properties[metric.buildingPropertyKey]
            );
          });
      }
      if (state.getSelectedAmenityTypes().size === 0 || state.getAllFilterTypes().length === 0) {
        return [];
      }
      return scoreModel.collectBuildingScores(buildingsData, state.getWalkMinutes(), function (props, minutes) {
        return getCurrentBuildingOverallScore(props, minutes);
      });
    }

    function getCurrentPercentileSeriesCacheKey(minutes) {
      return scoreModel.getPercentileSeriesCacheKey(
        minutes,
        getCurrentScoreModelContext({
          scoreMode: state.getScoreMode(),
        })
      );
    }

    function getCurrentBuildingAmenityStatKeysForMinutes(minutes) {
      var cacheKey = String(minutes);
      if (state.hasBuildingAmenityStatKeys(cacheKey)) {
        return state.getBuildingAmenityStatKeys(cacheKey);
      }
      var keys = scoreModel.getBuildingAmenityStatKeysForMinutes(minutes, getBuildingsData(), null);
      state.setBuildingAmenityStatKeys(cacheKey, keys);
      return keys;
    }

    return {
      getActiveMetric: getActiveMetric,
      getCurrentScoreModelContext: getCurrentScoreModelContext,
      getCurrentBuildingCleanFilteredScore: getCurrentBuildingCleanFilteredScore,
      getCurrentBuildingOverallScore: getCurrentBuildingOverallScore,
      collectCurrentBuildingScores: collectCurrentBuildingScores,
      getCurrentPercentileSeriesCacheKey: getCurrentPercentileSeriesCacheKey,
      getCurrentBuildingAmenityStatKeysForMinutes: getCurrentBuildingAmenityStatKeysForMinutes,
    };
  }

  window.Urban95ScoreContext = { create: create };
})();
