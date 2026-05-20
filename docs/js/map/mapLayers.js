(function () {
  var PARK_DOT_PATTERN_ID = "park-dot-pattern";

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
      (config.layers && config.layers.buildingsSelected) || "buildings-selected-outline-vector";
    var vectorLayerId = sourceLayerFor(artifacts, "buildings", "buildings");
    var symPctStateKey =
      (config.stateKeys && config.stateKeys.buildingScorePercent) || "sym_pct";
    var selectedStateKey =
      (config.stateKeys && config.stateKeys.buildingSelected) || "selected";
    var fillColorExpression = [
      "interpolate",
      ["linear"],
      ["coalesce", ["feature-state", symPctStateKey], 0],
      0,
      "#ef4444",
      25,
      "#f97316",
      50,
      "#eab308",
      75,
      "#84cc16",
      100,
      "#22c55e",
    ];

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
    var fillColorExpression = opts.fillColorExpression || resolveBuildingContracts({}).fillColorExpression;
    var layer = {
      id: layerId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": fillColorExpression,
        "fill-opacity": 1,
        "fill-outline-color": "#d4d4d8",
      },
    };
    if (sourceLayer) {
      layer["source-layer"] = sourceLayer;
    }
    return layer;
  }

  function createBuildingsSelectedLayer(options) {
    var opts = options || {};
    var layerId = opts.layerId || "buildings-selected-outline-vector";
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
    var size = 3;
    var canvas = doc.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);

    [
      [1.5, 1.4, 0.48, "rgba(15, 118, 110, 0.58)"],
      [4.5, 1.8, 0.38, "rgba(13, 148, 136, 0.5)"],
      [7.8, 1.2, 0.42, "rgba(15, 118, 110, 0.53)"],
      [2.8, 4.2, 0.4, "rgba(13, 148, 136, 0.51)"],
      [6.2, 4.8, 0.48, "rgba(15, 118, 110, 0.56)"],
      [9.2, 5.4, 0.34, "rgba(13, 148, 136, 0.48)"],
      [1.2, 7.4, 0.36, "rgba(15, 118, 110, 0.5)"],
      [4.8, 8.1, 0.46, "rgba(13, 148, 136, 0.55)"],
      [8.3, 8.4, 0.4, "rgba(15, 118, 110, 0.52)"],
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
      map.setPaintProperty("parks-fill", "fill-opacity", 0.5);
      map.setPaintProperty("parks-fill", "fill-outline-color", "rgba(15, 118, 110, 0.16)");
    }
  }

  window.Urban95MapLayers = {
    PARK_DOT_PATTERN_ID: PARK_DOT_PATTERN_ID,
    resolveBuildingContracts: resolveBuildingContracts,
    createPmtilesProtocol: createPmtilesProtocol,
    createBuildingsSource: createBuildingsSource,
    createBuildingsFillLayer: createBuildingsFillLayer,
    createBuildingsSelectedLayer: createBuildingsSelectedLayer,
    createParkDotPatternImage: createParkDotPatternImage,
    applyParkDotPattern: applyParkDotPattern,
  };
})();
