const assert = require("node:assert/strict");

global.window = {
  MarkdownEditor: {
    markdown: {
      sanitizePastedHtml(value) {
        return String(value || "");
      },
      shouldUsePlainTextFallback(html, text) {
        return /\S/.test(String(text || "")) &&
          !/<(?:button|input|select|textarea|script|style)\b/i.test(String(html || "")) &&
          !/\S/.test(String(html || "").replace(/<[^>]*>/g, ""));
      }
    },
    utils: {
      escapeAttribute(value) {
        return String(value || "");
      },
      sanitizeImageUrl(value) {
        return String(value || "");
      },
      sanitizeUrl(value) {
        return String(value || "");
      }
    }
  },
  getSelection() {
    return { rangeCount: 0 };
  },
  navigator: {}
};

const executedCommands = [];

global.document = {
  activeElement: null,
  createElement() {
    let html = "";
    return {
      get innerHTML() {
        return html;
      },
      set innerHTML(value) {
        html = String(value || "");
        this.textContent = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]*>/g, "");
      },
      textContent: ""
    };
  },
  execCommand(command, _showUi, value) {
    executedCommands.push({ command, value });
    return true;
  }
};

require("../../src/js/editor-actions.js");

const editorActions = window.MarkdownEditor.editorActions;

function createTextarea(value) {
  return {
    focused: false,
    selectionEnd: value.length,
    selectionStart: 0,
    value,
    focus() {
      this.focused = true;
    },
    setRangeText(replacement, start, end) {
      this.value = this.value.slice(0, start) + replacement + this.value.slice(end);
      this.selectionStart = start;
      this.selectionEnd = start + replacement.length;
    }
  };
}

function createActions(value) {
  const markdownEditor = createTextarea(value);
  const context = {
    applyHistoryStep() {},
    formatBlock: { value: "P" },
    getActiveMode() {
      return "markdown";
    },
    markdownEditor,
    scheduleSyncFromWysiwyg() {},
    setMarkdown(nextValue) {
      markdownEditor.value = nextValue;
    },
    wysiwygEditor: {
      contains() {
        return false;
      },
      focus() {}
    }
  };

  return {
    actions: editorActions.create(context),
    markdownEditor
  };
}

function createWysiwygActions(options = {}) {
  const markdownEditor = createTextarea("");
  const state = {
    imageFiles: null,
    imageSelection: null,
    syncCount: 0
  };
  const wysiwygEditor = {
    contains() {
      return false;
    },
    focus() {
      document.activeElement = wysiwygEditor;
    },
    scrollTop: 37
  };
  const context = {
    applyHistoryStep() {},
    formatBlock: { value: "P" },
    getActiveMode() {
      return options.mode || "wysiwyg";
    },
    insertClipboardImages(files, selection) {
      state.imageFiles = files;
      state.imageSelection = selection;
    },
    markdownEditor,
    scheduleSyncFromWysiwyg() {
      state.syncCount += 1;
    },
    setMarkdown(nextValue) {
      markdownEditor.value = nextValue;
    },
    wysiwygEditor
  };

  document.activeElement = wysiwygEditor;
  return {
    actions: editorActions.create(context),
    markdownEditor,
    state,
    wysiwygEditor
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

runTest("indents Markdown lines for nested lists", function () {
  const setup = createActions("- Parent\n- Child");

  setup.markdownEditor.selectionStart = 9;
  setup.markdownEditor.selectionEnd = setup.markdownEditor.value.length;
  setup.actions.applyToolbarAction("indentList");

  assert.equal(setup.markdownEditor.value, "- Parent\n  - Child");
});

runTest("outdents Markdown lines for nested lists", function () {
  const setup = createActions("- Parent\n  - Child");

  setup.markdownEditor.selectionStart = 9;
  setup.markdownEditor.selectionEnd = setup.markdownEditor.value.length;
  setup.actions.applyToolbarAction("outdentList");

  assert.equal(setup.markdownEditor.value, "- Parent\n- Child");
});

runTest("list toggles preserve indentation", function () {
  const setup = createActions("  Child");

  setup.actions.applyToolbarAction("unorderedList");

  assert.equal(setup.markdownEditor.value, "  - Child");
});

runTest("inserts a horizontal rule as a separated Markdown block", function () {
  const setup = createActions("Before\nAfter");

  setup.markdownEditor.selectionStart = "Before".length;
  setup.markdownEditor.selectionEnd = "Before".length;
  setup.actions.applyToolbarAction("horizontalRule");

  assert.equal(setup.markdownEditor.value, "Before\n\n---\n\nAfter");
});

runTest("replaces selected Markdown with a horizontal rule", function () {
  const setup = createActions("Before\nselected\nAfter");

  setup.markdownEditor.selectionStart = "Before\n".length;
  setup.markdownEditor.selectionEnd = "Before\nselected".length;
  setup.actions.applyToolbarAction("horizontalRule");

  assert.equal(setup.markdownEditor.value, "Before\n\n---\n\nAfter");
});

runTest("inserts a Markdown table as a separated block", function () {
  const setup = createActions("Before\nAfter");

  setup.markdownEditor.selectionStart = "Before".length;
  setup.markdownEditor.selectionEnd = "Before".length;
  setup.actions.applyToolbarAction("insertTable");

  assert.equal(
    setup.markdownEditor.value,
    "Before\n\n| Column 1 | Column 2 | Column 3 |\n" +
    "| --- | --- | --- |\n" +
    "| Cell 1 | Cell 2 | Cell 3 |\n\nAfter"
  );
});

runTest("routes native WYSIWYG paste through the shared sanitizer once", function () {
  const setup = createWysiwygActions();
  const originalSanitizer = window.MarkdownEditor.markdown.sanitizePastedHtml;
  const sanitizedInputs = [];
  let prevented = false;

  executedCommands.length = 0;
  window.MarkdownEditor.markdown.sanitizePastedHtml = function (html) {
    sanitizedInputs.push(html);
    return "<p>Safe</p>";
  };

  try {
    const handled = setup.actions.handleWysiwygPasteEvent({
      clipboardData: {
        files: [],
        getData(type) {
          return type === "text/html" ? "<p onclick='bad()'>Safe</p>" : "Safe";
        },
        items: []
      },
      preventDefault() {
        prevented = true;
      }
    });

    assert.equal(handled, true);
    assert.equal(prevented, true);
    assert.deepEqual(sanitizedInputs, ["<p onclick='bad()'>Safe</p>"]);
    assert.deepEqual(executedCommands, [{ command: "insertHTML", value: "<p>Safe</p>" }]);
    assert.equal(setup.state.syncCount, 1);
    assert.equal(setup.wysiwygEditor.scrollTop, 37);
  } finally {
    window.MarkdownEditor.markdown.sanitizePastedHtml = originalSanitizer;
  }
});

runTest("does not restore blocked HTML labels through plain-text fallback", function () {
  const setup = createWysiwygActions();
  const originalSanitizer = window.MarkdownEditor.markdown.sanitizePastedHtml;

  executedCommands.length = 0;
  window.MarkdownEditor.markdown.sanitizePastedHtml = function () {
    return "";
  };

  try {
    setup.actions.insertClipboardPayload({
      files: [],
      html: "<button>Copy</button>",
      text: "Copy"
    }, { mode: "wysiwyg", range: null });
    assert.deepEqual(executedCommands, []);
    assert.equal(setup.state.syncCount, 0);
  } finally {
    window.MarkdownEditor.markdown.sanitizePastedHtml = originalSanitizer;
  }
});

runTest("uses meaningful plain text when an empty HTML shell sanitizes away", function () {
  const setup = createWysiwygActions();
  const originalSanitizer = window.MarkdownEditor.markdown.sanitizePastedHtml;

  executedCommands.length = 0;
  window.MarkdownEditor.markdown.sanitizePastedHtml = function () {
    return "";
  };

  try {
    setup.actions.insertClipboardPayload({
      files: [],
      html: "<span></span>",
      text: "Fallback text"
    }, { mode: "wysiwyg", range: null });
    assert.deepEqual(executedCommands, [{ command: "insertText", value: "Fallback text" }]);
    assert.equal(setup.state.syncCount, 1);
  } finally {
    window.MarkdownEditor.markdown.sanitizePastedHtml = originalSanitizer;
  }
});

runTest("processes pasted image files before accompanying rich text", function () {
  const setup = createWysiwygActions();
  const image = { name: "paste.png", type: "image/png" };

  executedCommands.length = 0;
  setup.actions.insertClipboardPayload({
    files: [image],
    html: "<p>Duplicate text</p>",
    text: "Duplicate text"
  }, { mode: "wysiwyg", range: null });

  assert.deepEqual(setup.state.imageFiles, [image]);
  assert.equal(setup.state.imageSelection.mode, "wysiwyg");
  assert.deepEqual(executedCommands, []);
  assert.equal(setup.state.syncCount, 0);
});

runTest("keeps Markdown paste plain-text-only", function () {
  const setup = createActions("Before");

  setup.markdownEditor.selectionStart = setup.markdownEditor.value.length;
  setup.markdownEditor.selectionEnd = setup.markdownEditor.value.length;
  setup.actions.insertClipboardPayload({
    files: [{ type: "image/png" }],
    html: "<strong>After</strong>",
    text: "After"
  }, { mode: "markdown", start: 6, end: 6 });

  assert.equal(setup.markdownEditor.value, "BeforeAfter");
});

(async function testContextMenuPasteUsesSharedSanitizer() {
  const setup = createWysiwygActions();
  const originalClipboard = window.navigator.clipboard;
  const originalSanitizer = window.MarkdownEditor.markdown.sanitizePastedHtml;
  const sanitizedInputs = [];

  executedCommands.length = 0;
  window.MarkdownEditor.markdown.sanitizePastedHtml = function (html) {
    sanitizedInputs.push(html);
    return "<p>Context safe</p>";
  };
  window.navigator.clipboard = {
    read() {
      return Promise.resolve([{
        getType(type) {
          return Promise.resolve({
            text() {
              return Promise.resolve(type === "text/html" ? "<p onclick='bad()'>Context safe</p>" : "Context safe");
            }
          });
        },
        types: ["text/html", "text/plain"]
      }]);
    }
  };

  try {
    await setup.actions.applyClipboardAction("paste", { mode: "wysiwyg", range: null });
    assert.deepEqual(sanitizedInputs, ["<p onclick='bad()'>Context safe</p>"]);
    assert.deepEqual(executedCommands, [{ command: "insertHTML", value: "<p>Context safe</p>" }]);
    assert.equal(setup.state.syncCount, 1);
    console.log("ok - routes context-menu WYSIWYG paste through the shared sanitizer once");
  } catch (error) {
    console.error("not ok - routes context-menu WYSIWYG paste through the shared sanitizer once");
    process.exitCode = 1;
    throw error;
  } finally {
    window.navigator.clipboard = originalClipboard;
    window.MarkdownEditor.markdown.sanitizePastedHtml = originalSanitizer;
  }
}());
