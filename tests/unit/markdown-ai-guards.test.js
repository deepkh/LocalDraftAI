const assert = require("node:assert/strict");

global.window = {};

require("../../src/js/markdown-ai-guards.js");

const guards = window.MarkdownEditor.markdownAiGuards;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("allows AI selection in markdown and wysiwyg modes", function () {
  const selection = { end: 4, mode: "wysiwyg", start: 0, text: "text" };

  assert.equal(guards.canUseAiSelection("markdown", selection), true);
  assert.equal(guards.canUseAiSelection("wysiwyg", selection), true);
  assert.equal(guards.canUseMarkdownSelection("wysiwyg", selection), true);
});

runTest("shows the AI context menu for wysiwyg selections", function () {
  const editor = {
    contains(target) {
      return target === "inside";
    }
  };

  assert.equal(
    guards.canShowContextMenu({
      editor: editor,
      event: { target: "inside" },
      mode: "wysiwyg",
      range: { end: 4, mode: "wysiwyg", start: 0, text: "text" }
    }),
    true
  );

  assert.equal(
    guards.canShowContextMenu({
      editor: editor,
      event: { target: "outside" },
      mode: "wysiwyg",
      range: { end: 4, mode: "wysiwyg", start: 0, text: "text" }
    }),
    false
  );
});
