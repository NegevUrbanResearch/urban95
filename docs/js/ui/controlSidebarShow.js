(function () {
  function requireObject(value, name) {
    if (!value || typeof value !== "object") {
      throw new Error("Urban95ControlSidebarShow missing " + name);
    }
    return value;
  }

  function requireFunction(value, name) {
    if (typeof value !== "function") {
      throw new Error("Urban95ControlSidebarShow missing " + name);
    }
    return value;
  }

  function create(deps) {
    var config = requireObject(deps || {}, "deps");
    var scoreModel = requireObject(config.scoreModel, "scoreModel");
    var showRegistry = requireObject(config.showRegistry, "showRegistry");
    var applyShowAction = requireFunction(config.applyShowAction, "applyShowAction");
    var isShowActionEnabled = requireFunction(config.isShowActionEnabled, "isShowActionEnabled");
    var getWeightedShowLayerSpec = requireFunction(
      showRegistry.getWeightedShowLayerSpec,
      "showRegistry.getWeightedShowLayerSpec"
    );
    var resolveWeightedShowActions = requireFunction(
      showRegistry.resolveWeightedShowActions,
      "showRegistry.resolveWeightedShowActions"
    );

    function resolve(metricId) {
      var showSpec = getWeightedShowLayerSpec(scoreModel, metricId);
      if (!showSpec) {
        return { supported: false, reason: "No companion layer mapped", actions: [] };
      }
      if (showSpec.kind === "disabled") {
        return {
          supported: false,
          reason: showSpec.reason || "No companion layer mapped",
          actions: [],
        };
      }
      var actions = resolveWeightedShowActions(scoreModel, metricId);
      if (actions.length === 0) {
        return {
          supported: false,
          reason: "No companion map layer available",
          actions: [],
        };
      }
      return { supported: true, actions: actions, reason: "" };
    }

    function getState(metricId) {
      var resolved = resolve(metricId);
      if (!resolved.supported || resolved.actions.length === 0) return "off";
      var enabledCount = resolved.actions.filter(isShowActionEnabled).length;
      if (enabledCount === 0) return "off";
      if (enabledCount === resolved.actions.length) return "on";
      return "mixed";
    }

    function isEnabled(metricId) {
      return getState(metricId) === "on";
    }

    function setEnabled(metricId, enabled) {
      var resolved = resolve(metricId);
      if (!resolved.supported) return false;
      resolved.actions.forEach(function (action) {
        applyShowAction(action, enabled);
      });
      return true;
    }

    function toggle(metricId) {
      return setEnabled(metricId, !isEnabled(metricId));
    }

    return {
      resolve: resolve,
      getState: getState,
      isEnabled: isEnabled,
      setEnabled: setEnabled,
      toggle: toggle,
    };
  }

  window.Urban95ControlSidebarShow = {
    create: create,
  };
})();
