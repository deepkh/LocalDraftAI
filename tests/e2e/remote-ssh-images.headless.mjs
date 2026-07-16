import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startRemoteWorkspaceFixture } from "./remote-ssh-test-harness.mjs";

const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1mEAAAAASUVORK5CYII=";
const jpegBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==";

async function main() {
  const fixture = await startRemoteWorkspaceFixture({
    bridgePort: 8785,
    debugPort: 9255,
    prefix: "localdraftai-remote-images-e2e-",
    files: {
      "README.md": [
        "# Remote images",
        "",
        "![Existing PNG](assets/existing.png)",
        "",
        "![Existing JPEG](assets/photo.jpg)",
        "",
        "![Missing](assets/missing.png)",
        "",
        "![Outside](../outside.png)",
        ""
      ].join("\n"),
      "assets/existing.png": Buffer.from(pngBase64, "base64"),
      "assets/photo.jpg": Buffer.from(jpegBase64, "base64")
    }
  });

  try {
    await fixture.evaluate(`(() => {
      window.__revokedAssetUrls = [];
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (url) => {
        window.__revokedAssetUrls.push(url);
        revoke(url);
      };
      document.querySelector("[data-workspace-path='README.md']").click();
    })()`);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().title === "README.md"`);
    await fixture.waitFor(`Array.from(document.querySelectorAll("#wysiwygEditor img[data-md-src='assets/existing.png'], #wysiwygEditor img[data-md-src='assets/photo.jpg']"))
      .every((image) => image.src.startsWith("blob:") && !image.src.includes("localdraftai-remote-image-pending") && image.complete && image.naturalWidth === 1)`);
    await fixture.waitFor(`document.querySelector("#wysiwygEditor img[data-md-src='assets/missing.png']").classList.contains("remote-image-error")`);
    await fixture.waitFor(`document.querySelector("#wysiwygEditor img[data-md-src='../outside.png']").classList.contains("remote-image-error")`);

    const loaded = await fixture.evaluate(`Array.from(document.querySelectorAll("#wysiwygEditor img")).map((image) => ({
      error: image.classList.contains("remote-image-error"),
      src: image.getAttribute("src"),
      title: image.getAttribute("title")
    }))`);
    assert.equal(loaded[0].error, false);
    assert.equal(loaded[1].error, false);
    assert.match(loaded[2].title, /not found/i);
    assert.match(loaded[3].title, /outside the workspace/i);

    await fixture.evaluate(`(() => {
      const bytes = Uint8Array.from(atob(${JSON.stringify(pngBase64)}), (character) => character.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], "first.png", { type: "image/png" }));
      transfer.items.add(new File([bytes], "second.png", { type: "image/png" }));
      const editor = document.querySelector("#wysiwygEditor");
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      editor.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer
      }));
    })()`);
    await fixture.waitFor(`(window.MarkdownEditor.__testApi.getEditorStateForTest().markdownText.match(/assets\\/pasted-[^)]+\\.png/g) || []).length === 2`);

    await fixture.evaluate(`document.querySelector("#toggleEditorMode").click()`);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().editorMode === "markdown"`);

    await fixture.evaluate(`(() => {
      const bytes = Uint8Array.from(atob(${JSON.stringify(pngBase64)}), (character) => character.charCodeAt(0));
      const file = new File([bytes], "drop.png", { type: "image/png" });
      const transfer = {
        files: [file],
        items: [{ kind: "file", type: "image/png", getAsFile: () => file }]
      };
      const editor = document.querySelector("#markdownEditor");
      editor.selectionStart = editor.value.length;
      editor.selectionEnd = editor.value.length;
      const event = new Event("drop", {
        bubbles: true,
        cancelable: true
      });
      Object.defineProperty(event, "dataTransfer", { value: transfer });
      editor.dispatchEvent(event);
    })()`);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().markdownText.includes("assets/drop.png")`);

    const markdownText = await fixture.evaluate(`window.MarkdownEditor.__testApi.getEditorStateForTest().markdownText`);
    const storedPaths = Array.from(markdownText.matchAll(/\((assets\/(?:pasted-[^)]+|drop)\.png)\)/g), (match) => match[1]);
    assert.equal(storedPaths.length, 3);
    assert.equal(new Set(storedPaths).size, 3);
    storedPaths.forEach((relativePath) => {
      assert.deepEqual(fs.readFileSync(path.join(fixture.remoteRoot, relativePath)), Buffer.from(pngBase64, "base64"));
    });
    assert.equal(await fixture.evaluate(`window.__localPickerCalls`), 0);

    const assetUrls = await fixture.evaluate(`Array.from(document.querySelectorAll("#wysiwygEditor img"))
      .map((image) => image.getAttribute("src"))
      .filter((src) => src && src.startsWith("blob:") && !src.includes("localdraftai-remote-image-pending"))`);
    await fixture.evaluate(`(() => {
      window.confirm = () => true;
      document.querySelector(".doc-tab-wrap.is-active .tab-close").click();
    })()`);
    await fixture.waitFor(`window.MarkdownEditor.__testApi.getEditorStateForTest().title === "Untitled.md"`);
    const revoked = await fixture.evaluate(`window.__revokedAssetUrls.slice()`);
    assetUrls.forEach((url) => assert.equal(revoked.includes(url), true, `object URL was not revoked: ${url}`));
    assert.deepEqual(fixture.connection.exceptions, []);
  } finally {
    await fixture.cleanup();
  }
}

main().then(() => {
  console.log("ok - remote SSH images load, fail safely, paste, drop, and revoke object URLs");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
