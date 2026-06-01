(function () {
  var BASE = "./data";
  var ICONS_BASE = "./icons";

  var urls = {
    buildings: BASE + "/buildings_accessibility.geojson",
    roads: BASE + "/roads.geojson",
    parks: BASE + "/parks.geojson",
    education: BASE + "/education.geojson",
    populationGrid: BASE + "/population-grid.geojson",
    socioeconomic: BASE + "/Beersheva_socioeconomic_statareas2023.geojson",
    trees: BASE + "/trees.geojson",
    streetLights: BASE + "/street_lights.geojson",
    amenitiesClean: BASE + "/amenities_new.geojson",
    amenitiesLegacy: BASE + "/amenities_all.geojson",
    isochrones: BASE + "/isochrones.geojson",
    neighborhoods: BASE + "/neighborhoods.geojson",
    neighborhoodSurface: BASE + "/neighborhood_surface.geojson",
    neighborhoodCharts: BASE + "/neighborhood_charts.json",
    citywideStats: BASE + "/citywide_stats.json",
  };

  var generatedFallbacks = {
    buildingsLookup: BASE + "/buildings_lookup.json",
    isochronesLookup: BASE + "/isochrones_lookup.json",
    pointsLookup: BASE + "/points_lookup.json",
    buildingsPmtiles: BASE + "/buildings_accessibility.pmtiles",
    neighborhoodSurfacePmtiles: BASE + "/neighborhood_surface.pmtiles",
    treesPmtiles: BASE + "/trees.pmtiles",
    streetLightsPmtiles: BASE + "/street_lights.pmtiles",
  };

  var mapContracts = {
    buildingSourceLayerFallback: "buildings",
    neighborhoodSurfaceSourceLayerFallback: "neighborhood_surface",
  };

  var cdn = {
    deckGl: "https://unpkg.com/deck.gl@9.0.31/dist.min.js",
    chartJs: "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js",
  };

  var sources = {
    buildings: "buildings",
    trees: "trees",
    streetLights: "street-lights",
    neighborhoods: "neighborhoods",
    neighborhoodSurface: "neighborhood-surface",
  };

  var layers = {
    buildingsFill: "buildings-fill",
    buildingsSelected: "buildings-selected",
    treeIcons: "tree-icons",
    treeIconsVector: "tree-icons-vector",
    streetLightIcons: "street-light-icons",
    streetLightIconsVector: "street-light-icons-vector",
  };

  var stateKeys = {
    buildingScorePercent: "sym_pct",
    buildingSelected: "selected",
  };

  var modes = {
    house: "house",
    neighborhood: "neighborhood",
    citywide: "citywide",
    weighted: "weighted",
    expanded: "expanded",
  };

  var detailPointsMinZoom = 15;

  window.Urban95Config = {
    BASE: BASE,
    ICONS_BASE: ICONS_BASE,
    urls: urls,
    generatedFallbacks: generatedFallbacks,
    mapContracts: mapContracts,
    cdn: cdn,
    sources: sources,
    layers: layers,
    stateKeys: stateKeys,
    modes: modes,
    detailPointsMinZoom: detailPointsMinZoom,
  };
})();
