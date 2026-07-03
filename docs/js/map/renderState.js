(function () {
  var OVERLAY_LAYER_IDS = {
    URBAN_NATURE: "urban-nature",
    TREES: "trees",
    STREET_LIGHTS: "street-lights",
    SCHOOLS: "schools",
    AMENITIES: "amenities",
    ROADS: "roads",
    PARKS: "parks",
  };

  function isLayerVisible(layerVisibility, layerId, fallback) {
    if (!layerVisibility || typeof layerVisibility !== "object") {
      return fallback !== undefined ? !!fallback : false;
    }
    if (Object.prototype.hasOwnProperty.call(layerVisibility, layerId)) {
      return !!layerVisibility[layerId];
    }
    return fallback !== undefined ? !!fallback : false;
  }

  function computeActiveMetricKeys(getActiveMetric) {
    var metric = typeof getActiveMetric === "function" ? getActiveMetric() : null;
    return {
      metric: metric,
      buildingPropertyKey: metric && metric.buildingPropertyKey ? metric.buildingPropertyKey : null,
      surfacePropertyKey: metric && metric.surfacePropertyKey ? metric.surfacePropertyKey : null,
      neighborhoodAverageKey: metric && metric.neighborhoodAverageKey ? metric.neighborhoodAverageKey : null,
    };
  }

  function getLayerKeyForFilterType(filterType) {
    if (filterType === "trees") return OVERLAY_LAYER_IDS.TREES;
    if (filterType === "street-lights") return OVERLAY_LAYER_IDS.STREET_LIGHTS;
    return filterType;
  }

  function hasOwnMetricValue(source, key) {
    if (!source || !key) return false;
    return Object.prototype.hasOwnProperty.call(source, key);
  }

  function getSurfaceSample(surfaceData) {
    if (!surfaceData || !Array.isArray(surfaceData.features) || surfaceData.features.length === 0) {
      return null;
    }
    return surfaceData.features[0] && surfaceData.features[0].properties
      ? surfaceData.features[0].properties
      : null;
  }

  function isWeightedSubcategoryMetric(metric) {
    return !!(metric && metric.kind === "weighted-subcategory" && metric.selectedWeightedSubStem);
  }

  function meanFromRankingRows(rankingRows, key) {
    if (!Array.isArray(rankingRows) || rankingRows.length === 0 || !key) return null;
    var values = rankingRows
      .map(function (row) {
        return Number(row && row[key]);
      })
      .filter(function (value) {
        return Number.isFinite(value);
      });
    if (values.length === 0) return null;
    return values.reduce(function (sum, value) {
      return sum + value;
    }, 0) / values.length;
  }

  function getWeightedNeighborhoodMetricValue(source, suffix, metric, rankingRows) {
    void suffix;
    if (!metric || !metric.neighborhoodAverageKey) return null;
    var key = metric.neighborhoodAverageKey;
    var direct = Number(source && source[key]);
    if (Number.isFinite(direct)) return direct;
    if (rankingRows !== undefined) {
      return meanFromRankingRows(rankingRows, key);
    }
    return null;
  }

  function hasWeightedNeighborhoodMetricData(metric, source, rankingRows) {
    if (!metric || metric.kind.indexOf("weighted") !== 0 || !metric.neighborhoodAverageKey) {
      return true;
    }
    var key = metric.neighborhoodAverageKey;
    if (hasOwnMetricValue(source, key)) {
      if (rankingRows === undefined) return true;
      if (!Array.isArray(rankingRows) || rankingRows.length === 0) return false;
      return hasOwnMetricValue(rankingRows[0], key);
    }
    if (rankingRows !== undefined && Array.isArray(rankingRows) && rankingRows.length > 0) {
      return hasOwnMetricValue(rankingRows[0], key);
    }
    return false;
  }

  function getWeightedHistogramDistribution(stats, suffix, metric, fallbackDistribution) {
    if (
      metric &&
      metric.kind === "weighted-overall" &&
      stats &&
      stats["distribution_weighted" + suffix]
    ) {
      return stats["distribution_weighted" + suffix];
    }
    return typeof fallbackDistribution === "function" ? fallbackDistribution() : null;
  }

  function getWeightedShowActions(options, metricId) {
    var showRegistry = options && options.showRegistry;
    if (!showRegistry || typeof showRegistry.resolveWeightedShowActions !== "function") {
      return [];
    }
    return showRegistry.resolveWeightedShowActions(options && options.scoreModel, metricId);
  }

  function resolveWeightedCompanionTypes(options) {
    var metric = options.metric;
    if (!metric || metric.kind.indexOf("weighted") !== 0) {
      return {
        amenityTypes: [],
        includeTrees: false,
        includeStreetLights: false,
        empty: true,
      };
    }

    var actions = getWeightedShowActions(options, metric.id);
    var amenityTypes = new Set();
    var includeTrees = false;
    var includeStreetLights = false;

    actions.forEach(function (action) {
      if (action.kind === "amenity-types") {
        (action.types || []).forEach(function (type) {
          if (type) amenityTypes.add(type);
        });
      } else if (action.kind === "point-layer") {
        if (action.layer === "trees") includeTrees = true;
        if (action.layer === "street-lights") includeStreetLights = true;
      }
    });

    var typeList = Array.from(amenityTypes);
    return {
      amenityTypes: typeList,
      includeTrees: includeTrees,
      includeStreetLights: includeStreetLights,
      empty: typeList.length === 0 && !includeTrees && !includeStreetLights,
    };
  }

  function resolveWeightedShownAmenityTypes(options) {
    options = options || {};
    var metric = options.metric;
    if (!metric || metric.kind.indexOf("weighted") !== 0) {
      return [];
    }
    var shownAmenityTypes = options.shownAmenityTypes;
    if (!(shownAmenityTypes instanceof Set)) {
      shownAmenityTypes = new Set(Array.isArray(shownAmenityTypes) ? shownAmenityTypes : []);
    }
    var actions = getWeightedShowActions(options, metric.id);
    var amenityTypes = new Set();
    actions.forEach(function (action) {
      if (action.kind !== "amenity-types") return;
      (action.types || []).forEach(function (type) {
        if (type && shownAmenityTypes.has(type)) amenityTypes.add(type);
      });
    });
    return Array.from(amenityTypes);
  }

  function resolvePolygonAnalysisFilter(options) {
    options = options || {};
    if (options.scoreMode === "weighted") {
      return resolveWeightedCompanionTypes({
        metric: typeof options.getActiveMetric === "function" ? options.getActiveMetric() : null,
        scoreModel: options.scoreModel,
        showRegistry: options.showRegistry,
      });
    }

    var selectedAmenityTypes = options.selectedAmenityTypes;
    var allFilterTypes = options.allFilterTypes || [];
    if (!selectedAmenityTypes || selectedAmenityTypes.size === 0) {
      return {
        amenityTypes: [],
        includeTrees: false,
        includeStreetLights: false,
        useAll: false,
        empty: true,
      };
    }

    var useAll = selectedAmenityTypes.size === allFilterTypes.length;
    return {
      amenityTypes: Array.from(selectedAmenityTypes),
      includeTrees: useAll || selectedAmenityTypes.has("trees"),
      includeStreetLights: useAll || selectedAmenityTypes.has("street-lights"),
      useAll: useAll,
      empty: false,
    };
  }

  function computeSpecialPointRenderPlan(context) {
    context = context || {};
    var scoreMode = context.scoreMode;
    var currentMode = context.currentMode;
    var zoom = context.zoom;
    var urban95DetailPointsMinZoom = context.urban95DetailPointsMinZoom || 0;
    var layerVisibility = context.layerVisibility || {};
    var useGeneratedVector = context.useGeneratedVector === true;
    var filterType = context.filterType;
    var getData = context.getData;
    var getInRadiusIds = context.getInRadiusIds;
    var isOnlyFilter = context.isOnlyFilter;
    var selectedAmenityTypes = context.selectedAmenityTypes;
    var allFilterTypes = context.allFilterTypes || [];

    var layerKey = getLayerKeyForFilterType(filterType);

    if (scoreMode === "weighted") {
      var showWeighted =
        currentMode === "house" &&
        zoom >= urban95DetailPointsMinZoom &&
        isLayerVisible(layerVisibility, layerKey, true);
      var weightedData = typeof getData === "function" ? getData() : null;
      return {
        geojsonVisible: showWeighted && !useGeneratedVector,
        vectorVisible: showWeighted && useGeneratedVector,
        features:
          useGeneratedVector || !weightedData
            ? null
            : showWeighted
              ? weightedData
              : { type: "FeatureCollection", features: [] },
      };
    }

    var data = typeof getData === "function" ? getData() : null;
    if (!data) {
      return {
        geojsonVisible: currentMode === "house",
        vectorVisible: false,
        features: null,
      };
    }

    if (!selectedAmenityTypes || selectedAmenityTypes.size === 0) {
      return {
        geojsonVisible: currentMode === "house",
        vectorVisible: false,
        features: { type: "FeatureCollection", features: [] },
      };
    }

    var useAll = selectedAmenityTypes.size === allFilterTypes.length;
    var showKind = useAll || selectedAmenityTypes.has(filterType);
    if (!showKind || !isLayerVisible(layerVisibility, layerKey, true)) {
      return {
        geojsonVisible: currentMode === "house",
        vectorVisible: false,
        features: { type: "FeatureCollection", features: [] },
      };
    }

    if (typeof isOnlyFilter === "function" && isOnlyFilter()) {
      return {
        geojsonVisible: currentMode === "house",
        vectorVisible: false,
        features: data,
      };
    }

    var ids = typeof getInRadiusIds === "function" ? getInRadiusIds() : new Set();
    if (!ids || ids.size === 0) {
      return {
        geojsonVisible: currentMode === "house",
        vectorVisible: false,
        features: { type: "FeatureCollection", features: [] },
      };
    }

    return {
      geojsonVisible: currentMode === "house",
      vectorVisible: false,
      features: {
        type: "FeatureCollection",
        features: data.features.filter(function (_feature, index) {
          return ids.has(index);
        }),
      },
    };
  }

  function shouldRenderDeckAmenities(context) {
    context = context || {};
    var layerVisibility = context.layerVisibility || {};
    var togglePresent = context.togglePresent === true;
    var amenitiesVisible = isLayerVisible(layerVisibility, OVERLAY_LAYER_IDS.AMENITIES, true);
    return (
      context.currentMode === "house" &&
      (context.scoreMode !== "expanded" || !togglePresent || amenitiesVisible) &&
      context.zoom >= context.amenityClusterMinZoom
    );
  }

  function buildDeckRenderStateKey(context) {
    return [
      context.shouldRender ? "render" : "hidden",
      context.scoreMode,
      context.currentMode,
      context.togglePresent ? "toggle" : "no-toggle",
      context.amenitiesVisible ? "checked" : "unchecked",
      context.selectedAmenityTypesSignature || "",
      context.cameraSignature || "",
      String(context.visibleFeaturesStamp || 0),
    ].join("::");
  }

  window.Urban95RenderState = {
    OVERLAY_LAYER_IDS: OVERLAY_LAYER_IDS,
    isLayerVisible: isLayerVisible,
    computeActiveMetricKeys: computeActiveMetricKeys,
    resolveWeightedCompanionTypes: resolveWeightedCompanionTypes,
    resolveWeightedShownAmenityTypes: resolveWeightedShownAmenityTypes,
    resolvePolygonAnalysisFilter: resolvePolygonAnalysisFilter,
    computeSpecialPointRenderPlan: computeSpecialPointRenderPlan,
    shouldRenderDeckAmenities: shouldRenderDeckAmenities,
    buildDeckRenderStateKey: buildDeckRenderStateKey,
    getLayerKeyForFilterType: getLayerKeyForFilterType,
    isWeightedSubcategoryMetric: isWeightedSubcategoryMetric,
    hasOwnMetricValue: hasOwnMetricValue,
    getSurfaceSample: getSurfaceSample,
    getWeightedNeighborhoodMetricValue: getWeightedNeighborhoodMetricValue,
    hasWeightedNeighborhoodMetricData: hasWeightedNeighborhoodMetricData,
    getWeightedHistogramDistribution: getWeightedHistogramDistribution,
    supportsMetricNeighborhoodAverageData: function (metric, source) {
      return hasWeightedNeighborhoodMetricData(metric, source);
    },
    supportsMetricSurfaceData: function (metric, surfaceData) {
      if (!metric || !metric.surfacePropertyKey) return true;
      return hasOwnMetricValue(getSurfaceSample(surfaceData), metric.surfacePropertyKey);
    },
  };
})();
