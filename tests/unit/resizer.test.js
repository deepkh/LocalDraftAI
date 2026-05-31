const assert = require("node:assert/strict");

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

function createElement(options) {
  const listeners = {};
  const classNames = new Set();

  return {
    offsetWidth: options.offsetWidth || 0,
    attributes: {},
    listeners,
    style: {
      values: {},
      setProperty(name, value) {
        this.values[name] = value;
      }
    },
    classList: {
      add(name) {
        classNames.add(name);
      },
      remove(name) {
        classNames.delete(name);
      },
      contains(name) {
        return classNames.has(name);
      }
    },
    addEventListener(name, callback) {
      listeners[name] = listeners[name] || [];
      listeners[name].push(callback);
    },
    dispatch(name, event) {
      (listeners[name] || []).forEach(function (callback) {
        callback(event || {});
      });
    },
    getBoundingClientRect() {
      return {
        left: options.left || 0,
        right: options.right || options.width || 0,
        width: options.width || 0
      };
    },
    hasPointerCapture() {
      return false;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    setPointerCapture() {}
  };
}

global.window = {
  innerWidth: 1200,
  addEventListener() {},
  getComputedStyle() {
    return {
      columnGap: "8px",
      gap: "8px"
    };
  },
  matchMedia() {
    return {
      matches: true
    };
  }
};

global.document = {
  body: createElement({}),
  documentElement: createElement({})
};

require("../../src/js/utils.js");
require("../../src/js/resizer.js");

const resizer = window.MarkdownEditor.resizer;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("clamps AI panel width to viewport and editor limits", function () {
  const workspace = createElement({ width: 1000, right: 1000 });
  const handle = createElement({ offsetWidth: 6 });
  const context = { workspace, handle };

  assert.equal(resizer.setAiAssistantPanelWidth(900, context), 498);
  assert.equal(document.documentElement.style.values["--ai-assistant-panel-width"], "498px");
  assert.equal(handle.attributes["aria-valuemin"], "320");
  assert.equal(handle.attributes["aria-valuemax"], "498");
  assert.equal(handle.attributes["aria-valuenow"], "498");
});

runTest("loads saved AI panel width and ignores invalid storage safely", function () {
  const workspace = createElement({ width: 1200, right: 1200 });
  const handle = createElement({ offsetWidth: 6 });
  const storage = createStorage({
    [resizer.AI_PANEL_WIDTH_STORAGE_KEY]: "520"
  });

  assert.equal(resizer.loadAiAssistantPanelWidth({ workspace, handle }, storage), 520);

  storage.values[resizer.AI_PANEL_WIDTH_STORAGE_KEY] = "not-a-number";
  assert.equal(resizer.loadAiAssistantPanelWidth({ workspace, handle }, storage), 420);
});

runTest("dragging updates width and persists on pointer up", function () {
  const workspace = createElement({ width: 1200, right: 1200 });
  const handle = createElement({ offsetWidth: 6 });
  const storage = createStorage();
  const panelResizer = resizer.createAiPanel({ workspace, handle, storage });

  panelResizer.bindEvents();
  handle.dispatch("pointerdown", {
    clientX: 760,
    pointerId: 1,
    preventDefault() {}
  });
  handle.dispatch("pointermove", {
    clientX: 700,
    pointerId: 1,
    preventDefault() {}
  });
  handle.dispatch("pointerup", {
    pointerId: 1
  });

  assert.equal(panelResizer.getWidth(), 500);
  assert.equal(storage.values[resizer.AI_PANEL_WIDTH_STORAGE_KEY], "500");
});

runTest("double-click resets AI panel width to default", function () {
  const workspace = createElement({ width: 1200, right: 1200 });
  const handle = createElement({ offsetWidth: 6 });
  const storage = createStorage({
    [resizer.AI_PANEL_WIDTH_STORAGE_KEY]: "560"
  });
  const panelResizer = resizer.createAiPanel({ workspace, handle, storage });

  panelResizer.bindEvents();
  handle.dispatch("dblclick", {
    preventDefault() {}
  });

  assert.equal(panelResizer.getWidth(), 420);
  assert.equal(storage.values[resizer.AI_PANEL_WIDTH_STORAGE_KEY], "420");
});
