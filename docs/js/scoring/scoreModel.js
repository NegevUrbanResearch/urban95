(function () {
  var palette = window.Urban95Palette;
  if (!palette) {
    throw new Error("Urban95ScoreModel requires Urban95Palette (load js/core/palette.js first)");
  }

  var AMENITY_TYPE_CONFIG = {
    trees: { color: palette.sage, icon: "park-alt1", label: "Trees" },
    healthcare: { color: palette.coral, icon: "hospital", label: "Healthcare" },
    education: { color: palette.lavender, icon: "town-hall", label: "Education" },
    commercial: { color: palette.blue, icon: "shop", label: "Commercial" },
    services: { color: palette.lavender, icon: "town-hall", label: "Services" },
    religious_institutions: { color: palette.orchid, icon: "place-of-worship", label: "Religious" },
    parks_and_recreation: { color: palette.sage, icon: "restaurant", label: "Recreation" },
    public_institutions: { color: palette.lavender, icon: "building", label: "Public" },
    fitness: { color: palette.coral, icon: "fitness-centre", label: "Fitness" },
    transportation: { color: palette.peach, icon: "bus", label: "Transport" },
    financial_services: { color: palette.blue, icon: "bank", label: "Financial" },
    tourism: { color: palette.sky, icon: "lodging", label: "Tourism" },
    senior_services_and_living: { color: palette.peach, icon: "home", label: "Senior" },
    health: { color: palette.coral, icon: "marker", label: "Healthcare" },
    businesscenters: { color: palette.blue, icon: "marker", label: "Business Centers" },
    "community-centers": { color: palette.lavender, icon: "marker", label: "Community Centers" },
    playgrounds: { color: palette.coral, icon: "marker", label: "Playgrounds" },
    shelters: { color: palette.peach, icon: "marker", label: "Shelters" },
    "street-lights": { color: palette.gold, icon: "lighthouse", label: "Street Lights" },
  };

  var DEFAULT_CONFIG = { color: palette.gray, icon: "marker", label: "Other" };

  var CLEAN_WEIGHTS = {
    trees: 4.0,
    parks: 15.0,
    playgrounds: 15.0,
    "street-lights": 3.75,
    bus_stops: 7.5,
    shelters: 10.0,
    education: 7.5,
    "community-centers": 5.0,
    businesscenters: 5.0,
    health: 7.5,
  };

  var CLEAN_SCORE_COMPONENTS = [
    { key: "trees", label: "Trees", shortTag: "trees in range" },
    { key: "parks", label: "Parks", shortTag: "park polygons intersecting the walk area" },
    { key: "playgrounds", label: "Playgrounds", shortTag: "playground POIs" },
    { key: "health", label: "Health", shortTag: "health POIs" },
    { key: "education", label: "Education", shortTag: "education POIs" },
    { key: "bus_stops", label: "Bus stops", shortTag: "transit stop POIs" },
    { key: "shelters", label: "Shelters", shortTag: "shelter POIs" },
    { key: "community-centers", label: "Community centers", shortTag: "community-center POIs" },
    { key: "businesscenters", label: "Business hubs", shortTag: "business-hub POIs" },
    { key: "street-lights", label: "Street lights", shortTag: "street-light points" },
  ];

  // Palette narrative: sky = ambient comfort · green = living places · coral = child play ·
  // amber = mobility/caution · purple = care institutions. Only nature owns green.
  var WEIGHTED_CATEGORY_COMPONENTS = [
    { stem: "environmental_quality", label: "Environmental Quality", weight: 0.2, color: palette.sky },
    { stem: "nature", label: "Nature", weight: 0.15, color: palette.sage },
    { stem: "play", label: "Play", weight: 0.15, color: palette.coral },
    { stem: "safety_mobility", label: "Safety & Mobility", weight: 0.25, color: palette.peach },
    { stem: "family_services", label: "Family Services", weight: 0.25, color: palette.lavender },
  ];

  var WEIGHTED_CATEGORY_BY_STEM = WEIGHTED_CATEGORY_COMPONENTS.reduce(function (acc, comp) {
    acc[comp.stem] = comp;
    return acc;
  }, {});

  var WEIGHTED_SUBCATEGORY_COMPONENTS = {
    environmental_quality: [
      { stem: "shade", label: "Shade", weight: 0.4 },
      { stem: "trees", label: "Trees", weight: 0.2 },
      { stem: "roads", label: "Distance from fast roads", weight: 0.4 },
    ],
    nature: [
      { stem: "parks", label: "Parks", weight: 0.5 },
      { stem: "urban_nature_areas", label: "Urban nature areas", weight: 0.5 },
    ],
    play: [
      { stem: "playgrounds", label: "Playgrounds", weight: 1.0 },
    ],
    safety_mobility: [
      { stem: "street_lights", label: "Street lights", weight: 0.15 },
      { stem: "bicycle_access", label: "Bicycle access", weight: 0.15 },
      { stem: "bus_stops", label: "Bus stops", weight: 0.3 },
      { stem: "shelters", label: "Shelters", weight: 0.4 },
    ],
    family_services: [
      { stem: "education", label: "Education", weight: 0.3 },
      { stem: "community", label: "Community centers", weight: 0.2 },
      { stem: "business", label: "Business centers", weight: 0.2 },
      { stem: "health", label: "Health", weight: 0.3 },
    ],
  };

  var DEFAULT_SCORE_LEGEND_LABELS = ["0", "25", "50", "75", "100"];
  var SHADE_EXPLAIN_NOTE =
    "Official SI interpretation bands: <0.10 severe lack; 0.10-<0.20 significant lack; 0.20-<0.40 needs improvement; 0.40-<0.60 good shade; >=0.60 excellent shade. Building summer_SI is the 300 m area-weighted summer_SI mean around the building centroid, rounded to 1 decimal with standard half-up ties before storage, display, and scoring (0.15 -> 0.2, 0.35 -> 0.4). Urban95 keeps a ternary building shade sub-score on that rounded summer_SI: <0.20 = 0, 0.20-<0.40 = 50, >=0.40 = 100.";
  var WEIGHTED_METRIC_METADATA = {
    "u95.sub.environmental_quality.shade": {
      explainNote: SHADE_EXPLAIN_NOTE,
    },
  };

  var WEIGHTED_CATEGORY_LABEL_BY_STEM = WEIGHTED_CATEGORY_COMPONENTS.reduce(function (acc, comp) {
    acc[comp.stem] = comp.label;
    return acc;
  }, {});

  var URBAN95_REGISTRY_MINUTES = 10;
  var weightedMetricRegistryCache = null;

  function normalizeSurfaceFilterKey(value) {
    return (
      String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[^0-9a-z]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "") || "other"
    );
  }

  function weightedRegistrySuffix() {
    return "_" + URBAN95_REGISTRY_MINUTES + "min";
  }

  function buildDefaultMetricLegendSpec(metric) {
    if (!metric) return null;
    return {
      title: metric.label || "",
      subtitle:
        metric.scale === "percentile"
          ? "Amenities Focus \u00b7 percentile rank"
          : "Urban95 \u00b7 weighted score (0-100)",
      labels: DEFAULT_SCORE_LEGEND_LABELS.slice(),
    };
  }

  function buildMetricLegendSpec(metric) {
    if (!metric) return null;
    var base = buildDefaultMetricLegendSpec(metric) || {};
    var override = metric.legendSpec || {};
    return {
      title: override.title || base.title || "",
      subtitle: override.subtitle || base.subtitle || "",
      labels: Array.isArray(override.labels) && override.labels.length
        ? override.labels.slice()
        : (base.labels || []).slice(),
    };
  }

  function getMetricExplainNote(metric) {
    if (!metric || typeof metric.explainNote !== "string") return "";
    return metric.explainNote;
  }

  function applyWeightedMetricMetadata(metric) {
    if (!metric || !metric.id) return metric;
    var metadata = WEIGHTED_METRIC_METADATA[metric.id];
    if (!metadata) return metric;
    if (metadata.legendSpec) {
      metric.legendSpec = Object.assign({}, metadata.legendSpec);
    }
    if (typeof metadata.explainNote === "string") {
      metric.explainNote = metadata.explainNote;
    }
    return metric;
  }

  function buildWeightedMetricRegistry() {
    if (weightedMetricRegistryCache) return weightedMetricRegistryCache;

    var sfx = weightedRegistrySuffix();
    var registry = {
      "u95.overall": {
        id: "u95.overall",
        kind: "weighted-overall",
        label: "All",
        scale: "weighted",
        selectedWeightedStem: null,
        selectedWeightedSubStem: null,
        buildingPropertyKey: "score_weighted" + sfx,
        surfacePropertyKey: "score_weighted",
        neighborhoodAverageKey: "avg_score_weighted" + sfx,
      },
    };

    WEIGHTED_CATEGORY_COMPONENTS.forEach(function (category) {
      var categoryId = "u95.cat." + category.stem;
      registry[categoryId] = {
        id: categoryId,
        kind: "weighted-category",
        label: category.label,
        scale: "weighted",
        selectedWeightedStem: category.stem,
        selectedWeightedSubStem: null,
        buildingPropertyKey: "score_weighted_" + category.stem + sfx,
        surfacePropertyKey: "score_weighted_" + category.stem,
        neighborhoodAverageKey: "avg_score_weighted_" + category.stem + sfx,
      };

      (WEIGHTED_SUBCATEGORY_COMPONENTS[category.stem] || []).forEach(function (sub) {
        var subId = "u95.sub." + category.stem + "." + sub.stem;
        registry[subId] = applyWeightedMetricMetadata({
          id: subId,
          kind: "weighted-subcategory",
          label: sub.label,
          scale: "weighted",
          selectedWeightedStem: category.stem,
          selectedWeightedSubStem: sub.stem,
          buildingPropertyKey: "score_weighted_sub_" + category.stem + "_" + sub.stem + sfx,
          surfacePropertyKey: "score_weighted_sub_" + category.stem + "_" + sub.stem,
          neighborhoodAverageKey: "avg_score_weighted_sub_" + category.stem + "_" + sub.stem + sfx,
        });
      });
    });

    weightedMetricRegistryCache = registry;
    return registry;
  }

  function getWeightedMetric(metricId) {
    var registry = buildWeightedMetricRegistry();
    return registry[metricId] || null;
  }

  function resolveExpandedMetric(selectedAmenityTypes, walkMinutes) {
    var minutes = Number(walkMinutes) || 5;
    var suffix = "_" + minutes + "min";
    var selected = Array.isArray(selectedAmenityTypes)
      ? selectedAmenityTypes.slice()
      : Array.from(selectedAmenityTypes || []);

    if (selected.length === 1) {
      var onlyType = selected[0];
      var scenarioType = onlyType === "health" ? "healthcare" : onlyType;
      var filterStem = normalizeSurfaceFilterKey(scenarioType);
      return {
        kind: "expanded-filter",
        label: onlyType,
        scale: "percentile",
        buildingPropertyKey: null,
        surfacePropertyKey: "score_filter_" + filterStem + suffix,
        neighborhoodAverageKey: null,
        selectedWeightedStem: null,
        selectedWeightedSubStem: null,
        legendSpec: null,
      };
    }

    return {
      kind: "expanded-overall",
      label: "Amenities Focus",
      scale: "percentile",
      buildingPropertyKey: null,
      surfacePropertyKey: "score_expanded" + suffix,
      neighborhoodAverageKey: null,
      selectedWeightedStem: null,
      selectedWeightedSubStem: null,
      legendSpec: null,
    };
  }

  function resolveActiveMetric(options) {
    var config = options || {};
    var scoreMode = config.scoreMode;
    var activeHeatmapId = config.activeHeatmapId;
    var selectedAmenityTypes = config.selectedAmenityTypes || [];
    var walkMinutes = config.walkMinutes;
    var weightedRegistry = buildWeightedMetricRegistry();

    if (scoreMode === "weighted") {
      if (activeHeatmapId == null || activeHeatmapId === "") return null;
      return weightedRegistry[activeHeatmapId] || weightedRegistry["u95.overall"];
    }

    return resolveExpandedMetric(selectedAmenityTypes, walkMinutes);
  }

  function resolveWeightedMetric(options) {
    return resolveActiveMetric(
      Object.assign(
        {
          scoreMode: "weighted",
        },
        options || {}
      )
    );
  }

  function toArray(types) {
    if (!types) return [];
    if (Array.isArray(types)) return types.slice();
    if (
      typeof types.size === "number" &&
      typeof types.forEach === "function" &&
      typeof types.has === "function"
    ) {
      return Array.from(types);
    }
    return [types];
  }

  function getAmenityConfig(type) {
    if (!type) return DEFAULT_CONFIG;
    var config = AMENITY_TYPE_CONFIG[String(type).toLowerCase()];
    return config || DEFAULT_CONFIG;
  }

  function amenityTypeToBuildingStatKey(type) {
    if (type === "health") return "healthcare";
    return type;
  }

  function cleanPtsPropertyName(weightKey, minutes) {
    return "clean_pts_" + String(weightKey).replace(/-/g, "_") + "_" + minutes + "min";
  }

  function cleanPtsPropertyNamesForType(type, minutes) {
    var names = [];
    var directKey = String(type || "").toLowerCase().trim().replace(/\s+/g, "_").replace(/-/g, "_");
    if (directKey) names.push(cleanPtsPropertyName(directKey, minutes));
    var weightKey = filterTypeToCleanWeightKey(type);
    if (weightKey) names.push(cleanPtsPropertyName(weightKey, minutes));
    return names.filter(function (name, index) {
      return names.indexOf(name) === index;
    });
  }

  function hasCleanPtsBreakdown(props, minutes) {
    if (!props) return false;
    var suffix = "_" + minutes + "min";
    return Object.keys(props).some(function (key) {
      return key.indexOf("clean_pts_") === 0 && key.endsWith(suffix);
    });
  }

  function filterTypeToCleanCountStem(filterType) {
    if (filterType === "trees") return "trees";
    if (filterType === "street-lights") return "street_lights";
    var stem = String(filterType || "").toLowerCase().trim().replace(/\s+/g, "_").replace(/-/g, "_");
    if (stem === "healthcare") stem = "health";
    return stem;
  }

  function cleanCountStemToWeightKey(stem) {
    if (stem === "street_lights") return "street-lights";
    if (stem === "community_centers") return "community-centers";
    if (stem === "bus_stops") return "bus_stops";
    if (CLEAN_WEIGHTS[stem] !== undefined) return stem;
    return null;
  }

  function filterTypeToCleanWeightKey(type) {
    if (type === "trees") return "trees";
    if (type === "street-lights") return "street-lights";
    var stem = filterTypeToCleanCountStem(type);
    return cleanCountStemToWeightKey(stem);
  }

  function getBuildingCleanFilteredScore(props, minutes, selectedTypes, allFilterTypes, currentMode) {
    var p = props || {};
    var suffix = "_" + minutes + "min";
    var selected = toArray(selectedTypes);
    var allTypes = toArray(allFilterTypes);
    var filteringLockedToAll = currentMode && currentMode !== "house";
    var useAll = filteringLockedToAll || (allTypes.length > 0 && selected.length === allTypes.length);
    var activeTypes = filteringLockedToAll ? allTypes : selected;

    if (selected.length === 0) return 0;
    if (useAll) {
      return Number(p["score_clean" + suffix]) || 0;
    }
    if (hasCleanPtsBreakdown(p, minutes)) {
      var total = 0;
      activeTypes.forEach(function (type) {
        var value = null;
        cleanPtsPropertyNamesForType(type, minutes).some(function (col) {
          var candidate = Number(p[col]);
          if (!Number.isFinite(candidate)) return false;
          value = candidate;
          return true;
        });
        if (Number.isFinite(value)) total += value;
      });
      return total;
    }

    var fallbackTotal = 0;
    activeTypes.forEach(function (type) {
      var stem = filterTypeToCleanCountStem(type);
      var col = "clean_" + stem + "_" + minutes + "min";
      var count = Number(p[col]);
      if (!Number.isFinite(count)) return;
      var weightKey = cleanCountStemToWeightKey(stem);
      var weight = weightKey != null ? CLEAN_WEIGHTS[weightKey] : 0;
      fallbackTotal += weight * count;
    });
    return fallbackTotal;
  }

  function getExpandedContributionForType(props, minutes, type) {
    var p = props || {};
    var suffix = "_" + minutes + "min";
    if (type === "trees") {
      return (Number(p["num_trees" + suffix]) || 0) * 0.25;
    }
    if (type === "street-lights") {
      return (Number(p["num_street_lights" + suffix]) || 0) * 0.25;
    }
    var statKey = amenityTypeToBuildingStatKey(type);
    return Number(p["amen_" + statKey + suffix]) || 0;
  }

  function getFilteredContributionForType(props, minutes, type) {
    var p = props || {};
    var suffix = "_" + minutes + "min";
    if (hasCleanPtsBreakdown(p, minutes)) {
      var directPoints = null;
      cleanPtsPropertyNamesForType(type, minutes).some(function (col) {
        var candidate = Number(p[col]);
        if (!Number.isFinite(candidate)) return false;
        directPoints = candidate;
        return true;
      });
      if (Number.isFinite(directPoints)) return directPoints;
    }
    if (type === "trees") {
      return CLEAN_WEIGHTS.trees * (Number(p["num_trees" + suffix]) || 0);
    }
    if (type === "street-lights") {
      var cleanCol = "clean_street_lights_" + minutes + "min";
      var fromClean = Number(p[cleanCol]);
      if (Number.isFinite(fromClean)) {
        return CLEAN_WEIGHTS["street-lights"] * fromClean;
      }
      return CLEAN_WEIGHTS["street-lights"] * (Number(p["num_street_lights" + suffix]) || 0);
    }
    var stem = filterTypeToCleanCountStem(type);
    var countCol = "clean_" + stem + "_" + minutes + "min";
    var count = Number(p[countCol]);
    if (Number.isFinite(count)) {
      var fallbackWeightKey = cleanCountStemToWeightKey(stem);
      var weight = fallbackWeightKey != null ? CLEAN_WEIGHTS[fallbackWeightKey] : 0;
      return weight * count;
    }
    return 0;
  }

  function percentileBreakpoints(values) {
    if (!values || values.length === 0) return [0, 1, 2, 3, 5];
    var sorted = values.filter(function (value) {
      return Number.isFinite(value);
    }).slice().sort(function (a, b) {
      return a - b;
    });
    if (sorted.length === 0) return [0, 1, 2, 3, 5];
    var count = sorted.length;
    var breakpoints = [0, 25, 50, 75, 100].map(function (percentile) {
      var index = Math.min(Math.round(percentile / 100 * (count - 1)), count - 1);
      return sorted[index];
    });
    for (var i = 1; i < breakpoints.length; i++) {
      if (breakpoints[i] <= breakpoints[i - 1]) breakpoints[i] = breakpoints[i - 1] + 0.001;
    }
    return breakpoints;
  }

  function buildHistogramDistributionFromScores(scores, step) {
    var bucketStep = Number(step) > 0 ? Number(step) : 10;
    var edges = [];
    for (var value = 0; value <= 100; value += bucketStep) {
      edges.push(value);
    }
    if (edges[edges.length - 1] !== 100) edges.push(100);
    var counts = new Array(edges.length - 1).fill(0);
    (scores || []).forEach(function (raw) {
      var score = Math.max(0, Math.min(100, Number(raw) || 0));
      var index = Math.floor(score / bucketStep);
      if (index >= counts.length) index = counts.length - 1;
      if (index < 0) index = 0;
      counts[index] += 1;
    });
    return { edges: edges, counts: counts };
  }

  function getColorForValue(value, breakpoints) {
    var stops = [
      [239, 68, 68],
      [249, 115, 22],
      [234, 179, 8],
      [132, 204, 22],
      [34, 197, 94],
    ];

    if (value <= breakpoints[0]) return "rgb(" + stops[0].join(",") + ")";
    if (value >= breakpoints[breakpoints.length - 1]) {
      return "rgb(" + stops[stops.length - 1].join(",") + ")";
    }

    for (var i = 0; i < breakpoints.length - 1; i++) {
      if (value <= breakpoints[i + 1]) {
        var t = (value - breakpoints[i]) / (breakpoints[i + 1] - breakpoints[i]);
        var r = Math.round(stops[i][0] + (stops[i + 1][0] - stops[i][0]) * t);
        var g = Math.round(stops[i][1] + (stops[i + 1][1] - stops[i][1]) * t);
        var b = Math.round(stops[i][2] + (stops[i + 1][2] - stops[i][2]) * t);
        return "rgb(" + [r, g, b].join(",") + ")";
      }
    }

    return "rgb(" + stops[stops.length - 1].join(",") + ")";
  }

  function getBuildingOverallScore(props, minutes, scoreMode, options) {
    var config = options || {};
    var fixedMinutes = Number(config.fixedMinutes) || 10;
    var suffix = "_" + (scoreMode === "weighted" ? fixedMinutes : minutes) + "min";
    var p = props || {};

    if (scoreMode === "weighted") {
      var metric =
        config.activeMetric && config.activeMetric.kind && config.activeMetric.kind.indexOf("weighted") === 0
          ? config.activeMetric
          : resolveWeightedMetric({
              activeHeatmapId: config.activeHeatmapId,
            });
      if (metric && metric.buildingPropertyKey) {
        var metricValue = p[metric.buildingPropertyKey];
        if (metricValue !== undefined && metricValue !== null && metricValue !== "") {
          return Number(metricValue) || 0;
        }
      }
      var weighted = p["score_weighted" + suffix];
      if (weighted !== undefined && weighted !== null && weighted !== "") return Number(weighted) || 0;
      return Number(p.score_weighted) || 0;
    }

    var currentMode = config.currentMode;
    var selectedTypes = toArray(config.selectedAmenityTypes);
    var allTypes = toArray(config.allFilterTypes);
    var filteringLockedToAll = scoreMode !== "weighted" && currentMode && currentMode !== "house";
    var useAll = filteringLockedToAll || selectedTypes.length === 0 || (allTypes.length > 0 && selectedTypes.length === allTypes.length);
    var activeTypes = filteringLockedToAll ? allTypes : (useAll && allTypes.length > 0 ? allTypes : selectedTypes);

    if (scoreMode === "clean") {
      return getBuildingCleanFilteredScore(p, minutes, selectedTypes, allTypes, currentMode);
    }

    if (selectedTypes.length === 0 || allTypes.length === 0) return 0;
    if (!useAll && activeTypes.length === 0) return 0;
    if (useAll) {
      var expanded = p["score_expanded" + suffix];
      if (expanded !== undefined && expanded !== null && expanded !== "") return Number(expanded) || 0;
      var amenities = Number(p["num_amenities" + suffix]) || 0;
      var trees = Number(p["num_trees" + suffix]) || 0;
      var streetLights = Number(p["num_street_lights" + suffix]) || 0;
      return amenities + trees * 0.25 + streetLights * 0.25;
    }

    var total = 0;
    activeTypes.forEach(function (type) {
      total += getExpandedContributionForType(p, minutes, type);
    });
    return total;
  }

  function collectBuildingScores(buildingsData, walkMinutes, getScore, context) {
    if (!buildingsData || !Array.isArray(buildingsData.features) || buildingsData.features.length === 0) return [];
    if (typeof getScore === "function") {
      return buildingsData.features.map(function (feature) {
        return getScore((feature && feature.properties) || {}, walkMinutes, context);
      });
    }
    return buildingsData.features.map(function (feature) {
      return getBuildingOverallScore((feature && feature.properties) || {}, walkMinutes, context && context.scoreMode, context);
    });
  }

  function computePercentileRank(values, targetValue) {
    if (!values || values.length === 0) return null;
    var atOrBelow = 0;
    values.forEach(function (value) {
      if (value <= targetValue) atOrBelow += 1;
    });
    return Math.round((atOrBelow / values.length) * 100);
  }

  function bulkPercentileRanks(scores) {
    var count = scores.length;
    if (count === 0) return [];
    var sorted = scores.slice().sort(function (a, b) {
      return a - b;
    });
    return scores.map(function (target) {
      var lo = 0;
      var hi = count;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (sorted[mid] <= target) lo = mid + 1;
        else hi = mid;
      }
      return Math.round((lo / count) * 100);
    });
  }

  // Avg-user scores/counts: whole numbers only (decimals add noise, not insight).
  function formatMetricNumber(value) {
    if (!Number.isFinite(value)) return "0";
    return Math.round(value).toLocaleString();
  }

  function formatScoreInteger(value) {
    if (!Number.isFinite(value)) return "—";
    return Math.round(value).toLocaleString();
  }

  function weightedCategoryHighlightsFromSource(source, suffix) {
    return WEIGHTED_CATEGORY_COMPONENTS.map(function (component) {
      var key = "avg_score_weighted_" + component.stem + suffix;
      return {
        stem: component.stem,
        label: component.label,
        weight: component.weight,
        score: Number((source && source[key]) || 0),
      };
    });
  }

  function getWeightedAverageValueFromSource(source, suffix, selectedStem) {
    if (selectedStem) {
      var categoryKey = "avg_score_weighted_" + selectedStem + suffix;
      var categoryValue = Number(source && source[categoryKey]);
      if (Number.isFinite(categoryValue)) return categoryValue;
    }
    var overallKey = "avg_score_weighted" + suffix;
    var overallValue = Number(source && source[overallKey]);
    return Number.isFinite(overallValue) ? overallValue : 0;
  }

  function weightedSubcategoryComparisonRows(neighborhoodProps, cityStats, suffix) {
    var rows = [];
    WEIGHTED_CATEGORY_COMPONENTS.forEach(function (category) {
      var subs = WEIGHTED_SUBCATEGORY_COMPONENTS[category.stem] || [];
      subs.forEach(function (sub) {
        var nKey = "avg_score_weighted_sub_" + category.stem + "_" + sub.stem + suffix;
        var cKey = "avg_score_weighted_sub_" + category.stem + "_" + sub.stem + suffix;
        rows.push({
          metricId: "u95.sub." + category.stem + "." + sub.stem,
          categoryStem: category.stem,
          subStem: sub.stem,
          label: category.label + " · " + sub.label,
          neighborhood: Number((neighborhoodProps && neighborhoodProps[nKey]) || 0),
          city: Number((cityStats && cityStats[cKey]) || 0),
          hasData:
            !!(neighborhoodProps && Object.prototype.hasOwnProperty.call(neighborhoodProps, nKey)) &&
            !!(cityStats && Object.prototype.hasOwnProperty.call(cityStats, cKey)),
        });
      });
    });
    return rows;
  }

  function weightedNeighborhoodRankingRows(stats, suffix, metricOrScoreKey) {
    var rows = ((stats && stats.neighborhood_ranking_weighted) || []).slice();
    void suffix;
    var scoreKey =
      typeof metricOrScoreKey === "string"
        ? metricOrScoreKey
        : metricOrScoreKey && metricOrScoreKey.neighborhoodAverageKey
          ? metricOrScoreKey.neighborhoodAverageKey
          : null;
    if (!scoreKey) {
      return [];
    }
    rows.sort(function (a, b) {
      return (Number(b[scoreKey]) || 0) - (Number(a[scoreKey]) || 0);
    });
    return rows;
  }

  function getCitywideWeightedAverageScore(stats, suffix, options) {
    stats = stats || {};
    var config = options || {};
    var metric =
      config.activeMetric && config.activeMetric.kind && config.activeMetric.kind.indexOf("weighted") === 0
        ? config.activeMetric
        : resolveWeightedMetric({
            activeHeatmapId: config.activeHeatmapId,
          });
    var directKey = metric && metric.neighborhoodAverageKey
      ? metric.neighborhoodAverageKey
      : "avg_score_weighted" + suffix;
    var direct = Number(stats[directKey]);
    if (Number.isFinite(direct) && direct > 0) return direct;

    var rankingValues = ((stats.neighborhood_ranking_weighted || []).map(function (row) {
      return Number(row[directKey]);
    })).filter(function (value) {
      return Number.isFinite(value);
    });
    if (rankingValues.length > 0) {
      var mean = rankingValues.reduce(function (sum, value) {
        return sum + value;
      }, 0) / rankingValues.length;
      if (Number.isFinite(mean) && mean > 0) return mean;
    }

    var minutes = Number(String(suffix || "").replace(/[^0-9]/g, ""));
    if (
      Number.isFinite(minutes) &&
      minutes > 0 &&
      config.buildingsData &&
      Array.isArray(config.buildingsData.features)
    ) {
      var values = config.buildingsData.features.map(function (feature) {
        return getBuildingOverallScore(
          (feature && feature.properties) || {},
          minutes,
          "weighted",
          {
            fixedMinutes: config.fixedMinutes,
            activeMetric: metric,
            activeHeatmapId: config.activeHeatmapId,
          }
        );
      }).filter(function (value) {
        return Number.isFinite(value);
      });
      if (values.length > 0) {
        return values.reduce(function (sum, value) {
          return sum + value;
        }, 0) / values.length;
      }
    }
    return Number.isFinite(direct) ? direct : 0;
  }

  function getPercentileSeriesCacheKey(minutes, options) {
    var config = options || {};
    var scoreMode = config.scoreMode || "expanded";
    var currentMode = config.currentMode || "house";
    var selectedTypes = toArray(config.selectedAmenityTypes);
    var allTypes = toArray(config.allFilterTypes);
    var minuteText = String(minutes);
    if (currentMode !== "house") return scoreMode + ":" + minuteText + ":all";
    if (selectedTypes.length === 0 || allTypes.length === 0) return scoreMode + ":" + minuteText + ":none";
    if (selectedTypes.length === allTypes.length) return scoreMode + ":" + minuteText + ":all";
    return scoreMode + ":" + minuteText + ":f:" + selectedTypes.slice().sort().join("|");
  }

  function percentileForSeries(arr, value) {
    if (!arr || arr.length === 0) return null;
    return computePercentileRank(arr, value);
  }

  function getBuildingAmenityStatKeysForMinutes(minutes, buildingsData, cache) {
    var cacheKey = String(minutes);
    if (cache && cache.has(cacheKey)) return cache.get(cacheKey);
    var keys = new Set();
    if (buildingsData && Array.isArray(buildingsData.features) && buildingsData.features.length > 0) {
      var sample = buildingsData.features[0].properties || {};
      var suffix = "_" + minutes + "min";
      Object.keys(sample).forEach(function (key) {
        if (!key.startsWith("amen_") || !key.endsWith(suffix)) return;
        keys.add(key.slice(5, -suffix.length));
      });
    }
    if (cache) cache.set(cacheKey, keys);
    return keys;
  }

  /**
   * Whether a neighborhood can enter an A↔B compare pair for the active score mode.
   * Weighted uses fixed 10-min Urban95 average; expanded uses pct_overall_{minutes}min.
   * A finite 0 is comparable.
   */
  function neighborhoodIsComparable(props, options) {
    props = props || {};
    options = options || {};
    var scoreMode = options.scoreMode;
    if (scoreMode === "weighted") {
      return Number.isFinite(Number(props.avg_score_weighted_10min));
    }
    if (scoreMode === "expanded") {
      var minutes = options.minutes;
      var key = "pct_overall_" + minutes + "min";
      return Number.isFinite(Number(props[key]));
    }
    return false;
  }

  window.Urban95ScoreModel = {
    AMENITY_TYPE_CONFIG: AMENITY_TYPE_CONFIG,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    CLEAN_WEIGHTS: CLEAN_WEIGHTS,
    CLEAN_SCORE_COMPONENTS: CLEAN_SCORE_COMPONENTS,
    WEIGHTED_CATEGORY_COMPONENTS: WEIGHTED_CATEGORY_COMPONENTS,
    WEIGHTED_CATEGORY_BY_STEM: WEIGHTED_CATEGORY_BY_STEM,
    WEIGHTED_SUBCATEGORY_COMPONENTS: WEIGHTED_SUBCATEGORY_COMPONENTS,
    WEIGHTED_CATEGORY_LABEL_BY_STEM: WEIGHTED_CATEGORY_LABEL_BY_STEM,
    getAmenityConfig: getAmenityConfig,
    amenityTypeToBuildingStatKey: amenityTypeToBuildingStatKey,
    cleanPtsPropertyName: cleanPtsPropertyName,
    hasCleanPtsBreakdown: hasCleanPtsBreakdown,
    filterTypeToCleanCountStem: filterTypeToCleanCountStem,
    cleanCountStemToWeightKey: cleanCountStemToWeightKey,
    filterTypeToCleanWeightKey: filterTypeToCleanWeightKey,
    getBuildingCleanFilteredScore: getBuildingCleanFilteredScore,
    getExpandedContributionForType: getExpandedContributionForType,
    getFilteredContributionForType: getFilteredContributionForType,
    percentileBreakpoints: percentileBreakpoints,
    collectBuildingScores: collectBuildingScores,
    buildHistogramDistributionFromScores: buildHistogramDistributionFromScores,
    getColorForValue: getColorForValue,
    getBuildingOverallScore: getBuildingOverallScore,
    computePercentileRank: computePercentileRank,
    bulkPercentileRanks: bulkPercentileRanks,
    formatMetricNumber: formatMetricNumber,
    formatScoreInteger: formatScoreInteger,
    weightedCategoryHighlightsFromSource: weightedCategoryHighlightsFromSource,
    getWeightedAverageValueFromSource: getWeightedAverageValueFromSource,
    weightedSubcategoryComparisonRows: weightedSubcategoryComparisonRows,
    weightedNeighborhoodRankingRows: weightedNeighborhoodRankingRows,
    getCitywideWeightedAverageScore: getCitywideWeightedAverageScore,
    getPercentileSeriesCacheKey: getPercentileSeriesCacheKey,
    percentileForSeries: percentileForSeries,
    getBuildingAmenityStatKeysForMinutes: getBuildingAmenityStatKeysForMinutes,
    neighborhoodIsComparable: neighborhoodIsComparable,
    normalizeSurfaceFilterKey: normalizeSurfaceFilterKey,
    buildWeightedMetricRegistry: buildWeightedMetricRegistry,
    getWeightedMetric: getWeightedMetric,
    buildMetricLegendSpec: buildMetricLegendSpec,
    getMetricExplainNote: getMetricExplainNote,
    resolveExpandedMetric: resolveExpandedMetric,
    resolveActiveMetric: resolveActiveMetric,
  };
})();
