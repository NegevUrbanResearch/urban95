/* global maplibregl, turf, deck, pmtiles */

const BASE = "./data";
const ICONS_BASE = "./icons";
const DECK_GL_URL = "https://unpkg.com/deck.gl@9.0.31/dist.min.js";
const CHART_JS_URL = "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js";
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
const PARK_DOT_PATTERN_ID = "park-dot-pattern";

function shouldTryGzip(url) {
  return (
    url === BUILDINGS_URL ||
    url === ISOCHRONES_URL ||
    url === TREES_URL ||
    url === STREET_LIGHTS_URL ||
    url === AMENITIES_LEGACY_URL
  );
}

async function parseGzipJsonResponse(response) {
  if (!response.ok) throw new Error("HTTP " + response.status);
  if (typeof DecompressionStream !== "function" || !response.body) {
    throw new Error("Browser does not support gzip stream decompression");
  }
  const decompressedStream = response.body.pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(decompressedStream).text();
  return JSON.parse(text);
}

async function fetchJsonWithGzipFallback(url, options) {
  const opts = options || {};
  const required = opts.required !== false;
  const loadStartedAt = performance.now();
  let loadMode = "plain";
  console.log("[Load] fetch start:", url);
  if (shouldTryGzip(url)) {
    const gzipUrl = url + ".gz";
    try {
      loadMode = "gzip";
      const gzFetchStartedAt = performance.now();
      const gzResponse = await fetch(gzipUrl);
      console.log(
        "[Load] gzip response received:",
        gzipUrl,
        Math.round(performance.now() - gzFetchStartedAt) + "ms",
        "status",
        gzResponse.status
      );
      const gzParseStartedAt = performance.now();
      const gzParsed = await parseGzipJsonResponse(gzResponse);
      console.log(
        "[Load] gzip parse done:",
        gzipUrl,
        Math.round(performance.now() - gzParseStartedAt) + "ms"
      );
      console.log(
        "[Load] fetch complete:",
        url,
        "mode=" + loadMode,
        "total=" + Math.round(performance.now() - loadStartedAt) + "ms"
      );
      return gzParsed;
    } catch (gzipErr) {
      console.warn("Compressed fetch failed, falling back to plain file:", gzipUrl, gzipErr);
      loadMode = "plain-fallback";
    }
  }

  const plainFetchStartedAt = performance.now();
  const plainResponse = await fetch(url);
  console.log(
    "[Load] plain response received:",
    url,
    Math.round(performance.now() - plainFetchStartedAt) + "ms",
    "status",
    plainResponse.status
  );
  if (!plainResponse.ok) {
    if (required) throw new Error("HTTP " + plainResponse.status + " " + url);
    console.warn(
      "[Load] optional fetch missing:",
      url,
      "mode=" + loadMode,
      "total=" + Math.round(performance.now() - loadStartedAt) + "ms"
    );
    return null;
  }
  const plainParseStartedAt = performance.now();
  const plainParsed = await plainResponse.json();
  console.log(
    "[Load] plain parse done:",
    url,
    Math.round(performance.now() - plainParseStartedAt) + "ms"
  );
  console.log(
    "[Load] fetch complete:",
    url,
    "mode=" + loadMode,
    "total=" + Math.round(performance.now() - loadStartedAt) + "ms"
  );
  return plainParsed;
}

/** Dev profiling: add ?perf=1 or localStorage urban95_perf=1 — records phase timings (see floating panel). */
var urban95Perf = (function () {
  var enabled = false;
  try {
    var sp = new URLSearchParams(window.location.search);
    enabled =
      sp.has("perf") ||
      sp.get("perf") === "1" ||
      (typeof localStorage !== "undefined" && localStorage.getItem("urban95_perf") === "1");
  } catch (e0) {}
  var records = [];
  var maxRecords = 800;
  var depth = 0;

  function push(entry) {
    if (records.length >= maxRecords) records.shift();
    records.push(entry);
  }

  return {
    enabled: enabled,
    records: records,
    session: function (label) {
      if (!enabled) return;
      push({ kind: "session", name: label || "session", t: performance.now(), ts: Date.now() });
    },
    phase: function (name, fn) {
      if (!enabled) return fn();
      depth++;
      var d = depth - 1;
      var t0 = performance.now();
      try {
        return fn();
      } finally {
        var ms = performance.now() - t0;
        depth--;
        push({ kind: "phase", name: name, ms: ms, depth: d, t: performance.now() });
      }
    },
    phaseAsync: function (name, p) {
      if (!enabled) return p;
      var t0 = performance.now();
      return Promise.resolve(p).then(
        function (v) {
          push({ kind: "phaseAsync", name: name, ms: performance.now() - t0, t: performance.now() });
          return v;
        },
        function (err) {
          push({
            kind: "phaseAsync",
            name: name,
            ms: performance.now() - t0,
            t: performance.now(),
            error: err && err.message ? err.message : String(err),
          });
          throw err;
        }
      );
    },
    clear: function () {
      records.length = 0;
    },
    exportJson: function () {
      return JSON.stringify({ exportedAt: new Date().toISOString(), records: records }, null, 2);
    },
    mountPanel: function () {
      if (!enabled || document.getElementById("urban95-perf-panel")) return;
      var root = document.createElement("div");
      root.id = "urban95-perf-panel";
      root.setAttribute(
        "style",
        "position:fixed;bottom:8px;right:8px;max-width:min(440px,92vw);max-height:38vh;overflow:auto;" +
          "background:rgba(15,23,42,0.94);color:#e2e8f0;font:11px/1.35 ui-monospace,monospace;" +
          "padding:8px 10px;border-radius:8px;z-index:99999;box-shadow:0 4px 24px rgba(0,0,0,0.45);" +
          "border:1px solid rgba(148,163,184,0.35);"
      );
      root.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;">' +
        '<strong style="color:#7dd3fc;">Urban95 perf</strong>' +
        '<span style="opacity:0.75;font-size:10px;">?perf=1</span></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">' +
        '<button type="button" id="urban95-perf-copy" style="font:inherit;padding:2px 8px;cursor:pointer;border-radius:4px;border:1px solid #64748b;background:#334155;color:#f1f5f9;">Copy JSON</button>' +
        '<button type="button" id="urban95-perf-clear" style="font:inherit;padding:2px 8px;cursor:pointer;border-radius:4px;border:1px solid #64748b;background:#334155;color:#f1f5f9;">Clear</button>' +
        '<button type="button" id="urban95-perf-table" style="font:inherit;padding:2px 8px;cursor:pointer;border-radius:4px;border:1px solid #64748b;background:#334155;color:#f1f5f9;">console.table</button>' +
        "</div>" +
        '<pre id="urban95-perf-body" style="margin:0;white-space:pre-wrap;word-break:break-word;max-height:28vh;overflow:auto;"></pre>';
      document.body.appendChild(root);
      function refresh() {
        var el = document.getElementById("urban95-perf-body");
        if (!el) return;
        var lines = records.slice(-100).map(function (r) {
          var ind = typeof r.depth === "number" ? new Array(Math.min(r.depth, 8) + 1).join(". ") : "";
          if (r.kind === "session") return ind + "—— " + r.name + " ——";
          var ms = r.ms != null ? r.ms.toFixed(1) + "ms" : "";
          return ind + r.name + " " + ms + (r.error ? " ERR:" + r.error : "");
        });
        el.textContent = lines.join("\n") || "(no samples yet; toggle modes or score model)";
      }
      var iv = setInterval(refresh, 450);
      refresh();
      document.getElementById("urban95-perf-copy").onclick = function () {
        var json = urban95Perf.exportJson();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(json).catch(function () {});
        } else {
          console.log(json);
        }
      };
      document.getElementById("urban95-perf-clear").onclick = function () {
        urban95Perf.clear();
        refresh();
      };
      document.getElementById("urban95-perf-table").onclick = function () {
        console.table(records.slice(-50));
      };
      window.addEventListener("beforeunload", function () {
        clearInterval(iv);
      });
    },
  };
})();

if (urban95Perf.enabled) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      urban95Perf.mountPanel();
    });
  } else {
    urban95Perf.mountPanel();
  }
}

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
  { stem: "environmental_quality", label: "Environmental Quality", weight: 0.2, color: "#2E7D32" },
  { stem: "nature", label: "Nature", weight: 0.15, color: "#7CB342" },
  { stem: "play", label: "Play", weight: 0.15, color: "#EF6C00" },
  { stem: "safety_mobility", label: "Safety & Mobility", weight: 0.25, color: "#2563EB" },
  { stem: "family_services", label: "Family Services", weight: 0.25, color: "#8E24AA" },
];

const WEIGHTED_CATEGORY_BY_STEM = WEIGHTED_CATEGORY_COMPONENTS.reduce(function (acc, comp) {
  acc[comp.stem] = comp;
  return acc;
}, {});

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

const SCORE_EXPLAIN_WEIGHTED_CATEGORY_ICONS = {
  environmental_quality: "garden",
  nature: "park",
  play: "playground",
  safety_mobility: "bus",
  family_services: "heart",
};

const SCORE_EXPLAIN_WEIGHTED_SUB_ICONS = {
  shade: "park-alt1",
  trees: "park-alt1",
  roads: "road-accident",
  parks: "park",
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

const SCORE_EXPLAIN_CLEAN_ICON_BY_KEY = {
  trees: "park-alt1",
  parks: "park",
  playgrounds: "playground",
  health: "hospital",
  education: "school",
  bus_stops: "bus",
  shelters: "shelter",
  "community-centers": "town-hall",
  businesscenters: "shop",
  "street-lights": "lighthouse",
};

const SCORE_EXPLAIN_ROW_ICON_BY_LABEL = {
  "Amenity POIs (count)": "shop",
  "Trees (×¼)": "park-alt1",
  "Street lights (×¼)": "lighthouse",
  "Trees (weighted)": "park-alt1",
  "Other manifest-weighted": "marker",
};

function getWeightedCategoryIcon(stem) {
  return SCORE_EXPLAIN_WEIGHTED_CATEGORY_ICONS[stem] || "marker";
}

function getWeightedSubcategoryIcon(stem) {
  return SCORE_EXPLAIN_WEIGHTED_SUB_ICONS[stem] || "marker";
}

function getCleanComponentIcon(key) {
  return SCORE_EXPLAIN_CLEAN_ICON_BY_KEY[key] || "marker";
}

function getScoreExplainRowIcon(row) {
  if (!row) return "marker";
  if (row.icon) return row.icon;
  if (row.amenityType) return getAmenityConfig(row.amenityType).icon;
  if (row.cleanKey) return getCleanComponentIcon(row.cleanKey);
  if (row.weightedStem) return getWeightedCategoryIcon(row.weightedStem);
  if (row.weightedSubStem) return getWeightedSubcategoryIcon(row.weightedSubStem);
  return SCORE_EXPLAIN_ROW_ICON_BY_LABEL[row.label] || "marker";
}

function renderHorizonIcon(iconName, color) {
  const name = iconName || "marker";
  const iconColor = color || "#64748b";
  const url = ICONS_BASE + "/" + encodeURIComponent(name) + ".svg";
  return (
    '<span class="horizon-icon" role="img" aria-hidden="true" style="--horizon-icon-color:' +
    escapeHtml(iconColor) +
    ";--horizon-icon-url:url('" +
    url +
    "')\"></span>"
  );
}

const SCORE_EXPLAIN_ICON_NEUTRAL = "#0f172a";

function getScoreExplainRowIconColor(row, barColor) {
  if (!row) return SCORE_EXPLAIN_ICON_NEUTRAL;
  if (scoreMode === "weighted" && !row.amenityType && !row.cleanKey) return barColor || "#64748b";
  return SCORE_EXPLAIN_ICON_NEUTRAL;
}

function getScoreExplainPartialFilterSet() {
  if (selectedAmenityTypes.size === 0 || selectedAmenityTypes.size === allFilterTypes.length) return null;
  return selectedAmenityTypes;
}

function isScoreExplainRowFilterHighlighted(row) {
  const active = getScoreExplainPartialFilterSet();
  if (!active || !row) return false;
  if (row.amenityType) return active.has(row.amenityType);
  if (row.cleanKey) {
    let hit = false;
    active.forEach(function (t) {
      if (filterTypeToCleanWeightKey(t) === row.cleanKey) hit = true;
    });
    return hit;
  }
  if (row.label === "Trees (×¼)" || row.label === "Trees (weighted)") return active.has("trees");
  if (row.label === "Street lights (×¼)") return active.has("street-lights");
  return false;
}

function isScoreExplainCategoryFilterHighlighted(cat) {
  const active = getScoreExplainPartialFilterSet();
  if (!active || !cat) return false;
  return active.has(cat.stem);
}

function parseColorChannels(color) {
  const s = String(color || "").trim();
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  let h = s.startsWith("#") ? s.slice(1) : s;
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length === 6 && /^[0-9a-f]+$/i.test(h)) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return [37, 99, 235];
}

function channelsToCss(channels) {
  return "rgb(" + channels[0] + "," + channels[1] + "," + channels[2] + ")";
}

function mixChannels(channels, whiteMix) {
  const w = Math.min(1, Math.max(0, whiteMix));
  return channels.map(function (c) {
    return Math.round(c + (255 - c) * w);
  });
}

function mixColorWithWhite(color, whiteMix) {
  return channelsToCss(mixChannels(parseColorChannels(color), whiteMix));
}

function horizonBarFillStyle(baseColor, widthPct) {
  const base = parseColorChannels(baseColor || "#2563eb");
  const light = channelsToCss(mixChannels(base, 0.45));
  const full = channelsToCss(base);
  return "width:" + widthPct + "%;background:linear-gradient(90deg," + light + " 0%," + full + " 100%)";
}

function horizonSubBarFillStyle(parentColor, widthPct, subIndex, subCount) {
  const base = parseColorChannels(parentColor || "#2563eb");
  const n = Math.max(1, subCount);
  const idx = Math.max(0, Math.min(subIndex, n - 1));
  const subMix = n === 1 ? 0.32 : 0.5 - (idx / (n - 1)) * 0.28;
  const sub = mixChannels(base, subMix);
  const light = mixChannels(sub, 0.18);
  return (
    "width:" +
    widthPct +
    "%;background:linear-gradient(90deg," +
    channelsToCss(light) +
    " 0%," +
    channelsToCss(sub) +
    " 100%)"
  );
}

function renderHorizonLabelCell(label, iconName, weightTagHtml, labelColor, opts) {
  opts = opts || {};
  const iconColor =
    opts.iconColor != null ? opts.iconColor : labelColor != null ? labelColor : "#64748b";
  const colorLabelText = opts.colorLabelText !== false && labelColor != null && labelColor !== "";
  let html = '<span class="horizon-label"';
  if (colorLabelText) html += ' style="color:' + escapeHtml(labelColor) + '"';
  html += ">";
  html += '<span class="horizon-label-top">';
  html += renderHorizonIcon(iconName, iconColor);
  html += '<span class="horizon-label-text">' + escapeHtml(label) + "</span>";
  html += "</span>";
  if (weightTagHtml) html += weightTagHtml;
  html += "</span>";
  return html;
}

function renderHorizonSubLabelCell(label, iconName, color) {
  const iconColor = color != null && color !== "" ? color : SCORE_EXPLAIN_ICON_NEUTRAL;
  let html = '<span class="horizon-sub-label"';
  if (color != null && color !== "") html += ' style="color:' + escapeHtml(color) + '"';
  html += ">";
  html += '<span class="horizon-label-top">';
  html += renderHorizonIcon(iconName, iconColor);
  html += '<span class="horizon-label-text">' + escapeHtml(label) + "</span>";
  html += "</span></span>";
  return html;
}

function getSelectedWeightedCategoryStem() {
  if (scoreMode !== "weighted") return null;
  if (selectedAmenityTypes.size !== 1) return null;
  const stem = Array.from(selectedAmenityTypes)[0];
  return WEIGHTED_CATEGORY_BY_STEM[stem] ? stem : null;
}

function getSelectedWeightedCategoryLabel() {
  const stem = getSelectedWeightedCategoryStem();
  if (!stem) return "Urban95";
  const comp = WEIGHTED_CATEGORY_BY_STEM[stem];
  return comp ? comp.label : "Urban95";
}

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
  const filteringLockedToAll = currentMode !== "house";
  const activeTypes = filteringLockedToAll ? allFilterTypes : Array.from(selectedAmenityTypes);
  if (allFilterTypes.length === 0 || selectedAmenityTypes.size === 0) return 0;
  if (filteringLockedToAll || selectedAmenityTypes.size === allFilterTypes.length) {
    return Number(p["score_clean" + sfx]) || 0;
  }
  if (hasCleanPtsBreakdown(p, minutes)) {
    let total = 0;
    activeTypes.forEach(function (type) {
      const wk = filterTypeToCleanWeightKey(type);
      if (!wk) return;
      const col = cleanPtsPropertyName(wk, minutes);
      const v = Number(p[col]);
      if (Number.isFinite(v)) total += v;
    });
    return total;
  }
  let total = 0;
  activeTypes.forEach((type) => {
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
  const useAll = currentMode !== "house" || selectedAmenityTypes.size === allFilterTypes.length;
  const activeTypes = useAll ? allFilterTypes : Array.from(selectedAmenityTypes);

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
      activeTypes.forEach(function (type) {
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
      activeTypes.forEach(function (type) {
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

const _urban95PmtilesProtocol = typeof pmtiles !== "undefined" && pmtiles.Protocol ? new pmtiles.Protocol() : null;
if (_urban95PmtilesProtocol) maplibregl.addProtocol("pmtiles", _urban95PmtilesProtocol.tile);

const BUILDINGS_MAP_SOURCE_ID = "buildings";
const BUILDINGS_VECTOR_LAYER_ID = "buildings";
const BUILDINGS_SYM_PCT_STATE_KEY = "sym_pct";

const BUILDINGS_CHOROPLETH_FILL_COLOR_EXPR = [
  "interpolate",
  ["linear"],
  ["coalesce", ["feature-state", BUILDINGS_SYM_PCT_STATE_KEY], 0],
  0,
  "#ef4444",
  25,
  "#f97316",
  50,
  "#eab308",
  75,
  "#84cc16",
  100,
  "#22c55e",
];

const _urban95BuildingsSource =
  _urban95PmtilesProtocol != null
    ? {
        type: "vector",
        url: "pmtiles://" + new URL(BASE + "/buildings_accessibility.pmtiles", window.location.href).href,
        promoteId: "building_id",
      }
    : {
        // GeoJSON fallback when PMTiles is unavailable (e.g. tests without pmtiles.js).
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      };

const _urban95BuildingsFillLayer = Object.assign(
  {
    id: "buildings-fill",
    type: "fill",
    source: BUILDINGS_MAP_SOURCE_ID,
    paint: {
      "fill-color": BUILDINGS_CHOROPLETH_FILL_COLOR_EXPR,
      "fill-opacity": 1,
      "fill-outline-color": "#d4d4d8",
    },
  },
  _urban95PmtilesProtocol ? { "source-layer": BUILDINGS_VECTOR_LAYER_ID } : {}
);

function createParkDotPatternImage() {
  const size = 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  // The intentionally clipped off-tile dots give the 2px repeat a softer,
  // slightly irregular screen texture than a perfectly even grid.
  [
    [1.5, 1.4, 0.48, "rgba(21, 128, 61, 0.7)"],
    [4.5, 1.8, 0.38, "rgba(22, 163, 74, 0.6)"],
    [7.8, 1.2, 0.42, "rgba(21, 128, 61, 0.64)"],
    [2.8, 4.2, 0.4, "rgba(22, 163, 74, 0.62)"],
    [6.2, 4.8, 0.48, "rgba(21, 128, 61, 0.68)"],
    [9.2, 5.4, 0.34, "rgba(22, 163, 74, 0.58)"],
    [1.2, 7.4, 0.36, "rgba(21, 128, 61, 0.61)"],
    [4.8, 8.1, 0.46, "rgba(22, 163, 74, 0.66)"],
    [8.3, 8.4, 0.4, "rgba(21, 128, 61, 0.63)"],
  ].forEach(function (dot) {
    ctx.fillStyle = dot[3];
    ctx.beginPath();
    ctx.arc(dot[0], dot[1], dot[2], 0, Math.PI * 2);
    ctx.fill();
  });

  return ctx.getImageData(0, 0, size, size);
}

function applyParkDotPattern() {
  if (!map.hasImage(PARK_DOT_PATTERN_ID)) {
    map.addImage(PARK_DOT_PATTERN_ID, createParkDotPatternImage(), { pixelRatio: 1 });
  }
  if (map.getLayer("parks-fill")) {
    map.setPaintProperty("parks-fill", "fill-pattern", PARK_DOT_PATTERN_ID);
    map.setPaintProperty("parks-fill", "fill-opacity", 1);
    map.setPaintProperty("parks-fill", "fill-outline-color", "rgba(22, 101, 52, 0.22)");
  }
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
      buildings: _urban95BuildingsSource,
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
          "fill-color": "rgba(187, 247, 208, 0.2)",
          "fill-opacity": 1,
          "fill-outline-color": "rgba(22, 101, 52, 0.22)"
        },
        layout: { visibility: "visible" },
      },
      _urban95BuildingsFillLayer,
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
const showTreesToggle = document.getElementById("show-trees-toggle");
const showLightsToggle = document.getElementById("show-lights-toggle");
const showAmenityPointsToggle = document.getElementById("show-amenity-points-toggle");
const urban95PointToggles = document.getElementById("urban95-point-toggles");
const amenityPointsToggleWrap = document.getElementById("amenity-points-toggle-wrap");
const showHeatmapToggle = document.getElementById("show-heatmap-toggle");

const TREE_LAYER_IDS = ["tree-icons"];
const STREET_LIGHT_LAYER_IDS = ["street-light-icons"];
const TREES_AND_LIGHTS_LAYER_IDS = TREE_LAYER_IDS.concat(STREET_LIGHT_LAYER_IDS);

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
const buildingAmenityStatKeyCache = new Map();
const URBAN95_FIXED_MINUTES = 10;
const URBAN95_REFERENCE_RADIUS_METERS = 300;
const BUILDING_CENTROID_GRID_CELL_DEGREES = 0.002;
const BUILDING_CENTROID_MAX_GRID_RING = 4;
const BUILDING_CENTROID_MIN_CANDIDATES = 24;

let _deckLoadPromise = null;
let _chartLoadPromise = null;
let buildingCentroidGridIndex = new Map();

function loadExternalScriptOnce(src) {
  return new Promise(function (resolve, reject) {
    const existing = Array.from(document.getElementsByTagName("script")).find(function (script) {
      return script.src === src;
    });
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", function () {
        existing.dataset.loaded = "1";
        resolve();
      }, { once: true });
      existing.addEventListener("error", function () {
        reject(new Error("Failed loading script: " + src));
      }, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = function () {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = function () {
      reject(new Error("Failed loading script: " + src));
    };
    document.head.appendChild(script);
  });
}

function ensureDeckGlLoaded() {
  if (window.deck && window.deck.MapboxOverlay) return Promise.resolve(window.deck);
  if (_deckLoadPromise) return _deckLoadPromise;
  _deckLoadPromise = loadExternalScriptOnce(DECK_GL_URL)
    .then(function () {
      if (!window.deck || !window.deck.MapboxOverlay) {
        throw new Error("deck.gl loaded without MapboxOverlay");
      }
      return window.deck;
    })
    .catch(function (err) {
      _deckLoadPromise = null;
      throw err;
    });
  return _deckLoadPromise;
}

function ensureChartJsLoaded() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (_chartLoadPromise) return _chartLoadPromise;
  _chartLoadPromise = loadExternalScriptOnce(CHART_JS_URL)
    .then(function () {
      if (!window.Chart) {
        throw new Error("Chart.js failed to initialize");
      }
      return window.Chart;
    })
    .catch(function (err) {
      _chartLoadPromise = null;
      throw err;
    });
  return _chartLoadPromise;
}

function getBuildingCentroidGridKey(lng, lat) {
  const gx = Math.floor(lng / BUILDING_CENTROID_GRID_CELL_DEGREES);
  const gy = Math.floor(lat / BUILDING_CENTROID_GRID_CELL_DEGREES);
  return gx + ":" + gy;
}

function buildBuildingCentroidGridIndex() {
  const grid = new Map();
  buildingCentroids.forEach(function (b) {
    const key = getBuildingCentroidGridKey(b.lng, b.lat);
    if (!grid.has(key)) {
      grid.set(key, []);
    }
    grid.get(key).push(b);
  });
  buildingCentroidGridIndex = grid;
}

function getClosestBuildingCandidates(lng, lat) {
  if (buildingCentroids.length === 0) return [];
  if (!buildingCentroidGridIndex || buildingCentroidGridIndex.size === 0) {
    return buildingCentroids;
  }

  const baseX = Math.floor(lng / BUILDING_CENTROID_GRID_CELL_DEGREES);
  const baseY = Math.floor(lat / BUILDING_CENTROID_GRID_CELL_DEGREES);
  const candidates = [];
  const seen = new Set();
  for (let ring = 0; ring <= BUILDING_CENTROID_MAX_GRID_RING; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (ring > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const key = (baseX + dx) + ":" + (baseY + dy);
        const bucket = buildingCentroidGridIndex.get(key);
        if (!bucket || bucket.length === 0) continue;
        bucket.forEach(function (item) {
          const uid = item.properties && item.properties.building_id;
          if (uid != null) {
            if (seen.has(uid)) return;
            seen.add(uid);
          }
          candidates.push(item);
        });
      }
    }
    if (candidates.length >= BUILDING_CENTROID_MIN_CANDIDATES) {
      break;
    }
  }

  return candidates.length > 0 ? candidates : buildingCentroids;
}

function getScoreModeLabel(mode) {
  const m = mode || scoreMode;
  if (m === "weighted") return "Urban95";
  return "Amenities Focus";
}

function forceAllAmenityTypesSelected() {
  selectedAmenityTypes.clear();
  allFilterTypes.forEach(function (type) {
    selectedAmenityTypes.add(type);
  });
}

function syncFilterUiForScoreMode() {
  const isUrban95 = scoreMode === "weighted";
  const allowFiltering = isUrban95 || currentMode === "house";
  if (amenityFilterSection) {
    amenityFilterSection.style.display = allowFiltering ? "" : "none";
  }
  if (radiusSection) {
    radiusSection.style.display = isUrban95 ? "none" : "";
  }
  const hintEl = document.getElementById("mode-hint");
  if (hintEl && currentMode === "house") {
    hintEl.textContent = isUrban95
      ? "Click map to analyze nearest building; Urban95 shows a fixed 300 m reference radius"
      : "Click map to analyze nearest building";
  }
  if (filterBtn) {
    filterBtn.disabled = !allowFiltering;
    filterBtn.setAttribute("aria-disabled", allowFiltering ? "false" : "true");
  }
  if (!allowFiltering) {
    closeFilterPopup();
    forceAllAmenityTypesSelected();
  }
}

function getNeighborhoodAverageKey(sfx) {
  if (scoreMode === "weighted") {
    const selectedStem = getSelectedWeightedCategoryStem();
    if (selectedStem) return "avg_score_weighted_" + selectedStem + sfx;
    return "avg_score_weighted_" + URBAN95_FIXED_MINUTES + "min";
  }
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
  if (scoreMode === "weighted") {
    const selectedStem = getSelectedWeightedCategoryStem();
    if (selectedStem) return "score_weighted_" + selectedStem;
    return "score_weighted";
  }
  const sfx = "_" + getScoreMinutes() + "min";
  if (scoreMode === "expanded") {
    if (currentMode !== "house") {
      return "score_expanded" + sfx;
    }
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

// Opacity for the hex score grid when rendered as a soft background underneath buildings in house mode.
const HOUSE_MODE_HEX_OPACITY = 0.3;

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
let waitingForIsochroneLoad = false;

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

function showIsochroneLoadingScreen() {
  waitingForIsochroneLoad = true;
  if (loadingScreen) {
    loadingScreen.classList.remove("hidden");
  }
  if (loadingProgressBar) {
    loadingProgressBar.style.width = "100%";
  }
  setLoadingStatus("Loading walking areas for Amenities Focus...");
}

function hideIsochroneLoadingScreen() {
  waitingForIsochroneLoad = false;
  const allLoaded = Object.values(loadingState).every(Boolean);
  if (allLoaded) {
    hideLoadingScreen();
  }
}

// Fallback: hide loading screen after 60 seconds regardless
setTimeout(() => {
  if (loadingScreen && !loadingScreen.classList.contains("hidden")) {
    if (waitingForIsochroneLoad) return;
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
  const treesLoadStartedAt = performance.now();
  console.log("[Load] trees: start");
  
  fetchJsonWithGzipFallback(TREES_URL)
    .then(function (treesData) {
      if (!treesData) throw new Error("Empty tree data");
      allTreesData = treesData;
      console.log("[Load] trees: features", (treesData.features || []).length);
      
      const treesProcessStartedAt = performance.now();
      const types = allAmenityTypes.slice();
      buildFilterItems(types);
      updateAmenitiesSource();
      updateTreesSource();
      updateStreetLightsSource();
      updateBuildingColors();
      console.log(
        "[Load] trees: processing complete",
        Math.round(performance.now() - treesProcessStartedAt) + "ms"
      );

      if (selectedBuildingCentroid) {
        selectBuilding(selectedBuildingCentroid, false);
      }
      console.log(
        "[Load] trees: complete total",
        Math.round(performance.now() - treesLoadStartedAt) + "ms"
      );
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
  const streetLightsLoadStartedAt = performance.now();
  console.log("[Load] street-lights: start");

  fetchJsonWithGzipFallback(STREET_LIGHTS_URL)
    .then(function (data) {
      if (!data) throw new Error("Empty street light data");
      allStreetLightsData = data;
      console.log("[Load] street-lights: features", (data.features || []).length);

      const streetLightsProcessStartedAt = performance.now();
      const types = allAmenityTypes.slice();
      buildFilterItems(types);
      updateAmenitiesSource();
      updateTreesSource();
      updateStreetLightsSource();
      updateBuildingColors();
      console.log(
        "[Load] street-lights: processing complete",
        Math.round(performance.now() - streetLightsProcessStartedAt) + "ms"
      );

      if (selectedBuildingCentroid) {
        selectBuilding(selectedBuildingCentroid, false);
      }
      console.log(
        "[Load] street-lights: complete total",
        Math.round(performance.now() - streetLightsLoadStartedAt) + "ms"
      );
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
  return urban95Perf.phase("applyScoreModeAmenities", function () {
    const useLegacy = scoreMode === "expanded" && allAmenitiesDataLegacy && (allAmenitiesDataLegacy.features || []).length > 0;
    if (scoreMode === "expanded" && !useLegacy) {
      console.warn("amenities_all.geojson missing or empty; Amenities Focus mode may be incomplete.");
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
    updateShowPointsToggleLabel();
    applyShowPointsToggle();
    updateAmenitiesSource();
    updateTreesSource();
    updateStreetLightsSource();
    // Building choropleth: mutates SYM_PCT_KEY on in-memory GeoJSON; PMTiles footprints use map.setFeatureState(sym_pct).
    // Only when the buildings layer is shown (house mode). enterHouseMode() calls updateBuildingColors() when
    // returning to house.
    if (currentMode === "house") {
      updateBuildingColors();
      updateNeighborhoodSurfaceData();
    }
    if (selectedBuildingCentroid) {
      selectBuilding(selectedBuildingCentroid, false);
    }
  });
}

// Update amenities source (without trees)
function updateAmenitiesSource() {
  return urban95Perf.phase("updateAmenitiesSource", function () {
    if (!allAmenitiesData) return;

    const source = map.getSource("amenities");
    if (!source) return;

    if (scoreMode === "weighted") {
      source.setData({ type: "FeatureCollection", features: [] });
      visibleAmenityFeatures = [];
      updateDeckAmenityLayers();
      return;
    }

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
  });
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

// Update trees source — Urban95 shows all trees at detail zoom, Amenities Focus keeps isochrone clipping
function updateTreesSource() {
  return urban95Perf.phase("updateTreesSource", function () {
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
  });
}

// Street lights: separate symbol layer (not part of amenity deck overlay)
function updateStreetLightsSource() {
  return urban95Perf.phase("updateStreetLightsSource", function () {
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
  });
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
  const sorted = values.filter(function (v) {
    return Number.isFinite(v);
  }).slice().sort(function (a, b) {
    return a - b;
  });
  if (sorted.length === 0) return [0, 1, 2, 3, 5];
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

function buildHistogramDistributionFromScores(scores, step) {
  const bucketStep = Number(step) > 0 ? Number(step) : 10;
  const edges = [];
  for (let v = 0; v <= 100; v += bucketStep) {
    edges.push(v);
  }
  if (edges[edges.length - 1] !== 100) {
    edges.push(100);
  }
  const counts = new Array(edges.length - 1).fill(0);
  (scores || []).forEach(function (raw) {
    const score = Math.max(0, Math.min(100, Number(raw) || 0));
    let idx = Math.floor(score / bucketStep);
    if (idx >= counts.length) idx = counts.length - 1;
    if (idx < 0) idx = 0;
    counts[idx] += 1;
  });
  return { edges: edges, counts: counts };
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

function setLayerVisibility(layerIds, visible) {
  const v = visible ? "visible" : "none";
  layerIds.forEach((id) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", v);
    }
  });
}

function setTreesVisibility(visible) {
  setLayerVisibility(TREE_LAYER_IDS, visible);
}

function setStreetLightsVisibility(visible) {
  setLayerVisibility(STREET_LIGHT_LAYER_IDS, visible);
}

function setTreesAndLightsVisibility(visible) {
  setLayerVisibility(TREES_AND_LIGHTS_LAYER_IDS, visible);
}

function buildUrban95ReferenceRadius(lng, lat) {
  return turf.circle([lng, lat], URBAN95_REFERENCE_RADIUS_METERS, {
    steps: 96,
    units: "meters",
  });
}

/**
 * Point visibility controls change with the active score model:
 *   - Urban95 (weighted): independent tree and street-light symbol toggles.
 *   - Amenities Focus (expanded): one deck.gl amenity pie-chart overlay toggle
 *     because trees and lights are already filtered through the amenity filter UI.
 */
function updateShowPointsToggleLabel() {
  if (urban95PointToggles) {
    urban95PointToggles.style.display = scoreMode === "weighted" ? "" : "none";
  }
  if (amenityPointsToggleWrap) {
    amenityPointsToggleWrap.style.display = scoreMode === "expanded" ? "" : "none";
  }
}

function applyShowPointsToggle() {
  if (scoreMode === "weighted") {
    setTreesVisibility(showTreesToggle ? showTreesToggle.checked : true);
    setStreetLightsVisibility(showLightsToggle ? showLightsToggle.checked : true);
  } else {
    setTreesAndLightsVisibility(true);
    updateDeckAmenityLayers();
  }
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
  return urban95Perf.phase("updateDeckAmenityLayers", function () {
    const toggleAllows =
      scoreMode !== "expanded" || !showAmenityPointsToggle || showAmenityPointsToggle.checked;
    const shouldRender =
      currentMode === "house" && toggleAllows && map.getZoom() >= AMENITY_CLUSTER_MIN_ZOOM;
    if (!shouldRender) {
      if (deckAmenityOverlay) {
        deckAmenityOverlay.setProps({ layers: [] });
      }
      tooltip.style.display = "none";
      map.getCanvas().style.cursor = "";
      return;
    }

    if (!deckAmenityOverlay) {
      ensureDeckGlLoaded()
        .then(function () {
          initDeckAmenityOverlay();
          updateDeckAmenityLayers();
        })
        .catch(function (err) {
          console.error("Failed to initialize deck.gl overlay:", err);
        });
      return;
    }

    const clusteredAmenities = clusterVisibleAmenities(visibleAmenityFeatures);
    const { atlas, mapping } = buildAmenityIconAtlas(clusteredAmenities);

  if (!atlas || Object.keys(mapping).length === 0) {
    deckAmenityOverlay.setProps({ layers: [] });
    return;
  }

  const deckLib = window.deck;
  if (!deckLib) return;

  const iconLayer = new deckLib.IconLayer({
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

  const textLayer = new deckLib.TextLayer({
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
  });
}

// Debounced version for map movement events to prevent rapid layer recreation
function scheduleDeckUpdate() {
  clearTimeout(_deckUpdateTimer);
  _deckUpdateTimer = setTimeout(updateDeckAmenityLayers, 80);
}

function initDeckAmenityOverlay() {
  const deckLib = window.deck;
  if (deckAmenityOverlay || !deckLib || !deckLib.MapboxOverlay) return;
  deckAmenityOverlay = new deckLib.MapboxOverlay({ interleaved: true, layers: [] });
  map.addControl(deckAmenityOverlay);

  map.on("moveend", scheduleDeckUpdate);
  map.on("zoomend", scheduleDeckUpdate);
  map.on("resize", updateDeckAmenityLayers);
}

let _urban95MissingBuildingIdLogged = false;

function updateBuildingColors() {
  return urban95Perf.phase("updateBuildingColors", function () {
    if (!buildingsData || !buildingsData.features || buildingsData.features.length === 0) return;
    if (allFilterTypes.length === 0) return;

    const feats = buildingsData.features;

    if (selectedAmenityTypes.size === 0) {
      feats.forEach(function (f) {
        const p = f.properties || {};
        p[SYM_PCT_KEY] = 0;
      });
    } else {
      const scores = collectBuildingScores();
      const ranks = scoreMode === "weighted" ? null : bulkPercentileRanks(scores);
      feats.forEach(function (f, i) {
        const p = f.properties || {};
        if (scoreMode === "weighted") {
          const rawScore = scores[i];
          p[SYM_PCT_KEY] = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 0;
        } else {
          p[SYM_PCT_KEY] = ranks[i] != null ? ranks[i] : 0;
        }
      });
    }

    if (_urban95PmtilesProtocol) {
      feats.forEach(function (f) {
        const p = f.properties || {};
        const bid = Number(p.building_id);
        const val = Number(p[SYM_PCT_KEY]) || 0;
        if (!Number.isFinite(bid)) {
          if (!_urban95MissingBuildingIdLogged) {
            console.warn(
              "[urban95] Some building features lack numeric building_id; map feature-state choropleth skipped for those."
            );
            _urban95MissingBuildingIdLogged = true;
          }
          return;
        }
        map.setFeatureState(
          { source: BUILDINGS_MAP_SOURCE_ID, sourceLayer: BUILDINGS_VECTOR_LAYER_ID, id: bid },
          { [BUILDINGS_SYM_PCT_STATE_KEY]: val }
        );
      });
    }

    if (map.getLayer("buildings-fill")) {
      map.setPaintProperty("buildings-fill", "fill-color", BUILDINGS_CHOROPLETH_FILL_COLOR_EXPR);
    }
    updateAccessibilityLegendLabels();
  });
}

function getBuildingOverallScore(props, minutes) {
  const suffix = "_" + (scoreMode === "weighted" ? URBAN95_FIXED_MINUTES : minutes) + "min";
  const p = props || {};
  const filteringLockedToAll = scoreMode !== "weighted" && currentMode !== "house";
  const useAll = filteringLockedToAll || selectedAmenityTypes.size === allFilterTypes.length;
  const activeTypes = filteringLockedToAll ? allFilterTypes : Array.from(selectedAmenityTypes);
  if (scoreMode === "weighted") {
    if (!useAll && activeTypes.length > 0) {
      let weightedTotal = 0;
      let selectedWeight = 0;
      activeTypes.forEach(function (stem) {
        const comp = WEIGHTED_CATEGORY_BY_STEM[stem];
        if (!comp) return;
        const categoryScore = Number(p["score_weighted_" + stem + suffix]);
        if (!Number.isFinite(categoryScore)) return;
        weightedTotal += categoryScore * comp.weight;
        selectedWeight += comp.weight;
      });
      if (selectedWeight > 0) {
        return weightedTotal / selectedWeight;
      }
    }
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
  activeTypes.forEach((type) => {
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

function formatScoreInteger(value) {
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

function formatScoreExplainRowValue(row) {
  const v = Number(row && row.value);
  if (Number.isFinite(v)) return formatScoreInteger(v);
  return row && row.valueLabel ? String(row.valueLabel).replace(/\s*pts\s*$/i, "").trim() : "";
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

function getWeightedAverageValueFromSource(source, sfx) {
  const selectedStem = getSelectedWeightedCategoryStem();
  if (selectedStem) {
    const categoryKey = "avg_score_weighted_" + selectedStem + sfx;
    const categoryValue = Number(source && source[categoryKey]);
    if (Number.isFinite(categoryValue)) return categoryValue;
  }
  const overallKey = "avg_score_weighted" + sfx;
  const overallValue = Number(source && source[overallKey]);
  return Number.isFinite(overallValue) ? overallValue : 0;
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
  const selectedStem = getSelectedWeightedCategoryStem();
  const scoreKey = selectedStem ? "avg_score_weighted_" + selectedStem + sfx : "avg_score_weighted" + sfx;
  rows.sort(function (a, b) {
    return (Number(b[scoreKey]) || 0) - (Number(a[scoreKey]) || 0);
  });
  return rows;
}

function getCitywideWeightedAverageScore(stats, sfx) {
  if (!stats) return 0;
  const selectedStem = getSelectedWeightedCategoryStem();
  const directKey = selectedStem ? "avg_score_weighted_" + selectedStem + sfx : "avg_score_weighted" + sfx;
  const direct = Number(stats[directKey]);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const rankingVals = ((stats.neighborhood_ranking_weighted || []).map(function (r) {
    return Number(r[directKey]);
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
  if (currentMode !== "house") {
    return scoreMode + ":" + m + ":all";
  }
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

function getBuildingAmenityStatKeysForMinutes(minutes) {
  const cacheKey = String(minutes);
  if (buildingAmenityStatKeyCache.has(cacheKey)) {
    return buildingAmenityStatKeyCache.get(cacheKey);
  }
  const keys = new Set();
  if (buildingsData && Array.isArray(buildingsData.features) && buildingsData.features.length > 0) {
    const sample = buildingsData.features[0].properties || {};
    const suffix = "_" + minutes + "min";
    Object.keys(sample).forEach(function (k) {
      if (!k.startsWith("amen_") || !k.endsWith(suffix)) return;
      keys.add(k.slice(5, -suffix.length));
    });
  }
  buildingAmenityStatKeyCache.set(cacheKey, keys);
  return keys;
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

function heroPercentileMeterFillStyle(value0to100) {
  const v = Math.min(100, Math.max(0, Number(value0to100) || 0));
  return "width:" + v + "%;--meter-fill-pct:" + Math.max(1, v);
}

function buildExplainScoreBreakdown(buildingProps) {
  const p = buildingProps || {};
  const m = getScoreMinutes();
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
        color: comp.color,
        subrows: [],
      };
      const subcomponents = WEIGHTED_SUBCATEGORY_COMPONENTS[comp.stem] || [];
      subcomponents.forEach(function (sub) {
        const subCol = "score_weighted_sub_" + comp.stem + "_" + sub.stem + sfx;
        const raw = p[subCol];
        const hasValue = raw !== undefined && raw !== null && raw !== "";
        const subVal = hasValue ? Number(raw) || 0 : null;
        group.subrows.push({
          stem: sub.stem,
          label: sub.label,
          weight: sub.weight,
          totalWeight: sub.weight * comp.weight,
          value: subVal,
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
          cleanKey: c.key,
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
        valueLabel: formatMetricNumber(tw),
        percentile: percentileForSeries(series.explain.exp_tree_w, tw),
      });
      rows.push({
        label: "Street lights (×¼)",
        detail: "",
        value: sw,
        valueLabel: formatMetricNumber(sw),
        percentile: percentileForSeries(series.explain.exp_sl_w, sw),
      });

      const amenTypes = allFilterTypes.filter(function (t) {
        return t !== "trees" && t !== "street-lights";
      });
      const availableAmenityStatKeys = getBuildingAmenityStatKeysForMinutes(m);
      const amenRows = [];
      amenTypes.forEach(function (t) {
        const statKey = amenityTypeToBuildingStatKey(t);
        const id = "exp_amen_" + statKey;
        const arr = series.explainAmenity[id];
        if (!arr) return;
        const hasBuildingColumn = availableAmenityStatKeys.has(statKey);
        const cnt = hasBuildingColumn
          ? Number(p["amen_" + statKey + sfx]) || 0
          : Number(latestRadiusCounts[t]) || 0;
        const cfg = getAmenityConfig(t);
        amenRows.push({
          label: cfg.label,
          amenityType: t,
          detail: "",
          value: cnt,
          valueLabel: formatMetricNumber(cnt),
          percentile: hasBuildingColumn ? percentileForSeries(arr, cnt) : null,
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
  }

  return {
    formulaLine: isClean
      ? buildFilteredFormulaLine(useAll)
      : useAll
        ? "Amenities Focus index = POI count + ¼× trees + ¼× street lights."
        : "Partial Amenities Focus index = sum of selected POI counts plus ¼× trees and ¼× lights when selected. ",
    overallScoreLabel: formatMetricNumber(overallScore),
    overallPercentile: overallPct,
    rows: rows,
  };
}

function renderScoreExplainSidebarWeighted(categories) {
  const partialFilter = getScoreExplainPartialFilterSet();
  let html =
    '<div class="horizon-chart' + (partialFilter ? " score-explain-chart-partial-filter" : "") + '">';
  categories.forEach(function (cat, idx) {
    const pct = Math.min(100, Math.max(0, Number(cat.value) || 0));
    const color = cat.color || "#2563eb";
    const highlighted = isScoreExplainCategoryFilterHighlighted(cat);
    html += '<div class="horizon-group' + (highlighted ? " is-filter-highlight" : "") + '" data-cat-idx="' + idx + '"';
    if (highlighted) {
      html += ' style="--filter-highlight-color:' + escapeHtml(color) + '"';
    }
    html += ">";
    html += '<div class="horizon-row" tabindex="0" role="button" aria-expanded="false">';
    html +=
      renderHorizonLabelCell(cat.label, getWeightedCategoryIcon(cat.stem), "", color);
    html +=
      '<div class="horizon-bar-container" aria-hidden="true"><div class="horizon-bar-fill" style="' +
      horizonBarFillStyle(color, pct) +
      '"></div></div>';
    html +=
      '<span class="horizon-score-cell"><span class="horizon-score">' +
      escapeHtml(formatScoreInteger(Number(cat.value) || 0)) +
      '</span><span class="horizon-score-weight">×' +
      escapeHtml((cat.weight * 100).toFixed(0)) +
      '%</span></span></div>';
    html += '<div class="horizon-subs"><div class="horizon-subs-inner">';
    const subrows = cat.subrows || [];
    subrows.forEach(function (sub, subIdx) {
      const sv = sub.value != null ? Math.min(100, Math.max(0, Number(sub.value) || 0)) : 0;
      html += '<div class="horizon-sub-row">';
      html += renderHorizonSubLabelCell(sub.label, getWeightedSubcategoryIcon(sub.stem), null);
      html +=
        '<div class="horizon-sub-bar-container" aria-hidden="true"><div class="horizon-sub-bar-fill" style="' +
        horizonSubBarFillStyle(color, sv, subIdx, subrows.length) +
        '"></div></div>';
      html +=
        '<span class="horizon-score">' + escapeHtml(sub.value != null ? formatScoreInteger(sv) : "—") + "</span></div>";
    });
    html += "</div></div></div>";
  });
  html += "</div>";
  html += renderUrban95ReferenceRadiusNote();
  return html;
}

function renderUrban95ReferenceRadiusNote() {
  return (
    '<div class="score-explain-radius-note"><span class="score-explain-radius-note-label">Reference radius</span>' +
    '<span>Urban95 uses a fixed ' +
    URBAN95_REFERENCE_RADIUS_METERS +
    " m reference circle for most checks; trees and bike access use 20 m, shelters use 50 m.</span></div>"
  );
}

function renderScoreExplainSidebarExpanded(rows) {
  if (!rows || rows.length === 0) return "";

  const sections = [];
  let cur = null;
  rows.forEach(function (row) {
    if (row.sectionTitle) {
      cur = { title: row.sectionTitle, rows: [] };
      sections.push(cur);
    } else if (cur) {
      cur.rows.push(row);
    }
  });

  const partialFilter = getScoreExplainPartialFilterSet();
  let html =
    '<div class="horizon-chart horizon-chart-expanded' +
    (partialFilter ? " score-explain-chart-partial-filter" : "") +
    '">';
  sections.forEach(function (sec) {
    const maxVal = sec.rows.reduce(function (m, r) {
      const v = Number(r.value);
      if (!Number.isFinite(v)) return m;
      return v > m ? v : m;
    }, 0);

    html += '<h3 class="score-explain-section-h">' + escapeHtml(sec.title || "") + "</h3>";

    sec.rows.forEach(function (row) {
      const pct = row.percentile;
      let barW = 0;
      if (pct != null) {
        barW = Math.min(100, Math.max(0, Number(pct) || 0));
      } else {
        const v = Number(row.value) || 0;
        barW = maxVal > 0 ? Math.min(100, Math.max(0, (v / maxVal) * 100)) : 0;
      }
      const barColor = pct != null ? explainRankBarColor(pct) : "#2563eb";

      const highlighted = isScoreExplainRowFilterHighlighted(row);
      html += '<div class="horizon-group' + (highlighted ? " is-filter-highlight" : "") + '">';
      html += '<div class="horizon-row" tabindex="-1">';
      html += renderHorizonLabelCell(row.label, getScoreExplainRowIcon(row), "", null, {
        iconColor: SCORE_EXPLAIN_ICON_NEUTRAL,
        colorLabelText: false,
      });
      html +=
        '<div class="horizon-bar-container" aria-hidden="true"><div class="horizon-bar-fill" style="' +
        horizonBarFillStyle(barColor, barW) +
        '"></div></div>';
      html += '<span class="horizon-score">' + escapeHtml(formatScoreExplainRowValue(row)) + "</span></div>";
      html += "</div>";
    });
  });
  html += "</div>";
  return html;
}

function getScoreExplainHeroLabel() {
  if (scoreMode === "weighted") return getScoreModeLabel() + " score";
  return "Citywide percentile";
}

function populateScoreExplainBuildingContext() {
  const buildingCtxEl = document.getElementById("score-explain-building-ctx");
  const idEl = document.getElementById("score-explain-building-ctx-id");
  const coordsEl = document.getElementById("score-explain-building-ctx-coords");
  if (!buildingCtxEl || !idEl) return;

  if (!selectedBuildingCentroid || !selectedBuildingCentroid.feature) {
    buildingCtxEl.hidden = true;
    idEl.textContent = "";
    if (coordsEl) {
      coordsEl.textContent = "";
      coordsEl.hidden = true;
    }
    return;
  }

  const props = selectedBuildingCentroid.feature.properties || {};
  const bid = props.building_id;
  idEl.textContent = "Building #" + (bid != null ? String(bid) : "?");

  if (coordsEl && selectedBuildingCentroid.lat != null && selectedBuildingCentroid.lng != null) {
    coordsEl.textContent =
      Number(selectedBuildingCentroid.lat).toFixed(5) + ", " + Number(selectedBuildingCentroid.lng).toFixed(5);
    coordsEl.hidden = false;
  } else if (coordsEl) {
    coordsEl.textContent = "";
    coordsEl.hidden = true;
  }

  buildingCtxEl.hidden = false;
}

function populateScoreExplainSidebarHeader(breakdown, metrics) {
  const heroEl = document.getElementById("score-explain-sidebar-hero");
  const noteEl = document.getElementById("score-explain-sidebar-note");
  const weightedMode = scoreMode === "weighted";

  populateScoreExplainBuildingContext();

  if (!heroEl || !noteEl) return;

  if (!breakdown && !metrics) {
    heroEl.innerHTML = "";
    noteEl.innerHTML = "";
    return;
  }

  if (weightedMode) {
    let scoreVal = null;
    if (metrics && metrics.overallScore != null) scoreVal = Number(metrics.overallScore);
    if ((scoreVal == null || !Number.isFinite(scoreVal)) && breakdown && breakdown.overallScoreLabel != null) {
      scoreVal = Number(String(breakdown.overallScoreLabel).replace(/,/g, ""));
    }
    if (!Number.isFinite(scoreVal)) scoreVal = 0;
    scoreVal = Math.min(100, Math.max(0, scoreVal));
    let heroHtml = '<div class="percentile-summary score-explain-sidebar-hero-compact">';
    heroHtml +=
      '<p class="score-explain-hero-kicker">' + escapeHtml(getScoreExplainHeroLabel()) + "</p>";
    heroHtml += "<div class=\"percentile-value\">" + escapeHtml(formatScoreInteger(scoreVal)) + "<em>/100</em></div>";
    heroHtml +=
      '<div class="percentile-meter" aria-hidden="true"><div class="percentile-meter-fill" style="' +
      heroPercentileMeterFillStyle(scoreVal) +
      '"></div></div>';
    heroHtml += "</div>";
    heroEl.innerHTML = heroHtml;

    if (breakdown && breakdown.formulaLine) {
      noteEl.innerHTML =
        '<details class="score-explain-formula-fold"><summary>Urban95 equation</summary><p>' +
        escapeHtml(breakdown.formulaLine) +
        "</p></details>";
    } else {
      noteEl.innerHTML = "";
    }
    return;
  }

  let op = null;
  if (metrics && metrics.overallPercentile != null) op = metrics.overallPercentile;
  if (op == null && breakdown && breakdown.overallPercentile != null) op = breakdown.overallPercentile;

  let heroHtml = '<div class="percentile-summary score-explain-sidebar-hero-compact">';
  heroHtml += '<p class="score-explain-hero-kicker">' + escapeHtml(getScoreExplainHeroLabel()) + "</p>";
  if (op != null) {
    heroHtml +=
      "<div class=\"percentile-value\">" +
      escapeHtml(String(op)) +
      "<span>" +
      escapeHtml(getOrdinalSuffix(op)) +
      "</span><em>percentile</em></div>";
    heroHtml +=
      '<div class="percentile-meter" aria-hidden="true"><div class="percentile-meter-fill" style="' +
      heroPercentileMeterFillStyle(op) +
      '"></div></div>';
  } else {
    heroHtml += '<div class="percentile-value">—</div>';
    heroHtml +=
      '<div class="percentile-meter" aria-hidden="true"><div class="percentile-meter-fill" style="' +
      heroPercentileMeterFillStyle(0) +
      '"></div></div>';
  }
  heroHtml += "</div>";
  heroEl.innerHTML = heroHtml;

  if (breakdown && breakdown.formulaLine) {
    noteEl.innerHTML = "<p>" + escapeHtml(breakdown.formulaLine) + "</p>";
  } else {
    noteEl.textContent = "";
  }
}

function renderScoreExplainSidebar(breakdown, metrics, ctx) {
  void metrics;
  void ctx;
  const unavailable =
    '<p class="score-explain-empty">Score breakdown is unavailable for the current selection.</p>';

  if (scoreMode === "weighted") {
    if (!breakdown || !Array.isArray(breakdown.weightedCategories) || breakdown.weightedCategories.length === 0) {
      return unavailable;
    }
    return renderScoreExplainSidebarWeighted(breakdown.weightedCategories);
  }

  if (!breakdown || !Array.isArray(breakdown.rows) || breakdown.rows.length === 0) {
    return unavailable;
  }
  return renderScoreExplainSidebarExpanded(breakdown.rows);
}

let scoreExplainFitRaf = 0;

const SCORE_EXPLAIN_CONTENT_DESIGN = {
  bar: 34,
  subBar: 24,
  rowPad: 0.55,
  subRowPad: 0.28,
  font: 1,
  icon: 20,
  subIcon: 17,
  groupGap: 0,
  subsGap: 0.25,
  labelCol: "10.75rem",
};

function resetScoreExplainSidebarFit(body, inner) {
  if (body) {
    body.classList.remove("is-content-scaled", "is-chart-roomy");
    body.style.removeProperty("max-height");
    body.style.removeProperty("--sidebar-content-scale");
    body.style.removeProperty("--sidebar-content-bar-h");
    body.style.removeProperty("--sidebar-content-sub-bar-h");
    body.style.removeProperty("--sidebar-content-row-pad");
    body.style.removeProperty("--sidebar-content-sub-row-pad");
    body.style.removeProperty("--sidebar-content-font");
    body.style.removeProperty("--sidebar-content-icon");
    body.style.removeProperty("--sidebar-content-sub-icon");
    body.style.removeProperty("--sidebar-content-group-gap");
    body.style.removeProperty("--sidebar-content-subs-gap");
    body.style.removeProperty("--sidebar-fit-label-col");
  }
  if (inner) {
    inner.classList.remove("is-chart-fit-tight", "is-chart-fit-ultra");
  }
}

function applyScoreExplainContentScale(body, inner, scale) {
  const s = Math.min(1, Math.max(0.48, scale));
  const d = SCORE_EXPLAIN_CONTENT_DESIGN;
  body.style.setProperty("--sidebar-content-scale", String(s));
  body.style.setProperty("--sidebar-content-bar-h", Math.max(14, Math.round(d.bar * s)) + "px");
  body.style.setProperty("--sidebar-content-sub-bar-h", Math.max(10, Math.round(d.subBar * s)) + "px");
  body.style.setProperty("--sidebar-content-row-pad", Math.max(0.12, d.rowPad * s) + "rem");
  body.style.setProperty("--sidebar-content-sub-row-pad", Math.max(0.08, d.subRowPad * s) + "rem");
  body.style.setProperty("--sidebar-content-font", String(s));
  body.style.setProperty("--sidebar-content-icon", Math.max(14, Math.round(d.icon * s)) + "px");
  body.style.setProperty("--sidebar-content-sub-icon", Math.max(12, Math.round(d.subIcon * s)) + "px");
  body.style.setProperty("--sidebar-content-group-gap", Math.max(0, Math.round(d.groupGap + 3 * s)) + "px");
  body.style.setProperty("--sidebar-content-subs-gap", Math.max(0.08, d.subsGap * s) + "rem");
  if (s < 1) {
    const labelRem = parseFloat(d.labelCol);
    body.style.setProperty("--sidebar-fit-label-col", Math.max(8.5, labelRem * s) + "rem");
  } else {
    body.style.removeProperty("--sidebar-fit-label-col");
  }
  body.classList.toggle("is-content-scaled", s < 1);
  inner.classList.toggle("is-chart-fit-tight", s < 0.9);
  inner.classList.toggle("is-chart-fit-ultra", s < 0.76);
}

function fitScoreExplainSidebarToViewport() {
  const sidebar = document.getElementById("score-explain-sidebar");
  const inner = sidebar ? sidebar.querySelector(".score-explain-sidebar-inner") : null;
  const header = sidebar ? sidebar.querySelector(".score-explain-sidebar-header") : null;
  const body = document.getElementById("score-explain-sidebar-body");
  if (!sidebar || !inner || !header || !body || !sidebar.classList.contains("is-open")) return;

  resetScoreExplainSidebarFit(body, inner);

  const emptyEl = document.getElementById("score-explain-sidebar-empty");
  let reserved = header.offsetHeight;
  if (emptyEl && !emptyEl.hidden) reserved += emptyEl.offsetHeight;
  const bodyStyle = getComputedStyle(body);
  reserved += parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);

  const available = Math.max(80, inner.clientHeight - reserved);
  body.style.maxHeight = available + "px";

  const chart = body.querySelector(".horizon-chart");
  if (!chart) return;

  function contentHeight() {
    return body.scrollHeight;
  }

  let needed = contentHeight();
  body.classList.toggle("is-chart-roomy", needed < available * 0.92);

  if (needed <= available) return;

  let scale = (available / needed) * 0.98;
  applyScoreExplainContentScale(body, inner, scale);

  needed = contentHeight();
  if (needed > available) {
    scale = scale * (available / needed) * 0.98;
    applyScoreExplainContentScale(body, inner, scale);
  }

  body.classList.toggle("is-chart-roomy", contentHeight() < available * 0.92);
}

function scheduleFitScoreExplainSidebar() {
  cancelAnimationFrame(scoreExplainFitRaf);
  scoreExplainFitRaf = requestAnimationFrame(function () {
    scoreExplainFitRaf = requestAnimationFrame(fitScoreExplainSidebarToViewport);
  });
}

function bindScoreExplainSidebarInteractions(root) {
  if (root.getAttribute("data-score-explain-bound") === "1") return;
  root.setAttribute("data-score-explain-bound", "1");
  root.addEventListener("click", function (e) {
    const row = e.target.closest('.horizon-row[role="button"]');
    if (!row || !root.contains(row)) return;
    const group = row.closest(".horizon-group");
    const subs = group ? group.querySelector(".horizon-subs") : null;
    if (!subs) return;
    const open = subs.classList.toggle("is-open");
    row.classList.toggle("is-expanded", open);
    row.setAttribute("aria-expanded", open ? "true" : "false");
    scheduleFitScoreExplainSidebar();
  });
  root.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest('.horizon-row[role="button"]');
    if (!row || !root.contains(row)) return;
    e.preventDefault();
    row.click();
  });
}

function isScoreExplainSidebarOpen() {
  const el = document.getElementById("score-explain-sidebar");
  return !!(el && el.classList.contains("is-open"));
}

function setScoreExplainMapPadding(open) {
  const sidebar = document.getElementById("score-explain-sidebar");
  if (!map || !sidebar) return;
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  if (!open || isMobile) {
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  } else {
    const w = sidebar.getBoundingClientRect().width || 400;
    map.setPadding({ top: 0, bottom: 0, left: 0, right: Math.round(w) });
  }
  map.resize();
}

function syncScoreExplainBackdrop() {
  const backdrop = document.getElementById("score-explain-backdrop");
  if (!backdrop) return;
  if (!isScoreExplainSidebarOpen()) {
    backdrop.hidden = true;
    return;
  }
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  backdrop.hidden = !isMobile;
}

function focusMapContainerAfterSidebar() {
  if (map && typeof map.getCanvas === "function") {
    const canvas = map.getCanvas();
    if (canvas) {
      canvas.setAttribute("tabindex", "-1");
      canvas.focus({ preventScroll: true });
      return;
    }
  }
  const mapEl = document.getElementById("map");
  if (mapEl) {
    mapEl.setAttribute("tabindex", "-1");
    mapEl.focus({ preventScroll: true });
  }
}

function showScoreExplainSidebar() {
  const el = document.getElementById("score-explain-sidebar");
  if (!el) return;
  el.classList.add("is-open");
  el.removeAttribute("aria-hidden");
  document.body.classList.add("score-explain-open");
  setScoreExplainMapPadding(true);
  syncScoreExplainBackdrop();
  scheduleFitScoreExplainSidebar();
  const closeBtn = document.getElementById("score-explain-sidebar-close");
  if (closeBtn) {
    closeBtn.focus({ preventScroll: true });
  }
}

function hideScoreExplainSidebar() {
  const el = document.getElementById("score-explain-sidebar");
  if (!el) return;
  el.classList.remove("is-open");
  el.setAttribute("aria-hidden", "true");
  document.body.classList.remove("score-explain-open");
  setScoreExplainMapPadding(false);
  syncScoreExplainBackdrop();
  focusMapContainerAfterSidebar();
}

function syncScoreExplainSidebar() {
  const root = document.getElementById("score-explain-sidebar-body");
  const emptyEl = document.getElementById("score-explain-sidebar-empty");
  if (!root) return;

  if (!selectedBuildingCentroid || !selectedBuildingCentroid.feature) {
    hideScoreExplainSidebar();
    return;
  }
  if (selectedAmenityTypes.size === 0) {
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = "Select amenity types in the filter to see a score breakdown.";
    }
    root.innerHTML = "";
    populateScoreExplainSidebarHeader(null, null);
    showScoreExplainSidebar();
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  const props = selectedBuildingCentroid.feature.properties || {};
  const breakdown = buildExplainScoreBreakdown(props);
  const metrics = buildPercentileMetrics(props);

  if (!breakdown && !metrics) {
    // Post-review: mirror "Score data unavailable" - show sidebar with empty state message
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = "Score data unavailable";
    }
    root.innerHTML = "";
    populateScoreExplainSidebarHeader(null, null);
    showScoreExplainSidebar();
    return;
  }

  populateScoreExplainSidebarHeader(breakdown, metrics);
  root.innerHTML = renderScoreExplainSidebar(breakdown, metrics, {
    building: selectedBuildingCentroid,
    scoreKind: getScoreModeLabel(),
    minutes: getScoreMinutes(),
  });
  bindScoreExplainSidebarInteractions(root);
  showScoreExplainSidebar();
  scheduleFitScoreExplainSidebar();
}

function updateFilterLabel() {
  if (currentMode !== "house") {
    if (scoreMode !== "weighted") {
      filterLabel.textContent = "All types (building view only)";
      return;
    }
  }
  const total = allFilterTypes.length;
  const selected = selectedAmenityTypes.size;

  if (scoreMode === "weighted") {
    if (selected === 0 || selected === total) {
      filterLabel.textContent = "All categories";
    } else if (selected === 1) {
      const stem = Array.from(selectedAmenityTypes)[0];
      const config = WEIGHTED_CATEGORY_BY_STEM[stem];
      filterLabel.textContent = config ? config.label : stem;
    } else {
      filterLabel.textContent = selected + " selected";
    }
    return;
  }

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
  if (scoreMode !== "weighted" && currentMode !== "house") {
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
  buildingAmenityStatKeyCache.clear();
  updateBuildingColors();

  if (selectedBuildingCentroid) {
    selectBuilding(selectedBuildingCentroid, false);
  }

  if (currentMode === "neighborhood") {
    updateNeighborhoodColors();
    const nhModal = document.getElementById("neighborhood-modal");
    if (nhModal && nhModal.classList.contains("show") && selectedNeighborhood) {
      showNeighborhoodModal(selectedNeighborhood);
    }
  } else if (currentMode === "citywide") {
    updateNeighborhoodColors();
    const cwModal = document.getElementById("citywide-modal");
    if (cwModal && cwModal.classList.contains("show")) {
      renderCitywideModal();
    } else {
      updateCitywideModalTitle();
    }
  } else if (currentMode === "house") {
    updateNeighborhoodSurfaceData();
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

function buildFilterRowMarkup(value, color, label) {
  const pillStyle =
    `--pill-color:${color};` +
    `--pill-bg:${colorWithAlpha(color, 0.14)};` +
    `--pill-border:${colorWithAlpha(color, 0.35)};` +
    `--row-accent:${color};` +
    `--row-accent-soft:${colorWithAlpha(color, 0.10)};` +
    `--row-accent-strong:${colorWithAlpha(color, 0.45)};`;
  return (
    `<input type="radio" name="amenity-filter-only" value="${value}" />` +
    `<span class="filter-type-pill" style="${pillStyle}">${label}</span>`
  );
}

function buildFilterItems(types) {
  filterItems.innerHTML = "";
  filterItems.classList.toggle("filter-items--weighted", scoreMode === "weighted");
  allFilterTypes = [];

  const neutral = "#6b7280";
  const allRow = document.createElement("label");
  allRow.className = "filter-item filter-item--all";
  allRow.innerHTML = buildFilterRowMarkup(
    "all",
    neutral,
    scoreMode === "weighted" ? "All categories" : "All types"
  );
  allRow.querySelector("input").addEventListener("change", handleFilterRadioChange);
  filterItems.appendChild(allRow);

  if (scoreMode === "weighted") {
    WEIGHTED_CATEGORY_COMPONENTS.forEach(function (comp) {
      allFilterTypes.push(comp.stem);
      const label = document.createElement("label");
      label.className = "filter-item";
      label.innerHTML = buildFilterRowMarkup(comp.stem, comp.color, comp.label);
      label.querySelector("input").addEventListener("change", handleFilterRadioChange);
      filterItems.appendChild(label);
    });
  } else {
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

    if (allTreesData && allTreesData.features.length > 0) {
      const treesConfig = AMENITY_TYPE_CONFIG["trees"];
      const treesColor = treesConfig.color || DEFAULT_CONFIG.color;
      const treesLabel = document.createElement("label");
      treesLabel.className = "filter-item";
      treesLabel.innerHTML = buildFilterRowMarkup("trees", treesColor, treesConfig.label);
      treesLabel.querySelector("input").addEventListener("change", handleFilterRadioChange);
      filterItems.appendChild(treesLabel);
    }

    if (allStreetLightsData && allStreetLightsData.features.length > 0) {
      const slConfig = AMENITY_TYPE_CONFIG["street-lights"];
      const slColor = slConfig.color || DEFAULT_CONFIG.color;
      const slLabel = document.createElement("label");
      slLabel.className = "filter-item";
      slLabel.innerHTML = buildFilterRowMarkup("street-lights", slColor, slConfig.label);
      slLabel.querySelector("input").addEventListener("change", handleFilterRadioChange);
      filterItems.appendChild(slLabel);
    }

    typesWithPoints.forEach(type => {
      const config = getAmenityConfig(type);
      const label = document.createElement("label");
      label.className = "filter-item";
      const color = config.color || DEFAULT_CONFIG.color;
      label.innerHTML = buildFilterRowMarkup(type, color, config.label);
      label.querySelector("input").addEventListener("change", handleFilterRadioChange);
      filterItems.appendChild(label);
    });
  }

  selectedAmenityTypes.clear();
  allFilterTypes.forEach(function (type) {
    selectedAmenityTypes.add(type);
  });

  const wantAll =
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
  buildingAmenityStatKeyCache.clear();
}

// Track if we just opened the popup (to prevent immediate close on touch)
let popupJustOpened = false;

function openFilterPopup() {
  if (scoreMode !== "weighted" && currentMode !== "house") return;
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
  if (scoreMode !== "weighted" && currentMode !== "house") return;
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
    if (isScoreExplainSidebarOpen()) {
      hideScoreExplainSidebar();
      e.stopPropagation();
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

if (showTreesToggle) {
  showTreesToggle.addEventListener("change", function () {
    applyShowPointsToggle();
  });
}

if (showLightsToggle) {
  showLightsToggle.addEventListener("change", function () {
    applyShowPointsToggle();
  });
}

if (showAmenityPointsToggle) {
  showAmenityPointsToggle.addEventListener("change", function () {
    applyShowPointsToggle();
  });
}

if (showHeatmapToggle) {
  showHeatmapToggle.addEventListener("change", function () {
    if (currentMode !== "house" || !map.getLayer("neighborhoods-surface")) return;
    map.setLayoutProperty("neighborhoods-surface", "visibility", this.checked ? "visible" : "none");
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

  const candidates = getClosestBuildingCandidates(lngLat.lng, lngLat.lat);
  candidates.forEach(b => {
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
function loadIsochrones(options) {
  const opts = options || {};
  const background = opts.background === true;
  if (isochronesLoaded || isochroneLoadStarted) return;
  isochroneLoadStarted = true;
  const isochronesLoadStartedAt = performance.now();
  console.log("[Load] isochrones: start");

  if (!background) {
    setLoadingStatus("Loading walking areas...");
  }

  fetchJsonWithGzipFallback(ISOCHRONES_URL)
    .then(function (data) {
      return urban95Perf.phase("loadIsochrones:indexAndFinish", function () {
        if (!data || !data.features) throw new Error("Invalid isochrone data");
        const isochronesIndexStartedAt = performance.now();
        data.features.forEach(function (f) {
          const bid = f.properties.building_id;
          const mins = f.properties.minutes;
          isochroneIndex[bid + "_" + mins] = f;
        });
        console.log(
          "[Load] isochrones: indexed",
          data.features.length,
          "features in",
          Math.round(performance.now() - isochronesIndexStartedAt) + "ms"
        );
        isochronesLoaded = true;
        loadingState.isochrones = true;
        updateLoadingProgress();
        console.log(
          "[Load] isochrones: complete total",
          Math.round(performance.now() - isochronesLoadStartedAt) + "ms"
        );
        if (waitingForIsochroneLoad) {
          hideIsochroneLoadingScreen();
        }
        if (selectedBuildingCentroid) {
          selectBuilding(selectedBuildingCentroid, false);
        }
      });
    })
    .catch(function (err) {
      console.error("Failed to load isochrones:", err);
      isochroneLoadStarted = false;
      loadingState.isochrones = true;
      updateLoadingProgress();
      if (waitingForIsochroneLoad) {
        setLoadingStatus("Failed loading walking areas. Please retry in a moment.");
        setTimeout(() => {
          hideIsochroneLoadingScreen();
        }, 900);
      }
    });
}

// Look up the precomputed isochrone polygon for a building
function getIsochrone(buildingId, minutes) {
  const key = buildingId + "_" + minutes;
  return isochroneIndex[key] || null;
}

function isCoordinateInsidePolygon(coord, polygon, bbox) {
  if (!coord || coord.length < 2) return false;
  const lng = coord[0];
  const lat = coord[1];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  if (bbox) {
    if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) {
      return false;
    }
  }
  return turf.booleanPointInPolygon(coord, polygon);
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
  const polygonBbox = turf.bbox(polygon);

  if (allAmenitiesData && allAmenitiesData.features) {
    allAmenitiesData.features.forEach((f, index) => {
      const type = f.properties.amenity_type;
      if (!useAll && !selectedAmenityTypes.has(type)) return;
      const coords = f.geometry && f.geometry.coordinates;
      if (isCoordinateInsidePolygon(coords, polygon, polygonBbox)) {
        amenityIndices.add(index);
        counts[type] = (counts[type] || 0) + 1;
      }
    });
  }

  if (allTreesData && allTreesData.features && (useAll || selectedAmenityTypes.has("trees"))) {
    allTreesData.features.forEach((f, index) => {
      const coords = f.geometry && f.geometry.coordinates;
      if (isCoordinateInsidePolygon(coords, polygon, polygonBbox)) {
        treeIndices.add(index);
        counts["trees"] = (counts["trees"] || 0) + 1;
      }
    });
  }

  if (allStreetLightsData && allStreetLightsData.features && (useAll || selectedAmenityTypes.has("street-lights"))) {
    allStreetLightsData.features.forEach((f, index) => {
      const coords = f.geometry && f.geometry.coordinates;
      if (isCoordinateInsidePolygon(coords, polygon, polygonBbox)) {
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
  return urban95Perf.phase("selectBuilding", function () {
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
      radiusSource.setData(buildUrban95ReferenceRadius(building.lng, building.lat));
    }

    updateAmenitiesSource();
    updateTreesSource();
    updateStreetLightsSource();
    updateRadiusInfo();

    if (doFly) {
      const radiusPolygon = buildUrban95ReferenceRadius(building.lng, building.lat);
      map.easeTo({
        center: [building.lng, building.lat],
        zoom: Math.max(map.getZoom(), getZoomForPolygon(radiusPolygon)),
        duration: 1400,
        easing: easeInOutQuad,
        essential: true
      });
    }
    return;
  }

  if (!isochronesLoaded) {
    showIsochroneLoadingScreen();
    loadIsochrones();
    if (doFly) {
      map.easeTo({
        center: [building.lng, building.lat],
        zoom: Math.max(map.getZoom(), 16),
        duration: 1400,
        easing: easeInOutQuad,
        essential: true
      });
    }
    updateRadiusInfo();
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
  });
}

// Update displayed radius info
function updateRadiusInfo() {
  const infoPanel = document.getElementById("radius-info");
  if (!infoPanel) return;
  if (currentMode !== "house") {
    infoPanel.style.display = "none";
    hideScoreExplainSidebar();
    return;
  }
  syncScoreExplainSidebar();
  infoPanel.style.display = "none";
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
  hideScoreExplainSidebar();
}

const scoreModelToggle = document.getElementById("score-model-toggle");
if (scoreModelToggle) {
  scoreModelToggle.addEventListener("change", function (e) {
    const input = e.target;
    if (!input || input.name !== "score-model") return;
    urban95Perf.session("score-model → " + (input.value === "expanded" ? "Amenities Focus" : "Urban95"));
    urban95Perf.phase("scoreModelToggle:handler", function () {
      if (input.value === "expanded" || input.value === "weighted") {
        scoreMode = input.value;
      } else {
        scoreMode = "weighted";
      }
      percentileSeriesCache.clear();
      buildingAmenityStatKeyCache.clear();
      if (scoreMode !== "weighted") {
        if (!isochronesLoaded) {
          showIsochroneLoadingScreen();
        }
        loadIsochrones();
      } else {
        if (waitingForIsochroneLoad) {
          hideIsochroneLoadingScreen();
        }
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
    updateNeighborhoodSurfaceData();
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
  const appLoadStartedAt = performance.now();
  console.log("[Load] app startup: map load event");
  loadingState.mapReady = true;
  updateLoadingProgress();
  applyParkDotPattern();
  
  // Load icons first
  setLoadingStatus("Loading icons...");
  const iconsStartedAt = performance.now();
  await loadAmenityIcons();
  console.log(
    "[Load] icons: complete",
    Math.round(performance.now() - iconsStartedAt) + "ms"
  );
  loadingState.icons = true;
  updateLoadingProgress();
  
  // Add amenity layers after icons are loaded
  const layerInitStartedAt = performance.now();
  addAmenityLayers();
  applyShowPointsToggle();
  console.log(
    "[Load] layer init: complete",
    Math.round(performance.now() - layerInitStartedAt) + "ms"
  );

  setLoadingStatus("Loading buildings...");
  const buildingsStartedAt = performance.now();
  fetchJsonWithGzipFallback(BUILDINGS_URL)
    .then(function (fc) {
      console.log("[Load] buildings: features", (fc.features || []).length);
      buildingsData = fc;
      warnIfBuildingScoresIncomplete(fc);
      percentileSeriesCache.clear();
      buildingAmenityStatKeyCache.clear();
      
      const centroidsStartedAt = performance.now();
      buildingCentroids = [];
      (fc.features || []).forEach(function (f) {
        if (f.geometry) {
          const props = f.properties || {};
          const storedLng = Number(props.centroid_lng);
          const storedLat = Number(props.centroid_lat);
          const hasStoredCentroid = Number.isFinite(storedLng) && Number.isFinite(storedLat);
          const centroid = hasStoredCentroid ? null : turf.centroid(f);
          const lng = hasStoredCentroid ? storedLng : centroid.geometry.coordinates[0];
          const lat = hasStoredCentroid ? storedLat : centroid.geometry.coordinates[1];
          buildingCentroids.push({
            lng: lng,
            lat: lat,
            properties: props,
            feature: f
          });
        }
      });
      buildBuildingCentroidGridIndex();
      console.log(
        "[Load] buildings: centroid build",
        buildingCentroids.length,
        "items in",
        Math.round(performance.now() - centroidsStartedAt) + "ms"
      );
      
      const buildingColorsStartedAt = performance.now();
      updateBuildingColors();
      console.log(
        "[Load] buildings: color update",
        Math.round(performance.now() - buildingColorsStartedAt) + "ms"
      );
      loadingState.buildings = true;
      updateLoadingProgress();
      console.log(
        "[Load] buildings: complete total",
        Math.round(performance.now() - buildingsStartedAt) + "ms"
      );
    })
    .catch(function (err) {
      console.error("Failed to load buildings:", err);
      loadingState.buildings = true;
      updateLoadingProgress();
    });

  setLoadingStatus("Loading parks...");
  const parksStartedAt = performance.now();
  fetchJsonWithGzipFallback(PARKS_URL, { required: false }).then(function (fc) {
    if (fc && map.getSource("parks")) map.getSource("parks").setData(fc);
    console.log(
      "[Load] parks: complete",
      fc && fc.features ? fc.features.length : 0,
      "features in",
      Math.round(performance.now() - parksStartedAt) + "ms"
    );
    loadingState.parks = true;
    updateLoadingProgress();
  }).catch(function (err) {
    console.error("Failed to load parks:", err);
    loadingState.parks = true;
    updateLoadingProgress();
  });
  
  setLoadingStatus("Loading amenities...");
  const amenitiesStartedAt = performance.now();
  Promise.all([
    fetchJsonWithGzipFallback(AMENITIES_CLEAN_URL, { required: true }),
    fetchJsonWithGzipFallback(AMENITIES_LEGACY_URL, { required: false })
  ])
    .then(function (results) {
      const amenitiesProcessStartedAt = performance.now();
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
      console.log(
        "[Load] amenities: process/apply complete in",
        Math.round(performance.now() - amenitiesProcessStartedAt) + "ms",
        "clean=",
        cleanFc && cleanFc.features ? cleanFc.features.length : 0,
        "legacy=",
        legacyFc && legacyFc.features ? legacyFc.features.length : 0
      );

      loadingState.amenities = true;
      updateLoadingProgress();
      console.log(
        "[Load] amenities: complete total",
        Math.round(performance.now() - amenitiesStartedAt) + "ms"
      );

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

  loadingState.isochrones = true;
  updateLoadingProgress();
  loadIsochrones({ background: true });
  console.log("[Load] isochrones: background loading started");
  console.log(
    "[Load] app startup: async jobs queued in",
    Math.round(performance.now() - appLoadStartedAt) + "ms"
  );

  applyHouseModeHexBackground();

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
  return fetchJsonWithGzipFallback(NEIGHBORHOOD_CHARTS_URL)
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
  return fetchJsonWithGzipFallback(NEIGHBORHOODS_URL)
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
  return fetchJsonWithGzipFallback(NEIGHBORHOOD_SURFACE_URL)
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

/**
 * Neighborhood hex surface (Urban95 + Amenities score modes): opacity decreases as the user zooms in
 * so streets and basemap stay readable, with a floor so cells never vanish entirely.
 * Short plateau at 1 (matches legacy “solid” look briefly), then fade starts well before street-detail zoom.
 * Zoom stops MUST be strictly ascending (MapLibre rejects out-of-order interpolate stops — layer will not draw).
 */
function getNeighborhoodHexSurfaceOpacityExpression() {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    10,
    1,
    12,
    1,
    13,
    0.88,
    14.5,
    0.68,
    16.5,
    0.5,
    18.5,
    0.32,
    20,
    0.2,
    21,
    0.12,
    24,
    0.12,
  ];
}

function loadCitywideStats() {
  if (citywideStats) return Promise.resolve(citywideStats);
  return fetchJsonWithGzipFallback(CITYWIDE_STATS_URL)
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

  const surfaceBeforeId = map.getLayer("buildings-fill") ? "buildings-fill" : undefined;
  map.addLayer(
    {
      id: "neighborhoods-surface",
      type: "fill",
      source: "neighborhood-score-surface",
      paint: {
        "fill-color": getNeighborhoodSurfaceColorExpression(getNeighborhoodSurfaceScorePropertyKey()),
        "fill-outline-color": getNeighborhoodSurfaceColorExpression(getNeighborhoodSurfaceScorePropertyKey()),
        "fill-opacity": getNeighborhoodHexSurfaceOpacityExpression(),
        "fill-antialias": true,
      },
      layout: { visibility: "none" },
    },
    surfaceBeforeId
  );

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


/**
 * House mode renders the hex score grid as a soft, borderless background underneath the
 * buildings. Non-residential hexes (gray "has_buildings == 0" cells) are filtered out so the
 * heatmap stays focused on areas relevant to the building analysis. The surface is explicitly
 * moved below `buildings-fill` so buildings always render fully opaque on top of the heatmap.
 */
function applyHouseModeHexBackground() {
  if (currentMode !== "house") return;
  loadNeighborhoodSurfaceData().then(function () {
    if (currentMode !== "house") return;
    addNeighborhoodLayers();
    if (!map.getLayer("neighborhoods-surface")) return;
    if (map.getLayer("buildings-fill")) {
      map.moveLayer("neighborhoods-surface", "buildings-fill");
    }
    map.setPaintProperty("neighborhoods-surface", "fill-opacity", HOUSE_MODE_HEX_OPACITY);
    map.setFilter("neighborhoods-surface", ["==", ["to-number", ["get", "has_buildings"], 0], 1]);
    const heatmapVisible = showHeatmapToggle ? showHeatmapToggle.checked : true;
    map.setLayoutProperty("neighborhoods-surface", "visibility", heatmapVisible ? "visible" : "none");
    updateNeighborhoodSurfaceData();
  });
}

function updateNeighborhoodSurfaceData() {
  return urban95Perf.phase("updateNeighborhoodSurfaceData", function () {
    const surfaceSrc = map.getSource("neighborhood-score-surface");
    if (!surfaceSrc) return;
    let precomputedScoreKey = getNeighborhoodSurfaceScorePropertyKey();
    if (
      scoreMode === "weighted" &&
      precomputedScoreKey &&
      precomputedScoreKey !== "score_weighted" &&
      neighborhoodSurfaceData &&
      Array.isArray(neighborhoodSurfaceData.features) &&
      neighborhoodSurfaceData.features.length > 0
    ) {
      const sample = neighborhoodSurfaceData.features[0].properties || {};
      if (!Object.prototype.hasOwnProperty.call(sample, precomputedScoreKey)) {
        precomputedScoreKey = "score_weighted";
      }
    }
    if (
      precomputedScoreKey &&
      neighborhoodSurfaceData &&
      Array.isArray(neighborhoodSurfaceData.features) &&
      neighborhoodSurfaceData.features.length > 0
    ) {
      surfaceSrc.setData(neighborhoodSurfaceData);
      if (map.getLayer("neighborhoods-surface")) {
        const colorExpr = getNeighborhoodSurfaceColorExpression(precomputedScoreKey);
        const outlineExpr = currentMode === "house" ? "rgba(0,0,0,0)" : colorExpr;
        map.setPaintProperty("neighborhoods-surface", "fill-color", colorExpr);
        map.setPaintProperty("neighborhoods-surface", "fill-outline-color", outlineExpr);
      }
      return;
    }
    surfaceSrc.setData({ type: "FeatureCollection", features: [] });
    if (map.getLayer("neighborhoods-surface")) {
      const colorExpr = getNeighborhoodSurfaceColorExpression(precomputedScoreKey || "score");
      const outlineExpr = currentMode === "house" ? "rgba(0,0,0,0)" : colorExpr;
      map.setPaintProperty("neighborhoods-surface", "fill-color", colorExpr);
      map.setPaintProperty("neighborhoods-surface", "fill-outline-color", outlineExpr);
    }
  });
}


function updateNeighborhoodColors() {
  return urban95Perf.phase("updateNeighborhoodColors", function () {
    if (!neighborhoodsData || !map.getLayer("neighborhoods-fill")) return;

    const sfx = "_" + getScoreMinutes() + "min";
    const avgKey = getNeighborhoodAverageKey(sfx);

    const feats = neighborhoodsData.features;
    const values = feats.map((f) => {
      const p = f.properties || {};
      if (scoreMode === "weighted") {
        const selectedValue = Number(p[avgKey]);
        if (Number.isFinite(selectedValue)) return selectedValue;
        return Number(p["avg_score_weighted" + sfx]) || 0;
      }
      return Number(p[avgKey]) || 0;
    });
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
  });
}

function switchMode(mode) {
  return urban95Perf.phase("switchMode", function () {
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
  });
}

function setControlsForMode(mode) {
  const showPointsSection = document.getElementById("points-visibility-section");
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
  syncFilterUiForScoreMode();
  updateFilterLabel();
}

function enterHouseMode() {
  return urban95Perf.phase("enterHouseMode", function () {
    setControlsForMode("house");

    // Buildings render crisp on top of the soft hex heatmap background.
    if (map.getLayer("buildings-fill")) {
      map.setLayoutProperty("buildings-fill", "visibility", "visible");
      map.setPaintProperty("buildings-fill", "fill-opacity", 1);
    }
    if (map.getLayer("neighborhoods-fill")) map.setLayoutProperty("neighborhoods-fill", "visibility", "none");
    if (map.getLayer("neighborhoods-line")) map.setLayoutProperty("neighborhoods-line", "visibility", "none");
    if (map.getLayer("neighborhoods-label")) map.setLayoutProperty("neighborhoods-label", "visibility", "none");

    applyShowPointsToggle();
    updateDeckAmenityLayers();
    updateBuildingColors();
    applyHouseModeHexBackground();
  });
}

function enterNeighborhoodMode() {
  urban95Perf.phase("enterNeighborhoodMode:syncSetup", function () {
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
    if (map.getLayer("neighborhoods-surface")) {
      map.setPaintProperty(
        "neighborhoods-surface",
        "fill-opacity",
        getNeighborhoodHexSurfaceOpacityExpression()
      );
      map.setFilter("neighborhoods-surface", null);
    }
    setTreesAndLightsVisibility(false);
    updateDeckAmenityLayers();
  });

  urban95Perf.phaseAsync(
    "enterNeighborhoodMode:loadsThenApply",
    loadNeighborhoods().then(function (data) {
      return Promise.all([loadNeighborhoodChartsPayload(), loadNeighborhoodSurfaceData()]).then(function () {
        urban95Perf.phase("enterNeighborhoodMode:applyLayersFitBounds", function () {
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
    })
  );
}

function exitNeighborhoodMode() {
  return urban95Perf.phase("exitNeighborhoodMode", function () {
    if (map.getLayer("buildings-fill")) {
      map.setLayoutProperty("buildings-fill", "visibility", "visible");
      map.setPaintProperty("buildings-fill", "fill-opacity", 1);
    }
    if (map.getLayer("neighborhoods-surface")) {
      map.setLayoutProperty("neighborhoods-surface", "visibility", "none");
    }
    if (map.getLayer("parks-fill")) {
      map.setLayoutProperty("parks-fill", "visibility", "visible");
    }
  });
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
  setTreesAndLightsVisibility(false);
  updateDeckAmenityLayers();

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
      const selectedCategoryLabel = getSelectedWeightedCategoryLabel();
      const avgScore = getWeightedAverageValueFromSource(props, sfx);
      const cityAvgScore = getCitywideWeightedAverageScore(citywideStats, sfx);
      document.getElementById("neighborhood-modal-title").textContent = props.Name || "Unknown";
      document.getElementById("neighborhood-modal-subtitle").textContent =
        `${formatMetricNumber(avgScore)}/100 • ${selectedCategoryLabel}`;

      const body = document.getElementById("neighborhood-modal-body");
      neighborhoodCharts.forEach(c => c.destroy());
      neighborhoodCharts = [];

      let html = "";
      html += '<div class="cw-summary">';
      html += `<div class="cw-stat-card"><div class="cw-stat-value">${props.building_count || 0}</div><div class="cw-stat-label">Buildings</div></div>`;
      html += `<div class="cw-stat-card"><div class="cw-stat-value">${formatMetricNumber(avgScore)}</div><div class="cw-stat-label">Neighborhood avg (${selectedCategoryLabel})</div></div>`;
      html += `<div class="cw-stat-card"><div class="cw-stat-value">${formatMetricNumber(cityAvgScore)}</div><div class="cw-stat-label">City avg (${selectedCategoryLabel})</div></div>`;
      html += `<div class="cw-stat-card"><div class="cw-stat-value">${props["coverage_weighted" + sfx] || 0}%</div><div class="cw-stat-label">Coverage</div></div>`;
      html += "</div>";

      const selectedStem = getSelectedWeightedCategoryStem();
      if (!selectedStem) {
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
      }

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
      ensureChartJsLoaded()
        .then(function () {
          requestAnimationFrame(function () {
            renderNeighborhoodCharts({
              weighted: true,
              sfx: sfx,
              neighborhoodProps: props,
            });
          });
        })
        .catch(function (err) {
          console.error("Failed to load Chart.js:", err);
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
    ensureChartJsLoaded()
      .then(function () {
        requestAnimationFrame(function () {
          renderNeighborhoodCharts({ weighted: false, invObj: invLegacy });
        });
      })
      .catch(function (err) {
        console.error("Failed to load Chart.js:", err);
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
    const selectedStem = getSelectedWeightedCategoryStem();
    const histCanvas = document.getElementById("hood-score-hist");
    if (histCanvas) {
      const dist =
        !selectedStem && citywideStats && citywideStats["distribution_weighted" + sfx]
          ? citywideStats["distribution_weighted" + sfx]
          : buildHistogramDistributionFromScores(collectBuildingScores(), 10);
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

(function initScoreExplainSidebar() {
  const closeBtn = document.getElementById("score-explain-sidebar-close");
  const backdrop = document.getElementById("score-explain-backdrop");
  const body = document.getElementById("score-explain-sidebar-body");
  if (closeBtn) closeBtn.addEventListener("click", hideScoreExplainSidebar);
  if (backdrop) backdrop.addEventListener("click", hideScoreExplainSidebar);
  if (body) {
    body.addEventListener(
      "wheel",
      function (e) {
        if (isScoreExplainSidebarOpen()) e.preventDefault();
      },
      { passive: false }
    );
  }
  window.addEventListener("resize", function () {
    if (isScoreExplainSidebarOpen()) {
      setScoreExplainMapPadding(true);
      syncScoreExplainBackdrop();
      scheduleFitScoreExplainSidebar();
    }
  });
})();

function updateCitywideModalTitle() {
  const titleEl = document.getElementById("citywide-modal-title");
  const subtitleEl = document.getElementById("citywide-modal-subtitle");
  if (!titleEl || !subtitleEl) return;
  if (scoreMode === "weighted") {
    const label = getSelectedWeightedCategoryLabel();
    titleEl.textContent = `Beer Sheva — City Overview for ${label} Score`;
    subtitleEl.textContent =
      label === "Urban95"
        ? "Weighted Urban95 score across the city"
        : `${label} subscore across the city`;
  } else {
    titleEl.textContent = "Beer Sheva — City Overview";
    subtitleEl.textContent = "Accessibility across the city";
  }
}

function renderCitywideModal() {
  const body = document.getElementById("citywide-body");
  if (!body || !citywideStats) return;

  citywideCharts.forEach(c => c.destroy());
  citywideCharts = [];

  updateCitywideModalTitle();

  const scoreMinutes = getScoreMinutes();
  const sfx = "_" + scoreMinutes + "min";
  const stats = citywideStats;
  const isWeighted = scoreMode === "weighted";

  let html = '';

  if (isWeighted) {
    const selectedCategoryLabel = getSelectedWeightedCategoryLabel();
    const selectedStem = getSelectedWeightedCategoryStem();
    const highlights = weightedCategoryHighlightsFromSource(stats, sfx);
    html += '<div class="cw-summary">';
    html += `<div class="cw-stat-card"><div class="cw-stat-value">${(stats.total_buildings || 0).toLocaleString()}</div><div class="cw-stat-label">Buildings</div></div>`;
    html += `<div class="cw-stat-card"><div class="cw-stat-value">${formatMetricNumber(getCitywideWeightedAverageScore(stats, sfx))}</div><div class="cw-stat-label">City average (${selectedCategoryLabel})</div></div>`;
    html += '</div>';

    if (!selectedStem) {
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
    }

    html += '<div class="cw-section">';
    html += `<div class="cw-section-title">Building score distribution — ${selectedCategoryLabel}</div>`;
    html += '<p style="font-size:12px;color:#64748b;margin:0 0 10px 0">Citywide distribution</p>';
    html += '<div class="cw-chart-container"><canvas id="cw-score-hist"></canvas></div>';
    html += '</div>';

    html += '<div class="cw-section">';
    html += `<div class="cw-section-title">Average ${selectedCategoryLabel} score by neighborhood</div>`;
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
        ? "Amenities Focus"
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
  ensureChartJsLoaded()
    .then(function () {
      requestAnimationFrame(function () {
        renderCitywideCharts(sfx);
      });
    })
    .catch(function (err) {
      console.error("Failed to load Chart.js:", err);
    });
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
    const selectedWeightedStem = scoreMode === "weighted" ? getSelectedWeightedCategoryStem() : null;
    let dist = null;
    if (scoreMode === "weighted" && !selectedWeightedStem && citywideStats["distribution_weighted" + sfx]) {
      dist = citywideStats["distribution_weighted" + sfx];
    } else if (scoreMode === "expanded" && citywideStats["distribution_expanded" + sfx]) {
      dist = citywideStats["distribution_expanded" + sfx];
    } else {
      dist = citywideStats["distribution" + sfx];
    }
    if (scoreMode === "weighted" && selectedWeightedStem) {
      dist = buildHistogramDistributionFromScores(collectBuildingScores(), 10);
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
      const selectedStem = getSelectedWeightedCategoryStem();
      const selectedCategoryLabel = getSelectedWeightedCategoryLabel();
      const scoreKey = selectedStem ? "avg_score_weighted_" + selectedStem + sfx : "avg_score_weighted" + sfx;
      citywideCharts.push(new Chart(neighborhoodCanvas, {
        type: "bar",
        data: {
          labels: ranking.map(r => r.name),
          datasets: [{
            label: "Average " + selectedCategoryLabel + " score",
            data: ranking.map(r => Number(r[scoreKey]) || 0),
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

  urban95Perf.session("analysis mode → " + mode);
  urban95Perf.phase("modeToggle:click", function () {
    // Exit previous neighborhood mode visuals
    if (currentMode === "neighborhood" || currentMode === "citywide") {
      exitNeighborhoodMode();
    }

    switchMode(mode);
  });
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
