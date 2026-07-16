import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const port = Number(process.env.LOCALDRAFTAI_E2E_PORT || 8769);
const debugPort = Number(process.env.LOCALDRAFTAI_E2E_DEBUG_PORT || 9243);
const pageUrl = `http://127.0.0.1:${port}/src/local_draft_ai.html?e2e=1`;
const tableMarkdown = [
  "| Left | Center | Right |",
  "| :--- | :---: | ---: |",
  "| A \\| B | `x | y` | C |"
].join("\n");

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
    throw new Error(result.error.message || JSON.stringify(result.error));
  }
  if (result.result.exceptionDetails) {
    throw new Error(result.result.exceptionDetails.text || "Page evaluation failed.");
  }
  return result.result.result.value;
}

async function waitForTestApi(send, timeoutMs = 8000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (await evaluate(send, "Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi)")) {
      return;
    }
    await delay(100);
  }

  throw new Error("Timed out waiting for test API.");
}

function startServer() {
  return spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: repoRoot,
    stdio: "ignore"
  });
}

function startChrome() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "localdraftai-table-e2e-"));

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
    await evaluate(send, `window.MarkdownEditor.__testApi.loadMarkdownForTest("Table.md", ${JSON.stringify(tableMarkdown)})`);

    let state = await evaluate(send, "window.MarkdownEditor.__testApi.getEditorStateForTest()");
    if (state.editorMode !== "wysiwyg") {
      await evaluate(send, 'document.querySelector("#toggleEditorMode").click()');
    }

    const rendered = await evaluate(send, `(() => {
      const table = document.querySelector("#wysiwygEditor table.md-table");
      return table ? {
        cells: Array.from(table.querySelectorAll("td")).map((cell) => cell.textContent),
        code: table.querySelector("code").textContent,
        headerAlignments: Array.from(table.querySelectorAll("th")).map((cell) => getComputedStyle(cell).textAlign)
      } : null;
    })()`);
    assert.deepEqual(rendered.cells, ["A | B", "x | y", "C"]);
    assert.equal(rendered.code, "x | y");
    assert.deepEqual(rendered.headerAlignments, ["left", "center", "right"]);

    const sanitized = await evaluate(send, `(() => {
      const html = '<table onclick="alert(1)"><thead><tr><th data-md-align="center" style="color:red">Name</th></tr></thead><tbody><tr><td>Garry</td></tr></tbody></table>';
      return window.MarkdownEditor.markdown.sanitizePastedHtml(html);
    })()`);
    assert.match(sanitized, /<table class="md-table">/);
    assert.match(sanitized, /<th data-md-align="center">Name<\/th>/);
    assert.doesNotMatch(sanitized, /onclick|style=/);

    await evaluate(send, 'document.querySelector("#toggleEditorMode").click()');
    state = await evaluate(send, "window.MarkdownEditor.__testApi.getEditorStateForTest()");
    assert.equal(state.editorMode, "markdown");
    assert.equal(state.markdownText, tableMarkdown);

    await evaluate(send, `(() => {
      const editor = document.querySelector("#markdownEditor");
      editor.focus();
      editor.selectionStart = editor.value.length;
      editor.selectionEnd = editor.value.length;
      document.querySelector('[data-action="insertTable"]').click();
    })()`);
    state = await evaluate(send, "window.MarkdownEditor.__testApi.getEditorStateForTest()");
    assert.match(state.markdownText, /\| Column 1 \| Column 2 \| Column 3 \|/);

    await evaluate(send, 'document.querySelector("#toggleEditorMode").click()');
    assert.equal(await evaluate(send, 'document.querySelectorAll("#wysiwygEditor table.md-table").length'), 2);
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
  console.log("ok - Markdown tables render, round-trip, and insert from the toolbar");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
