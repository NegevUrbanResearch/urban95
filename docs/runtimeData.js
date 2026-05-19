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

  function createLoaders(fetchJsonWithGzipFallback, urls, fallbackUrls) {
    function loadBuildingsRuntimeData() {
      return fetchJsonWithGzipFallback(urls.buildingsLookup, { required: false })
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
          return fetchJsonWithGzipFallback(fallbackUrls.buildings);
        })
        .catch(function () {
          return fetchJsonWithGzipFallback(fallbackUrls.buildings);
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

  window.Urban95RuntimeData = {
    normalizeBuildingLookup: normalizeBuildingLookup,
    featureCollectionFromPointRecords: featureCollectionFromPointRecords,
    compactIsochroneFeature: compactIsochroneFeature,
    createLoaders: createLoaders,
  };
})();
