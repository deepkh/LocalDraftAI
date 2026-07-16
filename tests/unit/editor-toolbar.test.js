const assert = require("node:assert/strict");

class FakeEventTarget {
  constructor() {
    this.listeners = {};
  }

  addEventListener(type, listener) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type, listener) {
    this.listeners[type] = (this.listeners[type] || []).filter((candidate) => candidate !== listener);
  }

  emit(type, properties = {}) {
    const event = Object.assign({
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.propagationStopped = true;
      },
      target: this
    }, properties);

    (this.listeners[type] || []).slice().forEach((listener) => listener(event));
    return event;
  }

  listenerCount() {
    return Object.values(this.listeners).reduce((count, listeners) => count + listeners.length, 0);
  }
}

class FakeElement extends FakeEventTarget {
  constructor(name) {
    super();
    this.attributes = {};
    this.children = [];
    this.disabled = false;
    this.hidden = false;
    this.name = name;
    this.offsetHeight = 180;
    this.offsetWidth = 220;
    this.parentNode = null;
    this.style = {};
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  click() {
    const event = this.emit("click", { target: this });
    let parent = this.parentNode;

    while (parent && !event.propagationStopped) {
      parent.emit("click", event);
      parent = parent.parentNode;
    }
    if (!event.propagationStopped) {
      document.emit("click", event);
    }
  }

  contains(candidate) {
    if (candidate === this) return true;
    return this.children.some((child) => child.contains(candidate));
  }

  focus() {
    document.activeElement = this;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  getBoundingClientRect() {
    return {
      bottom: 42,
      left: 320,
      right: 380,
      top: 10
    };
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  querySelectorAll() {
    const descendants = [];

    function collect(element) {
      element.children.forEach((child) => {
        const role = child.getAttribute("role");
        if (role === "menuitem" || role === "menuitemcheckbox") {
          descendants.push(child);
        }
        collect(child);
      });
    }

    collect(this);
    return descendants;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
}

const documentTarget = new FakeEventTarget();
documentTarget.activeElement = null;
documentTarget.documentElement = {
  clientHeight: 768,
  clientWidth: 1024
};
global.document = documentTarget;

const windowTarget = new FakeEventTarget();
windowTarget.console = { warn() {} };
windowTarget.innerHeight = 768;
windowTarget.innerWidth = 1024;
global.window = windowTarget;

require("../../src/js/editor-toolbar.js");

const editorToolbar = window.MarkdownEditor.editorToolbar;

function menuItem(name, attributes = {}) {
  const item = new FakeElement(name);

  item.setAttribute("role", attributes.role || "menuitem");
  Object.keys(attributes).forEach((key) => {
    if (key !== "role") item.setAttribute(key, attributes[key]);
  });
  return item;
}

function createStorage(options = {}) {
  const values = {};
  const writes = [];

  if (options.stored !== undefined) {
    values[editorToolbar.STORAGE_KEY] = String(options.stored);
  }
  return {
    getItem(key) {
      if (options.readError) throw new Error("read failed");
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem(key, value) {
      if (options.writeError) throw new Error("write failed");
      values[key] = String(value);
      writes.push([key, String(value)]);
    },
    values,
    writes
  };
}

function createHarness(options = {}) {
  const root = new FakeElement("root");
  const formatToolbar = root.appendChild(new FakeElement("formatToolbar"));
  const toggle = root.appendChild(new FakeElement("toggleFormatToolbar"));
  const formatButton = root.appendChild(new FakeElement("formatMoreButton"));
  const formatMenu = root.appendChild(new FakeElement("formatMoreMenu"));
  const documentButton = root.appendChild(new FakeElement("documentMoreButton"));
  const documentMenu = root.appendChild(new FakeElement("documentMoreMenu"));
  const preferenceMenuItem = new FakeElement("preferenceMenuItem");
  const firstAction = formatMenu.appendChild(menuItem("firstAction", { "data-action": "bold" }));
  const disabledAction = formatMenu.appendChild(menuItem("disabledAction", { "data-action": "italic" }));
  const lastAction = formatMenu.appendChild(menuItem("lastAction", { "data-action": "code" }));
  const commandItem = documentMenu.appendChild(menuItem("commandItem", { "data-command": "view.toggleSoftWrap" }));
  const storage = options.storage || createStorage();
  const commandCalls = [];

  formatToolbar.hidden = true;
  formatMenu.hidden = true;
  documentMenu.hidden = true;
  disabledAction.disabled = true;
  [formatButton, documentButton].forEach((button) => button.setAttribute("aria-expanded", "false"));

  const controller = editorToolbar.create({
    commandRegistry: {
      executeCommand(commandId) {
        commandCalls.push(commandId);
      }
    },
    documentMoreButton: documentButton,
    documentMoreMenu: documentMenu,
    formatMoreButton: formatButton,
    formatMoreMenu: formatMenu,
    formatToolbarElement: formatToolbar,
    markdownCommandsAllowed: options.markdownCommandsAllowed,
    preferenceMenuItem,
    rootElement: root,
    storage,
    toggleFormatToolbarButton: toggle
  });

  return {
    commandCalls,
    commandItem,
    controller,
    disabledAction,
    documentButton,
    documentMenu,
    firstAction,
    formatButton,
    formatMenu,
    formatToolbar,
    lastAction,
    preferenceMenuItem,
    root,
    storage,
    toggle
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

runTest("defaults to a collapsed formatting toolbar", function () {
  const harness = createHarness();

  assert.deepEqual(harness.controller.getState(), {
    effectiveVisible: false,
    focusModeActive: false,
    markdownCommandsAllowed: true,
    preferredVisible: false
  });
  assert.equal(harness.formatToolbar.hidden, true);
  assert.equal(harness.toggle.getAttribute("aria-expanded"), "false");
  harness.controller.destroy();
});

runTest("toggles the preference on and off and persists it", function () {
  const harness = createHarness();

  harness.controller.togglePreferredVisible();
  assert.equal(harness.controller.getState().preferredVisible, true);
  assert.equal(harness.formatToolbar.hidden, false);
  assert.equal(harness.toggle.getAttribute("aria-expanded"), "true");
  assert.deepEqual(harness.storage.writes[0], [editorToolbar.STORAGE_KEY, "true"]);

  harness.controller.togglePreferredVisible();
  assert.equal(harness.controller.getState().preferredVisible, false);
  assert.equal(harness.formatToolbar.hidden, true);
  assert.equal(harness.toggle.getAttribute("aria-expanded"), "false");
  assert.deepEqual(harness.storage.writes[1], [editorToolbar.STORAGE_KEY, "false"]);
  harness.controller.destroy();
});

runTest("restores true and false stored preferences", function () {
  const expanded = createHarness({ storage: createStorage({ stored: true }) });
  const collapsed = createHarness({ storage: createStorage({ stored: false }) });

  assert.equal(expanded.controller.getState().preferredVisible, true);
  assert.equal(expanded.formatToolbar.hidden, false);
  assert.equal(collapsed.controller.getState().preferredVisible, false);
  assert.equal(collapsed.formatToolbar.hidden, true);
  expanded.controller.destroy();
  collapsed.controller.destroy();
});

runTest("continues when storage reads or writes fail", function () {
  const readFailure = createHarness({ storage: createStorage({ readError: true }) });
  const writeFailure = createHarness({ storage: createStorage({ writeError: true }) });

  assert.equal(readFailure.controller.getState().preferredVisible, false);
  assert.doesNotThrow(() => writeFailure.controller.togglePreferredVisible());
  assert.equal(writeFailure.controller.getState().preferredVisible, true);
  assert.equal(writeFailure.formatToolbar.hidden, false);
  readFailure.controller.destroy();
  writeFailure.controller.destroy();
});

runTest("Focus Mode hides without changing the preference", function () {
  const harness = createHarness({ storage: createStorage({ stored: true }) });

  harness.controller.setFocusModeActive(true);
  assert.equal(harness.formatToolbar.hidden, true);
  assert.equal(harness.controller.getState().preferredVisible, true);
  assert.equal(harness.preferenceMenuItem.getAttribute("aria-checked"), "true");

  harness.controller.setFocusModeActive(false);
  assert.equal(harness.formatToolbar.hidden, false);
  harness.controller.destroy();
});

runTest("unsupported documents hide without changing the preference", function () {
  const harness = createHarness({ storage: createStorage({ stored: true }) });

  harness.controller.setMarkdownCommandsAllowed(false);
  assert.equal(harness.formatToolbar.hidden, true);
  assert.equal(harness.toggle.hidden, true);
  assert.equal(harness.preferenceMenuItem.disabled, true);
  assert.equal(harness.controller.getState().preferredVisible, true);

  harness.controller.setMarkdownCommandsAllowed(true);
  assert.equal(harness.formatToolbar.hidden, false);
  assert.equal(harness.toggle.hidden, false);
  harness.controller.destroy();
});

runTest("opening one topbar menu closes the other", function () {
  const harness = createHarness();

  harness.controller.openMenu("format");
  assert.equal(harness.formatMenu.hidden, false);
  harness.controller.openMenu("document");
  assert.equal(harness.formatMenu.hidden, true);
  assert.equal(harness.documentMenu.hidden, false);
  harness.controller.destroy();
});

runTest("Escape closes a menu and restores trigger focus", function () {
  const harness = createHarness();

  harness.controller.openMenu("format");
  harness.formatMenu.emit("keydown", { key: "Escape", target: harness.firstAction });
  assert.equal(harness.formatMenu.hidden, true);
  assert.equal(harness.formatButton.getAttribute("aria-expanded"), "false");
  assert.equal(document.activeElement, harness.formatButton);
  harness.controller.destroy();
});

runTest("arrow keys, Home, and End skip disabled items", function () {
  const harness = createHarness();

  harness.controller.openMenu("format");
  assert.equal(document.activeElement, harness.firstAction);
  harness.formatMenu.emit("keydown", { key: "ArrowDown", target: harness.firstAction });
  assert.equal(document.activeElement, harness.lastAction);
  harness.formatMenu.emit("keydown", { key: "ArrowUp", target: harness.lastAction });
  assert.equal(document.activeElement, harness.firstAction);
  harness.formatMenu.emit("keydown", { key: "End", target: harness.firstAction });
  assert.equal(document.activeElement, harness.lastAction);
  harness.formatMenu.emit("keydown", { key: "Home", target: harness.lastAction });
  assert.equal(document.activeElement, harness.firstAction);
  harness.controller.destroy();
});

runTest("dispatches commands once and never duplicates data actions", function () {
  const harness = createHarness();
  let actionCalls = 0;

  harness.firstAction.addEventListener("click", function () {
    actionCalls += 1;
  });
  harness.controller.openMenu("document");
  harness.commandItem.click();
  assert.deepEqual(harness.commandCalls, ["view.toggleSoftWrap"]);
  assert.equal(harness.documentMenu.hidden, true);
  assert.equal(document.activeElement, harness.documentButton);

  harness.controller.openMenu("format");
  harness.firstAction.click();
  assert.equal(actionCalls, 1);
  assert.deepEqual(harness.commandCalls, ["view.toggleSoftWrap"]);
  assert.equal(harness.formatMenu.hidden, true);
  harness.controller.destroy();
});

runTest("destroy removes document, window, trigger, and menu listeners", function () {
  const harness = createHarness();

  assert.ok(document.listenerCount() > 0);
  assert.ok(window.listenerCount() > 0);
  assert.ok(harness.formatButton.listenerCount() > 0);
  assert.ok(harness.formatMenu.listenerCount() > 0);

  harness.controller.destroy();
  assert.equal(document.listenerCount(), 0);
  assert.equal(window.listenerCount(), 0);
  assert.equal(harness.toggle.listenerCount(), 0);
  assert.equal(harness.formatButton.listenerCount(), 0);
  assert.equal(harness.formatMenu.listenerCount(), 0);
});
