const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserContext, runBrowserScript } = require("./helpers/loadBrowserScript");

function loadScoreModel() {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/scoring/statusScale.js", browser);
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  return {
    scoreModel: browser.window.Urban95ScoreModel,
    statusScale: browser.window.Urban95StatusScale,
  };
}

test("clean filtered score uses selected clean_pts contribution", () => {
  const { scoreModel } = loadScoreModel();
  const props = {
    amen_school_5min: 2,
    amen_playground_5min: 1,
    clean_pts_school_5min: 20,
    score_expanded_5min: 45,
  };

  const score = scoreModel.getBuildingCleanFilteredScore(props, 5, new Set(["school"]));
  assert.equal(score, 20);
});

test("expanded partial score preserves raw selected sum above 100", () => {
  const { scoreModel } = loadScoreModel();
  const props = {
    amen_healthcare_5min: 80,
    amen_education_5min: 40,
  };

  const score = scoreModel.getBuildingOverallScore(props, 5, "expanded", {
    currentMode: "house",
    selectedAmenityTypes: ["healthcare", "education"],
    allFilterTypes: ["healthcare", "education", "commercial"],
  });

  assert.equal(score, 120);
});

test("expanded overall score returns 0 when no filters are selected in house mode", () => {
  const { scoreModel } = loadScoreModel();
  const score = scoreModel.getBuildingOverallScore(
    { score_expanded_5min: 55 },
    5,
    "expanded",
    {
      currentMode: "house",
      selectedAmenityTypes: [],
      allFilterTypes: [],
    }
  );

  assert.equal(score, 0);
});

test("clean filtered score returns 0 when no types are selected in house mode", () => {
  const { scoreModel } = loadScoreModel();
  const score = scoreModel.getBuildingCleanFilteredScore(
    { score_clean_5min: 55 },
    5,
    [],
    [],
    "house"
  );

  assert.equal(score, 0);
});

test("Urban95 status registry uses the canonical overview field", () => {
  const { scoreModel, statusScale } = loadScoreModel();

  assert.equal(statusScale.normalize("thriving"), "thriving");
  assert.equal(statusScale.normalize("bad-token"), "unknown");
  assert.deepEqual(Array.from(statusScale.labels()), ["Disappointing", "Functioning", "Thriving", "Unknown"]);

  const overall = scoreModel.getWeightedMetric("u95.overall");
  assert.equal(overall.scale, "status");
  assert.equal(overall.label, "All indicators overview");
  assert.equal(overall.buildingPropertyKey, "u95_status_10min");

  const environmentalQuality = scoreModel.getWeightedMetric("u95.cat.environmental_quality");
  assert.equal(environmentalQuality.surfacePropertyKey, "u95_status_environmental_quality");
  assert.equal(environmentalQuality.statusCompositionPrefix, "u95_environmental_quality");
  assert.equal(environmentalQuality.areaStatusKey, "u95_status_environmental_quality");
});
