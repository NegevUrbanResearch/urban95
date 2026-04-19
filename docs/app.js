/* global maplibregl, turf, deck */

const BASE = "./data";
const ICONS_BASE = "./icons";
const BUILDINGS_URL = BASE + "/buildings_accessibility.geojson";
const PARKS_URL = BASE + "/parks.geojson";
const TREES_URL = BASE + "/trees.geojson";
const STREET_LIGHTS_URL = BASE + "/street_lights.geojson";
const AMENITIES_CLEAN_URL = BASE + "/amenities_new.geojson";
const AMENITIES_LEGACY_URL = BASE + "/amenities_all.geojson";
const ISOCHRONES_URL = BASE + "/isochrones.geojson";
const NEIGHBORHOODS_URL = BASE + "/neighborhoods.geojson";
const NEIGHBORHOOD_SURFACE_URL = BASE + "/neighborhood_surface.geojson";
const NEIGHBORHOOD_CHARTS_URL = BASE + "/neighborhood_charts.json";
const CITYWIDE_STATS_URL = BASE + "/citywide_stats.json";

const EXCLUDED_CLEAN_POINT_AMENITY_TYPES = new Set(["bicycle_track"]);

function filterCleanManifestPointFeatures(fc) {
  if (!fc || !Array.isArray(fc.features)) return fc;
  return {
    type: "FeatureCollection",
    features: fc.features.filter(function (f) {
      const t = (f.properties && f.properties.amenity_type) || "";
      return !EXCLUDED_CLEAN_POINT_AMENITY_TYPES.has(t);
    }),
  };
}

const AMENITY_TYPE_CONFIG = {
  trees: { color: "#2E7D32", icon: "park-alt1", label: "Trees" },
  healthcare: { color: "#C62828", icon: "hospital", label: "Healthcare" },
  education: { color: "#8E24AA", icon: "school", label: "Education" },
  commercial: { color: "#EF6C00", icon: "shop", label: "Commercial" },
  services: { color: "#00897B", icon: "town-hall", label: "Services" },
  religious_institutions: { color: "#AD1457", icon: "place-of-worship", label: "Religious" },
  parks_and_recreation: { color: "#7CB342", icon: "restaurant", label: "Recreation" },
  public_institutions: { color: "#8D6E63", icon: "building", label: "Public" },
  fitness: { color: "#D81B60", icon: "fitness-centre", label: "Fitness" },
  transportation: { color: "#F9A825", icon: "bus", label: "Transport" },
  financial_services: { color: "#3949AB", icon: "bank", label: "Financial" },
  tourism: { color: "#00ACC1", icon: "lodging", label: "Tourism" },
  senior_services_and_living: { color: "#FF7043", icon: "home", label: "Senior" },
  health: { color: "#C62828", icon: "marker", label: "Healthcare" },
  businesscenters: { color: "#1d4ed8", icon: "marker", label: "Business Centers" },
  "community-centers": { color: "#7e22ce", icon: "marker", label: "Community Centers" },
  playgrounds: { color: "#ea580c", icon: "marker", label: "Playgrounds" },
  shelters: { color: "#0f766e", icon: "marker", label: "Shelters" },
  "street-lights": { color: "#EAB308", icon: "marker", label: "Street Lights" }
};

const DEFAULT_CONFIG = { color: "#6b7280", icon: "marker", label: "Other" };

function getAmenityConfig(type) {
  if (!type) return DEFAULT_CONFIG;
  const config = AMENITY_TYPE_CONFIG[type.toLowerCase()];
  return config || DEFAULT_CONFIG;
}

function amenityTypeToBuildingStatKey(type) {
  if (type === "health") return "healthcare";
  return type;
}

const CLEAN_WEIGHTS = {
  trees: 4.0,
  parks: 15.0,
  playgrounds: 15.0,
  "street-lights": 3.75,
  bus_stops: 7.5,
  shelters: 10.0,
  education: 7.5,
  "community-centers": 5.0,
  businesscenters: 5.0,
  health: 7.5,
};

const CLEAN_SCORE_COMPONENTS = [
  { key: "trees", label: "Trees", shortTag: "trees in range" },
  { key: "parks", label: "Parks", shortTag: "park polygons intersecting the walk area" },
  { key: "playgrounds", label: "Playgrounds", shortTag: "playground POIs" },
  { key: "health", label: "Health", shortTag: "health POIs" },
  { key: "education", label: "Education", shortTag: "education POIs" },
  { key: "bus_stops", label: "Bus stops", shortTag: "transit stop POIs" },
  { key: "shelters", label: "Shelters", shortTag: "shelter POIs" },
  { key: "community-centers", label: "Community centers", shortTag: "community-center POIs" },
  { key: "businesscenters", label: "Business hubs", shortTag: "business-hub POIs" },
  { key: "street-lights", label: "Street lights", shortTag: "street-light points" },
];

const WEIGHTED_CATEGORY_COMPONENTS = [
  { stem: "environmental_quality", label: "Environmental Quality", weight: 0.2 },
  { stem: "nature", label: "Nature", weight: 0.15 },
  { stem: "play", label: "Play", weight: 0.15 },
  { stem: "safety_mobility", label: "Safety & Mobility", weight: 0.25 },
  { stem: "family_services", label: "Family Services", weight: 0.25 },
];

const WEIGHTED_SUBCATEGORY_COMPONENTS = {
  environmental_quality: [
    { stem: "shade", label: "Shade", weight: 0.4 },
    { stem: "trees", label: "Trees", weight: 0.2 },
    { stem: "roads", label: "Distance from fast roads", weight: 0.4 },
  ],
  nature: [
    { stem: "parks", label: "Parks", weight: 1.0 },
  ],
  play: [
    { stem: "playgrounds", label: "Playgrounds", weight: 1.0 },
  ],
  safety_mobility: [
    { stem: "street_lights", label: "Street lights", weight: 0.15 },
    { stem: "bicycle_access", label: "Bicycle access", weight: 0.15 },
    { stem: "bus_stops", label: "Bus stops", weight: 0.3 },
    { stem: "shelters", label: "Shelters", weight: 0.4 },
  ],
  family_services: [
    { stem: "education", label: "Education", weight: 0.3 },
    { stem: "community", label: "Community centers", weight: 0.2 },
    { stem: "business", label: "Business centers", weight: 0.2 },
    { stem: "health", label: "Health", weight: 0.3 },
  ],
};

const WEIGHTED_CATEGORY_LABEL_BY_STEM = WEIGHTED_CATEGORY_COMPONENTS.reduce(function (acc, comp) {
  acc[comp.stem] = comp.label;
  return acc;
}, {});

function cleanPtsPropertyName(weightKey, minutes) {
  return "clean_pts_" + String(weightKey).replace(/-/g, "_") + "_" + minutes + "min";
}

function hasCleanPtsBreakdown(props, minutes) {
  if (!props) return false;
  const k = cleanPtsPropertyName("trees", minutes);
  return Object.prototype.hasOwnProperty.call(props, k);
}

function buildFilteredFormulaLine(useAll) {
  if (!useAll) {
    return "Partial score (default manifest) = sum of manifest point contributions for each category you selected (from precomputed clean_pts_* columns when available).";
  }
  const terms = CLEAN_SCORE_COMPONENTS.map(function (c) {
    const w = CLEAN_WEIGHTS[c.key];
    return w + " × (" + c.shortTag + ")";
  });
  return (
    "Default score = " +
    terms.join(" + ")
  );
}

function filterTypeToCleanCountStem(filterType) {
  if (filterType === "trees") return "trees";
  if (filterType === "street-lights") return "street_lights";
  let s = String(filterType || "").toLowerCase().trim().replace(/\s+/g, "_").replace(/-/g, "_");
  if (s === "healthcare") s = "health";
  return s;
}

function cleanCountStemToWeightKey(stem) {
  if (stem === "street_lights") return "street-lights";
  if (stem === "community_centers") return "community-centers";
  if (stem === "bus_stops") return "bus_stops";
  if (CLEAN_WEIGHTS[stem] !== undefined) return stem;
  return null;
}

function filterTypeToCleanWeightKey(type) {
  if (type === "trees") return "trees";
  if (type === "street-lights") return "street-lights";
  const stem = filterTypeToCleanCountStem(type);
  return cleanCountStemToWeightKey(stem);
}

function getBuildingCleanFilteredScore(props, minutes) {
  const p = props || {};
  const sfx = "_" + minutes + "min";
  if (allFilterTypes.length === 0 || selectedAmenityTypes.size === 0) return 0;
  if (selectedAmenityTypes.size === allFilterTypes.length) {
    return Number(p["score_clean" + sfx]) || 0;
  }
  if (hasCleanPtsBreakdown(p, minutes)) {
    let total = 0;
    selectedAmenityTypes.forEach(function (type) {
      const wk = filterTypeToCleanWeightKey(type);
      if (!wk) return;
      const col = cleanPtsPropertyName(wk, minutes);
      const v = Number(p[col]);
      if (Number.isFinite(v)) total += v;
    });
    return total;
  }
  let total = 0;
  selectedAmenityTypes.forEach((type) => {
    const stem = filterTypeToCleanCountStem(type);
    const col = "clean_" + stem + "_" + minutes + "min";
    const cnt = Number(p[col]);
    if (!Number.isFinite(cnt)) return;
    const wk = cleanCountStemToWeightKey(stem);
    const w = wk != null ? CLEAN_WEIGHTS[wk] : 0;
    total += w * cnt;
  });
  return total;
}

function getExpandedContributionForType(props, minutes, type) {
  const p = props || {};
  const sfx = "_" + minutes + "min";
  if (type === "trees") {
    return (Number(p["num_trees" + sfx]) || 0) * 0.25;
  }
  if (type === "street-lights") {
    return (Number(p["num_street_lights" + sfx]) || 0) * 0.25;
  }
  const statKey = amenityTypeToBuildingStatKey(type);
  return Number(p["amen_" + statKey + sfx]) || 0;
}

function getFilteredContributionForType(props, minutes, type) {
  const p = props || {};
  const sfx = "_" + minutes + "min";
  const wk = filterTypeToCleanWeightKey(type);
  if (wk && hasCleanPtsBreakdown(p, minutes)) {
    const col = cleanPtsPropertyName(wk, minutes);
    const pts = Number(p[col]);
    if (Number.isFinite(pts)) return pts;
  }
  if (type === "trees") {
    return CLEAN_WEIGHTS.trees * (Number(p["num_trees" + sfx]) || 0);
  }
  if (type === "street-lights") {
    const col = "clean_street_lights_" + minutes + "min";
    const fromClean = Number(p[col]);
    if (Number.isFinite(fromClean)) {
      return CLEAN_WEIGHTS["street-lights"] * fromClean;
    }
    return CLEAN_WEIGHTS["street-lights"] * (Number(p["num_street_lights" + sfx]) || 0);
  }
  const stem = filterTypeToCleanCountStem(type);
  const col = "clean_" + stem + "_" + minutes + "min";
  const cnt = Number(p[col]);
  if (Number.isFinite(cnt)) {
    const wk2 = cleanCountStemToWeightKey(stem);
    const w = wk2 != null ? CLEAN_WEIGHTS[wk2] : 0;
    return w * cnt;
  }
  return 0;
}

function fillExplainSeries(series, feats, minutes) {
  const explain = {};
  const explainAmenity = {};
  const sfx = "_" + minutes + "min";
  const useAll = selectedAmenityTypes.size === allFilterTypes.length;

  const pushMetric = function (id, fn) {
    const arr = [];
    feats.forEach(function (f) {
      arr.push(fn(f.properties || {}));
    });
    explain[id] = arr;
  };

  if (scoreMode === "weighted") {
    series.explain = explain;
    series.explainAmenity = explainAmenity;
    return;
  }

  if (scoreMode === "clean") {
    if (useAll) {
      const sample = feats.length > 0 ? feats[0].properties || {} : {};
      if (hasCleanPtsBreakdown(sample, minutes)) {
        CLEAN_SCORE_COMPONENTS.forEach(function (c) {
          const col = cleanPtsPropertyName(c.key, minutes);
          const mid = "flt_pts_" + c.key.replace(/-/g, "_");
          pushMetric(mid, function (p) {
            return Number(p[col]) || 0;
          });
        });
      } else {
        pushMetric("flt_tree_w", function (p) {
          return CLEAN_WEIGHTS.trees * (Number(p["num_trees" + sfx]) || 0);
        });
        pushMetric("flt_rest", function (p) {
          const sc = Number(p["score_clean" + sfx]) || 0;
          const tw = CLEAN_WEIGHTS.trees * (Number(p["num_trees" + sfx]) || 0);
          return sc - tw;
        });
      }
    } else {
      selectedAmenityTypes.forEach(function (type) {
        const id = "flt_sel_" + type;
        pushMetric(id, function (p) {
          return getFilteredContributionForType(p, minutes, type);
        });
      });
    }
  } else {
    if (useAll) {
      pushMetric("exp_amen", function (p) {
        return Number(p["num_amenities" + sfx]) || 0;
      });
      pushMetric("exp_tree_w", function (p) {
        return (Number(p["num_trees" + sfx]) || 0) * 0.25;
      });
      pushMetric("exp_sl_w", function (p) {
        return (Number(p["num_street_lights" + sfx]) || 0) * 0.25;
      });
      const amenTypes = allFilterTypes.filter(function (t) {
        return t !== "trees" && t !== "street-lights";
      });
      amenTypes.forEach(function (t) {
        const statKey = amenityTypeToBuildingStatKey(t);
        const id = "exp_amen_" + statKey;
        explainAmenity[id] = [];
      });
      feats.forEach(function (f) {
        const p = f.properties || {};
        amenTypes.forEach(function (t) {
          const statKey = amenityTypeToBuildingStatKey(t);
          const id = "exp_amen_" + statKey;
          explainAmenity[id].push(Number(p["amen_" + statKey + sfx]) || 0);
        });
      });
    } else {
      selectedAmenityTypes.forEach(function (type) {
        const id = "exp_sel_" + type;
        pushMetric(id, function (p) {
          return getExpandedContributionForType(p, minutes, type);
        });
      });
    }
  }

  series.explain = explain;
  series.explainAmenity = explainAmenity;
}

// Calculate appropriate zoom level to fit a GeoJSON polygon in the viewport
function getZoomForPolygon(polygon) {
  const bbox = turf.bbox(polygon);
  const sw = [bbox[0], bbox[1]];
  const ne = [bbox[2], bbox[3]];
  const dLng = ne[0] - sw[0];
  const dLat = ne[1] - sw[1];
  const maxSpan = Math.max(dLng, dLat);
  if (maxSpan <= 0) return 15;
  // Rough degrees-to-zoom: at zoom 15, ~0.01 deg is visible in viewport
  const zoom = Math.log2(0.01 / maxSpan) + 15;
  return Math.min(Math.max(zoom, 12), 18);
}

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      osm: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap © CARTO",
      },
      buildings: { type: "geojson", data: BUILDINGS_URL },
      parks: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      "radius-circle": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      "selected-building": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      amenities: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
      trees: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
      "street-lights": {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
      neighborhoods: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
      "neighborhood-score-surface": {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
    },
    layers: [
      { id: "osm", type: "raster", source: "osm" },
      {
        id: "parks-fill",
        type: "fill",
        source: "parks",
        paint: { 
          "fill-color": "#22c55e", 
          "fill-opacity": 0.3, 
          "fill-outline-color": "#16a34a" 
        },
        layout: { visibility: "visible" },
      },
      {
        id: "buildings-fill",
        type: "fill",
        source: "buildings",
        paint: {
          "fill-color": "#ef4444",
          "fill-opacity": 0.85,
          "fill-outline-color": "#d4d4d8",
        },
      },
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
    ],
  },
  center: [34.794, 31.252],
  zoom: 14,
});

map.addControl(new maplibregl.NavigationControl(), "top-right");

const filterBtn = document.getElementById("filter-btn");
const filterPopup = document.getElementById("filter-popup");
const filterLabel = document.getElementById("filter-label");
const filterItems = document.getElementById("filter-items");
const filterBackdrop = document.getElementById("filter-backdrop");
const amenityFilterSection = document.getElementById("amenity-filter-section");
const radiusSection = document.getElementById("radius-section");
const legendLabels = document.getElementById("legend-labels");

const SYM_PCT_KEY = "_u95_symb_pct";
const tooltip = document.getElementById("tooltip");
const radiusToggle = document.getElementById("radius-toggle");
const showPointsToggle = document.getElementById("show-points-toggle");

const AMENITY_POINT_LAYER_IDS = [
  "tree-icons",
  "street-light-icons",
];

const AMENITY_CLUSTER_MIN_ZOOM = 13;
const AMENITY_CLUSTER_PIXEL_RADIUS = 36;
const AMENITY_CLUSTER_DISSOLVE_ZOOM = 16;
const AMENITY_CLUSTER_MAX_COUNT = 50;
const URBAN95_DETAIL_POINTS_MIN_ZOOM = 15;

// Check if we're on a touch device
const isTouchDevice = window.matchMedia("(hover: none) and (pointer: coarse)").matches || 
                      window.matchMedia("(max-width: 480px)").matches;

let walkMinutes = 5;
let allAmenityTypes = [];
let typesWithData = new Set();
let allAmenitiesData = null;
let allAmenitiesDataClean = null;
let allAmenitiesDataLegacy = null;
let allAmenityTypesClean = [];
let allAmenityTypesLegacy = [];
let typesWithDataClean = new Set();
let typesWithDataLegacy = new Set();
let allTreesData = null;
let allStreetLightsData = null;
let buildingsData = null;
let buildingCentroids = [];
let selectedAmenityTypes = new Set();
let lastFilterRadioSelection = "all";
let allFilterTypes = [];
let selectedBuildingCentroid = null;
let amenitiesInRadiusIds = new Set();
let treesInRadiusIds = new Set();
let streetLightsInRadiusIds = new Set();
let iconsLoaded = false;
let treesLoadStarted = false;
let streetLightsLoadStarted = false;
let isochroneLoadStarted = false;
let isochronesLoaded = false;
let isochroneIndex = {};
let visibleAmenityFeatures = [];
let deckAmenityOverlay = null;
let scoreMode = "weighted";
let _deckUpdateTimer = null;
let _deckHovering = false;
let _lastDeckClickTime = 0;
let latestRadiusCounts = {};
const percentileSeriesCache = new Map();
const URBAN95_FIXED_MINUTES = 10;

function getScoreModeLabel(mode) {
  const m = mode || scoreMode;
  if (m === "weighted") return "Urban95";
  return "Amenities focus";
}

function forceAllAmenityTypesSelected() {
  selectedAmenityTypes.clear();
  allFilterTypes.forEach(function (type) {
    selectedAmenityTypes.add(type);
  });
}

function syncFilterUiForScoreMode() {
  const isUrban95 = scoreMode === "weighted";
  if (amenityFilterSection) {
    amenityFilterSection.style.display = isUrban95 ? "none" : "";
  }
  if (radiusSection) {
    radiusSection.style.display = isUrban95 ? "none" : "";
  }
  if (filterBtn) {
    filterBtn.disabled = isUrban95;
    filterBtn.setAttribute("aria-disabled", isUrban95 ? "true" : "false");
  }
  if (isUrban95) {
    closeFilterPopup();
    forceAllAmenityTypesSelected();
  }
}

function getNeighborhoodAverageKey(sfx) {
  if (scoreMode === "weighted") return "avg_score_weighted_" + URBAN95_FIXED_MINUTES + "min";
  return "avg_overall" + sfx;
}

function getNeighborhoodPercentileKey(sfx) {
  if (scoreMode === "weighted") return "pct_weighted_overall_" + URBAN95_FIXED_MINUTES + "min";
  return "pct_overall" + sfx;
}

function getScoreMinutes() {
  if (scoreMode === "weighted") return URBAN95_FIXED_MINUTES;
  return walkMinutes;
}

function normalizeSurfaceFilterKey(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^0-9a-z]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "other";
}

function getNeighborhoodSurfaceScorePropertyKey() {
  if (scoreMode === "weighted") return "score_weighted";
  const sfx = "_" + getScoreMinutes() + "min";
  if (scoreMode === "expanded") {
    if (selectedAmenityTypes.size === allFilterTypes.length) {
      return "score_expanded" + sfx;
    }
    if (selectedAmenityTypes.size === 1) {
      const selectedType = Array.from(selectedAmenityTypes)[0] || "";
      const scenarioType = selectedType === "health" ? "healthcare" : selectedType;
      return "score_filter_" + normalizeSurfaceFilterKey(scenarioType) + sfx;
    }
  }
  return null;
}

function getNeighborhoodSurfaceColorExpression(scoreProperty) {
  const scoreKey = scoreProperty || "score";
  return [
    "case",
    ["==", ["to-number", ["get", "has_buildings"], 0], 0],
    "#9ca3af",
    [
      "interpolate",
      ["linear"],
      ["to-number", ["get", scoreKey], 0],
      0, "#ef4444",
      25, "#f97316",
      50, "#eab308",
      75, "#84cc16",
      100, "#22c55e",
    ],
  ];
}

// Analysis mode state
let currentMode = "house"; // "house" | "neighborhood" | "citywide"
let neighborhoodsData = null;
let neighborhoodSurfaceData = null;
let neighborhoodChartsPayload = null;
let citywideStats = null;
let selectedNeighborhood = null;
let citywideCharts = [];
let neighborhoodCharts = [];

// Loading screen elements
const loadingScreen = document.getElementById("loading-screen");
const loadingStatus = document.querySelector(".loading-status");
const loadingProgressBar = document.querySelector(".loading-progress-bar");

// Track loading progress
const loadingState = {
  icons: false,
  buildings: false,
  parks: false,
  trees: false,
  amenities: false,
  isochrones: scoreMode === "weighted",
  mapReady: false
};

function updateLoadingProgress() {
  const items = Object.values(loadingState);
  const loaded = items.filter(Boolean).length;
  const total = items.length;
  const percent = Math.round((loaded / total) * 100);
  
  if (loadingProgressBar) {
    loadingProgressBar.style.width = percent + "%";
  }
  
  // Check if everything is loaded
  if (loaded === total) {
    hideLoadingScreen();
  }
}

function setLoadingStatus(message) {
  if (loadingStatus) {
    loadingStatus.textContent = message;
  }
}

function hideLoadingScreen() {
  if (loadingScreen && !loadingScreen.classList.contains("hidden")) {
    setTimeout(() => {
      loadingScreen.classList.add("hidden");
    }, 300);
  }
}

// Fallback: hide loading screen after 60 seconds regardless
setTimeout(() => {
  if (loadingScreen && !loadingScreen.classList.contains("hidden")) {
    console.warn("Loading timeout - forcing hide");
    hideLoadingScreen();
  }
}, 60000);

// Load all amenity icons into the map
async function loadAmenityIcons() {
  const iconNames = new Set();
  Object.values(AMENITY_TYPE_CONFIG).forEach(config => iconNames.add(config.icon));
  iconNames.add(DEFAULT_CONFIG.icon);
  
  const loadPromises = Array.from(iconNames).map(iconName => {
    return new Promise((resolve) => {
      // Try loading via fetch first (more reliable on mobile)
      fetch(`${ICONS_BASE}/${iconName}.svg`)
        .then(response => {
          if (!response.ok) throw new Error('Network response was not ok');
          return response.text();
        })
        .then(svgText => {
          // Create image from SVG blob for better mobile compatibility
          const blob = new Blob([svgText], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            if (!map.hasImage(iconName)) {
              map.addImage(iconName, img, { sdf: true });
            }
            URL.revokeObjectURL(url);
            resolve();
          };
          img.onerror = () => {
            console.warn(`Failed to create image for icon: ${iconName}`);
            URL.revokeObjectURL(url);
            resolve();
          };
          img.src = url;
        })
        .catch(() => {
          // Fallback: try direct image loading
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            if (!map.hasImage(iconName)) {
              map.addImage(iconName, img, { sdf: true });
            }
            resolve();
          };
          img.onerror = () => {
            console.warn(`Failed to load icon: ${iconName}`);
            resolve();
          };
          img.src = `${ICONS_BASE}/${iconName}.svg`;
        });
    });
  });
  
  await Promise.all(loadPromises);
  iconsLoaded = true;
}

// Lazy load trees when zoomed in (trees only visible at zoom 14+)
function loadTreesIfNeeded() {
  if (treesLoadStarted || allTreesData) return;
  treesLoadStarted = true;
  
  fetch(TREES_URL)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (treesData) {
      if (!treesData) throw new Error("Empty tree data");
      allTreesData = treesData;
      
      const types = allAmenityTypes.slice();
      buildFilterItems(types);
      updateAmenitiesSource();
      updateTreesSource();
      updateStreetLightsSource();
      updateBuildingColors();

      if (selectedBuildingCentroid) {
        selectBuilding(selectedBuildingCentroid, false);
      }
      loadStreetLightsIfNeeded();
    })
    .catch(function (err) {
      console.error("Failed to load trees:", err);
      treesLoadStarted = false;
    });
}

function loadStreetLightsIfNeeded() {
  if (streetLightsLoadStarted || allStreetLightsData) return;
  streetLightsLoadStarted = true;

  fetch(STREET_LIGHTS_URL)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      if (!data) throw new Error("Empty street light data");
      allStreetLightsData = data;

      const types = allAmenityTypes.slice();
      buildFilterItems(types);
      updateAmenitiesSource();
      updateTreesSource();
      updateStreetLightsSource();
      updateBuildingColors();

      if (selectedBuildingCentroid) {
        selectBuilding(selectedBuildingCentroid, false);
      }
    })
    .catch(function (err) {
      console.error("Failed to load street lights:", err);
      streetLightsLoadStarted = false;
    });
}

function warnIfBuildingScoresIncomplete(fc) {
  if (!fc || !fc.features || fc.features.length === 0) return;
  const p = fc.features[0].properties || {};
  const keys = Object.keys(p);
  const hasStreet = keys.some(k => k.indexOf("num_street_lights_") === 0);
  const hasExpanded = keys.some(k => k.indexOf("score_expanded_") === 0);
  const hasWeighted = keys.some(k => k.indexOf("score_weighted_") === 0);
  const hasWeightedSubscores = keys.some(k => k.indexOf("score_weighted_sub_") === 0);
  if (!hasStreet || !hasExpanded) {
    console.warn(
      "[urban95] buildings_accessibility.geojson is missing num_street_lights_* or score_expanded_*. Legacy expanded scores and street-light percentiles need a fresh preprocess run."
    );
  }
  if (!hasWeighted) {
    console.warn(
      "[urban95] buildings_accessibility.geojson has no score_weighted_* properties. Urban95 mode needs a fresh preprocess run."
    );
  }
  if (!hasWeightedSubscores) {
    console.warn(
      "[urban95] buildings_accessibility.geojson has no score_weighted_sub_* properties. Urban95 explain details will be partial until you regenerate outputs with src/preprocess_accessibility.py."
    );
  }
}

function scanAmenityTypesFromFeatures(fc) {
  const typeCounts = {};
  (fc.features || []).forEach(function (f) {
    const t = (f.properties && f.properties.amenity_type) || "";
    if (t) {
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
  });
  const types = Object.keys(typeCounts).sort();
  const tw = new Set();
  types.forEach(function (t) {
    if (typeCounts[t] > 0) {
      tw.add(t);
    }
  });
  return { types, tw };
}

function applyScoreModeAmenities() {
  const useLegacy = scoreMode === "expanded" && allAmenitiesDataLegacy && (allAmenitiesDataLegacy.features || []).length > 0;
  if (scoreMode === "expanded" && !useLegacy) {
    console.warn("amenities_all.geojson missing or empty; Amenities focus mode may be incomplete.");
  }
  if (useLegacy) {
    allAmenitiesData = allAmenitiesDataLegacy;
    allAmenityTypes = allAmenityTypesLegacy.slice();
    typesWithData = new Set(typesWithDataLegacy);
  } else {
    allAmenitiesData = allAmenitiesDataClean;
    allAmenityTypes = allAmenityTypesClean.slice();
    typesWithData = new Set(typesWithDataClean);
  }
  amenitiesInRadiusIds.clear();
  buildFilterItems(allAmenityTypes);
  syncFilterUiForScoreMode();
  updateAmenitiesSource();
  updateTreesSource();
  updateStreetLightsSource();
  updateBuildingColors();
  if (selectedBuildingCentroid) {
    selectBuilding(selectedBuildingCentroid, false);
  }
}

// Update amenities source (without trees)
function updateAmenitiesSource() {
  if (!allAmenitiesData) return;
  
  const source = map.getSource("amenities");
  if (!source) return;
  
  if (selectedAmenityTypes.size === 0) {
    source.setData({ type: "FeatureCollection", features: [] });
    visibleAmenityFeatures = [];
    updateDeckAmenityLayers();
    return;
  }
  
  const useAll = selectedAmenityTypes.size === allFilterTypes.length;
  const showAmenities = useAll || Array.from(selectedAmenityTypes).some(t => t !== "trees" && t !== "street-lights");
  
  if (!showAmenities) {
    source.setData({ type: "FeatureCollection", features: [] });
    visibleAmenityFeatures = [];
    updateDeckAmenityLayers();
    return;
  }
  
  const updatedFeatures = [];
  
  allAmenitiesData.features.forEach((f, index) => {
    const type = f.properties.amenity_type;
    
    if (!useAll && !selectedAmenityTypes.has(type)) return;
    
    const inRadius = amenitiesInRadiusIds.has(index);
    const newProps = { ...f.properties, _inRadius: inRadius };
    updatedFeatures.push({ ...f, properties: newProps });
  });
  
  source.setData({ type: "FeatureCollection", features: updatedFeatures });
  visibleAmenityFeatures = updatedFeatures;
  updateDeckAmenityLayers();
}

function isFilterOnlyTrees() {
  return (
    allFilterTypes.length > 0 &&
    selectedAmenityTypes.size === 1 &&
    selectedAmenityTypes.has("trees")
  );
}

function isFilterOnlyStreetLights() {
  return (
    allFilterTypes.length > 0 &&
    selectedAmenityTypes.size === 1 &&
    selectedAmenityTypes.has("street-lights")
  );
}

// Update trees source — Urban95 shows all trees at detail zoom, Amenities focus keeps isochrone clipping
function updateTreesSource() {
  if (!allTreesData) return;

  const source = map.getSource("trees");
  if (!source) return;

  if (scoreMode === "weighted") {
    const zoom = map.getZoom();
    if (zoom >= URBAN95_DETAIL_POINTS_MIN_ZOOM) {
      source.setData(allTreesData);
    } else {
      source.setData({ type: "FeatureCollection", features: [] });
    }
    return;
  }

  if (selectedAmenityTypes.size === 0) {
    source.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  const useAll = selectedAmenityTypes.size === allFilterTypes.length;
  const showTrees = useAll || selectedAmenityTypes.has("trees");

  if (!showTrees) {
    source.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  if (isFilterOnlyTrees()) {
    source.setData(allTreesData);
    return;
  }

  if (treesInRadiusIds.size === 0) {
    source.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  const inRadiusFeatures = allTreesData.features.filter((_, index) => treesInRadiusIds.has(index));
  source.setData({ type: "FeatureCollection", features: inRadiusFeatures });
}

// Street lights: separate symbol layer (not part of amenity deck overlay)
function updateStreetLightsSource() {
  if (!allStreetLightsData) return;

  const source = map.getSource("street-lights");
  if (!source) return;

  if (scoreMode === "weighted") {
    const zoom = map.getZoom();
    if (zoom >= URBAN95_DETAIL_POINTS_MIN_ZOOM) {
      source.setData(allStreetLightsData);
    } else {
      source.setData({ type: "FeatureCollection", features: [] });
    }
    return;
  }

  if (selectedAmenityTypes.size === 0) {
    source.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  const useAll = selectedAmenityTypes.size === allFilterTypes.length;
  const showLights = useAll || selectedAmenityTypes.has("street-lights");

  if (!showLights) {
    source.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  if (isFilterOnlyStreetLights()) {
    source.setData(allStreetLightsData);
    return;
  }

  if (streetLightsInRadiusIds.size === 0) {
    source.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  const inRadiusFeatures = allStreetLightsData.features.filter((_, index) =>
    streetLightsInRadiusIds.has(index)
  );
  source.setData({ type: "FeatureCollection", features: inRadiusFeatures });
}


// Tree / street-light icons read from the trees and street-lights sources (isochrone-clipped unless filter-only Trees / Street lights)
function addAmenityLayers() {
  map.addLayer({
    id: "tree-icons",
    type: "symbol",
    source: "trees",
    layout: {
      "icon-image": "park-alt1",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 18, 1.2],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
    paint: {
      "icon-color": "#2E7D32",
      "icon-opacity": 0.9,
    },
  });

  const slCfg = AMENITY_TYPE_CONFIG["street-lights"];
  map.addLayer({
    id: "street-light-icons",
    type: "symbol",
    source: "street-lights",
    layout: {
      "icon-image": "marker",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.55, 18, 1.1],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
    paint: {
      "icon-color": slCfg.color,
      "icon-opacity": 0.95,
    },
  });
}

// Compute percentile-based breakpoints (p0, p25, p50, p75, p100) from a values array
function percentileBreakpoints(values) {
  if (!values || values.length === 0) return [0, 1, 2, 3, 5];
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;

  const bp = [0, 25, 50, 75, 100].map(p => {
    const idx = Math.min(Math.round(p / 100 * (n - 1)), n - 1);
    return sorted[idx];
  });

  for (let i = 1; i < bp.length; i++) {
    if (bp[i] <= bp[i - 1]) bp[i] = bp[i - 1] + 0.001;
  }
  return bp;
}

function collectBuildingScores() {
  if (!buildingsData || !buildingsData.features || buildingsData.features.length === 0) return [];
  if (selectedAmenityTypes.size === 0 || allFilterTypes.length === 0) return [];
  return buildingsData.features.map((f) => getBuildingOverallScore(f.properties || {}, walkMinutes));
}

// Interpolate the same red→green gradient used on the basemap
function getColorForValue(value, breakpoints) {
  const stops = [
    [239, 68, 68],   // #ef4444
    [249, 115, 22],  // #f97316
    [234, 179, 8],   // #eab308
    [132, 204, 22],  // #84cc16
    [34, 197, 94],   // #22c55e
  ];

  if (value <= breakpoints[0]) return `rgb(${stops[0].join(",")})`;
  if (value >= breakpoints[breakpoints.length - 1]) return `rgb(${stops[stops.length - 1].join(",")})`;

  for (let i = 0; i < breakpoints.length - 1; i++) {
    if (value <= breakpoints[i + 1]) {
      const t = (value - breakpoints[i]) / (breakpoints[i + 1] - breakpoints[i]);
      const r = Math.round(stops[i][0] + (stops[i + 1][0] - stops[i][0]) * t);
      const g = Math.round(stops[i][1] + (stops[i + 1][1] - stops[i][1]) * t);
      const b = Math.round(stops[i][2] + (stops[i + 1][2] - stops[i][2]) * t);
      return `rgb(${r},${g},${b})`;
    }
  }
  return `rgb(${stops[stops.length - 1].join(",")})`;
}

function updateAccessibilityLegendLabels() {
  if (!legendLabels) return;
  const labels = [0, 25, 50, 75, 100];
  legendLabels.innerHTML = labels.map((l) => `<span>${l}</span>`).join("");
}

function setAmenityPointsVisibility(visible) {
  const v = visible ? "visible" : "none";
  AMENITY_POINT_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", v);
    }
  });
  updateDeckAmenityLayers();
}


function describeTypeMix(typeCounts) {
  return Object.entries(typeCounts || {})
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type}:${count}`)
    .join("|");
}

// Draw a single amenity pie-chart icon at (x,y) on an existing canvas context
function drawAmenityIcon(ctx, x, y, typeCounts, inRadius, isCluster) {
  const ICON_SIZE = 64;
  const cx = x + ICON_SIZE / 2;
  const cy = y + ICON_SIZE / 2;
  const radius = isCluster ? 23 : 20;
  const ringWidth = isCluster ? 9 : 7;
  const borderColor = inRadius ? "#fbbf24" : "rgba(255, 255, 255, 0.94)";

  const entries = Object.entries(typeCounts || {}).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0) || 1;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, ICON_SIZE, ICON_SIZE);
  ctx.clip();

  ctx.shadowColor = "rgba(15, 23, 42, 0.3)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  if (entries.length <= 1) {
    const type = entries.length === 1 ? entries[0][0] : "other";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = getAmenityConfig(type).color;
    ctx.fill();
  } else {
    let startAngle = -Math.PI / 2;
    entries.forEach(([type, count]) => {
      const angle = (count / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, startAngle + angle);
      ctx.closePath();
      ctx.fillStyle = getAmenityConfig(type).color;
      ctx.fill();
      startAngle += angle;
    });
  }

  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = inRadius ? 4 : 3;
  ctx.strokeStyle = borderColor;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(4, radius - ringWidth), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  ctx.fill();

  ctx.restore();
}

function getAmenityIconKey(item) {
  const cappedCount = Math.min(item.count, AMENITY_CLUSTER_MAX_COUNT);
  const mixSignature = describeTypeMix(item.typeCounts);
  return `${mixSignature}|${item.inRadius ? 1 : 0}|${item.isCluster ? 1 : 0}|${cappedCount}`;
}

// Build a single texture atlas with all unique amenity icons for the current view.
// Returns { atlas: HTMLCanvasElement, mapping: Object } synchronously — no async
// image loading, so deck.gl can render immediately without race conditions.
function buildAmenityIconAtlas(clusteredAmenities) {
  const ICON_SIZE = 64;
  const uniqueIcons = new Map();

  for (const item of clusteredAmenities) {
    const key = getAmenityIconKey(item);
    item._iconKey = key;
    if (!uniqueIcons.has(key)) {
      uniqueIcons.set(key, { typeCounts: item.typeCounts, inRadius: item.inRadius, isCluster: item.isCluster });
    }
  }

  const iconCount = uniqueIcons.size;
  if (iconCount === 0) return { atlas: null, mapping: {} };

  const cols = Math.ceil(Math.sqrt(iconCount));
  const rows = Math.ceil(iconCount / cols);

  const atlas = document.createElement("canvas");
  atlas.width = cols * ICON_SIZE;
  atlas.height = rows * ICON_SIZE;
  const ctx = atlas.getContext("2d");
  if (!ctx) return { atlas: null, mapping: {} };

  const mapping = {};
  let i = 0;
  for (const [key, info] of uniqueIcons) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const px = col * ICON_SIZE;
    const py = row * ICON_SIZE;

    drawAmenityIcon(ctx, px, py, info.typeCounts, info.inRadius, info.isCluster);
    mapping[key] = { x: px, y: py, width: ICON_SIZE, height: ICON_SIZE, anchorX: ICON_SIZE / 2, anchorY: ICON_SIZE / 2 };
    i++;
  }

  return { atlas, mapping };
}

function clusterVisibleAmenities(features) {
  if (!features || features.length === 0) return [];
  const zoom = map.getZoom();
  const includeSingles = zoom >= AMENITY_CLUSTER_MIN_ZOOM;
  if (!includeSingles) return [];
  if (zoom >= AMENITY_CLUSTER_DISSOLVE_ZOOM) {
    return features.map((feature) => {
      const coordinates = feature.geometry && feature.geometry.coordinates;
      if (!coordinates || coordinates.length < 2) return null;
      const props = feature.properties || {};
      const amenityType = props.amenity_type || "other";
      const name = props.hebrew_nam || props.name || "";
      return {
        position: coordinates,
        count: 1,
        countLabel: "",
        amenityType,
        typeCounts: { [amenityType]: 1 },
        inRadius: Boolean(props._inRadius),
        isCluster: false,
        sampleNames: name ? [name] : [],
        members: [coordinates]
      };
    }).filter(Boolean);
  }

  const buckets = [];
  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const coordinates = feature.geometry && feature.geometry.coordinates;
    if (!coordinates || coordinates.length < 2) continue;

    const projected = map.project(coordinates);
    let bucket = null;
    for (let j = 0; j < buckets.length; j++) {
      const candidate = buckets[j];
      const dx = candidate.centerX - projected.x;
      const dy = candidate.centerY - projected.y;
      if ((dx * dx + dy * dy) <= (AMENITY_CLUSTER_PIXEL_RADIUS * AMENITY_CLUSTER_PIXEL_RADIUS)) {
        bucket = candidate;
        break;
      }
    }

    if (!bucket) {
      bucket = {
        centerX: projected.x,
        centerY: projected.y,
        count: 0,
        weightedLng: 0,
        weightedLat: 0,
        inRadiusCount: 0,
        typeCounts: {},
        names: [],
        members: []
      };
      buckets.push(bucket);
    }

    const props = feature.properties || {};
    const amenityType = props.amenity_type || "other";
    bucket.count += 1;
    bucket.weightedLng += coordinates[0];
    bucket.weightedLat += coordinates[1];
    bucket.typeCounts[amenityType] = (bucket.typeCounts[amenityType] || 0) + 1;
    if (props._inRadius) bucket.inRadiusCount += 1;

    const name = props.hebrew_nam || props.name || "";
    if (name && bucket.names.length < 3) {
      bucket.names.push(name);
    }
    bucket.members.push(coordinates);
  }

  return buckets.map((bucket) => {
    let dominantType = "other";
    let dominantCount = -1;
    Object.entries(bucket.typeCounts).forEach(([type, count]) => {
      if (count > dominantCount) {
        dominantType = type;
        dominantCount = count;
      }
    });

    const count = bucket.count;
    const isCluster = count > 1;
    const cappedCount = Math.min(count, AMENITY_CLUSTER_MAX_COUNT);
    const countLabel = count > AMENITY_CLUSTER_MAX_COUNT ? `${AMENITY_CLUSTER_MAX_COUNT}+` : String(cappedCount);

    return {
      position: [bucket.weightedLng / count, bucket.weightedLat / count],
      count,
      countLabel: isCluster ? countLabel : "",
      amenityType: dominantType,
      typeCounts: bucket.typeCounts,
      inRadius: bucket.inRadiusCount > 0,
      isCluster,
      sampleNames: bucket.names,
      members: bucket.members
    };
  });
}

function updateDeckAmenityLayers() {
  if (!deckAmenityOverlay) return;

  const showPoints = showPointsToggle ? showPointsToggle.checked : true;
  const shouldRender = showPoints && map.getZoom() >= AMENITY_CLUSTER_MIN_ZOOM;
  if (!shouldRender) {
    deckAmenityOverlay.setProps({ layers: [] });
    tooltip.style.display = "none";
    map.getCanvas().style.cursor = "";
    return;
  }

  const clusteredAmenities = clusterVisibleAmenities(visibleAmenityFeatures);
  const { atlas, mapping } = buildAmenityIconAtlas(clusteredAmenities);

  if (!atlas || Object.keys(mapping).length === 0) {
    deckAmenityOverlay.setProps({ layers: [] });
    return;
  }

  const iconLayer = new deck.IconLayer({
    id: "amenity-cluster-icons",
    data: clusteredAmenities,
    pickable: true,
    sizeUnits: "pixels",
    sizeScale: 1,
    iconAtlas: atlas,
    iconMapping: mapping,
    getPosition: d => d.position,
    getIcon: d => d._iconKey,
    getSize: d => {
      if (!d.isCluster) return d.inRadius ? 24 : 20;
      const size = 20 + Math.sqrt(Math.min(d.count, AMENITY_CLUSTER_MAX_COUNT)) * 4;
      return d.inRadius ? size + 3 : size;
    },
    onHover: ({ object, x, y }) => {
      if (!object) {
        _deckHovering = false;
        tooltip.style.display = "none";
        map.getCanvas().style.cursor = "";
        return;
      }

      _deckHovering = true;

      const typeLabel = getAmenityConfig(object.amenityType).label;
      const topTypes = Object.entries(object.typeCounts || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type, count]) => `${getAmenityConfig(type).label}: ${count}`);
      const lines = [];
      if (object.isCluster) {
        lines.push(`${object.countLabel} nearby amenities`);
        lines.push(`Main type: ${typeLabel}`);
        if (topTypes.length > 1) {
          lines.push(topTypes.join(" | "));
        }
      } else {
        lines.push(typeLabel);
      }
      if (object.sampleNames && object.sampleNames.length > 0) {
        lines.push(object.sampleNames[0]);
      }

      tooltip.textContent = lines.join("\n");
      tooltip.style.display = "block";
      tooltip.style.left = `${x + 12}px`;
      tooltip.style.top = `${y + 12}px`;
      map.getCanvas().style.cursor = "pointer";
    },
    onClick: ({ object }) => {
      if (!object) return;
      _lastDeckClickTime = Date.now();
      if (!object.isCluster) return;
      const members = Array.isArray(object.members) ? object.members : [];
      if (members.length === 0) return;

      let minLng = Infinity;
      let minLat = Infinity;
      let maxLng = -Infinity;
      let maxLat = -Infinity;
      members.forEach(([lng, lat]) => {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      });

      const zeroSpan = (maxLng - minLng) < 1e-6 && (maxLat - minLat) < 1e-6;
      if (zeroSpan) {
        map.easeTo({
          center: object.position,
          zoom: Math.max(AMENITY_CLUSTER_DISSOLVE_ZOOM + 1, map.getZoom() + 2),
          duration: 420
        });
        return;
      }

      map.once("moveend", () => {
        if (map.getZoom() < AMENITY_CLUSTER_DISSOLVE_ZOOM) {
          map.easeTo({
            center: object.position,
            zoom: AMENITY_CLUSTER_DISSOLVE_ZOOM,
            duration: 260
          });
        }
      });

      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
        padding: 80,
        maxZoom: 18,
        duration: 480
      });
    }
  });

  const textLayer = new deck.TextLayer({
    id: "amenity-cluster-counts",
    data: clusteredAmenities.filter(d => d.isCluster),
    pickable: false,
    getPosition: d => d.position,
    getText: d => d.countLabel,
    getSize: 12,
    sizeUnits: "pixels",
    getColor: [255, 255, 255, 245],
    getTextAnchor: "middle",
    getAlignmentBaseline: "center",
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: 700
  });

  deckAmenityOverlay.setProps({ layers: [iconLayer, textLayer] });
}

// Debounced version for map movement events to prevent rapid layer recreation
function scheduleDeckUpdate() {
  clearTimeout(_deckUpdateTimer);
  _deckUpdateTimer = setTimeout(updateDeckAmenityLayers, 80);
}

function initDeckAmenityOverlay() {
  if (deckAmenityOverlay || typeof deck === "undefined" || !deck.MapboxOverlay) return;
  deckAmenityOverlay = new deck.MapboxOverlay({ interleaved: true, layers: [] });
  map.addControl(deckAmenityOverlay);

  map.on("moveend", scheduleDeckUpdate);
  map.on("zoomend", scheduleDeckUpdate);
  map.on("resize", updateDeckAmenityLayers);
}

function updateBuildingColors() {
  if (!buildingsData || !buildingsData.features || buildingsData.features.length === 0) return;
  if (allFilterTypes.length === 0) return;

  const feats = buildingsData.features;
  const colorExpr = [
    "interpolate",
    ["linear"],
    ["to-number", ["get", SYM_PCT_KEY]],
    0, "#ef4444",
    25, "#f97316",
    50, "#eab308",
    75, "#84cc16",
    100, "#22c55e",
  ];

  if (selectedAmenityTypes.size === 0) {
    feats.forEach((f) => {
      const p = f.properties || {};
      p[SYM_PCT_KEY] = 0;
    });
  } else {
    const scores = collectBuildingScores();
    const ranks = scoreMode === "weighted" ? null : bulkPercentileRanks(scores);
    feats.forEach((f, i) => {
      const p = f.properties || {};
      if (scoreMode === "weighted") {
        const rawScore = scores[i];
        p[SYM_PCT_KEY] = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 0;
      } else {
        p[SYM_PCT_KEY] = ranks[i] != null ? ranks[i] : 0;
      }
    });
  }

  const buildingSrc = map.getSource("buildings");
  if (buildingSrc) buildingSrc.setData(buildingsData);

  if (map.getLayer("buildings-fill")) {
    map.setPaintProperty("buildings-fill", "fill-color", colorExpr);
  }
  updateAccessibilityLegendLabels();
}

function getBuildingOverallScore(props, minutes) {
  const suffix = "_" + (scoreMode === "weighted" ? URBAN95_FIXED_MINUTES : minutes) + "min";
  const p = props || {};
  if (scoreMode === "weighted") {
    const weighted = p["score_weighted" + suffix];
    if (weighted !== undefined && weighted !== null && weighted !== "") {
      return Number(weighted) || 0;
    }
    return Number(p.score_weighted) || 0;
  }
  if (scoreMode === "clean") {
    return getBuildingCleanFilteredScore(p, minutes);
  }
  if (selectedAmenityTypes.size === 0 || allFilterTypes.length === 0) {
    return 0;
  }
  const useAll = selectedAmenityTypes.size === allFilterTypes.length;
  if (useAll) {
    const exp = p["score_expanded" + suffix];
    if (exp !== undefined && exp !== null && exp !== "") {
      return Number(exp);
    }
    const amenities = Number(p["num_amenities" + suffix]) || 0;
    const trees = Number(p["num_trees" + suffix]) || 0;
    const streetLights = Number(p["num_street_lights" + suffix]) || 0;
    return amenities + trees * 0.25 + streetLights * 0.25;
  }
  let val = 0;
  selectedAmenityTypes.forEach((type) => {
    if (type === "trees") {
      val += (Number(p["num_trees" + suffix]) || 0) * 0.25;
    } else if (type === "street-lights") {
      val += (Number(p["num_street_lights" + suffix]) || 0) * 0.25;
    } else {
      const statKey = amenityTypeToBuildingStatKey(type);
      val += Number(p["amen_" + statKey + suffix]) || 0;
    }
  });
  return val;
}

function computePercentileRank(values, targetValue) {
  if (!values || values.length === 0) return null;
  let atOrBelow = 0;
  values.forEach((value) => {
    if (value <= targetValue) atOrBelow += 1;
  });
  return Math.round((atOrBelow / values.length) * 100);
}

function bulkPercentileRanks(scores) {
  const n = scores.length;
  if (n === 0) return [];
  const sorted = scores.slice().sort((a, b) => a - b);
  return scores.map((target) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= target) lo = mid + 1;
      else hi = mid;
    }
    return Math.round((lo / n) * 100);
  });
}

function getOrdinalSuffix(value) {
  const v = Math.abs(Number(value)) || 0;
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  const mod10 = v % 10;
  if (mod10 === 1) return "st";
  if (mod10 === 2) return "nd";
  if (mod10 === 3) return "rd";
  return "th";
}

function formatMetricNumber(value) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value - Math.round(value)) < 0.01) {
    return Math.round(value).toLocaleString();
  }
  return value.toFixed(1);
}

function weightedCategoryHighlightsFromSource(source, sfx) {
  return WEIGHTED_CATEGORY_COMPONENTS.map(function (comp) {
    const key = "avg_score_weighted_" + comp.stem + sfx;
    return {
      stem: comp.stem,
      label: comp.label,
      weight: comp.weight,
      score: Number((source && source[key]) || 0),
    };
  });
}

function weightedSubcategoryComparisonRows(neighborhoodProps, cityStats, sfx) {
  const rows = [];
  WEIGHTED_CATEGORY_COMPONENTS.forEach(function (cat) {
    const subs = WEIGHTED_SUBCATEGORY_COMPONENTS[cat.stem] || [];
    subs.forEach(function (sub) {
      const nKey = "avg_score_weighted_sub_" + cat.stem + "_" + sub.stem + sfx;
      const cKey = "avg_score_weighted_sub_" + cat.stem + "_" + sub.stem + sfx;
      rows.push({
        label: cat.label + " · " + sub.label,
        neighborhood: Number((neighborhoodProps && neighborhoodProps[nKey]) || 0),
        city: Number((cityStats && cityStats[cKey]) || 0),
      });
    });
  });
  return rows;
}

function weightedNeighborhoodRankingRows(stats, sfx) {
  const rows = ((stats && stats.neighborhood_ranking_weighted) || []).slice();
  rows.sort(function (a, b) {
    return (Number(b["avg_score_weighted" + sfx]) || 0) - (Number(a["avg_score_weighted" + sfx]) || 0);
  });
  return rows;
}

function getCitywideWeightedAverageScore(stats, sfx) {
  if (!stats) return 0;
  const direct = Number(stats["avg_score_weighted" + sfx]);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const rankingVals = ((stats.neighborhood_ranking_weighted || []).map(function (r) {
    return Number(r["avg_score_weighted" + sfx]);
  })).filter(function (v) {
    return Number.isFinite(v);
  });
  if (rankingVals.length > 0) {
    const mean = rankingVals.reduce(function (sum, v) { return sum + v; }, 0) / rankingVals.length;
    if (Number.isFinite(mean) && mean > 0) return mean;
  }

  const m = Number(String(sfx || "").replace(/[^0-9]/g, ""));
  if (Number.isFinite(m) && m > 0 && buildingsData && Array.isArray(buildingsData.features)) {
    const vals = buildingsData.features.map(function (f) {
      return getBuildingOverallScore((f && f.properties) || {}, m);
    }).filter(function (v) {
      return Number.isFinite(v);
    });
    if (vals.length > 0) {
      return vals.reduce(function (sum, v) { return sum + v; }, 0) / vals.length;
    }
  }
  return Number.isFinite(direct) ? direct : 0;
}

function renderWeightedSubcategoryComparisonList(container, rows) {
  if (!container) return;
  const ordered = (rows || []).slice().sort(function (a, b) {
    return b.neighborhood - a.neighborhood;
  });
  if (ordered.length === 0) {
    container.innerHTML = '<p class="score-explain-empty">Subcategory comparison data unavailable.</p>';
    return;
  }
  let html = '<div class="u95-compare-legend"><span class="u95-compare-legend-bar">Neighborhood</span><span class="u95-compare-legend-line">City avg</span></div>';
  html += '<div class="u95-compare-list">';
  ordered.forEach(function (row) {
    const n = Math.max(0, Math.min(100, Number(row.neighborhood) || 0));
    const c = Math.max(0, Math.min(100, Number(row.city) || 0));
    const color = n >= 70 ? "#22c55e" : n >= 40 ? "#eab308" : "#ef4444";
    html += '<div class="u95-compare-item">';
    html += `<div class="u95-compare-name">${escapeHtml(row.label)}</div>`;
    html += '<div class="u95-compare-bar-wrap">';
    html += `<div class="u95-compare-city-marker" style="left:${c}%"></div>`;
    html += `<div class="u95-compare-bar" style="width:${n}%;background:${color}"></div>`;
    html += '</div>';
    html += `<div class="u95-compare-score"><strong>${formatMetricNumber(n)}</strong><span>city avg ${formatMetricNumber(c)}</span></div>`;
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function getPercentileSeriesCacheKey(minutes) {
  const m = String(minutes);
  if (selectedAmenityTypes.size === 0 || allFilterTypes.length === 0) {
    return scoreMode + ":" + m + ":none";
  }
  if (selectedAmenityTypes.size === allFilterTypes.length) {
    return scoreMode + ":" + m + ":all";
  }
  return scoreMode + ":" + m + ":f:" + Array.from(selectedAmenityTypes).sort().join("|");
}

function getPercentileSeriesForMinutes(minutes) {
  const cacheKey = getPercentileSeriesCacheKey(minutes);
  if (percentileSeriesCache.has(cacheKey)) {
    return percentileSeriesCache.get(cacheKey);
  }

  if (!buildingsData || !Array.isArray(buildingsData.features)) {
    return null;
  }

  const overall = [];
  buildingsData.features.forEach((feature) => {
    overall.push(getBuildingOverallScore(feature.properties || {}, minutes));
  });

  const series = { overall };
  fillExplainSeries(series, buildingsData.features, minutes);
  percentileSeriesCache.set(cacheKey, series);
  return series;
}

function buildPercentileMetrics(buildingProps) {
  if (!buildingProps) return null;
  if (selectedAmenityTypes.size === 0) return null;
  const overallScore = getBuildingOverallScore(buildingProps, walkMinutes);
  if (scoreMode === "weighted") {
    return { overallPercentile: null, overallScore };
  }
  const series = getPercentileSeriesForMinutes(walkMinutes);
  if (!series || series.overall.length === 0) return null;
  const overallPercentile = computePercentileRank(series.overall, overallScore);
  return { overallPercentile, overallScore };
}

function percentileForSeries(arr, value) {
  if (!arr || arr.length === 0) return null;
  return computePercentileRank(arr, value);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function explainRankBarColor(pct) {
  if (pct == null) return "#94a3b8";
  if (pct >= 70) return "#22c55e";
  if (pct >= 40) return "#eab308";
  return "#ef4444";
}

function buildExplainScoreBreakdown(buildingProps) {
  const p = buildingProps || {};
  const m = walkMinutes;
  const sfx = "_" + m + "min";
  const useAll = selectedAmenityTypes.size === allFilterTypes.length;
  const overallScore = getBuildingOverallScore(p, m);
  const rows = [];
  const isWeighted = scoreMode === "weighted";
  const isClean = scoreMode === "clean";

  if (isWeighted) {
    const weightedCategories = [];
    WEIGHTED_CATEGORY_COMPONENTS.forEach(function (comp) {
      const col = "score_weighted_" + comp.stem + sfx;
      const v = Number(p[col]) || 0;
      const group = {
        stem: comp.stem,
        label: comp.label,
        weight: comp.weight,
        value: v,
        valueLabel: formatMetricNumber(v) + " / 100",
        subrows: [],
      };
      const subcomponents = WEIGHTED_SUBCATEGORY_COMPONENTS[comp.stem] || [];
      subcomponents.forEach(function (sub) {
        const subCol = "score_weighted_sub_" + comp.stem + "_" + sub.stem + sfx;
        const raw = p[subCol];
        const hasValue = raw !== undefined && raw !== null && raw !== "";
        const subVal = hasValue ? Number(raw) || 0 : null;
        group.subrows.push({
          label: sub.label,
          weight: sub.weight,
          totalWeight: sub.weight * comp.weight,
          valueLabel: subVal != null ? formatMetricNumber(subVal) + " / 100" : "Missing (re-run preprocess)",
        });
      });
      weightedCategories.push(group);
    });
    return {
      formulaLine:
        "Urban95 score = (0.20×Environmental Quality) + (0.15×Nature) + (0.15×Play) + (0.25×Safety & Mobility) + (0.25×Family Services).",
      overallScoreLabel: formatMetricNumber(overallScore),
      overallPercentile: null,
      rows: [],
      weightedCategories: weightedCategories,
    };
  }

  const series = getPercentileSeriesForMinutes(walkMinutes);
  if (!series || !series.explain || series.overall.length === 0) return null;
  const overallPct = percentileForSeries(series.overall, overallScore);

  if (isClean) {
    if (useAll) {
      rows.push({ sectionTitle: "Weighted components" });
      if (hasCleanPtsBreakdown(p, m)) {
        CLEAN_SCORE_COMPONENTS.forEach(function (c) {
          const col = cleanPtsPropertyName(c.key, m);
          const v = Number(p[col]) || 0;
          const w = CLEAN_WEIGHTS[c.key];
          const mid = "flt_pts_" + c.key.replace(/-/g, "_");
          const arr = series.explain[mid];
          rows.push({
            label: c.label,
            detail: w + " pts × (" + c.shortTag + ")",
            value: v,
            valueLabel: formatMetricNumber(v) + " pts",
            percentile: percentileForSeries(arr, v),
          });
        });
      } else {
        const treeW = CLEAN_WEIGHTS.trees * (Number(p["num_trees" + sfx]) || 0);
        const rest = (Number(p["score_clean" + sfx]) || 0) - treeW;
        rows.push({
          label: "Trees (weighted)",
          detail: "×" + CLEAN_WEIGHTS.trees + " per tree in range",
          value: treeW,
          valueLabel: formatMetricNumber(treeW) + " pts",
          percentile: percentileForSeries(series.explain.flt_tree_w, treeW),
        });
        rows.push({
          label: "Other manifest-weighted",
          detail: "Regenerate data with preprocess_accessibility.py for a per-category breakdown.",
          value: rest,
          valueLabel: formatMetricNumber(rest) + " pts",
          percentile: percentileForSeries(series.explain.flt_rest, rest),
        });
      }
    } else {
      rows.push({ sectionTitle: "Selected categories" });
      selectedAmenityTypes.forEach(function (type) {
        const id = "flt_sel_" + type;
        const arr = series.explain[id];
        const v = getFilteredContributionForType(p, m, type);
        const cfg = getAmenityConfig(type);
        let detail = "";
        const wk = filterTypeToCleanWeightKey(type);
        if (wk && hasCleanPtsBreakdown(p, m)) {
          const comp = CLEAN_SCORE_COMPONENTS.find(function (c) {
            return c.key === wk;
          });
          if (comp && CLEAN_WEIGHTS[wk] != null) {
            detail = CLEAN_WEIGHTS[wk] + " pts × (" + comp.shortTag + ")";
          }
        }
        rows.push({
          label: cfg.label,
          detail: detail,
          value: v,
          valueLabel: formatMetricNumber(v) + " pts",
          percentile: percentileForSeries(arr, v),
        });
      });
    }
  } else {
    if (useAll) {
      rows.push({ sectionTitle: "Main components" });
      const na = Number(p["num_amenities" + sfx]) || 0;
      const tw = (Number(p["num_trees" + sfx]) || 0) * 0.25;
      const sw = (Number(p["num_street_lights" + sfx]) || 0) * 0.25;
      rows.push({
        label: "Amenity POIs (count)",
        detail: "1 point per POI in range",
        value: na,
        valueLabel: formatMetricNumber(na),
        percentile: percentileForSeries(series.explain.exp_amen, na),
      });
      rows.push({
        label: "Trees (×¼)",
        detail: "",
        value: tw,
        valueLabel: formatMetricNumber(tw) + " pts",
        percentile: percentileForSeries(series.explain.exp_tree_w, tw),
      });
      rows.push({
        label: "Street lights (×¼)",
        detail: "",
        value: sw,
        valueLabel: formatMetricNumber(sw) + " pts",
        percentile: percentileForSeries(series.explain.exp_sl_w, sw),
      });

      const amenTypes = allFilterTypes.filter(function (t) {
        return t !== "trees" && t !== "street-lights";
      });
      const amenRows = [];
      amenTypes.forEach(function (t) {
        const statKey = amenityTypeToBuildingStatKey(t);
        const id = "exp_amen_" + statKey;
        const arr = series.explainAmenity[id];
        if (!arr) return;
        const cnt = Number(p["amen_" + statKey + sfx]) || 0;
        const cfg = getAmenityConfig(t);
        amenRows.push({
          label: cfg.label,
          detail: "POI count in walk range",
          value: cnt,
          valueLabel: formatMetricNumber(cnt),
          percentile: percentileForSeries(arr, cnt),
        });
      });
      amenRows.sort(function (a, b) {
        if (b.value !== a.value) return b.value - a.value;
        return a.label.localeCompare(b.label);
      });
      if (amenRows.length > 0) {
        rows.push({ sectionTitle: "POI categories (count in range)" });
        amenRows.forEach(function (r) {
          rows.push(r);
        });
      }
    } else {
      rows.push({ sectionTitle: "Selected categories" });
      selectedAmenityTypes.forEach(function (type) {
        const id = "exp_sel_" + type;
        const arr = series.explain[id];
        const v = getExpandedContributionForType(p, m, type);
        const cfg = getAmenityConfig(type);
        const suffix = type === "trees" || type === "street-lights" ? " pts" : " (count)";
        rows.push({
          label: cfg.label,
          detail: type === "trees" || type === "street-lights" ? "×¼ weight" : "",
          value: v,
          valueLabel: formatMetricNumber(v) + suffix,
          percentile: percentileForSeries(arr, v),
        });
      });
    }
  }

  return {
    formulaLine: isClean
      ? buildFilteredFormulaLine(useAll)
      : useAll
        ? "Amenities focus index = POI count + ¼× trees + ¼× street lights."
        : "Partial amenities focus index = sum of selected POI counts plus ¼× trees and ¼× lights when selected. ",
    overallScoreLabel: formatMetricNumber(overallScore),
    overallPercentile: overallPct,
    rows: rows,
  };
}

function renderScoreExplainCategoryList(breakdown) {
  if (!breakdown) return "";
  const showPercentile = scoreMode !== "weighted";

  if (scoreMode === "weighted" && Array.isArray(breakdown.weightedCategories)) {
    let weightedHtml = '<div class="score-explain-list score-explain-list-weighted">';
    weightedHtml += '<div class="score-explain-equation-card">';
    weightedHtml += '<div class="score-explain-equation-label">Urban95 equation</div>';
    weightedHtml += '<div class="score-explain-equation-text">' + escapeHtml(breakdown.formulaLine || "") + "</div>";
    weightedHtml += "</div>";
    weightedHtml += '<h3 class="score-explain-section-h">Main category scores</h3>';
    breakdown.weightedCategories.forEach(function (cat, idx) {
      const targetId = "score-explain-sub-" + idx;
      weightedHtml += '<div class="score-explain-card score-explain-category-card">';
      weightedHtml += '<div class="score-explain-card-main">';
      weightedHtml += '<div class="score-explain-card-title">';
      weightedHtml += '<span class="score-explain-card-name">' + escapeHtml(cat.label) + "</span>";
      weightedHtml +=
        '<span class="score-explain-card-hint">' +
        escapeHtml((cat.weight * 100).toFixed(0) + "% of total index") +
        "</span>";
      weightedHtml += "</div>";
      weightedHtml += '<div class="score-explain-card-values">';
      weightedHtml += '<div class="score-explain-card-metric">';
      weightedHtml += '<span class="score-explain-metric-label">Category score</span>';
      weightedHtml += '<span class="score-explain-metric-val">' + escapeHtml(cat.valueLabel) + "</span>";
      weightedHtml += "</div>";
      weightedHtml += '<div class="score-explain-card-metric">';
      weightedHtml +=
        '<button type="button" class="score-explain-toggle-btn" data-target="' +
        targetId +
        '" aria-expanded="false">Show subcategories</button>';
      weightedHtml += "</div>";
      weightedHtml += "</div>";
      weightedHtml += "</div>";
      weightedHtml +=
        '<div class="score-explain-sublist" id="' +
        targetId +
        '" hidden>';
      (cat.subrows || []).forEach(function (sub) {
        weightedHtml += '<div class="score-explain-subitem">';
        weightedHtml += '<div class="score-explain-subitem-head">';
        weightedHtml += '<span class="score-explain-subitem-name">' + escapeHtml(sub.label) + "</span>";
        weightedHtml +=
          '<span class="score-explain-subitem-weight">' +
          escapeHtml((sub.weight * 100).toFixed(0) + "% of category • " + (sub.totalWeight * 100).toFixed(1) + "% of total") +
          "</span>";
        weightedHtml += "</div>";
        weightedHtml += '<div class="score-explain-subitem-score">' + escapeHtml(sub.valueLabel) + "</div>";
        weightedHtml += "</div>";
      });
      weightedHtml += "</div>";
      weightedHtml += "</div>";
    });
    weightedHtml += "</div>";
    return weightedHtml;
  }

  let html = '<div class="score-explain-list">';
  (breakdown.rows || []).forEach(function (row) {
    if (row.sectionTitle) {
      html += '<h3 class="score-explain-section-h">' + escapeHtml(row.sectionTitle) + "</h3>";
      return;
    }
    const pct = row.percentile;
    const barW = pct != null ? Math.round(pct) : 0;
    const barColor = explainRankBarColor(pct);
    const pctDisplay =
      pct != null ? pct + getOrdinalSuffix(pct) + " percentile" : "—";

    html += '<div class="score-explain-card">';
    html += '<div class="score-explain-card-main">';
    html += '<div class="score-explain-card-title">';
    html += '<span class="score-explain-card-name">' + escapeHtml(row.label) + "</span>";
    if (row.detail) {
      html += '<span class="score-explain-card-hint">' + escapeHtml(row.detail) + "</span>";
    }
    html += "</div>";
    html += '<div class="score-explain-card-values">';
    html += '<div class="score-explain-card-metric">';
    html += '<span class="score-explain-metric-label">Score</span>';
    html += '<span class="score-explain-metric-val">' + escapeHtml(row.valueLabel) + "</span>";
    html += "</div>";
    if (showPercentile) {
      html += '<div class="score-explain-card-metric">';
      html += '<span class="score-explain-metric-label">Percentile</span>';
      html += '<span class="score-explain-metric-pct">' + escapeHtml(pctDisplay) + "</span>";
      html += "</div>";
    }
    html += "</div>";
    html += "</div>";
    html += '<div class="score-explain-card-bar">';
    if (showPercentile && pct != null) {
      html +=
        '<div class="score-explain-card-bar-fill" style="width:' +
        barW +
        "%;background:" +
        barColor +
        '"></div>';
    }
    html += "</div>";
    html += "</div>";
  });
  html += "</div>";
  return html;
}

function hideScoreExplainModal() {
  const modal = document.getElementById("score-explain-modal");
  if (modal) modal.classList.remove("show");
}

function openScoreExplainModal() {
  if (!selectedBuildingCentroid || !selectedBuildingCentroid.feature) return;
  const modal = document.getElementById("score-explain-modal");
  const scrollEl = document.getElementById("score-explain-modal-scroll");
  if (!modal || !scrollEl) return;

  const breakdown = buildExplainScoreBreakdown(selectedBuildingCentroid.feature.properties || {});
  const scoreKind = getScoreModeLabel();
  const eyebrow = document.getElementById("score-explain-eyebrow");
  const note = document.getElementById("score-explain-hero-note");
  const numEl = document.getElementById("score-explain-hero-num");
  const pctEl = document.getElementById("score-explain-hero-pct");
  const meterFill = document.getElementById("score-explain-hero-meter-fill");
  const pctBlock = document.querySelector(".score-explain-hero-block-pct");
  const weightedMode = scoreMode === "weighted";

  if (eyebrow) {
    eyebrow.textContent = weightedMode
      ? scoreKind + " · citywide comparison"
      : scoreKind + " · " + walkMinutes + " min walk · vs all buildings";
  }

  if (!breakdown) {
    if (numEl) numEl.textContent = "—";
    if (pctEl) pctEl.textContent = weightedMode ? "0-100 scale" : "—";
    if (meterFill) meterFill.style.width = weightedMode ? "100%" : "0%";
    if (note) note.textContent = "";
    if (pctBlock) pctBlock.style.display = weightedMode ? "none" : "";
    scrollEl.innerHTML =
      '<p class="score-explain-empty">Score breakdown is unavailable for the current selection.</p>';
    scrollEl.scrollTop = 0;
    modal.classList.add("show");
    return;
  }

  if (numEl) numEl.textContent = breakdown.overallScoreLabel;
  if (pctBlock) pctBlock.style.display = weightedMode ? "none" : "";
  if (!weightedMode && pctEl) {
    pctEl.textContent =
      breakdown.overallPercentile != null
        ? breakdown.overallPercentile + getOrdinalSuffix(breakdown.overallPercentile)
        : "—";
  }
  if (!weightedMode && meterFill) {
    meterFill.style.width =
      breakdown.overallPercentile != null
        ? Math.min(100, Math.max(0, breakdown.overallPercentile)) + "%"
        : "0%";
  }
  if (note) {
    note.textContent = weightedMode
      ? "Expand each category to inspect subcategory scores and weights."
      : breakdown.formulaLine;
  }

  scrollEl.innerHTML = renderScoreExplainCategoryList(breakdown);
  scrollEl.querySelectorAll(".score-explain-toggle-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const targetId = btn.getAttribute("data-target");
      if (!targetId) return;
      const target = scrollEl.querySelector("#" + targetId);
      if (!target) return;
      const isHidden = target.hasAttribute("hidden");
      if (isHidden) {
        target.removeAttribute("hidden");
        btn.setAttribute("aria-expanded", "true");
        btn.textContent = "Hide subcategories";
      } else {
        target.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", "false");
        btn.textContent = "Show subcategories";
      }
    });
  });
  scrollEl.scrollTop = 0;
  modal.classList.add("show");
}

function updateFilterLabel() {
  if (scoreMode === "weighted") {
    filterLabel.textContent = "Not used in Urban95";
    return;
  }
  const total = allFilterTypes.length;
  const selected = selectedAmenityTypes.size;

  if (selected === 0 || selected === total) {
    filterLabel.textContent = "All types";
  } else if (selected === 1) {
    const type = Array.from(selectedAmenityTypes)[0];
    const config = AMENITY_TYPE_CONFIG[type];
    filterLabel.textContent = config ? config.label : type;
  } else {
    filterLabel.textContent = selected + " selected";
  }
}

function handleFilterRadioChange(e) {
  if (scoreMode === "weighted") {
    forceAllAmenityTypesSelected();
    updateFilterLabel();
    return;
  }
  const input = e.target;
  const value = input.value;
  lastFilterRadioSelection = value;

  if (value === "all") {
    selectedAmenityTypes.clear();
    allFilterTypes.forEach(function (type) {
      selectedAmenityTypes.add(type);
    });
  } else {
    selectedAmenityTypes.clear();
    selectedAmenityTypes.add(value);
  }

  updateFilterLabel();
  updateAmenitiesSource();
  updateTreesSource();
  updateStreetLightsSource();
  percentileSeriesCache.clear();
  updateBuildingColors();

  if (selectedBuildingCentroid) {
    selectBuilding(selectedBuildingCentroid, false);
  }
}

function formatArea(areaM2) {
  if (areaM2 >= 10000) {
    return (areaM2 / 10000).toFixed(2) + " ha";
  }
  return Math.round(areaM2).toLocaleString() + " m²";
}

function colorWithAlpha(hexColor, alpha) {
  if (typeof hexColor !== "string" || !hexColor.startsWith("#")) {
    return `rgba(107, 114, 128, ${alpha})`;
  }

  let hex = hexColor.slice(1);
  if (hex.length === 3) {
    hex = hex.split("").map(ch => ch + ch).join("");
  }
  if (hex.length !== 6) {
    return `rgba(107, 114, 128, ${alpha})`;
  }

  const value = parseInt(hex, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildFilterItems(types) {
  filterItems.innerHTML = "";
  allFilterTypes = [];

  if (allTreesData && allTreesData.features.length > 0) {
    allFilterTypes.push("trees");
  }

  if (allStreetLightsData && allStreetLightsData.features.length > 0) {
    allFilterTypes.push("street-lights");
  }

  const typesWithPoints = types.filter(t => typesWithData.has(t));
  typesWithPoints.forEach(type => {
    allFilterTypes.push(type);
  });

  const neutral = "#6b7280";
  const allRow = document.createElement("label");
  allRow.className = "filter-item";
  allRow.innerHTML = `<input type="radio" name="amenity-filter-only" value="all" checked /><span class="filter-type-pill" style="--pill-color:${neutral};--pill-bg:${colorWithAlpha(neutral, 0.12)};--pill-border:${colorWithAlpha(neutral, 0.3)}">All types</span>`;
  allRow.querySelector("input").addEventListener("change", handleFilterRadioChange);
  filterItems.appendChild(allRow);

  if (allTreesData && allTreesData.features.length > 0) {
    const treesConfig = AMENITY_TYPE_CONFIG["trees"];
    const treesColor = treesConfig.color || DEFAULT_CONFIG.color;
    const treesLabel = document.createElement("label");
    treesLabel.className = "filter-item";
    treesLabel.innerHTML = `<input type="radio" name="amenity-filter-only" value="trees" /><span class="filter-type-pill" style="--pill-color:${treesColor};--pill-bg:${colorWithAlpha(treesColor, 0.14)};--pill-border:${colorWithAlpha(treesColor, 0.35)}">${treesConfig.label}</span>`;
    treesLabel.querySelector("input").addEventListener("change", handleFilterRadioChange);
    filterItems.appendChild(treesLabel);
  }

  if (allStreetLightsData && allStreetLightsData.features.length > 0) {
    const slConfig = AMENITY_TYPE_CONFIG["street-lights"];
    const slColor = slConfig.color || DEFAULT_CONFIG.color;
    const slLabel = document.createElement("label");
    slLabel.className = "filter-item";
    slLabel.innerHTML = `<input type="radio" name="amenity-filter-only" value="street-lights" /><span class="filter-type-pill" style="--pill-color:${slColor};--pill-bg:${colorWithAlpha(slColor, 0.14)};--pill-border:${colorWithAlpha(slColor, 0.35)}">${slConfig.label}</span>`;
    slLabel.querySelector("input").addEventListener("change", handleFilterRadioChange);
    filterItems.appendChild(slLabel);
  }

  typesWithPoints.forEach(type => {
    const config = getAmenityConfig(type);
    const label = document.createElement("label");
    label.className = "filter-item";
    const color = config.color || DEFAULT_CONFIG.color;
    label.innerHTML = `<input type="radio" name="amenity-filter-only" value="${type}" /><span class="filter-type-pill" style="--pill-color:${color};--pill-bg:${colorWithAlpha(color, 0.14)};--pill-border:${colorWithAlpha(color, 0.35)}">${config.label}</span>`;
    label.querySelector("input").addEventListener("change", handleFilterRadioChange);
    filterItems.appendChild(label);
  });

  selectedAmenityTypes.clear();
  allFilterTypes.forEach(function (type) {
    selectedAmenityTypes.add(type);
  });

  const urban95NoFilter = scoreMode === "weighted";
  const wantAll =
    urban95NoFilter ||
    !lastFilterRadioSelection ||
    lastFilterRadioSelection === "all" ||
    !allFilterTypes.includes(lastFilterRadioSelection);

  if (!wantAll) {
    selectedAmenityTypes.clear();
    selectedAmenityTypes.add(lastFilterRadioSelection);
  }

  filterItems.querySelectorAll('input[name="amenity-filter-only"]').forEach(function (inp) {
    inp.checked = wantAll ? inp.value === "all" : inp.value === lastFilterRadioSelection;
  });

  syncFilterUiForScoreMode();
  updateFilterLabel();
  percentileSeriesCache.clear();
}

// Track if we just opened the popup (to prevent immediate close on touch)
let popupJustOpened = false;

function openFilterPopup() {
  if (scoreMode === "weighted") return;
  filterPopup.classList.add("show");
  filterBtn.classList.add("open");
  if (isTouchDevice && filterBackdrop) {
    filterBackdrop.classList.add("show");
  }
  popupJustOpened = true;
  setTimeout(function() { popupJustOpened = false; }, 100);
}

function closeFilterPopup() {
  filterPopup.classList.remove("show");
  filterBtn.classList.remove("open");
  if (filterBackdrop) {
    filterBackdrop.classList.remove("show");
  }
}

// Toggle filter popup - works for both mouse and touch
function toggleFilterPopup() {
  if (scoreMode === "weighted") return;
  const isOpen = filterPopup.classList.contains("show");
  if (isOpen) {
    closeFilterPopup();
  } else {
    openFilterPopup();
  }
}

// Track if we just handled a touch event to prevent double-firing
let handledByTouch = false;

filterBtn.addEventListener("click", function(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // Skip if already handled by touch event
  if (handledByTouch) {
    handledByTouch = false;
    return;
  }
  
  toggleFilterPopup();
});

// Handle touch - touchend fires before click on mobile
filterBtn.addEventListener("touchend", function(e) {
  e.preventDefault();
  e.stopPropagation();
  handledByTouch = true;
  toggleFilterPopup();
  
  // Reset flag after a short delay in case click doesn't fire
  setTimeout(function() { handledByTouch = false; }, 300);
});

// Close popup when clicking backdrop
if (filterBackdrop) {
  filterBackdrop.addEventListener("click", closeFilterPopup);
  filterBackdrop.addEventListener("touchstart", function(e) {
    e.preventDefault();
    closeFilterPopup();
  });
}

document.addEventListener("click", function(e) {
  if (popupJustOpened) return;
  if (!filterPopup.contains(e.target) && e.target !== filterBtn && !filterBtn.contains(e.target)) {
    closeFilterPopup();
  }
});

// Close popup on touch outside on mobile
document.addEventListener("touchstart", function(e) {
  if (popupJustOpened) return;
  if (!filterPopup.contains(e.target) && e.target !== filterBtn && !filterBtn.contains(e.target) && e.target !== filterBackdrop) {
    closeFilterPopup();
  }
});

document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    const scoreExplainModal = document.getElementById("score-explain-modal");
    if (scoreExplainModal && scoreExplainModal.classList.contains("show")) {
      hideScoreExplainModal();
      return;
    }
    closeFilterPopup();
    if (currentMode === "house") {
      clearRadiusSelection();
    } else     if (currentMode === "neighborhood") {
      hideNeighborhoodModal();
    } else if (currentMode === "citywide") {
      hideCitywideModal();
      switchMode("house");
    }
  }
});

if (showPointsToggle) {
  showPointsToggle.addEventListener("change", function () {
    setAmenityPointsVisibility(this.checked);
  });
}

// Prevent clicks inside the popup from bubbling to document (which would close it)
filterPopup.addEventListener("click", function(e) {
  e.stopPropagation();
});
filterPopup.addEventListener("touchstart", function(e) {
  e.stopPropagation();
});

// Find the closest building centroid to a given point
function findClosestBuilding(lngLat) {
  if (buildingCentroids.length === 0) return null;
  
  let closest = null;
  let minDist = Infinity;
  
  buildingCentroids.forEach(b => {
    const dist = turf.distance(
      [lngLat.lng, lngLat.lat],
      [b.lng, b.lat],
      { units: "meters" }
    );
    if (dist < minDist) {
      minDist = dist;
      closest = b;
    }
  });
  
  return closest;
}

// Load isochrone polygons from precomputed file
function loadIsochrones() {
  if (isochronesLoaded || isochroneLoadStarted) return;
  isochroneLoadStarted = true;

  setLoadingStatus("Loading walking areas\u2026");

  fetch(ISOCHRONES_URL)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      if (!data || !data.features) throw new Error("Invalid isochrone data");
      data.features.forEach(function (f) {
        const bid = f.properties.building_id;
        const mins = f.properties.minutes;
        isochroneIndex[bid + "_" + mins] = f;
      });
      isochronesLoaded = true;
      loadingState.isochrones = true;
      updateLoadingProgress();
      if (selectedBuildingCentroid) {
        selectBuilding(selectedBuildingCentroid, false);
      }
    })
    .catch(function (err) {
      console.error("Failed to load isochrones:", err);
      isochroneLoadStarted = false;
      loadingState.isochrones = true;
      updateLoadingProgress();
    });
}

// Look up the precomputed isochrone polygon for a building
function getIsochrone(buildingId, minutes) {
  const key = buildingId + "_" + minutes;
  return isochroneIndex[key] || null;
}

// Calculate which items are within an isochrone polygon (filtered by selection)
function getItemsInPolygon(polygon) {
  const amenityIndices = new Set();
  const treeIndices = new Set();
  const streetLightIndices = new Set();
  const counts = {};

  if (selectedAmenityTypes.size === 0 || !polygon) {
    return { amenityIndices, treeIndices, streetLightIndices, counts };
  }

  const useAll = selectedAmenityTypes.size === allFilterTypes.length;

  if (allAmenitiesData && allAmenitiesData.features) {
    allAmenitiesData.features.forEach((f, index) => {
      const type = f.properties.amenity_type;
      if (!useAll && !selectedAmenityTypes.has(type)) return;
      const pt = turf.point(f.geometry.coordinates);
      if (turf.booleanPointInPolygon(pt, polygon)) {
        amenityIndices.add(index);
        counts[type] = (counts[type] || 0) + 1;
      }
    });
  }

  if (allTreesData && allTreesData.features && (useAll || selectedAmenityTypes.has("trees"))) {
    allTreesData.features.forEach((f, index) => {
      const pt = turf.point(f.geometry.coordinates);
      if (turf.booleanPointInPolygon(pt, polygon)) {
        treeIndices.add(index);
        counts["trees"] = (counts["trees"] || 0) + 1;
      }
    });
  }

  if (allStreetLightsData && allStreetLightsData.features && (useAll || selectedAmenityTypes.has("street-lights"))) {
    allStreetLightsData.features.forEach((f, index) => {
      const pt = turf.point(f.geometry.coordinates);
      if (turf.booleanPointInPolygon(pt, polygon)) {
        streetLightIndices.add(index);
        counts["street-lights"] = (counts["street-lights"] || 0) + 1;
      }
    });
  }

  return { amenityIndices, treeIndices, streetLightIndices, counts };
}

// Smooth ease-in-out curve for pan animations
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// Select a building and show contextual detail for the active score mode
function selectBuilding(building, doFly = true) {
  selectedBuildingCentroid = building;

  // Highlight the selected building outline
  const buildingSource = map.getSource("selected-building");
  if (buildingSource && building.feature) {
    buildingSource.setData({ type: "FeatureCollection", features: [building.feature] });
  }

  if (scoreMode === "weighted") {
    amenitiesInRadiusIds.clear();
    treesInRadiusIds.clear();
    streetLightsInRadiusIds.clear();
    latestRadiusCounts = {};

    const radiusSource = map.getSource("radius-circle");
    if (radiusSource) {
      radiusSource.setData({ type: "FeatureCollection", features: [] });
    }

    updateAmenitiesSource();
    updateTreesSource();
    updateStreetLightsSource();
    updateRadiusInfo();

    if (doFly) {
      map.easeTo({
        center: [building.lng, building.lat],
        zoom: Math.max(map.getZoom(), 16),
        duration: 1400,
        easing: easeInOutQuad,
        essential: true
      });
    }
    return;
  }

  // Look up precomputed isochrone polygon
  const buildingId = building.feature ? building.feature.properties.building_id : null;
  let polygon = null;
  if (buildingId != null) {
    polygon = getIsochrone(buildingId, walkMinutes);
  }

  if (polygon) {
    const source = map.getSource("radius-circle");
    if (source) source.setData(polygon);
  } else {
    const source = map.getSource("radius-circle");
    if (source) source.setData({ type: "FeatureCollection", features: [] });

    amenitiesInRadiusIds.clear();
    treesInRadiusIds.clear();
    streetLightsInRadiusIds.clear();
    latestRadiusCounts = {};
    updateAmenitiesSource();
    updateTreesSource();
    updateStreetLightsSource();

    const infoPanel = document.getElementById("radius-info");
    if (infoPanel) infoPanel.style.display = "none";

    if (doFly) {
      map.easeTo({
        center: [building.lng, building.lat],
        zoom: Math.max(map.getZoom(), 16),
        duration: 1400,
        easing: easeInOutQuad,
        essential: true
      });
    }
    return;
  }

  // Calculate items within isochrone polygon — defer heavy work until after
  // the pan animation starts so the first frames don't stutter
  const applyRadius = () => {
    const result = getItemsInPolygon(polygon);
    amenitiesInRadiusIds = result.amenityIndices;
    treesInRadiusIds = result.treeIndices;
    streetLightsInRadiusIds = result.streetLightIndices;
    latestRadiusCounts = result.counts;
    updateAmenitiesSource();
    updateTreesSource();
    updateStreetLightsSource();
    updateRadiusInfo();
  };

  if (doFly) {
    const zoom = getZoomForPolygon(polygon);
    requestAnimationFrame(applyRadius);
    map.easeTo({
      center: [building.lng, building.lat],
      zoom: zoom,
      duration: 1400,
      easing: easeInOutQuad,
      essential: true
    });
  } else {
    applyRadius();
  }
}

// Update displayed radius info
function updateRadiusInfo() {
  const infoPanel = document.getElementById("radius-info");
  if (!infoPanel) return;

  infoPanel.classList.add("percentile-mode");

  if (!selectedBuildingCentroid || !selectedBuildingCentroid.feature) {
    infoPanel.style.display = "none";
    return;
  }

  if (selectedAmenityTypes.size === 0) {
    infoPanel.innerHTML = '<div class="radius-count">Select amenity types in the filter</div>';
    infoPanel.style.display = "block";
    return;
  }

  const metrics = buildPercentileMetrics(selectedBuildingCentroid.feature.properties || {});
  if (!metrics) {
    infoPanel.innerHTML = '<div class="radius-count">Score data unavailable</div>';
    infoPanel.style.display = "block";
    return;
  }

  const scoreKind = getScoreModeLabel();
  const weightedMode = scoreMode === "weighted";

  let html = '<div class="percentile-popup-inner">';
  html += '<div class="percentile-summary">';
  if (weightedMode) {
    const scoreVal = Math.min(100, Math.max(0, Number(metrics.overallScore) || 0));
    html += `<div class="percentile-label">${scoreKind} accessibility — weighted score</div>`;
    html += `<div class="percentile-value">${formatMetricNumber(scoreVal)}<em>/100</em></div>`;
    html += `<div class="percentile-meter" aria-hidden="true"><div class="percentile-meter-fill" style="width:${scoreVal}%"></div></div>`;
  } else {
    html += `<div class="percentile-label">${scoreKind} accessibility — citywide percentile</div>`;
    html += `<div class="percentile-value">${metrics.overallPercentile}<span>${getOrdinalSuffix(metrics.overallPercentile)}</span><em>percentile</em></div>`;
    html += `<div class="percentile-meter" aria-hidden="true"><div class="percentile-meter-fill" style="width:${metrics.overallPercentile}%"></div></div>`;
  }
  html += "</div>";

  html += '<div class="percentile-actions">';
  html +=
    '<button type="button" class="score-explain-btn" id="score-explain-open-btn">Explain score</button>';
  html += "</div>";
  html += "</div>";

  infoPanel.innerHTML = html;
  const openBtn = infoPanel.querySelector("#score-explain-open-btn");
  if (openBtn) {
    openBtn.onclick = function () {
      openScoreExplainModal();
    };
  }
  infoPanel.style.display = "block";
}

// Clear the radius selection
function clearRadiusSelection() {
  selectedBuildingCentroid = null;
  amenitiesInRadiusIds.clear();
  treesInRadiusIds.clear();
  streetLightsInRadiusIds.clear();
  latestRadiusCounts = {};
  
  const source = map.getSource("radius-circle");
  if (source) source.setData({ type: "FeatureCollection", features: [] });
  
  const buildingSource = map.getSource("selected-building");
  if (buildingSource) buildingSource.setData({ type: "FeatureCollection", features: [] });
  
  updateAmenitiesSource();
  updateTreesSource();
  updateStreetLightsSource();
  
  const infoPanel = document.getElementById("radius-info");
  if (infoPanel) infoPanel.style.display = "none";
  hideScoreExplainModal();
}

const scoreModelToggle = document.getElementById("score-model-toggle");
if (scoreModelToggle) {
  scoreModelToggle.addEventListener("change", function (e) {
    const input = e.target;
    if (!input || input.name !== "score-model") return;
    if (input.value === "expanded" || input.value === "weighted") {
      scoreMode = input.value;
    } else {
      scoreMode = "weighted";
    }
    percentileSeriesCache.clear();
    if (scoreMode !== "weighted") {
      loadIsochrones();
    } else {
      loadingState.isochrones = true;
      updateLoadingProgress();
    }
    applyScoreModeAmenities();
    if (selectedBuildingCentroid) {
      updateRadiusInfo();
    }
    const cwModal = document.getElementById("citywide-modal");
    if (currentMode === "citywide" && cwModal && cwModal.classList.contains("show")) {
      renderCitywideModal();
    }
    if (currentMode === "neighborhood") {
      updateNeighborhoodColors();
      const nhModal = document.getElementById("neighborhood-modal");
      if (nhModal && nhModal.classList.contains("show") && selectedNeighborhood) {
        showNeighborhoodModal(selectedNeighborhood);
      }
    }
  });
}

radiusToggle.addEventListener("click", function (e) {
  const btn = e.target.closest(".radius-opt");
  if (!btn) return;
  
  walkMinutes = parseInt(btn.dataset.minutes, 10);
  
  // Update active state
  radiusToggle.querySelectorAll(".radius-opt").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  
  // Update building choropleth for new walking time and re-analyze selected building
  if (currentMode === "house") {
    updateBuildingColors();
    if (selectedBuildingCentroid) {
      selectBuilding(selectedBuildingCentroid, true);
    }
  }
});

map.on("click", function (e) {
  if (currentMode !== "house") return;
  if (e.originalEvent.target !== map.getCanvas()) return;
  if (Date.now() - _lastDeckClickTime < 300) return;

  const closest = findClosestBuilding(e.lngLat);
  if (closest) {
    selectBuilding(closest, true);
  }
});

map.on("mouseenter", "tree-icons", () => {
  if (!_deckHovering) map.getCanvas().style.cursor = "pointer";
});
map.on("mouseleave", "tree-icons", () => {
  if (!_deckHovering) map.getCanvas().style.cursor = "";
  tooltip.style.display = "none";
});
map.on("mousemove", "tree-icons", (e) => {
  if (_deckHovering || e.features.length === 0) return;
  tooltip.textContent = "Tree";
  tooltip.style.display = "block";
  tooltip.style.left = (e.point.x + 12) + "px";
  tooltip.style.top = (e.point.y + 12) + "px";
});

map.on("mouseenter", "street-light-icons", () => {
  if (!_deckHovering) map.getCanvas().style.cursor = "pointer";
});
map.on("mouseleave", "street-light-icons", () => {
  if (!_deckHovering) map.getCanvas().style.cursor = "";
  tooltip.style.display = "none";
});
map.on("mousemove", "street-light-icons", (e) => {
  if (_deckHovering || e.features.length === 0) return;
  const p = e.features[0].properties || {};
  const name = p.name || p.Name || p.hebrew_name || p.hebrew_nam;
  tooltip.textContent = name || "Street light";
  tooltip.style.display = "block";
  tooltip.style.left = (e.point.x + 12) + "px";
  tooltip.style.top = (e.point.y + 12) + "px";
});

map.on("load", async function () {
  loadingState.mapReady = true;
  updateLoadingProgress();
  
  // Load icons first
  setLoadingStatus("Loading icons...");
  await loadAmenityIcons();
  loadingState.icons = true;
  updateLoadingProgress();
  
  // Add amenity layers after icons are loaded
  addAmenityLayers();
  initDeckAmenityOverlay();
  setAmenityPointsVisibility(showPointsToggle ? showPointsToggle.checked : true);

  setLoadingStatus("Loading buildings...");
  fetch(BUILDINGS_URL)
    .then(function (r) { return r.json(); })
    .then(function (fc) {
      buildingsData = fc;
      warnIfBuildingScoresIncomplete(fc);
      percentileSeriesCache.clear();
      
      buildingCentroids = [];
      (fc.features || []).forEach(function (f) {
        if (f.geometry) {
          const centroid = turf.centroid(f);
          buildingCentroids.push({
            lng: centroid.geometry.coordinates[0],
            lat: centroid.geometry.coordinates[1],
            properties: f.properties,
            feature: f
          });
        }
      });
      
      updateBuildingColors();
      loadingState.buildings = true;
      updateLoadingProgress();
    })
    .catch(function (err) {
      console.error("Failed to load buildings:", err);
      loadingState.buildings = true;
      updateLoadingProgress();
    });

  setLoadingStatus("Loading parks...");
  fetch(PARKS_URL).then(function (r) { return r.ok ? r.json() : null; }).then(function (fc) {
    if (fc && map.getSource("parks")) map.getSource("parks").setData(fc);
    loadingState.parks = true;
    updateLoadingProgress();
  }).catch(function (err) {
    console.error("Failed to load parks:", err);
    loadingState.parks = true;
    updateLoadingProgress();
  });
  
  setLoadingStatus("Loading amenities...");
  Promise.all([
    fetch(AMENITIES_CLEAN_URL).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " " + AMENITIES_CLEAN_URL);
      return r.json();
    }),
    fetch(AMENITIES_LEGACY_URL).then(function (r) {
      if (!r.ok) {
        console.warn("Legacy amenities not available:", r.status, AMENITIES_LEGACY_URL);
        return null;
      }
      return r.json();
    })
  ])
    .then(function (results) {
      const cleanFc = filterCleanManifestPointFeatures(results[0]);
      const legacyFc = results[1];

      allAmenitiesDataClean = cleanFc;
      const cleanScan = scanAmenityTypesFromFeatures(cleanFc);
      allAmenityTypesClean = cleanScan.types;
      typesWithDataClean = cleanScan.tw;

      if (legacyFc && (legacyFc.features || []).length > 0) {
        allAmenitiesDataLegacy = legacyFc;
        const legScan = scanAmenityTypesFromFeatures(legacyFc);
        allAmenityTypesLegacy = legScan.types;
        typesWithDataLegacy = legScan.tw;
      } else {
        allAmenitiesDataLegacy = null;
        allAmenityTypesLegacy = [];
        typesWithDataLegacy = new Set();
      }

      applyScoreModeAmenities();

      loadingState.amenities = true;
      updateLoadingProgress();

      if (map.getZoom() >= 13) {
        loadTreesIfNeeded();
      }
    })
    .catch(function (err) {
      console.error("Failed to load amenities:", err);
      loadingState.amenities = true;
      updateLoadingProgress();
    });
  
  // Mark trees as loaded for progress bar (they load lazily)
  loadingState.trees = true;
  updateLoadingProgress();

  // Isochrones are only needed for Amenities focus mode.
  if (scoreMode !== "weighted") {
    loadIsochrones();
  } else {
    loadingState.isochrones = true;
    updateLoadingProgress();
  }

  map.getCanvas().style.cursor = "";
});

map.on("mouseenter", "buildings-fill", function () {
  if (!_deckHovering) map.getCanvas().style.cursor = "pointer";
});

map.on("mouseleave", "buildings-fill", function () {
  if (!_deckHovering) map.getCanvas().style.cursor = "";
});

map.on("mousemove", "parks-fill", function (e) {
  if (_deckHovering) return;
  map.getCanvas().style.cursor = "pointer";
  const p = e.features[0].properties;
  
  const lines = [];
  const name = p.name || "Unnamed Park";
  lines.push(name);
  
  if (p.area != null) {
    lines.push("Area: " + formatArea(p.area));
  }
  
  tooltip.textContent = lines.join("\n");
  tooltip.style.display = "block";
  tooltip.style.left = (e.point.x + 12) + "px";
  tooltip.style.top = (e.point.y + 12) + "px";
});

map.on("mouseleave", "parks-fill", function () {
  if (!_deckHovering) map.getCanvas().style.cursor = "";
  tooltip.style.display = "none";
});

// Info modal handling
const infoModal = document.getElementById("info-modal");
const infoBtn = document.getElementById("info-btn");
const modalClose = document.getElementById("modal-close");
const modalStart = document.getElementById("modal-start");

function showModal() {
  infoModal.classList.add("show");
}

function hideModal() {
  infoModal.classList.remove("show");
  localStorage.setItem("urban95-modal-seen", "true");
}

infoBtn.addEventListener("click", showModal);
modalClose.addEventListener("click", hideModal);
modalStart.addEventListener("click", hideModal);

infoModal.addEventListener("click", function(e) {
  if (e.target === infoModal) {
    hideModal();
  }
});

// Tab switching
const modalTabs = document.querySelectorAll(".modal-tab");
const tabContents = document.querySelectorAll(".modal-tab-content");

const modalScroll = document.querySelector("#info-modal .modal-scroll");

modalTabs.forEach(tab => {
  tab.addEventListener("click", function() {
    const targetTab = this.dataset.tab;

    modalTabs.forEach(t => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tabContents.forEach(c => {
      c.classList.remove("active");
      c.setAttribute("aria-hidden", "true");
    });

    this.classList.add("active");
    this.setAttribute("aria-selected", "true");
    const panel = document.getElementById("tab-" + targetTab);
    if (panel) {
      panel.classList.add("active");
      panel.setAttribute("aria-hidden", "false");
    }
    if (modalScroll) modalScroll.scrollTop = 0;
  });
});

// Show modal on first visit
if (!localStorage.getItem("urban95-modal-seen")) {
  showModal();
}

// Lazy load trees and street lights when zoomed in far enough
map.on("zoomend", function() {
  if (map.getZoom() >= 13) {
    loadTreesIfNeeded();
    loadStreetLightsIfNeeded();
  }
  if (scoreMode === "weighted") {
    updateTreesSource();
    updateStreetLightsSource();
  }
});

// ─── Analysis Mode Management ───────────────────────────────────────

const modeToggle = document.getElementById("mode-toggle");
const modeHint = document.getElementById("mode-hint");

function loadNeighborhoodChartsPayload() {
  if (neighborhoodChartsPayload) return Promise.resolve(neighborhoodChartsPayload);
  return fetch(NEIGHBORHOOD_CHARTS_URL)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      neighborhoodChartsPayload = data;
      return data;
    })
    .catch(function (err) {
      console.warn("Failed to load neighborhood_charts.json:", err);
      neighborhoodChartsPayload = { inventory_clean: {}, inventory_legacy: {} };
      return neighborhoodChartsPayload;
    });
}

function pieSlicesFromInventoryCounts(invObj) {
  const labels = [];
  const values = [];
  const colors = [];
  if (!invObj || typeof invObj !== "object") return { labels, values, colors };
  Object.keys(invObj)
    .filter(function (t) {
      return t !== "trees" && t !== "street-lights";
    })
    .sort(function (a, b) {
      return (invObj[b] || 0) - (invObj[a] || 0);
    })
    .forEach(function (type) {
      const n = Number(invObj[type]) || 0;
      if (n <= 0) return;
      const config = getAmenityConfig(type);
      labels.push(config.label);
      values.push(n);
      colors.push(config.color);
    });
  return { labels, values, colors };
}

function loadNeighborhoods() {
  if (neighborhoodsData) return Promise.resolve(neighborhoodsData);
  return fetch(NEIGHBORHOODS_URL)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      neighborhoodsData = data;
      return data;
    })
    .catch(function (err) {
      console.error("Failed to load neighborhoods:", err);
      return { type: "FeatureCollection", features: [] };
    });
}

function loadNeighborhoodSurfaceData() {
  if (neighborhoodSurfaceData) return Promise.resolve(neighborhoodSurfaceData);
  return fetch(NEIGHBORHOOD_SURFACE_URL)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      neighborhoodSurfaceData = data;
      return data;
    })
    .catch(function (err) {
      console.warn("Failed to load neighborhood_surface.geojson:", err);
      neighborhoodSurfaceData = { type: "FeatureCollection", features: [] };
      return neighborhoodSurfaceData;
    });
}

function loadCitywideStats() {
  if (citywideStats) return Promise.resolve(citywideStats);
  return fetch(CITYWIDE_STATS_URL)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      citywideStats = data;
      return data;
    })
    .catch(function (err) {
      console.error("Failed to load citywide stats:", err);
      return null;
    });
}

function addNeighborhoodLayers() {
  if (map.getLayer("neighborhoods-fill")) return;
  console.log("[Neighborhood] Adding layers dynamically");

  map.addLayer({
    id: "neighborhoods-surface",
    type: "fill",
    source: "neighborhood-score-surface",
    paint: {
      "fill-color": getNeighborhoodSurfaceColorExpression(getNeighborhoodSurfaceScorePropertyKey()),
      "fill-outline-color": getNeighborhoodSurfaceColorExpression(getNeighborhoodSurfaceScorePropertyKey()),
      "fill-opacity": 1,
      "fill-antialias": true,
    },
    layout: { visibility: "none" },
  });

  map.addLayer({
    id: "neighborhoods-fill",
    type: "fill",
    source: "neighborhoods",
    paint: { "fill-color": "#3b82f6", "fill-opacity": 0.6 },
    layout: { visibility: "none" },
  });
  map.addLayer({
    id: "neighborhoods-line",
    type: "line",
    source: "neighborhoods",
    paint: { "line-color": "#1e3a5f", "line-width": 2.5, "line-opacity": 0.9 },
    layout: { visibility: "none" },
  });
  // Skip label layer to avoid glyphs requirement issues
}


function extractNeighborhoodPolygonFeatures() {
  const polygons = [];
  (neighborhoodsData && neighborhoodsData.features ? neighborhoodsData.features : []).forEach(function (f) {
    const g = f && f.geometry;
    if (!g || !g.type) return;
    if ((g.type === "Polygon" || g.type === "MultiPolygon") && g.coordinates) {
      polygons.push({
        type: "Feature",
        properties: f.properties || {},
        geometry: g,
      });
      return;
    }
    if (g.type === "GeometryCollection" && Array.isArray(g.geometries)) {
      g.geometries.forEach(function (subGeom) {
        if (!subGeom || !subGeom.type || !subGeom.coordinates) return;
        if (subGeom.type === "Polygon" || subGeom.type === "MultiPolygon") {
          polygons.push({
            type: "Feature",
            properties: f.properties || {},
            geometry: subGeom,
          });
        }
      });
    }
  });
  return polygons;
}

function scoreFromSamplesIDW(lng, lat, samples) {
  if (!samples || samples.length === 0) return 0;
  if (samples.length === 1) return samples[0].score;
  const power = 3.1;
  const maxDistanceDeg = 0.0042;
  const maxDistance2 = maxDistanceDeg * maxDistanceDeg;
  let num = 0;
  let den = 0;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let nearestScore = samples[0].score;
  let nearestD2 = Infinity;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    const dx = (s.lng - lng) * cosLat;
    const dy = s.lat - lat;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1e-12) return s.score;
    if (d2 < nearestD2) {
      nearestD2 = d2;
      nearestScore = s.score;
    }
    if (d2 > maxDistance2) continue;
    const w = 1 / Math.pow(d2, power / 2);
    num += s.score * w;
    den += w;
  }
  if (den <= 0) return nearestScore;
  return num / den;
}

function hasNearbySample(lng, lat, samples, maxDistanceDeg) {
  if (!samples || samples.length === 0) return false;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const maxDistance2 = maxDistanceDeg * maxDistanceDeg;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    const dx = (s.lng - lng) * cosLat;
    const dy = s.lat - lat;
    const d2 = dx * dx + dy * dy;
    if (d2 <= maxDistance2) return true;
  }
  return false;
}

function updateNeighborhoodSurfaceData() {
  const surfaceSrc = map.getSource("neighborhood-score-surface");
  if (!surfaceSrc) return;
  const precomputedScoreKey = getNeighborhoodSurfaceScorePropertyKey();

  if (
    precomputedScoreKey &&
    neighborhoodSurfaceData &&
    Array.isArray(neighborhoodSurfaceData.features) &&
    neighborhoodSurfaceData.features.length > 0
  ) {
    surfaceSrc.setData(neighborhoodSurfaceData);
    if (map.getLayer("neighborhoods-surface")) {
      const colorExpr = getNeighborhoodSurfaceColorExpression(precomputedScoreKey);
      map.setPaintProperty("neighborhoods-surface", "fill-color", colorExpr);
      map.setPaintProperty("neighborhoods-surface", "fill-outline-color", colorExpr);
    }
    return;
  }

  if (!buildingsData || !neighborhoodsData) return;

  const polygons = extractNeighborhoodPolygonFeatures();
  if (polygons.length === 0 || !Array.isArray(buildingCentroids) || buildingCentroids.length === 0) {
    surfaceSrc.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  const scores = buildingCentroids.map(function (b) {
    return getBuildingOverallScore(b.properties || {}, walkMinutes);
  });
  const ranks = scoreMode === "weighted" ? null : bulkPercentileRanks(scores);

  const citySamples = [];
  const neighborhoodSamples = polygons.map(function () { return []; });

  buildingCentroids.forEach(function (b, i) {
    const lng = Number(b.lng);
    const lat = Number(b.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    const raw = scoreMode === "weighted" ? scores[i] : ranks[i];
    const val = Math.max(0, Math.min(100, Number(raw) || 0));
    citySamples.push({ lng: lng, lat: lat, score: val });

    const pt = turf.point([lng, lat]);
    let insideIdx = -1;
    for (let j = 0; j < polygons.length; j++) {
      try {
        if (turf.booleanPointInPolygon(pt, polygons[j])) {
          insideIdx = j;
          break;
        }
      } catch (_) {
        continue;
      }
    }
    if (insideIdx >= 0) neighborhoodSamples[insideIdx].push({ lng: lng, lat: lat, score: val });
  });

  const surfaceFeatures = [];
  const cellSideKm = 0.05;
  const localDataRadiusDeg = 0.0042;

  polygons.forEach(function (poly, idx) {
    let polyBbox = null;
    try {
      const gridSeed = turf.buffer(poly, cellSideKm * 1.6, { units: "kilometers" });
      polyBbox = turf.bbox(gridSeed && gridSeed.geometry ? gridSeed : poly);
    } catch (_) {
      return;
    }
    const grid = turf.hexGrid(polyBbox, cellSideKm, { units: "kilometers" });
    let hexCounter = 1;
    const neighborhoodName = (poly.properties && (poly.properties.Name || poly.properties.name)) || "Unknown neighborhood";
    (grid.features || []).forEach(function (cell) {
      let clipped = null;
      try {
        clipped = turf.intersect(cell, poly);
      } catch (_) {
        clipped = null;
      }
      if (!clipped || !clipped.geometry) return;
      const gType = clipped.geometry.type;
      if (gType !== "Polygon" && gType !== "MultiPolygon") return;

      const geomCenter = turf.centroid(clipped);
      const lng = geomCenter.geometry.coordinates[0];
      const lat = geomCenter.geometry.coordinates[1];
      const localSamples = neighborhoodSamples[idx];
      const hasLocalData = hasNearbySample(lng, lat, localSamples, localDataRadiusDeg);
      const samples = hasLocalData ? localSamples : citySamples;
      const score = hasLocalData ? scoreFromSamplesIDW(lng, lat, samples) : 0;
      const clampedScore = Math.max(0, Math.min(100, Number(score) || 0));
      clipped.properties = Object.assign({}, clipped.properties || {}, {
        score: clampedScore,
        hex_id: "H" + String(hexCounter),
        neighborhood_name: neighborhoodName,
        has_buildings: hasLocalData ? 1 : 0,
      });
      hexCounter += 1;
      surfaceFeatures.push(clipped);
    });
  });

  surfaceSrc.setData({
    type: "FeatureCollection",
    features: surfaceFeatures,
  });
  if (map.getLayer("neighborhoods-surface")) {
    const fallbackExpr = getNeighborhoodSurfaceColorExpression("score");
    map.setPaintProperty("neighborhoods-surface", "fill-color", fallbackExpr);
    map.setPaintProperty("neighborhoods-surface", "fill-outline-color", fallbackExpr);
  }
}


function updateNeighborhoodColors() {
  if (!neighborhoodsData || !map.getLayer("neighborhoods-fill")) return;

  const sfx = "_" + getScoreMinutes() + "min";
  const avgKey = getNeighborhoodAverageKey(sfx);

  const feats = neighborhoodsData.features;
  const values = feats.map((f) => (f.properties || {})[avgKey] || 0);
  const ranks = scoreMode === "weighted" ? null : bulkPercentileRanks(values);
  feats.forEach((f, i) => {
    const p = f.properties || {};
    if (scoreMode === "weighted") {
      p[SYM_PCT_KEY] = Math.max(0, Math.min(100, Number(values[i]) || 0));
    } else {
      p[SYM_PCT_KEY] = ranks[i] != null ? ranks[i] : 0;
    }
  });

  const nhSrc = map.getSource("neighborhoods");
  if (nhSrc) nhSrc.setData(neighborhoodsData);

  const colorExpr = [
    "interpolate",
    ["linear"],
    ["to-number", ["get", SYM_PCT_KEY]],
    0, "#ef4444",
    25, "#f97316",
    50, "#eab308",
    75, "#84cc16",
    100, "#22c55e",
  ];

  if (currentMode === "neighborhood") {
    map.setPaintProperty("neighborhoods-fill", "fill-color", "#0f172a");
    map.setPaintProperty("neighborhoods-fill", "fill-opacity", 0.01);
    updateNeighborhoodSurfaceData();
  } else {
    map.setPaintProperty("neighborhoods-fill", "fill-color", colorExpr);
    map.setPaintProperty("neighborhoods-fill", "fill-opacity", 0.6);
  }
  updateAccessibilityLegendLabels();
}

function switchMode(mode) {
  if (mode === currentMode) return;
  const prevMode = currentMode;
  currentMode = mode;

  // Update toggle active state
  modeToggle.querySelectorAll(".mode-opt").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  // Clean up previous mode
  if (prevMode === "house") {
    clearRadiusSelection();
  }
  if (prevMode === "neighborhood") {
    hideNeighborhoodModal();
    selectedNeighborhood = null;
  }
  if (prevMode === "citywide") {
    hideCitywideModal();
  }

  // Activate new mode
  if (mode === "house") {
    enterHouseMode();
  } else if (mode === "neighborhood") {
    enterNeighborhoodMode();
  } else if (mode === "citywide") {
    enterCitywideMode();
  }
}

function setControlsForMode(mode) {
  const showPointsSection = showPointsToggle ? showPointsToggle.closest(".section") : null;
  const legendSection = document.querySelector(".legend-section");

  if (mode === "house") {
    if (showPointsSection) showPointsSection.style.display = "";
    if (legendSection) legendSection.style.display = "";
    if (modeHint) modeHint.textContent = "Click map to analyze nearest building";
  } else if (mode === "neighborhood") {
    if (showPointsSection) showPointsSection.style.display = "none";
    if (legendSection) legendSection.style.display = "";
    if (modeHint) modeHint.textContent = "Click a neighborhood for details";
  } else {
    if (showPointsSection) showPointsSection.style.display = "none";
    if (legendSection) legendSection.style.display = "none";
    if (modeHint) modeHint.textContent = "";
  }
}

function enterHouseMode() {
  setControlsForMode("house");

  // Show buildings, hide neighborhoods
  if (map.getLayer("buildings-fill")) {
    map.setLayoutProperty("buildings-fill", "visibility", "visible");
    map.setPaintProperty("buildings-fill", "fill-opacity", 0.85);
  }
  if (map.getLayer("neighborhoods-surface")) map.setLayoutProperty("neighborhoods-surface", "visibility", "none");
  if (map.getLayer("neighborhoods-fill")) map.setLayoutProperty("neighborhoods-fill", "visibility", "none");
  if (map.getLayer("neighborhoods-line")) map.setLayoutProperty("neighborhoods-line", "visibility", "none");
  if (map.getLayer("neighborhoods-label")) map.setLayoutProperty("neighborhoods-label", "visibility", "none");

  setAmenityPointsVisibility(showPointsToggle ? showPointsToggle.checked : true);
  updateBuildingColors();
}

function enterNeighborhoodMode() {
  console.log("[Neighborhood] Entering neighborhood mode");
  clearRadiusSelection();
  setControlsForMode("neighborhood");
  const radiusInfo = document.getElementById("radius-info");
  if (radiusInfo) radiusInfo.style.display = "none";

  // Hide building polygons and render a smooth aggregated heat layer.
  if (map.getLayer("buildings-fill")) {
    map.setLayoutProperty("buildings-fill", "visibility", "none");
  }
  if (map.getLayer("parks-fill")) {
    map.setLayoutProperty("parks-fill", "visibility", "none");
  }
  setAmenityPointsVisibility(false);

  // Load and show neighborhoods
  loadNeighborhoods().then(function (data) {
    Promise.all([loadNeighborhoodChartsPayload(), loadNeighborhoodSurfaceData()]).then(function () {
      const src = map.getSource("neighborhoods");
      if (src) src.setData(data);
      addNeighborhoodLayers();
      updateNeighborhoodColors();

      if (map.getLayer("neighborhoods-surface")) map.setLayoutProperty("neighborhoods-surface", "visibility", "visible");
      if (map.getLayer("neighborhoods-fill")) map.setLayoutProperty("neighborhoods-fill", "visibility", "visible");
      if (map.getLayer("neighborhoods-line")) map.setLayoutProperty("neighborhoods-line", "visibility", "visible");
      if (map.getLayer("neighborhoods-label")) map.setLayoutProperty("neighborhoods-label", "visibility", "visible");
      console.log("[Neighborhood] Layers visible, source updated with", data.features.length, "features");

      if (data.features.length > 0) {
        const bbox = turf.bbox(data);
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, duration: 600 });
      }
    });
  });
}

function exitNeighborhoodMode() {
  if (map.getLayer("buildings-fill")) {
    map.setLayoutProperty("buildings-fill", "visibility", "visible");
    map.setPaintProperty("buildings-fill", "fill-opacity", 0.85);
  }
  if (map.getLayer("neighborhoods-surface")) {
    map.setLayoutProperty("neighborhoods-surface", "visibility", "none");
  }
  if (map.getLayer("parks-fill")) {
    map.setLayoutProperty("parks-fill", "visibility", "visible");
  }
}

function enterCitywideMode() {
  clearRadiusSelection();
  setControlsForMode("citywide");

  // Show neighborhood polygons as context
  loadNeighborhoods().then(function (data) {
    loadNeighborhoodChartsPayload().then(function () {
      const src = map.getSource("neighborhoods");
      if (src) src.setData(data);
      addNeighborhoodLayers();
      updateNeighborhoodColors();
      if (map.getLayer("neighborhoods-surface")) map.setLayoutProperty("neighborhoods-surface", "visibility", "none");
      if (map.getLayer("neighborhoods-fill")) map.setLayoutProperty("neighborhoods-fill", "visibility", "visible");
      if (map.getLayer("neighborhoods-line")) map.setLayoutProperty("neighborhoods-line", "visibility", "visible");
      if (map.getLayer("neighborhoods-label")) map.setLayoutProperty("neighborhoods-label", "visibility", "visible");
    });
  });

  if (map.getLayer("buildings-fill")) {
    map.setPaintProperty("buildings-fill", "fill-opacity", 0.15);
    map.setPaintProperty("buildings-fill", "fill-color", "#9ca3af");
  }
  setAmenityPointsVisibility(false);

  // Show citywide modal
  loadCitywideStats().then(function (data) {
    if (!data) {
      const body = document.getElementById("citywide-body");
      if (body) body.innerHTML = '<div class="cw-section" style="text-align:center;padding:2em">Failed to load citywide data. Please reload the page.</div>';
    }
    renderCitywideModal();
    showCitywideModal();
  });
}

// Neighborhood modal
function showNeighborhoodModal(feature) {
  if (!feature || !feature.properties) return;
  selectedNeighborhood = feature;
  const props = feature.properties;
  const scoreMinutes = getScoreMinutes();
  const sfx = "_" + scoreMinutes + "min";
  const isWeighted = scoreMode === "weighted";

  if (isWeighted) {
    loadCitywideStats().then(function () {
      const avgScore = Number(props["avg_score_weighted" + sfx]) || 0;
      const cityAvgScore = getCitywideWeightedAverageScore(citywideStats, sfx);
      document.getElementById("neighborhood-modal-title").textContent = props.Name || "Unknown";
      document.getElementById("neighborhood-modal-subtitle").textContent =
        `${formatMetricNumber(avgScore)}/100 weighted score • Urban95`;

      const body = document.getElementById("neighborhood-modal-body");
      neighborhoodCharts.forEach(c => c.destroy());
      neighborhoodCharts = [];

      let html = "";
      html += '<div class="cw-summary">';
      html += `<div class="cw-stat-card"><div class="cw-stat-value">${props.building_count || 0}</div><div class="cw-stat-label">Buildings</div></div>`;
      html += `<div class="cw-stat-card"><div class="cw-stat-value">${formatMetricNumber(avgScore)}</div><div class="cw-stat-label">Neighborhood avg score</div></div>`;
      html += `<div class="cw-stat-card"><div class="cw-stat-value">${formatMetricNumber(cityAvgScore)}</div><div class="cw-stat-label">City avg score</div></div>`;
      html += `<div class="cw-stat-card"><div class="cw-stat-value">${props["coverage_weighted" + sfx] || 0}%</div><div class="cw-stat-label">Coverage</div></div>`;
      html += "</div>";

      const highlights = weightedCategoryHighlightsFromSource(props, sfx);
      html += '<div class="cw-section">';
      html += '<div class="cw-section-title">Urban95 category highlights</div>';
      html += '<div class="u95-highlight-grid">';
      highlights.forEach(function (item) {
        html += '<div class="u95-highlight-card">';
        html += `<div class="u95-highlight-name">${item.label}</div>`;
        html += `<div class="u95-highlight-score">${formatMetricNumber(item.score)}</div>`;
        html += `<div class="u95-highlight-meta">${Math.round(item.weight * 100)}% weight</div>`;
        html += "</div>";
      });
      html += '</div></div>';

      html += '<div class="cw-section">';
      html += '<div class="cw-section-title">Building score distribution (citywide)</div>';
      html += '<p style="font-size:12px;color:#64748b;margin:0 0 10px 0">Histogram of Urban95 scores across all buildings</p>';
      html += '<div class="cw-chart-container"><canvas id="hood-score-hist"></canvas></div>';
      html += '</div>';

      html += '<div class="cw-section">';
      html += '<div class="cw-section-title">Subcategory score comparison</div>';
      html += '<p style="font-size:12px;color:#64748b;margin:0 0 10px 0">Horizontal bars = neighborhood average, dashed marker = city average</p>';
      html += '<div class="u95-compare-container" id="hood-subcategory-compare-list"></div>';
      html += '</div>';

      body.innerHTML = html;
      document.getElementById("neighborhood-modal").classList.add("show");
      requestAnimationFrame(function () {
        renderNeighborhoodCharts({
          weighted: true,
          sfx: sfx,
          neighborhoodProps: props,
        });
      });
    });
    return;
  }

  loadNeighborhoodChartsPayload().then(function (invPayload) {
    const invLegacy = (invPayload.inventory_legacy && invPayload.inventory_legacy[props.Name]) || {};
    const pct = props[getNeighborhoodPercentileKey(sfx)] || 0;

    document.getElementById("neighborhood-modal-title").textContent = props.Name || "Unknown";
    document.getElementById("neighborhood-modal-subtitle").textContent =
      `${pct}${getOrdinalSuffix(pct)} percentile • ${scoreMinutes}-min walk • ${getScoreModeLabel()}`;

    const body = document.getElementById("neighborhood-modal-body");
    neighborhoodCharts.forEach(c => c.destroy());
    neighborhoodCharts = [];

    let html = "";
    html += '<div class="cw-summary">';
    html += `<div class="cw-stat-card"><div class="cw-stat-value">${props.building_count || 0}</div><div class="cw-stat-label">Buildings</div></div>`;
    html += `<div class="cw-stat-card"><div class="cw-stat-value">${pct}%</div><div class="cw-stat-label">Citywide percentile</div></div>`;
    html += `<div class="cw-stat-card"><div class="cw-stat-value">${props["coverage" + sfx] || 0}%</div><div class="cw-stat-label">Coverage</div></div>`;
    html += "</div>";
    html += '<div class="cw-section">';
    html += '<div class="cw-section-title">Amenity breakdown</div>';
    html += '<p style="font-size:12px;color:#64748b;margin:0 0 10px 0">Point counts in this area (legacy taxonomy)</p>';
    html += '<div class="cw-chart-container cw-pie-chart"><canvas id="hood-amenity-pie"></canvas></div>';
    html += "</div>";

    const barSlices = pieSlicesFromInventoryCounts(invLegacy);
    if (barSlices.values.length > 0) {
      html += '<div class="cw-section">';
      html += '<div class="cw-section-title">Counts by type</div>';
      html += `<div class="cw-chart-container" style="height:${Math.max(200, barSlices.values.length * 28)}px"><canvas id="hood-type-bar"></canvas></div>`;
      html += "</div>";
    }

    body.innerHTML = html;
    document.getElementById("neighborhood-modal").classList.add("show");
    requestAnimationFrame(function () {
      renderNeighborhoodCharts({ weighted: false, invObj: invLegacy });
    });
  });
}

function hideNeighborhoodModal() {
  const modal = document.getElementById("neighborhood-modal");
  if (modal) modal.classList.remove("show");
  neighborhoodCharts.forEach(c => c.destroy());
  neighborhoodCharts = [];
}

function renderNeighborhoodCharts(context) {
  if (typeof Chart === "undefined") return;
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";

  if (context && context.weighted) {
    const sfx = context.sfx;
    const neighborhoodProps = context.neighborhoodProps || {};
    const histCanvas = document.getElementById("hood-score-hist");
    if (histCanvas && citywideStats && citywideStats["distribution_weighted" + sfx]) {
      const dist = citywideStats["distribution_weighted" + sfx];
      const labels = dist.edges.slice(0, -1).map((e, i) => `${e}-${dist.edges[i + 1]}`);
      const breakpoints = [0, 25, 50, 75, 100];
      neighborhoodCharts.push(new Chart(histCanvas, {
        type: "bar",
        data: {
          labels,
          datasets: [{
            data: dist.counts,
            backgroundColor: dist.edges.slice(0, -1).map((edge, i) => {
              const midpoint = (edge + dist.edges[i + 1]) / 2;
              return getColorForValue(midpoint, breakpoints);
            }),
            borderRadius: 3,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 9 } } },
            y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 10 } }, title: { display: true, text: "Buildings", font: { size: 11 } } },
          },
        },
      }));
    }

    const subList = document.getElementById("hood-subcategory-compare-list");
    if (subList && citywideStats) {
      const rows = weightedSubcategoryComparisonRows(neighborhoodProps, citywideStats, sfx);
      renderWeightedSubcategoryComparisonList(subList, rows);
    }
    return;
  }

  const invObj = (context && context.invObj) || {};
  const pieCanvas = document.getElementById("hood-amenity-pie");
  const pie = pieSlicesFromInventoryCounts(invObj);
  if (pieCanvas && pie.values.length > 0) {
    neighborhoodCharts.push(new Chart(pieCanvas, {
      type: "doughnut",
      data: { labels: pie.labels, datasets: [{ data: pie.values, backgroundColor: pie.colors, borderWidth: 2, borderColor: "#fff" }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { boxWidth: 12, padding: 10, font: { size: 11 } } }
        }
      }
    }));
  }

  const barCanvas = document.getElementById("hood-type-bar");
  if (barCanvas && pie.values.length > 0) {
    neighborhoodCharts.push(new Chart(barCanvas, {
      type: "bar",
      data: {
        labels: pie.labels,
        datasets: [{ data: pie.values, backgroundColor: pie.colors, borderRadius: 3 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { color: "#f3f4f6" },
            ticks: { font: { size: 10 } },
            title: { display: true, text: "Points in neighborhood", font: { size: 11 } }
          },
          y: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
      }
    }));
  }
}

function getNeighborhoodFeatureAtPoint(point) {
  const hits = map.queryRenderedFeatures(point, { layers: ["neighborhoods-fill"] });
  if (!hits || hits.length === 0) return null;
  return hits[0];
}

function showNeighborhoodAreaTooltip(point, feature) {
  if (!feature || !feature.properties) {
    tooltip.style.display = "none";
    return;
  }
  const props = feature.properties || {};
  const hexId = props.hex_id || "Hex";
  const neighborhoodName = props.neighborhood_name || "Unknown neighborhood";
  const hasBuildings = Number(props.has_buildings) === 1;
  if (!hasBuildings) {
    tooltip.textContent = `Hexagon ${hexId} in ${neighborhoodName}\nNo residential buildings`;
  } else {
    const scoreKey = getNeighborhoodSurfaceScorePropertyKey() || "score";
    const score = Math.max(0, Math.min(100, Number(props[scoreKey]) || 0));
    if (scoreMode === "weighted") {
      tooltip.textContent = `${hexId} in ${neighborhoodName}\nArea score ${formatMetricNumber(score)}/100`;
    } else {
      const pct = Math.round(score);
      tooltip.textContent = `${hexId} in ${neighborhoodName}\nArea score ${pct}${getOrdinalSuffix(pct)} percentile`;
    }
  }
  tooltip.style.display = "block";
  tooltip.style.left = (point.x + 12) + "px";
  tooltip.style.top = (point.y + 12) + "px";
}

// Neighborhood click handlers
map.on("click", "neighborhoods-fill", function(e) {
  if (currentMode !== "neighborhood") return;
  const feature = e.features && e.features.length > 0 ? e.features[0] : null;
  if (!feature) return;
  showNeighborhoodModal(feature);
});

map.on("click", "neighborhoods-surface", function(e) {
  if (currentMode !== "neighborhood") return;
  const neighborhoodFeature = getNeighborhoodFeatureAtPoint(e.point);
  if (!neighborhoodFeature) return;
  showNeighborhoodModal(neighborhoodFeature);
});

map.on("mouseenter", "neighborhoods-fill", function() {
  if (currentMode === "neighborhood") map.getCanvas().style.cursor = "pointer";
});

map.on("mouseenter", "neighborhoods-surface", function() {
  if (currentMode === "neighborhood") map.getCanvas().style.cursor = "pointer";
});

map.on("mouseleave", "neighborhoods-fill", function() {
  if (currentMode === "neighborhood") {
    map.getCanvas().style.cursor = "";
    tooltip.style.display = "none";
  }
});

map.on("mouseleave", "neighborhoods-surface", function() {
  if (currentMode === "neighborhood") {
    map.getCanvas().style.cursor = "";
    tooltip.style.display = "none";
  }
});

map.on("mousemove", "neighborhoods-fill", function(e) {
  if (currentMode !== "neighborhood") return;
  const areaFeature = map.queryRenderedFeatures(e.point, { layers: ["neighborhoods-surface"] })[0];
  showNeighborhoodAreaTooltip(e.point, areaFeature || null);
});

map.on("mousemove", "neighborhoods-surface", function(e) {
  if (currentMode !== "neighborhood" || !e.features || e.features.length === 0) return;
  showNeighborhoodAreaTooltip(e.point, e.features[0]);
});

// ─── Citywide Modal ─────────────────────────────────────────────────

function showCitywideModal() {
  const modal = document.getElementById("citywide-modal");
  if (modal) modal.classList.add("show");
}

function hideCitywideModal() {
  const modal = document.getElementById("citywide-modal");
  if (modal) modal.classList.remove("show");
  citywideCharts.forEach(c => c.destroy());
  citywideCharts = [];
}

document.getElementById("citywide-close").addEventListener("click", function() {
  hideCitywideModal();
  switchMode("house");
});

document.getElementById("citywide-modal").addEventListener("click", function(e) {
  if (e.target === this) {
    hideCitywideModal();
    switchMode("house");
  }
});

// Neighborhood modal close handlers
document.getElementById("neighborhood-modal-close").addEventListener("click", hideNeighborhoodModal);
document.getElementById("neighborhood-modal").addEventListener("click", function(e) {
  if (e.target === this) hideNeighborhoodModal();
});

(function initScoreExplainModal() {
  const el = document.getElementById("score-explain-modal");
  const closeBtn = document.getElementById("score-explain-modal-close");
  if (closeBtn && el) {
    closeBtn.addEventListener("click", hideScoreExplainModal);
    el.addEventListener("click", function (e) {
      if (e.target === el) hideScoreExplainModal();
    });
  }
})();

function renderCitywideModal() {
  const body = document.getElementById("citywide-body");
  if (!body || !citywideStats) return;

  citywideCharts.forEach(c => c.destroy());
  citywideCharts = [];

  const scoreMinutes = getScoreMinutes();
  const sfx = "_" + scoreMinutes + "min";
  const stats = citywideStats;
  const isWeighted = scoreMode === "weighted";

  let html = '';

  if (isWeighted) {
    const highlights = weightedCategoryHighlightsFromSource(stats, sfx);
    html += '<div class="cw-summary">';
    html += `<div class="cw-stat-card"><div class="cw-stat-value">${(stats.total_buildings || 0).toLocaleString()}</div><div class="cw-stat-label">Buildings</div></div>`;
    html += `<div class="cw-stat-card"><div class="cw-stat-value">${formatMetricNumber(getCitywideWeightedAverageScore(stats, sfx))}</div><div class="cw-stat-label">City average score</div></div>`;
    html += '</div>';

    html += '<div class="cw-section">';
    html += '<div class="cw-section-title">Urban95 category highlights</div>';
    html += '<div class="u95-highlight-grid">';
    highlights.forEach(function (item) {
      html += '<div class="u95-highlight-card">';
      html += `<div class="u95-highlight-name">${item.label}</div>`;
      html += `<div class="u95-highlight-score">${formatMetricNumber(item.score)}</div>`;
      html += `<div class="u95-highlight-meta">${Math.round(item.weight * 100)}% weight</div>`;
      html += '</div>';
    });
    html += '</div></div>';

    html += '<div class="cw-section">';
    html += '<div class="cw-section-title">Building score distribution — Urban95</div>';
    html += '<p style="font-size:12px;color:#64748b;margin:0 0 10px 0">Citywide distribution</p>';
    html += '<div class="cw-chart-container"><canvas id="cw-score-hist"></canvas></div>';
    html += '</div>';

    html += '<div class="cw-section">';
    html += '<div class="cw-section-title">Average score by neighborhood</div>';
    html += '<div class="cw-chart-container" style="height:420px"><canvas id="cw-neighborhood-score-bar"></canvas></div>';
    html += '</div>';
  } else {
    const amenityTotal = stats.total_amenities != null ? stats.total_amenities : Object.values(stats.amenity_counts || {}).reduce(function (a, b) {
      return a + b;
    }, 0);
    html += '<div class="cw-summary">';
    html += `<div class="cw-stat-card"><div class="cw-stat-value">${(stats.total_buildings || 0).toLocaleString()}</div><div class="cw-stat-label">Buildings</div></div>`;
    html += `<div class="cw-stat-card"><div class="cw-stat-value">${amenityTotal.toLocaleString()}</div><div class="cw-stat-label">Amenities</div></div>`;
    html += '</div>';

    html += '<div class="cw-section">';
    html += '<div class="cw-section-title">Amenity inventory</div>';
    html += '<p style="font-size:12px;color:#64748b;margin:0 0 10px 0">Point counts by type (legacy taxonomy)</p>';
    html += '<div class="cw-chart-container cw-pie-chart"><canvas id="cw-amenity-pie"></canvas></div>';
    html += '</div>';

    const histDist =
      scoreMode === "expanded" && stats["distribution_expanded" + sfx]
        ? "Amenities focus"
        : "reachability index";
    html += '<div class="cw-section">';
    html += `<div class="cw-section-title">Building score distribution — ${histDist}</div>`;
    html += `<p style="font-size:12px;color:#64748b;margin:0 0 10px 0">${scoreMinutes}-min walk • Matches ${getScoreModeLabel()} in Building mode</p>`;
    html += '<div class="cw-chart-container"><canvas id="cw-score-hist"></canvas></div>';
    html += '</div>';

    const ranking = (stats.neighborhood_ranking || [])
      .slice()
      .sort(function (a, b) {
        return (Number(b["pct_overall" + sfx]) || 0) - (Number(a["pct_overall" + sfx]) || 0);
      });
    html += '<div class="cw-section">';
    html += '<div class="cw-section-title">Neighborhood ranking</div>';
    html += '<ul class="cw-ranking-list">';
    ranking.forEach((r, i) => {
      const score = Number(r["avg_overall" + sfx]) || 0;
      const pct = Math.min(100, Math.max(0, Number(r["pct_overall" + sfx]) || 0));
      html += `<div class="cw-ranking-item">`;
      html += `<div class="cw-rank-num">${i + 1}</div>`;
      html += `<div class="cw-rank-name">${r.name}</div>`;
      html += `<div class="cw-rank-bar-wrap"><div class="cw-rank-bar" style="width:${pct}%;background:#22c55e"></div></div>`;
      html += `<div class="cw-rank-score"><strong>${pct}%</strong><span class="cw-rank-sub">${formatMetricNumber(score)} index</span></div>`;
      html += `</div>`;
    });
    html += '</ul></div>';
  }

  body.innerHTML = html;

  // Render charts after DOM update
  requestAnimationFrame(() => renderCitywideCharts(sfx));
}

function renderCitywideCharts(sfx) {
  if (!citywideStats || typeof Chart === "undefined") return;

  const chartFont = { family: "Inter, system-ui, sans-serif" };
  Chart.defaults.font.family = chartFont.family;

  if (scoreMode !== "weighted") {
    const pieCanvas = document.getElementById("cw-amenity-pie");
    if (pieCanvas) {
      const counts = citywideStats.amenity_counts || {};
      const labels = [];
      const values = [];
      const colors = [];
      Object.entries(counts)
        .filter(([type]) => type !== "trees" && type !== "street-lights")
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
          const config = getAmenityConfig(type);
          labels.push(config.label);
          values.push(count);
          colors.push(config.color);
        });

      const pieChart = new Chart(pieCanvas, {
        type: "doughnut",
        data: {
          labels,
          datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "right", labels: { boxWidth: 12, padding: 8, font: { size: 11 } } }
          }
        }
      });
      citywideCharts.push(pieChart);
    }
  }

  const histCanvas = document.getElementById("cw-score-hist");
  if (histCanvas) {
    let dist = null;
    if (scoreMode === "weighted" && citywideStats["distribution_weighted" + sfx]) {
      dist = citywideStats["distribution_weighted" + sfx];
    } else if (scoreMode === "expanded" && citywideStats["distribution_expanded" + sfx]) {
      dist = citywideStats["distribution_expanded" + sfx];
    } else {
      dist = citywideStats["distribution" + sfx];
    }
    if (dist) {
      const bldBreakpoints = scoreMode === "weighted" ? [0, 25, 50, 75, 100] : percentileBreakpoints(collectBuildingScores());
      const labels = dist.edges.slice(0, -1).map((e, i) => `${e}-${dist.edges[i + 1]}`);
      const histChart = new Chart(histCanvas, {
        type: "bar",
        data: {
          labels,
          datasets: [{
            data: dist.counts,
            backgroundColor: dist.edges.slice(0, -1).map((edge, i) => {
              const midpoint = (edge + dist.edges[i + 1]) / 2;
              return getColorForValue(midpoint, bldBreakpoints);
            }),
            borderRadius: 3,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 9 } } },
            y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 10 } }, title: { display: true, text: "Buildings", font: { size: 11 } } }
          }
        }
      });
      citywideCharts.push(histChart);
    }
  }

  if (scoreMode === "weighted") {
    const neighborhoodCanvas = document.getElementById("cw-neighborhood-score-bar");
    if (neighborhoodCanvas) {
      const ranking = weightedNeighborhoodRankingRows(citywideStats, sfx);
      citywideCharts.push(new Chart(neighborhoodCanvas, {
        type: "bar",
        data: {
          labels: ranking.map(r => r.name),
          datasets: [{
            label: "Average Urban95 score",
            data: ranking.map(r => Number(r["avg_score_weighted" + sfx]) || 0),
            backgroundColor: "#2563eb",
            borderRadius: 3,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          plugins: { legend: { display: false } },
          scales: {
            x: { min: 0, max: 100, title: { display: true, text: "Score (0-100)" } },
            y: { ticks: { font: { size: 10 } } },
          },
        },
      }));
    }
  }
}

// Mode toggle click handler
modeToggle.addEventListener("click", function(e) {
  const btn = e.target.closest(".mode-opt");
  if (!btn) return;
  const mode = btn.dataset.mode;

  // Exit previous neighborhood mode visuals
  if (currentMode === "neighborhood" || currentMode === "citywide") {
    exitNeighborhoodMode();
  }

  switchMode(mode);
});

// Update walking time handler to also update neighborhood colors
radiusToggle.addEventListener("click", function() {
  if (currentMode === "neighborhood") {
    updateNeighborhoodColors();
    if (selectedNeighborhood && document.getElementById("neighborhood-modal").classList.contains("show")) {
      showNeighborhoodModal(selectedNeighborhood);
    }
  }
  if (currentMode === "citywide" && document.getElementById("citywide-modal").classList.contains("show")) {
    renderCitywideModal();
  }
});
