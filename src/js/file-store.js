(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  var supportedTextFileTypes = ME.documentType.getFilePickerTypes();

  function localProvider() {
    return ME.storageProviders && ME.storageProviders.get("local-fsa") || ME.localFilesystemProvider || null;
  }

  function providerForSession(session) {
    return ME.storageProviders && ME.storageProviders.getForSession(session) || localProvider();
  }

  function providerForResource(resource) {
    return ME.storageProviders && ME.storageProviders.get(resource && resource.providerId) || localProvider();
  }

  function isSupported() {
    var provider = localProvider();

    return Boolean(provider && provider.isAvailable());
  }

  function isAbortError(error) {
    return error && error.name === "AbortError";
  }

  function displayName(fileHandle, fallback) {
    return (fileHandle && fileHandle.name) || fallback || "Untitled.md";
  }

  function supportedFileName(name, typeId) {
    var descriptor = ME.documentType && ME.documentType.getDocumentTypeById(typeId || "markdown");
    var fallback = ME.documentType && ME.documentType.getDefaultFileName
      ? ME.documentType.getDefaultFileName(typeId || "markdown")
      : "Untitled.md";

    name = String(name || fallback).trim() || fallback;
    if (ME.documentType && ME.documentType.isSupportedFileName(name)) {
      return name;
    }
    return name + (descriptor ? descriptor.defaultExtension : ".md");
  }

  function textMetadata(text, hasUtf8Bom) {
    var source = String(text || "");

    return {
      markdownText: source.replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
      preferredLineEnding: /\r\n/.test(source) ? "\r\n" : "\n",
      hasUtf8Bom: Boolean(hasUtf8Bom),
      hasFinalNewline: /(?:\r\n|\r|\n)$/.test(source)
    };
  }

  async function readTextDocument(file) {
    var bytes;
    var hasUtf8Bom = false;
    var text;

    if (file && typeof file.arrayBuffer === "function" && typeof TextDecoder === "function") {
      bytes = new Uint8Array(await file.arrayBuffer());
      hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
      text = new TextDecoder("utf-8").decode(hasUtf8Bom ? bytes.slice(3) : bytes);
    } else {
      text = await file.text();
      hasUtf8Bom = text.charCodeAt(0) === 0xfeff;
      if (hasUtf8Bom) {
        text = text.slice(1);
      }
    }

    return textMetadata(text, hasUtf8Bom);
  }

  function serializeSessionText(session) {
    var text = String(session && session.markdownText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    if (session && session.preferredLineEnding === "\r\n") {
      text = text.replace(/\n/g, "\r\n");
    }
    return (session && session.hasUtf8Bom ? "\ufeff" : "") + text;
  }

  function applyDocumentTypeToSession(session, fileName) {
    var descriptor = ME.documentType && ME.documentType.getDocumentTypeForName(fileName);
    var previousDocumentType = session.documentType;

    if (!descriptor) {
      throw new Error("Choose a supported document extension.");
    }

    session.documentType = descriptor.id;
    session.extension = ME.documentType.extensionForName(fileName);
    session.sourceOnly = !descriptor.allowWysiwyg;
    if (session.sourceOnly) {
      session.editorMode = "markdown";
      session.activeMode = "markdown";
      session.activeEditorSource = "markdown";
    }
    if (!descriptor.validationType || previousDocumentType !== descriptor.id) {
      session.validationState = { status: "not-applicable", message: "", line: null, column: null };
    } else {
      session.validationState = session.validationState || {
        status: "not-applicable",
        message: "",
        line: null,
        column: null
      };
    }

    return descriptor;
  }

  async function ensurePermission(fileHandle, mode) {
    var provider = localProvider();

    return provider && provider.ensurePermission
      ? provider.ensurePermission(fileHandle, mode || "read")
      : false;
  }

  async function writeTextDocument(fileHandle, text) {
    var provider = localProvider();

    if (!provider || !provider.writeHandle) {
      throw new Error("Local file access is not supported in this browser.");
    }
    return provider.writeHandle(fileHandle, String(text || ""));
  }

  async function contentFromProviderResult(result) {
    var text;

    if (result && result.file) {
      return readTextDocument(result.file);
    }
    if (result && result.bytes) {
      return readTextDocument({
        arrayBuffer: function () { return Promise.resolve(result.bytes); }
      });
    }
    text = String(result && result.text || "");
    if (text.charCodeAt(0) === 0xfeff) {
      return textMetadata(text.slice(1), true);
    }
    return textMetadata(text, false);
  }

  async function openResource(resource, options) {
    var provider = providerForResource(resource);
    var result;
    var title;
    var descriptor;
    var content;

    if (!provider || typeof provider.readText !== "function") {
      throw new Error("The storage provider for this document is unavailable.");
    }
    result = await provider.readText(resource, options || {});
    resource = result.resource || resource;
    title = resource.displayName || resource.path && resource.path.split("/").pop() || "Untitled.md";
    descriptor = ME.documentType && ME.documentType.getDocumentTypeForName(title);
    if (!descriptor) {
      throw new Error("This file type is not supported.");
    }
    content = await contentFromProviderResult(result);
    return {
      fileHandle: result.fileHandle || provider.getLegacyFileHandle && provider.getLegacyFileHandle(resource) || null,
      storageProviderId: resource.providerId,
      storageResource: resource,
      storageRevision: result.revision || resource.revision,
      title: title,
      markdownText: content.markdownText,
      documentType: descriptor.id,
      extension: ME.documentType.extensionForName(title),
      sourceOnly: !descriptor.allowWysiwyg,
      preferredLineEnding: content.preferredLineEnding,
      hasUtf8Bom: content.hasUtf8Bom,
      hasFinalNewline: content.hasFinalNewline
    };
  }

  async function openTextDocument(options) {
    var provider = localProvider();
    var opened;
    var resource;
    var fileHandle;
    var title;
    var descriptor;
    var content;

    if (!provider || typeof provider.openDocument !== "function") {
      throw new Error("Local file access is not supported in this browser.");
    }
    opened = await provider.openDocument({
      types: supportedTextFileTypes,
      options: options || {}
    });
    resource = opened.resource;
    fileHandle = opened.fileHandle || provider.getLegacyFileHandle && provider.getLegacyFileHandle(resource) || null;
    title = resource && resource.displayName || displayName(fileHandle, opened.file && opened.file.name);
    descriptor = ME.documentType && ME.documentType.getDocumentTypeForName(title);
    if (!descriptor) {
      throw new Error("This file type is not supported.");
    }
    content = await contentFromProviderResult(opened);

    return {
      fileHandle: fileHandle,
      storageProviderId: provider.id,
      storageResource: resource,
      storageRevision: opened.revision || resource && resource.revision,
      title: title,
      markdownText: content.markdownText,
      documentType: descriptor.id,
      extension: ME.documentType.extensionForName(title),
      sourceOnly: !descriptor.allowWysiwyg,
      preferredLineEnding: content.preferredLineEnding,
      hasUtf8Bom: content.hasUtf8Bom,
      hasFinalNewline: content.hasFinalNewline
    };
  }

  async function saveSession(session, options) {
    var provider = providerForSession(session);
    var result;

    options = options || {};
    if (!provider) {
      throw new Error("The storage provider for this document is unavailable.");
    }
    if (!session.storageResource && session.fileHandle && provider.resourceForHandle) {
      session.storageResource = provider.resourceForHandle(session.fileHandle, {
        workspaceId: session.workspaceId,
        path: session.workspacePath,
        displayName: session.title
      });
      session.storageProviderId = provider.id;
    }
    if (!session.storageResource && !session.fileHandle) {
      return saveSessionAs(session);
    }

    result = await provider.saveDocument(session, {
      force: Boolean(options.force),
      text: serializeSessionText(session)
    });
    session.storageProviderId = provider.id;
    session.storageResource = result.resource || session.storageResource;
    session.storageRevision = result.revision || session.storageResource && session.storageResource.revision || null;
    session.fileHandle = result.fileHandle || provider.getLegacyFileHandle && provider.getLegacyFileHandle(session.storageResource) || session.fileHandle;
    session.title = session.storageResource && session.storageResource.displayName || displayName(session.fileHandle, session.title);
    applyDocumentTypeToSession(session, session.title);
    session.dirty = false;

    return {
      fileHandle: session.fileHandle,
      storageResource: session.storageResource,
      title: session.title
    };
  }

  async function saveSessionAs(session, options) {
    var provider = providerForSession(session) || localProvider();
    var result;
    var nextTitle;
    var nextDescriptor;

    options = options || {};
    if (!provider || typeof provider.saveDocumentAs !== "function") {
      throw new Error("The storage provider for this document is unavailable.");
    }
    result = await provider.saveDocumentAs(session, {
      path: options.path,
      suggestedName: supportedFileName(session.title, session.documentType),
      text: serializeSessionText(session),
      types: supportedTextFileTypes
    });
    nextTitle = result.resource && result.resource.displayName || displayName(result.fileHandle, session.title);
    nextDescriptor = ME.documentType && ME.documentType.getDocumentTypeForName(nextTitle);
    if (!nextDescriptor) {
      throw new Error("Choose a supported document extension.");
    }
    session.storageProviderId = provider.id;
    session.storageResource = result.resource;
    session.storageRevision = result.revision || result.resource && result.resource.revision || null;
    session.fileHandle = result.fileHandle || provider.getLegacyFileHandle && provider.getLegacyFileHandle(result.resource) || null;
    session.title = nextTitle;
    applyDocumentTypeToSession(session, nextTitle);
    session.dirty = false;

    return {
      fileHandle: session.fileHandle,
      storageResource: session.storageResource,
      title: session.title
    };
  }

  ME.fileStore = {
    applyDocumentTypeToSession: applyDocumentTypeToSession,
    ensurePermission: ensurePermission,
    isAbortError: isAbortError,
    isSupported: isSupported,
    openTextDocument: openTextDocument,
    openMarkdownFile: openTextDocument,
    openResource: openResource,
    readTextDocument: readTextDocument,
    saveSession: saveSession,
    saveSessionAs: saveSessionAs,
    serializeSessionText: serializeSessionText,
    supportedFileName: supportedFileName,
    supportedTextFileTypes: supportedTextFileTypes,
    writeTextDocument: writeTextDocument,
    writeMarkdown: writeTextDocument
  };
}());
