(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  function isSupported() {
    return typeof window.showDirectoryPicker === "function";
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

  async function scanDirectory(directoryHandle, baseParts, files, directories) {
    var entries = [];
    var iterator;
    var next;
    var directoryPath = normalizePath(baseParts);

    if (!directoryHandle || typeof directoryHandle.entries !== "function") {
      return files;
    }

    if (directoryPath) {
      directories.push({
        handle: directoryHandle,
        kind: "directory",
        name: baseParts[baseParts.length - 1],
        path: directoryPath
      });
    }

    iterator = directoryHandle.entries();
    while ((next = await iterator.next()) && !next.done) {
      entries.push(next.value);
    }

    entries.sort(function (left, right) {
      var leftHandle = left[1];
      var rightHandle = right[1];

      return compareNodes({
        kind: leftHandle.kind,
        name: left[0]
      }, {
        kind: rightHandle.kind,
        name: right[0]
      });
    });

    await entries.reduce(function (chain, entry) {
      return chain.then(async function () {
        var name = entry[0];
        var handle = entry[1];
        var pathParts = baseParts.concat(name);

        if (handle.kind === "directory") {
          await scanDirectory(handle, pathParts, files, directories);
          return;
        }

        if (handle.kind === "file" && isSupportedFileName(name)) {
          var descriptor = ME.documentType && ME.documentType.getDocumentTypeForName(name);
          files.push({
            name: name,
            path: normalizePath(pathParts),
            handle: handle,
            kind: "file",
            extension: extensionForName(name),
            documentType: descriptor ? descriptor.id : "markdown",
            isPlan: isMarkdownFile(name) && ME.workspaceRelated && ME.workspaceRelated.isPlanFile
              ? ME.workspaceRelated.isPlanFile(normalizePath(pathParts))
              : false
          });
        }
      });
    }, Promise.resolve());

    return files;
  }

  async function scanWorkspace(rootHandle) {
    var directories = [];
    var files = await scanDirectory(rootHandle, [], [], directories);

    return {
      directories: directories,
      rootHandle: rootHandle,
      rootName: rootHandle && rootHandle.name ? rootHandle.name : "Workspace",
      files: files,
      tree: buildTree(files, directories)
    };
  }

  async function openWorkspace() {
    var rootHandle = await window.showDirectoryPicker({
      mode: "read"
    });

    return scanWorkspace(rootHandle);
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
