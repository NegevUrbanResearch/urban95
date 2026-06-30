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
    var perf = deps.perf || {
      phase: function (_name, callback) { return callback(); },
      span: function (_name, _meta, callback) { return callback(); },
      spanAsync: function (_name, _meta, promiseOrFactory) {
        return typeof promiseOrFactory === "function" ? promiseOrFactory() : promiseOrFactory;
      },
      counter: function () {},
    };
    var logger = deps.logger || { warn: function () {} };
    var state = deps.state || {};
    var ui = deps.ui || {};
    var renderers = deps.renderers || {};
    var selection = deps.selection || {};
    var pointDataLoader = deps.pointDataLoader || {};
    var pointLayerVisibilitySync =
      typeof renderers.syncPointLayerVisibility === "function"
        ? renderers.syncPointLayerVisibility
        : renderers.applyShowPointsToggle;

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
      ["ui.syncOverlayVisibility", ui.syncOverlayVisibility],
      ["pointDataLoader.ensureExpandedPointDataLoaded", pointDataLoader.ensureExpandedPointDataLoaded],
      ["pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad", pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad],
      ["renderers.syncPointLayerVisibility or renderers.applyShowPointsToggle", pointLayerVisibilitySync],
      ["renderers.updateAmenitiesSource", renderers.updateAmenitiesSource],
      ["renderers.updateTreesSource", renderers.updateTreesSource],
      ["renderers.updateStreetLightsSource", renderers.updateStreetLightsSource],
      ["renderers.updateBuildingColors", renderers.updateBuildingColors],
      ["renderers.updateNeighborhoodSurfaceData", renderers.updateNeighborhoodSurfaceData],
      ["selection.selectBuilding", selection.selectBuilding],
    ].forEach(function (entry) {
      requireFunction(entry[1], entry[0]);
    });

    var syncPointLayerVisibility =
      pointLayerVisibilitySync;
    var perfSpan =
      typeof perf.span === "function"
        ? perf.span
        : function (name, meta, callback) {
            void name;
            void meta;
            return callback();
          };
    var perfSpanAsync =
      typeof perf.spanAsync === "function"
        ? perf.spanAsync
        : function (name, meta, promiseOrFactory) {
            void name;
            void meta;
            return typeof promiseOrFactory === "function" ? promiseOrFactory() : promiseOrFactory;
          };
    var perfCounter = typeof perf.counter === "function" ? perf.counter : function () {};

    function apply() {
      return perf.phase("applyScoreModeAmenities", function () {
        var scoreMode = state.getScoreMode();
        var legacyData = state.getLegacyData();
        var useLegacy = scoreMode === "expanded" && hasFeatures(legacyData);
        perfCounter("amenityMode.apply:start", function () {
          return {
            scoreMode: scoreMode,
            useLegacy: useLegacy,
            currentMode: state.getCurrentMode(),
            hasSelectedBuilding: !!state.getSelectedBuilding(),
          };
        });
        if (scoreMode === "expanded" && !useLegacy && logger && typeof logger.warn === "function") {
          logger.warn("amenities_all.geojson missing or empty; Amenities Focus mode may be incomplete.");
        }
        perfSpan("amenityMode.apply:dataSwap", function () {
          return { scoreMode: scoreMode, useLegacy: useLegacy };
        }, function () {
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
        });
        perfSpan("amenityMode.apply:filterUi", function () {
          return { scoreMode: scoreMode };
        }, function () {
          ui.buildFilterItems();
          ui.syncFilterUiForScoreMode();
          ui.syncOverlayVisibility();
        });
        return perfSpanAsync(
          "amenityMode.apply:ensureExpandedPointDataLoaded",
          function () {
            return { refreshPolicy: "defer", scoreMode: scoreMode };
          },
          function () {
            return pointDataLoader.ensureExpandedPointDataLoaded({ refreshPolicy: "defer" });
          }
        )
          .then(function () {
            var selectedBuilding = state.getSelectedBuilding();
            var canRefreshSelectedBuilding =
              selectedBuilding && pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad();

            perfSpan("amenityMode.apply:syncPointVisibility", null, function () {
              syncPointLayerVisibility();
            });

            if (state.getCurrentMode() === "house") {
              perfSpan("amenityMode.apply:updateBuildingColors", null, function () {
                renderers.updateBuildingColors();
              });
              perfSpan("amenityMode.apply:updateNeighborhoodSurfaceData", null, function () {
                renderers.updateNeighborhoodSurfaceData();
              });
            }

            if (canRefreshSelectedBuilding) {
              perfSpan("amenityMode.apply:reselectBuilding", function () {
                return { scoreMode: scoreMode };
              }, function () {
                selection.selectBuilding(selectedBuilding, false, {
                  suppressIsochroneLoadingOverlay: true,
                });
              });
              return { refreshedSelectedBuilding: true };
            }

            perfSpan("amenityMode.apply:fallbackPointSourceRefresh", function () {
              return { scoreMode: scoreMode };
            }, function () {
              renderers.updateAmenitiesSource();
              renderers.updateTreesSource();
              renderers.updateStreetLightsSource();
            });
            return { refreshedSelectedBuilding: false };
          });
      });
    }

    return { apply: apply };
  }

  window.Urban95AmenityMode = { create: create };
})();
