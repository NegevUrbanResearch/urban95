const {
  Urban95Config,
  GENERATED_ARTIFACTS,
  ICONS_BASE,
  BUILDINGS_URL,
  ROADS_URL,
  POPULATION_GRID_URL,
  PARKS_URL,
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
  Urban95ScoreContext,
  Urban95ScoreExplain,
  Urban95ScoreSidebarChrome,
  Urban95AmenityMode,
  Urban95ControlActions,
  Urban95IconLoader,
  createBaseMap,
  Urban95NeighborhoodScores,
  resolveBuildingContracts,
  createPmtilesProtocol,
  createBuildingsSource,
  createBuildingsFillLayer,
  createBuildingsSelectedLayer,
  applyParkDotPattern,
  Urban95ScoreSidebar,
  Urban95InfoModal,
  Urban95Dashboards,
  Urban95ModeController,
  Urban95MapEvents,
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
const getSelectedAmenityTypesState = appState.getSelectedAmenityTypes.bind(appState);
const setSelectedAmenityTypesState = appState.setSelectedAmenityTypes.bind(appState);
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
const showRoadsToggle = document.getElementById("show-roads-toggle");
const showKidsPopulationToggle = document.getElementById("show-kids-population-toggle");
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
let controlsBinding = null;
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
function requireControlsBindingMember(memberName) {
  if (!controlsBinding || typeof controlsBinding[memberName] !== "function") {
    throw new Error("Urban95Controls.bind must provide " + memberName + " before docs/app.js uses it");
  }
  return controlsBinding[memberName];
}
const neighborhoodScores = Urban95NeighborhoodScores.create({
  turf: turf,
  getScoreMode: getScoreModeState,
  getWalkMinutes: getWalkMinutesState,
  getCurrentMode: function () {
    return currentMode;
  },
  getSelectedAmenityTypes: getSelectedAmenityTypesState,
  getAllFilterTypes: getAllFilterTypesState,
  getSelectedWeightedCategoryStem: function () {
    return scoreExplain.getSelectedWeightedCategoryStem();
  },
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
const scoreContext = Urban95ScoreContext.create({
  scoreModel: Urban95ScoreModel,
  state: {
    getSelectedAmenityTypes: getSelectedAmenityTypesState,
    getAllFilterTypes: getAllFilterTypesState,
    getScoreMode: getScoreModeState,
    getWalkMinutes: getWalkMinutesState,
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
  getSelectedWeightedCategoryStem: function () {
    return scoreExplain.getSelectedWeightedCategoryStem();
  },
  fixedMinutes: URBAN95_FIXED_MINUTES,
});
const getCurrentScoreModelContext = scoreContext.getCurrentScoreModelContext;
const getCurrentBuildingCleanFilteredScore = scoreContext.getCurrentBuildingCleanFilteredScore;
const getCurrentBuildingOverallScore = scoreContext.getCurrentBuildingOverallScore;
const collectCurrentBuildingScores = scoreContext.collectCurrentBuildingScores;
const getWeightedAverageValueFromCurrentSelection =
  scoreContext.getWeightedAverageValueFromCurrentSelection;
const weightedNeighborhoodRankingRowsForCurrentSelection =
  scoreContext.weightedNeighborhoodRankingRowsForCurrentSelection;
const getCitywideWeightedAverageScoreForCurrentSelection =
  scoreContext.getCitywideWeightedAverageScoreForCurrentSelection;
const getCurrentPercentileSeriesCacheKey = scoreContext.getCurrentPercentileSeriesCacheKey;
const getCurrentBuildingAmenityStatKeysForMinutes =
  scoreContext.getCurrentBuildingAmenityStatKeysForMinutes;
const scoreExplain = Urban95ScoreExplain.create({
  scoreModel: Urban95ScoreModel,
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
const KIDS_POPULATION_SOURCE_ID = "kids-population-grid";
const KIDS_POPULATION_LAYER_ID = "kids-population-grid-fill";
const KIDS_AGE_0_4_KEY = "גיל0_4";
const KIDS_AGE_5_9_KEY = "גיל5_9";
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
  getScoreMode: function () {
    return getScoreModeState();
  },
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
    buildFilterItems(allAmenityTypes);
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
  return requireControlsBindingMember("getScoreModeLabel")(mode);
}
function syncFilterUiForScoreMode() {
  return requireControlsBindingMember("syncFilterUiForScoreMode")();
}
const HOUSE_MODE_HEX_OPACITY = 0.3;
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
const pointsVisibilitySectionEl = document.getElementById("points-visibility-section");
const legendSectionEl = document.querySelector(".legend-section");
const radiusInfoEl = document.getElementById("radius-info");
const modeController = Urban95ModeController.create({
  runtime: {
    map: map,
    perf: urban95Perf,
    logger: Urban95Logger,
  },
  integrations: {
    dashboards: Urban95Dashboards,
    mapRenderers: Urban95MapRenderers,
    selection: Urban95Selection,
  },
  ui: {
    modeHint: modeHint,
    modeToggle: modeToggle,
    showHeatmapToggle: showHeatmapToggle,
    pointsVisibilitySection: pointsVisibilitySectionEl,
    legendSection: legendSectionEl,
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
  contracts: {
    buildingsFillLayerId: BUILDINGS_FILL_LAYER_ID,
    neighborhoodSurfaceSourceLayerFallback: NEIGHBORHOOD_SURFACE_SOURCE_LAYER_FALLBACK,
    houseModeHexOpacity: HOUSE_MODE_HEX_OPACITY,
  },
  assets: {
    syncFilterUiForScoreMode: syncFilterUiForScoreMode,
    updateFilterLabel: updateFilterLabel,
    hasGeneratedArtifact: hasGeneratedArtifact,
    sourceLayer: sourceLayer,
    getNeighborhoodSurfaceColorExpression: getNeighborhoodSurfaceColorExpression,
    getNeighborhoodSurfaceScorePropertyKey: getNeighborhoodSurfaceScorePropertyKey,
  },
  geo: {
    turf: turf,
  },
});
const switchMode = modeController.switchMode;
const applyHouseModeHexBackground = modeController.applyHouseModeHexBackground;
const addNeighborhoodLayers = modeController.addNeighborhoodLayers;
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
  escapeHtml: scoreExplain.escapeHtml,
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
  getSelectedWeightedCategoryLabel: scoreExplain.getSelectedWeightedCategoryLabel,
  getSelectedWeightedCategoryStem: scoreExplain.getSelectedWeightedCategoryStem,
  getWeightedAverageValueFromSource: getWeightedAverageValueFromCurrentSelection,
  getCitywideWeightedAverageScore: getCitywideWeightedAverageScoreForCurrentSelection,
  weightedCategoryHighlightsFromSource: weightedCategoryHighlightsFromSource,
  weightedNeighborhoodRankingRows: weightedNeighborhoodRankingRowsForCurrentSelection,
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
      buildFilterItems(allAmenityTypes);
    },
    syncFilterUiForScoreMode: syncFilterUiForScoreMode,
    updateShowPointsToggleLabel: updateShowPointsToggleLabel,
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
function updateShowPointsToggleLabel() {
  return requireControlsBindingMember("updateShowPointsToggleLabel")();
}
function getBuildingOverallScore(props, minutes) {
  return getCurrentBuildingOverallScore(props, minutes);
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
  },
  selection: {
    loadIsochrones: Urban95Selection.loadIsochrones,
    selectBuilding: Urban95Selection.selectBuilding,
    updateRadiusInfo: Urban95Selection.updateRadiusInfo,
    clearRadiusSelection: Urban95Selection.clearRadiusSelection,
  },
  dashboards: {
    showNeighborhoodModal: Urban95Dashboards.showNeighborhoodModal,
    renderCitywideModal: Urban95Dashboards.renderCitywideModal,
    updateCitywideModalTitle: Urban95Dashboards.updateCitywideModalTitle,
    hideNeighborhoodModal: Urban95Dashboards.hideNeighborhoodModal,
    hideCitywideModal: Urban95Dashboards.hideCitywideModal,
  },
  scoreSidebar: {
    isOpen: Urban95ScoreSidebar.isOpen,
    hide: Urban95ScoreSidebar.hide,
  },
  modeController: {
    switchMode: switchMode,
  },
  map: {
    getLayer: map.getLayer.bind(map),
    setLayoutProperty: map.setLayoutProperty.bind(map),
  },
  ui: {
    getNeighborhoodModal: function () {
      return neighborhoodModalEl;
    },
    getCitywideModal: function () {
      return citywideModalEl;
    },
  },
});
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
    applyScoreModeAmenities: amenityMode.apply,
    onFilterSelectionChanged: controlActions.onFilterSelectionChanged,
    onScoreModeChanged: controlActions.onScoreModeChanged,
    onWalkMinutesChanged: controlActions.onWalkMinutesChanged,
    onModeToggleRequested: controlActions.onModeToggleRequested,
    onPointVisibilityChanged: controlActions.onPointVisibilityChanged,
    onHeatmapVisibilityChanged: controlActions.onHeatmapVisibilityChanged,
    onEscape: controlActions.onEscape,
    clearDerivedCaches: controlActions.clearDerivedCaches,
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
      applyHouseModeHexBackground: applyHouseModeHexBackground,
    },
    renderers: {
      applyParkDotPattern: applyParkDotPattern,
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
    },
});
Urban95MapEvents.bind({
  map: map,
  selection: Urban95Selection,
  dashboards: Urban95Dashboards,
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
function normalizeKidsPopulationGrid(rawFeatureCollection) {
  const features = (rawFeatureCollection && rawFeatureCollection.features) || [];
  const normalized = [];
  let maxKids = 0;
  features.forEach(function (feature) {
    const geometry = feature && feature.geometry ? feature.geometry : null;
    if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return;
    const props = feature && feature.properties ? feature.properties : {};
    const kids0to9 = getKids0To9Count(props);
    if (!Number.isFinite(kids0to9)) return;
    const safeKids0to9 = Math.max(0, kids0to9);
    if (safeKids0to9 > maxKids) maxKids = safeKids0to9;
    normalized.push({
      type: "Feature",
      properties: {
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
function applyKidsPopulationVisibility() {
  if (!map.getLayer(KIDS_POPULATION_LAYER_ID)) return;
  const visible = showKidsPopulationToggle && showKidsPopulationToggle.checked;
  map.setLayoutProperty(KIDS_POPULATION_LAYER_ID, "visibility", visible ? "visible" : "none");
}
async function loadKidsPopulationGridLayer() {
  try {
    const raw = await fetchJsonWithGzipFallback(POPULATION_GRID_URL, { required: false });
    ensureKidsPopulationLayer();
    const source = map.getSource(KIDS_POPULATION_SOURCE_ID);
    if (!source || !raw) return;
    const normalized = normalizeKidsPopulationGrid(raw);
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
    applyKidsPopulationVisibility();
  } catch (err) {
    console.error("Failed to load kids population grid:", err);
  }
}
function applyRoadSymbologyVisibility() {
  const visibility = showRoadsToggle && showRoadsToggle.checked ? "visible" : "none";
  ROAD_LAYER_IDS.forEach(function (layerId) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  });
}
if (showRoadsToggle) {
  showRoadsToggle.addEventListener("change", applyRoadSymbologyVisibility);
  map.on("load", applyRoadSymbologyVisibility);
}
if (showKidsPopulationToggle) {
  showKidsPopulationToggle.addEventListener("change", applyKidsPopulationVisibility);
}
map.on("load", loadKidsPopulationGridLayer);
Urban95InfoModal.bind({ infoModal: document.getElementById("info-modal"), infoBtn: document.getElementById("info-btn"), modalClose: document.getElementById("modal-close"), modalStart: document.getElementById("modal-start"), modalTabs: document.querySelectorAll(".modal-tab"), tabContents: document.querySelectorAll(".modal-tab-content") });
