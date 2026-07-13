const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserContext, runBrowserScript } = require("./helpers/loadBrowserScript");

test("Urban95CityGapModes relative cuts and membership", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/cityGapThresholds.js", browser);
  const G = browser.window.Urban95CityGapModes;

  assert.equal(G.MODES.length, 3);
  assert.equal(G.MODES[0], "off");
  assert.equal(G.MODES[1], "below_city_avg");
  assert.equal(G.MODES[2], "large_weak");
  assert.equal(G.DEFAULT_MODE, "off");
  assert.equal(G.MODE_OFF, "off");
  assert.equal(G.MODE_BELOW_CITY_AVG, "below_city_avg");
  assert.equal(G.MODE_LARGE_WEAK, "large_weak");
  // Absolute presets and legacy bottom_quartile normalize to off.
  assert.equal(G.normalizeMode("lt40"), "off");
  assert.equal(G.normalizeMode("lt50"), "off");
  assert.equal(G.normalizeMode("lt60"), "off");
  assert.equal(G.normalizeMode("bottom_quartile"), "off");
  assert.equal(G.normalizeMode("below_city_avg"), "below_city_avg");
  assert.equal(G.normalizeMode("large_weak"), "large_weak");

  // Non-finite never in gap.
  assert.equal(G.isInGap(NaN, "below_city_avg", { mean: 50 }), false);
  assert.equal(G.isInGap(Infinity, "large_weak", { largeWeakNames: { A: true } }, "A"), false);

  // Below city avg: strictly below mean.
  const cuts = G.computeCuts([10, 20, 30, 40]);
  assert.equal(cuts.mean, 25);
  assert.equal(G.isInGap(24.9, "below_city_avg", cuts), true);
  assert.equal(G.isInGap(25, "below_city_avg", cuts), false);
  assert.equal(G.isInGap(10, "off", cuts), false);

  assert.equal(G.cutForMode("below_city_avg", cuts), 25);
  assert.ok(Number.isNaN(G.cutForMode("off", cuts)));
  assert.ok(Number.isNaN(G.cutForMode("large_weak", cuts)));
  assert.equal(G.compareOpForMode("below_city_avg"), "<");
  assert.equal(G.compareOpForMode("large_weak"), null);

  // Empty / all non-finite → NaN cuts; not in gap.
  const empty = G.computeCuts([NaN, null, undefined]);
  assert.ok(Number.isNaN(empty.mean));
  assert.equal(G.isInGap(10, "below_city_avg", empty), false);
});

test("large_weak accumulates below-mean by building_count to 25% of eligible buildings", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/cityGapThresholds.js", browser);
  const G = browser.window.Urban95CityGapModes;

  // Mean of [10,20,30,60,80] = 40. Below-mean: A(100), B(40), C(30). Above: D, E.
  // Total eligible buildings = 300; 25% = 75.
  // Sort below-mean by buildings desc: A(100), B(40), C(30).
  // Accumulate: A alone reaches ≥75 → only A in-gap (includes crossing threshold).
  const eligible = [
    { name: "A", choroplethValue: 10, buildingCount: 100 },
    { name: "B", choroplethValue: 20, buildingCount: 40 },
    { name: "C", choroplethValue: 30, buildingCount: 30 },
    { name: "D", choroplethValue: 60, buildingCount: 50 },
    { name: "E", choroplethValue: 80, buildingCount: 80 },
  ];
  const mean = G.computeCuts(eligible.map((n) => n.choroplethValue)).mean;
  assert.equal(mean, 40);
  const names = G.computeLargeWeakNames(eligible, mean);
  assert.deepEqual(Object.keys(names).sort(), ["A"]);
  assert.equal(G.isInGap(10, "large_weak", { mean, largeWeakNames: names }, "A"), true);
  assert.equal(G.isInGap(20, "large_weak", { mean, largeWeakNames: names }, "B"), false);
  assert.equal(G.isInGap(60, "large_weak", { mean, largeWeakNames: names }, "D"), false);

  // Need multiple to reach 25%: total buildings 200; 25%=50.
  // Below mean (mean=25): X(30 buildings, val 10), Y(25, val 20). Above: Z(145, val 40).
  const eligible2 = [
    { name: "X", choroplethValue: 10, buildingCount: 30 },
    { name: "Y", choroplethValue: 20, buildingCount: 25 },
    { name: "Z", choroplethValue: 45, buildingCount: 145 },
  ];
  const mean2 = G.computeCuts(eligible2.map((n) => n.choroplethValue)).mean;
  assert.equal(mean2, 25);
  const names2 = G.computeLargeWeakNames(eligible2, mean2);
  assert.deepEqual(Object.keys(names2).sort(), ["X", "Y"]);

  // Missing buildingCount treated as 0; empty below-mean → empty set.
  // Empty objects from the browser VM are cross-realm — assert via keys, not deepEqual.
  assert.deepEqual(Object.keys(G.computeLargeWeakNames([], 50)), []);
  assert.deepEqual(
    Object.keys(
      G.computeLargeWeakNames([{ name: "OnlyAbove", choroplethValue: 90, buildingCount: 10 }], 50)
    ),
    []
  );
  // Zero total eligible buildings → empty.
  assert.deepEqual(
    Object.keys(
      G.computeLargeWeakNames([{ name: "Weak", choroplethValue: 10, buildingCount: 0 }], 50)
    ),
    []
  );
  // Below-mean with 0/missing buildings must not enter large_weak (not "large").
  // Total buildings > 0 from above-mean Strong; all below-mean have 0 buildings → empty set.
  const zeroBuildingsBelow = [
    { name: "Ghost", choroplethValue: 10, buildingCount: 0 },
    { name: "Missing", choroplethValue: 20 },
    { name: "Strong", choroplethValue: 90, buildingCount: 100 },
  ];
  const meanZero = G.computeCuts(zeroBuildingsBelow.map((n) => n.choroplethValue)).mean;
  assert.equal(meanZero, 40);
  assert.deepEqual(Object.keys(G.computeLargeWeakNames(zeroBuildingsBelow, meanZero)), []);
  // Mixed: zero-building below-mean skipped; positive-building below-mean can still enter.
  // Mean 40; below: Ghost(0), Weak(40). Total buildings 100; 25%=25 → Weak alone.
  const mixedZero = [
    { name: "Ghost", choroplethValue: 10, buildingCount: 0 },
    { name: "Weak", choroplethValue: 20, buildingCount: 40 },
    { name: "Strong", choroplethValue: 90, buildingCount: 60 },
  ];
  const meanMixed = G.computeCuts(mixedZero.map((n) => n.choroplethValue)).mean;
  assert.equal(meanMixed, 40);
  const namesMixed = G.computeLargeWeakNames(mixedZero, meanMixed);
  assert.deepEqual(Object.keys(namesMixed).sort(), ["Weak"]);
  assert.equal(G.isInGap(10, "large_weak", { largeWeakNames: namesMixed }, "Ghost"), false);
  // Name required for large_weak membership.
  assert.equal(G.isInGap(10, "large_weak", { largeWeakNames: { A: true } }), false);
});

test("buildGapCuts attaches mean and largeWeakNames", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/cityGapThresholds.js", browser);
  const G = browser.window.Urban95CityGapModes;

  const eligible = [
    { name: "A", choroplethValue: 10, buildingCount: 100 },
    { name: "B", choroplethValue: 20, buildingCount: 40 },
    { name: "C", choroplethValue: 30, buildingCount: 30 },
    { name: "D", choroplethValue: 60, buildingCount: 50 },
    { name: "E", choroplethValue: 80, buildingCount: 80 },
  ];
  const cuts = G.buildGapCuts(eligible);
  assert.equal(cuts.mean, 40);
  assert.deepEqual(Object.keys(cuts.largeWeakNames).sort(), ["A"]);
});

// AF city_gap_eligible (map paint): see docs/js/map/mapRenderers.js —
// Number.isFinite(raw avg); missing AF avgs excluded from bulkPercentileRanks (not coerced to 0).
// Ineligible neighborhoods paint #9ca3af (Neighborhood surface missing grey).
// Ranking rows (citySidebar.buildRankingRows): same finite-rawAvg gate as countInGap;
// missing rawAvg must not appear in the ranking list (esp. worst-first when gap mode is on).
// large_weak map paint: precompute city_in_gap on features (expression can't do cumulative).

test("City hist bindCharts rounds bin-edge labels", () => {
  const captured = [];
  function ChartStub(canvas, config) {
    captured.push(config && config.data && config.data.labels);
    this.destroy = function () {};
    this.resize = function () {};
  }
  ChartStub.defaults = { font: {} };

  const browser = createBrowserContext({ Chart: ChartStub });
  runBrowserScript("docs/js/ui/cityGapThresholds.js", browser);
  runBrowserScript("docs/js/ui/cityPanelRender.js", browser);

  const bodyEl = {
    querySelector(sel) {
      return sel === "#city-sidebar-score-hist" ? {} : null;
    },
  };
  browser.window.Urban95CityPanelRender.bindCharts(
    {},
    bodyEl,
    {
      edges: [0.4, 10.6, 20.2],
      counts: [1, 2],
      breakpoints: [0, 25, 50, 75, 100],
      isWeighted: true,
    },
    []
  );
  assert.deepEqual(captured[0], ["0-11", "11-20"]);
});

test("gap below-avg copy names map cut, not spark city avg", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/cityGapThresholds.js", browser);
  runBrowserScript("docs/js/ui/cityPanelRender.js", browser);
  const escapeHtml = (value) => String(value == null ? "" : value);
  const renderCtx = { escapeHtml: escapeHtml };

  const afHtml = browser.window.Urban95CityPanelRender.buildBodyHTML(renderCtx, {
    isExpanded: true,
    unavailable: false,
    rankingAvailable: false,
    histogramAvailable: false,
    gap: {
      mode: "below_city_avg",
      enabled: true,
      belowCount: 2,
      totalCount: 5,
    },
    selection: {
      name: "A",
      scoreValue: 10,
      cityAvgValue: 20,
      scoreDisplay: "10",
      cityAvgDisplay: "20",
      showGapBadge: true,
      sparkScale: "maxRelative",
    },
  });
  assert.match(afHtml, /Below map avg/);
  assert.match(afHtml, /below mean map percentile/i);
  assert.match(afHtml, /Below mean map percentile/);
  assert.equal(/below city average/i.test(afHtml), false);

  const u95Html = browser.window.Urban95CityPanelRender.buildBodyHTML(renderCtx, {
    isExpanded: false,
    unavailable: false,
    rankingAvailable: false,
    histogramAvailable: false,
    gap: {
      mode: "below_city_avg",
      enabled: true,
      belowCount: 1,
      totalCount: 3,
    },
    selection: {
      name: "B",
      scoreValue: 40,
      cityAvgValue: 50,
      scoreDisplay: "40",
      cityAvgDisplay: "50",
      showGapBadge: true,
      sparkScale: "absolute100",
    },
  });
  assert.match(u95Html, /below mean map score/i);
  assert.match(u95Html, /Below mean map score/);
  assert.equal(/below city average/i.test(u95Html), false);
});

test("large_weak UI labels and buildings percent copy", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/cityGapThresholds.js", browser);
  runBrowserScript("docs/js/ui/cityPanelRender.js", browser);
  const escapeHtml = (value) => String(value == null ? "" : value);
  const renderCtx = { escapeHtml: escapeHtml };

  const html = browser.window.Urban95CityPanelRender.buildBodyHTML(renderCtx, {
    isExpanded: false,
    unavailable: false,
    rankingAvailable: false,
    histogramAvailable: false,
    gap: {
      mode: "large_weak",
      enabled: true,
      belowCount: 2,
      totalCount: 5,
      gapBuildingCount: 75,
      totalBuildingCount: 300,
    },
    selection: {
      name: "A",
      scoreValue: 10,
      cityAvgValue: 40,
      scoreDisplay: "10",
      cityAvgDisplay: "40",
      showGapBadge: true,
      sparkScale: "absolute100",
    },
  });
  assert.match(html, /Large weak places/);
  assert.match(html, /2 of 5/);
  assert.match(html, /25% of buildings/i);
  assert.equal(/bottom quartile/i.test(html), false);
  assert.match(html, /Large weak places/); // badge
});
