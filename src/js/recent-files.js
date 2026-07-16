(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var DB_NAME = "local-draft-ai-recent-files";
  var DB_VERSION = 1;
  var STORE_NAME = "files";

  function indexedDbAvailable() {
    return typeof window.indexedDB !== "undefined";
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
      };

      request.onsuccess = function () {
        resolve(request.result);
      };

      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function requestToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  async function withStore(mode, callback) {
    var db = await openDb();

    try {
      return await new Promise(function (resolve, reject) {
        var transaction = db.transaction(STORE_NAME, mode);
        var store = transaction.objectStore(STORE_NAME);
        var callbackResult;

        transaction.oncomplete = function () {
          resolve(callbackResult);
        };

        transaction.onerror = function () {
          reject(transaction.error);
        };

        transaction.onabort = function () {
          reject(transaction.error);
        };

        callbackResult = callback(store);
      });
    } finally {
      db.close();
    }
  }

  function sortRecords(records) {
    return records.sort(function (a, b) {
      return (b.lastOpened || 0) - (a.lastOpened || 0);
    });
  }

  function createRecentFiles(options) {
    options = options || {};
    var maxFiles = options.maxFiles || 10;

    function isSupported() {
      return indexedDbAvailable() && ME.fileStore && ME.fileStore.isSupported();
    }

    async function list() {
      if (!isSupported()) {
        return [];
      }

      return sortRecords(await withStore("readonly", function (store) {
        return requestToPromise(store.getAll());
      }));
    }

    async function remove(id) {
      if (!isSupported()) {
        return;
      }

      await withStore("readwrite", function (store) {
        return requestToPromise(store.delete(Number(id)));
      });
    }

    async function prune() {
      var records = await list();
      var staleRecords = records.slice(maxFiles);
      var i;

      for (i = 0; i < staleRecords.length; i += 1) {
        await remove(staleRecords[i].id);
      }

      return records.slice(0, maxFiles);
    }

    async function findMatchingRecord(fileHandle) {
      var records = await list();
      var i;

      for (i = 0; i < records.length; i += 1) {
        try {
          if (
            records[i].fileHandle &&
            typeof records[i].fileHandle.isSameEntry === "function" &&
            await records[i].fileHandle.isSameEntry(fileHandle)
          ) {
            return records[i];
          }
        } catch (error) {
          await remove(records[i].id);
        }
      }

      return null;
    }

    async function add(fileHandle, displayName) {
      var existingRecord;
      var record;

      if (!isSupported() || !fileHandle) {
        return [];
      }

      existingRecord = await findMatchingRecord(fileHandle);
      record = existingRecord || {};
      record.fileHandle = fileHandle;
      record.name = displayName || fileHandle.name || "Untitled.md";
      record.lastOpened = Date.now();

      await withStore("readwrite", function (store) {
        return requestToPromise(existingRecord ? store.put(record) : store.add(record));
      });

      return prune();
    }

    async function openRecord(record) {
      var file;
      var content;
      var descriptor;

      if (!isSupported()) {
        throw new Error("Recent files are not supported in this browser.");
      }

      if (!record || !record.fileHandle) {
        throw new Error("Recent file entry was not found.");
      }

      try {
        if (!(await ME.fileStore.ensurePermission(record.fileHandle, "read"))) {
          throw new Error("Permission was not granted for this file.");
        }

        file = await record.fileHandle.getFile();
        descriptor = ME.documentType && ME.documentType.getDocumentTypeForName(file.name || record.fileHandle.name || record.name);
        if (!descriptor) {
          throw new Error("This recent file type is not supported.");
        }
        content = await ME.fileStore.readTextDocument(file);
        record.name = file.name || record.fileHandle.name || record.name || "Untitled.md";
        record.lastOpened = Date.now();

        await withStore("readwrite", function (store) {
          return requestToPromise(store.put(record));
        });

        return {
          fileHandle: record.fileHandle,
          title: record.name,
          markdownText: content.markdownText,
          documentType: descriptor.id,
          extension: ME.documentType.extensionForName(record.name),
          sourceOnly: !descriptor.allowWysiwyg,
          preferredLineEnding: content.preferredLineEnding,
          hasUtf8Bom: content.hasUtf8Bom,
          hasFinalNewline: content.hasFinalNewline
        };
      } catch (error) {
        await remove(record.id);
        throw error;
      }
    }

    async function open(id) {
      var record;

      record = await withStore("readonly", function (store) {
        return requestToPromise(store.get(Number(id)));
      });

      return openRecord(record);
    }

    return {
      add: add,
      isSupported: isSupported,
      list: list,
      open: open,
      openRecord: openRecord,
      remove: remove
    };
  }

  ME.recentFiles = {
    create: createRecentFiles
  };
}());
