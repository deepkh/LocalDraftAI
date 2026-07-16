const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/document-type.js");
require("../../src/js/workspace-store.js");
require("../../src/js/workspace-related.js");

const workspaceRelated = window.MarkdownEditor.workspaceRelated;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("extracts Markdown links while ignoring images and external links", function () {
  const links = workspaceRelated.extractMarkdownLinks([
    "[Workspace](docs/workspace.md)",
    "[Config](config/settings.json)",
    "![Screenshot](assets/screen.png)",
    "[External](https://example.com)",
    "[Plan](plans/Plan_AI.md#intro)"
  ].join("\n"));

  assert.deepEqual(links, ["docs/workspace.md", "config/settings.json", "plans/Plan_AI.md"]);
});

runTest("resolves relative Markdown paths", function () {
  assert.equal(workspaceRelated.resolveRelativeMarkdownPath("plans/Plan_AI.md", "../docs/workspace.md"), "docs/workspace.md");
  assert.equal(workspaceRelated.resolveRelativeMarkdownPath("plans/Plan_AI.md", "Plan_Workspace.md"), "plans/Plan_Workspace.md");
});

runTest("detects plan files", function () {
  assert.equal(workspaceRelated.isPlanFile("plans/notes.md"), true);
  assert.equal(workspaceRelated.isPlanFile("docs/Plan_Workspace.md"), true);
  assert.equal(workspaceRelated.isPlanFile("docs/Workspace_Plan.md"), true);
  assert.equal(workspaceRelated.isPlanFile("docs/planning-notes.markdown"), true);
  assert.equal(workspaceRelated.isPlanFile("docs/readme.md"), false);
  assert.equal(workspaceRelated.isPlanFile("docs/plan.json"), false);
  assert.equal(workspaceRelated.isPlanFile("docs/plan.yaml"), false);
});

runTest("limits structured-file relationships to same-folder and recent files", function () {
  const related = workspaceRelated.getRelatedFiles({
    activePath: "config/settings.json",
    documentType: "json",
    files: [
      { path: "config/settings.json" },
      { path: "config/other.yml" },
      { path: "plans/Plan_AI.md" }
    ],
    markdownText: "[Plan](../plans/Plan_AI.md)",
    recentPaths: ["plans/Plan_AI.md"]
  });

  assert.deepEqual(related.sameFolder.map((item) => item.path), ["config/other.yml"]);
  assert.deepEqual(related.recent.map((item) => item.path), ["plans/Plan_AI.md"]);
  assert.deepEqual(related.linked, []);
  assert.deepEqual(related.plans, []);
});

runTest("builds same-folder linked recent and plan sections", function () {
  const related = workspaceRelated.getRelatedFiles({
    activePath: "plans/Plan_AI.md",
    files: [
      { path: "README.md" },
      { path: "plans/Plan_AI.md" },
      { path: "plans/Plan_Workspace.md" },
      { path: "docs/workspace.md" }
    ],
    markdownText: "[Workspace](../docs/workspace.md)\n[Missing](../docs/missing.md)",
    recentPaths: ["README.md", "plans/Plan_AI.md"]
  });

  assert.deepEqual(related.sameFolder.map((item) => item.path), ["plans/Plan_Workspace.md"]);
  assert.deepEqual(related.linked.map((item) => item.path), ["docs/workspace.md", "docs/missing.md"]);
  assert.equal(related.linked[1].exists, false);
  assert.deepEqual(related.recent.map((item) => item.path), ["README.md"]);
  assert.deepEqual(related.plans.map((item) => item.path), ["plans/Plan_Workspace.md"]);
});
