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
  SHADE_SI_URL,
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
  SURVEY_RESULTS_URL,
  SURVEY_CATEGORIES,
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
  Urban95SurveyOverlay,
  Urban95AuxiliaryOverlays,
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
const citySidebarEl = document.getElementById("city-sidebar");
const citySidebarCloseEl = document.getElementById("city-sidebar-close");
const citySidebarHeroEl = document.getElementById("city-sidebar-hero");
const citySidebarEyebrowEl = document.getElementById("city-sidebar-eyebrow");
const citySidebarMetaEl = document.getElementById("city-sidebar-meta");
const citySidebarBodyEl = document.getElementById("city-sidebar-body");
const citySidebarEmptyEl = document.getElementById("city-sidebar-empty");
const citySidebarBackdropEl = document.getElementById("city-sidebar-backdrop");
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
function getBuildingHoverProperties(renderedProperties) {
  const rendered = renderedProperties || {};
  const buildingId = rendered.building_id;
  const stored = buildingId == null ? null : buildingPropertiesById.get(String(buildingId));
  return stored ? Object.assign({}, rendered, stored) : rendered;
}
let auxiliaryOverlays = null;
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
  buildBuildingDemographicContext: function (lng, lat) {
    return auxiliaryOverlays
      ? auxiliaryOverlays.buildBuildingDemographicContext(lng, lat)
      : { population: null, socioeconomic: null };
  },
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
const AMENITY_CLUSTER_MIN_ZOOM = 13;
const AMENITY_CLUSTER_PIXEL_RADIUS = 36;
const AMENITY_CLUSTER_DISSOLVE_ZOOM = 16;
const AMENITY_CLUSTER_MAX_COUNT = 50;
const URBAN95_DETAIL_POINTS_MIN_ZOOM = Urban95Config.detailPointsMinZoom || 15;
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
let buildingPropertiesById = new Map();
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
let surveyAvailable = true;
let surveyOverlay = null;
Urban95MapRenderers.configure({
  map: map,
  urban95Perf: urban95Perf,
  hasGeneratedArtifact: hasGeneratedArtifact,
  sourceLayer: sourceLayer,
  ensureDeckGlLoaded: ensureDeckGlLoaded,
  amenityTypeConfig: AMENITY_TYPE_CONFIG,
  getAmenityConfig: getAmenityConfig,
  getCurrentMode: function () { return currentMode; },
  getCitySelection: function () { return citySelection; },
  getCityGapState: function () {
    return Urban95CitySidebar.getGapState();
  },
  cityGapModes: Urban95CityGapModes,
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
  getSurveyBeforeLayerId: function () {
    return surveyOverlay ? surveyOverlay.getBeforeLayerId() : undefined;
  },
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
let citySelection = null;
let modeController = null;
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
surveyOverlay = Urban95SurveyOverlay.create({
  map: map,
  maplibregl: maplibregl,
  tooltip: tooltip,
  surveyResultsUrl: SURVEY_RESULTS_URL,
  categories: SURVEY_CATEGORIES,
  fetchJson: function (url) {
    return fetchJsonWithGzipFallback(url, { required: false });
  },
  getLayerVisibility: getLayerVisibilityState,
  onAvailabilityChanged: function (available) {
    surveyAvailable = !!available;
    if (controlsBinding && typeof controlsBinding.renderIndicatorsSection === "function") {
      controlsBinding.renderIndicatorsSection();
    }
  },
});
auxiliaryOverlays = Urban95AuxiliaryOverlays.create({
  map: map,
  turf: turf,
  overlayVisibility: overlayVisibility,
  fetchJsonWithGzipFallback: fetchJsonWithGzipFallback,
  getCurrentMode: function () {
    return currentMode;
  },
  getScoreMode: getScoreModeState,
  getDeckHovering: function () {
    return _deckHovering;
  },
  refreshLegend: function () {
    if (controlsBinding && typeof controlsBinding.refreshLegend === "function") {
      controlsBinding.refreshLegend();
    }
  },
  formatArea: formatArea,
  mapRenderers: Urban95MapRenderers,
  tooltip: tooltip,
  detailPointsMinZoom: URBAN95_DETAIL_POINTS_MIN_ZOOM,
  urls: {
    populationGrid: POPULATION_GRID_URL,
    socioeconomic: SOCIOECONOMIC_URL,
    education: EDUCATION_URL,
    busStops: BUS_STOPS_URL,
  },
});
Urban95Dashboards.configure({
  map: map,
  fetchJsonWithGzipFallback: fetchJsonWithGzipFallback,
  urls: {
    neighborhoods: NEIGHBORHOODS_URL,
    neighborhoodSurface: NEIGHBORHOOD_SURFACE_URL,
    neighborhoodCharts: NEIGHBORHOOD_CHARTS_URL,
    citywideStats: CITYWIDE_STATS_URL,
  },
  getScoreMode: getScoreModeState,
  getNeighborhoodsData: function () { return neighborhoodsData; },
  setNeighborhoodsData: function (value) { neighborhoodsData = value; },
  getNeighborhoodSurfaceData: function () { return neighborhoodSurfaceData; },
  setNeighborhoodSurfaceData: function (value) { neighborhoodSurfaceData = value; },
  getNeighborhoodChartsPayload: function () { return neighborhoodChartsPayload; },
  setNeighborhoodChartsPayload: function (value) { neighborhoodChartsPayload = value; },
  getCitywideStats: function () { return citywideStats; },
  setCitywideStats: function (value) { citywideStats = value; },
  getAmenityConfig: getAmenityConfig,
  getNeighborhoodSurfaceScorePropertyKey: getNeighborhoodSurfaceScorePropertyKey,
  formatMetricNumber: formatMetricNumber,
  getOrdinalSuffix: scoreExplain.getOrdinalSuffix,
  tooltipEl: tooltip,
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
Urban95CitySidebar.configure({
  getScoreMode: getScoreModeState,
  getScoreMinutes: getScoreMinutes,
  getCitySelection: function () { return citySelection; },
  setCitySelection: function (feature) { citySelection = feature; },
  loadCitywideStats: Urban95Dashboards.loadCitywideStats,
  getCitywideStats: function () { return citywideStats; },
  getNeighborhoodsData: function () { return neighborhoodsData; },
  ensureChartJsLoaded: ensureChartJsLoaded,
  requestAnimationFrame:
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : function (callback) {
          return callback();
        },
  setSidebarPadding: scoreSidebarChrome.setSidebarPadding,
  restoreFocusAfterHide: scoreSidebarChrome.restoreFocusAfterHide,
  fitBounds: map.fitBounds.bind(map),
  bbox: turf.bbox.bind(turf),
  onGapStateChanged: function () {
    Urban95MapRenderers.updateNeighborhoodColors();
  },
  onSelectionChanged: function (feature) {
    Urban95MapRenderers.setCityNeighborhoodSelectionHighlight(feature);
  },
  onOpenNeighborhood: function (feature) {
    Promise.resolve(switchMode("neighborhood")).then(function () {
      Urban95NeighborhoodSidebar.show(feature);
    });
  },
  getNeighborhoodAverageKey: getNeighborhoodAverageKey,
  bulkPercentileRanks: bulkPercentileRanks,
  getWeightedNeighborhoodMetricValue: getWeightedNeighborhoodMetricValue,
  hasWeightedNeighborhoodMetricData: hasWeightedNeighborhoodMetricData,
  renderDeps: {
    escapeHtml: scoreExplain.escapeHtml,
    formatMetricNumber: formatMetricNumber,
    formatScoreInteger: formatScoreInteger,
    getActiveMetric: getActiveMetricState,
    getScoreModeLabel: getScoreModeLabel,
    getOrdinalSuffix: scoreExplain.getOrdinalSuffix,
    heroPercentileMeterFillStyle: scoreExplain.heroPercentileMeterFillStyle,
    getWeightedHistogramDistribution: getWeightedHistogramDistribution,
    getNeighborhoodPercentileKey: getNeighborhoodPercentileKey,
    buildHistogramDistributionFromScores: buildHistogramDistributionFromScores,
    collectBuildingScores: collectBuildingScores,
    percentileBreakpoints: percentileBreakpoints,
    getColorForValue: getColorForValue,
  },
  sidebarEl: citySidebarEl,
  heroEl: citySidebarHeroEl,
  eyebrowEl: citySidebarEyebrowEl,
  metaEl: citySidebarMetaEl,
  bodyEl: citySidebarBodyEl,
  emptyEl: citySidebarEmptyEl,
  closeButtonEl: citySidebarCloseEl,
  backdropEl: citySidebarBackdropEl,
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
  citySidebar: {
    isOpen: Urban95CitySidebar.isOpen,
    sync: Urban95CitySidebar.sync,
    hide: Urban95CitySidebar.hide,
    dismiss: Urban95CitySidebar.dismiss,
    setSelection: Urban95CitySidebar.setSelection,
  },
  modeController: {
    switchMode: switchMode,
  },
  map: {
    getLayer: map.getLayer.bind(map),
    setLayoutProperty: map.setLayoutProperty.bind(map),
  },
  ui: {
    clearTooltip: function () {
      tooltip.textContent = "";
      tooltip.style.display = "none";
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
    syncRoadsVisibility: auxiliaryOverlays.applyRoadSymbologyVisibility,
    syncUrbanNatureVisibility: auxiliaryOverlays.applyUrbanNatureVisibility,
    syncKidsPopulationVisibility: auxiliaryOverlays.applyKidsPopulationVisibility,
    syncSocioeconomicVisibility: auxiliaryOverlays.applySocioeconomicVisibility,
    syncSchoolsVisibility: auxiliaryOverlays.applySchoolsLayerVisibility,
    syncBusStopsVisibility: auxiliaryOverlays.applyBusStopsLayerVisibility,
    syncParksVisibility: overlayVisibility.applyParksVisibility,
    syncSurveyVisibility: surveyOverlay.syncVisibility,
    syncStaticPolygonCompanionsVisibility: overlayVisibility.applyStaticPolygonCompanionsVisibility,
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
  getKidsPopulationLegend: auxiliaryOverlays.getKidsPopulationLegend,
  isCanonicalLayerVisible: function (layerId, fallback) {
    return overlayVisibility.isCanonicalLayerVisible(layerId, fallback);
  },
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
      surveyAvailable: surveyAvailable,
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
    onSurveyVisibilityChanged: function (row, enabled) {
      overlayVisibility.applyOverlayToggleRowChange(row, enabled);
      surveyOverlay.syncVisibility();
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
    citySidebar: Urban95CitySidebar,
    scoreSidebar: Urban95ScoreSidebar,
  },
  ui: {
    modeHint: controlUi.modeHint,
    modeToggle: controlUi.modeToggle,
    indicatorsSection: controlUi.indicatorsSection,
    radiusInfo: radiusInfoEl,
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
    setCitySelection: function (feature) {
      citySelection = feature;
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
    afterNeighborhoodLayersReady: function () {
      if (auxiliaryOverlays && typeof auxiliaryOverlays.applyKidsPopulationVisibility === "function") {
        auxiliaryOverlays.applyKidsPopulationVisibility();
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
    buildingPropertiesById = new Map();
    ((value && value.features) || []).forEach(function (feature) {
      const props = (feature && feature.properties) || {};
      if (props.building_id != null) {
        buildingPropertiesById.set(String(props.building_id), props);
      }
    });
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
      applyUrbanNatureVisibility: auxiliaryOverlays.applyUrbanNatureVisibility,
      applyStaticPolygonCompanionsVisibility: overlayVisibility.applyStaticPolygonCompanionsVisibility.bind(
        overlayVisibility
      ),
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
      shadeSi: SHADE_SI_URL,
      urbanNatureAreas: URBAN_NATURE_AREAS_URL,
    },
});
Urban95MapEvents.bind({
  map: map,
  selection: Urban95Selection,
  dashboards: Urban95Dashboards,
  neighborhoodSidebar: Urban95NeighborhoodSidebar,
  citySidebar: Urban95CitySidebar,
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
  isSurveyClick: function (event) {
    return surveyOverlay ? surveyOverlay.isSurveyClick(event) : false;
  },
  getScoreMode: getScoreModeState,
  getActiveHeatmapId: getActiveHeatmapIdState,
  getBuildingHoverProperties: getBuildingHoverProperties,
  formatArea: formatArea,
});
async function loadSurveyOverlayOnMapReady() {
  if (surveyOverlay && (await surveyOverlay.load())) {
    Urban95MapRenderers.updateDeckAmenityLayers({ caller: "surveyOverlay:installed" });
  }
}

map.on("load", function () {
  if (controlSidebarAdapter) {
    setLayerVisibilityState(
      Object.assign({}, overlayVisibility.buildDefaultLayerVisibility(), getLayerVisibilityState())
    );
    controlSidebarAdapter.syncMapLayers();
  }
  void loadSurveyOverlayOnMapReady();
});
map.on("load", auxiliaryOverlays.loadKidsPopulationGridLayer);
map.on("load", auxiliaryOverlays.loadSocioeconomicLayer);
map.on("load", auxiliaryOverlays.loadSchoolsLayer);
map.on("load", auxiliaryOverlays.loadBusStopsLayer);
Urban95InfoModal.bind({ infoModal: document.getElementById("info-modal"), infoBtn: document.getElementById("info-btn"), modalClose: document.getElementById("modal-close"), modalStart: document.getElementById("modal-start"), modalTabs: document.querySelectorAll(".modal-tab"), tabContents: document.querySelectorAll(".modal-tab-content") });
