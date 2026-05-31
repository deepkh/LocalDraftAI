const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/workspace-store.js");

const workspaceStore = window.MarkdownEditor.workspaceStore;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("detects Markdown file names only", function () {
  assert.equal(workspaceStore.isMarkdownFile("README.md"), true);
  assert.equal(workspaceStore.isMarkdownFile("notes.markdown"), true);
  assert.equal(workspaceStore.isMarkdownFile("notes.MD"), true);
  assert.equal(workspaceStore.isMarkdownFile("notes.txt"), false);
  assert.equal(workspaceStore.isMarkdownFile("app.js"), false);
  assert.equal(workspaceStore.isMarkdownFile("index.html"), false);
});

runTest("builds a sorted folder-first tree from flat files", function () {
  const tree = workspaceStore.buildTree([
    { name: "zeta.md", path: "zeta.md" },
    { name: "usage.md", path: "docs/usage.md" },
    { name: "architecture.md", path: "docs/architecture.md" },
    { name: "plan.md", path: "plans/plan.md" },
    { name: "README.md", path: "README.md" }
  ]);

  assert.deepEqual(tree.map((node) => node.name), ["docs", "plans", "README.md", "zeta.md"]);
  assert.deepEqual(tree[0].children.map((node) => node.name), ["architecture.md", "usage.md"]);
});

runTest("filters matching files while preserving parent folders", function () {
  const tree = workspaceStore.buildTree([
    { name: "README.md", path: "README.md" },
    { name: "ai-agent-design.md", path: "docs/ai-agent-design.md" },
    { name: "usage.md", path: "docs/usage.md" },
    { name: "Plan_AI_Agent.md", path: "plans/Plan_AI_Agent.md" }
  ]);
  const filtered = workspaceStore.filterTree(tree, "agent");

  assert.deepEqual(filtered.map((node) => node.name), ["docs", "plans"]);
  assert.deepEqual(filtered[0].children.map((node) => node.path), ["docs/ai-agent-design.md"]);
  assert.deepEqual(filtered[1].children.map((node) => node.path), ["plans/Plan_AI_Agent.md"]);
});

runTest("empty search returns the original tree", function () {
  const tree = workspaceStore.buildTree([
    { name: "README.md", path: "README.md" }
  ]);

  assert.equal(workspaceStore.filterTree(tree, ""), tree);
});
