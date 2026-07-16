(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  var DB_NAME = "localdraftai-workspace-session";
  var DB_VERSION = 3;
  var STORE_NAME = "sessions";
  var RECENT_WORKSPACES_STORE_NAME = "recentWorkspaces";
  var CURRENT_KEY = "current";
  var DEFAULT_MAX_RECENT_WORKSPACES = 10;

  function isSupported() {
    return typeof window.indexedDB !== "undefined";
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var request;

      if (!isSupported()) {
        reject(new Error("Workspace session restore is not supported in this browser."));
        return;
      }

      request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
        if (!db.objectStoreNames.contains(RECENT_WORKSPACES_STORE_NAME)) {
          db.createObjectStore(RECENT_WORKSPACES_STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error("Could not open workspace session storage."));
      };
    });
  }

  function withNamedStore(storeName, mode, callback) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(storeName, mode);
        var store = transaction.objectStore(storeName);
        var result;

        transaction.oncomplete = function () {
          db.close();
          resolve(result);
        };
        transaction.onerror = function () {
          db.close();
          reject(transaction.error || new Error("Workspace session storage failed."));
        };
        transaction.onabort = transaction.onerror;
        result = callback(store);
      });
    });
  }

  function withStore(mode, callback) {
    return withNamedStore(STORE_NAME, mode, callback);
  }

  function requestToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error("Workspace session storage failed."));
      };
    });
  }

  function normalizeTabMetadata(tab) {
    var descriptor = ME.documentType && (
      ME.documentType.getDocumentTypeForName(tab && tab.path) ||
      ME.documentType.getDocumentTypeById(tab && tab.documentType)
    );
    var documentType = descriptor ? descriptor.id : String(tab && tab.documentType || "markdown");
    var sourceOnly = descriptor ? !descriptor.allowWysiwyg : documentType !== "markdown";

    return {
      documentType: documentType,
      dirty: Boolean(tab && tab.dirty),
      mode: sourceOnly || tab && tab.mode === "markdown" ? "markdown" : "wysiwyg",
      path: String(tab && tab.path || ""),
      selectionEnd: Math.max(0, Number(tab && tab.selectionEnd) || 0),
      selectionStart: Math.max(0, Number(tab && tab.selectionStart) || 0),
      scrollTop: Math.max(0, Number(tab && tab.scrollTop) || 0),
      softWrap: tab ? tab.softWrap !== false : true,
      title: String(tab && tab.title || tab && tab.path || ""),
      wysiwygTextOffset: Math.max(0, Number(tab && tab.wysiwygTextOffset) || 0)
    };
  }

  function normalizeCollapsedFolderPath(path) {
    var raw = String(path || "").trim();
    var parts;

    if (!raw || raw.charAt(0) === "/" || /^[A-Za-z]:[\\/]/.test(raw)) {
      return "";
    }

    parts = raw.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.some(function (part) {
      return part === "." || part === "..";
    })) {
      return "";
    }

    return parts.join("/");
  }

  function normalizeSidebarScroll(scroll) {
    return {
      panel: String(scroll && scroll.panel || "files"),
      scrollLeft: Math.max(0, Number(scroll && scroll.scrollLeft) || 0),
      scrollTop: Math.max(0, Number(scroll && scroll.scrollTop) || 0)
    };
  }

  function normalizeWorkspaceRef(session, providerId) {
    var source = session && session.workspaceRef || {};
    var localHandle = source.localHandle || session && session.workspaceHandle || null;

    return {
      localHandle: providerId === "local-fsa" ? localHandle : null,
      connectionId: providerId === "remote-ssh" ? String(source.connectionId || "") : "",
      remoteRootPath: providerId === "remote-ssh" ? String(source.remoteRootPath || "") : ""
    };
  }

  function normalizeSessionMetadata(session) {
    var openedTabs = (session && session.openedTabs || []).map(normalizeTabMetadata).filter(function (tab) {
      return Boolean(tab.path);
    });
    var collapsedFolders = (session && session.collapsedFolders || []).map(normalizeCollapsedFolderPath).filter(Boolean);
    var providerId = String(session && session.providerId || "local-fsa");
    var workspaceRef = normalizeWorkspaceRef(session, providerId);

    return {
      activePath: String(session && session.activePath || ""),
      collapsedFolders: collapsedFolders,
      openedTabs: openedTabs,
      providerId: providerId,
      savedAt: session && session.savedAt || Date.now(),
      sidebarScroll: normalizeSidebarScroll(session && session.sidebarScroll),
      workspaceRef: workspaceRef,
      // Version-2 compatibility field. New code uses workspaceRef.
      workspaceHandle: workspaceRef.localHandle,
      workspaceName: String(session && session.workspaceName || "Workspace")
    };
  }

  function normalizeRecentWorkspaceRecord(record) {
    var session = normalizeSessionMetadata({
      activePath: record && record.activePath,
      collapsedFolders: record && record.collapsedFolders,
      openedTabs: record && record.openedTabs,
      savedAt: record && record.savedAt,
      sidebarScroll: record && record.sidebarScroll,
      providerId: record && record.providerId,
      workspaceRef: record && record.workspaceRef,
      workspaceHandle: record && record.workspaceHandle,
      workspaceName: record && (record.workspaceName || record.workspaceHandle && record.workspaceHandle.name)
    });

    return {
      activePath: session.activePath,
      collapsedFolders: session.collapsedFolders,
      id: record && record.id,
      lastOpened: Math.max(0, Number(record && record.lastOpened) || 0),
      openedTabs: session.openedTabs,
      providerId: session.providerId,
      savedAt: session.savedAt,
      sidebarScroll: session.sidebarScroll,
      workspaceRef: session.workspaceRef,
      workspaceHandle: session.workspaceHandle,
      workspaceName: session.workspaceName
    };
  }

  function sortRecentWorkspaceRecords(records) {
    return (records || []).sort(function (left, right) {
      return (right.lastOpened || 0) - (left.lastOpened || 0);
    });
  }

  function saveSession(session) {
    var normalized = normalizeSessionMetadata(session);

    return withStore("readwrite", function (store) {
      return requestToPromise(store.put(normalized, CURRENT_KEY));
    });
  }

  function loadSession() {
    return withStore("readonly", function (store) {
      return requestToPromise(store.get(CURRENT_KEY));
    }).then(function (session) {
      return session ? normalizeSessionMetadata(session) : null;
    }).catch(function () {
      return null;
    });
  }

  function clearSession() {
    return withStore("readwrite", function (store) {
      return requestToPromise(store.delete(CURRENT_KEY));
    });
  }

  function hasRestorableSession() {
    return loadSession().then(function (session) {
      return Boolean(session && (
        session.providerId === "local-fsa" && session.workspaceRef.localHandle ||
        session.providerId === "remote-ssh" && session.workspaceRef.connectionId && session.workspaceRef.remoteRootPath
      ));
    });
  }

  async function listRecentWorkspaces() {
    var records;

    if (!isSupported()) {
      return [];
    }

    records = await withNamedStore(RECENT_WORKSPACES_STORE_NAME, "readonly", function (store) {
      return requestToPromise(store.getAll());
    });

    return sortRecentWorkspaceRecords(records.map(normalizeRecentWorkspaceRecord).filter(function (record) {
      return Boolean(
        record.providerId === "local-fsa" && record.workspaceRef.localHandle ||
        record.providerId === "remote-ssh" && record.workspaceRef.connectionId && record.workspaceRef.remoteRootPath
      );
    }));
  }

  async function removeRecentWorkspace(id) {
    if (!isSupported()) {
      return;
    }

    await withNamedStore(RECENT_WORKSPACES_STORE_NAME, "readwrite", function (store) {
      return requestToPromise(store.delete(Number(id)));
    });
  }

  async function pruneRecentWorkspaces(maxWorkspaces) {
    var records = await listRecentWorkspaces();
    var staleRecords = records.slice(Math.max(1, Number(maxWorkspaces) || DEFAULT_MAX_RECENT_WORKSPACES));
    var i;

    for (i = 0; i < staleRecords.length; i += 1) {
      await removeRecentWorkspace(staleRecords[i].id);
    }

    return records.slice(0, Math.max(1, Number(maxWorkspaces) || DEFAULT_MAX_RECENT_WORKSPACES));
  }

  async function findMatchingRecentWorkspace(workspaceHandle) {
    var records = await listRecentWorkspaces();
    var i;

    for (i = 0; i < records.length; i += 1) {
      try {
        if (
          records[i].workspaceHandle &&
          typeof records[i].workspaceHandle.isSameEntry === "function" &&
          await records[i].workspaceHandle.isSameEntry(workspaceHandle)
        ) {
          return records[i];
        }
      } catch (error) {
        await removeRecentWorkspace(records[i].id);
      }
    }

    return null;
  }

  async function addRecentWorkspace(workspaceHandle, workspaceName, options) {
    var maxWorkspaces = options && options.maxWorkspaces || DEFAULT_MAX_RECENT_WORKSPACES;
    var existingRecord;
    var record;
    var sessionMetadata;

    if (!isSupported() || !workspaceHandle) {
      return [];
    }

    existingRecord = await findMatchingRecentWorkspace(workspaceHandle);
    record = existingRecord || {};
    if (options && options.session) {
      sessionMetadata = normalizeSessionMetadata(options.session);
      record.activePath = sessionMetadata.activePath;
      record.collapsedFolders = sessionMetadata.collapsedFolders;
      record.openedTabs = sessionMetadata.openedTabs;
      record.savedAt = sessionMetadata.savedAt;
      record.sidebarScroll = sessionMetadata.sidebarScroll;
    }
    record.workspaceHandle = workspaceHandle;
    record.providerId = "local-fsa";
    record.workspaceRef = {
      localHandle: workspaceHandle,
      connectionId: "",
      remoteRootPath: ""
    };
    record.workspaceName = workspaceName || workspaceHandle.name || "Workspace";
    record.lastOpened = Date.now();

    await withNamedStore(RECENT_WORKSPACES_STORE_NAME, "readwrite", function (store) {
      return requestToPromise(existingRecord ? store.put(record) : store.add(record));
    });

    return pruneRecentWorkspaces(maxWorkspaces);
  }

  async function saveRecentWorkspaceSession(session, options) {
    var maxWorkspaces = options && options.maxWorkspaces || DEFAULT_MAX_RECENT_WORKSPACES;
    var normalized = normalizeSessionMetadata(session);
    var existingRecord;
    var record;

    if (!isSupported() || !normalized.workspaceHandle) {
      return [];
    }

    existingRecord = await findMatchingRecentWorkspace(normalized.workspaceHandle);
    record = existingRecord || {};
    record.activePath = normalized.activePath;
    record.collapsedFolders = normalized.collapsedFolders;
    record.openedTabs = normalized.openedTabs;
    record.savedAt = normalized.savedAt;
    record.sidebarScroll = normalized.sidebarScroll;
    record.workspaceHandle = normalized.workspaceHandle;
    record.providerId = normalized.providerId;
    record.workspaceRef = normalized.workspaceRef;
    record.workspaceName = normalized.workspaceName;
    record.lastOpened = record.lastOpened || Date.now();

    await withNamedStore(RECENT_WORKSPACES_STORE_NAME, "readwrite", function (store) {
      return requestToPromise(existingRecord ? store.put(record) : store.add(record));
    });

    return pruneRecentWorkspaces(maxWorkspaces);
  }

  async function openRecentWorkspace(record) {
    var normalized = normalizeRecentWorkspaceRecord(record);
    var permission;

    if (!isSupported()) {
      throw new Error("Recent workspaces are not supported in this browser.");
    }

    if (normalized.providerId !== "local-fsa" || !normalized.workspaceRef.localHandle) {
      throw new Error("Recent workspace entry was not found.");
    }

    permission = await requestWorkspacePermission(normalized.workspaceRef.localHandle, "read");
    if (permission !== "granted") {
      throw new Error("Permission was not granted for this workspace.");
    }

    normalized.workspaceHandle = normalized.workspaceRef.localHandle;
    normalized.workspaceName = normalized.workspaceHandle.name || normalized.workspaceName || "Workspace";
    return normalized;
  }

  async function queryWorkspacePermission(handle, mode) {
    var provider = ME.storageProviders && ME.storageProviders.get("local-fsa") || ME.localFilesystemProvider;

    return provider && provider.queryPermission
      ? provider.queryPermission(handle, mode || "read")
      : "granted";
  }

  async function requestWorkspacePermission(handle, mode) {
    var provider = ME.storageProviders && ME.storageProviders.get("local-fsa") || ME.localFilesystemProvider;

    if (!handle) {
      return "denied";
    }
    return provider && provider.requestPermission
      ? provider.requestPermission(handle, mode || "read")
      : queryWorkspacePermission(handle, mode);
  }

  ME.workspaceSession = {
    addRecentWorkspace: addRecentWorkspace,
    clearSession: clearSession,
    hasRestorableSession: hasRestorableSession,
    isSupported: isSupported,
    listRecentWorkspaces: listRecentWorkspaces,
    loadSession: loadSession,
    normalizeSessionMetadata: normalizeSessionMetadata,
    normalizeRecentWorkspaceRecord: normalizeRecentWorkspaceRecord,
    normalizeTabMetadata: normalizeTabMetadata,
    openRecentWorkspace: openRecentWorkspace,
    queryWorkspacePermission: queryWorkspacePermission,
    removeRecentWorkspace: removeRecentWorkspace,
    requestWorkspacePermission: requestWorkspacePermission,
    saveRecentWorkspaceSession: saveRecentWorkspaceSession,
    saveSession: saveSession
  };
}());
