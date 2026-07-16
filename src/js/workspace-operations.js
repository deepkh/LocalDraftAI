(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function hasUnsafePathSeparator(name) {
    return /[\\/]/.test(String(name || ""));
  }

  function extensionForName(name) {
    return ME.documentType && ME.documentType.extensionForName
      ? ME.documentType.extensionForName(name)
      : "";
  }

  function ensureSupportedExtension(name, defaultExtension) {
    var trimmed = String(name || "").trim();

    if (!extensionForName(trimmed)) {
      return trimmed + (defaultExtension || ".md");
    }

    return trimmed;
  }

  function validateFileName(name, options) {
    var trimmed = String(name || "").trim();
    var normalized;

    options = options || {};
    if (!trimmed) {
      return { ok: false, reason: "empty", message: "Enter a file name." };
    }
    if (trimmed === "." || trimmed === ".." || hasUnsafePathSeparator(trimmed)) {
      return { ok: false, reason: "unsafe", message: "Use a file name without slashes." };
    }

    normalized = options.enforceMarkdownExtension === false
      ? trimmed
      : ensureSupportedExtension(trimmed, options.defaultExtension);
    if (!(ME.documentType && ME.documentType.isSupportedFileName(normalized))) {
      return {
        ok: false,
        normalizedName: normalized,
        reason: "unsupportedExtension",
        message: "Use a .md, .txt, .log, .json, .yml, or .yaml file name."
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

  function providerAndWorkspace(options) {
    var provider = options.provider || ME.storageProviders && ME.storageProviders.getForWorkspace(options.workspace) || ME.localFilesystemProvider;
    var workspace = options.workspace;

    if (!provider) {
      throw new Error("The workspace storage provider is unavailable.");
    }
    if (!workspace && options.rootHandle && provider.createWorkspaceDescriptor) {
      workspace = provider.createWorkspaceDescriptor(options.rootHandle, {
        id: options.workspaceId || "local-workspace-compat"
      });
    }
    if (!workspace) {
      throw new Error("The workspace is unavailable.");
    }
    return { provider: provider, workspace: workspace };
  }

  async function createTextFile(options) {
    var directoryPath = options.directoryPath || "";
    var validation = validateFileName(options.name, {
      enforceMarkdownExtension: true
    });
    var context;

    if (!validation.ok) {
      throw new Error(validation.message);
    }

    context = providerAndWorkspace(options);
    return context.provider.createTextFile(
      context.workspace,
      directoryPath,
      validation.normalizedName,
      options.initialText || ""
    );
  }

  async function createFolder(options) {
    var directoryPath = options.directoryPath || "";
    var validation = validateFolderName(options.name);
    var context;

    if (!validation.ok) {
      throw new Error(validation.message);
    }

    context = providerAndWorkspace(options);
    return context.provider.createDirectory(
      context.workspace,
      directoryPath,
      validation.normalizedName
    );
  }

  function suggestedDuplicateName(path) {
    var name = basename(path);
    var dir = dirname(path);
    var extension = extensionForName(name);
    var stem = extension ? name.slice(0, -extension.length) : name;

    return joinPath(dir, stem + " copy" + (extension || ".md"));
  }

  async function duplicateTextFile(options) {
    var sourcePath = options.path;
    var nameValidation;
    var context;

    nameValidation = validateFileName(options.name || basename(suggestedDuplicateName(sourcePath)), {
      defaultExtension: extensionForName(sourcePath) || ".md",
      enforceMarkdownExtension: true
    });
    if (!nameValidation.ok) {
      throw new Error(nameValidation.message);
    }

    context = providerAndWorkspace(options);
    return context.provider.duplicate(
      context.workspace,
      sourcePath,
      nameValidation.normalizedName
    );
  }

  async function renameTextFile(options) {
    var sourcePath = options.path;
    var oldName = basename(sourcePath);
    var validation = validateFileName(options.name, {
      defaultExtension: extensionForName(sourcePath) || ".md",
      enforceMarkdownExtension: true
    });
    var context;

    if (!validation.ok) {
      throw new Error(validation.message);
    }
    if (validation.normalizedName === oldName) {
      context = providerAndWorkspace(options);
      return context.provider.rename(context.workspace, sourcePath, oldName);
    }

    context = providerAndWorkspace(options);
    return context.provider.rename(
      context.workspace,
      sourcePath,
      validation.normalizedName
    );
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
    createTextFile: createTextFile,
    createMarkdownFile: createTextFile,
    duplicateTextFile: duplicateTextFile,
    duplicateMarkdownFile: duplicateTextFile,
    ensureSupportedExtension: ensureSupportedExtension,
    ensureMarkdownExtension: ensureSupportedExtension,
    renameTextFile: renameTextFile,
    renameMarkdownFile: renameTextFile,
    suggestedDuplicateName: suggestedDuplicateName,
    validateFileName: validateFileName,
    validateFolderName: validateFolderName
  };
}());
