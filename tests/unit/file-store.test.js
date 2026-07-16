const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/document-type.js");
require("../../src/js/storage-resource.js");
require("../../src/js/storage-provider-registry.js");
require("../../src/js/local-filesystem-provider.js");
require("../../src/js/file-store.js");

const fileStore = window.MarkdownEditor.fileStore;

function bytesFile(bytes) {
  return {
    async arrayBuffer() {
      return Uint8Array.from(bytes).buffer;
    }
  };
}

async function runTest(name, callback) {
  try {
    await callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

(async function () {
  await runTest("normalizes source text while detecting CRLF, BOM, and final newline", async function () {
    const encoded = new TextEncoder().encode("\ufefffirst\r\nsecond\r\n");
    const result = await fileStore.readTextDocument(bytesFile(encoded));

    assert.equal(result.markdownText, "first\nsecond\n");
    assert.equal(result.preferredLineEnding, "\r\n");
    assert.equal(result.hasUtf8Bom, true);
    assert.equal(result.hasFinalNewline, true);
  });

  await runTest("serializes normalized text with the original encoding metadata", function () {
    const session = {
      markdownText: "first\nsecond\n",
      preferredLineEnding: "\r\n",
      hasUtf8Bom: true
    };

    assert.equal(fileStore.serializeSessionText(session), "\ufefffirst\r\nsecond\r\n");
  });

  await runTest("preserves supported Save As names and supplies only a missing extension", function () {
    assert.equal(fileStore.supportedFileName("config.yaml", "yaml"), "config.yaml");
    assert.equal(fileStore.supportedFileName("config", "yaml"), "config.yml");
    assert.equal(fileStore.supportedFileName("notes.txt", "markdown"), "notes.txt");
    assert.equal(fileStore.supportedFileName("application.log", "markdown"), "application.log");
  });

  await runTest("recalculates session type after Save As", function () {
    const session = { documentType: "json", editorMode: "markdown" };

    fileStore.applyDocumentTypeToSession(session, "config.yaml");
    assert.equal(session.documentType, "yaml");
    assert.equal(session.extension, ".yaml");
    assert.equal(session.sourceOnly, true);

    fileStore.applyDocumentTypeToSession(session, "README.md");
    assert.equal(session.documentType, "markdown");
    assert.equal(session.sourceOnly, false);
  });

  await runTest("writes invalid structured content without blocking save", async function () {
    let written = null;
    const handle = {
      name: "settings.json",
      async createWritable() {
        return {
          async write(value) { written = value; },
          async close() {}
        };
      },
      async getFile() { return bytesFile(new TextEncoder().encode(String(written || ""))); }
    };
    const session = {
      documentType: "json",
      fileHandle: handle,
      markdownText: "{ invalid JSON }",
      preferredLineEnding: "\n",
      validationState: { status: "invalid" }
    };

    await fileStore.saveSession(session);
    assert.equal(written, "{ invalid JSON }");
    assert.equal(session.dirty, false);
  });

  await runTest("Save As preserves text and adopts the selected supported extension", async function () {
    let written = null;
    const handle = {
      name: "config.yaml",
      async createWritable() {
        return {
          async write(value) { written = value; },
          async close() {}
        };
      },
      async getFile() { return bytesFile(new TextEncoder().encode(String(written || ""))); }
    };
    const session = {
      documentType: "json",
      fileHandle: null,
      markdownText: "key: value\n",
      preferredLineEnding: "\n",
      title: "config.json"
    };
    window.showSaveFilePicker = async function () { return handle; };

    await fileStore.saveSessionAs(session);
    assert.equal(written, "key: value\n");
    assert.equal(session.documentType, "yaml");
    assert.equal(session.extension, ".yaml");
    assert.equal(session.title, "config.yaml");
  });
}());
