(function () {
  var BASE = "./data";
  var generated = window.URBAN95_GENERATED_ARTIFACTS || {};

  function getGeneratedOutput(name, fallbackPath) {
    var entry = generated[name];
    if (entry && typeof entry.output === "string" && entry.output) {
      return entry.output;
    }
    return fallbackPath;
  }

  function hasGeneratedArtifact(name) {
    var entry = generated[name];
    return (
      !!entry &&
      entry.status === "built" &&
      !!window.pmtiles &&
      typeof window.pmtiles.Protocol === "function"
    );
  }

  function sourceLayer(name, fallbackLayer) {
    var entry = generated[name];
    if (entry && typeof entry.source_layer === "string" && entry.source_layer) {
      return entry.source_layer;
    }
    return fallbackLayer;
  }

  function pmtilesUrl(path) {
    return "pmtiles://" + new URL(path, window.location.href).href;
  }

  function vectorSourceOrGeojson(artifactName, pmtilesPath, fallbackData) {
    if (hasGeneratedArtifact(artifactName)) {
      return {
        type: "vector",
        url: pmtilesUrl(pmtilesPath),
      };
    }
    return {
      type: "geojson",
      data: fallbackData || { type: "FeatureCollection", features: [] },
    };
  }

  var urls = {
    buildingsLookup: getGeneratedOutput("buildings_lookup", BASE + "/buildings_lookup.json"),
    isochronesLookup: getGeneratedOutput("isochrones_lookup", BASE + "/isochrones_lookup.json"),
    pointsLookup: getGeneratedOutput("points_lookup", BASE + "/points_lookup.json"),
    buildingsPmtiles: getGeneratedOutput("buildings", BASE + "/buildings_accessibility.pmtiles"),
    neighborhoodSurfacePmtiles: getGeneratedOutput("neighborhood_surface", BASE + "/neighborhood_surface.pmtiles"),
    treesPmtiles: getGeneratedOutput("trees", BASE + "/trees.pmtiles"),
    streetLightsPmtiles: getGeneratedOutput("street_lights", BASE + "/street_lights.pmtiles"),
  };

  window.Urban95DataArtifacts = {
    BASE: BASE,
    generated: generated,
    urls: urls,
    hasGeneratedArtifact: hasGeneratedArtifact,
    pmtilesUrl: pmtilesUrl,
    sourceLayer: sourceLayer,
    vectorSourceOrGeojson: vectorSourceOrGeojson,
  };
})();
