const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/storage-resource.js");

const resources = window.MarkdownEditor.storageResource;

assert.equal(resources.normalizeRelativePath("plans\\project.md"), "plans/project.md");
assert.equal(resources.normalizeRelativePath(""), "");
["/absolute.md", "../outside.md", "plans/../outside.md", "C:\\file.txt", "\\\\server\\share", "plans//draft.md"].forEach(function (path) {
  assert.throws(function () { resources.normalizeRelativePath(path); });
});

const local = resources.create({
  providerId: "local-fsa",
  workspaceId: "workspace-1",
  path: "plans/project.md",
  displayName: "project.md",
  opaque: { fileHandle: { name: "project.md" } },
  revision: { size: 9, mtimeMs: 10, hash: "abc" }
});
const copy = resources.clone(local);

assert.equal(resources.isLocal(local), true);
assert.equal(resources.isRemote(local), false);
assert.equal(resources.sameResource(local, copy), true);
assert.equal(copy.opaque, local.opaque);
assert.deepEqual(copy.revision, { size: 9, mtimeMs: 10, hash: "abc" });
resources.updateRevision(copy, { size: 12, mtimeMs: 15, hash: "def" });
assert.deepEqual(copy.revision, { size: 12, mtimeMs: 15, hash: "def" });
assert.throws(function () {
  resources.create({ providerId: "remote-ssh", workspaceId: "remote", path: "" });
});

console.log("ok - normalizes and compares provider-owned storage resources");
