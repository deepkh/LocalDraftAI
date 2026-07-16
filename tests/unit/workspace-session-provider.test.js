const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/document-type.js");
require("../../src/js/storage-resource.js");
require("../../src/js/storage-provider-registry.js");
require("../../src/js/local-filesystem-provider.js");
require("../../src/js/workspace-session.js");

const sessions = window.MarkdownEditor.workspaceSession;
const handle = { name: "Docs" };

const migrated = sessions.normalizeSessionMetadata({
  workspaceHandle: handle,
  workspaceName: "Docs",
  openedTabs: [{ path: "README.md" }]
});
assert.equal(migrated.providerId, "local-fsa");
assert.equal(migrated.workspaceRef.localHandle, handle);
assert.equal(migrated.workspaceHandle, handle);

const remote = sessions.normalizeSessionMetadata({
  providerId: "remote-ssh",
  workspaceRef: {
    connectionId: "home-server",
    remoteRootPath: "/home/gary/notes"
  },
  workspaceName: "notes"
});
assert.equal(remote.providerId, "remote-ssh");
assert.equal(remote.workspaceHandle, null);
assert.equal(remote.workspaceRef.connectionId, "home-server");
assert.equal(remote.workspaceRef.remoteRootPath, "/home/gary/notes");

const recent = sessions.normalizeRecentWorkspaceRecord({
  providerId: "local-fsa",
  workspaceRef: { localHandle: handle },
  workspaceName: "Docs",
  lastOpened: 1
});
assert.equal(recent.providerId, "local-fsa");
assert.equal(recent.workspaceRef.localHandle, handle);

console.log("ok - migrates version-2 local workspace metadata to provider-aware sessions");
