const assert = require("node:assert/strict");

global.window = {};

require("../../src/js/ai-actions.js");
require("../../src/js/markdown-repair.js");

const aiActions = window.MarkdownEditor.aiActions;
const repair = window.MarkdownEditor.markdownRepair;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("defines all phase 1 AI actions", function () {
  const labels = aiActions.groups().flatMap((group) => group.actions.map((action) => action.label));

  assert.deepEqual(labels, [
    "Grammar Correction",
    "Improve Wording",
    "Make Professional",
    "Summarize",
    "Make Shorter",
    "Beautify Markdown",
    "Fix Markdown Syntax"
  ]);
});

runTest("builds prompt messages for selected Markdown", function () {
  const messages = aiActions.buildMessages("correctGrammar", "# Teh title");

  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /Correct grammar/);
  assert.match(messages[1].content, /# Teh title/);
});

runTest("mock grammar correction preserves inline code and links", function () {
  const result = repair.runAction(
    "correctGrammar",
    "teh value uses `teh_code` and [teh link](assets/teh.png)"
  );

  assert.equal(result, "the value uses `teh_code` and [teh link](assets/teh.png)");
});

runTest("mock grammar correction preserves fenced code blocks", function () {
  const result = repair.runAction("correctGrammar", "teh text\n\n```js\nconst value = 'teh';");

  assert.equal(result, "the text\n\n```js\nconst value = 'teh';");
});

runTest("mock syntax repair closes an open fenced code block", function () {
  const result = repair.runAction("fixMarkdownSyntax", "#Title\n\n```js\nconst a = 1;");

  assert.equal(result, "# Title\n\n```js\nconst a = 1;\n```");
});

runTest("mock summarize returns Markdown bullets", function () {
  const result = repair.runAction(
    "summarize",
    "Markdown Forge edits Markdown. It previews content. It keeps tabs isolated."
  );

  assert.equal(result, "- Markdown Forge edits Markdown.\n- It previews content.\n- It keeps tabs isolated.");
});
