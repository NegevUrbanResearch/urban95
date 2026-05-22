(function () {
  function requireFunction(value, name) {
    if (typeof value !== "function") {
      throw new Error("Urban95ControlActions.create missing " + name);
    }
    return value;
  }

  function create(deps) {
    deps = deps || {};
    var perf = deps.perf || {
      session: function () {},
      phase: function (_name, callback) {
        return callback();
      },
    };
    var state = deps.state || {};
    var pointDataLoader = deps.pointDataLoader || {};
    var loadingUi = deps.loadingUi || {};
    var amenityMode = deps.amenityMode || {};
    var renderers = deps.renderers || {};
    var selection = deps.selection || {};
    var dashboards = deps.dashboards || {};
    var scoreSidebar = deps.scoreSidebar || {};
    var modeController = deps.modeController || {};
    var map = deps.map || {};
    var ui = deps.ui || {};
    var setIsochronesDeferred =
      typeof state.setIsochronesDeferred === "function" ? state.setIsochronesDeferred : null;
    var getNeighborhoodModal = ui.getNeighborhoodModal;
    var getCitywideModal = ui.getCitywideModal;

    [
      ["perf.session", perf.session],
      ["perf.phase", perf.phase],
      ["state.getCurrentMode", state.getCurrentMode],
      ["state.getSelectedBuilding", state.getSelectedBuilding],
      ["state.getSelectedNeighborhood", state.getSelectedNeighborhood],
      ["state.clearDerivedCaches", state.clearDerivedCaches],
      ["state.getIsochronesLoaded", state.getIsochronesLoaded],
      [
        "pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad",
        pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad,
      ],
      ["loadingUi.showIsochroneLoadingScreen", loadingUi.showIsochroneLoadingScreen],
      ["loadingUi.getWaitingForIsochroneLoad", loadingUi.getWaitingForIsochroneLoad],
      ["loadingUi.hideIsochroneLoadingScreen", loadingUi.hideIsochroneLoadingScreen],
      ["loadingUi.mark", loadingUi.mark],
      ["amenityMode.apply", amenityMode.apply],
      ["renderers.applyShowPointsToggle", renderers.applyShowPointsToggle],
      ["renderers.updateAmenitiesSource", renderers.updateAmenitiesSource],
      ["renderers.updateTreesSource", renderers.updateTreesSource],
      ["renderers.updateStreetLightsSource", renderers.updateStreetLightsSource],
      ["renderers.updateBuildingColors", renderers.updateBuildingColors],
      ["renderers.updateNeighborhoodSurfaceData", renderers.updateNeighborhoodSurfaceData],
      ["renderers.updateNeighborhoodColors", renderers.updateNeighborhoodColors],
      ["selection.loadIsochrones", selection.loadIsochrones],
      ["selection.selectBuilding", selection.selectBuilding],
      ["selection.updateRadiusInfo", selection.updateRadiusInfo],
      ["selection.clearRadiusSelection", selection.clearRadiusSelection],
      ["dashboards.showNeighborhoodModal", dashboards.showNeighborhoodModal],
      ["dashboards.renderCitywideModal", dashboards.renderCitywideModal],
      ["dashboards.updateCitywideModalTitle", dashboards.updateCitywideModalTitle],
      ["dashboards.hideNeighborhoodModal", dashboards.hideNeighborhoodModal],
      ["dashboards.hideCitywideModal", dashboards.hideCitywideModal],
      ["scoreSidebar.isOpen", scoreSidebar.isOpen],
      ["scoreSidebar.hide", scoreSidebar.hide],
      ["modeController.switchMode", modeController.switchMode],
      ["map.getLayer", map.getLayer],
      ["map.setLayoutProperty", map.setLayoutProperty],
      ["ui.getNeighborhoodModal", ui.getNeighborhoodModal],
      ["ui.getCitywideModal", ui.getCitywideModal],
    ].forEach(function (entry) {
      requireFunction(entry[1], entry[0]);
    });

    function clearDerivedCaches() {
      state.clearDerivedCaches();
    }

    function onFilterSelectionChanged() {
      renderers.updateBuildingColors();

      if (
        state.getSelectedBuilding() &&
        pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad()
      ) {
        selection.selectBuilding(state.getSelectedBuilding(), false);
      } else {
        renderers.updateAmenitiesSource();
        renderers.updateTreesSource();
        renderers.updateStreetLightsSource();
      }

      if (state.getCurrentMode() === "neighborhood") {
        renderers.updateNeighborhoodColors();
        var neighborhoodModal = getNeighborhoodModal();
        if (
          neighborhoodModal &&
          neighborhoodModal.classList &&
          neighborhoodModal.classList.contains("show") &&
          state.getSelectedNeighborhood()
        ) {
          dashboards.showNeighborhoodModal(state.getSelectedNeighborhood());
        }
      } else if (state.getCurrentMode() === "citywide") {
        renderers.updateNeighborhoodColors();
        var citywideModal = getCitywideModal();
        if (citywideModal && citywideModal.classList && citywideModal.classList.contains("show")) {
          dashboards.renderCitywideModal();
        } else {
          dashboards.updateCitywideModalTitle();
        }
      } else if (state.getCurrentMode() === "house") {
        renderers.updateNeighborhoodSurfaceData();
      }
    }

    function onScoreModeChanged(nextScoreMode) {
      perf.session(
        "score-model -> " + (nextScoreMode === "expanded" ? "Amenities Focus" : "Urban95")
      );
      return perf.phase("scoreModelToggle:handler", function () {
        if (nextScoreMode !== "weighted") {
          var shouldBlockForSelectedBuilding =
            !!state.getSelectedBuilding() && !state.getIsochronesLoaded();
          if (shouldBlockForSelectedBuilding) {
            loadingUi.showIsochroneLoadingScreen();
          }
          selection.loadIsochrones({ background: !shouldBlockForSelectedBuilding });
        } else {
          if (loadingUi.getWaitingForIsochroneLoad()) {
            loadingUi.hideIsochroneLoadingScreen();
          }
          if (setIsochronesDeferred) {
            setIsochronesDeferred();
          } else {
            loadingUi.mark("isochrones");
          }
        }

        return amenityMode.apply().then(function () {
          if (state.getSelectedBuilding()) {
            selection.updateRadiusInfo();
          }

          var citywideModal = getCitywideModal();
          if (
            state.getCurrentMode() === "citywide" &&
            citywideModal &&
            citywideModal.classList &&
            citywideModal.classList.contains("show")
          ) {
            dashboards.renderCitywideModal();
          }

          if (state.getCurrentMode() === "neighborhood") {
            renderers.updateNeighborhoodColors();
            var neighborhoodModal = getNeighborhoodModal();
            if (
              neighborhoodModal &&
              neighborhoodModal.classList &&
              neighborhoodModal.classList.contains("show") &&
              state.getSelectedNeighborhood()
            ) {
              dashboards.showNeighborhoodModal(state.getSelectedNeighborhood());
            }
          }
        });
      });
    }

    function onWalkMinutesChanged() {
      if (state.getCurrentMode() === "house") {
        renderers.updateBuildingColors();
        renderers.updateNeighborhoodSurfaceData();
        if (state.getSelectedBuilding()) {
          selection.selectBuilding(state.getSelectedBuilding(), false);
        }
      }

      if (state.getCurrentMode() === "neighborhood") {
        renderers.updateNeighborhoodColors();
        var neighborhoodModal = getNeighborhoodModal();
        if (
          state.getSelectedNeighborhood() &&
          neighborhoodModal &&
          neighborhoodModal.classList &&
          neighborhoodModal.classList.contains("show")
        ) {
          dashboards.showNeighborhoodModal(state.getSelectedNeighborhood());
        }
      }

      var citywideModal = getCitywideModal();
      if (
        state.getCurrentMode() === "citywide" &&
        citywideModal &&
        citywideModal.classList &&
        citywideModal.classList.contains("show")
      ) {
        dashboards.renderCitywideModal();
      }
    }

    function onModeToggleRequested(mode) {
      perf.session("analysis mode -> " + mode);
      return perf.phase("modeToggle:click", function () {
        modeController.switchMode(mode);
      });
    }

    function onHeatmapVisibilityChanged(visible) {
      if (state.getCurrentMode() !== "house" || !map.getLayer("neighborhoods-surface")) return;
      map.setLayoutProperty("neighborhoods-surface", "visibility", visible ? "visible" : "none");
    }

    function onEscape(event) {
      if (scoreSidebar.isOpen()) {
        scoreSidebar.hide();
        if (event && typeof event.stopPropagation === "function") {
          event.stopPropagation();
        }
        return;
      }

      if (state.getCurrentMode() === "house") {
        selection.clearRadiusSelection();
      } else if (state.getCurrentMode() === "neighborhood") {
        dashboards.hideNeighborhoodModal();
      } else if (state.getCurrentMode() === "citywide") {
        dashboards.hideCitywideModal();
        modeController.switchMode("house");
      }
    }

    return {
      clearDerivedCaches: clearDerivedCaches,
      onFilterSelectionChanged: onFilterSelectionChanged,
      onScoreModeChanged: onScoreModeChanged,
      onWalkMinutesChanged: onWalkMinutesChanged,
      onModeToggleRequested: onModeToggleRequested,
      onPointVisibilityChanged: renderers.applyShowPointsToggle,
      onHeatmapVisibilityChanged: onHeatmapVisibilityChanged,
      onEscape: onEscape,
    };
  }

  window.Urban95ControlActions = { create: create };
})();
