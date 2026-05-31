const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/workspace-session.js");

const workspaceSession = window.MarkdownEditor.workspaceSession;

function runTest(name, callback) {
  Promise.resolve()
    .then(callback)
    .then(function () {
      console.log("ok - " + name);
    })
    .catch(function (error) {
      console.error("not ok - " + name);
      throw error;
    });
}

runTest("normalizes restorable session metadata", function () {
  const handle = { name: "LocalDraftAI" };
  const metadata = workspaceSession.normalizeSessionMetadata({
    activePath: "plans/Plan_AI.md",
    openedTabs: [
      { path: "README.md", mode: "wysiwyg", scrollTop: 10, softWrap: true },
      { path: "", mode: "markdown" }
    ],
    collapsedFolders: ["docs", "plans/archive", "/absolute/path", "../outside", "notes\\drafts"],
    sidebarScroll: { panel: "files", scrollLeft: 4, scrollTop: 320 },
    workspaceHandle: handle,
    workspaceName: "LocalDraftAI"
  });

  assert.equal(metadata.workspaceHandle, handle);
  assert.equal(metadata.workspaceName, "LocalDraftAI");
  assert.equal(metadata.openedTabs.length, 1);
  assert.equal(metadata.openedTabs[0].title, "README.md");
  assert.deepEqual(metadata.collapsedFolders, ["docs", "plans/archive", "notes/drafts"]);
  assert.deepEqual(metadata.sidebarScroll, { panel: "files", scrollLeft: 4, scrollTop: 320 });
});

runTest("queries permission state from stored handles", async function () {
  const handle = {
    queryPermission(options) {
      assert.deepEqual(options, { mode: "read" });
      return Promise.resolve("prompt");
    }
  };

  assert.equal(await workspaceSession.queryWorkspacePermission(handle, "read"), "prompt");
});

runTest("requests permission only through requestWorkspacePermission", async function () {
  let requested = false;
  const handle = {
    queryPermission() {
      return Promise.resolve("prompt");
    },
    requestPermission(options) {
      requested = true;
      assert.deepEqual(options, { mode: "read" });
      return Promise.resolve("granted");
    }
  };

  assert.equal(await workspaceSession.requestWorkspacePermission(handle, "read"), "granted");
  assert.equal(requested, true);
});

runTest("reports unsupported IndexedDB in plain unit environment", function () {
  assert.equal(workspaceSession.isSupported(), false);
});
