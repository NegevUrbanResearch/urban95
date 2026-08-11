const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserContext, runBrowserScript } = require("./helpers/loadBrowserScript");

function statusFields(prefix, status, counts) {
  const fields = { [prefix + "_status"]: status };
  ["disappointing", "functioning", "thriving", "unknown"].forEach((token) => {
    fields[prefix + "_count_" + token] = counts[token] || 0;
    fields[prefix + "_pct_" + token] = ((counts[token] || 0) / 658) * 100;
  });
  return fields;
}

function metric(id, kind, label, prefix, stem, subStem) {
  return {
    id,
    kind,
    label,
    selectedWeightedStem: stem || null,
    selectedWeightedSubStem: subStem || null,
    areaStatusKey: prefix + "_status",
    statusCompositionPrefix: prefix,
  };
}

test("single neighborhood renderer mirrors building status disclosures", () => {
  const overall = metric("u95.overall", "weighted-overall", "All indicators overview", "u95");
  const categories = [
    metric("u95.cat.environmental_quality", "weighted-category", "Environmental Quality", "u95_environmental_quality", "environmental_quality"),
    metric("u95.cat.nature", "weighted-category", "Nature", "u95_nature", "nature"),
    metric("u95.cat.play", "weighted-category", "Play", "u95_play", "play"),
    metric("u95.cat.safety_mobility", "weighted-category", "Safety & Mobility", "u95_safety_mobility", "safety_mobility"),
    metric("u95.cat.family_services", "weighted-category", "Family Services", "u95_family_services", "family_services"),
  ];
  const shade = metric("u95.sub.environmental_quality.shade", "weighted-subcategory", "Shade", "u95_sub_environmental_quality_shade", "environmental_quality", "shade");
  const parks = metric("u95.sub.nature.parks", "weighted-subcategory", "Parks", "u95_sub_nature_parks", "nature", "parks");
  const education = metric("u95.sub.family_services.education", "weighted-subcategory", "Education", "u95_sub_family_services_education", "family_services", "education");
  const school = metric("u95.detail.family_services.education.school", "diagnostic-access", "Schools", "u95_detail_family_services_education_school", "family_services", "school");
  school.parentMetricId = education.id;
  const browser = createBrowserContext();
  runBrowserScript("docs/js/scoring/statusScale.js", browser);
  browser.window.Urban95ScoreModel = {
    WEIGHTED_CATEGORY_COMPONENTS: [
      { stem: "environmental_quality", color: "#0ea5e9" },
      { stem: "nature", color: "#22c55e" },
      { stem: "play", color: "#f97316" },
      { stem: "safety_mobility", color: "#f59e0b" },
      { stem: "family_services", color: "#8b5cf6" },
    ],
    buildWeightedMetricRegistry() {
      return Object.fromEntries([overall, ...categories, shade, parks, education, school].map((item) => [item.id, item]));
    },
  };
  runBrowserScript("docs/js/ui/neighborhoodPanelRender.js", browser);

  const props = {
    building_count: 658,
    u95_status: "functioning",
    ...statusFields("u95", "functioning", { functioning: 577, disappointing: 53, thriving: 20, unknown: 8 }),
    ...statusFields("u95_environmental_quality", "functioning", { functioning: 500, disappointing: 100, thriving: 50, unknown: 8 }),
    ...statusFields("u95_nature", "thriving", { thriving: 500, functioning: 100, disappointing: 50, unknown: 8 }),
    ...statusFields("u95_play", "functioning", { functioning: 500, disappointing: 100, thriving: 50, unknown: 8 }),
    ...statusFields("u95_safety_mobility", "functioning", { functioning: 500, disappointing: 100, thriving: 50, unknown: 8 }),
    ...statusFields("u95_family_services", "functioning", { functioning: 500, disappointing: 100, thriving: 50, unknown: 8 }),
    ...statusFields("u95_sub_environmental_quality_shade", "disappointing", { disappointing: 500, functioning: 100, thriving: 50, unknown: 8 }),
    ...statusFields("u95_sub_nature_parks", "thriving", { thriving: 500, functioning: 100, disappointing: 50, unknown: 8 }),
  };
  const heroEl = { innerHTML: "" };
  const metaEl = { innerHTML: "" };
  const renderCtx = {
    escapeHtml: String,
    heroEl,
    metaEl,
    getActiveMetric: () => overall,
    scoreExplainIconNeutral: "#0f172a",
    getWeightedCategoryIcon: (stem) => stem + "-icon",
    getWeightedSubcategoryIcon: (stem) => stem + "-sub-icon",
    renderHorizonLabelCell: (label, icon, weight, color) => '<span class="horizon-label"' +
      (color ? ' style="color:' + color + '"' : "") + '><span class="horizon-label-top">' +
      '<span class="horizon-icon" data-icon="' + icon + '" data-color="' + (color || "") +
      '"></span><span class="horizon-label-text">' + label + "</span></span></span>",
  };
  browser.window.Urban95NeighborhoodPanelRender.populateHeaderStatus(renderCtx, props, overall);
  const html = browser.window.Urban95NeighborhoodPanelRender.buildBodyHTMLStatus(renderCtx, props, overall, categories);

  assert.match(heroEl.innerHTML, /status-signal--hero/);
  assert.match(heroEl.innerHTML, /Functioning/);
  assert.equal((html.match(/<details class="urban95-status-category-disclosure/g) || []).length, 5);
  assert.equal((html.match(/class="urban95-status-tag urban95-status-tag--/g) || []).length, 9);
  assert.match(html, /data-icon="environmental_quality-icon" data-color="#0ea5e9"/);
  assert.match(html, /data-status-category="nature" style="--category-color:#22c55e"/);
  assert.match(html, /data-icon="shade-sub-icon"/);
  assert.doesNotMatch(html, /u95-neighborhood-details|View full status breakdown/);
  assert.doesNotMatch(html, /u95-status-composition|Neighborhood averages are not published for this access view/);
  assert.equal((html.match(/cw-stat-label">Buildings/g) || []).length, 1);
  assert.doesNotMatch(html, /u95-neighborhood-at-a-glance|u95-neighborhood-focus|u95-neighborhood-foundations/);
  assert.doesNotMatch(html, /\d+%|\d+ buildings/);
  assert.doesNotMatch(html, /Urban95 score|percentile|city avg|winner|stronger/i);
});
