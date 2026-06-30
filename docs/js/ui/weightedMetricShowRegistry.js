(function () {
  var SUBCATEGORY_ACTIONS = {
    shade: { disabled: "No shade layer" },
    bicycle_access: { disabled: "No bicycle-access point layer" },
    trees: { actions: [{ kind: "point-layer", layer: "trees" }] },
    roads: { actions: [{ kind: "point-layer", layer: "roads" }] },
    parks: { actions: [{ kind: "point-layer", layer: "parks" }] },
    urban_nature_areas: { actions: [{ kind: "point-layer", layer: "urban-nature" }] },
    playgrounds: { actions: [{ kind: "amenity-types", types: ["playgrounds"] }] },
    street_lights: { actions: [{ kind: "point-layer", layer: "street-lights" }] },
    bus_stops: { actions: [{ kind: "point-layer", layer: "bus-stops" }] },
    shelters: { actions: [{ kind: "amenity-types", types: ["shelters"] }] },
    education: { actions: [{ kind: "point-layer", layer: "schools" }] },
    community: { actions: [{ kind: "amenity-types", types: ["community-centers"] }] },
    business: { actions: [{ kind: "amenity-types", types: ["businesscenters"] }] },
    health: { actions: [{ kind: "amenity-types", types: ["health"] }] },
  };

  function getWeightedMetric(scoreModel, metricId) {
    if (!scoreModel || typeof scoreModel.buildWeightedMetricRegistry !== "function") return null;
    return scoreModel.buildWeightedMetricRegistry()[metricId] || null;
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
    if (metric.kind !== "weighted-subcategory") return null;

    var entry = SUBCATEGORY_ACTIONS[metric.selectedWeightedSubStem];
    if (!entry) return { kind: "disabled", reason: "No companion layer mapped" };
    if (entry.disabled) return { kind: "disabled", reason: entry.disabled };
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

    var entry = SUBCATEGORY_ACTIONS[metric.selectedWeightedSubStem];
    (entry && entry.actions ? entry.actions : []).forEach(function (action) {
      addAction(bucket, action);
    });
  }

  function resolveWeightedShowActions(scoreModel, metricId) {
    var bucket = {
      pointLayers: new Set(),
      amenityTypes: new Set(),
    };
    collectActions(scoreModel, metricId, bucket);

    var actions = [];
    bucket.pointLayers.forEach(function (layer) {
      actions.push({ kind: "point-layer", layer: layer });
    });
    if (bucket.amenityTypes.size > 0) {
      actions.push({ kind: "amenity-types", types: Array.from(bucket.amenityTypes) });
    }
    return actions;
  }

  window.Urban95WeightedMetricShowRegistry = {
    getWeightedShowLayerSpec: getWeightedShowLayerSpec,
    resolveWeightedShowActions: resolveWeightedShowActions,
  };
})();
