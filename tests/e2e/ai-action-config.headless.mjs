import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const port = Number(process.env.LOCALDRAFTAI_E2E_PORT || 8768);
const debugPort = Number(process.env.LOCALDRAFTAI_E2E_DEBUG_PORT || 9252);
const pageUrl = `http://127.0.0.1:${port}/src/local_draft_ai.html?e2e=1`;

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
  await Promise.race([new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  }), delay(5000).then(() => {
    throw new Error("Timed out connecting to the Chrome DevTools page.");
  })]);

  function send(method, params = {}) {
    const request = new Promise((resolve) => {
      const next = ++id;
      pending.set(next, resolve);
      ws.send(JSON.stringify({ id: next, method, params }));
    });

    return Promise.race([request, delay(8000).then(() => {
      throw new Error(`Timed out waiting for Chrome DevTools method: ${method}`);
    })]);
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "localdraftai-actions-e2e-"));
  return {
    process: spawn("google-chrome", [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
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
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(1500)]);
}

async function toolbarLabels(send) {
  await evaluate(send, `document.querySelector("#aiAssistantButton").click()`);
  return evaluate(send, `Array.from(document.querySelectorAll("#aiToolbarMenu button")).map((item) => item.textContent)`);
}

async function main() {
  const server = startServer();
  const chrome = startChrome();
  let connection;

  try {
    await waitForFetch(pageUrl);
    connection = await connectToPage();
    const { send } = connection;

    await waitFor(send, `Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi && window.MarkdownEditor.aiActionConfig.currentYaml())`);

    const defaultLabels = await toolbarLabels(send);
    [
      "Grammar Correction",
      "Improve Wording",
      "Make Professional",
      "Summarize",
      "Make Shorter",
      "Beautify Markdown",
      "Fix Markdown Syntax"
    ].forEach((label) => assert.ok(defaultLabels.includes(label)));

    await evaluate(send, `(() => {
      const button = Array.from(document.querySelectorAll("#aiToolbarMenu button"))
        .find((item) => item.textContent === "Configure AI Actions...");
      button.click();
      const editor = document.querySelector("#aiActionConfigEditor");
      const config = window.jsyaml.load(editor.value);
      config.actions.find((action) => action.id === "makeShorter").enabled = false;
      config.actions.push({
        id: "translateTraditionalChinese",
        enabled: true,
        label: "Translate to Traditional Chinese",
        category: "Custom",
        prompt: "Translate selected Markdown to Traditional Chinese.",
        reasoningDefault: "low"
      });
      editor.value = window.jsyaml.dump(config);
      document.querySelector("#aiActionConfigValidate").click();
      return document.querySelector("#aiActionConfigStatus").textContent;
    })()`);
    assert.match(await evaluate(send, `document.querySelector("#aiActionConfigStatus").textContent`), /Valid AI Actions config/);

    await evaluate(send, `document.querySelector("#aiActionConfigSave").click()`);
    await waitFor(send, `document.querySelector("#aiActionConfigStatus").textContent.includes("saved")`);
    await evaluate(send, `document.querySelector("#aiActionConfigClose").click()`);

    const customLabels = await toolbarLabels(send);
    assert.equal(customLabels.includes("Make Shorter"), false);
    assert.equal(customLabels.includes("Translate to Traditional Chinese"), true);

    await evaluate(send, `(() => {
      document.querySelector("#aiAssistantButton").click();
      window.MarkdownEditor.__testApi.loadMarkdownForTest("Actions.md", "Hello local AI action");
      if (window.MarkdownEditor.__testApi.getEditorStateForTest().editorMode !== "markdown") {
        document.querySelector("#toggleEditorMode").click();
      }
      const editor = document.querySelector("#markdownEditor");
      editor.focus();
      editor.selectionStart = 0;
      editor.selectionEnd = editor.value.length;
      editor.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 40, clientY: 40 }));
    })()`);
    const contextLabels = await evaluate(send, `Array.from(document.querySelectorAll(".ai-context-menu button")).map((item) => item.textContent)`);
    assert.equal(contextLabels.includes("Make Shorter"), false);
    assert.equal(contextLabels.includes("Translate to Traditional Chinese"), true);

    await evaluate(send, `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
    await evaluate(send, `document.querySelector("#aiAssistantButton").click()`);
    await evaluate(send, `Array.from(document.querySelectorAll("#aiToolbarMenu button"))
      .find((item) => item.textContent === "Translate to Traditional Chinese").click()`);
    await waitFor(send, `document.querySelector("#aiAssistantPanel").hidden === false`);
    assert.match(await evaluate(send, `document.querySelector("#aiReviewTitle").textContent`), /Translate to Traditional Chinese/);
    await evaluate(send, `document.querySelector("#aiReviewCancel").click()`);

    await evaluate(send, `(() => {
      document.querySelector("#aiAssistantButton").click();
      Array.from(document.querySelectorAll("#aiToolbarMenu button"))
        .find((item) => item.textContent === "Configure AI Actions...").click();
      const editor = document.querySelector("#aiActionConfigEditor");
      const config = window.jsyaml.load(editor.value);
      delete config.actions[0].prompt;
      editor.value = window.jsyaml.dump(config);
      document.querySelector("#aiActionConfigSave").click();
    })()`);
    await waitFor(send, `document.querySelector("#aiActionConfigStatus").dataset.status === "error"`);
    assert.match(await evaluate(send, `document.querySelector("#aiActionConfigStatus").textContent`), /prompt/);

    await evaluate(send, `(() => {
      window.confirm = () => true;
      document.querySelector("#aiActionConfigReset").click();
      document.querySelector("#aiActionConfigSave").click();
    })()`);
    await waitFor(send, `document.querySelector("#aiActionConfigStatus").textContent.includes("saved")`);
    await evaluate(send, `document.querySelector("#aiActionConfigClose").click()`);
    const resetLabels = await toolbarLabels(send);
    assert.equal(resetLabels.includes("Make Shorter"), true);
    assert.equal(resetLabels.includes("Translate to Traditional Chinese"), false);
  } finally {
    if (connection) connection.ws.close();
    await stopProcess(chrome.process);
    await stopProcess(server);
    fs.rmSync(chrome.userDataDir, { force: true, recursive: true });
  }
}

main().then(() => {
  console.log("ok - configurable AI Actions YAML updates menus and review flow");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
