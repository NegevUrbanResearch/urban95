(function () {
  var EXCLUDED_CLEAN_POINT_AMENITY_TYPES = new Set(["bicycle_track"]);

  function requireFunction(value, name) {
    if (typeof value !== "function") {
      throw new Error("Urban95PointDataSources.create requires " + name);
    }
    return value;
  }

  function requireString(value, name) {
    if (typeof value !== "string" || !value) {
      throw new Error("Urban95PointDataSources.create requires " + name);
    }
    return value;
  }

  function filterCleanManifestPointFeatures(fc) {
    if (!fc || !Array.isArray(fc.features)) return fc;
    return {
      type: "FeatureCollection",
      features: fc.features.filter(function (feature) {
        var amenityType = (feature.properties && feature.properties.amenity_type) || "";
        return !EXCLUDED_CLEAN_POINT_AMENITY_TYPES.has(amenityType);
      }),
    };
  }

  function create(deps) {
    deps = deps || {};
    var loadPointsLookup = requireFunction(deps.loadPointsLookup, "deps.loadPointsLookup");
    var fetchJsonWithGzipFallback = requireFunction(
      deps.fetchJsonWithGzipFallback,
      "deps.fetchJsonWithGzipFallback"
    );
    var amenitiesCleanUrl = requireString(deps.amenitiesCleanUrl, "deps.amenitiesCleanUrl");
    var amenitiesLegacyUrl = requireString(deps.amenitiesLegacyUrl, "deps.amenitiesLegacyUrl");

    function loadAmenitiesGeojsonFallback() {
      return Promise.all([
        fetchJsonWithGzipFallback(amenitiesCleanUrl, { required: true }),
        fetchJsonWithGzipFallback(amenitiesLegacyUrl, { required: false }),
      ]).then(function (results) {
        return {
          source: "geojson",
          cleanFc: filterCleanManifestPointFeatures(results[0]),
          legacyFc: results[1],
          treesFc: null,
          streetLightsFc: null,
        };
      });
    }

    return {
      loadPointsLookup: loadPointsLookup,
      loadAmenitiesGeojsonFallback: loadAmenitiesGeojsonFallback,
      filterCleanManifestPointFeatures: filterCleanManifestPointFeatures,
    };
  }

  window.Urban95PointDataSources = { create: create };
})();
