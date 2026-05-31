const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/workspace-store.js");
require("../../src/js/workspace-search.js");

const workspaceSearch = window.MarkdownEditor.workspaceSearch;

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

runTest("finds case-insensitive line matches", function () {
  const matches = workspaceSearch.findLineMatches("One\nAgent Provider\nthree agent", "agent");

  assert.equal(matches.length, 2);
  assert.equal(matches[0].line, 2);
  assert.equal(matches[0].column, 0);
  assert.match(matches[0].preview, /Agent Provider/);
});

runTest("limits matches per file", function () {
  const matches = workspaceSearch.findLineMatches("agent\nagent\nagent", "agent", {
    maxMatchesPerFile: 2
  });

  assert.equal(matches.length, 2);
});

runTest("searches Markdown files and limits total results", async function () {
  const result = await workspaceSearch.searchFiles([
    { path: "README.md", text: "Agent\nProvider\nagent" },
    { path: "src/app.js", text: "agent" },
    { path: "docs/workspace.markdown", text: "agent" }
  ], "agent", {
    maxMatchesPerFile: 5,
    maxResults: 2
  });

  assert.equal(result.results.length, 2);
  assert.equal(result.limited, true);
  assert.deepEqual(result.results.map((item) => item.path), ["README.md", "README.md"]);
});

runTest("creates compact previews around the match", function () {
  const preview = workspaceSearch.createPreview("prefix ".repeat(20) + "agent provider " + "suffix ".repeat(20), "agent", 40);

  assert.match(preview, /agent provider/);
  assert.ok(preview.length <= 46);
});
