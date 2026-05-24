(function () {
  function requireObject(value, label) {
    if (!value || typeof value !== "object") {
      throw new Error("Urban95IconLoader requires " + label);
    }
    return value;
  }

  function requireFunction(value, label) {
    if (typeof value !== "function") {
      throw new Error("Urban95IconLoader requires " + label);
    }
    return value;
  }

  function iconNamesFromScoreModel(scoreModel) {
    var names = new Set();
    var amenityTypeConfig = requireObject(scoreModel.AMENITY_TYPE_CONFIG, "deps.scoreModel.AMENITY_TYPE_CONFIG");
    var defaultConfig = requireObject(scoreModel.DEFAULT_CONFIG, "deps.scoreModel.DEFAULT_CONFIG");

    Object.keys(amenityTypeConfig).forEach(function (key) {
      var config = amenityTypeConfig[key];
      if (config && typeof config.icon === "string" && config.icon) {
        names.add(config.icon);
      }
    });

    if (typeof defaultConfig.icon === "string" && defaultConfig.icon) {
      names.add(defaultConfig.icon);
    }

    return Array.from(names);
  }

  function create(deps) {
    deps = requireObject(deps || {}, "deps");

    var map = requireObject(deps.map, "deps.map");
    var iconsBase = deps.iconsBase;
    var scoreModel = requireObject(deps.scoreModel, "deps.scoreModel");
    var fetchImpl = requireFunction(deps.fetch, "deps.fetch");
    var ImageCtor = requireFunction(deps.Image, "deps.Image");
    var BlobCtor = deps.Blob;
    var urlApi = deps.URL;
    var logger = requireObject(deps.logger, "deps.logger");

    requireFunction(map.hasImage, "deps.map.hasImage");
    requireFunction(map.addImage, "deps.map.addImage");
    requireFunction(logger.warn, "deps.logger.warn");

    if (typeof iconsBase !== "string" || !iconsBase) {
      throw new Error("Urban95IconLoader requires deps.iconsBase");
    }

    var iconsLoaded = false;
    var hasBlobUrlSupport =
      typeof BlobCtor === "function" &&
      urlApi &&
      typeof urlApi.createObjectURL === "function" &&
      typeof urlApi.revokeObjectURL === "function";

    function warn(message) {
      logger.warn(message);
    }

    function addImageIfMissing(iconName, image) {
      if (!map.hasImage(iconName)) {
        map.addImage(iconName, image, { sdf: true });
      }
    }

    function loadDirectImage(iconName, imageUrl) {
      return new Promise(function (resolve) {
        var image = new ImageCtor();
        image.crossOrigin = "anonymous";
        image.onload = function () {
          addImageIfMissing(iconName, image);
          resolve();
        };
        image.onerror = function () {
          warn("Failed to load amenity icon " + iconName + " from " + imageUrl);
          resolve();
        };
        image.src = imageUrl;
      });
    }

    function loadFetchedIcon(iconName, imageUrl) {
      if (!hasBlobUrlSupport) {
        return Promise.reject(new Error("Blob URL support unavailable"));
      }
      return fetchImpl(imageUrl)
        .then(function (response) {
          if (!response || response.ok !== true || typeof response.text !== "function") {
            throw new Error("Invalid icon response");
          }
          return response.text();
        })
        .then(function (svgText) {
          return new Promise(function (resolve, reject) {
            var blob = new BlobCtor([svgText], { type: "image/svg+xml" });
            var objectUrl = urlApi.createObjectURL(blob);
            var image = new ImageCtor();
            image.onload = function () {
              addImageIfMissing(iconName, image);
              urlApi.revokeObjectURL(objectUrl);
              resolve();
            };
            image.onerror = function () {
              urlApi.revokeObjectURL(objectUrl);
              reject(new Error("Failed to decode icon image"));
            };
            image.src = objectUrl;
          });
        });
    }

    function loadIcon(iconName) {
      var imageUrl = iconsBase + "/" + encodeURIComponent(iconName) + ".svg";
      if (!hasBlobUrlSupport) {
        return loadDirectImage(iconName, imageUrl);
      }
      return loadFetchedIcon(iconName, imageUrl).catch(function () {
        return loadDirectImage(iconName, imageUrl);
      });
    }

    function loadAmenityIcons() {
      var iconNames = iconNamesFromScoreModel(scoreModel);
      return Promise.all(
        iconNames.map(function (iconName) {
          return loadIcon(iconName).catch(function (error) {
            warn("Failed to register amenity icon " + iconName + ": " + (error && error.message ? error.message : error));
          });
        })
      ).then(function () {
        iconsLoaded = true;
      });
    }

    function areIconsLoaded() {
      return iconsLoaded;
    }

    return {
      loadAmenityIcons: loadAmenityIcons,
      areIconsLoaded: areIconsLoaded,
    };
  }

  window.Urban95IconLoader = {
    create: create,
  };
})();
