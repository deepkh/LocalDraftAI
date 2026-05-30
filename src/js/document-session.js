(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var nextSessionId = 1;

  function normalizeViewMode(mode) {
    if (mode === "wysiwyg-only" || mode === "markdown-only" || mode === "split") {
      return mode;
    }

    return "split";
  }

  function createDocumentSession(options) {
    options = options || {};

    var activeMode = options.activeEditorSource === "markdown" || options.activeMode === "markdown"
      ? "markdown"
      : "wysiwyg";
    var viewMode = normalizeViewMode(options.viewMode);

    return {
      id: options.id || "session-" + nextSessionId++,
      title: options.title || (options.fileHandle && options.fileHandle.name) || "Untitled.md",
      markdownText: String(options.markdownText || ""),
      fileHandle: options.fileHandle || null,
      workspaceDirHandle: options.workspaceDirHandle || null,
      assetDirName: options.assetDirName || "assets",
      assetObjectUrls: options.assetObjectUrls || {},
      dirty: Boolean(options.dirty),
      history: options.history || null,
      activeEditorSource: activeMode,
      activeMode: activeMode,
      markdownScrollTop: options.markdownScrollTop || 0,
      scrollState: options.scrollState || null,
      viewMode: viewMode,
      wysiwygScrollTop: options.wysiwygScrollTop || 0
    };
  }

  ME.documentSession = {
    create: createDocumentSession
  };
}());
