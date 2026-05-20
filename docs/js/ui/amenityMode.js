(function () {
  function requireFunction(value, name) {
    if (typeof value !== "function") throw new Error("Urban95AmenityMode.create missing " + name);
    return value;
  }

  function hasFeatures(fc) {
    return !!fc && Array.isArray(fc.features) && fc.features.length > 0;
  }

  function create(deps) {
    deps = deps || {};
    var perf = deps.perf || { phase: function (_name, callback) { return callback(); } };
    var logger = deps.logger || { warn: function () {} };
    var state = deps.state || {};
    var ui = deps.ui || {};
    var renderers = deps.renderers || {};
    var selection = deps.selection || {};
    var pointDataLoader = deps.pointDataLoader || {};

    [
      ["state.getScoreMode", state.getScoreMode],
      ["state.getCleanData", state.getCleanData],
      ["state.getCleanTypes", state.getCleanTypes],
      ["state.getCleanTypesWithData", state.getCleanTypesWithData],
      ["state.getLegacyData", state.getLegacyData],
      ["state.getLegacyTypes", state.getLegacyTypes],
      ["state.getLegacyTypesWithData", state.getLegacyTypesWithData],
      ["state.setAllAmenitiesData", state.setAllAmenitiesData],
      ["state.setAllAmenityTypes", state.setAllAmenityTypes],
      ["state.setTypesWithData", state.setTypesWithData],
      ["state.clearRadiusIds", state.clearRadiusIds],
      ["state.getCurrentMode", state.getCurrentMode],
      ["state.getSelectedBuilding", state.getSelectedBuilding],
      ["ui.buildFilterItems", ui.buildFilterItems],
      ["ui.syncFilterUiForScoreMode", ui.syncFilterUiForScoreMode],
      ["ui.updateShowPointsToggleLabel", ui.updateShowPointsToggleLabel],
      ["pointDataLoader.ensureExpandedPointDataLoaded", pointDataLoader.ensureExpandedPointDataLoaded],
      ["pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad", pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad],
      ["renderers.applyShowPointsToggle", renderers.applyShowPointsToggle],
      ["renderers.updateAmenitiesSource", renderers.updateAmenitiesSource],
      ["renderers.updateTreesSource", renderers.updateTreesSource],
      ["renderers.updateStreetLightsSource", renderers.updateStreetLightsSource],
      ["renderers.updateBuildingColors", renderers.updateBuildingColors],
      ["renderers.updateNeighborhoodSurfaceData", renderers.updateNeighborhoodSurfaceData],
      ["selection.selectBuilding", selection.selectBuilding],
    ].forEach(function (entry) {
      requireFunction(entry[1], entry[0]);
    });

    function apply() {
      return perf.phase("applyScoreModeAmenities", function () {
        var scoreMode = state.getScoreMode();
        var legacyData = state.getLegacyData();
        var useLegacy = scoreMode === "expanded" && hasFeatures(legacyData);
        if (scoreMode === "expanded" && !useLegacy && logger && typeof logger.warn === "function") {
          logger.warn("amenities_all.geojson missing or empty; Amenities Focus mode may be incomplete.");
        }
        if (useLegacy) {
          state.setAllAmenitiesData(legacyData);
          state.setAllAmenityTypes(state.getLegacyTypes().slice());
          state.setTypesWithData(new Set(state.getLegacyTypesWithData()));
        } else {
          state.setAllAmenitiesData(state.getCleanData());
          state.setAllAmenityTypes(state.getCleanTypes().slice());
          state.setTypesWithData(new Set(state.getCleanTypesWithData()));
        }
        state.clearRadiusIds();
        ui.buildFilterItems();
        ui.syncFilterUiForScoreMode();
        ui.updateShowPointsToggleLabel();
        return pointDataLoader.ensureExpandedPointDataLoaded().then(function () {
          renderers.applyShowPointsToggle();
          renderers.updateAmenitiesSource();
          renderers.updateTreesSource();
          renderers.updateStreetLightsSource();
          if (state.getCurrentMode() === "house") {
            renderers.updateBuildingColors();
            renderers.updateNeighborhoodSurfaceData();
          }
          if (state.getSelectedBuilding() && pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad()) {
            selection.selectBuilding(state.getSelectedBuilding(), false);
          }
        });
      });
    }

    return { apply: apply };
  }

  window.Urban95AmenityMode = { create: create };
})();
