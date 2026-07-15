(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var STORAGE_KEY = "localdraftai.appearance.theme";
  var currentTheme = "light";
  var readyListenerBound = false;

  function normalizeTheme(value) {
    return value === "dark" ? "dark" : "light";
  }

  function resolveStorage(storage) {
    if (storage) {
      return storage;
    }

    try {
      return window.localStorage;
    } catch (error) {
      return null;
    }
  }

  function loadTheme(storage) {
    var resolvedStorage = resolveStorage(storage);

    if (!resolvedStorage) {
      return "light";
    }

    try {
      return normalizeTheme(resolvedStorage.getItem(STORAGE_KEY));
    } catch (error) {
      return "light";
    }
  }

  function getDocument(options) {
    if (options && options.document) {
      return options.document;
    }
    return typeof document === "undefined" ? null : document;
  }

  function syncControls(options) {
    var doc = getDocument(options);
    var isDark = getTheme(options) === "dark";
    var toggleButton = doc && doc.getElementById ? doc.getElementById("themeToggleButton") : null;
    var menuItem = doc && doc.getElementById ? doc.getElementById("darkThemeMenuItem") : null;
    var description = isDark ? "Switch to light theme" : "Switch to dark theme";

    if (toggleButton) {
      toggleButton.title = description;
      toggleButton.setAttribute("aria-label", description);
      toggleButton.setAttribute("aria-pressed", isDark ? "true" : "false");
    }
    if (menuItem) {
      menuItem.setAttribute("aria-checked", isDark ? "true" : "false");
    }
  }

  function applyTheme(theme, options) {
    var normalized = normalizeTheme(theme);
    var settings = options || {};
    var doc = getDocument(settings);
    var root = settings.rootElement || (doc && doc.documentElement);
    var storage;

    currentTheme = normalized;
    if (root) {
      if (root.dataset) {
        root.dataset.theme = normalized;
      } else if (root.setAttribute) {
        root.setAttribute("data-theme", normalized);
      }
    }

    if (settings.persist !== false) {
      storage = resolveStorage(settings.storage);
      if (storage) {
        try {
          storage.setItem(STORAGE_KEY, normalized);
        } catch (error) {
          // Theme changes remain available for this page when storage is unavailable.
        }
      }
    }

    if (settings.syncControls !== false) {
      syncControls(settings);
    }
    return normalized;
  }

  function getTheme(options) {
    var settings = options || {};
    var doc = getDocument(settings);
    var root = settings.rootElement || (doc && doc.documentElement);
    var value = root && root.dataset ? root.dataset.theme : null;

    return value === "light" || value === "dark" ? value : currentTheme;
  }

  function toggleTheme(options) {
    return applyTheme(getTheme(options) === "dark" ? "light" : "dark", options);
  }

  function syncWhenReady(doc) {
    if (!doc) {
      return;
    }
    if (doc.readyState === "loading" && doc.addEventListener) {
      if (!readyListenerBound) {
        readyListenerBound = true;
        doc.addEventListener("DOMContentLoaded", function () {
          readyListenerBound = false;
          syncControls({ document: doc });
        }, { once: true });
      }
      return;
    }
    syncControls({ document: doc });
  }

  function initialize(options) {
    var settings = options || {};
    var doc = getDocument(settings);
    var theme = loadTheme(settings.storage);

    applyTheme(theme, {
      document: doc,
      persist: false,
      rootElement: settings.rootElement,
      syncControls: false
    });
    syncWhenReady(doc);
    return theme;
  }

  ME.theme = {
    STORAGE_KEY: STORAGE_KEY,
    applyTheme: applyTheme,
    getTheme: getTheme,
    initialize: initialize,
    loadTheme: loadTheme,
    normalizeTheme: normalizeTheme,
    syncControls: syncControls,
    toggleTheme: toggleTheme
  };

  initialize();
}());
