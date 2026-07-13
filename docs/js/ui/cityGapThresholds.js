(function () {
  "use strict";

  // Relative gap modes for City sidebar / map dimming.
  // below_city_avg: choropleth strictly below mean of eligible values.
  // large_weak: from below-mean eligible set, sort by building_count desc,
  // accumulate until cumulative buildings ≥ 25% of total eligible buildings
  // (skip building_count ≤ 0 — not "large").
  var MODE_OFF = "off";
  var MODE_BELOW_CITY_AVG = "below_city_avg";
  var MODE_LARGE_WEAK = "large_weak";
  var MODES = [MODE_OFF, MODE_BELOW_CITY_AVG, MODE_LARGE_WEAK];
  var DEFAULT_MODE = MODE_OFF;
  var MODE_SET = {};
  MODES.forEach(function (id) {
    MODE_SET[id] = true;
  });

  function normalizeMode(mode) {
    if (mode && MODE_SET[mode]) return mode;
    return DEFAULT_MODE;
  }

  function collectFinite(values) {
    var out = [];
    (values || []).forEach(function (v) {
      if (typeof v === "number") {
        if (Number.isFinite(v)) out.push(v);
        return;
      }
      if (typeof v === "string" && v.trim() !== "") {
        var n = Number(v);
        if (Number.isFinite(n)) out.push(n);
      }
    });
    return out;
  }

  function buildingCountOf(neighborhood) {
    var c = Number(neighborhood && neighborhood.buildingCount);
    return Number.isFinite(c) && c > 0 ? c : 0;
  }

  function computeCuts(values) {
    var finite = collectFinite(values);
    if (finite.length === 0) {
      return { mean: NaN };
    }
    var sum = 0;
    for (var i = 0; i < finite.length; i++) sum += finite[i];
    return { mean: sum / finite.length };
  }

  /**
   * Below-mean eligible neighborhoods, sorted by building_count desc, accumulated
   * until cumulative buildings ≥ 25% of total buildings across all eligible.
   * Rows with building_count ≤ 0 / missing are skipped (not "large").
   * @param {Array<{name:string, choroplethValue:number, buildingCount?:number}>} eligible
   * @param {number} mean
   * @returns {Object<string, true>}
   */
  function computeLargeWeakNames(eligible, mean) {
    var names = {};
    if (!Number.isFinite(mean) || !eligible || !eligible.length) return names;

    var totalBuildings = 0;
    for (var i = 0; i < eligible.length; i++) {
      totalBuildings += buildingCountOf(eligible[i]);
    }
    if (totalBuildings <= 0) return names;

    var belowMean = [];
    for (var j = 0; j < eligible.length; j++) {
      var n = eligible[j];
      var v = Number(n && n.choroplethValue);
      if (Number.isFinite(v) && v < mean) belowMean.push(n);
    }
    if (!belowMean.length) return names;

    belowMean.sort(function (a, b) {
      return buildingCountOf(b) - buildingCountOf(a);
    });

    var threshold = totalBuildings * 0.25;
    var cumulative = 0;
    for (var k = 0; k < belowMean.length; k++) {
      var row = belowMean[k];
      var buildings = buildingCountOf(row);
      // Zero/missing buildings are not "large" — skip (all-zero below-mean → empty set).
      if (buildings <= 0) continue;
      if (row && row.name) names[row.name] = true;
      cumulative += buildings;
      if (cumulative >= threshold) break;
    }
    return names;
  }

  /**
   * @param {Array<{name:string, choroplethValue:number, buildingCount?:number}>} eligible
   * @returns {{ mean: number, largeWeakNames: Object<string, true> }}
   */
  function buildGapCuts(eligible) {
    var list = eligible || [];
    var values = list.map(function (n) {
      return n && n.choroplethValue;
    });
    var cuts = computeCuts(values);
    cuts.largeWeakNames = computeLargeWeakNames(list, cuts.mean);
    return cuts;
  }

  function cutForMode(mode, cuts) {
    mode = normalizeMode(mode);
    cuts = cuts || {};
    if (mode === MODE_BELOW_CITY_AVG) {
      return Number(cuts.mean);
    }
    return NaN;
  }

  function isInGap(value, mode, cuts, name) {
    mode = normalizeMode(mode);
    if (mode === MODE_OFF) return false;

    if (mode === MODE_LARGE_WEAK) {
      var vLw = Number(value);
      if (!Number.isFinite(vLw)) return false;
      var set = cuts && cuts.largeWeakNames;
      return !!(name && set && set[name]);
    }

    var v = Number(value);
    if (!Number.isFinite(v)) return false;
    var cut = cutForMode(mode, cuts);
    if (!Number.isFinite(cut)) return false;
    if (mode === MODE_BELOW_CITY_AVG) return v < cut;
    return false;
  }

  /** MapLibre compare op for opacity expression; null when precomputed membership is required. */
  function compareOpForMode(mode) {
    mode = normalizeMode(mode);
    if (mode === MODE_BELOW_CITY_AVG) return "<";
    return null;
  }

  window.Urban95CityGapModes = {
    MODES: MODES,
    MODE_OFF: MODE_OFF,
    MODE_BELOW_CITY_AVG: MODE_BELOW_CITY_AVG,
    MODE_LARGE_WEAK: MODE_LARGE_WEAK,
    DEFAULT_MODE: DEFAULT_MODE,
    normalizeMode: normalizeMode,
    computeCuts: computeCuts,
    computeLargeWeakNames: computeLargeWeakNames,
    buildGapCuts: buildGapCuts,
    cutForMode: cutForMode,
    isInGap: isInGap,
    compareOpForMode: compareOpForMode,
  };
})();
