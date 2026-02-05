/* global maplibregl, turf */

const BASE = "./data";
const ICONS_BASE = "./icons";
const BUILDINGS_URL = BASE + "/buildings_accessibility.geojson";
const PARKS_URL = BASE + "/parks.geojson";
const TREES_URL = BASE + "/trees.geojson";
const AMENITIES_ALL_URL = BASE + "/amenities_all.geojson";

const AMENITY_TYPE_CONFIG = {
  trees: { color: "#22c55e", icon: "park-alt1", label: "Trees" },
  healthcare: { color: "#dc2626", icon: "hospital", label: "Healthcare" },
  education: { color: "#2563eb", icon: "school", label: "Education" },
  commercial: { color: "#d97706", icon: "shop", label: "Commercial" },
  services: { color: "#6b7280", icon: "town-hall", label: "Services" },
  religious_institutions: { color: "#7c3aed", icon: "place-of-worship", label: "Religious" },
  parks_and_recreation: { color: "#16a34a", icon: "restaurant", label: "Recreation" },
  public_institutions: { color: "#0f172a", icon: "building", label: "Public" },
  fitness: { color: "#0d9488", icon: "fitness-centre", label: "Fitness" },
  transportation: { color: "#475569", icon: "bus", label: "Transport" },
  financial_services: { color: "#0284c7", icon: "bank", label: "Financial" },
  tourism: { color: "#db2777", icon: "lodging", label: "Tourism" },
  senior_services_and_living: { color: "#ea580c", icon: "home", label: "Senior" },
};

const DEFAULT_CONFIG = { color: "#6b7280", icon: "marker", label: "Other" };

function getAmenityConfig(type) {
  if (!type) return DEFAULT_CONFIG;
  const config = AMENITY_TYPE_CONFIG[type.toLowerCase()];
  return config || DEFAULT_CONFIG;
}

// Calculate appropriate zoom level to show the entire radius
function getZoomForRadius(radiusM) {
  const targetPixels = 250;
  const metersPerPixelAtZoom15 = 4.77;
  const metersPerPixel = radiusM / targetPixels;
  const zoomDiff = Math.log2(metersPerPixelAtZoom15 / metersPerPixel);
  return Math.min(Math.max(15 + zoomDiff, 13), 18);
}

// Build color expression for amenity types
function buildAmenityColorExpression() {
  const cases = ["case"];
  Object.entries(AMENITY_TYPE_CONFIG).forEach(([type, config]) => {
    cases.push(["==", ["get", "amenity_type"], type]);
    cases.push(config.color);
  });
  cases.push(DEFAULT_CONFIG.color);
  return cases;
}

// Build icon expression for amenity types
function buildAmenityIconExpression() {
  const cases = ["case"];
  Object.entries(AMENITY_TYPE_CONFIG).forEach(([type, config]) => {
    cases.push(["==", ["get", "amenity_type"], type]);
    cases.push(config.icon);
  });
  cases.push(DEFAULT_CONFIG.icon);
  return cases;
}

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
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
const legendLabels = document.getElementById("legend-labels");
const tooltip = document.getElementById("tooltip");
const rSlider = document.getElementById("r-slider");
const rVal = document.getElementById("r-val");

let radiusM = 100;
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

// Load all amenity icons into the map
async function loadAmenityIcons() {
  const iconNames = new Set();
  Object.values(AMENITY_TYPE_CONFIG).forEach(config => iconNames.add(config.icon));
  iconNames.add(DEFAULT_CONFIG.icon);
  
  const loadPromises = Array.from(iconNames).map(iconName => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (!map.hasImage(iconName)) {
          // Use SDF: true for tinting icons white
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
  
  await Promise.all(loadPromises);
  iconsLoaded = true;
}

// Update amenities source (without trees)
function updateAmenitiesSource() {
  if (!allAmenitiesData) return;
  
  const source = map.getSource("amenities");
  if (!source) return;
  
  const useAll = selectedAmenityTypes.size === 0 || selectedAmenityTypes.size === allFilterTypes.length;
  const showAmenities = useAll || Array.from(selectedAmenityTypes).some(t => t !== "trees");
  
  if (!showAmenities) {
    source.setData({ type: "FeatureCollection", features: [] });
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
}

// Update trees source (separate layer)
function updateTreesSource() {
  if (!allTreesData) return;
  
  const source = map.getSource("trees");
  if (!source) return;
  
  const useAll = selectedAmenityTypes.size === 0 || selectedAmenityTypes.size === allFilterTypes.length;
  const showTrees = useAll || selectedAmenityTypes.has("trees");
  
  if (!showTrees) {
    source.setData({ type: "FeatureCollection", features: [] });
    return;
  }
  
  const updatedFeatures = allTreesData.features.map((f, index) => ({
    ...f,
    properties: { ...f.properties, _inRadius: treesInRadiusIds.has(index) }
  }));
  
  source.setData({ type: "FeatureCollection", features: updatedFeatures });
}


// Add amenity and tree layers after icons are loaded
function addAmenityLayers() {
  const treesConfig = AMENITY_TYPE_CONFIG.trees;
  
  // Tree heatmap (low zoom, weighted less) - rendered first (below)
  map.addLayer({
    id: "tree-heatmap",
    type: "heatmap",
    source: "trees",
    maxzoom: 15,
    paint: {
      "heatmap-weight": 0.25,
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 1.5],
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0, "rgba(0, 0, 0, 0)",
        0.2, "rgba(134, 239, 172, 0.4)",
        0.5, "rgba(74, 222, 128, 0.6)",
        1, "rgba(34, 197, 94, 0.8)"
      ],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 10, 14, 18],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 13, 1, 15, 0],
    },
  });

  // Amenity heatmap (low zoom) - rendered second (above trees)
  map.addLayer({
    id: "amenity-heatmap",
    type: "heatmap",
    source: "amenities",
    maxzoom: 15,
    paint: {
      "heatmap-weight": 1,
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 1.5],
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0, "rgba(0, 0, 0, 0)",
        0.1, "rgba(239, 68, 68, 0.5)",
        0.3, "rgba(249, 115, 22, 0.6)",
        0.5, "rgba(234, 179, 8, 0.7)",
        0.7, "rgba(132, 204, 22, 0.8)",
        1, "rgba(34, 197, 94, 0.9)"
      ],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 15, 14, 25],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 13, 1, 15, 0],
    },
  });

  // Tree points (highlighted) - small green dots
  map.addLayer({
    id: "tree-points-highlighted",
    type: "circle",
    source: "trees",
    minzoom: 14,
    filter: ["==", ["get", "_inRadius"], true],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 3, 18, 6],
      "circle-color": treesConfig.color,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#fbbf24",
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 0.9],
      "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 1],
    },
  });

  // Tree points (not highlighted) - small green dots
  map.addLayer({
    id: "tree-points",
    type: "circle",
    source: "trees",
    minzoom: 14,
    filter: ["!=", ["get", "_inRadius"], true],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 2, 18, 5],
      "circle-color": treesConfig.color,
      "circle-stroke-width": 0.5,
      "circle-stroke-color": "#fff",
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 0.7],
      "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 0.7],
    },
  });

  // Amenity points (highlighted)
  map.addLayer({
    id: "amenity-points-highlighted",
    type: "circle",
    source: "amenities",
    minzoom: 13,
    filter: ["==", ["get", "_inRadius"], true],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 6, 16, 14],
      "circle-color": buildAmenityColorExpression(),
      "circle-stroke-width": 3,
      "circle-stroke-color": "#fbbf24",
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 14, 1],
      "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 14, 1],
    },
  });

  // Amenity points (not highlighted)
  map.addLayer({
    id: "amenity-points",
    type: "circle",
    source: "amenities",
    minzoom: 13,
    filter: ["!=", ["get", "_inRadius"], true],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 4, 16, 12],
      "circle-color": buildAmenityColorExpression(),
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 14, 1],
      "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 14, 1],
    },
  });

  // Amenity icons (highlighted)
  map.addLayer({
    id: "amenity-icons-highlighted",
    type: "symbol",
    source: "amenities",
    minzoom: 14,
    filter: ["==", ["get", "_inRadius"], true],
    layout: {
      "icon-image": buildAmenityIconExpression(),
      "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.35, 16, 0.6],
      "icon-allow-overlap": true,
    },
    paint: {
      "icon-color": "#fff",
      "icon-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 1],
    },
  });

  // Amenity icons (not highlighted)
  map.addLayer({
    id: "amenity-icons",
    type: "symbol",
    source: "amenities",
    minzoom: 14,
    filter: ["!=", ["get", "_inRadius"], true],
    layout: {
      "icon-image": buildAmenityIconExpression(),
      "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.3, 16, 0.5],
      "icon-allow-overlap": true,
    },
    paint: {
      "icon-color": "#fff",
      "icon-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 1],
    },
  });
}

// Calculate nice round breakpoints for the color scale
function calculateBreakpoints(maxVal) {
  if (maxVal <= 0) return [0, 1, 2, 3, 5];
  
  // Find a nice max that's a round number
  let niceMax;
  if (maxVal <= 5) niceMax = 5;
  else if (maxVal <= 10) niceMax = 10;
  else if (maxVal <= 20) niceMax = 20;
  else if (maxVal <= 50) niceMax = 50;
  else if (maxVal <= 100) niceMax = 100;
  else if (maxVal <= 200) niceMax = 200;
  else if (maxVal <= 500) niceMax = 500;
  else niceMax = Math.ceil(maxVal / 100) * 100;
  
  // Create 4 breakpoints (0, 1/4, 1/2, 3/4, max)
  const quarter = Math.round(niceMax / 4);
  const half = Math.round(niceMax / 2);
  const threeQuarter = Math.round(niceMax * 3 / 4);
  
  return [0, quarter, half, threeQuarter, niceMax];
}

// Get max value from buildings data for selected types (trees count 1/4, use 1/5 of max for outliers)
function getMaxValueForSelection() {
  if (!buildingsData || !buildingsData.features) return 20;
  
  let maxVal = 0;
  const useAll = selectedAmenityTypes.size === 0 || selectedAmenityTypes.size === allFilterTypes.length;
  
  buildingsData.features.forEach(f => {
    const props = f.properties || {};
    let val = 0;
    
    if (useAll) {
      // Trees count 1/4 as much as amenities
      val = (Number(props.num_amenities) || 0) + (Number(props.num_trees) || 0) * 0.25;
    } else {
      selectedAmenityTypes.forEach(type => {
        if (type === "trees") {
          val += (Number(props.num_trees) || 0) * 0.25;
        } else {
          val += Number(props["amen_" + type]) || 0;
        }
      });
    }
    
    if (val > maxVal) maxVal = val;
  });
  
  // Use 1/5 of max to handle outliers - most buildings will show meaningful color variation
  return Math.max(Math.round(maxVal / 5), 5);
}

// Update the legend labels
function updateLegendLabels(breakpoints) {
  if (!legendLabels) return;
  
  const labels = breakpoints.map((val, i) => {
    if (i === breakpoints.length - 1) return val + "+";
    return val;
  });
  
  legendLabels.innerHTML = labels.map(l => `<span>${l}</span>`).join("");
}

function updateBuildingColors() {
  if (!buildingsData) return;
  
  const useAll = selectedAmenityTypes.size === 0 || selectedAmenityTypes.size === allFilterTypes.length;
  
  // Calculate max value and breakpoints
  const maxVal = getMaxValueForSelection();
  const breakpoints = calculateBreakpoints(maxVal);
  
  // Update legend
  updateLegendLabels(breakpoints);
  
  // Build the sum expression (trees count 1/4 as much)
  let sumExpr;
  if (useAll) {
    sumExpr = ["+", 
      ["coalesce", ["to-number", ["get", "num_amenities"]], 0],
      ["*", ["coalesce", ["to-number", ["get", "num_trees"]], 0], 0.25]
    ];
  } else {
    const types = Array.from(selectedAmenityTypes);
    const sumParts = types.map(type => {
      if (type === "trees") {
        return ["*", ["coalesce", ["to-number", ["get", "num_trees"]], 0], 0.25];
      }
      const amenKey = "amen_" + type;
      return ["coalesce", ["to-number", ["get", amenKey]], 0];
    });
    sumExpr = sumParts.length === 1 ? sumParts[0] : ["+", ...sumParts];
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

function buildFilterItems(types) {
  filterItems.innerHTML = "";
  allFilterTypes = [];
  selectedAmenityTypes.clear();
  
  // Add trees first if tree data is loaded
  if (allTreesData && allTreesData.features.length > 0) {
    allFilterTypes.push("trees");
    selectedAmenityTypes.add("trees");
    const treesConfig = AMENITY_TYPE_CONFIG["trees"];
    const treesLabel = document.createElement("label");
    treesLabel.className = "filter-item";
    treesLabel.innerHTML = `<input type="checkbox" value="trees" checked /><span>${treesConfig.label}</span>`;
    treesLabel.querySelector("input").addEventListener("change", handleFilterChange);
    filterItems.appendChild(treesLabel);
  }
  
  const typesWithPoints = types.filter(t => typesWithData.has(t));
  
  typesWithPoints.forEach(type => {
    allFilterTypes.push(type);
    selectedAmenityTypes.add(type);
    const config = AMENITY_TYPE_CONFIG[type] || { label: type.replace(/_/g, " ") };
    const label = document.createElement("label");
    label.className = "filter-item";
    label.innerHTML = `<input type="checkbox" value="${type}" checked /><span>${config.label}</span>`;
    label.querySelector("input").addEventListener("change", handleFilterChange);
    filterItems.appendChild(label);
  });
  
  updateFilterLabel();
}

filterBtn.addEventListener("click", function(e) {
  e.stopPropagation();
  filterPopup.classList.toggle("show");
  filterBtn.classList.toggle("open");
});

document.addEventListener("click", function(e) {
  if (!filterPopup.contains(e.target) && e.target !== filterBtn) {
    filterPopup.classList.remove("show");
    filterBtn.classList.remove("open");
  }
});

document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    clearRadiusSelection();
  }
});

selectAllBtn.addEventListener("click", toggleSelectAll);

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

// Calculate which items are within the radius of a point (filtered by selection)
function getItemsInRadius(centerLng, centerLat, radiusM) {
  const amenityIndices = new Set();
  const treeIndices = new Set();
  const counts = {};
  const centerPt = [centerLng, centerLat];
  const useAll = selectedAmenityTypes.size === 0 || selectedAmenityTypes.size === allFilterTypes.length;
  
  // Check amenities
  if (allAmenitiesData && allAmenitiesData.features) {
    allAmenitiesData.features.forEach((f, index) => {
      const type = f.properties.amenity_type;
      if (!useAll && !selectedAmenityTypes.has(type)) return;
      
      const coords = f.geometry.coordinates;
      const dist = turf.distance(centerPt, coords, { units: "meters" });
      
      if (dist <= radiusM) {
        amenityIndices.add(index);
        counts[type] = (counts[type] || 0) + 1;
      }
    });
  }
  
  // Check trees
  if (allTreesData && allTreesData.features && (useAll || selectedAmenityTypes.has("trees"))) {
    allTreesData.features.forEach((f, index) => {
      const coords = f.geometry.coordinates;
      const dist = turf.distance(centerPt, coords, { units: "meters" });
      
      if (dist <= radiusM) {
        treeIndices.add(index);
        counts["trees"] = (counts["trees"] || 0) + 1;
      }
    });
  }
  
  return { amenityIndices, treeIndices, counts };
}

// Select a building and show its radius with items
function selectBuilding(building, flyTo = true) {
  selectedBuildingCentroid = building;
  
  // Draw radius circle around building centroid
  const radiusKm = radiusM / 1000;
  const circle = turf.circle([building.lng, building.lat], radiusKm, { units: "kilometers", steps: 64 });
  const source = map.getSource("radius-circle");
  if (source) source.setData(circle);
  
  // Highlight the selected building outline
  const buildingSource = map.getSource("selected-building");
  if (buildingSource && building.feature) {
    buildingSource.setData({ type: "FeatureCollection", features: [building.feature] });
  }
  
  // Calculate items in radius (filtered by selection)
  const result = getItemsInRadius(building.lng, building.lat, radiusM);
  amenitiesInRadiusIds = result.amenityIndices;
  treesInRadiusIds = result.treeIndices;
  
  // Update data sources with in-radius flags
  updateAmenitiesSource();
  updateTreesSource();
  
  // Update the info panel with counts
  updateRadiusInfo(result.counts);
  
  if (flyTo) {
    const zoom = getZoomForRadius(radiusM);
    
    map.flyTo({
      center: [building.lng, building.lat],
      zoom: zoom,
      speed: 1.2,
      curve: 1.42,
      essential: true
    });
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
  
  const useAll = selectedAmenityTypes.size === 0 || selectedAmenityTypes.size === allFilterTypes.length;
  
  let html = '<div class="radius-count">';
  let total = 0;
  
  // Counts are already filtered by getItemsInRadius
  Object.values(counts).forEach(count => {
    total += count;
  });
  
  if (useAll) {
    html += `${total} items within ${radiusM}m`;
  } else if (selectedAmenityTypes.size === 1) {
    const type = Array.from(selectedAmenityTypes)[0];
    const config = AMENITY_TYPE_CONFIG[type];
    const label = config ? config.label : type.replace(/_/g, " ");
    html += `${total} ${pluralize(label, total)} within ${radiusM}m`;
  } else {
    html += `${total} of selected types within ${radiusM}m`;
  }
  
  html += '</div>';
  
  const filteredKeys = Object.keys(counts);
  if (filteredKeys.length > 1 && filteredKeys.length <= 6) {
    html += '<div class="radius-breakdown">';
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      const config = getAmenityConfig(type);
      html += `<span class="radius-type"><span style="color:${config.color}">●</span> ${config.label}: ${count}</span>`;
    });
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
  
  const source = map.getSource("radius-circle");
  if (source) source.setData({ type: "FeatureCollection", features: [] });
  
  const buildingSource = map.getSource("selected-building");
  if (buildingSource) buildingSource.setData({ type: "FeatureCollection", features: [] });
  
  updateAmenitiesSource();
  updateTreesSource();
  
  const infoPanel = document.getElementById("radius-info");
  if (infoPanel) infoPanel.style.display = "none";
}

// Debounce helper for expensive operations
let radiusUpdateTimeout = null;
function debouncedRadiusUpdate() {
  if (radiusUpdateTimeout) {
    clearTimeout(radiusUpdateTimeout);
  }
  radiusUpdateTimeout = setTimeout(function() {
    if (selectedBuildingCentroid) {
      selectBuilding(selectedBuildingCentroid, false);
    }
  }, 50);
}

rSlider.addEventListener("input", function () {
  radiusM = parseInt(this.value, 10);
  rVal.textContent = radiusM;
  
  // Update circle geometry immediately for visual feedback
  if (selectedBuildingCentroid) {
    const radiusKm = radiusM / 1000;
    const circle = turf.circle(
      [selectedBuildingCentroid.lng, selectedBuildingCentroid.lat], 
      radiusKm, 
      { units: "kilometers", steps: 64 }
    );
    const source = map.getSource("radius-circle");
    if (source) source.setData(circle);
  }
  
  // Debounce the expensive calculations
  debouncedRadiusUpdate();
});

map.on("click", function (e) {
  // Check if clicked on an amenity point
  const amenityFeatures = map.queryRenderedFeatures(e.point, { 
    layers: ["amenity-points", "amenity-points-highlighted"] 
  });
  if (amenityFeatures.length > 0) {
    const props = amenityFeatures[0].properties;
    const coords = amenityFeatures[0].geometry.coordinates;
    
    const typeName = formatTypeName(props);
    const sub = props.subcategor || "";
    const name = props.hebrew_nam || props.name || "";
    
    let html = "";
    if (name) html += `<div style="font-weight: 600; margin-bottom: 4px;">${name}</div>`;
    html += `<div style="color: #6b7280; font-size: 11px;">${typeName}`;
    if (sub) html += ` • ${sub}`;
    html += "</div>";
    
    new maplibregl.Popup({ offset: 15 })
      .setLngLat(coords)
      .setHTML(html)
      .addTo(map);
    return;
  }
  
  // Check if clicked on a tree point
  const treeFeatures = map.queryRenderedFeatures(e.point, { 
    layers: ["tree-points", "tree-points-highlighted"] 
  });
  if (treeFeatures.length > 0) {
    const coords = treeFeatures[0].geometry.coordinates;
    new maplibregl.Popup({ offset: 10 })
      .setLngLat(coords)
      .setHTML('<div style="color: #22c55e; font-size: 12px;">Tree</div>')
      .addTo(map);
    return;
  }
  
  // Otherwise, find closest building
  if (e.originalEvent.target !== map.getCanvas()) return;
  
  const closest = findClosestBuilding(e.lngLat);
  if (closest) {
    selectBuilding(closest, true);
  }
});

// Hover effect for amenity points
map.on("mouseenter", "amenity-points", () => map.getCanvas().style.cursor = "pointer");
map.on("mouseenter", "amenity-points-highlighted", () => map.getCanvas().style.cursor = "pointer");
map.on("mouseleave", "amenity-points", () => map.getCanvas().style.cursor = "");
map.on("mouseleave", "amenity-points-highlighted", () => map.getCanvas().style.cursor = "");

// Hover effect for tree points
map.on("mouseenter", "tree-points", () => map.getCanvas().style.cursor = "pointer");
map.on("mouseenter", "tree-points-highlighted", () => map.getCanvas().style.cursor = "pointer");
map.on("mouseleave", "tree-points", () => map.getCanvas().style.cursor = "");
map.on("mouseleave", "tree-points-highlighted", () => map.getCanvas().style.cursor = "");

// Format amenity type for display
function formatTypeName(props) {
  const type = props.amenity_type;
  if (type === "trees") return "Tree";
  return props.top_classi || type || "Unknown";
}

// Show tooltip on amenity hover
map.on("mousemove", "amenity-points", (e) => {
  if (e.features.length === 0) return;
  const props = e.features[0].properties;
  
  const typeName = formatTypeName(props);
  const sub = props.subcategor || "";
  const name = props.hebrew_nam || props.name || "";
  
  const lines = [];
  if (name) lines.push(name);
  lines.push(typeName);
  if (sub) lines.push(sub);
  
  tooltip.textContent = lines.join("\n");
  tooltip.style.display = "block";
  tooltip.style.left = (e.point.x + 12) + "px";
  tooltip.style.top = (e.point.y + 12) + "px";
});

map.on("mousemove", "amenity-points-highlighted", (e) => {
  if (e.features.length === 0) return;
  const props = e.features[0].properties;
  
  const typeName = formatTypeName(props);
  const sub = props.subcategor || "";
  const name = props.hebrew_nam || props.name || "";
  
  const lines = [];
  if (name) lines.push(name);
  lines.push(typeName);
  if (sub) lines.push(sub);
  
  tooltip.textContent = lines.join("\n");
  tooltip.style.display = "block";
  tooltip.style.left = (e.point.x + 12) + "px";
  tooltip.style.top = (e.point.y + 12) + "px";
});

map.on("mouseleave", "amenity-points", () => {
  tooltip.style.display = "none";
});

map.on("mouseleave", "amenity-points-highlighted", () => {
  tooltip.style.display = "none";
});

map.on("load", async function () {
  // Load icons first
  await loadAmenityIcons();
  
  // Add amenity layers after icons are loaded
  addAmenityLayers();
  
  fetch(BUILDINGS_URL)
    .then(function (r) { return r.json(); })
    .then(function (fc) {
      buildingsData = fc;
      
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
    })
    .catch(function () {});

  fetch(PARKS_URL).then(function (r) { return r.ok ? r.json() : null; }).then(function (fc) {
    if (fc && map.getSource("parks")) map.getSource("parks").setData(fc);
  }).catch(function () {});
  
  // Load trees and amenities separately
  Promise.all([
    fetch(TREES_URL).then(r => r.ok ? r.json() : null),
    fetch(AMENITIES_ALL_URL).then(r => r.json())
  ]).then(function ([treesData, amenitiesData]) {
    allTreesData = treesData;
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
    
    // Update both sources
    updateAmenitiesSource();
    updateTreesSource();
  }).catch(function () {});

  map.getCanvas().style.cursor = "";
});

map.on("mouseenter", "buildings-fill", function () {
  map.getCanvas().style.cursor = "pointer";
});

map.on("mouseleave", "buildings-fill", function () {
  map.getCanvas().style.cursor = "";
});

map.on("mousemove", "parks-fill", function (e) {
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
  map.getCanvas().style.cursor = "";
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
