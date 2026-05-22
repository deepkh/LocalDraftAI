const assert = require("node:assert/strict");

const listeners = {};

global.window = {
  addEventListener() {},
  innerWidth: 1024,
  innerHeight: 768
};

global.document = {
  body: {
    appendChild() {}
  },
  createElement(tag) {
    return {
      addEventListener() {},
      appendChild() {},
      className: "",
      hidden: true,
      innerHTML: "",
      setAttribute() {},
      style: {},
      tagName: tag.toUpperCase()
    };
  },
  addEventListener() {}
};

require("../../src/js/ai-actions.js");
require("../../src/js/markdown-ai-guards.js");
require("../../src/js/ai-context-menu.js");

const aiContextMenu = window.MarkdownEditor.aiContextMenu;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("binds context menu handlers for both editors", function () {
  const markdownEditor = {
    addEventListener(type, handler) {
      listeners.markdown = listeners.markdown || {};
      listeners.markdown[type] = handler;
    }
  };
  const wysiwygEditor = {
    addEventListener(type, handler) {
      listeners.wysiwyg = listeners.wysiwyg || {};
      listeners.wysiwyg[type] = handler;
    }
  };

  const menu = aiContextMenu.create({
    captureSelection() {
      return { mode: "wysiwyg", range: { collapsed: false }, text: "text" };
    },
    getActiveMode() {
      return "wysiwyg";
    },
    markdownEditor: markdownEditor,
    onAction() {},
    wysiwygEditor: wysiwygEditor
  });

  menu.bindEvents();

  assert.equal(typeof listeners.markdown.contextmenu, "function");
  assert.equal(typeof listeners.wysiwyg.contextmenu, "function");
});
