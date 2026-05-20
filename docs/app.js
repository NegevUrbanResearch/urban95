/* global maplibregl, turf, deck, pmtiles */

const Urban95Config = requireNamespace(window, "Urban95Config");
const GENERATED_ARTIFACTS = requireNamespace(window, "Urban95DataArtifacts");
const CONFIG_URLS = requireNamespaceMember(Urban95Config, "Urban95Config", "urls", "object");
const GENERATED_URLS =
  requireNamespaceMember(GENERATED_ARTIFACTS, "Urban95DataArtifacts", "urls", "object");
const MAP_CONTRACTS = requireNamespaceMember(Urban95Config, "Urban95Config", "mapContracts", "object");
const ICONS_BASE = requireNamespaceMember(Urban95Config, "Urban95Config", "ICONS_BASE");
const BUILDINGS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "buildings");
const BUILDINGS_LOOKUP_URL = requireStringMember(GENERATED_URLS, "Urban95DataArtifacts.urls", "buildingsLookup");
const PARKS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "parks");
const TREES_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "trees");
const STREET_LIGHTS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "streetLights");
const AMENITIES_CLEAN_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "amenitiesClean");
const AMENITIES_LEGACY_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "amenitiesLegacy");
const ISOCHRONES_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "isochrones");
const ISOCHRONES_LOOKUP_URL = requireStringMember(GENERATED_URLS, "Urban95DataArtifacts.urls", "isochronesLookup");
const POINTS_LOOKUP_URL = requireStringMember(GENERATED_URLS, "Urban95DataArtifacts.urls", "pointsLookup");
const NEIGHBORHOODS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "neighborhoods");
const NEIGHBORHOOD_SURFACE_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "neighborhoodSurface");
const BUILDINGS_PMTILES_URL = requireStringMember(GENERATED_URLS, "Urban95DataArtifacts.urls", "buildingsPmtiles");
const NEIGHBORHOOD_SURFACE_PMTILES_URL =
  requireStringMember(GENERATED_URLS, "Urban95DataArtifacts.urls", "neighborhoodSurfacePmtiles");
const TREES_PMTILES_URL = requireStringMember(GENERATED_URLS, "Urban95DataArtifacts.urls", "treesPmtiles");
const STREET_LIGHTS_PMTILES_URL =
  requireStringMember(GENERATED_URLS, "Urban95DataArtifacts.urls", "streetLightsPmtiles");
const NEIGHBORHOOD_CHARTS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "neighborhoodCharts");
const CITYWIDE_STATS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "citywideStats");
const NEIGHBORHOOD_SURFACE_SOURCE_LAYER_FALLBACK =
  requireStringMember(MAP_CONTRACTS, "Urban95Config.mapContracts", "neighborhoodSurfaceSourceLayerFallback");
const hasGeneratedArtifact =
  requireNamespaceMember(GENERATED_ARTIFACTS, "Urban95DataArtifacts", "hasGeneratedArtifact", "function");
const sourceLayer =
  requireNamespaceMember(GENERATED_ARTIFACTS, "Urban95DataArtifacts", "sourceLayer", "function");
const vectorSourceOrGeojson =
  requireNamespaceMember(GENERATED_ARTIFACTS, "Urban95DataArtifacts", "vectorSourceOrGeojson", "function");

function requireNamespace(rootObject, namespacePath) {
  const value = rootObject && rootObject[namespacePath];
  if (!value || typeof value !== "object") {
    throw new Error("window." + namespacePath + " is required before docs/app.js");
  }
  return value;
}

function requireNamespaceMember(namespaceObject, namespaceName, memberName, expectedType) {
  if (!(memberName in namespaceObject) || namespaceObject[memberName] === undefined) {
    throw new Error(namespaceName + "." + memberName + " is required before docs/app.js");
  }
  if (expectedType && typeof namespaceObject[memberName] !== expectedType) {
    throw new Error(
      namespaceName + "." + memberName + " must be a " + expectedType + " before docs/app.js"
    );
  }
  return namespaceObject[memberName];
}

function requireStringMember(namespaceObject, namespaceName, memberName) {
  return requireNamespaceMember(namespaceObject, namespaceName, memberName, "string");
}

function requireScoreModelMember(scoreModel, memberName) {
  return requireNamespaceMember(scoreModel, "Urban95ScoreModel", memberName);
}

const Urban95Loaders = requireNamespace(window, "Urban95Loaders");
const fetchJsonWithGzipFallback =
  requireNamespaceMember(
    Urban95Loaders,
    "Urban95Loaders",
    "fetchJsonWithGzipFallback",
    "function"
  );
const ensureDeckGlLoaded =
  requireNamespaceMember(Urban95Loaders, "Urban95Loaders", "ensureDeckGlLoaded", "function");
const ensureChartJsLoaded =
  requireNamespaceMember(Urban95Loaders, "Urban95Loaders", "ensureChartJsLoaded", "function");

const urban95RuntimeData = requireNamespace(window, "Urban95RuntimeData");
const createRuntimeLoaders =
  requireNamespaceMember(urban95RuntimeData, "Urban95RuntimeData", "createLoaders", "function");
const compactIsochroneFeature =
  requireNamespaceMember(urban95RuntimeData, "Urban95RuntimeData", "compactIsochroneFeature", "function");
const featureCollectionFromPointRecords =
  requireNamespaceMember(urban95RuntimeData, "Urban95RuntimeData", "featureCollectionFromPointRecords", "function");
const hasValidPointsLookupSources =
  requireNamespaceMember(urban95RuntimeData, "Urban95RuntimeData", "hasValidPointsLookupSources", "function");
const warnIfBuildingScoresIncomplete =
  requireNamespaceMember(urban95RuntimeData, "Urban95RuntimeData", "warnIfBuildingScoresIncomplete", "function");
const scanAmenityTypesFromFeatures =
  requireNamespaceMember(urban95RuntimeData, "Urban95RuntimeData", "scanAmenityTypesFromFeatures", "function");
const createPointDataLoader =
  requireNamespaceMember(urban95RuntimeData, "Urban95RuntimeData", "createPointDataLoader", "function");

const urban95RuntimeLoaders =
  createRuntimeLoaders(fetchJsonWithGzipFallback, {
      buildingsLookup: BUILDINGS_LOOKUP_URL,
      isochronesLookup: ISOCHRONES_LOOKUP_URL,
      pointsLookup: POINTS_LOOKUP_URL,
      buildingsPmtiles: BUILDINGS_PMTILES_URL,
      neighborhoodSurfacePmtiles: NEIGHBORHOOD_SURFACE_PMTILES_URL,
      treesPmtiles: TREES_PMTILES_URL,
      streetLightsPmtiles: STREET_LIGHTS_PMTILES_URL,
    }, {
      buildings: BUILDINGS_URL,
      isochrones: ISOCHRONES_URL,
      amenitiesClean: AMENITIES_CLEAN_URL,
      amenitiesLegacy: AMENITIES_LEGACY_URL,
    });

const Urban95ScoreModel = requireNamespace(window, "Urban95ScoreModel");
const AMENITY_TYPE_CONFIG = requireScoreModelMember(Urban95ScoreModel, "AMENITY_TYPE_CONFIG");
const DEFAULT_CONFIG = requireScoreModelMember(Urban95ScoreModel, "DEFAULT_CONFIG");
const CLEAN_WEIGHTS = requireScoreModelMember(Urban95ScoreModel, "CLEAN_WEIGHTS");
const CLEAN_SCORE_COMPONENTS = requireScoreModelMember(Urban95ScoreModel, "CLEAN_SCORE_COMPONENTS");
const WEIGHTED_CATEGORY_COMPONENTS = requireScoreModelMember(Urban95ScoreModel, "WEIGHTED_CATEGORY_COMPONENTS");
const WEIGHTED_CATEGORY_BY_STEM = requireScoreModelMember(Urban95ScoreModel, "WEIGHTED_CATEGORY_BY_STEM");
const WEIGHTED_SUBCATEGORY_COMPONENTS = requireScoreModelMember(Urban95ScoreModel, "WEIGHTED_SUBCATEGORY_COMPONENTS");
const WEIGHTED_CATEGORY_LABEL_BY_STEM = requireScoreModelMember(Urban95ScoreModel, "WEIGHTED_CATEGORY_LABEL_BY_STEM");
const getAmenityConfig = requireScoreModelMember(Urban95ScoreModel, "getAmenityConfig");
const amenityTypeToBuildingStatKey =
  requireScoreModelMember(Urban95ScoreModel, "amenityTypeToBuildingStatKey");
const getExpandedContributionForType =
  requireScoreModelMember(Urban95ScoreModel, "getExpandedContributionForType");
const getFilteredContributionForType =
  requireScoreModelMember(Urban95ScoreModel, "getFilteredContributionForType");
const percentileBreakpoints = requireScoreModelMember(Urban95ScoreModel, "percentileBreakpoints");
const buildHistogramDistributionFromScores =
  requireScoreModelMember(Urban95ScoreModel, "buildHistogramDistributionFromScores");
const getColorForValue = requireScoreModelMember(Urban95ScoreModel, "getColorForValue");
const computePercentileRank = requireScoreModelMember(Urban95ScoreModel, "computePercentileRank");
const bulkPercentileRanks = requireScoreModelMember(Urban95ScoreModel, "bulkPercentileRanks");
const formatMetricNumber = requireScoreModelMember(Urban95ScoreModel, "formatMetricNumber");
const formatScoreInteger = requireScoreModelMember(Urban95ScoreModel, "formatScoreInteger");
const weightedCategoryHighlightsFromSource =
  requireScoreModelMember(Urban95ScoreModel, "weightedCategoryHighlightsFromSource");
const weightedSubcategoryComparisonRows =
  requireScoreModelMember(Urban95ScoreModel, "weightedSubcategoryComparisonRows");
const Urban95MapLayers = requireNamespace(window, "Urban95MapLayers");
const resolveBuildingContracts =
  requireNamespaceMember(
    Urban95MapLayers,
    "Urban95MapLayers",
    "resolveBuildingContracts",
    "function"
  );
const createPmtilesProtocol =
  requireNamespaceMember(
    Urban95MapLayers,
    "Urban95MapLayers",
    "createPmtilesProtocol",
    "function"
  );
const createBuildingsSource =
  requireNamespaceMember(
    Urban95MapLayers,
    "Urban95MapLayers",
    "createBuildingsSource",
    "function"
  );
const createBuildingsFillLayer =
  requireNamespaceMember(
    Urban95MapLayers,
    "Urban95MapLayers",
    "createBuildingsFillLayer",
    "function"
  );
const createBuildingsSelectedLayer =
  requireNamespaceMember(
    Urban95MapLayers,
    "Urban95MapLayers",
    "createBuildingsSelectedLayer",
    "function"
  );
const applyParkDotPattern =
  requireNamespaceMember(
    Urban95MapLayers,
    "Urban95MapLayers",
    "applyParkDotPattern",
    "function"
  );
const Urban95ScoreSidebar = requireNamespace(window, "Urban95ScoreSidebar");
requireNamespaceMember(Urban95ScoreSidebar, "Urban95ScoreSidebar", "configure", "function");
requireNamespaceMember(Urban95ScoreSidebar, "Urban95ScoreSidebar", "show", "function");
requireNamespaceMember(Urban95ScoreSidebar, "Urban95ScoreSidebar", "hide", "function");
requireNamespaceMember(Urban95ScoreSidebar, "Urban95ScoreSidebar", "sync", "function");
requireNamespaceMember(Urban95ScoreSidebar, "Urban95ScoreSidebar", "isOpen", "function");
const Urban95InfoModal = requireNamespace(window, "Urban95InfoModal");
requireNamespaceMember(Urban95InfoModal, "Urban95InfoModal", "bind", "function");
const Urban95Dashboards = requireNamespace(window, "Urban95Dashboards");
requireNamespaceMember(Urban95Dashboards, "Urban95Dashboards", "configure", "function");
requireNamespaceMember(
  Urban95Dashboards,
  "Urban95Dashboards",
  "renderCitywideModal",
  "function"
);
requireNamespaceMember(
  Urban95Dashboards,
  "Urban95Dashboards",
  "updateCitywideModalTitle",
  "function"
);
requireNamespaceMember(
  Urban95Dashboards,
  "Urban95Dashboards",
  "hideNeighborhoodModal",
  "function"
);
requireNamespaceMember(
  Urban95Dashboards,
  "Urban95Dashboards",
  "hideCitywideModal",
  "function"
);
requireNamespaceMember(Urban95Dashboards, "Urban95Dashboards", "loadNeighborhoods", "function");
requireNamespaceMember(
  Urban95Dashboards,
  "Urban95Dashboards",
  "loadNeighborhoodSurfaceData",
  "function"
);
requireNamespaceMember(
  Urban95Dashboards,
  "Urban95Dashboards",
  "loadNeighborhoodChartsPayload",
  "function"
);
requireNamespaceMember(Urban95Dashboards, "Urban95Dashboards", "loadCitywideStats", "function");
requireNamespaceMember(
  Urban95Dashboards,
  "Urban95Dashboards",
  "getNeighborhoodFeatureAtPoint",
  "function"
);
requireNamespaceMember(
  Urban95Dashboards,
  "Urban95Dashboards",
  "showNeighborhoodAreaTooltip",
  "function"
);
requireNamespaceMember(
  Urban95Dashboards,
  "Urban95Dashboards",
  "getNeighborhoodHexSurfaceOpacityExpression",
  "function"
);
requireNamespaceMember(Urban95Dashboards, "Urban95Dashboards", "showCitywideModal", "function");
requireNamespaceMember(Urban95Dashboards, "Urban95Dashboards", "showNeighborhoodModal", "function");
const Urban95MapRenderers = requireNamespace(window, "Urban95MapRenderers");
[
  "configure",
  "setLayerVisibilityIfPresent",
  "setLayerVisibility",
  "resetPointHoverState",
  "setTreesVisibility",
  "setStreetLightsVisibility",
  "setTreesAndLightsVisibility",
  "bindPointHoverLayer",
  "applyShowPointsToggle",
  "updateAmenitiesSource",
  "updateTreesSource",
  "updateStreetLightsSource",
  "addAmenityLayers",
  "buildAmenityIconAtlas",
  "clusterVisibleAmenities",
  "updateDeckAmenityLayers",
  "scheduleDeckUpdate",
  "initDeckAmenityOverlay",
  "updateBuildingColors",
  "updateAccessibilityLegendLabels",
  "updateNeighborhoodSurfaceData",
  "updateNeighborhoodColors",
].forEach(function (memberName) {
  requireNamespaceMember(Urban95MapRenderers, "Urban95MapRenderers", memberName, "function");
});
const Urban95Selection = requireNamespace(window, "Urban95Selection");
[
  "configure",
  "setSelectedBuildingVectorState",
  "getBuildingCentroidGridKey",
  "buildBuildingCentroidGridIndex",
  "getClosestBuildingCandidates",
  "findClosestBuilding",
  "loadIsochrones",
  "getIsochrone",
  "isCoordinateInsidePolygon",
  "getItemsInPolygon",
  "easeInOutQuad",
  "selectBuilding",
  "updateRadiusInfo",
  "clearRadiusSelection",
  "buildUrban95ReferenceRadius",
].forEach(function (memberName) {
  requireNamespaceMember(Urban95Selection, "Urban95Selection", memberName, "function");
});
const Urban95Controls = requireNamespace(window, "Urban95Controls");
requireNamespaceMember(Urban95Controls, "Urban95Controls", "bind", "function");
const Urban95AppState = requireNamespace(window, "Urban95AppState");
const createAppState =
  requireNamespaceMember(Urban95AppState, "Urban95AppState", "create", "function");
const appState = createAppState();

function getScoreModeState() {
  return appState.getScoreMode();
}

function setScoreModeState(value) {
  appState.setScoreMode(value);
}

function getWalkMinutesState() {
  return appState.getWalkMinutes();
}

function setWalkMinutesState(value) {
  appState.setWalkMinutes(value);
}

function getSelectedAmenityTypesState() {
  return appState.getSelectedAmenityTypes();
}

function setSelectedAmenityTypesState(value) {
  appState.setSelectedAmenityTypes(value);
}

function getAllFilterTypesState() {
  return appState.getAllFilterTypes();
}

function setAllFilterTypesState(value) {
  appState.setAllFilterTypes(value);
}

function getAmenitiesInRadiusIdsState() {
  return appState.getAmenitiesInRadiusIds();
}

function setAmenitiesInRadiusIdsState(value) {
  appState.setAmenitiesInRadiusIds(value);
}

function clearRadiusIdsState() {
  appState.clearRadiusIds();
}

function getLatestRadiusCountsState() {
  return appState.getLatestRadiusCounts();
}

function setLatestRadiusCountsState(value) {
  appState.setLatestRadiusCounts(value);
}

function getLastFilterRadioSelectionState() {
  return appState.getLastFilterRadioSelection();
}

function setLastFilterRadioSelectionState(value) {
  appState.setLastFilterRadioSelection(value);
}

function hasPercentileSeriesState(key) {
  return appState.hasPercentileSeries(key);
}

function getPercentileSeriesState(key) {
  return appState.getPercentileSeries(key);
}

function setPercentileSeriesState(key, value) {
  appState.setPercentileSeries(key, value);
}

function hasBuildingAmenityStatKeysState(key) {
  return appState.hasBuildingAmenityStatKeys(key);
}

function getBuildingAmenityStatKeysState(key) {
  return appState.getBuildingAmenityStatKeys(key);
}

function setBuildingAmenityStatKeysState(key, value) {
  appState.setBuildingAmenityStatKeys(key, value);
}

function clearDerivedCachesState() {
  appState.clearDerivedCaches();
}
const BUILDING_LAYER_CONTRACTS = resolveBuildingContracts({
  config: Urban95Config,
  artifacts: GENERATED_ARTIFACTS,
});
const _urban95PmtilesProtocol = createPmtilesProtocol();
if (_urban95PmtilesProtocol) maplibregl.addProtocol("pmtiles", _urban95PmtilesProtocol.tile);

const BUILDINGS_MAP_SOURCE_ID = BUILDING_LAYER_CONTRACTS.sourceId;
const BUILDINGS_FILL_LAYER_ID = BUILDING_LAYER_CONTRACTS.fillLayerId;
const BUILDINGS_SELECTED_LAYER_ID = BUILDING_LAYER_CONTRACTS.selectedLayerId;
const BUILDINGS_VECTOR_LAYER_ID = BUILDING_LAYER_CONTRACTS.vectorLayerId;
const BUILDINGS_SYM_PCT_STATE_KEY = BUILDING_LAYER_CONTRACTS.symPctStateKey;
const BUILDINGS_SELECTED_STATE_KEY = BUILDING_LAYER_CONTRACTS.selectedStateKey;
const BUILDINGS_CHOROPLETH_FILL_COLOR_EXPR = BUILDING_LAYER_CONTRACTS.fillColorExpression;
const _urban95BuildingsSource = createBuildingsSource({
  artifacts: GENERATED_ARTIFACTS,
  buildingsPmtilesPath: BUILDINGS_PMTILES_URL,
});
const _urban95BuildingsFillLayer = createBuildingsFillLayer({
  layerId: BUILDINGS_FILL_LAYER_ID,
  sourceId: BUILDINGS_MAP_SOURCE_ID,
  sourceLayer: hasGeneratedArtifact("buildings") ? BUILDINGS_VECTOR_LAYER_ID : undefined,
  fillColorExpression: BUILDINGS_CHOROPLETH_FILL_COLOR_EXPR,
});
const _urban95BuildingsSelectedLayer = createBuildingsSelectedLayer({
  layerId: BUILDINGS_SELECTED_LAYER_ID,
  sourceId: BUILDINGS_MAP_SOURCE_ID,
  sourceLayer: hasGeneratedArtifact("buildings") ? BUILDINGS_VECTOR_LAYER_ID : undefined,
  selectedStateKey: BUILDINGS_SELECTED_STATE_KEY,
});

function getCurrentScoreModelContext(overrides) {
  return Object.assign(
    {
      fixedMinutes: URBAN95_FIXED_MINUTES,
      currentMode: currentMode,
      selectedAmenityTypes: Array.from(getSelectedAmenityTypesState()),
      allFilterTypes: getAllFilterTypesState(),
    },
    overrides || {}
  );
}

function getCurrentBuildingCleanFilteredScore(props, minutes) {
  return Urban95ScoreModel.getBuildingCleanFilteredScore(
    props,
    minutes,
    Array.from(getSelectedAmenityTypesState()),
    getAllFilterTypesState(),
    currentMode
  );
}

function getCurrentBuildingOverallScore(props, minutes) {
  return Urban95ScoreModel.getBuildingOverallScore(
    props,
    minutes,
    getScoreModeState(),
    getCurrentScoreModelContext()
  );
}

function collectCurrentBuildingScores() {
  if (!buildingsData || !buildingsData.features || buildingsData.features.length === 0) return [];
  if (getSelectedAmenityTypesState().size === 0 || getAllFilterTypesState().length === 0) return [];
  return Urban95ScoreModel.collectBuildingScores(
    buildingsData,
    getWalkMinutesState(),
    function (props, minutes) {
      return getCurrentBuildingOverallScore(props, minutes);
    }
  );
}

function getWeightedAverageValueFromCurrentSelection(source, sfx) {
  return Urban95ScoreModel.getWeightedAverageValueFromSource(
    source,
    sfx,
    getSelectedWeightedCategoryStem()
  );
}

function weightedNeighborhoodRankingRowsForCurrentSelection(stats, sfx) {
  return Urban95ScoreModel.weightedNeighborhoodRankingRows(
    stats,
    sfx,
    getSelectedWeightedCategoryStem()
  );
}

function getCitywideWeightedAverageScoreForCurrentSelection(stats, sfx) {
  return Urban95ScoreModel.getCitywideWeightedAverageScore(stats, sfx, getCurrentScoreModelContext({
    selectedStem: getSelectedWeightedCategoryStem(),
    buildingsData: buildingsData,
  }));
}

function getCurrentPercentileSeriesCacheKey(minutes) {
  return Urban95ScoreModel.getPercentileSeriesCacheKey(minutes, getCurrentScoreModelContext({
    scoreMode: getScoreModeState(),
  }));
}

function getCurrentBuildingAmenityStatKeysForMinutes(minutes) {
  const cacheKey = String(minutes);
  if (hasBuildingAmenityStatKeysState(cacheKey)) {
    return getBuildingAmenityStatKeysState(cacheKey);
  }
  const keys = Urban95ScoreModel.getBuildingAmenityStatKeysForMinutes(minutes, buildingsData, null);
  setBuildingAmenityStatKeysState(cacheKey, keys);
  return keys;
}

function loadPointsLookup() {
  return urban95RuntimeLoaders.loadPointsLookup();
}

function loadAmenitiesGeojsonFallback() {
  return Promise.all([
    fetchJsonWithGzipFallback(AMENITIES_CLEAN_URL, { required: true }),
    fetchJsonWithGzipFallback(AMENITIES_LEGACY_URL, { required: false })
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

/** Dev profiling: add ?perf=1 or localStorage urban95_perf=1 — records phase timings (see floating panel). */
const urban95Perf = window.urban95Perf;

const EXCLUDED_CLEAN_POINT_AMENITY_TYPES = new Set(["bicycle_track"]);

function filterCleanManifestPointFeatures(fc) {
  if (!fc || !Array.isArray(fc.features)) return fc;
  return {
    type: "FeatureCollection",
    features: fc.features.filter(function (f) {
      const t = (f.properties && f.properties.amenity_type) || "";
      return !EXCLUDED_CLEAN_POINT_AMENITY_TYPES.has(t);
    }),
  };
}

const SCORE_EXPLAIN_WEIGHTED_CATEGORY_ICONS = {
  environmental_quality: "garden",
  nature: "park",
  play: "playground",
  safety_mobility: "bus",
  family_services: "heart",
};

const SCORE_EXPLAIN_WEIGHTED_SUB_ICONS = {
  shade: "park-alt1",
  trees: "park-alt1",
  roads: "road-accident",
  parks: "park",
  playgrounds: "playground",
  street_lights: "lighthouse",
  bicycle_access: "bicycle",
  bus_stops: "bus",
  shelters: "shelter",
  education: "school",
  community: "town-hall",
  business: "shop",
  health: "hospital",
};

const SCORE_EXPLAIN_CLEAN_ICON_BY_KEY = {
  trees: "park-alt1",
  parks: "park",
  playgrounds: "playground",
  health: "hospital",
  education: "school",
  bus_stops: "bus",
  shelters: "shelter",
  "community-centers": "town-hall",
  businesscenters: "shop",
  "street-lights": "lighthouse",
};

const SCORE_EXPLAIN_ROW_ICON_BY_LABEL = {
  "Amenity POIs (count)": "shop",
  "Trees (×¼)": "park-alt1",
  "Street lights (×¼)": "lighthouse",
  "Trees (weighted)": "park-alt1",
  "Other manifest-weighted": "marker",
};

function getWeightedCategoryIcon(stem) {
  return SCORE_EXPLAIN_WEIGHTED_CATEGORY_ICONS[stem] || "marker";
}

function getWeightedSubcategoryIcon(stem) {
  return SCORE_EXPLAIN_WEIGHTED_SUB_ICONS[stem] || "marker";
}

function getCleanComponentIcon(key) {
  return SCORE_EXPLAIN_CLEAN_ICON_BY_KEY[key] || "marker";
}

function getScoreExplainRowIcon(row) {
  if (!row) return "marker";
  if (row.icon) return row.icon;
  if (row.amenityType) return getAmenityConfig(row.amenityType).icon;
  if (row.cleanKey) return getCleanComponentIcon(row.cleanKey);
  if (row.weightedStem) return getWeightedCategoryIcon(row.weightedStem);
  if (row.weightedSubStem) return getWeightedSubcategoryIcon(row.weightedSubStem);
  return SCORE_EXPLAIN_ROW_ICON_BY_LABEL[row.label] || "marker";
}

function renderHorizonIcon(iconName, color) {
  const name = iconName || "marker";
  const iconColor = color || "#64748b";
  const url = ICONS_BASE + "/" + encodeURIComponent(name) + ".svg";
  return (
    '<span class="horizon-icon" role="img" aria-hidden="true" style="--horizon-icon-color:' +
    escapeHtml(iconColor) +
    ";--horizon-icon-url:url('" +
    url +
    "')\"></span>"
  );
}

const SCORE_EXPLAIN_ICON_NEUTRAL = "#0f172a";

function getScoreExplainRowIconColor(row, barColor) {
  if (!row) return SCORE_EXPLAIN_ICON_NEUTRAL;
  if (getScoreModeState() === "weighted" && !row.amenityType && !row.cleanKey) return barColor || "#64748b";
  return SCORE_EXPLAIN_ICON_NEUTRAL;
}

function getScoreExplainPartialFilterSet() {
  if (getSelectedAmenityTypesState().size === 0 || getSelectedAmenityTypesState().size === getAllFilterTypesState().length) return null;
  return getSelectedAmenityTypesState();
}

function isScoreExplainRowFilterHighlighted(row) {
  const active = getScoreExplainPartialFilterSet();
  if (!active || !row) return false;
  if (row.amenityType) return active.has(row.amenityType);
  if (row.cleanKey) {
    let hit = false;
    active.forEach(function (t) {
      if (filterTypeToCleanWeightKey(t) === row.cleanKey) hit = true;
    });
    return hit;
  }
  if (row.label === "Trees (×¼)" || row.label === "Trees (weighted)") return active.has("trees");
  if (row.label === "Street lights (×¼)") return active.has("street-lights");
  return false;
}

function isScoreExplainCategoryFilterHighlighted(cat) {
  const active = getScoreExplainPartialFilterSet();
  if (!active || !cat) return false;
  return active.has(cat.stem);
}

function parseColorChannels(color) {
  const s = String(color || "").trim();
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  let h = s.startsWith("#") ? s.slice(1) : s;
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length === 6 && /^[0-9a-f]+$/i.test(h)) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return [37, 99, 235];
}

function channelsToCss(channels) {
  return "rgb(" + channels[0] + "," + channels[1] + "," + channels[2] + ")";
}

function mixChannels(channels, whiteMix) {
  const w = Math.min(1, Math.max(0, whiteMix));
  return channels.map(function (c) {
    return Math.round(c + (255 - c) * w);
  });
}

function mixColorWithWhite(color, whiteMix) {
  return channelsToCss(mixChannels(parseColorChannels(color), whiteMix));
}

function horizonBarFillStyle(baseColor, widthPct) {
  const base = parseColorChannels(baseColor || "#2563eb");
  const light = channelsToCss(mixChannels(base, 0.45));
  const full = channelsToCss(base);
  return "width:" + widthPct + "%;background:linear-gradient(90deg," + light + " 0%," + full + " 100%)";
}

function horizonSubBarFillStyle(parentColor, widthPct, subIndex, subCount) {
  const base = parseColorChannels(parentColor || "#2563eb");
  const n = Math.max(1, subCount);
  const idx = Math.max(0, Math.min(subIndex, n - 1));
  const subMix = n === 1 ? 0.32 : 0.5 - (idx / (n - 1)) * 0.28;
  const sub = mixChannels(base, subMix);
  const light = mixChannels(sub, 0.18);
  return (
    "width:" +
    widthPct +
    "%;background:linear-gradient(90deg," +
    channelsToCss(light) +
    " 0%," +
    channelsToCss(sub) +
    " 100%)"
  );
}

function renderHorizonLabelCell(label, iconName, weightTagHtml, labelColor, opts) {
  opts = opts || {};
  const iconColor =
    opts.iconColor != null ? opts.iconColor : labelColor != null ? labelColor : "#64748b";
  const colorLabelText = opts.colorLabelText !== false && labelColor != null && labelColor !== "";
  let html = '<span class="horizon-label"';
  if (colorLabelText) html += ' style="color:' + escapeHtml(labelColor) + '"';
  html += ">";
  html += '<span class="horizon-label-top">';
  html += renderHorizonIcon(iconName, iconColor);
  html += '<span class="horizon-label-text">' + escapeHtml(label) + "</span>";
  html += "</span>";
  if (weightTagHtml) html += weightTagHtml;
  html += "</span>";
  return html;
}

function renderHorizonSubLabelCell(label, iconName, color) {
  const iconColor = color != null && color !== "" ? color : SCORE_EXPLAIN_ICON_NEUTRAL;
  let html = '<span class="horizon-sub-label"';
  if (color != null && color !== "") html += ' style="color:' + escapeHtml(color) + '"';
  html += ">";
  html += '<span class="horizon-label-top">';
  html += renderHorizonIcon(iconName, iconColor);
  html += '<span class="horizon-label-text">' + escapeHtml(label) + "</span>";
  html += "</span></span>";
  return html;
}

function getSelectedWeightedCategoryStem() {
  if (getScoreModeState() !== "weighted") return null;
  if (getSelectedAmenityTypesState().size !== 1) return null;
  const stem = Array.from(getSelectedAmenityTypesState())[0];
  return WEIGHTED_CATEGORY_BY_STEM[stem] ? stem : null;
}

function getSelectedWeightedCategoryLabel() {
  const stem = getSelectedWeightedCategoryStem();
  if (!stem) return "Urban95";
  const comp = WEIGHTED_CATEGORY_BY_STEM[stem];
  return comp ? comp.label : "Urban95";
}

function buildFilteredFormulaLine(useAll) {
  if (!useAll) {
    return "Partial score (default manifest) = sum of manifest point contributions for each category you selected (from precomputed clean_pts_* columns when available).";
  }
  const terms = CLEAN_SCORE_COMPONENTS.map(function (c) {
    const w = CLEAN_WEIGHTS[c.key];
    return w + " × (" + c.shortTag + ")";
  });
  return (
    "Default score = " +
    terms.join(" + ")
  );
}

function fillExplainSeries(series, feats, minutes) {
  const explain = {};
  const explainAmenity = {};
  const sfx = "_" + minutes + "min";
  const useAll = currentMode !== "house" || getSelectedAmenityTypesState().size === getAllFilterTypesState().length;
  const activeTypes = useAll ? getAllFilterTypesState() : Array.from(getSelectedAmenityTypesState());

  const pushMetric = function (id, fn) {
    const arr = [];
    feats.forEach(function (f) {
      arr.push(fn(f.properties || {}));
    });
    explain[id] = arr;
  };

  if (getScoreModeState() === "weighted") {
    series.explain = explain;
    series.explainAmenity = explainAmenity;
    return;
  }

  if (getScoreModeState() === "clean") {
    if (useAll) {
      const sample = feats.length > 0 ? feats[0].properties || {} : {};
      if (hasCleanPtsBreakdown(sample, minutes)) {
        CLEAN_SCORE_COMPONENTS.forEach(function (c) {
          const col = cleanPtsPropertyName(c.key, minutes);
          const mid = "flt_pts_" + c.key.replace(/-/g, "_");
          pushMetric(mid, function (p) {
            return Number(p[col]) || 0;
          });
        });
      } else {
        pushMetric("flt_tree_w", function (p) {
          return CLEAN_WEIGHTS.trees * (Number(p["num_trees" + sfx]) || 0);
        });
        pushMetric("flt_rest", function (p) {
          const sc = Number(p["score_clean" + sfx]) || 0;
          const tw = CLEAN_WEIGHTS.trees * (Number(p["num_trees" + sfx]) || 0);
          return sc - tw;
        });
      }
    } else {
      activeTypes.forEach(function (type) {
        const id = "flt_sel_" + type;
        pushMetric(id, function (p) {
          return getFilteredContributionForType(p, minutes, type);
        });
      });
    }
  } else {
    if (useAll) {
      pushMetric("exp_amen", function (p) {
        return Number(p["num_amenities" + sfx]) || 0;
      });
      pushMetric("exp_tree_w", function (p) {
        return (Number(p["num_trees" + sfx]) || 0) * 0.25;
      });
      pushMetric("exp_sl_w", function (p) {
        return (Number(p["num_street_lights" + sfx]) || 0) * 0.25;
      });
      const amenTypes = getAllFilterTypesState().filter(function (t) {
        return t !== "trees" && t !== "street-lights";
      });
      amenTypes.forEach(function (t) {
        const statKey = amenityTypeToBuildingStatKey(t);
        const id = "exp_amen_" + statKey;
        explainAmenity[id] = [];
      });
      feats.forEach(function (f) {
        const p = f.properties || {};
        amenTypes.forEach(function (t) {
          const statKey = amenityTypeToBuildingStatKey(t);
          const id = "exp_amen_" + statKey;
          explainAmenity[id].push(Number(p["amen_" + statKey + sfx]) || 0);
        });
      });
    } else {
      activeTypes.forEach(function (type) {
        const id = "exp_sel_" + type;
        pushMetric(id, function (p) {
          return getExpandedContributionForType(p, minutes, type);
        });
      });
    }
  }

  series.explain = explain;
  series.explainAmenity = explainAmenity;
}

// Calculate appropriate zoom level to fit a GeoJSON polygon in the viewport
function getZoomForPolygon(polygon) {
  const bbox = turf.bbox(polygon);
  const sw = [bbox[0], bbox[1]];
  const ne = [bbox[2], bbox[3]];
  const dLng = ne[0] - sw[0];
  const dLat = ne[1] - sw[1];
  const maxSpan = Math.max(dLng, dLat);
  if (maxSpan <= 0) return 15;
  // Rough degrees-to-zoom: at zoom 15, ~0.01 deg is visible in viewport
  const zoom = Math.log2(0.01 / maxSpan) + 15;
  return Math.min(Math.max(zoom, 12), 18);
}

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      osm: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap © CARTO",
      },
      [BUILDINGS_MAP_SOURCE_ID]: _urban95BuildingsSource,
      parks: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      "radius-circle": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      "selected-building": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      amenities: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
      trees: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
      "trees-vector": vectorSourceOrGeojson("trees", TREES_PMTILES_URL),
      "street-lights": {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
      "street-lights-vector": vectorSourceOrGeojson("street_lights", STREET_LIGHTS_PMTILES_URL),
      neighborhoods: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
      "neighborhood-score-surface": vectorSourceOrGeojson(
        "neighborhood_surface",
        NEIGHBORHOOD_SURFACE_PMTILES_URL
      ),
    },
    layers: [
      { id: "osm", type: "raster", source: "osm" },
      {
        id: "parks-fill",
        type: "fill",
        source: "parks",
        paint: {
          "fill-color": "rgba(204, 251, 241, 0)",
          "fill-opacity": 0.5,
          "fill-outline-color": "rgba(15, 118, 110, 0.16)"
        },
        layout: { visibility: "visible" },
      },
      _urban95BuildingsFillLayer,
      ...(hasGeneratedArtifact("buildings") ? [_urban95BuildingsSelectedLayer] : []),
      {
        id: "radius-circle-fill",
        type: "fill",
        source: "radius-circle",
        paint: {
          "fill-color": "#3b82f6",
          "fill-opacity": 0.15,
        },
      },
      {
        id: "radius-circle-line",
        type: "line",
        source: "radius-circle",
        paint: {
          "line-color": "#3b82f6",
          "line-width": 2,
          "line-dasharray": [4, 2],
        },
      },
      {
        id: "selected-building-outline",
        type: "line",
        source: "selected-building",
        paint: {
          "line-color": "#3b82f6",
          "line-width": 3,
        },
      },
    ],
  },
  center: [34.794, 31.252],
  zoom: 14,
});

map.addControl(new maplibregl.NavigationControl(), "top-right");

const filterBtn = document.getElementById("filter-btn");
const filterPopup = document.getElementById("filter-popup");
const filterLabel = document.getElementById("filter-label");
const filterItems = document.getElementById("filter-items");
const filterBackdrop = document.getElementById("filter-backdrop");
const amenityFilterSection = document.getElementById("amenity-filter-section");
const radiusSection = document.getElementById("radius-section");
const legendLabels = document.getElementById("legend-labels");

const SYM_PCT_KEY = "_u95_symb_pct";
const tooltip = document.getElementById("tooltip");
const radiusToggle = document.getElementById("radius-toggle");
const showTreesToggle = document.getElementById("show-trees-toggle");
const showLightsToggle = document.getElementById("show-lights-toggle");
const showAmenityPointsToggle = document.getElementById("show-amenity-points-toggle");
const urban95PointToggles = document.getElementById("urban95-point-toggles");
const amenityPointsToggleWrap = document.getElementById("amenity-points-toggle-wrap");
const showHeatmapToggle = document.getElementById("show-heatmap-toggle");
const scoreModelToggle = document.getElementById("score-model-toggle");
const modeToggle = document.getElementById("mode-toggle");
const modeHint = document.getElementById("mode-hint");
const scoreExplainSidebarEl = document.getElementById("score-explain-sidebar");
const scoreExplainSidebarBodyEl = document.getElementById("score-explain-sidebar-body");
const scoreExplainSidebarEmptyEl = document.getElementById("score-explain-sidebar-empty");
const scoreExplainSidebarHeroEl = document.getElementById("score-explain-sidebar-hero");
const scoreExplainSidebarNoteEl = document.getElementById("score-explain-sidebar-note");
const scoreExplainBuildingContextEl = document.getElementById("score-explain-building-ctx");
const scoreExplainBuildingContextIdEl = document.getElementById("score-explain-building-ctx-id");
const scoreExplainBuildingContextCoordsEl = document.getElementById("score-explain-building-ctx-coords");
const scoreExplainSidebarCloseButtonEl = document.getElementById("score-explain-sidebar-close");
const scoreExplainBackdropEl = document.getElementById("score-explain-backdrop");

let scoreSidebarPaddingActive = false;
let scoreSidebarPaddingSnapshot = null;
let controlsBinding = null;
const URBAN95_FIXED_MINUTES = 10;
const URBAN95_REFERENCE_RADIUS_METERS = 300;
const BUILDING_CENTROID_GRID_CELL_DEGREES = 0.002;
const BUILDING_CENTROID_MAX_GRID_RING = 4;
const BUILDING_CENTROID_MIN_CANDIDATES = 24;

function requireControlsBindingMember(memberName) {
  if (!controlsBinding || typeof controlsBinding[memberName] !== "function") {
    throw new Error("Urban95Controls.bind must provide " + memberName + " before docs/app.js uses it");
  }
  return controlsBinding[memberName];
}

function cloneMapPadding(padding) {
  return {
    top: Number(padding && padding.top) || 0,
    right: Number(padding && padding.right) || 0,
    bottom: Number(padding && padding.bottom) || 0,
    left: Number(padding && padding.left) || 0,
  };
}

function readMapPaddingSnapshot() {
  if (typeof map.getPadding === "function") {
    return cloneMapPadding(map.getPadding());
  }
  if (map.transform && map.transform.padding) {
    return cloneMapPadding(map.transform.padding);
  }
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

function setScoreSidebarMapPadding(open, width) {
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  if (open && !isMobile) {
    if (!scoreSidebarPaddingActive) {
      scoreSidebarPaddingSnapshot = readMapPaddingSnapshot();
    }
    scoreSidebarPaddingActive = true;
    map.setPadding(Object.assign({}, scoreSidebarPaddingSnapshot, {
      right: Math.round(width || 0),
    }));
    map.resize();
    return;
  }

  if (scoreSidebarPaddingActive && scoreSidebarPaddingSnapshot) {
    map.setPadding(scoreSidebarPaddingSnapshot);
  }
  scoreSidebarPaddingActive = false;
  scoreSidebarPaddingSnapshot = null;
  map.resize();
}

function focusMapAfterScoreSidebar() {
  const canvas = typeof map.getCanvas === "function" ? map.getCanvas() : null;
  if (canvas) {
    canvas.setAttribute("tabindex", "-1");
    canvas.focus({ preventScroll: true });
    return;
  }
  const mapEl = document.getElementById("map");
  if (mapEl) {
    mapEl.setAttribute("tabindex", "-1");
    mapEl.focus({ preventScroll: true });
  }
}

Urban95ScoreSidebar.configure({
  scoreModel: Urban95ScoreModel,
  escapeHtml: escapeHtml,
  renderHorizonLabelCell: renderHorizonLabelCell,
  renderHorizonSubLabelCell: renderHorizonSubLabelCell,
  getWeightedCategoryIcon: getWeightedCategoryIcon,
  getWeightedSubcategoryIcon: getWeightedSubcategoryIcon,
  getScoreExplainRowIcon: getScoreExplainRowIcon,
  getScoreExplainPartialFilterSet: getScoreExplainPartialFilterSet,
  isScoreExplainCategoryFilterHighlighted: isScoreExplainCategoryFilterHighlighted,
  isScoreExplainRowFilterHighlighted: isScoreExplainRowFilterHighlighted,
  formatScoreExplainRowValue: formatScoreExplainRowValue,
  horizonBarFillStyle: horizonBarFillStyle,
  horizonSubBarFillStyle: horizonSubBarFillStyle,
  explainRankBarColor: explainRankBarColor,
  heroPercentileMeterFillStyle: heroPercentileMeterFillStyle,
  getOrdinalSuffix: getOrdinalSuffix,
  buildExplainScoreBreakdown: buildExplainScoreBreakdown,
  buildPercentileMetrics: buildPercentileMetrics,
  getScoreMode: function () {
    return getScoreModeState();
  },
  getScoreModeLabel: getScoreModeLabel,
  getScoreMinutes: getScoreMinutes,
  getSelectedBuilding: function () {
    return selectedBuildingCentroid;
  },
  getSelectedAmenityTypes: function () {
    return getSelectedAmenityTypesState();
  },
  getAllFilterTypes: function () {
    return getAllFilterTypesState();
  },
  formatMetricNumber: formatMetricNumber,
  formatScoreInteger: formatScoreInteger,
  setSidebarPadding: setScoreSidebarMapPadding,
  restoreFocusAfterHide: focusMapAfterScoreSidebar,
  scoreExplainIconNeutral: SCORE_EXPLAIN_ICON_NEUTRAL,
  referenceRadiusMeters: URBAN95_REFERENCE_RADIUS_METERS,
  sidebarEl: scoreExplainSidebarEl,
  bodyEl: scoreExplainSidebarBodyEl,
  emptyEl: scoreExplainSidebarEmptyEl,
  heroEl: scoreExplainSidebarHeroEl,
  noteEl: scoreExplainSidebarNoteEl,
  buildingContextEl: scoreExplainBuildingContextEl,
  buildingContextIdEl: scoreExplainBuildingContextIdEl,
  buildingContextCoordsEl: scoreExplainBuildingContextCoordsEl,
  closeButtonEl: scoreExplainSidebarCloseButtonEl,
  backdropEl: scoreExplainBackdropEl,
});

const TREE_LAYER_IDS = ["tree-icons", "tree-icons-vector"];
const STREET_LIGHT_LAYER_IDS = ["street-light-icons", "street-light-icons-vector"];
const TREES_AND_LIGHTS_LAYER_IDS = TREE_LAYER_IDS.concat(STREET_LIGHT_LAYER_IDS);

const AMENITY_CLUSTER_MIN_ZOOM = 13;
const AMENITY_CLUSTER_PIXEL_RADIUS = 36;
const AMENITY_CLUSTER_DISSOLVE_ZOOM = 16;
const AMENITY_CLUSTER_MAX_COUNT = 50;
const URBAN95_DETAIL_POINTS_MIN_ZOOM = Urban95Config.detailPointsMinZoom || 15;

// Check if we're on a touch device
const isTouchDevice = window.matchMedia("(hover: none) and (pointer: coarse)").matches || 
                      window.matchMedia("(max-width: 480px)").matches;

let allAmenityTypes = [];
let typesWithData = new Set();
let allAmenitiesData = null;
let allAmenitiesDataClean = null;
let allAmenitiesDataLegacy = null;
let allAmenityTypesClean = [];
let allAmenityTypesLegacy = [];
let typesWithDataClean = new Set();
let typesWithDataLegacy = new Set();
let buildingsData = null;
let buildingCentroids = [];
let selectedBuildingCentroid = null;
let selectedBuildingVectorId = null;
let treesInRadiusIds = new Set();
let streetLightsInRadiusIds = new Set();
let iconsLoaded = false;
let isochroneLoadPromise = null;
let isochronesLoaded = false;
let isochroneIndex = {};
let isochronesLookupMode = "legacy";
let visibleAmenityFeatures = [];
let deckAmenityOverlay = null;
let _deckUpdateTimer = null;
let _deckHovering = false;
let _lastDeckClickTime = 0;
let buildingCentroidGridIndex = new Map();

const pointDataLoader = createPointDataLoader({
  urls: {
    trees: TREES_URL,
    streetLights: STREET_LIGHTS_URL,
  },
  fetchJsonWithGzipFallback: fetchJsonWithGzipFallback,
  hasGeneratedArtifact: hasGeneratedArtifact,
  getScoreMode: function () {
    return getScoreModeState();
  },
  onSkippedTreesGeojson: function () {
    console.log("[Load] trees: skipped full GeoJSON fetch for weighted PMTiles display");
    Urban95MapRenderers.updateTreesSource();
  },
  onSkippedStreetLightsGeojson: function () {
    console.log("[Load] street-lights: skipped full GeoJSON fetch for weighted PMTiles display");
    Urban95MapRenderers.updateStreetLightsSource();
  },
  onPointDataLoaded: function (kind, data) {
    const startedAt = performance.now();
    console.log("[Load] " + kind + ": features", (data.features || []).length);
    buildFilterItems(allAmenityTypes);
    Urban95MapRenderers.updateAmenitiesSource();
    Urban95MapRenderers.updateTreesSource();
    Urban95MapRenderers.updateStreetLightsSource();
    Urban95MapRenderers.updateBuildingColors();
    console.log(
      "[Load] " + kind + ": processing complete",
      Math.round(performance.now() - startedAt) + "ms"
    );
    if (selectedBuildingCentroid && pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad()) {
      Urban95Selection.selectBuilding(selectedBuildingCentroid, false);
    }
  },
  onPointDataError: function (kind, err) {
    console.error("Failed to load " + kind + ":", err);
  },
});

Urban95MapRenderers.configure({
  map: map,
  urban95Perf: urban95Perf,
  hasGeneratedArtifact: hasGeneratedArtifact,
  sourceLayer: sourceLayer,
  ensureDeckGlLoaded: ensureDeckGlLoaded,
  amenityTypeConfig: AMENITY_TYPE_CONFIG,
  getAmenityConfig: getAmenityConfig,
  getCurrentMode: function () {
    return currentMode;
  },
  getScoreMode: function () {
    return getScoreModeState();
  },
  getScoreMinutes: getScoreMinutes,
  getSelectedAmenityTypes: function () {
    return getSelectedAmenityTypesState();
  },
  getAllFilterTypes: function () {
    return getAllFilterTypesState();
  },
  getVisibleAmenityFeatures: function () {
    return visibleAmenityFeatures;
  },
  setVisibleAmenityFeatures: function (value) {
    visibleAmenityFeatures = value;
  },
  getAmenitiesInRadiusIds: function () {
    return getAmenitiesInRadiusIdsState();
  },
  getTreesInRadiusIds: function () {
    return treesInRadiusIds;
  },
  getStreetLightsInRadiusIds: function () {
    return streetLightsInRadiusIds;
  },
  getAllAmenitiesData: function () {
    return allAmenitiesData;
  },
  getAllTreesData: function () {
    return pointDataLoader.getAllTreesData();
  },
  getAllStreetLightsData: function () {
    return pointDataLoader.getAllStreetLightsData();
  },
  getDeckAmenityOverlay: function () {
    return deckAmenityOverlay;
  },
  setDeckAmenityOverlay: function (value) {
    deckAmenityOverlay = value;
  },
  getDeckHovering: function () {
    return _deckHovering;
  },
  setDeckHovering: function (value) {
    _deckHovering = value;
  },
  getDeckUpdateTimer: function () {
    return _deckUpdateTimer;
  },
  setDeckUpdateTimer: function (value) {
    _deckUpdateTimer = value;
  },
  setLastDeckClickTime: function (value) {
    _lastDeckClickTime = value;
  },
  getShowTreesChecked: function () {
    return showTreesToggle ? showTreesToggle.checked : true;
  },
  getShowLightsChecked: function () {
    return showLightsToggle ? showLightsToggle.checked : true;
  },
  getShowAmenityPointsTogglePresent: function () {
    return !!showAmenityPointsToggle;
  },
  getShowAmenityPointsChecked: function () {
    return showAmenityPointsToggle ? showAmenityPointsToggle.checked : true;
  },
  tooltipEl: tooltip,
  legendLabelsEl: legendLabels,
  getBuildingsData: function () {
    return buildingsData;
  },
  collectBuildingScores: collectBuildingScores,
  bulkPercentileRanks: bulkPercentileRanks,
  symPctKey: SYM_PCT_KEY,
  buildingsMapSourceId: BUILDINGS_MAP_SOURCE_ID,
  buildingsVectorLayerId: BUILDINGS_VECTOR_LAYER_ID,
  buildingsSymPctStateKey: BUILDINGS_SYM_PCT_STATE_KEY,
  buildingsFillLayerId: BUILDINGS_FILL_LAYER_ID,
  buildingsChoroplethFillColorExpr: BUILDINGS_CHOROPLETH_FILL_COLOR_EXPR,
  getNeighborhoodSurfaceData: function () {
    return neighborhoodSurfaceData;
  },
  getNeighborhoodsData: function () {
    return neighborhoodsData;
  },
  getNeighborhoodAverageKey: getNeighborhoodAverageKey,
  getNeighborhoodSurfaceScorePropertyKey: getNeighborhoodSurfaceScorePropertyKey,
  getNeighborhoodSurfaceColorExpression: getNeighborhoodSurfaceColorExpression,
  treeLayerIds: TREE_LAYER_IDS,
  streetLightLayerIds: STREET_LIGHT_LAYER_IDS,
  treesAndLightsLayerIds: TREES_AND_LIGHTS_LAYER_IDS,
  amenityClusterMinZoom: AMENITY_CLUSTER_MIN_ZOOM,
  amenityClusterPixelRadius: AMENITY_CLUSTER_PIXEL_RADIUS,
  amenityClusterDissolveZoom: AMENITY_CLUSTER_DISSOLVE_ZOOM,
  amenityClusterMaxCount: AMENITY_CLUSTER_MAX_COUNT,
  urban95DetailPointsMinZoom: URBAN95_DETAIL_POINTS_MIN_ZOOM,
});

Urban95Selection.configure({
  map: map,
  turf: turf,
  urban95Perf: urban95Perf,
  hasGeneratedArtifact: hasGeneratedArtifact,
  fetchJsonWithGzipFallback: fetchJsonWithGzipFallback,
  loadIsochronesLookup: urban95RuntimeLoaders.loadIsochronesLookup,
  compactIsochroneFeature: compactIsochroneFeature,
  setLoadingStatus: setLoadingStatus,
  updateLoadingProgress: updateLoadingProgress,
  showIsochroneLoadingScreen: showIsochroneLoadingScreen,
  hideIsochroneLoadingScreen: hideIsochroneLoadingScreen,
  isochronesUrl: ISOCHRONES_URL,
  getSelectedAmenityTypes: function () {
    return getSelectedAmenityTypesState();
  },
  getAllFilterTypes: function () {
    return getAllFilterTypesState();
  },
  getAllAmenitiesData: function () {
    return allAmenitiesData;
  },
  getAllTreesData: function () {
    return pointDataLoader.getAllTreesData();
  },
  getAllStreetLightsData: function () {
    return pointDataLoader.getAllStreetLightsData();
  },
  getWalkMinutes: function () {
    return getWalkMinutesState();
  },
  getScoreMode: function () {
    return getScoreModeState();
  },
  getCurrentMode: function () {
    return currentMode;
  },
  getSelectedBuilding: function () {
    return selectedBuildingCentroid;
  },
  setSelectedBuilding: function (value) {
    selectedBuildingCentroid = value;
  },
  getSelectedBuildingVectorId: function () {
    return selectedBuildingVectorId;
  },
  setSelectedBuildingVectorId: function (value) {
    selectedBuildingVectorId = value;
  },
  hasRadiusSelectionState: function () {
    return (
      !!selectedBuildingCentroid ||
      selectedBuildingVectorId != null ||
      getAmenitiesInRadiusIdsState().size > 0 ||
      treesInRadiusIds.size > 0 ||
      streetLightsInRadiusIds.size > 0 ||
      Object.keys(getLatestRadiusCountsState() || {}).length > 0 ||
      (Urban95ScoreSidebar.isOpen && Urban95ScoreSidebar.isOpen()) ||
      !!(
        document.getElementById("radius-info") &&
        document.getElementById("radius-info").style.display !== "none"
      )
    );
  },
  getBuildingCentroids: function () {
    return buildingCentroids;
  },
  getBuildingCentroidGridIndex: function () {
    return buildingCentroidGridIndex;
  },
  setBuildingCentroidGridIndex: function (value) {
    buildingCentroidGridIndex = value;
  },
  setAmenitiesInRadiusIds: function (value) {
    setAmenitiesInRadiusIdsState(value);
  },
  setTreesInRadiusIds: function (value) {
    treesInRadiusIds = value;
  },
  setStreetLightsInRadiusIds: function (value) {
    streetLightsInRadiusIds = value;
  },
  setLatestRadiusCounts: function (value) {
    setLatestRadiusCountsState(value);
  },
  getIsochroneLoadPromise: function () {
    return isochroneLoadPromise;
  },
  setIsochroneLoadPromise: function (value) {
    isochroneLoadPromise = value;
  },
  getIsochronesLoaded: function () {
    return isochronesLoaded;
  },
  setIsochronesLoaded: function (value) {
    isochronesLoaded = value;
  },
  getIsochroneIndex: function () {
    return isochroneIndex;
  },
  setIsochroneIndex: function (value) {
    isochroneIndex = value;
  },
  getIsochronesLookupMode: function () {
    return isochronesLookupMode;
  },
  setIsochronesLookupMode: function (value) {
    isochronesLookupMode = value;
  },
  getLoadingState: function () {
    return loadingState;
  },
  getWaitingForIsochroneLoad: function () {
    return waitingForIsochroneLoad;
  },
  updateAmenitiesSource: Urban95MapRenderers.updateAmenitiesSource,
  updateTreesSource: Urban95MapRenderers.updateTreesSource,
  updateStreetLightsSource: Urban95MapRenderers.updateStreetLightsSource,
  syncScoreSidebar: Urban95ScoreSidebar.sync,
  hideScoreSidebar: Urban95ScoreSidebar.hide,
  getZoomForPolygon: getZoomForPolygon,
  requestAnimationFrame:
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : function (callback) {
          return callback();
        },
  referenceRadiusMeters: URBAN95_REFERENCE_RADIUS_METERS,
  radiusInfoEl: document.getElementById("radius-info"),
  selectedBuildingSourceId: "selected-building",
  radiusSourceId: "radius-circle",
  buildingsMapSourceId: BUILDINGS_MAP_SOURCE_ID,
  buildingsSelectedLayerId: BUILDINGS_SELECTED_LAYER_ID,
  buildingsVectorLayerId: BUILDINGS_VECTOR_LAYER_ID,
  buildingsSelectedStateKey: BUILDINGS_SELECTED_STATE_KEY,
  buildingCentroidGridCellDegrees: BUILDING_CENTROID_GRID_CELL_DEGREES,
  buildingCentroidMaxGridRing: BUILDING_CENTROID_MAX_GRID_RING,
  buildingCentroidMinCandidates: BUILDING_CENTROID_MIN_CANDIDATES,
});

function getScoreModeLabel(mode) {
  return requireControlsBindingMember("getScoreModeLabel")(mode);
}

function syncFilterUiForScoreMode() {
  return requireControlsBindingMember("syncFilterUiForScoreMode")();
}

function getNeighborhoodAverageKey(sfx) {
  if (getScoreModeState() === "weighted") {
    const selectedStem = getSelectedWeightedCategoryStem();
    if (selectedStem) return "avg_score_weighted_" + selectedStem + sfx;
    return "avg_score_weighted_" + URBAN95_FIXED_MINUTES + "min";
  }
  return "avg_overall" + sfx;
}

function getNeighborhoodPercentileKey(sfx) {
  if (getScoreModeState() === "weighted") return "pct_weighted_overall_" + URBAN95_FIXED_MINUTES + "min";
  return "pct_overall" + sfx;
}

function getScoreMinutes() {
  if (getScoreModeState() === "weighted") return URBAN95_FIXED_MINUTES;
  return getWalkMinutesState();
}

function normalizeSurfaceFilterKey(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^0-9a-z]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "other";
}

function getNeighborhoodSurfaceScorePropertyKey() {
  if (getScoreModeState() === "weighted") {
    const selectedStem = getSelectedWeightedCategoryStem();
    if (selectedStem) return "score_weighted_" + selectedStem;
    return "score_weighted";
  }
  const sfx = "_" + getScoreMinutes() + "min";
  if (getScoreModeState() === "expanded") {
    if (currentMode !== "house") {
      return "score_expanded" + sfx;
    }
    if (getSelectedAmenityTypesState().size === getAllFilterTypesState().length) {
      return "score_expanded" + sfx;
    }
    if (getSelectedAmenityTypesState().size === 1) {
      const selectedType = Array.from(getSelectedAmenityTypesState())[0] || "";
      const scenarioType = selectedType === "health" ? "healthcare" : selectedType;
      return "score_filter_" + normalizeSurfaceFilterKey(scenarioType) + sfx;
    }
  }
  return null;
}

function getNeighborhoodSurfaceColorExpression(scoreProperty) {
  const scoreKey = scoreProperty || "score";
  return [
    "case",
    ["==", ["to-number", ["get", "has_buildings"], 0], 0],
    "#9ca3af",
    [
      "interpolate",
      ["linear"],
      ["to-number", ["get", scoreKey], 0],
      0, "#ef4444",
      25, "#f97316",
      50, "#eab308",
      75, "#84cc16",
      100, "#22c55e",
    ],
  ];
}

// Opacity for the hex score grid when rendered as a soft background underneath buildings in house mode.
const HOUSE_MODE_HEX_OPACITY = 0.3;

// Analysis mode state
let currentMode = "house"; // "house" | "neighborhood" | "citywide"
let neighborhoodsData = null;
let neighborhoodSurfaceData = null;
let neighborhoodChartsPayload = null;
let citywideStats = null;
let selectedNeighborhood = null;
let citywideCharts = [];
let neighborhoodCharts = [];
const neighborhoodModalEl = document.getElementById("neighborhood-modal");
const neighborhoodModalCloseEl = document.getElementById("neighborhood-modal-close");
const neighborhoodModalTitleEl = document.getElementById("neighborhood-modal-title");
const neighborhoodModalSubtitleEl = document.getElementById("neighborhood-modal-subtitle");
const neighborhoodModalBodyEl = document.getElementById("neighborhood-modal-body");
const citywideModalEl = document.getElementById("citywide-modal");
const citywideCloseEl = document.getElementById("citywide-close");
const citywideTitleEl = document.getElementById("citywide-modal-title");
const citywideSubtitleEl = document.getElementById("citywide-modal-subtitle");
const citywideBodyEl = document.getElementById("citywide-body");

Urban95Dashboards.configure({
  map: map,
  fetchJsonWithGzipFallback: fetchJsonWithGzipFallback,
  ensureChartJsLoaded: ensureChartJsLoaded,
  urls: {
    neighborhoods: NEIGHBORHOODS_URL,
    neighborhoodSurface: NEIGHBORHOOD_SURFACE_URL,
    neighborhoodCharts: NEIGHBORHOOD_CHARTS_URL,
    citywideStats: CITYWIDE_STATS_URL,
  },
  scoreModel: Urban95ScoreModel,
  getScoreMode: function () {
    return getScoreModeState();
  },
  getScoreMinutes: getScoreMinutes,
  escapeHtml: escapeHtml,
  getNeighborhoodsData: function () {
    return neighborhoodsData;
  },
  setNeighborhoodsData: function (value) {
    neighborhoodsData = value;
  },
  getNeighborhoodSurfaceData: function () {
    return neighborhoodSurfaceData;
  },
  setNeighborhoodSurfaceData: function (value) {
    neighborhoodSurfaceData = value;
  },
  getNeighborhoodChartsPayload: function () {
    return neighborhoodChartsPayload;
  },
  setNeighborhoodChartsPayload: function (value) {
    neighborhoodChartsPayload = value;
  },
  getCitywideStats: function () {
    return citywideStats;
  },
  setCitywideStats: function (value) {
    citywideStats = value;
  },
  getSelectedNeighborhood: function () {
    return selectedNeighborhood;
  },
  setSelectedNeighborhood: function (value) {
    selectedNeighborhood = value;
  },
  getCitywideCharts: function () {
    return citywideCharts;
  },
  setCitywideCharts: function (value) {
    citywideCharts = value;
  },
  getNeighborhoodCharts: function () {
    return neighborhoodCharts;
  },
  setNeighborhoodCharts: function (value) {
    neighborhoodCharts = value;
  },
  getAmenityConfig: getAmenityConfig,
  getNeighborhoodPercentileKey: getNeighborhoodPercentileKey,
  getNeighborhoodSurfaceScorePropertyKey: getNeighborhoodSurfaceScorePropertyKey,
  getSelectedWeightedCategoryLabel: getSelectedWeightedCategoryLabel,
  getSelectedWeightedCategoryStem: getSelectedWeightedCategoryStem,
  getWeightedAverageValueFromSource: getWeightedAverageValueFromSource,
  getCitywideWeightedAverageScore: getCitywideWeightedAverageScore,
  weightedCategoryHighlightsFromSource: weightedCategoryHighlightsFromSource,
  weightedNeighborhoodRankingRows: weightedNeighborhoodRankingRows,
  weightedSubcategoryComparisonRows: weightedSubcategoryComparisonRows,
  renderWeightedSubcategoryComparisonList: renderWeightedSubcategoryComparisonList,
  buildHistogramDistributionFromScores: buildHistogramDistributionFromScores,
  collectBuildingScores: collectBuildingScores,
  getColorForValue: getColorForValue,
  percentileBreakpoints: percentileBreakpoints,
  formatMetricNumber: formatMetricNumber,
  getOrdinalSuffix: getOrdinalSuffix,
  getScoreModeLabel: getScoreModeLabel,
  tooltipEl: tooltip,
  switchMode: switchMode,
  neighborhoodModal: neighborhoodModalEl,
  neighborhoodModalClose: neighborhoodModalCloseEl,
  neighborhoodModalTitle: neighborhoodModalTitleEl,
  neighborhoodModalSubtitle: neighborhoodModalSubtitleEl,
  neighborhoodModalBody: neighborhoodModalBodyEl,
  citywideModal: citywideModalEl,
  citywideClose: citywideCloseEl,
  citywideTitle: citywideTitleEl,
  citywideSubtitle: citywideSubtitleEl,
  citywideBody: citywideBodyEl,
  requestAnimationFrame:
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : function (callback) {
          return callback();
        },
});

// Loading screen elements
const loadingScreen = document.getElementById("loading-screen");
const loadingStatus = document.querySelector(".loading-status");
const loadingProgressBar = document.querySelector(".loading-progress-bar");
let waitingForIsochroneLoad = false;

// Track loading progress
const loadingState = {
  icons: false,
  buildings: false,
  parks: false,
  trees: false,
  amenities: false,
  isochrones: false,
  mapReady: false
};

function updateLoadingProgress() {
  const items = Object.values(loadingState);
  const loaded = items.filter(Boolean).length;
  const total = items.length;
  const percent = Math.round((loaded / total) * 100);
  
  if (loadingProgressBar) {
    loadingProgressBar.style.width = percent + "%";
  }
  
  // Check if everything is loaded
  if (loaded === total) {
    hideLoadingScreen();
  }
}

function setLoadingStatus(message) {
  if (loadingStatus) {
    loadingStatus.textContent = message;
  }
}

function hideLoadingScreen() {
  if (loadingScreen && !loadingScreen.classList.contains("hidden")) {
    setTimeout(() => {
      loadingScreen.classList.add("hidden");
    }, 300);
  }
}

function showIsochroneLoadingScreen() {
  waitingForIsochroneLoad = true;
  if (loadingScreen) {
    loadingScreen.classList.remove("hidden");
  }
  if (loadingProgressBar) {
    loadingProgressBar.style.width = "100%";
  }
  setLoadingStatus("Loading walking areas for Amenities Focus...");
}

function hideIsochroneLoadingScreen() {
  waitingForIsochroneLoad = false;
  const allLoaded = Object.values(loadingState).every(Boolean);
  if (allLoaded) {
    hideLoadingScreen();
  }
}

// Fallback: hide loading screen after 60 seconds regardless
setTimeout(() => {
  if (loadingScreen && !loadingScreen.classList.contains("hidden")) {
    if (waitingForIsochroneLoad) return;
    console.warn("Loading timeout - forcing hide");
    hideLoadingScreen();
  }
}, 60000);

// Load all amenity icons into the map
async function loadAmenityIcons() {
  const iconNames = new Set();
  Object.values(AMENITY_TYPE_CONFIG).forEach(config => iconNames.add(config.icon));
  iconNames.add(DEFAULT_CONFIG.icon);
  
  const loadPromises = Array.from(iconNames).map(iconName => {
    return new Promise((resolve) => {
      // Try loading via fetch first (more reliable on mobile)
      fetch(`${ICONS_BASE}/${iconName}.svg`)
        .then(response => {
          if (!response.ok) throw new Error('Network response was not ok');
          return response.text();
        })
        .then(svgText => {
          // Create image from SVG blob for better mobile compatibility
          const blob = new Blob([svgText], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            if (!map.hasImage(iconName)) {
              map.addImage(iconName, img, { sdf: true });
            }
            URL.revokeObjectURL(url);
            resolve();
          };
          img.onerror = () => {
            console.warn(`Failed to create image for icon: ${iconName}`);
            URL.revokeObjectURL(url);
            resolve();
          };
          img.src = url;
        })
        .catch(() => {
          // Fallback: try direct image loading
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            if (!map.hasImage(iconName)) {
              map.addImage(iconName, img, { sdf: true });
            }
            resolve();
          };
          img.onerror = () => {
            console.warn(`Failed to load icon: ${iconName}`);
            resolve();
          };
          img.src = `${ICONS_BASE}/${iconName}.svg`;
        });
    });
  });
  
  await Promise.all(loadPromises);
  iconsLoaded = true;
}

function applyScoreModeAmenities() {
  return urban95Perf.phase("applyScoreModeAmenities", function () {
    const useLegacy = getScoreModeState() === "expanded" && allAmenitiesDataLegacy && (allAmenitiesDataLegacy.features || []).length > 0;
    if (getScoreModeState() === "expanded" && !useLegacy) {
      console.warn("amenities_all.geojson missing or empty; Amenities Focus mode may be incomplete.");
    }
    if (useLegacy) {
      allAmenitiesData = allAmenitiesDataLegacy;
      allAmenityTypes = allAmenityTypesLegacy.slice();
      typesWithData = new Set(typesWithDataLegacy);
    } else {
      allAmenitiesData = allAmenitiesDataClean;
      allAmenityTypes = allAmenityTypesClean.slice();
      typesWithData = new Set(typesWithDataClean);
    }
    clearRadiusIdsState();
    buildFilterItems(allAmenityTypes);
    syncFilterUiForScoreMode();
    updateShowPointsToggleLabel();
    return pointDataLoader.ensureExpandedPointDataLoaded().then(function () {
      Urban95MapRenderers.applyShowPointsToggle();
      Urban95MapRenderers.updateAmenitiesSource();
      Urban95MapRenderers.updateTreesSource();
      Urban95MapRenderers.updateStreetLightsSource();
      // Building choropleth: mutates SYM_PCT_KEY on in-memory GeoJSON; PMTiles footprints use map.setFeatureState(sym_pct).
      // Only when the buildings layer is shown (house mode). enterHouseMode() calls updateBuildingColors() when
      // returning to house.
      if (currentMode === "house") {
        Urban95MapRenderers.updateBuildingColors();
        Urban95MapRenderers.updateNeighborhoodSurfaceData();
      }
      if (selectedBuildingCentroid && pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad()) {
        Urban95Selection.selectBuilding(selectedBuildingCentroid, false);
      }
    });
  });
}

function collectBuildingScores() {
  return collectCurrentBuildingScores();
}

/**
 * Point visibility controls change with the active score model:
 *   - Urban95 (weighted): independent tree and street-light symbol toggles.
 *   - Amenities Focus (expanded): one deck.gl amenity pie-chart overlay toggle
 *     because trees and lights are already filtered through the amenity filter UI.
 */
function updateShowPointsToggleLabel() {
  return requireControlsBindingMember("updateShowPointsToggleLabel")();
}

function getBuildingOverallScore(props, minutes) {
  return getCurrentBuildingOverallScore(props, minutes);
}

function getOrdinalSuffix(value) {
  const v = Math.abs(Number(value)) || 0;
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  const mod10 = v % 10;
  if (mod10 === 1) return "st";
  if (mod10 === 2) return "nd";
  if (mod10 === 3) return "rd";
  return "th";
}
function formatScoreExplainRowValue(row) {
  const v = Number(row && row.value);
  if (Number.isFinite(v)) return formatScoreInteger(v);
  return row && row.valueLabel ? String(row.valueLabel).replace(/\s*pts\s*$/i, "").trim() : "";
}

function getWeightedAverageValueFromSource(source, sfx) {
  return getWeightedAverageValueFromCurrentSelection(source, sfx);
}
function weightedNeighborhoodRankingRows(stats, sfx) {
  return weightedNeighborhoodRankingRowsForCurrentSelection(stats, sfx);
}

function getCitywideWeightedAverageScore(stats, sfx) {
  return getCitywideWeightedAverageScoreForCurrentSelection(stats, sfx);
}

function renderWeightedSubcategoryComparisonList(container, rows) {
  if (!container) return;
  const ordered = (rows || []).slice().sort(function (a, b) {
    return b.neighborhood - a.neighborhood;
  });
  if (ordered.length === 0) {
    container.innerHTML = '<p class="score-explain-empty">Subcategory comparison data unavailable.</p>';
    return;
  }
  let html = '<div class="u95-compare-legend"><span class="u95-compare-legend-bar">Neighborhood</span><span class="u95-compare-legend-line">City avg</span></div>';
  html += '<div class="u95-compare-list">';
  ordered.forEach(function (row) {
    const n = Math.max(0, Math.min(100, Number(row.neighborhood) || 0));
    const c = Math.max(0, Math.min(100, Number(row.city) || 0));
    const color = n >= 70 ? "#22c55e" : n >= 40 ? "#eab308" : "#ef4444";
    html += '<div class="u95-compare-item">';
    html += `<div class="u95-compare-name">${escapeHtml(row.label)}</div>`;
    html += '<div class="u95-compare-bar-wrap">';
    html += `<div class="u95-compare-city-marker" style="left:${c}%"></div>`;
    html += `<div class="u95-compare-bar" style="width:${n}%;background:${color}"></div>`;
    html += '</div>';
    html += `<div class="u95-compare-score"><strong>${formatMetricNumber(n)}</strong><span>city avg ${formatMetricNumber(c)}</span></div>`;
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function getPercentileSeriesCacheKey(minutes) {
  return getCurrentPercentileSeriesCacheKey(minutes);
}

function getPercentileSeriesForMinutes(minutes) {
  const cacheKey = getPercentileSeriesCacheKey(minutes);
  if (hasPercentileSeriesState(cacheKey)) {
    return getPercentileSeriesState(cacheKey);
  }

  if (!buildingsData || !Array.isArray(buildingsData.features)) {
    return null;
  }

  const overall = [];
  buildingsData.features.forEach((feature) => {
    overall.push(getBuildingOverallScore(feature.properties || {}, minutes));
  });

  const series = { overall };
  fillExplainSeries(series, buildingsData.features, minutes);
  setPercentileSeriesState(cacheKey, series);
  return series;
}

function buildPercentileMetrics(buildingProps) {
  if (!buildingProps) return null;
  if (getSelectedAmenityTypesState().size === 0) return null;
  const overallScore = getBuildingOverallScore(buildingProps, getWalkMinutesState());
  if (getScoreModeState() === "weighted") {
    return { overallPercentile: null, overallScore };
  }
  const series = getPercentileSeriesForMinutes(getWalkMinutesState());
  if (!series || series.overall.length === 0) return null;
  const overallPercentile = computePercentileRank(series.overall, overallScore);
  return { overallPercentile, overallScore };
}

function percentileForSeries(arr, value) {
  if (!arr || arr.length === 0) return null;
  return computePercentileRank(arr, value);
}

function getBuildingAmenityStatKeysForMinutes(minutes) {
  return getCurrentBuildingAmenityStatKeysForMinutes(minutes);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function explainRankBarColor(pct) {
  if (pct == null) return "#94a3b8";
  if (pct >= 70) return "#22c55e";
  if (pct >= 40) return "#eab308";
  return "#ef4444";
}

function heroPercentileMeterFillStyle(value0to100) {
  const v = Math.min(100, Math.max(0, Number(value0to100) || 0));
  return "width:" + v + "%;--meter-fill-pct:" + Math.max(1, v);
}

function buildExplainScoreBreakdown(buildingProps) {
  const p = buildingProps || {};
  const m = getScoreMinutes();
  const sfx = "_" + m + "min";
  const useAll = getSelectedAmenityTypesState().size === getAllFilterTypesState().length;
  const overallScore = getBuildingOverallScore(p, m);
  const rows = [];
  const isWeighted = getScoreModeState() === "weighted";
  const isClean = getScoreModeState() === "clean";

  if (isWeighted) {
    const weightedCategories = [];
    WEIGHTED_CATEGORY_COMPONENTS.forEach(function (comp) {
      const col = "score_weighted_" + comp.stem + sfx;
      const v = Number(p[col]) || 0;
      const group = {
        stem: comp.stem,
        label: comp.label,
        weight: comp.weight,
        value: v,
        valueLabel: formatMetricNumber(v) + " / 100",
        color: comp.color,
        subrows: [],
      };
      const subcomponents = WEIGHTED_SUBCATEGORY_COMPONENTS[comp.stem] || [];
      subcomponents.forEach(function (sub) {
        const subCol = "score_weighted_sub_" + comp.stem + "_" + sub.stem + sfx;
        const raw = p[subCol];
        const hasValue = raw !== undefined && raw !== null && raw !== "";
        const subVal = hasValue ? Number(raw) || 0 : null;
        group.subrows.push({
          stem: sub.stem,
          label: sub.label,
          weight: sub.weight,
          totalWeight: sub.weight * comp.weight,
          value: subVal,
          valueLabel: subVal != null ? formatMetricNumber(subVal) + " / 100" : "Missing (re-run preprocess)",
        });
      });
      weightedCategories.push(group);
    });
    return {
      formulaLine:
        "Urban95 score = (0.20×Environmental Quality) + (0.15×Nature) + (0.15×Play) + (0.25×Safety & Mobility) + (0.25×Family Services).",
      overallScoreLabel: formatMetricNumber(overallScore),
      overallPercentile: null,
      rows: [],
      weightedCategories: weightedCategories,
    };
  }

  const series = getPercentileSeriesForMinutes(getWalkMinutesState());
  if (!series || !series.explain || series.overall.length === 0) return null;
  const overallPct = percentileForSeries(series.overall, overallScore);

  if (isClean) {
    rows.push({ sectionTitle: "Weighted components" });
    if (hasCleanPtsBreakdown(p, m)) {
      CLEAN_SCORE_COMPONENTS.forEach(function (c) {
        const col = cleanPtsPropertyName(c.key, m);
        const v = Number(p[col]) || 0;
        const w = CLEAN_WEIGHTS[c.key];
        const mid = "flt_pts_" + c.key.replace(/-/g, "_");
        const arr = series.explain[mid];
        rows.push({
          label: c.label,
          cleanKey: c.key,
          detail: w + " pts × (" + c.shortTag + ")",
          value: v,
          valueLabel: formatMetricNumber(v) + " pts",
          percentile: percentileForSeries(arr, v),
        });
      });
    } else {
      const treeW = CLEAN_WEIGHTS.trees * (Number(p["num_trees" + sfx]) || 0);
      const rest = (Number(p["score_clean" + sfx]) || 0) - treeW;
      rows.push({
        label: "Trees (weighted)",
        detail: "×" + CLEAN_WEIGHTS.trees + " per tree in range",
        value: treeW,
        valueLabel: formatMetricNumber(treeW) + " pts",
        percentile: percentileForSeries(series.explain.flt_tree_w, treeW),
      });
      rows.push({
        label: "Other manifest-weighted",
        detail: "Regenerate data with preprocess_accessibility.py for a per-category breakdown.",
        value: rest,
        valueLabel: formatMetricNumber(rest) + " pts",
        percentile: percentileForSeries(series.explain.flt_rest, rest),
      });
    }
  } else {
    rows.push({ sectionTitle: "Main components" });
      const na = Number(p["num_amenities" + sfx]) || 0;
      const tw = (Number(p["num_trees" + sfx]) || 0) * 0.25;
      const sw = (Number(p["num_street_lights" + sfx]) || 0) * 0.25;
      rows.push({
        label: "Amenity POIs (count)",
        detail: "1 point per POI in range",
        value: na,
        valueLabel: formatMetricNumber(na),
        percentile: percentileForSeries(series.explain.exp_amen, na),
      });
      rows.push({
        label: "Trees (×¼)",
        detail: "",
        value: tw,
        valueLabel: formatMetricNumber(tw),
        percentile: percentileForSeries(series.explain.exp_tree_w, tw),
      });
      rows.push({
        label: "Street lights (×¼)",
        detail: "",
        value: sw,
        valueLabel: formatMetricNumber(sw),
        percentile: percentileForSeries(series.explain.exp_sl_w, sw),
      });

      const amenTypes = getAllFilterTypesState().filter(function (t) {
        return t !== "trees" && t !== "street-lights";
      });
      const availableAmenityStatKeys = getBuildingAmenityStatKeysForMinutes(m);
      const amenRows = [];
      amenTypes.forEach(function (t) {
        const statKey = amenityTypeToBuildingStatKey(t);
        const id = "exp_amen_" + statKey;
        const arr = series.explainAmenity[id];
        if (!arr) return;
        const hasBuildingColumn = availableAmenityStatKeys.has(statKey);
        const cnt = hasBuildingColumn
          ? Number(p["amen_" + statKey + sfx]) || 0
          : Number(getLatestRadiusCountsState()[t]) || 0;
        const cfg = getAmenityConfig(t);
        amenRows.push({
          label: cfg.label,
          amenityType: t,
          detail: "",
          value: cnt,
          valueLabel: formatMetricNumber(cnt),
          percentile: hasBuildingColumn ? percentileForSeries(arr, cnt) : null,
        });
      });
      amenRows.sort(function (a, b) {
        if (b.value !== a.value) return b.value - a.value;
        return a.label.localeCompare(b.label);
      });
    if (amenRows.length > 0) {
      rows.push({ sectionTitle: "POI categories (count in range)" });
      amenRows.forEach(function (r) {
        rows.push(r);
      });
    }
  }

  return {
    formulaLine: isClean
      ? buildFilteredFormulaLine(useAll)
      : useAll
        ? "Amenities Focus index = POI count + ¼× trees + ¼× street lights."
        : "Partial Amenities Focus index = sum of selected POI counts plus ¼× trees and ¼× lights when selected. ",
    overallScoreLabel: formatMetricNumber(overallScore),
    overallPercentile: overallPct,
    rows: rows,
  };
}

function updateFilterLabel() {
  return requireControlsBindingMember("updateFilterLabel")();
}

function formatArea(areaM2) {
  if (areaM2 >= 10000) {
    return (areaM2 / 10000).toFixed(2) + " ha";
  }
  return Math.round(areaM2).toLocaleString() + " m²";
}

function buildFilterItems(types) {
  return requireControlsBindingMember("buildFilterItems")(types);
}

function openFilterPopup() {
  return;
}

function closeFilterPopup() {
  return requireControlsBindingMember("closeFilterPopup")();
}

function clearControlDerivedCaches() {
  clearDerivedCachesState();
}

function handleControlsFilterSelectionChanged() {
  Urban95MapRenderers.updateAmenitiesSource();
  Urban95MapRenderers.updateTreesSource();
  Urban95MapRenderers.updateStreetLightsSource();
  Urban95MapRenderers.updateBuildingColors();

  if (selectedBuildingCentroid && pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad()) {
    Urban95Selection.selectBuilding(selectedBuildingCentroid, false);
  }

  if (currentMode === "neighborhood") {
    Urban95MapRenderers.updateNeighborhoodColors();
    const nhModal = document.getElementById("neighborhood-modal");
    if (nhModal && nhModal.classList.contains("show") && selectedNeighborhood) {
      Urban95Dashboards.showNeighborhoodModal(selectedNeighborhood);
    }
  } else if (currentMode === "citywide") {
    Urban95MapRenderers.updateNeighborhoodColors();
    const cwModal = document.getElementById("citywide-modal");
    if (cwModal && cwModal.classList.contains("show")) {
      Urban95Dashboards.renderCitywideModal();
    } else {
      Urban95Dashboards.updateCitywideModalTitle();
    }
  } else if (currentMode === "house") {
    Urban95MapRenderers.updateNeighborhoodSurfaceData();
  }
}

function handleControlsScoreModeChanged(nextScoreMode) {
  urban95Perf.session(
    "score-model -> " + (nextScoreMode === "expanded" ? "Amenities Focus" : "Urban95")
  );
  return urban95Perf.phase("scoreModelToggle:handler", function () {
    if (getScoreModeState() !== "weighted") {
      const shouldBlockForSelectedBuilding = !!selectedBuildingCentroid && !isochronesLoaded;
      if (shouldBlockForSelectedBuilding) {
        showIsochroneLoadingScreen();
      }
      Urban95Selection.loadIsochrones({ background: !shouldBlockForSelectedBuilding });
    } else {
      if (waitingForIsochroneLoad) {
        hideIsochroneLoadingScreen();
      }
      loadingState.isochrones = true;
      updateLoadingProgress();
    }
    return applyScoreModeAmenities().then(function () {
      if (selectedBuildingCentroid) {
        Urban95Selection.updateRadiusInfo();
      }
      const cwModal = document.getElementById("citywide-modal");
      if (currentMode === "citywide" && cwModal && cwModal.classList.contains("show")) {
        Urban95Dashboards.renderCitywideModal();
      }
      if (currentMode === "neighborhood") {
        Urban95MapRenderers.updateNeighborhoodColors();
        const nhModal = document.getElementById("neighborhood-modal");
        if (nhModal && nhModal.classList.contains("show") && selectedNeighborhood) {
          Urban95Dashboards.showNeighborhoodModal(selectedNeighborhood);
        }
      }
    });
  });
}

function handleControlsWalkMinutesChanged() {
  if (currentMode === "house") {
    Urban95MapRenderers.updateBuildingColors();
    Urban95MapRenderers.updateNeighborhoodSurfaceData();
    if (selectedBuildingCentroid) {
      Urban95Selection.selectBuilding(selectedBuildingCentroid, true);
    }
  }
  if (currentMode === "neighborhood") {
    Urban95MapRenderers.updateNeighborhoodColors();
    const modal = document.getElementById("neighborhood-modal");
    if (selectedNeighborhood && modal && modal.classList.contains("show")) {
      Urban95Dashboards.showNeighborhoodModal(selectedNeighborhood);
    }
  }
  const citywideModal = document.getElementById("citywide-modal");
  if (currentMode === "citywide" && citywideModal && citywideModal.classList.contains("show")) {
    Urban95Dashboards.renderCitywideModal();
  }
}

function handleControlsModeToggleRequested(mode) {
  urban95Perf.session("analysis mode -> " + mode);
  return urban95Perf.phase("modeToggle:click", function () {
    if (currentMode === "neighborhood" || currentMode === "citywide") {
      exitNeighborhoodMode();
    }
    switchMode(mode);
  });
}

function handleControlsEscape(event) {
  if (Urban95ScoreSidebar.isOpen()) {
    Urban95ScoreSidebar.hide();
    event.stopPropagation();
    return;
  }
  if (currentMode === "house") {
    Urban95Selection.clearRadiusSelection();
  } else if (currentMode === "neighborhood") {
    Urban95Dashboards.hideNeighborhoodModal();
  } else if (currentMode === "citywide") {
    Urban95Dashboards.hideCitywideModal();
    switchMode("house");
  }
}

function handleControlsHeatmapVisibilityChange(visible) {
  if (currentMode !== "house" || !map.getLayer("neighborhoods-surface")) return;
  map.setLayoutProperty("neighborhoods-surface", "visibility", visible ? "visible" : "none");
}

controlsBinding = Urban95Controls.bind({
  elements: {
    filterBtn: filterBtn,
    filterPopup: filterPopup,
    filterLabel: filterLabel,
    filterItems: filterItems,
    filterBackdrop: filterBackdrop,
    amenityFilterSection: amenityFilterSection,
    radiusSection: radiusSection,
    radiusToggle: radiusToggle,
    scoreModelToggle: scoreModelToggle,
    modeToggle: modeToggle,
    modeHint: modeHint,
    showTreesToggle: showTreesToggle,
    showLightsToggle: showLightsToggle,
    showAmenityPointsToggle: showAmenityPointsToggle,
    showHeatmapToggle: showHeatmapToggle,
    urban95PointToggles: urban95PointToggles,
    amenityPointsToggleWrap: amenityPointsToggleWrap,
  },
  scoreModel: Urban95ScoreModel,
  isTouchDevice: isTouchDevice,
  getState: function () {
    return {
      scoreMode: getScoreModeState(),
      walkMinutes: getWalkMinutesState(),
      selectedAmenityTypes: getSelectedAmenityTypesState(),
      allFilterTypes: getAllFilterTypesState(),
      lastFilterRadioSelection: getLastFilterRadioSelectionState(),
      currentMode: currentMode,
    };
  },
  setScoreMode: function (value) {
    setScoreModeState(value);
  },
  setWalkMinutes: function (value) {
    setWalkMinutesState(value);
  },
  setSelectedAmenityTypes: function (value) {
    setSelectedAmenityTypesState(value);
  },
  setAllFilterTypes: function (value) {
    setAllFilterTypesState(value);
  },
  setLastFilterRadioSelection: function (value) {
    setLastFilterRadioSelectionState(value);
  },
  getTypesWithData: function () {
    return typesWithData;
  },
  getAllTreesData: function () {
    return pointDataLoader.getAllTreesData();
  },
  getAllStreetLightsData: function () {
    return pointDataLoader.getAllStreetLightsData();
  },
  callbacks: {
    applyScoreModeAmenities: applyScoreModeAmenities,
    updateBuildingColors: Urban95MapRenderers.updateBuildingColors,
    updateAccessibilityLegendLabels: Urban95MapRenderers.updateAccessibilityLegendLabels,
    updateRadiusInfo: Urban95Selection.updateRadiusInfo,
    switchMode: switchMode,
    onFilterSelectionChanged: handleControlsFilterSelectionChanged,
    onScoreModeChanged: handleControlsScoreModeChanged,
    onWalkMinutesChanged: handleControlsWalkMinutesChanged,
    onModeToggleRequested: handleControlsModeToggleRequested,
    onPointVisibilityChanged: Urban95MapRenderers.applyShowPointsToggle,
    onHeatmapVisibilityChanged: handleControlsHeatmapVisibilityChange,
    onEscape: handleControlsEscape,
    clearDerivedCaches: clearControlDerivedCaches,
  },
});

map.on("click", function (e) {
  if (currentMode !== "house") return;
  if (e.originalEvent.target !== map.getCanvas()) return;
  if (Date.now() - _lastDeckClickTime < 300) return;

  const closest = Urban95Selection.findClosestBuilding(e.lngLat);
  if (closest) {
    Urban95Selection.selectBuilding(closest, true);
  }
});

map.on("load", async function () {
  const appLoadStartedAt = performance.now();
  console.log("[Load] app startup: map load event");
  loadingState.mapReady = true;
  updateLoadingProgress();
  applyParkDotPattern(map, document);
  
  // Load icons first
  setLoadingStatus("Loading icons...");
  const iconsStartedAt = performance.now();
  await loadAmenityIcons();
  console.log(
    "[Load] icons: complete",
    Math.round(performance.now() - iconsStartedAt) + "ms"
  );
  loadingState.icons = true;
  updateLoadingProgress();
  
  // Add amenity layers after icons are loaded
  const layerInitStartedAt = performance.now();
  Urban95MapRenderers.addAmenityLayers();
  Urban95MapRenderers.applyShowPointsToggle();
  console.log(
    "[Load] layer init: complete",
    Math.round(performance.now() - layerInitStartedAt) + "ms"
  );

  setLoadingStatus("Loading buildings...");
  const buildingsStartedAt = performance.now();
  const buildingsLoad = hasGeneratedArtifact("buildings")
    ? urban95RuntimeLoaders.loadBuildingsRuntimeData()
    : fetchJsonWithGzipFallback(BUILDINGS_URL);
  buildingsLoad
    .then(function (fc) {
      console.log("[Load] buildings: features", (fc.features || []).length);
      buildingsData = fc;
      if (!hasGeneratedArtifact("buildings")) {
        const buildingsSource = map.getSource(BUILDINGS_MAP_SOURCE_ID);
        if (buildingsSource) buildingsSource.setData(fc);
      }
      warnIfBuildingScoresIncomplete(fc);
      clearDerivedCachesState();
      
      const centroidsStartedAt = performance.now();
      buildingCentroids = [];
      (fc.features || []).forEach(function (f) {
        if (f.geometry) {
          const props = f.properties || {};
          const storedLng = Number(props.centroid_lng);
          const storedLat = Number(props.centroid_lat);
          const hasStoredCentroid = Number.isFinite(storedLng) && Number.isFinite(storedLat);
          const centroid = hasStoredCentroid ? null : turf.centroid(f);
          const lng = hasStoredCentroid ? storedLng : centroid.geometry.coordinates[0];
          const lat = hasStoredCentroid ? storedLat : centroid.geometry.coordinates[1];
          buildingCentroids.push({
            lng: lng,
            lat: lat,
            properties: props,
            feature: f
          });
        }
      });
      Urban95Selection.buildBuildingCentroidGridIndex();
      console.log(
        "[Load] buildings: centroid build",
        buildingCentroids.length,
        "items in",
        Math.round(performance.now() - centroidsStartedAt) + "ms"
      );
      
      const buildingColorsStartedAt = performance.now();
      Urban95MapRenderers.updateBuildingColors();
      console.log(
        "[Load] buildings: color update",
        Math.round(performance.now() - buildingColorsStartedAt) + "ms"
      );
      loadingState.buildings = true;
      updateLoadingProgress();
      console.log(
        "[Load] buildings: complete total",
        Math.round(performance.now() - buildingsStartedAt) + "ms"
      );
    })
    .catch(function (err) {
      console.error("Failed to load buildings:", err);
      loadingState.buildings = true;
      updateLoadingProgress();
    });

  setLoadingStatus("Loading parks...");
  const parksStartedAt = performance.now();
  fetchJsonWithGzipFallback(PARKS_URL, { required: false }).then(function (fc) {
    if (fc && map.getSource("parks")) map.getSource("parks").setData(fc);
    console.log(
      "[Load] parks: complete",
      fc && fc.features ? fc.features.length : 0,
      "features in",
      Math.round(performance.now() - parksStartedAt) + "ms"
    );
    loadingState.parks = true;
    updateLoadingProgress();
  }).catch(function (err) {
    console.error("Failed to load parks:", err);
    loadingState.parks = true;
    updateLoadingProgress();
  });
  
  setLoadingStatus("Loading amenities...");
  const amenitiesStartedAt = performance.now();
  loadPointsLookup()
    .then(function (lookup) {
      if (hasValidPointsLookupSources(lookup)) {
        const lookupSources = lookup && lookup.sources ? lookup.sources : {};
        return {
          source: "points_lookup",
          cleanFc: featureCollectionFromPointRecords(lookupSources.amenities_clean),
          legacyFc: Array.isArray(lookupSources.amenities_legacy)
            ? featureCollectionFromPointRecords(lookupSources.amenities_legacy)
            : null,
          treesFc: Array.isArray(lookupSources.trees)
            ? featureCollectionFromPointRecords(lookupSources.trees)
            : null,
          streetLightsFc: Array.isArray(lookupSources.street_lights)
            ? featureCollectionFromPointRecords(lookupSources.street_lights)
            : null,
        };
      }
      return loadAmenitiesGeojsonFallback();
    })
    .catch(function () {
      return loadAmenitiesGeojsonFallback();
    })
    .then(function (payload) {
      const amenitiesProcessStartedAt = performance.now();
      const cleanFc = payload.cleanFc;
      const legacyFc = payload.legacyFc;
      const treesFc = payload.treesFc;
      const streetLightsFc = payload.streetLightsFc;

      allAmenitiesDataClean = cleanFc;
      const cleanScan = scanAmenityTypesFromFeatures(cleanFc);
      allAmenityTypesClean = cleanScan.types;
      typesWithDataClean = cleanScan.tw;

      if (legacyFc && (legacyFc.features || []).length > 0) {
        allAmenitiesDataLegacy = legacyFc;
        const legScan = scanAmenityTypesFromFeatures(legacyFc);
        allAmenityTypesLegacy = legScan.types;
        typesWithDataLegacy = legScan.tw;
      } else {
        allAmenitiesDataLegacy = null;
        allAmenityTypesLegacy = [];
        typesWithDataLegacy = new Set();
      }

      if (payload.source === "points_lookup" && treesFc) {
        pointDataLoader.setPointLookupData({ trees: treesFc });
      }

      if (payload.source === "points_lookup" && streetLightsFc) {
        pointDataLoader.setPointLookupData({ streetLights: streetLightsFc });
      }

      applyScoreModeAmenities();
      console.log(
        "[Load] amenities: process/apply complete in",
        Math.round(performance.now() - amenitiesProcessStartedAt) + "ms",
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

      loadingState.amenities = true;
      updateLoadingProgress();
      console.log(
        "[Load] amenities: complete total",
        Math.round(performance.now() - amenitiesStartedAt) + "ms"
      );

      if (map.getZoom() >= 13) {
        pointDataLoader.loadTreesIfNeeded();
      }
    })
    .catch(function (err) {
      console.error("Failed to load amenities:", err);
      loadingState.amenities = true;
      updateLoadingProgress();
    });
  
  // Mark trees as loaded for progress bar (they load lazily)
  loadingState.trees = true;
  updateLoadingProgress();

  loadingState.isochrones = true;
  updateLoadingProgress();
  console.log("[Load] isochrones: deferred until Amenities Focus needs walking areas");
  console.log(
    "[Load] app startup: async jobs queued in",
    Math.round(performance.now() - appLoadStartedAt) + "ms"
  );

  applyHouseModeHexBackground();

  map.getCanvas().style.cursor = "";
});

map.on("mouseenter", BUILDINGS_FILL_LAYER_ID, function () {
  if (!_deckHovering) map.getCanvas().style.cursor = "pointer";
});

map.on("mouseleave", BUILDINGS_FILL_LAYER_ID, function () {
  if (!_deckHovering) map.getCanvas().style.cursor = "";
});

map.on("mousemove", "parks-fill", function (e) {
  if (_deckHovering) return;
  map.getCanvas().style.cursor = "pointer";
  const p = e.features[0].properties;
  
  const lines = [];
  const name = p.name || "Unnamed Park";
  lines.push(name);
  
  if (p.area != null) {
    lines.push("Area: " + formatArea(p.area));
  }
  
  tooltip.textContent = lines.join("\n");
  tooltip.style.display = "block";
  tooltip.style.left = (e.point.x + 12) + "px";
  tooltip.style.top = (e.point.y + 12) + "px";
});

map.on("mouseleave", "parks-fill", function () {
  if (!_deckHovering) map.getCanvas().style.cursor = "";
  tooltip.style.display = "none";
});

// Info modal handling
const infoModal = document.getElementById("info-modal");
const infoBtn = document.getElementById("info-btn");
const modalClose = document.getElementById("modal-close");
const modalStart = document.getElementById("modal-start");
const modalTabs = document.querySelectorAll(".modal-tab");
const tabContents = document.querySelectorAll(".modal-tab-content");
Urban95InfoModal.bind({ infoModal, infoBtn, modalClose, modalStart, modalTabs, tabContents });

// Lazy load trees and street lights when zoomed in far enough
map.on("zoomend", function() {
  if (map.getZoom() >= 13) {
    pointDataLoader.loadTreesIfNeeded();
    pointDataLoader.loadStreetLightsIfNeeded();
  }
  if (getScoreModeState() === "weighted") {
    Urban95MapRenderers.updateTreesSource();
    Urban95MapRenderers.updateStreetLightsSource();
  }
});

// ─── Analysis Mode Management ───────────────────────────────────────

function addNeighborhoodLayers() {
  if (map.getLayer("neighborhoods-fill")) return;
  console.log("[Neighborhood] Adding layers dynamically");

  const surfaceBeforeId = map.getLayer(BUILDINGS_FILL_LAYER_ID) ? BUILDINGS_FILL_LAYER_ID : undefined;
  map.addLayer(
    Object.assign({
      id: "neighborhoods-surface",
      type: "fill",
      source: "neighborhood-score-surface",
      paint: {
        "fill-color": getNeighborhoodSurfaceColorExpression(getNeighborhoodSurfaceScorePropertyKey()),
        "fill-outline-color": getNeighborhoodSurfaceColorExpression(getNeighborhoodSurfaceScorePropertyKey()),
        "fill-opacity": Urban95Dashboards.getNeighborhoodHexSurfaceOpacityExpression(),
        "fill-antialias": true,
      },
      layout: { visibility: "none" },
    }, hasGeneratedArtifact("neighborhood_surface")
      ? {
          "source-layer": sourceLayer(
            "neighborhood_surface",
            NEIGHBORHOOD_SURFACE_SOURCE_LAYER_FALLBACK
          ),
        }
      : {}),
    surfaceBeforeId
  );

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
  // Skip label layer to avoid glyphs requirement issues
}


/**
 * House mode renders the hex score grid as a soft, borderless background underneath the
 * buildings. Non-residential hexes (gray "has_buildings == 0" cells) are filtered out so the
 * heatmap stays focused on areas relevant to the building analysis. The surface is explicitly
 * moved below the buildings fill layer so buildings always render fully opaque on top of the heatmap.
 */
function applyHouseModeHexBackground() {
  if (currentMode !== "house") return;
  const surfaceLoad = hasGeneratedArtifact("neighborhood_surface")
    ? Promise.resolve(null)
    : Urban95Dashboards.loadNeighborhoodSurfaceData();
  surfaceLoad.then(function () {
    if (currentMode !== "house") return;
    addNeighborhoodLayers();
    if (!map.getLayer("neighborhoods-surface")) return;
    if (map.getLayer(BUILDINGS_FILL_LAYER_ID)) {
      map.moveLayer("neighborhoods-surface", BUILDINGS_FILL_LAYER_ID);
    }
    map.setPaintProperty("neighborhoods-surface", "fill-opacity", HOUSE_MODE_HEX_OPACITY);
    map.setFilter("neighborhoods-surface", ["==", ["to-number", ["get", "has_buildings"], 0], 1]);
    const heatmapVisible = showHeatmapToggle ? showHeatmapToggle.checked : true;
    map.setLayoutProperty("neighborhoods-surface", "visibility", heatmapVisible ? "visible" : "none");
    Urban95MapRenderers.updateNeighborhoodSurfaceData();
  });
}

function switchMode(mode) {
  return urban95Perf.phase("switchMode", function () {
    if (mode === currentMode) return;
    const prevMode = currentMode;
    currentMode = mode;

    // Update toggle active state
    modeToggle.querySelectorAll(".mode-opt").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });

    // Clean up previous mode
    if (prevMode === "house") {
      Urban95Selection.clearRadiusSelection();
    }
    if (prevMode === "neighborhood") {
      Urban95Dashboards.hideNeighborhoodModal();
      selectedNeighborhood = null;
    }
    if (prevMode === "citywide") {
      Urban95Dashboards.hideCitywideModal();
    }

    // Activate new mode
    if (mode === "house") {
      enterHouseMode();
    } else if (mode === "neighborhood") {
      enterNeighborhoodMode();
    } else if (mode === "citywide") {
      enterCitywideMode();
    }
  });
}

function setControlsForMode(mode) {
  const showPointsSection = document.getElementById("points-visibility-section");
  const legendSection = document.querySelector(".legend-section");

  if (mode === "house") {
    if (showPointsSection) showPointsSection.style.display = "";
    if (legendSection) legendSection.style.display = "";
    if (modeHint) modeHint.textContent = "Click map to analyze nearest building";
  } else if (mode === "neighborhood") {
    if (showPointsSection) showPointsSection.style.display = "none";
    if (legendSection) legendSection.style.display = "";
    if (modeHint) modeHint.textContent = "Click a neighborhood for details";
  } else {
    if (showPointsSection) showPointsSection.style.display = "none";
    if (legendSection) legendSection.style.display = "none";
    if (modeHint) modeHint.textContent = "";
  }
  syncFilterUiForScoreMode();
  updateFilterLabel();
}

function enterHouseMode() {
  return urban95Perf.phase("enterHouseMode", function () {
    setControlsForMode("house");

    // Buildings render crisp on top of the soft hex heatmap background.
    if (map.getLayer(BUILDINGS_FILL_LAYER_ID)) {
      map.setLayoutProperty(BUILDINGS_FILL_LAYER_ID, "visibility", "visible");
      map.setPaintProperty(BUILDINGS_FILL_LAYER_ID, "fill-opacity", 1);
    }
    if (map.getLayer("neighborhoods-fill")) map.setLayoutProperty("neighborhoods-fill", "visibility", "none");
    if (map.getLayer("neighborhoods-line")) map.setLayoutProperty("neighborhoods-line", "visibility", "none");
    if (map.getLayer("neighborhoods-label")) map.setLayoutProperty("neighborhoods-label", "visibility", "none");

    Urban95MapRenderers.applyShowPointsToggle();
    Urban95MapRenderers.updateDeckAmenityLayers();
    Urban95MapRenderers.updateBuildingColors();
    applyHouseModeHexBackground();
  });
}

function enterNeighborhoodMode() {
  urban95Perf.phase("enterNeighborhoodMode:syncSetup", function () {
    console.log("[Neighborhood] Entering neighborhood mode");
    setControlsForMode("neighborhood");
    const radiusInfo = document.getElementById("radius-info");
    if (radiusInfo) radiusInfo.style.display = "none";

    // Hide building polygons and render a smooth aggregated heat layer.
    if (map.getLayer(BUILDINGS_FILL_LAYER_ID)) {
      map.setLayoutProperty(BUILDINGS_FILL_LAYER_ID, "visibility", "none");
    }
    if (map.getLayer("parks-fill")) {
      map.setLayoutProperty("parks-fill", "visibility", "none");
    }
    if (map.getLayer("neighborhoods-surface")) {
      map.setPaintProperty(
        "neighborhoods-surface",
        "fill-opacity",
        Urban95Dashboards.getNeighborhoodHexSurfaceOpacityExpression()
      );
      map.setFilter("neighborhoods-surface", null);
    }
    Urban95MapRenderers.setTreesAndLightsVisibility(false);
    Urban95MapRenderers.updateDeckAmenityLayers();
  });

  urban95Perf.phaseAsync(
    "enterNeighborhoodMode:loadsThenApply",
    Urban95Dashboards.loadNeighborhoods().then(function (data) {
      const surfaceLoad = hasGeneratedArtifact("neighborhood_surface")
        ? Promise.resolve(null)
        : Urban95Dashboards.loadNeighborhoodSurfaceData();
      return Promise.all([Urban95Dashboards.loadNeighborhoodChartsPayload(), surfaceLoad]).then(function () {
        urban95Perf.phase("enterNeighborhoodMode:applyLayersFitBounds", function () {
          const src = map.getSource("neighborhoods");
          if (src) src.setData(data);
          addNeighborhoodLayers();
          Urban95MapRenderers.updateNeighborhoodColors();

          if (map.getLayer("neighborhoods-surface")) map.setLayoutProperty("neighborhoods-surface", "visibility", "visible");
          if (map.getLayer("neighborhoods-fill")) map.setLayoutProperty("neighborhoods-fill", "visibility", "visible");
          if (map.getLayer("neighborhoods-line")) map.setLayoutProperty("neighborhoods-line", "visibility", "visible");
          if (map.getLayer("neighborhoods-label")) map.setLayoutProperty("neighborhoods-label", "visibility", "visible");
          console.log("[Neighborhood] Layers visible, source updated with", data.features.length, "features");

          if (data.features.length > 0) {
            const bbox = turf.bbox(data);
            map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, duration: 600 });
          }
        });
      });
    })
  );
}

function exitNeighborhoodMode() {
  return urban95Perf.phase("exitNeighborhoodMode", function () {
    if (map.getLayer(BUILDINGS_FILL_LAYER_ID)) {
      map.setLayoutProperty(BUILDINGS_FILL_LAYER_ID, "visibility", "visible");
      map.setPaintProperty(BUILDINGS_FILL_LAYER_ID, "fill-opacity", 1);
    }
    if (map.getLayer("neighborhoods-surface")) {
      map.setLayoutProperty("neighborhoods-surface", "visibility", "none");
    }
    if (map.getLayer("parks-fill")) {
      map.setLayoutProperty("parks-fill", "visibility", "visible");
    }
  });
}

function enterCitywideMode() {
  setControlsForMode("citywide");

  // Show neighborhood polygons as context
  Urban95Dashboards.loadNeighborhoods().then(function (data) {
    Urban95Dashboards.loadNeighborhoodChartsPayload().then(function () {
      const src = map.getSource("neighborhoods");
      if (src) src.setData(data);
      addNeighborhoodLayers();
      Urban95MapRenderers.updateNeighborhoodColors();
      if (map.getLayer("neighborhoods-surface")) map.setLayoutProperty("neighborhoods-surface", "visibility", "none");
      if (map.getLayer("neighborhoods-fill")) map.setLayoutProperty("neighborhoods-fill", "visibility", "visible");
      if (map.getLayer("neighborhoods-line")) map.setLayoutProperty("neighborhoods-line", "visibility", "visible");
      if (map.getLayer("neighborhoods-label")) map.setLayoutProperty("neighborhoods-label", "visibility", "visible");
    });
  });

  if (map.getLayer(BUILDINGS_FILL_LAYER_ID)) {
    map.setPaintProperty(BUILDINGS_FILL_LAYER_ID, "fill-opacity", 0.15);
    map.setPaintProperty(BUILDINGS_FILL_LAYER_ID, "fill-color", "#9ca3af");
  }
  Urban95MapRenderers.setTreesAndLightsVisibility(false);
  Urban95MapRenderers.updateDeckAmenityLayers();

  // Show citywide modal
  Urban95Dashboards.loadCitywideStats().then(function (data) {
    if (!data) {
      const body = document.getElementById("citywide-body");
      if (body) body.innerHTML = '<div class="cw-section" style="text-align:center;padding:2em">Failed to load citywide data. Please reload the page.</div>';
    }
    Urban95Dashboards.renderCitywideModal();
    Urban95Dashboards.showCitywideModal();
  });
}

// Neighborhood click handlers
map.on("click", "neighborhoods-fill", function(e) {
  if (currentMode !== "neighborhood") return;
  const feature = e.features && e.features.length > 0 ? e.features[0] : null;
  if (!feature) return;
  Urban95Dashboards.showNeighborhoodModal(feature);
});

map.on("click", "neighborhoods-surface", function(e) {
  if (currentMode !== "neighborhood") return;
  const neighborhoodFeature = Urban95Dashboards.getNeighborhoodFeatureAtPoint(e.point);
  if (!neighborhoodFeature) return;
  Urban95Dashboards.showNeighborhoodModal(neighborhoodFeature);
});

map.on("mouseenter", "neighborhoods-fill", function() {
  if (currentMode === "neighborhood") map.getCanvas().style.cursor = "pointer";
});

map.on("mouseenter", "neighborhoods-surface", function() {
  if (currentMode === "neighborhood") map.getCanvas().style.cursor = "pointer";
});

map.on("mouseleave", "neighborhoods-fill", function() {
  if (currentMode === "neighborhood") {
    map.getCanvas().style.cursor = "";
    tooltip.style.display = "none";
  }
});

map.on("mouseleave", "neighborhoods-surface", function() {
  if (currentMode === "neighborhood") {
    map.getCanvas().style.cursor = "";
    tooltip.style.display = "none";
  }
});

map.on("mousemove", "neighborhoods-fill", function(e) {
  if (currentMode !== "neighborhood") return;
  const areaFeature = map.queryRenderedFeatures(e.point, { layers: ["neighborhoods-surface"] })[0];
  Urban95Dashboards.showNeighborhoodAreaTooltip(e.point, areaFeature || null);
});

map.on("mousemove", "neighborhoods-surface", function(e) {
  if (currentMode !== "neighborhood" || !e.features || e.features.length === 0) return;
  Urban95Dashboards.showNeighborhoodAreaTooltip(e.point, e.features[0]);
});

