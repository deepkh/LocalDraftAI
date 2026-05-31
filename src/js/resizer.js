(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var clamp = ME.utils.clamp;
  var AI_PANEL_WIDTH_STORAGE_KEY = "localdraftai.aiAssistantPanelWidth";
  var AI_PANEL_DEFAULT_WIDTH = 420;
  var AI_PANEL_MIN_WIDTH = 320;
  var AI_PANEL_MAX_VIEWPORT_RATIO = 0.6;
  var EDITOR_MIN_WIDTH = 480;
  var AI_PANEL_DESKTOP_MEDIA = "(min-width: 941px)";

  function createResizer(context) {
    var workspace = context.workspace;
    var paneResizer = context.paneResizer;

    function isWideLayout() {
      return window.matchMedia("(min-width: 941px)").matches;
    }

    function updateResizerValue(leftWidth) {
      var rect = workspace.getBoundingClientRect();
      var resizerWidth = paneResizer.offsetWidth || 12;
      var available = Math.max(rect.width - resizerWidth, 1);
      var percent = Math.round((leftWidth / available) * 100);

      paneResizer.setAttribute("aria-valuenow", String(clamp(percent, 25, 75)));
    }

    function setEditorWidth(leftWidth) {
      if (!context.isResizableLayout() || !isWideLayout()) {
        return;
      }

      var rect = workspace.getBoundingClientRect();
      var resizerWidth = paneResizer.offsetWidth || 12;
      var available = Math.max(rect.width - resizerWidth, 1);
      var minEditor = Math.min(320, available * 0.7);
      var minMarkdown = Math.min(320, available * 0.7);
      var minWidth = Math.min(minEditor, available * 0.45);
      var maxWidth = Math.max(minWidth, available - minMarkdown);
      var nextWidth = clamp(leftWidth, minWidth, maxWidth);

      workspace.style.setProperty("--editor-width", nextWidth + "px");
      updateResizerValue(nextWidth);
    }

    function resizeFromPointer(clientX) {
      var rect = workspace.getBoundingClientRect();
      setEditorWidth(clientX - rect.left);
    }

    function resizeByKeyboard(delta) {
      var rect = workspace.getBoundingClientRect();
      var currentWidth = workspace.querySelector(".wysiwyg-pane").getBoundingClientRect().width;
      var resizerWidth = paneResizer.offsetWidth || 12;

      if (delta === "home") {
        setEditorWidth((rect.width - resizerWidth) * 0.35);
      } else if (delta === "end") {
        setEditorWidth((rect.width - resizerWidth) * 0.65);
      } else {
        setEditorWidth(currentWidth + delta);
      }
    }

    function bindEvents() {
      paneResizer.addEventListener("pointerdown", function (event) {
        if (!context.isResizableLayout() || !isWideLayout()) {
          return;
        }

        event.preventDefault();
        paneResizer.setPointerCapture(event.pointerId);
        paneResizer.classList.add("is-dragging");
        document.body.classList.add("is-resizing");
        resizeFromPointer(event.clientX);
      });

      paneResizer.addEventListener("pointermove", function (event) {
        if (!paneResizer.classList.contains("is-dragging")) {
          return;
        }

        event.preventDefault();
        resizeFromPointer(event.clientX);
      });

      paneResizer.addEventListener("pointerup", function (event) {
        paneResizer.classList.remove("is-dragging");
        document.body.classList.remove("is-resizing");

        if (paneResizer.hasPointerCapture(event.pointerId)) {
          paneResizer.releasePointerCapture(event.pointerId);
        }
      });

      paneResizer.addEventListener("pointercancel", function (event) {
        paneResizer.classList.remove("is-dragging");
        document.body.classList.remove("is-resizing");

        if (paneResizer.hasPointerCapture(event.pointerId)) {
          paneResizer.releasePointerCapture(event.pointerId);
        }
      });

      paneResizer.addEventListener("keydown", function (event) {
        if (!context.isResizableLayout() || !isWideLayout()) {
          return;
        }

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          resizeByKeyboard(-32);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          resizeByKeyboard(32);
        } else if (event.key === "Home") {
          event.preventDefault();
          resizeByKeyboard("home");
        } else if (event.key === "End") {
          event.preventDefault();
          resizeByKeyboard("end");
        }
      });
    }

    return {
      bindEvents: bindEvents,
      updateValue: updateResizerValue
    };
  }

  function getAiPanelWidthLimits(context) {
    var workspace = context.workspace;
    var handle = context.handle;
    var rect = workspace && workspace.getBoundingClientRect ? workspace.getBoundingClientRect() : null;
    var workspaceWidth = rect && rect.width ? rect.width : window.innerWidth || AI_PANEL_DEFAULT_WIDTH;
    var handleWidth = handle && handle.offsetWidth ? handle.offsetWidth : 6;
    var style = window.getComputedStyle && workspace ? window.getComputedStyle(workspace) : null;
    var columnGap = style ? parseFloat(style.columnGap || style.gap || "0") || 0 : 0;
    var reservedWidth = EDITOR_MIN_WIDTH + handleWidth + (columnGap * 2);
    var viewportMax = Math.floor((window.innerWidth || workspaceWidth) * AI_PANEL_MAX_VIEWPORT_RATIO);
    var layoutMax = Math.floor(workspaceWidth - reservedWidth);
    var max = Math.max(AI_PANEL_MIN_WIDTH, Math.min(viewportMax, layoutMax));

    return {
      min: AI_PANEL_MIN_WIDTH,
      max: max,
      defaultWidth: AI_PANEL_DEFAULT_WIDTH
    };
  }

  function normalizeAiPanelWidth(widthPx, context) {
    var limits = getAiPanelWidthLimits(context);
    var width = Number(widthPx);

    if (!Number.isFinite(width)) {
      width = limits.defaultWidth;
    }

    return clamp(Math.round(width), limits.min, limits.max);
  }

  function setAiAssistantPanelWidth(widthPx, context) {
    var root = context.root || document.documentElement;
    var handle = context.handle;
    var limits = getAiPanelWidthLimits(context);
    var width = normalizeAiPanelWidth(widthPx, context);

    root.style.setProperty("--ai-assistant-panel-width", width + "px");

    if (handle) {
      handle.setAttribute("aria-valuemin", String(limits.min));
      handle.setAttribute("aria-valuemax", String(limits.max));
      handle.setAttribute("aria-valuenow", String(width));
    }

    return width;
  }

  function loadAiAssistantPanelWidth(context, storage) {
    var stored;

    storage = storage || window.localStorage;
    try {
      stored = storage ? storage.getItem(AI_PANEL_WIDTH_STORAGE_KEY) : "";
    } catch (error) {
      stored = "";
    }

    return setAiAssistantPanelWidth(stored || AI_PANEL_DEFAULT_WIDTH, context);
  }

  function saveAiAssistantPanelWidth(widthPx, storage) {
    var width = Number(widthPx);

    if (!Number.isFinite(width) || width <= 0) {
      return;
    }

    storage = storage || window.localStorage;
    try {
      if (storage) {
        storage.setItem(AI_PANEL_WIDTH_STORAGE_KEY, String(Math.round(width)));
      }
    } catch (error) {
      // Storage is optional.
    }
  }

  function createAiPanelResizer(context) {
    var workspace = context.workspace;
    var handle = context.handle;
    var storage = context.storage;
    var currentWidth = AI_PANEL_DEFAULT_WIDTH;

    function isEnabledLayout() {
      return window.matchMedia(AI_PANEL_DESKTOP_MEDIA).matches;
    }

    function widthFromPointer(clientX) {
      var rect = workspace.getBoundingClientRect();

      return rect.right - clientX;
    }

    function setWidth(widthPx) {
      currentWidth = setAiAssistantPanelWidth(widthPx, context);
      return currentWidth;
    }

    function stopResize(event) {
      if (!handle.classList.contains("is-dragging")) {
        return;
      }

      handle.classList.remove("is-dragging");
      document.body.classList.remove("is-resizing-ai-panel");
      saveAiAssistantPanelWidth(currentWidth, storage);

      if (event && handle.hasPointerCapture && handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    }

    function bindEvents() {
      if (!workspace || !handle) {
        return;
      }

      currentWidth = loadAiAssistantPanelWidth(context, storage);

      handle.addEventListener("pointerdown", function (event) {
        if (!isEnabledLayout()) {
          return;
        }

        event.preventDefault();
        currentWidth = setWidth(widthFromPointer(event.clientX));
        handle.classList.add("is-dragging");
        document.body.classList.add("is-resizing-ai-panel");

        if (handle.setPointerCapture) {
          handle.setPointerCapture(event.pointerId);
        }
      });

      handle.addEventListener("pointermove", function (event) {
        if (!handle.classList.contains("is-dragging")) {
          return;
        }

        event.preventDefault();
        currentWidth = setWidth(widthFromPointer(event.clientX));
      });

      handle.addEventListener("pointerup", stopResize);
      handle.addEventListener("pointercancel", stopResize);

      handle.addEventListener("dblclick", function (event) {
        event.preventDefault();
        currentWidth = setWidth(AI_PANEL_DEFAULT_WIDTH);
        saveAiAssistantPanelWidth(currentWidth, storage);
      });

      handle.addEventListener("keydown", function (event) {
        if (!isEnabledLayout()) {
          return;
        }

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          currentWidth = setWidth(currentWidth + 32);
          saveAiAssistantPanelWidth(currentWidth, storage);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          currentWidth = setWidth(currentWidth - 32);
          saveAiAssistantPanelWidth(currentWidth, storage);
        } else if (event.key === "Home") {
          event.preventDefault();
          currentWidth = setWidth(AI_PANEL_MIN_WIDTH);
          saveAiAssistantPanelWidth(currentWidth, storage);
        } else if (event.key === "End") {
          event.preventDefault();
          currentWidth = setWidth(getAiPanelWidthLimits(context).max);
          saveAiAssistantPanelWidth(currentWidth, storage);
        }
      });

      window.addEventListener("resize", function () {
        currentWidth = setWidth(currentWidth);
      });
    }

    return {
      bindEvents: bindEvents,
      getLimits: function () {
        return getAiPanelWidthLimits(context);
      },
      getWidth: function () {
        return currentWidth;
      },
      reset: function () {
        currentWidth = setWidth(AI_PANEL_DEFAULT_WIDTH);
        saveAiAssistantPanelWidth(currentWidth, storage);
      },
      setWidth: setWidth
    };
  }

  ME.resizer = {
    AI_PANEL_WIDTH_STORAGE_KEY: AI_PANEL_WIDTH_STORAGE_KEY,
    create: createResizer,
    createAiPanel: createAiPanelResizer,
    getAiPanelWidthLimits: getAiPanelWidthLimits,
    loadAiAssistantPanelWidth: loadAiAssistantPanelWidth,
    normalizeAiPanelWidth: normalizeAiPanelWidth,
    saveAiAssistantPanelWidth: saveAiAssistantPanelWidth,
    setAiAssistantPanelWidth: setAiAssistantPanelWidth
  };
}());
