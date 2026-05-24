(function () {
  if (!window.Urban95Config || typeof window.Urban95Config !== "object") {
    throw new Error("window.Urban95Config is required before dataArtifacts.js");
  }
  var config = window.Urban95Config;
  var generatedFallbacks = config.generatedFallbacks || {};
  var BASE = config.BASE || "./data";
  var generated = window.URBAN95_GENERATED_ARTIFACTS || {};

  function requireGeneratedFallback(name) {
    if (!generatedFallbacks[name]) {
      throw new Error("Urban95Config.generatedFallbacks." + name + " is required before dataArtifacts.js");
    }
    return generatedFallbacks[name];
  }

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
    buildingsLookup: getGeneratedOutput("buildings_lookup", requireGeneratedFallback("buildingsLookup")),
    isochronesLookup: getGeneratedOutput("isochrones_lookup", requireGeneratedFallback("isochronesLookup")),
    pointsLookup: getGeneratedOutput("points_lookup", requireGeneratedFallback("pointsLookup")),
    buildingsPmtiles: getGeneratedOutput("buildings", requireGeneratedFallback("buildingsPmtiles")),
    neighborhoodSurfacePmtiles: getGeneratedOutput(
      "neighborhood_surface",
      requireGeneratedFallback("neighborhoodSurfacePmtiles")
    ),
    treesPmtiles: getGeneratedOutput("trees", requireGeneratedFallback("treesPmtiles")),
    streetLightsPmtiles: getGeneratedOutput("street_lights", requireGeneratedFallback("streetLightsPmtiles")),
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
