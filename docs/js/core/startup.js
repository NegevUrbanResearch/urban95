(function () {
  function requireObject(value, label) {
    if (!value || typeof value !== "object") {
      throw new Error(label + " is required");
    }
    return value;
  }

  function requireFunction(container, label, memberName) {
    if (!container || typeof container[memberName] !== "function") {
      throw new Error(label + "." + memberName + " must be a function");
    }
    return container[memberName];
  }

  function requireLogger(logger) {
    requireFunction(logger, "deps.logger", "debug");
    requireFunction(logger, "deps.logger", "perf");
    requireFunction(logger, "deps.logger", "warn");
    requireFunction(logger, "deps.logger", "error");
    return logger;
  }

  function buildBuildingCentroids(featureCollection, turfLib) {
    var centroids = [];
    (featureCollection.features || []).forEach(function (feature) {
      if (!feature.geometry) return;
      var props = feature.properties || {};
      var storedLng = Number(props.centroid_lng);
      var storedLat = Number(props.centroid_lat);
      var hasStoredCentroid = Number.isFinite(storedLng) && Number.isFinite(storedLat);
      var centroid = hasStoredCentroid ? null : turfLib.centroid(feature);
      centroids.push({
        lng: hasStoredCentroid ? storedLng : centroid.geometry.coordinates[0],
        lat: hasStoredCentroid ? storedLat : centroid.geometry.coordinates[1],
        properties: props,
        feature: feature,
      });
    });
    return centroids;
  }

  window.Urban95Startup = {
    run: async function (deps) {
      var groups = requireObject(deps, "deps");
      var logger = requireLogger(groups.logger);
      var state = requireObject(groups.state, "deps.state");
      var runtime = requireObject(groups.runtime, "deps.runtime");
      var loading = requireObject(groups.loading, "deps.loading");
      var callbacks = requireObject(groups.callbacks, "deps.callbacks");
      var renderers = requireObject(groups.renderers, "deps.renderers");
      var selection = requireObject(groups.selection, "deps.selection");
      var urls = requireObject(groups.urls, "deps.urls");

      var buildingsState = requireObject(state.buildings, "deps.state.buildings");
      var amenitiesState = requireObject(state.amenities, "deps.state.amenities");
      requireFunction(buildingsState, "deps.state.buildings", "setData");
      requireFunction(buildingsState, "deps.state.buildings", "setCentroids");
      requireFunction(amenitiesState, "deps.state.amenities", "setCleanData");
      requireFunction(amenitiesState, "deps.state.amenities", "setCleanTypes");
      requireFunction(amenitiesState, "deps.state.amenities", "setLegacyData");
      requireFunction(amenitiesState, "deps.state.amenities", "setLegacyTypes");
      requireFunction(amenitiesState, "deps.state.amenities", "clearLegacyData");

      var performanceApi = requireObject(runtime.performance, "deps.runtime.performance");
      requireFunction(performanceApi, "deps.runtime.performance", "now");
      var map = requireObject(runtime.map, "deps.runtime.map");
      requireFunction(map, "deps.runtime.map", "getSource");
      requireFunction(map, "deps.runtime.map", "getZoom");
      requireFunction(map, "deps.runtime.map", "getCanvas");
      requireObject(runtime.loaders, "deps.runtime.loaders");
      requireFunction(runtime.loaders, "deps.runtime.loaders", "loadBuildingsRuntimeData");
      requireObject(runtime.pointDataLoader, "deps.runtime.pointDataLoader");
      requireFunction(runtime.pointDataLoader, "deps.runtime.pointDataLoader", "setPointLookupData");
      requireFunction(runtime.pointDataLoader, "deps.runtime.pointDataLoader", "loadTreesIfNeeded");
      requireFunction(runtime, "deps.runtime", "hasGeneratedArtifact");
      requireFunction(runtime, "deps.runtime", "fetchJsonWithGzipFallback");
      requireFunction(runtime, "deps.runtime", "featureCollectionFromPointRecords");
      requireFunction(runtime, "deps.runtime", "hasValidPointsLookupSources");
      requireFunction(runtime, "deps.runtime", "warnIfBuildingScoresIncomplete");
      requireFunction(runtime, "deps.runtime", "scanAmenityTypesFromFeatures");
      var turfLib = requireObject(runtime.turf, "deps.runtime.turf");
      requireFunction(turfLib, "deps.runtime.turf", "centroid");

      requireFunction(loading, "deps.loading", "setStatus");
      requireFunction(loading, "deps.loading", "markMapReady");
      requireFunction(loading, "deps.loading", "markIconsLoaded");
      requireFunction(loading, "deps.loading", "markBuildingsLoaded");
      requireFunction(loading, "deps.loading", "markParksLoaded");
      requireFunction(loading, "deps.loading", "markAmenitiesLoaded");
      requireFunction(loading, "deps.loading", "markTreesDeferred");
      requireFunction(loading, "deps.loading", "markIsochronesDeferred");

      requireFunction(callbacks, "deps.callbacks", "loadAmenityIcons");
      requireFunction(callbacks, "deps.callbacks", "loadPointsLookup");
      requireFunction(callbacks, "deps.callbacks", "loadAmenitiesGeojsonFallback");
      requireFunction(callbacks, "deps.callbacks", "applyScoreModeAmenities");
      requireFunction(callbacks, "deps.callbacks", "clearDerivedCaches");
      requireFunction(callbacks, "deps.callbacks", "applyHouseModeHexBackground");

      requireFunction(renderers, "deps.renderers", "applyParkDotPattern");
      requireFunction(renderers, "deps.renderers", "applyUrbanNatureDotPattern");
      requireFunction(renderers, "deps.renderers", "addAmenityLayers");
      requireFunction(renderers, "deps.renderers", "applyShowPointsToggle");
      requireFunction(renderers, "deps.renderers", "updateBuildingColors");

      requireFunction(selection, "deps.selection", "buildBuildingCentroidGridIndex");

      var appLoadStartedAt = performanceApi.now();

      logger.debug("[Load] app startup: map load event");
      loading.markMapReady();
      renderers.applyParkDotPattern(map, runtime.document);
      renderers.applyUrbanNatureDotPattern(map, runtime.document);

      loading.setStatus("Loading icons...");
      var iconsStartedAt = performanceApi.now();
      await callbacks.loadAmenityIcons();
      logger.perf("[Load] icons: complete", Math.round(performanceApi.now() - iconsStartedAt) + "ms");
      loading.markIconsLoaded();

      var layerInitStartedAt = performanceApi.now();
      renderers.addAmenityLayers();
      renderers.applyShowPointsToggle();
      logger.perf(
        "[Load] layer init: complete",
        Math.round(performanceApi.now() - layerInitStartedAt) + "ms"
      );

      loading.setStatus("Loading buildings...");
      var buildingsStartedAt = performanceApi.now();
      var buildingsLoad = runtime.hasGeneratedArtifact("buildings")
        ? runtime.loaders.loadBuildingsRuntimeData()
        : runtime.fetchJsonWithGzipFallback(urls.buildings);
      buildingsLoad
        .then(function (featureCollection) {
          logger.debug("[Load] buildings: features", (featureCollection.features || []).length);
          buildingsState.setData(featureCollection);
          if (!runtime.hasGeneratedArtifact("buildings")) {
            var buildingsSource = map.getSource(runtime.buildingsMapSourceId);
            if (buildingsSource) buildingsSource.setData(featureCollection);
          }
          runtime.warnIfBuildingScoresIncomplete(featureCollection);
          callbacks.clearDerivedCaches();

          var centroidsStartedAt = performanceApi.now();
          var centroids = buildBuildingCentroids(featureCollection, turfLib);
          buildingsState.setCentroids(centroids);
          selection.buildBuildingCentroidGridIndex();
          logger.perf(
            "[Load] buildings: centroid build",
            centroids.length,
            "items in",
            Math.round(performanceApi.now() - centroidsStartedAt) + "ms"
          );

          var buildingColorsStartedAt = performanceApi.now();
          renderers.updateBuildingColors();
          logger.perf(
            "[Load] buildings: color update",
            Math.round(performanceApi.now() - buildingColorsStartedAt) + "ms"
          );
          loading.markBuildingsLoaded();
          logger.perf(
            "[Load] buildings: complete total",
            Math.round(performanceApi.now() - buildingsStartedAt) + "ms"
          );
        })
        .catch(function (error) {
          logger.error("Failed to load buildings:", error);
          loading.markBuildingsLoaded();
        });

      loading.setStatus("Loading parks...");
      var parksStartedAt = performanceApi.now();
      runtime.fetchJsonWithGzipFallback(urls.parks, { required: false })
        .then(function (featureCollection) {
          if (featureCollection && map.getSource("parks")) map.getSource("parks").setData(featureCollection);
          logger.perf(
            "[Load] parks: complete",
            featureCollection && featureCollection.features ? featureCollection.features.length : 0,
            "features in",
            Math.round(performanceApi.now() - parksStartedAt) + "ms"
          );
          loading.markParksLoaded();
        })
        .catch(function (error) {
          logger.error("Failed to load parks:", error);
          loading.markParksLoaded();
        });

      runtime.fetchJsonWithGzipFallback(urls.urbanNatureAreas, { required: false })
        .then(function (featureCollection) {
          if (featureCollection && map.getSource("urban-nature")) {
            map.getSource("urban-nature").setData(featureCollection);
          }
          renderers.applyUrbanNatureDotPattern(map, runtime.document);
          if (typeof callbacks.applyUrbanNatureVisibility === "function") {
            callbacks.applyUrbanNatureVisibility();
          }
        })
        .catch(function (error) {
          logger.error("Failed to load urban nature areas:", error);
        });

      runtime.fetchJsonWithGzipFallback(urls.shadeSi, { required: false })
        .then(function (featureCollection) {
          if (featureCollection && map.getSource("shade-si")) {
            map.getSource("shade-si").setData(featureCollection);
          }
          if (typeof callbacks.applyStaticPolygonCompanionsVisibility === "function") {
            callbacks.applyStaticPolygonCompanionsVisibility();
          }
        })
        .catch(function (error) {
          logger.error("Failed to load shade SI:", error);
        });

      loading.setStatus("Loading amenities...");
      var amenitiesStartedAt = performanceApi.now();
      callbacks.loadPointsLookup()
        .then(function (lookup) {
          if (runtime.hasValidPointsLookupSources(lookup)) {
            var lookupSources = lookup && lookup.sources ? lookup.sources : {};
            return {
              source: "points_lookup",
              cleanFc: runtime.featureCollectionFromPointRecords(lookupSources.amenities_clean),
              legacyFc: Array.isArray(lookupSources.amenities_legacy)
                ? runtime.featureCollectionFromPointRecords(lookupSources.amenities_legacy)
                : null,
              treesFc: Array.isArray(lookupSources.trees)
                ? runtime.featureCollectionFromPointRecords(lookupSources.trees)
                : null,
              streetLightsFc: Array.isArray(lookupSources.street_lights)
                ? runtime.featureCollectionFromPointRecords(lookupSources.street_lights)
                : null,
            };
          }
          return callbacks.loadAmenitiesGeojsonFallback();
        })
        .catch(function () {
          return callbacks.loadAmenitiesGeojsonFallback();
        })
        .then(function (payload) {
          var amenitiesProcessStartedAt = performanceApi.now();
          var cleanFc = payload.cleanFc;
          var legacyFc = payload.legacyFc;
          var treesFc = payload.treesFc;
          var streetLightsFc = payload.streetLightsFc;

          amenitiesState.setCleanData(cleanFc);
          var cleanScan = runtime.scanAmenityTypesFromFeatures(cleanFc);
          amenitiesState.setCleanTypes(cleanScan.types, cleanScan.tw);

          if (legacyFc && (legacyFc.features || []).length > 0) {
            amenitiesState.setLegacyData(legacyFc);
            var legacyScan = runtime.scanAmenityTypesFromFeatures(legacyFc);
            amenitiesState.setLegacyTypes(legacyScan.types, legacyScan.tw);
          } else {
            amenitiesState.clearLegacyData();
          }

          if (payload.source === "points_lookup" && treesFc) {
            runtime.pointDataLoader.setPointLookupData({ trees: treesFc });
          }

          if (payload.source === "points_lookup" && streetLightsFc) {
            runtime.pointDataLoader.setPointLookupData({ streetLights: streetLightsFc });
          }

          callbacks.applyScoreModeAmenities();
          logger.perf(
            "[Load] amenities: process/apply complete in",
            Math.round(performanceApi.now() - amenitiesProcessStartedAt) + "ms",
            "source=",
            payload.source,
            "clean=",
            cleanFc && cleanFc.features ? cleanFc.features.length : 0,
            "legacy=",
            legacyFc && legacyFc.features ? legacyFc.features.length : 0,
            "trees=",
            treesFc && treesFc.features ? treesFc.features.length : 0,
            "streetLights=",
            streetLightsFc && streetLightsFc.features ? streetLightsFc.features.length : 0
          );

          loading.markAmenitiesLoaded();
          logger.perf(
            "[Load] amenities: complete total",
            Math.round(performanceApi.now() - amenitiesStartedAt) + "ms"
          );

          if (map.getZoom() >= 13) {
            runtime.pointDataLoader.loadTreesIfNeeded();
          }
        })
        .catch(function (error) {
          logger.error("Failed to load amenities:", error);
          loading.markAmenitiesLoaded();
        });

      loading.markTreesDeferred();
      loading.markIsochronesDeferred();
      logger.debug("[Load] isochrones: deferred until Amenities Focus needs walking areas");
      logger.perf(
        "[Load] app startup: async jobs queued in",
        Math.round(performanceApi.now() - appLoadStartedAt) + "ms"
      );

      callbacks.applyHouseModeHexBackground();

      var canvas = map.getCanvas();
      if (canvas && canvas.style) {
        canvas.style.cursor = "";
      }
    },
  };
})();
