(function () {
  "use strict";

  function featureName(feature) {
    return feature && feature.properties ? feature.properties.Name : undefined;
  }

  function create(options) {
    options = options || {};
    var isComparable = options.isComparable;
    if (typeof isComparable !== "function") {
      throw new Error("Urban95NeighborhoodSelection.create requires isComparable");
    }

    var slots = [null, null];
    var focusedSlot = 0;

    function getState() {
      return {
        slots: [slots[0], slots[1]],
        focusedSlot: focusedSlot,
      };
    }

    function isComparing() {
      return !!(slots[0] && slots[1]);
    }

    function getPrimaryFeature() {
      return slots[0];
    }

    function clear() {
      slots[0] = null;
      slots[1] = null;
      focusedSlot = 0;
      return { kind: "none" };
    }

    function toSingle(feature) {
      slots[0] = feature;
      slots[1] = null;
      focusedSlot = 0;
      return { kind: "single" };
    }

    function removeSlot(index) {
      if (index !== 0 && index !== 1) return getKindResult();
      if (!slots[index]) return getKindResult();

      if (isComparing()) {
        return toSingle(slots[1 - index]);
      }
      if (index === 0) return clear();
      return getKindResult();
    }

    function getKindResult() {
      if (isComparing()) return { kind: "compare" };
      if (slots[0]) return { kind: "single" };
      return { kind: "none" };
    }

    function select(feature) {
      var name = featureName(feature);
      if (name == null || name === "") {
        return { kind: "rejected" };
      }

      if (isComparing()) {
        var name0 = featureName(slots[0]);
        var name1 = featureName(slots[1]);
        if (name === name0) return removeSlot(0);
        if (name === name1) return removeSlot(1);
        if (!isComparable(feature)) return { kind: "rejected" };

        // Keep Slot0 (A); replace Slot1 (B) with the newly clicked neighborhood.
        slots[1] = feature;
        focusedSlot = 1;
        return { kind: "compare" };
      }

      if (slots[0]) {
        if (name === featureName(slots[0])) return clear();
        if (!isComparable(slots[0]) || !isComparable(feature)) {
          return { kind: "rejected" };
        }
        slots[1] = feature;
        focusedSlot = 1;
        return { kind: "compare" };
      }

      slots[0] = feature;
      slots[1] = null;
      focusedSlot = 0;
      return { kind: "single" };
    }

    return {
      getState: getState,
      select: select,
      removeSlot: removeSlot,
      clear: clear,
      isComparing: isComparing,
      getPrimaryFeature: getPrimaryFeature,
    };
  }

  window.Urban95NeighborhoodSelection = { create: create };
})();
