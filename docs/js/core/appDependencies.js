/* global maplibregl, turf, deck, pmtiles */

(function () {
var Urban95Config = requireNamespace(window, "Urban95Config");
var GENERATED_ARTIFACTS = requireNamespace(window, "Urban95DataArtifacts");
var CONFIG_URLS = requireNamespaceMember(Urban95Config, "Urban95Config", "urls", "object");
var GENERATED_URLS =
  requireNamespaceMember(GENERATED_ARTIFACTS, "Urban95DataArtifacts", "urls", "object");
var MAP_CONTRACTS = requireNamespaceMember(Urban95Config, "Urban95Config", "mapContracts", "object");
var ICONS_BASE = requireNamespaceMember(Urban95Config, "Urban95Config", "ICONS_BASE");
var BUILDINGS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "buildings");
var ROADS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "roads");
var EDUCATION_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "education");
var BUS_STOPS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "busStops");
var POPULATION_GRID_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "populationGrid");
var SOCIOECONOMIC_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "socioeconomic");
var BUILDINGS_LOOKUP_URL = requireStringMember(GENERATED_URLS, "Urban95DataArtifacts.urls", "buildingsLookup");
var PARKS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "parks");
var SHADE_SI_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "shadeSi");
var URBAN_NATURE_AREAS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "urbanNatureAreas");
var TREES_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "trees");
var STREET_LIGHTS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "streetLights");
var AMENITIES_CLEAN_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "amenitiesClean");
var AMENITIES_LEGACY_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "amenitiesLegacy");
var ISOCHRONES_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "isochrones");
var ISOCHRONES_LOOKUP_URL = requireStringMember(GENERATED_URLS, "Urban95DataArtifacts.urls", "isochronesLookup");
var POINTS_LOOKUP_URL = requireStringMember(GENERATED_URLS, "Urban95DataArtifacts.urls", "pointsLookup");
var NEIGHBORHOODS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "neighborhoods");
var NEIGHBORHOOD_SURFACE_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "neighborhoodSurface");
var BUILDINGS_PMTILES_URL = requireStringMember(GENERATED_URLS, "Urban95DataArtifacts.urls", "buildingsPmtiles");
var NEIGHBORHOOD_SURFACE_PMTILES_URL =
  requireStringMember(GENERATED_URLS, "Urban95DataArtifacts.urls", "neighborhoodSurfacePmtiles");
var TREES_PMTILES_URL = requireStringMember(GENERATED_URLS, "Urban95DataArtifacts.urls", "treesPmtiles");
var STREET_LIGHTS_PMTILES_URL =
  requireStringMember(GENERATED_URLS, "Urban95DataArtifacts.urls", "streetLightsPmtiles");
var NEIGHBORHOOD_CHARTS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "neighborhoodCharts");
var CITYWIDE_STATS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "citywideStats");
var SURVEY_RESULTS_URL = requireStringMember(CONFIG_URLS, "Urban95Config.urls", "surveyResults");
var SURVEY_CATEGORIES =
  requireNamespaceMember(Urban95Config, "Urban95Config", "surveyCategories", "object");
var NEIGHBORHOOD_SURFACE_SOURCE_LAYER_FALLBACK =
  requireStringMember(MAP_CONTRACTS, "Urban95Config.mapContracts", "neighborhoodSurfaceSourceLayerFallback");
var hasGeneratedArtifact =
  requireNamespaceMember(GENERATED_ARTIFACTS, "Urban95DataArtifacts", "hasGeneratedArtifact", "function");
var sourceLayer =
  requireNamespaceMember(GENERATED_ARTIFACTS, "Urban95DataArtifacts", "sourceLayer", "function");
var vectorSourceOrGeojson =
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

var Urban95Loaders = requireNamespace(window, "Urban95Loaders");
var fetchJsonWithGzipFallback =
  requireNamespaceMember(
    Urban95Loaders,
    "Urban95Loaders",
    "fetchJsonWithGzipFallback",
    "function"
  );
var ensureDeckGlLoaded =
  requireNamespaceMember(Urban95Loaders, "Urban95Loaders", "ensureDeckGlLoaded", "function");
var ensureChartJsLoaded =
  requireNamespaceMember(Urban95Loaders, "Urban95Loaders", "ensureChartJsLoaded", "function");

var Urban95Logger = requireNamespace(window, "Urban95Logger");
requireNamespaceMember(Urban95Logger, "Urban95Logger", "debug", "function");
requireNamespaceMember(Urban95Logger, "Urban95Logger", "perf", "function");
requireNamespaceMember(Urban95Logger, "Urban95Logger", "warn", "function");
requireNamespaceMember(Urban95Logger, "Urban95Logger", "error", "function");

var urban95RuntimeData = requireNamespace(window, "Urban95RuntimeData");
var createRuntimeLoaders =
  requireNamespaceMember(urban95RuntimeData, "Urban95RuntimeData", "createLoaders", "function");
var compactIsochroneFeature =
  requireNamespaceMember(urban95RuntimeData, "Urban95RuntimeData", "compactIsochroneFeature", "function");
var featureCollectionFromPointRecords =
  requireNamespaceMember(urban95RuntimeData, "Urban95RuntimeData", "featureCollectionFromPointRecords", "function");
var hasValidPointsLookupSources =
  requireNamespaceMember(urban95RuntimeData, "Urban95RuntimeData", "hasValidPointsLookupSources", "function");
var warnIfBuildingScoresIncomplete =
  requireNamespaceMember(urban95RuntimeData, "Urban95RuntimeData", "warnIfBuildingScoresIncomplete", "function");
var scanAmenityTypesFromFeatures =
  requireNamespaceMember(urban95RuntimeData, "Urban95RuntimeData", "scanAmenityTypesFromFeatures", "function");
var createPointDataLoader =
  requireNamespaceMember(urban95RuntimeData, "Urban95RuntimeData", "createPointDataLoader", "function");

var Urban95Startup = requireNamespace(window, "Urban95Startup");
requireNamespaceMember(Urban95Startup, "Urban95Startup", "run", "function");
var Urban95LoadingUi = requireNamespace(window, "Urban95LoadingUi");
var createLoadingUi =
  requireNamespaceMember(Urban95LoadingUi, "Urban95LoadingUi", "create", "function");
var Urban95PointDataSources = requireNamespace(window, "Urban95PointDataSources");
requireNamespaceMember(Urban95PointDataSources, "Urban95PointDataSources", "create", "function");

var urban95RuntimeLoaders =
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

var Urban95ScoreModel = requireNamespace(window, "Urban95ScoreModel");
var Urban95StatusScale = requireNamespace(window, "Urban95StatusScale");
requireNamespaceMember(Urban95StatusScale, "Urban95StatusScale", "normalize", "function");
requireNamespaceMember(Urban95StatusScale, "Urban95StatusScale", "matchExpression", "function");
var AMENITY_TYPE_CONFIG = requireScoreModelMember(Urban95ScoreModel, "AMENITY_TYPE_CONFIG");
var DEFAULT_CONFIG = requireScoreModelMember(Urban95ScoreModel, "DEFAULT_CONFIG");
var WEIGHTED_CATEGORY_LABEL_BY_STEM = requireScoreModelMember(Urban95ScoreModel, "WEIGHTED_CATEGORY_LABEL_BY_STEM");
var getAmenityConfig = requireScoreModelMember(Urban95ScoreModel, "getAmenityConfig");
var amenityTypeToBuildingStatKey =
  requireScoreModelMember(Urban95ScoreModel, "amenityTypeToBuildingStatKey");
var percentileBreakpoints = requireScoreModelMember(Urban95ScoreModel, "percentileBreakpoints");
var getColorForValue = requireScoreModelMember(Urban95ScoreModel, "getColorForValue");
var bulkPercentileRanks = requireScoreModelMember(Urban95ScoreModel, "bulkPercentileRanks");
var formatMetricNumber = requireScoreModelMember(Urban95ScoreModel, "formatMetricNumber");
var formatScoreInteger = requireScoreModelMember(Urban95ScoreModel, "formatScoreInteger");
var Urban95WeightedMetricShowRegistry = requireNamespace(window, "Urban95WeightedMetricShowRegistry");
requireNamespaceMember(
  Urban95WeightedMetricShowRegistry,
  "Urban95WeightedMetricShowRegistry",
  "resolveWeightedShowActions",
  "function"
);
var Urban95ScoreContext = requireNamespace(window, "Urban95ScoreContext");
requireNamespaceMember(Urban95ScoreContext, "Urban95ScoreContext", "create", "function");
var Urban95ScoreExplain = requireNamespace(window, "Urban95ScoreExplain");
requireNamespaceMember(Urban95ScoreExplain, "Urban95ScoreExplain", "create", "function");
var Urban95ScoreSidebarChrome = requireNamespace(window, "Urban95ScoreSidebarChrome");
requireNamespaceMember(
  Urban95ScoreSidebarChrome,
  "Urban95ScoreSidebarChrome",
  "create",
  "function"
);
var Urban95AmenityMode = requireNamespace(window, "Urban95AmenityMode");
requireNamespaceMember(Urban95AmenityMode, "Urban95AmenityMode", "create", "function");
var Urban95ControlActions = requireNamespace(window, "Urban95ControlActions");
requireNamespaceMember(Urban95ControlActions, "Urban95ControlActions", "create", "function");
var Urban95IconLoader = requireNamespace(window, "Urban95IconLoader");
requireNamespaceMember(Urban95IconLoader, "Urban95IconLoader", "create", "function");
var Urban95MapLayers = requireNamespace(window, "Urban95MapLayers");
var Urban95MapShell = requireNamespace(window, "Urban95MapShell");
var createBaseMap =
  requireNamespaceMember(Urban95MapShell, "Urban95MapShell", "createBaseMap", "function");
var applyBasemap =
  requireNamespaceMember(Urban95MapShell, "Urban95MapShell", "applyBasemap", "function");
var Urban95NeighborhoodScores = requireNamespace(window, "Urban95NeighborhoodScores");
requireNamespaceMember(
  Urban95NeighborhoodScores,
  "Urban95NeighborhoodScores",
  "create",
  "function"
);
var Urban95RenderState = requireNamespace(window, "Urban95RenderState");
[
  "getWeightedNeighborhoodMetricValue",
  "hasWeightedNeighborhoodMetricData",
  "resolvePolygonAnalysisFilter",
].forEach(function (memberName) {
  requireNamespaceMember(Urban95RenderState, "Urban95RenderState", memberName, "function");
});
var resolveBuildingContracts =
  requireNamespaceMember(
    Urban95MapLayers,
    "Urban95MapLayers",
    "resolveBuildingContracts",
    "function"
  );
var createPmtilesProtocol =
  requireNamespaceMember(
    Urban95MapLayers,
    "Urban95MapLayers",
    "createPmtilesProtocol",
    "function"
  );
var createBuildingsSource =
  requireNamespaceMember(
    Urban95MapLayers,
    "Urban95MapLayers",
    "createBuildingsSource",
    "function"
  );
var createBuildingFillColorExpression =
  requireNamespaceMember(
    Urban95MapLayers,
    "Urban95MapLayers",
    "createBuildingFillColorExpression",
    "function"
  );
var createBuildingsFillLayer =
  requireNamespaceMember(
    Urban95MapLayers,
    "Urban95MapLayers",
    "createBuildingsFillLayer",
    "function"
  );
var createBuildingsSelectedLayer =
  requireNamespaceMember(
    Urban95MapLayers,
    "Urban95MapLayers",
    "createBuildingsSelectedLayer",
    "function"
  );
var applyParkDotPattern =
  requireNamespaceMember(
    Urban95MapLayers,
    "Urban95MapLayers",
    "applyParkDotPattern",
    "function"
  );
var applyUrbanNatureDotPattern =
  requireNamespaceMember(
    Urban95MapLayers,
    "Urban95MapLayers",
    "applyUrbanNatureDotPattern",
    "function"
  );
var Urban95ScoreSidebar = requireNamespace(window, "Urban95ScoreSidebar");
requireNamespaceMember(Urban95ScoreSidebar, "Urban95ScoreSidebar", "configure", "function");
requireNamespaceMember(Urban95ScoreSidebar, "Urban95ScoreSidebar", "show", "function");
requireNamespaceMember(Urban95ScoreSidebar, "Urban95ScoreSidebar", "hide", "function");
requireNamespaceMember(Urban95ScoreSidebar, "Urban95ScoreSidebar", "sync", "function");
requireNamespaceMember(Urban95ScoreSidebar, "Urban95ScoreSidebar", "isOpen", "function");
var Urban95SidebarChromeBindings = requireNamespace(window, "Urban95SidebarChromeBindings");
var Urban95NeighborhoodPanelRender = requireNamespace(window, "Urban95NeighborhoodPanelRender");
var Urban95NeighborhoodCompareRender = requireNamespace(window, "Urban95NeighborhoodCompareRender");
requireNamespaceMember(Urban95NeighborhoodCompareRender, "Urban95NeighborhoodCompareRender", "render", "function");
var Urban95NeighborhoodSelection = requireNamespace(window, "Urban95NeighborhoodSelection");
requireNamespaceMember(Urban95NeighborhoodSelection, "Urban95NeighborhoodSelection", "create", "function");
var Urban95NeighborhoodSelectionHighlight = requireNamespace(
  window,
  "Urban95NeighborhoodSelectionHighlight"
);
[
  "configure",
  "applyCompareSlots",
  "applyCitySelection",
  "clearCompare",
  "restoreAfterNeighborhoodData",
].forEach(function (memberName) {
  requireNamespaceMember(
    Urban95NeighborhoodSelectionHighlight,
    "Urban95NeighborhoodSelectionHighlight",
    memberName,
    "function"
  );
});
var Urban95NeighborhoodSidebar = requireNamespace(window, "Urban95NeighborhoodSidebar");
requireNamespaceMember(Urban95NeighborhoodSidebar, "Urban95NeighborhoodSidebar", "configure", "function");
requireNamespaceMember(Urban95NeighborhoodSidebar, "Urban95NeighborhoodSidebar", "show", "function");
requireNamespaceMember(Urban95NeighborhoodSidebar, "Urban95NeighborhoodSidebar", "showCompare", "function");
requireNamespaceMember(Urban95NeighborhoodSidebar, "Urban95NeighborhoodSidebar", "sync", "function");
requireNamespaceMember(Urban95NeighborhoodSidebar, "Urban95NeighborhoodSidebar", "hide", "function");
requireNamespaceMember(Urban95NeighborhoodSidebar, "Urban95NeighborhoodSidebar", "isOpen", "function");
var Urban95NeighborhoodCompareApply = requireNamespace(window, "Urban95NeighborhoodCompareApply");
[
  "configure",
  "applyClick",
  "removeSlot",
  "clearAll",
  "resync",
].forEach(function (memberName) {
  requireNamespaceMember(
    Urban95NeighborhoodCompareApply,
    "Urban95NeighborhoodCompareApply",
    memberName,
    "function"
  );
});
var Urban95CityGapModes = requireNamespace(window, "Urban95CityGapModes");
requireNamespaceMember(Urban95CityGapModes, "Urban95CityGapModes", "MODES", "object");
requireNamespaceMember(Urban95CityGapModes, "Urban95CityGapModes", "DEFAULT_MODE", "string");
requireNamespaceMember(Urban95CityGapModes, "Urban95CityGapModes", "normalizeMode", "function");
requireNamespaceMember(Urban95CityGapModes, "Urban95CityGapModes", "computeCuts", "function");
requireNamespaceMember(Urban95CityGapModes, "Urban95CityGapModes", "computeLargeWeakNames", "function");
requireNamespaceMember(Urban95CityGapModes, "Urban95CityGapModes", "buildGapCuts", "function");
requireNamespaceMember(Urban95CityGapModes, "Urban95CityGapModes", "cutForMode", "function");
requireNamespaceMember(Urban95CityGapModes, "Urban95CityGapModes", "isInGap", "function");
var Urban95CityPanelRender = requireNamespace(window, "Urban95CityPanelRender");
requireNamespaceMember(Urban95CityPanelRender, "Urban95CityPanelRender", "populateHeader", "function");
requireNamespaceMember(Urban95CityPanelRender, "Urban95CityPanelRender", "buildBodyHTML", "function");
requireNamespaceMember(Urban95CityPanelRender, "Urban95CityPanelRender", "bindCharts", "function");
requireNamespaceMember(Urban95CityPanelRender, "Urban95CityPanelRender", "destroyCharts", "function");
var Urban95CitySidebar = requireNamespace(window, "Urban95CitySidebar");
requireNamespaceMember(Urban95CitySidebar, "Urban95CitySidebar", "configure", "function");
requireNamespaceMember(Urban95CitySidebar, "Urban95CitySidebar", "openShell", "function");
requireNamespaceMember(Urban95CitySidebar, "Urban95CitySidebar", "sync", "function");
requireNamespaceMember(Urban95CitySidebar, "Urban95CitySidebar", "hide", "function");
requireNamespaceMember(Urban95CitySidebar, "Urban95CitySidebar", "dismiss", "function");
requireNamespaceMember(Urban95CitySidebar, "Urban95CitySidebar", "isOpen", "function");
requireNamespaceMember(Urban95CitySidebar, "Urban95CitySidebar", "setSelection", "function");
requireNamespaceMember(Urban95CitySidebar, "Urban95CitySidebar", "getSelection", "function");
requireNamespaceMember(Urban95CitySidebar, "Urban95CitySidebar", "setGapMode", "function");
requireNamespaceMember(Urban95CitySidebar, "Urban95CitySidebar", "setGapState", "function");
requireNamespaceMember(Urban95CitySidebar, "Urban95CitySidebar", "getGapState", "function");
var Urban95InfoModal = requireNamespace(window, "Urban95InfoModal");
requireNamespaceMember(Urban95InfoModal, "Urban95InfoModal", "bind", "function");
var Urban95Dashboards = requireNamespace(window, "Urban95Dashboards");
requireNamespaceMember(Urban95Dashboards, "Urban95Dashboards", "configure", "function");
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
requireNamespaceMember(
  Urban95Dashboards,
  "Urban95Dashboards",
  "pieSlicesFromInventoryCounts",
  "function"
);
var Urban95ModeController = requireNamespace(window, "Urban95ModeController");
requireNamespaceMember(Urban95ModeController, "Urban95ModeController", "create", "function");
var Urban95MapEvents = requireNamespace(window, "Urban95MapEvents");
requireNamespaceMember(Urban95MapEvents, "Urban95MapEvents", "bind", "function");
var Urban95SurveyOverlay = requireNamespace(window, "Urban95SurveyOverlay");
requireNamespaceMember(Urban95SurveyOverlay, "Urban95SurveyOverlay", "create", "function");
var Urban95AuxiliaryOverlays = requireNamespace(window, "Urban95AuxiliaryOverlays");
requireNamespaceMember(Urban95AuxiliaryOverlays, "Urban95AuxiliaryOverlays", "create", "function");
var Urban95OverlayVisibility = requireNamespace(window, "Urban95OverlayVisibility");
requireNamespaceMember(Urban95OverlayVisibility, "Urban95OverlayVisibility", "create", "function");
var Urban95MapRenderers = requireNamespace(window, "Urban95MapRenderers");
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
  "updateNeighborhoodSurfaceData",
  "updateNeighborhoodColors",
].forEach(function (memberName) {
  requireNamespaceMember(Urban95MapRenderers, "Urban95MapRenderers", memberName, "function");
});
var Urban95Selection = requireNamespace(window, "Urban95Selection");
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
var Urban95Controls = requireNamespace(window, "Urban95Controls");
requireNamespaceMember(Urban95Controls, "Urban95Controls", "bind", "function");
var Urban95AppState = requireNamespace(window, "Urban95AppState");
var createAppState =
  requireNamespaceMember(Urban95AppState, "Urban95AppState", "create", "function");

window.Urban95AppDependencies = {
  Urban95Config: Urban95Config,
  GENERATED_ARTIFACTS: GENERATED_ARTIFACTS,
  CONFIG_URLS: CONFIG_URLS,
  GENERATED_URLS: GENERATED_URLS,
  MAP_CONTRACTS: MAP_CONTRACTS,
  ICONS_BASE: ICONS_BASE,
  BUILDINGS_URL: BUILDINGS_URL,
  ROADS_URL: ROADS_URL,
  EDUCATION_URL: EDUCATION_URL,
  BUS_STOPS_URL: BUS_STOPS_URL,
  POPULATION_GRID_URL: POPULATION_GRID_URL,
  SOCIOECONOMIC_URL: SOCIOECONOMIC_URL,
  BUILDINGS_LOOKUP_URL: BUILDINGS_LOOKUP_URL,
  PARKS_URL: PARKS_URL,
  SHADE_SI_URL: SHADE_SI_URL,
  URBAN_NATURE_AREAS_URL: URBAN_NATURE_AREAS_URL,
  TREES_URL: TREES_URL,
  STREET_LIGHTS_URL: STREET_LIGHTS_URL,
  AMENITIES_CLEAN_URL: AMENITIES_CLEAN_URL,
  AMENITIES_LEGACY_URL: AMENITIES_LEGACY_URL,
  ISOCHRONES_URL: ISOCHRONES_URL,
  ISOCHRONES_LOOKUP_URL: ISOCHRONES_LOOKUP_URL,
  POINTS_LOOKUP_URL: POINTS_LOOKUP_URL,
  NEIGHBORHOODS_URL: NEIGHBORHOODS_URL,
  NEIGHBORHOOD_SURFACE_URL: NEIGHBORHOOD_SURFACE_URL,
  BUILDINGS_PMTILES_URL: BUILDINGS_PMTILES_URL,
  NEIGHBORHOOD_SURFACE_PMTILES_URL: NEIGHBORHOOD_SURFACE_PMTILES_URL,
  TREES_PMTILES_URL: TREES_PMTILES_URL,
  STREET_LIGHTS_PMTILES_URL: STREET_LIGHTS_PMTILES_URL,
  NEIGHBORHOOD_CHARTS_URL: NEIGHBORHOOD_CHARTS_URL,
  CITYWIDE_STATS_URL: CITYWIDE_STATS_URL,
  SURVEY_RESULTS_URL: SURVEY_RESULTS_URL,
  SURVEY_CATEGORIES: SURVEY_CATEGORIES,
  NEIGHBORHOOD_SURFACE_SOURCE_LAYER_FALLBACK: NEIGHBORHOOD_SURFACE_SOURCE_LAYER_FALLBACK,
  hasGeneratedArtifact: hasGeneratedArtifact,
  sourceLayer: sourceLayer,
  vectorSourceOrGeojson: vectorSourceOrGeojson,
  fetchJsonWithGzipFallback: fetchJsonWithGzipFallback,
  ensureDeckGlLoaded: ensureDeckGlLoaded,
  ensureChartJsLoaded: ensureChartJsLoaded,
  Urban95Logger: Urban95Logger,
  urban95RuntimeData: urban95RuntimeData,
  createRuntimeLoaders: createRuntimeLoaders,
  compactIsochroneFeature: compactIsochroneFeature,
  featureCollectionFromPointRecords: featureCollectionFromPointRecords,
  hasValidPointsLookupSources: hasValidPointsLookupSources,
  warnIfBuildingScoresIncomplete: warnIfBuildingScoresIncomplete,
  scanAmenityTypesFromFeatures: scanAmenityTypesFromFeatures,
  createPointDataLoader: createPointDataLoader,
  Urban95Startup: Urban95Startup,
  Urban95LoadingUi: Urban95LoadingUi,
  createLoadingUi: createLoadingUi,
  Urban95PointDataSources: Urban95PointDataSources,
  urban95RuntimeLoaders: urban95RuntimeLoaders,
  Urban95ScoreModel: Urban95ScoreModel,
  Urban95StatusScale: Urban95StatusScale,
  AMENITY_TYPE_CONFIG: AMENITY_TYPE_CONFIG,
  DEFAULT_CONFIG: DEFAULT_CONFIG,
  WEIGHTED_CATEGORY_LABEL_BY_STEM: WEIGHTED_CATEGORY_LABEL_BY_STEM,
  getAmenityConfig: getAmenityConfig,
  amenityTypeToBuildingStatKey: amenityTypeToBuildingStatKey,
  percentileBreakpoints: percentileBreakpoints,
  getColorForValue: getColorForValue,
  bulkPercentileRanks: bulkPercentileRanks,
  formatMetricNumber: formatMetricNumber,
  formatScoreInteger: formatScoreInteger,
  Urban95WeightedMetricShowRegistry: Urban95WeightedMetricShowRegistry,
  Urban95ScoreContext: Urban95ScoreContext,
  Urban95ScoreExplain: Urban95ScoreExplain,
  Urban95ScoreSidebarChrome: Urban95ScoreSidebarChrome,
  Urban95AmenityMode: Urban95AmenityMode,
  Urban95ControlActions: Urban95ControlActions,
  Urban95IconLoader: Urban95IconLoader,
  Urban95MapLayers: Urban95MapLayers,
  Urban95MapShell: Urban95MapShell,
  createBaseMap: createBaseMap,
  applyBasemap: applyBasemap,
  Urban95NeighborhoodScores: Urban95NeighborhoodScores,
  Urban95RenderState: Urban95RenderState,
  resolveBuildingContracts: resolveBuildingContracts,
  createBuildingFillColorExpression: createBuildingFillColorExpression,
  createPmtilesProtocol: createPmtilesProtocol,
  createBuildingsSource: createBuildingsSource,
  createBuildingsFillLayer: createBuildingsFillLayer,
  createBuildingsSelectedLayer: createBuildingsSelectedLayer,
  applyParkDotPattern: applyParkDotPattern,
  applyUrbanNatureDotPattern: applyUrbanNatureDotPattern,
  Urban95ScoreSidebar: Urban95ScoreSidebar,
  Urban95InfoModal: Urban95InfoModal,
  Urban95Dashboards: Urban95Dashboards,
  Urban95ModeController: Urban95ModeController,
  Urban95MapEvents: Urban95MapEvents,
  Urban95SurveyOverlay: Urban95SurveyOverlay,
  Urban95AuxiliaryOverlays: Urban95AuxiliaryOverlays,
  Urban95OverlayVisibility: Urban95OverlayVisibility,
  Urban95MapRenderers: Urban95MapRenderers,
  Urban95NeighborhoodSelection: Urban95NeighborhoodSelection,
  Urban95NeighborhoodSelectionHighlight: Urban95NeighborhoodSelectionHighlight,
  Urban95NeighborhoodCompareRender: Urban95NeighborhoodCompareRender,
  Urban95NeighborhoodCompareApply: Urban95NeighborhoodCompareApply,
  Urban95Selection: Urban95Selection,
  Urban95Controls: Urban95Controls,
  Urban95AppState: Urban95AppState,
  createAppState: createAppState,
};
})();
