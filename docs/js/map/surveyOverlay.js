(function () {
  var SOURCE_ID = "community-survey";
  var HOVER_CARD_CLASS = "survey-observation-tooltip";
  var CATEGORY_IDS = [
    "walkability_barrier",
    "crossing_hazard",
    "loved_place",
    "community_anchor",
  ];
  var MARKERS = {
    walkability_barrier: {
      imageId: "survey-marker-walkability-barrier",
      svg: function (color) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M16 3 29 16 16 29 3 16Z" fill="' + color + '" stroke="white" stroke-width="3"/></svg>';
      },
    },
    crossing_hazard: {
      imageId: "survey-marker-crossing-hazard",
      svg: function (color) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M16 3 30 28H2Z" fill="' + color + '" stroke="white" stroke-width="3" stroke-linejoin="round"/></svg>';
      },
    },
    loved_place: {
      imageId: "survey-marker-loved-place",
      svg: function (color) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M16 28S4 20.6 4 11.5C4 7.4 7.2 4 11.3 4c2.3 0 4.2 1 4.7 2.8C16.5 5 18.4 4 20.7 4 24.8 4 28 7.4 28 11.5 28 20.6 16 28 16 28Z" fill="' + color + '" stroke="white" stroke-width="3" stroke-linejoin="round"/></svg>';
      },
    },
    community_anchor: {
      imageId: "survey-marker-community-anchor",
      svg: function (color) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="' + color + '" stroke="white" stroke-width="3"/></svg>';
      },
    },
  };

  function layerId(categoryId) {
    return "community-survey-" + categoryId.replace(/_/g, "-");
  }

  function isFeatureCollection(payload) {
    return !!payload && payload.type === "FeatureCollection" && Array.isArray(payload.features);
  }

  function svgToImageData(svg) {
    return new Promise(function (resolve, reject) {
      if (typeof Image !== "function" || !document || !document.createElement) {
        reject(new Error("Browser image decoding is unavailable"));
        return;
      }
      var image = new Image();
      function copyDecodedImage() {
        try {
          var canvas = document.createElement("canvas");
          canvas.width = 32;
          canvas.height = 32;
          var context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas 2D context is unavailable");
          context.drawImage(image, 0, 0, 32, 32);
          resolve(context.getImageData(0, 0, 32, 32));
        } catch (err) {
          reject(err);
        }
      }
      image.onerror = function () {
        reject(new Error("Could not decode survey marker SVG"));
      };
      image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      if (typeof image.decode === "function") {
        image.decode().then(copyDecodedImage, reject);
        return;
      }
      image.onload = copyDecodedImage;
    });
  }

  function create(deps) {
    deps = deps || {};
    var map = deps.map;
    var maplibregl = deps.maplibregl;
    var tooltip = deps.tooltip;
    var surveyResultsUrl = deps.surveyResultsUrl;
    var categories = deps.categories || {};
    var fetchJson = deps.fetchJson;
    var getLayerVisibility = deps.getLayerVisibility;
    var onAvailabilityChanged =
      typeof deps.onAvailabilityChanged === "function" ? deps.onAvailabilityChanged : function () {};
    var loadPromise = null;
    var installedLayerIds = [];
    var addedSource = false;
    var addedImageIds = [];
    var addedLayerIds = [];
    var boundLayerEvents = [];
    var popup = null;
    var popupCategory = null;

    function categoryVisible(categoryId) {
      var visibility = typeof getLayerVisibility === "function" ? getLayerVisibility() || {} : {};
      var categoryKey = "survey:" + categoryId;
      return Object.prototype.hasOwnProperty.call(visibility, categoryKey)
        ? visibility[categoryKey] === true
        : false;
    }

    function cleanupHover() {
      if (!tooltip) return;
      tooltip.textContent = "";
      tooltip.style.display = "none";
      tooltip.dir = "";
      if (tooltip.classList) tooltip.classList.remove(HOVER_CARD_CLASS);
    }

    function hasValue(value) {
      return value !== null && value !== undefined && String(value).trim() !== "";
    }

    function safeCategoryColor(value) {
      return typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
        ? value
        : "";
    }

    function appendText(parent, className, value) {
      var element = document.createElement("div");
      element.className = className;
      element.dir = "auto";
      element.textContent = String(value);
      parent.appendChild(element);
      return element;
    }

    function observationCard(categoryId, properties) {
      var root = document.createElement("div");
      root.className = "survey-observation-card";
      var category = categories[categoryId] || {};
      var categoryColor = safeCategoryColor(category.color);
      if (categoryColor && root.style && typeof root.style.setProperty === "function") {
        root.style.setProperty("--survey-category-color", categoryColor);
      }
      var header = document.createElement("div");
      header.className = "survey-observation-card__header";
      var marker = document.createElement("span");
      marker.className = "survey-observation-card__marker";
      marker.textContent = category.shape === "heart" ? "♥" : "";
      header.appendChild(marker);
      appendText(header, "survey-observation-card__category", category.label || categoryId);
      root.appendChild(header);

      if (hasValue(properties.question)) {
        var question = document.createElement("div");
        question.className = "survey-observation-card__question";
        appendText(question, "survey-observation-card__eyebrow", "Question");
        appendText(question, "survey-observation-card__question-text", properties.question);
        root.appendChild(question);
      }

      if (hasValue(properties.comment)) {
        var observation = document.createElement("div");
        observation.className = "survey-observation-card__observation";
        appendText(observation, "survey-observation-card__eyebrow", "Observation");
        appendText(observation, "survey-observation-card__quote", properties.comment);
        root.appendChild(observation);
      }

      if (hasValue(properties.neighborhood)) {
        var neighborhood = document.createElement("div");
        neighborhood.className = "survey-observation-card__neighborhood";
        var pin = document.createElement("span");
        pin.className = "survey-observation-card__pin";
        pin.textContent = "⌖";
        neighborhood.appendChild(pin);
        appendText(neighborhood, "survey-observation-card__neighborhood-label", "Neighborhood");
        appendText(neighborhood, "survey-observation-card__neighborhood-value", properties.neighborhood);
        root.appendChild(neighborhood);
      }
      return root;
    }

    function showHover(event, categoryId) {
      if (!tooltip || !event || !event.features || !event.features[0] || !event.point) return;
      var card = observationCard(categoryId, event.features[0].properties || {});
      if (typeof tooltip.replaceChildren === "function") {
        tooltip.replaceChildren(card);
      } else {
        tooltip.textContent = "";
        if (typeof tooltip.appendChild === "function") tooltip.appendChild(card);
      }
      if (tooltip.classList) tooltip.classList.add(HOVER_CARD_CLASS);
      tooltip.style.display = "block";
      tooltip.style.left = event.point.x + 12 + "px";
      tooltip.style.top = event.point.y + 12 + "px";
      if (map && map.getCanvas) map.getCanvas().style.cursor = "pointer";
    }

    function closePopup() {
      if (popup && typeof popup.remove === "function") popup.remove();
      popup = null;
      popupCategory = null;
    }

    function rollbackInstallation() {
      closePopup();
      cleanupHover();
      boundLayerEvents
        .slice()
        .reverse()
        .forEach(function (binding) {
          if (typeof map.off !== "function") return;
          try {
            map.off(binding.eventName, binding.layerId, binding.handler);
          } catch (err) {
            console.error("Failed to remove community survey event handler:", err);
          }
        });
      addedLayerIds
        .slice()
        .reverse()
        .forEach(function (currentLayerId) {
          if (typeof map.removeLayer !== "function") return;
          try {
            if (!map.getLayer || map.getLayer(currentLayerId)) map.removeLayer(currentLayerId);
          } catch (err) {
            console.error("Failed to remove community survey layer:", err);
          }
        });
      if (addedSource && typeof map.removeSource === "function") {
        try {
          if (!map.getSource || map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        } catch (err) {
          console.error("Failed to remove community survey source:", err);
        }
      }
      addedImageIds
        .slice()
        .reverse()
        .forEach(function (imageId) {
          if (typeof map.removeImage !== "function") return;
          try {
            if (!map.hasImage || map.hasImage(imageId)) map.removeImage(imageId);
          } catch (err) {
            console.error("Failed to remove community survey marker:", err);
          }
        });
      installedLayerIds = [];
      addedSource = false;
      addedImageIds = [];
      addedLayerIds = [];
      boundLayerEvents = [];
    }

    function showPopup(event, categoryId) {
      if (!maplibregl || typeof maplibregl.Popup !== "function" || !event || !event.features || !event.features[0]) {
        return;
      }
      var feature = event.features[0];
      var coordinates = event.lngLat || (feature.geometry && feature.geometry.coordinates);
      if (!coordinates) return;
      closePopup();
      popupCategory = categoryId;
      popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        className: "survey-observation-popup",
        maxWidth: "none",
      })
        .setLngLat(coordinates)
        .setDOMContent(observationCard(categoryId, feature.properties || {}))
        .addTo(map);
      if (popup && typeof popup.on === "function") {
        popup.on("close", function () {
          popup = null;
          popupCategory = null;
        });
      }
    }

    function bindLayerEvents(categoryId, currentLayerId) {
      function bind(eventName, handler) {
        map.on(eventName, currentLayerId, handler);
        boundLayerEvents.push({ eventName: eventName, layerId: currentLayerId, handler: handler });
      }
      bind("mouseenter", function () {
        if (map.getCanvas) map.getCanvas().style.cursor = "pointer";
      });
      bind("mousemove", function (event) {
        showHover(event, categoryId);
      });
      bind("mouseleave", function () {
        if (map.getCanvas) map.getCanvas().style.cursor = "";
        cleanupHover();
      });
      bind("click", function (event) {
        if (event && event.originalEvent && typeof event.originalEvent.stopPropagation === "function") {
          event.originalEvent.stopPropagation();
        }
        showPopup(event, categoryId);
      });
    }

    function install(payload, imageDataByCategory) {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, { type: "geojson", data: payload });
        addedSource = true;
      }
      CATEGORY_IDS.forEach(function (categoryId) {
        var marker = MARKERS[categoryId];
        if (!map.hasImage || !map.hasImage(marker.imageId)) {
          map.addImage(marker.imageId, imageDataByCategory[categoryId]);
          addedImageIds.push(marker.imageId);
        }
      });
      CATEGORY_IDS.forEach(function (categoryId) {
        var currentLayerId = layerId(categoryId);
        if (map.getLayer && map.getLayer(currentLayerId)) {
          installedLayerIds.push(currentLayerId);
          return;
        }
        var beforeLayerId = map.getLayer && map.getLayer("selected-building-outline")
          ? "selected-building-outline"
          : undefined;
        map.addLayer(
          {
            id: currentLayerId,
            type: "symbol",
            source: SOURCE_ID,
            filter: ["==", ["get", "survey_category"], categoryId],
            layout: {
              "icon-image": MARKERS[categoryId].imageId,
              "icon-size": 0.8,
              "icon-allow-overlap": true,
              visibility: "none",
            },
          },
          beforeLayerId
        );
        installedLayerIds.push(currentLayerId);
        addedLayerIds.push(currentLayerId);
        bindLayerEvents(categoryId, currentLayerId);
      });
      syncVisibility();
    }

    function load() {
      if (loadPromise) return loadPromise;
      loadPromise = Promise.resolve()
        .then(function () {
          return fetchJson(surveyResultsUrl);
        })
        .then(function (payload) {
          if (!isFeatureCollection(payload)) throw new Error("Survey payload is not a FeatureCollection");
          return Promise.all(
            CATEGORY_IDS.map(function (categoryId) {
              var marker = MARKERS[categoryId];
              var category = categories[categoryId] || {};
              return svgToImageData(marker.svg(category.color || "#6b7280")).then(function (imageData) {
                return { categoryId: categoryId, imageData: imageData };
              });
            })
          ).then(function (images) {
            var imageDataByCategory = {};
            images.forEach(function (entry) {
              imageDataByCategory[entry.categoryId] = entry.imageData;
            });
            install(payload, imageDataByCategory);
            onAvailabilityChanged(true);
            return true;
          });
        })
        .catch(function (err) {
          rollbackInstallation();
          console.error("Failed to load community survey layer:", err);
          onAvailabilityChanged(false);
          return false;
        });
      return loadPromise;
    }

    function syncVisibility() {
      installedLayerIds.forEach(function (currentLayerId) {
        var categoryId = CATEGORY_IDS.find(function (id) {
          return layerId(id) === currentLayerId;
        });
        if (map.getLayer && !map.getLayer(currentLayerId)) return;
        if (map.setLayoutProperty) {
          map.setLayoutProperty(
            currentLayerId,
            "visibility",
            categoryVisible(categoryId) ? "visible" : "none"
          );
        }
      });
      if (popup && (!categoryVisible(popupCategory))) closePopup();
    }

    function isSurveyClick(event) {
      if (!event || !event.point || !map || typeof map.queryRenderedFeatures !== "function") return false;
      var visibleLayerIds = installedLayerIds.filter(function (currentLayerId) {
        var categoryId = CATEGORY_IDS.find(function (id) {
          return layerId(id) === currentLayerId;
        });
        return categoryVisible(categoryId) && (!map.getLayer || map.getLayer(currentLayerId));
      });
      if (!visibleLayerIds.length) return false;
      return map.queryRenderedFeatures(event.point, { layers: visibleLayerIds }).length > 0;
    }

    function getBeforeLayerId() {
      return installedLayerIds.find(function (currentLayerId) {
        return !map.getLayer || map.getLayer(currentLayerId);
      });
    }

    return {
      load: load,
      syncVisibility: syncVisibility,
      isSurveyClick: isSurveyClick,
      getBeforeLayerId: getBeforeLayerId,
      closePopup: closePopup,
    };
  }

  window.Urban95SurveyOverlay = {
    create: create,
  };
})();
