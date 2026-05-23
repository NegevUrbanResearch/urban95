(function () {
  var urban95Perf = (function () {
    var enabled = false;
    try {
      var search =
        window.location && typeof window.location.search === "string"
          ? window.location.search
          : "";
      var urlPerfEnabled = false;
      if (typeof URLSearchParams === "function") {
        var sp = new URLSearchParams(search);
        urlPerfEnabled = sp.has("perf") || sp.get("perf") === "1";
      } else {
        urlPerfEnabled = /(?:^|[?&])perf(?:=1)?(?:&|$)/.test(search);
      }
      var storagePerfEnabled = false;
      try {
        storagePerfEnabled =
          !!(window.localStorage && window.localStorage.getItem("urban95_perf") === "1");
      } catch (e1) {}
      enabled = urlPerfEnabled || storagePerfEnabled;
    } catch (e0) {}
    var records = [];
    var maxRecords = 2500;
    var depth = 0;

    function push(entry) {
      if (records.length >= maxRecords) records.shift();
      records.push(entry);
    }

    function truncateString(value) {
      if (value.length <= 120) return value;
      return value.slice(0, 117) + "...";
    }

    function sanitizeMetaValue(value) {
      if (value == null) return value;
      var valueType = typeof value;
      if (valueType === "string") return truncateString(value);
      if (valueType === "number") return Number.isFinite(value) ? value : String(value);
      if (valueType === "boolean") return value;
      return String(value);
    }

    function sanitizeMeta(meta) {
      if (!meta) return undefined;
      if (typeof meta === "function") meta = meta();
      if (!meta || typeof meta !== "object") return undefined;
      var out = {};
      Object.keys(meta).slice(0, 24).forEach(function (key) {
        out[key] = sanitizeMetaValue(meta[key]);
      });
      return out;
    }

    function addMeta(entry, meta) {
      var cleanMeta = sanitizeMeta(meta);
      if (cleanMeta && Object.keys(cleanMeta).length > 0) entry.meta = cleanMeta;
      return entry;
    }

    function summarizeResourceName(name) {
      if (!name || typeof name !== "string") return "unknown";
      try {
        var url = new URL(name, window.location && window.location.href ? window.location.href : undefined);
        var path = url.pathname || "";
        if (path.indexOf(".pmtiles") !== -1) return "pmtiles:" + path.split("/").pop();
        if (path.indexOf(".json") !== -1 || path.indexOf(".geojson") !== -1) return "json:" + path.split("/").pop();
        if (path.indexOf(".pbf") !== -1) return "glyph-or-vector:" + path.split("/").pop();
        if (/\.(?:png|jpg|jpeg|webp)$/i.test(path)) return "raster:" + path.split("/").pop();
        return url.host || truncateString(name);
      } catch (e1) {
        return truncateString(name);
      }
    }

    function classifyResource(name) {
      if (!name || typeof name !== "string") return "other";
      if (name.indexOf(".pmtiles") !== -1) return "pmtiles";
      if (name.indexOf(".geojson") !== -1 || name.indexOf(".json") !== -1) return "json";
      if (name.indexOf(".pbf") !== -1) return "glyph-or-vector";
      if (/\.(?:png|jpg|jpeg|webp)(?:\?|$)/i.test(name)) return "raster";
      return "other";
    }

    function recordResourceSummary(label) {
      if (!enabled || !performance || typeof performance.getEntriesByType !== "function") return;
      var entries = performance.getEntriesByType("resource") || [];
      var buckets = {};
      entries.forEach(function (entry) {
        var kind = classifyResource(entry.name);
        var bucket = buckets[kind] || { count: 0, ms: 0, bytes: 0, last: "" };
        bucket.count += 1;
        bucket.ms += Number(entry.duration) || 0;
        bucket.bytes += Number(entry.transferSize) || 0;
        bucket.last = summarizeResourceName(entry.name);
        buckets[kind] = bucket;
      });
      Object.keys(buckets).forEach(function (kind) {
        var bucket = buckets[kind];
        push({
          kind: "resourceSummary",
          name: label || "resources",
          t: performance.now(),
          meta: {
            bucket: kind,
            count: bucket.count,
            durationMs: Math.round(bucket.ms),
            transferBytes: bucket.bytes,
            last: bucket.last,
          },
        });
      });
    }

    return {
      enabled: enabled,
      records: records,
      session: function (label) {
        if (!enabled) return;
        push({ kind: "session", name: label || "session", t: performance.now(), ts: Date.now() });
      },
      mark: function (name, meta) {
        if (!enabled) return;
        push(addMeta({ kind: "mark", name: name, t: performance.now() }, meta));
      },
      counter: function (name, meta) {
        if (!enabled) return;
        push(addMeta({ kind: "counter", name: name, t: performance.now() }, meta));
      },
      span: function (name, meta, fn) {
        if (typeof meta === "function" && !fn) {
          fn = meta;
          meta = undefined;
        }
        if (!enabled) return fn();
        depth++;
        var d = depth - 1;
        var t0 = performance.now();
        try {
          return fn();
        } finally {
          var ms = performance.now() - t0;
          depth--;
          push(addMeta({ kind: "span", name: name, ms: ms, depth: d, t: performance.now() }, meta));
        }
      },
      spanAsync: function (name, meta, promiseOrFactory) {
        if (arguments.length === 2) {
          promiseOrFactory = meta;
          meta = undefined;
        }
        if (!enabled) {
          return typeof promiseOrFactory === "function" ? promiseOrFactory() : promiseOrFactory;
        }
        var t0 = performance.now();
        var p;
        try {
          p = typeof promiseOrFactory === "function" ? promiseOrFactory() : promiseOrFactory;
        } catch (err0) {
          push(addMeta({
            kind: "spanAsync",
            name: name,
            ms: performance.now() - t0,
            t: performance.now(),
            error: err0 && err0.message ? err0.message : String(err0),
          }, meta));
          throw err0;
        }
        return Promise.resolve(p).then(
          function (v) {
            push(addMeta({ kind: "spanAsync", name: name, ms: performance.now() - t0, t: performance.now() }, meta));
            return v;
          },
          function (err) {
            push(addMeta({
              kind: "spanAsync",
              name: name,
              ms: performance.now() - t0,
              t: performance.now(),
              error: err && err.message ? err.message : String(err),
            }, meta));
            throw err;
          }
        );
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
      recordResourceSummary: recordResourceSummary,
      observeResourceTiming: recordResourceSummary,
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
