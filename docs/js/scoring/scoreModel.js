(function () {
  var AMENITY_TYPE_CONFIG = {
    trees: { color: "#2E7D32", icon: "park-alt1", label: "Trees" },
    healthcare: { color: "#C62828", icon: "hospital", label: "Healthcare" },
    education: { color: "#8E24AA", icon: "school", label: "Education" },
    commercial: { color: "#EF6C00", icon: "shop", label: "Commercial" },
    services: { color: "#00897B", icon: "town-hall", label: "Services" },
    religious_institutions: { color: "#AD1457", icon: "place-of-worship", label: "Religious" },
    parks_and_recreation: { color: "#7CB342", icon: "restaurant", label: "Recreation" },
    public_institutions: { color: "#8D6E63", icon: "building", label: "Public" },
    fitness: { color: "#D81B60", icon: "fitness-centre", label: "Fitness" },
    transportation: { color: "#F9A825", icon: "bus", label: "Transport" },
    financial_services: { color: "#3949AB", icon: "bank", label: "Financial" },
    tourism: { color: "#00ACC1", icon: "lodging", label: "Tourism" },
    senior_services_and_living: { color: "#FF7043", icon: "home", label: "Senior" },
    health: { color: "#C62828", icon: "marker", label: "Healthcare" },
    businesscenters: { color: "#1d4ed8", icon: "marker", label: "Business Centers" },
    "community-centers": { color: "#7e22ce", icon: "marker", label: "Community Centers" },
    playgrounds: { color: "#ea580c", icon: "marker", label: "Playgrounds" },
    shelters: { color: "#0f766e", icon: "marker", label: "Shelters" },
    "street-lights": { color: "#EAB308", icon: "marker", label: "Street Lights" }
  };

  var DEFAULT_CONFIG = { color: "#6b7280", icon: "marker", label: "Other" };

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

  var WEIGHTED_CATEGORY_COMPONENTS = [
    { stem: "environmental_quality", label: "Environmental Quality", weight: 0.2, color: "#2E7D32" },
    { stem: "nature", label: "Nature", weight: 0.15, color: "#7CB342" },
    { stem: "play", label: "Play", weight: 0.15, color: "#EF6C00" },
    { stem: "safety_mobility", label: "Safety & Mobility", weight: 0.25, color: "#2563EB" },
    { stem: "family_services", label: "Family Services", weight: 0.25, color: "#8E24AA" },
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

  var WEIGHTED_CATEGORY_LABEL_BY_STEM = WEIGHTED_CATEGORY_COMPONENTS.reduce(function (acc, comp) {
    acc[comp.stem] = comp.label;
    return acc;
  }, {});

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
    var currentMode = config.currentMode;
    var selectedTypes = toArray(config.selectedAmenityTypes);
    var allTypes = toArray(config.allFilterTypes);
    var filteringLockedToAll = scoreMode !== "weighted" && currentMode && currentMode !== "house";
    var useAll = filteringLockedToAll || selectedTypes.length === 0 || (allTypes.length > 0 && selectedTypes.length === allTypes.length);
    var activeTypes = filteringLockedToAll ? allTypes : (useAll && allTypes.length > 0 ? allTypes : selectedTypes);
    var p = props || {};

    if (scoreMode === "weighted") {
      if (!useAll && activeTypes.length > 0) {
        var weightedTotal = 0;
        var selectedWeight = 0;
        activeTypes.forEach(function (stem) {
          var component = WEIGHTED_CATEGORY_BY_STEM[stem];
          if (!component) return;
          var categoryScore = Number(p["score_weighted_" + stem + suffix]);
          if (!Number.isFinite(categoryScore)) return;
          weightedTotal += categoryScore * component.weight;
          selectedWeight += component.weight;
        });
        if (selectedWeight > 0) return weightedTotal / selectedWeight;
      }
      var weighted = p["score_weighted" + suffix];
      if (weighted !== undefined && weighted !== null && weighted !== "") return Number(weighted) || 0;
      return Number(p.score_weighted) || 0;
    }

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

  function formatMetricNumber(value) {
    if (!Number.isFinite(value)) return "0";
    if (Math.abs(value - Math.round(value)) < 0.01) {
      return Math.round(value).toLocaleString();
    }
    return value.toFixed(1);
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
          label: category.label + " · " + sub.label,
          neighborhood: Number((neighborhoodProps && neighborhoodProps[nKey]) || 0),
          city: Number((cityStats && cityStats[cKey]) || 0),
        });
      });
    });
    return rows;
  }

  function weightedNeighborhoodRankingRows(stats, suffix, selectedStem) {
    var rows = ((stats && stats.neighborhood_ranking_weighted) || []).slice();
    var scoreKey = selectedStem ? "avg_score_weighted_" + selectedStem + suffix : "avg_score_weighted" + suffix;
    rows.sort(function (a, b) {
      return (Number(b[scoreKey]) || 0) - (Number(a[scoreKey]) || 0);
    });
    return rows;
  }

  function getCitywideWeightedAverageScore(stats, suffix, options) {
    if (!stats) return 0;
    var config = options || {};
    var selectedStem = config.selectedStem;
    var directKey = selectedStem ? "avg_score_weighted_" + selectedStem + suffix : "avg_score_weighted" + suffix;
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
            selectedAmenityTypes: selectedStem ? [selectedStem] : config.selectedAmenityTypes,
            allFilterTypes: config.allFilterTypes,
            currentMode: "house",
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
  };
})();
