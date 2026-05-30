(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function createMenuElement() {
    var element = document.createElement("div");
    element.className = "ai-menu ai-context-menu";
    element.setAttribute("role", "menu");
    element.hidden = true;
    document.body.appendChild(element);
    return element;
  }

  function appendSeparator(menu) {
    var separator = document.createElement("div");
    separator.className = "ai-menu-separator";
    separator.setAttribute("role", "separator");
    menu.appendChild(separator);
  }

  function renderClipboardItems(menu, options) {
    var title = document.createElement("div");
    var hasSelection = Boolean(options.range && options.range.text);

    title.className = "ai-menu-title";
    title.textContent = "Edit";
    menu.appendChild(title);

    [
      { id: "cut", label: "Cut", needsSelection: true },
      { id: "copy", label: "Copy", needsSelection: true },
      { id: "paste", label: "Paste", needsSelection: false }
    ].forEach(function (action) {
      var item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.dataset.clipboardAction = action.id;
      item.textContent = action.label;
      item.disabled = action.needsSelection && !hasSelection;
      item.addEventListener("click", function () {
        if (item.disabled) {
          return;
        }
        options.onClipboardAction(action.id, {
          selection: options.range,
          source: "context"
        });
      });
      menu.appendChild(item);
    });
  }

  function renderAiItems(menu, onAction) {
    var renderedAny = false;

    ME.aiActions.groups().forEach(function (group, groupIndex) {
      if (groupIndex > 0) {
        appendSeparator(menu);
      }

      if (groupIndex === 0) {
        var title = document.createElement("div");
        title.className = "ai-menu-title";
        title.textContent = "AI Assistant";
        menu.appendChild(title);
      }

      group.actions.forEach(function (action) {
        var item = document.createElement("button");
        item.type = "button";
        item.setAttribute("role", "menuitem");
        item.dataset.actionId = action.id;
        item.textContent = action.label;
        item.addEventListener("click", function () {
          onAction(action);
        });
        menu.appendChild(item);
        renderedAny = true;
      });
    });

    return renderedAny;
  }

  function renderMenuItems(menu, options) {
    menu.innerHTML = "";

    if (options.onClipboardAction) {
      renderClipboardItems(menu, options);
    }

    if (options.canShowAi) {
      if (options.onClipboardAction) {
        appendSeparator(menu);
      }
      renderAiItems(menu, options.onAiAction);
    }
  }

  function createAiContextMenu(options) {
    var menu = createMenuElement();
    var markdownEditor = options.markdownEditor;
    var currentRange = null;
    var guards = ME.markdownAiGuards;

    function hide() {
      menu.hidden = true;
      currentRange = null;
    }

    function fitToViewport(x, y) {
      var rect;

      menu.style.left = "0px";
      menu.style.top = "0px";
      menu.hidden = false;
      rect = menu.getBoundingClientRect();

      menu.style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + "px";
      menu.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + "px";
    }

    function show(event, range) {
      currentRange = Object.assign({}, range);
      fitToViewport(event.clientX, event.clientY);
    }

    function isEditorContext(event, mode) {
      if (mode === "markdown") {
        return event.target === markdownEditor;
      }

      return Boolean(options.wysiwygEditor && options.wysiwygEditor.contains(event.target));
    }

    function handleContextMenu(event) {
      var range = options.captureSelection ? options.captureSelection() : guards.selectedRange(markdownEditor);
      var mode = range && range.mode ? range.mode : options.getActiveMode();
      var canShowAi = guards.canShowContextMenu({
        event: event,
        editor: options.wysiwygEditor,
        mode: mode,
        range: range,
        textarea: markdownEditor
      });
      var canShowClipboard = Boolean(options.onClipboardAction && isEditorContext(event, mode));

      if (!canShowAi && !canShowClipboard) {
        hide();
        return;
      }

      event.preventDefault();
      renderMenuItems(menu, {
        canShowAi: canShowAi,
        onAiAction: function (action) {
          var range = currentRange;
          hide();
          options.onAction(action.id, {
            selection: range,
            source: "context"
          });
        },
        onClipboardAction: options.onClipboardAction ? function (actionId, detail) {
          hide();
          options.onClipboardAction(actionId, detail);
        } : null,
        range: range
      });
      show(event, range);
    }

    function handleDocumentPointerDown(event) {
      if (!menu.hidden && !menu.contains(event.target)) {
        hide();
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape" && !menu.hidden) {
        event.preventDefault();
        hide();
      }
    }

    function bindEvents() {
      markdownEditor.addEventListener("contextmenu", handleContextMenu);
      if (options.wysiwygEditor) {
        options.wysiwygEditor.addEventListener("contextmenu", handleContextMenu);
      }
      document.addEventListener("pointerdown", handleDocumentPointerDown);
      document.addEventListener("keydown", handleEscape);
      window.addEventListener("scroll", hide, { passive: true });
      window.addEventListener("resize", hide);
    }

    return {
      bindEvents: bindEvents,
      hide: hide,
      isOpen: function () {
        return !menu.hidden;
      }
    };
  }

  ME.aiContextMenu = {
    create: createAiContextMenu
  };
}());
