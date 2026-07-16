import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const port = Number(process.env.LOCALDRAFTAI_E2E_PORT || 8772);
const debugPort = Number(process.env.LOCALDRAFTAI_E2E_DEBUG_PORT || 9246);
const pageUrl = `http://127.0.0.1:${port}/src/local_draft_ai.html?e2e=1`;
const workspaceFiles = {
  "README.md": "# Test workspace\n\nshared-needle in Markdown\n",
  "notes.txt": "plain notes\nshared-needle in text\n",
  "application.log": "2026-07-16 shared-needle in log output\n",
  "settings.json": "{\n  \"search\": \"shared-needle in JSON\"\n}\n",
  "config.yml": "search: shared-needle in YAML\n",
  "workflow.yaml": "---\nname: first\n---\nname: shared-needle workflow\n",
  "ignored.js": "const value = 'shared-needle';\n",
  "image.png": "not a real image"
};

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
  let id = 0;

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
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
  return { send, ws };
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "localdraftai-text-e2e-"));
  return {
    process: spawn("google-chrome", [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--window-size=1440,900",
      "--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`, pageUrl
    ], { stdio: "ignore" }),
    userDataDir
  };
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  const exited = await Promise.race([new Promise((resolve) => child.once("exit", () => resolve(true))), delay(1500).then(() => false)]);
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(1500)]);
  }
}

async function openWorkspaceFile(send, filePath, options = {}) {
  await evaluate(send, `window.MarkdownEditor.__testApi.openWorkspaceFileForTest(${JSON.stringify(filePath)}, ${JSON.stringify(options)})`);
  return evaluate(send, "window.MarkdownEditor.__testApi.getEditorStateForTest()");
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

    const scanned = await evaluate(send, `window.MarkdownEditor.__testApi.loadWorkspaceForTest(${JSON.stringify(workspaceFiles)})`);
    assert.deepEqual(scanned.map((item) => item.path).sort(), [
      "README.md", "application.log", "config.yml", "notes.txt", "settings.json", "workflow.yaml"
    ]);

    const explorer = await evaluate(send, `Array.from(document.querySelectorAll("[data-workspace-path]")).map((item) => ({
      indicator: item.querySelector(".workspace-file-type") && item.querySelector(".workspace-file-type").textContent,
      path: item.dataset.workspacePath
    }))`);
    assert.deepEqual(explorer.map((item) => item.path).sort(), scanned.map((item) => item.path).sort());
    assert.equal(explorer.some((item) => item.path === "ignored.js" || item.path === "image.png"), false);
    assert.equal(explorer.find((item) => item.path === "settings.json").indicator, "{}");
    assert.equal(explorer.find((item) => item.path === "application.log").indicator, "TXT");

    let state = await openWorkspaceFile(send, "README.md");
    assert.equal(state.documentType, "markdown");
    assert.equal(state.sourceOnly, false);
    assert.equal(await evaluate(send, "document.querySelector('#toggleEditorMode').disabled"), false);
    await evaluate(send, "document.querySelector('#toggleEditorMode').click()");
    state = await evaluate(send, "window.MarkdownEditor.__testApi.getEditorStateForTest()");
    assert.equal(state.editorMode, "markdown");
    await evaluate(send, "document.querySelector('#toggleEditorMode').click()");
    assert.equal((await evaluate(send, "window.MarkdownEditor.__testApi.getEditorStateForTest()")).editorMode, "wysiwyg");

    await evaluate(send, `(() => {
      const markdown = window.MarkdownEditor.markdown;
      window.__conversionCalls = { render: 0, toMarkdown: 0 };
      const render = markdown.renderMarkdown;
      const toMarkdown = markdown.htmlToMarkdown;
      markdown.renderMarkdown = function (...args) { window.__conversionCalls.render += 1; return render.apply(this, args); };
      markdown.htmlToMarkdown = function (...args) { window.__conversionCalls.toMarkdown += 1; return toMarkdown.apply(this, args); };
    })()`);

    state = await openWorkspaceFile(send, "notes.txt");
    assert.equal(state.documentType, "text");
    assert.equal(state.sourceOnly, true);
    assert.equal(state.markdownHidden, false);
    assert.equal(state.wysiwygHidden, true);
    assert.equal(state.modeLabel, "Source");
    assert.equal(await evaluate(send, "document.querySelector('#toggleEditorMode').disabled"), true);
    assert.equal(await evaluate(send, "document.querySelector('[data-action=bold]').disabled"), true);
    assert.deepEqual(await evaluate(send, "window.__conversionCalls"), { render: 0, toMarkdown: 0 });

    state = await openWorkspaceFile(send, "application.log");
    assert.equal(state.documentType, "text");
    assert.equal(state.sourceOnly, true);
    assert.equal(state.modeLabel, "Source");
    assert.deepEqual(await evaluate(send, "window.__conversionCalls"), { render: 0, toMarkdown: 0 });

    state = await openWorkspaceFile(send, "notes.txt");

    await evaluate(send, `(() => {
      const editor = document.querySelector("#markdownEditor");
      editor.value += "edited exactly\\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("#toggleSoftWrap").click();
    })()`);
    assert.equal((await evaluate(send, "window.MarkdownEditor.__testApi.getEditorStateForTest()")).softWrapEnabled, false);
    const savedText = await evaluate(send, "window.MarkdownEditor.__testApi.saveActiveDocumentForTest()");
    assert.equal(savedText, "plain notes\nshared-needle in text\nedited exactly\n");

    await openWorkspaceFile(send, "README.md");
    assert.equal(
      (await evaluate(send, "window.MarkdownEditor.__testApi.getEditorStateForTest()")).softWrapEnabled,
      true,
      JSON.stringify(await evaluate(send, "window.MarkdownEditor.__testApi.getOpenTabsForTest()"))
    );
    await openWorkspaceFile(send, "notes.txt");
    assert.equal((await evaluate(send, "window.MarkdownEditor.__testApi.getEditorStateForTest()")).softWrapEnabled, false);
    await evaluate(send, "window.MarkdownEditor.__testApi.closeActiveTabForTest()");
    state = await openWorkspaceFile(send, "notes.txt");
    assert.equal(state.markdownText, savedText);
    assert.equal(state.sourceOnly, true);

    state = await openWorkspaceFile(send, "settings.json");
    assert.equal(state.validationState.status, "valid");
    assert.equal(await evaluate(send, "document.querySelector('#validationStatus').textContent"), "Valid JSON");
    await evaluate(send, `(() => {
      const editor = document.querySelector("#markdownEditor");
      editor.value = "{ invalid JSON }";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await delay(450);
    state = await evaluate(send, "window.MarkdownEditor.__testApi.getEditorStateForTest()");
    assert.equal(state.validationState.status, "invalid");
    assert.equal(await evaluate(send, "window.MarkdownEditor.__testApi.saveActiveDocumentForTest()"), "{ invalid JSON }");
    await evaluate(send, `(() => {
      const editor = document.querySelector("#markdownEditor");
      editor.value = "{\\n  \\"fixed\\": \\"shared-needle repaired JSON\\"\\n}\\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await delay(450);
    assert.equal((await evaluate(send, "window.MarkdownEditor.__testApi.getEditorStateForTest()")).validationState.status, "valid");
    await evaluate(send, "window.MarkdownEditor.__testApi.saveActiveDocumentForTest()");

    state = await openWorkspaceFile(send, "config.yml");
    assert.equal(state.validationState.status, "valid");
    await evaluate(send, `(() => {
      const editor = document.querySelector("#markdownEditor");
      editor.value = "broken: [yaml";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await delay(450);
    assert.equal((await evaluate(send, "window.MarkdownEditor.__testApi.getEditorStateForTest()")).validationState.status, "invalid");
    await evaluate(send, `(() => {
      const editor = document.querySelector("#markdownEditor");
      editor.value = "search: shared-needle repaired YAML\\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await delay(450);
    assert.equal((await evaluate(send, "window.MarkdownEditor.__testApi.getEditorStateForTest()")).validationState.status, "valid");

    const search = await evaluate(send, "window.MarkdownEditor.__testApi.searchWorkspaceForTest('shared-needle')");
    assert.deepEqual([...new Set(search.results.map((item) => item.path))].sort(), [
      "README.md", "application.log", "config.yml", "notes.txt", "settings.json", "workflow.yaml"
    ]);
    const jsonResult = search.results.find((item) => item.path === "settings.json");
    assert.equal(jsonResult.documentType, "json");
    state = await openWorkspaceFile(send, jsonResult.path, { line: jsonResult.line });
    assert.equal(state.documentType, "json");
    assert.equal(state.sourceOnly, true);

    await openWorkspaceFile(send, "workflow.yaml");
    const metadata = await evaluate(send, "window.MarkdownEditor.__testApi.getWorkspaceMetadataForTest()");
    const contents = await evaluate(send, "window.MarkdownEditor.__testApi.getWorkspaceContentsForTest()");
    assert.ok(metadata.openedTabs.length >= 4);

    await evaluate(send, "location.reload()");
    await delay(250);
    await waitFor(send, "Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi)");
    await evaluate(send, `window.MarkdownEditor.__testApi.loadWorkspaceForTest(${JSON.stringify(contents)}, ${JSON.stringify(metadata)})`);
    const restoredTabs = await evaluate(send, "window.MarkdownEditor.__testApi.getOpenTabsForTest()");
    restoredTabs.filter((tab) => tab.documentType !== "markdown").forEach((tab) => {
      assert.equal(tab.sourceOnly, true, tab.title);
      assert.equal(tab.editorMode, "markdown", tab.title);
    });

    console.log("ok - plain-text file support headless");
  } finally {
    if (connection) connection.ws.close();
    await stopProcess(chrome.process);
    await stopProcess(server);
    fs.rmSync(chrome.userDataDir, { force: true, maxRetries: 5, recursive: true, retryDelay: 200 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
