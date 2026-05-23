(function () {
  var deps = null;
  var hasRadiusOverlayData = false;
  var hasSelectedBuildingOverlayData = false;

  function configure(nextDeps) {
    deps = nextDeps || null;
    if (deps) {
      deps.hasRadiusSelectionState =
        typeof deps.hasRadiusSelectionState === "function"
          ? deps.hasRadiusSelectionState
          : function () {
              return true;
            };
    }
  }

  function requireDeps() {
    if (!deps) {
      throw new Error("Urban95Selection.configure must be called before selection functions");
    }
    return deps;
  }

  function perfSpan(d, name, meta, callback) {
    if (d.urban95Perf && typeof d.urban95Perf.span === "function") {
      return d.urban95Perf.span(name, meta, callback);
    }
    return callback();
  }

  function perfMark(d, name, meta) {
    if (d.urban95Perf && typeof d.urban95Perf.mark === "function") {
      d.urban95Perf.mark(name, meta);
    }
  }

  function featureCount(data) {
    return data && Array.isArray(data.features) ? data.features.length : 0;
  }

  function setSelectedBuildingVectorState(buildingId) {
    var d = requireDeps();
    var previousId = d.getSelectedBuildingVectorId();
    d.setSelectedBuildingVectorId(buildingId == null ? null : buildingId);
    if (!d.hasGeneratedArtifact("buildings")) return;
    if (!d.map || !d.map.getSource || !d.map.getSource(d.buildingsMapSourceId)) return;
    if (!d.map.getLayer || !d.map.getLayer(d.buildingsSelectedLayerId)) return;

    if (previousId != null) {
      var numericPreviousId = Number(previousId);
      if (Number.isFinite(numericPreviousId)) {
        d.map.setFeatureState(
          {
            source: d.buildingsMapSourceId,
            sourceLayer: d.buildingsVectorLayerId,
            id: numericPreviousId,
          },
          Object.fromEntries([[d.buildingsSelectedStateKey, false]])
        );
      }
    }

    var nextId = Number(buildingId);
    if (Number.isFinite(nextId)) {
      d.map.setFeatureState(
        {
          source: d.buildingsMapSourceId,
          sourceLayer: d.buildingsVectorLayerId,
          id: nextId,
        },
        Object.fromEntries([[d.buildingsSelectedStateKey, true]])
      );
    }
  }

  function geojsonHasFeatures(data) {
    if (!data) return false;
    if (data.type === "Feature") return true;
    return !!(Array.isArray(data.features) && data.features.length > 0);
  }

  function setRadiusSourceData(source, data) {
    hasRadiusOverlayData = geojsonHasFeatures(data);
    if (source) source.setData(data);
  }

  function setSelectedBuildingSourceData(source, data) {
    hasSelectedBuildingOverlayData = geojsonHasFeatures(data);
    if (source) source.setData(data);
  }

  function getBuildingCentroidGridKey(lng, lat) {
    var d = requireDeps();
    var gx = Math.floor(lng / d.buildingCentroidGridCellDegrees);
    var gy = Math.floor(lat / d.buildingCentroidGridCellDegrees);
    return gx + ":" + gy;
  }

  function buildBuildingCentroidGridIndex() {
    var d = requireDeps();
    var grid = new Map();
    d.getBuildingCentroids().forEach(function (building) {
      var key = getBuildingCentroidGridKey(building.lng, building.lat);
      if (!grid.has(key)) {
        grid.set(key, []);
      }
      grid.get(key).push(building);
    });
    d.setBuildingCentroidGridIndex(grid);
  }

  function getClosestBuildingCandidates(lng, lat) {
    var d = requireDeps();
    var buildingCentroids = d.getBuildingCentroids();
    if (buildingCentroids.length === 0) return [];
    var buildingCentroidGridIndex = d.getBuildingCentroidGridIndex();
    if (!buildingCentroidGridIndex || buildingCentroidGridIndex.size === 0) {
      return buildingCentroids;
    }

    var baseX = Math.floor(lng / d.buildingCentroidGridCellDegrees);
    var baseY = Math.floor(lat / d.buildingCentroidGridCellDegrees);
    var candidates = [];
    var seen = new Set();
    for (var ring = 0; ring <= d.buildingCentroidMaxGridRing; ring += 1) {
      for (var dx = -ring; dx <= ring; dx += 1) {
        for (var dy = -ring; dy <= ring; dy += 1) {
          if (ring > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          var key = baseX + dx + ":" + (baseY + dy);
          var bucket = buildingCentroidGridIndex.get(key);
          if (!bucket || bucket.length === 0) continue;
          bucket.forEach(function (item) {
            var uid = item.properties && item.properties.building_id;
            if (uid != null) {
              if (seen.has(uid)) return;
              seen.add(uid);
            }
            candidates.push(item);
          });
        }
      }
      if (candidates.length >= d.buildingCentroidMinCandidates) {
        break;
      }
    }

    return candidates.length > 0 ? candidates : buildingCentroids;
  }

  function findClosestBuilding(lngLat) {
    var d = requireDeps();
    if (d.getBuildingCentroids().length === 0) return null;

    var closest = null;
    var minDist = Infinity;
    var candidates = getClosestBuildingCandidates(lngLat.lng, lngLat.lat);
    candidates.forEach(function (building) {
      var dist = d.turf.distance([lngLat.lng, lngLat.lat], [building.lng, building.lat], {
        units: "meters",
      });
      if (dist < minDist) {
        minDist = dist;
        closest = building;
      }
    });

    return closest;
  }

  function loadIsochrones(options) {
    var d = requireDeps();
    var opts = options || {};
    var background = opts.background === true;
    if (!background) {
      d.setLoadingStatus("Loading walking areas...");
    }
    if (d.getIsochronesLoaded()) return Promise.resolve(null);
    if (d.getIsochroneLoadPromise()) return d.getIsochroneLoadPromise();
    var isochronesLoadStartedAt = performance.now();
    console.log("[Load] isochrones: start");

    var loadPromise = d.loadIsochronesLookup()
      .then(function (data) {
        return d.urban95Perf.phase("loadIsochrones:indexAndFinish", function () {
          var byBuilding = data && typeof data.by_building === "object" ? data.by_building : null;
          var hasCompactLookup =
            byBuilding && !Array.isArray(byBuilding) && Object.keys(byBuilding).length > 0;
          if (hasCompactLookup) {
            d.setIsochroneIndex(byBuilding);
            d.setIsochronesLookupMode("compact");
            d.setIsochronesLoaded(true);
            d.markIsochronesLoaded();
            console.log(
              "[Load] isochrones: compact lookup ready in",
              Math.round(performance.now() - isochronesLoadStartedAt) + "ms"
            );
            if (d.getWaitingForIsochroneLoad()) {
              d.hideIsochroneLoadingScreen();
            }
            if (d.getSelectedBuilding()) {
              selectBuilding(d.getSelectedBuilding(), false);
            }
            return null;
          }
          return d.fetchJsonWithGzipFallback(d.isochronesUrl).then(function (legacyData) {
            if (!legacyData || !legacyData.features) throw new Error("Invalid isochrone data");
            d.setIsochronesLookupMode("legacy");
            var legacyIndex = {};
            var isochronesIndexStartedAt = performance.now();
            legacyData.features.forEach(function (feature) {
              var bid = feature.properties.building_id;
              var mins = feature.properties.minutes;
              legacyIndex[bid + "_" + mins] = feature;
            });
            d.setIsochroneIndex(legacyIndex);
            console.log(
              "[Load] isochrones: indexed",
              legacyData.features.length,
              "features in",
              Math.round(performance.now() - isochronesIndexStartedAt) + "ms"
            );
            d.setIsochronesLoaded(true);
            d.markIsochronesLoaded();
            console.log(
              "[Load] isochrones: complete total",
              Math.round(performance.now() - isochronesLoadStartedAt) + "ms"
            );
            if (d.getWaitingForIsochroneLoad()) {
              d.hideIsochroneLoadingScreen();
            }
            if (d.getSelectedBuilding()) {
              selectBuilding(d.getSelectedBuilding(), false);
            }
            return null;
          });
        });
      })
      .catch(function (err) {
        console.error("Failed to load isochrones:", err);
        d.markIsochronesLoaded();
        if (d.getWaitingForIsochroneLoad()) {
          d.setLoadingStatus("Failed loading walking areas. Please retry in a moment.");
          setTimeout(function () {
            d.hideIsochroneLoadingScreen();
          }, 900);
        }
      })
      .finally(function () {
        d.setIsochroneLoadPromise(null);
      });

    d.setIsochroneLoadPromise(loadPromise);
    return loadPromise;
  }

  function getIsochrone(buildingId, minutes) {
    var d = requireDeps();
    if (d.getIsochronesLookupMode() === "compact") {
      return d.compactIsochroneFeature(d.getIsochroneIndex(), buildingId, minutes);
    }
    var key = buildingId + "_" + minutes;
    return d.getIsochroneIndex()[key] || null;
  }

  function isCoordinateInsidePolygon(coord, polygon, bbox) {
    var d = requireDeps();
    if (!coord || coord.length < 2) return false;
    var lng = coord[0];
    var lat = coord[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
    if (bbox) {
      if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) {
        return false;
      }
    }
    return d.turf.booleanPointInPolygon(coord, polygon);
  }

  function getItemsInPolygon(polygon) {
    var d = requireDeps();
    return perfSpan(d, "selection:getItemsInPolygon", function () {
      return {
        scoreMode: d.getScoreMode(),
        amenityFeatures: featureCount(d.getAllAmenitiesData()),
        treeFeatures: featureCount(d.getAllTreesData()),
        streetLightFeatures: featureCount(d.getAllStreetLightsData()),
      };
    }, function () {
      var amenityIndices = new Set();
      var treeIndices = new Set();
      var streetLightIndices = new Set();
      var counts = {};

      var selectedAmenityTypes = d.getSelectedAmenityTypes();
      if (selectedAmenityTypes.size === 0 || !polygon) {
        return {
          amenityIndices: amenityIndices,
          treeIndices: treeIndices,
          streetLightIndices: streetLightIndices,
          counts: counts,
        };
      }

      var allFilterTypes = d.getAllFilterTypes();
      var useAll = selectedAmenityTypes.size === allFilterTypes.length;
      var polygonBbox = d.turf.bbox(polygon);

      var allAmenitiesData = d.getAllAmenitiesData();
      if (allAmenitiesData && allAmenitiesData.features) {
        allAmenitiesData.features.forEach(function (feature, index) {
          var type = feature.properties.amenity_type;
          if (!useAll && !selectedAmenityTypes.has(type)) return;
          var coords = feature.geometry && feature.geometry.coordinates;
          if (isCoordinateInsidePolygon(coords, polygon, polygonBbox)) {
            amenityIndices.add(index);
            counts[type] = (counts[type] || 0) + 1;
          }
        });
      }

      var allTreesData = d.getAllTreesData();
      if (allTreesData && allTreesData.features && (useAll || selectedAmenityTypes.has("trees"))) {
        allTreesData.features.forEach(function (feature, index) {
          var coords = feature.geometry && feature.geometry.coordinates;
          if (isCoordinateInsidePolygon(coords, polygon, polygonBbox)) {
            treeIndices.add(index);
            counts.trees = (counts.trees || 0) + 1;
          }
        });
      }

      var allStreetLightsData = d.getAllStreetLightsData();
      if (
        allStreetLightsData &&
        allStreetLightsData.features &&
        (useAll || selectedAmenityTypes.has("street-lights"))
      ) {
        allStreetLightsData.features.forEach(function (feature, index) {
          var coords = feature.geometry && feature.geometry.coordinates;
          if (isCoordinateInsidePolygon(coords, polygon, polygonBbox)) {
            streetLightIndices.add(index);
            counts["street-lights"] = (counts["street-lights"] || 0) + 1;
          }
        });
      }

      return {
        amenityIndices: amenityIndices,
        treeIndices: treeIndices,
        streetLightIndices: streetLightIndices,
        counts: counts,
      };
    });
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function buildUrban95ReferenceRadius(lng, lat) {
    var d = requireDeps();
    return d.turf.circle([lng, lat], d.referenceRadiusMeters, {
      steps: 96,
      units: "meters",
    });
  }

  function selectBuilding(building, doFly) {
    var d = requireDeps();
    var shouldFly = doFly !== false;
    perfMark(d, "selection:selectBuilding:start", function () {
      return {
        scoreMode: d.getScoreMode(),
        walkMinutes: d.getWalkMinutes(),
        shouldFly: shouldFly,
        isochronesLoaded: d.getIsochronesLoaded(),
        buildingId: building && building.feature && building.feature.properties
          ? building.feature.properties.building_id
          : "",
      };
    });
    return d.urban95Perf.phase("selectBuilding", function () {
      perfSpan(d, "selection:selectedStateAndSource", null, function () {
        d.setSelectedBuilding(building);
        setSelectedBuildingVectorState(building && building.properties && building.properties.building_id);

          var buildingSource = d.map.getSource(d.selectedBuildingSourceId);
          if (!d.hasGeneratedArtifact("buildings") && buildingSource && building.feature) {
            setSelectedBuildingSourceData(buildingSource, {
              type: "FeatureCollection",
              features: [building.feature],
            });
          } else if (buildingSource) {
            setSelectedBuildingSourceData(buildingSource, {
              type: "FeatureCollection",
              features: [],
            });
          }
      });

      if (d.getScoreMode() === "weighted") {
        d.setAmenitiesInRadiusIds(new Set());
        d.setTreesInRadiusIds(new Set());
        d.setStreetLightsInRadiusIds(new Set());
        d.setLatestRadiusCounts({});

        var weightedRadiusSource = d.map.getSource(d.radiusSourceId);
        perfSpan(d, "selection:weightedRadiusSource", null, function () {
          if (weightedRadiusSource) {
            setRadiusSourceData(
              weightedRadiusSource,
              buildUrban95ReferenceRadius(building.lng, building.lat)
            );
          }
        });

        perfSpan(d, "selection:pointSourceRefresh", { branch: "weighted" }, function () {
          d.updateAmenitiesSource();
          d.updateTreesSource();
          d.updateStreetLightsSource();
        });
        perfSpan(d, "selection:sidebarRadiusUpdate", { branch: "weighted" }, updateRadiusInfo);

        if (shouldFly) {
          var radiusPolygon = buildUrban95ReferenceRadius(building.lng, building.lat);
          perfSpan(d, "selection:flySchedule", { branch: "weighted" }, function () {
            d.map.easeTo({
              center: [building.lng, building.lat],
              zoom: Math.max(d.map.getZoom(), d.getZoomForPolygon(radiusPolygon)),
              duration: 1400,
              easing: easeInOutQuad,
              essential: true,
            });
          });
        }
        return;
      }

      if (!d.getIsochronesLoaded()) {
        d.setAmenitiesInRadiusIds(new Set());
        d.setTreesInRadiusIds(new Set());
        d.setStreetLightsInRadiusIds(new Set());
        d.setLatestRadiusCounts({});
            var pendingRadiusSource = d.map.getSource(d.radiusSourceId);
        perfSpan(d, "selection:radiusSource", { branch: "isochronesPending" }, function () {
          if (pendingRadiusSource) {
            setRadiusSourceData(pendingRadiusSource, { type: "FeatureCollection", features: [] });
          }
        });
        perfSpan(d, "selection:pointSourceRefresh", { branch: "isochronesPending" }, function () {
          d.updateAmenitiesSource();
          d.updateTreesSource();
          d.updateStreetLightsSource();
        });
        d.showIsochroneLoadingScreen();
        perfSpan(d, "selection:loadIsochronesTrigger", null, function () {
          loadIsochrones();
        });
        if (shouldFly) {
          perfSpan(d, "selection:flySchedule", { branch: "isochronesPending" }, function () {
            d.map.easeTo({
              center: [building.lng, building.lat],
              zoom: Math.max(d.map.getZoom(), 16),
              duration: 1400,
              easing: easeInOutQuad,
              essential: true,
            });
          });
        }
        perfSpan(d, "selection:sidebarRadiusUpdate", { branch: "isochronesPending" }, updateRadiusInfo);
        return;
      }

      var buildingId = building.feature ? building.feature.properties.building_id : null;
      var polygon = null;
      if (buildingId != null) {
        polygon = perfSpan(d, "selection:isochroneLookup", function () {
          return { buildingId: buildingId, walkMinutes: d.getWalkMinutes() };
        }, function () {
          return getIsochrone(buildingId, d.getWalkMinutes());
        });
      }

      if (polygon) {
        perfSpan(d, "selection:radiusSource", { branch: "isochroneFound" }, function () {
            var source = d.map.getSource(d.radiusSourceId);
            setRadiusSourceData(source, polygon);
        });
          } else {
        perfSpan(d, "selection:radiusSource", { branch: "isochroneMissing" }, function () {
            var emptySource = d.map.getSource(d.radiusSourceId);
            setRadiusSourceData(emptySource, { type: "FeatureCollection", features: [] });
        });

        d.setAmenitiesInRadiusIds(new Set());
        d.setTreesInRadiusIds(new Set());
        d.setStreetLightsInRadiusIds(new Set());
        d.setLatestRadiusCounts({});
        perfSpan(d, "selection:pointSourceRefresh", { branch: "isochroneMissing" }, function () {
          d.updateAmenitiesSource();
          d.updateTreesSource();
          d.updateStreetLightsSource();
        });
        perfSpan(d, "selection:sidebarRadiusUpdate", { branch: "isochroneMissing" }, updateRadiusInfo);

        if (shouldFly) {
          perfSpan(d, "selection:flySchedule", { branch: "isochroneMissing" }, function () {
            d.map.easeTo({
              center: [building.lng, building.lat],
              zoom: Math.max(d.map.getZoom(), 16),
              duration: 1400,
              easing: easeInOutQuad,
              essential: true,
            });
          });
        }
        return;
      }

      var applyRadius = function () {
        var result = getItemsInPolygon(polygon);
        d.setAmenitiesInRadiusIds(result.amenityIndices);
        d.setTreesInRadiusIds(result.treeIndices);
        d.setStreetLightsInRadiusIds(result.streetLightIndices);
        d.setLatestRadiusCounts(result.counts);
        perfSpan(d, "selection:pointSourceRefresh", { branch: "isochroneFound" }, function () {
          d.updateAmenitiesSource();
          d.updateTreesSource();
          d.updateStreetLightsSource();
        });
        perfSpan(d, "selection:sidebarRadiusUpdate", { branch: "isochroneFound" }, updateRadiusInfo);
      };

      if (shouldFly) {
        perfSpan(d, "selection:flySchedule", { branch: "isochroneFound" }, function () {
          var zoom = d.getZoomForPolygon(polygon);
          d.requestAnimationFrame(applyRadius);
          d.map.easeTo({
            center: [building.lng, building.lat],
            zoom: zoom,
            duration: 1400,
            easing: easeInOutQuad,
            essential: true,
          });
        });
      } else {
        applyRadius();
      }
    });
  }

  function updateRadiusInfo() {
    var d = requireDeps();
    var infoPanel = d.radiusInfoEl;
    if (!infoPanel) return;
    if (d.getCurrentMode() !== "house") {
      infoPanel.style.display = "none";
      d.hideScoreSidebar({ restoreFocus: false });
      return;
    }
    d.syncScoreSidebar();
    infoPanel.style.display = "none";
  }

  function clearRadiusSelection() {
    var d = requireDeps();
    var source = d.map.getSource(d.radiusSourceId);
    var buildingSource = d.map.getSource(d.selectedBuildingSourceId);
    if (!d.hasRadiusSelectionState() && !hasRadiusOverlayData && !hasSelectedBuildingOverlayData) {
      return;
    }
    d.setSelectedBuilding(null);
    setSelectedBuildingVectorState(null);
    d.setAmenitiesInRadiusIds(new Set());
    d.setTreesInRadiusIds(new Set());
    d.setStreetLightsInRadiusIds(new Set());
    d.setLatestRadiusCounts({});

    setRadiusSourceData(source, { type: "FeatureCollection", features: [] });

    setSelectedBuildingSourceData(buildingSource, { type: "FeatureCollection", features: [] });

    d.updateAmenitiesSource();
    d.updateTreesSource();
    d.updateStreetLightsSource();

    if (d.radiusInfoEl) d.radiusInfoEl.style.display = "none";
    d.hideScoreSidebar({ restoreFocus: false });
  }

  window.Urban95Selection = {
    configure: configure,
    setSelectedBuildingVectorState: setSelectedBuildingVectorState,
    getBuildingCentroidGridKey: getBuildingCentroidGridKey,
    buildBuildingCentroidGridIndex: buildBuildingCentroidGridIndex,
    getClosestBuildingCandidates: getClosestBuildingCandidates,
    findClosestBuilding: findClosestBuilding,
    loadIsochrones: loadIsochrones,
    getIsochrone: getIsochrone,
    isCoordinateInsidePolygon: isCoordinateInsidePolygon,
    getItemsInPolygon: getItemsInPolygon,
    easeInOutQuad: easeInOutQuad,
    selectBuilding: selectBuilding,
    updateRadiusInfo: updateRadiusInfo,
    clearRadiusSelection: clearRadiusSelection,
    buildUrban95ReferenceRadius: buildUrban95ReferenceRadius,
  };
})();
