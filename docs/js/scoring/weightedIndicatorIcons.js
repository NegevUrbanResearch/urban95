(function () {
  var palette = window.Urban95Palette;
  if (!palette) {
    throw new Error(
      "Urban95WeightedIndicatorIcons requires Urban95Palette (load js/core/palette.js first)"
    );
  }

  var WEIGHTED_CATEGORY_ICONS = {
    environmental_quality: "environmental-quality",
    nature: "nature",
    play: "play",
    safety_mobility: "safety-mobility",
    family_services: "family-services",
  };

  var WEIGHTED_SUB_ICONS = {
    shade: "shade",
    trees: "trees",
    roads: "roads-distance",
    parks: "park-access",
    urban_nature_areas: "urban-nature",
    playgrounds: "playgrounds",
    street_lights: "street-lights",
    bicycle_access: "bicycles",
    bus_stops: "bus-stops",
    shelters: "shelters",
    education: "education",
    community: "community-centers",
    business: "business-centers",
    health: "health-services",
  };

  var ICON_NEUTRAL = palette.ink;

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
      var iconColor = color || palette.slate;
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
