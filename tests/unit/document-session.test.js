const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/document-type.js");
require("../../src/js/document-session.js");

const createSession = window.MarkdownEditor.documentSession.create;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("keeps existing Markdown session behavior", function () {
  const session = createSession({ title: "README.md", editorMode: "wysiwyg", markdownText: "# Readme\n" });

  assert.equal(session.documentType, "markdown");
  assert.equal(session.extension, ".md");
  assert.equal(session.sourceOnly, false);
  assert.equal(session.editorMode, "wysiwyg");
  assert.equal(session.markdownText, "# Readme\n");
});

runTest("forces every non-Markdown type into source mode", function () {
  ["notes.txt", "application.log", "settings.json", "config.yml", "workflow.yaml"].forEach(function (title) {
    const session = createSession({ title: title, editorMode: "wysiwyg" });

    assert.equal(session.sourceOnly, true, title);
    assert.equal(session.editorMode, "markdown", title);
  });
});

runTest("uses the selected document type for a direct untitled session", function () {
  const session = createSession({ documentType: "text" });

  assert.equal(session.title, "Untitled.txt");
  assert.equal(session.documentType, "text");
  assert.equal(session.extension, ".txt");
  assert.equal(session.sourceOnly, true);
});

runTest("treats the filename extension as authoritative over stale type metadata", function () {
  const session = createSession({
    title: "settings.json",
    documentType: "markdown",
    extension: ".md",
    editorMode: "wysiwyg"
  });

  assert.equal(session.documentType, "json");
  assert.equal(session.extension, ".json");
  assert.equal(session.sourceOnly, true);
  assert.equal(session.editorMode, "markdown");
});

runTest("stores text preservation and validation metadata", function () {
  const session = createSession({
    title: "settings.json",
    markdownText: "{}\n",
    preferredLineEnding: "\r\n",
    hasUtf8Bom: true
  });

  assert.equal(session.preferredLineEnding, "\r\n");
  assert.equal(session.hasUtf8Bom, true);
  assert.equal(session.hasFinalNewline, true);
  assert.equal(session.validationState.status, "not-applicable");
});
