const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserContext, runBrowserScript } = require("./helpers/loadBrowserScript");

function feat(name, scored, scoreValue) {
  const properties = { Name: name, building_count: scored ? 10 : 0 };
  if (scored) {
    properties.avg_score_weighted_10min =
      scoreValue === undefined ? 50 : scoreValue;
  }
  return { type: "Feature", properties };
}

test("neighborhood selection progressive dual-select", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/neighborhoodSelection.js", browser);
  const sel = browser.window.Urban95NeighborhoodSelection.create({
    isComparable: (f) =>
      Number.isFinite(Number(f.properties && f.properties.avg_score_weighted_10min)),
  });
  const a = feat("שכונה א", true);
  const b = feat("רמות", true);
  const c = feat("שכונה ד", true);
  const bad = feat("ספורט", false);

  assert.equal(sel.select(a).kind, "single");
  assert.equal(sel.select(a).kind, "none");
  sel.select(a);
  assert.equal(sel.select(bad).kind, "rejected");
  assert.equal(sel.getState().slots[1], null);
  assert.equal(sel.select(b).kind, "compare");
  assert.equal(sel.getState().focusedSlot, 1);
  assert.equal(sel.select(c).kind, "compare");
  assert.equal(sel.getState().slots[0].properties.Name, "שכונה א");
  assert.equal(sel.getState().slots[1].properties.Name, "שכונה ד");
  sel.removeSlot(1);
  assert.equal(sel.isComparing(), false);
  assert.equal(sel.getPrimaryFeature().properties.Name, "שכונה א");
});

test("neighborhoodIsComparable treats zero as comparable", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  const { neighborhoodIsComparable } = browser.window.Urban95ScoreModel;

  assert.equal(
    neighborhoodIsComparable({ avg_score_weighted_10min: 0 }, { scoreMode: "weighted", minutes: 10 }),
    true
  );
  assert.equal(
    neighborhoodIsComparable({}, { scoreMode: "weighted", minutes: 10 }),
    false
  );
  assert.equal(
    neighborhoodIsComparable({ pct_overall_15min: 12.5 }, { scoreMode: "expanded", minutes: 15 }),
    true
  );
  assert.equal(
    neighborhoodIsComparable({ pct_overall_10min: "n/a" }, { scoreMode: "expanded", minutes: 10 }),
    false
  );
});
