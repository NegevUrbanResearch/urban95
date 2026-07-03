(function () {
  var deps = null;
  var missingBuildingIdLogged = false;
  var lastDeckRenderStateKey = null;
  var visibleAmenityFeaturesStamp = 0;
  var pendingDeckIdleGeneration = 0;
  var deckIdleFallbackTimer = null;
  var deckIdleListenerCleanup = null;

  function clearPendingDeckUpdateTimer(currentDeps) {
    if (
      !currentDeps ||
      typeof currentDeps.getDeckUpdateTimer !== "function" ||
      typeof currentDeps.setDeckUpdateTimer !== "function"
    ) {
      return;
    }
    var pendingTimer = currentDeps.getDeckUpdateTimer();
    clearTimeout(pendingTimer);
    currentDeps.setDeckUpdateTimer(null);
  }

  function configure(nextDeps) {
    clearPendingDeckUpdateTimer(deps);
    cancelPendingDeckIdleWait();
    deps = nextDeps || null;
    lastDeckRenderStateKey = null;
    visibleAmenityFeaturesStamp = 0;
  }

  function requireDeps() {
    if (!deps) {
      throw new Error("Urban95MapRenderers.configure must be called before map renderer functions");
    }
    return deps;
  }

  function requireRenderState(d) {
    if (!d || !d.renderState) {
      throw new Error("Urban95MapRenderers.configure requires renderState");
    }
    return d.renderState;
  }

  function perfCounter(d, name, meta) {
    if (d.urban95Perf && typeof d.urban95Perf.counter === "function") {
      d.urban95Perf.counter(name, meta);
    }
  }

  function perfSpan(d, name, meta, callback) {
    if (d.urban95Perf && typeof d.urban95Perf.span === "function") {
      return d.urban95Perf.span(name, meta, callback);
    }
    return callback();
  }

  function clearDeckIdleFallbackTimer() {
    if (deckIdleFallbackTimer == null) return;
    clearTimeout(deckIdleFallbackTimer);
    deckIdleFallbackTimer = null;
  }

  function clearDeckIdleListenerCleanup() {
    if (typeof deckIdleListenerCleanup === "function") {
      deckIdleListenerCleanup();
    }
    deckIdleListenerCleanup = null;
  }

  function cancelPendingDeckIdleWait() {
    pendingDeckIdleGeneration += 1;
    clearDeckIdleFallbackTimer();
    clearDeckIdleListenerCleanup();
  }

  function consumePendingDeckIdleWait(generation) {
    if (pendingDeckIdleGeneration !== generation) return false;
    pendingDeckIdleGeneration += 1;
    clearDeckIdleFallbackTimer();
    clearDeckIdleListenerCleanup();
    return true;
  }

  function isCameraDeckUpdateReason(reason) {
    return reason === "moveend" || reason === "zoomend";
  }

  function registerMapIdleOnce(map, callback) {
    if (!map) return null;
    var removeIdleListener = null;
    if (typeof map.off === "function") {
      removeIdleListener = function (handler) {
        map.off("idle", handler);
      };
    } else if (typeof map.removeListener === "function") {
      removeIdleListener = function (handler) {
        map.removeListener("idle", handler);
      };
    }
    if (typeof map.on === "function" && removeIdleListener) {
      var idleHandler = function () {
        removeIdleListener(idleHandler);
        callback();
      };
      map.on("idle", idleHandler);
      return function () {
        removeIdleListener(idleHandler);
      };
    }
    if (typeof map.once === "function") {
      map.once("idle", callback);
      return function () {};
    }
    return null;
  }

  function getAmenitiesUpdateMeta(meta) {
    var updateMeta = meta || {};
    return {
      caller: updateMeta.caller || "direct",
      reason: updateMeta.reason || "",
      selectionTransactionId:
        updateMeta.selectionTransactionId == null ? null : updateMeta.selectionTransactionId,
      selectedBuildingId:
        updateMeta.selectedBuildingId == null ? null : updateMeta.selectedBuildingId,
      deferDeckRender: updateMeta.deferDeckRender === true,
    };
  }

  function hasRadiusFilterActive(d) {
    if (typeof d.getAmenitiesInRadiusIds !== "function") return false;
    var ids = d.getAmenitiesInRadiusIds();
    return !!(ids && typeof ids.size === "number" && ids.size > 0);
  }

  function getCanvasSizeSignature(d) {
    if (!d.map || typeof d.map.getCanvas !== "function") return "0x0";
    var canvas = d.map.getCanvas();
    return [
      canvas && Number.isFinite(canvas.width) ? canvas.width : 0,
      canvas && Number.isFinite(canvas.height) ? canvas.height : 0,
    ].join("x");
  }

  function getExactCameraSignature(d) {
    var zoom = d.map && typeof d.map.getZoom === "function" ? d.map.getZoom() : 0;
    var center = d.map && typeof d.map.getCenter === "function" ? d.map.getCenter() : null;
    var bearing = d.map && typeof d.map.getBearing === "function" ? d.map.getBearing() : 0;
    var pitch = d.map && typeof d.map.getPitch === "function" ? d.map.getPitch() : 0;
    return [
      Number(zoom).toPrecision(15),
      Number(center && center.lng).toPrecision(15),
      Number(center && center.lat).toPrecision(15),
      Number(bearing).toPrecision(15),
      Number(pitch).toPrecision(15),
      getCanvasSizeSignature(d),
    ].join("|");
  }

  function selectedAmenityTypesSignature(d) {
    return Array.from(d.getSelectedAmenityTypes ? d.getSelectedAmenityTypes() : [])
      .sort()
      .join("|");
  }

  function featureCount(data) {
    return data && Array.isArray(data.features) ? data.features.length : 0;
  }

  function setVisibleAmenityFeaturesState(d, features) {
    visibleAmenityFeaturesStamp += 1;
    d.setVisibleAmenityFeatures(features);
  }

  function getDeckRenderState(d) {
    var renderState = requireRenderState(d);
    var layerVisibility = getLayerVisibilityMap(d);
    var amenitiesLayerId = renderState.OVERLAY_LAYER_IDS.AMENITIES;
    var togglePresent = Object.prototype.hasOwnProperty.call(layerVisibility, amenitiesLayerId);
    var amenitiesVisible = isLayerVisible(d, amenitiesLayerId, true);
    var shouldRender = renderState.shouldRenderDeckAmenities({
      currentMode: d.getCurrentMode(),
      scoreMode: d.getScoreMode(),
      togglePresent: togglePresent,
      layerVisibility: layerVisibility,
      zoom: d.map.getZoom(),
      amenityClusterMinZoom: d.amenityClusterMinZoom,
    });
    var visibleFeatures = d.getVisibleAmenityFeatures();
    return {
      shouldRender: shouldRender,
      visibleFeatures: visibleFeatures,
      key: renderState.buildDeckRenderStateKey({
        shouldRender: shouldRender,
        scoreMode: d.getScoreMode(),
        currentMode: d.getCurrentMode(),
        togglePresent: togglePresent,
        amenitiesVisible: amenitiesVisible,
        selectedAmenityTypesSignature: selectedAmenityTypesSignature(d),
        cameraSignature: getExactCameraSignature(d),
        visibleFeaturesStamp: visibleAmenityFeaturesStamp,
      }),
    };
  }

  function getLayerVisibilityMap(d) {
    return typeof d.getLayerVisibility === "function" ? d.getLayerVisibility() : {};
  }

  function isLayerVisible(d, layerId, fallback) {
    return requireRenderState(d).isLayerVisible(getLayerVisibilityMap(d), layerId, fallback);
  }

  function getActiveMetricFromDeps(d) {
    return typeof d.getActiveMetric === "function" ? d.getActiveMetric() : null;
  }

  function getSelectedAmenityTypes() {
    return requireDeps().getSelectedAmenityTypes();
  }

  function getAllFilterTypes() {
    return requireDeps().getAllFilterTypes();
  }

  function isFilterOnlyTrees() {
    var selectedAmenityTypes = getSelectedAmenityTypes();
    var allFilterTypes = getAllFilterTypes();
    return (
      allFilterTypes.length > 0 &&
      selectedAmenityTypes.size === 1 &&
      selectedAmenityTypes.has("trees")
    );
  }

  function isFilterOnlyStreetLights() {
    var selectedAmenityTypes = getSelectedAmenityTypes();
    var allFilterTypes = getAllFilterTypes();
    return (
      allFilterTypes.length > 0 &&
      selectedAmenityTypes.size === 1 &&
      selectedAmenityTypes.has("street-lights")
    );
  }

  function updateTooltip(text, x, y) {
    var d = requireDeps();
    if (!d.tooltipEl) return;
    d.tooltipEl.textContent = text || "";
    d.tooltipEl.style.display = "block";
    d.tooltipEl.style.left = x + "px";
    d.tooltipEl.style.top = y + "px";
  }

  function hideTooltipAndCursor() {
    var d = requireDeps();
    if (d.tooltipEl) d.tooltipEl.style.display = "none";
    d.map.getCanvas().style.cursor = "";
  }

  function setLayerVisibilityIfPresent(layerId, visible) {
    var d = requireDeps();
    if (!d.map.getLayer(layerId)) return;
    if (
      !visible &&
      (d.treeLayerIds.indexOf(layerId) !== -1 || d.streetLightLayerIds.indexOf(layerId) !== -1)
    ) {
      resetPointHoverState();
    }
    d.map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }

  function setLayerVisibility(layerIds, visible) {
    layerIds.forEach(function (id) {
      setLayerVisibilityIfPresent(id, visible);
    });
  }

  function resetPointHoverState() {
    hideTooltipAndCursor();
  }

  function setTreesVisibility(visible) {
    var d = requireDeps();
    if (!visible) resetPointHoverState();
    setLayerVisibility(d.treeLayerIds, visible);
  }

  function setStreetLightsVisibility(visible) {
    var d = requireDeps();
    if (!visible) resetPointHoverState();
    setLayerVisibility(d.streetLightLayerIds, visible);
  }

  function setTreesAndLightsVisibility(visible) {
    var d = requireDeps();
    if (!visible) resetPointHoverState();
    setLayerVisibility(d.treesAndLightsLayerIds, visible);
  }

  function bindPointHoverLayer(layerId, labelForFeature) {
    var d = requireDeps();
    if (!d.map.getLayer(layerId)) return;
    d.map.on("mouseenter", layerId, function () {
      if (!d.getDeckHovering()) d.map.getCanvas().style.cursor = "pointer";
    });
    d.map.on("mouseleave", layerId, function () {
      if (!d.getDeckHovering()) d.map.getCanvas().style.cursor = "";
      if (d.tooltipEl) d.tooltipEl.style.display = "none";
    });
    d.map.on("mousemove", layerId, function (e) {
      if (d.getDeckHovering() || !e.features || e.features.length === 0) return;
      var label = labelForFeature ? labelForFeature(e.features[0]) : "";
      updateTooltip(label || "", e.point.x + 12, e.point.y + 12);
    });
  }

  function applyShowPointsToggle() {
    resetPointHoverState();
    updateTreesSource();
    updateStreetLightsSource();
    updateDeckAmenityLayers({ caller: "applyShowPointsToggle" });
  }

  function getSpecialPointRenderPlan(config) {
    var d = requireDeps();
    var renderState = requireRenderState(d);
    var layerVisibility = getLayerVisibilityMap(d);
    var selectedAmenityTypes =
      typeof d.getSelectedAmenityTypes === "function" ? d.getSelectedAmenityTypes() : new Set();
    var allFilterTypes = typeof d.getAllFilterTypes === "function" ? d.getAllFilterTypes() : [];
    var context = {
      scoreMode: d.getScoreMode(),
      currentMode: d.getCurrentMode(),
      zoom: d.map.getZoom(),
      urban95DetailPointsMinZoom: d.urban95DetailPointsMinZoom,
      layerVisibility: layerVisibility,
      useGeneratedVector: d.hasGeneratedArtifact(config.artifactKey),
      filterType: config.filterType,
      getData: config.getData,
      getInRadiusIds: config.getInRadiusIds,
      isOnlyFilter: config.isOnlyFilter,
      selectedAmenityTypes: selectedAmenityTypes,
      allFilterTypes: allFilterTypes,
      metric: getActiveMetricFromDeps(d),
      scoreModel: d.scoreModel,
      showRegistry: d.showRegistry,
    };
    return renderState.computeSpecialPointRenderPlan(context);
  }

  function applySpecialPointRenderPlan(config, plan) {
    var d = requireDeps();
    perfCounter(d, "renderer:specialPointPlan", function () {
      return {
        artifact: config.artifactKey,
        geojsonVisible: plan.geojsonVisible,
        vectorVisible: plan.vectorVisible,
        features: featureCount(plan.features),
      };
    });
    setLayerVisibilityIfPresent(config.geojsonLayerId, plan.geojsonVisible);
    setLayerVisibilityIfPresent(config.vectorLayerId, plan.vectorVisible);
    var source = d.map.getSource(config.sourceId);
    if (source && plan.features) {
      perfSpan(d, "renderer:specialPointSetData", function () {
        return { artifact: config.artifactKey, features: featureCount(plan.features) };
      }, function () {
        source.setData(plan.features);
      });
    }
  }

  function getTreeRenderConfig() {
    var d = requireDeps();
    return {
      artifactKey: "trees",
      sourceId: "trees",
      geojsonLayerId: "tree-icons",
      vectorLayerId: "tree-icons-vector",
      filterType: "trees",
      getData: d.getAllTreesData,
      getInRadiusIds: d.getTreesInRadiusIds,
      isOnlyFilter: isFilterOnlyTrees,
    };
  }

  function getStreetLightRenderConfig() {
    var d = requireDeps();
    return {
      artifactKey: "street_lights",
      sourceId: "street-lights",
      geojsonLayerId: "street-light-icons",
      vectorLayerId: "street-light-icons-vector",
      filterType: "street-lights",
      getData: d.getAllStreetLightsData,
      getInRadiusIds: d.getStreetLightsInRadiusIds,
      isOnlyFilter: isFilterOnlyStreetLights,
    };
  }

  function syncPointLayerVisibility() {
    var d = requireDeps();
    resetPointHoverState();
    var treePlan = getSpecialPointRenderPlan(getTreeRenderConfig());
    var lightPlan = getSpecialPointRenderPlan(getStreetLightRenderConfig());
    setLayerVisibilityIfPresent(
      "tree-icons-vector",
      treePlan.vectorVisible
    );
    setLayerVisibilityIfPresent(
      "tree-icons",
      treePlan.geojsonVisible
    );
    setLayerVisibilityIfPresent(
      "street-light-icons-vector",
      lightPlan.vectorVisible
    );
    setLayerVisibilityIfPresent(
      "street-light-icons",
      lightPlan.geojsonVisible
    );
    if (d.getScoreMode() === "weighted" && d.getDeckAmenityOverlay()) {
      d.getDeckAmenityOverlay().setProps({ layers: [] });
    }
  }

  function updateAmenitiesSource(meta) {
    var d = requireDeps();
    var updateMeta = getAmenitiesUpdateMeta(meta);
    var finishUpdate = function (branch, visibleFeatures) {
      perfCounter(d, "renderer:updateAmenitiesSource:end", function () {
        return {
          caller: updateMeta.caller,
          reason: updateMeta.reason,
          selectionTransactionId: updateMeta.selectionTransactionId,
          selectedBuildingId: updateMeta.selectedBuildingId,
          scoreMode: d.getScoreMode(),
          mode: d.getCurrentMode(),
          allFeatures: featureCount(d.getAllAmenitiesData()),
          radiusFilterActive: hasRadiusFilterActive(d),
          branch: branch,
          visibleFeatures: visibleFeatures,
        };
      });
    };
    perfCounter(d, "renderer:updateAmenitiesSource:start", function () {
      return {
        caller: updateMeta.caller,
        reason: updateMeta.reason,
        selectionTransactionId: updateMeta.selectionTransactionId,
        selectedBuildingId: updateMeta.selectedBuildingId,
        scoreMode: d.getScoreMode(),
        mode: d.getCurrentMode(),
        allFeatures: featureCount(d.getAllAmenitiesData()),
        selectedAmenityTypes: d.getSelectedAmenityTypes().size,
        visibleFeatures: d.getVisibleAmenityFeatures().length,
        radiusFilterActive: hasRadiusFilterActive(d),
      };
    });
    return d.urban95Perf.phase("updateAmenitiesSource", function () {
      var allAmenitiesData = d.getAllAmenitiesData();
      if (!allAmenitiesData) {
        finishUpdate("missingData", d.getVisibleAmenityFeatures().length);
        return;
      }

      var source = d.map.getSource("amenities");
      if (!source) {
        finishUpdate("missingSource", d.getVisibleAmenityFeatures().length);
        return;
      }

      if (d.getScoreMode() === "weighted") {
        var weightedShownAmenityTypes = requireRenderState(d).resolveWeightedShownAmenityTypes({
          metric: getActiveMetricFromDeps(d),
          scoreModel: d.scoreModel,
          showRegistry: d.showRegistry,
          shownAmenityTypes:
            typeof d.getWeightedShownAmenityTypes === "function"
              ? d.getWeightedShownAmenityTypes()
              : [],
        });
        if (!weightedShownAmenityTypes || weightedShownAmenityTypes.length === 0) {
          perfSpan(d, "renderer:updateAmenitiesSource:setData", { branch: "weighted", features: 0 }, function () {
            source.setData({ type: "FeatureCollection", features: [] });
          });
          setVisibleAmenityFeaturesState(d, []);
          updateDeckAmenityLayers({ caller: "updateAmenitiesSource", branch: "weighted" });
          finishUpdate("weighted", 0);
          return;
        }

        var weightedShownAmenityTypeSet = new Set(weightedShownAmenityTypes);
        var weightedFeatures = perfSpan(
          d,
          "renderer:updateAmenitiesSource:buildWeightedShownFeatures",
          function () {
            return { features: weightedShownAmenityTypes.length };
          },
          function () {
            return allAmenitiesData.features
              .filter(function (feature) {
                return weightedShownAmenityTypeSet.has(feature.properties.amenity_type);
              })
              .map(function (feature) {
                return Object.assign({}, feature, {
                  properties: Object.assign({}, feature.properties, { _inRadius: false }),
                });
              });
          }
        );

        perfSpan(d, "renderer:updateAmenitiesSource:setData", { branch: "weightedShown", features: weightedFeatures.length }, function () {
          source.setData({ type: "FeatureCollection", features: weightedFeatures });
        });
        setVisibleAmenityFeaturesState(d, weightedFeatures);
        updateDeckAmenityLayers({ caller: "updateAmenitiesSource", branch: "weightedShown" });
        finishUpdate("weightedShown", weightedFeatures.length);
        return;
      }

      var selectedAmenityTypes = d.getSelectedAmenityTypes();
      if (selectedAmenityTypes.size === 0) {
        perfSpan(d, "renderer:updateAmenitiesSource:setData", { branch: "noSelection", features: 0 }, function () {
          source.setData({ type: "FeatureCollection", features: [] });
        });
        setVisibleAmenityFeaturesState(d, []);
        updateDeckAmenityLayers({ caller: "updateAmenitiesSource", branch: "noSelection" });
        finishUpdate("noSelection", 0);
        return;
      }

      var allFilterTypes = d.getAllFilterTypes();
      var useAll = selectedAmenityTypes.size === allFilterTypes.length;
      var showAmenities =
        useAll ||
        Array.from(selectedAmenityTypes).some(function (type) {
          return type !== "trees" && type !== "street-lights";
        });

      if (!showAmenities) {
        perfSpan(d, "renderer:updateAmenitiesSource:setData", { branch: "hidden", features: 0 }, function () {
          source.setData({ type: "FeatureCollection", features: [] });
        });
        setVisibleAmenityFeaturesState(d, []);
        updateDeckAmenityLayers({ caller: "updateAmenitiesSource", branch: "hidden" });
        finishUpdate("hidden", 0);
        return;
      }

      var amenitiesInRadiusIds = d.getAmenitiesInRadiusIds();
      var updatedFeatures = perfSpan(d, "renderer:updateAmenitiesSource:buildVisibleFeatures", function () {
        return {
          allFeatures: featureCount(allAmenitiesData),
          selectedAmenityTypes: selectedAmenityTypes.size,
          useAll: useAll,
          radiusFilterActive: hasRadiusFilterActive(d),
        };
      }, function () {
        var features = [];
        allAmenitiesData.features.forEach(function (feature, index) {
          var type = feature.properties.amenity_type;
          if (!useAll && !selectedAmenityTypes.has(type)) return;
          var inRadius = amenitiesInRadiusIds.has(index);
          var newProps = Object.assign({}, feature.properties, { _inRadius: inRadius });
          features.push(Object.assign({}, feature, { properties: newProps }));
        });
        return features;
      });

      perfSpan(d, "renderer:updateAmenitiesSource:setData", function () {
        return { branch: "visible", features: updatedFeatures.length };
      }, function () {
        source.setData({ type: "FeatureCollection", features: updatedFeatures });
      });
      perfSpan(d, "renderer:updateAmenitiesSource:setVisibleFeatures", function () {
        return { branch: "visible", features: updatedFeatures.length };
      }, function () {
        setVisibleAmenityFeaturesState(d, updatedFeatures);
      });
      perfSpan(d, "renderer:updateAmenitiesSource:updateDeck", function () {
        return {
          branch: "visible",
          features: updatedFeatures.length,
          deferred: updateMeta.deferDeckRender,
        };
      }, function () {
        if (updateMeta.deferDeckRender) return;
        updateDeckAmenityLayers({ caller: "updateAmenitiesSource", branch: "visible" });
      });
      finishUpdate("visible", updatedFeatures.length);
    });
  }

  function updateTreesSource() {
    var d = requireDeps();
    return d.urban95Perf.phase("updateTreesSource", function () {
      var config = getTreeRenderConfig();
      var plan = getSpecialPointRenderPlan(config);
      applySpecialPointRenderPlan(config, plan);
    });
  }

  function updateStreetLightsSource() {
    var d = requireDeps();
    return d.urban95Perf.phase("updateStreetLightsSource", function () {
      var config = getStreetLightRenderConfig();
      var plan = getSpecialPointRenderPlan(config);
      applySpecialPointRenderPlan(config, plan);
    });
  }

  function addAmenityLayers() {
    var d = requireDeps();
    d.map.addLayer({
      id: "tree-icons",
      type: "symbol",
      source: "trees",
      layout: {
        "icon-image": "park-alt1",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 18, 1.2],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-color": "#2E7D32",
        "icon-opacity": 0.9,
      },
    });
    if (d.hasGeneratedArtifact("trees")) {
      d.map.addLayer({
        id: "tree-icons-vector",
        type: "symbol",
        source: "trees-vector",
        "source-layer": d.sourceLayer("trees", "trees"),
        minzoom: d.urban95DetailPointsMinZoom,
        layout: {
          visibility: "none",
          "icon-image": "park-alt1",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 18, 1.2],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-color": "#2E7D32",
          "icon-opacity": 0.9,
        },
      });
    }

    var slCfg = d.amenityTypeConfig["street-lights"];
    d.map.addLayer({
      id: "street-light-icons",
      type: "symbol",
      source: "street-lights",
      layout: {
        "icon-image": "marker",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.55, 18, 1.1],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-color": slCfg.color,
        "icon-opacity": 0.95,
      },
    });
    if (d.hasGeneratedArtifact("street_lights")) {
      d.map.addLayer({
        id: "street-light-icons-vector",
        type: "symbol",
        source: "street-lights-vector",
        "source-layer": d.sourceLayer("street_lights", "street_lights"),
        minzoom: d.urban95DetailPointsMinZoom,
        layout: {
          visibility: "none",
          "icon-image": "marker",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.55, 18, 1.1],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-color": slCfg.color,
          "icon-opacity": 0.95,
        },
      });
    }

    bindPointHoverLayer("tree-icons", function () {
      return "Tree";
    });
    bindPointHoverLayer("tree-icons-vector", function () {
      return "Tree";
    });
    bindPointHoverLayer("street-light-icons", function (feature) {
      var props = (feature && feature.properties) || {};
      return props.name || props.Name || props.hebrew_name || props.hebrew_nam || "Street light";
    });
    bindPointHoverLayer("street-light-icons-vector", function (feature) {
      var props = (feature && feature.properties) || {};
      return props.name || props.Name || props.hebrew_name || props.hebrew_nam || "Street light";
    });
  }

  function describeTypeMix(typeCounts) {
    return Object.entries(typeCounts || {})
      .sort(function (a, b) {
        return b[1] - a[1];
      })
      .map(function (entry) {
        return entry[0] + ":" + entry[1];
      })
      .join("|");
  }

  function drawAmenityIcon(ctx, x, y, typeCounts, inRadius, isCluster) {
    var d = requireDeps();
    var iconSize = 64;
    var cx = x + iconSize / 2;
    var cy = y + iconSize / 2;
    var radius = isCluster ? 23 : 20;
    var ringWidth = isCluster ? 9 : 7;
    var borderColor = inRadius ? "#fbbf24" : "rgba(255, 255, 255, 0.94)";

    var entries = Object.entries(typeCounts || {}).sort(function (a, b) {
      return b[1] - a[1];
    });
    var total = entries.reduce(function (sum, entry) {
      return sum + entry[1];
    }, 0) || 1;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, iconSize, iconSize);
    ctx.clip();

    ctx.shadowColor = "rgba(15, 23, 42, 0.3)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    if (entries.length <= 1) {
      var type = entries.length === 1 ? entries[0][0] : "other";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = d.getAmenityConfig(type).color;
      ctx.fill();
    } else {
      var startAngle = -Math.PI / 2;
      entries.forEach(function (entry) {
        var type = entry[0];
        var count = entry[1];
        var angle = (count / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startAngle, startAngle + angle);
        ctx.closePath();
        ctx.fillStyle = d.getAmenityConfig(type).color;
        ctx.fill();
        startAngle += angle;
      });
    }

    ctx.shadowColor = "transparent";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = inRadius ? 4 : 3;
    ctx.strokeStyle = borderColor;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(4, radius - ringWidth), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
    ctx.fill();

    ctx.restore();
  }

  function getAmenityIconKey(item) {
    var d = requireDeps();
    var cappedCount = Math.min(item.count, d.amenityClusterMaxCount);
    var mixSignature = describeTypeMix(item.typeCounts);
    return (
      mixSignature +
      "|" +
      (item.inRadius ? 1 : 0) +
      "|" +
      (item.isCluster ? 1 : 0) +
      "|" +
      cappedCount
    );
  }

  function getAmenityIconKeySetSignature(clusteredAmenities) {
    return Array.from(collectAmenityIconInfo(clusteredAmenities).keys()).sort().join("||");
  }

  var lastAmenityIconAtlasCache = null;

  function collectAmenityIconInfo(clusteredAmenities) {
    var uniqueIcons = new Map();
    (clusteredAmenities || []).forEach(function (item) {
      var key = getAmenityIconKey(item);
      item._iconKey = key;
      if (!uniqueIcons.has(key)) {
        uniqueIcons.set(key, {
          typeCounts: item.typeCounts,
          inRadius: item.inRadius,
          isCluster: item.isCluster,
        });
      }
    });
    return uniqueIcons;
  }

  function buildAmenityIconAtlas(clusteredAmenities) {
    var d = requireDeps();
    var iconSize = 64;
    var uniqueIcons = collectAmenityIconInfo(clusteredAmenities);
    var atlasKeySetSignature = Array.from(uniqueIcons.keys()).sort().join("||");

    if (
      lastAmenityIconAtlasCache &&
      lastAmenityIconAtlasCache.keySetSignature === atlasKeySetSignature
    ) {
      perfCounter(d, "renderer:amenityIconAtlas:cacheHit", function () {
        return {
          keyCount: uniqueIcons.size,
          keySetLength: atlasKeySetSignature.length,
          keySetHash: stringHashSignature(atlasKeySetSignature),
        };
      });
      return {
        atlas: lastAmenityIconAtlasCache.atlas,
        mapping: lastAmenityIconAtlasCache.mapping,
      };
    }

    perfCounter(d, "renderer:amenityIconAtlas:cacheMiss", function () {
      return {
        keyCount: uniqueIcons.size,
        keySetLength: atlasKeySetSignature.length,
        keySetHash: stringHashSignature(atlasKeySetSignature),
      };
    });

    var iconCount = uniqueIcons.size;
    if (iconCount === 0) {
      lastAmenityIconAtlasCache = null;
      return { atlas: null, mapping: {} };
    }

    var cols = Math.ceil(Math.sqrt(iconCount));
    var rows = Math.ceil(iconCount / cols);
    var atlas = document.createElement("canvas");
    atlas.width = cols * iconSize;
    atlas.height = rows * iconSize;
    var ctx = atlas.getContext("2d");
    if (!ctx) {
      lastAmenityIconAtlasCache = null;
      return { atlas: null, mapping: {} };
    }

    var mapping = {};
    var index = 0;
    uniqueIcons.forEach(function (info, key) {
      var col = index % cols;
      var row = Math.floor(index / cols);
      var px = col * iconSize;
      var py = row * iconSize;
      drawAmenityIcon(ctx, px, py, info.typeCounts, info.inRadius, info.isCluster);
      mapping[key] = {
        x: px,
        y: py,
        width: iconSize,
        height: iconSize,
        anchorX: iconSize / 2,
        anchorY: iconSize / 2,
      };
      index += 1;
    });

    lastAmenityIconAtlasCache = {
      keySetSignature: atlasKeySetSignature,
      atlas: atlas,
      mapping: mapping,
    };

    return { atlas: atlas, mapping: mapping };
  }

  function roundedPositionSignature(position) {
    if (!position || position.length < 2) return "0,0";
    return Number(position[0]).toPrecision(12) + "," + Number(position[1]).toPrecision(12);
  }

  function clusterTypeCountsSignature(typeCounts) {
    return Object.keys(typeCounts || {})
      .sort()
      .map(function (key) {
        return key + ":" + typeCounts[key];
      })
      .join(",");
  }

  function renderedClusterSignature(clusters) {
    return (clusters || [])
      .map(function (item) {
        return [
          roundedPositionSignature(item.position),
          item.count,
          item.amenityType || "",
          item.inRadius ? "in" : "out",
          item.isCluster ? "cluster" : "single",
          clusterTypeCountsSignature(item.typeCounts),
        ].join("/");
      })
      .sort()
      .join("||");
  }

  function stringHashSignature(value) {
    var hash = 2166136261;
    for (var i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function clusterVisibleAmenities(features) {
    var d = requireDeps();
    if (!features || features.length === 0) return [];
    var zoom = d.map.getZoom();
    var includeSingles = zoom >= d.amenityClusterMinZoom;
    if (!includeSingles) return [];
    if (zoom >= d.amenityClusterDissolveZoom) {
      return features
        .map(function (feature) {
          var coordinates = feature.geometry && feature.geometry.coordinates;
          if (!coordinates || coordinates.length < 2) return null;
          var props = feature.properties || {};
          var amenityType = props.amenity_type || "other";
          var name = props.hebrew_nam || props.name || "";
          return {
            position: coordinates,
            count: 1,
            countLabel: "",
            amenityType: amenityType,
            typeCounts: Object.fromEntries([[amenityType, 1]]),
            inRadius: Boolean(props._inRadius),
            isCluster: false,
            sampleNames: name ? [name] : [],
            members: [coordinates],
          };
        })
        .filter(Boolean);
    }

    var buckets = [];
    features.forEach(function (feature) {
      var coordinates = feature.geometry && feature.geometry.coordinates;
      if (!coordinates || coordinates.length < 2) return;

      var projected = d.map.project(coordinates);
      var bucket = null;
      for (var i = 0; i < buckets.length; i += 1) {
        var candidate = buckets[i];
        var dx = candidate.centerX - projected.x;
        var dy = candidate.centerY - projected.y;
        if (dx * dx + dy * dy <= d.amenityClusterPixelRadius * d.amenityClusterPixelRadius) {
          bucket = candidate;
          break;
        }
      }

      if (!bucket) {
        bucket = {
          centerX: projected.x,
          centerY: projected.y,
          count: 0,
          weightedLng: 0,
          weightedLat: 0,
          inRadiusCount: 0,
          typeCounts: {},
          names: [],
          members: [],
        };
        buckets.push(bucket);
      }

      var props = feature.properties || {};
      var amenityType = props.amenity_type || "other";
      bucket.count += 1;
      bucket.weightedLng += coordinates[0];
      bucket.weightedLat += coordinates[1];
      bucket.typeCounts[amenityType] = (bucket.typeCounts[amenityType] || 0) + 1;
      if (props._inRadius) bucket.inRadiusCount += 1;

      var name = props.hebrew_nam || props.name || "";
      if (name && bucket.names.length < 3) {
        bucket.names.push(name);
      }
      bucket.members.push(coordinates);
    });

    return buckets.map(function (bucket) {
      var dominantType = "other";
      var dominantCount = -1;
      Object.entries(bucket.typeCounts).forEach(function (entry) {
        if (entry[1] > dominantCount) {
          dominantType = entry[0];
          dominantCount = entry[1];
        }
      });

      var count = bucket.count;
      var isCluster = count > 1;
      var cappedCount = Math.min(count, d.amenityClusterMaxCount);
      var countLabel = count > d.amenityClusterMaxCount ? d.amenityClusterMaxCount + "+" : String(cappedCount);

      return {
        position: [bucket.weightedLng / count, bucket.weightedLat / count],
        count: count,
        countLabel: isCluster ? countLabel : "",
        amenityType: dominantType,
        typeCounts: bucket.typeCounts,
        inRadius: bucket.inRadiusCount > 0,
        isCluster: isCluster,
        sampleNames: bucket.names,
        members: bucket.members,
      };
    });
  }

  function updateDeckAmenityLayers(meta) {
    var d = requireDeps();
    perfCounter(d, "renderer:updateDeckAmenityLayers:start", function () {
      return Object.assign(
        {
          scoreMode: d.getScoreMode(),
          mode: d.getCurrentMode(),
          visibleFeatures: d.getVisibleAmenityFeatures().length,
          cameraSignature: getExactCameraSignature(d),
          selectedAmenityTypesSignature: selectedAmenityTypesSignature(d),
        },
        meta || {}
      );
    });
    return d.urban95Perf.phase("updateDeckAmenityLayers", function () {
      var deckRenderState = getDeckRenderState(d);
      var shouldRender = deckRenderState.shouldRender;

      if (!shouldRender) {
        perfCounter(d, "renderer:deckAmenityLayers", function () {
          return { branch: "hidden", visibleFeatures: d.getVisibleAmenityFeatures().length };
        });
        if (d.getDeckAmenityOverlay()) {
          d.getDeckAmenityOverlay().setProps({ layers: [] });
        }
        d.setDeckHovering(false);
        hideTooltipAndCursor();
        lastDeckRenderStateKey = deckRenderState.key;
        return;
      }

      if (!d.getDeckAmenityOverlay()) {
        perfCounter(d, "renderer:deckAmenityLayers", { branch: "initPending" });
        d.ensureDeckGlLoaded()
          .then(function () {
            initDeckAmenityOverlay();
            updateDeckAmenityLayers({ caller: "ensureDeckGlLoaded" });
          })
          .catch(function (err) {
            console.error("Failed to initialize deck.gl overlay:", err);
          });
        return;
      }

      var visibleFeatures = d.getVisibleAmenityFeatures();
      var clusteredAmenities = perfSpan(d, "renderer:clusterVisibleAmenities", function () {
        return { features: visibleFeatures.length };
      }, function () {
        return clusterVisibleAmenities(visibleFeatures);
      });
      perfCounter(d, "renderer:amenityIconAtlas:keySet", function () {
        var atlasKeySetSignature = getAmenityIconKeySetSignature(clusteredAmenities);
        return {
          clusters: clusteredAmenities.length,
          keyCount: atlasKeySetSignature ? atlasKeySetSignature.split("||").length : 0,
          keySetLength: atlasKeySetSignature.length,
          keySetHash: stringHashSignature(atlasKeySetSignature),
        };
      });
      var iconAtlas = perfSpan(d, "renderer:buildAmenityIconAtlas", function () {
        return { clusters: clusteredAmenities.length };
      }, function () {
        return buildAmenityIconAtlas(clusteredAmenities);
      });
      var atlas = iconAtlas.atlas;
      var mapping = iconAtlas.mapping;
      perfCounter(d, "renderer:deckAmenityLayers", function () {
        var clusterSignature = renderedClusterSignature(clusteredAmenities);
        return {
          branch: "render",
          visibleFeatures: visibleFeatures.length,
          clusters: clusteredAmenities.length,
          iconAtlasCount: Object.keys(mapping).length,
          cameraSignature: getExactCameraSignature(d),
          clusterSignature: clusterSignature,
          clusterSignatureLength: clusterSignature.length,
          clusterSignatureHash: stringHashSignature(clusterSignature),
        };
      });

      if (!atlas || Object.keys(mapping).length === 0) {
        d.getDeckAmenityOverlay().setProps({ layers: [] });
        d.setDeckHovering(false);
        hideTooltipAndCursor();
        lastDeckRenderStateKey = deckRenderState.key;
        return;
      }

      var deckLib = window.deck;
      if (!deckLib) return;

      var iconLayer = new deckLib.IconLayer({
        id: "amenity-cluster-icons",
        data: clusteredAmenities,
        pickable: true,
        sizeUnits: "pixels",
        sizeScale: 1,
        iconAtlas: atlas,
        iconMapping: mapping,
        getPosition: function (item) {
          return item.position;
        },
        getIcon: function (item) {
          return item._iconKey;
        },
        getSize: function (item) {
          if (!item.isCluster) return item.inRadius ? 24 : 20;
          var size = 20 + Math.sqrt(Math.min(item.count, d.amenityClusterMaxCount)) * 4;
          return item.inRadius ? size + 3 : size;
        },
        onHover: function (info) {
          var object = info.object;
          var x = info.x;
          var y = info.y;
          if (!object) {
            d.setDeckHovering(false);
            hideTooltipAndCursor();
            return;
          }

          d.setDeckHovering(true);
          var typeLabel = d.getAmenityConfig(object.amenityType).label;
          var topTypes = Object.entries(object.typeCounts || {})
            .sort(function (a, b) {
              return b[1] - a[1];
            })
            .slice(0, 3)
            .map(function (entry) {
              return d.getAmenityConfig(entry[0]).label + ": " + entry[1];
            });
          var lines = [];
          if (object.isCluster) {
            lines.push(object.countLabel + " nearby amenities");
            lines.push("Main type: " + typeLabel);
            if (topTypes.length > 1) {
              lines.push(topTypes.join(" | "));
            }
          } else {
            lines.push(typeLabel);
          }
          if (object.sampleNames && object.sampleNames.length > 0) {
            lines.push(object.sampleNames[0]);
          }

          updateTooltip(lines.join("\n"), x + 12, y + 12);
          d.map.getCanvas().style.cursor = "pointer";
        },
        onClick: function (info) {
          var object = info.object;
          if (!object) return;
          d.setLastDeckClickTime(Date.now());
          if (!object.isCluster) return;
          var members = Array.isArray(object.members) ? object.members : [];
          if (members.length === 0) return;

          var minLng = Infinity;
          var minLat = Infinity;
          var maxLng = -Infinity;
          var maxLat = -Infinity;
          members.forEach(function (coord) {
            var lng = coord[0];
            var lat = coord[1];
            if (lng < minLng) minLng = lng;
            if (lat < minLat) minLat = lat;
            if (lng > maxLng) maxLng = lng;
            if (lat > maxLat) maxLat = lat;
          });

          var zeroSpan = maxLng - minLng < 1e-6 && maxLat - minLat < 1e-6;
          if (zeroSpan) {
            d.map.easeTo({
              center: object.position,
              zoom: Math.max(d.amenityClusterDissolveZoom + 1, d.map.getZoom() + 2),
              duration: 420,
            });
            return;
          }

          d.map.once("moveend", function () {
            if (d.map.getZoom() < d.amenityClusterDissolveZoom) {
              d.map.easeTo({
                center: object.position,
                zoom: d.amenityClusterDissolveZoom,
                duration: 260,
              });
            }
          });

          d.map.fitBounds(
            [
              [minLng, minLat],
              [maxLng, maxLat],
            ],
            {
              padding: 80,
              maxZoom: 18,
              duration: 480,
            }
          );
        },
      });

      var textLayer = new deckLib.TextLayer({
        id: "amenity-cluster-counts",
        data: clusteredAmenities.filter(function (item) {
          return item.isCluster;
        }),
        pickable: false,
        getPosition: function (item) {
          return item.position;
        },
        getText: function (item) {
          return item.countLabel;
        },
        getSize: 12,
        sizeUnits: "pixels",
        getColor: [255, 255, 255, 245],
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 700,
      });

      perfSpan(d, "renderer:deckSetProps", function () {
        return { clusters: clusteredAmenities.length, layers: 2 };
      }, function () {
        d.getDeckAmenityOverlay().setProps({ layers: [iconLayer, textLayer] });
      });
      lastDeckRenderStateKey = deckRenderState.key;
    });
  }

  function executeScheduledDeckUpdate(d, reason, meta) {
    var executeMeta = meta || {};
    var deckRenderState = getDeckRenderState(d);
    perfCounter(d, "renderer:scheduleDeckUpdate:execute", function () {
      return {
        reason: reason || "",
        scoreMode: d.getScoreMode(),
        mode: d.getCurrentMode(),
        visibleFeatures: d.getVisibleAmenityFeatures().length,
        waitForIdle: executeMeta.waitForIdle === true,
        idleWaited: executeMeta.idleWaited === true,
        fallback: executeMeta.fallback === true,
      };
    });
    if (d.getDeckAmenityOverlay() && deckRenderState.key === lastDeckRenderStateKey) {
      perfCounter(d, "renderer:scheduleDeckUpdate:skip", function () {
        return {
          reason: reason || "",
          scoreMode: d.getScoreMode(),
          mode: d.getCurrentMode(),
          visibleFeatures: d.getVisibleAmenityFeatures().length,
          cameraSignature: getExactCameraSignature(d),
          selectedAmenityTypesSignature: selectedAmenityTypesSignature(d),
          waitForIdle: executeMeta.waitForIdle === true,
          idleWaited: executeMeta.idleWaited === true,
          fallback: executeMeta.fallback === true,
        };
      });
      return;
    }
    updateDeckAmenityLayers({ caller: "scheduleDeckUpdate", reason: reason || "" });
  }

  function waitForDeckUpdateIdle(d, reason) {
    var generation = pendingDeckIdleGeneration + 1;
    pendingDeckIdleGeneration = generation;
    clearDeckIdleFallbackTimer();
    clearDeckIdleListenerCleanup();
    deckIdleListenerCleanup = registerMapIdleOnce(d.map, function () {
      if (!consumePendingDeckIdleWait(generation)) return;
      executeScheduledDeckUpdate(d, reason, {
        waitForIdle: true,
        idleWaited: true,
        fallback: false,
      });
    });
    if (!deckIdleListenerCleanup) {
      executeScheduledDeckUpdate(d, reason, {
        waitForIdle: false,
        idleWaited: false,
        fallback: false,
      });
      return;
    }
    deckIdleFallbackTimer = setTimeout(function () {
      if (!consumePendingDeckIdleWait(generation)) return;
      executeScheduledDeckUpdate(d, reason, {
        waitForIdle: true,
        idleWaited: false,
        fallback: true,
      });
    }, 160);
  }

  function scheduleDeckUpdate(reason) {
    var d = requireDeps();
    var pendingTimer = d.getDeckUpdateTimer();
    var normalizedReason = reason || "";
    var waitForIdle = isCameraDeckUpdateReason(normalizedReason);
    perfCounter(d, "renderer:scheduleDeckUpdate", function () {
      return {
        reason: normalizedReason,
        scoreMode: d.getScoreMode(),
        mode: d.getCurrentMode(),
        visibleFeatures: d.getVisibleAmenityFeatures().length,
        replacedPending: !!pendingTimer,
        waitForIdle: waitForIdle,
      };
    });
    clearTimeout(pendingTimer);
    d.setDeckUpdateTimer(null);
    cancelPendingDeckIdleWait();
    d.setDeckUpdateTimer(
      setTimeout(function () {
        d.setDeckUpdateTimer(null);
        if (waitForIdle) {
          waitForDeckUpdateIdle(d, normalizedReason);
          return;
        }
        executeScheduledDeckUpdate(d, normalizedReason, {
          waitForIdle: false,
          idleWaited: false,
          fallback: false,
        });
      }, 80)
    );
  }

  function initDeckAmenityOverlay() {
    var d = requireDeps();
    var deckLib = window.deck;
    if (d.getDeckAmenityOverlay() || !deckLib || !deckLib.MapboxOverlay) return;
    var overlay = new deckLib.MapboxOverlay({ interleaved: true, layers: [] });
    d.setDeckAmenityOverlay(overlay);
    d.map.addControl(overlay);
    d.map.on("moveend", function () {
      scheduleDeckUpdate("moveend");
    });
    d.map.on("zoomend", function () {
      scheduleDeckUpdate("zoomend");
    });
    d.map.on("resize", function () {
      updateDeckAmenityLayers({ caller: "resize" });
    });
  }

  function updateBuildingColors() {
    var d = requireDeps();
    perfCounter(d, "renderer:updateBuildingColors:start", function () {
      return {
        buildings: featureCount(d.getBuildingsData()),
        generatedBuildings: d.hasGeneratedArtifact("buildings"),
        scoreMode: d.getScoreMode(),
        mode: d.getCurrentMode(),
      };
    });
    return d.urban95Perf.phase("updateBuildingColors", function () {
      var buildingsData = d.getBuildingsData();
      if (!buildingsData || !buildingsData.features || buildingsData.features.length === 0) return;
      if (d.getScoreMode() !== "weighted" && d.getAllFilterTypes().length === 0) return;

      var feats = buildingsData.features;
      var symPctKey = d.symPctKey;
      var isWeighted = d.getScoreMode() === "weighted";
      var selectedAmenityTypes = d.getSelectedAmenityTypes();
      var hasExpandedSelection = selectedAmenityTypes.size > 0;
      var activeMetric = getActiveMetricFromDeps(d);

      if (isWeighted && !activeMetric) {
        if (d.map.getLayer(d.buildingsFillLayerId)) {
          d.map.setPaintProperty(d.buildingsFillLayerId, "fill-color", "#cbd5e1");
        }
        return;
      }

      if (isWeighted || hasExpandedSelection) {
        var scores = d.collectBuildingScores();
        var ranks = isWeighted ? null : d.bulkPercentileRanks(scores);
        feats.forEach(function (feature, index) {
          var props = feature.properties || {};
          if (isWeighted) {
            var rawScore = scores[index];
            props[symPctKey] = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 0;
          } else {
            props[symPctKey] = ranks[index] != null ? ranks[index] : 0;
          }
        });
      } else {
        feats.forEach(function (feature) {
          var props = feature.properties || {};
          props[symPctKey] = 0;
        });
      }

      if (d.hasGeneratedArtifact("buildings")) {
        perfSpan(d, "renderer:updateBuildingColors:setFeatureState", function () {
          return { buildings: feats.length };
        }, function () {
          feats.forEach(function (feature) {
            var props = feature.properties || {};
            var bid = Number(props.building_id);
            var val = Number(props[symPctKey]) || 0;
            if (!Number.isFinite(bid)) {
              if (!missingBuildingIdLogged) {
                console.warn(
                  "[urban95] Some building features lack numeric building_id; map feature-state choropleth skipped for those."
                );
                missingBuildingIdLogged = true;
              }
              return;
            }
            d.map.setFeatureState(
              { source: d.buildingsMapSourceId, sourceLayer: d.buildingsVectorLayerId, id: bid },
              Object.fromEntries([[d.buildingsSymPctStateKey, val]])
            );
          });
        });
      }

      if (d.map.getLayer(d.buildingsFillLayerId)) {
        d.map.setPaintProperty(
          d.buildingsFillLayerId,
          "fill-color",
          d.buildingsChoroplethFillColorExpr
        );
      }
    });
  }

  function updateNeighborhoodSurfaceData() {
    var d = requireDeps();
    perfCounter(d, "renderer:updateNeighborhoodSurfaceData:start", function () {
      return {
        generatedSurface: d.hasGeneratedArtifact("neighborhood_surface"),
        surfaceFeatures: featureCount(d.getNeighborhoodSurfaceData()),
        mode: d.getCurrentMode(),
      };
    });
    return d.urban95Perf.phase("updateNeighborhoodSurfaceData", function () {
      var surfaceSrc = d.map.getSource("neighborhood-score-surface");
      if (!surfaceSrc) return;
      var activeMetric = getActiveMetricFromDeps(d);
      var renderState = requireRenderState(d);
      var neighborhoodSurfaceData = d.getNeighborhoodSurfaceData();

      if (d.hasGeneratedArtifact("neighborhood_surface")) {
        var generatedScoreKey = d.getNeighborhoodSurfaceScorePropertyKey();
        if (d.getScoreMode() === "weighted" && !generatedScoreKey) {
          if (d.map.getLayer("neighborhoods-surface")) {
            d.map.setLayoutProperty("neighborhoods-surface", "visibility", "none");
          }
          return;
        }
        if (
          d.getScoreMode() === "weighted" &&
          activeMetric &&
          activeMetric.kind === "weighted-subcategory" &&
          neighborhoodSurfaceData &&
          !renderState.supportsMetricSurfaceData(activeMetric, neighborhoodSurfaceData)
        ) {
          if (d.map.getLayer("neighborhoods-surface")) {
            d.map.setLayoutProperty("neighborhoods-surface", "visibility", "none");
          }
          return;
        }
        if (d.map.getLayer("neighborhoods-surface")) {
          var colorExpr = d.getNeighborhoodSurfaceColorExpression(generatedScoreKey);
          var outlineExpr = d.getCurrentMode() === "house" ? "rgba(0,0,0,0)" : colorExpr;
          d.map.setPaintProperty("neighborhoods-surface", "fill-color", colorExpr);
          d.map.setPaintProperty("neighborhoods-surface", "fill-outline-color", outlineExpr);
          d.map.setLayoutProperty(
            "neighborhoods-surface",
            "visibility",
            activeMetric ? "visible" : "none"
          );
        }
        return;
      }

      var precomputedScoreKey = d.getNeighborhoodSurfaceScorePropertyKey();
      if (
        d.getScoreMode() === "weighted" &&
        activeMetric &&
        activeMetric.kind === "weighted-subcategory" &&
        !renderState.supportsMetricSurfaceData(activeMetric, neighborhoodSurfaceData)
      ) {
        if (surfaceSrc && typeof surfaceSrc.setData === "function") {
          perfSpan(d, "renderer:updateNeighborhoodSurfaceData:setData", { branch: "missingSubcategory", features: 0 }, function () {
            surfaceSrc.setData({ type: "FeatureCollection", features: [] });
          });
        }
        if (d.map.getLayer("neighborhoods-surface")) {
          d.map.setLayoutProperty("neighborhoods-surface", "visibility", "none");
        }
        return;
      }

      if (
        precomputedScoreKey &&
        neighborhoodSurfaceData &&
        Array.isArray(neighborhoodSurfaceData.features) &&
        neighborhoodSurfaceData.features.length > 0
      ) {
        perfSpan(d, "renderer:updateNeighborhoodSurfaceData:setData", function () {
          return { branch: "geojson", features: neighborhoodSurfaceData.features.length };
        }, function () {
          surfaceSrc.setData(neighborhoodSurfaceData);
        });
        if (d.map.getLayer("neighborhoods-surface")) {
          var dataColorExpr = d.getNeighborhoodSurfaceColorExpression(precomputedScoreKey);
          var dataOutlineExpr = d.getCurrentMode() === "house" ? "rgba(0,0,0,0)" : dataColorExpr;
          d.map.setPaintProperty("neighborhoods-surface", "fill-color", dataColorExpr);
          d.map.setPaintProperty("neighborhoods-surface", "fill-outline-color", dataOutlineExpr);
          d.map.setLayoutProperty(
            "neighborhoods-surface",
            "visibility",
            activeMetric ? "visible" : "none"
          );
        }
        return;
      }

      perfSpan(d, "renderer:updateNeighborhoodSurfaceData:setData", { branch: "empty", features: 0 }, function () {
        surfaceSrc.setData({ type: "FeatureCollection", features: [] });
      });
      if (d.map.getLayer("neighborhoods-surface")) {
        var emptyColorExpr = d.getNeighborhoodSurfaceColorExpression(precomputedScoreKey || "score");
        var emptyOutlineExpr = d.getCurrentMode() === "house" ? "rgba(0,0,0,0)" : emptyColorExpr;
        d.map.setPaintProperty("neighborhoods-surface", "fill-color", emptyColorExpr);
        d.map.setPaintProperty("neighborhoods-surface", "fill-outline-color", emptyOutlineExpr);
      }
    });
  }

  function updateNeighborhoodColors() {
    var d = requireDeps();
    perfCounter(d, "renderer:updateNeighborhoodColors:start", function () {
      return { neighborhoods: featureCount(d.getNeighborhoodsData()), mode: d.getCurrentMode() };
    });
    return d.urban95Perf.phase("updateNeighborhoodColors", function () {
      var neighborhoodsData = d.getNeighborhoodsData();
      if (!neighborhoodsData || !d.map.getLayer("neighborhoods-fill")) return;

      var sfx = "_" + d.getScoreMinutes() + "min";
      var avgKey = d.getNeighborhoodAverageKey(sfx);
      var feats = neighborhoodsData.features;
      var activeMetric = getActiveMetricFromDeps(d);
      if (
        d.getScoreMode() === "weighted" &&
        (!avgKey ||
          (feats.length > 0 &&
            !requireRenderState(d).supportsMetricNeighborhoodAverageData(
              activeMetric,
              feats[0].properties || {}
            )))
      ) {
        d.map.setLayoutProperty("neighborhoods-fill", "visibility", "none");
        return;
      }
      d.map.setLayoutProperty("neighborhoods-fill", "visibility", "visible");
      var values = feats.map(function (feature) {
        var props = feature.properties || {};
        if (d.getScoreMode() === "weighted") {
          var selectedValue = Number(props[avgKey]);
          if (Number.isFinite(selectedValue)) return selectedValue;
          return NaN;
        }
        return Number(props[avgKey]) || 0;
      });
      var ranks = d.getScoreMode() === "weighted" ? null : d.bulkPercentileRanks(values);

      feats.forEach(function (feature, index) {
        var props = feature.properties || {};
        if (d.getScoreMode() === "weighted") {
          props[d.symPctKey] = Math.max(0, Math.min(100, Number(values[index]) || 0));
        } else {
          props[d.symPctKey] = ranks[index] != null ? ranks[index] : 0;
        }
      });

      var nhSrc = d.map.getSource("neighborhoods");
      if (nhSrc) {
        perfSpan(d, "renderer:updateNeighborhoodColors:setData", function () {
          return { features: neighborhoodsData.features.length };
        }, function () {
          nhSrc.setData(neighborhoodsData);
        });
      }

      var colorExpr = [
        "interpolate",
        ["linear"],
        ["to-number", ["get", d.symPctKey]],
        0,
        "#ef4444",
        25,
        "#f97316",
        50,
        "#eab308",
        75,
        "#84cc16",
        100,
        "#22c55e",
      ];

      if (d.getCurrentMode() === "neighborhood") {
        d.map.setPaintProperty("neighborhoods-fill", "fill-color", "#0f172a");
        d.map.setPaintProperty("neighborhoods-fill", "fill-opacity", 0.01);
        updateNeighborhoodSurfaceData();
      } else {
        d.map.setPaintProperty("neighborhoods-fill", "fill-color", colorExpr);
        d.map.setPaintProperty("neighborhoods-fill", "fill-opacity", 0.6);
      }
    });
  }

  window.Urban95MapRenderers = {
    configure: configure,
    setLayerVisibilityIfPresent: setLayerVisibilityIfPresent,
    setLayerVisibility: setLayerVisibility,
    resetPointHoverState: resetPointHoverState,
    getSpecialPointRenderPlan: getSpecialPointRenderPlan,
    applySpecialPointRenderPlan: applySpecialPointRenderPlan,
    setTreesVisibility: setTreesVisibility,
    setStreetLightsVisibility: setStreetLightsVisibility,
    setTreesAndLightsVisibility: setTreesAndLightsVisibility,
    bindPointHoverLayer: bindPointHoverLayer,
    applyShowPointsToggle: applyShowPointsToggle,
    syncPointLayerVisibility: syncPointLayerVisibility,
    updateAmenitiesSource: updateAmenitiesSource,
    updateTreesSource: updateTreesSource,
    updateStreetLightsSource: updateStreetLightsSource,
    addAmenityLayers: addAmenityLayers,
    buildAmenityIconAtlas: buildAmenityIconAtlas,
    clusterVisibleAmenities: clusterVisibleAmenities,
    updateDeckAmenityLayers: updateDeckAmenityLayers,
    scheduleDeckUpdate: scheduleDeckUpdate,
    initDeckAmenityOverlay: initDeckAmenityOverlay,
    updateBuildingColors: updateBuildingColors,
    updateNeighborhoodSurfaceData: updateNeighborhoodSurfaceData,
    updateNeighborhoodColors: updateNeighborhoodColors,
  };
})();
