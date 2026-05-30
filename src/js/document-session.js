(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var nextSessionId = 1;

  function createDocumentSession(options) {
    options = options || {};

    var activeMode = options.editorMode === "markdown" || options.activeEditorSource === "markdown" || options.activeMode === "markdown"
      ? "markdown"
      : "wysiwyg";

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
      editorMode: activeMode,
      lastKnownColumn: options.lastKnownColumn || 0,
      lastKnownLine: options.lastKnownLine || 0,
      markdownSelectionEnd: options.markdownSelectionEnd || 0,
      markdownSelectionStart: options.markdownSelectionStart || 0,
      markdownScrollTop: options.markdownScrollTop || 0,
      scrollState: options.scrollState || null,
      wysiwygTextOffset: options.wysiwygTextOffset || 0,
      wysiwygScrollTop: options.wysiwygScrollTop || 0
    };
  }

  ME.documentSession = {
    create: createDocumentSession
  };
}());
