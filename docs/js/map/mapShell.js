(function () {
  function emptyFeatureCollection() {
    return { type: "FeatureCollection", features: [] };
  }

  function roadCategoryColorExpression() {
    return "#111111";
  }

  function roadCategoryCasingColorExpression() {
    return "#111111";
  }

  function roadCategoryWidthExpression(baseWidths) {
    return [
      "match",
      ["get", "highway"],
      ["motorway", "trunk"],
      baseWidths.major,
      ["motorway_link", "trunk_link"],
      baseWidths.majorLink,
      ["primary"],
      baseWidths.primary,
      ["primary_link"],
      baseWidths.primaryLink,
      ["secondary"],
      baseWidths.secondary,
      ["secondary_link"],
      baseWidths.secondaryLink,
      ["tertiary", "tertiary_link"],
      baseWidths.tertiary,
      ["residential", "living_street", "unclassified"],
      baseWidths.local,
      ["service"],
      baseWidths.service,
      baseWidths.other,
    ];
  }

  function createRoadPaintLayers() {
    return [
      {
        id: "roads-casing",
        type: "line",
        source: "roads",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": roadCategoryCasingColorExpression(),
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            roadCategoryWidthExpression({
              major: 1.7,
              majorLink: 1.35,
              primary: 1.45,
              primaryLink: 1.2,
              secondary: 1.2,
              secondaryLink: 1,
              tertiary: 0.9,
              local: 0.65,
              service: 0.55,
              other: 0.5,
            }),
            12,
            roadCategoryWidthExpression({
              major: 3.8,
              majorLink: 3.1,
              primary: 3.3,
              primaryLink: 2.6,
              secondary: 2.8,
              secondaryLink: 2.2,
              tertiary: 2.1,
              local: 1.45,
              service: 1.2,
              other: 1.05,
            }),
            16,
            roadCategoryWidthExpression({
              major: 8.4,
              majorLink: 7.1,
              primary: 7.2,
              primaryLink: 6,
              secondary: 5.9,
              secondaryLink: 5,
              tertiary: 4.3,
              local: 2.95,
              service: 2.35,
              other: 2,
            }),
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            0.3,
            12,
            0.36,
            16,
            0.44,
          ],
        },
      },
      {
        id: "roads-fill",
        type: "line",
        source: "roads",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": roadCategoryColorExpression(),
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            roadCategoryWidthExpression({
              major: 1.1,
              majorLink: 0.82,
              primary: 0.92,
              primaryLink: 0.75,
              secondary: 0.75,
              secondaryLink: 0.62,
              tertiary: 0.55,
              local: 0.36,
              service: 0.28,
              other: 0.24,
            }),
            12,
            roadCategoryWidthExpression({
              major: 2.5,
              majorLink: 2,
              primary: 2.2,
              primaryLink: 1.7,
              secondary: 1.8,
              secondaryLink: 1.45,
              tertiary: 1.45,
              local: 0.95,
              service: 0.72,
              other: 0.62,
            }),
            16,
            roadCategoryWidthExpression({
              major: 6,
              majorLink: 5.2,
              primary: 5,
              primaryLink: 4.1,
              secondary: 4.2,
              secondaryLink: 3.4,
              tertiary: 3,
              local: 1.95,
              service: 1.5,
              other: 1.25,
            }),
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            0.38,
            12,
            0.46,
            16,
            0.56,
          ],
        },
      },
    ];
  }

  function createRoadLabelLayers() {
    return [
      {
        id: "roads-labels-major",
        type: "symbol",
        source: "roads",
        minzoom: 11,
        filter: [
          "all",
          ["!=", ["coalesce", ["get", "name"], ""], ""],
          [
            "match",
            ["get", "highway"],
            [
              "motorway",
              "motorway_link",
              "trunk",
              "trunk_link",
              "primary",
              "primary_link",
              "secondary",
              "secondary_link",
              "tertiary",
            ],
            true,
            false,
          ],
        ],
        layout: {
          "symbol-placement": "line",
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            10,
            14,
            12,
            16,
            13,
          ],
          "symbol-spacing": 280,
          "text-keep-upright": true,
        },
        paint: {
          "text-color": "#111111",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.2,
          "text-halo-blur": 0.5,
          "text-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            0.58,
            14,
            0.66,
            16,
            0.74,
          ],
        },
      },
      {
        id: "roads-labels-local",
        type: "symbol",
        source: "roads",
        minzoom: 14,
        filter: [
          "all",
          ["!=", ["coalesce", ["get", "name"], ""], ""],
          [
            "match",
            ["get", "highway"],
            ["residential", "living_street", "unclassified", "service"],
            true,
            false,
          ],
        ],
        layout: {
          "symbol-placement": "line",
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            14,
            9,
            16,
            10.5,
          ],
          "symbol-spacing": 260,
          "text-keep-upright": true,
        },
        paint: {
          "text-color": "#111111",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1,
          "text-halo-blur": 0.4,
          "text-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            14,
            0.45,
            16,
            0.62,
          ],
        },
      },
    ];
  }

  function createBaseMap(options) {
    var opts = options || {};
    var maplibreglRef = opts.maplibregl;
    if (!maplibreglRef || typeof maplibreglRef.Map !== "function") {
      throw new Error("maplibregl.Map is required before mapShell.js creates the map");
    }
    if (
      typeof maplibreglRef.setRTLTextPlugin === "function" &&
      !maplibreglRef.__urban95RtlTextPluginRequested
    ) {
      var rtlStatus =
        typeof maplibreglRef.getRTLTextPluginStatus === "function"
          ? maplibreglRef.getRTLTextPluginStatus()
          : "unavailable";
      if (rtlStatus !== "loaded" && rtlStatus !== "loading") {
        maplibreglRef.__urban95RtlTextPluginRequested = true;
        maplibreglRef.setRTLTextPlugin(
          "https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js",
          null,
          true
        );
      }
    }
    if (!opts.buildingsSource || !opts.buildingsFillLayer) {
      throw new Error("Urban95MapShell.createBaseMap requires building source and fill layer");
    }

    var hasGeneratedArtifact =
      typeof opts.hasGeneratedArtifact === "function" ? opts.hasGeneratedArtifact : function () { return false; };
    var vectorSourceOrGeojson =
      typeof opts.vectorSourceOrGeojson === "function"
        ? opts.vectorSourceOrGeojson
        : function () { return { type: "geojson", data: emptyFeatureCollection() }; };

    var selectedLayer =
      hasGeneratedArtifact("buildings") && opts.buildingsSelectedLayer ? [opts.buildingsSelectedLayer] : [];
    var map = new maplibreglRef.Map({
      container: opts.container || "map",
      collectResourceTiming: !!(window.urban95Perf && window.urban95Perf.enabled),
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          osm: {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
              "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
              "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap © CARTO",
          },
          [opts.buildingsMapSourceId || "buildings"]: opts.buildingsSource,
          roads: {
            type: "geojson",
            data: opts.roadsUrl || "./data/roads.geojson",
          },
          parks: { type: "geojson", data: emptyFeatureCollection() },
          "radius-circle": { type: "geojson", data: emptyFeatureCollection() },
          "selected-building": { type: "geojson", data: emptyFeatureCollection() },
          amenities: { type: "geojson", data: emptyFeatureCollection() },
          trees: { type: "geojson", data: emptyFeatureCollection() },
          "trees-vector": vectorSourceOrGeojson("trees", opts.treesPmtilesUrl),
          "street-lights": { type: "geojson", data: emptyFeatureCollection() },
          "street-lights-vector": vectorSourceOrGeojson("street_lights", opts.streetLightsPmtilesUrl),
          neighborhoods: { type: "geojson", data: emptyFeatureCollection() },
          "neighborhood-score-surface": vectorSourceOrGeojson(
            "neighborhood_surface",
            opts.neighborhoodSurfacePmtilesUrl
          ),
          "neighborhood-labels": { type: "geojson", data: emptyFeatureCollection() },
        },
        layers: [
          { id: "osm", type: "raster", source: "osm" },
        ].concat(
          createRoadPaintLayers(),
          [
            {
              id: "parks-fill",
              type: "fill",
              source: "parks",
              paint: {
                "fill-color": "rgba(204, 251, 241, 0)",
                "fill-opacity": 0.5,
                "fill-outline-color": "rgba(15, 118, 110, 0.16)",
              },
              layout: { visibility: "visible" },
            },
            opts.buildingsFillLayer,
          ],
          selectedLayer,
          createRoadLabelLayers(),
          [
          {
            id: "radius-circle-fill",
            type: "fill",
            source: "radius-circle",
            paint: {
              "fill-color": "#3b82f6",
              "fill-opacity": 0.15,
            },
          },
          {
            id: "radius-circle-line",
            type: "line",
            source: "radius-circle",
            paint: {
              "line-color": "#3b82f6",
              "line-width": 2,
              "line-dasharray": [4, 2],
            },
          },
          {
            id: "selected-building-outline",
            type: "line",
            source: "selected-building",
            paint: {
              "line-color": "#3b82f6",
              "line-width": 3,
            },
          },
          ]
        ),
      },
      center: opts.center || [34.794, 31.252],
      zoom: opts.zoom || 14,
    });

    map.addControl(new maplibreglRef.NavigationControl(), "top-right");
    return map;
  }

  window.Urban95MapShell = {
    createBaseMap: createBaseMap,
  };
})();
