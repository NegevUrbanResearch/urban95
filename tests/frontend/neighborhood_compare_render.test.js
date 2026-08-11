const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserContext, runBrowserScript } = require("./helpers/loadBrowserScript");

function addComposition(props, metric, token) {
  props[metric.areaStatusKey] = token;
  ["disappointing", "functioning", "thriving", "unknown"].forEach((status) => {
    props[metric.statusCompositionPrefix + "_count_" + status] = status === token ? 8 : 0;
    props[metric.statusCompositionPrefix + "_pct_" + status] = status === token ? 100 : 0;
  });
}

function renderComparison(statusForB, statusForA = () => "functioning") {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/scoring/statusScale.js", browser);
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodPanelRender.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodCompareRender.js", browser);

  const registry = browser.window.Urban95ScoreModel.buildWeightedMetricRegistry();
  const metrics = Object.values(registry).filter((metric) => metric && metric.scale === "status");
  const propsA = { Name: "א", building_count: 8 };
  const propsB = { Name: "ב", building_count: 8 };
  metrics.forEach((metric) => {
    addComposition(propsA, metric, statusForA(metric));
    addComposition(propsB, metric, statusForB(metric));
  });

  const bodyEl = { innerHTML: "" };
  const heroEl = { innerHTML: "" };
  browser.window.Urban95NeighborhoodCompareRender.render(
    { slots: [{ properties: propsA }, { properties: propsB }] },
    {
      chartInstances: [], bodyEl, heroEl, metaEl: { innerHTML: "" }, emptyEl: {},
      openChrome() {}, getScoreMode() { return "weighted"; },
      getActiveMetric() { return registry["u95.overall"]; }, escapeHtml: String,
    }
  );
  return { body: bodyEl.innerHTML, hero: heroEl.innerHTML, registry };
}

test("weighted comparison exposes every indicator under its Urban95 category", () => {
  const { body, hero, registry } = renderComparison((metric) =>
    metric.kind === "weighted-subcategory" && metric.id === "u95.sub.environmental_quality.trees" ? "thriving" : "functioning"
  );
  const metrics = Object.values(registry);
  const categories = metrics.filter((metric) => metric && metric.kind === "weighted-category");
  const subcategories = metrics.filter((metric) => metric && metric.kind === "weighted-subcategory");
  const diagnostics = metrics.filter((metric) => metric && metric.kind === "diagnostic-access");

  assert.match(body, /u95-neighborhood-compare-indicators/);
  assert.match(body, /Categories &amp; indicators/);
  assert.match(body, /u95-status-overlay u95-status-overlay--row/);
  assert.match(body, /Trees/);
  assert.match(hero, /u95-status-overlay-legend/);
  assert.match(hero, /All indicators overview/);
  assert.match(hero, /א/);
  assert.match(hero, /ב/);
  assert.match(hero, /aria-label="א: Functioning; ב: Functioning"/);
  assert.equal((body.match(/u95-neighborhood-compare-category-group/g) || []).length, categories.length);
  assert.equal((body.match(/u95-neighborhood-compare-category-row/g) || []).length, categories.length);
  assert.equal((body.match(/u95-neighborhood-compare-indicator-row/g) || []).length, subcategories.length);
  assert.equal((body.match(/u95-neighborhood-compare-subcategory-group/g) || []).length, 2);
  assert.equal((body.match(/u95-neighborhood-compare-diagnostic-row/g) || []).length, diagnostics.length);
  assert.match(body, /Schools/);
  assert.match(body, /Kindergartens/);
  assert.match(body, /Clinics/);
  assert.match(body, /Tipat Halav/);
  assert.equal(
    (body.match(/u95-status-overlay u95-status-overlay--row/g) || []).length,
    categories.length + subcategories.length + diagnostics.length
  );

  let priorCategoryStart = -1;
  categories.forEach((category) => {
    const groupStart = body.indexOf(`data-category-stem="${category.selectedWeightedStem}"`);
    assert.ok(groupStart > priorCategoryStart, `${category.label} follows the preceding Urban95 category`);
    const nextGroupStart = body.indexOf('class="u95-neighborhood-compare-category-group"', groupStart + 1);
    const groupEnd = nextGroupStart === -1 ? body.length : nextGroupStart;
    const categorySubcategories = subcategories.filter(
      (subcategory) => subcategory.selectedWeightedStem === category.selectedWeightedStem
    );
    let priorMetricPosition = groupStart;
    categorySubcategories.forEach((subcategory) => {
      const metricPosition = body.indexOf(`data-status-metric="${subcategory.id}"`, priorMetricPosition);
      assert.ok(
        metricPosition > priorMetricPosition && metricPosition < groupEnd,
        `${subcategory.label} is inside ${category.label}`
      );
      priorMetricPosition = metricPosition;
    });
    priorCategoryStart = groupStart;
  });

  assert.match(body, /u95-status-overlay-marker--first[^>]*data-status="functioning"/);
  assert.match(body, /u95-status-overlay-marker--second[^>]*data-status="functioning"/);
  assert.doesNotMatch(body, /u95-neighborhood-compare-lane|hood-compare-bar-track|u95-compare-bar/);
  const visibleText = (hero + body).replace(/<[^>]*>/g, " ");
  assert.doesNotMatch(
    visibleText,
    /View comparison evidence|Where they differ|score|percent|count|winner|stronger|delta|gap badge|\bA\b|\bB\b/i
  );
  assert.equal((body.match(/<details class="u95-neighborhood-compare-category-group"/g) || []).length, categories.length);
  assert.doesNotMatch(hero + body, /u95-neighborhood-compare-details|View comparison evidence/);
});

test("weighted comparison keeps all indicators when neighborhood statuses match", () => {
  const { body, hero, registry } = renderComparison(() => "functioning");
  const subcategoryCount = Object.values(registry).filter(
    (metric) => metric && metric.kind === "weighted-subcategory"
  ).length;

  assert.equal((body.match(/u95-neighborhood-compare-indicator-row/g) || []).length, subcategoryCount);
  assert.doesNotMatch(body, /No category status changes|u95-neighborhood-compare-difference-row/);
  assert.match(hero, /u95-status-overlay-readout--combined[^>]*data-status="functioning"/);
  assert.doesNotMatch(hero, /u95-status-overlay-readout--first|u95-status-overlay-readout--second/);
});

test("weighted comparison labels each different status with its neighborhood identity", () => {
  const { hero } = renderComparison(() => "thriving", () => "functioning");

  assert.match(
    hero,
    /u95-status-overlay-readout--first[^>]*data-status="functioning"[^>]*>[\s\S]*?Functioning/
  );
  assert.match(
    hero,
    /u95-status-overlay-readout--second[^>]*data-status="thriving"[^>]*>[\s\S]*?Thriving/
  );
  assert.doesNotMatch(hero, /Functioning\s*\/\s*Thriving/);
});

test("weighted comparison keeps Unknown neutral without activating a colored lamp", () => {
  const { hero } = renderComparison(() => "unknown", () => "unknown");

  assert.match(hero, /u95-status-overlay-anchor--second[^>]*data-status="unknown"/);
  assert.match(hero, /u95-status-overlay-anchor--first[^>]*data-status="unknown"/);
  assert.doesNotMatch(hero, /status-signal-lamp[^>]*is-active/);
});
