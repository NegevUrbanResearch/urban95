(function () {
  var MOBILE_QUERY = "(max-width: 768px)";
  var BYPASS_PATTERN = /(?:^|[?&])desktop(?:=1)?(?:&|$)/;

  function resolveMatchMedia(matchMediaFn) {
    if (typeof matchMediaFn === "function") return matchMediaFn;
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia.bind(window);
    }
    return null;
  }

  function hasBypass(locationRef) {
    try {
      var locationObj = locationRef || (typeof window !== "undefined" ? window.location : null);
      var search = locationObj && typeof locationObj.search === "string" ? locationObj.search : "";
      if (typeof URLSearchParams === "function") {
        return new URLSearchParams(search).has("desktop");
      }
      return BYPASS_PATTERN.test(search);
    } catch (error) {
      return false;
    }
  }

  function isMobileViewport(matchMediaFn) {
    var matchMedia = resolveMatchMedia(matchMediaFn);
    if (!matchMedia) return false;
    try {
      return !!matchMedia(MOBILE_QUERY).matches;
    } catch (error) {
      return false;
    }
  }

  function shouldBlock(deps) {
    var options = deps || {};
    if (options.bypass === true || hasBypass(options.location)) return false;
    return isMobileViewport(options.matchMedia);
  }

  function apply(deps) {
    var options = deps || {};
    var documentRef = options.document || (typeof document !== "undefined" ? document : null);
    if (!documentRef || !documentRef.body) return { blocked: false };

    var overlay =
      options.overlay ||
      (typeof documentRef.getElementById === "function"
        ? documentRef.getElementById("desktop-only-overlay")
        : null);
    var blocked = shouldBlock(options);
    var loadingScreen =
      typeof documentRef.getElementById === "function"
        ? documentRef.getElementById("loading-screen")
        : null;

    if (blocked) {
      documentRef.body.classList.add("desktop-only-blocked");
      if (overlay) {
        overlay.hidden = false;
        overlay.setAttribute("aria-hidden", "false");
      }
      if (loadingScreen && loadingScreen.classList) {
        loadingScreen.classList.add("hidden");
      }
    } else {
      documentRef.body.classList.remove("desktop-only-blocked");
      if (overlay) {
        overlay.hidden = true;
        overlay.setAttribute("aria-hidden", "true");
      }
    }

    return { blocked: blocked };
  }

  function bind(deps) {
    var options = deps || {};
    apply(options);

    var matchMedia = resolveMatchMedia(options.matchMedia);
    if (!matchMedia) return;

    var mediaQueryList;
    try {
      mediaQueryList = matchMedia(MOBILE_QUERY);
    } catch (error) {
      return;
    }

    var onChange = function () {
      apply(options);
    };

    if (mediaQueryList && typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", onChange);
      return;
    }

    if (mediaQueryList && typeof mediaQueryList.addListener === "function") {
      mediaQueryList.addListener(onChange);
    }
  }

  window.Urban95DesktopOnlyGate = {
    MOBILE_QUERY: MOBILE_QUERY,
    hasBypass: hasBypass,
    isMobileViewport: isMobileViewport,
    shouldBlock: shouldBlock,
    apply: apply,
    bind: bind,
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        bind();
      });
    } else {
      bind();
    }
  }
})();
