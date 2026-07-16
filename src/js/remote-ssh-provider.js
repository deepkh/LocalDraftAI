(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var BINARY_CHUNK_SIZE = 4 * 1024 * 1024;
  var MAXIMUM_BINARY_SIZE = 25 * 1024 * 1024;

  function storageError(code, message, options) {
    if (ME.storageProviderErrors) {
      return ME.storageProviderErrors.create(code, message, options || {});
    }
    var error = new Error(message);
    error.name = "StorageProviderError";
    error.code = code;
    error.retryable = Boolean(options && options.retryable);
    error.details = options && options.details || {};
    return error;
  }

  function unsupported(operation) {
    return Promise.reject(storageError(
      "OPERATION_UNSUPPORTED",
      operation + " is not available for Remote SSH workspaces yet."
    ));
  }

  function create(options) {
    options = options || {};
    var getBridgeClient = options.getBridgeClient || function () { return ME.activeBridgeClient || null; };

    function bridge() {
      var client = getBridgeClient();

      if (!client || typeof client.request !== "function" || client.getState && client.getState() !== "connected") {
        throw storageError("BRIDGE_UNAVAILABLE", "The LocalDraft Bridge is not connected.", { retryable: true });
      }
      return client;
    }

    function capabilities() {
      return {
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

    function splitPath(relativePath) {
      var normalized = ME.storageResource.normalizeRelativePath(relativePath, { allowEmpty: false });
      var parts = normalized.split("/");

      return {
        directoryPath: parts.slice(0, -1).join("/"),
        name: parts[parts.length - 1],
        path: normalized
      };
    }

    function resultResource(workspaceId, result, fallbackPath) {
      return resourceFor(workspaceId, result.path || fallbackPath, result.revision);
    }

    function resourceFor(workspaceId, path, revision) {
      var name = String(path || "").split("/").pop();
      var value = {
        providerId: "remote-ssh",
        workspaceId: workspaceId,
        path: path,
        displayName: name,
        opaque: { workspaceId: workspaceId },
        revision: revision || { size: 0, mtimeMs: 0, hash: "" }
      };

      return ME.storageResource ? ME.storageResource.create(value) : value;
    }

    async function openWorkspace(workspaceOptions) {
      var result;

      workspaceOptions = workspaceOptions || {};
      result = await bridge().request("workspace.open", {
        connectionId: workspaceOptions.connectionId,
        path: workspaceOptions.path
      });
      return {
        id: result.workspaceId,
        providerId: "remote-ssh",
        name: result.name || String(result.rootPath || "Remote Workspace").split("/").pop() || "Remote Workspace",
        root: {
          displayPath: result.rootPath,
          opaque: { remoteRootPath: result.rootPath }
        },
        authority: {
          type: "ssh",
          connectionId: result.connectionId || workspaceOptions.connectionId,
          label: workspaceOptions.connectionLabel || workspaceOptions.connectionId
        },
        capabilities: capabilities()
      };
    }

    async function closeWorkspace(workspace) {
      if (!workspace || !workspace.id) {
        return;
      }
      await bridge().request("workspace.close", { workspaceId: workspace.id });
    }

    async function getWorkspaceStatus(workspace) {
      if (!workspace || !workspace.id) {
        throw storageError("RESOURCE_NOT_FOUND", "The remote workspace is unavailable.");
      }
      return bridge().request("workspace.getStatus", { workspaceId: workspace.id });
    }

    async function listDirectory(workspace, relativePath) {
      var result = await bridge().request("fs.listDirectory", {
        workspaceId: workspace.id,
        path: String(relativePath || "")
      });

      return (result.entries || []).reduce(function (entries, entry) {
        var descriptor;
        var resource;

        if (entry.kind === "directory") {
          entries.push({
            kind: "directory",
            name: entry.name,
            path: entry.path,
            loaded: false,
            loading: false,
            children: []
          });
          return entries;
        }
        if (entry.kind !== "file" || !(ME.documentType && ME.documentType.isSupportedFileName(entry.name))) {
          return entries;
        }
        descriptor = ME.documentType.getDocumentTypeForName(entry.name);
        resource = resourceFor(workspace.id, entry.path, entry.revision);
        entries.push({
          kind: "file",
          name: entry.name,
          path: entry.path,
          documentType: descriptor.id,
          extension: ME.documentType.extensionForName(entry.name),
          revision: resource.revision,
          resource: resource
        });
        return entries;
      }, []);
    }

    async function stat(workspace, relativePath) {
      var entry = await bridge().request("fs.stat", {
        workspaceId: workspace.id,
        path: relativePath
      });

      if (entry.kind === "directory") {
        return entry;
      }
      entry.resource = resourceFor(workspace.id, entry.path, entry.revision);
      return entry;
    }

    async function readText(resource) {
      if (!resource || resource.providerId !== "remote-ssh" || !resource.workspaceId || !resource.path) {
        throw storageError("RESOURCE_NOT_FOUND", "The remote file resource is unavailable.");
      }
      var result = await bridge().request("fs.readText", {
        workspaceId: resource.workspaceId,
        path: resource.path
      });

      resource = resourceFor(resource.workspaceId, result.path || resource.path, result.revision);
      return {
        resource: resource,
        revision: resource.revision,
        text: result.text
      };
    }

    async function writeText(resource, serializedText, writeOptions) {
      var result;

      writeOptions = writeOptions || {};
      if (!resource || resource.providerId !== "remote-ssh" || !resource.workspaceId || !resource.path) {
        throw storageError("RESOURCE_NOT_FOUND", "The remote file resource is unavailable.");
      }
      result = await bridge().request("fs.writeText", {
        workspaceId: resource.workspaceId,
        path: resource.path,
        text: String(serializedText == null ? "" : serializedText),
        expectedRevision: writeOptions.expectedRevision || resource.revision,
        force: Boolean(writeOptions.force)
      });
      resource = resultResource(resource.workspaceId, result, resource.path);
      return { resource: resource, revision: resource.revision };
    }

    async function saveDocument(session, saveOptions) {
      var result = await writeText(session && session.storageResource, saveOptions && saveOptions.text, {
        expectedRevision: session && session.storageRevision,
        force: Boolean(saveOptions && saveOptions.force)
      });

      return result;
    }

    async function createTextFile(workspace, directoryPath, name, text) {
      var resource;
      var result = await bridge().request("fs.createTextFile", {
        workspaceId: workspace.id,
        directoryPath: String(directoryPath || ""),
        name: name,
        text: String(text == null ? "" : text)
      });
      resource = resultResource(workspace.id, result, [directoryPath, name].filter(Boolean).join("/"));

      return { name: resource.displayName, path: resource.path, resource: resource, revision: resource.revision };
    }

    async function saveDocumentAs(session, saveOptions) {
      var target = splitPath(saveOptions && saveOptions.path);
      var workspace = { id: session && session.workspaceId || session && session.storageResource && session.storageResource.workspaceId };

      if (!workspace.id) {
        throw storageError("RESOURCE_NOT_FOUND", "The remote workspace is unavailable.");
      }
      return createTextFile(workspace, target.directoryPath, target.name, saveOptions && saveOptions.text);
    }

    async function createDirectory(workspace, directoryPath, name) {
      return bridge().request("fs.createDirectory", {
        workspaceId: workspace.id,
        directoryPath: String(directoryPath || ""),
        name: name
      });
    }

    async function rename(workspace, relativePath, newName) {
      var resource;
      var result = await bridge().request("fs.rename", {
        workspaceId: workspace.id,
        path: relativePath,
        newName: newName
      });
      resource = resultResource(workspace.id, result, relativePath);

      return {
        name: resource.displayName,
        path: resource.path,
        resource: resource,
        revision: resource.revision,
        unchanged: Boolean(result.unchanged)
      };
    }

    async function duplicate(workspace, relativePath, requestedName) {
      var resource;
      var result = await bridge().request("fs.duplicate", {
        workspaceId: workspace.id,
        path: relativePath,
        name: requestedName
      });
      resource = resultResource(workspace.id, result, relativePath);

      return { name: resource.displayName, path: resource.path, resource: resource, revision: resource.revision };
    }

    async function searchText(workspace, query, searchOptions) {
      var result;

      if (!workspace || !workspace.id) {
        throw storageError("RESOURCE_NOT_FOUND", "The remote workspace is unavailable.");
      }
      searchOptions = searchOptions || {};
      result = await bridge().request("fs.searchText", {
        workspaceId: workspace.id,
        query: String(query || "").trim(),
        caseSensitive: Boolean(searchOptions.caseSensitive),
        maxResults: Math.min(500, Math.max(1, Number(searchOptions.maxResults) || 500))
      }, { timeoutMs: 120000 });

      return {
        filesVisited: Number(result.filesVisited) || 0,
        limited: Boolean(result.truncated),
        query: String(query || "").trim(),
        results: (result.matches || []).map(function (match) {
          var descriptor = ME.documentType && ME.documentType.getDocumentTypeForName(match.path);

          return {
            column: Math.max(0, Number(match.column) || 0),
            documentType: descriptor ? descriptor.id : "markdown",
            filename: String(match.path || "").split("/").pop(),
            line: Math.max(1, Number(match.line) || 1),
            path: String(match.path || ""),
            preview: String(match.preview || ""),
            text: String(match.preview || "")
          };
        }),
        warningCount: Number(result.warningCount) || 0
      };
    }

    function base64ToBytes(value) {
      var binary = window.atob(String(value || ""));
      var bytes = new Uint8Array(binary.length);
      var index;

      for (index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    }

    function bytesToBase64(bytes) {
      var parts = [];
      var index;
      var end;

      for (index = 0; index < bytes.length; index += 32768) {
        end = Math.min(index + 32768, bytes.length);
        parts.push(String.fromCharCode.apply(null, bytes.subarray(index, end)));
      }
      return window.btoa(parts.join(""));
    }

    async function binaryBytes(value) {
      var buffer;

      if (value instanceof Uint8Array) {
        return value;
      }
      if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
        return new Uint8Array(value);
      }
      if (value && typeof value.arrayBuffer === "function") {
        buffer = await value.arrayBuffer();
        return new Uint8Array(buffer);
      }
      throw storageError("OPERATION_UNSUPPORTED", "Binary image data is unavailable.");
    }

    async function readBinary(resource) {
      var offset = 0;
      var output = null;
      var mimeType = "";
      var revision = null;
      var result;
      var chunk;
      var size;

      if (!resource || resource.providerId !== "remote-ssh" || !resource.workspaceId || !resource.path) {
        throw storageError("RESOURCE_NOT_FOUND", "The remote image resource is unavailable.");
      }
      do {
        result = await bridge().request("fs.readBinary", {
          workspaceId: resource.workspaceId,
          path: resource.path,
          offset: offset,
          maxBytes: BINARY_CHUNK_SIZE
        });
        size = Number(result.size);
        if (!Number.isSafeInteger(size) || size < 0 || size > MAXIMUM_BINARY_SIZE) {
          throw storageError("FILE_TOO_LARGE", "The remote image is larger than 25 MB.");
        }
        if (!output) {
          output = new Uint8Array(size);
          mimeType = String(result.mimeType || "");
          revision = result.revision || null;
        }
        if (
          size !== output.length ||
          String(result.mimeType || "") !== mimeType ||
          Number(result.offset) !== offset ||
          revision && result.revision && revision.hash !== result.revision.hash
        ) {
          throw storageError("PROVIDER_UNAVAILABLE", "The remote image changed while it was loading.", { retryable: true });
        }
        chunk = base64ToBytes(result.bytes);
        if (offset + chunk.length > output.length || Number(result.nextOffset) !== offset + chunk.length) {
          throw storageError("PROVIDER_UNAVAILABLE", "The remote image response is invalid.");
        }
        output.set(chunk, offset);
        offset += chunk.length;
        if (!result.complete && chunk.length === 0) {
          throw storageError("PROVIDER_UNAVAILABLE", "The remote image response did not make progress.");
        }
      } while (!result.complete);

      if (offset !== output.length) {
        throw storageError("PROVIDER_UNAVAILABLE", "The remote image response is incomplete.");
      }
      return {
        bytes: output,
        mimeType: mimeType,
        path: String(result.path || resource.path),
        revision: revision
      };
    }

    async function writeBinary(workspace, relativePath, value, writeOptions) {
      var bytes = await binaryBytes(value);
      var normalizedPath = ME.storageResource.normalizeRelativePath(relativePath, { allowEmpty: false });
      var uploadId = "";
      var offset = 0;
      var end;
      var result;

      writeOptions = writeOptions || {};
      if (!workspace || !workspace.id) {
        throw storageError("RESOURCE_NOT_FOUND", "The remote workspace is unavailable.");
      }
      if (bytes.length > MAXIMUM_BINARY_SIZE) {
        throw storageError("FILE_TOO_LARGE", "The remote image is larger than 25 MB.");
      }
      do {
        end = Math.min(offset + BINARY_CHUNK_SIZE, bytes.length);
        result = await bridge().request("fs.writeBinary", {
          workspaceId: workspace.id,
          path: normalizedPath,
          mimeType: String(writeOptions.mimeType || ""),
          uploadId: uploadId,
          offset: offset,
          totalSize: bytes.length,
          bytes: bytesToBase64(bytes.subarray(offset, end)),
          complete: end === bytes.length
        });
        if (!result.complete && !result.uploadId) {
          throw storageError("PROVIDER_UNAVAILABLE", "The remote image upload response is invalid.");
        }
        uploadId = String(result.uploadId || uploadId);
        if (Number(result.nextOffset) !== end) {
          throw storageError("PROVIDER_UNAVAILABLE", "The remote image upload did not advance.");
        }
        offset = end;
      } while (offset < bytes.length);

      return {
        mimeType: String(result.mimeType || writeOptions.mimeType || ""),
        path: String(result.path || normalizedPath),
        revision: result.revision || null
      };
    }

    var provider = {
      id: "remote-ssh",
      label: "Remote SSH",
      isAvailable: function () {
        try {
          bridge();
          return true;
        } catch (error) {
          return false;
        }
      },
      isWorkspaceAvailable: function () { return provider.isAvailable(); },
      getCapabilities: capabilities,
      openDocument: function () { return unsupported("Opening a standalone remote document"); },
      saveDocument: saveDocument,
      saveDocumentAs: saveDocumentAs,
      openWorkspace: openWorkspace,
      closeWorkspace: closeWorkspace,
      getWorkspaceStatus: getWorkspaceStatus,
      listDirectory: listDirectory,
      stat: stat,
      readText: readText,
      writeText: writeText,
      createTextFile: createTextFile,
      createDirectory: createDirectory,
      rename: rename,
      duplicate: duplicate,
      searchText: searchText,
      readBinary: readBinary,
      writeBinary: writeBinary,
      resourceFor: resourceFor
    };

    return provider;
  }

  ME.remoteSSHProvider = {
    create: create
  };
}());
