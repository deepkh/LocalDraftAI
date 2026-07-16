const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/document-type.js");
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

runTest("searches every supported text file and limits total results", async function () {
  const result = await workspaceSearch.searchFiles([
    { path: "README.md", text: "Agent" },
    { path: "notes.txt", text: "agent" },
    { path: "application.log", text: "agent" },
    { path: "settings.json", text: "{\"agent\": true}" },
    { path: "config.yml", text: "agent: true" },
    { path: "workflow.yaml", text: "name: agent" },
    { path: "src/app.js", text: "agent" },
  ], "agent", {
    maxMatchesPerFile: 5,
    maxResults: 6
  });

  assert.equal(result.results.length, 6);
  assert.equal(result.limited, true);
  assert.deepEqual(result.results.map((item) => item.path), ["README.md", "notes.txt", "application.log", "settings.json", "config.yml", "workflow.yaml"]);
  assert.equal(result.results[3].documentType, "json");
  assert.equal(result.results[3].filename, "settings.json");
});

runTest("creates compact previews around the match", function () {
  const preview = workspaceSearch.createPreview("prefix ".repeat(20) + "agent provider " + "suffix ".repeat(20), "agent", 40);

  assert.match(preview, /agent provider/);
  assert.ok(preview.length <= 46);
});
