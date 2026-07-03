(function () {
  var WEIGHTED_CATEGORY_ICONS = {
    environmental_quality: "garden",
    nature: "park",
    play: "playground",
    safety_mobility: "bus",
    family_services: "heart",
  };

  var WEIGHTED_SUB_ICONS = {
    shade: "garden",
    trees: "park-alt1",
    roads: "road-accident",
    parks: "park",
    urban_nature_areas: "park-alt1",
    playgrounds: "playground",
    street_lights: "lighthouse",
    bicycle_access: "bicycle",
    bus_stops: "bus",
    shelters: "shelter",
    education: "school",
    community: "town-hall",
    business: "shop",
    health: "hospital",
  };

  var ICON_NEUTRAL = "#0f172a";

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function create(iconsBase) {
    if (typeof iconsBase !== "string" || !iconsBase) {
      throw new Error("Urban95WeightedIndicatorIcons.create requires iconsBase");
    }

    function getCategoryIcon(stem) {
      return WEIGHTED_CATEGORY_ICONS[stem] || "marker";
    }

    function getSubcategoryIcon(stem) {
      return WEIGHTED_SUB_ICONS[stem] || "marker";
    }

    function renderIcon(iconName, color) {
      var name = iconName || "marker";
      var iconColor = color || "#64748b";
      var url = iconsBase + "/" + encodeURIComponent(name) + ".svg";
      return (
        '<span class="horizon-icon" role="img" aria-hidden="true" style="--horizon-icon-color:' +
        escapeHtml(iconColor) +
        ";--horizon-icon-url:url('" +
        url +
        "')\"></span>"
      );
    }

    return {
      getCategoryIcon: getCategoryIcon,
      getSubcategoryIcon: getSubcategoryIcon,
      renderIcon: renderIcon,
      ICON_NEUTRAL: ICON_NEUTRAL,
    };
  }

  window.Urban95WeightedIndicatorIcons = {
    ICON_NEUTRAL: ICON_NEUTRAL,
    create: create,
  };
})();
