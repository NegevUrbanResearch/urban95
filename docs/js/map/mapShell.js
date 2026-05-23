(function () {
  function emptyFeatureCollection() {
    return { type: "FeatureCollection", features: [] };
  }

  function createBaseMap(options) {
    var opts = options || {};
    var maplibreglRef = opts.maplibregl;
    if (!maplibreglRef || typeof maplibreglRef.Map !== "function") {
      throw new Error("maplibregl.Map is required before mapShell.js creates the map");
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
        },
        layers: [
          { id: "osm", type: "raster", source: "osm" },
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
        ].concat(selectedLayer, [
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
        ]),
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
