(function () {
  function requireObject(value, name) {
    if (!value || typeof value !== "object") {
      throw new Error("Urban95MapEvents requires " + name);
    }
    return value;
  }

  function requireFunction(value, name) {
    if (typeof value !== "function") {
      throw new Error("Urban95MapEvents requires " + name);
    }
    return value;
  }

  function requireMethod(objectValue, objectName, methodName) {
    return requireFunction(
      requireObject(objectValue, objectName)[methodName],
      objectName + "." + methodName
    );
  }

  function requireString(value, name) {
    if (typeof value !== "string" || !value) {
      throw new Error("Urban95MapEvents requires " + name);
    }
    return value;
  }

  function requireTooltip(value, name) {
    var tooltip = requireObject(value, name);
    requireObject(tooltip.style, name + ".style");
    return tooltip;
  }

  function bind(deps) {
    deps = requireObject(deps || {}, "deps");

    var map = requireObject(deps.map, "deps.map");
    var selection = requireObject(deps.selection, "deps.selection");
    var dashboards = requireObject(deps.dashboards, "deps.dashboards");
    var mapRenderers = requireObject(deps.mapRenderers, "deps.mapRenderers");
    var pointDataLoader = requireObject(deps.pointDataLoader, "deps.pointDataLoader");
    var tooltip = requireTooltip(deps.tooltip, "deps.tooltip");
    var buildingsFillLayerId = requireString(
      deps.buildingsFillLayerId,
      "deps.buildingsFillLayerId"
    );

    [
      "on",
      "getCanvas",
      "getZoom",
      "queryRenderedFeatures",
    ].forEach(function (methodName) {
      requireMethod(map, "deps.map", methodName);
    });
    requireMethod(selection, "deps.selection", "findClosestBuilding");
    requireMethod(selection, "deps.selection", "selectBuilding");
    [
      "showNeighborhoodModal",
      "getNeighborhoodFeatureAtPoint",
      "showNeighborhoodAreaTooltip",
    ].forEach(function (methodName) {
      requireMethod(dashboards, "deps.dashboards", methodName);
    });
    [
      "updateTreesSource",
      "updateStreetLightsSource",
    ].forEach(function (methodName) {
      requireMethod(mapRenderers, "deps.mapRenderers", methodName);
    });
    [
      "loadTreesIfNeeded",
      "loadStreetLightsIfNeeded",
    ].forEach(function (methodName) {
      requireMethod(pointDataLoader, "deps.pointDataLoader", methodName);
    });

    var getCurrentMode = requireFunction(deps.getCurrentMode, "deps.getCurrentMode");
    var getDeckHovering = requireFunction(deps.getDeckHovering, "deps.getDeckHovering");
    var getLastDeckClickTime = requireFunction(deps.getLastDeckClickTime, "deps.getLastDeckClickTime");
    var getScoreMode = requireFunction(deps.getScoreMode, "deps.getScoreMode");
    var formatArea = requireFunction(deps.formatArea, "deps.formatArea");

    map.on("click", function (e) {
      if (getCurrentMode() !== "house") return;
      if (!e || !e.originalEvent || !e.originalEvent.target || !e.lngLat) return;
      if (e.originalEvent.target !== map.getCanvas()) return;
      if (Date.now() - getLastDeckClickTime() < 300) return;

      var closest = selection.findClosestBuilding(e.lngLat);
      if (closest) {
        selection.selectBuilding(closest, true);
      }
    });

    map.on("mouseenter", buildingsFillLayerId, function () {
      if (!getDeckHovering()) map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", buildingsFillLayerId, function () {
      if (!getDeckHovering()) map.getCanvas().style.cursor = "";
    });

    map.on("mousemove", "parks-fill", function (e) {
      if (getDeckHovering()) {
        map.getCanvas().style.cursor = "";
        tooltip.style.display = "none";
        return;
      }
      if (!e || !e.features || !e.features[0] || !e.features[0].properties || !e.point) return;
      map.getCanvas().style.cursor = "pointer";
      var properties = e.features[0].properties;
      var lines = [];
      var name = properties.name || "Unnamed Park";
      lines.push(name);

      if (properties.area != null) {
        lines.push("Area: " + formatArea(properties.area));
      }

      tooltip.textContent = lines.join("\n");
      tooltip.style.display = "block";
      tooltip.style.left = e.point.x + 12 + "px";
      tooltip.style.top = e.point.y + 12 + "px";
    });

    map.on("mouseleave", "parks-fill", function () {
      if (!getDeckHovering()) map.getCanvas().style.cursor = "";
      tooltip.style.display = "none";
    });

    map.on("zoomend", function () {
      if (map.getZoom() >= 13) {
        pointDataLoader.loadTreesIfNeeded();
        pointDataLoader.loadStreetLightsIfNeeded();
      }
      if (getScoreMode() === "weighted") {
        mapRenderers.updateTreesSource();
        mapRenderers.updateStreetLightsSource();
      }
    });

    map.on("click", "neighborhoods-fill", function (e) {
      if (getCurrentMode() !== "neighborhood") return;
      var feature = e.features && e.features.length > 0 ? e.features[0] : null;
      if (!feature) return;
      dashboards.showNeighborhoodModal(feature);
    });

    map.on("click", "neighborhoods-surface", function (e) {
      if (getCurrentMode() !== "neighborhood") return;
      var neighborhoodFeature = dashboards.getNeighborhoodFeatureAtPoint(e.point);
      if (!neighborhoodFeature) return;
      dashboards.showNeighborhoodModal(neighborhoodFeature);
    });

    map.on("mouseenter", "neighborhoods-fill", function () {
      if (getCurrentMode() === "neighborhood") map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseenter", "neighborhoods-surface", function () {
      if (getCurrentMode() === "neighborhood") map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "neighborhoods-fill", function () {
      if (getCurrentMode() === "neighborhood") {
        map.getCanvas().style.cursor = "";
        tooltip.style.display = "none";
      }
    });

    map.on("mouseleave", "neighborhoods-surface", function () {
      if (getCurrentMode() === "neighborhood") {
        map.getCanvas().style.cursor = "";
        tooltip.style.display = "none";
      }
    });

    map.on("mousemove", "neighborhoods-fill", function (e) {
      if (getCurrentMode() !== "neighborhood") return;
      var areaFeature = map.queryRenderedFeatures(e.point, { layers: ["neighborhoods-surface"] })[0];
      dashboards.showNeighborhoodAreaTooltip(e.point, areaFeature || null);
    });

    map.on("mousemove", "neighborhoods-surface", function (e) {
      if (getCurrentMode() !== "neighborhood" || !e.features || e.features.length === 0) return;
      dashboards.showNeighborhoodAreaTooltip(e.point, e.features[0]);
    });
  }

  window.Urban95MapEvents = {
    bind: bind,
  };
})();
