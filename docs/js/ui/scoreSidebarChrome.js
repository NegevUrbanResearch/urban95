(function () {
  function create(deps) {
    var validated = validateDeps(deps || null);
    var perf = validated.perf || {};
    var perfMark = typeof perf.mark === "function" ? perf.mark : function () {};
    var sidebarReservations = { left: 0, right: 0 };
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

    function hasActiveReservations() {
      return sidebarReservations.left > 0 || sidebarReservations.right > 0;
    }

    // Reservation widths are absolute occupied widths for each side, not deltas
    // added onto that side's existing map padding. This preserves the legacy
    // right-sidebar contract where opening a 360px sidebar yields right: 360,
    // while still preserving untouched baseline padding on the opposite side.
    function buildReservationPadding() {
      return {
        top: scoreSidebarPaddingSnapshot.top,
        bottom: scoreSidebarPaddingSnapshot.bottom,
        left:
          sidebarReservations.left > 0
            ? sidebarReservations.left
            : scoreSidebarPaddingSnapshot.left,
        right:
          sidebarReservations.right > 0
            ? sidebarReservations.right
            : scoreSidebarPaddingSnapshot.right,
      };
    }

    function clearReservationState() {
      sidebarReservations.left = 0;
      sidebarReservations.right = 0;
      scoreSidebarPaddingSnapshot = null;
      scoreSidebarAppliedPadding = null;
    }

    function setSidebarReservation(side, width, options) {
      var opts = options || {};
      if (side !== "left" && side !== "right") {
        throw new Error("setSidebarReservation side must be 'left' or 'right'");
      }

      var media = validated.matchMedia("(max-width: 768px)");
      var isMobile = !!(media && media.matches);
      var reservationWidth = isMobile ? 0 : Math.round(Number(width) || 0);
      var hadState = !!scoreSidebarPaddingSnapshot;
      var otherSide = side === "left" ? "right" : "left";
      var willHaveReservations =
        reservationWidth > 0 || sidebarReservations[otherSide] > 0;

      if (willHaveReservations && !scoreSidebarPaddingSnapshot) {
        scoreSidebarPaddingSnapshot = readMapPaddingSnapshot();
      }

      sidebarReservations[side] = reservationWidth;

      if (!hasActiveReservations()) {
        perfMark("scoreSidebarChrome:setPadding", function () {
          return {
            side: side,
            open: reservationWidth > 0,
            width: Math.round(Number(width) || 0),
            left: scoreSidebarPaddingSnapshot ? scoreSidebarPaddingSnapshot.left : 0,
            right: scoreSidebarPaddingSnapshot ? scoreSidebarPaddingSnapshot.right : 0,
            mobile: isMobile,
            forceResize: opts.forceResize === true,
          };
        });
        if (hadState && scoreSidebarPaddingSnapshot) {
          validated.map.setPadding(scoreSidebarPaddingSnapshot);
        }
        clearReservationState();
        validated.map.resize();
        perfMark("scoreSidebarChrome:resize", function () {
          return {
            side: side,
            open: false,
            left: 0,
            right: 0,
            forceResize: opts.forceResize === true,
          };
        });
        return;
      }

      var nextPadding = buildReservationPadding();
      if (isSamePadding(scoreSidebarAppliedPadding, nextPadding)) {
        perfMark("scoreSidebarChrome:paddingUnchanged", function () {
          return {
            side: side,
            open: reservationWidth > 0,
            width: Math.round(Number(width) || 0),
            left: nextPadding.left,
            right: nextPadding.right,
            mobile: isMobile,
            forceResize: opts.forceResize === true,
          };
        });
        if (opts.forceResize) {
          validated.map.resize();
          perfMark("scoreSidebarChrome:resize", function () {
            return {
              side: side,
              open: reservationWidth > 0,
              left: nextPadding.left,
              right: nextPadding.right,
              forceResize: true,
            };
          });
        }
        return;
      }

      perfMark("scoreSidebarChrome:setPadding", function () {
        return {
          side: side,
          open: reservationWidth > 0,
          width: Math.round(Number(width) || 0),
          left: nextPadding.left,
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
          side: side,
          open: reservationWidth > 0,
          left: nextPadding.left,
          right: nextPadding.right,
          forceResize: opts.forceResize === true,
        };
      });
    }

    function setSidebarPadding(open, width, options) {
      setSidebarReservation("right", open ? width : 0, options);
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
      setSidebarReservation: setSidebarReservation,
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
