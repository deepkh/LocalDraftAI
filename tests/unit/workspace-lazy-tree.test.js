const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/document-type.js");
require("../../src/js/storage-resource.js");
require("../../src/js/storage-provider-registry.js");
require("../../src/js/workspace-store.js");

const workspaceStore = window.MarkdownEditor.workspaceStore;
const registry = window.MarkdownEditor.storageProviders;

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
  const calls = [];
  const closed = [];
  let failRoot = false;
  let failPlans = false;
  const provider = {
    id: "remote-ssh",
    async closeWorkspace(workspace) {
      closed.push(workspace.id);
    },
    async openWorkspace() {
      return workspace;
    },
    async listDirectory(workspace, path) {
      calls.push(path);
      if (failRoot && path === "") {
        throw new Error("root listing failed");
      }
      if (failPlans && path === "plans") {
        throw new Error("plans refresh failed");
      }
      if (path === "") {
        return [
          { kind: "directory", name: "empty", path: "empty", loaded: false },
          { kind: "directory", name: "plans", path: "plans", loaded: false },
          { kind: "file", name: "README.md", path: "README.md", documentType: "markdown" }
        ];
      }
      if (path === "plans") {
        return [
          { kind: "directory", name: "archive", path: "plans/archive", loaded: false },
          { kind: "file", name: "project.json", path: "plans/project.json", documentType: "json" }
        ];
      }
      return [];
    }
  };
  registry.register(provider);
  const workspace = {
    id: "remote-workspace-1",
    providerId: "remote-ssh",
    name: "notes",
    capabilities: { read: true, write: false }
  };

  await runTest("opens only the remote root and preserves empty directories", async function () {
    const result = await workspaceStore.scanWorkspace(workspace);

    assert.deepEqual(calls, [""]);
    assert.equal(result.lazy, true);
    assert.deepEqual(result.tree.map((node) => node.name), ["empty", "plans", "README.md"]);
    assert.equal(result.tree[0].loaded, false);
    assert.deepEqual(result.tree[0].children, []);
    assert.deepEqual(result.files.map((file) => file.path), ["README.md"]);
  });

  await runTest("does not recursively inspect unloaded remote root directories", async function () {
    calls.length = 0;
    const result = await workspaceStore.scanWorkspace(workspace);

    assert.deepEqual(calls, [""]);
    assert.ok(workspaceStore.findTreeNode(result.tree, "empty"));
    assert.ok(workspaceStore.findTreeNode(result.tree, "plans"));
    assert.equal(workspaceStore.findTreeNode(result.tree, "plans/archive"), null);
  });

  await runTest("loads one expanded directory and caches its children", async function () {
    calls.length = 0;
    const result = await workspaceStore.scanWorkspace(workspace);
    const expanded = await workspaceStore.loadDirectory(workspace, result.tree, "plans");
    const plans = workspaceStore.findTreeNode(expanded.tree, "plans");

    assert.deepEqual(calls, ["", "plans"]);
    assert.equal(plans.loaded, true);
    assert.equal(plans.loading, false);
    assert.deepEqual(plans.children.map((node) => node.name), ["archive", "project.json"]);
    assert.deepEqual(expanded.files.map((file) => file.path).sort(), ["README.md", "plans/project.json"]);
    assert.equal(workspaceStore.filterTree(expanded.tree, "project")[0].path, "plans");

    calls.length = 0;
    const refreshed = await workspaceStore.refreshDirectory(workspace, expanded.tree, "");
    const refreshedPlans = workspaceStore.findTreeNode(refreshed.tree, "plans");
    assert.deepEqual(calls, [""]);
    assert.equal(refreshedPlans.loaded, true);
    assert.deepEqual(refreshedPlans.children.map((node) => node.path), ["plans/archive", "plans/project.json"]);

    failPlans = true;
    await workspaceStore.refreshDirectory(workspace, refreshed.tree, "plans");
    failPlans = false;
    assert.equal(refreshedPlans.error, "plans refresh failed");
    assert.deepEqual(refreshedPlans.children.map((node) => node.path), ["plans/archive", "plans/project.json"]);
  });

  await runTest("closes a remote workspace when its root cannot be listed", async function () {
    failRoot = true;
    await assert.rejects(
      workspaceStore.openWorkspace({ provider }),
      /root listing failed/
    );
    failRoot = false;
    assert.deepEqual(closed, [workspace.id]);
  });
}()).catch(function (error) {
  process.exitCode = 1;
  throw error;
});
