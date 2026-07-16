const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/document-type.js");
require("../../src/js/storage-resource.js");
require("../../src/js/storage-provider-registry.js");
require("../../src/js/local-filesystem-provider.js");
require("../../src/js/workspace-related.js");
require("../../src/js/workspace-operations.js");

const workspaceOperations = window.MarkdownEditor.workspaceOperations;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("validates supported file names and defaults missing extensions to .md", function () {
  assert.deepEqual(workspaceOperations.validateFileName("notes"), {
    ok: true,
    normalizedName: "notes.md"
  });
  assert.equal(workspaceOperations.validateFileName("").ok, false);
  assert.equal(workspaceOperations.validateFileName("../notes.md").ok, false);
  assert.equal(workspaceOperations.validateFileName("notes.txt").ok, true);
  assert.equal(workspaceOperations.validateFileName("application.log").ok, true);
  assert.equal(workspaceOperations.validateFileName("settings.json").ok, true);
  assert.equal(workspaceOperations.validateFileName("config.yaml").ok, true);
  assert.equal(workspaceOperations.validateFileName("app.js").reason, "unsupportedExtension");
});

runTest("keeps supported non-Markdown extensions unchanged", function () {
  assert.deepEqual(workspaceOperations.validateFileName("notes.txt", {
    allowNonMarkdownExtension: true,
    enforceMarkdownExtension: true
  }), {
    ok: true,
    normalizedName: "notes.txt"
  });
});

runTest("can default a missing name extension to the current document type", function () {
  assert.equal(
    workspaceOperations.validateFileName("settings copy", { defaultExtension: ".json" }).normalizedName,
    "settings copy.json"
  );
  assert.equal(
    workspaceOperations.validateFileName("workflow copy", { defaultExtension: ".yaml" }).normalizedName,
    "workflow copy.yaml"
  );
});

runTest("validates folder names", function () {
  assert.equal(workspaceOperations.validateFolderName("docs").ok, true);
  assert.equal(workspaceOperations.validateFolderName("").ok, false);
  assert.equal(workspaceOperations.validateFolderName(".").ok, false);
  assert.equal(workspaceOperations.validateFolderName("a/b").ok, false);
});

runTest("suggests duplicate names next to the source file", function () {
  assert.equal(workspaceOperations.suggestedDuplicateName("README.md"), "README copy.md");
  assert.equal(workspaceOperations.suggestedDuplicateName("plans/Plan_AI.markdown"), "plans/Plan_AI copy.markdown");
});

function createMockDirectory() {
  const files = {};

  function handleFor(name) {
    return {
      name,
      async createWritable() {
        return {
          async write(value) { files[name].text = String(value == null ? "" : value); },
          async close() {}
        };
      },
      async getFile() {
        return { async text() { return files[name].text; } };
      }
    };
  }

  return {
    files,
    async getFileHandle(name, options = {}) {
      if (files[name]) return files[name].handle;
      if (!options.create) {
        const error = new Error("Not found");
        error.name = "NotFoundError";
        throw error;
      }
      files[name] = { text: "", handle: null };
      files[name].handle = handleFor(name);
      return files[name].handle;
    },
    async removeEntry(name) {
      delete files[name];
    }
  };
}

(async function () {
  const root = createMockDirectory();
  const provider = window.MarkdownEditor.localFilesystemProvider;
  const workspace = provider.createWorkspaceDescriptor(root, { id: "workspace-test" });
  const folderCalls = [];
  const createdFolder = await workspaceOperations.createFolder({
    directoryPath: "drafts",
    name: "notes",
    provider: {
      async createDirectory(activeWorkspace, directoryPath, name) {
        folderCalls.push({
          activeWorkspace,
          directoryPath,
          name
        });
        return { name };
      }
    },
    workspace
  });

  assert.deepEqual(folderCalls, [{
    activeWorkspace: workspace,
    directoryPath: "drafts",
    name: "notes"
  }]);
  assert.deepEqual(createdFolder, {
    name: "notes",
    path: "drafts/notes"
  });
  console.log("ok - creates folders with normalized workspace-relative paths");

  for (const name of ["notes.md", "notes.txt", "application.log", "settings.json", "config.yml", "workflow.yaml"]) {
    const created = await workspaceOperations.createTextFile({
      provider,
      workspace,
      name,
      initialText: name
    });
    assert.equal(created.name, name);
    assert.equal(root.files[name].text, name);
  }

  const duplicate = await workspaceOperations.duplicateTextFile({
    provider,
    workspace,
    name: "settings copy",
    path: "settings.json"
  });
  assert.equal(duplicate.name, "settings copy.json");
  assert.equal(root.files["settings copy.json"].text, "settings.json");

  const renamed = await workspaceOperations.renameTextFile({
    provider,
    workspace,
    name: "workflow-renamed",
    path: "workflow.yaml"
  });
  assert.equal(renamed.name, "workflow-renamed.yaml");
  assert.equal(root.files["workflow.yaml"], undefined);
  assert.equal(root.files["workflow-renamed.yaml"].text, "workflow.yaml");
  console.log("ok - creates duplicates and renames every registered text-document shape");
}()).catch(function (error) {
  console.error("not ok - creates duplicates and renames registered documents");
  throw error;
});
