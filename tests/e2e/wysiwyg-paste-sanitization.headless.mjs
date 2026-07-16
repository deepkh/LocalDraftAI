import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const port = Number(process.env.LOCALDRAFTAI_E2E_PORT || 8771);
const debugPort = Number(process.env.LOCALDRAFTAI_E2E_DEBUG_PORT || 9245);
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

function startServer() {
  return spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: repoRoot,
    stdio: "ignore"
  });
}

function startChrome() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "localdraftai-paste-e2e-"));

  return {
    process: spawn("google-chrome", [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--window-size=1280,900",
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      pageUrl
    ], { stdio: "ignore" }),
    userDataDir
  };
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

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  const exited = await Promise.race([new Promise((resolve) => child.once("exit", () => resolve(true))), delay(1500).then(() => false)]);
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(1500)]);
  }
}

async function ensureMode(send, mode) {
  const state = await evaluate(send, "window.MarkdownEditor.__testApi.getEditorStateForTest()");
  if (state.editorMode !== mode) {
    await evaluate(send, 'document.querySelector("#toggleEditorMode").click()');
    await delay(150);
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
    await evaluate(send, `window.MarkdownEditor.__testApi.loadMarkdownForTest("Paste.md", "Replace me")`);
    await ensureMode(send, "wysiwyg");

    const pasteResult = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const range = document.createRange();
      const selection = getSelection();
      const data = new DataTransfer();
      const html = [
        '<div class="reasoning"><button>Worked for 5m 17s<svg><path></path></svg></button><div></div></div>',
        '<div data-message-author-role="assistant"><div><div>',
        '<h2 id="unsafe-heading">Safe heading</h2>',
        '<p class="card" style="color:red" onclick="bad()">Before<button aria-label="Copy"><svg><path></path></svg>Copy</button>After <strong>bold</strong><script>alert(1)</script><style>.bad{display:block}</style></p>',
        '<form><p>Useful form wrapper</p><input value="hidden"><select><option>Choice</option></select><textarea>Draft</textarea></form>',
        '<ul><li>List item</li></ul>',
        '<table onclick="bad()"><thead><tr><th align="center">Name</th></tr></thead><tbody><tr><td>Value</td></tr></tbody></table>',
        '<iframe>Frame text</iframe><object>Object text</object><canvas>Canvas text</canvas><video>Video text</video>',
        '</div></div></div>'
      ].join('');

      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
      data.setData("text/html", html);
      data.setData("text/plain", "Safe heading Before Copy After bold Useful form wrapper Choice Draft List item Name Value");
      const dispatched = editor.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data
      }));
      return { dispatched, html };
    })()`);
    assert.equal(pasteResult.dispatched, false, "LocalDraftAI should cancel native rich insertion");
    await delay(350);

    const wysiwyg = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const blocked = "button,input,textarea,select,option,optgroup,datalist,script,style,template,noscript,iframe,frame,frameset,object,embed,applet,portal,canvas,svg,video,audio,source,track,dialog,meta,link,base,title";
      const text = editor.innerText;
      return {
        blockedCount: editor.querySelectorAll(blocked).length,
        copiedLabelCount: (text.match(/Copy/g) || []).length,
        headingCount: editor.querySelectorAll("h2").length,
        html: editor.innerHTML,
        listCount: editor.querySelectorAll("ul > li").length,
        safeHeadingCount: (text.match(/Safe heading/g) || []).length,
        strongCount: editor.querySelectorAll("strong").length,
        tableCount: editor.querySelectorAll("table.md-table").length,
        text
      };
    })()`);

    assert.equal(wysiwyg.blockedCount, 0, JSON.stringify(wysiwyg));
    assert.equal(wysiwyg.copiedLabelCount, 0, JSON.stringify(wysiwyg));
    assert.equal(wysiwyg.safeHeadingCount, 1, JSON.stringify(wysiwyg));
    assert.equal(wysiwyg.headingCount, 1, JSON.stringify(wysiwyg));
    assert.equal(wysiwyg.strongCount, 1, JSON.stringify(wysiwyg));
    assert.equal(wysiwyg.listCount, 1, JSON.stringify(wysiwyg));
    assert.equal(wysiwyg.tableCount, 1, JSON.stringify(wysiwyg));
    assert.match(wysiwyg.text, /Before\s+After bold/);
    assert.match(wysiwyg.text, /Useful form wrapper/);
    assert.doesNotMatch(wysiwyg.html, /onclick|style=|id="unsafe-heading"|class="card"/i);

    await ensureMode(send, "markdown");
    const markdownState = await evaluate(send, "window.MarkdownEditor.__testApi.getEditorStateForTest()");
    assert.match(markdownState.markdownText, /^## Safe heading/m);
    assert.match(markdownState.markdownText, /Before After \*\*bold\*\*/);
    assert.match(markdownState.markdownText, /- List item/);
    assert.match(markdownState.markdownText, /\| Name \|/);
    assert.doesNotMatch(markdownState.markdownText, /Copy|alert\(|\.bad|Choice|Draft|Frame text|Object text|Canvas text|Video text/);
    assert.doesNotMatch(markdownState.markdownText, /<(?:button|script|iframe|svg|input|select|textarea|object|canvas|video)\b/i);

    await ensureMode(send, "wysiwyg");
    const roundTrip = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      return {
        blockedCount: editor.querySelectorAll("button,script,iframe,svg,input,select,textarea,object,canvas,video").length,
        headingCount: editor.querySelectorAll("h2").length,
        safeHeadingCount: (editor.innerText.match(/Safe heading/g) || []).length,
        tableCount: editor.querySelectorAll("table.md-table").length
      };
    })()`);
    assert.deepEqual(roundTrip, {
      blockedCount: 0,
      headingCount: 1,
      safeHeadingCount: 1,
      tableCount: 1
    });

    const plainPaste = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const range = document.createRange();
      const selection = getSelection();
      const data = new DataTransfer();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
      data.setData("text/plain", " PLAIN_PASTE_TOKEN");
      const dispatched = editor.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data
      }));
      return { dispatched };
    })()`);
    assert.equal(plainPaste.dispatched, false);
    await delay(350);
    assert.equal(
      await evaluate(send, `(document.querySelector("#wysiwygEditor").innerText.match(/PLAIN_PASTE_TOKEN/g) || []).length`),
      1
    );

    await evaluate(send, `document.execCommand("undo")`);
    await delay(250);
    assert.deepEqual(await evaluate(send, `(() => {
      const text = document.querySelector("#wysiwygEditor").innerText;
      return {
        plainCount: (text.match(/PLAIN_PASTE_TOKEN/g) || []).length,
        safeHeadingCount: (text.match(/Safe heading/g) || []).length
      };
    })()`), { plainCount: 0, safeHeadingCount: 1 });

    await evaluate(send, `document.execCommand("redo")`);
    await delay(250);
    assert.equal(
      await evaluate(send, `(document.querySelector("#wysiwygEditor").innerText.match(/PLAIN_PASTE_TOKEN/g) || []).length`),
      1
    );

    await evaluate(send, `window.MarkdownEditor.__testApi.loadMarkdownForTest(
      "Heading typography.md",
      "# Heading 1\\n\\n## Heading 2\\n\\n### Heading 3"
    )`);
    await ensureMode(send, "wysiwyg");
    assert.deepEqual(await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      return ["h1", "h2", "h3"].map((selector) => {
        const style = getComputedStyle(editor.querySelector(selector));
        return {
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          marginBottom: style.marginBottom,
          marginTop: style.marginTop
        };
      });
    })()`), [
      { fontSize: "24px", fontWeight: "600", lineHeight: "32px", marginBottom: "8px", marginTop: "0px" },
      { fontSize: "20px", fontWeight: "600", lineHeight: "28px", marginBottom: "4px", marginTop: "16px" },
      { fontSize: "18px", fontWeight: "600", lineHeight: "28px", marginBottom: "4px", marginTop: "16px" }
    ]);
    assert.deepEqual(connection.exceptions, []);
  } finally {
    if (connection) connection.ws.close();
    await stopProcess(chrome.process);
    await stopProcess(server);
    fs.rmSync(chrome.userDataDir, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 100
    });
  }
}

main().then(() => {
  console.log("ok - WYSIWYG rich paste sanitizes, round-trips, and inserts once");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
