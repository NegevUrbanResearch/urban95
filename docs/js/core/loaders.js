(function () {
  var loadedScripts = new Map();
  var deckLoadPromise = null;
  var chartLoadPromise = null;

  function shouldTryGzip(url) {
    var config = window.Urban95Config || {};
    var urls = config.urls || {};
    var cdn = config.cdn || {};
    void cdn;
    var artifacts = window.Urban95DataArtifacts || {};
    var generatedUrls = artifacts.urls || {};
    return (
      url === urls.buildings ||
      url === generatedUrls.buildingsLookup ||
      url === urls.isochrones ||
      url === generatedUrls.isochronesLookup ||
      url === generatedUrls.pointsLookup ||
      url === urls.trees ||
      url === urls.streetLights ||
      url === urls.amenitiesLegacy
    );
  }

  async function parseGzipJsonResponse(response) {
    if (!response.ok) throw new Error("HTTP " + response.status);
    if (typeof DecompressionStream !== "function" || !response.body) {
      throw new Error("Browser does not support gzip stream decompression");
    }
    var decompressedStream = response.body.pipeThrough(new DecompressionStream("gzip"));
    var text = await new Response(decompressedStream).text();
    return JSON.parse(text);
  }

  async function fetchJsonWithGzipFallback(url, options) {
    var opts = options || {};
    var required = opts.required !== false;
    var allowPlainFallback = opts.plainFallback !== false;
    var loadStartedAt = performance.now();
    var loadMode = "plain";
    console.log("[Load] fetch start:", url);
    if (shouldTryGzip(url)) {
      var gzipUrl = url + ".gz";
      try {
        loadMode = "gzip";
        var gzFetchStartedAt = performance.now();
        var gzResponse = await fetch(gzipUrl);
        console.log(
          "[Load] gzip response received:",
          gzipUrl,
          Math.round(performance.now() - gzFetchStartedAt) + "ms",
          "status",
          gzResponse.status
        );
        var gzParseStartedAt = performance.now();
        var gzParsed = await parseGzipJsonResponse(gzResponse);
        console.log(
          "[Load] gzip parse done:",
          gzipUrl,
          Math.round(performance.now() - gzParseStartedAt) + "ms"
        );
        console.log(
          "[Load] fetch complete:",
          url,
          "mode=" + loadMode,
          "total=" + Math.round(performance.now() - loadStartedAt) + "ms"
        );
        return gzParsed;
      } catch (gzipErr) {
        if (!allowPlainFallback) {
          if (required) throw gzipErr;
          console.warn(
            "[Load] optional compressed fetch missing:",
            gzipUrl,
            "total=" + Math.round(performance.now() - loadStartedAt) + "ms"
          );
          return null;
        }
        console.warn("Compressed fetch failed, falling back to plain file:", gzipUrl, gzipErr);
        loadMode = "plain-fallback";
      }
    }

    var plainFetchStartedAt = performance.now();
    var plainResponse = await fetch(url);
    console.log(
      "[Load] plain response received:",
      url,
      Math.round(performance.now() - plainFetchStartedAt) + "ms",
      "status",
      plainResponse.status
    );
    if (!plainResponse.ok) {
      if (required) throw new Error("HTTP " + plainResponse.status + " " + url);
      console.warn(
        "[Load] optional fetch missing:",
        url,
        "mode=" + loadMode,
        "total=" + Math.round(performance.now() - loadStartedAt) + "ms"
      );
      return null;
    }
    var plainParseStartedAt = performance.now();
    var plainParsed = await plainResponse.json();
    console.log(
      "[Load] plain parse done:",
      url,
      Math.round(performance.now() - plainParseStartedAt) + "ms"
    );
    console.log(
      "[Load] fetch complete:",
      url,
      "mode=" + loadMode,
      "total=" + Math.round(performance.now() - loadStartedAt) + "ms"
    );
    return plainParsed;
  }

  function loadExternalScriptOnce(src) {
    var existingPromise = loadedScripts.get(src);
    if (existingPromise) return existingPromise;

    var promise = new Promise(function (resolve, reject) {
      var existing = Array.from(document.getElementsByTagName("script")).find(function (script) {
        return script.src === src;
      });
      if (existing) {
        if (existing.dataset.loaded === "1") {
          resolve();
          return;
        }
        existing.addEventListener(
          "load",
          function () {
            existing.dataset.loaded = "1";
            resolve();
          },
          { once: true }
        );
        existing.addEventListener(
          "error",
          function () {
            loadedScripts.delete(src);
            reject(new Error("Failed loading script: " + src));
          },
          { once: true }
        );
        return;
      }

      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = function () {
        script.dataset.loaded = "1";
        resolve();
      };
      script.onerror = function () {
        loadedScripts.delete(src);
        reject(new Error("Failed loading script: " + src));
      };
      document.head.appendChild(script);
    });

    loadedScripts.set(src, promise);
    return promise;
  }

  function ensureDeckGlLoaded() {
    var config = window.Urban95Config || {};
    var cdn = config.cdn || {};
    if (window.deck && window.deck.MapboxOverlay) return Promise.resolve(window.deck);
    if (deckLoadPromise) return deckLoadPromise;
    deckLoadPromise = loadExternalScriptOnce(cdn.deckGl)
      .then(function () {
        if (!window.deck || !window.deck.MapboxOverlay) {
          throw new Error("deck.gl loaded without MapboxOverlay");
        }
        return window.deck;
      })
      .catch(function (err) {
        deckLoadPromise = null;
        throw err;
      });
    return deckLoadPromise;
  }

  function ensureChartJsLoaded() {
    var config = window.Urban95Config || {};
    var cdn = config.cdn || {};
    if (window.Chart) return Promise.resolve(window.Chart);
    if (chartLoadPromise) return chartLoadPromise;
    chartLoadPromise = loadExternalScriptOnce(cdn.chartJs)
      .then(function () {
        if (!window.Chart) {
          throw new Error("Chart.js failed to initialize");
        }
        return window.Chart;
      })
      .catch(function (err) {
        chartLoadPromise = null;
        throw err;
      });
    return chartLoadPromise;
  }

  window.Urban95Loaders = {
    shouldTryGzip: shouldTryGzip,
    parseGzipJsonResponse: parseGzipJsonResponse,
    fetchJsonWithGzipFallback: fetchJsonWithGzipFallback,
    loadExternalScriptOnce: loadExternalScriptOnce,
    ensureDeckGlLoaded: ensureDeckGlLoaded,
    ensureChartJsLoaded: ensureChartJsLoaded,
  };
})();
