const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/document-type.js");
require("../../src/js/storage-resource.js");
require("../../src/js/storage-provider-registry.js");
require("../../src/js/local-filesystem-provider.js");
require("../../src/js/workspace-store.js");

const workspaceStore = window.MarkdownEditor.workspaceStore;
const registry = window.MarkdownEditor.storageProviders;
let nextFixtureId = 1;

async function runTest(name, callback) {
  try {
    await callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

function createLocalWorkspaceFixture(tree, name) {
  const calls = [];
  const id = "fixture-local-" + nextFixtureId++;
  const provider = {
    id,
    async listDirectory(workspace, path) {
      let directory = tree;

      calls.push(path);
      String(path || "").split("/").filter(Boolean).forEach(function (part) {
        directory = directory[part];
      });
      return Object.keys(directory || {}).map(function (entryName) {
        const value = directory[entryName];
        return {
          kind: value && typeof value === "object" ? "directory" : "file",
          name: entryName,
          path: [path, entryName].filter(Boolean).join("/")
        };
      });
    }
  };
  const workspace = {
    id: id + "-workspace",
    providerId: id,
    name: name || "Fixture"
  };

  registry.register(provider);
  return { calls, provider, workspace };
}

async function scanLocalFixture(tree, name, options) {
  const fixture = createLocalWorkspaceFixture(tree, name);
  const result = await workspaceStore.scanWorkspace(fixture.workspace, options);

  return { calls: fixture.calls, result };
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

await runTest("local scanning removes pre-existing empty directories", async function () {
  const scanned = await scanLocalFixture({
    empty: {},
    "README.md": "supported"
  });

  assert.deepEqual(scanned.result.tree.map((node) => node.name), ["README.md"]);
  assert.deepEqual(scanned.result.directories, []);
});

await runTest("local scanning removes directories containing only unsupported files", async function () {
  const scanned = await scanLocalFixture({
    docs: { "README.md": "supported" },
    include: { "camera.hpp": "unsupported" }
  });

  assert.deepEqual(scanned.result.tree.map((node) => node.name), ["docs"]);
  assert.equal(workspaceStore.findTreeNode(scanned.result.tree, "include"), null);
  assert.deepEqual(scanned.result.directories.map((item) => item.path), ["docs"]);
});

await runTest("local scanning removes nested unsupported-only directory branches", async function () {
  const scanned = await scanLocalFixture({
    docs: { "README.md": "supported" },
    src: {
      internal: {
        "worker.cpp": "unsupported"
      },
      "main.cpp": "unsupported"
    }
  });

  assert.equal(workspaceStore.findTreeNode(scanned.result.tree, "src"), null);
  assert.equal(workspaceStore.findTreeNode(scanned.result.tree, "src/internal"), null);
  assert.deepEqual(scanned.result.directories.map((item) => item.path), ["docs"]);
});

await runTest("local scanning retains a directory with a directly supported file", async function () {
  const scanned = await scanLocalFixture({
    docs: { "README.md": "supported" }
  });
  const docs = workspaceStore.findTreeNode(scanned.result.tree, "docs");

  assert.ok(docs);
  assert.deepEqual(docs.children.map((node) => node.path), ["docs/README.md"]);
});

await runTest("local scanning retains every ancestor of a deeply nested supported file", async function () {
  const scanned = await scanLocalFixture({
    a: {
      b: {
        c: {
          d: {
            "note.md": "supported"
          }
        }
      }
    }
  });

  ["a", "a/b", "a/b/c", "a/b/c/d"].forEach(function (path) {
    assert.ok(workspaceStore.findTreeNode(scanned.result.tree, path), path);
  });
  assert.equal(workspaceStore.findTreeNode(scanned.result.tree, "a/b/c/d/note.md").kind, "file");
});

await runTest("local scanning retains folders for every registered document type", async function () {
  const scanned = await scanLocalFixture({
    documents: {
      "README.md": "markdown",
      "guide.markdown": "markdown",
      "notes.txt": "text",
      "application.log": "text",
      "settings.json": "json",
      "config.yml": "yaml",
      "workflow.yaml": "yaml"
    }
  });
  const documents = workspaceStore.findTreeNode(scanned.result.tree, "documents");

  assert.deepEqual(documents.children.map((node) => node.name), [
    "application.log",
    "config.yml",
    "guide.markdown",
    "notes.txt",
    "README.md",
    "settings.json",
    "workflow.yaml"
  ]);
});

await runTest("local scanning retains a dotted directory with a supported document", async function () {
  const scanned = await scanLocalFixture({
    ".vscode": {
      "launch.json": "supported",
      "settings.code-workspace": "unsupported"
    }
  });
  const vscode = workspaceStore.findTreeNode(scanned.result.tree, ".vscode");

  assert.ok(vscode);
  assert.deepEqual(vscode.children.map((node) => node.name), ["launch.json"]);
});

await runTest("local scanning removes a dotted directory without supported documents", async function () {
  const scanned = await scanLocalFixture({
    ".config": {
      "settings.ini": "unsupported"
    },
    "README.md": "supported"
  });

  assert.equal(workspaceStore.findTreeNode(scanned.result.tree, ".config"), null);
});

await runTest("pruned local trees remain directory-first and file-second sorted", async function () {
  const scanned = await scanLocalFixture({
    zeta: { "note.md": "supported" },
    "zeta.txt": "supported",
    alpha: { "note.yaml": "supported" },
    "Alpha.md": "supported",
    empty: {}
  });

  assert.deepEqual(scanned.result.tree.map((node) => node.name), [
    "alpha",
    "zeta",
    "Alpha.md",
    "zeta.txt"
  ]);
});

await runTest("an all-unsupported local workspace has an empty canonical model", async function () {
  const scanned = await scanLocalFixture({
    assets: { "logo.png": "unsupported" },
    include: { "camera.hpp": "unsupported" },
    lib: {},
    src: {
      internal: { "worker.cpp": "unsupported" },
      "main.cpp": "unsupported"
    }
  });

  assert.deepEqual(scanned.result.tree, []);
  assert.deepEqual(scanned.result.files, []);
  assert.deepEqual(scanned.result.directories, []);
});

await runTest("prunes handcrafted trees without mutation and preserves node metadata", function () {
  const handle = { id: "handle" };
  const resource = { providerId: "fixture-local", path: "docs/README.md" };
  const source = [
    {
      kind: "directory",
      name: "docs",
      path: "docs",
      handle,
      loaded: true,
      loading: false,
      error: "",
      workspaceId: "workspace",
      children: [{
        kind: "file",
        name: "README.md",
        path: "docs/README.md",
        resource
      }]
    },
    {
      kind: "directory",
      name: "empty",
      path: "empty",
      loaded: true,
      loading: false,
      error: "",
      children: []
    }
  ];
  const pruned = workspaceStore.pruneTreeToRelevantFolders(source);

  assert.deepEqual(pruned.map((node) => node.path), ["docs"]);
  assert.notEqual(pruned, source);
  assert.notEqual(pruned[0], source[0]);
  assert.equal(pruned[0].handle, handle);
  assert.equal(pruned[0].workspaceId, "workspace");
  assert.equal(pruned[0].children[0].resource, resource);
  assert.equal(source.length, 2);
  assert.deepEqual(source[1].children, []);
});

await runTest("pruning preserves explicit directories, their ancestors, and unknown lazy folders", function () {
  const source = [{
    kind: "directory",
    name: "drafts",
    path: "drafts",
    loaded: true,
    children: [{
      kind: "directory",
      name: "new",
      path: "drafts/new",
      loaded: true,
      children: []
    }]
  }, {
    kind: "directory",
    name: "remote",
    path: "remote",
    loaded: false,
    loading: false,
    children: []
  }];
  const localPruned = workspaceStore.pruneTreeToRelevantFolders(source, {
    preserveDirectoryPaths: ["drafts/new"]
  });
  const lazyPruned = workspaceStore.pruneTreeToRelevantFolders(source, {
    keepUnloadedDirectories: true
  });

  assert.deepEqual(localPruned.map((node) => node.path), ["drafts"]);
  assert.deepEqual(localPruned[0].children.map((node) => node.path), ["drafts/new"]);
  assert.deepEqual(lazyPruned.map((node) => node.path), ["remote"]);
});
}());
