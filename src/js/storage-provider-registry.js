(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var providers = {};
  var ERROR_CODES = [
    "PROVIDER_UNAVAILABLE",
    "OPERATION_UNSUPPORTED",
    "PERMISSION_DENIED",
    "RESOURCE_NOT_FOUND",
    "RESOURCE_ALREADY_EXISTS",
    "INVALID_PATH",
    "PATH_OUTSIDE_WORKSPACE",
    "FILE_TOO_LARGE",
    "REVISION_CONFLICT",
    "CONNECTION_LOST",
    "AUTHENTICATION_REQUIRED",
    "HOST_KEY_UNKNOWN",
    "HOST_KEY_CHANGED",
    "BRIDGE_PROTOCOL_MISMATCH",
    "BRIDGE_UNAVAILABLE"
  ];

  function createError(code, message, options) {
    var error = new Error(String(message || "Storage operation failed."));

    options = options || {};
    error.name = "StorageProviderError";
    error.code = ERROR_CODES.indexOf(code) === -1 ? "PROVIDER_UNAVAILABLE" : code;
    error.retryable = Boolean(options.retryable);
    error.details = options.details && typeof options.details === "object" ? options.details : {};
    return error;
  }

  function normalizeError(error, fallbackCode) {
    if (error && error.name === "StorageProviderError" && error.code) {
      return error;
    }
    return createError(fallbackCode || "PROVIDER_UNAVAILABLE", error && error.message || "Storage operation failed.", {
      retryable: Boolean(error && error.retryable),
      details: error && error.details
    });
  }

  function register(provider) {
    var id = String(provider && provider.id || "").trim();

    if (!id) {
      throw new Error("A storage provider needs an id.");
    }
    if (providers[id] && providers[id] !== provider) {
      throw new Error("Storage provider already registered: " + id);
    }
    providers[id] = provider;
    return provider;
  }

  function get(providerId) {
    return providers[String(providerId || "")] || null;
  }

  function getForSession(session) {
    return get(session && (
      session.storageProviderId ||
      session.storageResource && session.storageResource.providerId ||
      session.fileHandle && "local-fsa"
    ));
  }

  function getForWorkspace(workspace) {
    return get(workspace && (
      workspace.providerId ||
      workspace.workspace && workspace.workspace.providerId ||
      workspace.rootHandle && "local-fsa"
    ));
  }

  function list() {
    return Object.keys(providers).map(function (id) {
      return providers[id];
    });
  }

  function clear() {
    providers = {};
  }

  ME.storageProviderErrors = {
    codes: ERROR_CODES.slice(),
    create: createError,
    normalize: normalizeError
  };
  ME.storageProviders = {
    clear: clear,
    get: get,
    getForSession: getForSession,
    getForWorkspace: getForWorkspace,
    list: list,
    register: register
  };
}());
