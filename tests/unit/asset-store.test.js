const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/asset-store.js");

const assetStore = window.MarkdownEditor.assetStore;

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
  await runTest("stores unique remote images through the provider without local handles", async function () {
    let created = false;
    const writes = [];
    const provider = {
      async stat(workspace, relativePath) {
        assert.equal(workspace.id, "remote-workspace");
        if (relativePath === "assets") {
          if (!created) throw Object.assign(new Error("missing"), { code: "RESOURCE_NOT_FOUND" });
          return { kind: "directory", path: "assets" };
        }
        if (relativePath === "assets/Photo.png") return { kind: "file" };
        throw Object.assign(new Error("missing"), { code: "RESOURCE_NOT_FOUND" });
      },
      async createDirectory(workspace, directoryPath, name) {
        assert.equal(directoryPath, "");
        assert.equal(name, "assets");
        created = true;
      },
      async writeBinary(workspace, relativePath, file, options) {
        writes.push({ relativePath, file, options });
        return { path: relativePath };
      }
    };
    const file = { name: "Photo.png", type: "image/png" };
    const result = await assetStore.saveImageFile({ storageProviderId: "remote-ssh" }, file, {
      provider,
      workspace: { id: "remote-workspace" }
    });

    assert.equal(result, "assets/Photo-2.png");
    assert.equal(writes.length, 1);
    assert.equal(writes[0].file, file);
    assert.equal(writes[0].options.mimeType, "image/png");
    assert.equal("workspaceDirHandle" in writes[0], false);
  });

  await runTest("rejects unsupported remote image MIME types before writing", async function () {
    await assert.rejects(
      assetStore.saveImageFile(
        { storageProviderId: "remote-ssh" },
        { name: "vector.svg", type: "image/svg+xml" },
        { provider: {}, workspace: { id: "remote-workspace" } }
      ),
      /Only PNG, JPEG, WebP, and GIF/
    );
  });
}()).catch(function (error) {
  process.exitCode = 1;
  throw error;
});
