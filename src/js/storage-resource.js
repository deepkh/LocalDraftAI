(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function normalizeRelativePath(value, options) {
    var raw = String(value == null ? "" : value);
    var parts;

    options = options || {};
    if (!raw) {
      if (options.allowEmpty === false) {
        throw new Error("A workspace-relative path is required.");
      }
      return "";
    }
    if (
      raw.charAt(0) === "/" ||
      raw.charAt(0) === "\\" ||
      /^[A-Za-z]:[\\/]/.test(raw) ||
      /^\\\\/.test(raw)
    ) {
      throw new Error("Storage paths must be relative to the workspace.");
    }

    parts = raw.replace(/\\/g, "/").split("/");
    if (parts.some(function (part) {
      return !part || part === "." || part === "..";
    })) {
      throw new Error("Storage paths cannot contain empty, dot, or dot-dot components.");
    }

    return parts.join("/");
  }

  function normalizeRevision(revision) {
    revision = revision || {};
    return {
      size: Math.max(0, Number(revision.size) || 0),
      mtimeMs: Math.max(0, Number(revision.mtimeMs) || 0),
      hash: String(revision.hash || "")
    };
  }

  function create(options) {
    var providerId;
    var workspaceId;
    var path;

    options = options || {};
    providerId = String(options.providerId || "").trim();
    workspaceId = String(options.workspaceId || "").trim();
    if (!providerId) {
      throw new Error("A storage resource needs a provider ID.");
    }

    path = normalizeRelativePath(options.path, {
      allowEmpty: !workspaceId
    });
    if (workspaceId && !path) {
      throw new Error("A workspace resource needs a relative path.");
    }

    return {
      providerId: providerId,
      workspaceId: workspaceId,
      path: path,
      displayName: String(options.displayName || (path ? path.split("/").pop() : "")),
      opaque: options.opaque && typeof options.opaque === "object" ? options.opaque : {},
      revision: normalizeRevision(options.revision)
    };
  }

  function clone(resource) {
    if (!resource) {
      return null;
    }
    return create({
      providerId: resource.providerId,
      workspaceId: resource.workspaceId,
      path: resource.path,
      displayName: resource.displayName,
      opaque: resource.opaque,
      revision: resource.revision
    });
  }

  function isLocal(resource) {
    return Boolean(resource && resource.providerId === "local-fsa");
  }

  function isRemote(resource) {
    return Boolean(resource && resource.providerId === "remote-ssh");
  }

  function sameResource(left, right) {
    if (!left || !right || left.providerId !== right.providerId) {
      return false;
    }
    if (left.workspaceId || right.workspaceId) {
      return left.workspaceId === right.workspaceId && left.path === right.path;
    }
    if (left.path || right.path) {
      return left.path === right.path;
    }
    return Boolean(left.opaque && right.opaque && left.opaque.fileHandle === right.opaque.fileHandle);
  }

  function updateRevision(resource, revision) {
    if (!resource) {
      return null;
    }
    resource.revision = normalizeRevision(revision);
    return resource;
  }

  ME.storageResource = {
    clone: clone,
    create: create,
    isLocal: isLocal,
    isRemote: isRemote,
    normalizeRelativePath: normalizeRelativePath,
    sameResource: sameResource,
    updateRevision: updateRevision
  };
}());
