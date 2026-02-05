/* global maplibregl, turf */

const BASE = "./data";
const ICONS_BASE = "./icons";
const BUILDINGS_URL = BASE + "/buildings_accessibility.geojson";
const PARKS_URL = BASE + "/parks.geojson";
const TREES_URL = BASE + "/trees.geojson";
const AMENITIES_ALL_URL = BASE + "/amenities_all.geojson";

const AMENITY_TYPE_CONFIG = {
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
        tiles: ["https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap © CARTO",
      },
      buildings: { type: "geojson", data: BUILDINGS_URL },
      parks: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      trees: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      "radius-circle": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      amenities: {
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
        id: "trees-circles",
        type: "circle",
        source: "trees",
        paint: { 
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2, 16, 4],
          "circle-color": "#22c55e", 
          "circle-opacity": 0.7 
        },
        layout: { visibility: "none" },
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
const allCheckbox = filterPopup.querySelector('input[value="all"]');
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
let selectedMetric = "amenities";
let selectedAmenityTypes = new Set(["all"]);
let showAmenities = true;
let selectedBuildingCentroid = null;
let amenitiesInRadiusIds = new Set();
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

// Update the amenities source data with filtered and radius-flagged features
function updateAmenitiesSource() {
  if (!allAmenitiesData) return;
  
  const source = map.getSource("amenities");
  if (!source) return;
  
  // Build updated features with filtering and in-radius flag
  const updatedFeatures = [];
  
  allAmenitiesData.features.forEach((f, index) => {
    // Apply type filter
    if (!selectedAmenityTypes.has("all") && selectedAmenityTypes.size > 0) {
      const type = f.properties.amenity_type;
      if (!selectedAmenityTypes.has(type)) return;
    }
    
    // Add in-radius flag using the original index
    const newProps = { ...f.properties, _inRadius: amenitiesInRadiusIds.has(index) };
    updatedFeatures.push({ ...f, properties: newProps });
  });
  
  source.setData({ type: "FeatureCollection", features: updatedFeatures });
}

// Add amenity layers after icons are loaded
function addAmenityLayers() {
  // Heatmap layer for low zoom levels (red-green gradient)
  map.addLayer({
    id: "amenity-heatmap",
    type: "heatmap",
    source: "amenities",
    maxzoom: 15,
    paint: {
      "heatmap-weight": 1,
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 1.5],
      // Red to yellow to green gradient
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

  // Individual amenity points (highlighted in radius) - fade in at higher zoom
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

  // Individual amenity points (not highlighted) - fade in at higher zoom
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

  // Amenity icons (highlighted) - fade in at higher zoom
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

  // Amenity icons (not highlighted) - fade in at higher zoom
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

  updateAmenityFilters();
}

// Update filters on amenity layers
function updateAmenityFilters() {
  if (!map.getLayer("amenity-points")) return;
  
  // Point filters - differentiate by inRadius flag
  map.setFilter("amenity-points", ["!=", ["get", "_inRadius"], true]);
  map.setFilter("amenity-points-highlighted", ["==", ["get", "_inRadius"], true]);
  map.setFilter("amenity-icons", ["!=", ["get", "_inRadius"], true]);
  map.setFilter("amenity-icons-highlighted", ["==", ["get", "_inRadius"], true]);
}

function updateBuildingColors() {
  let expression;
  
  // Red-green gradient: red = low accessibility, green = high accessibility
  if (selectedMetric === "trees") {
    expression = [
      "interpolate",
      ["linear"],
      ["coalesce", ["to-number", ["get", "num_trees"]], 0],
      0, "#ef4444",   // red-500
      5, "#f97316",   // orange-500
      10, "#eab308",  // yellow-500
      20, "#84cc16",  // lime-500
      40, "#22c55e",  // green-500
    ];
  } else {
    if (selectedAmenityTypes.has("all") || selectedAmenityTypes.size === 0) {
      expression = [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "num_amenities"]], 0],
        0, "#ef4444",   // red-500
        1, "#f97316",   // orange-500
        5, "#eab308",   // yellow-500
        10, "#84cc16",  // lime-500
        20, "#22c55e",  // green-500
      ];
    } else {
      const types = Array.from(selectedAmenityTypes);
      const sumParts = types.map(type => {
        const amenKey = "amen_" + type;
        return ["coalesce", ["to-number", ["get", amenKey]], 0];
      });
      
      let sumExpr = sumParts.length === 1 ? sumParts[0] : ["+", ...sumParts];
      
      expression = [
        "interpolate",
        ["linear"],
        sumExpr,
        0, "#ef4444",   // red-500
        1, "#f97316",   // orange-500
        5, "#eab308",   // yellow-500
        10, "#84cc16",  // lime-500
        20, "#22c55e",  // green-500
      ];
    }
  }
  
  if (map.getLayer("buildings-fill")) {
    map.setPaintProperty("buildings-fill", "fill-color", expression);
  }
}

function setAmenityLayersVisibility(visible) {
  const layers = [
    "amenity-heatmap",
    "amenity-points",
    "amenity-points-highlighted",
    "amenity-icons",
    "amenity-icons-highlighted",
  ];
  layers.forEach(layerId => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    }
  });
}

function updateFilterLabel() {
  if (selectedAmenityTypes.has("all")) {
    filterLabel.textContent = "All Types";
  } else if (selectedAmenityTypes.size === 0) {
    filterLabel.textContent = "None selected";
  } else if (selectedAmenityTypes.size === 1) {
    const type = Array.from(selectedAmenityTypes)[0];
    const config = AMENITY_TYPE_CONFIG[type];
    filterLabel.textContent = config ? config.label : type;
  } else {
    filterLabel.textContent = selectedAmenityTypes.size + " selected";
  }
}

function onMetricChange(e) {
  selectedMetric = e.target.value;
  
  const filterSection = document.getElementById("amenity-filter-section");
  filterSection.style.display = selectedMetric === "trees" ? "none" : "block";
  
  updateBuildingColors();
}

function handleFilterChange(e) {
  const checkbox = e.target;
  const value = checkbox.value;
  
  if (value === "all") {
    if (checkbox.checked) {
      selectedAmenityTypes.clear();
      selectedAmenityTypes.add("all");
      filterItems.querySelectorAll('input').forEach(cb => cb.checked = false);
    }
  } else {
    if (checkbox.checked) {
      selectedAmenityTypes.delete("all");
      allCheckbox.checked = false;
      selectedAmenityTypes.add(value);
    } else {
      selectedAmenityTypes.delete(value);
      if (selectedAmenityTypes.size === 0) {
        selectedAmenityTypes.add("all");
        allCheckbox.checked = true;
      }
    }
  }
  
  updateFilterLabel();
  updateAmenitiesSource();
  updateBuildingColors();
  
  if (selectedBuildingCentroid) {
    selectBuilding(selectedBuildingCentroid, false);
  }
}

function setLayerVisibility(layerId, visible) {
  if (!map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

function formatArea(areaM2) {
  if (areaM2 >= 10000) {
    return (areaM2 / 10000).toFixed(2) + " ha";
  }
  return Math.round(areaM2).toLocaleString() + " m²";
}

function buildFilterItems(types) {
  filterItems.innerHTML = "";
  
  const typesWithPoints = types.filter(t => typesWithData.has(t));
  
  typesWithPoints.forEach(type => {
    const config = AMENITY_TYPE_CONFIG[type] || { label: type.replace(/_/g, " ") };
    const label = document.createElement("label");
    label.className = "filter-item";
    label.innerHTML = `<input type="checkbox" value="${type}" /><span>${config.label}</span>`;
    label.querySelector("input").addEventListener("change", handleFilterChange);
    filterItems.appendChild(label);
  });
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

allCheckbox.addEventListener("change", handleFilterChange);

document.querySelectorAll('input[name="metric"]').forEach(radio => {
  radio.addEventListener("change", onMetricChange);
});

document.getElementById("layer-trees").addEventListener("change", (e) => setLayerVisibility("trees-circles", e.target.checked));
document.getElementById("layer-amenities").addEventListener("change", (e) => {
  showAmenities = e.target.checked;
  setAmenityLayersVisibility(showAmenities);
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

// Calculate which amenities are within the radius of a point
function getAmenitiesInRadius(centerLng, centerLat, radiusM) {
  if (!allAmenitiesData) return { indices: new Set(), counts: {} };
  
  const indices = new Set();
  const counts = {};
  const centerPt = [centerLng, centerLat];
  
  allAmenitiesData.features.forEach((f, index) => {
    // Apply type filter
    if (!selectedAmenityTypes.has("all")) {
      const type = f.properties.amenity_type;
      if (!selectedAmenityTypes.has(type)) return;
    }
    
    const coords = f.geometry.coordinates;
    const dist = turf.distance(centerPt, coords, { units: "meters" });
    
    if (dist <= radiusM) {
      indices.add(index);
      const type = f.properties.amenity_type || "other";
      counts[type] = (counts[type] || 0) + 1;
    }
  });
  
  return { indices, counts };
}

// Calculate number of trees within the radius of a point
function getTreesInRadius(centerLng, centerLat, radiusM) {
  if (!allTreesData) return 0;
  
  let count = 0;
  const centerPt = [centerLng, centerLat];
  
  allTreesData.features.forEach(f => {
    const coords = f.geometry.coordinates;
    const dist = turf.distance(centerPt, coords, { units: "meters" });
    
    if (dist <= radiusM) {
      count++;
    }
  });
  
  return count;
}

// Select a building and show its radius with amenities
function selectBuilding(building, flyTo = true) {
  selectedBuildingCentroid = building;
  
  // Draw radius circle around building centroid
  const radiusKm = radiusM / 1000;
  const circle = turf.circle([building.lng, building.lat], radiusKm, { units: "kilometers", steps: 64 });
  const source = map.getSource("radius-circle");
  if (source) source.setData(circle);
  
  // Calculate amenities in radius
  const result = getAmenitiesInRadius(building.lng, building.lat, radiusM);
  amenitiesInRadiusIds = result.indices;
  
  // Update amenity data with in-radius flag
  updateAmenitiesSource();
  
  // Update the info panel with dynamic counts
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
  
  let total = 0;
  let filteredCounts = {};
  
  if (selectedAmenityTypes.has("all") || selectedAmenityTypes.size === 0) {
    Object.entries(counts).forEach(([type, count]) => {
      total += count;
      filteredCounts[type] = count;
    });
  } else {
    Array.from(selectedAmenityTypes).forEach(type => {
      const count = counts[type] || 0;
      total += count;
      if (count > 0) {
        filteredCounts[type] = count;
      }
    });
  }
  
  let html = '<div class="radius-count">';
  
  if (selectedAmenityTypes.has("all") || selectedAmenityTypes.size === 0) {
    html += `${total} ${total === 1 ? "amenity" : "amenities"} within ${radiusM}m`;
  } else if (selectedAmenityTypes.size === 1) {
    const type = Array.from(selectedAmenityTypes)[0];
    const config = AMENITY_TYPE_CONFIG[type];
    const label = config ? config.label : type.replace(/_/g, " ");
    html += `${total} ${pluralize(label, total)} within ${radiusM}m`;
  } else {
    html += `${total} of selected amenity types within ${radiusM}m`;
  }
  
  html += '</div>';
  
  const filteredKeys = Object.keys(filteredCounts);
  if (filteredKeys.length > 1 && filteredKeys.length <= 6) {
    html += '<div class="radius-breakdown">';
    Object.entries(filteredCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
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
  
  const source = map.getSource("radius-circle");
  if (source) source.setData({ type: "FeatureCollection", features: [] });
  
  updateAmenitiesSource();
  
  const infoPanel = document.getElementById("radius-info");
  if (infoPanel) infoPanel.style.display = "none";
}

rSlider.addEventListener("input", function () {
  radiusM = parseInt(this.value, 10);
  rVal.textContent = radiusM;
  
  if (selectedBuildingCentroid) {
    selectBuilding(selectedBuildingCentroid, false);
  }
});

map.on("click", function (e) {
  // Check if clicked on an amenity point
  const amenityFeatures = map.queryRenderedFeatures(e.point, { 
    layers: ["amenity-points", "amenity-points-highlighted"] 
  });
  if (amenityFeatures.length > 0) {
    const props = amenityFeatures[0].properties;
    const coords = amenityFeatures[0].geometry.coordinates;
    
    const typeName = props.top_classi || props.amenity_type || "Unknown";
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
  
  // Otherwise, find closest building
  if (e.originalEvent.target !== map.getCanvas()) return;
  
  const closest = findClosestBuilding(e.lngLat);
  if (closest) {
    selectBuilding(closest, true);
  }
});

// Hover effect for amenity points
map.on("mouseenter", "amenity-points", () => {
  map.getCanvas().style.cursor = "pointer";
});

map.on("mouseenter", "amenity-points-highlighted", () => {
  map.getCanvas().style.cursor = "pointer";
});

map.on("mouseleave", "amenity-points", () => {
  map.getCanvas().style.cursor = "";
});

map.on("mouseleave", "amenity-points-highlighted", () => {
  map.getCanvas().style.cursor = "";
});

// Show tooltip on amenity hover
map.on("mousemove", "amenity-points", (e) => {
  if (e.features.length === 0) return;
  const props = e.features[0].properties;
  
  const typeName = props.top_classi || props.amenity_type || "Unknown";
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
  
  const typeName = props.top_classi || props.amenity_type || "Unknown";
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
  
  fetch(TREES_URL).then(function (r) { return r.ok ? r.json() : null; }).then(function (fc) {
    if (fc) {
      allTreesData = fc;
      if (map.getSource("trees")) map.getSource("trees").setData(fc);
    }
  }).catch(function () {});

  fetch(AMENITIES_ALL_URL)
    .then(function (r) { return r.json(); })
    .then(function (fc) {
      allAmenitiesData = fc;
      
      const typeCounts = {};
      (fc.features || []).forEach(function (f) {
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
      
      // Set amenities data to the source (with filtering)
      updateAmenitiesSource();
    })
    .catch(function () {});

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
