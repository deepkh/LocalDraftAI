(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  var supportedTextFileTypes = ME.documentType.getFilePickerTypes();

  function isSupported() {
    return (
      typeof window.showOpenFilePicker === "function" &&
      typeof window.showSaveFilePicker === "function"
    );
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
    var options = { mode: mode || "read" };
    var currentPermission;
    var nextPermission;

    if (!fileHandle || typeof fileHandle.queryPermission !== "function") {
      return true;
    }

    if (typeof fileHandle.requestPermission === "function") {
      try {
        nextPermission = await fileHandle.requestPermission(options);
        if (nextPermission === "granted") {
          return true;
        }
      } catch (error) {
        currentPermission = await fileHandle.queryPermission(options);
        return currentPermission === "granted";
      }
    }

    currentPermission = await fileHandle.queryPermission(options);
    return currentPermission === "granted";
  }

  async function writeTextDocument(fileHandle, text) {
    var writable;

    if (!(await ensurePermission(fileHandle, "readwrite"))) {
      throw new Error("Permission was not granted for this file.");
    }

    writable = await fileHandle.createWritable();
    await writable.write(String(text || ""));
    await writable.close();
  }

  async function openTextDocument() {
    var handles = await window.showOpenFilePicker({
      multiple: false,
      types: supportedTextFileTypes
    });
    var fileHandle = handles[0];
    var file = await fileHandle.getFile();
    var title = displayName(fileHandle, file.name);
    var descriptor = ME.documentType && ME.documentType.getDocumentTypeForName(title);
    var content;

    if (!descriptor) {
      throw new Error("This file type is not supported.");
    }
    content = await readTextDocument(file);

    return {
      fileHandle: fileHandle,
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

  async function saveSession(session) {
    if (!session.fileHandle) {
      return saveSessionAs(session);
    }

    await writeTextDocument(session.fileHandle, serializeSessionText(session));
    session.title = displayName(session.fileHandle, session.title);
    applyDocumentTypeToSession(session, session.title);
    session.dirty = false;

    return {
      fileHandle: session.fileHandle,
      title: session.title
    };
  }

  async function saveSessionAs(session) {
    var fileHandle = await window.showSaveFilePicker({
      suggestedName: supportedFileName(session.title, session.documentType),
      types: supportedTextFileTypes
    });
    var nextTitle = displayName(fileHandle, session.title);
    var nextDescriptor = ME.documentType && ME.documentType.getDocumentTypeForName(nextTitle);

    if (!nextDescriptor) {
      throw new Error("Choose a supported document extension.");
    }
    await writeTextDocument(fileHandle, serializeSessionText(session));
    session.fileHandle = fileHandle;
    session.title = nextTitle;
    applyDocumentTypeToSession(session, nextTitle);
    session.dirty = false;

    return {
      fileHandle: fileHandle,
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
