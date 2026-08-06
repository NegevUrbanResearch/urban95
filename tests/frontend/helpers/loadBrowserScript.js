const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function defaultPalette() {
  return {
    coral: "#e05a56",
    peach: "#d9944f",
    yellow: "#d4c44a",
    gold: "#eab308",
    mint: "#5dcc62",
    sage: "#4a9e49",
    sky: "#3aade0",
    blue: "#5a84f5",
    lavender: "#8f5ce8",
    orchid: "#e05ee3",
    accent: "#5a84f5",
    accentSoft: "#3aade0",
    accentDeep: "#3f6ae8",
    accentInk: "#3556b0",
    heroFrom: "#4a62b8",
    heroTo: "#5a84f5",
    slate: "#64748b",
    gray: "#6b7280",
    ink: "#0f172a",
    applyCssVariables() {},
    syncThemeColorMeta() {},
  };
}

function createBrowserContext(overrides = {}) {
  const calls = [];
  const fakeWindow = {
    location: { href: "http://localhost:8080/docs/index.html" },
    URBAN95_GENERATED_ARTIFACTS: {},
    pmtiles: { Protocol: function Protocol() {} },
    console,
    document: {
      documentElement: {
        style: {
          setProperty() {},
        },
      },
      querySelector() {
        return null;
      },
      createElement(tagName) {
        return {
          tagName,
          async: false,
          set src(value) {
            this._src = value;
          },
          get src() {
            return this._src;
          },
          addEventListener(type, handler) {
            this["on" + type] = handler;
          },
        };
      },
      head: {
        appendChild(node) {
          calls.push({ type: "appendChild", node });
          if (typeof node.onload === "function") node.onload();
        },
      },
    },
    fetch() {
      throw new Error("fetch is not available in the module contract VM");
    },
    ...overrides,
  };
  fakeWindow.window = fakeWindow;
  fakeWindow.globalThis = fakeWindow;

  // Tests often override document; keep palette-safe DOM APIs available.
  if (fakeWindow.document) {
    if (!fakeWindow.document.documentElement) {
      fakeWindow.document.documentElement = {
        style: {
          setProperty() {},
        },
      };
    }
    if (typeof fakeWindow.document.querySelector !== "function") {
      fakeWindow.document.querySelector = function querySelector() {
        return null;
      };
    }
  }
  if (!fakeWindow.Urban95Palette) {
    fakeWindow.Urban95Palette = defaultPalette();
  }

  return { context: vm.createContext(fakeWindow), window: fakeWindow, calls };
}

function runBrowserScript(relativePath, browserContext) {
  const absolutePath = path.resolve(__dirname, "..", "..", "..", relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  vm.runInContext(source, browserContext.context, { filename: relativePath });
  return browserContext.window;
}

module.exports = {
  createBrowserContext,
  runBrowserScript,
};
