(function () {
  function requireDependency(deps, key) {
    if (!deps || !deps[key]) {
      throw new Error("Urban95InfoModal.bind missing required dependency: " + key);
    }
    return deps[key];
  }

  function getPanelById(tabContents, panelId) {
    var match = null;
    Array.prototype.forEach.call(tabContents, function (panel) {
      if (!match && panel && panel.id === panelId) {
        match = panel;
      }
    });
    return match;
  }

  function bind(deps) {
    var infoModal = requireDependency(deps, "infoModal");
    var infoBtn = requireDependency(deps, "infoBtn");
    var modalClose = requireDependency(deps, "modalClose");
    var modalStart = requireDependency(deps, "modalStart");
    var modalTabs = requireDependency(deps, "modalTabs");
    var tabContents = requireDependency(deps, "tabContents");
    var modalScroll = infoModal ? infoModal.querySelector(".modal-scroll") : null;

    function showModal() {
      infoModal.classList.add("show");
    }

    function hideModal() {
      infoModal.classList.remove("show");
      localStorage.setItem("urban95-modal-seen", "true");
    }

    infoBtn.addEventListener("click", showModal);
    modalClose.addEventListener("click", hideModal);
    modalStart.addEventListener("click", hideModal);

    infoModal.addEventListener("click", function (event) {
      if (event.target === infoModal) {
        hideModal();
      }
    });

    Array.prototype.forEach.call(modalTabs, function (tab) {
      tab.addEventListener("click", function () {
        var targetTab = this.dataset.tab;

        Array.prototype.forEach.call(modalTabs, function (item) {
          item.classList.remove("active");
          item.setAttribute("aria-selected", "false");
        });
        Array.prototype.forEach.call(tabContents, function (panel) {
          panel.classList.remove("active");
          panel.setAttribute("aria-hidden", "true");
        });

        this.classList.add("active");
        this.setAttribute("aria-selected", "true");
        var nextPanel = getPanelById(tabContents, "tab-" + targetTab);
        if (nextPanel) {
          nextPanel.classList.add("active");
          nextPanel.setAttribute("aria-hidden", "false");
        }
        if (modalScroll) modalScroll.scrollTop = 0;
      });
    });

    if (!localStorage.getItem("urban95-modal-seen")) {
      showModal();
    }
  }

  window.Urban95InfoModal = {
    bind: bind,
  };
})();
