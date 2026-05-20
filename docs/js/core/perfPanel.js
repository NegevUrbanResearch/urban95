(function () {
  var urban95Perf = (function () {
    var enabled = false;
    try {
      var sp = new URLSearchParams(window.location.search);
      enabled =
        sp.has("perf") ||
        sp.get("perf") === "1" ||
        (typeof localStorage !== "undefined" && localStorage.getItem("urban95_perf") === "1");
    } catch (e0) {}
    var records = [];
    var maxRecords = 800;
    var depth = 0;

    function push(entry) {
      if (records.length >= maxRecords) records.shift();
      records.push(entry);
    }

    return {
      enabled: enabled,
      records: records,
      session: function (label) {
        if (!enabled) return;
        push({ kind: "session", name: label || "session", t: performance.now(), ts: Date.now() });
      },
      phase: function (name, fn) {
        if (!enabled) return fn();
        depth++;
        var d = depth - 1;
        var t0 = performance.now();
        try {
          return fn();
        } finally {
          var ms = performance.now() - t0;
          depth--;
          push({ kind: "phase", name: name, ms: ms, depth: d, t: performance.now() });
        }
      },
      phaseAsync: function (name, p) {
        if (!enabled) return p;
        var t0 = performance.now();
        return Promise.resolve(p).then(
          function (v) {
            push({ kind: "phaseAsync", name: name, ms: performance.now() - t0, t: performance.now() });
            return v;
          },
          function (err) {
            push({
              kind: "phaseAsync",
              name: name,
              ms: performance.now() - t0,
              t: performance.now(),
              error: err && err.message ? err.message : String(err),
            });
            throw err;
          }
        );
      },
      clear: function () {
        records.length = 0;
      },
      exportJson: function () {
        return JSON.stringify({ exportedAt: new Date().toISOString(), records: records }, null, 2);
      },
      mountPanel: function () {
        if (!enabled || document.getElementById("urban95-perf-panel")) return;
        var root = document.createElement("div");
        root.id = "urban95-perf-panel";
        root.setAttribute(
          "style",
          "position:fixed;bottom:8px;right:8px;max-width:min(440px,92vw);max-height:38vh;overflow:auto;" +
            "background:rgba(15,23,42,0.94);color:#e2e8f0;font:11px/1.35 ui-monospace,monospace;" +
            "padding:8px 10px;border-radius:8px;z-index:99999;box-shadow:0 4px 24px rgba(0,0,0,0.45);" +
            "border:1px solid rgba(148,163,184,0.35);"
        );
        root.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;">' +
          '<strong style="color:#7dd3fc;">Urban95 perf</strong>' +
          '<span style="opacity:0.75;font-size:10px;">?perf=1</span></div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">' +
          '<button type="button" id="urban95-perf-copy" style="font:inherit;padding:2px 8px;cursor:pointer;border-radius:4px;border:1px solid #64748b;background:#334155;color:#f1f5f9;">Copy JSON</button>' +
          '<button type="button" id="urban95-perf-clear" style="font:inherit;padding:2px 8px;cursor:pointer;border-radius:4px;border:1px solid #64748b;background:#334155;color:#f1f5f9;">Clear</button>' +
          '<button type="button" id="urban95-perf-table" style="font:inherit;padding:2px 8px;cursor:pointer;border-radius:4px;border:1px solid #64748b;background:#334155;color:#f1f5f9;">console.table</button>' +
          "</div>" +
          '<pre id="urban95-perf-body" style="margin:0;white-space:pre-wrap;word-break:break-word;max-height:28vh;overflow:auto;"></pre>';
        document.body.appendChild(root);
        function refresh() {
          var el = document.getElementById("urban95-perf-body");
          if (!el) return;
          var lines = records.slice(-100).map(function (r) {
            var ind = typeof r.depth === "number" ? new Array(Math.min(r.depth, 8) + 1).join(". ") : "";
            if (r.kind === "session") return ind + "—— " + r.name + " ——";
            var ms = r.ms != null ? r.ms.toFixed(1) + "ms" : "";
            return ind + r.name + " " + ms + (r.error ? " ERR:" + r.error : "");
          });
          el.textContent = lines.join("\n") || "(no samples yet; toggle modes or score model)";
        }
        var iv = setInterval(refresh, 450);
        refresh();
        document.getElementById("urban95-perf-copy").onclick = function () {
          var json = urban95Perf.exportJson();
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(json).catch(function () {});
          } else {
            console.log(json);
          }
        };
        document.getElementById("urban95-perf-clear").onclick = function () {
          urban95Perf.clear();
          refresh();
        };
        document.getElementById("urban95-perf-table").onclick = function () {
          console.table(records.slice(-50));
        };
        window.addEventListener("beforeunload", function () {
          clearInterval(iv);
        });
      },
    };
  })();

  window.urban95Perf = urban95Perf;

  if (urban95Perf.enabled) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        urban95Perf.mountPanel();
      });
    } else {
      urban95Perf.mountPanel();
    }
  }
})();
