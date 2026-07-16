import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startRemoteWorkspaceFixture } from "./remote-ssh-test-harness.mjs";

async function search(fixture, query) {
  await fixture.evaluate(`if (!document.querySelector(".workspace-content-search")) document.querySelector('[data-workbench-view="search"]').click()`);
  await fixture.waitFor(`Boolean(document.querySelector(".workspace-content-search"))`);
  await fixture.evaluate(`(() => {
    const input = document.querySelector(".workspace-content-search");
    input.value = ${JSON.stringify(query)};
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "x" }));
  })()`);
  await fixture.waitFor(`document.querySelector(".workspace-content-search").value === ${JSON.stringify(query)} && !document.querySelector(".workspace-sidebar-body").textContent.includes("Searching document content")`, 30000);
}

async function main() {
  const files = {
    "README.md": "# Restore and Search\n",
    "archive/missing.md": "# This tab will disappear\n",
    "deep/remote.md": Array.from({ length: 100 }, (_, index) => index === 0 ? "[Linked target](../linked/target.md)" : index === 50 ? "Remote connection search target" : `line ${index + 1}`).join("\n") + "\n",
    "invalid.yaml": Buffer.from([0xff, 0xfe]),
    "linked/target.md": "# Linked without recursive discovery\n",
    "plans/project.md": "# Project restore\n"
  };
  for (let index = 0; index < 105; index += 1) {
    files[`limits/match-${String(index).padStart(3, "0")}.txt`] = `limit-hit ${index}\n`;
  }
  const fixture = await startRemoteWorkspaceFixture({
    bridgePort: Number(process.env.LOCALDRAFTAI_REMOTE_RESTORE_E2E_PORT || 8784),
    debugPort: Number(process.env.LOCALDRAFTAI_REMOTE_RESTORE_E2E_DEBUG_PORT || 9254),
    prefix: "localdraftai-remote-restore-search-e2e-",
    files
  });

  try {
    if ((await fixture.evaluate(`window.MarkdownEditor.__testApi.getEditorStateForTest()`)).editorMode !== "markdown") {
      await fixture.evaluate(`document.querySelector("#toggleEditorMode").click()`);
    }
    assert.equal(await fixture.evaluate(`Boolean(document.querySelector("[data-workspace-path='deep/remote.md']"))`), false);
    await search(fixture, "limit-hit");
    await fixture.waitFor(`document.querySelectorAll("[data-workspace-search-path]").length === 100`);
    assert.match(await fixture.evaluate(`document.querySelector(".workspace-sidebar-body").textContent`), /search limit was reached/i);

    await search(fixture, "Remote connection search target");
    await fixture.waitFor(`Boolean(document.querySelector("[data-workspace-search-path='deep/remote.md']"))`);
    await fixture.evaluate(`document.querySelector("[data-workspace-search-path='deep/remote.md']").click()`);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().title === "remote.md"`);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().markdownSelectionStart > 0`);
    let state = await fixture.evaluate(`window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    assert.equal(state.markdownSelectionStart, state.markdownText.split("\n").slice(0, 50).join("\n").length + 1);
    assert.equal(await fixture.evaluate(`Boolean(document.querySelector("[data-workspace-path='linked/target.md']"))`), false);
    await fixture.evaluate(`document.querySelector('[data-workbench-view="related"]').click()`);
    await fixture.waitFor(`document.querySelector("[data-workspace-related-path='linked/target.md']") && !document.querySelector("[data-workspace-related-path='linked/target.md']").disabled`);

    await fixture.evaluate(`document.querySelector('[data-workbench-view="files"]').click()`);
    await fixture.waitFor(`Boolean(document.querySelector("[data-workspace-path='deep/remote.md']"))`);
    assert.equal(await fixture.evaluate(`document.querySelector("[data-workspace-path='deep/remote.md']").classList.contains("is-active")`), true);
    for (const [folder, file] of [["archive", "archive/missing.md"], ["plans", "plans/project.md"]]) {
      await fixture.evaluate(`document.querySelector("[data-workspace-folder-path='${folder}']").click()`);
      await fixture.waitFor(`Boolean(document.querySelector("[data-workspace-path='${file}']"))`);
      await fixture.evaluate(`document.querySelector("[data-workspace-path='${file}']").click()`);
      await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().title === ${JSON.stringify(path.basename(file))}`);
    }
    await fixture.evaluate(`document.querySelector("[data-workspace-path='deep/remote.md']") ? document.querySelector("[data-workspace-path='deep/remote.md']").click() : window.MarkdownEditor.__testApi.openWorkspaceFileForTest("deep/remote.md")`);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().title === "remote.md"`);
    if ((await fixture.evaluate(`window.MarkdownEditor.__testApi.getEditorStateForTest()`)).editorMode !== "markdown") {
      await fixture.evaluate(`document.querySelector("#toggleEditorMode").click()`);
    }
    await fixture.evaluate(`(() => {
      const editor = document.querySelector("#markdownEditor");
      editor.focus();
      editor.selectionStart = 12;
      editor.selectionEnd = 24;
      editor.scrollTop = 96;
      editor.dispatchEvent(new Event("select", { bubbles: true }));
      editor.dispatchEvent(new Event("scroll", { bubbles: true }));
      if (window.MarkdownEditor.__testApi.getEditorStateForTest().softWrapEnabled) {
        document.querySelector("#toggleSoftWrap").click();
      }
    })()`);
    assert.deepEqual((await fixture.evaluate(`window.MarkdownEditor.__testApi.getWorkspaceMetadataForTest()`)).openedTabs.find((tab) => tab.path === "deep/remote.md").selectionStart, 12);
    await fixture.evaluate(`document.querySelector("[data-workspace-folder-path='archive']").click()`);
    await fixture.waitFor(`document.querySelector("[data-workspace-folder-path='archive']").getAttribute("aria-expanded") === "false"`);
    await fixture.delay(700);
    assert.equal(await fixture.evaluate(`window.MarkdownEditor.workspaceSession.loadSession().then((session) => session.openedTabs.find((tab) => tab.path === "deep/remote.md").selectionStart)`), 12);
    fs.rmSync(path.join(fixture.remoteRoot, "archive", "missing.md"));
    await fixture.evaluate(`(async () => {
      const bridge = window.MarkdownEditor.activeBridgeClient;
      const profiles = await bridge.request("profile.list", {});
      const profile = profiles.profiles.find((item) => item.id === "e2e-remote");
      await bridge.request("connection.disconnect", { connectionId: profile.id });
      profile.auth.identityFile = "";
      profile.auth.useAgent = false;
      profile.auth.allowPassword = true;
      await bridge.request("profile.update", { profile });
    })()`);

    await fixture.evaluate(`location.reload()`);
    await fixture.delay(300);
    await fixture.waitFor(`Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi && window.MarkdownEditor.activeBridgeClient)`);
    await fixture.evaluate(`(() => {
      window.__localPickerCalls = 0;
      window.showOpenFilePicker = () => { window.__localPickerCalls += 1; throw new Error("Local picker opened"); };
      window.showSaveFilePicker = () => { window.__localPickerCalls += 1; throw new Error("Local picker opened"); };
      window.showDirectoryPicker = () => { window.__localPickerCalls += 1; throw new Error("Local picker opened"); };
    })()`);
    await fixture.waitFor(`Boolean(document.querySelector("[data-workspace-restore='restore']"))`);
    assert.equal(await fixture.evaluate(`document.querySelector("#remoteStatusItem").dataset.state`), "local-ready");
    await fixture.evaluate(`document.querySelector("[data-workspace-restore='restore']").click()`);
    await fixture.waitFor(`document.querySelector("#remotePromptOverlay").hidden === false && document.querySelector("#remotePromptTitle").textContent === "SSH Password"`);
    await fixture.evaluate(`document.querySelector("#remoteSecretInput").value = "test-password"; document.querySelector("#remotePromptConfirm").click()`);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().storageProviderId === "remote-ssh" && window.MarkdownEditor.__testApi.getEditorStateForTest().title === "remote.md"`, 30000);

    state = await fixture.evaluate(`window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    assert.equal(state.editorMode, "markdown");
    assert.equal(state.softWrapEnabled, false);
    assert.equal(state.markdownSelectionStart, 12);
    assert.equal(state.markdownSelectionEnd, 24);
    assert.equal(state.markdownScrollTop, 96);
    assert.equal(state.dirty, false);
    const tabs = await fixture.evaluate(`window.MarkdownEditor.__testApi.getOpenTabsForTest()`);
    assert.deepEqual(tabs.map((tab) => tab.path), ["deep/remote.md", "plans/project.md"]);
    assert.equal(await fixture.evaluate(`document.querySelector("[data-workspace-folder-path='archive']").getAttribute("aria-expanded")`), "false");
    assert.match(await fixture.evaluate(`document.querySelector("#applicationStatus").textContent`), /Skipped missing or unreadable: archive\/missing.md/);
    assert.equal(await fixture.evaluate(`window.__localPickerCalls`), 0);
    assert.equal(await fixture.evaluate(`!document.querySelector("#recentRemoteWorkspaces").disabled && document.querySelectorAll("#recentRemoteWorkspaces option[value^='open:']").length === 1`), true);

    await fixture.delay(500);
    await fixture.evaluate(`window.MarkdownEditor.activeBridgeClient.request("profile.remove", { connectionId: "e2e-remote" })`);
    await fixture.evaluate(`location.reload()`);
    await fixture.delay(300);
    await fixture.waitFor(`Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi && window.MarkdownEditor.activeBridgeClient)`);
    await fixture.waitFor(`Boolean(document.querySelector("[data-workspace-restore='restore']"))`);
    await fixture.evaluate(`document.querySelector("[data-workspace-restore='restore']").click()`);
    await fixture.waitFor(`document.querySelector(".workspace-error") && document.querySelector(".workspace-error").textContent.includes("no longer exists")`);
    assert.deepEqual(fixture.connection.exceptions, []);
  } finally {
    await fixture.cleanup();
  }
}

main().then(() => {
  console.log("ok - remote SSH sessions restore explicitly and Search traverses unloaded folders with limits");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
