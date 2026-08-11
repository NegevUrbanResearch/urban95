const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const indexPath = path.join(root, "docs", "index.html");
const packagePath = path.join(root, "package.json");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function normalizedText(source) {
  return source
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function explainerSections() {
  const html = fs.readFileSync(indexPath, "utf8");
  const modal = sliceBetween(html, 'id="info-modal"', '<script src="./js/core/desktopOnlyGate.js">');
  return {
    modal,
    howTo: sliceBetween(modal, 'id="tab-howto"', 'id="tab-about"'),
    about: sliceBetween(modal, 'id="tab-about"', 'id="modal-start"'),
  };
}

test("explainer preserves the required status-era guide and methodology context", () => {
  const { modal, howTo, about } = explainerSections();

  [
    "How to Use",
    "About",
  ].forEach((phrase) => {
    assert.match(modal, new RegExp(escapeRegExp(phrase)));
  });

  [
    "Building, Neighborhood, or City",
    "Walking time &amp; filter",
    "Urban95",
    "Amenities Focus",
  ].forEach((phrase) => {
    assert.match(howTo, new RegExp(escapeRegExp(phrase)));
  });

  [
    "Cities for Children",
    "Map colors",
    "summer_SI",
    "Derech Tzel shading metrics guide",
  ].forEach((phrase) => {
    assert.match(about, new RegExp(escapeRegExp(phrase)));
  });

  const aboutText = normalizedText(about);
  assert.match(aboutText, /equal arithmetic means of direct child attainment values/i);
  assert.match(aboutText, /never averages? of status labels/i);
  assert.match(aboutText, /below 0\.25[^.]*Disappointing/i);
  assert.match(aboutText, /0\.25[^.]*below 0\.75[^.]*Functioning/i);
  assert.match(aboutText, /0\.75[^.]*or higher[^.]*Thriving/i);
  assert.match(aboutText, /an Unknown required child makes its category Unknown/i);
  assert.match(aboutText, /an Unknown category makes the overview Unknown/i);
  assert.match(normalizedText(modal), /categorical surface inferred from nearby buildings/i);
  assert.match(normalizedText(modal), /actual building footprints/i);
});

test("explainer does not revive obsolete numeric or weighted Urban95 claims", () => {
  const { modal, howTo } = explainerSections();
  const urban95Method = sliceBetween(
    modal,
    "<strong>1. Urban95:</strong>",
    "<strong>Shade (Environmental Quality):</strong>"
  );
  const urban95HowToClaims = normalizedText(howTo)
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => /Urban95/i.test(sentence))
    .join(" ");
  const urban95Claims = normalizedText(urban95Method) + " " + urban95HowToClaims;

  assert.doesNotMatch(urban95Claims, /weighted/i);
  assert.doesNotMatch(urban95Claims, /(?:numeric|numerical)[^.!?]{0,80}(?:score|total|scale)|(?:score|total|scale)[^.!?]{0,80}(?:numeric|numerical)/i);
  assert.doesNotMatch(urban95Claims, /(?:0[\u2013-]100|0 to 100)[^.!?]{0,80}(?:score|total|scale)|(?:score|total|scale)[^.!?]{0,80}(?:0[\u2013-]100|0 to 100)/i);
  assert.doesNotMatch(urban95Claims, /ranking|histogram|distribution|\bgap(?:s)?\b/i);
});

test("both frontend npm scripts run the explainer content contract", () => {
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));

  ["test", "test:frontend"].forEach((script) => {
    assert.match(pkg.scripts[script], /tests\/frontend\/explainer_content\.test\.js/);
  });
});
