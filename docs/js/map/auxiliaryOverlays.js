(function () {
  if (!window.Urban95Palette) {
    throw new Error(
      "Urban95AuxiliaryOverlays requires Urban95Palette (load js/core/palette.js first)"
    );
  }

  var ROAD_LAYER_IDS = [
    "roads-casing",
    "roads-fill",
    "roads-labels-major",
    "roads-labels-local",
  ];
  var SCHOOLS_SOURCE_ID = "schools";
  var EDUCATION_LAYER_IDS = {
    school: "education-schools-points",
    kindergarten: "education-kindergartens-points",
  };
  var BUS_STOPS_SOURCE_ID = "bus-stops";
  var BUS_STOPS_LAYER_ID = "bus-stops-points";
  var KIDS_POPULATION_SOURCE_ID = "kids-population-grid";
  var KIDS_POPULATION_LAYER_ID = "kids-population-grid-fill";
  var URBAN_NATURE_LAYER_ID = "urban-nature-fill";
  var SOCIOECONOMIC_SOURCE_ID = "socioeconomic-statareas";
  var SOCIOECONOMIC_FILL_LAYER_ID = "socioeconomic-statareas-fill";
  var SOCIOECONOMIC_OUTLINE_LAYER_ID = "socioeconomic-statareas-outline";
  var SOCIOECONOMIC_LABEL_LAYER_ID = "socioeconomic-statareas-labels";
  var KIDS_AGE_0_4_KEY = "\u05d2\u05d9\u05dc0_4";
  var KIDS_AGE_5_9_KEY = "\u05d2\u05d9\u05dc5_9";

  function required(deps, name) {
    if (!deps || deps[name] == null) {
      throw new Error("Urban95AuxiliaryOverlays.create requires " + name);
    }
    return deps[name];
  }

  function requiredFunction(deps, name) {
    var value = required(deps, name);
    if (typeof value !== "function") {
      throw new Error("Urban95AuxiliaryOverlays.create requires " + name + " (function)");
    }
    return value;
  }

  function safeNumber(value) {
    var num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function isPolygonFeatureGeometry(geometry) {
    return !!geometry && (geometry.type === "Polygon" || geometry.type === "MultiPolygon");
  }

  function getKids0To9Count(props) {
    var p = props || {};
    var kids0to4 = safeNumber(p[KIDS_AGE_0_4_KEY]) || 0;
    var kids5to9 = safeNumber(p[KIDS_AGE_5_9_KEY]) || 0;
    return kids0to4 + kids5to9;
  }

  function create(deps) {
    var map = required(deps, "map");
    var turf = required(deps, "turf");
    var overlayVisibility = required(deps, "overlayVisibility");
    var fetchJsonWithGzipFallback = requiredFunction(deps, "fetchJsonWithGzipFallback");
    var getCurrentMode = requiredFunction(deps, "getCurrentMode");
    var getScoreMode = requiredFunction(deps, "getScoreMode");
    var getDeckHovering = requiredFunction(deps, "getDeckHovering");
    var refreshLegend = requiredFunction(deps, "refreshLegend");
    var formatArea = requiredFunction(deps, "formatArea");
    var mapRenderers = required(deps, "mapRenderers");
    var tooltip = required(deps, "tooltip");
    var urls = required(deps, "urls");
    var detailPointsMinZoom = Math.max(0, (Number(deps.detailPointsMinZoom) || 15) - 1);
    var populationGridLookupFeatures = [];
    var socioeconomicLookupFeatures = [];
    var kidsPopulationMaxKids = 0;
    var educationHoverBoundLayerIds = new Set();
    var busStopsHoverBound = false;
    var demographicOverlayBoundLayers = new Set();

    function formatPopulationGridAreaLabel(areaSqM) {
      var area = Number.isFinite(areaSqM) && areaSqM > 0 ? areaSqM : 40000;
      var sideM = Math.round(Math.sqrt(area));
      return sideM + " m \u00d7 " + sideM + " m (" + formatArea(area) + ")";
    }

    function findPolygonFeatureAtLngLat(features, lng, lat) {
      if (!features || !features.length || lng == null || lat == null) return null;
      var point = turf.point([lng, lat]);
      for (var i = 0; i < features.length; i += 1) {
        var feature = features[i];
        if (!feature || !isPolygonFeatureGeometry(feature.geometry)) continue;
        try {
          if (turf.booleanPointInPolygon(point, feature)) return feature;
        } catch (_error) {}
      }
      return null;
    }

    function buildBuildingDemographicContext(lng, lat) {
      var context = { population: null, socioeconomic: null };
      var popFeature = findPolygonFeatureAtLngLat(populationGridLookupFeatures, lng, lat);
      if (popFeature) {
        var popProps = popFeature.properties || {};
        var areaSqM = safeNumber(popProps.Shape_Area) || 40000;
        context.population = {
          kids0to4: safeNumber(popProps[KIDS_AGE_0_4_KEY]),
          kids5to9: safeNumber(popProps[KIDS_AGE_5_9_KEY]),
          areaSqM: areaSqM,
          areaLabel: formatPopulationGridAreaLabel(areaSqM),
        };
      }
      var sesFeature = findPolygonFeatureAtLngLat(socioeconomicLookupFeatures, lng, lat);
      if (sesFeature) {
        var sesProps = sesFeature.properties || {};
        var cluster = safeNumber(
          sesProps.socio_cluster != null ? sesProps.socio_cluster : sesProps.cluster_2021
        );
        var tractAreaSqM = null;
        try {
          tractAreaSqM = turf.area(sesFeature);
        } catch (_error) {}
        context.socioeconomic = {
          cluster: Number.isFinite(cluster) ? Math.round(cluster) : null,
          statArea: sesProps.stat_area != null ? sesProps.stat_area : sesProps.yishuv_stat || null,
          areaSqM: Number.isFinite(tractAreaSqM) ? tractAreaSqM : null,
        };
      }
      return context;
    }

    function normalizeKidsPopulationGrid(rawFeatureCollection) {
      var features = (rawFeatureCollection && rawFeatureCollection.features) || [];
      var normalized = [];
      var maxKids = 0;
      features.forEach(function (feature) {
        var geometry = feature && feature.geometry ? feature.geometry : null;
        if (!isPolygonFeatureGeometry(geometry)) return;
        var props = feature && feature.properties ? feature.properties : {};
        var kids0to4 = safeNumber(props[KIDS_AGE_0_4_KEY]);
        var kids5to9 = safeNumber(props[KIDS_AGE_5_9_KEY]);
        var kids0to9 = getKids0To9Count(props);
        if (!Number.isFinite(kids0to9)) return;
        var safeKids0to4 = kids0to4 != null ? Math.max(0, kids0to4) : null;
        var safeKids5to9 = kids5to9 != null ? Math.max(0, kids5to9) : null;
        var safeKids0to9 = Math.max(0, kids0to9);
        if (safeKids0to9 > maxKids) maxKids = safeKids0to9;
        normalized.push({
          type: "Feature",
          properties: {
            kids_0_4: safeKids0to4,
            kids_5_9: safeKids5to9,
            kids_0_9: safeKids0to9,
          },
          geometry: geometry,
        });
      });
      return {
        featureCollection: {
          type: "FeatureCollection",
          features: normalized,
        },
        maxKids: maxKids,
      };
    }

    function kidsPopulationFillColorExpression(maxKids) {
      var maxValue = Number.isFinite(maxKids) && maxKids > 0 ? maxKids : 1;
      return [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "kids_0_9"]], 0],
        0, "#bfdbfe",
        maxValue * 0.15, "#93c5fd",
        maxValue * 0.35, "#60a5fa",
        maxValue * 0.6, "#2563eb",
        maxValue, "#1e3a8a",
      ];
    }

    function kidsPopulationFillOpacityExpression(maxKids) {
      var maxValue = Number.isFinite(maxKids) && maxKids > 0 ? maxKids : 1;
      return [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "kids_0_9"]], 0],
        0, 0.28,
        maxValue * 0.1, 0.38,
        maxValue * 0.4, 0.58,
        maxValue, 0.82,
      ];
    }

    function ensureKidsPopulationLayer() {
      if (!map.getSource(KIDS_POPULATION_SOURCE_ID)) {
        map.addSource(KIDS_POPULATION_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(KIDS_POPULATION_LAYER_ID)) {
        map.addLayer(
          {
            id: KIDS_POPULATION_LAYER_ID,
            type: "fill",
            source: KIDS_POPULATION_SOURCE_ID,
            layout: {
              visibility: "none",
            },
            paint: {
              "fill-color": "#60a5fa",
              "fill-opacity": 0.5,
              "fill-outline-color": "rgba(59, 130, 246, 0.45)",
            },
          },
          "selected-building-outline"
        );
      }
    }

    function applyUrbanNatureVisibility() {
      if (!map.getLayer(URBAN_NATURE_LAYER_ID)) return;
      var enabled = overlayVisibility.isCanonicalLayerVisible("urban-nature", false);
      var showInMode = getCurrentMode() === "house" || getCurrentMode() === "citywide";
      map.setLayoutProperty(
        URBAN_NATURE_LAYER_ID,
        "visibility",
        enabled && showInMode ? "visible" : "none"
      );
    }

    function stackKidsPopulationLayer() {
      if (!map.getLayer(KIDS_POPULATION_LAYER_ID)) return;
      // Keep the grid above neighborhood choropleth (citywide fill is ~0.6 and
      // otherwise mutes the blues) but under boundary lines/labels.
      if (map.getLayer("neighborhoods-line")) {
        map.moveLayer(KIDS_POPULATION_LAYER_ID, "neighborhoods-line");
        return;
      }
      if (map.getLayer("neighborhoods-label")) {
        map.moveLayer(KIDS_POPULATION_LAYER_ID, "neighborhoods-label");
        return;
      }
      if (map.getLayer("selected-building-outline")) {
        map.moveLayer(KIDS_POPULATION_LAYER_ID, "selected-building-outline");
      }
    }

    function applyKidsPopulationVisibility() {
      if (!map.getLayer(KIDS_POPULATION_LAYER_ID)) return;
      var visible = overlayVisibility.isCanonicalLayerVisible("kids-population", false);
      map.setLayoutProperty(KIDS_POPULATION_LAYER_ID, "visibility", visible ? "visible" : "none");
      if (visible) stackKidsPopulationLayer();
    }

    async function loadKidsPopulationGridLayer() {
      try {
        var raw = await fetchJsonWithGzipFallback(urls.populationGrid, { required: false });
        ensureKidsPopulationLayer();
        var source = map.getSource(KIDS_POPULATION_SOURCE_ID);
        if (!source || !raw) return;
        var normalized = normalizeKidsPopulationGrid(raw);
        kidsPopulationMaxKids = normalized.maxKids;
        populationGridLookupFeatures = ((raw && raw.features) || []).filter(function (feature) {
          return feature && isPolygonFeatureGeometry(feature.geometry);
        });
        source.setData(normalized.featureCollection);
        map.setPaintProperty(
          KIDS_POPULATION_LAYER_ID,
          "fill-color",
          kidsPopulationFillColorExpression(normalized.maxKids)
        );
        map.setPaintProperty(
          KIDS_POPULATION_LAYER_ID,
          "fill-opacity",
          kidsPopulationFillOpacityExpression(normalized.maxKids)
        );
        bindDemographicOverlayHover();
        applyKidsPopulationVisibility();
        refreshLegend();
      } catch (err) {
        console.error("Failed to load kids population grid:", err);
      }
    }

    function normalizeSocioeconomicLayer(rawFeatureCollection) {
      var features = (rawFeatureCollection && rawFeatureCollection.features) || [];
      var normalized = [];
      features.forEach(function (feature) {
        var geometry = feature && feature.geometry ? feature.geometry : null;
        if (!isPolygonFeatureGeometry(geometry)) return;
        var properties = Object.assign({}, (feature && feature.properties) || {});
        var rawIndex = safeNumber(properties.socio_index != null ? properties.socio_index : properties.index_value);
        if (!Number.isFinite(rawIndex)) return;
        properties.socio_index = rawIndex;
        var rawCluster = safeNumber(
          properties.socio_cluster != null ? properties.socio_cluster : properties.cluster_2021
        );
        if (Number.isFinite(rawCluster)) properties.socio_cluster = Math.round(rawCluster);
        var rawRank = safeNumber(properties.socio_rank != null ? properties.socio_rank : properties.rank_2021);
        if (Number.isFinite(rawRank)) properties.socio_rank = Math.round(rawRank);
        normalized.push({
          type: "Feature",
          properties: properties,
          geometry: geometry,
        });
      });
      return {
        featureCollection: {
          type: "FeatureCollection",
          features: normalized,
        },
      };
    }

    function ensureSocioeconomicLayer() {
      if (!map.getSource(SOCIOECONOMIC_SOURCE_ID)) {
        map.addSource(SOCIOECONOMIC_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(SOCIOECONOMIC_FILL_LAYER_ID)) {
        var beforeLayerId = map.getLayer("selected-building-outline")
          ? "selected-building-outline"
          : undefined;
        map.addLayer(
          {
            id: SOCIOECONOMIC_FILL_LAYER_ID,
            type: "fill",
            source: SOCIOECONOMIC_SOURCE_ID,
            layout: {
              visibility: "none",
            },
            paint: {
              "fill-color": "rgba(0, 0, 0, 0)",
              "fill-opacity": 0,
            },
          },
          beforeLayerId
        );
      }
      if (!map.getLayer(SOCIOECONOMIC_OUTLINE_LAYER_ID)) {
        map.addLayer({
          id: SOCIOECONOMIC_OUTLINE_LAYER_ID,
          type: "line",
          source: SOCIOECONOMIC_SOURCE_ID,
          layout: {
            visibility: "none",
          },
          paint: {
            "line-color": "rgba(68, 64, 60, 0.7)",
            "line-width": 0.9,
          },
        });
      }
      if (!map.getLayer(SOCIOECONOMIC_LABEL_LAYER_ID)) {
        map.addLayer({
          id: SOCIOECONOMIC_LABEL_LAYER_ID,
          type: "symbol",
          source: SOCIOECONOMIC_SOURCE_ID,
          minzoom: 12,
          layout: {
            visibility: "none",
            "text-field": [
              "case",
              ["has", "socio_cluster"],
              ["concat", "Cluster ", ["to-string", ["get", "socio_cluster"]]],
              ["has", "cluster_2021"],
              ["concat", "Cluster ", ["to-string", ["round", ["to-number", ["get", "cluster_2021"]]]]],
              "",
            ],
            "text-size": 11,
            "text-font": ["Noto Sans Regular"],
          },
          paint: {
            "text-color": "#1f2937",
            "text-halo-color": "rgba(255, 255, 255, 0.85)",
            "text-halo-width": 1.2,
          },
        });
      }
    }

    function applySocioeconomicVisibility() {
      var visible = overlayVisibility.isCanonicalLayerVisible("socioeconomic", false);
      var nextVisibility = visible ? "visible" : "none";
      [
        SOCIOECONOMIC_FILL_LAYER_ID,
        SOCIOECONOMIC_OUTLINE_LAYER_ID,
        SOCIOECONOMIC_LABEL_LAYER_ID,
      ].forEach(function (layerId) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", nextVisibility);
        }
      });
    }

    function formatKidsPopulationTooltipLines(feature) {
      var properties = (feature && feature.properties) || {};
      var kids0to4 = safeNumber(properties.kids_0_4);
      var kids5to9 = safeNumber(properties.kids_5_9);
      var lines = [];
      if (Number.isFinite(kids0to4)) lines.push("Ages 0\u20134: " + Math.round(kids0to4));
      if (Number.isFinite(kids5to9)) lines.push("Ages 5\u20139: " + Math.round(kids5to9));
      return lines;
    }

    function formatSocioeconomicTooltipLines(feature) {
      var properties = (feature && feature.properties) || {};
      var clusterValue = safeNumber(
        properties.socio_cluster != null ? properties.socio_cluster : properties.cluster_2021
      );
      if (!Number.isFinite(clusterValue)) return [];
      return ["SES cluster: " + Math.round(clusterValue)];
    }

    function getDemographicOverlayQueryLayers() {
      var layers = [];
      if (
        overlayVisibility.isCanonicalLayerVisible("kids-population", false) &&
        map.getLayer(KIDS_POPULATION_LAYER_ID)
      ) {
        layers.push(KIDS_POPULATION_LAYER_ID);
      }
      if (
        overlayVisibility.isCanonicalLayerVisible("socioeconomic", false) &&
        map.getLayer(SOCIOECONOMIC_FILL_LAYER_ID)
      ) {
        layers.push(SOCIOECONOMIC_FILL_LAYER_ID);
      }
      return layers;
    }

    function getDemographicOverlayFeaturesAtPoint(point) {
      var layers = getDemographicOverlayQueryLayers();
      if (!layers.length || !point) {
        return { kidsFeature: null, sesFeature: null };
      }
      var features = map.queryRenderedFeatures(point, { layers: layers });
      var kidsFeature = null;
      var sesFeature = null;
      features.forEach(function (feature) {
        if (!feature || !feature.layer || !feature.layer.id) return;
        if (feature.layer.id === KIDS_POPULATION_LAYER_ID && !kidsFeature) kidsFeature = feature;
        if (feature.layer.id === SOCIOECONOMIC_FILL_LAYER_ID && !sesFeature) sesFeature = feature;
      });
      return { kidsFeature: kidsFeature, sesFeature: sesFeature };
    }

    function formatDemographicOverlayTooltip(kidsFeature, sesFeature) {
      var lines = [];
      if (kidsFeature) lines.push.apply(lines, formatKidsPopulationTooltipLines(kidsFeature));
      if (sesFeature) lines.push.apply(lines, formatSocioeconomicTooltipLines(sesFeature));
      return lines.length ? lines.join("\n") : "";
    }

    function buildDemographicOverlayTooltip(point) {
      var features = getDemographicOverlayFeaturesAtPoint(point);
      return formatDemographicOverlayTooltip(features.kidsFeature, features.sesFeature);
    }

    function bindDemographicOverlayHover() {
      [KIDS_POPULATION_LAYER_ID, SOCIOECONOMIC_FILL_LAYER_ID].forEach(function (layerId) {
        if (!map.getLayer(layerId) || demographicOverlayBoundLayers.has(layerId)) return;
        demographicOverlayBoundLayers.add(layerId);
        map.on("mousemove", layerId, function (e) {
          if (!e || !e.point) return;
          if (getDeckHovering()) {
            map.getCanvas().style.cursor = "";
            tooltip.style.display = "none";
            return;
          }
          var label = buildDemographicOverlayTooltip(e.point);
          if (!label) {
            tooltip.style.display = "none";
            return;
          }
          map.getCanvas().style.cursor = "pointer";
          tooltip.textContent = label;
          tooltip.style.display = "block";
          tooltip.style.left = e.point.x + 12 + "px";
          tooltip.style.top = e.point.y + 12 + "px";
        });
        map.on("mouseleave", layerId, function (e) {
          if (e && e.point && buildDemographicOverlayTooltip(e.point)) return;
          map.getCanvas().style.cursor = "";
          tooltip.style.display = "none";
        });
      });
    }

    async function loadSocioeconomicLayer() {
      try {
        var raw = await fetchJsonWithGzipFallback(urls.socioeconomic, { required: false });
        ensureSocioeconomicLayer();
        var source = map.getSource(SOCIOECONOMIC_SOURCE_ID);
        if (!source || !raw) return;
        var normalized = normalizeSocioeconomicLayer(raw);
        socioeconomicLookupFeatures = normalized.featureCollection.features || [];
        source.setData(normalized.featureCollection);
        bindDemographicOverlayHover();
        applySocioeconomicVisibility();
      } catch (err) {
        console.error("Failed to load socioeconomic layer:", err);
      }
    }

    function ensureSchoolsLayer() {
      if (!map.getSource(SCHOOLS_SOURCE_ID)) {
        map.addSource(SCHOOLS_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      var beforeLayerId = map.getLayer("selected-building-outline")
        ? "selected-building-outline"
        : undefined;
      [
        { subtype: "school", color: "#7145c7" },
        { subtype: "kindergarten", color: "#b48af2" },
      ].forEach(function (config) {
        var layerId = EDUCATION_LAYER_IDS[config.subtype];
        if (map.getLayer(layerId)) return;
        map.addLayer(
          {
            id: layerId,
            type: "symbol",
            source: SCHOOLS_SOURCE_ID,
            minzoom: detailPointsMinZoom,
            filter: ["==", ["get", "amenity_subtype"], config.subtype],
            layout: {
              // town-hall SDF reads cleanly; Maki "school" (apple) fragments at map sizes
              "icon-image": "town-hall",
              // Match tree / street-light point scale (layer only shows at detail zoom).
              "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 18, 1.2],
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              visibility: "none",
            },
            paint: {
              "icon-color": config.color,
              "icon-opacity": 0.95,
            },
          },
          beforeLayerId
        );
      });
    }

    function applySchoolsLayerVisibility() {
      var isUrban95 = getScoreMode() === "weighted";
      Object.keys(EDUCATION_LAYER_IDS).forEach(function (subtype) {
        var layerId = EDUCATION_LAYER_IDS[subtype];
        if (!map.getLayer(layerId)) return;
        var visible =
          overlayVisibility.isCanonicalLayerVisible("education-" + subtype, false) &&
          isUrban95 &&
          getCurrentMode() === "house" &&
          map.getZoom() >= detailPointsMinZoom;
        map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
      });
    }

    function ensureBusStopsLayer() {
      if (!map.getSource(BUS_STOPS_SOURCE_ID)) {
        map.addSource(BUS_STOPS_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(BUS_STOPS_LAYER_ID)) {
        var beforeLayerId = map.getLayer("selected-building-outline")
          ? "selected-building-outline"
          : undefined;
        map.addLayer(
          {
            id: BUS_STOPS_LAYER_ID,
            type: "symbol",
            source: BUS_STOPS_SOURCE_ID,
            minzoom: detailPointsMinZoom,
            layout: {
              "icon-image": "bus",
              "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 1.0, 14, 1.3, 18, 1.8],
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              visibility: "none",
            },
            paint: {
              "icon-color": window.Urban95Palette.peach,
              "icon-opacity": 0.95,
            },
          },
          beforeLayerId
        );
      }
    }

    function applyBusStopsLayerVisibility() {
      if (!map.getLayer(BUS_STOPS_LAYER_ID)) return;
      var isUrban95 = getScoreMode() === "weighted";
      var visible =
        overlayVisibility.isCanonicalLayerVisible("bus-stops", false) &&
        isUrban95 &&
        getCurrentMode() === "house" &&
        map.getZoom() >= detailPointsMinZoom;
      map.setLayoutProperty(BUS_STOPS_LAYER_ID, "visibility", visible ? "visible" : "none");
    }

    function bindBusStopsHover() {
      if (busStopsHoverBound || !map.getLayer(BUS_STOPS_LAYER_ID)) return;
      mapRenderers.bindPointHoverLayer(BUS_STOPS_LAYER_ID, function (feature) {
        var props = (feature && feature.properties) || {};
        return props.stop_name || props.name || "Bus stop";
      });
      busStopsHoverBound = true;
    }

    async function loadBusStopsLayer() {
      try {
        var busStops = await fetchJsonWithGzipFallback(urls.busStops, { required: false });
        ensureBusStopsLayer();
        var source = map.getSource(BUS_STOPS_SOURCE_ID);
        if (!source) return;
        source.setData(
          busStops && busStops.type === "FeatureCollection"
            ? busStops
            : { type: "FeatureCollection", features: [] }
        );
        bindBusStopsHover();
        applyBusStopsLayerVisibility();
      } catch (err) {
        console.error("Failed to load bus stops layer:", err);
      }
    }

    async function loadSchoolsLayer() {
      try {
        var schools = await fetchJsonWithGzipFallback(urls.education, { required: false });
        ensureSchoolsLayer();
        var source = map.getSource(SCHOOLS_SOURCE_ID);
        if (!source) return;
        source.setData(
          schools && schools.type === "FeatureCollection"
            ? schools
            : { type: "FeatureCollection", features: [] }
        );
        bindSchoolsHover();
        applySchoolsLayerVisibility();
      } catch (err) {
        console.error("Failed to load schools layer:", err);
      }
    }

    function getSchoolHoverName(properties) {
      if (!properties) return "School";
      return (
        properties.Institutio ||
        properties.institution ||
        properties.name ||
        properties.NAME ||
        properties.school_name ||
        properties.oldName ||
        "School"
      );
    }

    function decodeLikelyMojibakeUtf8(value) {
      var text = String(value || "");
      if (!text || text.indexOf("\u00c3\u2014") === -1) return text;
      try {
        var bytes = Uint8Array.from(Array.from(text, function (char) {
          return char.charCodeAt(0) & 0xff;
        }));
        var decoded = new TextDecoder("utf-8").decode(bytes);
        return decoded && decoded.indexOf("\ufffd") === -1 ? decoded : text;
      } catch (_error) {
        return text;
      }
    }

    function bindSchoolsHover() {
      Object.keys(EDUCATION_LAYER_IDS).forEach(function (subtype) {
        var layerId = EDUCATION_LAYER_IDS[subtype];
        if (educationHoverBoundLayerIds.has(layerId) || !map.getLayer(layerId)) return;
        mapRenderers.bindPointHoverLayer(layerId, function (feature) {
          var props = (feature && feature.properties) || {};
          var name = decodeLikelyMojibakeUtf8(getSchoolHoverName(props));
          var label = subtype === "kindergarten" ? "Kindergartens" : "Schools";
          return name + "\n" + label;
        });
        educationHoverBoundLayerIds.add(layerId);
      });
    }

    function applyRoadSymbologyVisibility() {
      var visibility = overlayVisibility.isCanonicalLayerVisible("roads", false) ? "visible" : "none";
      ROAD_LAYER_IDS.forEach(function (layerId) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visibility);
        }
      });
    }

    function getKidsPopulationLegend() {
      return {
        visible: overlayVisibility.isCanonicalLayerVisible("kids-population", false),
        maxKids: kidsPopulationMaxKids,
      };
    }

    return {
      buildBuildingDemographicContext: buildBuildingDemographicContext,
      getKidsPopulationLegend: getKidsPopulationLegend,
      applyUrbanNatureVisibility: applyUrbanNatureVisibility,
      applyKidsPopulationVisibility: applyKidsPopulationVisibility,
      applySocioeconomicVisibility: applySocioeconomicVisibility,
      applySchoolsLayerVisibility: applySchoolsLayerVisibility,
      applyBusStopsLayerVisibility: applyBusStopsLayerVisibility,
      applyRoadSymbologyVisibility: applyRoadSymbologyVisibility,
      loadKidsPopulationGridLayer: loadKidsPopulationGridLayer,
      loadSocioeconomicLayer: loadSocioeconomicLayer,
      loadSchoolsLayer: loadSchoolsLayer,
      loadBusStopsLayer: loadBusStopsLayer,
    };
  }

  window.Urban95AuxiliaryOverlays = {
    create: create,
  };
})();
