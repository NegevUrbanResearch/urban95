(function () {
  var PARK_DOT_PATTERN_ID = "park-dot-pattern";
  var URBAN_NATURE_DOT_PATTERN_ID = "urban-nature-dot-pattern";

  function sourceLayerFor(artifacts, artifactName, fallbackLayer) {
    if (artifacts && typeof artifacts.sourceLayer === "function") {
      return artifacts.sourceLayer(artifactName, fallbackLayer);
    }
    return fallbackLayer;
  }

  function hasGeneratedArtifact(artifacts, artifactName) {
    if (artifacts && typeof artifacts.hasGeneratedArtifact === "function") {
      return artifacts.hasGeneratedArtifact(artifactName);
    }
    return false;
  }

  function pmtilesUrlFor(artifacts, path) {
    if (artifacts && typeof artifacts.pmtilesUrl === "function") {
      return artifacts.pmtilesUrl(path);
    }
    return "pmtiles://" + new URL(path, window.location.href).href;
  }

  function resolveBuildingContracts(options) {
    var opts = options || {};
    var config = opts.config || {};
    var artifacts = opts.artifacts || {};
    var sourceId = (config.sources && config.sources.buildings) || "buildings";
    var fillLayerId = (config.layers && config.layers.buildingsFill) || "buildings-fill";
    var selectedLayerId =
      (config.layers && config.layers.buildingsSelected) || "buildings-selected";
    var mapContracts = config.mapContracts || {};
    if (!mapContracts.buildingSourceLayerFallback) {
      throw new Error("Urban95Config.mapContracts.buildingSourceLayerFallback is required before mapLayers.js");
    }
    var vectorLayerId = sourceLayerFor(artifacts, "buildings", mapContracts.buildingSourceLayerFallback);
    var symPctStateKey =
      (config.stateKeys && config.stateKeys.buildingScorePercent) || "sym_pct";
    var selectedStateKey =
      (config.stateKeys && config.stateKeys.buildingSelected) || "selected";
    var fillColorExpression = createBuildingFillColorExpression(symPctStateKey);

    return {
      sourceId: sourceId,
      fillLayerId: fillLayerId,
      selectedLayerId: selectedLayerId,
      vectorLayerId: vectorLayerId,
      symPctStateKey: symPctStateKey,
      selectedStateKey: selectedStateKey,
      fillColorExpression: fillColorExpression,
    };
  }

  function createBuildingFillColorExpression(symPctStateKey) {
    var stateKey = symPctStateKey || "sym_pct";
    return [
      "interpolate",
      ["linear"],
      ["coalesce", ["feature-state", stateKey], 0],
      0,
      "#dc2626",
      25,
      "#ea580c",
      50,
      "#ca8a04",
      75,
      "#65a30d",
      100,
      "#16a34a",
    ];
  }

  function createPmtilesProtocol() {
    return typeof pmtiles !== "undefined" && pmtiles.Protocol ? new pmtiles.Protocol() : null;
  }

  function createBuildingsSource(options) {
    var opts = options || {};
    var artifacts = opts.artifacts || {};
    var buildingsPmtilesPath = opts.buildingsPmtilesPath || opts.pmtilesPath;
    var fallbackData = opts.fallbackData;
    if (artifacts && typeof artifacts.vectorSourceOrGeojson === "function") {
      var source = artifacts.vectorSourceOrGeojson("buildings", buildingsPmtilesPath, fallbackData);
      if (source && source.type === "vector") {
        source.promoteId = "building_id";
      }
      return source;
    }
    return {
      type: "geojson",
      data: fallbackData || { type: "FeatureCollection", features: [] },
    };
  }

  function createBuildingsFillLayer(options) {
    var opts = options || {};
    var layerId = opts.layerId || "buildings-fill";
    var sourceId = opts.sourceId || "buildings";
    var sourceLayer = opts.sourceLayer;
    var fillColorExpression = opts.fillColorExpression || createBuildingFillColorExpression();
    var layer = {
      id: layerId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": fillColorExpression,
        "fill-opacity": 1,
        "fill-outline-color": "#f8fafc",
      },
    };
    if (sourceLayer) {
      layer["source-layer"] = sourceLayer;
    }
    return layer;
  }

  function createBuildingsSelectedLayer(options) {
    var opts = options || {};
    var layerId = opts.layerId || "buildings-selected";
    var sourceId = opts.sourceId || "buildings";
    var sourceLayer = opts.sourceLayer;
    var selectedStateKey = opts.selectedStateKey || "selected";
    var layer = {
      id: layerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": "#111827",
        "line-width": [
          "case",
          ["boolean", ["feature-state", selectedStateKey], false],
          3,
          0,
        ],
        "line-opacity": [
          "case",
          ["boolean", ["feature-state", selectedStateKey], false],
          1,
          0,
        ],
      },
    };
    if (sourceLayer) {
      layer["source-layer"] = sourceLayer;
    }
    return layer;
  }

  function createParkDotPatternImage(documentRef) {
    var doc = documentRef || document;
    var size = 12;
    var canvas = doc.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);

    // Keep parks visibly filled while the teal dots distinguish them from
    // the solid lime urban-nature overlay.
    ctx.fillStyle = "rgba(20, 184, 166, 0.14)";
    ctx.fillRect(0, 0, size, size);

    [
      [1.6, 1.6, 0.72, "rgba(13, 148, 136, 0.72)"],
      [5.3, 2.4, 0.56, "rgba(15, 118, 110, 0.64)"],
      [9.5, 1.5, 0.64, "rgba(13, 148, 136, 0.68)"],
      [2.8, 5.2, 0.58, "rgba(15, 118, 110, 0.64)"],
      [7.0, 5.0, 0.72, "rgba(13, 148, 136, 0.72)"],
      [10.5, 6.2, 0.52, "rgba(15, 118, 110, 0.62)"],
      [1.5, 9.2, 0.56, "rgba(13, 148, 136, 0.66)"],
      [5.2, 9.6, 0.68, "rgba(15, 118, 110, 0.7)"],
      [9.2, 10.2, 0.58, "rgba(13, 148, 136, 0.66)"],
    ].forEach(function (dot) {
      ctx.fillStyle = dot[3];
      ctx.beginPath();
      ctx.arc(dot[0], dot[1], dot[2], 0, Math.PI * 2);
      ctx.fill();
    });

    return ctx.getImageData(0, 0, size, size);
  }

  function createUrbanNatureDotPatternImage(documentRef) {
    var doc = documentRef || document;
    var size = 12;
    var canvas = doc.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);

    [
      [2.2, 2.0, 0.42, "rgba(77, 124, 15, 0.55)"],
      [6.0, 3.2, 0.36, "rgba(101, 163, 13, 0.5)"],
      [9.4, 2.6, 0.38, "rgba(77, 124, 15, 0.52)"],
      [3.6, 7.0, 0.36, "rgba(101, 163, 13, 0.48)"],
      [7.8, 8.2, 0.4, "rgba(77, 124, 15, 0.54)"],
    ].forEach(function (dot) {
      ctx.fillStyle = dot[3];
      ctx.beginPath();
      ctx.arc(dot[0], dot[1], dot[2], 0, Math.PI * 2);
      ctx.fill();
    });

    return ctx.getImageData(0, 0, size, size);
  }

  function applyParkDotPattern(map, documentRef) {
    if (!map.hasImage(PARK_DOT_PATTERN_ID)) {
      map.addImage(PARK_DOT_PATTERN_ID, createParkDotPatternImage(documentRef), { pixelRatio: 1 });
    }
    if (map.getLayer("parks-fill")) {
      map.setPaintProperty("parks-fill", "fill-pattern", PARK_DOT_PATTERN_ID);
      map.setPaintProperty("parks-fill", "fill-opacity", 0.82);
      map.setPaintProperty("parks-fill", "fill-outline-color", "rgba(13, 148, 136, 0.5)");
    }
  }

  function applyUrbanNatureDotPattern(map, documentRef) {
    if (map.getLayer("urban-nature-fill")) {
      map.setPaintProperty("urban-nature-fill", "fill-pattern", undefined);
      map.setPaintProperty("urban-nature-fill", "fill-color", "rgba(132, 204, 22, 0.18)");
      map.setPaintProperty("urban-nature-fill", "fill-opacity", 1);
      map.setPaintProperty("urban-nature-fill", "fill-outline-color", "rgba(63, 98, 18, 0.28)");
    }
  }

  window.Urban95MapLayers = {
    PARK_DOT_PATTERN_ID: PARK_DOT_PATTERN_ID,
    URBAN_NATURE_DOT_PATTERN_ID: URBAN_NATURE_DOT_PATTERN_ID,
    resolveBuildingContracts: resolveBuildingContracts,
    createPmtilesProtocol: createPmtilesProtocol,
    createBuildingsSource: createBuildingsSource,
    createBuildingsFillLayer: createBuildingsFillLayer,
    createBuildingsSelectedLayer: createBuildingsSelectedLayer,
    createParkDotPatternImage: createParkDotPatternImage,
    createUrbanNatureDotPatternImage: createUrbanNatureDotPatternImage,
    applyParkDotPattern: applyParkDotPattern,
    applyUrbanNatureDotPattern: applyUrbanNatureDotPattern,
  };
})();
