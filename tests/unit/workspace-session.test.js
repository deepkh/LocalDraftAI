const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/document-type.js");
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
  assert.equal(metadata.openedTabs[0].wysiwygTextOffset, 0);
  assert.deepEqual(metadata.collapsedFolders, ["docs", "plans/archive", "notes/drafts"]);
  assert.deepEqual(metadata.sidebarScroll, { panel: "files", scrollLeft: 4, scrollTop: 320 });
});

runTest("forces restored source-only tabs out of stale WYSIWYG mode", function () {
  const jsonTab = workspaceSession.normalizeTabMetadata({
    path: "settings.json",
    documentType: "json",
    mode: "wysiwyg",
    selectionStart: 4,
    selectionEnd: 9,
    dirty: true,
    softWrap: false
  });

  assert.equal(jsonTab.documentType, "json");
  assert.equal(jsonTab.mode, "markdown");
  assert.equal(jsonTab.selectionStart, 4);
  assert.equal(jsonTab.selectionEnd, 9);
  assert.equal(jsonTab.dirty, true);
  assert.equal(jsonTab.softWrap, false);
});

runTest("uses a restored path extension over stale document type metadata", function () {
  const tab = workspaceSession.normalizeTabMetadata({
    path: "workflow.yaml",
    documentType: "markdown",
    mode: "wysiwyg"
  });

  assert.equal(tab.documentType, "yaml");
  assert.equal(tab.mode, "markdown");
});

runTest("normalizes recent workspace records", function () {
  const handle = { name: "Notes" };
  const record = workspaceSession.normalizeRecentWorkspaceRecord({
    id: 7,
    lastOpened: "1710000000000",
    workspaceHandle: handle
  });

  assert.equal(record.id, 7);
  assert.equal(record.workspaceHandle, handle);
  assert.equal(record.workspaceName, "Notes");
  assert.equal(record.lastOpened, 1710000000000);
});

runTest("normalizes recent workspace records with restore metadata", function () {
  const handle = { name: "Docs" };
  const record = workspaceSession.normalizeRecentWorkspaceRecord({
    activePath: "README.md",
    collapsedFolders: ["docs", "../outside"],
    lastOpened: 1710000000001,
    openedTabs: [
      { path: "README.md", mode: "markdown", scrollTop: 12 },
      { path: "" }
    ],
    sidebarScroll: { panel: "related", scrollTop: 5 },
    workspaceHandle: handle,
    workspaceName: "Docs"
  });

  assert.equal(record.activePath, "README.md");
  assert.equal(record.openedTabs.length, 1);
  assert.equal(record.openedTabs[0].path, "README.md");
  assert.deepEqual(record.collapsedFolders, ["docs"]);
  assert.equal(record.sidebarScroll.panel, "related");
  assert.equal(record.workspaceHandle, handle);
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
