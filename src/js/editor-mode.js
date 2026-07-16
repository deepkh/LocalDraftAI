(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var EDITOR_MODES = {
    MARKDOWN: "markdown",
    WYSIWYG: "wysiwyg"
  };
  var EDITOR_MODE_STORAGE_KEY = "localdraftai.editorMode";
  var LEGACY_VIEW_MODE_STORAGE_KEY = "localdraftai.viewMode";
  var SOFT_WRAP_STORAGE_KEY = "localdraftai.softWrapEnabled";

  function normalizeEditorMode(mode) {
    return mode === EDITOR_MODES.MARKDOWN ? EDITOR_MODES.MARKDOWN : EDITOR_MODES.WYSIWYG;
  }

  function normalizeEditorModeForDocument(mode, documentType) {
    if (ME.documentType && !ME.documentType.allowsWysiwyg(documentType || "markdown")) {
      return EDITOR_MODES.MARKDOWN;
    }

    return normalizeEditorMode(mode);
  }

  function readStoredEditorMode(storage) {
    var stored;
    var oldViewMode;

    storage = storage || window.localStorage;
    try {
      stored = storage.getItem(EDITOR_MODE_STORAGE_KEY);
      if (!stored) {
        oldViewMode = storage.getItem(LEGACY_VIEW_MODE_STORAGE_KEY);
        if (oldViewMode === "markdown-only") {
          return EDITOR_MODES.MARKDOWN;
        }
      }
      return normalizeEditorMode(stored);
    } catch (error) {
      return EDITOR_MODES.WYSIWYG;
    }
  }

  function storeEditorMode(mode, storage) {
    storage = storage || window.localStorage;
    try {
      storage.setItem(EDITOR_MODE_STORAGE_KEY, normalizeEditorMode(mode));
    } catch (error) {
      // Storage is optional.
    }
  }

  function readStoredSoftWrap(storage) {
    storage = storage || window.localStorage;
    try {
      return storage.getItem(SOFT_WRAP_STORAGE_KEY) !== "false";
    } catch (error) {
      return true;
    }
  }

  function storeSoftWrap(enabled, storage) {
    storage = storage || window.localStorage;
    try {
      storage.setItem(SOFT_WRAP_STORAGE_KEY, enabled ? "true" : "false");
    } catch (error) {
      // Storage is optional.
    }
  }

  function getLineColumnFromOffset(text, offset) {
    var before = String(text || "").slice(0, Math.max(0, offset || 0));
    var lines = before.split(/\n/);

    return {
      column: lines[lines.length - 1].length,
      line: lines.length - 1
    };
  }

  function getOffsetFromLineColumn(text, line, column) {
    var lines = String(text || "").split(/\n/);
    var targetLine = Math.max(0, Math.min(Number(line) || 0, lines.length - 1));
    var offset = 0;
    var i;

    for (i = 0; i < targetLine; i += 1) {
      offset += lines[i].length + 1;
    }

    return offset + Math.max(0, Math.min(Number(column) || 0, lines[targetLine].length));
  }

  function markdownOffsetToVisibleTextOffset(markdownText, markdownOffset) {
    var before = String(markdownText || "").slice(0, Math.max(0, markdownOffset || 0));

    return before
      .replace(/\\([\\`*_{}\[\]()#\+\-.!|>])/g, "\ufff0")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .length;
  }

  function visibleTextOffsetToMarkdownOffset(markdownText, visibleOffset) {
    var text = String(markdownText || "");
    var target = Math.max(0, Number(visibleOffset) || 0);
    var bestOffset = 0;
    var bestDistance = Infinity;
    var i;
    var currentVisible;
    var distance;

    for (i = 0; i <= text.length; i += 1) {
      currentVisible = markdownOffsetToVisibleTextOffset(text, i);
      distance = Math.abs(currentVisible - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestOffset = i;
      }
      if (currentVisible >= target && distance > bestDistance) {
        break;
      }
    }

    return bestOffset;
  }

  ME.editorMode = {
    EDITOR_MODES: EDITOR_MODES,
    EDITOR_MODE_STORAGE_KEY: EDITOR_MODE_STORAGE_KEY,
    LEGACY_VIEW_MODE_STORAGE_KEY: LEGACY_VIEW_MODE_STORAGE_KEY,
    SOFT_WRAP_STORAGE_KEY: SOFT_WRAP_STORAGE_KEY,
    getLineColumnFromOffset: getLineColumnFromOffset,
    getOffsetFromLineColumn: getOffsetFromLineColumn,
    markdownOffsetToVisibleTextOffset: markdownOffsetToVisibleTextOffset,
    normalizeEditorMode: normalizeEditorMode,
    normalizeEditorModeForDocument: normalizeEditorModeForDocument,
    readStoredEditorMode: readStoredEditorMode,
    readStoredSoftWrap: readStoredSoftWrap,
    storeEditorMode: storeEditorMode,
    storeSoftWrap: storeSoftWrap,
    visibleTextOffsetToMarkdownOffset: visibleTextOffsetToMarkdownOffset
  };
}());
