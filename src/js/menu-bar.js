(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function createMenuBar(context) {
    var rootElement = context.rootElement;
    var commandRegistry = context.commandRegistry;
    var onBeforeOpen = context.onBeforeOpen || function () {};
    var onCommandError = context.onCommandError || function (error) {
      window.alert(error && error.message ? error.message : "The command could not be completed.");
    };
    var entries = (context.entries || []).filter(function (entry) {
      return entry && entry.id && entry.button && entry.menu;
    });
    var activeId = "";

    function entryById(id) {
      return entries.filter(function (entry) {
        return entry.id === id;
      })[0] || null;
    }

    function firstEnabledItem(entry) {
      return entry.menu.querySelector('[role="menuitem"]:not(:disabled), [data-command]:not(:disabled)');
    }

    function position(entry) {
      var rect;
      var top;
      var left;

      if (!entry || entry.menu.hidden) {
        return;
      }

      rect = entry.button.getBoundingClientRect();
      top = Math.max(4, Math.min(rect.bottom + 4, window.innerHeight - entry.menu.offsetHeight - 8));
      left = Math.max(8, Math.min(rect.left, window.innerWidth - entry.menu.offsetWidth - 8));
      entry.menu.style.top = top + "px";
      entry.menu.style.left = left + "px";
    }

    function close(id, options) {
      var entry = entryById(id);

      options = options || {};
      if (!entry) {
        return;
      }

      entry.menu.hidden = true;
      entry.button.setAttribute("aria-expanded", "false");
      if (activeId === id) {
        activeId = "";
      }
      if (options.focusButton) {
        entry.button.focus();
      }
    }

    function closeAll(exceptId) {
      entries.forEach(function (entry) {
        if (entry.id !== exceptId) {
          close(entry.id);
        }
      });
    }

    function open(id, options) {
      var entry = entryById(id);
      var firstItem;

      options = options || {};
      if (!entry) {
        return;
      }

      closeAll(id);
      onBeforeOpen(id);
      if (typeof entry.beforeOpen === "function") {
        entry.beforeOpen();
      }
      entry.menu.hidden = false;
      entry.button.setAttribute("aria-expanded", "true");
      activeId = id;
      position(entry);
      if (options.focusFirst) {
        firstItem = firstEnabledItem(entry);
        if (firstItem) {
          firstItem.focus();
        }
      }
    }

    function toggle(id) {
      if (activeId === id && entryById(id) && !entryById(id).menu.hidden) {
        close(id);
      } else {
        open(id);
      }
    }

    function execute(commandId, source) {
      var result;

      try {
        result = commandRegistry.executeCommand(commandId, { source: source });
        if (result && typeof result.catch === "function") {
          result.catch(onCommandError);
        }
      } catch (error) {
        onCommandError(error);
      }
    }

    function handleRootClick(event) {
      var commandElement = event.target.closest("[data-command]");
      var entry;

      if (!commandElement || !rootElement.contains(commandElement) || commandElement.disabled) {
        return;
      }

      entry = entries.filter(function (candidate) {
        return candidate.menu.contains(commandElement);
      })[0];
      if (!entry) {
        return;
      }

      close(entry.id);
      execute(commandElement.getAttribute("data-command"), commandElement);
    }

    function handleKeydown(event) {
      var entry;

      if (event.key === "Escape" && activeId) {
        event.preventDefault();
        close(activeId, { focusButton: true });
        return;
      }

      entry = entries.filter(function (candidate) {
        return candidate.button === event.target;
      })[0];
      if (!entry) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        open(entry.id, { focusFirst: true });
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        var index = entries.indexOf(entry);
        var offset = event.key === "ArrowLeft" ? -1 : 1;
        var next = entries[(index + offset + entries.length) % entries.length];
        event.preventDefault();
        next.button.focus();
        if (activeId) {
          open(next.id);
        }
      }
    }

    function bindEvents() {
      entries.forEach(function (entry) {
        entry.button.addEventListener("click", function (event) {
          event.stopPropagation();
          toggle(entry.id);
        });
      });

      rootElement.addEventListener("click", handleRootClick);
      rootElement.addEventListener("keydown", handleKeydown);
      document.addEventListener("pointerdown", function (event) {
        if (activeId && !rootElement.contains(event.target)) {
          close(activeId);
        }
      });
      window.addEventListener("resize", function () {
        position(entryById(activeId));
      });
    }

    return {
      bindEvents: bindEvents,
      close: close,
      closeAll: closeAll,
      getActiveMenu: function () {
        return activeId;
      },
      open: open,
      toggle: toggle
    };
  }

  ME.menuBar = {
    create: createMenuBar
  };
}());
