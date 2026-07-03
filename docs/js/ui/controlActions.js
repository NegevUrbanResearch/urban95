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
      mark: function () {},
      phase: function (_name, callback) {
        return callback();
      },
      span: function (_name, _meta, callback) {
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
    var neighborhoodSidebar = deps.neighborhoodSidebar || {};
    var modeController = deps.modeController || {};
    var map = deps.map || {};
    var ui = deps.ui || {};
    var controls = deps.controls || {};
    var clearTooltip =
      typeof ui.clearTooltip === "function" ? ui.clearTooltip : function () {};
    var setIsochronesDeferred =
      typeof state.setIsochronesDeferred === "function" ? state.setIsochronesDeferred : null;
    var requestAnimationFrameFn =
      typeof deps.requestAnimationFrame === "function"
        ? deps.requestAnimationFrame
        : typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame.bind(window)
          : null;
    var getCitywideModal = ui.getCitywideModal;

    [
      ["perf.session", perf.session],
      ["perf.phase", perf.phase],
      ["state.getCurrentMode", state.getCurrentMode],
      ["state.getScoreMode", state.getScoreMode],
      ["state.getSelectedBuilding", state.getSelectedBuilding],
      ["state.getSelectedNeighborhood", state.getSelectedNeighborhood],
      ["state.clearDerivedCaches", state.clearDerivedCaches],
      ["state.getActiveHeatmapId", state.getActiveHeatmapId],
      ["state.setActiveHeatmapId", state.setActiveHeatmapId],
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
      ["dashboards.renderCitywideModal", dashboards.renderCitywideModal],
      ["dashboards.updateCitywideModalTitle", dashboards.updateCitywideModalTitle],
      ["dashboards.hideCitywideModal", dashboards.hideCitywideModal],
      ["scoreSidebar.isOpen", scoreSidebar.isOpen],
      ["scoreSidebar.hide", scoreSidebar.hide],
      ["neighborhoodSidebar.show", neighborhoodSidebar.show],
      ["neighborhoodSidebar.sync", neighborhoodSidebar.sync],
      ["neighborhoodSidebar.hide", neighborhoodSidebar.hide],
      ["neighborhoodSidebar.isOpen", neighborhoodSidebar.isOpen],
      ["modeController.switchMode", modeController.switchMode],
      ["ui.getCitywideModal", ui.getCitywideModal],
    ].forEach(function (entry) {
      requireFunction(entry[1], entry[0]);
    });

    var perfMark = typeof perf.mark === "function" ? perf.mark : function () {};
    var perfSpan =
      typeof perf.span === "function"
        ? perf.span
        : function (name, meta, callback) {
            void name;
            void meta;
            return callback();
          };
    var refreshLegend =
      typeof controls.refreshLegend === "function" ? controls.refreshLegend : function () {};
    var syncScoreSidebar =
      typeof scoreSidebar.sync === "function" ? scoreSidebar.sync : null;
    var updateDeckAmenityLayers =
      typeof renderers.updateDeckAmenityLayers === "function"
        ? renderers.updateDeckAmenityLayers
        : function () {};

    function flowMeta(extra) {
      var selectedBuilding = state.getSelectedBuilding();
      return Object.assign(
        {
          mode: state.getCurrentMode(),
          scoreMode: state.getScoreMode(),
          hasSelectedBuilding: !!selectedBuilding,
          walkMinutes: state.getWalkMinutes ? state.getWalkMinutes() : "",
          isochronesLoaded: state.getIsochronesLoaded(),
        },
        extra || {}
      );
    }

    function clearDerivedCaches() {
      state.clearDerivedCaches();
    }

    function requestAnimationFrameOrNow(callback) {
      if (requestAnimationFrameFn) {
        return requestAnimationFrameFn(callback);
      }
      return callback();
    }

    function refreshRightPanels(options) {
      options = options || {};
      var currentMode = state.getCurrentMode();

      if (state.getSelectedBuilding() && syncScoreSidebar && options.syncScoreSidebar !== false) {
        syncScoreSidebar();
      }

      if (currentMode === "neighborhood") {
        renderers.updateNeighborhoodColors();
        if (neighborhoodSidebar.isOpen() && state.getSelectedNeighborhood()) {
          neighborhoodSidebar.sync(state.getSelectedNeighborhood());
        }
      } else if (currentMode === "citywide") {
        renderers.updateNeighborhoodColors();
        var citywideModal = getCitywideModal();
        if (citywideModal && citywideModal.classList && citywideModal.classList.contains("show")) {
          dashboards.renderCitywideModal();
        } else {
          dashboards.updateCitywideModalTitle();
        }
      }
    }

    function applyScoreStateChange(options) {
      options = options || {};
      var shouldUpdateSurface = state.getCurrentMode() === "house" || options.forceSurface === true;
      var updateSurface = function () {
        if (!shouldUpdateSurface) return;
        if (options.surfaceSpanName) {
          perfSpan(options.surfaceSpanName, flowMeta, function () {
            renderers.updateNeighborhoodSurfaceData();
          });
          return;
        }
        renderers.updateNeighborhoodSurfaceData();
      };

      if (options.surfaceFirst === true) {
        updateSurface();
      }

      if (typeof options.afterSurface === "function") {
        options.afterSurface();
      }

      if (options.skipBuildingColors !== true) {
        renderers.updateBuildingColors();
      }

      if (typeof options.afterBuildingColors === "function") {
        options.afterBuildingColors();
      }

      if (options.surfaceFirst !== true) {
        updateSurface();
      }

      refreshRightPanels(options);
      refreshLegend();
    }

    function refreshExpandedPointSources() {
      if (
        state.getSelectedBuilding() &&
        pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad()
      ) {
        selection.selectBuilding(state.getSelectedBuilding(), false);
        return;
      }
      renderers.updateAmenitiesSource();
      renderers.updateTreesSource();
      renderers.updateStreetLightsSource();
    }

    function onFilterSelectionChanged() {
      applyScoreStateChange({
        afterBuildingColors: refreshExpandedPointSources,
      });
    }

    function onScoreModeChanged(nextScoreMode) {
      if (nextScoreMode === "weighted" && !state.getActiveHeatmapId()) {
        state.setActiveHeatmapId("u95.overall");
      }

      perf.session(
        "score-model -> " + (nextScoreMode === "expanded" ? "Amenities Focus" : "Urban95")
      );
      perfMark("scoreModelToggle:start", function () {
        return flowMeta({ nextScoreMode: nextScoreMode });
      });
      return perf.phase("scoreModelToggle:handler", function () {
        if (nextScoreMode !== "weighted") {
          selection.loadIsochrones({ background: true });
        } else {
          if (loadingUi.getWaitingForIsochroneLoad()) {
            loadingUi.hideIsochroneLoadingScreen({ reason: "scoreModeToggleWeighted" });
          }
          if (setIsochronesDeferred) {
            setIsochronesDeferred();
          } else {
            loadingUi.mark("isochrones");
          }
        }

        return perfSpan("scoreModelToggle:applyScoreModeAmenities", flowMeta, function () {
          return amenityMode.apply();
        }).then(function (applyResult) {
          var selectedBuildingWasRefreshed =
            applyResult && applyResult.refreshedSelectedBuilding === true;
          if (state.getSelectedBuilding() && !selectedBuildingWasRefreshed) {
            perfSpan("scoreModelToggle:updateRadiusInfo", flowMeta, function () {
              selection.updateRadiusInfo();
            });
          }

          applyScoreStateChange({
            skipBuildingColors: state.getCurrentMode() === "house",
            forceSurface: state.getCurrentMode() === "house",
            syncScoreSidebar: false,
          });
        });
      });
    }

    function onWalkMinutesChanged() {
      perfMark("walkMinutesToggle:start", flowMeta);
      if (state.getCurrentMode() === "house") {
        applyScoreStateChange({
          surfaceFirst: true,
          skipBuildingColors: true,
          surfaceSpanName: "walkMinutesToggle:updateNeighborhoodSurfaceData",
          afterSurface: function () {
            var selectedBuilding = state.getSelectedBuilding();
            if (selectedBuilding) {
              perfSpan("walkMinutesToggle:selectBuilding", flowMeta, function () {
                selection.selectBuilding(selectedBuilding, false);
              });
              requestAnimationFrameOrNow(function () {
                perfSpan("walkMinutesToggle:updateBuildingColors", flowMeta, function () {
                  renderers.updateBuildingColors();
                });
              });
            } else {
              perfSpan("walkMinutesToggle:updateBuildingColors", flowMeta, function () {
                renderers.updateBuildingColors();
              });
            }
          },
        });
        return;
      }

      applyScoreStateChange({
        skipBuildingColors: true,
      });
    }

    function onModeToggleRequested(mode) {
      perf.session("analysis mode -> " + mode);
      return perf.phase("modeToggle:click", function () {
        modeController.switchMode(mode);
      });
    }

    function onPointVisibilityChanged() {
      renderers.applyShowPointsToggle();
      if (state.getScoreMode() === "weighted") {
        renderers.updateAmenitiesSource();
      }
      updateDeckAmenityLayers();
      applyScoreStateChange();
    }

    function setActiveHeatmap(nextHeatmapId) {
      state.setActiveHeatmapId(nextHeatmapId);
      clearTooltip();
      clearDerivedCaches();
      applyScoreStateChange();
    }

    function onEscape(event) {
      if (scoreSidebar.isOpen()) {
        scoreSidebar.hide();
        if (event && typeof event.stopPropagation === "function") {
          event.stopPropagation();
        }
        return;
      }

      if (neighborhoodSidebar.isOpen()) {
        neighborhoodSidebar.hide();
        if (event && typeof event.stopPropagation === "function") {
          event.stopPropagation();
        }
        return;
      }

      if (state.getCurrentMode() === "house") {
        selection.clearRadiusSelection();
      } else if (state.getCurrentMode() === "citywide") {
        dashboards.hideCitywideModal();
        modeController.switchMode("house");
      }
    }

    return {
      clearDerivedCaches: clearDerivedCaches,
      applyScoreStateChange: applyScoreStateChange,
      onFilterSelectionChanged: onFilterSelectionChanged,
      onScoreModeChanged: onScoreModeChanged,
      onWalkMinutesChanged: onWalkMinutesChanged,
      onModeToggleRequested: onModeToggleRequested,
      onPointVisibilityChanged: onPointVisibilityChanged,
      setActiveHeatmap: setActiveHeatmap,
      onEscape: onEscape,
    };
  }

  window.Urban95ControlActions = { create: create };
})();
