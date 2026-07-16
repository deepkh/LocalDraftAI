const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/document-type.js");

const documentType = window.MarkdownEditor.documentType;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("detects supported extensions case-insensitively", function () {
  assert.equal(documentType.getDocumentTypeForName("README.MD").id, "markdown");
  assert.equal(documentType.getDocumentTypeForName("notes.TxT").id, "text");
  assert.equal(documentType.getDocumentTypeForName("application.LoG").id, "text");
  assert.equal(documentType.getDocumentTypeForName("settings.JSON").id, "json");
  assert.equal(documentType.getDocumentTypeForName("config.YML").id, "yaml");
  assert.equal(documentType.getDocumentTypeForName("workflow.YaMl").id, "yaml");
});

runTest("preserves the existing Markdown extension alias", function () {
  assert.equal(documentType.getDocumentTypeForName("notes.markdown").id, "markdown");
});

runTest("rejects unsupported extensions and ambiguous names", function () {
  ["app.js", "index.html", "image.png", "archive.zip", "README", "notes.md.exe"].forEach(function (name) {
    assert.equal(documentType.isSupportedFileName(name), false, name);
  });
});

runTest("reports document capabilities", function () {
  assert.equal(documentType.allowsWysiwyg("markdown"), true);
  assert.equal(documentType.allowsMarkdownCommands("markdown"), true);
  ["text", "json", "yaml"].forEach(function (typeId) {
    assert.equal(documentType.allowsWysiwyg(typeId), false);
    assert.equal(documentType.allowsMarkdownCommands(typeId), false);
  });
  assert.equal(documentType.allowsAiReplacement("text"), true);
  assert.equal(documentType.allowsAiReplacement("json"), false);
});

runTest("provides default names and grouped file picker types", function () {
  assert.equal(documentType.getDefaultFileName("markdown"), "Untitled.md");
  assert.equal(documentType.getDefaultFileName("text"), "Untitled.txt");
  assert.equal(documentType.getDefaultFileName("json"), "Untitled.json");
  assert.equal(documentType.getDefaultFileName("yaml"), "Untitled.yml");
  assert.deepEqual(documentType.getFilePickerTypes()[0].accept["application/json"], [".json"]);
  assert.deepEqual(documentType.getFilePickerTypes()[0].accept["text/plain"], [".txt", ".log", ".yml", ".yaml"]);
});
