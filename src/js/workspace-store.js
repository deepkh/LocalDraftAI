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

  function treeNodeFromEntry(entry, workspace) {
    var descriptor;

    if (entry.kind === "directory") {
      return {
        kind: "directory",
        name: entry.name,
        path: entry.path,
        loaded: Boolean(entry.loaded),
        loading: Boolean(entry.loading),
        error: "",
        children: entry.children || []
      };
    }
    descriptor = ME.documentType && ME.documentType.getDocumentTypeForName(entry.name);
    return {
      kind: "file",
      name: entry.name,
      path: entry.path,
      resource: entry.resource || null,
      revision: entry.revision || entry.resource && entry.resource.revision || null,
      extension: entry.extension || extensionForName(entry.name),
      documentType: descriptor ? descriptor.id : entry.documentType || "markdown",
      isPlan: isMarkdownFile(entry.name) && ME.workspaceRelated && ME.workspaceRelated.isPlanFile
        ? ME.workspaceRelated.isPlanFile(entry.path)
        : false,
      workspaceId: workspace && workspace.id || ""
    };
  }

  function treeFromEntries(entries, workspace) {
    return sortTree((entries || []).map(function (entry) {
      return treeNodeFromEntry(entry, workspace);
    }));
  }

  function findTreeNode(nodes, path) {
    var i;
    var found;

    for (i = 0; i < (nodes || []).length; i += 1) {
      if (nodes[i].path === path) {
        return nodes[i];
      }
      if (nodes[i].kind === "directory") {
        found = findTreeNode(nodes[i].children || [], path);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  function collectTreeState(nodes, files, directories) {
    files = files || [];
    directories = directories || [];
    (nodes || []).forEach(function (node) {
      if (node.kind === "directory") {
        directories.push({
          kind: "directory",
          name: node.name,
          path: node.path,
          handle: node.handle || null,
          loaded: node.loaded !== false,
          loading: Boolean(node.loading),
          error: node.error || ""
        });
        collectTreeState(node.children || [], files, directories);
      } else {
        files.push(node);
      }
    });
    return { directories: directories, files: files };
  }

  function normalizedDirectoryPaths(paths) {
    return (paths || []).map(function (path) {
      return normalizePath(String(path || "").split("/"));
    }).filter(Boolean);
  }

  function isPreservedPathOrAncestor(path, preservedPaths) {
    var normalizedPath = normalizePath(String(path || "").split("/"));
    var prefix = normalizedPath + "/";

    return Boolean(normalizedPath && preservedPaths.some(function (preservedPath) {
      return preservedPath === normalizedPath || preservedPath.indexOf(prefix) === 0;
    }));
  }

  function pruneTreeToRelevantFolders(nodes, options) {
    var preservedPaths;

    options = options || {};
    preservedPaths = normalizedDirectoryPaths(options.preserveDirectoryPaths);

    return (nodes || []).reduce(function (visibleNodes, node) {
      var visibleChildren;
      var keepBecausePreserved;
      var keepBecauseUnknown;

      if (node.kind !== "directory") {
        visibleNodes.push(node);
        return visibleNodes;
      }

      visibleChildren = pruneTreeToRelevantFolders(node.children || [], options);
      keepBecausePreserved = isPreservedPathOrAncestor(node.path, preservedPaths);
      keepBecauseUnknown = Boolean(
        options.keepUnloadedDirectories &&
        (node.loaded === false || node.loading)
      );

      if (visibleChildren.length || keepBecausePreserved || keepBecauseUnknown) {
        visibleNodes.push(Object.assign({}, node, {
          children: visibleChildren
        }));
      }
      return visibleNodes;
    }, []);
  }

  function mergeCachedDirectories(nextNodes, previousNodes) {
    var previousByPath = {};

    (previousNodes || []).forEach(function (node) {
      previousByPath[node.path] = node;
    });
    return (nextNodes || []).map(function (node) {
      var previous = previousByPath[node.path];

      if (node.kind === "directory" && previous && previous.kind === "directory") {
        node.loaded = previous.loaded;
        node.loading = false;
        node.error = previous.error || "";
        node.children = previous.children || [];
      }
      return node;
    });
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
            error: node.error || "",
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
    var state;
    var tree;

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
    if (provider.id === "remote-ssh") {
      var rootEntries = await provider.listDirectory(workspace, "", {});
      var lazyTree = treeFromEntries(rootEntries, workspace);
      var lazyState = collectTreeState(lazyTree);

      return {
        directories: lazyState.directories,
        rootHandle: null,
        rootName: workspace.name || "Remote Workspace",
        providerId: provider.id,
        workspace: workspace,
        workspaceId: workspace.id,
        files: lazyState.files,
        tree: lazyTree,
        lazy: true
      };
    }
    files = await scanDirectory(provider, workspace, "", [], directories);
    rootHandle = provider.getLegacyWorkspaceHandle ? provider.getLegacyWorkspaceHandle(workspace) : null;
    tree = pruneTreeToRelevantFolders(buildTree(files, directories), {
      preserveDirectoryPaths: options.preserveDirectoryPaths || []
    });
    state = collectTreeState(tree);

    return {
      directories: state.directories,
      rootHandle: rootHandle,
      rootName: workspace.name || "Workspace",
      providerId: provider.id,
      workspace: workspace,
      workspaceId: workspace.id,
      files: state.files,
      tree: tree
    };
  }

  async function openWorkspace(options) {
    var provider = options && options.provider || localProvider();
    var workspace;

    if (!provider) {
      throw new Error("Local folder access is not supported in this browser.");
    }
    workspace = await provider.openWorkspace(options || {});
    try {
      return await scanWorkspace(workspace);
    } catch (error) {
      if (provider.closeWorkspace) {
        try {
          await provider.closeWorkspace(workspace);
        } catch (closeError) {
          // Preserve the original open/listing failure.
        }
      }
      throw error;
    }
  }

  async function loadDirectory(workspace, tree, relativePath) {
    var provider = workspace && ME.storageProviders && ME.storageProviders.getForWorkspace(workspace);
    var node = findTreeNode(tree || [], relativePath);
    var entries;
    var state;

    if (!provider || !node || node.kind !== "directory") {
      throw new Error("The workspace directory is unavailable.");
    }
    node.loading = true;
    node.error = "";
    try {
      entries = await provider.listDirectory(workspace, relativePath, {});
      node.children = treeFromEntries(entries, workspace);
      node.loaded = true;
      node.loading = false;
    } catch (error) {
      node.loaded = false;
      node.loading = false;
      node.error = error && error.message || "Could not load this remote directory.";
    }
    state = collectTreeState(tree || []);
    return {
      directories: state.directories,
      error: node.error || "",
      files: state.files,
      tree: tree || []
    };
  }

  async function refreshDirectory(workspace, tree, relativePath) {
    var provider = workspace && ME.storageProviders && ME.storageProviders.getForWorkspace(workspace);
    var node = relativePath ? findTreeNode(tree || [], relativePath) : null;
    var previousChildren = node ? node.children || [] : tree || [];
    var entries;
    var nextChildren;
    var state;

    if (!provider || relativePath && (!node || node.kind !== "directory")) {
      throw new Error("The workspace directory is unavailable.");
    }
    if (node) {
      node.loading = true;
      node.error = "";
    }
    try {
      entries = await provider.listDirectory(workspace, relativePath || "", {});
      nextChildren = mergeCachedDirectories(treeFromEntries(entries, workspace), previousChildren);
      if (node) {
        node.children = nextChildren;
        node.loaded = true;
        node.loading = false;
      } else {
        tree.splice.apply(tree, [0, tree.length].concat(nextChildren));
      }
    } catch (error) {
      if (node) {
        node.loading = false;
        node.error = error && error.message || "Could not refresh this remote directory.";
        state = collectTreeState(tree || []);
        return { directories: state.directories, files: state.files, tree: tree || [] };
      }
      throw error;
    }
    state = collectTreeState(tree || []);
    return { directories: state.directories, files: state.files, tree: tree || [] };
  }

  ME.workspaceStore = {
    buildTree: buildTree,
    extensionForName: extensionForName,
    filterTree: filterTree,
    findTreeNode: findTreeNode,
    isAbortError: isAbortError,
    isMarkdownFile: isMarkdownFile,
    isSupportedFileName: isSupportedFileName,
    isSupported: isSupported,
    openWorkspace: openWorkspace,
    pruneTreeToRelevantFolders: pruneTreeToRelevantFolders,
    scanWorkspace: scanWorkspace,
    loadDirectory: loadDirectory,
    refreshDirectory: refreshDirectory,
    treeFromEntries: treeFromEntries
  };
}());
