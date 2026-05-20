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
    var getSelectedWeightedCategoryStem = requireFunction(
      deps.getSelectedWeightedCategoryStem,
      "deps.getSelectedWeightedCategoryStem"
    );
    var fixedMinutes = requireNumber(deps.fixedMinutes, "deps.fixedMinutes");

    [
      "getBuildingCleanFilteredScore",
      "getBuildingOverallScore",
      "collectBuildingScores",
      "getWeightedAverageValueFromSource",
      "weightedNeighborhoodRankingRows",
      "getCitywideWeightedAverageScore",
      "getPercentileSeriesCacheKey",
      "getBuildingAmenityStatKeysForMinutes",
    ].forEach(function (memberName) {
      requireFunction(scoreModel[memberName], "deps.scoreModel." + memberName);
    });

    [
      "getSelectedAmenityTypes",
      "getAllFilterTypes",
      "getScoreMode",
      "getWalkMinutes",
      "hasBuildingAmenityStatKeys",
      "getBuildingAmenityStatKeys",
      "setBuildingAmenityStatKeys",
    ].forEach(function (memberName) {
      requireFunction(state[memberName], "deps.state." + memberName);
    });

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
      if (state.getSelectedAmenityTypes().size === 0 || state.getAllFilterTypes().length === 0) {
        return [];
      }
      return scoreModel.collectBuildingScores(buildingsData, state.getWalkMinutes(), function (props, minutes) {
        return getCurrentBuildingOverallScore(props, minutes);
      });
    }

    function getWeightedAverageValueFromCurrentSelection(source, sfx) {
      return scoreModel.getWeightedAverageValueFromSource(
        source,
        sfx,
        getSelectedWeightedCategoryStem()
      );
    }

    function weightedNeighborhoodRankingRowsForCurrentSelection(stats, sfx) {
      return scoreModel.weightedNeighborhoodRankingRows(
        stats,
        sfx,
        getSelectedWeightedCategoryStem()
      );
    }

    function getCitywideWeightedAverageScoreForCurrentSelection(stats, sfx) {
      return scoreModel.getCitywideWeightedAverageScore(
        stats,
        sfx,
        getCurrentScoreModelContext({
          selectedStem: getSelectedWeightedCategoryStem(),
          buildingsData: getBuildingsData(),
        })
      );
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
      getCurrentScoreModelContext: getCurrentScoreModelContext,
      getCurrentBuildingCleanFilteredScore: getCurrentBuildingCleanFilteredScore,
      getCurrentBuildingOverallScore: getCurrentBuildingOverallScore,
      collectCurrentBuildingScores: collectCurrentBuildingScores,
      getWeightedAverageValueFromCurrentSelection: getWeightedAverageValueFromCurrentSelection,
      weightedNeighborhoodRankingRowsForCurrentSelection: weightedNeighborhoodRankingRowsForCurrentSelection,
      getCitywideWeightedAverageScoreForCurrentSelection: getCitywideWeightedAverageScoreForCurrentSelection,
      getCurrentPercentileSeriesCacheKey: getCurrentPercentileSeriesCacheKey,
      getCurrentBuildingAmenityStatKeysForMinutes: getCurrentBuildingAmenityStatKeysForMinutes,
    };
  }

  window.Urban95ScoreContext = { create: create };
})();
