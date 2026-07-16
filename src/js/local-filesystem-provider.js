(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var nextWorkspaceId = 1;

  function storageError(code, message, error) {
    if (ME.storageProviderErrors) {
      return ME.storageProviderErrors.create(code, message, {
        details: error ? { causeName: String(error.name || "Error") } : {}
      });
    }
    error = new Error(message);
    error.name = "StorageProviderError";
    error.code = code;
    error.retryable = false;
    error.details = {};
    return error;
  }

  function normalizeError(error, fallbackMessage) {
    var codeByName = {
      AbortError: "PROVIDER_UNAVAILABLE",
      NotAllowedError: "PERMISSION_DENIED",
      SecurityError: "PERMISSION_DENIED",
      NotFoundError: "RESOURCE_NOT_FOUND",
      TypeMismatchError: "INVALID_PATH",
      InvalidModificationError: "RESOURCE_ALREADY_EXISTS",
      NoModificationAllowedError: "PERMISSION_DENIED"
    };

    if (error && error.name === "StorageProviderError") {
      return error;
    }
    return storageError(codeByName[error && error.name] || "PROVIDER_UNAVAILABLE", error && error.message || fallbackMessage, error);
  }

  function isAbortError(error) {
    return Boolean(error && (error.name === "AbortError" || error.code === "ABORTED"));
  }

  function fileAccessAvailable() {
    return typeof window.showOpenFilePicker === "function" && typeof window.showSaveFilePicker === "function";
  }

  function openFileAccessAvailable() {
    return typeof window.showOpenFilePicker === "function";
  }

  function saveFileAccessAvailable() {
    return typeof window.showSaveFilePicker === "function";
  }

  function workspaceAccessAvailable() {
    return typeof window.showDirectoryPicker === "function";
  }

  function handleFromResource(resource) {
    return resource && resource.opaque && resource.opaque.fileHandle || null;
  }

  function directoryHandleFromWorkspace(workspace) {
    return workspace && workspace.root && workspace.root.opaque && workspace.root.opaque.directoryHandle ||
      workspace && workspace.rootHandle || null;
  }

  function revisionFromFile(file) {
    return {
      size: Math.max(0, Number(file && file.size) || 0),
      mtimeMs: Math.max(0, Number(file && file.lastModified) || 0),
      hash: ""
    };
  }

  function resourceForHandle(fileHandle, options) {
    options = options || {};
    if (!ME.storageResource) {
      return {
        providerId: "local-fsa",
        workspaceId: options.workspaceId || "",
        path: options.path || "",
        displayName: options.displayName || fileHandle && fileHandle.name || "",
        opaque: { fileHandle: fileHandle },
        revision: options.revision || { size: 0, mtimeMs: 0, hash: "" }
      };
    }
    return ME.storageResource.create({
      providerId: "local-fsa",
      workspaceId: options.workspaceId || "",
      path: options.path || "",
      displayName: options.displayName || fileHandle && fileHandle.name || "",
      opaque: { fileHandle: fileHandle },
      revision: options.revision
    });
  }

  function createWorkspaceDescriptor(directoryHandle, options) {
    var name;
    var generatedId;

    options = options || {};
    name = String(options.name || directoryHandle && directoryHandle.name || "Workspace");
    generatedId = window.crypto && typeof window.crypto.randomUUID === "function"
      ? "local-workspace-" + window.crypto.randomUUID()
      : "local-workspace-" + Date.now() + "-" + nextWorkspaceId++;
    return {
      id: String(options.id || generatedId),
      providerId: "local-fsa",
      name: name,
      root: {
        displayPath: String(options.displayPath || name),
        opaque: { directoryHandle: directoryHandle }
      },
      authority: {
        type: "local",
        connectionId: "",
        label: "Local"
      },
      capabilities: {
        read: true,
        write: true,
        createFile: true,
        createDirectory: true,
        rename: true,
        duplicate: true,
        search: true,
        binaryAssets: true,
        watch: false
      }
    };
  }

  async function queryPermission(handle, mode) {
    if (!handle || typeof handle.queryPermission !== "function") {
      return "granted";
    }
    return handle.queryPermission({ mode: mode || "read" });
  }

  async function requestPermission(handle, mode) {
    var permission;

    if (!handle) {
      return "denied";
    }
    permission = await queryPermission(handle, mode);
    if (permission === "granted" || typeof handle.requestPermission !== "function") {
      return permission;
    }
    return handle.requestPermission({ mode: mode || "read" });
  }

  async function ensurePermission(handle, mode) {
    var permission;

    try {
      permission = await requestPermission(handle, mode);
      return permission === "granted";
    } catch (error) {
      return (await queryPermission(handle, mode)) === "granted";
    }
  }

  async function writeHandle(fileHandle, value) {
    var writable;

    if (!(await ensurePermission(fileHandle, "readwrite"))) {
      throw storageError("PERMISSION_DENIED", "Permission was not granted for this file.");
    }
    try {
      writable = await fileHandle.createWritable();
      await writable.write(value == null ? "" : value);
      await writable.close();
    } catch (error) {
      throw normalizeError(error, "Could not write this file.");
    }
  }

  async function directoryForPath(workspace, directoryPath, options) {
    var current = directoryHandleFromWorkspace(workspace);
    var normalized = ME.storageResource
      ? ME.storageResource.normalizeRelativePath(directoryPath, { allowEmpty: true })
      : String(directoryPath || "");
    var parts = normalized ? normalized.split("/") : [];
    var i;

    if (!current) {
      throw storageError("RESOURCE_NOT_FOUND", "The local workspace is no longer available.");
    }
    for (i = 0; i < parts.length; i += 1) {
      try {
        current = await current.getDirectoryHandle(parts[i], options);
      } catch (error) {
        throw normalizeError(error, "Could not open the workspace folder.");
      }
    }
    return current;
  }

  function splitPath(relativePath) {
    var normalized = ME.storageResource.normalizeRelativePath(relativePath, { allowEmpty: false });
    var parts = normalized.split("/");

    return {
      directoryPath: parts.slice(0, -1).join("/"),
      name: parts[parts.length - 1],
      path: normalized
    };
  }

  async function fileHandleForPath(workspace, relativePath, options) {
    var split = splitPath(relativePath);
    var directory = await directoryForPath(workspace, split.directoryPath);

    try {
      return await directory.getFileHandle(split.name, options);
    } catch (error) {
      throw normalizeError(error, "Could not open the local file.");
    }
  }

  async function getExistingFile(directory, name) {
    try {
      return await directory.getFileHandle(name, { create: false });
    } catch (error) {
      if (error && error.name === "NotFoundError") {
        return null;
      }
      throw normalizeError(error, "Could not check the destination file.");
    }
  }

  async function getExistingDirectory(directory, name) {
    try {
      return await directory.getDirectoryHandle(name, { create: false });
    } catch (error) {
      if (error && error.name === "NotFoundError") {
        return null;
      }
      throw normalizeError(error, "Could not check the destination folder.");
    }
  }

  async function openDocument(options) {
    var handles;
    var fileHandle;
    var file;

    options = options || {};
    if (!openFileAccessAvailable()) {
      throw storageError("PROVIDER_UNAVAILABLE", "Local file access is not supported in this browser.");
    }
    try {
      handles = await window.showOpenFilePicker({
        multiple: false,
        types: options.types || ME.documentType.getFilePickerTypes()
      });
      fileHandle = handles[0];
      file = await fileHandle.getFile();
      return {
        file: file,
        fileHandle: fileHandle,
        resource: resourceForHandle(fileHandle, {
          displayName: fileHandle.name || file.name,
          revision: revisionFromFile(file)
        })
      };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      throw normalizeError(error, "Could not open the local file.");
    }
  }

  async function saveDocument(session, options) {
    var resource = session && session.storageResource;
    var fileHandle = handleFromResource(resource) || session && session.fileHandle;
    var file;

    if (!fileHandle) {
      return saveDocumentAs(session, options);
    }
    await writeHandle(fileHandle, options && options.text);
    file = await fileHandle.getFile();
    resource = resourceForHandle(fileHandle, {
      workspaceId: resource && resource.workspaceId || session && session.workspaceId || "",
      path: resource && resource.path || session && session.workspacePath || "",
      displayName: fileHandle.name || session && session.title,
      revision: revisionFromFile(file)
    });
    return { fileHandle: fileHandle, resource: resource, revision: resource.revision };
  }

  async function saveDocumentAs(session, options) {
    var fileHandle;
    var file;
    var resource;

    options = options || {};
    if (!saveFileAccessAvailable()) {
      throw storageError("PROVIDER_UNAVAILABLE", "Local file access is not supported in this browser.");
    }
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: options.suggestedName,
        types: options.types || ME.documentType.getFilePickerTypes()
      });
      await writeHandle(fileHandle, options.text);
      file = await fileHandle.getFile();
      resource = resourceForHandle(fileHandle, {
        displayName: fileHandle.name || file.name,
        revision: revisionFromFile(file)
      });
      return { fileHandle: fileHandle, resource: resource, revision: resource.revision };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      throw normalizeError(error, "Could not save the local file.");
    }
  }

  async function openWorkspace(options) {
    var handle;

    options = options || {};
    if (!workspaceAccessAvailable()) {
      throw storageError("PROVIDER_UNAVAILABLE", "Local folder access is not supported in this browser.");
    }
    try {
      handle = await window.showDirectoryPicker({ mode: options.mode || "read" });
      return createWorkspaceDescriptor(handle, options);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      throw normalizeError(error, "Could not open the local workspace.");
    }
  }

  async function listDirectory(workspace, relativePath) {
    var directory = await directoryForPath(workspace, relativePath || "");
    var iterator;
    var next;
    var entries = [];
    var base = String(relativePath || "");

    if (typeof directory.entries !== "function") {
      return [];
    }
    iterator = directory.entries();
    while ((next = await iterator.next()) && !next.done) {
      entries.push({
        kind: next.value[1].kind,
        name: next.value[0],
        path: [base, next.value[0]].filter(Boolean).join("/"),
        fileHandle: next.value[1].kind === "file" ? next.value[1] : null,
        directoryHandle: next.value[1].kind === "directory" ? next.value[1] : null,
        resource: next.value[1].kind === "file" ? resourceForHandle(next.value[1], {
          workspaceId: workspace.id,
          path: [base, next.value[0]].filter(Boolean).join("/"),
          displayName: next.value[0]
        }) : null,
        opaque: { handle: next.value[1] }
      });
    }
    return entries;
  }

  async function stat(workspace, relativePath) {
    var handle = await fileHandleForPath(workspace, relativePath, { create: false });
    var file = await handle.getFile();

    return {
      kind: "file",
      path: relativePath,
      revision: revisionFromFile(file),
      resource: resourceForHandle(handle, {
        workspaceId: workspace.id,
        path: relativePath,
        displayName: handle.name,
        revision: revisionFromFile(file)
      })
    };
  }

  async function readText(resource) {
    var handle = handleFromResource(resource);
    var file;

    if (!handle) {
      throw storageError("RESOURCE_NOT_FOUND", "The local file handle is unavailable.");
    }
    try {
      if (!(await ensurePermission(handle, "read"))) {
        throw storageError("PERMISSION_DENIED", "Permission was not granted for this file.");
      }
      file = await handle.getFile();
      if (ME.storageResource) {
        ME.storageResource.updateRevision(resource, revisionFromFile(file));
      }
      return { file: file, fileHandle: handle, resource: resource, revision: revisionFromFile(file) };
    } catch (error) {
      throw normalizeError(error, "Could not read the local file.");
    }
  }

  async function writeText(resource, serializedText) {
    var handle = handleFromResource(resource);
    var file;

    if (!handle) {
      throw storageError("RESOURCE_NOT_FOUND", "The local file handle is unavailable.");
    }
    await writeHandle(handle, String(serializedText == null ? "" : serializedText));
    file = await handle.getFile();
    if (ME.storageResource) {
      ME.storageResource.updateRevision(resource, revisionFromFile(file));
    }
    return { resource: resource, revision: revisionFromFile(file) };
  }

  async function createTextFile(workspace, directoryPath, name, text) {
    var directory = await directoryForPath(workspace, directoryPath || "");
    var existing = await getExistingFile(directory, name);
    var handle;
    var path;

    if (existing) {
      throw storageError("RESOURCE_ALREADY_EXISTS", "A file with this name already exists.");
    }
    try {
      handle = await directory.getFileHandle(name, { create: true });
      await writeHandle(handle, text == null ? "" : text);
      path = [directoryPath, name].filter(Boolean).join("/");
      return {
        fileHandle: handle,
        name: name,
        path: path,
        resource: resourceForHandle(handle, {
          workspaceId: workspace.id,
          path: path,
          displayName: name
        })
      };
    } catch (error) {
      throw normalizeError(error, "Could not create the local file.");
    }
  }

  async function createDirectory(workspace, directoryPath, name) {
    var directory = await directoryForPath(workspace, directoryPath || "");
    var existing = await getExistingDirectory(directory, name);
    var handle;
    var path;

    if (existing) {
      throw storageError("RESOURCE_ALREADY_EXISTS", "A folder with this name already exists.");
    }
    try {
      handle = await directory.getDirectoryHandle(name, { create: true });
      path = [directoryPath, name].filter(Boolean).join("/");
      return { folderHandle: handle, name: name, path: path };
    } catch (error) {
      throw normalizeError(error, "Could not create the local folder.");
    }
  }

  async function uniqueCopyName(directory, requestedName) {
    var extension = ME.documentType.extensionForName(requestedName);
    var stem = extension ? requestedName.slice(0, -extension.length) : requestedName;
    var candidate = requestedName;
    var index = 1;

    while (await getExistingFile(directory, candidate)) {
      index += 1;
      candidate = stem + " " + index + extension;
    }
    return candidate;
  }

  async function duplicate(workspace, relativePath, requestedName) {
    var split = splitPath(relativePath);
    var directory = await directoryForPath(workspace, split.directoryPath);
    var sourceHandle = await fileHandleForPath(workspace, relativePath, { create: false });
    var sourceFile = await sourceHandle.getFile();
    var bytes = typeof sourceFile.arrayBuffer === "function" ? await sourceFile.arrayBuffer() : await sourceFile.text();
    var name = await uniqueCopyName(directory, requestedName);
    var targetHandle = await directory.getFileHandle(name, { create: true });
    var path = [split.directoryPath, name].filter(Boolean).join("/");

    await writeHandle(targetHandle, bytes);
    return {
      fileHandle: targetHandle,
      name: name,
      path: path,
      resource: resourceForHandle(targetHandle, {
        workspaceId: workspace.id,
        path: path,
        displayName: name
      })
    };
  }

  async function rename(workspace, relativePath, newName) {
    var split = splitPath(relativePath);
    var directory = await directoryForPath(workspace, split.directoryPath);
    var sourceHandle;
    var sourceFile;
    var bytes;
    var targetHandle;
    var path;

    if (newName === split.name) {
      sourceHandle = await fileHandleForPath(workspace, relativePath, { create: false });
      return {
        fileHandle: sourceHandle,
        name: newName,
        path: relativePath,
        resource: resourceForHandle(sourceHandle, {
          workspaceId: workspace.id,
          path: relativePath,
          displayName: newName
        }),
        unchanged: true
      };
    }
    if (typeof directory.removeEntry !== "function") {
      throw storageError("OPERATION_UNSUPPORTED", "Rename is not supported in this browser yet. Use Duplicate, then remove the old file manually.");
    }
    if (await getExistingFile(directory, newName)) {
      throw storageError("RESOURCE_ALREADY_EXISTS", "A file with this name already exists.");
    }
    sourceHandle = await fileHandleForPath(workspace, relativePath, { create: false });
    sourceFile = await sourceHandle.getFile();
    bytes = typeof sourceFile.arrayBuffer === "function" ? await sourceFile.arrayBuffer() : await sourceFile.text();
    targetHandle = await directory.getFileHandle(newName, { create: true });
    await writeHandle(targetHandle, bytes);
    await targetHandle.getFile();
    await directory.removeEntry(split.name);
    path = [split.directoryPath, newName].filter(Boolean).join("/");
    return {
      fileHandle: targetHandle,
      name: newName,
      path: path,
      resource: resourceForHandle(targetHandle, {
        workspaceId: workspace.id,
        path: path,
        displayName: newName
      })
    };
  }

  async function searchText(workspace, query, options) {
    var stack = [""];
    var results = [];
    var maxResults = Math.max(1, Number(options && options.maxResults) || 100);
    var maxMatchesPerFile = Math.max(1, Number(options && options.maxMatchesPerFile) || 5);
    var normalizedQuery = String(query || "").trim();
    var entries;
    var entry;
    var handle;
    var file;
    var text;
    var matches;
    var i;
    var j;

    if (options && options.files && ME.workspaceSearch && ME.workspaceSearch.searchFiles) {
      return ME.workspaceSearch.searchFiles(options.files, query, {
        maxMatchesPerFile: maxMatchesPerFile,
        maxResults: maxResults,
        provider: provider,
        workspace: workspace
      });
    }

    while (stack.length && results.length < maxResults) {
      entries = await listDirectory(workspace, stack.pop());
      for (i = 0; i < entries.length && results.length < maxResults; i += 1) {
        entry = entries[i];
        if (entry.kind === "directory") {
          stack.push(entry.path);
          continue;
        }
        if (!(ME.documentType && ME.documentType.isSupportedFileName(entry.name))) {
          continue;
        }
        handle = entry.opaque.handle;
        file = await handle.getFile();
        text = await file.text();
        matches = ME.workspaceSearch && ME.workspaceSearch.findLineMatches
          ? ME.workspaceSearch.findLineMatches(text, normalizedQuery, { maxMatchesPerFile: maxMatchesPerFile })
          : [];
        for (j = 0; j < matches.length && results.length < maxResults; j += 1) {
          results.push({
            column: matches[j].column,
            documentType: ME.documentType.getDocumentTypeForName(entry.name).id,
            filename: entry.name,
            line: matches[j].line,
            path: entry.path,
            preview: matches[j].preview,
            text: matches[j].text
          });
        }
      }
    }
    return {
      limited: results.length >= maxResults,
      query: normalizedQuery,
      results: results
    };
  }

  async function readBinary(resource) {
    var result = await readText(resource);
    return {
      bytes: await result.file.arrayBuffer(),
      mimeType: result.file.type || "application/octet-stream",
      resource: resource,
      revision: result.revision
    };
  }

  async function writeBinary(workspace, relativePath, bytes) {
    var handle = await fileHandleForPath(workspace, relativePath, { create: true });
    var resource = resourceForHandle(handle, {
      workspaceId: workspace.id,
      path: relativePath,
      displayName: splitPath(relativePath).name
    });

    await writeHandle(handle, bytes);
    return stat(workspace, relativePath).then(function (result) {
      resource.revision = result.revision;
      return { resource: resource, revision: result.revision };
    });
  }

  async function resolveResource(workspace, resource) {
    var rootHandle = directoryHandleFromWorkspace(workspace);
    var fileHandle = handleFromResource(resource);
    var parts;

    if (!rootHandle || !fileHandle || typeof rootHandle.resolve !== "function") {
      return "";
    }
    parts = await rootHandle.resolve(fileHandle);
    return parts && parts.length ? parts.join("/") : "";
  }

  async function sameResource(left, right) {
    var leftHandle;
    var rightHandle;

    if (ME.storageResource && ME.storageResource.sameResource(left, right)) {
      return true;
    }
    leftHandle = handleFromResource(left);
    rightHandle = handleFromResource(right);
    if (!leftHandle || !rightHandle) {
      return false;
    }
    if (leftHandle === rightHandle) {
      return true;
    }
    if (typeof leftHandle.isSameEntry === "function") {
      try {
        return await leftHandle.isSameEntry(rightHandle);
      } catch (error) {
        return false;
      }
    }
    return false;
  }

  function getCapabilities(context) {
    return context && context.capabilities || {
      read: true,
      write: true,
      createFile: true,
      createDirectory: true,
      rename: true,
      duplicate: true,
      search: true,
      binaryAssets: true,
      watch: false
    };
  }

  var provider = {
    id: "local-fsa",
    label: "Local Files",
    closeWorkspace: function () { return Promise.resolve(); },
    createDirectory: createDirectory,
    createTextFile: createTextFile,
    createWorkspaceDescriptor: createWorkspaceDescriptor,
    duplicate: duplicate,
    ensurePermission: ensurePermission,
    getCapabilities: getCapabilities,
    getLegacyFileHandle: handleFromResource,
    getLegacyWorkspaceHandle: directoryHandleFromWorkspace,
    isAbortError: isAbortError,
    isAvailable: fileAccessAvailable,
    isWorkspaceAvailable: workspaceAccessAvailable,
    listDirectory: listDirectory,
    openDocument: openDocument,
    openWorkspace: openWorkspace,
    queryPermission: queryPermission,
    readBinary: readBinary,
    readText: readText,
    rename: rename,
    requestPermission: requestPermission,
    resolveResource: resolveResource,
    resourceForHandle: resourceForHandle,
    sameResource: sameResource,
    saveDocument: saveDocument,
    saveDocumentAs: saveDocumentAs,
    searchText: searchText,
    stat: stat,
    writeBinary: writeBinary,
    writeHandle: writeHandle,
    writeText: writeText
  };

  ME.localFilesystemProvider = provider;
}());
