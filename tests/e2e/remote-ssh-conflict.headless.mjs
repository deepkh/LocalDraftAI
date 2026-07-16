import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startRemoteWorkspaceFixture } from "./remote-ssh-test-harness.mjs";

async function main() {
  const fixture = await startRemoteWorkspaceFixture({
    bridgePort: Number(process.env.LOCALDRAFTAI_REMOTE_CONFLICT_E2E_PORT || 8782),
    debugPort: Number(process.env.LOCALDRAFTAI_REMOTE_CONFLICT_E2E_DEBUG_PORT || 9252),
    prefix: "localdraftai-remote-conflict-e2e-",
    files: { "README.md": "# Original remote\n" }
  });
  const remoteFile = path.join(fixture.remoteRoot, "README.md");

  try {
    await fixture.evaluate(`document.querySelector("[data-workspace-path='README.md']").click()`);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().title === "README.md"`);
    if ((await fixture.evaluate(`window.MarkdownEditor.__testApi.getEditorStateForTest()`)).editorMode !== "markdown") {
      await fixture.evaluate(`document.querySelector("#toggleEditorMode").click()`);
      await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().editorMode === "markdown"`);
    }
    await fixture.evaluate(`(() => {
      const editor = document.querySelector("#markdownEditor");
      editor.value = "# Unsaved editor version\\n";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "x" }));
    })()`);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().dirty === true`);

    fs.writeFileSync(remoteFile, "# External remote version\n");
    await fixture.evaluate(`document.querySelector("#saveFile").click()`);
    await fixture.waitFor(`document.querySelector("#remoteConflictOverlay").hidden === false`);
    const initialConflict = await fixture.evaluate(`({
      activeId: document.activeElement && document.activeElement.id,
      dirty: window.MarkdownEditor.__testApi.getEditorStateForTest().dirty,
      remoteChanged: window.MarkdownEditor.__testApi.getEditorStateForTest().remoteChanged,
      text: window.MarkdownEditor.__testApi.getEditorStateForTest().markdownText
    })`);
    assert.equal(initialConflict.activeId, "remoteConflictCompare");
    assert.equal(initialConflict.dirty, true);
    assert.equal(initialConflict.remoteChanged, true);
    assert.equal(initialConflict.text, "# Unsaved editor version\n");
    assert.equal(fs.readFileSync(remoteFile, "utf8"), "# External remote version\n");

    await fixture.evaluate(`document.querySelector("#remoteConflictCompare").click()`);
    await fixture.waitFor(`document.querySelector("#remoteConflictComparison").hidden === false`);
    const comparison = await fixture.evaluate(`document.querySelector("#remoteConflictComparison").textContent`);
    assert.match(comparison, /Unsaved editor version/);
    assert.match(comparison, /External remote version/);

    await fixture.evaluate(`document.querySelector("#remoteConflictCancel").click()`);
    assert.equal((await fixture.evaluate(`window.MarkdownEditor.__testApi.getEditorStateForTest()`)).dirty, true);
    assert.equal(fs.readFileSync(remoteFile, "utf8"), "# External remote version\n");

    await fixture.evaluate(`document.querySelector("#saveFile").click()`);
    await fixture.waitFor(`document.querySelector("#remoteConflictOverlay").hidden === false`);
    await fixture.evaluate(`window.confirm = () => false; document.querySelector("#remoteConflictReload").click()`);
    await fixture.waitFor(`document.querySelector("#remoteConflictStatus").textContent.includes("unchanged")`);
    assert.equal((await fixture.evaluate(`window.MarkdownEditor.__testApi.getEditorStateForTest()`)).markdownText, "# Unsaved editor version\n");

    await fixture.evaluate(`window.confirm = () => true; document.querySelector("#remoteConflictReload").click()`);
    await fixture.waitFor(`document.querySelector("#remoteConflictOverlay").hidden === true`);
    const reloaded = await fixture.evaluate(`window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    assert.equal(reloaded.markdownText, "# External remote version\n");
    assert.equal(reloaded.dirty, false);
    assert.equal(reloaded.remoteChanged, false);

    await fixture.evaluate(`(() => {
      const editor = document.querySelector("#markdownEditor");
      editor.value = "# Explicit overwrite version\\n";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "x" }));
    })()`);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().dirty === true`);
    fs.writeFileSync(remoteFile, "# Changed again outside\n");
    await fixture.evaluate(`document.querySelector("#saveFile").click()`);
    await fixture.waitFor(`document.querySelector("#remoteConflictOverlay").hidden === false`);
    await fixture.evaluate(`document.querySelector("#remoteConflictOverwrite").click()`);
    await fixture.waitFor(`document.querySelector("#remoteConflictOverlay").hidden === true && window.MarkdownEditor.__testApi.getEditorStateForTest().dirty === false`);
    assert.equal(fs.readFileSync(remoteFile, "utf8"), "# Explicit overwrite version\n");
    assert.equal(await fixture.evaluate(`window.__localPickerCalls`), 0);
    assert.deepEqual(fixture.connection.exceptions, []);
  } finally {
    await fixture.cleanup();
  }
}

main().then(() => {
  console.log("ok - remote SSH conflicts compare, reload, overwrite, and cancel without silent writes");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
