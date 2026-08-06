(function () {
  var palette = window.Urban95Palette;
  if (!palette) {
    throw new Error(
      "Urban95ControlSidebarFilters requires Urban95Palette (load js/core/palette.js first)"
    );
  }

  function requireObject(value, name) {
    if (!value || typeof value !== "object") {
      throw new Error("Urban95ControlSidebarFilters missing " + name);
    }
    return value;
  }

  function requireFunction(value, name) {
    if (typeof value !== "function") {
      throw new Error("Urban95ControlSidebarFilters missing " + name);
    }
    return value;
  }

  function asSet(value) {
    if (value instanceof Set) return new Set(value);
    if (Array.isArray(value)) return new Set(value);
    return new Set();
  }

  function create(deps) {
    var config = requireObject(deps || {}, "deps");
    var markup = requireObject(config.markup, "markup");
    var getEl = requireFunction(config.getEl, "getEl");
    var readState = requireFunction(config.readState, "readState");
    var getAmenityConfig = requireFunction(config.getAmenityConfig, "getAmenityConfig");
    var getTypesWithData = requireFunction(config.getTypesWithData, "getTypesWithData");
    var getAllTreesData = requireFunction(config.getAllTreesData, "getAllTreesData");
    var getAllStreetLightsData = requireFunction(
      config.getAllStreetLightsData,
      "getAllStreetLightsData"
    );
    var setSelectedAmenityTypes = requireFunction(
      config.setSelectedAmenityTypes,
      "setSelectedAmenityTypes"
    );
    var setAllFilterTypes = requireFunction(config.setAllFilterTypes, "setAllFilterTypes");
    var setLastFilterRadioSelection = requireFunction(
      config.setLastFilterRadioSelection,
      "setLastFilterRadioSelection"
    );
    var clearDerivedCaches = requireFunction(config.clearDerivedCaches, "clearDerivedCaches");
    var onFilterSelectionChanged = requireFunction(
      config.onFilterSelectionChanged,
      "onFilterSelectionChanged"
    );
    var onAfterFilterChanged = requireFunction(config.onAfterFilterChanged, "onAfterFilterChanged");
    var onEscape = requireFunction(config.onEscape, "onEscape");
    var isTouchDevice = !!config.isTouchDevice;
    var filterBackdrop = config.filterBackdrop || null;

    var popupJustOpened = false;
    var handledByTouch = false;

    function isExpandedBuildingFilterActive(state) {
      var current = state || readState();
      return current.scoreMode === "expanded" && current.currentMode === "house";
    }

    function closePopup() {
      var el = getEl();
      if (el.filterPopup) el.filterPopup.classList.remove("show");
      if (el.filterBtn) el.filterBtn.classList.remove("open");
      if (filterBackdrop) filterBackdrop.classList.remove("show");
    }

    function openPopup() {
      var state = readState();
      var el = getEl();
      if (!isExpandedBuildingFilterActive(state)) return;
      if (!el.filterPopup || !el.filterBtn) return;
      el.filterPopup.classList.add("show");
      el.filterBtn.classList.add("open");
      if (isTouchDevice && filterBackdrop) filterBackdrop.classList.add("show");
      popupJustOpened = true;
      setTimeout(function () {
        popupJustOpened = false;
      }, 100);
    }

    function togglePopup() {
      var el = getEl();
      if (!isExpandedBuildingFilterActive()) return;
      if (!el.filterPopup) return;
      if (el.filterPopup.classList.contains("show")) closePopup();
      else openPopup();
    }

    function syncUiForMode() {
      var state = readState();
      var el = getEl();
      var allowFiltering = isExpandedBuildingFilterActive(state);

      if (el.amenityFilterSection) {
        el.amenityFilterSection.style.display = allowFiltering ? "" : "none";
      }
      if (el.radiusSection) {
        el.radiusSection.style.display = state.scoreMode === "expanded" ? "" : "none";
      }
      if (el.modeHint && state.currentMode === "house") {
        el.modeHint.textContent = "Click map to analyze nearest building";
      }
      if (el.filterBtn) {
        el.filterBtn.disabled = !allowFiltering;
        el.filterBtn.setAttribute("aria-disabled", allowFiltering ? "false" : "true");
      }
      if (!allowFiltering) closePopup();
    }

    function updateLabel() {
      var state = readState();
      var el = getEl();
      if (!el.filterLabel) return;
      if (state.currentMode !== "house") {
        el.filterLabel.textContent = "All types (building view only)";
        return;
      }

      var allFilterTypes = state.allFilterTypes || [];
      var selectedAmenityTypes = asSet(state.selectedAmenityTypes);

      if (selectedAmenityTypes.size === 0 || selectedAmenityTypes.size === allFilterTypes.length) {
        el.filterLabel.textContent = "All types";
      } else if (selectedAmenityTypes.size === 1) {
        var type = Array.from(selectedAmenityTypes)[0];
        var configForType = getAmenityConfig(type);
        el.filterLabel.textContent = configForType && configForType.label ? configForType.label : type;
      } else {
        el.filterLabel.textContent = selectedAmenityTypes.size + " selected";
      }
    }

    function handleRadioChange(e) {
      var state = readState();
      if (!isExpandedBuildingFilterActive(state)) {
        closePopup();
        updateLabel();
        onAfterFilterChanged();
        return;
      }

      var input = e && e.target;
      if (!input) return;
      var value = input.value;
      var nextSelectedAmenityTypes = new Set();

      setLastFilterRadioSelection(value);
      if (value === "all") {
        (state.allFilterTypes || []).forEach(function (type) {
          nextSelectedAmenityTypes.add(type);
        });
      } else {
        nextSelectedAmenityTypes.add(value);
      }

      setSelectedAmenityTypes(nextSelectedAmenityTypes);
      clearDerivedCaches();
      onFilterSelectionChanged();
      updateLabel();
      onAfterFilterChanged();
    }

    function buildItems(types) {
      var el = getEl();
      if (!el.filterItems) return;

      var state = readState();
      var allFilterTypes = [];
      var treesData = getAllTreesData();
      var streetLightsData = getAllStreetLightsData();
      var typesWithData = getTypesWithData();
      var availableTypes = Array.isArray(types) ? types : [];

      el.filterItems.innerHTML = "";
      el.filterItems.classList.remove("filter-items--weighted");

      function appendItem(value, color, labelText) {
        var label = document.createElement("label");
        label.className = value === "all" ? "filter-item filter-item--all" : "filter-item";
        label.innerHTML = markup.buildFilterRowMarkup(value, color, labelText);
        label.querySelector("input").addEventListener("change", handleRadioChange);
        el.filterItems.appendChild(label);
      }

      appendItem("all", palette.gray, "All types");

      if (treesData && treesData.features && treesData.features.length > 0) {
        allFilterTypes.push("trees");
        var treesConfig = getAmenityConfig("trees");
        appendItem("trees", treesConfig.color || palette.gray, treesConfig.label || "Trees");
      }

      if (streetLightsData && streetLightsData.features && streetLightsData.features.length > 0) {
        allFilterTypes.push("street-lights");
        var lightsConfig = getAmenityConfig("street-lights");
        appendItem(
          "street-lights",
          lightsConfig.color || palette.gray,
          lightsConfig.label || "Street lights"
        );
      }

      availableTypes
        .filter(function (type) {
          return typeof typesWithData.has === "function" ? typesWithData.has(type) : false;
        })
        .forEach(function (type) {
          allFilterTypes.push(type);
          var itemConfig = getAmenityConfig(type);
          appendItem(type, itemConfig.color || palette.gray, itemConfig.label || type);
        });

      setAllFilterTypes(allFilterTypes);

      var lastFilterRadioSelection = state.lastFilterRadioSelection;
      var wantAll =
        !lastFilterRadioSelection ||
        lastFilterRadioSelection === "all" ||
        allFilterTypes.indexOf(lastFilterRadioSelection) === -1;

      if (state.currentMode === "house") {
        var nextSelectedAmenityTypes = new Set(allFilterTypes);
        if (!wantAll) nextSelectedAmenityTypes = new Set([lastFilterRadioSelection]);
        setSelectedAmenityTypes(nextSelectedAmenityTypes);
      }

      el.filterItems.querySelectorAll('input[name="amenity-filter-only"]').forEach(function (input) {
        input.checked = wantAll ? input.value === "all" : input.value === lastFilterRadioSelection;
      });

      syncUiForMode();
      updateLabel();
    }

    function bindFilterTrigger() {
      var el = getEl();
      if (!el.filterBtn || el.filterBtn.dataset.bound === "1") return;
      el.filterBtn.dataset.bound = "1";
      el.filterBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (handledByTouch) {
          handledByTouch = false;
          return;
        }
        togglePopup();
      });
      el.filterBtn.addEventListener("touchend", function (e) {
        e.preventDefault();
        e.stopPropagation();
        handledByTouch = true;
        togglePopup();
        setTimeout(function () {
          handledByTouch = false;
        }, 300);
      });
    }

    function bindPopupChrome() {
      var el = getEl();

      if (filterBackdrop && filterBackdrop.dataset.bound !== "1") {
        filterBackdrop.dataset.bound = "1";
        filterBackdrop.addEventListener("click", closePopup);
        filterBackdrop.addEventListener("touchstart", function (e) {
          e.preventDefault();
          closePopup();
        });
      }

      if (el.filterPopup && el.filterPopup.dataset.bound !== "1") {
        el.filterPopup.dataset.bound = "1";
        el.filterPopup.addEventListener("click", function (e) {
          e.stopPropagation();
        });
        el.filterPopup.addEventListener("touchstart", function (e) {
          e.stopPropagation();
        });
      }

      document.addEventListener("click", function (e) {
        var current = getEl();
        if (
          !popupJustOpened &&
          current.filterPopup &&
          current.filterBtn &&
          !current.filterPopup.contains(e.target) &&
          e.target !== current.filterBtn &&
          !current.filterBtn.contains(e.target)
        ) {
          closePopup();
        }
      });

      document.addEventListener("touchstart", function (e) {
        var current = getEl();
        if (
          !popupJustOpened &&
          current.filterPopup &&
          current.filterBtn &&
          !current.filterPopup.contains(e.target) &&
          e.target !== current.filterBtn &&
          !current.filterBtn.contains(e.target) &&
          e.target !== filterBackdrop
        ) {
          closePopup();
        }
      });

      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        closePopup();
        onEscape(e);
      });
    }

    function bind() {
      bindFilterTrigger();
      bindPopupChrome();
    }

    return {
      bind: bind,
      buildItems: buildItems,
      updateLabel: updateLabel,
      syncUiForMode: syncUiForMode,
      openPopup: openPopup,
      closePopup: closePopup,
      togglePopup: togglePopup,
    };
  }

  window.Urban95ControlSidebarFilters = {
    create: create,
  };
})();
