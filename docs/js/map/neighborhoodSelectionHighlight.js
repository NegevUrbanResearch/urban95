(function () {
  "use strict";

  var palette = window.Urban95Palette;
  if (!palette) {
    throw new Error(
      "Urban95NeighborhoodSelectionHighlight requires Urban95Palette (load js/core/palette.js first)"
    );
  }

  var NEIGHBORHOODS_LINE_COLOR = "#1e3a5f";
  var NEIGHBORHOODS_LINE_WIDTH = 2.5;
  var NEIGHBORHOODS_LINE_OPACITY = 0.9;
  var NEIGHBORHOODS_LINE_COLOR_SELECTED = palette.ink;
  var NEIGHBORHOODS_LINE_WIDTH_SELECTED = 4.5;
  // Match compare A/B: Environmental Quality (sky) / Family Services (lavender).
  var COMPARE_SLOT_COLORS = [palette.sky, palette.lavender];
  // Colored over-stroke sits on a wider light casing so A/B read over the hex heatmap.
  var COMPARE_SLOT_WIDTH = 6;
  var COMPARE_CASING_LAYER_ID = "neighborhoods-line-casing";
  var COMPARE_CASING_COLOR = "#ffffff";
  var COMPARE_CASING_WIDTH = 12;
  var COMPARE_LINE_OPACITY_SELECTED = 1;
  var COMPARE_LINE_OPACITY_DIM = 0.28;
  var COMPARE_FILL_OPACITY_SELECTED = 0.2;
  var COMPARE_FILL_OPACITY_DIM = 0.004;
  var COMPARE_FILL_OPACITY_BASE = 0.01;

  var deps = null;
  var citySelectedNeighborhoodName = null;
  var compareSlotNames = [null, null];

  function configure(nextDeps) {
    deps = nextDeps || null;
    citySelectedNeighborhoodName = null;
    compareSlotNames = [null, null];
  }

  function requireDeps() {
    if (!deps) {
      throw new Error(
        "Urban95NeighborhoodSelectionHighlight.configure must be called before highlight functions"
      );
    }
    return deps;
  }

  function getMap() {
    var d = requireDeps();
    return d.map || null;
  }

  function getCurrentMode() {
    var d = deps;
    if (!d || typeof d.getCurrentMode !== "function") return null;
    return d.getCurrentMode();
  }

  function featureName(feature) {
    if (!feature || !feature.properties) return null;
    var name = feature.properties.Name;
    if (name == null || name === "") return null;
    return name;
  }

  function hasActiveCompareSlots() {
    return compareSlotNames[0] != null || compareSlotNames[1] != null;
  }

  function setFeatureStateSafe(map, id, state) {
    if (!map || typeof map.setFeatureState !== "function" || id == null) return;
    try {
      map.setFeatureState({ source: "neighborhoods", id: id }, state);
    } catch (err) {
      // Source may be empty or id missing during mode transitions / before setData.
    }
  }

  function ensureCompareCasingLayer(map) {
    if (!map || typeof map.getLayer !== "function" || typeof map.addLayer !== "function") {
      return;
    }
    if (!map.getLayer("neighborhoods-line")) return;
    if (map.getLayer(COMPARE_CASING_LAYER_ID)) return;

    var beforeId = "neighborhoods-line";
    var layer = {
      id: COMPARE_CASING_LAYER_ID,
      type: "line",
      source: "neighborhoods",
      paint: {
        "line-color": COMPARE_CASING_COLOR,
        "line-width": 0,
        "line-opacity": 0,
      },
      layout: {
        visibility: "visible",
        "line-join": "round",
        "line-cap": "round",
      },
    };

    try {
      var lineLayout =
        typeof map.getLayoutProperty === "function"
          ? map.getLayoutProperty("neighborhoods-line", "visibility")
          : null;
      if (lineLayout === "none" || lineLayout === "visible") {
        layer.layout.visibility = lineLayout;
      }
      map.addLayer(layer, beforeId);
    } catch (err) {
      // Layer add can race mode teardown; sync will retry on next paint.
    }
  }

  function resetCasingPaint(map) {
    if (!map || typeof map.getLayer !== "function" || !map.getLayer(COMPARE_CASING_LAYER_ID)) {
      return;
    }
    map.setPaintProperty(COMPARE_CASING_LAYER_ID, "line-color", COMPARE_CASING_COLOR);
    map.setPaintProperty(COMPARE_CASING_LAYER_ID, "line-width", 0);
    map.setPaintProperty(COMPARE_CASING_LAYER_ID, "line-opacity", 0);
  }

  function applyCompareCasingPaint(map) {
    ensureCompareCasingLayer(map);
    if (!map.getLayer(COMPARE_CASING_LAYER_ID)) return;

    if (!hasActiveCompareSlots()) {
      resetCasingPaint(map);
      return;
    }

    map.setPaintProperty(COMPARE_CASING_LAYER_ID, "line-color", COMPARE_CASING_COLOR);
    map.setPaintProperty(COMPARE_CASING_LAYER_ID, "line-width", [
      "case",
      ["any", ["==", ["feature-state", "compareSlot"], 0], ["==", ["feature-state", "compareSlot"], 1]],
      COMPARE_CASING_WIDTH,
      0,
    ]);
    map.setPaintProperty(COMPARE_CASING_LAYER_ID, "line-opacity", [
      "case",
      ["any", ["==", ["feature-state", "compareSlot"], 0], ["==", ["feature-state", "compareSlot"], 1]],
      0.95,
      0,
    ]);
  }

  function resetNeighborhoodFillPaint(map) {
    if (!map || typeof map.getLayer !== "function" || !map.getLayer("neighborhoods-fill")) {
      return;
    }
    // Match neighborhood-mode baseline from mapRenderers (near-invisible hit target).
    map.setPaintProperty("neighborhoods-fill", "fill-color", palette.ink);
    map.setPaintProperty("neighborhoods-fill", "fill-opacity", COMPARE_FILL_OPACITY_BASE);
  }

  function applyCompareFillPaint(map) {
    if (!map || typeof map.getLayer !== "function" || !map.getLayer("neighborhoods-fill")) {
      return;
    }

    if (!hasActiveCompareSlots()) {
      resetNeighborhoodFillPaint(map);
      return;
    }

    map.setPaintProperty("neighborhoods-fill", "fill-color", [
      "case",
      ["==", ["feature-state", "compareSlot"], 0],
      COMPARE_SLOT_COLORS[0],
      ["==", ["feature-state", "compareSlot"], 1],
      COMPARE_SLOT_COLORS[1],
      palette.ink,
    ]);
    map.setPaintProperty("neighborhoods-fill", "fill-opacity", [
      "case",
      ["any", ["==", ["feature-state", "compareSlot"], 0], ["==", ["feature-state", "compareSlot"], 1]],
      COMPARE_FILL_OPACITY_SELECTED,
      COMPARE_FILL_OPACITY_DIM,
    ]);
  }

  function resetLinePaint(map) {
    if (!map || typeof map.getLayer !== "function" || !map.getLayer("neighborhoods-line")) return;
    map.setPaintProperty("neighborhoods-line", "line-color", NEIGHBORHOODS_LINE_COLOR);
    map.setPaintProperty("neighborhoods-line", "line-width", NEIGHBORHOODS_LINE_WIDTH);
    map.setPaintProperty("neighborhoods-line", "line-opacity", NEIGHBORHOODS_LINE_OPACITY);
    resetCasingPaint(map);
  }

  function applyCityLinePaint(map) {
    if (!map || typeof map.getLayer !== "function" || !map.getLayer("neighborhoods-line")) return;
    map.setPaintProperty("neighborhoods-line", "line-color", [
      "case",
      ["boolean", ["feature-state", "citySelected"], false],
      NEIGHBORHOODS_LINE_COLOR_SELECTED,
      NEIGHBORHOODS_LINE_COLOR,
    ]);
    map.setPaintProperty("neighborhoods-line", "line-width", [
      "case",
      ["boolean", ["feature-state", "citySelected"], false],
      NEIGHBORHOODS_LINE_WIDTH_SELECTED,
      NEIGHBORHOODS_LINE_WIDTH,
    ]);
    map.setPaintProperty("neighborhoods-line", "line-opacity", NEIGHBORHOODS_LINE_OPACITY);
    resetCasingPaint(map);
  }

  function applyCompareLinePaint(map) {
    if (!map || typeof map.getLayer !== "function" || !map.getLayer("neighborhoods-line")) return;

    applyCompareCasingPaint(map);

    map.setPaintProperty("neighborhoods-line", "line-color", [
      "case",
      ["==", ["feature-state", "compareSlot"], 0],
      COMPARE_SLOT_COLORS[0],
      ["==", ["feature-state", "compareSlot"], 1],
      COMPARE_SLOT_COLORS[1],
      NEIGHBORHOODS_LINE_COLOR,
    ]);
    map.setPaintProperty("neighborhoods-line", "line-width", [
      "case",
      ["any", ["==", ["feature-state", "compareSlot"], 0], ["==", ["feature-state", "compareSlot"], 1]],
      COMPARE_SLOT_WIDTH,
      NEIGHBORHOODS_LINE_WIDTH,
    ]);
    map.setPaintProperty(
      "neighborhoods-line",
      "line-opacity",
      hasActiveCompareSlots()
        ? [
            "case",
            [
              "any",
              ["==", ["feature-state", "compareSlot"], 0],
              ["==", ["feature-state", "compareSlot"], 1],
            ],
            COMPARE_LINE_OPACITY_SELECTED,
            COMPARE_LINE_OPACITY_DIM,
          ]
        : NEIGHBORHOODS_LINE_OPACITY
    );

    applyCompareFillPaint(map);
  }

  function syncLinePaint() {
    var map = getMap();
    if (!map) return;
    var mode = getCurrentMode();
    if (mode === "citywide") {
      applyCityLinePaint(map);
      return;
    }
    if (mode === "neighborhood") {
      applyCompareLinePaint(map);
      return;
    }
    resetLinePaint(map);
  }

  function clearCityFeatureState(map) {
    if (citySelectedNeighborhoodName == null) return;
    setFeatureStateSafe(map, citySelectedNeighborhoodName, { citySelected: false });
    citySelectedNeighborhoodName = null;
  }

  function clearCompareFeatureState(map) {
    for (var i = 0; i < compareSlotNames.length; i++) {
      if (compareSlotNames[i] != null) {
        setFeatureStateSafe(map, compareSlotNames[i], { compareSlot: null });
      }
    }
    compareSlotNames = [null, null];
  }

  function applyCitySelection(feature) {
    var map = getMap();
    if (!map) return;

    clearCityFeatureState(map);

    var name = featureName(feature);
    if (name == null) {
      if (getCurrentMode() === "citywide") applyCityLinePaint(map);
      return;
    }

    citySelectedNeighborhoodName = name;
    setFeatureStateSafe(map, name, { citySelected: true });
    if (getCurrentMode() === "citywide") applyCityLinePaint(map);
  }

  function applyCompareSlots(state) {
    var map = getMap();
    if (!map) return;

    clearCompareFeatureState(map);

    var slots = (state && state.slots) || [null, null];
    for (var i = 0; i < 2; i++) {
      var name = featureName(slots[i]);
      if (name == null) continue;
      compareSlotNames[i] = name;
      setFeatureStateSafe(map, name, { compareSlot: i });
    }

    if (getCurrentMode() === "neighborhood") applyCompareLinePaint(map);
  }

  function clearCompare() {
    var map = getMap();
    clearCompareFeatureState(map);
    if (map && getCurrentMode() === "neighborhood") {
      applyCompareLinePaint(map);
    }
  }

  function restoreAfterNeighborhoodData() {
    var map = getMap();
    if (!map) return;

    if (citySelectedNeighborhoodName != null) {
      setFeatureStateSafe(map, citySelectedNeighborhoodName, { citySelected: true });
    }
    for (var i = 0; i < compareSlotNames.length; i++) {
      if (compareSlotNames[i] != null) {
        setFeatureStateSafe(map, compareSlotNames[i], { compareSlot: i });
      }
    }
    syncLinePaint();
  }

  window.Urban95NeighborhoodSelectionHighlight = {
    configure: configure,
    applyCompareSlots: applyCompareSlots,
    applyCitySelection: applyCitySelection,
    clearCompare: clearCompare,
    restoreAfterNeighborhoodData: restoreAfterNeighborhoodData,
    syncLinePaint: syncLinePaint,
    resetLinePaint: function () {
      resetLinePaint(getMap());
    },
  };
})();
