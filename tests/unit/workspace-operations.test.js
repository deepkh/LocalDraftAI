const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/workspace-related.js");
require("../../src/js/workspace-operations.js");

const workspaceOperations = window.MarkdownEditor.workspaceOperations;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("validates Markdown file names and appends .md", function () {
  assert.deepEqual(workspaceOperations.validateFileName("notes"), {
    ok: true,
    normalizedName: "notes.md"
  });
  assert.equal(workspaceOperations.validateFileName("").ok, false);
  assert.equal(workspaceOperations.validateFileName("../notes.md").ok, false);
  assert.equal(workspaceOperations.validateFileName("notes.txt").reason, "nonMarkdownExtension");
});

runTest("allows confirmed non-Markdown extensions", function () {
  assert.deepEqual(workspaceOperations.validateFileName("notes.txt", {
    allowNonMarkdownExtension: true,
    enforceMarkdownExtension: true
  }), {
    ok: true,
    normalizedName: "notes.txt"
  });
});

runTest("validates folder names", function () {
  assert.equal(workspaceOperations.validateFolderName("docs").ok, true);
  assert.equal(workspaceOperations.validateFolderName("").ok, false);
  assert.equal(workspaceOperations.validateFolderName(".").ok, false);
  assert.equal(workspaceOperations.validateFolderName("a/b").ok, false);
});

runTest("suggests duplicate names next to the source file", function () {
  assert.equal(workspaceOperations.suggestedDuplicateName("README.md"), "README copy.md");
  assert.equal(workspaceOperations.suggestedDuplicateName("plans/Plan_AI.markdown"), "plans/Plan_AI copy.markdown");
});
