(function () {
  "use strict";

  function create(config) {
    if (!config) {
      throw new Error("Urban95SidebarChromeBindings.create requires config");
    }

    var sidebarEl = config.sidebarEl;
    var backdropEl = config.backdropEl;
    var closeButtonEl = config.closeButtonEl;
    var bodyEl = config.bodyEl;
    var bodyOpenClass = config.bodyOpenClass;
    var onClose = config.onClose;
    var setSidebarPadding = config.setSidebarPadding;
    var getSidebarWidth = config.getSidebarWidth;
    var restoreFocusAfterHide = config.restoreFocusAfterHide;
    var onResizeWhileOpen = config.onResizeWhileOpen;

    var previousFocusedElement = null;
    var globalBindingsAttached = false;

    function isOpen() {
      return !!(sidebarEl && sidebarEl.classList.contains("is-open"));
    }

    function captureFocusOrigin() {
      var activeEl = document.activeElement;
      if (
        activeEl &&
        activeEl !== document.body &&
        activeEl !== sidebarEl &&
        (!sidebarEl || typeof sidebarEl.contains !== "function" || !sidebarEl.contains(activeEl))
      ) {
        previousFocusedElement = activeEl;
        return;
      }
      previousFocusedElement = null;
    }

    function restoreFocus(options) {
      var shouldRestore = !options || options.restoreFocus !== false;
      if (!shouldRestore) {
        previousFocusedElement = null;
        return;
      }
      var target = previousFocusedElement;
      previousFocusedElement = null;
      if (target && typeof target.focus === "function") {
        try {
          target.focus({ preventScroll: true });
          return;
        } catch (_err) {
          // Fall through to the app-owned fallback when the prior focus target is gone.
        }
      }
      if (typeof restoreFocusAfterHide === "function") {
        restoreFocusAfterHide();
      }
    }

    function syncBackdrop() {
      if (!backdropEl) return;
      if (!isOpen()) {
        backdropEl.hidden = true;
        return;
      }
      var isMobile = window.matchMedia("(max-width: 768px)").matches;
      backdropEl.hidden = !isMobile;
    }

    function setMapPadding(open, widthOrZero, options) {
      if (typeof setSidebarPadding !== "function") return;
      setSidebarPadding(open, widthOrZero, options);
    }

    function open() {
      if (!sidebarEl) return;
      var wasOpen = isOpen();
      if (!wasOpen) {
        captureFocusOrigin();
      }
      sidebarEl.classList.add("is-open");
      sidebarEl.removeAttribute("aria-hidden");
      if (document.body && document.body.classList) {
        document.body.classList.add(bodyOpenClass);
      }
      setMapPadding(true, typeof getSidebarWidth === "function" ? getSidebarWidth() : 0);
      syncBackdrop();
      if (!wasOpen && closeButtonEl && typeof closeButtonEl.focus === "function") {
        closeButtonEl.focus({ preventScroll: true });
      }
    }

    function close(options) {
      if (!sidebarEl) return;
      sidebarEl.classList.remove("is-open");
      sidebarEl.setAttribute("aria-hidden", "true");
      if (document.body && document.body.classList) {
        document.body.classList.remove(bodyOpenClass);
      }
      setMapPadding(false, 0);
      syncBackdrop();
      restoreFocus(options);
    }

    function bindGlobalHandlers() {
      if (globalBindingsAttached) return;
      globalBindingsAttached = true;

      if (closeButtonEl) {
        closeButtonEl.addEventListener("click", function () {
          if (typeof onClose === "function") onClose();
        });
      }
      if (backdropEl) {
        backdropEl.addEventListener("click", function () {
          if (typeof onClose === "function") onClose();
        });
      }
      if (bodyEl) {
        bodyEl.addEventListener(
          "wheel",
          function (e) {
            if (!isOpen()) return;
            var canScroll = bodyEl.scrollHeight > bodyEl.clientHeight + 1;
            if (canScroll) {
              var delta = e.deltaY;
              var atTop = bodyEl.scrollTop <= 0;
              var atBottom =
                bodyEl.scrollTop + bodyEl.clientHeight >= bodyEl.scrollHeight - 1;
              if ((delta < 0 && !atTop) || (delta > 0 && !atBottom)) {
                return;
              }
            }
            e.preventDefault();
          },
          { passive: false }
        );
      }
      window.addEventListener("resize", function () {
        if (!isOpen()) return;
        setMapPadding(true, typeof getSidebarWidth === "function" ? getSidebarWidth() : 0, {
          forceResize: true,
        });
        syncBackdrop();
        if (typeof onResizeWhileOpen === "function") {
          onResizeWhileOpen();
        }
      });
    }

    return {
      bindGlobalHandlers: bindGlobalHandlers,
      open: open,
      close: close,
      syncBackdrop: syncBackdrop,
      isOpen: isOpen,
      captureFocusOrigin: captureFocusOrigin,
      restoreFocus: restoreFocus,
    };
  }

  window.Urban95SidebarChromeBindings = {
    create: create,
  };
})();
