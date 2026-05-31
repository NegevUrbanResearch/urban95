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

  function asSet(value) {
    if (value instanceof Set) return new Set(value);
    if (Array.isArray(value)) return new Set(value);
    return new Set();
  }

  function bind(deps) {
    var config = requireObject(deps, "deps");
    var elements = requireObject(config.elements, "elements");
    var scoreModel = requireObject(config.scoreModel, "scoreModel");
    var getState = requireFunction(config.getState, "getState");
    var setScoreMode = requireFunction(config.setScoreMode, "setScoreMode");
    var setWalkMinutes = requireFunction(config.setWalkMinutes, "setWalkMinutes");
    var setSelectedAmenityTypes = requireFunction(
      config.setSelectedAmenityTypes,
      "setSelectedAmenityTypes"
    );
    var setAllFilterTypes = requireFunction(config.setAllFilterTypes, "setAllFilterTypes");
    var setLastFilterRadioSelection = requireFunction(
      config.setLastFilterRadioSelection,
      "setLastFilterRadioSelection"
    );
    var getTypesWithData = requireFunction(config.getTypesWithData, "getTypesWithData");
    var getAllTreesData = requireFunction(config.getAllTreesData, "getAllTreesData");
    var getAllStreetLightsData = requireFunction(
      config.getAllStreetLightsData,
      "getAllStreetLightsData"
    );
    var callbacks = requireObject(config.callbacks, "callbacks");
    var onFilterSelectionChanged = requireFunction(
      callbacks.onFilterSelectionChanged,
      "callbacks.onFilterSelectionChanged"
    );
    var onScoreModeChanged = requireFunction(
      callbacks.onScoreModeChanged,
      "callbacks.onScoreModeChanged"
    );
    var onWalkMinutesChanged = requireFunction(
      callbacks.onWalkMinutesChanged,
      "callbacks.onWalkMinutesChanged"
    );
    var onModeToggleRequested = requireFunction(
      callbacks.onModeToggleRequested,
      "callbacks.onModeToggleRequested"
    );
    var onPointVisibilityChanged = requireFunction(
      callbacks.onPointVisibilityChanged,
      "callbacks.onPointVisibilityChanged"
    );
    var onHeatmapVisibilityChanged = requireFunction(
      callbacks.onHeatmapVisibilityChanged,
      "callbacks.onHeatmapVisibilityChanged"
    );
    var onEscape = requireFunction(callbacks.onEscape, "callbacks.onEscape");
    var clearDerivedCaches = requireFunction(
      callbacks.clearDerivedCaches,
      "callbacks.clearDerivedCaches"
    );

    var popupJustOpened = false;
    var layersPopupJustOpened = false;
    var handledByTouch = false;
    var layersHandledByTouch = false;
    var AMENITY_TYPE_CONFIG = scoreModel.AMENITY_TYPE_CONFIG || {};
    var DEFAULT_CONFIG = scoreModel.DEFAULT_CONFIG || { color: "#6b7280" };
    var WEIGHTED_CATEGORY_COMPONENTS = scoreModel.WEIGHTED_CATEGORY_COMPONENTS || [];
    var WEIGHTED_CATEGORY_BY_STEM = scoreModel.WEIGHTED_CATEGORY_BY_STEM || {};
    var getAmenityConfig =
      typeof scoreModel.getAmenityConfig === "function"
        ? scoreModel.getAmenityConfig
        : function (type) {
            return AMENITY_TYPE_CONFIG[type] || DEFAULT_CONFIG;
          };

    function readState() {
      return getState() || {};
    }

    function getScoreModeLabel(mode) {
      var resolvedMode = mode || readState().scoreMode;
      if (resolvedMode === "weighted") return "Urban95";
      return "Amenities Focus";
    }

    function forceAllAmenityTypesSelected() {
      var state = readState();
      var nextSelection = new Set(state.allFilterTypes || []);
      setSelectedAmenityTypes(nextSelection);
      return nextSelection;
    }

    function syncFilterUiForScoreMode() {
      var state = readState();
      var isUrban95 = state.scoreMode === "weighted";
      var allowFiltering = isUrban95 || state.currentMode === "house";
      if (elements.amenityFilterSection) {
        elements.amenityFilterSection.style.display = allowFiltering ? "" : "none";
      }
      if (elements.radiusSection) {
        elements.radiusSection.style.display = isUrban95 ? "none" : "";
      }
      if (elements.modeHint && state.currentMode === "house") {
        elements.modeHint.textContent = isUrban95
          ? "Click map to analyze nearest building; Urban95 shows a fixed 300 m reference radius"
          : "Click map to analyze nearest building";
      }
      if (elements.filterBtn) {
        elements.filterBtn.disabled = !allowFiltering;
        elements.filterBtn.setAttribute("aria-disabled", allowFiltering ? "false" : "true");
      }
      if (!allowFiltering) {
        closeFilterPopup();
        forceAllAmenityTypesSelected();
      }
      if (state.currentMode !== "house") {
        closeLayersPopup();
      }
    }

    function updateShowPointsToggleLabel() {
      var state = readState();
      if (elements.urban95PointToggles) {
        elements.urban95PointToggles.style.display = state.currentMode === "house" ? "" : "none";
      }
      if (elements.schoolPointsToggleWrap) {
        elements.schoolPointsToggleWrap.style.display = state.scoreMode === "weighted" ? "" : "none";
      }
      if (elements.amenityPointsToggleWrap) {
        elements.amenityPointsToggleWrap.style.display = state.scoreMode === "expanded" ? "" : "none";
      }
      updateLayersButtonMeta();
    }

    function getLayerToggleInputs() {
      if (!elements.pointsVisibilitySection) return [];
      return Array.from(
        elements.pointsVisibilitySection.querySelectorAll('input[type="checkbox"]')
      );
    }

    function isLayerToggleVisible(input) {
      if (!input || !input.isConnected) return false;
      if (elements.pointsVisibilitySection && elements.pointsVisibilitySection.style.display === "none") {
        return false;
      }
      var togglesContainer = input.closest("#urban95-point-toggles");
      if (togglesContainer && togglesContainer.style.display === "none") {
        return false;
      }
      var host = input.closest(".toggle") || input;
      if (host.style && host.style.display === "none") {
        return false;
      }
      return true;
    }

    function countVisibleLayerOptions() {
      return getLayerToggleInputs().filter(isLayerToggleVisible).length;
    }

    function countEnabledLayerOptions() {
      return getLayerToggleInputs().filter(function (input) {
        return isLayerToggleVisible(input) && input.checked;
      }).length;
    }

    function updateLayersButtonMeta() {
      if (!elements.layersBtnMeta) return;
      var visibleCount = countVisibleLayerOptions();
      var enabledCount = countEnabledLayerOptions();
      elements.layersBtnMeta.textContent = enabledCount + " of " + visibleCount + " enabled";
    }

    function openLayersPopup() {
      if (!elements.layersPopup || !elements.layersBtn) return;
      elements.layersPopup.classList.add("show");
      elements.layersBtn.classList.add("open");
      elements.layersBtn.setAttribute("aria-expanded", "true");
      if (config.isTouchDevice && elements.layersBackdrop) {
        elements.layersBackdrop.classList.add("show");
      }
      layersPopupJustOpened = true;
      setTimeout(function () {
        layersPopupJustOpened = false;
      }, 100);
    }

    function closeLayersPopup() {
      if (elements.layersPopup) {
        elements.layersPopup.classList.remove("show");
      }
      if (elements.layersBtn) {
        elements.layersBtn.classList.remove("open");
        elements.layersBtn.setAttribute("aria-expanded", "false");
      }
      if (elements.layersBackdrop) {
        elements.layersBackdrop.classList.remove("show");
      }
    }

    function toggleLayersPopup() {
      if (!elements.layersPopup) return;
      if (elements.layersPopup.classList.contains("show")) {
        closeLayersPopup();
      } else {
        openLayersPopup();
      }
    }

    function setAllLayerToggles(nextChecked) {
      getLayerToggleInputs().forEach(function (input) {
        if (!isLayerToggleVisible(input)) return;
        if (input.disabled) return;
        if (input.checked === nextChecked) return;
        input.checked = nextChecked;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      updateLayersButtonMeta();
    }

    function describeTypeMix(typeCounts) {
      return Object.entries(typeCounts || {})
        .sort(function (a, b) {
          return b[1] - a[1];
        })
        .map(function (entry) {
          return entry[0] + ":" + entry[1];
        })
        .join("|");
    }

    function updateFilterLabel() {
      var state = readState();
      if (!elements.filterLabel) return;
      if (state.currentMode !== "house" && state.scoreMode !== "weighted") {
        elements.filterLabel.textContent = "All types (building view only)";
        return;
      }

      var allFilterTypes = state.allFilterTypes || [];
      var selectedAmenityTypes = asSet(state.selectedAmenityTypes);
      var total = allFilterTypes.length;
      var selected = selectedAmenityTypes.size;

      if (state.scoreMode === "weighted") {
        if (selected === 0 || selected === total) {
          elements.filterLabel.textContent = "All categories";
        } else if (selected === 1) {
          var stem = Array.from(selectedAmenityTypes)[0];
          var weightedConfig = WEIGHTED_CATEGORY_BY_STEM[stem];
          elements.filterLabel.textContent = weightedConfig ? weightedConfig.label : stem;
        } else {
          elements.filterLabel.textContent = selected + " selected";
        }
        return;
      }

      if (selected === 0 || selected === total) {
        elements.filterLabel.textContent = "All types";
      } else if (selected === 1) {
        var type = Array.from(selectedAmenityTypes)[0];
        var configForType = AMENITY_TYPE_CONFIG[type];
        elements.filterLabel.textContent = configForType ? configForType.label : type;
      } else {
        elements.filterLabel.textContent = selected + " selected";
      }
    }

    function handleFilterRadioChange(e) {
      var state = readState();
      if (state.scoreMode !== "weighted" && state.currentMode !== "house") {
        forceAllAmenityTypesSelected();
        updateFilterLabel();
        return;
      }
      var input = e && e.target;
      if (!input) return;
      var value = input.value;
      setLastFilterRadioSelection(value);

      var nextSelectedAmenityTypes = new Set();
      if (value === "all") {
        (state.allFilterTypes || []).forEach(function (type) {
          nextSelectedAmenityTypes.add(type);
        });
      } else {
        nextSelectedAmenityTypes.add(value);
      }

      setSelectedAmenityTypes(nextSelectedAmenityTypes);
      updateFilterLabel();
      clearDerivedCaches();
      onFilterSelectionChanged();
    }

    function colorWithAlpha(hexColor, alpha) {
      if (typeof hexColor !== "string" || !hexColor.startsWith("#")) {
        return "rgba(107, 114, 128, " + alpha + ")";
      }

      var hex = hexColor.slice(1);
      if (hex.length === 3) {
        hex = hex
          .split("")
          .map(function (ch) {
            return ch + ch;
          })
          .join("");
      }
      if (hex.length !== 6) {
        return "rgba(107, 114, 128, " + alpha + ")";
      }

      var value = parseInt(hex, 16);
      var r = (value >> 16) & 255;
      var g = (value >> 8) & 255;
      var b = value & 255;
      return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
    }

    function buildFilterRowMarkup(value, color, label) {
      var pillStyle =
        "--pill-color:" +
        color +
        ";" +
        "--pill-bg:" +
        colorWithAlpha(color, 0.14) +
        ";" +
        "--pill-border:" +
        colorWithAlpha(color, 0.35) +
        ";" +
        "--row-accent:" +
        color +
        ";" +
        "--row-accent-soft:" +
        colorWithAlpha(color, 0.1) +
        ";" +
        "--row-accent-strong:" +
        colorWithAlpha(color, 0.45) +
        ";";
      return (
        '<input type="radio" name="amenity-filter-only" value="' +
        value +
        '" />' +
        '<span class="filter-type-pill" style="' +
        pillStyle +
        '">' +
        label +
        "</span>"
      );
    }

    function buildFilterItems(types) {
      if (!elements.filterItems) return;
      var state = readState();
      var allFilterTypes = [];
      var treesData = getAllTreesData();
      var streetLightsData = getAllStreetLightsData();
      var typesWithData = getTypesWithData();
      var availableTypes = Array.isArray(types) ? types : [];

      elements.filterItems.innerHTML = "";
      elements.filterItems.classList.toggle(
        "filter-items--weighted",
        state.scoreMode === "weighted"
      );

      var neutral = "#6b7280";
      var allRow = document.createElement("label");
      allRow.className = "filter-item filter-item--all";
      allRow.innerHTML = buildFilterRowMarkup(
        "all",
        neutral,
        state.scoreMode === "weighted" ? "All categories" : "All types"
      );
      allRow.querySelector("input").addEventListener("change", handleFilterRadioChange);
      elements.filterItems.appendChild(allRow);

      if (state.scoreMode === "weighted") {
        WEIGHTED_CATEGORY_COMPONENTS.forEach(function (comp) {
          allFilterTypes.push(comp.stem);
          var label = document.createElement("label");
          label.className = "filter-item";
          label.innerHTML = buildFilterRowMarkup(comp.stem, comp.color, comp.label);
          label.querySelector("input").addEventListener("change", handleFilterRadioChange);
          elements.filterItems.appendChild(label);
        });
      } else {
        if (treesData && treesData.features && treesData.features.length > 0) {
          allFilterTypes.push("trees");
        }

        if (streetLightsData && streetLightsData.features && streetLightsData.features.length > 0) {
          allFilterTypes.push("street-lights");
        }

        var typesWithPoints = availableTypes.filter(function (type) {
          return typeof typesWithData.has === "function" ? typesWithData.has(type) : false;
        });
        typesWithPoints.forEach(function (type) {
          allFilterTypes.push(type);
        });

        if (treesData && treesData.features && treesData.features.length > 0) {
          var treesConfig = AMENITY_TYPE_CONFIG.trees || DEFAULT_CONFIG;
          var treesColor = treesConfig.color || DEFAULT_CONFIG.color;
          var treesLabel = document.createElement("label");
          treesLabel.className = "filter-item";
          treesLabel.innerHTML = buildFilterRowMarkup("trees", treesColor, treesConfig.label);
          treesLabel.querySelector("input").addEventListener("change", handleFilterRadioChange);
          elements.filterItems.appendChild(treesLabel);
        }

        if (streetLightsData && streetLightsData.features && streetLightsData.features.length > 0) {
          var streetLightConfig = AMENITY_TYPE_CONFIG["street-lights"] || DEFAULT_CONFIG;
          var streetLightColor = streetLightConfig.color || DEFAULT_CONFIG.color;
          var streetLightLabel = document.createElement("label");
          streetLightLabel.className = "filter-item";
          streetLightLabel.innerHTML = buildFilterRowMarkup(
            "street-lights",
            streetLightColor,
            streetLightConfig.label
          );
          streetLightLabel
            .querySelector("input")
            .addEventListener("change", handleFilterRadioChange);
          elements.filterItems.appendChild(streetLightLabel);
        }

        typesWithPoints.forEach(function (type) {
          var itemConfig = getAmenityConfig(type);
          var label = document.createElement("label");
          label.className = "filter-item";
          var color = itemConfig.color || DEFAULT_CONFIG.color;
          label.innerHTML = buildFilterRowMarkup(type, color, itemConfig.label);
          label.querySelector("input").addEventListener("change", handleFilterRadioChange);
          elements.filterItems.appendChild(label);
        });
      }

      setAllFilterTypes(allFilterTypes);

      var lastFilterRadioSelection = state.lastFilterRadioSelection;
      var wantAll =
        !lastFilterRadioSelection ||
        lastFilterRadioSelection === "all" ||
        allFilterTypes.indexOf(lastFilterRadioSelection) === -1;

      var nextSelectedAmenityTypes = new Set(allFilterTypes);
      if (!wantAll) {
        nextSelectedAmenityTypes = new Set([lastFilterRadioSelection]);
      }
      setSelectedAmenityTypes(nextSelectedAmenityTypes);

      elements.filterItems
        .querySelectorAll('input[name="amenity-filter-only"]')
        .forEach(function (input) {
          input.checked = wantAll ? input.value === "all" : input.value === lastFilterRadioSelection;
        });

      syncFilterUiForScoreMode();
      updateFilterLabel();
      clearDerivedCaches();
    }

    function openFilterPopup() {
      var state = readState();
      if (state.scoreMode !== "weighted" && state.currentMode !== "house") return;
      if (!elements.filterPopup || !elements.filterBtn) return;
      elements.filterPopup.classList.add("show");
      elements.filterBtn.classList.add("open");
      if (config.isTouchDevice && elements.filterBackdrop) {
        elements.filterBackdrop.classList.add("show");
      }
      popupJustOpened = true;
      setTimeout(function () {
        popupJustOpened = false;
      }, 100);
    }

    function closeFilterPopup() {
      if (elements.filterPopup) {
        elements.filterPopup.classList.remove("show");
      }
      if (elements.filterBtn) {
        elements.filterBtn.classList.remove("open");
      }
      if (elements.filterBackdrop) {
        elements.filterBackdrop.classList.remove("show");
      }
    }

    function toggleFilterPopup() {
      var state = readState();
      if (state.scoreMode !== "weighted" && state.currentMode !== "house") return;
      if (!elements.filterPopup) return;
      if (elements.filterPopup.classList.contains("show")) {
        closeFilterPopup();
      } else {
        openFilterPopup();
      }
    }

    if (elements.filterBtn) {
      elements.filterBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (handledByTouch) {
          handledByTouch = false;
          return;
        }
        toggleFilterPopup();
      });

      elements.filterBtn.addEventListener("touchend", function (e) {
        e.preventDefault();
        e.stopPropagation();
        handledByTouch = true;
        toggleFilterPopup();
        setTimeout(function () {
          handledByTouch = false;
        }, 300);
      });
    }

    if (elements.filterBackdrop) {
      elements.filterBackdrop.addEventListener("click", closeFilterPopup);
      elements.filterBackdrop.addEventListener("touchstart", function (e) {
        e.preventDefault();
        closeFilterPopup();
      });
    }

    if (elements.layersBackdrop) {
      elements.layersBackdrop.addEventListener("click", closeLayersPopup);
      elements.layersBackdrop.addEventListener("touchstart", function (e) {
        e.preventDefault();
        closeLayersPopup();
      });
    }

    if (elements.layersBtn) {
      elements.layersBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (layersHandledByTouch) {
          layersHandledByTouch = false;
          return;
        }
        toggleLayersPopup();
      });

      elements.layersBtn.addEventListener("touchend", function (e) {
        e.preventDefault();
        e.stopPropagation();
        layersHandledByTouch = true;
        toggleLayersPopup();
        setTimeout(function () {
          layersHandledByTouch = false;
        }, 300);
      });
    }

    if (elements.layersPopup) {
      elements.layersPopup.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      elements.layersPopup.addEventListener("touchstart", function (e) {
        e.stopPropagation();
      });
    }

    if (elements.layersSelectAllBtn) {
      elements.layersSelectAllBtn.addEventListener("click", function () {
        setAllLayerToggles(true);
      });
    }

    if (elements.layersDeselectAllBtn) {
      elements.layersDeselectAllBtn.addEventListener("click", function () {
        setAllLayerToggles(false);
      });
    }

    document.addEventListener("click", function (e) {
      if (
        !popupJustOpened &&
        elements.filterPopup &&
        elements.filterBtn &&
        !elements.filterPopup.contains(e.target) &&
        e.target !== elements.filterBtn &&
        !elements.filterBtn.contains(e.target)
      ) {
        closeFilterPopup();
      }
      if (
        !layersPopupJustOpened &&
        elements.layersPopup &&
        elements.layersBtn &&
        !elements.layersPopup.contains(e.target) &&
        e.target !== elements.layersBtn &&
        !elements.layersBtn.contains(e.target)
      ) {
        closeLayersPopup();
      }
    });

    document.addEventListener("touchstart", function (e) {
      if (
        !popupJustOpened &&
        elements.filterPopup &&
        elements.filterBtn &&
        !elements.filterPopup.contains(e.target) &&
        e.target !== elements.filterBtn &&
        !elements.filterBtn.contains(e.target) &&
        e.target !== elements.filterBackdrop
      ) {
        closeFilterPopup();
      }
      if (
        !layersPopupJustOpened &&
        elements.layersPopup &&
        elements.layersBtn &&
        !elements.layersPopup.contains(e.target) &&
        e.target !== elements.layersBtn &&
        !elements.layersBtn.contains(e.target) &&
        e.target !== elements.layersBackdrop
      ) {
        closeLayersPopup();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      closeFilterPopup();
      closeLayersPopup();
      onEscape(e);
    });

    if (elements.showTreesToggle) {
      elements.showTreesToggle.addEventListener("change", function () {
        onPointVisibilityChanged();
        updateLayersButtonMeta();
      });
    }

    if (elements.showLightsToggle) {
      elements.showLightsToggle.addEventListener("change", function () {
        onPointVisibilityChanged();
        updateLayersButtonMeta();
      });
    }

    if (elements.showAmenityPointsToggle) {
      elements.showAmenityPointsToggle.addEventListener("change", function () {
        onPointVisibilityChanged();
        updateLayersButtonMeta();
      });
    }

    if (elements.showSchoolsToggle) {
      elements.showSchoolsToggle.addEventListener("change", function () {
        onPointVisibilityChanged();
        updateLayersButtonMeta();
      });
    }

    if (elements.showHeatmapToggle) {
      elements.showHeatmapToggle.addEventListener("change", function () {
        onHeatmapVisibilityChanged(!!this.checked);
        updateLayersButtonMeta();
      });
    }

    if (elements.showKidsPopulationToggle) {
      elements.showKidsPopulationToggle.addEventListener("change", function () {
        updateLayersButtonMeta();
      });
    }

    if (elements.showRoadsToggle) {
      elements.showRoadsToggle.addEventListener("change", function () {
        updateLayersButtonMeta();
      });
    }

    if (elements.pointsVisibilitySection) {
      elements.pointsVisibilitySection.addEventListener("change", function (e) {
        if (e && e.target && e.target.matches('input[type="checkbox"]')) {
          updateLayersButtonMeta();
        }
      });
    }

    if (elements.filterPopup) {
      elements.filterPopup.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      elements.filterPopup.addEventListener("touchstart", function (e) {
        e.stopPropagation();
      });
    }

    if (elements.scoreModelToggle) {
      elements.scoreModelToggle.addEventListener("change", function (e) {
        var input = e && e.target;
        if (!input || input.name !== "score-model") return;
        var nextScoreMode =
          input.value === "expanded" || input.value === "weighted" ? input.value : "weighted";
        setScoreMode(nextScoreMode);
        clearDerivedCaches();
        onScoreModeChanged(nextScoreMode);
      });
    }

    if (elements.radiusToggle) {
      elements.radiusToggle.addEventListener("click", function (e) {
        var btn = e.target.closest(".radius-opt");
        if (!btn) return;
        var minutes = parseInt(btn.dataset.minutes, 10);
        if (!Number.isFinite(minutes)) return;

        setWalkMinutes(minutes);
        elements.radiusToggle.querySelectorAll(".radius-opt").forEach(function (item) {
          item.classList.remove("active");
        });
        btn.classList.add("active");
        onWalkMinutesChanged(minutes);
      });
    }

    if (elements.modeToggle) {
      elements.modeToggle.addEventListener("click", function (e) {
        var btn = e.target.closest(".mode-opt");
        if (!btn) return;
        onModeToggleRequested(btn.dataset.mode);
      });
    }

    syncFilterUiForScoreMode();
    updateFilterLabel();
    updateShowPointsToggleLabel();
    updateLayersButtonMeta();

    return {
      getScoreModeLabel: getScoreModeLabel,
      updateFilterLabel: updateFilterLabel,
      buildFilterItems: buildFilterItems,
      closeFilterPopup: closeFilterPopup,
      syncFilterUiForScoreMode: syncFilterUiForScoreMode,
      updateShowPointsToggleLabel: updateShowPointsToggleLabel,
      describeTypeMix: describeTypeMix,
    };
  }

  window.Urban95Controls = {
    bind: bind,
  };
})();
