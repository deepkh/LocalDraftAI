import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startRemoteWorkspaceFixture } from "./remote-ssh-test-harness.mjs";

async function setMarkdownEditor(fixture, text, selectionStart, selectionEnd) {
  await fixture.evaluate(`(() => {
    const editor = document.querySelector("#markdownEditor");
    editor.value = ${JSON.stringify(text)};
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "x" }));
    editor.selectionStart = ${selectionStart};
    editor.selectionEnd = ${selectionEnd};
    editor.scrollTop = 24;
  })()`);
  await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().dirty === true`);
}

async function disconnect(fixture) {
  await fixture.evaluate(`window.MarkdownEditor.commandRegistry.executeCommand("remote.closeConnection")`);
  await fixture.waitFor(`document.querySelector("#remoteStatusItem").dataset.state === "disconnected"`);
}

async function reconnect(fixture) {
  await fixture.evaluate(`window.MarkdownEditor.commandRegistry.executeCommand("remote.reconnect")`);
  await fixture.waitFor(`document.querySelector("#remoteStatusItem").dataset.state === "connected"`, 30000);
}

async function main() {
  const fixture = await startRemoteWorkspaceFixture({
    bridgePort: Number(process.env.LOCALDRAFTAI_REMOTE_RECONNECT_E2E_PORT || 8783),
    debugPort: Number(process.env.LOCALDRAFTAI_REMOTE_RECONNECT_E2E_DEBUG_PORT || 9253),
    prefix: "localdraftai-remote-reconnect-e2e-",
    files: {
      "README.md": "# Reconnect original\n",
      "notes.txt": "Notes before reconnect\n"
    }
  });
  const readmePath = path.join(fixture.remoteRoot, "README.md");
  const notesPath = path.join(fixture.remoteRoot, "notes.txt");

  try {
    await fixture.evaluate(`document.querySelector("[data-workspace-path='README.md']").click()`);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().title === "README.md"`);
    if ((await fixture.evaluate(`window.MarkdownEditor.__testApi.getEditorStateForTest()`)).editorMode !== "markdown") {
      await fixture.evaluate(`document.querySelector("#toggleEditorMode").click()`);
      await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().editorMode === "markdown"`);
    }
    const dirtyReadme = "# Unsaved through disconnect\n\n" + Array.from({ length: 60 }, (_, index) => `line ${index}`).join("\n") + "\n";
    await setMarkdownEditor(fixture, dirtyReadme, 4, 13);
    const beforeDisconnect = await fixture.evaluate(`window.MarkdownEditor.__testApi.getEditorStateForTest()`);

    await disconnect(fixture);
    const disconnected = await fixture.evaluate(`({
      state: window.MarkdownEditor.__testApi.getEditorStateForTest(),
      saveDisabled: document.querySelector("#saveFile").disabled,
      refreshDisabled: document.querySelector("#refreshWorkspace").disabled
    })`);
    assert.equal(disconnected.state.markdownText, dirtyReadme);
    assert.equal(disconnected.state.dirty, true);
    assert.equal(disconnected.saveDisabled, true);
    assert.equal(disconnected.refreshDisabled, true);

    fs.writeFileSync(readmePath, "# Changed while disconnected\n");
    await reconnect(fixture);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().remoteChanged === true`);
    const recovered = await fixture.evaluate(`window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    assert.equal(recovered.markdownText, dirtyReadme);
    assert.equal(recovered.dirty, true);
    assert.equal(recovered.editorMode, beforeDisconnect.editorMode);
    assert.equal(recovered.markdownSelectionStart, beforeDisconnect.markdownSelectionStart);
    assert.equal(recovered.markdownSelectionEnd, beforeDisconnect.markdownSelectionEnd);
    assert.equal(recovered.markdownScrollTop, beforeDisconnect.markdownScrollTop);
    assert.equal(await fixture.evaluate(`document.querySelector("#saveFile").disabled`), false);

    await fixture.evaluate(`document.querySelector("#saveFile").click()`);
    await fixture.waitFor(`document.querySelector("#remoteConflictOverlay").hidden === false`);
    assert.equal(fs.readFileSync(readmePath, "utf8"), "# Changed while disconnected\n");
    await fixture.evaluate(`document.querySelector("#remoteConflictCancel").click()`);

    await fixture.evaluate(`document.querySelector("[data-workspace-path='notes.txt']").click()`);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().title === "notes.txt"`);
    await setMarkdownEditor(fixture, "Dirty notes survive too\n", 3, 8);
    await disconnect(fixture);
    await reconnect(fixture);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().remoteConnectionState === "connected"`);
    const unchanged = await fixture.evaluate(`window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    assert.equal(unchanged.markdownText, "Dirty notes survive too\n");
    assert.equal(unchanged.dirty, true);
    assert.equal(unchanged.remoteChanged, false);
    await fixture.evaluate(`document.querySelector("#saveFile").click()`);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().dirty === false`);
    assert.equal(fs.readFileSync(notesPath, "utf8"), "Dirty notes survive too\n");
    assert.equal(await fixture.evaluate(`window.__localPickerCalls`), 0);
    assert.deepEqual(fixture.connection.exceptions, []);
  } finally {
    await fixture.cleanup();
  }
}

main().then(() => {
  console.log("ok - remote SSH reconnect preserves editor state and revalidates open revisions");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
