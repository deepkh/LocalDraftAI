const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/document-type.js");
require("../../src/js/storage-resource.js");
require("../../src/js/storage-provider-registry.js");
require("../../src/js/remote-ssh-provider.js");

const remoteSSHProvider = window.MarkdownEditor.remoteSSHProvider;

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
  const bridge = {
    getState() { return "connected"; },
    async request(method, params) {
      calls.push({ method, params });
      if (method === "workspace.open") {
        return {
          workspaceId: "remote-workspace-1",
          connectionId: "home-server",
          rootPath: "/home/gary/notes",
          name: "notes"
        };
      }
      if (method === "fs.listDirectory") {
        return {
          entries: [
            { kind: "directory", name: "plans", path: "plans", revision: { size: 0, mtimeMs: 1, hash: "" } },
            { kind: "file", name: "README.md", path: "README.md", revision: { size: 9, mtimeMs: 2, hash: "" } },
            { kind: "file", name: "image.png", path: "image.png", revision: { size: 12, mtimeMs: 3, hash: "" } }
          ]
        };
      }
      if (method === "fs.readText") {
        return {
          path: "README.md",
          text: "# Notes\r\n",
          revision: { size: 10, mtimeMs: 4, hash: "abc" }
        };
      }
      if (method === "workspace.close") return { closed: true };
      return {};
    }
  };
  const provider = remoteSSHProvider.create({ getBridgeClient() { return bridge; } });

  await runTest("opens read-only remote workspace descriptors", async function () {
    const workspace = await provider.openWorkspace({
      connectionId: "home-server",
      connectionLabel: "Home Server",
      path: "/home/gary/notes"
    });

    assert.equal(workspace.providerId, "remote-ssh");
    assert.equal(workspace.root.displayPath, "/home/gary/notes");
    assert.equal(workspace.authority.label, "Home Server");
    assert.equal(workspace.capabilities.read, true);
    assert.equal(workspace.capabilities.write, false);
  });

  await runTest("filters unsupported files and creates credential-free resources", async function () {
    const workspace = await provider.openWorkspace({ connectionId: "home-server", path: "/home/gary/notes" });
    const entries = await provider.listDirectory(workspace, "");
    const file = entries.find((entry) => entry.kind === "file");

    assert.deepEqual(entries.map((entry) => entry.name), ["plans", "README.md"]);
    assert.equal(file.resource.providerId, "remote-ssh");
    assert.equal(file.resource.workspaceId, workspace.id);
    assert.deepEqual(Object.keys(file.resource.opaque), ["workspaceId"]);
    assert.equal(JSON.stringify(file.resource).includes("password"), false);
    assert.equal(JSON.stringify(file.resource).includes("private"), false);

    const read = await provider.readText(file.resource);
    assert.equal(read.text, "# Notes\r\n");
    assert.equal(read.revision.hash, "abc");
  });

  await runTest("keeps remote writes disabled in the read-only phase", async function () {
    await assert.rejects(provider.saveDocument({}), function (error) {
      return error.code === "OPERATION_UNSUPPORTED";
    });
    await assert.rejects(provider.createTextFile(), function (error) {
      return error.code === "OPERATION_UNSUPPORTED";
    });
  });

  await runTest("reports bridge unavailability", function () {
    const unavailable = remoteSSHProvider.create({ getBridgeClient() { return null; } });
    assert.equal(unavailable.isAvailable(), false);
  });
}()).catch(function (error) {
  process.exitCode = 1;
  throw error;
});
