(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

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
      operation + " is not available while remote workspaces are read-only."
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
        write: false,
        createFile: false,
        createDirectory: false,
        rename: false,
        duplicate: false,
        search: false,
        binaryAssets: false,
        watch: false
      };
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
      saveDocument: function () { return unsupported("Remote Save"); },
      saveDocumentAs: function () { return unsupported("Remote Save As"); },
      openWorkspace: openWorkspace,
      closeWorkspace: closeWorkspace,
      listDirectory: listDirectory,
      stat: stat,
      readText: readText,
      writeText: function () { return unsupported("Remote Save"); },
      createTextFile: function () { return unsupported("Remote New File"); },
      createDirectory: function () { return unsupported("Remote New Folder"); },
      rename: function () { return unsupported("Remote Rename"); },
      duplicate: function () { return unsupported("Remote Duplicate"); },
      searchText: function () { return unsupported("Remote Search"); },
      readBinary: function () { return unsupported("Remote image loading"); },
      writeBinary: function () { return unsupported("Remote image storage"); },
      resourceFor: resourceFor
    };

    return provider;
  }

  ME.remoteSSHProvider = {
    create: create
  };
}());
