const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/document-type.js");
require("../../src/js/storage-resource.js");
require("../../src/js/storage-provider-registry.js");
require("../../src/js/local-filesystem-provider.js");
require("../../src/js/workspace-store.js");

const workspaceStore = window.MarkdownEditor.workspaceStore;

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
await runTest("detects Markdown file names without treating structured files as Markdown", function () {
  assert.equal(workspaceStore.isMarkdownFile("README.md"), true);
  assert.equal(workspaceStore.isMarkdownFile("notes.markdown"), true);
  assert.equal(workspaceStore.isMarkdownFile("notes.MD"), true);
  assert.equal(workspaceStore.isMarkdownFile("notes.txt"), false);
  assert.equal(workspaceStore.isMarkdownFile("app.js"), false);
  assert.equal(workspaceStore.isMarkdownFile("index.html"), false);
});

await runTest("detects every supported workspace file type", function () {
  ["README.md", "notes.txt", "application.log", "settings.json", "config.yml", "workflow.yaml"].forEach(function (name) {
    assert.equal(workspaceStore.isSupportedFileName(name), true, name);
  });
  ["app.js", "index.html", "image.png", "archive.zip"].forEach(function (name) {
    assert.equal(workspaceStore.isSupportedFileName(name), false, name);
  });
});

await runTest("builds a sorted folder-first tree from flat files", function () {
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

await runTest("filters matching files while preserving parent folders", function () {
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

await runTest("empty search returns the original tree", function () {
  const tree = workspaceStore.buildTree([
    { name: "README.md", path: "README.md" }
  ]);

  assert.equal(workspaceStore.filterTree(tree, ""), tree);
});

await runTest("workspace scanning includes supported text files and excludes unsupported entries", async function () {
  const entries = [
    ["README.md", { kind: "file" }],
    ["notes.txt", { kind: "file" }],
    ["application.log", { kind: "file" }],
    ["settings.json", { kind: "file" }],
    ["config.yml", { kind: "file" }],
    ["workflow.yaml", { kind: "file" }],
    ["ignored.js", { kind: "file" }],
    ["image.png", { kind: "file" }]
  ];
  const rootHandle = {
    name: "Docs",
    entries() {
      let index = 0;
      return {
        async next() {
          return index < entries.length ? { done: false, value: entries[index++] } : { done: true };
        }
      };
    }
  };
  const result = await workspaceStore.scanWorkspace(rootHandle);

  assert.deepEqual(result.files.map((file) => file.name).sort(), [
    "README.md", "application.log", "config.yml", "notes.txt", "settings.json", "workflow.yaml"
  ]);
  assert.equal(result.files.find((file) => file.name === "application.log").documentType, "text");
  assert.equal(result.files.find((file) => file.name === "settings.json").documentType, "json");
});
}());
