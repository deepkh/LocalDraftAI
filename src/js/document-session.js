(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var nextSessionId = 1;

  function createDocumentSession(options) {
    var descriptor;
    var documentTypeId;
    var extension;
    var sourceOnly;
    var storageProviderId;
    var storageResource;
    var storageRevision;
    var text;
    var title;

    options = options || {};
    title = options.title || (options.fileHandle && options.fileHandle.name) || (
      ME.documentType && ME.documentType.getDefaultFileName(options.documentType || "markdown")
    ) || "Untitled.md";

    descriptor = ME.documentType && (
      ME.documentType.getDocumentTypeForName(title) ||
      ME.documentType.getDocumentTypeById(options.documentType)
    );
    descriptor = descriptor || (ME.documentType && ME.documentType.getDocumentTypeById("markdown"));
    documentTypeId = descriptor ? descriptor.id : options.documentType || "markdown";
    extension = (ME.documentType && ME.documentType.extensionForName(
      title
    )) || options.extension || (descriptor && descriptor.defaultExtension) || ".md";
    sourceOnly = options.sourceOnly != null
      ? Boolean(options.sourceOnly)
      : Boolean(descriptor && !descriptor.allowWysiwyg);
    text = String(options.markdownText || "");
    storageProviderId = String(
      options.storageProviderId ||
      options.storageResource && options.storageResource.providerId ||
      "local-fsa"
    );
    storageResource = options.storageResource || null;
    if (!storageResource && options.fileHandle && ME.storageResource) {
      storageResource = ME.storageResource.create({
        providerId: storageProviderId,
        workspaceId: options.workspaceId || "",
        path: options.workspacePath || "",
        displayName: title,
        opaque: { fileHandle: options.fileHandle },
        revision: options.storageRevision
      });
    }
    storageRevision = options.storageRevision || storageResource && storageResource.revision || null;

    var activeMode = sourceOnly || options.editorMode === "markdown" || options.activeEditorSource === "markdown" || options.activeMode === "markdown"
      ? "markdown"
      : "wysiwyg";

    return {
      id: options.id || "session-" + nextSessionId++,
      title: title,
      // Compatibility field: this stores raw document text for every supported document type.
      markdownText: text,
      documentType: documentTypeId,
      extension: extension.toLowerCase(),
      sourceOnly: sourceOnly,
      validationState: options.validationState || {
        status: "not-applicable",
        message: "",
        line: null,
        column: null
      },
      preferredLineEnding: options.preferredLineEnding === "\r\n" ? "\r\n" : "\n",
      hasUtf8Bom: Boolean(options.hasUtf8Bom),
      hasFinalNewline: options.hasFinalNewline != null ? Boolean(options.hasFinalNewline) : /\n$/.test(text),
      storageProviderId: storageProviderId,
      storageResource: storageResource,
      storageRevision: storageRevision,
      fileHandle: options.fileHandle || null,
      workspaceFileHandle: options.workspaceFileHandle || options.fileHandle || null,
      workspaceDirHandle: options.workspaceDirHandle || null,
      workspaceFolder: options.workspaceFolder || options.workspaceDirHandle || null,
      workspaceId: options.workspaceId || "",
      workspacePath: options.workspacePath || "",
      workspaceRootName: options.workspaceRootName || "",
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
      softWrapEnabled: options.softWrapEnabled == null ? true : Boolean(options.softWrapEnabled),
      scrollState: options.scrollState || null,
      wysiwygTextOffset: options.wysiwygTextOffset || 0,
      wysiwygScrollTop: options.wysiwygScrollTop || 0
    };
  }

  ME.documentSession = {
    create: createDocumentSession
  };
}());
