(function () {
  "use strict";

  var deps = null;
  var clearing = false;

  function configure(nextDeps) {
    deps = nextDeps || null;
    clearing = false;
  }

  function requireDeps() {
    if (!deps) {
      throw new Error(
        "Urban95NeighborhoodCompareApply.configure must be called before compare apply functions"
      );
    }
    return deps;
  }

  function requireMethod(objectValue, objectName, methodName) {
    if (!objectValue || typeof objectValue[methodName] !== "function") {
      throw new Error(
        "Urban95NeighborhoodCompareApply requires " + objectName + "." + methodName
      );
    }
    return objectValue[methodName];
  }

  function setSelectedNeighborhood(feature) {
    var d = requireDeps();
    if (typeof d.setSelectedNeighborhood === "function") {
      d.setSelectedNeighborhood(feature);
    }
  }

  function applyKind(result) {
    var d = requireDeps();
    var selection = d.selection;
    var highlight = d.highlight;
    var sidebar = d.sidebar;

    requireMethod(selection, "selection", "getState");
    requireMethod(highlight, "highlight", "applyCompareSlots");
    requireMethod(highlight, "highlight", "clearCompare");
    requireMethod(sidebar, "sidebar", "hide");
    requireMethod(sidebar, "sidebar", "show");
    requireMethod(sidebar, "sidebar", "showCompare");

    if (!result || result.kind === "rejected") {
      return result;
    }

    if (result.kind === "none") {
      highlight.clearCompare();
      setSelectedNeighborhood(null);
      sidebar.hide({ clearSelection: false });
      return result;
    }

    var state = selection.getState();
    highlight.applyCompareSlots(state);

    if (result.kind === "compare") {
      setSelectedNeighborhood(state.slots[0]);
      sidebar.showCompare(state);
      return result;
    }

    // single
    setSelectedNeighborhood(state.slots[0]);
    sidebar.show(state.slots[0]);
    return result;
  }

  function applyClick(feature) {
    var d = requireDeps();
    var selection = d.selection;
    requireMethod(selection, "selection", "select");

    var result = selection.select(feature);
    if (result.kind === "rejected") {
      // Atomic reject: selection FSM did not mutate; leave highlight/sidebar alone.
      return result;
    }
    return applyKind(result);
  }

  function removeSlot(index) {
    var d = requireDeps();
    var selection = d.selection;
    requireMethod(selection, "selection", "removeSlot");
    return applyKind(selection.removeSlot(index));
  }

  function clearAll(options) {
    options = options || {};
    if (clearing) return { kind: "none" };
    clearing = true;
    try {
      var d = requireDeps();
      var selection = d.selection;
      var highlight = d.highlight;
      var sidebar = d.sidebar;
      requireMethod(selection, "selection", "clear");
      requireMethod(highlight, "highlight", "clearCompare");
      requireMethod(sidebar, "sidebar", "hide");

      selection.clear();
      highlight.clearCompare();
      setSelectedNeighborhood(null);
      sidebar.hide({
        restoreFocus: options.restoreFocus,
        clearSelection: false,
      });
      return { kind: "none" };
    } finally {
      clearing = false;
    }
  }

  function resync() {
    var d = requireDeps();
    var selection = d.selection;
    var highlight = d.highlight;
    var sidebar = d.sidebar;
    requireMethod(selection, "selection", "isComparing");
    requireMethod(selection, "selection", "getState");
    requireMethod(selection, "selection", "getPrimaryFeature");
    requireMethod(selection, "selection", "revalidate");
    requireMethod(highlight, "highlight", "applyCompareSlots");
    requireMethod(highlight, "highlight", "clearCompare");
    requireMethod(sidebar, "sidebar", "hide");
    requireMethod(sidebar, "sidebar", "isOpen");
    requireMethod(sidebar, "sidebar", "showCompare");
    requireMethod(sidebar, "sidebar", "sync");

    var validity = selection.revalidate();
    if (validity.kind === "none") {
      highlight.clearCompare();
      setSelectedNeighborhood(null);
      if (sidebar.isOpen()) sidebar.hide({ clearSelection: false });
      return;
    }

    if (selection.isComparing()) {
      var state = selection.getState();
      highlight.applyCompareSlots(state);
      setSelectedNeighborhood(state.slots[0]);
      if (sidebar.isOpen()) {
        sidebar.showCompare(state);
      }
      return;
    }

    var primary = selection.getPrimaryFeature();
    if (primary) {
      setSelectedNeighborhood(primary);
      highlight.applyCompareSlots(selection.getState());
      if (sidebar.isOpen()) {
        sidebar.sync(primary);
      }
      return;
    }

    // No selection: keep panels closed; do not force-open.
  }

  function isComparing() {
    var d = requireDeps();
    requireMethod(d.selection, "selection", "isComparing");
    return d.selection.isComparing();
  }

  window.Urban95NeighborhoodCompareApply = {
    configure: configure,
    applyClick: applyClick,
    removeSlot: removeSlot,
    clearAll: clearAll,
    resync: resync,
    isComparing: isComparing,
  };
})();
