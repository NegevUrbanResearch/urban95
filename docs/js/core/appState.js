(function () {
  function copySet(value) {
    if (value instanceof Set) return new Set(value);
    if (Array.isArray(value)) return new Set(value);
    if (value && typeof value.forEach === "function") {
      var result = new Set();
      value.forEach(function (item) {
        result.add(item);
      });
      return result;
    }
    return new Set();
  }

  function copyPercentileSeries(value) {
    if (!value || typeof value !== "object") return value;
    var result = {};
    Object.keys(value).forEach(function (key) {
      result[key] = Array.isArray(value[key]) ? value[key].slice() : value[key];
    });
    return result;
  }

  function copyLayerVisibility(value) {
    return value && typeof value === "object" ? Object.assign({}, value) : {};
  }

  function create() {
    var walkMinutes = 5;
    var scoreMode = "weighted";
    var selectedAmenityTypes = new Set();
    var weightedShownAmenityTypes = new Set();
    var layerVisibility = {};
    var activeHeatmapId = "u95.overall";
    var lastFilterRadioSelection = "all";
    var allFilterTypes = [];
    var amenitiesInRadiusIds = new Set();
    var latestRadiusCounts = {};
    var percentileSeriesCache = new Map();
    var buildingAmenityStatKeyCache = new Map();

    return {
      getWalkMinutes: function () { return walkMinutes; },
      setWalkMinutes: function (value) { walkMinutes = value; },
      getScoreMode: function () { return scoreMode; },
      setScoreMode: function (value) { scoreMode = value; },

      getLayerVisibility: function () { return copyLayerVisibility(layerVisibility); },
      setLayerVisibility: function (value) { layerVisibility = copyLayerVisibility(value); },
      getActiveHeatmapId: function () { return activeHeatmapId; },
      setActiveHeatmapId: function (value) { activeHeatmapId = value || "u95.overall"; },

      getSelectedAmenityTypes: function () { return new Set(selectedAmenityTypes); },
      setSelectedAmenityTypes: function (value) { selectedAmenityTypes = copySet(value); },
      getWeightedShownAmenityTypes: function () { return new Set(weightedShownAmenityTypes); },
      setWeightedShownAmenityTypes: function (value) { weightedShownAmenityTypes = copySet(value); },
      getLastFilterRadioSelection: function () { return lastFilterRadioSelection; },
      setLastFilterRadioSelection: function (value) { lastFilterRadioSelection = value || "all"; },
      getAllFilterTypes: function () { return allFilterTypes.slice(); },
      setAllFilterTypes: function (value) { allFilterTypes = Array.isArray(value) ? value.slice() : []; },
      getAmenitiesInRadiusIds: function () { return new Set(amenitiesInRadiusIds); },
      setAmenitiesInRadiusIds: function (value) { amenitiesInRadiusIds = copySet(value); },
      clearRadiusIds: function () {
        amenitiesInRadiusIds.clear();
      },
      getLatestRadiusCounts: function () { return Object.assign({}, latestRadiusCounts); },
      setLatestRadiusCounts: function (value) {
        latestRadiusCounts = value && typeof value === "object" ? Object.assign({}, value) : {};
      },

      hasPercentileSeries: function (key) { return percentileSeriesCache.has(key); },
      getPercentileSeries: function (key) {
        return copyPercentileSeries(percentileSeriesCache.get(key));
      },
      setPercentileSeries: function (key, value) {
        percentileSeriesCache.set(key, copyPercentileSeries(value));
      },
      getPercentileSeriesCacheSize: function () { return percentileSeriesCache.size; },
      hasBuildingAmenityStatKeys: function (key) { return buildingAmenityStatKeyCache.has(key); },
      getBuildingAmenityStatKeys: function (key) {
        return copySet(buildingAmenityStatKeyCache.get(key));
      },
      setBuildingAmenityStatKeys: function (key, value) {
        buildingAmenityStatKeyCache.set(key, copySet(value));
      },
      getBuildingAmenityStatKeyCacheSize: function () { return buildingAmenityStatKeyCache.size; },
      clearDerivedCaches: function () {
        percentileSeriesCache.clear();
        buildingAmenityStatKeyCache.clear();
      },
    };
  }

  window.Urban95AppState = { create: create };
})();
