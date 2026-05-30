const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/editor-mode.js");

const editorMode = window.MarkdownEditor.editorMode;

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

runTest("normalizes editor mode values", function () {
  assert.equal(editorMode.normalizeEditorMode("markdown"), "markdown");
  assert.equal(editorMode.normalizeEditorMode("wysiwyg"), "wysiwyg");
  assert.equal(editorMode.normalizeEditorMode("split"), "wysiwyg");
  assert.equal(editorMode.normalizeEditorMode(null), "wysiwyg");
});

runTest("migrates legacy markdown-only view mode to Markdown editor mode", function () {
  const storage = createStorage({
    "localdraftai.viewMode": "markdown-only"
  });

  assert.equal(editorMode.readStoredEditorMode(storage), "markdown");
});

runTest("migrates legacy split and wysiwyg-only view modes to WYSIWYG editor mode", function () {
  assert.equal(editorMode.readStoredEditorMode(createStorage({
    "localdraftai.viewMode": "split"
  })), "wysiwyg");
  assert.equal(editorMode.readStoredEditorMode(createStorage({
    "localdraftai.viewMode": "wysiwyg-only"
  })), "wysiwyg");
});

runTest("stores normalized editor mode", function () {
  const storage = createStorage();

  editorMode.storeEditorMode("markdown", storage);
  assert.equal(storage.values["localdraftai.editorMode"], "markdown");
  editorMode.storeEditorMode("unknown", storage);
  assert.equal(storage.values["localdraftai.editorMode"], "wysiwyg");
});

runTest("soft wrap defaults on and persists off", function () {
  const storage = createStorage();

  assert.equal(editorMode.readStoredSoftWrap(storage), true);
  editorMode.storeSoftWrap(false, storage);
  assert.equal(storage.values["localdraftai.softWrapEnabled"], "false");
  assert.equal(editorMode.readStoredSoftWrap(storage), false);
});

runTest("converts Markdown offsets to line and column and back", function () {
  const text = "Alpha\nBeta line\nGamma";
  const offset = text.indexOf("line");
  const position = editorMode.getLineColumnFromOffset(text, offset);

  assert.deepEqual(position, { line: 1, column: 5 });
  assert.equal(editorMode.getOffsetFromLineColumn(text, position.line, position.column), offset);
});

runTest("maps Markdown syntax offsets to visible text offsets", function () {
  const text = "# Title\n\nThis is **bold** and [linked](https://example.test).";
  const markdownOffset = text.indexOf("linked");
  const visibleOffset = editorMode.markdownOffsetToVisibleTextOffset(text, markdownOffset);
  const roundTripOffset = editorMode.visibleTextOffsetToMarkdownOffset(text, visibleOffset);

  assert.ok(visibleOffset < markdownOffset);
  assert.ok(Math.abs(roundTripOffset - markdownOffset) <= 1);
});

runTest("counts escaped Markdown punctuation as visible literal characters", function () {
  assert.equal(editorMode.markdownOffsetToVisibleTextOffset("\\*literal\\*", 11), 9);
  assert.equal(editorMode.markdownOffsetToVisibleTextOffset("\\# heading", 10), 9);
});
