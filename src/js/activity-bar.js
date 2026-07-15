(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var PRIMARY_VIEWS = ["files", "search", "related"];

  function normalizePrimaryView(view) {
    return PRIMARY_VIEWS.indexOf(view) === -1 ? "files" : view;
  }

  function normalizeState(state) {
    state = state || {};

    return {
      activePrimaryView: normalizePrimaryView(state.activePrimaryView),
      primarySidebarVisible: state.primarySidebarVisible !== false,
      secondarySidebarVisible: Boolean(state.secondarySidebarVisible)
    };
  }

  function nextPrimaryState(state, view) {
    var current = normalizeState(state);
    var nextView = normalizePrimaryView(view);

    if (current.activePrimaryView === nextView && current.primarySidebarVisible) {
      current.primarySidebarVisible = false;
      return current;
    }

    current.activePrimaryView = nextView;
    current.primarySidebarVisible = true;
    return current;
  }

  function createActivityBar(context) {
    var rootElement = context.rootElement;
    var workspaceSidebar = context.workspaceSidebar;
    var aiAssistant = context.aiAssistant;
    var state = normalizeState({
      activePrimaryView: workspaceSidebar && workspaceSidebar.getPanel ? workspaceSidebar.getPanel() : "files",
      primarySidebarVisible: workspaceSidebar && workspaceSidebar.getMode
        ? workspaceSidebar.getMode() !== "hidden"
        : true,
      secondarySidebarVisible: aiAssistant && aiAssistant.isPanelOpen ? aiAssistant.isPanelOpen() : false
    });

    function viewButtons() {
      return rootElement
        ? Array.prototype.slice.call(rootElement.querySelectorAll("[data-workbench-view]"))
        : [];
    }

    function render() {
      viewButtons().forEach(function (button) {
        var view = button.getAttribute("data-workbench-view");
        var active = PRIMARY_VIEWS.indexOf(view) !== -1
          ? view === state.activePrimaryView
          : view === "ai" && state.secondarySidebarVisible;

        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
        if (PRIMARY_VIEWS.indexOf(view) !== -1 && active) {
          button.setAttribute("aria-current", "page");
        } else {
          button.removeAttribute("aria-current");
        }
      });
    }

    function focusSearchInput() {
      window.requestAnimationFrame(function () {
        var input = document.querySelector("#workspaceSidebar .workspace-content-search");
        if (input) {
          input.focus();
        }
      });
    }

    function activatePrimaryView(view) {
      state = nextPrimaryState(state, view);

      if (workspaceSidebar) {
        if (state.primarySidebarVisible) {
          workspaceSidebar.setPanel(state.activePrimaryView);
          workspaceSidebar.setMode("expanded");
        } else {
          workspaceSidebar.setMode("hidden");
        }
      }

      render();
      if (state.primarySidebarVisible && state.activePrimaryView === "search") {
        focusSearchInput();
      }
      return getState();
    }

    function activateAiAssistant() {
      if (aiAssistant && aiAssistant.openAssistant) {
        aiAssistant.openAssistant();
      }
      state.secondarySidebarVisible = aiAssistant && aiAssistant.isPanelOpen
        ? aiAssistant.isPanelOpen()
        : true;
      render();
    }

    function openSettings() {
      if (aiAssistant && aiAssistant.openSettings) {
        aiAssistant.openSettings();
      }
    }

    function handleClick(event) {
      var button = event.target.closest("[data-workbench-view]");
      var view;

      if (!button || !rootElement.contains(button)) {
        return;
      }

      view = button.getAttribute("data-workbench-view");
      if (PRIMARY_VIEWS.indexOf(view) !== -1) {
        activatePrimaryView(view);
      } else if (view === "ai") {
        activateAiAssistant();
      } else if (view === "settings") {
        openSettings();
      }
    }

    function getState() {
      return normalizeState(state);
    }

    function syncPrimaryView(view) {
      state.activePrimaryView = normalizePrimaryView(view);
      render();
    }

    function syncPrimarySidebarMode(mode) {
      state.primarySidebarVisible = mode !== "hidden";
      render();
    }

    function syncSecondarySidebar(visible) {
      state.secondarySidebarVisible = Boolean(visible);
      render();
    }

    function bindEvents() {
      if (!rootElement) {
        return;
      }

      rootElement.addEventListener("click", handleClick);
      render();
    }

    return {
      activatePrimaryView: activatePrimaryView,
      bindEvents: bindEvents,
      getState: getState,
      syncPrimarySidebarMode: syncPrimarySidebarMode,
      syncPrimaryView: syncPrimaryView,
      syncSecondarySidebar: syncSecondarySidebar
    };
  }

  ME.activityBar = {
    create: createActivityBar,
    nextPrimaryState: nextPrimaryState,
    normalizePrimaryView: normalizePrimaryView,
    normalizeState: normalizeState
  };
}());
