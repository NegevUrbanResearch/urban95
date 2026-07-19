(function () {
  function requireObject(value, name) {
    if (!value || typeof value !== "object") {
      throw new Error("Urban95Controls.bind missing required dependency: " + name);
    }
    return value;
  }

  function requireFunction(value, name) {
    if (typeof value !== "function") {
      throw new Error("Urban95Controls.bind missing required dependency: " + name);
    }
    return value;
  }

  function bind(deps) {
    var config = requireObject(deps, "deps");
    var elements = requireObject(config.elements, "elements");
    var callbacks = requireObject(config.callbacks, "callbacks");
    var onSidebarWidthChanged =
      typeof callbacks.onSidebarWidthChanged === "function"
        ? callbacks.onSidebarWidthChanged
        : null;

    var sidebarSections = Urban95ControlSidebarSections.create(config);

    sidebarSections.renderSidebarSkeleton();
    sidebarSections.bindStaticEvents();
    sidebarSections.syncSidebarContent();

    function syncSidebarPadding() {
      var width = elements.sidebarEl ? elements.sidebarEl.getBoundingClientRect().width : 0;
      if (onSidebarWidthChanged) onSidebarWidthChanged(width);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("resize", syncSidebarPadding);
    }
    syncSidebarPadding();

    return {
      getScoreModeLabel: sidebarSections.getScoreModeLabel,
      updateFilterLabel: sidebarSections.updateFilterLabel,
      buildFilterItems: sidebarSections.buildFilterItems,
      closeFilterPopup: sidebarSections.closeFilterPopup,
      syncFilterUiForScoreMode: sidebarSections.syncFilterUiForScoreMode,
      syncOverlayVisibility: sidebarSections.syncOverlayVisibility,
      renderIndicatorsSection: sidebarSections.renderIndicatorsSection,
      refreshLegend: sidebarSections.renderLegend,
      setLegendVisible: sidebarSections.setLegendVisible,
      syncSidebarContent: sidebarSections.syncSidebarContent,
      getUiElements: sidebarSections.getUiElements,
      syncSidebarPadding: syncSidebarPadding,
    };
  }

  window.Urban95Controls = {
    bind: bind,
  };
})();
