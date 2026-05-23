(function () {
  var DEFAULT_KEYS = ["icons", "buildings", "parks", "trees", "amenities", "isochrones", "mapReady"];

  function requireObject(value, label) {
    if (!value || typeof value !== "object") {
      throw new Error(label + " is required");
    }
    return value;
  }

  function requireFunction(container, label, memberName) {
    if (!container || typeof container[memberName] !== "function") {
      throw new Error(label + "." + memberName + " must be a function");
    }
    return container[memberName];
  }

  function createInitialLoadingState(keys) {
    return keys.reduce(function (state, key) {
      state[key] = false;
      return state;
    }, {});
  }

  function areAllKeysLoaded(loadingState) {
    return Object.keys(loadingState).every(function (key) {
      return !!loadingState[key];
    });
  }

  function create(deps) {
    var options = requireObject(deps, "deps");
    var elements = requireObject(options.elements, "deps.elements");
    var logger = requireObject(options.logger, "deps.logger");
    var perf = options.perf || {};
    var perfMark = typeof perf.mark === "function" ? perf.mark : function () {};
    var timeoutScheduler =
      typeof options.setTimeout === "function"
        ? options.setTimeout
        : typeof window.setTimeout === "function"
          ? window.setTimeout.bind(window)
          : null;

    requireFunction(logger, "deps.logger", "warn");
    if (typeof timeoutScheduler !== "function") {
      throw new Error("deps.setTimeout must be a function");
    }

    var timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 60000;
    var loadingScreen = elements.loadingScreen || null;
    var loadingStatus = elements.loadingStatus || null;
    var loadingProgressBar = elements.loadingProgressBar || null;
    var loadingState = createInitialLoadingState(DEFAULT_KEYS);
    var waitingForIsochroneLoad = false;

    function hideLoadingScreen() {
      if (
        loadingScreen &&
        loadingScreen.classList &&
        typeof loadingScreen.classList.contains === "function" &&
        !loadingScreen.classList.contains("hidden")
      ) {
        timeoutScheduler(function () {
          if (loadingScreen.classList && typeof loadingScreen.classList.add === "function") {
            loadingScreen.classList.add("hidden");
          }
        }, 300);
      }
    }

    function updateProgress() {
      var items = Object.keys(loadingState).map(function (key) {
        return loadingState[key];
      });
      var loaded = items.filter(Boolean).length;
      var total = items.length;
      var percent = Math.round((loaded / total) * 100);

      if (loadingProgressBar && loadingProgressBar.style) {
        loadingProgressBar.style.width = percent + "%";
      }

      if (loaded === total) {
        hideLoadingScreen();
      }
    }

    function setStatus(message) {
      if (loadingStatus) {
        loadingStatus.textContent = message;
      }
    }

    function mark(key) {
      if (!Object.prototype.hasOwnProperty.call(loadingState, key)) {
        logger.warn("Unknown loading state key:", key);
        return;
      }
      loadingState[key] = true;
      updateProgress();
    }

    function showIsochroneLoadingScreen(meta) {
      var reason = meta && meta.reason ? String(meta.reason) : "";
      waitingForIsochroneLoad = true;
      perfMark("loadingOverlay:show", function () {
        return { reason: reason };
      });
      if (loadingScreen && loadingScreen.classList && typeof loadingScreen.classList.remove === "function") {
        loadingScreen.classList.remove("hidden");
      }
      if (loadingProgressBar && loadingProgressBar.style) {
        loadingProgressBar.style.width = "100%";
      }
      setStatus("Loading walking areas for Amenities Focus...");
    }

    function hideIsochroneLoadingScreen(meta) {
      var reason = meta && meta.reason ? String(meta.reason) : "";
      waitingForIsochroneLoad = false;
      perfMark("loadingOverlay:hideRequested", function () {
        return { reason: reason, allKeysLoaded: areAllKeysLoaded(loadingState) };
      });
      if (areAllKeysLoaded(loadingState)) {
        hideLoadingScreen();
      }
    }

    timeoutScheduler(function () {
      if (
        loadingScreen &&
        loadingScreen.classList &&
        typeof loadingScreen.classList.contains === "function" &&
        !loadingScreen.classList.contains("hidden")
      ) {
        if (waitingForIsochroneLoad) return;
        if (areAllKeysLoaded(loadingState)) return;
        logger.warn("Loading timeout - forcing hide");
        hideLoadingScreen();
      }
    }, timeoutMs);

    return {
      state: loadingState,
      getLoadingState: function () {
        return loadingState;
      },
      getWaitingForIsochroneLoad: function () {
        return waitingForIsochroneLoad;
      },
      hideLoadingScreen: hideLoadingScreen,
      updateProgress: updateProgress,
      mark: mark,
      setStatus: setStatus,
      showIsochroneLoadingScreen: showIsochroneLoadingScreen,
      hideIsochroneLoadingScreen: hideIsochroneLoadingScreen,
    };
  }

  window.Urban95LoadingUi = {
    create: create,
  };
})();
