(function () {
  function readSearchParams() {
    var search = ((window.location && window.location.search) || "").replace(/^\?/, "");
    try {
      if (typeof URLSearchParams === "function") {
        return new URLSearchParams(search);
      }
    } catch (error) {}
    var pairs = {};
    if (search) {
      search.split("&").forEach(function (part) {
        if (!part) return;
        var pieces = part.split("=");
        var key = decodeURIComponent(pieces[0] || "");
        pairs[key] = decodeURIComponent(pieces.slice(1).join("=") || "");
      });
    }
    return {
      get: function (key) {
        return Object.prototype.hasOwnProperty.call(pairs, key) ? pairs[key] : null;
      },
    };
  }

  function readLocalStorageFlag(key) {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem(key) === "1";
    } catch (error) {
      return false;
    }
  }

  function createConsoleMethod(enabled) {
    return function () {
      if (!enabled) return;
      var consoleTarget = window.console || {};
      var target = typeof consoleTarget.log === "function" ? consoleTarget.log : null;
      if (typeof target !== "function") return;

      var resolvedArgs = [];
      for (var index = 0; index < arguments.length; index += 1) {
        var value = arguments[index];
        if (typeof value === "function") {
          value = value();
        }
        resolvedArgs.push(value);
      }

      target.apply(consoleTarget, resolvedArgs);
    };
  }

  function createPassthroughMethod(methodName) {
    return function () {
      var consoleTarget = window.console || {};
      var target = typeof consoleTarget[methodName] === "function" ? consoleTarget[methodName] : consoleTarget.log;
      if (typeof target !== "function") return;
      target.apply(consoleTarget, arguments);
    };
  }

  var searchParams = readSearchParams();
  var debugEnabled = searchParams.get("debug") === "1" || readLocalStorageFlag("urban95_debug");
  var perfEnabled = searchParams.get("perf") === "1" || readLocalStorageFlag("urban95_perf");

  window.Urban95Logger = {
    isDebugEnabled: function () {
      return debugEnabled;
    },
    isPerfEnabled: function () {
      return perfEnabled;
    },
    debug: createConsoleMethod(debugEnabled),
    perf: createConsoleMethod(perfEnabled),
    warn: createPassthroughMethod("warn"),
    error: createPassthroughMethod("error"),
  };
})();
