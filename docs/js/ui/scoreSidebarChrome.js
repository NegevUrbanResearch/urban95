(function () {
  function create(deps) {
    var validated = validateDeps(deps || null);
    var perf = validated.perf || {};
    var perfMark = typeof perf.mark === "function" ? perf.mark : function () {};
    var scoreSidebarPaddingActive = false;
    var scoreSidebarPaddingSnapshot = null;
    var scoreSidebarAppliedPadding = null;

    function cloneMapPadding(padding) {
      return {
        top: Number(padding && padding.top) || 0,
        right: Number(padding && padding.right) || 0,
        bottom: Number(padding && padding.bottom) || 0,
        left: Number(padding && padding.left) || 0,
      };
    }

    function readMapPaddingSnapshot() {
      if (typeof validated.map.getPadding === "function") {
        return cloneMapPadding(validated.map.getPadding());
      }
      if (validated.map.transform && validated.map.transform.padding) {
        return cloneMapPadding(validated.map.transform.padding);
      }
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }

    function isSamePadding(a, b) {
      return (
        a &&
        b &&
        a.top === b.top &&
        a.right === b.right &&
        a.bottom === b.bottom &&
        a.left === b.left
      );
    }

    function setSidebarPadding(open, width, options) {
      var opts = options || {};
      var media = validated.matchMedia("(max-width: 768px)");
      var isMobile = !!(media && media.matches);
      if (open && !isMobile) {
        if (!scoreSidebarPaddingActive) {
          scoreSidebarPaddingSnapshot = readMapPaddingSnapshot();
        }
        scoreSidebarPaddingActive = true;
        var nextPadding = Object.assign({}, scoreSidebarPaddingSnapshot, {
          right: Math.round(width || 0),
        });
        if (scoreSidebarPaddingActive && isSamePadding(scoreSidebarAppliedPadding, nextPadding)) {
          perfMark("scoreSidebarChrome:paddingUnchanged", function () {
            return {
              open: true,
              width: Math.round(Number(width) || 0),
              right: nextPadding.right,
              mobile: isMobile,
              forceResize: opts.forceResize === true,
            };
          });
          if (opts.forceResize) {
            validated.map.resize();
            perfMark("scoreSidebarChrome:resize", function () {
              return {
                open: true,
                right: nextPadding.right,
                forceResize: true,
              };
            });
          }
          return;
        }
        perfMark("scoreSidebarChrome:setPadding", function () {
          return {
            open: true,
            width: Math.round(Number(width) || 0),
            right: nextPadding.right,
            mobile: isMobile,
            forceResize: opts.forceResize === true,
          };
        });
        validated.map.setPadding(nextPadding);
        scoreSidebarAppliedPadding = nextPadding;
        validated.map.resize();
        perfMark("scoreSidebarChrome:resize", function () {
          return {
            open: true,
            right: nextPadding.right,
            forceResize: opts.forceResize === true,
          };
        });
        return;
      }

      perfMark("scoreSidebarChrome:setPadding", function () {
        return {
          open: false,
          width: Math.round(Number(width) || 0),
          right: 0,
          mobile: isMobile,
          forceResize: opts.forceResize === true,
        };
      });
      if (scoreSidebarPaddingActive && scoreSidebarPaddingSnapshot) {
        validated.map.setPadding(scoreSidebarPaddingSnapshot);
      }
      scoreSidebarPaddingActive = false;
      scoreSidebarPaddingSnapshot = null;
      scoreSidebarAppliedPadding = null;
      validated.map.resize();
      perfMark("scoreSidebarChrome:resize", function () {
        return {
          open: false,
          right: 0,
          forceResize: opts.forceResize === true,
        };
      });
    }

    function restoreFocusAfterHide() {
      var canvas = typeof validated.map.getCanvas === "function" ? validated.map.getCanvas() : null;
      if (canvas) {
        canvas.setAttribute("tabindex", "-1");
        canvas.focus({ preventScroll: true });
        return;
      }
      var mapEl = validated.document.getElementById("map");
      if (mapEl) {
        mapEl.setAttribute("tabindex", "-1");
        mapEl.focus({ preventScroll: true });
      }
    }

    return {
      setSidebarPadding: setSidebarPadding,
      restoreFocusAfterHide: restoreFocusAfterHide,
    };
  }

  function validateDeps(deps) {
    if (!deps) {
      throw new Error("Urban95ScoreSidebarChrome.create requires deps");
    }
    if (!deps.map || typeof deps.map !== "object") {
      throw new Error("Urban95ScoreSidebarChrome.create requires map");
    }
    if (typeof deps.map.setPadding !== "function") {
      throw new Error("Urban95ScoreSidebarChrome.create requires map.setPadding (function)");
    }
    if (typeof deps.map.resize !== "function") {
      throw new Error("Urban95ScoreSidebarChrome.create requires map.resize (function)");
    }
    if (!deps.document || typeof deps.document.getElementById !== "function") {
      throw new Error("Urban95ScoreSidebarChrome.create requires document");
    }
    if (typeof deps.matchMedia !== "function") {
      throw new Error("Urban95ScoreSidebarChrome.create requires matchMedia");
    }
    return deps;
  }

  window.Urban95ScoreSidebarChrome = { create: create };
})();
