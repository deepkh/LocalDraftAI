const assert = require("node:assert/strict");

global.window = {
  MarkdownEditor: {
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
  }
};

global.document = {
  execCommand() {}
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
