(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var STORAGE_KEY = "localdraftai.ui.formatToolbarVisible";

  function createEditorToolbar(context) {
    context = context || {};

    var rootElement = context.rootElement;
    var formatToolbarElement = context.formatToolbarElement;
    var toggleFormatToolbarButton = context.toggleFormatToolbarButton;
    var preferenceMenuItem = context.preferenceMenuItem || null;
    var commandRegistry = context.commandRegistry || null;
    var onPreferenceChange = context.onPreferenceChange || function () {};
    var onCommandError = context.onCommandError || function (error) {
      if (window.console && typeof window.console.warn === "function") {
        window.console.warn("LocalDraftAI could not run a topbar command.", error);
      }
    };
    var storage = context.storage;
    var preferredVisible = false;
    var effectiveVisible = false;
    var markdownCommandsAllowed = context.markdownCommandsAllowed !== false;
    var focusModeActive = Boolean(context.focusModeActive);
    var activeEntry = null;
    var listeners = [];
    var destroyed = false;
    var entries = [
      {
        id: "format",
        button: context.formatMoreButton,
        menu: context.formatMoreMenu
      },
      {
        id: "document",
        button: context.documentMoreButton,
        menu: context.documentMoreMenu
      }
    ].filter(function (entry) {
      return entry.button && entry.menu;
    });

    if (!rootElement || !formatToolbarElement || !toggleFormatToolbarButton) {
      throw new Error("Editor toolbar requires its root, formatting row, and formatting toggle.");
    }

    if (storage === undefined) {
      try {
        storage = window.localStorage;
      } catch (error) {
        storage = null;
      }
    }

    function addListener(target, type, listener, options) {
      if (!target || typeof target.addEventListener !== "function") {
        return;
      }
      target.addEventListener(type, listener, options);
      listeners.push({
        listener: listener,
        options: options,
        target: target,
        type: type
      });
    }

    function readPreference() {
      var value;

      if (!storage || typeof storage.getItem !== "function") {
        return false;
      }
      try {
        value = storage.getItem(STORAGE_KEY);
      } catch (error) {
        return false;
      }
      return value === "true" || value === "1";
    }

    function writePreference() {
      if (!storage || typeof storage.setItem !== "function") {
        return;
      }
      try {
        storage.setItem(STORAGE_KEY, String(preferredVisible));
      } catch (error) {
        if (window.console && typeof window.console.warn === "function") {
          window.console.warn("LocalDraftAI could not save the formatting toolbar preference.");
        }
      }
    }

    function entryById(id) {
      return entries.filter(function (entry) {
        return entry.id === id;
      })[0] || null;
    }

    function enabledItems(entry) {
      if (!entry || !entry.menu || typeof entry.menu.querySelectorAll !== "function") {
        return [];
      }
      return Array.prototype.slice.call(
        entry.menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')
      ).filter(function (item) {
        return !item.disabled &&
          !item.hidden &&
          item.getAttribute("aria-disabled") !== "true";
      });
    }

    function focusItem(item) {
      if (item && typeof item.focus === "function") {
        item.focus();
      }
    }

    function positionMenu(entry) {
      var rect;
      var menuWidth;
      var menuHeight;
      var viewportWidth;
      var viewportHeight;
      var left;
      var top;

      if (!entry || entry.menu.hidden || typeof entry.button.getBoundingClientRect !== "function") {
        return;
      }

      rect = entry.button.getBoundingClientRect();
      menuWidth = entry.menu.offsetWidth || 240;
      menuHeight = entry.menu.offsetHeight || 0;
      viewportWidth = window.innerWidth || document.documentElement.clientWidth || menuWidth + 16;
      viewportHeight = window.innerHeight || document.documentElement.clientHeight || menuHeight + 16;
      left = Math.max(8, Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 8));
      top = rect.bottom + 4;
      if (top + menuHeight > viewportHeight - 8) {
        top = Math.max(8, rect.top - menuHeight - 4);
      }

      entry.menu.style.left = left + "px";
      entry.menu.style.top = top + "px";
    }

    function closeEntry(entry, options) {
      options = options || {};
      if (!entry) {
        return;
      }
      entry.menu.hidden = true;
      entry.button.setAttribute("aria-expanded", "false");
      if (activeEntry === entry) {
        activeEntry = null;
      }
      if (options.focusButton) {
        focusItem(entry.button);
      }
    }

    function closeMenus(options) {
      var entryToFocus = activeEntry;

      options = options || {};
      entries.forEach(function (entry) {
        closeEntry(entry);
      });
      if (options.restoreFocus && entryToFocus) {
        focusItem(entryToFocus.button);
      }
    }

    function openMenu(id, options) {
      var entry = entryById(id);
      var items;

      options = options || {};
      if (!entry || entry.button.disabled) {
        return false;
      }

      closeMenus();
      entry.menu.hidden = false;
      entry.button.setAttribute("aria-expanded", "true");
      activeEntry = entry;
      positionMenu(entry);
      if (options.focusFirst !== false) {
        items = enabledItems(entry);
        focusItem(items[0]);
      }
      return true;
    }

    function toggleMenu(id) {
      var entry = entryById(id);

      if (!entry) {
        return;
      }
      if (activeEntry === entry && !entry.menu.hidden) {
        closeEntry(entry);
      } else {
        openMenu(id);
      }
    }

    function sync() {
      effectiveVisible = Boolean(preferredVisible && markdownCommandsAllowed && !focusModeActive);
      formatToolbarElement.hidden = !effectiveVisible;
      toggleFormatToolbarButton.hidden = !markdownCommandsAllowed;
      toggleFormatToolbarButton.disabled = !markdownCommandsAllowed;
      toggleFormatToolbarButton.setAttribute("aria-expanded", String(effectiveVisible));
      toggleFormatToolbarButton.setAttribute(
        "aria-label",
        effectiveVisible ? "Hide formatting toolbar" : "Show formatting toolbar"
      );
      toggleFormatToolbarButton.title = effectiveVisible
        ? "Hide formatting toolbar"
        : focusModeActive && preferredVisible
          ? "Formatting toolbar is hidden in Focus Mode"
          : "Show formatting toolbar";

      if (preferenceMenuItem) {
        preferenceMenuItem.disabled = !markdownCommandsAllowed;
        preferenceMenuItem.setAttribute("aria-checked", String(preferredVisible));
        preferenceMenuItem.title = markdownCommandsAllowed
          ? "Show or hide the Markdown formatting toolbar"
          : "Formatting is available only for Markdown files";
      }

      if (!effectiveVisible) {
        closeEntry(entryById("format"));
      }
      return getState();
    }

    function setPreferredVisible(value) {
      var nextValue = Boolean(value);

      if (preferredVisible !== nextValue) {
        preferredVisible = nextValue;
        writePreference();
        sync();
        onPreferenceChange(preferredVisible, effectiveVisible);
      } else {
        sync();
      }
      return preferredVisible;
    }

    function togglePreferredVisible() {
      return setPreferredVisible(!preferredVisible);
    }

    function setMarkdownCommandsAllowed(value) {
      markdownCommandsAllowed = Boolean(value);
      if (!markdownCommandsAllowed) {
        closeMenus();
      }
      sync();
    }

    function setFocusModeActive(value) {
      focusModeActive = Boolean(value);
      if (focusModeActive) {
        closeMenus();
      }
      sync();
    }

    function getState() {
      return {
        effectiveVisible: effectiveVisible,
        focusModeActive: focusModeActive,
        markdownCommandsAllowed: markdownCommandsAllowed,
        preferredVisible: preferredVisible
      };
    }

    function menuItemFromTarget(target, menu) {
      var current = target;
      var role;

      while (current && current !== menu) {
        if (typeof current.getAttribute === "function") {
          role = current.getAttribute("role");
          if (role === "menuitem" || role === "menuitemcheckbox") {
            return current;
          }
        }
        current = current.parentNode;
      }
      return null;
    }

    function entryForMenuItem(target) {
      var match = null;

      entries.some(function (entry) {
        var item = entry.menu.contains(target)
          ? menuItemFromTarget(target, entry.menu)
          : null;
        if (item) {
          match = {
            entry: entry,
            item: item
          };
          return true;
        }
        return false;
      });
      return match;
    }

    function executeCommand(item) {
      var commandId = item.getAttribute("data-command");
      var result;

      if (!commandId || !commandRegistry || typeof commandRegistry.executeCommand !== "function") {
        return;
      }
      try {
        result = commandRegistry.executeCommand(commandId, {
          source: item
        });
        if (result && typeof result.catch === "function") {
          result.catch(onCommandError);
        }
      } catch (error) {
        onCommandError(error);
      }
    }

    function handleDocumentClick(event) {
      var match = entryForMenuItem(event.target);
      var commandId;

      if (!match) {
        return;
      }
      if (match.item.disabled || match.item.getAttribute("aria-disabled") === "true") {
        event.preventDefault();
        return;
      }

      commandId = match.item.getAttribute("data-command");
      if (commandId) {
        executeCommand(match.item);
        closeEntry(match.entry, { focusButton: true });
        return;
      }

      if (match.item.getAttribute("data-action")) {
        closeEntry(match.entry);
      }
    }

    function handleDocumentPointerDown(event) {
      if (!activeEntry) {
        return;
      }
      if (
        activeEntry.menu.contains(event.target) ||
        activeEntry.button.contains(event.target)
      ) {
        return;
      }
      closeMenus();
    }

    function handleTriggerKeydown(entry, event) {
      if (
        event.key !== "ArrowDown" &&
        event.key !== "Enter" &&
        event.key !== " " &&
        event.key !== "Spacebar"
      ) {
        return;
      }
      event.preventDefault();
      openMenu(entry.id);
    }

    function moveMenuFocus(entry, event) {
      var items = enabledItems(entry);
      var currentIndex = items.indexOf(document.activeElement);
      var nextIndex;

      if (!items.length) {
        return;
      }
      if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = items.length - 1;
      } else if (event.key === "ArrowDown") {
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      } else if (event.key === "ArrowUp") {
        nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
      } else {
        return;
      }
      event.preventDefault();
      focusItem(items[nextIndex]);
    }

    function handleMenuKeydown(entry, event) {
      var item;

      if (event.key === "Escape") {
        event.preventDefault();
        closeEntry(entry, { focusButton: true });
        return;
      }
      if (event.key === "Tab") {
        closeEntry(entry);
        return;
      }
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        moveMenuFocus(entry, event);
        return;
      }
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        item = menuItemFromTarget(event.target, entry.menu);
        if (item && !item.disabled && item.getAttribute("aria-disabled") !== "true") {
          event.preventDefault();
          if (typeof item.click === "function") {
            item.click();
          }
        }
      }
    }

    function bindEvents() {
      addListener(toggleFormatToolbarButton, "click", togglePreferredVisible);
      entries.forEach(function (entry) {
        addListener(entry.button, "click", function (event) {
          event.stopPropagation();
          toggleMenu(entry.id);
        });
        addListener(entry.button, "keydown", function (event) {
          handleTriggerKeydown(entry, event);
        });
        addListener(entry.menu, "keydown", function (event) {
          handleMenuKeydown(entry, event);
        });
      });
      addListener(document, "click", handleDocumentClick);
      addListener(document, "pointerdown", handleDocumentPointerDown);
      addListener(window, "resize", function () {
        closeMenus();
      });
    }

    function destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      closeMenus();
      listeners.forEach(function (binding) {
        binding.target.removeEventListener(
          binding.type,
          binding.listener,
          binding.options
        );
      });
      listeners = [];
    }

    preferredVisible = readPreference();
    bindEvents();
    sync();

    return {
      closeMenus: closeMenus,
      destroy: destroy,
      getState: getState,
      openMenu: openMenu,
      setFocusModeActive: setFocusModeActive,
      setMarkdownCommandsAllowed: setMarkdownCommandsAllowed,
      setPreferredVisible: setPreferredVisible,
      sync: sync,
      togglePreferredVisible: togglePreferredVisible
    };
  }

  ME.editorToolbar = {
    STORAGE_KEY: STORAGE_KEY,
    create: createEditorToolbar
  };
}());
