(function () {
  function requireFunction(value, name) {
    if (typeof value !== "function") {
      throw new Error("Urban95OverlayVisibility missing " + name);
    }
    return value;
  }

  function create(deps) {
    deps = deps || {};
    var getLayerVisibility = requireFunction(deps.getLayerVisibility, "getLayerVisibility");
    var setLayerVisibility = requireFunction(deps.setLayerVisibility, "setLayerVisibility");
    var getWeightedShownAmenityTypes = requireFunction(
      deps.getWeightedShownAmenityTypes,
      "getWeightedShownAmenityTypes"
    );
    var setWeightedShownAmenityTypes = requireFunction(
      deps.setWeightedShownAmenityTypes,
      "setWeightedShownAmenityTypes"
    );
    var getCurrentMode = requireFunction(deps.getCurrentMode, "getCurrentMode");
    var getControlUiElements =
      typeof deps.getControlUiElements === "function" ? deps.getControlUiElements : function () {
        return {};
      };
    var mirrorOverlayToggleChecked =
      typeof deps.mirrorOverlayToggleChecked === "function"
        ? deps.mirrorOverlayToggleChecked
        : function () {};
    var map = deps.map || null;
    var markup = window.Urban95ControlSidebarMarkup || {};

    function getOverlayDefaultVisible(layerId) {
      var row =
        typeof markup.getOverlayRowByLayerId === "function"
          ? markup.getOverlayRowByLayerId(layerId)
          : null;
      return row ? !!row.defaultChecked : false;
    }

    function buildDefaultLayerVisibility() {
      return typeof markup.buildOverlayVisibilitySnapshot === "function"
        ? markup.buildOverlayVisibilitySnapshot(function (_inputId, fallback) {
            return fallback;
          })
        : {};
    }

    function isCanonicalLayerVisible(layerId, fallback) {
      return window.Urban95RenderState.isLayerVisible(getLayerVisibility(), layerId, fallback);
    }

    function updateCanonicalLayerVisibility(layerId, visible) {
      setLayerVisibility(
        Object.assign({}, getLayerVisibility(), {
          [layerId]: !!visible,
        })
      );
    }

    function areWeightedAmenityTypesShown(types) {
      var requested = Array.from(new Set((types || []).filter(Boolean)));
      if (requested.length === 0) return false;
      var shown = getWeightedShownAmenityTypes();
      return requested.every(function (type) {
        return shown.has(type);
      });
    }

    function isCanonicalMetricShowEnabled(action) {
      if (!action || typeof action !== "object") return false;
      if (action.kind === "amenity-types") {
        return areWeightedAmenityTypesShown(action.types || []);
      }
      if (action.kind !== "point-layer" || !action.layer) return false;
      return isCanonicalLayerVisible(action.layer, false);
    }

    function applyCanonicalMetricShowAction(action, enabled) {
      if (!action || typeof action !== "object") return false;

      if (action.kind === "amenity-types") {
        var nextShown = getWeightedShownAmenityTypes();
        var changed = false;
        Array.from(new Set((action.types || []).filter(Boolean))).forEach(function (type) {
          if (enabled) {
            if (!nextShown.has(type)) {
              nextShown.add(type);
              changed = true;
            }
          } else if (nextShown.has(type)) {
            nextShown.delete(type);
            changed = true;
          }
        });
        if (changed) {
          setWeightedShownAmenityTypes(nextShown);
        }
        return changed;
      }

      if (action.kind !== "point-layer" || !action.layer) return false;

      var fallback = getOverlayDefaultVisible(action.layer);
      var currentlyVisible = isCanonicalLayerVisible(action.layer, fallback);
      if (currentlyVisible === !!enabled) return false;
      updateCanonicalLayerVisibility(action.layer, enabled);
      mirrorOverlayToggleChecked(action.layer, enabled);
      return true;
    }

    function applyOverlayToggleRowChange(row) {
      if (!row || !row.layerId) return false;
      var ui = getControlUiElements();
      var input = row.inputId && ui[row.inputId] ? ui[row.inputId] : null;
      var fallback = getOverlayDefaultVisible(row.layerId);
      var enabled = input ? !!input.checked : isCanonicalLayerVisible(row.layerId, fallback);
      return applyCanonicalMetricShowAction({ kind: "point-layer", layer: row.layerId }, enabled);
    }

    function applyParksVisibility() {
      if (!map || typeof map.getLayer !== "function" || !map.getLayer("parks-fill")) return;
      map.setLayoutProperty(
        "parks-fill",
        "visibility",
        isCanonicalLayerVisible("parks", false) && getCurrentMode() === "house" ? "visible" : "none"
      );
    }

    function applyStaticPolygonCompanionsVisibility() {
      var companions = window.Urban95StaticPolygonCompanions;
      if (!map || typeof map.getLayer !== "function" || !companions || typeof companions.forEachEntry !== "function") {
        return;
      }
      var mode = getCurrentMode();
      companions.forEachEntry(function (entry) {
        if (!map.getLayer(entry.fillLayerId)) return;
        var modeOk = (entry.visibilityModes || []).indexOf(mode) >= 0;
        var visible = isCanonicalLayerVisible(entry.sourceId, false) && modeOk;
        map.setLayoutProperty(entry.fillLayerId, "visibility", visible ? "visible" : "none");
      });
    }

    return {
      buildDefaultLayerVisibility: buildDefaultLayerVisibility,
      isCanonicalLayerVisible: isCanonicalLayerVisible,
      updateCanonicalLayerVisibility: updateCanonicalLayerVisibility,
      isCanonicalMetricShowEnabled: isCanonicalMetricShowEnabled,
      applyCanonicalMetricShowAction: applyCanonicalMetricShowAction,
      applyOverlayToggleRowChange: applyOverlayToggleRowChange,
      applyParksVisibility: applyParksVisibility,
      applyStaticPolygonCompanionsVisibility: applyStaticPolygonCompanionsVisibility,
    };
  }

  window.Urban95OverlayVisibility = {
    create: create,
  };
})();
