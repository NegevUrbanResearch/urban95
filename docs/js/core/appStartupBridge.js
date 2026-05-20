(function () {
  function bindStartup(options) {
    var opts = options || {};
    opts.map.on("load", function () {
      opts.startup.run({
        logger: opts.logger,
        state: {
          buildings: {
            setData: opts.setBuildingsData,
            setCentroids: opts.setBuildingCentroids,
          },
          amenities: {
            setCleanData: opts.setCleanAmenitiesData,
            setCleanTypes: opts.setCleanAmenityTypes,
            setLegacyData: opts.setLegacyAmenitiesData,
            setLegacyTypes: opts.setLegacyAmenityTypes,
            clearLegacyData: opts.clearLegacyAmenityData,
          },
        },
        runtime: opts.runtime,
        loading: {
          setStatus: opts.loadingUi.setStatus,
          markMapReady: function () { opts.loadingUi.mark("mapReady"); },
          markIconsLoaded: function () { opts.loadingUi.mark("icons"); },
          markBuildingsLoaded: function () { opts.loadingUi.mark("buildings"); },
          markParksLoaded: function () { opts.loadingUi.mark("parks"); },
          markAmenitiesLoaded: function () { opts.loadingUi.mark("amenities"); },
          markTreesDeferred: function () { opts.loadingUi.mark("trees"); },
          markIsochronesDeferred: function () { opts.loadingUi.mark("isochrones"); },
        },
        callbacks: opts.callbacks,
        renderers: opts.renderers,
        selection: opts.selection,
        urls: opts.urls,
      }).catch(function (error) {
        opts.logger.error("Failed to start app:", error);
      });
    });
  }

  window.Urban95AppStartupBridge = {
    bindStartup: bindStartup,
  };
})();
