const assert = require("node:assert/strict");

function createButton(view) {
  const classes = new Set();
  const attributes = { "data-workbench-view": view };

  return {
    classList: {
      contains(name) {
        return classes.has(name);
      },
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    },
    closest(selector) {
      return selector === "[data-workbench-view]" ? this : null;
    },
    getAttribute(name) {
      return attributes[name] || null;
    },
    removeAttribute(name) {
      delete attributes[name];
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    }
  };
}

function createRoot(buttons) {
  const listeners = {};

  return {
    addEventListener(name, callback) {
      listeners[name] = callback;
    },
    click(button) {
      listeners.click({ target: button });
    },
    contains(button) {
      return buttons.includes(button);
    },
    querySelectorAll() {
      return buttons;
    }
  };
}

global.window = {
  requestAnimationFrame(callback) {
    callback();
  }
};

let searchFocused = false;
global.document = {
  querySelector() {
    return {
      focus() {
        searchFocused = true;
      }
    };
  }
};

require("../../src/js/activity-bar.js");

const activityBar = window.MarkdownEditor.activityBar;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("normalizes workbench layout state", function () {
  assert.deepEqual(activityBar.normalizeState({
    activePrimaryView: "unknown",
    primarySidebarVisible: false,
    secondarySidebarVisible: 1
  }), {
    activePrimaryView: "files",
    primarySidebarVisible: false,
    secondarySidebarVisible: true
  });
});

runTest("clicking the active primary view toggles sidebar visibility", function () {
  assert.deepEqual(activityBar.nextPrimaryState({
    activePrimaryView: "search",
    primarySidebarVisible: true
  }, "search"), {
    activePrimaryView: "search",
    primarySidebarVisible: false,
    secondarySidebarVisible: false
  });
});

runTest("switching primary views restores the sidebar", function () {
  assert.deepEqual(activityBar.nextPrimaryState({
    activePrimaryView: "files",
    primarySidebarVisible: false
  }, "related"), {
    activePrimaryView: "related",
    primarySidebarVisible: true,
    secondarySidebarVisible: false
  });
});

runTest("routes primary, AI, and Settings buttons to existing owners", function () {
  const buttons = ["files", "search", "related", "ai", "settings"].map(createButton);
  const root = createRoot(buttons);
  const calls = [];
  const sidebar = {
    getMode() {
      return "hidden";
    },
    getPanel() {
      return "search";
    },
    setMode(mode) {
      calls.push(["mode", mode]);
    },
    setPanel(panel) {
      calls.push(["panel", panel]);
    }
  };
  let panelOpen = false;
  const aiAssistant = {
    isPanelOpen() {
      return panelOpen;
    },
    openAssistant() {
      calls.push(["ai"]);
      panelOpen = true;
    },
    openSettings() {
      calls.push(["settings"]);
    }
  };
  const view = activityBar.create({ aiAssistant, rootElement: root, workspaceSidebar: sidebar });

  searchFocused = false;
  view.bindEvents();
  assert.equal(buttons[1].classList.contains("is-active"), true);

  root.click(buttons[1]);
  assert.deepEqual(calls.slice(0, 2), [["panel", "search"], ["mode", "expanded"]]);
  assert.equal(searchFocused, true);

  root.click(buttons[1]);
  assert.deepEqual(calls[2], ["mode", "hidden"]);

  root.click(buttons[2]);
  assert.deepEqual(calls.slice(3, 5), [["panel", "related"], ["mode", "expanded"]]);
  assert.equal(buttons[2].classList.contains("is-active"), true);

  root.click(buttons[3]);
  assert.deepEqual(calls[5], ["ai"]);
  assert.equal(buttons[3].classList.contains("is-active"), true);

  root.click(buttons[4]);
  assert.deepEqual(calls[6], ["settings"]);
});
