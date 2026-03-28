/* global maplibregl, turf, deck */

const BASE = "./data";
const ICONS_BASE = "./icons";
const BUILDINGS_URL = BASE + "/buildings_accessibility.geojson";
const PARKS_URL = BASE + "/parks.geojson";
const TREES_URL = BASE + "/trees.geojson";
const AMENITIES_ALL_URL = BASE + "/amenities_new.geojson";
const ISOCHRONES_URL = BASE + "/isochrones.geojson";
const NEIGHBORHOODS_URL = BASE + "/neighborhoods.geojson";
const CITYWIDE_STATS_URL = BASE + "/citywide_stats.json";

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
  // New Categories
  bicycle_track: { color: "#0369a1", icon: "bicycle", label: "Bicycle Tracks" },
  businesscenters: { color: "#1d4ed8", icon: "building", label: "Business Centers" },
  "community-centers": { color: "#7e22ce", icon: "town-hall", label: "Community Centers" },
  health: { color: "#C62828", icon: "hospital", label: "Healthcare Facilities" },
  playgrounds: { color: "#ea580c", icon: "park-alt1", label: "Playgrounds" },
  roads: { color: "#475569", icon: "car", label: "Roads" },
  shelters: { color: "#0f766e", icon: "building", label: "Shelters" },
  "street-light": { color: "#ca8a04", icon: "marker", label: "Street Lights" }
};

const DEFAULT_CONFIG = { color: "#6b7280", icon: "marker", label: "Other" };

function getAmenityConfig(type) {
  if (!type) return DEFAULT_CONFIG;
  const config = AMENITY_TYPE_CONFIG[type.toLowerCase()];
  return config || DEFAULT_CONFIG;
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
      neighborhoods: {
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
const selectAllBtn = document.getElementById("select-all-btn");
const filterBackdrop = document.getElementById("filter-backdrop");
const legendLabels = document.getElementById("legend-labels");
const tooltip = document.getElementById("tooltip");
const radiusToggle = document.getElementById("radius-toggle");
const showPointsToggle = document.getElementById("show-points-toggle");
const metricDisplayToggle = document.getElementById("metric-display-toggle");

const AMENITY_POINT_LAYER_IDS = [
  "tree-icons",
  "amenity-icons",
];

const AMENITY_CLUSTER_MIN_ZOOM = 20; // Disabled clustering to show actual points
const AMENITY_CLUSTER_PIXEL_RADIUS = 36;
const AMENITY_CLUSTER_DISSOLVE_ZOOM = 16;
const AMENITY_CLUSTER_MAX_COUNT = 50;

// Check if we're on a touch device
const isTouchDevice = window.matchMedia("(hover: none) and (pointer: coarse)").matches || 
                      window.matchMedia("(max-width: 480px)").matches;

let walkMinutes = 5;
let allAmenityTypes = [];
let typesWithData = new Set();
let allAmenitiesData = null;
let allTreesData = null;
let buildingsData = null;
let buildingCentroids = [];
let selectedAmenityTypes = new Set();
let allFilterTypes = [];
let selectedBuildingCentroid = null;
let amenitiesInRadiusIds = new Set();
let treesInRadiusIds = new Set();
let iconsLoaded = false;
let treesLoadStarted = false;
let isochroneLoadStarted = false;
let isochronesLoaded = false;
let isochroneIndex = {};
let visibleAmenityFeatures = [];
let deckAmenityOverlay = null;
let metricDisplayMode = "raw";
let _deckUpdateTimer = null;
let _deckHovering = false;
let _lastDeckClickTime = 0;
let latestRadiusCounts = {};
const percentileSeriesCache = new Map();

// Analysis mode state
let currentMode = "house"; // "house" | "neighborhood" | "citywide"
let neighborhoodsData = null;
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
  isochrones: false,
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
      updateTreesSource();
      updateBuildingColors();
      
      if (selectedBuildingCentroid) {
        selectBuilding(selectedBuildingCentroid, false);
      }
    })
    .catch(function (err) {
      console.error("Failed to load trees:", err);
      treesLoadStarted = false;
    });
}

// Update amenities source (without trees)
function updateAmenitiesSource() {
  if (!allAmenitiesData) return;
  
  const source = map.getSource("amenities");
  if (!source) return;
  
  // If nothing selected, show nothing
  if (selectedAmenityTypes.size === 0) {
    source.setData({ type: "FeatureCollection", features: [] });
    visibleAmenityFeatures = [];
    updateDeckAmenityLayers();
    return;
  }
  
  const useAll = selectedAmenityTypes.size === allFilterTypes.length;
  const showAmenities = useAll || Array.from(selectedAmenityTypes).some(t => t !== "trees");
  
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

// Update trees source — only trees within the selected building's isochrone are shown
function updateTreesSource() {
  if (!allTreesData) return;

  const source = map.getSource("trees");
  if (!source) return;

  if (selectedAmenityTypes.size === 0 || treesInRadiusIds.size === 0) {
    source.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  const useAll = selectedAmenityTypes.size === allFilterTypes.length;
  const showTrees = useAll || selectedAmenityTypes.has("trees");

  if (!showTrees) {
    source.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  const inRadiusFeatures = allTreesData.features.filter((_, index) => treesInRadiusIds.has(index));
  source.setData({ type: "FeatureCollection", features: inRadiusFeatures });
}


// Add tree icon layer (only trees within selected building's isochrone are shown)
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

  const iconMatch = ["match", ["get", "amenity_type"]];
  const colorMatch = ["match", ["get", "amenity_type"]];

  Object.entries(AMENITY_TYPE_CONFIG).forEach(([type, config]) => {
    iconMatch.push(type, config.icon);
    colorMatch.push(type, config.color);
  });
  
  iconMatch.push(DEFAULT_CONFIG.icon);
  colorMatch.push(DEFAULT_CONFIG.color);

  map.addLayer({
    id: "amenity-icons",
    type: "symbol",
    source: "amenities",
    layout: {
      "icon-image": iconMatch,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 18, 1.0],
      "icon-allow-overlap": false,
      "icon-ignore-placement": false,
    },
    paint: {
      "icon-color": colorMatch,
      "icon-opacity": 0.9,
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

// Collect weighted accessibility score for every building under current filter selection
function collectBuildingScores() {
  if (!buildingsData || !buildingsData.features || buildingsData.features.length === 0) return [];
  if (selectedAmenityTypes.size === 0 || allFilterTypes.length === 0) return [];

  const suffix = "_" + walkMinutes + "min";
  const useAll = selectedAmenityTypes.size === allFilterTypes.length;

  return buildingsData.features.map(f => {
    const props = f.properties || {};
    let val = 0;
    if (useAll) {
      val = (Number(props["num_amenities" + suffix]) || 0) + (Number(props["num_trees" + suffix]) || 0) * 0.25;
    } else {
      selectedAmenityTypes.forEach(type => {
        if (type === "trees") {
          val += (Number(props["num_trees" + suffix]) || 0) * 0.25;
        } else {
          val += Number(props["amen_" + type + suffix]) || 0;
        }
      });
    }
    return val;
  });
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

// Update the legend labels
function updateLegendLabels(breakpoints) {
  if (!legendLabels) return;

  const labels = breakpoints.map((val, i) => {
    const rounded = Math.round(val);
    if (i === breakpoints.length - 1) return rounded + "+";
    return rounded;
  });

  legendLabels.innerHTML = labels.map(l => `<span>${l}</span>`).join("");
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
  
  // Wait for filter types to be initialized
  if (allFilterTypes.length === 0) return;
  
  // If nothing selected, all buildings show as lowest accessibility (red)
  if (selectedAmenityTypes.size === 0) {
    if (map.getLayer("buildings-fill")) {
      map.setPaintProperty("buildings-fill", "fill-color", "#ef4444");
    }
    updateLegendLabels([0, 0, 0, 0, 0]);
    return;
  }
  
  const useAll = selectedAmenityTypes.size === allFilterTypes.length;

  // Percentile-based breakpoints from building score distribution
  const scores = collectBuildingScores();
  const breakpoints = percentileBreakpoints(scores);

  updateLegendLabels(breakpoints);
  
  // Build the sum expression (trees count 1/4 as much)
  const sfx = "_" + walkMinutes + "min";
  let sumExpr;
  if (useAll) {
    sumExpr = ["+", 
      ["coalesce", ["to-number", ["get", "num_amenities" + sfx]], 0],
      ["*", ["coalesce", ["to-number", ["get", "num_trees" + sfx]], 0], 0.25]
    ];
  } else {
    const types = Array.from(selectedAmenityTypes);
    const sumParts = types.map(type => {
      if (type === "trees") {
        return ["*", ["coalesce", ["to-number", ["get", "num_trees" + sfx]], 0], 0.25];
      }
      const amenKey = "amen_" + type + sfx;
      return ["coalesce", ["to-number", ["get", amenKey]], 0];
    });
    if (sumParts.length === 1) {
      sumExpr = sumParts[0];
    } else {
      sumExpr = ["+", ...sumParts];
    }
  }
  
  // Red-green gradient with dynamic breakpoints
  const expression = [
    "interpolate",
    ["linear"],
    sumExpr,
    breakpoints[0], "#ef4444",   // red-500
    breakpoints[1], "#f97316",   // orange-500
    breakpoints[2], "#eab308",   // yellow-500
    breakpoints[3], "#84cc16",   // lime-500
    breakpoints[4], "#22c55e",   // green-500
  ];
  
  if (map.getLayer("buildings-fill")) {
    map.setPaintProperty("buildings-fill", "fill-color", expression);
  }
}

function getBuildingOverallScore(props, minutes) {
  const suffix = "_" + minutes + "min";
  const amenities = Number(props["num_amenities" + suffix]) || 0;
  const trees = Number(props["num_trees" + suffix]) || 0;
  return amenities + trees * 0.25;
}

function getBuildingTypeScore(props, type, minutes) {
  const suffix = "_" + minutes + "min";
  if (type === "trees") {
    return (Number(props["num_trees" + suffix]) || 0) * 0.25;
  }
  return Number(props["amen_" + type + suffix]) || 0;
}

function computePercentileRank(values, targetValue) {
  if (!values || values.length === 0) return null;
  let atOrBelow = 0;
  values.forEach((value) => {
    if (value <= targetValue) atOrBelow += 1;
  });
  return Math.round((atOrBelow / values.length) * 100);
}

function computeAverage(values) {
  if (!values || values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
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

function getPercentileSeriesForMinutes(minutes) {
  const cacheKey = String(minutes);
  if (percentileSeriesCache.has(cacheKey)) {
    return percentileSeriesCache.get(cacheKey);
  }

  if (!buildingsData || !Array.isArray(buildingsData.features)) {
    return null;
  }

  const byType = {};
  allFilterTypes.forEach((type) => {
    byType[type] = [];
  });

  const overall = [];
  buildingsData.features.forEach((feature) => {
    const props = feature.properties || {};
    overall.push(getBuildingOverallScore(props, minutes));
    allFilterTypes.forEach((type) => {
      byType[type].push(getBuildingTypeScore(props, type, minutes));
    });
  });

  const series = { overall, byType };
  percentileSeriesCache.set(cacheKey, series);
  return series;
}

function buildPercentileMetrics(buildingProps) {
  if (!buildingProps) return null;
  const series = getPercentileSeriesForMinutes(walkMinutes);
  if (!series || series.overall.length === 0) return null;

  const overallScore = getBuildingOverallScore(buildingProps, walkMinutes);
  const overallPercentile = computePercentileRank(series.overall, overallScore);
  const overallAverage = computeAverage(series.overall);

  const perAmenity = allFilterTypes.map((type) => {
    const config = getAmenityConfig(type);
    const score = getBuildingTypeScore(buildingProps, type, walkMinutes);
    const values = series.byType[type] || [];
    const percentile = computePercentileRank(values, score);
    const average = computeAverage(values);
    return {
      type,
      label: config.label,
      color: config.color || DEFAULT_CONFIG.color,
      score,
      average,
      percentile
    };
  });

  return {
    overallScore,
    overallAverage,
    overallPercentile,
    perAmenity
  };
}

function updateFilterLabel() {
  const total = allFilterTypes.length;
  const selected = selectedAmenityTypes.size;
  
  if (selected === 0 || selected === total) {
    filterLabel.textContent = "All Types";
  } else if (selected === 1) {
    const type = Array.from(selectedAmenityTypes)[0];
    const config = AMENITY_TYPE_CONFIG[type];
    filterLabel.textContent = config ? config.label : type;
  } else {
    filterLabel.textContent = selected + " selected";
  }
  
  // Update select all button text
  if (selectAllBtn) {
    selectAllBtn.textContent = (selected === total) ? "Deselect All" : "Select All";
  }
}

function handleFilterChange(e) {
  const checkbox = e.target;
  const value = checkbox.value;
  
  if (checkbox.checked) {
    selectedAmenityTypes.add(value);
  } else {
    selectedAmenityTypes.delete(value);
  }
  
  updateFilterLabel();
  updateAmenitiesSource();
  updateTreesSource();
  updateBuildingColors();
  
  if (selectedBuildingCentroid) {
    selectBuilding(selectedBuildingCentroid, false);
  }
}

function toggleSelectAll() {
  const allSelected = selectedAmenityTypes.size === allFilterTypes.length;
  
  if (allSelected) {
    // Deselect all
    selectedAmenityTypes.clear();
    filterItems.querySelectorAll('input').forEach(cb => cb.checked = false);
  } else {
    // Select all
    selectedAmenityTypes.clear();
    allFilterTypes.forEach(type => selectedAmenityTypes.add(type));
    filterItems.querySelectorAll('input').forEach(cb => cb.checked = true);
  }
  
  updateFilterLabel();
  updateAmenitiesSource();
  updateTreesSource();
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
  selectedAmenityTypes.clear();
  
  // Add trees first if tree data is loaded
  if (allTreesData && allTreesData.features.length > 0) {
    allFilterTypes.push("trees");
    selectedAmenityTypes.add("trees");
    const treesConfig = AMENITY_TYPE_CONFIG["trees"];
    const treesColor = treesConfig.color || DEFAULT_CONFIG.color;
    const treesLabel = document.createElement("label");
    treesLabel.className = "filter-item";
    treesLabel.innerHTML = `<input type="checkbox" value="trees" checked /><span class="filter-type-pill" style="--pill-color:${treesColor};--pill-bg:${colorWithAlpha(treesColor, 0.14)};--pill-border:${colorWithAlpha(treesColor, 0.35)}">${treesConfig.label}</span>`;
    treesLabel.querySelector("input").addEventListener("change", handleFilterChange);
    filterItems.appendChild(treesLabel);
  }
  
  const typesWithPoints = types.filter(t => typesWithData.has(t));
  
  typesWithPoints.forEach(type => {
    allFilterTypes.push(type);
    selectedAmenityTypes.add(type);
    const config = getAmenityConfig(type);
    const label = document.createElement("label");
    label.className = "filter-item";
    const color = config.color || DEFAULT_CONFIG.color;
    label.innerHTML = `<input type="checkbox" value="${type}" checked /><span class="filter-type-pill" style="--pill-color:${color};--pill-bg:${colorWithAlpha(color, 0.14)};--pill-border:${colorWithAlpha(color, 0.35)}">${config.label}</span>`;
    label.querySelector("input").addEventListener("change", handleFilterChange);
    filterItems.appendChild(label);
  });
  
  updateFilterLabel();
  percentileSeriesCache.clear();
}

// Track if we just opened the popup (to prevent immediate close on touch)
let popupJustOpened = false;

function openFilterPopup() {
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

selectAllBtn.addEventListener("click", toggleSelectAll);

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
  const counts = {};

  if (selectedAmenityTypes.size === 0 || !polygon) {
    return { amenityIndices, treeIndices, counts };
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

  return { amenityIndices, treeIndices, counts };
}

// Smooth ease-in-out curve for pan animations
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// Select a building and show its walking isochrone with items
function selectBuilding(building, doFly = true) {
  selectedBuildingCentroid = building;

  // Highlight the selected building outline
  const buildingSource = map.getSource("selected-building");
  if (buildingSource && building.feature) {
    buildingSource.setData({ type: "FeatureCollection", features: [building.feature] });
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
    latestRadiusCounts = {};
    updateAmenitiesSource();
    updateTreesSource();

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
    latestRadiusCounts = result.counts;
    updateAmenitiesSource();
    updateTreesSource();
    updateRadiusInfo(result.counts);
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

// Pluralize a label based on count
function pluralize(label, count) {
  if (count === 1) {
    if (label === "Trees") return "tree";
    if (label === "Healthcare") return "healthcare facility";
    if (label === "Education") return "education facility";
    if (label === "Commercial") return "commercial establishment";
    if (label === "Services") return "service";
    if (label === "Religious") return "religious institution";
    if (label === "Recreation") return "recreation facility";
    if (label === "Public") return "public institution";
    if (label === "Fitness") return "fitness facility";
    if (label === "Transport") return "transport stop";
    if (label === "Financial") return "financial service";
    if (label === "Tourism") return "tourism facility";
    if (label === "Senior") return "senior facility";
    return label.toLowerCase();
  } else {
    if (label === "Trees") return "trees";
    if (label === "Healthcare") return "healthcare facilities";
    if (label === "Education") return "education facilities";
    if (label === "Commercial") return "commercial establishments";
    if (label === "Services") return "services";
    if (label === "Religious") return "religious institutions";
    if (label === "Recreation") return "recreation facilities";
    if (label === "Public") return "public institutions";
    if (label === "Fitness") return "fitness facilities";
    if (label === "Transport") return "transport stops";
    if (label === "Financial") return "financial services";
    if (label === "Tourism") return "tourism facilities";
    if (label === "Senior") return "senior facilities";
    return label.toLowerCase() + "s";
  }
}

// Update displayed radius info
function updateRadiusInfo(counts) {
  const infoPanel = document.getElementById("radius-info");
  if (!infoPanel) return;

  if (metricDisplayMode === "percentile") {
    infoPanel.classList.add("percentile-mode");
    if (!selectedBuildingCentroid || !selectedBuildingCentroid.feature) {
      infoPanel.style.display = "none";
      return;
    }

    const metrics = buildPercentileMetrics(selectedBuildingCentroid.feature.properties || {});
    if (!metrics || metrics.overallPercentile == null) {
      infoPanel.innerHTML = '<div class="radius-count">Percentile data unavailable</div>';
      infoPanel.style.display = "block";
      return;
    }

    let html = '<div class="percentile-summary">';
    html += '<div class="percentile-label">All amenities</div>';
    html += `<div class="percentile-value">${metrics.overallPercentile}<span>${getOrdinalSuffix(metrics.overallPercentile)}</span><em>percentile</em></div>`;
    html += `<div class="percentile-context">Your score ${formatMetricNumber(metrics.overallScore)} vs citywide average ${formatMetricNumber(metrics.overallAverage)}</div>`;
    html += "</div>";

    html += '<div class="percentile-breakdown">';
    metrics.perAmenity.forEach((metric) => {
      html += `<span class="percentile-item"><span class="percentile-dot" style="background:${metric.color}"></span>${metric.label}: <strong>${metric.percentile}%</strong></span>`;
    });
    html += "</div>";

    infoPanel.innerHTML = html;
    infoPanel.style.display = "block";
    return;
  }

  infoPanel.classList.remove("percentile-mode");
  
  // If nothing selected, show message
  if (selectedAmenityTypes.size === 0) {
    infoPanel.innerHTML = '<div class="radius-count">No types selected</div>';
    infoPanel.style.display = "block";
    return;
  }
  
  const useAll = selectedAmenityTypes.size === allFilterTypes.length;
  
  let html = '<div class="radius-count">';
  let total = 0;
  
  // Counts are already filtered by getItemsInPolygon
  Object.values(counts).forEach(count => {
    total += count;
  });
  
  // Check which types actually have items
  const typesWithItems = Object.entries(counts).filter(([, count]) => count > 0);
  
  if (typesWithItems.length === 1) {
    // Only one type has items - use specific name
    const [type] = typesWithItems[0];
    const config = AMENITY_TYPE_CONFIG[type];
    const label = config ? config.label : type.replace(/_/g, " ");
    html += `${total} ${pluralize(label, total)} within ${walkMinutes} min walk`;
  } else if (useAll) {
    html += `${total} items within ${walkMinutes} min walk`;
  } else if (selectedAmenityTypes.size === 1) {
    const type = Array.from(selectedAmenityTypes)[0];
    const config = AMENITY_TYPE_CONFIG[type];
    const label = config ? config.label : type.replace(/_/g, " ");
    html += `${total} ${pluralize(label, total)} within ${walkMinutes} min walk`;
  } else {
    html += `${total} of selected types within ${walkMinutes} min walk`;
  }
  
  html += '</div>';
  
  // Show breakdown by type (limit to top 8 if many types)
  const sortedCounts = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sortedCounts.length > 1) {
    const maxToShow = 8;
    const toShow = sortedCounts.slice(0, maxToShow);
    const remaining = sortedCounts.length - maxToShow;
    
    html += '<div class="radius-breakdown">';
    toShow.forEach(([type, count]) => {
      const config = getAmenityConfig(type);
      html += `<span class="radius-type"><span style="color:${config.color}">●</span> ${config.label}: ${count}</span>`;
    });
    if (remaining > 0) {
      html += `<span class="radius-type">+${remaining} more</span>`;
    }
    html += '</div>';
  }
  
  infoPanel.innerHTML = html;
  infoPanel.style.display = "block";
}

// Clear the radius selection
function clearRadiusSelection() {
  selectedBuildingCentroid = null;
  amenitiesInRadiusIds.clear();
  treesInRadiusIds.clear();
  latestRadiusCounts = {};
  
  const source = map.getSource("radius-circle");
  if (source) source.setData({ type: "FeatureCollection", features: [] });
  
  const buildingSource = map.getSource("selected-building");
  if (buildingSource) buildingSource.setData({ type: "FeatureCollection", features: [] });
  
  updateAmenitiesSource();
  updateTreesSource();
  
  const infoPanel = document.getElementById("radius-info");
  if (infoPanel) infoPanel.style.display = "none";
}

if (metricDisplayToggle) {
  metricDisplayToggle.addEventListener("change", function (e) {
    const input = e.target;
    if (!input || input.name !== "metric-display") return;
    metricDisplayMode = input.value === "percentile" ? "percentile" : "raw";
    if (selectedBuildingCentroid) {
      updateRadiusInfo(latestRadiusCounts);
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

map.on("mouseenter", "amenity-icons", () => {
  if (!_deckHovering) map.getCanvas().style.cursor = "pointer";
});
map.on("mouseleave", "amenity-icons", () => {
  if (!_deckHovering) map.getCanvas().style.cursor = "";
  tooltip.style.display = "none";
});
map.on("mousemove", "amenity-icons", (e) => {
  if (_deckHovering || e.features.length === 0) return;
  const props = e.features[0].properties;
  const config = getAmenityConfig(props.amenity_type);
  const typeName = config.label || props.amenity_type;
  const name = props.name || props.hebrew_nam || typeName;
  tooltip.textContent = name === typeName ? name : `${name} (${typeName})`;
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
  
  // Load amenities first (trees are lazy-loaded when needed since they're only visible at zoom 14+)
  setLoadingStatus("Loading amenities...");
  fetch(AMENITIES_ALL_URL).then(r => r.json()).then(function (amenitiesData) {
    allAmenitiesData = amenitiesData;
    
    // Get amenity types for filter
    const typeCounts = {};
    (amenitiesData.features || []).forEach(function (f) {
      const t = (f.properties && f.properties.amenity_type) || "";
      if (t) {
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }
    });
    
    const types = Object.keys(typeCounts).sort();
    allAmenityTypes = types;
    
    types.forEach(t => {
      if (typeCounts[t] > 0) {
        typesWithData.add(t);
      }
    });
    
    buildFilterItems(types);
    updateAmenitiesSource();
    
    // Update building colors now that filter types are initialized
    // (buildings may have loaded first)
    updateBuildingColors();
    
    loadingState.amenities = true;
    updateLoadingProgress();
    
    // Check if we should load trees now (if already zoomed in)
    if (map.getZoom() >= 13) {
      loadTreesIfNeeded();
    }
  }).catch(function (err) {
    console.error("Failed to load amenities:", err);
    loadingState.amenities = true;
    updateLoadingProgress();
  });
  
  // Mark trees as loaded for progress bar (they load lazily)
  loadingState.trees = true;
  updateLoadingProgress();

  // Load isochrones eagerly so they're ready when a building is clicked
  loadIsochrones();

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

modalTabs.forEach(tab => {
  tab.addEventListener("click", function() {
    const targetTab = this.dataset.tab;
    
    modalTabs.forEach(t => t.classList.remove("active"));
    tabContents.forEach(c => c.classList.remove("active"));
    
    this.classList.add("active");
    document.getElementById("tab-" + targetTab).classList.add("active");
  });
});

// Show modal on first visit
if (!localStorage.getItem("urban95-modal-seen")) {
  showModal();
}

// Lazy load trees when zoomed in far enough
map.on("zoomend", function() {
  if (map.getZoom() >= 13) {
    loadTreesIfNeeded();
  }
});

// ─── Analysis Mode Management ───────────────────────────────────────

const modeToggle = document.getElementById("mode-toggle");
const modeHint = document.getElementById("mode-hint");

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


function updateNeighborhoodColors() {
  if (!neighborhoodsData || !map.getLayer("neighborhoods-fill")) return;

  const sfx = "_" + walkMinutes + "min";
  const avgKey = "avg_overall" + sfx;

  // Percentile-based breakpoints from neighborhood average scores
  const values = neighborhoodsData.features.map(f => (f.properties || {})[avgKey] || 0);
  const breakpoints = percentileBreakpoints(values);

  const colorExpr = [
    "interpolate",
    ["linear"],
    ["coalesce", ["get", avgKey], 0],
    breakpoints[0], "#ef4444",
    breakpoints[1], "#f97316",
    breakpoints[2], "#eab308",
    breakpoints[3], "#84cc16",
    breakpoints[4], "#22c55e",
  ];

  map.setPaintProperty("neighborhoods-fill", "fill-color", colorExpr);
  updateLegendLabels(breakpoints);
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
  const metricSection = metricDisplayToggle ? metricDisplayToggle.closest(".section") : null;
  const legendSection = document.querySelector(".legend-section");

  if (mode === "house") {
    if (showPointsSection) showPointsSection.style.display = "";
    if (metricSection) metricSection.style.display = "";
    if (legendSection) legendSection.style.display = "";
    if (modeHint) modeHint.textContent = "Click map to analyze nearest building";
  } else if (mode === "neighborhood") {
    if (showPointsSection) showPointsSection.style.display = "none";
    if (metricSection) metricSection.style.display = "none";
    if (legendSection) legendSection.style.display = "";
    if (modeHint) modeHint.textContent = "Click a neighborhood for details";
  } else {
    if (showPointsSection) showPointsSection.style.display = "none";
    if (metricSection) metricSection.style.display = "none";
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

  // Hide buildings and parks entirely — neighborhood mode shows only polygons
  if (map.getLayer("buildings-fill")) {
    map.setLayoutProperty("buildings-fill", "visibility", "none");
  }
  if (map.getLayer("parks-fill")) {
    map.setLayoutProperty("parks-fill", "visibility", "none");
  }
  setAmenityPointsVisibility(false);

  // Load and show neighborhoods
  loadNeighborhoods().then(data => {
    const src = map.getSource("neighborhoods");
    if (src) src.setData(data);
    addNeighborhoodLayers();
    updateNeighborhoodColors();

    if (map.getLayer("neighborhoods-fill")) map.setLayoutProperty("neighborhoods-fill", "visibility", "visible");
    if (map.getLayer("neighborhoods-line")) map.setLayoutProperty("neighborhoods-line", "visibility", "visible");
    if (map.getLayer("neighborhoods-label")) map.setLayoutProperty("neighborhoods-label", "visibility", "visible");
    console.log("[Neighborhood] Layers visible, source updated with", data.features.length, "features");

    if (data.features.length > 0) {
      const bbox = turf.bbox(data);
      map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, duration: 600 });
    }
  });
}

function exitNeighborhoodMode() {
  if (map.getLayer("buildings-fill")) {
    map.setLayoutProperty("buildings-fill", "visibility", "visible");
    map.setPaintProperty("buildings-fill", "fill-opacity", 0.85);
  }
  if (map.getLayer("parks-fill")) {
    map.setLayoutProperty("parks-fill", "visibility", "visible");
  }
}

function enterCitywideMode() {
  clearRadiusSelection();
  setControlsForMode("citywide");

  // Show neighborhood polygons as context
  loadNeighborhoods().then(data => {
    const src = map.getSource("neighborhoods");
    if (src) src.setData(data);
    addNeighborhoodLayers();
    updateNeighborhoodColors();
    if (map.getLayer("neighborhoods-fill")) map.setLayoutProperty("neighborhoods-fill", "visibility", "visible");
    if (map.getLayer("neighborhoods-line")) map.setLayoutProperty("neighborhoods-line", "visibility", "visible");
    if (map.getLayer("neighborhoods-label")) map.setLayoutProperty("neighborhoods-label", "visibility", "visible");
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
  const sfx = "_" + walkMinutes + "min";
  const pct = props["pct_overall" + sfx] || 0;
  console.log("[Neighborhood] Showing modal for", props.Name, "pct:", pct);

  document.getElementById("neighborhood-modal-title").textContent = props.Name || "Unknown";
  document.getElementById("neighborhood-modal-subtitle").textContent =
    `${pct}${getOrdinalSuffix(pct)} percentile • ${walkMinutes}-min walk`;

  const body = document.getElementById("neighborhood-modal-body");
  neighborhoodCharts.forEach(c => c.destroy());
  neighborhoodCharts = [];

  let html = "";

  // Summary cards
  html += '<div class="cw-summary">';
  html += `<div class="cw-stat-card"><div class="cw-stat-value">${props.building_count || 0}</div><div class="cw-stat-label">Buildings</div></div>`;
  html += `<div class="cw-stat-card"><div class="cw-stat-value">${formatMetricNumber(props["avg_amenities" + sfx] || 0)}</div><div class="cw-stat-label">Avg Amenities</div></div>`;
  html += `<div class="cw-stat-card"><div class="cw-stat-value">${props["coverage" + sfx] || 0}%</div><div class="cw-stat-label">Coverage</div></div>`;
  html += `<div class="cw-stat-card"><div class="cw-stat-value">${pct}%</div><div class="cw-stat-label">Percentile</div></div>`;
  html += "</div>";

  // Amenity breakdown pie chart
  html += '<div class="cw-section">';
  html += '<div class="cw-section-title">Amenity Breakdown</div>';
  html += '<div class="cw-chart-container cw-pie-chart"><canvas id="hood-amenity-pie"></canvas></div>';
  html += "</div>";

  // Collect type data for bar chart (exclude trees)
  const types = Object.keys(AMENITY_TYPE_CONFIG).filter(t => t !== "trees");
  const typeData = types.map(t => {
    const config = getAmenityConfig(t);
    const avg = props["avg_" + t + sfx] || 0;
    return { type: t, label: config.label, color: config.color, avg };
  }).filter(d => d.avg > 0).sort((a, b) => b.avg - a.avg);

  if (typeData.length > 0) {
    html += '<div class="cw-section">';
    html += '<div class="cw-section-title">Average Amenities per Building</div>';
    html += `<div class="cw-chart-container" style="height:${Math.max(200, typeData.length * 28)}px"><canvas id="hood-type-bar"></canvas></div>`;
    html += "</div>";
  }

  // Type percentile rankings (trees already excluded from types)
  const typePercentiles = types.map(t => {
    const config = getAmenityConfig(t);
    const pctT = props["pct_" + t + sfx];
    const avg = props["avg_" + t + sfx] || 0;
    if (pctT === undefined) return null;
    return { label: config.label, color: config.color, avg, pct: pctT };
  }).filter(Boolean).sort((a, b) => b.pct - a.pct);

  if (typePercentiles.length > 0) {
    html += '<div class="cw-section">';
    html += '<div class="cw-section-title">Percentile Ranking by Type</div>';
    html += '<ul class="cw-ranking-list">';
    typePercentiles.forEach((item, i) => {
      let barColor;
      if (item.pct >= 70) barColor = "#22c55e";
      else if (item.pct >= 40) barColor = "#eab308";
      else barColor = "#ef4444";

      html += '<div class="cw-ranking-item">';
      html += `<div class="cw-rank-num" style="background:${item.color};color:#fff">${i + 1}</div>`;
      html += `<div class="cw-rank-name">${item.label}</div>`;
      html += `<div class="cw-rank-bar-wrap"><div class="cw-rank-bar" style="width:${item.pct}%;background:${barColor}"></div></div>`;
      html += `<div class="cw-rank-score">${item.pct}%</div>`;
      html += "</div>";
    });
    html += "</ul></div>";
  }

  body.innerHTML = html;
  document.getElementById("neighborhood-modal").classList.add("show");
  requestAnimationFrame(() => renderNeighborhoodCharts(props, sfx, typeData));
}

function hideNeighborhoodModal() {
  const modal = document.getElementById("neighborhood-modal");
  if (modal) modal.classList.remove("show");
  neighborhoodCharts.forEach(c => c.destroy());
  neighborhoodCharts = [];
}

function renderNeighborhoodCharts(props, sfx, typeData) {
  if (typeof Chart === "undefined") return;
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";

  // Amenity pie chart
  const pieCanvas = document.getElementById("hood-amenity-pie");
  if (pieCanvas) {
    const labels = [];
    const values = [];
    const colors = [];

    Object.keys(AMENITY_TYPE_CONFIG).forEach(type => {
      if (type === "trees") return;
      const avg = props["avg_" + type + sfx] || 0;
      if (avg > 0) {
        const config = getAmenityConfig(type);
        labels.push(config.label);
        values.push(avg);
        colors.push(config.color);
      }
    });

    if (values.length > 0) {
      neighborhoodCharts.push(new Chart(pieCanvas, {
        type: "doughnut",
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "right", labels: { boxWidth: 12, padding: 10, font: { size: 11 } } }
          }
        }
      }));
    }
  }

  // Type comparison bar chart
  const barCanvas = document.getElementById("hood-type-bar");
  if (barCanvas && typeData && typeData.length > 0) {
    neighborhoodCharts.push(new Chart(barCanvas, {
      type: "bar",
      data: {
        labels: typeData.map(d => d.label),
        datasets: [{ data: typeData.map(d => d.avg), backgroundColor: typeData.map(d => d.color), borderRadius: 3 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 10 } }, title: { display: true, text: "Avg count per building", font: { size: 11 } } },
          y: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
      }
    }));
  }
}

// Neighborhood click handler
map.on("click", "neighborhoods-fill", function(e) {
  if (currentMode !== "neighborhood") return;
  if (!e.features || e.features.length === 0) return;

  const feature = e.features[0];
  console.log("[Neighborhood] Clicked:", feature.properties.Name);
  showNeighborhoodModal(feature);
});

map.on("mouseenter", "neighborhoods-fill", function() {
  if (currentMode === "neighborhood") map.getCanvas().style.cursor = "pointer";
});

map.on("mouseleave", "neighborhoods-fill", function() {
  if (currentMode === "neighborhood") {
    map.getCanvas().style.cursor = "";
    tooltip.style.display = "none";
  }
});

map.on("mousemove", "neighborhoods-fill", function(e) {
  if (currentMode !== "neighborhood" || !e.features || e.features.length === 0) return;
  const props = e.features[0].properties;
  const sfx = "_" + walkMinutes + "min";
  const avg = props["avg_overall" + sfx] || 0;
  tooltip.textContent = `${props.Name || "?"}\nAvg score: ${formatMetricNumber(avg)}`;
  tooltip.style.display = "block";
  tooltip.style.left = (e.point.x + 12) + "px";
  tooltip.style.top = (e.point.y + 12) + "px";
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

function renderCitywideModal() {
  const body = document.getElementById("citywide-body");
  if (!body || !citywideStats) return;

  citywideCharts.forEach(c => c.destroy());
  citywideCharts = [];

  const sfx = "_" + walkMinutes + "min";
  const stats = citywideStats;

  let html = '';

  // Summary cards
  html += '<div class="cw-summary">';
  html += `<div class="cw-stat-card"><div class="cw-stat-value">${(stats.total_buildings || 0).toLocaleString()}</div><div class="cw-stat-label">Buildings</div></div>`;
  html += `<div class="cw-stat-card"><div class="cw-stat-value">${(stats.total_amenities || 0).toLocaleString()}</div><div class="cw-stat-label">Amenities</div></div>`;
  html += '</div>';

  // Amenity distribution chart
  html += '<div class="cw-section">';
  html += '<div class="cw-section-title">Amenity Distribution</div>';
  html += '<div class="cw-chart-container cw-pie-chart"><canvas id="cw-amenity-pie"></canvas></div>';
  html += '</div>';

  // Score distribution histogram
  html += '<div class="cw-section">';
  html += `<div class="cw-section-title">Building Score Distribution (${walkMinutes}-min walk)</div>`;
  html += '<div class="cw-chart-container"><canvas id="cw-score-hist"></canvas></div>';
  html += '</div>';

  // Neighborhood ranking
  const ranking = (stats.neighborhood_ranking || [])
    .slice()
    .sort((a, b) => (b["avg_overall" + sfx] || 0) - (a["avg_overall" + sfx] || 0));

  html += '<div class="cw-section">';
  html += '<div class="cw-section-title">Neighborhood Ranking</div>';
  const maxScore = ranking.length > 0 ? ranking[0]["avg_overall" + sfx] : 1;
  html += '<ul class="cw-ranking-list">';
  ranking.forEach((r, i) => {
    const score = r["avg_overall" + sfx] || 0;
    const pct = r["pct_overall" + sfx] || 0;
    const barPct = maxScore > 0 ? (score / maxScore * 100) : 0;
    let barColor;
    if (pct >= 70) barColor = "#22c55e";
    else if (pct >= 40) barColor = "#eab308";
    else barColor = "#ef4444";

    html += `<div class="cw-ranking-item">`;
    html += `<div class="cw-rank-num">${i + 1}</div>`;
    html += `<div class="cw-rank-name">${r.name}</div>`;
    html += `<div class="cw-rank-bar-wrap"><div class="cw-rank-bar" style="width:${barPct}%;background:${barColor}"></div></div>`;
    html += `<div class="cw-rank-score">${formatMetricNumber(score)}</div>`;
    html += `</div>`;
  });
  html += '</ul></div>';

  body.innerHTML = html;

  // Render charts after DOM update
  requestAnimationFrame(() => renderCitywideCharts(sfx));
}

function renderCitywideCharts(sfx) {
  if (!citywideStats || typeof Chart === "undefined") return;

  const chartFont = { family: "Inter, system-ui, sans-serif" };
  Chart.defaults.font.family = chartFont.family;

  // Amenity distribution pie
  const pieCanvas = document.getElementById("cw-amenity-pie");
  if (pieCanvas) {
    const counts = citywideStats.amenity_counts || {};
    const labels = [];
    const values = [];
    const colors = [];
    Object.entries(counts)
      .filter(([type]) => type !== "trees")
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

  // Score distribution histogram — colors match the basemap gradient
  const histCanvas = document.getElementById("cw-score-hist");
  if (histCanvas) {
    const dist = citywideStats["distribution" + sfx];
    if (dist) {
      const bldBreakpoints = percentileBreakpoints(collectBuildingScores());
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
