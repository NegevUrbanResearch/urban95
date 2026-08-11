(function () {
  var SUBCATEGORY_ACTIONS = {
    shade: { actions: [{ kind: "point-layer", layer: "shade-si" }] },
    bicycle_access: { disabled: "No bicycle-access point layer" },
    trees: { actions: [{ kind: "point-layer", layer: "trees" }] },
    roads: { actions: [{ kind: "point-layer", layer: "roads" }] },
    parks: { actions: [{ kind: "point-layer", layer: "parks" }] },
    urban_nature_areas: { actions: [{ kind: "point-layer", layer: "urban-nature" }] },
    playgrounds: { actions: [{ kind: "amenity-types", types: ["playgrounds"] }] },
    street_lights: { actions: [{ kind: "point-layer", layer: "street-lights" }] },
    bus_stops: { actions: [{ kind: "point-layer", layer: "bus-stops" }] },
    shelters: { actions: [{ kind: "amenity-types", types: ["shelters"] }] },
    education: {
      actions: [
        { kind: "point-layer", layer: "education-school" },
        { kind: "point-layer", layer: "education-kindergarten" },
      ],
    },
    community: { actions: [{ kind: "amenity-types", types: ["community-centers"] }] },
    business: { actions: [{ kind: "amenity-types", types: ["businesscenters"] }] },
    health: {
      actions: [
        { kind: "amenity-display-key", key: "health:clinic" },
        { kind: "amenity-display-key", key: "health:tipat_halav" },
      ],
    },
  };

  var DETAIL_ACTIONS = {
    "u95.detail.family_services.education.school": [
      { kind: "point-layer", layer: "education-school" },
    ],
    "u95.detail.family_services.education.kindergarten": [
      { kind: "point-layer", layer: "education-kindergarten" },
    ],
    "u95.detail.family_services.health.clinic": [
      { kind: "amenity-display-key", key: "health:clinic" },
    ],
    "u95.detail.family_services.health.tipat_halav": [
      { kind: "amenity-display-key", key: "health:tipat_halav" },
    ],
  };

  function getWeightedMetric(scoreModel, metricId) {
    if (!scoreModel || typeof scoreModel.buildWeightedMetricRegistry !== "function") return null;
    var metric = scoreModel.buildWeightedMetricRegistry()[metricId] || null;
    return metric && metric.scale === "status" ? metric : null;
  }

  function getSubcategoryMetricIds(scoreModel, categoryStem) {
    var categories = scoreModel.WEIGHTED_CATEGORY_COMPONENTS || [];
    var subcategories = scoreModel.WEIGHTED_SUBCATEGORY_COMPONENTS || {};
    var stems = categoryStem
      ? [categoryStem]
      : categories.map(function (category) {
          return category.stem;
        });

    return stems.reduce(function (ids, stem) {
      return ids.concat(
        (subcategories[stem] || []).map(function (sub) {
          return "u95.sub." + stem + "." + sub.stem;
        })
      );
    }, []);
  }

  function getWeightedShowLayerSpec(scoreModel, metricId) {
    var metric = getWeightedMetric(scoreModel, metricId);
    if (!metric) return null;
    if (metric.kind === "weighted-overall") return { kind: "family-union" };
    if (metric.kind === "weighted-category") {
      return { kind: "family-union", categoryStem: metric.selectedWeightedStem };
    }
    if (metric.kind === "diagnostic-access") {
      var detailActions = DETAIL_ACTIONS[metricId] || [];
      return detailActions[0] || { kind: "disabled", reason: "No companion layer mapped" };
    }
    if (metric.kind !== "weighted-subcategory") return null;

    var entry = SUBCATEGORY_ACTIONS[metric.selectedWeightedSubStem];
    if (!entry) return { kind: "disabled", reason: "No companion layer mapped" };
    if (entry.disabled) return { kind: "disabled", reason: entry.disabled };
    if (entry.actions.length > 1) return { kind: "family-union" };
    return entry.actions[0] || { kind: "disabled", reason: "No companion layer mapped" };
  }

  function addAction(bucket, action) {
    if (!action) return;
    if (action.kind === "point-layer" && action.layer) {
      bucket.pointLayers.add(action.layer);
      return;
    }
    if (action.kind === "amenity-types") {
      (action.types || []).forEach(function (type) {
        if (type) bucket.amenityTypes.add(type);
      });
      return;
    }
    if (action.kind === "amenity-display-key" && action.key) {
      bucket.amenityDisplayKeys.add(action.key);
    }
  }

  function collectActions(scoreModel, metricId, bucket) {
    var metric = getWeightedMetric(scoreModel, metricId);
    if (!metric) return;

    if (metric.kind === "weighted-overall" || metric.kind === "weighted-category") {
      getSubcategoryMetricIds(scoreModel, metric.selectedWeightedStem).forEach(function (childMetricId) {
        collectActions(scoreModel, childMetricId, bucket);
      });
      return;
    }

    if (metric.kind === "diagnostic-access") {
      (DETAIL_ACTIONS[metricId] || []).forEach(function (action) {
        addAction(bucket, action);
      });
      return;
    }

    var entry = SUBCATEGORY_ACTIONS[metric.selectedWeightedSubStem];
    (entry && entry.actions ? entry.actions : []).forEach(function (action) {
      addAction(bucket, action);
    });
  }

  function resolveWeightedShowActions(scoreModel, metricId) {
    var bucket = {
      pointLayers: new Set(),
      amenityTypes: new Set(),
      amenityDisplayKeys: new Set(),
    };
    collectActions(scoreModel, metricId, bucket);

    var actions = [];
    bucket.pointLayers.forEach(function (layer) {
      actions.push({ kind: "point-layer", layer: layer });
    });
    if (bucket.amenityTypes.size > 0) {
      actions.push({ kind: "amenity-types", types: Array.from(bucket.amenityTypes) });
    }
    bucket.amenityDisplayKeys.forEach(function (key) {
      actions.push({ kind: "amenity-display-key", key: key });
    });
    return actions;
  }

  window.Urban95WeightedMetricShowRegistry = {
    getWeightedShowLayerSpec: getWeightedShowLayerSpec,
    resolveWeightedShowActions: resolveWeightedShowActions,
  };
})();
