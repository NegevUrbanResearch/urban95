const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createBrowserContext(overrides = {}) {
  const calls = [];
  const fakeWindow = {
    location: { href: "http://localhost:8080/docs/index.html" },
    URBAN95_GENERATED_ARTIFACTS: {},
    pmtiles: { Protocol: function Protocol() {} },
    console,
    document: {
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
