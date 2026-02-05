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

function createIconUrl(iconName) {
  return `${ICONS_BASE}/${iconName}.svg`;
}

// Calculate appropriate zoom level to show the entire radius
function getZoomForRadius(radiusM) {
  // Approximate meters per pixel at zoom level 15 at equator: ~4.77m
  // We want the radius to take up about 1/3 of the viewport width (roughly 200-300px)
  const targetPixels = 250;
  const metersPerPixelAtZoom15 = 4.77;
  const metersPerPixel = radiusM / targetPixels;
  const zoomDiff = Math.log2(metersPerPixelAtZoom15 / metersPerPixel);
  return Math.min(Math.max(15 + zoomDiff, 13), 18);
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
          "fill-color": "#f3e8ff",
          "fill-opacity": 0.85,
          "fill-outline-color": "#d4d4d8",
        },
      },
      {
        id: "radius-circle-fill",
        type: "fill",
        source: "radius-circle",
        paint: {
          "fill-color": "#8b5cf6",
          "fill-opacity": 0.15,
        },
      },
      {
        id: "radius-circle-line",
        type: "line",
        source: "radius-circle",
        paint: {
          "line-color": "#8b5cf6",
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
const amenityLegendItems = document.querySelector(".amenity-legend-items");
const amenityLegend = document.getElementById("amenity-legend");

let radiusM = 100;
let allAmenityTypes = [];
let typesWithData = new Set();
let allAmenitiesData = null;
let buildingsData = null;
let buildingCentroids = [];  // Array of {lng, lat, properties, feature}
let selectedMetric = "amenities";
let selectedAmenityTypes = new Set(["all"]);
let amenityMarkers = [];
let amenityMarkerMap = new Map();  // Map from feature index to marker
let showAmenities = true;
let selectedBuildingCentroid = null;  // Currently selected building centroid
let amenitiesInRadius = new Set();  // Set of amenity indices currently in radius

function getMarkerSize() {
  const zoom = map.getZoom();
  if (zoom < 12) return 16;
  if (zoom < 14) return 20;
  if (zoom < 16) return 26;
  return 32;
}

function updateBuildingColors() {
  let expression;
  
  if (selectedMetric === "trees") {
    expression = [
      "interpolate",
      ["linear"],
      ["coalesce", ["to-number", ["get", "num_trees"]], 0],
      0, "#f3e8ff",
      5, "#c4b5fd",
      10, "#a78bfa",
      20, "#8b5cf6",
      40, "#6d28d9",
    ];
  } else {
    if (selectedAmenityTypes.has("all") || selectedAmenityTypes.size === 0) {
      expression = [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "num_amenities"]], 0],
        0, "#f3e8ff",
        1, "#c4b5fd",
        5, "#a78bfa",
        10, "#8b5cf6",
        20, "#6d28d9",
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
        0, "#f3e8ff",
        1, "#c4b5fd",
        5, "#a78bfa",
        10, "#8b5cf6",
        20, "#6d28d9",
      ];
    }
  }
  
  if (map.getLayer("buildings-fill")) {
    map.setPaintProperty("buildings-fill", "fill-color", expression);
  }
}

function clearMarkers() {
  amenityMarkers.forEach(m => m.remove());
  amenityMarkers = [];
  amenityMarkerMap.clear();
}

function createMarker(feature, size, featureIndex) {
  const coords = feature.geometry.coordinates;
  const props = feature.properties;
  const type = props.amenity_type || "";
  const config = getAmenityConfig(type);
  
  const el = document.createElement("div");
  el.className = "amenity-marker";
  el.dataset.featureIndex = featureIndex;
  el.style.width = size + "px";
  el.style.height = size + "px";
  el.style.backgroundColor = config.color;
  
  const iconSize = Math.round(size * 0.5);
  const img = document.createElement("img");
  img.src = createIconUrl(config.icon);
  img.style.width = iconSize + "px";
  img.style.height = iconSize + "px";
  img.onerror = function() {
    this.src = createIconUrl("marker");
  };
  el.appendChild(img);
  
  const marker = new maplibregl.Marker({ element: el })
    .setLngLat(coords)
    .addTo(map);
  
  el.addEventListener("mouseenter", (e) => {
    const typeName = props.top_classi || props.amenity_type || "Unknown";
    const sub = props.subcategor || "";
    const name = props.hebrew_nam || props.name || "";
    
    const lines = [];
    if (name) lines.push(name);
    lines.push(typeName);
    if (sub) lines.push(sub);
    
    tooltip.textContent = lines.join("\n");
    tooltip.style.display = "block";
    tooltip.style.left = (e.pageX + 12) + "px";
    tooltip.style.top = (e.pageY + 12) + "px";
  });
  
  el.addEventListener("mousemove", (e) => {
    tooltip.style.left = (e.pageX + 12) + "px";
    tooltip.style.top = (e.pageY + 12) + "px";
  });
  
  el.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });
  
  return marker;
}

function renderMarkers() {
  clearMarkers();
  amenityMarkerMap.clear();
  
  if (!showAmenities || !allAmenitiesData) return;
  
  const size = getMarkerSize();
  
  allAmenitiesData.features.forEach((f, index) => {
    if (!selectedAmenityTypes.has("all")) {
      const type = f.properties.amenity_type;
      if (!selectedAmenityTypes.has(type)) return;
    }
    
    const marker = createMarker(f, size, index);
    amenityMarkers.push(marker);
    amenityMarkerMap.set(index, marker);
    
    // Apply highlight if this amenity is in the current radius
    if (amenitiesInRadius.has(index)) {
      marker.getElement().classList.add("in-radius");
    }
  });
}

function updateMarkerHighlights() {
  amenityMarkerMap.forEach((marker, index) => {
    const el = marker.getElement();
    if (amenitiesInRadius.has(index)) {
      el.classList.add("in-radius");
    } else {
      el.classList.remove("in-radius");
    }
  });
}

function updateMarkerSizes() {
  if (!showAmenities) return;
  const size = getMarkerSize();
  const iconSize = Math.round(size * 0.5);
  
  amenityMarkers.forEach(marker => {
    const el = marker.getElement();
    el.style.width = size + "px";
    el.style.height = size + "px";
    const img = el.querySelector("img");
    if (img) {
      img.style.width = iconSize + "px";
      img.style.height = iconSize + "px";
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
  renderMarkers();
  updateBuildingColors();
  
  // Re-apply highlight to amenities in radius after re-rendering
  if (selectedBuildingCentroid) {
    updateMarkerHighlights();
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

function buildAmenityLegend(types) {
  amenityLegendItems.innerHTML = "";
  
  const typesWithPoints = types.filter(t => typesWithData.has(t));
  
  if (typesWithPoints.length === 0) {
    amenityLegend.style.display = "none";
    return;
  }
  
  amenityLegend.style.display = "block";
  
  typesWithPoints.forEach(type => {
    const config = getAmenityConfig(type);
    const item = document.createElement("div");
    item.className = "amenity-legend-item";
    item.innerHTML = `
      <span class="amenity-legend-icon" style="background: ${config.color}">
        <img src="${createIconUrl(config.icon)}" onerror="this.src='${createIconUrl('marker')}'"/>
      </span>
      <span>${config.label}</span>
    `;
    amenityLegendItems.appendChild(item);
  });
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
  if (showAmenities) {
    renderMarkers();
  } else {
    clearMarkers();
  }
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
  
  allAmenitiesData.features.forEach((f, index) => {
    const coords = f.geometry.coordinates;
    const dist = turf.distance(
      [centerLng, centerLat],
      coords,
      { units: "meters" }
    );
    
    if (dist <= radiusM) {
      indices.add(index);
      const type = f.properties.amenity_type || "other";
      counts[type] = (counts[type] || 0) + 1;
    }
  });
  
  return { indices, counts };
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
  amenitiesInRadius = result.indices;
  
  // Update marker highlights
  updateMarkerHighlights();
  
  // Update the info panel with dynamic counts
  updateRadiusInfo(result.counts);
  
  if (flyTo) {
    // Calculate zoom level based on radius
    const zoom = getZoomForRadius(radiusM);
    
    // Fly to the building centroid
    map.flyTo({
      center: [building.lng, building.lat],
      zoom: zoom,
      speed: 1.2,
      curve: 1.42,
      essential: true
    });
  }
}

// Update displayed radius info
function updateRadiusInfo(counts) {
  const infoPanel = document.getElementById("radius-info");
  if (!infoPanel) return;
  
  let total = 0;
  Object.values(counts).forEach(c => total += c);
  
  let html = `<div class="radius-count">${total} amenities within ${radiusM}m</div>`;
  
  if (Object.keys(counts).length > 0 && Object.keys(counts).length <= 6) {
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
  amenitiesInRadius.clear();
  
  const source = map.getSource("radius-circle");
  if (source) source.setData({ type: "FeatureCollection", features: [] });
  
  updateMarkerHighlights();
  
  const infoPanel = document.getElementById("radius-info");
  if (infoPanel) infoPanel.style.display = "none";
}

rSlider.addEventListener("input", function () {
  radiusM = parseInt(this.value, 10);
  rVal.textContent = radiusM;
  
  // If a building is selected, update the radius visualization
  if (selectedBuildingCentroid) {
    selectBuilding(selectedBuildingCentroid, false);
  }
});

map.on("zoom", function() {
  updateMarkerSizes();
});

map.on("click", function (e) {
  if (e.originalEvent.target !== map.getCanvas()) return;
  
  // Find closest building centroid
  const closest = findClosestBuilding(e.lngLat);
  if (closest) {
    selectBuilding(closest, true);
  }
});

map.on("load", function () {
  fetch(BUILDINGS_URL)
    .then(function (r) { return r.json(); })
    .then(function (fc) {
      buildingsData = fc;
      
      // Compute centroids for all buildings
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
    if (fc && map.getSource("trees")) map.getSource("trees").setData(fc);
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
      buildAmenityLegend(types);
      renderMarkers();
    })
    .catch(function () {});

  map.getCanvas().style.cursor = "";
});

map.on("mousemove", "buildings-fill", function (e) {
  map.getCanvas().style.cursor = "pointer";
  const p = e.features[0].properties;
  
  const lines = [];
  
  if (selectedMetric === "trees") {
    const count = p.num_trees != null ? p.num_trees : 0;
    lines.push("Trees nearby: " + count);
  } else {
    if (selectedAmenityTypes.has("all") || selectedAmenityTypes.size === 0) {
      const count = p.num_amenities != null ? p.num_amenities : 0;
      lines.push("Amenities nearby: " + count);
    } else {
      let total = 0;
      Array.from(selectedAmenityTypes).forEach(type => {
        const key = "amen_" + type;
        const val = p[key] != null ? parseInt(p[key]) : 0;
        total += val;
        const config = AMENITY_TYPE_CONFIG[type];
        const label = config ? config.label : type.replace(/_/g, " ");
        lines.push(label + ": " + val);
      });
      if (selectedAmenityTypes.size > 1) {
        lines.push("Total: " + total);
      }
    }
  }
  
  tooltip.textContent = lines.join("\n");
  tooltip.style.display = "block";
  tooltip.style.left = (e.point.x + 12) + "px";
  tooltip.style.top = (e.point.y + 12) + "px";
});

map.on("mouseleave", "buildings-fill", function () {
  map.getCanvas().style.cursor = "";
  tooltip.style.display = "none";
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

map.on("click", "parks-fill", function (e) {
  const props = e.features[0].properties;
  const name = props.name || "Unnamed Park";
  
  let html = "<div style='font-weight: 600; margin-bottom: 4px;'>" + name + "</div>";
  if (props.area != null) {
    html += "<div style='color: #6b7280; font-size: 11px;'>Area: " + formatArea(props.area) + "</div>";
  }
  
  new maplibregl.Popup({ offset: 10 })
    .setLngLat(e.lngLat)
    .setHTML(html)
    .addTo(map);
});
