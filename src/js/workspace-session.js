(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  var DB_NAME = "localdraftai-workspace-session";
  var DB_VERSION = 1;
  var STORE_NAME = "sessions";
  var CURRENT_KEY = "current";

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
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error("Could not open workspace session storage."));
      };
    });
  }

  function withStore(mode, callback) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(STORE_NAME, mode);
        var store = transaction.objectStore(STORE_NAME);
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
    return {
      mode: tab && tab.mode === "markdown" ? "markdown" : "wysiwyg",
      path: String(tab && tab.path || ""),
      scrollTop: Math.max(0, Number(tab && tab.scrollTop) || 0),
      softWrap: tab ? tab.softWrap !== false : true,
      title: String(tab && tab.title || tab && tab.path || "")
    };
  }

  function normalizeSessionMetadata(session) {
    var openedTabs = (session && session.openedTabs || []).map(normalizeTabMetadata).filter(function (tab) {
      return Boolean(tab.path);
    });

    return {
      activePath: String(session && session.activePath || ""),
      openedTabs: openedTabs,
      savedAt: session && session.savedAt || Date.now(),
      workspaceHandle: session && session.workspaceHandle || null,
      workspaceName: String(session && session.workspaceName || "Workspace")
    };
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
      return Boolean(session && session.workspaceHandle);
    });
  }

  async function queryWorkspacePermission(handle, mode) {
    if (!handle || typeof handle.queryPermission !== "function") {
      return "granted";
    }

    return handle.queryPermission({ mode: mode || "read" });
  }

  async function requestWorkspacePermission(handle, mode) {
    var permission;

    if (!handle) {
      return "denied";
    }
    if (typeof handle.requestPermission !== "function") {
      return queryWorkspacePermission(handle, mode);
    }

    permission = await queryWorkspacePermission(handle, mode);
    if (permission === "granted") {
      return permission;
    }

    return handle.requestPermission({ mode: mode || "read" });
  }

  ME.workspaceSession = {
    clearSession: clearSession,
    hasRestorableSession: hasRestorableSession,
    isSupported: isSupported,
    loadSession: loadSession,
    normalizeSessionMetadata: normalizeSessionMetadata,
    normalizeTabMetadata: normalizeTabMetadata,
    queryWorkspacePermission: queryWorkspacePermission,
    requestWorkspacePermission: requestWorkspacePermission,
    saveSession: saveSession
  };
}());
