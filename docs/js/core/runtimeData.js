(function () {
  function normalizeBuildingLookup(payload) {
    if (!payload || !Array.isArray(payload.features)) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: payload.features
        .map(function (record) {
          var lng = Number(record && record.centroid_lng);
          var lat = Number(record && record.centroid_lat);
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
          return {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [lng, lat],
            },
            properties: record && typeof record === "object" ? record : {},
          };
        })
        .filter(Boolean),
    };
  }

  function featureCollectionFromPointRecords(records) {
    return {
      type: "FeatureCollection",
      features: (records || [])
        .map(function (record, index) {
          var lng = Number(record && record.lng);
          var lat = Number(record && record.lat);
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
          return {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng, lat] },
            properties: {
              amenity_type: record && record.type,
              name: record && record.name ? record.name : "",
              _lookupIndex: index,
            },
          };
        })
        .filter(Boolean),
    };
  }

  function isFinitePosition(position) {
    return (
      Array.isArray(position) &&
      position.length >= 2 &&
      Number.isFinite(position[0]) &&
      Number.isFinite(position[1])
    );
  }

  function hasNestedPositions(value, depth) {
    if (!Array.isArray(value) || value.length === 0) return false;
    if (depth === 0) {
      return isFinitePosition(value);
    }
    return value.every(function (child) {
      return hasNestedPositions(child, depth - 1);
    });
  }

  function isPlausibleIsochroneGeometry(geometry) {
    if (!geometry || typeof geometry !== "object") return false;
    if (geometry.type === "Polygon") {
      return hasNestedPositions(geometry.coordinates, 2);
    }
    if (geometry.type === "MultiPolygon") {
      return hasNestedPositions(geometry.coordinates, 3);
    }
    return false;
  }

  function compactIsochroneFeature(index, buildingId, minutes) {
    var buildingLookup =
      index && typeof index === "object" ? index[String(buildingId)] : null;
    var geometry =
      buildingLookup && typeof buildingLookup === "object"
        ? buildingLookup[String(minutes)]
        : null;
    if (!isPlausibleIsochroneGeometry(geometry)) return null;
    return {
      type: "Feature",
      geometry: geometry,
      properties: {
        building_id: buildingId,
        minutes: minutes,
      },
    };
  }

  function hasValidPointsLookupSources(lookup) {
    var sources = lookup && lookup.sources;
    return Boolean(sources && Array.isArray(sources.amenities_clean));
  }

  function warnIfBuildingScoresIncomplete(fc) {
    if (!fc || !fc.features || fc.features.length === 0) return;
    var p = fc.features[0].properties || {};
    var keys = Object.keys(p);
    var hasStreet = keys.some(function (key) {
      return key.indexOf("num_street_lights_") === 0;
    });
    var hasExpanded = keys.some(function (key) {
      return key.indexOf("score_expanded_") === 0;
    });
    var hasWeighted = keys.some(function (key) {
      return key.indexOf("score_weighted_") === 0;
    });
    var hasWeightedSubscores = keys.some(function (key) {
      return key.indexOf("score_weighted_sub_") === 0;
    });
    if (!hasStreet || !hasExpanded) {
      console.warn(
        "[urban95] buildings_accessibility.geojson is missing num_street_lights_* or score_expanded_*. Legacy expanded scores and street-light percentiles need a fresh preprocess run."
      );
    }
    if (!hasWeighted) {
      console.warn(
        "[urban95] buildings_accessibility.geojson has no score_weighted_* properties. Urban95 mode needs a fresh preprocess run."
      );
    }
    if (!hasWeightedSubscores) {
      console.warn(
        "[urban95] buildings_accessibility.geojson has no score_weighted_sub_* properties. Urban95 explain details will be partial until you regenerate outputs with src/preprocess_accessibility.py."
      );
    }
  }

  function scanAmenityTypesFromFeatures(fc) {
    var typeCounts = {};
    ((fc && fc.features) || []).forEach(function (feature) {
      var type = (feature.properties && feature.properties.amenity_type) || "";
      if (type) {
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      }
    });
    var types = Object.keys(typeCounts).sort();
    var typesWithData = new Set();
    types.forEach(function (type) {
      if (typeCounts[type] > 0) {
        typesWithData.add(type);
      }
    });
    return { types: types, tw: typesWithData };
  }

  function createLoaders(fetchJsonWithGzipFallback, urls, fallbackUrls) {
    function loadFullBuildingsFallback() {
      return fetchJsonWithGzipFallback(fallbackUrls.buildings, { plainFallback: false });
    }

    function loadBuildingsRuntimeData() {
      return fetchJsonWithGzipFallback(urls.buildingsLookup, { required: false })
        .catch(function () {
          return null;
        })
        .then(function (payload) {
          if (payload && Array.isArray(payload.features)) {
            var normalized = normalizeBuildingLookup(payload);
            if (payload.features.length === 0) {
              return normalized;
            }
            if (normalized.features.length > 0) {
              return normalized;
            }
            console.warn("[urban95] Building lookup was empty or invalid; falling back to full buildings GeoJSON.");
          }
          return loadFullBuildingsFallback();
        });
    }

    function loadPointsLookup() {
      return fetchJsonWithGzipFallback(urls.pointsLookup, { required: false });
    }

    function loadIsochronesLookup() {
      return fetchJsonWithGzipFallback(urls.isochronesLookup, { required: false });
    }

    return {
      loadBuildingsRuntimeData: loadBuildingsRuntimeData,
      loadPointsLookup: loadPointsLookup,
      loadIsochronesLookup: loadIsochronesLookup,
    };
  }

  function createPointDataLoader(deps) {
    var allTreesData = null;
    var allStreetLightsData = null;
    var treesDataSource = "none";
    var streetLightsDataSource = "none";
    var treesLoadStarted = false;
    var streetLightsLoadStarted = false;
    var treesGeojsonLoadInFlight = false;
    var streetLightsGeojsonLoadInFlight = false;
    var treesGeojsonLoadPromise = null;
    var streetLightsGeojsonLoadPromise = null;

    function loadTreesIfNeeded(refreshPolicy) {
      var scoreMode = deps.getScoreMode();
      var needsAuthoritativeGeojson = scoreMode === "expanded" && treesDataSource !== "geojson";
      var policy = refreshPolicy || "immediate";
      if (treesGeojsonLoadInFlight) return treesGeojsonLoadPromise || Promise.resolve(null);
      if (
        (treesLoadStarted && treesDataSource !== "lookup") ||
        (allTreesData && !needsAuthoritativeGeojson)
      ) {
        return Promise.resolve(null);
      }
      if (deps.hasGeneratedArtifact("trees") && scoreMode === "weighted") {
        deps.onSkippedTreesGeojson();
        return Promise.resolve(null);
      }

      treesLoadStarted = true;
      treesGeojsonLoadInFlight = true;
      treesGeojsonLoadPromise = deps.fetchJsonWithGzipFallback(deps.urls.trees)
        .then(function (treesData) {
          if (!treesData) throw new Error("Empty tree data");
          allTreesData = treesData;
          treesDataSource = "geojson";
          deps.onPointDataLoaded("trees", treesData, { refreshPolicy: policy });
          return treesData;
        })
        .catch(function (err) {
          deps.onPointDataError("trees", err);
          treesLoadStarted = false;
        })
        .finally(function () {
          treesGeojsonLoadInFlight = false;
          treesGeojsonLoadPromise = null;
        });
      return treesGeojsonLoadPromise;
    }

    function loadStreetLightsIfNeeded(refreshPolicy) {
      var scoreMode = deps.getScoreMode();
      var needsAuthoritativeGeojson =
        scoreMode === "expanded" && streetLightsDataSource !== "geojson";
      var policy = refreshPolicy || "immediate";
      if (streetLightsGeojsonLoadInFlight) {
        return streetLightsGeojsonLoadPromise || Promise.resolve(null);
      }
      if (
        (streetLightsLoadStarted && streetLightsDataSource !== "lookup") ||
        (allStreetLightsData && !needsAuthoritativeGeojson)
      ) {
        return Promise.resolve(null);
      }
      if (deps.hasGeneratedArtifact("street_lights") && scoreMode === "weighted") {
        deps.onSkippedStreetLightsGeojson();
        return Promise.resolve(null);
      }

      streetLightsLoadStarted = true;
      streetLightsGeojsonLoadInFlight = true;
      streetLightsGeojsonLoadPromise = deps.fetchJsonWithGzipFallback(deps.urls.streetLights)
        .then(function (data) {
          if (!data) throw new Error("Empty street light data");
          allStreetLightsData = data;
          streetLightsDataSource = "geojson";
          deps.onPointDataLoaded("street-lights", data, { refreshPolicy: policy });
          return data;
        })
        .catch(function (err) {
          deps.onPointDataError("street-lights", err);
          streetLightsLoadStarted = false;
        })
        .finally(function () {
          streetLightsGeojsonLoadInFlight = false;
          streetLightsGeojsonLoadPromise = null;
        });
      return streetLightsGeojsonLoadPromise;
    }

    function ensureExpandedPointDataLoaded(options) {
      var opts = options || {};
      var loads = [];
      var upgradedKinds = [];
      var currentRefreshPolicy = opts.refreshPolicy || "immediate";
      if (deps.getScoreMode() !== "expanded") return Promise.resolve({ upgradedKinds: [] });
      if (treesDataSource !== "geojson") {
        upgradedKinds.push("trees");
        loads.push(loadTreesIfNeeded(currentRefreshPolicy));
      }
      if (streetLightsDataSource !== "geojson") {
        upgradedKinds.push("street-lights");
        loads.push(loadStreetLightsIfNeeded(currentRefreshPolicy));
      }
      if (loads.length === 0) return Promise.resolve({ upgradedKinds: [] });
      return Promise.all(loads).then(function () {
        return { upgradedKinds: upgradedKinds };
      });
    }

    function canRefreshPointAnalysisAfterPointDataLoad() {
      return (
        deps.getScoreMode() !== "expanded" ||
        (treesDataSource === "geojson" && streetLightsDataSource === "geojson")
      );
    }

    function setPointLookupData(data) {
      var value = data || {};
      if (value.trees) {
        allTreesData = value.trees;
        treesLoadStarted = true;
        treesDataSource = "lookup";
      }
      if (value.streetLights) {
        allStreetLightsData = value.streetLights;
        streetLightsLoadStarted = true;
        streetLightsDataSource = "lookup";
      }
    }

    return {
      loadTreesIfNeeded: loadTreesIfNeeded,
      loadStreetLightsIfNeeded: loadStreetLightsIfNeeded,
      ensureExpandedPointDataLoaded: ensureExpandedPointDataLoaded,
      canRefreshPointAnalysisAfterPointDataLoad: canRefreshPointAnalysisAfterPointDataLoad,
      setPointLookupData: setPointLookupData,
      getAllTreesData: function () { return allTreesData; },
      getAllStreetLightsData: function () { return allStreetLightsData; },
      getTreesDataSource: function () { return treesDataSource; },
      getStreetLightsDataSource: function () { return streetLightsDataSource; },
    };
  }

  window.Urban95RuntimeData = {
    normalizeBuildingLookup: normalizeBuildingLookup,
    featureCollectionFromPointRecords: featureCollectionFromPointRecords,
    compactIsochroneFeature: compactIsochroneFeature,
    hasValidPointsLookupSources: hasValidPointsLookupSources,
    warnIfBuildingScoresIncomplete: warnIfBuildingScoresIncomplete,
    scanAmenityTypesFromFeatures: scanAmenityTypesFromFeatures,
    createLoaders: createLoaders,
    createPointDataLoader: createPointDataLoader,
  };
})();
