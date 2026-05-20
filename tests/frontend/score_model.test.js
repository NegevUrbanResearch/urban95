const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserContext, runBrowserScript } = require("./helpers/loadBrowserScript");

function loadScoreModel() {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/core/config.js", browser);
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  return browser.window.Urban95ScoreModel;
}

test("clean filtered score uses selected clean_pts contribution", () => {
  const scoreModel = loadScoreModel();
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
  const scoreModel = loadScoreModel();
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
  const scoreModel = loadScoreModel();
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
  const scoreModel = loadScoreModel();
  const score = scoreModel.getBuildingCleanFilteredScore(
    { score_clean_5min: 55 },
    5,
    [],
    [],
    "house"
  );

  assert.equal(score, 0);
});

test("weighted overall score prefers fixed Urban95 score in weighted mode", () => {
  const scoreModel = loadScoreModel();
  const props = {
    score_weighted: 72.4,
    score_expanded_10min: 33,
  };

  assert.equal(scoreModel.getBuildingOverallScore(props, 10, "weighted"), 72.4);
  assert.equal(
    scoreModel.getBuildingOverallScore(props, 10, "expanded", {
      currentMode: "house",
      selectedAmenityTypes: ["education", "healthcare"],
      allFilterTypes: ["education", "healthcare"],
    }),
    33
  );
});
