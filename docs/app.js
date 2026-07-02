const {
  Urban95Config,
  GENERATED_ARTIFACTS,
  ICONS_BASE,
  BUILDINGS_URL,
  ROADS_URL,
  EDUCATION_URL,
  BUS_STOPS_URL,
  POPULATION_GRID_URL,
  SOCIOECONOMIC_URL,
  PARKS_URL,
  URBAN_NATURE_AREAS_URL,
  TREES_URL,
  STREET_LIGHTS_URL,
  AMENITIES_CLEAN_URL,
  AMENITIES_LEGACY_URL,
  ISOCHRONES_URL,
  NEIGHBORHOODS_URL,
  NEIGHBORHOOD_SURFACE_URL,
  BUILDINGS_PMTILES_URL,
  NEIGHBORHOOD_SURFACE_PMTILES_URL,
  TREES_PMTILES_URL,
  STREET_LIGHTS_PMTILES_URL,
  NEIGHBORHOOD_CHARTS_URL,
  CITYWIDE_STATS_URL,
  NEIGHBORHOOD_SURFACE_SOURCE_LAYER_FALLBACK,
  hasGeneratedArtifact,
  sourceLayer,
  vectorSourceOrGeojson,
  fetchJsonWithGzipFallback,
  ensureDeckGlLoaded,
  ensureChartJsLoaded,
  Urban95Logger,
  compactIsochroneFeature,
  featureCollectionFromPointRecords,
  hasValidPointsLookupSources,
  warnIfBuildingScoresIncomplete,
  scanAmenityTypesFromFeatures,
  createPointDataLoader,
  Urban95Startup,
  Urban95LoadingUi,
  Urban95PointDataSources,
  urban95RuntimeLoaders,
  Urban95ScoreModel,
  AMENITY_TYPE_CONFIG,
  DEFAULT_CONFIG,
  WEIGHTED_CATEGORY_LABEL_BY_STEM,
  getAmenityConfig,
  amenityTypeToBuildingStatKey,
  percentileBreakpoints,
  buildHistogramDistributionFromScores,
  getColorForValue,
  bulkPercentileRanks,
  formatMetricNumber,
  formatScoreInteger,
  weightedCategoryHighlightsFromSource,
  weightedSubcategoryComparisonRows,
  Urban95WeightedMetricShowRegistry,
  Urban95ScoreContext,
  Urban95ScoreExplain,
  Urban95ScoreSidebarChrome,
  Urban95AmenityMode,
  Urban95ControlActions,
  Urban95IconLoader,
  createBaseMap,
  applyBasemap,
  Urban95NeighborhoodScores,
  Urban95RenderState,
  resolveBuildingContracts,
  createPmtilesProtocol,
  createBuildingsSource,
  createBuildingsFillLayer,
  createBuildingsSelectedLayer,
  applyParkDotPattern,
  applyUrbanNatureDotPattern,
  Urban95ScoreSidebar,
  Urban95InfoModal,
  Urban95Dashboards,
  Urban95ModeController,
  Urban95MapEvents,
  Urban95OverlayVisibility,
  Urban95MapRenderers,
  Urban95Selection,
  Urban95Controls,
  createAppState,
} = window.Urban95AppDependencies;

const appState = createAppState();
const getScoreModeState = appState.getScoreMode.bind(appState);
const setScoreModeState = appState.setScoreMode.bind(appState);
const getWalkMinutesState = appState.getWalkMinutes.bind(appState);
const setWalkMinutesState = appState.setWalkMinutes.bind(appState);
const getActiveHeatmapIdState = appState.getActiveHeatmapId.bind(appState);
const setActiveHeatmapIdState = appState.setActiveHeatmapId.bind(appState);
const getSelectedAmenityTypesState = appState.getSelectedAmenityTypes.bind(appState);
const setSelectedAmenityTypesState = appState.setSelectedAmenityTypes.bind(appState);
const getWeightedShownAmenityTypesState = appState.getWeightedShownAmenityTypes.bind(appState);
const setWeightedShownAmenityTypesState = appState.setWeightedShownAmenityTypes.bind(appState);
const getAllFilterTypesState = appState.getAllFilterTypes.bind(appState);
const setAllFilterTypesState = appState.setAllFilterTypes.bind(appState);
const getAmenitiesInRadiusIdsState = appState.getAmenitiesInRadiusIds.bind(appState);
const setAmenitiesInRadiusIdsState = appState.setAmenitiesInRadiusIds.bind(appState);
const clearRadiusIdsState = appState.clearRadiusIds.bind(appState);
const getLatestRadiusCountsState = appState.getLatestRadiusCounts.bind(appState);
const setLatestRadiusCountsState = appState.setLatestRadiusCounts.bind(appState);
const getLastFilterRadioSelectionState = appState.getLastFilterRadioSelection.bind(appState);
const setLastFilterRadioSelectionState = appState.setLastFilterRadioSelection.bind(appState);
const hasPercentileSeriesState = appState.hasPercentileSeries.bind(appState);
const getPercentileSeriesState = appState.getPercentileSeries.bind(appState);
const setPercentileSeriesState = appState.setPercentileSeries.bind(appState);
const hasBuildingAmenityStatKeysState = appState.hasBuildingAmenityStatKeys.bind(appState);
const getBuildingAmenityStatKeysState = appState.getBuildingAmenityStatKeys.bind(appState);
const setBuildingAmenityStatKeysState = appState.setBuildingAmenityStatKeys.bind(appState);
const clearDerivedCachesState = appState.clearDerivedCaches.bind(appState);
const getLayerVisibilityState = appState.getLayerVisibility.bind(appState);
const setLayerVisibilityState = appState.setLayerVisibility.bind(appState);
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
const urban95Perf = window.urban95Perf;
const map = createBaseMap({
  maplibregl: maplibregl,
  hasGeneratedArtifact: hasGeneratedArtifact,
  vectorSourceOrGeojson: vectorSourceOrGeojson,
  roadsUrl: ROADS_URL,
  buildingsMapSourceId: BUILDINGS_MAP_SOURCE_ID,
  buildingsSource: _urban95BuildingsSource,
  buildingsFillLayer: _urban95BuildingsFillLayer,
  buildingsSelectedLayer: _urban95BuildingsSelectedLayer,
  treesPmtilesUrl: TREES_PMTILES_URL,
  streetLightsPmtilesUrl: STREET_LIGHTS_PMTILES_URL,
  neighborhoodSurfacePmtilesUrl: NEIGHBORHOOD_SURFACE_PMTILES_URL,
});
const controlSidebarEl = document.getElementById("control-sidebar");
const controlSidebarBodyEl = document.getElementById("control-sidebar-body");
const controlLegendEl = document.getElementById("control-legend");
const filterBackdrop = document.getElementById("filter-backdrop");
const SYM_PCT_KEY = "_u95_symb_pct";
const tooltip = document.getElementById("tooltip");
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
const neighborhoodSidebarEl = document.getElementById("neighborhood-sidebar");
const neighborhoodSidebarCloseEl = document.getElementById("neighborhood-sidebar-close");
const neighborhoodSidebarHeroEl = document.getElementById("neighborhood-sidebar-hero");
const neighborhoodSidebarEyebrowEl = document.getElementById("neighborhood-sidebar-eyebrow");
const neighborhoodSidebarMetaEl = document.getElementById("neighborhood-sidebar-meta");
const neighborhoodSidebarBodyEl = document.getElementById("neighborhood-sidebar-body");
const neighborhoodSidebarEmptyEl = document.getElementById("neighborhood-sidebar-empty");
const neighborhoodSidebarBackdropEl = document.getElementById("neighborhood-sidebar-backdrop");
let controlsBinding = null;
let controlSidebarAdapter = null;
function getControlUiElements() {
  return controlsBinding && typeof controlsBinding.getUiElements === "function"
    ? controlsBinding.getUiElements()
    : {};
}
const URBAN95_FIXED_MINUTES = 10;
const URBAN95_REFERENCE_RADIUS_METERS = 300;
const BUILDING_CENTROID_GRID_CELL_DEGREES = 0.002;
const BUILDING_CENTROID_MAX_GRID_RING = 4;
const BUILDING_CENTROID_MIN_CANDIDATES = 24;
const pointDataSources = Urban95PointDataSources.create({
  loadPointsLookup: urban95RuntimeLoaders.loadPointsLookup,
  fetchJsonWithGzipFallback: fetchJsonWithGzipFallback,
  amenitiesCleanUrl: AMENITIES_CLEAN_URL,
  amenitiesLegacyUrl: AMENITIES_LEGACY_URL,
});
const loadPointsLookup = pointDataSources.loadPointsLookup;
const loadAmenitiesGeojsonFallback = pointDataSources.loadAmenitiesGeojsonFallback;
const neighborhoodScores = Urban95NeighborhoodScores.create({
  turf: turf,
  getScoreMode: getScoreModeState,
  getWalkMinutes: getWalkMinutesState,
  getActiveMetric: getActiveMetricState,
  fixedMinutes: URBAN95_FIXED_MINUTES,
});
const getZoomForPolygon = neighborhoodScores.getZoomForPolygon;
const getNeighborhoodAverageKey = neighborhoodScores.getNeighborhoodAverageKey;
const getNeighborhoodPercentileKey = neighborhoodScores.getNeighborhoodPercentileKey;
const getScoreMinutes = neighborhoodScores.getScoreMinutes;
const getNeighborhoodSurfaceScorePropertyKey =
  neighborhoodScores.getNeighborhoodSurfaceScorePropertyKey;
const getNeighborhoodSurfaceColorExpression =
  neighborhoodScores.getNeighborhoodSurfaceColorExpression;
const getWeightedNeighborhoodMetricValue =
  Urban95RenderState.getWeightedNeighborhoodMetricValue;
const hasWeightedNeighborhoodMetricData =
  Urban95RenderState.hasWeightedNeighborhoodMetricData;
const getWeightedHistogramDistribution =
  Urban95RenderState.getWeightedHistogramDistribution;
const scoreContext = Urban95ScoreContext.create({
  scoreModel: Urban95ScoreModel,
  state: {
    getSelectedAmenityTypes: getSelectedAmenityTypesState,
    getAllFilterTypes: getAllFilterTypesState,
    getScoreMode: getScoreModeState,
    getWalkMinutes: getWalkMinutesState,
    getActiveHeatmapId: getActiveHeatmapIdState,
    hasBuildingAmenityStatKeys: hasBuildingAmenityStatKeysState,
    getBuildingAmenityStatKeys: getBuildingAmenityStatKeysState,
    setBuildingAmenityStatKeys: setBuildingAmenityStatKeysState,
  },
  getCurrentMode: function () {
    return currentMode;
  },
  getBuildingsData: function () {
    return buildingsData;
  },
  fixedMinutes: URBAN95_FIXED_MINUTES,
});
const getCurrentScoreModelContext = scoreContext.getCurrentScoreModelContext;
const getCurrentBuildingCleanFilteredScore = scoreContext.getCurrentBuildingCleanFilteredScore;
const getCurrentBuildingOverallScore = scoreContext.getCurrentBuildingOverallScore;
const collectCurrentBuildingScores = scoreContext.collectCurrentBuildingScores;
const getCurrentPercentileSeriesCacheKey = scoreContext.getCurrentPercentileSeriesCacheKey;
const getCurrentBuildingAmenityStatKeysForMinutes =
  scoreContext.getCurrentBuildingAmenityStatKeysForMinutes;
function getActiveMetricState() {
  return scoreContext.getActiveMetric();
}
const scoreExplain = Urban95ScoreExplain.create({
  scoreModel: Urban95ScoreModel,
  getActiveMetric: scoreContext.getActiveMetric,
  iconsBase: ICONS_BASE,
  state: {
    getScoreMode: getScoreModeState,
    getScoreMinutes: getScoreMinutes,
    getWalkMinutes: getWalkMinutesState,
    getSelectedAmenityTypes: getSelectedAmenityTypesState,
    getAllFilterTypes: getAllFilterTypesState,
    getBuildingsData: function () {
      return buildingsData;
    },
    getLatestRadiusCounts: getLatestRadiusCountsState,
    hasPercentileSeries: hasPercentileSeriesState,
    getPercentileSeries: getPercentileSeriesState,
    setPercentileSeries: setPercentileSeriesState,
    getPercentileSeriesCacheKey: getCurrentPercentileSeriesCacheKey,
    getBuildingAmenityStatKeysForMinutes: getCurrentBuildingAmenityStatKeysForMinutes,
    getBuildingOverallScore: getCurrentBuildingOverallScore,
  },
});
const scoreSidebarChrome = Urban95ScoreSidebarChrome.create({
  map: map,
  document: document,
  matchMedia: window.matchMedia.bind(window),
  perf: urban95Perf,
});
Urban95ScoreSidebar.configure({
  scoreModel: Urban95ScoreModel,
  escapeHtml: scoreExplain.escapeHtml,
  renderHorizonLabelCell: scoreExplain.renderHorizonLabelCell,
  renderHorizonSubLabelCell: scoreExplain.renderHorizonSubLabelCell,
  getWeightedCategoryIcon: scoreExplain.getWeightedCategoryIcon,
  getWeightedSubcategoryIcon: scoreExplain.getWeightedSubcategoryIcon,
  getScoreExplainRowIcon: scoreExplain.getScoreExplainRowIcon,
  getScoreExplainPartialFilterSet: scoreExplain.getScoreExplainPartialFilterSet,
  isScoreExplainCategoryFilterHighlighted: scoreExplain.isScoreExplainCategoryFilterHighlighted,
  isScoreExplainRowFilterHighlighted: scoreExplain.isScoreExplainRowFilterHighlighted,
  formatScoreExplainRowValue: scoreExplain.formatScoreExplainRowValue,
  horizonBarFillStyle: scoreExplain.horizonBarFillStyle,
  horizonSubBarFillStyle: scoreExplain.horizonSubBarFillStyle,
  explainRankBarColor: scoreExplain.explainRankBarColor,
  heroPercentileMeterFillStyle: scoreExplain.heroPercentileMeterFillStyle,
  getOrdinalSuffix: scoreExplain.getOrdinalSuffix,
  buildExplainScoreBreakdown: scoreExplain.buildExplainScoreBreakdown,
  buildPercentileMetrics: scoreExplain.buildPercentileMetrics,
  getActiveMetric: getActiveMetricState,
  getScoreMode: getScoreModeState,
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
  buildBuildingDemographicContext: buildBuildingDemographicContext,
  setSidebarPadding: scoreSidebarChrome.setSidebarPadding,
  restoreFocusAfterHide: scoreSidebarChrome.restoreFocusAfterHide,
  scoreExplainIconNeutral: scoreExplain.scoreExplainIconNeutral,
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
const ROAD_LAYER_IDS = [
  "roads-casing",
  "roads-fill",
  "roads-labels-major",
  "roads-labels-local",
];
const SCHOOLS_SOURCE_ID = "schools";
const SCHOOLS_LAYER_ID = "schools-points";
const BUS_STOPS_SOURCE_ID = "bus-stops";
const BUS_STOPS_LAYER_ID = "bus-stops-points";
const KIDS_POPULATION_SOURCE_ID = "kids-population-grid";
const KIDS_POPULATION_LAYER_ID = "kids-population-grid-fill";
const URBAN_NATURE_LAYER_ID = "urban-nature-fill";
const SOCIOECONOMIC_SOURCE_ID = "socioeconomic-statareas";
const SOCIOECONOMIC_FILL_LAYER_ID = "socioeconomic-statareas-fill";
const SOCIOECONOMIC_OUTLINE_LAYER_ID = "socioeconomic-statareas-outline";
const SOCIOECONOMIC_LABEL_LAYER_ID = "socioeconomic-statareas-labels";
const KIDS_AGE_0_4_KEY = "גיל0_4";
const KIDS_AGE_5_9_KEY = "גיל5_9";
let populationGridLookupFeatures = [];
let socioeconomicLookupFeatures = [];
const AMENITY_CLUSTER_MIN_ZOOM = 13;
const AMENITY_CLUSTER_PIXEL_RADIUS = 36;
const AMENITY_CLUSTER_DISSOLVE_ZOOM = 16;
const AMENITY_CLUSTER_MAX_COUNT = 50;
const URBAN95_DETAIL_POINTS_MIN_ZOOM = Urban95Config.detailPointsMinZoom || 15;
const SCHOOLS_DETAIL_POINTS_MIN_ZOOM = Math.max(0, URBAN95_DETAIL_POINTS_MIN_ZOOM - 1);
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
let schoolsHoverBound = false;
let busStopsHoverBound = false;
const demographicOverlayBoundLayers = new Set();
const pointDataLoader = createPointDataLoader({
  urls: {
    trees: TREES_URL,
    streetLights: STREET_LIGHTS_URL,
  },
  fetchJsonWithGzipFallback: fetchJsonWithGzipFallback,
  hasGeneratedArtifact: hasGeneratedArtifact,
  getScoreMode: getScoreModeState,
  onSkippedTreesGeojson: function () {
    Urban95Logger.perf("[Load] trees: skipped full GeoJSON fetch for weighted PMTiles display");
    Urban95MapRenderers.updateTreesSource();
  },
  onSkippedStreetLightsGeojson: function () {
    Urban95Logger.perf("[Load] street-lights: skipped full GeoJSON fetch for weighted PMTiles display");
    Urban95MapRenderers.updateStreetLightsSource();
  },
  onPointDataLoaded: function (kind, data, context) {
    var refreshPolicy = context && context.refreshPolicy ? context.refreshPolicy : "immediate";
    const startedAt = performance.now();
    Urban95Logger.perf("[Load] " + kind + ": features", (data.features || []).length);
    if (refreshPolicy === "defer") {
      Urban95Logger.perf(
        "[Load] " + kind + ": processing complete",
        Math.round(performance.now() - startedAt) + "ms"
      );
      return;
    }
    if (controlsBinding && typeof controlsBinding.buildFilterItems === "function") {
      controlsBinding.buildFilterItems(allAmenityTypes);
    }
    Urban95MapRenderers.updateAmenitiesSource();
    Urban95MapRenderers.updateTreesSource();
    Urban95MapRenderers.updateStreetLightsSource();
    Urban95MapRenderers.updateBuildingColors();
    Urban95Logger.perf(
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
  getCurrentMode: function () { return currentMode; },
  getScoreMode: getScoreModeState,
  getScoreMinutes: getScoreMinutes,
  getSelectedAmenityTypes: function () { return getSelectedAmenityTypesState(); },
  getAllFilterTypes: function () { return getAllFilterTypesState(); },
  getVisibleAmenityFeatures: function () { return visibleAmenityFeatures; },
  setVisibleAmenityFeatures: function (value) { visibleAmenityFeatures = value; },
  getAmenitiesInRadiusIds: function () { return getAmenitiesInRadiusIdsState(); },
  getTreesInRadiusIds: function () { return treesInRadiusIds; },
  getStreetLightsInRadiusIds: function () { return streetLightsInRadiusIds; },
  getAllAmenitiesData: function () { return allAmenitiesData; },
  getAllTreesData: function () { return pointDataLoader.getAllTreesData(); },
  getAllStreetLightsData: function () { return pointDataLoader.getAllStreetLightsData(); },
  getDeckAmenityOverlay: function () { return deckAmenityOverlay; },
  setDeckAmenityOverlay: function (value) { deckAmenityOverlay = value; },
  getDeckHovering: function () { return _deckHovering; },
  setDeckHovering: function (value) { _deckHovering = value; },
  getDeckUpdateTimer: function () { return _deckUpdateTimer; },
  setDeckUpdateTimer: function (value) { _deckUpdateTimer = value; },
  setLastDeckClickTime: function (value) { _lastDeckClickTime = value; },
  getWeightedShownAmenityTypes: getWeightedShownAmenityTypesState,
  getLayerVisibility: getLayerVisibilityState,
  getActiveMetric: getActiveMetricState,
  renderState: Urban95RenderState,
  scoreModel: Urban95ScoreModel,
  showRegistry: Urban95WeightedMetricShowRegistry,
  tooltipEl: tooltip,
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
const loadingUi = Urban95LoadingUi.create({
  elements: {
    loadingScreen: document.getElementById("loading-screen"),
    loadingStatus: document.querySelector(".loading-status"),
    loadingProgressBar: document.querySelector(".loading-progress-bar"),
  },
  logger: Urban95Logger,
  perf: urban95Perf,
});
Urban95Selection.configure({
  map: map,
  turf: turf,
  urban95Perf: urban95Perf,
  hasGeneratedArtifact: hasGeneratedArtifact,
  fetchJsonWithGzipFallback: fetchJsonWithGzipFallback,
  loadIsochronesLookup: urban95RuntimeLoaders.loadIsochronesLookup,
  compactIsochroneFeature: compactIsochroneFeature,
  setLoadingStatus: function (message) {
    loadingUi.setStatus(message);
  },
  showIsochroneLoadingScreen: loadingUi.showIsochroneLoadingScreen,
  hideIsochroneLoadingScreen: loadingUi.hideIsochroneLoadingScreen,
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
  getScoreMode: getScoreModeState,
  getActiveMetric: getActiveMetricState,
  renderState: Urban95RenderState,
  scoreModel: Urban95ScoreModel,
  showRegistry: Urban95WeightedMetricShowRegistry,
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
  markIsochronesLoaded: function () {
    loadingUi.mark("isochrones");
  },
  getWaitingForIsochroneLoad: function () {
    return loadingUi.getWaitingForIsochroneLoad();
  },
  updateAmenitiesSource: Urban95MapRenderers.updateAmenitiesSource,
  updateTreesSource: Urban95MapRenderers.updateTreesSource,
  updateStreetLightsSource: Urban95MapRenderers.updateStreetLightsSource,
  showScoreExplainSidebarShell: Urban95ScoreSidebar.showShell,
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
  if (!controlsBinding || typeof controlsBinding.getScoreModeLabel !== "function") {
    return mode === "expanded" ? "Amenities Focus" : "Urban95";
  }
  return controlsBinding.getScoreModeLabel(mode);
}
const HOUSE_MODE_HEX_OPACITY = 0.3;
let currentMode = "house"; // "house" | "neighborhood" | "citywide"
let neighborhoodsData = null;
let neighborhoodSurfaceData = null;
let neighborhoodChartsPayload = null;
let citywideStats = null;
let selectedNeighborhood = null;
let citywideCharts = [];
let modeController = null;
const citywideModalEl = document.getElementById("citywide-modal");
const citywideCloseEl = document.getElementById("citywide-close");
const citywideTitleEl = document.getElementById("citywide-modal-title");
const citywideSubtitleEl = document.getElementById("citywide-modal-subtitle");
const citywideBodyEl = document.getElementById("citywide-body");
const radiusInfoEl = document.getElementById("radius-info");
function switchMode(mode) {
  if (!modeController) {
    throw new Error("Urban95ModeController must be created before switchMode");
  }
  return modeController.switchMode(mode);
}
const overlayVisibility = Urban95OverlayVisibility.create({
  getLayerVisibility: getLayerVisibilityState,
  setLayerVisibility: setLayerVisibilityState,
  getWeightedShownAmenityTypes: getWeightedShownAmenityTypesState,
  setWeightedShownAmenityTypes: setWeightedShownAmenityTypesState,
  getCurrentMode: function () {
    return currentMode;
  },
  getControlUiElements: getControlUiElements,
  mirrorOverlayToggleChecked: function (layer, enabled) {
    if (controlSidebarAdapter && typeof controlSidebarAdapter.mirrorOverlayToggleChecked === "function") {
      controlSidebarAdapter.mirrorOverlayToggleChecked(layer, enabled);
    }
  },
  map: map,
});
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
  getScoreMode: getScoreModeState,
  getScoreMinutes: getScoreMinutes,
  escapeHtml: scoreExplain.escapeHtml,
  getNeighborhoodsData: function () { return neighborhoodsData; },
  setNeighborhoodsData: function (value) { neighborhoodsData = value; },
  getNeighborhoodSurfaceData: function () { return neighborhoodSurfaceData; },
  setNeighborhoodSurfaceData: function (value) { neighborhoodSurfaceData = value; },
  getNeighborhoodChartsPayload: function () { return neighborhoodChartsPayload; },
  setNeighborhoodChartsPayload: function (value) { neighborhoodChartsPayload = value; },
  getCitywideStats: function () { return citywideStats; },
  setCitywideStats: function (value) { citywideStats = value; },
  getCitywideCharts: function () { return citywideCharts; },
  setCitywideCharts: function (value) { citywideCharts = value; },
  getAmenityConfig: getAmenityConfig,
  getNeighborhoodPercentileKey: getNeighborhoodPercentileKey,
  getNeighborhoodSurfaceScorePropertyKey: getNeighborhoodSurfaceScorePropertyKey,
  getActiveMetric: getActiveMetricState,
  getWeightedNeighborhoodMetricValue: getWeightedNeighborhoodMetricValue,
  hasWeightedNeighborhoodMetricData: hasWeightedNeighborhoodMetricData,
  getWeightedHistogramDistribution: getWeightedHistogramDistribution,
  weightedCategoryHighlightsFromSource: weightedCategoryHighlightsFromSource,
  weightedSubcategoryComparisonRows: weightedSubcategoryComparisonRows,
  renderWeightedSubcategoryComparisonList: scoreExplain.renderWeightedSubcategoryComparisonList,
  buildHistogramDistributionFromScores: buildHistogramDistributionFromScores,
  collectBuildingScores: collectBuildingScores,
  getColorForValue: getColorForValue,
  percentileBreakpoints: percentileBreakpoints,
  formatMetricNumber: formatMetricNumber,
  getOrdinalSuffix: scoreExplain.getOrdinalSuffix,
  getScoreModeLabel: getScoreModeLabel,
  tooltipEl: tooltip,
  switchMode: switchMode,
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
Urban95NeighborhoodSidebar.configure({
  getWeightedNeighborhoodMetricValue: getWeightedNeighborhoodMetricValue,
  hasWeightedNeighborhoodMetricData: hasWeightedNeighborhoodMetricData,
  sidebarEl: neighborhoodSidebarEl,
  heroEl: neighborhoodSidebarHeroEl,
  eyebrowEl: neighborhoodSidebarEyebrowEl,
  metaEl: neighborhoodSidebarMetaEl,
  bodyEl: neighborhoodSidebarBodyEl,
  emptyEl: neighborhoodSidebarEmptyEl,
  closeButtonEl: neighborhoodSidebarCloseEl,
  backdropEl: neighborhoodSidebarBackdropEl,
  setSidebarPadding: scoreSidebarChrome.setSidebarPadding,
  restoreFocusAfterHide: scoreSidebarChrome.restoreFocusAfterHide,
  setSelectedNeighborhood: function (feature) { selectedNeighborhood = feature; },
  loadCitywideStats: Urban95Dashboards.loadCitywideStats,
  loadNeighborhoodChartsPayload: Urban95Dashboards.loadNeighborhoodChartsPayload,
  getCitywideStats: function () { return citywideStats; },
  ensureChartJsLoaded: ensureChartJsLoaded,
  requestAnimationFrame:
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : function (callback) {
          return callback();
        },
  getScoreMode: getScoreModeState,
  getScoreMinutes: getScoreMinutes,
  renderDeps: {
    pieSlicesFromInventoryCounts: Urban95Dashboards.pieSlicesFromInventoryCounts,
    getActiveMetric: getActiveMetricState,
    getWeightedHistogramDistribution: getWeightedHistogramDistribution,
    weightedCategoryHighlightsFromSource: weightedCategoryHighlightsFromSource,
    weightedSubcategoryComparisonRows: weightedSubcategoryComparisonRows,
    renderWeightedSubcategoryComparisonList: scoreExplain.renderWeightedSubcategoryComparisonList,
    buildHistogramDistributionFromScores: buildHistogramDistributionFromScores,
    collectBuildingScores: collectBuildingScores,
    getColorForValue: getColorForValue,
    getNeighborhoodPercentileKey: getNeighborhoodPercentileKey,
    getOrdinalSuffix: scoreExplain.getOrdinalSuffix,
    getScoreModeLabel: getScoreModeLabel,
    formatMetricNumber: formatMetricNumber,
    formatScoreInteger: formatScoreInteger,
    escapeHtml: scoreExplain.escapeHtml,
    heroPercentileMeterFillStyle: scoreExplain.heroPercentileMeterFillStyle,
    getCitywideStats: function () { return citywideStats; },
  },
});
const iconLoader = Urban95IconLoader.create({
  map: map,
  iconsBase: ICONS_BASE,
  scoreModel: Urban95ScoreModel,
  fetch: fetch.bind(window),
  Image: Image,
  Blob: Blob,
  URL: URL,
  logger: Urban95Logger,
});
const amenityMode = Urban95AmenityMode.create({
  perf: urban95Perf,
  logger: Urban95Logger,
  state: {
    getScoreMode: getScoreModeState,
    getCleanData: function () {
      return allAmenitiesDataClean;
    },
    getCleanTypes: function () {
      return allAmenityTypesClean;
    },
    getCleanTypesWithData: function () {
      return typesWithDataClean;
    },
    getLegacyData: function () {
      return allAmenitiesDataLegacy;
    },
    getLegacyTypes: function () {
      return allAmenityTypesLegacy;
    },
    getLegacyTypesWithData: function () {
      return typesWithDataLegacy;
    },
    setAllAmenitiesData: function (value) {
      allAmenitiesData = value;
    },
    setAllAmenityTypes: function (value) {
      allAmenityTypes = value;
    },
    setTypesWithData: function (value) {
      typesWithData = value;
    },
    clearRadiusIds: clearRadiusIdsState,
    getCurrentMode: function () {
      return currentMode;
    },
    getSelectedBuilding: function () {
      return selectedBuildingCentroid;
    },
  },
  ui: {
    buildFilterItems: function () {
      if (controlsBinding && typeof controlsBinding.buildFilterItems === "function") {
        controlsBinding.buildFilterItems(allAmenityTypes);
      }
    },
    syncFilterUiForScoreMode: function () {
      if (controlsBinding && typeof controlsBinding.syncFilterUiForScoreMode === "function") {
        controlsBinding.syncFilterUiForScoreMode();
      }
    },
    syncOverlayVisibility: function () {
      if (controlsBinding && typeof controlsBinding.syncOverlayVisibility === "function") {
        controlsBinding.syncOverlayVisibility();
      }
    },
  },
  pointDataLoader: {
    ensureExpandedPointDataLoaded: pointDataLoader.ensureExpandedPointDataLoaded,
    canRefreshPointAnalysisAfterPointDataLoad: pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad,
  },
  renderers: {
    syncPointLayerVisibility: Urban95MapRenderers.syncPointLayerVisibility,
    applyShowPointsToggle: Urban95MapRenderers.applyShowPointsToggle,
    updateAmenitiesSource: Urban95MapRenderers.updateAmenitiesSource,
    updateTreesSource: Urban95MapRenderers.updateTreesSource,
    updateStreetLightsSource: Urban95MapRenderers.updateStreetLightsSource,
    updateBuildingColors: Urban95MapRenderers.updateBuildingColors,
    updateNeighborhoodSurfaceData: Urban95MapRenderers.updateNeighborhoodSurfaceData,
  },
  selection: {
    selectBuilding: Urban95Selection.selectBuilding,
  },
});
function collectBuildingScores() {
  return collectCurrentBuildingScores();
}
function getBuildingOverallScore(props, minutes) {
  return getCurrentBuildingOverallScore(props, minutes);
}
function formatArea(areaM2) {
  if (areaM2 >= 10000) {
    return (areaM2 / 10000).toFixed(2) + " ha";
  }
  return Math.round(areaM2).toLocaleString() + " m²";
}

const controlActions = Urban95ControlActions.create({
  perf: urban95Perf,
  state: {
    getCurrentMode: function () {
      return currentMode;
    },
    getSelectedBuilding: function () {
      return selectedBuildingCentroid;
    },
    getSelectedNeighborhood: function () {
      return selectedNeighborhood;
    },
    clearDerivedCaches: clearDerivedCachesState,
    setIsochronesDeferred: function () {
      loadingUi.mark("isochrones");
    },
    getIsochronesLoaded: function () {
      return isochronesLoaded;
    },
    getActiveHeatmapId: getActiveHeatmapIdState,
    setActiveHeatmapId: setActiveHeatmapIdState,
    getLayerVisibility: getLayerVisibilityState,
    setLayerVisibility: setLayerVisibilityState,
    getScoreMode: getScoreModeState,
  },
  pointDataLoader: {
    canRefreshPointAnalysisAfterPointDataLoad: pointDataLoader.canRefreshPointAnalysisAfterPointDataLoad,
  },
  loadingUi: {
    showIsochroneLoadingScreen: loadingUi.showIsochroneLoadingScreen,
    getWaitingForIsochroneLoad: loadingUi.getWaitingForIsochroneLoad,
    hideIsochroneLoadingScreen: loadingUi.hideIsochroneLoadingScreen,
    mark: loadingUi.mark,
  },
  amenityMode: {
    apply: amenityMode.apply,
  },
  renderers: {
    applyShowPointsToggle: Urban95MapRenderers.applyShowPointsToggle,
    updateAmenitiesSource: Urban95MapRenderers.updateAmenitiesSource,
    updateTreesSource: Urban95MapRenderers.updateTreesSource,
    updateStreetLightsSource: Urban95MapRenderers.updateStreetLightsSource,
    updateBuildingColors: Urban95MapRenderers.updateBuildingColors,
    updateNeighborhoodSurfaceData: Urban95MapRenderers.updateNeighborhoodSurfaceData,
    updateNeighborhoodColors: Urban95MapRenderers.updateNeighborhoodColors,
    updateDeckAmenityLayers: Urban95MapRenderers.updateDeckAmenityLayers,
  },
  selection: {
    loadIsochrones: Urban95Selection.loadIsochrones,
    selectBuilding: Urban95Selection.selectBuilding,
    updateRadiusInfo: Urban95Selection.updateRadiusInfo,
    clearRadiusSelection: Urban95Selection.clearRadiusSelection,
  },
  dashboards: {
    renderCitywideModal: Urban95Dashboards.renderCitywideModal,
    updateCitywideModalTitle: Urban95Dashboards.updateCitywideModalTitle,
    hideCitywideModal: Urban95Dashboards.hideCitywideModal,
  },
  scoreSidebar: {
    isOpen: Urban95ScoreSidebar.isOpen,
    hide: Urban95ScoreSidebar.hide,
    sync: Urban95ScoreSidebar.sync,
  },
  neighborhoodSidebar: {
    show: Urban95NeighborhoodSidebar.show,
    sync: Urban95NeighborhoodSidebar.sync,
    hide: Urban95NeighborhoodSidebar.hide,
    isOpen: Urban95NeighborhoodSidebar.isOpen,
  },
  modeController: {
    switchMode: switchMode,
  },
  map: {
    getLayer: map.getLayer.bind(map),
    setLayoutProperty: map.setLayoutProperty.bind(map),
  },
  ui: {
    getCitywideModal: function () {
      return citywideModalEl;
    },
  },
  controls: {
    refreshLegend: function () {
      if (controlsBinding && typeof controlsBinding.refreshLegend === "function") {
        controlsBinding.refreshLegend();
      }
    },
  },
});
controlSidebarAdapter = Urban95ControlSidebarAdapter.create({
  getUiElements: getControlUiElements,
  controlActions: {
    onPointVisibilityChanged: controlActions.onPointVisibilityChanged,
    onScoreModeChanged: controlActions.onScoreModeChanged,
  },
  syncers: {
    syncRoadsVisibility: applyRoadSymbologyVisibility,
    syncUrbanNatureVisibility: applyUrbanNatureVisibility,
    syncKidsPopulationVisibility: applyKidsPopulationVisibility,
    syncSocioeconomicVisibility: applySocioeconomicVisibility,
    syncSchoolsVisibility: applySchoolsLayerVisibility,
    syncBusStopsVisibility: applyBusStopsLayerVisibility,
    syncParksVisibility: overlayVisibility.applyParksVisibility,
  },
});
controlsBinding = Urban95Controls.bind({
  elements: {
    sidebarEl: controlSidebarEl,
    bodyEl: controlSidebarBodyEl,
    legendEl: controlLegendEl,
    filterBackdrop: filterBackdrop,
  },
  iconsBase: ICONS_BASE,
  scoreModel: Urban95ScoreModel,
  showRegistry: Urban95WeightedMetricShowRegistry,
  scoreContext: scoreContext,
  getActiveMetric: scoreContext.getActiveMetric,
  isTouchDevice: isTouchDevice,
  getState: function () {
    return {
      scoreMode: getScoreModeState(),
      walkMinutes: getWalkMinutesState(),
      activeHeatmapId: getActiveHeatmapIdState(),
      selectedAmenityTypes: getSelectedAmenityTypesState(),
      allFilterTypes: getAllFilterTypesState(),
      lastFilterRadioSelection: getLastFilterRadioSelectionState(),
      currentMode: currentMode,
      layerVisibility: getLayerVisibilityState(),
    };
  },
  setScoreMode: function (value) { setScoreModeState(value); },
  setWalkMinutes: function (value) { setWalkMinutesState(value); },
  setActiveHeatmapId: function (value) { setActiveHeatmapIdState(value); },
  setSelectedAmenityTypes: function (value) { setSelectedAmenityTypesState(value); },
  setAllFilterTypes: function (value) { setAllFilterTypesState(value); },
  setLastFilterRadioSelection: function (value) { setLastFilterRadioSelectionState(value); },
  getTypesWithData: function () { return typesWithData; },
  getAllTreesData: function () { return pointDataLoader.getAllTreesData(); },
  getAllStreetLightsData: function () { return pointDataLoader.getAllStreetLightsData(); },
  callbacks: {
    applyScoreModeAmenities: amenityMode.apply,
    onFilterSelectionChanged: controlActions.onFilterSelectionChanged,
    onScoreModeChanged: function (nextScoreMode) {
      if (nextScoreMode !== "weighted") {
        setWeightedShownAmenityTypesState(new Set());
        overlayVisibility.updateCanonicalLayerVisibility("parks", false);
      }
      controlSidebarAdapter.onScoreModeChanged(nextScoreMode);
    },
    onWalkMinutesChanged: controlActions.onWalkMinutesChanged,
    onModeToggleRequested: controlActions.onModeToggleRequested,
    onPointVisibilityChanged: function (row) {
      overlayVisibility.applyOverlayToggleRowChange(row);
      controlSidebarAdapter.onOverlayVisibilityChanged();
    },
    onHeatmapSelectionChanged: controlActions.setActiveHeatmap,
    onEscape: controlActions.onEscape,
    onBasemapChanged: function (basemap) { applyBasemap(map, basemap); },
    onMetricShowRequested: function (action, enabled) {
      if (overlayVisibility.applyCanonicalMetricShowAction(action, enabled)) {
        controlSidebarAdapter.onOverlayVisibilityChanged();
      }
    },
    isMetricShowEnabled: function (action) { return overlayVisibility.isCanonicalMetricShowEnabled(action); },
    clearDerivedCaches: controlActions.clearDerivedCaches,
    onSidebarWidthChanged: function (width) { scoreSidebarChrome.setSidebarReservation("left", width); },
  },
});
const controlUi = controlsBinding.getUiElements();
modeController = Urban95ModeController.create({
  runtime: {
    map: map,
    perf: urban95Perf,
    logger: Urban95Logger,
  },
  integrations: {
    dashboards: Urban95Dashboards,
    mapRenderers: Urban95MapRenderers,
    selection: Urban95Selection,
    neighborhoodSidebar: Urban95NeighborhoodSidebar,
  },
  ui: {
    modeHint: controlUi.modeHint,
    modeToggle: controlUi.modeToggle,
    indicatorsSection: controlUi.indicatorsSection,
    radiusInfo: radiusInfoEl,
    citywideBody: citywideBodyEl,
  },
  state: {
    getCurrentMode: function () {
      return currentMode;
    },
    setCurrentMode: function (value) {
      currentMode = value;
    },
    setSelectedNeighborhood: function (value) {
      selectedNeighborhood = value;
    },
  },
  scoring: {
    getActiveMetric: getActiveMetricState,
  },
  contracts: {
    buildingsFillLayerId: BUILDINGS_FILL_LAYER_ID,
    neighborhoodSurfaceSourceLayerFallback: NEIGHBORHOOD_SURFACE_SOURCE_LAYER_FALLBACK,
    houseModeHexOpacity: HOUSE_MODE_HEX_OPACITY,
  },
  assets: {
    syncFilterUiForScoreMode: controlsBinding.syncFilterUiForScoreMode,
    updateFilterLabel: controlsBinding.updateFilterLabel,
    onModeChanged: function () {
      if (controlsBinding && typeof controlsBinding.syncOverlayVisibility === "function") {
        controlsBinding.syncOverlayVisibility();
      }
      if (controlSidebarAdapter) {
        controlSidebarAdapter.syncMapLayers();
      }
    },
    setLegendVisible: function (visible) {
      if (controlsBinding && typeof controlsBinding.setLegendVisible === "function") {
        controlsBinding.setLegendVisible(visible);
      }
    },
    hasGeneratedArtifact: hasGeneratedArtifact,
    sourceLayer: sourceLayer,
    getNeighborhoodSurfaceColorExpression: getNeighborhoodSurfaceColorExpression,
    getNeighborhoodSurfaceScorePropertyKey: getNeighborhoodSurfaceScorePropertyKey,
  },
  geo: {
    turf: turf,
  },
});
Urban95AppStartupBridge.bindStartup({
  map: map,
  startup: Urban95Startup,
  logger: Urban95Logger,
  setBuildingsData: function (value) {
    buildingsData = value;
  },
  setBuildingCentroids: function (value) {
    buildingCentroids = value;
  },
  setCleanAmenitiesData: function (value) {
    allAmenitiesDataClean = value;
  },
  setCleanAmenityTypes: function (types, typesWithDataValue) {
    allAmenityTypesClean = types;
    typesWithDataClean = typesWithDataValue;
  },
  setLegacyAmenitiesData: function (value) {
    allAmenitiesDataLegacy = value;
  },
  setLegacyAmenityTypes: function (types, typesWithDataValue) {
    allAmenityTypesLegacy = types;
    typesWithDataLegacy = typesWithDataValue;
  },
  clearLegacyAmenityData: function () {
    allAmenitiesDataLegacy = null;
    allAmenityTypesLegacy = [];
    typesWithDataLegacy = new Set();
  },
  runtime: {
      map: map,
      document: document,
      performance: performance,
      turf: turf,
      loaders: urban95RuntimeLoaders,
      pointDataLoader: pointDataLoader,
      hasGeneratedArtifact: hasGeneratedArtifact,
      fetchJsonWithGzipFallback: fetchJsonWithGzipFallback,
      featureCollectionFromPointRecords: featureCollectionFromPointRecords,
      hasValidPointsLookupSources: hasValidPointsLookupSources,
      warnIfBuildingScoresIncomplete: warnIfBuildingScoresIncomplete,
      scanAmenityTypesFromFeatures: scanAmenityTypesFromFeatures,
      buildingsMapSourceId: BUILDINGS_MAP_SOURCE_ID,
    },
  loadingUi: loadingUi,
    callbacks: {
      loadAmenityIcons: iconLoader.loadAmenityIcons,
      loadPointsLookup: loadPointsLookup,
      loadAmenitiesGeojsonFallback: loadAmenitiesGeojsonFallback,
      applyScoreModeAmenities: amenityMode.apply,
      clearDerivedCaches: clearDerivedCachesState,
      applyHouseModeHexBackground: modeController.applyHouseModeHexBackground.bind(modeController),
      applyUrbanNatureVisibility: applyUrbanNatureVisibility,
    },
    renderers: {
      applyParkDotPattern: applyParkDotPattern,
      applyUrbanNatureDotPattern: applyUrbanNatureDotPattern,
      addAmenityLayers: Urban95MapRenderers.addAmenityLayers,
      applyShowPointsToggle: Urban95MapRenderers.applyShowPointsToggle,
      updateBuildingColors: Urban95MapRenderers.updateBuildingColors,
    },
    selection: {
      buildBuildingCentroidGridIndex: Urban95Selection.buildBuildingCentroidGridIndex,
    },
    urls: {
      buildings: BUILDINGS_URL,
      parks: PARKS_URL,
      urbanNatureAreas: URBAN_NATURE_AREAS_URL,
    },
});
Urban95MapEvents.bind({
  map: map,
  selection: Urban95Selection,
  dashboards: Urban95Dashboards,
  neighborhoodSidebar: Urban95NeighborhoodSidebar,
  mapRenderers: Urban95MapRenderers,
  pointDataLoader: pointDataLoader,
  tooltip: tooltip,
  buildingsFillLayerId: BUILDINGS_FILL_LAYER_ID,
  getCurrentMode: function () {
    return currentMode;
  },
  getDeckHovering: function () {
    return _deckHovering;
  },
  getLastDeckClickTime: function () {
    return _lastDeckClickTime;
  },
  getScoreMode: getScoreModeState,
  formatArea: formatArea,
});
function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
function getKids0To9Count(props) {
  const p = props || {};
  const kids0to4 = safeNumber(p[KIDS_AGE_0_4_KEY]) || 0;
  const kids5to9 = safeNumber(p[KIDS_AGE_5_9_KEY]) || 0;
  return kids0to4 + kids5to9;
}
function formatPopulationGridAreaLabel(areaSqM) {
  const area = Number.isFinite(areaSqM) && areaSqM > 0 ? areaSqM : 40000;
  const sideM = Math.round(Math.sqrt(area));
  return sideM + " m \u00d7 " + sideM + " m (" + formatArea(area) + ")";
}
function isPolygonFeatureGeometry(geometry) {
  return !!geometry && (geometry.type === "Polygon" || geometry.type === "MultiPolygon");
}
function findPolygonFeatureAtLngLat(features, lng, lat) {
  if (!features || !features.length || lng == null || lat == null || typeof turf === "undefined") return null;
  const point = turf.point([lng, lat]);
  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    if (!feature || !isPolygonFeatureGeometry(feature.geometry)) continue;
    try {
      if (turf.booleanPointInPolygon(point, feature)) return feature;
    } catch (_error) {}
  }
  return null;
}
function buildBuildingDemographicContext(lng, lat) {
  const context = { population: null, socioeconomic: null };
  const popFeature = findPolygonFeatureAtLngLat(populationGridLookupFeatures, lng, lat);
  if (popFeature) {
    const props = popFeature.properties || {};
    const areaSqM = safeNumber(props.Shape_Area) || 40000;
    context.population = {
      kids0to4: safeNumber(props[KIDS_AGE_0_4_KEY]),
      kids5to9: safeNumber(props[KIDS_AGE_5_9_KEY]),
      areaSqM: areaSqM,
      areaLabel: formatPopulationGridAreaLabel(areaSqM),
    };
  }
  const sesFeature = findPolygonFeatureAtLngLat(socioeconomicLookupFeatures, lng, lat);
  if (sesFeature) {
    const props = sesFeature.properties || {};
    const cluster = safeNumber(
      props.socio_cluster != null ? props.socio_cluster : props.cluster_2021
    );
    let tractAreaSqM = null;
    try {
      tractAreaSqM = turf.area(sesFeature);
    } catch (_error) {}
    context.socioeconomic = {
      cluster: Number.isFinite(cluster) ? Math.round(cluster) : null,
      statArea: props.stat_area != null ? props.stat_area : props.yishuv_stat || null,
      areaSqM: Number.isFinite(tractAreaSqM) ? tractAreaSqM : null,
    };
  }
  return context;
}
function normalizeKidsPopulationGrid(rawFeatureCollection) {
  const features = (rawFeatureCollection && rawFeatureCollection.features) || [];
  const normalized = [];
  let maxKids = 0;
  features.forEach(function (feature) {
    const geometry = feature && feature.geometry ? feature.geometry : null;
    if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return;
    const props = feature && feature.properties ? feature.properties : {};
    const kids0to4 = safeNumber(props[KIDS_AGE_0_4_KEY]);
    const kids5to9 = safeNumber(props[KIDS_AGE_5_9_KEY]);
    const kids0to9 = getKids0To9Count(props);
    if (!Number.isFinite(kids0to9)) return;
    const safeKids0to4 = kids0to4 != null ? Math.max(0, kids0to4) : null;
    const safeKids5to9 = kids5to9 != null ? Math.max(0, kids5to9) : null;
    const safeKids0to9 = Math.max(0, kids0to9);
    if (safeKids0to9 > maxKids) maxKids = safeKids0to9;
    normalized.push({
      type: "Feature",
      properties: {
        kids_0_4: safeKids0to4,
        kids_5_9: safeKids5to9,
        kids_0_9: safeKids0to9,
      },
      geometry: geometry,
    });
  });
  return {
    featureCollection: {
      type: "FeatureCollection",
      features: normalized,
    },
    maxKids: maxKids,
  };
}
function kidsPopulationFillColorExpression(maxKids) {
  const maxValue = Number.isFinite(maxKids) && maxKids > 0 ? maxKids : 1;
  return [
    "interpolate",
    ["linear"],
    ["coalesce", ["to-number", ["get", "kids_0_9"]], 0],
    0, "#bfdbfe",
    maxValue * 0.15, "#93c5fd",
    maxValue * 0.35, "#60a5fa",
    maxValue * 0.6, "#2563eb",
    maxValue, "#1e3a8a",
  ];
}
function kidsPopulationFillOpacityExpression(maxKids) {
  const maxValue = Number.isFinite(maxKids) && maxKids > 0 ? maxKids : 1;
  return [
    "interpolate",
    ["linear"],
    ["coalesce", ["to-number", ["get", "kids_0_9"]], 0],
    0, 0.28,
    maxValue * 0.1, 0.38,
    maxValue * 0.4, 0.58,
    maxValue, 0.82,
  ];
}
function ensureKidsPopulationLayer() {
  if (!map.getSource(KIDS_POPULATION_SOURCE_ID)) {
    map.addSource(KIDS_POPULATION_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(KIDS_POPULATION_LAYER_ID)) {
    map.addLayer(
      {
        id: KIDS_POPULATION_LAYER_ID,
        type: "fill",
        source: KIDS_POPULATION_SOURCE_ID,
        layout: {
          visibility: "none",
        },
        paint: {
          "fill-color": "#60a5fa",
          "fill-opacity": 0.5,
          "fill-outline-color": "rgba(59, 130, 246, 0.45)",
        },
      },
      "selected-building-outline"
    );
  }
}
function applyUrbanNatureVisibility() {
  if (!map.getLayer(URBAN_NATURE_LAYER_ID)) return;
  const enabled = overlayVisibility.isCanonicalLayerVisible("urban-nature", false);
  const showInMode = currentMode === "house" || currentMode === "citywide";
  map.setLayoutProperty(
    URBAN_NATURE_LAYER_ID,
    "visibility",
    enabled && showInMode ? "visible" : "none"
  );
}

function applyKidsPopulationVisibility() {
  if (!map.getLayer(KIDS_POPULATION_LAYER_ID)) return;
  const visible = overlayVisibility.isCanonicalLayerVisible("kids-population", false);
  map.setLayoutProperty(KIDS_POPULATION_LAYER_ID, "visibility", visible ? "visible" : "none");
}
async function loadKidsPopulationGridLayer() {
  try {
    const raw = await fetchJsonWithGzipFallback(POPULATION_GRID_URL, { required: false });
    ensureKidsPopulationLayer();
    const source = map.getSource(KIDS_POPULATION_SOURCE_ID);
    if (!source || !raw) return;
    const normalized = normalizeKidsPopulationGrid(raw);
    populationGridLookupFeatures = ((raw && raw.features) || []).filter(function (feature) {
      return feature && isPolygonFeatureGeometry(feature.geometry);
    });
    source.setData(normalized.featureCollection);
    map.setPaintProperty(
      KIDS_POPULATION_LAYER_ID,
      "fill-color",
      kidsPopulationFillColorExpression(normalized.maxKids)
    );
    map.setPaintProperty(
      KIDS_POPULATION_LAYER_ID,
      "fill-opacity",
      kidsPopulationFillOpacityExpression(normalized.maxKids)
    );
    bindDemographicOverlayHover();
    applyKidsPopulationVisibility();
  } catch (err) {
    console.error("Failed to load kids population grid:", err);
  }
}
function normalizeSocioeconomicLayer(rawFeatureCollection) {
  const features = (rawFeatureCollection && rawFeatureCollection.features) || [];
  const normalized = [];
  features.forEach(function (feature) {
    const geometry = feature && feature.geometry ? feature.geometry : null;
    if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return;
    const properties = Object.assign({}, (feature && feature.properties) || {});
    const rawIndex = safeNumber(properties.socio_index != null ? properties.socio_index : properties.index_value);
    if (!Number.isFinite(rawIndex)) return;
    properties.socio_index = rawIndex;
    const rawCluster = safeNumber(
      properties.socio_cluster != null ? properties.socio_cluster : properties.cluster_2021
    );
    if (Number.isFinite(rawCluster)) properties.socio_cluster = Math.round(rawCluster);
    const rawRank = safeNumber(properties.socio_rank != null ? properties.socio_rank : properties.rank_2021);
    if (Number.isFinite(rawRank)) properties.socio_rank = Math.round(rawRank);
    normalized.push({
      type: "Feature",
      properties: properties,
      geometry: geometry,
    });
  });
  return {
    featureCollection: {
      type: "FeatureCollection",
      features: normalized,
    },
  };
}
function ensureSocioeconomicLayer() {
  if (!map.getSource(SOCIOECONOMIC_SOURCE_ID)) {
    map.addSource(SOCIOECONOMIC_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(SOCIOECONOMIC_FILL_LAYER_ID)) {
    const beforeLayerId = map.getLayer("selected-building-outline")
      ? "selected-building-outline"
      : undefined;
    map.addLayer(
      {
        id: SOCIOECONOMIC_FILL_LAYER_ID,
        type: "fill",
        source: SOCIOECONOMIC_SOURCE_ID,
        layout: {
          visibility: "none",
        },
        paint: {
          "fill-color": "rgba(0, 0, 0, 0)",
          "fill-opacity": 0,
        },
      },
      beforeLayerId
    );
  }
  if (!map.getLayer(SOCIOECONOMIC_OUTLINE_LAYER_ID)) {
    map.addLayer({
      id: SOCIOECONOMIC_OUTLINE_LAYER_ID,
      type: "line",
      source: SOCIOECONOMIC_SOURCE_ID,
      layout: {
        visibility: "none",
      },
      paint: {
        "line-color": "rgba(68, 64, 60, 0.7)",
        "line-width": 0.9,
      },
    });
  }
  if (!map.getLayer(SOCIOECONOMIC_LABEL_LAYER_ID)) {
    map.addLayer({
      id: SOCIOECONOMIC_LABEL_LAYER_ID,
      type: "symbol",
      source: SOCIOECONOMIC_SOURCE_ID,
      minzoom: 12,
      layout: {
        visibility: "none",
        "text-field": [
          "case",
          ["has", "socio_cluster"],
          ["concat", "Cluster ", ["to-string", ["get", "socio_cluster"]]],
          ["has", "cluster_2021"],
          ["concat", "Cluster ", ["to-string", ["round", ["to-number", ["get", "cluster_2021"]]]]],
          "",
        ],
        "text-size": 11,
        "text-font": ["Noto Sans Regular"],
      },
      paint: {
        "text-color": "#1f2937",
        "text-halo-color": "rgba(255, 255, 255, 0.85)",
        "text-halo-width": 1.2,
      },
    });
  }
}
function applySocioeconomicVisibility() {
  const visible = overlayVisibility.isCanonicalLayerVisible("socioeconomic", false);
  const nextVisibility = visible ? "visible" : "none";
  [
    SOCIOECONOMIC_FILL_LAYER_ID,
    SOCIOECONOMIC_OUTLINE_LAYER_ID,
    SOCIOECONOMIC_LABEL_LAYER_ID,
  ].forEach(function (layerId) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", nextVisibility);
    }
  });
}
function formatKidsPopulationTooltipLines(feature) {
  const properties = (feature && feature.properties) || {};
  const kids0to4 = safeNumber(properties.kids_0_4);
  const kids5to9 = safeNumber(properties.kids_5_9);
  const lines = [];
  if (Number.isFinite(kids0to4)) lines.push("Ages 0–4: " + Math.round(kids0to4));
  if (Number.isFinite(kids5to9)) lines.push("Ages 5–9: " + Math.round(kids5to9));
  return lines;
}
function formatSocioeconomicTooltipLines(feature) {
  const properties = (feature && feature.properties) || {};
  const clusterValue = safeNumber(
    properties.socio_cluster != null ? properties.socio_cluster : properties.cluster_2021
  );
  if (!Number.isFinite(clusterValue)) return [];
  return ["SES cluster: " + Math.round(clusterValue)];
}
function getDemographicOverlayQueryLayers() {
  const layers = [];
  if (
    overlayVisibility.isCanonicalLayerVisible("kids-population", false) &&
    map.getLayer(KIDS_POPULATION_LAYER_ID)
  ) {
    layers.push(KIDS_POPULATION_LAYER_ID);
  }
  if (
    overlayVisibility.isCanonicalLayerVisible("socioeconomic", false) &&
    map.getLayer(SOCIOECONOMIC_FILL_LAYER_ID)
  ) {
    layers.push(SOCIOECONOMIC_FILL_LAYER_ID);
  }
  return layers;
}
function getDemographicOverlayFeaturesAtPoint(point) {
  const layers = getDemographicOverlayQueryLayers();
  if (!layers.length || !point) {
    return { kidsFeature: null, sesFeature: null };
  }
  const features = map.queryRenderedFeatures(point, { layers: layers });
  let kidsFeature = null;
  let sesFeature = null;
  features.forEach(function (feature) {
    if (!feature || !feature.layer || !feature.layer.id) return;
    if (feature.layer.id === KIDS_POPULATION_LAYER_ID && !kidsFeature) kidsFeature = feature;
    if (feature.layer.id === SOCIOECONOMIC_FILL_LAYER_ID && !sesFeature) sesFeature = feature;
  });
  return { kidsFeature: kidsFeature, sesFeature: sesFeature };
}
function formatDemographicOverlayTooltip(kidsFeature, sesFeature) {
  const lines = [];
  if (kidsFeature) lines.push.apply(lines, formatKidsPopulationTooltipLines(kidsFeature));
  if (sesFeature) lines.push.apply(lines, formatSocioeconomicTooltipLines(sesFeature));
  return lines.length ? lines.join("\n") : "";
}
function buildDemographicOverlayTooltip(point) {
  const features = getDemographicOverlayFeaturesAtPoint(point);
  return formatDemographicOverlayTooltip(features.kidsFeature, features.sesFeature);
}
function bindDemographicOverlayHover() {
  [KIDS_POPULATION_LAYER_ID, SOCIOECONOMIC_FILL_LAYER_ID].forEach(function (layerId) {
    if (!map.getLayer(layerId) || demographicOverlayBoundLayers.has(layerId)) return;
    demographicOverlayBoundLayers.add(layerId);
    map.on("mousemove", layerId, function (e) {
      if (!e || !e.point) return;
      if (_deckHovering) {
        map.getCanvas().style.cursor = "";
        tooltip.style.display = "none";
        return;
      }
      const label = buildDemographicOverlayTooltip(e.point);
      if (!label) {
        tooltip.style.display = "none";
        return;
      }
      map.getCanvas().style.cursor = "pointer";
      tooltip.textContent = label;
      tooltip.style.display = "block";
      tooltip.style.left = e.point.x + 12 + "px";
      tooltip.style.top = e.point.y + 12 + "px";
    });
    map.on("mouseleave", layerId, function (e) {
      if (e && e.point && buildDemographicOverlayTooltip(e.point)) return;
      map.getCanvas().style.cursor = "";
      tooltip.style.display = "none";
    });
  });
}
async function loadSocioeconomicLayer() {
  try {
    const raw = await fetchJsonWithGzipFallback(SOCIOECONOMIC_URL, { required: false });
    ensureSocioeconomicLayer();
    const source = map.getSource(SOCIOECONOMIC_SOURCE_ID);
    if (!source || !raw) return;
    const normalized = normalizeSocioeconomicLayer(raw);
    socioeconomicLookupFeatures = normalized.featureCollection.features || [];
    source.setData(normalized.featureCollection);
    bindDemographicOverlayHover();
    applySocioeconomicVisibility();
  } catch (err) {
    console.error("Failed to load socioeconomic layer:", err);
  }
}
function ensureSchoolsLayer() {
  if (!map.getSource(SCHOOLS_SOURCE_ID)) {
    map.addSource(SCHOOLS_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(SCHOOLS_LAYER_ID)) {
    const beforeLayerId = map.getLayer("selected-building-outline")
      ? "selected-building-outline"
      : undefined;
    map.addLayer(
      {
        id: SCHOOLS_LAYER_ID,
        type: "symbol",
        source: SCHOOLS_SOURCE_ID,
        minzoom: SCHOOLS_DETAIL_POINTS_MIN_ZOOM,
        layout: {
          "icon-image": "town-hall",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 1.1, 14, 1.45, 18, 2],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          visibility: "none",
        },
        paint: {
          "icon-color": "#dc2626",
          "icon-opacity": 0.95,
        },
      },
      beforeLayerId
    );
  }
}
function applySchoolsLayerVisibility() {
  if (!map.getLayer(SCHOOLS_LAYER_ID)) return;
  const isUrban95 = getScoreModeState() === "weighted";
  const visible =
    overlayVisibility.isCanonicalLayerVisible("schools", false) &&
    isUrban95 &&
    currentMode === "house" &&
    map.getZoom() >= SCHOOLS_DETAIL_POINTS_MIN_ZOOM;
  map.setLayoutProperty(SCHOOLS_LAYER_ID, "visibility", visible ? "visible" : "none");
}
function ensureBusStopsLayer() {
  if (!map.getSource(BUS_STOPS_SOURCE_ID)) {
    map.addSource(BUS_STOPS_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(BUS_STOPS_LAYER_ID)) {
    const beforeLayerId = map.getLayer("selected-building-outline")
      ? "selected-building-outline"
      : undefined;
    map.addLayer(
      {
        id: BUS_STOPS_LAYER_ID,
        type: "symbol",
        source: BUS_STOPS_SOURCE_ID,
        minzoom: SCHOOLS_DETAIL_POINTS_MIN_ZOOM,
        layout: {
          "icon-image": "bus",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 1.0, 14, 1.3, 18, 1.8],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          visibility: "none",
        },
        paint: {
          "icon-color": "#2563EB",
          "icon-opacity": 0.95,
        },
      },
      beforeLayerId
    );
  }
}
function applyBusStopsLayerVisibility() {
  if (!map.getLayer(BUS_STOPS_LAYER_ID)) return;
  const isUrban95 = getScoreModeState() === "weighted";
  const visible =
    overlayVisibility.isCanonicalLayerVisible("bus-stops", false) &&
    isUrban95 &&
    currentMode === "house" &&
    map.getZoom() >= SCHOOLS_DETAIL_POINTS_MIN_ZOOM;
  map.setLayoutProperty(BUS_STOPS_LAYER_ID, "visibility", visible ? "visible" : "none");
}
function bindBusStopsHover() {
  if (busStopsHoverBound || !map.getLayer(BUS_STOPS_LAYER_ID)) return;
  Urban95MapRenderers.bindPointHoverLayer(BUS_STOPS_LAYER_ID, function (feature) {
    const props = (feature && feature.properties) || {};
    return props.stop_name || props.name || "Bus stop";
  });
  busStopsHoverBound = true;
}
async function loadBusStopsLayer() {
  try {
    const busStops = await fetchJsonWithGzipFallback(BUS_STOPS_URL, { required: false });
    ensureBusStopsLayer();
    const source = map.getSource(BUS_STOPS_SOURCE_ID);
    if (!source) return;
    source.setData(
      busStops && busStops.type === "FeatureCollection"
        ? busStops
        : { type: "FeatureCollection", features: [] }
    );
    bindBusStopsHover();
    applyBusStopsLayerVisibility();
  } catch (err) {
    console.error("Failed to load bus stops layer:", err);
  }
}
async function loadSchoolsLayer() {
  try {
    const schools = await fetchJsonWithGzipFallback(EDUCATION_URL, { required: false });
    ensureSchoolsLayer();
    const source = map.getSource(SCHOOLS_SOURCE_ID);
    if (!source) return;
    source.setData(
      schools && schools.type === "FeatureCollection"
        ? schools
        : { type: "FeatureCollection", features: [] }
    );
    bindSchoolsHover();
    applySchoolsLayerVisibility();
  } catch (err) {
    console.error("Failed to load schools layer:", err);
  }
}
function getSchoolHoverName(properties) {
  if (!properties) return "School";
  return (
    properties.Institutio ||
    properties.institution ||
    properties.name ||
    properties.NAME ||
    properties.school_name ||
    properties.oldName ||
    "School"
  );
}
function decodeLikelyMojibakeUtf8(value) {
  const text = String(value || "");
  if (!text || text.indexOf("×") === -1) return text;
  try {
    const bytes = Uint8Array.from(Array.from(text, function (char) {
      return char.charCodeAt(0) & 0xff;
    }));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    return decoded && decoded.indexOf("�") === -1 ? decoded : text;
  } catch (_error) {
    return text;
  }
}
function bindSchoolsHover() {
  if (schoolsHoverBound || !map.getLayer(SCHOOLS_LAYER_ID)) return;
  Urban95MapRenderers.bindPointHoverLayer(SCHOOLS_LAYER_ID, function (feature) {
    const props = (feature && feature.properties) || {};
    const name = decodeLikelyMojibakeUtf8(getSchoolHoverName(props));
    const type = decodeLikelyMojibakeUtf8(props.type || "");
    return type ? name + "\n" + type : name;
  });
  schoolsHoverBound = true;
}
function applyRoadSymbologyVisibility() {
  const visibility = overlayVisibility.isCanonicalLayerVisible("roads", false) ? "visible" : "none";
  ROAD_LAYER_IDS.forEach(function (layerId) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  });
}
map.on("load", function () {
  if (controlSidebarAdapter) {
    setLayerVisibilityState(
      Object.assign({}, overlayVisibility.buildDefaultLayerVisibility(), getLayerVisibilityState())
    );
    controlSidebarAdapter.syncMapLayers();
  }
});
map.on("load", loadKidsPopulationGridLayer);
map.on("load", loadSocioeconomicLayer);
map.on("load", loadSchoolsLayer);
map.on("load", loadBusStopsLayer);
Urban95InfoModal.bind({ infoModal: document.getElementById("info-modal"), infoBtn: document.getElementById("info-btn"), modalClose: document.getElementById("modal-close"), modalStart: document.getElementById("modal-start"), modalTabs: document.querySelectorAll(".modal-tab"), tabContents: document.querySelectorAll(".modal-tab-content") });
