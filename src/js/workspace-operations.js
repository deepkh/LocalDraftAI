(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function hasUnsafePathSeparator(name) {
    return /[\\/]/.test(String(name || ""));
  }

  function extensionForName(name) {
    var match = String(name || "").match(/(\.[^.]+)$/);

    return match ? match[1].toLowerCase() : "";
  }

  function ensureMarkdownExtension(name) {
    var trimmed = String(name || "").trim();

    if (!extensionForName(trimmed)) {
      return trimmed + ".md";
    }

    return trimmed;
  }

  function validateFileName(name, options) {
    var trimmed = String(name || "").trim();
    var normalized;
    var extension;

    options = options || {};
    if (!trimmed) {
      return { ok: false, reason: "empty", message: "Enter a file name." };
    }
    if (trimmed === "." || trimmed === ".." || hasUnsafePathSeparator(trimmed)) {
      return { ok: false, reason: "unsafe", message: "Use a file name without slashes." };
    }

    normalized = options.enforceMarkdownExtension === false ? trimmed : ensureMarkdownExtension(trimmed);
    extension = extensionForName(normalized);
    if (extension && !/^\.(md|markdown)$/i.test(extension) && !options.allowNonMarkdownExtension) {
      return {
        ok: false,
        normalizedName: normalized,
        reason: "nonMarkdownExtension",
        message: "Use a .md or .markdown file name."
      };
    }

    return {
      ok: true,
      normalizedName: normalized
    };
  }

  function validateFolderName(name) {
    var trimmed = String(name || "").trim();

    if (!trimmed) {
      return { ok: false, reason: "empty", message: "Enter a folder name." };
    }
    if (trimmed === "." || trimmed === ".." || hasUnsafePathSeparator(trimmed)) {
      return { ok: false, reason: "unsafe", message: "Use a folder name without slashes." };
    }

    return {
      ok: true,
      normalizedName: trimmed
    };
  }

  function dirname(path) {
    return ME.workspaceRelated ? ME.workspaceRelated.dirname(path) : String(path || "").split("/").slice(0, -1).join("/");
  }

  function basename(path) {
    return ME.workspaceRelated ? ME.workspaceRelated.basename(path) : String(path || "").split("/").pop();
  }

  function joinPath(left, right) {
    return [left, right].filter(Boolean).join("/");
  }

  async function directoryForPath(rootHandle, directoryPath) {
    var current = rootHandle;
    var parts = String(directoryPath || "").split("/").filter(Boolean);
    var i;

    for (i = 0; i < parts.length; i += 1) {
      current = await current.getDirectoryHandle(parts[i]);
    }

    return current;
  }

  async function ensureReadWrite(handle) {
    if (ME.fileStore && typeof ME.fileStore.ensurePermission === "function") {
      if (!(await ME.fileStore.ensurePermission(handle, "readwrite"))) {
        throw new Error("Permission was not granted for this workspace.");
      }
    }
  }

  async function writeText(fileHandle, text) {
    var writable = await fileHandle.createWritable();

    await writable.write(String(text || ""));
    await writable.close();
  }

  async function createMarkdownFile(options) {
    var rootHandle = options.rootHandle;
    var directoryPath = options.directoryPath || "";
    var validation = validateFileName(options.name, {
      allowNonMarkdownExtension: options.allowNonMarkdownExtension,
      enforceMarkdownExtension: true
    });
    var directoryHandle;
    var fileHandle;

    if (!validation.ok) {
      throw new Error(validation.message);
    }

    await ensureReadWrite(rootHandle);
    directoryHandle = await directoryForPath(rootHandle, directoryPath);
    try {
      await directoryHandle.getFileHandle(validation.normalizedName, { create: false });
      throw new Error("A file with this name already exists.");
    } catch (error) {
      if (error && error.name !== "NotFoundError") {
        throw error;
      }
    }

    fileHandle = await directoryHandle.getFileHandle(validation.normalizedName, { create: true });
    await writeText(fileHandle, options.initialText || "");

    return {
      fileHandle: fileHandle,
      name: validation.normalizedName,
      path: joinPath(directoryPath, validation.normalizedName)
    };
  }

  async function createFolder(options) {
    var rootHandle = options.rootHandle;
    var directoryPath = options.directoryPath || "";
    var validation = validateFolderName(options.name);
    var directoryHandle;
    var folderHandle;

    if (!validation.ok) {
      throw new Error(validation.message);
    }

    await ensureReadWrite(rootHandle);
    directoryHandle = await directoryForPath(rootHandle, directoryPath);
    try {
      await directoryHandle.getDirectoryHandle(validation.normalizedName, { create: false });
      throw new Error("A folder with this name already exists.");
    } catch (error) {
      if (error && error.name !== "NotFoundError") {
        throw error;
      }
    }

    folderHandle = await directoryHandle.getDirectoryHandle(validation.normalizedName, { create: true });
    return {
      folderHandle: folderHandle,
      name: validation.normalizedName,
      path: joinPath(directoryPath, validation.normalizedName)
    };
  }

  function suggestedDuplicateName(path) {
    var name = basename(path);
    var dir = dirname(path);
    var extension = extensionForName(name);
    var stem = extension ? name.slice(0, -extension.length) : name;

    return joinPath(dir, stem + " copy" + (extension || ".md"));
  }

  async function uniqueCopyName(directoryHandle, suggestedName) {
    var extension = extensionForName(suggestedName);
    var stem = extension ? suggestedName.slice(0, -extension.length) : suggestedName;
    var index = 1;
    var candidate = suggestedName;

    while (true) {
      try {
        await directoryHandle.getFileHandle(candidate, { create: false });
        index += 1;
        candidate = stem + " " + index + (extension || "");
      } catch (error) {
        if (error && error.name === "NotFoundError") {
          return candidate;
        }
        throw error;
      }
    }
  }

  async function duplicateMarkdownFile(options) {
    var sourcePath = options.path;
    var directoryPath = dirname(sourcePath);
    var directoryHandle;
    var sourceFile;
    var text;
    var nameValidation;
    var copyName;
    var fileHandle;

    await ensureReadWrite(options.rootHandle);
    directoryHandle = await directoryForPath(options.rootHandle, directoryPath);
    sourceFile = await options.fileHandle.getFile();
    text = await sourceFile.text();
    nameValidation = validateFileName(options.name || basename(suggestedDuplicateName(sourcePath)), {
      allowNonMarkdownExtension: false,
      enforceMarkdownExtension: true
    });
    if (!nameValidation.ok) {
      throw new Error(nameValidation.message);
    }

    copyName = await uniqueCopyName(directoryHandle, nameValidation.normalizedName);
    fileHandle = await directoryHandle.getFileHandle(copyName, { create: true });
    await writeText(fileHandle, text);

    return {
      fileHandle: fileHandle,
      name: copyName,
      path: joinPath(directoryPath, copyName)
    };
  }

  async function renameMarkdownFile(options) {
    var sourcePath = options.path;
    var directoryPath = dirname(sourcePath);
    var oldName = basename(sourcePath);
    var validation = validateFileName(options.name, {
      allowNonMarkdownExtension: false,
      enforceMarkdownExtension: true
    });
    var directoryHandle;
    var sourceFile;
    var text;
    var fileHandle;

    if (!validation.ok) {
      throw new Error(validation.message);
    }
    if (validation.normalizedName === oldName) {
      return {
        fileHandle: options.fileHandle,
        name: oldName,
        path: sourcePath,
        unchanged: true
      };
    }

    await ensureReadWrite(options.rootHandle);
    directoryHandle = await directoryForPath(options.rootHandle, directoryPath);
    if (typeof directoryHandle.removeEntry !== "function") {
      throw new Error("Rename is not supported in this browser yet. Use Duplicate, then remove the old file manually.");
    }

    try {
      await directoryHandle.getFileHandle(validation.normalizedName, { create: false });
      throw new Error("A file with this name already exists.");
    } catch (error) {
      if (error && error.name !== "NotFoundError") {
        throw error;
      }
    }

    sourceFile = await options.fileHandle.getFile();
    text = await sourceFile.text();
    fileHandle = await directoryHandle.getFileHandle(validation.normalizedName, { create: true });
    await writeText(fileHandle, text);
    await fileHandle.getFile();
    await directoryHandle.removeEntry(oldName);

    return {
      fileHandle: fileHandle,
      name: validation.normalizedName,
      path: joinPath(directoryPath, validation.normalizedName)
    };
  }

  async function copyRelativePath(path, clipboard) {
    var targetClipboard = clipboard || (window.navigator && window.navigator.clipboard);

    if (!targetClipboard || typeof targetClipboard.writeText !== "function") {
      throw new Error("Clipboard write is not available in this browser.");
    }

    await targetClipboard.writeText(String(path || ""));
    return String(path || "");
  }

  ME.workspaceOperations = {
    copyRelativePath: copyRelativePath,
    createFolder: createFolder,
    createMarkdownFile: createMarkdownFile,
    duplicateMarkdownFile: duplicateMarkdownFile,
    ensureMarkdownExtension: ensureMarkdownExtension,
    renameMarkdownFile: renameMarkdownFile,
    suggestedDuplicateName: suggestedDuplicateName,
    validateFileName: validateFileName,
    validateFolderName: validateFolderName
  };
}());
