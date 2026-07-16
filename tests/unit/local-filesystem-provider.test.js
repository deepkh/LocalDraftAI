const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/document-type.js");
require("../../src/js/storage-resource.js");
require("../../src/js/storage-provider-registry.js");
require("../../src/js/local-filesystem-provider.js");

const provider = window.MarkdownEditor.localFilesystemProvider;

function fileHandle(name, initialText) {
  let text = initialText || "";
  return {
    kind: "file",
    name,
    async createWritable() {
      return {
        async write(value) {
          text = value instanceof ArrayBuffer
            ? new TextDecoder().decode(new Uint8Array(value))
            : String(value == null ? "" : value);
        },
        async close() {}
      };
    },
    async getFile() {
      return {
        name,
        size: text.length,
        lastModified: 42,
        async arrayBuffer() { return new TextEncoder().encode(text).buffer; },
        async text() { return text; }
      };
    },
    value() { return text; }
  };
}

(async function () {
  const picked = fileHandle("README.md", "# Readme\n");
  window.showOpenFilePicker = async function () { return [picked]; };
  window.showSaveFilePicker = async function () { return picked; };

  const opened = await provider.openDocument();
  assert.equal(opened.resource.providerId, "local-fsa");
  assert.equal(opened.resource.displayName, "README.md");
  assert.equal((await provider.readText(opened.resource)).file.name, "README.md");

  await provider.writeText(opened.resource, "# Updated\n");
  assert.equal(picked.value(), "# Updated\n");

  const files = { "README.md": picked };
  const directories = {};
  const root = {
    kind: "directory",
    name: "Docs",
    entries() {
      const values = Object.keys(files).map((name) => [name, files[name]]);
      let index = 0;
      return { async next() { return index < values.length ? { done: false, value: values[index++] } : { done: true }; } };
    },
    async getFileHandle(name, options = {}) {
      if (files[name]) return files[name];
      if (!options.create) {
        const error = new Error("missing");
        error.name = "NotFoundError";
        throw error;
      }
      files[name] = fileHandle(name, "");
      return files[name];
    },
    async getDirectoryHandle(name, options = {}) {
      if (directories[name]) return directories[name];
      if (!options.create) {
        const error = new Error("missing");
        error.name = "NotFoundError";
        throw error;
      }
      directories[name] = { kind: "directory", name };
      return directories[name];
    },
    async removeEntry(name) { delete files[name]; }
  };
  const workspace = provider.createWorkspaceDescriptor(root, { id: "workspace-local" });
  assert.equal((await provider.listDirectory(workspace, "")).length, 1);
  const created = await provider.createTextFile(workspace, "", "notes.txt", "hello");
  assert.equal(created.path, "notes.txt");
  assert.equal(files["notes.txt"].value(), "hello");
  const duplicated = await provider.duplicate(workspace, "notes.txt", "notes copy.txt");
  assert.equal(files[duplicated.name].value(), "hello");
  const folder = await provider.createDirectory(workspace, "", "plans");
  assert.equal(folder.path, "plans");
  const renamed = await provider.rename(workspace, "notes.txt", "renamed.txt");
  assert.equal(renamed.path, "renamed.txt");
  assert.equal(files["notes.txt"], undefined);

  console.log("ok - local provider owns local picker, read, write, and workspace operations");
}()).catch(function (error) {
  console.error("not ok - local filesystem provider");
  throw error;
});
