(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var nextSessionId = 1;

  function createDocumentSession(options) {
    options = options || {};

    return {
      id: options.id || "session-" + nextSessionId++,
      title: options.title || (options.fileHandle && options.fileHandle.name) || "Untitled.md",
      markdownText: String(options.markdownText || ""),
      fileHandle: options.fileHandle || null,
      dirty: Boolean(options.dirty),
      history: options.history || null,
      activeMode: options.activeMode || "wysiwyg",
      scrollState: options.scrollState || null
    };
  }

  ME.documentSession = {
    create: createDocumentSession
  };
}());
