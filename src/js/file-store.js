(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  var markdownTypes = [
    {
      description: "Markdown and text files",
      accept: {
        "text/markdown": [".md", ".markdown"],
        "text/plain": [".txt"]
      }
    }
  ];

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

  function markdownFileName(name) {
    name = String(name || "Untitled.md").trim() || "Untitled.md";
    return /\.(md|markdown|txt)$/i.test(name) ? name : name + ".md";
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

  async function writeMarkdown(fileHandle, markdownText) {
    var writable;

    if (!(await ensurePermission(fileHandle, "readwrite"))) {
      throw new Error("Permission was not granted for this file.");
    }

    writable = await fileHandle.createWritable();
    await writable.write(String(markdownText || ""));
    await writable.close();
  }

  async function openMarkdownFile() {
    var handles = await window.showOpenFilePicker({
      multiple: false,
      types: markdownTypes
    });
    var fileHandle = handles[0];
    var file = await fileHandle.getFile();
    var markdownText = await file.text();

    return {
      fileHandle: fileHandle,
      title: displayName(fileHandle, file.name),
      markdownText: markdownText
    };
  }

  async function saveSession(session) {
    if (!session.fileHandle) {
      return saveSessionAs(session);
    }

    await writeMarkdown(session.fileHandle, session.markdownText);
    session.title = displayName(session.fileHandle, session.title);
    session.dirty = false;

    return {
      fileHandle: session.fileHandle,
      title: session.title
    };
  }

  async function saveSessionAs(session) {
    var fileHandle = await window.showSaveFilePicker({
      suggestedName: markdownFileName(session.title),
      types: markdownTypes
    });

    await writeMarkdown(fileHandle, session.markdownText);
    session.fileHandle = fileHandle;
    session.title = displayName(fileHandle, session.title);
    session.dirty = false;

    return {
      fileHandle: fileHandle,
      title: session.title
    };
  }

  ME.fileStore = {
    ensurePermission: ensurePermission,
    isAbortError: isAbortError,
    isSupported: isSupported,
    openMarkdownFile: openMarkdownFile,
    saveSession: saveSession,
    saveSessionAs: saveSessionAs
  };
}());
