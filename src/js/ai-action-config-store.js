(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var DB_NAME = "LocalDraftAI";
  var DB_VERSION = 1;
  var STORE_NAME = "aiActionConfig";
  var KEYS = {
    current: "aiActionsYaml",
    lastGood: "aiActionsYamlLastGood",
    schemaVersion: "aiActionsSchemaVersion",
    updatedAt: "aiActionsUpdatedAt"
  };
  var warning = "";

  function defaults() {
    return ME.aiActionDefaults.defaultYaml;
  }

  function localStorageKey(key) {
    return "localdraftai." + key;
  }

  function setWarning(message, error) {
    warning = message;
    console.warn(message, error || "");
  }

  function openDatabase() {
    return new Promise(function (resolve, reject) {
      var request;

      if (!window.indexedDB) {
        reject(new Error("IndexedDB is unavailable."));
        return;
      }

      request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error("Could not open the AI Actions database."));
      };
    });
  }

  async function readIndexedDb(key) {
    var db = await openDatabase();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(STORE_NAME, "readonly");
      var request = transaction.objectStore(STORE_NAME).get(key);

      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Could not read AI Actions config.")); };
      transaction.oncomplete = function () { db.close(); };
      transaction.onabort = function () { db.close(); };
    });
  }

  async function writeIndexedDb(values) {
    var db = await openDatabase();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(STORE_NAME, "readwrite");
      var store = transaction.objectStore(STORE_NAME);

      Object.keys(values).forEach(function (key) {
        store.put(values[key], key);
      });
      transaction.oncomplete = function () {
        db.close();
        resolve();
      };
      transaction.onerror = function () {
        var error = transaction.error || new Error("Could not save AI Actions config.");
        db.close();
        reject(error);
      };
      transaction.onabort = transaction.onerror;
    });
  }

  function readLocalStorage(key) {
    try {
      return window.localStorage ? window.localStorage.getItem(localStorageKey(key)) : null;
    } catch (error) {
      return null;
    }
  }

  function writeLocalStorage(values) {
    if (!window.localStorage) {
      throw new Error("Browser local storage is unavailable.");
    }
    Object.keys(values).forEach(function (key) {
      window.localStorage.setItem(localStorageKey(key), String(values[key]));
    });
  }

  async function readValue(key) {
    try {
      warning = "";
      return await readIndexedDb(key);
    } catch (error) {
      setWarning("IndexedDB is unavailable. AI Actions are using localStorage fallback.", error);
      return readLocalStorage(key);
    }
  }

  async function writeValues(values) {
    try {
      warning = "";
      await writeIndexedDb(values);
    } catch (error) {
      setWarning("IndexedDB is unavailable. AI Actions are using localStorage fallback.", error);
      writeLocalStorage(values);
    }
  }

  async function loadYaml() {
    var yamlText = await readValue(KEYS.current);

    if (yamlText) {
      return yamlText;
    }

    yamlText = defaults();
    await writeValues((function () {
      var values = {};
      values[KEYS.current] = yamlText;
      values[KEYS.lastGood] = yamlText;
      values[KEYS.schemaVersion] = ME.aiActionDefaults.defaultConfigVersion;
      values[KEYS.updatedAt] = new Date().toISOString();
      return values;
    }()));
    return yamlText;
  }

  function loadLastGoodYaml() {
    return readValue(KEYS.lastGood);
  }

  async function saveYaml(yamlText) {
    var parsed = ME.aiActionConfig.parseYaml(yamlText);
    ME.aiActionConfig.validateConfig(parsed);

    await writeValues((function () {
      var values = {};
      values[KEYS.current] = String(yamlText);
      values[KEYS.lastGood] = String(yamlText);
      values[KEYS.schemaVersion] = parsed.version;
      values[KEYS.updatedAt] = new Date().toISOString();
      return values;
    }()));
    return String(yamlText);
  }

  async function saveLastGoodYaml(yamlText) {
    var values = {};
    values[KEYS.lastGood] = String(yamlText);
    await writeValues(values);
    return String(yamlText);
  }

  async function resetToDefaults() {
    await saveYaml(defaults());
    await saveLastGoodYaml(defaults());
    return defaults();
  }

  async function exportYaml() {
    return await readValue(KEYS.current) || defaults();
  }

  async function importYaml(file) {
    var text;

    if (!file) {
      throw new Error("Choose a YAML file to import.");
    }
    if (typeof file.text === "function") {
      text = await file.text();
    } else {
      text = await new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || "")); };
        reader.onerror = function () { reject(reader.error || new Error("Could not read the YAML file.")); };
        reader.readAsText(file);
      });
    }

    ME.aiActionConfig.validateConfig(ME.aiActionConfig.parseYaml(text));
    return text;
  }

  ME.aiActionConfigStore = {
    exportYaml: exportYaml,
    importYaml: importYaml,
    loadLastGoodYaml: loadLastGoodYaml,
    loadYaml: loadYaml,
    resetToDefaults: resetToDefaults,
    saveLastGoodYaml: saveLastGoodYaml,
    saveYaml: saveYaml,
    warning: function () { return warning; }
  };
}());
