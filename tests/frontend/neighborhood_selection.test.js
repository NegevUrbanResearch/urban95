const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserContext, runBrowserScript } = require("./helpers/loadBrowserScript");

function feat(name, scored, scoreValue) {
  const properties = { Name: name, building_count: scored ? 10 : 0 };
  if (scored) {
    properties.u95_status = scoreValue === undefined ? "functioning" : scoreValue;
    properties.u95_support_count = 10;
    properties.u95_summary_reason = "predominant";
  }
  return { type: "Feature", properties };
}

test("neighborhood selection progressive dual-select", () => {
  const browser = createBrowserContext();
  runBrowserScript("docs/js/scoring/statusScale.js", browser);
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodSelection.js", browser);
  const sel = browser.window.Urban95NeighborhoodSelection.create({
    isComparable: (f) =>
      browser.window.Urban95ScoreModel.neighborhoodIsComparable(f.properties, {
        scoreMode: "weighted",
        activeMetric: {
          scale: "status",
          areaStatusKey: "u95_status",
          areaSupportCountKey: "u95_support_count",
          areaSummaryReasonKey: "u95_summary_reason",
        },
      }),
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
  runBrowserScript("docs/js/scoring/statusScale.js", browser);
  runBrowserScript("docs/js/scoring/scoreModel.js", browser);
  const { neighborhoodIsComparable } = browser.window.Urban95ScoreModel;

  assert.equal(
    neighborhoodIsComparable(
      { u95_status: "disappointing", u95_support_count: 0, u95_summary_reason: "no_buildings" },
      {
        scoreMode: "weighted",
        activeMetric: {
          scale: "status",
          areaStatusKey: "u95_status",
          areaSupportCountKey: "u95_support_count",
          areaSummaryReasonKey: "u95_summary_reason",
        },
      }
    ),
    false
  );
  assert.equal(
    neighborhoodIsComparable(
      { u95_status: "functioning", u95_support_count: 10, u95_summary_reason: "predominant" },
      {
        scoreMode: "weighted",
        activeMetric: {
          scale: "status",
          areaStatusKey: "u95_status",
          areaSupportCountKey: "u95_support_count",
          areaSummaryReasonKey: "u95_summary_reason",
        },
      }
    ),
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

test("selection revalidates both compare slots after an active metric change", () => {
  let comparable = true;
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/neighborhoodSelection.js", browser);
  const sel = browser.window.Urban95NeighborhoodSelection.create({
    isComparable() { return comparable; },
  });
  const a = feat("A", true);
  const b = feat("B", true);
  sel.select(a);
  sel.select(b);
  assert.equal(sel.isComparing(), true);
  comparable = false;
  assert.equal(sel.revalidate().kind, "none");
  assert.equal(sel.isComparing(), false);
  assert.equal(sel.getPrimaryFeature(), null);
});

test("comparison resync clears slots that fail the newly active metric", () => {
  let comparable = true;
  const browser = createBrowserContext();
  runBrowserScript("docs/js/ui/neighborhoodSelection.js", browser);
  runBrowserScript("docs/js/ui/neighborhoodCompareApply.js", browser);
  const selection = browser.window.Urban95NeighborhoodSelection.create({
    isComparable() { return comparable; },
  });
  selection.select(feat("A", true));
  selection.select(feat("B", true));

  const calls = { clear: 0, hide: 0, selected: undefined };
  browser.window.Urban95NeighborhoodCompareApply.configure({
    selection,
    highlight: {
      applyCompareSlots() {},
      clearCompare() { calls.clear += 1; },
    },
    sidebar: {
      isOpen() { return true; },
      hide(options) { calls.hide += 1; assert.equal(options.clearSelection, false); },
      show() {}, showCompare() {}, sync() {},
    },
    setSelectedNeighborhood(feature) { calls.selected = feature; },
  });

  comparable = false;
  browser.window.Urban95NeighborhoodCompareApply.resync();

  assert.equal(selection.isComparing(), false);
  assert.equal(selection.getPrimaryFeature(), null);
  assert.equal(calls.clear, 1);
  assert.equal(calls.hide, 1);
  assert.equal(calls.selected, null);
});
