import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const port = Number(process.env.LOCALDRAFTAI_E2E_PORT || 8773);
const debugPort = Number(process.env.LOCALDRAFTAI_E2E_DEBUG_PORT || 9247);
const pageUrl = `http://127.0.0.1:${port}/src/local_draft_ai.html?e2e=1`;
const workspaceFixture = {
  name: "RelevantFoldersTest",
  directories: [
    ".vscode",
    "docs",
    "include",
    "lib",
    "src",
    "src/internal",
    "notes",
    "assets"
  ],
  files: {
    ".vscode/launch.json": "{}\n",
    "docs/README.md": "# Documentation\n",
    "include/camera.hpp": "#pragma once\n",
    "src/main.cpp": "int main() {}\n",
    "src/internal/worker.cpp": "void work() {}\n",
    "notes/design.yaml": "title: Design\n",
    "assets/logo.png": "not a real image"
  }
};
const revealWorkspaceFixture = Object.fromEntries(
  Array.from({ length: 30 }, (_, index) => [
    `scroll-${String(index).padStart(2, "0")}.md`,
    `# Scroll file ${index}\n`
  ])
);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFetch(url, timeoutMs = 8000) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function connectToPage() {
  const response = await waitForFetch(`http://127.0.0.1:${debugPort}/json`);
  const page = (await response.json()).find((tab) => tab.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  const exceptions = [];
  let id = 0;

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(message.params.exceptionDetails.text || "Uncaught page exception");
    }
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const next = ++id;
      pending.set(next, resolve);
      ws.send(JSON.stringify({ id: next, method, params }));
    });
  }

  await send("Runtime.enable");
  return { exceptions, send, ws };
}

async function evaluate(send, expression) {
  const response = await send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true
  });

  if (response.result.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.text || "Page evaluation failed.");
  }
  return response.result.result.value;
}

async function waitFor(send, expression, timeoutMs = 8000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (await evaluate(send, expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

function startServer() {
  return spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: repoRoot,
    stdio: "ignore"
  });
}

function startChrome() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "localdraftai-relevant-folders-e2e-"));

  return {
    process: spawn("google-chrome", [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--window-size=1440,900",
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      pageUrl
    ], { stdio: "ignore" }),
    userDataDir
  };
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    delay(1500).then(() => false)
  ]);
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(1500)
    ]);
  }
}

async function main() {
  const server = startServer();
  const chrome = startChrome();
  let connection;

  try {
    await waitForFetch(pageUrl);
    connection = await connectToPage();
    const { send } = connection;

    await waitFor(send, "Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi)");
    await evaluate(send, `(() => {
      localStorage.setItem("localdraftai.workspaceSidebar.mode", "expanded");
      location.reload();
    })()`);
    await delay(250);
    await waitFor(send, "Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi)");

    const scanned = await evaluate(
      send,
      `window.MarkdownEditor.__testApi.loadWorkspaceFixtureForTest(${JSON.stringify(workspaceFixture)})`
    );
    assert.deepEqual(scanned.directories, [".vscode", "docs", "notes"]);
    assert.deepEqual(scanned.files.sort(), [
      ".vscode/launch.json",
      "docs/README.md",
      "notes/design.yaml"
    ]);

    const explorer = await evaluate(send, `({
      files: Array.from(document.querySelectorAll("[data-workspace-path]"))
        .map((item) => item.dataset.workspacePath),
      folders: Array.from(document.querySelectorAll("[data-workspace-folder-path]"))
        .map((item) => item.dataset.workspaceFolderPath)
    })`);
    assert.deepEqual(explorer.folders, [".vscode", "docs", "notes"]);
    assert.deepEqual(explorer.files, [
      ".vscode/launch.json",
      "docs/README.md",
      "notes/design.yaml"
    ]);

    const explorerText = await evaluate(send, `document.querySelector("#workspaceSidebar").textContent`);
    [".vscode", "launch.json", "docs", "README.md", "notes", "design.yaml"].forEach((label) => {
      assert.match(explorerText, new RegExp(label.replace(".", "\\.")), label);
    });
    ["include", "lib", "src", "internal", "camera.hpp", "main.cpp", "worker.cpp", "assets", "logo.png"].forEach((label) => {
      assert.doesNotMatch(explorerText, new RegExp(label.replace(".", "\\.")), label);
    });

    const filtered = await evaluate(send, `(() => {
      const input = document.querySelector(".workspace-file-search");
      input.value = "design";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        files: Array.from(document.querySelectorAll("[data-workspace-path]"))
          .map((item) => item.dataset.workspacePath),
        folders: Array.from(document.querySelectorAll("[data-workspace-folder-path]"))
          .map((item) => item.dataset.workspaceFolderPath)
      };
    })()`);
    assert.deepEqual(filtered.folders, ["notes"]);
    assert.deepEqual(filtered.files, ["notes/design.yaml"]);

    const restored = await evaluate(send, `(() => {
      const input = document.querySelector(".workspace-file-search");
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        files: Array.from(document.querySelectorAll("[data-workspace-path]"))
          .map((item) => item.dataset.workspacePath),
        folders: Array.from(document.querySelectorAll("[data-workspace-folder-path]"))
          .map((item) => item.dataset.workspaceFolderPath)
      };
    })()`);
    assert.deepEqual(restored.folders, [".vscode", "docs", "notes"]);
    assert.deepEqual(restored.files, [
      ".vscode/launch.json",
      "docs/README.md",
      "notes/design.yaml"
    ]);

    const collapseExpand = await evaluate(send, `(() => {
      const folder = document.querySelector('[data-workspace-folder-path="notes"]');
      folder.click();
      const hiddenAfterCollapse = !document.querySelector('[data-workspace-path="notes/design.yaml"]');
      document.querySelector('[data-workspace-folder-path="notes"]').click();
      return {
        hiddenAfterCollapse,
        visibleAfterExpand: Boolean(document.querySelector('[data-workspace-path="notes/design.yaml"]'))
      };
    })()`);
    assert.deepEqual(collapseExpand, {
      hiddenAfterCollapse: true,
      visibleAfterExpand: true
    });

    await evaluate(
      send,
      `window.MarkdownEditor.__testApi.loadWorkspaceForTest(${JSON.stringify(revealWorkspaceFixture)})`
    );
    await evaluate(send, `window.MarkdownEditor.__testApi.openWorkspaceFileForTest("scroll-15.md")`);
    await evaluate(send, `window.MarkdownEditor.__testApi.openWorkspaceFileForTest("scroll-29.md")`);
    const beforeOpenReveal = await evaluate(send, `(() => {
      const body = document.querySelector(".workspace-sidebar-body");
      body.style.flex = "0 0 80px";
      body.style.height = "80px";
      body.scrollTop = body.scrollHeight;
      return body.scrollTop;
    })()`);
    await evaluate(send, `window.MarkdownEditor.__testApi.openWorkspaceFileForTest("scroll-00.md")`);
    await waitFor(send, `window.MarkdownEditor.__testApi.getEditorStateForTest().title === "scroll-00.md"`);
    const openedFileReveal = await evaluate(send, `(() => {
      const body = document.querySelector(".workspace-sidebar-body");
      const row = document.querySelector('[data-workspace-path="scroll-00.md"]');
      const bodyRect = body.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      return {
        active: row.classList.contains("is-active"),
        scrollTop: body.scrollTop,
        visible: rowRect.top >= bodyRect.top - 1 && rowRect.bottom <= bodyRect.bottom + 1
      };
    })()`);
    assert.equal(openedFileReveal.active, true);
    assert.equal(openedFileReveal.visible, true);
    assert.ok(openedFileReveal.scrollTop < beforeOpenReveal);

    const beforeTabReveal = await evaluate(send, `(() => {
      const body = document.querySelector(".workspace-sidebar-body");
      body.scrollTop = 0;
      return body.scrollTop;
    })()`);
    await evaluate(send, `(() => {
      const tab = Array.from(document.querySelectorAll(".doc-tab"))
        .find((item) => item.querySelector(".tab-title").textContent === "scroll-29.md");
      tab.click();
    })()`);
    await waitFor(send, `window.MarkdownEditor.__testApi.getEditorStateForTest().title === "scroll-29.md"`);
    const selectedTabReveal = await evaluate(send, `(() => {
      const body = document.querySelector(".workspace-sidebar-body");
      const row = document.querySelector('[data-workspace-path="scroll-29.md"]');
      const bodyRect = body.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      return {
        active: row.classList.contains("is-active"),
        scrollTop: body.scrollTop,
        visible: rowRect.top >= bodyRect.top - 1 && rowRect.bottom <= bodyRect.bottom + 1
      };
    })()`);
    assert.equal(selectedTabReveal.active, true);
    assert.equal(selectedTabReveal.visible, true);
    assert.ok(selectedTabReveal.scrollTop > beforeTabReveal);
    assert.deepEqual(connection.exceptions, []);

    console.log("ok - relevant local explorer folders headless");
  } finally {
    if (connection) connection.ws.close();
    await stopProcess(chrome.process);
    await stopProcess(server);
    try {
      fs.rmSync(chrome.userDataDir, {
        force: true,
        maxRetries: 12,
        recursive: true,
        retryDelay: 250
      });
    } catch (error) {
      // Chrome can release profile files asynchronously; the OS can remove this temporary directory later.
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
