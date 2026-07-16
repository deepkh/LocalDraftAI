const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/storage-provider-registry.js");

const registry = window.MarkdownEditor.storageProviders;
const errors = window.MarkdownEditor.storageProviderErrors;
const provider = { id: "local-fsa", label: "Local Files" };

registry.register(provider);
assert.equal(registry.get("local-fsa"), provider);
assert.equal(registry.getForSession({ storageProviderId: "local-fsa" }), provider);
assert.equal(registry.getForWorkspace({ providerId: "local-fsa" }), provider);
assert.throws(function () { registry.register({ id: "local-fsa" }); });

const error = errors.create("REVISION_CONFLICT", "Changed", {
  details: { currentRevision: { hash: "new" } }
});
assert.equal(error.name, "StorageProviderError");
assert.equal(error.code, "REVISION_CONFLICT");
assert.equal(error.retryable, false);
assert.equal(error.details.currentRevision.hash, "new");
assert.equal(errors.normalize(new Error("offline"), "CONNECTION_LOST").code, "CONNECTION_LOST");

console.log("ok - registers providers and normalizes storage errors");
