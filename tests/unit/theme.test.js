const assert = require("node:assert/strict");

function createElement() {
  const attributes = Object.create(null);

  return {
    title: "",
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    }
  };
}

function createDocument() {
  const elements = {
    darkThemeMenuItem: createElement(),
    themeToggleButton: createElement()
  };

  return {
    documentElement: { dataset: {} },
    elements,
    getElementById(id) {
      return elements[id] || null;
    },
    readyState: "complete"
  };
}

function createStorage(initial) {
  const values = Object.assign({}, initial || {});

  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem(key, value) {
      values[key] = String(value);
    },
    values
  };
}

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

const initialDocument = createDocument();
global.document = initialDocument;
global.window = {
  localStorage: createStorage()
};
require("../../src/js/theme.js");

const theme = window.MarkdownEditor.theme;
const storageKey = "localdraftai.appearance.theme";

runTest("invalid stored values fall back to light", function () {
  const storage = createStorage({ [storageKey]: "system" });

  assert.equal(theme.normalizeTheme("system"), "light");
  assert.equal(theme.loadTheme(storage), "light");
});

runTest("saved dark theme restores before control synchronization", function () {
  const doc = createDocument();
  const storage = createStorage({ [storageKey]: "dark" });

  assert.equal(theme.initialize({ document: doc, storage }), "dark");
  assert.equal(doc.documentElement.dataset.theme, "dark");
  assert.equal(theme.getTheme({ document: doc }), "dark");
});

runTest("toggleTheme changes light to dark and dark to light", function () {
  const doc = createDocument();
  const storage = createStorage();

  theme.applyTheme("light", { document: doc, storage });
  assert.equal(theme.toggleTheme({ document: doc, storage }), "dark");
  assert.equal(theme.toggleTheme({ document: doc, storage }), "light");
});

runTest("applyTheme updates data-theme and localStorage", function () {
  const doc = createDocument();
  const storage = createStorage();

  assert.equal(theme.applyTheme("dark", { document: doc, storage }), "dark");
  assert.equal(doc.documentElement.dataset.theme, "dark");
  assert.equal(storage.values[storageKey], "dark");
});

runTest("control labels and ARIA state match the active theme", function () {
  const doc = createDocument();

  theme.applyTheme("dark", { document: doc, storage: createStorage() });
  assert.equal(doc.elements.themeToggleButton.title, "Switch to light theme");
  assert.equal(doc.elements.themeToggleButton.getAttribute("aria-label"), "Switch to light theme");
  assert.equal(doc.elements.themeToggleButton.getAttribute("aria-pressed"), "true");
  assert.equal(doc.elements.darkThemeMenuItem.getAttribute("aria-checked"), "true");

  theme.applyTheme("light", { document: doc, storage: createStorage() });
  assert.equal(doc.elements.themeToggleButton.title, "Switch to dark theme");
  assert.equal(doc.elements.themeToggleButton.getAttribute("aria-pressed"), "false");
  assert.equal(doc.elements.darkThemeMenuItem.getAttribute("aria-checked"), "false");
});

runTest("localStorage failures do not stop theme application", function () {
  const doc = createDocument();
  const storage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    }
  };

  assert.equal(theme.loadTheme(storage), "light");
  assert.doesNotThrow(function () {
    theme.applyTheme("dark", { document: doc, storage });
  });
  assert.equal(doc.documentElement.dataset.theme, "dark");
});
