(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function localProvider() {
    return ME.storageProviders && ME.storageProviders.get("local-fsa") || ME.localFilesystemProvider || null;
  }

  function isSupported() {
    var provider = localProvider();

    return Boolean(provider && provider.isWorkspaceAvailable && provider.isWorkspaceAvailable());
  }

  function isAbortError(error) {
    return error && error.name === "AbortError";
  }

  function normalizePath(parts) {
    return parts.filter(Boolean).join("/");
  }

  function extensionForName(name) {
    return ME.documentType && ME.documentType.extensionForName
      ? ME.documentType.extensionForName(name)
      : "";
  }

  function isMarkdownFile(name) {
    var descriptor = ME.documentType && ME.documentType.getDocumentTypeForName(name);

    return Boolean(descriptor && descriptor.id === "markdown");
  }

  function isSupportedFileName(name) {
    return Boolean(ME.documentType && ME.documentType.isSupportedFileName(name));
  }

  function compareNodes(left, right) {
    if (left.kind !== right.kind) {
      return left.kind === "directory" ? -1 : 1;
    }

    return String(left.name || "").localeCompare(String(right.name || ""), undefined, {
      sensitivity: "base"
    });
  }

  function sortTree(nodes) {
    nodes.sort(compareNodes);
    nodes.forEach(function (node) {
      if (node.kind === "directory" && node.children) {
        sortTree(node.children);
      }
    });
    return nodes;
  }

  function buildTree(files, directories) {
    var root = [];
    var directoriesByPath = {};

    (directories || []).forEach(function (directoryInfo) {
      var parts = String(directoryInfo.path || "").split("/").filter(Boolean);
      var children = root;
      var currentPath = "";
      var i;
      var directory;

      for (i = 0; i < parts.length; i += 1) {
        currentPath = normalizePath([currentPath, parts[i]]);
        directory = directoriesByPath[currentPath];
        if (!directory) {
          directory = {
            name: parts[i],
            path: currentPath,
            handle: directoryInfo.path === currentPath ? directoryInfo.handle || null : null,
            kind: "directory",
            loaded: directoryInfo.loaded !== false,
            loading: Boolean(directoryInfo.loading),
            children: []
          };
          directoriesByPath[currentPath] = directory;
          children.push(directory);
        } else if (directoryInfo.path === currentPath && directoryInfo.handle) {
          directory.handle = directoryInfo.handle;
        }
        children = directory.children;
      }
    });

    (files || []).forEach(function (file) {
      var parts = String(file.path || file.name || "").split("/").filter(Boolean);
      var children = root;
      var currentPath = "";
      var i;
      var directory;
      var fileNode;

      for (i = 0; i < parts.length - 1; i += 1) {
        currentPath = normalizePath([currentPath, parts[i]]);
        directory = directoriesByPath[currentPath];
        if (!directory) {
          directory = {
            name: parts[i],
            path: currentPath,
            handle: null,
            kind: "directory",
            loaded: true,
            loading: false,
            children: []
          };
          directoriesByPath[currentPath] = directory;
          children.push(directory);
        }
        children = directory.children;
      }

      fileNode = {
        name: file.name || parts[parts.length - 1] || "",
        path: file.path || parts.join("/"),
        handle: file.handle || null,
        kind: "file",
        resource: file.resource || null,
        revision: file.revision || file.resource && file.resource.revision || null,
        extension: file.extension || extensionForName(file.name || parts[parts.length - 1]),
        documentType: ((ME.documentType && ME.documentType.getDocumentTypeForName(file.name || parts[parts.length - 1])) || {}).id || file.documentType || "markdown",
        isPlan: isMarkdownFile(file.path || parts.join("/")) && ME.workspaceRelated && ME.workspaceRelated.isPlanFile
          ? ME.workspaceRelated.isPlanFile(file.path || parts.join("/"))
          : false
      };
      children.push(fileNode);
    });

    return sortTree(root);
  }

  function filterTree(nodes, query) {
    var normalizedQuery = String(query || "").trim().toLowerCase();

    if (!normalizedQuery) {
      return nodes || [];
    }

    return (nodes || []).reduce(function (filtered, node) {
      var childMatches;
      var selfMatches = String(node.name || "").toLowerCase().indexOf(normalizedQuery) !== -1 ||
        String(node.path || "").toLowerCase().indexOf(normalizedQuery) !== -1;

      if (node.kind === "directory") {
        childMatches = filterTree(node.children || [], normalizedQuery);
        if (selfMatches || childMatches.length) {
          filtered.push({
            name: node.name,
            path: node.path,
            handle: node.handle || null,
            kind: "directory",
            loaded: node.loaded !== false,
            loading: Boolean(node.loading),
            children: selfMatches ? node.children || [] : childMatches
          });
        }
        return filtered;
      }

      if (selfMatches) {
        filtered.push(node);
      }
      return filtered;
    }, []);
  }

  async function scanDirectory(provider, workspace, directoryPath, files, directories) {
    var entries;
    var baseParts = String(directoryPath || "").split("/").filter(Boolean);

    if (directoryPath) {
      directories.push({
        handle: null,
        kind: "directory",
        name: baseParts[baseParts.length - 1],
        path: directoryPath,
        loaded: true
      });
    }

    entries = await provider.listDirectory(workspace, directoryPath || "", {});

    entries.sort(function (left, right) {
      return compareNodes({
        kind: left.kind,
        name: left.name
      }, {
        kind: right.kind,
        name: right.name
      });
    });

    await entries.reduce(function (chain, entry) {
      return chain.then(async function () {
        var name = entry.name;
        var path = entry.path || normalizePath(baseParts.concat(name));

        if (entry.kind === "directory") {
          await scanDirectory(provider, workspace, path, files, directories);
          return;
        }

        if (entry.kind === "file" && isSupportedFileName(name)) {
          var descriptor = ME.documentType && ME.documentType.getDocumentTypeForName(name);
          files.push({
            name: name,
            path: path,
            handle: entry.fileHandle || null,
            resource: entry.resource || null,
            revision: entry.revision || entry.resource && entry.resource.revision || null,
            kind: "file",
            extension: extensionForName(name),
            documentType: descriptor ? descriptor.id : "markdown",
            isPlan: isMarkdownFile(name) && ME.workspaceRelated && ME.workspaceRelated.isPlanFile
              ? ME.workspaceRelated.isPlanFile(path)
              : false
          });
        }
      });
    }, Promise.resolve());

    return files;
  }

  async function scanWorkspace(workspaceOrHandle, options) {
    var provider;
    var workspace;
    var directories = [];
    var files;
    var rootHandle;

    options = options || {};
    workspace = workspaceOrHandle && workspaceOrHandle.providerId ? workspaceOrHandle : null;
    provider = workspace
      ? ME.storageProviders && ME.storageProviders.getForWorkspace(workspace)
      : localProvider();
    if (!provider) {
      throw new Error("The workspace storage provider is unavailable.");
    }
    if (!workspace) {
      workspace = provider.createWorkspaceDescriptor(workspaceOrHandle, {
        id: options.workspaceId,
        name: workspaceOrHandle && workspaceOrHandle.name
      });
    }
    files = await scanDirectory(provider, workspace, "", [], directories);
    rootHandle = provider.getLegacyWorkspaceHandle ? provider.getLegacyWorkspaceHandle(workspace) : null;

    return {
      directories: directories,
      rootHandle: rootHandle,
      rootName: workspace.name || "Workspace",
      providerId: provider.id,
      workspace: workspace,
      workspaceId: workspace.id,
      files: files,
      tree: buildTree(files, directories)
    };
  }

  async function openWorkspace(options) {
    var provider = options && options.provider || localProvider();
    var workspace;

    if (!provider) {
      throw new Error("Local folder access is not supported in this browser.");
    }
    workspace = await provider.openWorkspace(options || {});
    return scanWorkspace(workspace);
  }

  ME.workspaceStore = {
    buildTree: buildTree,
    extensionForName: extensionForName,
    filterTree: filterTree,
    isAbortError: isAbortError,
    isMarkdownFile: isMarkdownFile,
    isSupportedFileName: isSupportedFileName,
    isSupported: isSupported,
    openWorkspace: openWorkspace,
    scanWorkspace: scanWorkspace
  };
}());
