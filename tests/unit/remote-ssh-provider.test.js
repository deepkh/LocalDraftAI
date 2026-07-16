const assert = require("node:assert/strict");

global.window = {
  atob: global.atob,
  btoa: global.btoa
};
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
  const binaryPayload = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
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
      if (method === "fs.writeText") {
        return { path: params.path, revision: { size: params.text.length, mtimeMs: 5, hash: "written" } };
      }
      if (method === "fs.createTextFile") {
        return {
          path: [params.directoryPath, params.name].filter(Boolean).join("/"),
          name: params.name,
          revision: { size: params.text.length, mtimeMs: 6, hash: "created" }
        };
      }
      if (method === "fs.createDirectory") {
        return { path: [params.directoryPath, params.name].filter(Boolean).join("/"), name: params.name };
      }
      if (method === "fs.rename") {
        return { path: "renamed.md", name: params.newName, revision: { size: 10, mtimeMs: 7, hash: "renamed" } };
      }
      if (method === "fs.duplicate") {
        return { path: params.name, name: params.name, revision: { size: 10, mtimeMs: 8, hash: "duplicate" } };
      }
      if (method === "fs.searchText") {
        return {
          filesVisited: 42,
          matches: [{ path: "plans/remote.md", line: 18, column: 4, preview: "Remote connection settings" }],
          truncated: true,
          warningCount: 2
        };
      }
      if (method === "fs.readBinary") {
        const end = Math.min(params.offset + params.maxBytes, binaryPayload.length);
        return {
          path: params.path,
          mimeType: "image/png",
          bytes: Buffer.from(binaryPayload.subarray(params.offset, end)).toString("base64"),
          offset: params.offset,
          nextOffset: end,
          size: binaryPayload.length,
          complete: end === binaryPayload.length,
          revision: { size: binaryPayload.length, mtimeMs: 9, hash: "image" }
        };
      }
      if (method === "fs.writeBinary") {
        if (!params.complete) {
          return { uploadId: params.uploadId || "upload-1", nextOffset: params.offset + Buffer.from(params.bytes, "base64").length, complete: false };
        }
        return {
          path: params.path,
          mimeType: params.mimeType,
          complete: true,
          nextOffset: params.totalSize,
          revision: { size: params.totalSize, mtimeMs: 10, hash: "binary-written" }
        };
      }
      if (method === "workspace.close") return { closed: true };
      if (method === "workspace.getStatus") return { available: true, workspace: { id: params.workspaceId } };
      return {};
    }
  };
  const provider = remoteSSHProvider.create({ getBridgeClient() { return bridge; } });

  await runTest("opens writable remote workspace descriptors", async function () {
    const workspace = await provider.openWorkspace({
      connectionId: "home-server",
      connectionLabel: "Home Server",
      path: "/home/gary/notes"
    });

    assert.equal(workspace.providerId, "remote-ssh");
    assert.equal(workspace.root.displayPath, "/home/gary/notes");
    assert.equal(workspace.authority.label, "Home Server");
    assert.equal(workspace.capabilities.read, true);
    assert.equal(workspace.capabilities.write, true);
    assert.equal(workspace.capabilities.createFile, true);
    assert.equal(workspace.capabilities.binaryAssets, true);
    assert.equal((await provider.getWorkspaceStatus(workspace)).available, true);
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

  await runTest("writes with expected revisions and supports workspace mutations", async function () {
    const workspace = await provider.openWorkspace({ connectionId: "home-server", path: "/home/gary/notes" });
    const resource = provider.resourceFor(workspace.id, "README.md", { size: 10, mtimeMs: 4, hash: "abc" });
    const saved = await provider.saveDocument({
      storageResource: resource,
      storageRevision: resource.revision
    }, { text: "# Updated\n" });

    assert.equal(saved.revision.hash, "written");
    assert.deepEqual(calls.find((call) => call.method === "fs.writeText").params.expectedRevision, resource.revision);
    assert.equal(calls.find((call) => call.method === "fs.writeText").params.force, false);

    const created = await provider.createTextFile(workspace, "plans", "new.md", "new");
    assert.equal(created.path, "plans/new.md");
    assert.equal(created.resource.revision.hash, "created");
    assert.equal((await provider.createDirectory(workspace, "", "drafts")).path, "drafts");
    assert.equal((await provider.rename(workspace, "README.md", "renamed.md")).path, "renamed.md");
    assert.equal((await provider.duplicate(workspace, "README.md", "README copy.md")).path, "README copy.md");

    const savedAs = await provider.saveDocumentAs({ workspaceId: workspace.id }, {
      path: "plans/copy.md",
      text: "copy"
    });
    assert.equal(savedAs.path, "plans/copy.md");
  });

  await runTest("searches the full remote workspace through the bridge", async function () {
    const workspace = await provider.openWorkspace({ connectionId: "home-server", path: "/home/gary/notes" });
    const result = await provider.searchText(workspace, "connection", { maxResults: 500 });

    assert.equal(result.results[0].path, "plans/remote.md");
    assert.equal(result.results[0].documentType, "markdown");
    assert.equal(result.limited, true);
    assert.equal(result.filesVisited, 42);
    assert.equal(result.warningCount, 2);
    assert.equal(calls.find((call) => call.method === "fs.searchText").params.maxResults, 500);
  });

  await runTest("reads and writes authenticated remote binary assets", async function () {
    const workspace = await provider.openWorkspace({ connectionId: "home-server", path: "/home/gary/notes" });
    const resource = provider.resourceFor(workspace.id, "assets/pixel.png");
    const read = await provider.readBinary(resource);

    assert.equal(read.mimeType, "image/png");
    assert.deepEqual(Array.from(read.bytes), Array.from(binaryPayload));
    const written = await provider.writeBinary(workspace, "assets/pasted.png", binaryPayload, { mimeType: "image/png" });
    assert.equal(written.path, "assets/pasted.png");
    assert.equal(written.revision.hash, "binary-written");
    const request = calls.find((call) => call.method === "fs.writeBinary");
    assert.deepEqual(Array.from(Buffer.from(request.params.bytes, "base64")), Array.from(binaryPayload));
    assert.equal(request.params.totalSize, binaryPayload.length);
  });

  await runTest("reports bridge unavailability", function () {
    const unavailable = remoteSSHProvider.create({ getBridgeClient() { return null; } });
    assert.equal(unavailable.isAvailable(), false);
  });
}()).catch(function (error) {
  process.exitCode = 1;
  throw error;
});
