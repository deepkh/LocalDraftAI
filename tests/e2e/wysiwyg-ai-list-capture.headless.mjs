import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const port = Number(process.env.LOCALDRAFTAI_E2E_PORT || 8767);
const debugPort = Number(process.env.LOCALDRAFTAI_E2E_DEBUG_PORT || 9241);
const origin = `http://127.0.0.1:${port}`;
const pageUrl = `${origin}/src/local_draft_ai.html?e2e=1`;
const testMarkdown = `# AI Capture Test

Normal paragraph text.

- Apple item
- Banana item
- Cherry item

1. Open file
2. Select list
3. Run AI Assistant

- Parent
  - Child A
  - Child B
`;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFetch(url, timeoutMs = 8000) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }

  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function connectToPage() {
  const response = await waitForFetch(`http://127.0.0.1:${debugPort}/json`);
  const tabs = await response.json();
  const page = tabs.find((tab) => tab.type === "page");

  if (!page) {
    throw new Error("No Chrome page target was available.");
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

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
  const result = await send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true
  });

  if (result.error) {
    throw new Error(result.error.message || JSON.stringify(result));
  }

  if (result.result.exceptionDetails) {
    throw new Error(result.result.exceptionDetails.text || "Page evaluation failed.");
  }

  return result.result.result.value;
}

async function waitForTestApi(send, timeoutMs = 8000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (await evaluate(send, `Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi)`)) {
      return;
    }
    await delay(100);
  }

  throw new Error("Timed out waiting for test API.");
}

async function ensureMode(send, mode) {
  let state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);

  if (state.editorMode !== mode) {
    await evaluate(send, `document.querySelector("#toggleEditorMode").click()`);
    state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
  }

  assert.equal(state.editorMode, mode);
}

function startServer() {
  return spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: repoRoot,
    stdio: "ignore"
  });
}

function startChrome() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "localdraftai-e2e-"));

  return {
    process: spawn("google-chrome", [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      pageUrl
    ], {
      stdio: "ignore"
    }),
    userDataDir
  };
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill();
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    delay(1500).then(() => false)
  ]);
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(1500)]);
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

    await waitForTestApi(send);
    await evaluate(send, `window.MarkdownEditor.__testApi.loadMarkdownForTest("Capture.md", ${JSON.stringify(testMarkdown)})`);
    await ensureMode(send, "wysiwyg");

    const unordered = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let start = null;
      let end = null;
      let node;
      while ((node = walker.nextNode())) {
        if (!start && node.nodeValue.includes("Apple item")) start = node;
        if (!end && node.nodeValue.includes("Cherry item")) end = node;
      }
      const range = document.createRange();
      const selection = window.getSelection();
      range.setStart(start, 0);
      range.setEnd(end, end.nodeValue.length);
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
      return window.MarkdownEditor.__testApi.captureSelectionForTest();
    })()`);
    assert.equal(unordered.text, "- Apple item\n- Banana item\n- Cherry item");
    assert.equal(unordered.contentType, "text/markdown-fragment");

    const ordered = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let start = null;
      let end = null;
      let node;
      while ((node = walker.nextNode())) {
        if (!start && node.nodeValue.includes("Open file")) start = node;
        if (!end && node.nodeValue.includes("Run AI Assistant")) end = node;
      }
      const range = document.createRange();
      const selection = window.getSelection();
      range.setStart(start, 0);
      range.setEnd(end, end.nodeValue.length);
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
      return window.MarkdownEditor.__testApi.captureSelectionForTest();
    })()`);
    assert.equal(ordered.text, "1. Open file\n2. Select list\n3. Run AI Assistant");

    const nested = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let start = null;
      let end = null;
      let node;
      while ((node = walker.nextNode())) {
        if (!start && node.nodeValue.includes("Parent")) start = node;
        if (!end && node.nodeValue.includes("Child B")) end = node;
      }
      const range = document.createRange();
      const selection = window.getSelection();
      range.setStart(start, 0);
      range.setEnd(end, end.nodeValue.length);
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
      return window.MarkdownEditor.__testApi.captureSelectionForTest();
    })()`);
    assert.equal(nested.text, "- Parent\n  - Child A\n  - Child B");

    const partial = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue.includes("Banana item")) break;
      }
      const range = document.createRange();
      const selection = window.getSelection();
      range.setStart(node, 1);
      range.setEnd(node, 7);
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
      return window.MarkdownEditor.__testApi.captureSelectionForTest();
    })()`);
    assert.equal(partial.text, "anana ");

    const paragraph = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue.includes("Normal paragraph text.")) break;
      }
      const range = document.createRange();
      const selection = window.getSelection();
      range.setStart(node, 0);
      range.setEnd(node, node.nodeValue.length);
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
      return window.MarkdownEditor.__testApi.captureSelectionForTest();
    })()`);
    assert.equal(paragraph.text, "Normal paragraph text.");

    await ensureMode(send, "markdown");
    const markdown = await evaluate(send, `(() => {
      const editor = document.querySelector("#markdownEditor");
      const start = editor.value.indexOf("- Apple item");
      const end = editor.value.indexOf("\\n\\n1. Open file");
      editor.focus();
      editor.selectionStart = start;
      editor.selectionEnd = end;
      return window.MarkdownEditor.__testApi.captureSelectionForTest();
    })()`);
    assert.equal(markdown.text, "- Apple item\n- Banana item\n- Cherry item");
  } finally {
    if (connection) {
      connection.ws.close();
    }
    await stopProcess(chrome.process);
    await stopProcess(server);
    fs.rmSync(chrome.userDataDir, { force: true, maxRetries: 5, recursive: true, retryDelay: 200 });
  }
}

main().then(() => {
  console.log("ok - WYSIWYG AI list capture preserves Markdown list syntax");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
