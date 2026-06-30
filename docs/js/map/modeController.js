(function () {
  function requireObject(value, name) {
    if (!value || typeof value !== "object") {
      throw new Error("Urban95ModeController requires " + name);
    }
    return value;
  }

  function requireFunction(value, name) {
    if (typeof value !== "function") {
      throw new Error("Urban95ModeController requires " + name);
    }
    return value;
  }

  function requireNumber(value, name) {
    if (typeof value !== "number") {
      throw new Error("Urban95ModeController requires " + name);
    }
    return value;
  }

  function requireMethod(objectValue, objectName, methodName) {
    return requireFunction(
      requireObject(objectValue, objectName)[methodName],
      objectName + "." + methodName
    );
  }

  function logAsyncError(logger, context, error) {
    logger.error(context, error);
  }

  function requireStyleElement(value, name) {
    var element = requireObject(value, name);
    requireObject(element.style, name + ".style");
    return element;
  }

  function create(deps) {
    deps = requireObject(deps || {}, "deps");

    var runtime = requireObject(deps.runtime, "deps.runtime");
    var integrations = requireObject(deps.integrations, "deps.integrations");
    var ui = requireObject(deps.ui, "deps.ui");
    var state = requireObject(deps.state, "deps.state");
    var contracts = requireObject(deps.contracts, "deps.contracts");
    var assets = requireObject(deps.assets, "deps.assets");
    var geo = requireObject(deps.geo, "deps.geo");
    var scoring = deps.scoring || {};

    var map = requireObject(runtime.map, "deps.runtime.map");
    var perf = requireObject(runtime.perf, "deps.runtime.perf");
    var logger = requireObject(runtime.logger, "deps.runtime.logger");
    requireMethod(perf, "deps.runtime.perf", "phase");
    requireMethod(perf, "deps.runtime.perf", "phaseAsync");
    requireMethod(logger, "deps.runtime.logger", "debug");
    requireMethod(logger, "deps.runtime.logger", "error");
    [
      "getLayer",
      "addLayer",
      "moveLayer",
      "setPaintProperty",
      "setFilter",
      "setLayoutProperty",
      "getSource",
      "fitBounds",
    ].forEach(function (methodName) {
      requireMethod(map, "deps.runtime.map", methodName);
    });

    var dashboards = requireObject(integrations.dashboards, "deps.integrations.dashboards");
    var mapRenderers = requireObject(integrations.mapRenderers, "deps.integrations.mapRenderers");
    var selection = requireObject(integrations.selection, "deps.integrations.selection");
    var neighborhoodSidebar = requireObject(
      integrations.neighborhoodSidebar,
      "deps.integrations.neighborhoodSidebar"
    );
    [
      "getNeighborhoodHexSurfaceOpacityExpression",
      "loadNeighborhoodSurfaceData",
      "loadNeighborhoods",
      "loadNeighborhoodChartsPayload",
      "loadCitywideStats",
      "hideCitywideModal",
      "renderCitywideModal",
      "showCitywideModal",
    ].forEach(function (methodName) {
      requireMethod(dashboards, "deps.integrations.dashboards", methodName);
    });
    requireMethod(neighborhoodSidebar, "deps.integrations.neighborhoodSidebar", "hide");
    [
      "applyShowPointsToggle",
      "updateDeckAmenityLayers",
      "updateBuildingColors",
      "updateNeighborhoodSurfaceData",
      "setTreesAndLightsVisibility",
      "updateNeighborhoodColors",
    ].forEach(function (methodName) {
      requireMethod(mapRenderers, "deps.integrations.mapRenderers", methodName);
    });
    requireMethod(selection, "deps.integrations.selection", "clearRadiusSelection");

    var modeHint = ui.modeHint || null;
    var modeToggle = requireObject(ui.modeToggle, "deps.ui.modeToggle");
    requireMethod(modeToggle, "deps.ui.modeToggle", "querySelectorAll");
    var indicatorsSection = requireStyleElement(
      ui.indicatorsSection,
      "deps.ui.indicatorsSection"
    );
    var radiusInfo = requireStyleElement(ui.radiusInfo, "deps.ui.radiusInfo");
    var citywideBody = requireObject(ui.citywideBody, "deps.ui.citywideBody");

    var getCurrentMode = requireFunction(state.getCurrentMode, "deps.state.getCurrentMode");
    var setCurrentMode = requireFunction(state.setCurrentMode, "deps.state.setCurrentMode");
    var setSelectedNeighborhood = requireFunction(
      state.setSelectedNeighborhood,
      "deps.state.setSelectedNeighborhood"
    );
    var getActiveMetric =
      typeof scoring.getActiveMetric === "function" ? scoring.getActiveMetric : null;
    var buildingsFillLayerId = contracts.buildingsFillLayerId;
    if (typeof buildingsFillLayerId !== "string" || !buildingsFillLayerId) {
      throw new Error("Urban95ModeController requires deps.contracts.buildingsFillLayerId");
    }
    var neighborhoodSurfaceSourceLayerFallback = contracts.neighborhoodSurfaceSourceLayerFallback;
    if (
      typeof neighborhoodSurfaceSourceLayerFallback !== "string" ||
      !neighborhoodSurfaceSourceLayerFallback
    ) {
      throw new Error(
        "Urban95ModeController requires deps.contracts.neighborhoodSurfaceSourceLayerFallback"
      );
    }
    var houseModeHexOpacity = requireNumber(
      contracts.houseModeHexOpacity,
      "deps.contracts.houseModeHexOpacity"
    );

    var syncFilterUiForScoreMode = requireFunction(
      assets.syncFilterUiForScoreMode,
      "deps.assets.syncFilterUiForScoreMode"
    );
    var updateFilterLabel = requireFunction(
      assets.updateFilterLabel,
      "deps.assets.updateFilterLabel"
    );
    var hasGeneratedArtifact = requireFunction(
      assets.hasGeneratedArtifact,
      "deps.assets.hasGeneratedArtifact"
    );
    var sourceLayer = requireFunction(assets.sourceLayer, "deps.assets.sourceLayer");
    var getNeighborhoodSurfaceColorExpression = requireFunction(
      assets.getNeighborhoodSurfaceColorExpression,
      "deps.assets.getNeighborhoodSurfaceColorExpression"
    );
    var getNeighborhoodSurfaceScorePropertyKey = requireFunction(
      assets.getNeighborhoodSurfaceScorePropertyKey,
      "deps.assets.getNeighborhoodSurfaceScorePropertyKey"
    );
    var onModeChanged =
      typeof assets.onModeChanged === "function" ? assets.onModeChanged : function () {};
    var setLegendVisible =
      typeof assets.setLegendVisible === "function" ? assets.setLegendVisible : function () {};

    var turf = requireObject(geo.turf, "deps.geo.turf");
    requireMethod(turf, "deps.geo.turf", "bbox");
    var modeTransitionGeneration = 0;
    var perfMark = typeof perf.mark === "function" ? perf.mark : function () {};
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

    function nextModeToken() {
      modeTransitionGeneration += 1;
      return modeTransitionGeneration;
    }

    function isCurrentModeToken(token) {
      return token === modeTransitionGeneration;
    }

    function emptyFeatureCollection() {
      return { type: "FeatureCollection", features: [] };
    }

    function neighborhoodLabelPoint(feature) {
      if (!feature || !feature.geometry) return null;
      if (typeof turf.centerOfMass === "function") {
        try {
          var center = turf.centerOfMass(feature);
          if (
            center &&
            center.geometry &&
            typeof turf.booleanPointInPolygon === "function" &&
            turf.booleanPointInPolygon(center, feature)
          ) {
            return center;
          }
        } catch (error) {
          logger.debug(function () {
            return ["[Neighborhood] Center label point failed", error && error.message ? error.message : error];
          });
        }
      }
      if (typeof turf.pointOnFeature === "function") {
        try {
          return turf.pointOnFeature(feature);
        } catch (error) {
          logger.debug(function () {
            return ["[Neighborhood] Inside label point failed", error && error.message ? error.message : error];
          });
        }
      }
      try {
        if (typeof turf.center === "function") {
          return turf.center(feature);
        }
      } catch (error) {
        logger.debug(function () {
          return ["[Neighborhood] Label point fallback failed", error && error.message ? error.message : error];
        });
      }
      return null;
    }

    function buildNeighborhoodLabelSourceData(neighborhoodsData) {
      if (!neighborhoodsData || !Array.isArray(neighborhoodsData.features)) {
        return emptyFeatureCollection();
      }
      return {
        type: "FeatureCollection",
        features: neighborhoodsData.features
          .map(function (feature, index) {
            var point = neighborhoodLabelPoint(feature);
            if (!point || !point.geometry) return null;
            return {
              type: "Feature",
              properties: {
                label_id: index,
                Name: feature.properties && feature.properties.Name ? feature.properties.Name : "",
              },
              geometry: point.geometry,
            };
          })
          .filter(Boolean),
      };
    }

    function updateNeighborhoodLabelSource(neighborhoodsData) {
      var labelSource = map.getSource("neighborhood-labels");
      if (!labelSource || typeof labelSource.setData !== "function") return;
      labelSource.setData(buildNeighborhoodLabelSourceData(neighborhoodsData));
    }

    function addNeighborhoodLayers() {
      if (map.getLayer("neighborhoods-fill")) return;
      logger.debug(function () {
        return ["[Neighborhood] Adding layers dynamically"];
      });

      var surfaceBeforeId = map.getLayer(buildingsFillLayerId) ? buildingsFillLayerId : undefined;
      perfSpan("mode:neighborhood:addSurfaceLayer", function () {
        return { generatedSurface: hasGeneratedArtifact("neighborhood_surface") };
      }, function () {
        map.addLayer(
          Object.assign(
            {
              id: "neighborhoods-surface",
              type: "fill",
              source: "neighborhood-score-surface",
              paint: {
                "fill-color": getNeighborhoodSurfaceColorExpression(
                  getNeighborhoodSurfaceScorePropertyKey()
                ),
                "fill-outline-color": getNeighborhoodSurfaceColorExpression(
                  getNeighborhoodSurfaceScorePropertyKey()
                ),
                "fill-opacity": dashboards.getNeighborhoodHexSurfaceOpacityExpression(),
                "fill-antialias": true,
              },
              layout: { visibility: "none" },
            },
            hasGeneratedArtifact("neighborhood_surface")
              ? {
                  "source-layer": sourceLayer(
                    "neighborhood_surface",
                    neighborhoodSurfaceSourceLayerFallback
                  ),
                }
              : {}
          ),
          surfaceBeforeId
        );
      });

      perfSpan("mode:neighborhood:addBoundaryLayers", null, function () {
        map.addLayer({
          id: "neighborhoods-fill",
          type: "fill",
          source: "neighborhoods",
          paint: { "fill-color": "#3b82f6", "fill-opacity": 0.6 },
          layout: { visibility: "none" },
        });
        map.addLayer({
          id: "neighborhoods-line",
          type: "line",
          source: "neighborhoods",
          paint: { "line-color": "#1e3a5f", "line-width": 2.5, "line-opacity": 0.9 },
          layout: { visibility: "none" },
        });
        map.addLayer({
          id: "neighborhoods-label",
          type: "symbol",
          source: "neighborhood-labels",
          layout: {
            visibility: "none",
            "text-field": ["coalesce", ["get", "Name"], ""],
            "text-font": ["Noto Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 9, 12, 12, 15, 15, 19],
            "text-anchor": "center",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
            "text-padding": 8,
            "text-max-width": 9,
          },
          paint: {
            "text-color": "#102033",
            "text-halo-color": "#ffffff",
            "text-halo-width": 2.4,
            "text-halo-blur": 0.35,
            "text-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.85, 10, 0.95, 14, 1],
          },
        });
      });
    }

    function applyHouseModeHexBackground() {
      if (getCurrentMode() !== "house") return Promise.resolve();
      var surfaceLoad = hasGeneratedArtifact("neighborhood_surface")
        ? Promise.resolve(null)
        : Promise.resolve().then(function () {
            return dashboards.loadNeighborhoodSurfaceData();
          });
      return surfaceLoad
        .then(function () {
          if (getCurrentMode() !== "house") return;
          addNeighborhoodLayers();
          if (!map.getLayer("neighborhoods-surface")) return;
          if (map.getLayer(buildingsFillLayerId)) {
            map.moveLayer("neighborhoods-surface", buildingsFillLayerId);
          }
          map.setPaintProperty("neighborhoods-surface", "fill-opacity", houseModeHexOpacity);
          map.setFilter("neighborhoods-surface", ["==", ["to-number", ["get", "has_buildings"], 0], 1]);
          var metric = getActiveMetric ? getActiveMetric() : null;
          var heatmapVisible = !!metric;
          map.setLayoutProperty(
            "neighborhoods-surface",
            "visibility",
            heatmapVisible ? "visible" : "none"
          );
          mapRenderers.updateNeighborhoodSurfaceData();
        })
        .catch(function (error) {
          logAsyncError(logger, "Urban95ModeController house-mode surface update failed", error);
        });
    }

    function setPointsVisibilityForMode(mode) {
      void mode;
      indicatorsSection.style.display = "";
    }

    function setControlsForMode(mode) {
      if (mode === "house") {
        setPointsVisibilityForMode(mode);
        if (modeHint) modeHint.textContent = "Click map to analyze nearest building";
      } else if (mode === "neighborhood") {
        setPointsVisibilityForMode(mode);
        if (modeHint) modeHint.textContent = "Click a neighborhood for details";
      } else {
        setPointsVisibilityForMode(mode);
        if (modeHint) modeHint.textContent = "";
      }

      syncFilterUiForScoreMode();
      updateFilterLabel();
    }

    function beginModeVisualState(mode) {
      setControlsForMode(mode);
      if (mode !== "house") {
        radiusInfo.style.display = "none";
        mapRenderers.setTreesAndLightsVisibility(false);
        mapRenderers.updateDeckAmenityLayers();
      }
    }

    function enterHouseMode(token) {
      return perf.phase("enterHouseMode", function () {
        if (map.getLayer(buildingsFillLayerId)) {
          map.setLayoutProperty(buildingsFillLayerId, "visibility", "visible");
          map.setPaintProperty(buildingsFillLayerId, "fill-opacity", 1);
        }
        if (map.getLayer("neighborhoods-fill")) map.setLayoutProperty("neighborhoods-fill", "visibility", "none");
        if (map.getLayer("neighborhoods-line")) map.setLayoutProperty("neighborhoods-line", "visibility", "none");
        if (map.getLayer("neighborhoods-label")) map.setLayoutProperty("neighborhoods-label", "visibility", "none");

        mapRenderers.applyShowPointsToggle();
        mapRenderers.updateDeckAmenityLayers();
        mapRenderers.updateBuildingColors();
        applyHouseModeHexBackground(token);
      });
    }

    function enterNeighborhoodMode(token) {
      perf.phase("enterNeighborhoodMode:syncSetup", function () {
        logger.debug(function () {
          return ["[Neighborhood] Entering neighborhood mode"];
        });

        if (map.getLayer(buildingsFillLayerId)) {
          map.setLayoutProperty(buildingsFillLayerId, "visibility", "none");
        }
        if (map.getLayer("neighborhoods-surface")) {
          map.setPaintProperty(
            "neighborhoods-surface",
            "fill-opacity",
            dashboards.getNeighborhoodHexSurfaceOpacityExpression()
          );
          map.setFilter("neighborhoods-surface", null);
        }
      });

      var neighborhoodsPromise = perfSpanAsync("enterNeighborhoodMode:loadNeighborhoods", null, function () {
        return dashboards.loadNeighborhoods();
      });
      var chartsPromise = perfSpanAsync("enterNeighborhoodMode:loadNeighborhoodCharts", null, function () {
        return dashboards.loadNeighborhoodChartsPayload();
      });
      var surfacePromise = hasGeneratedArtifact("neighborhood_surface")
        ? Promise.resolve(null)
        : perfSpanAsync("enterNeighborhoodMode:loadNeighborhoodSurface", null, function () {
            return dashboards.loadNeighborhoodSurfaceData();
          });

      return perf.phaseAsync(
        "enterNeighborhoodMode:loadsThenApply",
        Promise.all([neighborhoodsPromise, chartsPromise, surfacePromise]).then(function (results) {
          var data = results[0];
          if (!isCurrentModeToken(token) || getCurrentMode() !== "neighborhood") return;
          return perf.phase("enterNeighborhoodMode:applyLayersFitBounds", function () {
            if (!isCurrentModeToken(token) || getCurrentMode() !== "neighborhood") return;
            var src = map.getSource("neighborhoods");
            if (src) {
              perfSpan("enterNeighborhoodMode:setNeighborhoodSource", function () {
                return { features: data && data.features ? data.features.length : 0 };
              }, function () {
                src.setData(data);
              });
            }
            updateNeighborhoodLabelSource(data);
            if (!isCurrentModeToken(token) || getCurrentMode() !== "neighborhood") return;
            addNeighborhoodLayers();
            perfSpan("enterNeighborhoodMode:updateNeighborhoodColors", null, function () {
              mapRenderers.updateNeighborhoodColors();
            });

            if (!isCurrentModeToken(token) || getCurrentMode() !== "neighborhood") return;
            perfSpan("enterNeighborhoodMode:showLayers", null, function () {
              if (map.getLayer("neighborhoods-fill")) map.setLayoutProperty("neighborhoods-fill", "visibility", "visible");
              if (map.getLayer("neighborhoods-line")) map.setLayoutProperty("neighborhoods-line", "visibility", "visible");
              if (map.getLayer("neighborhoods-label")) map.setLayoutProperty("neighborhoods-label", "visibility", "visible");
            });
            logger.debug(function () {
              return ["[Neighborhood] Layers visible, source updated with", data.features.length, "features"];
            });

            if (!isCurrentModeToken(token) || getCurrentMode() !== "neighborhood") return;
            if (data.features.length > 0) {
              var bbox = turf.bbox(data);
              perfMark("enterNeighborhoodMode:fitBounds:start", { features: data.features.length });
              if (perf.enabled && typeof map.once === "function") {
                map.once("moveend", function () {
                  perfMark("enterNeighborhoodMode:fitBounds:moveend");
                });
                map.once("idle", function () {
                  perfMark("enterNeighborhoodMode:settle:idle");
                });
              }
              perfSpan("enterNeighborhoodMode:fitBoundsCall", null, function () {
                map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, duration: 600 });
              });
            }
          });
        })
      ).catch(function (error) {
        logAsyncError(logger, "Urban95ModeController neighborhood mode async update failed", error);
      });
    }

    function exitNeighborhoodMode() {
      return perf.phase("exitNeighborhoodMode", function () {
        if (map.getLayer(buildingsFillLayerId)) {
          map.setLayoutProperty(buildingsFillLayerId, "visibility", "visible");
          map.setPaintProperty(buildingsFillLayerId, "fill-opacity", 1);
        }
        if (map.getLayer("neighborhoods-surface")) {
          map.setLayoutProperty("neighborhoods-surface", "visibility", "none");
        }
      });
    }

    function enterCitywideMode(token) {
      var neighborhoodLoad = Promise.resolve().then(function () {
          return dashboards.loadNeighborhoods();
        })
        .then(function (data) {
          return dashboards.loadNeighborhoodChartsPayload().then(function () {
            if (!isCurrentModeToken(token) || getCurrentMode() !== "citywide") return;
            var src = map.getSource("neighborhoods");
            if (src) src.setData(data);
            updateNeighborhoodLabelSource(data);
            if (!isCurrentModeToken(token) || getCurrentMode() !== "citywide") return;
            addNeighborhoodLayers();
            mapRenderers.updateNeighborhoodColors();
            if (!isCurrentModeToken(token) || getCurrentMode() !== "citywide") return;
            if (map.getLayer("neighborhoods-surface")) map.setLayoutProperty("neighborhoods-surface", "visibility", "none");
            if (map.getLayer("neighborhoods-fill")) map.setLayoutProperty("neighborhoods-fill", "visibility", "visible");
            if (map.getLayer("neighborhoods-line")) map.setLayoutProperty("neighborhoods-line", "visibility", "visible");
            if (map.getLayer("neighborhoods-label")) map.setLayoutProperty("neighborhoods-label", "visibility", "visible");
          });
        })
        .catch(function (error) {
          logAsyncError(logger, "Urban95ModeController citywide neighborhood layers update failed", error);
        });

      if (map.getLayer(buildingsFillLayerId)) {
        map.setPaintProperty(buildingsFillLayerId, "fill-opacity", 0.15);
        map.setPaintProperty(buildingsFillLayerId, "fill-color", "#9ca3af");
      }

      var statsLoad = Promise.resolve().then(function () {
          return dashboards.loadCitywideStats();
        })
        .then(function (data) {
          if (!isCurrentModeToken(token) || getCurrentMode() !== "citywide") return;
          if (!data) {
            citywideBody.innerHTML =
              '<div class="cw-section" style="text-align:center;padding:2em">Failed to load citywide data. Please reload the page.</div>';
          }
          if (!isCurrentModeToken(token) || getCurrentMode() !== "citywide") return;
          dashboards.renderCitywideModal();
          dashboards.showCitywideModal();
        })
        .catch(function (error) {
          logAsyncError(logger, "Urban95ModeController citywide stats update failed", error);
          if (!isCurrentModeToken(token) || getCurrentMode() !== "citywide") return;
          citywideBody.innerHTML =
            '<div class="cw-section" style="text-align:center;padding:2em">Failed to load citywide data. Please reload the page.</div>';
        });

      return Promise.all([neighborhoodLoad, statsLoad]);
    }

    function switchMode(mode) {
      return perf.phase("switchMode", function () {
        if (mode === getCurrentMode()) return;
        var token = nextModeToken();
        var prevMode = getCurrentMode();

        if (prevMode === "house") {
          selection.clearRadiusSelection();
        }
        if (prevMode === "neighborhood") {
          exitNeighborhoodMode();
          neighborhoodSidebar.hide({ restoreFocus: false });
          setSelectedNeighborhood(null);
        }
        if (prevMode === "citywide") {
          dashboards.hideCitywideModal();
        }

        setCurrentMode(mode);
        beginModeVisualState(mode);

        modeToggle.querySelectorAll(".mode-opt").forEach(function (btn) {
          btn.classList.toggle("active", btn.dataset.mode === mode);
        });
        setLegendVisible(mode !== "citywide");
        onModeChanged(mode, prevMode);

        if (mode === "house") {
          return enterHouseMode(token);
        } else if (mode === "neighborhood") {
          return enterNeighborhoodMode(token);
        } else if (mode === "citywide") {
          return enterCitywideMode(token);
        }
      });
    }

    return {
      addNeighborhoodLayers: addNeighborhoodLayers,
      applyHouseModeHexBackground: applyHouseModeHexBackground,
      switchMode: switchMode,
    };
  }

  window.Urban95ModeController = {
    create: create,
  };
})();
