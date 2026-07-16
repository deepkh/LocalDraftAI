const assert = require("node:assert/strict");

function element() {
  return {
    dataset: {},
    hidden: false,
    textContent: "",
    title: "",
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attributes[name];
    }
  };
}

global.window = {
  clearTimeout() {},
  setTimeout(callback) {
    callback();
    return 1;
  }
};

require("../../src/js/editor-mode.js");
require("../../src/js/document-type.js");
require("../../src/js/status-bar.js");

const statusBar = window.MarkdownEditor.statusBar;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("counts words and characters", function () {
  assert.deepEqual(statusBar.textCounts("one two\nthree"), {
    characters: 13,
    words: 3
  });
  assert.deepEqual(statusBar.textCounts(""), { characters: 0, words: 0 });
});

runTest("updates workspace, document, mode, wrap, cursor, and counts", function () {
  const elements = {
    aiStatus: element(),
    charCount: element(),
    cursor: element(),
    document: element(),
    documentType: element(),
    message: element(),
    mode: element(),
    softWrap: element(),
    validation: element(),
    wordCount: element(),
    workspace: element()
  };
  const view = statusBar.create(elements);

  view.setWorkspace("Docs");
  view.setDocument({ dirty: true, title: "Notes.md" });
  view.setDocumentType("markdown");
  view.setMode("markdown");
  view.setSoftWrap(false);
  view.setCursor("markdown", "one\ntwo", 6);
  view.scheduleCounts("one two");

  assert.equal(elements.workspace.textContent, "Docs");
  assert.equal(elements.document.textContent, "Unsaved");
  assert.equal(elements.document.hidden, false);
  assert.equal(elements.documentType.textContent, "Markdown");
  assert.equal(elements.mode.textContent, "Markdown");
  assert.equal(elements.softWrap.textContent, "No Wrap");
  assert.equal(elements.cursor.textContent, "Ln 2, Col 3");
  assert.equal(elements.wordCount.textContent, "2 words");
  assert.equal(elements.charCount.textContent, "7 chars");

  view.setDocument({ dirty: true, remoteChanged: true, title: "Notes.md" });
  assert.equal(elements.document.textContent, "Unsaved · Remote changed");
  assert.match(elements.document.title, /remote server/);
});

runTest("hides cursor outside Markdown mode and renders accessible AI status", function () {
  const elements = {
    aiStatus: element(),
    charCount: element(),
    cursor: element(),
    document: element(),
    documentType: element(),
    message: element(),
    mode: element(),
    softWrap: element(),
    validation: element(),
    wordCount: element(),
    workspace: element()
  };
  const view = statusBar.create(elements);

  view.setCursor("wysiwyg", "text", 0);
  view.setAiStatus({
    detail: "Running locally.",
    label: "Mock mode",
    providerLabel: "Local mock",
    status: "mock"
  });

  assert.equal(elements.cursor.hidden, true);
  assert.equal(elements.aiStatus.textContent, "Local mock · Mock mode");
  assert.match(elements.aiStatus.attributes["aria-label"], /AI status: Mock mode/);
});

runTest("renders structured document validation and hides non-applicable state", function () {
  const elements = {
    aiStatus: element(), charCount: element(), cursor: element(), document: element(),
    documentType: element(), message: element(), mode: element(), softWrap: element(),
    validation: element(), wordCount: element(), workspace: element()
  };
  const view = statusBar.create(elements);

  view.setDocumentType("json");
  view.setValidation("json", { status: "invalid", message: "Unexpected token", line: 2, column: 3 });
  assert.equal(elements.documentType.textContent, "JSON");
  assert.equal(elements.validation.textContent, "Invalid JSON");
  assert.match(elements.validation.title, /line 2, column 3/);

  view.setValidation("text", { status: "not-applicable" });
  assert.equal(elements.validation.hidden, true);
});
