(function () {
  function requireObject(value, name) {
    if (!value || typeof value !== "object") {
      throw new Error("Urban95ControlSidebarAdapter missing " + name);
    }
    return value;
  }

  function requireFunction(value, name) {
    if (typeof value !== "function") {
      throw new Error("Urban95ControlSidebarAdapter missing " + name);
    }
    return value;
  }

  function create(deps) {
    var config = requireObject(deps || {}, "deps");
    var markup = requireObject(window.Urban95ControlSidebarMarkup, "Urban95ControlSidebarMarkup");
    var getUiElements = requireFunction(config.getUiElements, "getUiElements");
    var controlActions = requireObject(config.controlActions, "controlActions");
    var syncers = requireObject(config.syncers, "syncers");

    function getUiElement(id) {
      var ui = getUiElements() || {};
      return ui && ui[id] ? ui[id] : null;
    }

    function setToggleChecked(inputId, checked) {
      var input = getUiElement(inputId);
      if (input) input.checked = !!checked;
      return input;
    }

    function getPointLayerToggleId(layer) {
      var row =
        typeof markup.getOverlayRowByLayerId === "function"
          ? markup.getOverlayRowByLayerId(layer)
          : null;
      return row ? row.inputId : null;
    }

    function syncMapLayers() {
      if (typeof syncers.syncRoadsVisibility === "function") syncers.syncRoadsVisibility();
      if (typeof syncers.syncUrbanNatureVisibility === "function") syncers.syncUrbanNatureVisibility();
      if (typeof syncers.syncKidsPopulationVisibility === "function") syncers.syncKidsPopulationVisibility();
      if (typeof syncers.syncSocioeconomicVisibility === "function") syncers.syncSocioeconomicVisibility();
      if (typeof syncers.syncSchoolsVisibility === "function") syncers.syncSchoolsVisibility();
      if (typeof syncers.syncBusStopsVisibility === "function") syncers.syncBusStopsVisibility();
      if (typeof syncers.syncParksVisibility === "function") syncers.syncParksVisibility();
    }

    function mirrorOverlayToggleChecked(layer, enabled) {
      if (!layer) return;
      var inputId = getPointLayerToggleId(layer);
      if (!inputId) return;
      setToggleChecked(inputId, enabled);
    }

    function onOverlayVisibilityChanged() {
      if (typeof controlActions.onPointVisibilityChanged === "function") {
        controlActions.onPointVisibilityChanged();
      }
      syncMapLayers();
    }

    function onScoreModeChanged(nextScoreMode) {
      if (typeof controlActions.onScoreModeChanged === "function") {
        controlActions.onScoreModeChanged(nextScoreMode);
      }
      syncMapLayers();
    }

    return {
      getUiElement: getUiElement,
      mirrorOverlayToggleChecked: mirrorOverlayToggleChecked,
      onOverlayVisibilityChanged: onOverlayVisibilityChanged,
      onScoreModeChanged: onScoreModeChanged,
      syncMapLayers: syncMapLayers,
    };
  }

  window.Urban95ControlSidebarAdapter = {
    create: create,
  };
})();
