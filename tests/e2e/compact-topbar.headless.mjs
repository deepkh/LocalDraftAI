import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const port = Number(process.env.LOCALDRAFTAI_E2E_PORT || 8772);
const debugPort = Number(process.env.LOCALDRAFTAI_E2E_DEBUG_PORT || 9246);
const pageUrl = `http://127.0.0.1:${port}/src/local_draft_ai.html?e2e=1`;
const preferenceKey = "localdraftai.ui.formatToolbarVisible";

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
  await send("Page.enable");
  return { exceptions, send, ws };
}

async function evaluate(send, expression) {
  const response = await send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true
  });

  if (response.result.exceptionDetails) {
    throw new Error(
      response.result.exceptionDetails.exception &&
      response.result.exceptionDetails.exception.description ||
      response.result.exceptionDetails.text ||
      "Page evaluation failed."
    );
  }
  return response.result.result.value;
}

async function waitFor(send, expression, timeoutMs = 8000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(send, expression)) return;
    } catch (error) {
      if (!String(error && error.message || "").includes("Execution context was destroyed")) {
        throw error;
      }
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function reload(send) {
  await evaluate(send, "location.reload()");
  await delay(250);
  await waitFor(send, "Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi)");
}

async function setWidth(send, width) {
  await send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: 820,
    mobile: false,
    width
  });
  await delay(100);
}

function startServer() {
  return spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: repoRoot,
    stdio: "ignore"
  });
}

function startChrome() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "localdraftai-compact-topbar-e2e-"));

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

    await waitFor(send, "Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi)");
    await evaluate(send, `localStorage.removeItem(${JSON.stringify(preferenceKey)})`);
    await reload(send);

    const compactDefault = await evaluate(send, `(() => {
      const topbar = document.querySelector("#editorTopbar");
      const compact = document.querySelector(".compact-document-bar");
      const format = document.querySelector("#formatToolbar");
      const tabs = document.querySelector("#tabList");
      return {
        compactVisible: compact.getBoundingClientRect().height > 0,
        formatHidden: format.hidden,
        hasActiveTab: Boolean(tabs.querySelector('[aria-selected="true"]')),
        noPageOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        rowOrder: topbar.firstElementChild === compact && compact.nextElementSibling === format,
        topbarVisible: topbar.getBoundingClientRect().height > 0
      };
    })()`);
    assert.deepEqual(compactDefault, {
      compactVisible: true,
      formatHidden: true,
      hasActiveTab: true,
      noPageOverflow: true,
      rowOrder: true,
      topbarVisible: true
    });

    await evaluate(send, `document.querySelector("#toggleFormatToolbar").click()`);
    assert.deepEqual(await evaluate(send, `({
      expanded: document.querySelector("#toggleFormatToolbar").getAttribute("aria-expanded"),
      hidden: document.querySelector("#formatToolbar").hidden,
      stored: localStorage.getItem(${JSON.stringify(preferenceKey)}),
      viewChecked: document.querySelector("#viewFormatToolbarMenuItem").getAttribute("aria-checked")
    })`), {
      expanded: "true",
      hidden: false,
      stored: "true",
      viewChecked: "true"
    });

    await reload(send);
    assert.equal(await evaluate(send, `document.querySelector("#formatToolbar").hidden`), false);
    await evaluate(send, `document.querySelector("#toggleFormatToolbar").click()`);
    await reload(send);
    assert.deepEqual(await evaluate(send, `({
      expanded: document.querySelector("#toggleFormatToolbar").getAttribute("aria-expanded"),
      hidden: document.querySelector("#formatToolbar").hidden,
      stored: localStorage.getItem(${JSON.stringify(preferenceKey)})
    })`), { expanded: "false", hidden: true, stored: "false" });
    await evaluate(send, `document.querySelector("#toggleFormatToolbar").click()`);

    await evaluate(send, `(() => {
      window.MarkdownEditor.__testApi.loadMarkdownForTest("Formatting.md", "alpha beta\\ngamma");
      if (window.MarkdownEditor.__testApi.getEditorStateForTest().editorMode !== "wysiwyg") {
        document.querySelector("#toggleEditorMode").click();
      }
      const editor = document.querySelector("#wysiwygEditor");
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue.includes("alpha")) break;
      }
      const range = document.createRange();
      const start = node.nodeValue.indexOf("alpha");
      range.setStart(node, start);
      range.setEnd(node, start + 5);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      editor.focus();
      document.querySelector('#formatToolbar > [data-action="bold"]').click();
    })()`);
    await delay(250);
    assert.match((await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest().markdownText`)), /\*\*alpha\*\*/);

    await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue.includes("gamma")) break;
      }
      const range = document.createRange();
      const start = node.nodeValue.indexOf("gamma");
      range.setStart(node, start);
      range.setEnd(node, start + 5);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      editor.focus();
      document.querySelector('#formatToolbar > [data-action="unorderedList"]').click();
    })()`);
    await delay(250);
    assert.match((await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest().markdownText`)), /- gamma/);

    await evaluate(send, `(() => {
      document.querySelector("#toggleEditorMode").click();
      window.MarkdownEditor.__testApi.loadMarkdownForTest("Source.md", "alpha beta\\nline");
      const editor = document.querySelector("#markdownEditor");
      editor.focus();
      editor.selectionStart = 0;
      editor.selectionEnd = 5;
      document.querySelector('#formatToolbar > [data-action="code"]').click();
      editor.selectionStart = editor.value.indexOf("beta");
      editor.selectionEnd = editor.selectionStart + 4;
      const originalPrompt = window.prompt;
      window.prompt = () => "https://example.com";
      document.querySelector('#formatToolbar > [data-action="link"]').click();
      window.prompt = originalPrompt;
    })()`);
    let sourceText = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest().markdownText`);
    assert.match(sourceText, /`alpha`/);
    assert.match(sourceText, /\[beta\]\(https:\/\/example\.com\)/);

    await evaluate(send, `(() => {
      const editor = document.querySelector("#markdownEditor");
      editor.focus();
      editor.selectionStart = editor.value.indexOf("line");
      editor.selectionEnd = editor.selectionStart + 4;
      document.querySelector("#formatMoreButton").click();
      document.querySelector('#formatMoreMenu [data-action="blockquote"]').click();
    })()`);
    sourceText = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest().markdownText`);
    assert.match(sourceText, /\n> line$/);
    assert.doesNotMatch(sourceText, /> > line/);
    assert.equal(await evaluate(send, `document.querySelector("#formatMoreMenu").hidden`), true);

    await evaluate(send, `(() => {
      window.MarkdownEditor.__testApi.loadMarkdownForTest("Overflow.md", "indent me");
      const editor = document.querySelector("#markdownEditor");
      editor.focus();
      editor.selectionStart = 0;
      editor.selectionEnd = editor.value.length;
      document.querySelector("#formatMoreButton").click();
      document.querySelector('#formatMoreMenu [data-action="horizontalRule"]').click();
    })()`);
    assert.equal(await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest().markdownText`), "---");

    await evaluate(send, `(() => {
      window.MarkdownEditor.__testApi.loadMarkdownForTest("Indent.md", "- item");
      const editor = document.querySelector("#markdownEditor");
      editor.focus();
      editor.selectionStart = 0;
      editor.selectionEnd = editor.value.length;
      document.querySelector("#formatMoreButton").click();
      document.querySelector('#formatMoreMenu [data-action="indentList"]').click();
      editor.selectionStart = 0;
      editor.selectionEnd = editor.value.length;
      document.querySelector("#formatMoreButton").click();
      document.querySelector('#formatMoreMenu [data-action="outdentList"]').click();
    })()`);
    assert.equal(await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest().markdownText`), "- item");

    const wrapBefore = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest().softWrapEnabled`);
    await evaluate(send, `(() => {
      document.querySelector("#documentMoreButton").click();
      document.querySelector("#toggleSoftWrap").click();
    })()`);
    assert.deepEqual(await evaluate(send, `({
      checked: document.querySelector("#toggleSoftWrap").getAttribute("aria-checked"),
      menuHidden: document.querySelector("#documentMoreMenu").hidden,
      wrap: window.MarkdownEditor.__testApi.getEditorStateForTest().softWrapEnabled
    })`), {
      checked: String(!wrapBefore),
      menuHidden: true,
      wrap: !wrapBefore
    });

    await evaluate(send, `(() => {
      document.querySelector("#documentMoreButton").click();
      document.querySelector("#toggleFocusMode").click();
    })()`);
    assert.deepEqual(await evaluate(send, `({
      focus: document.body.classList.contains("focus-mode"),
      formatHidden: document.querySelector("#formatToolbar").hidden,
      menuHidden: document.querySelector("#documentMoreMenu").hidden,
      stored: localStorage.getItem(${JSON.stringify(preferenceKey)})
    })`), {
      focus: true,
      formatHidden: true,
      menuHidden: true,
      stored: "true"
    });
    await evaluate(send, `document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }))`);
    assert.deepEqual(await evaluate(send, `({
      focus: document.body.classList.contains("focus-mode"),
      formatHidden: document.querySelector("#formatToolbar").hidden,
      stored: localStorage.getItem(${JSON.stringify(preferenceKey)})
    })`), { focus: false, formatHidden: false, stored: "true" });

    for (const extension of ["txt", "json", "yml", "yaml"]) {
      const filename = `SourceOnly.${extension}`;
      const text = extension === "json" ? "{ invalid" : extension === "txt" ? "plain text" : "key: value";
      const sourceOnly = await evaluate(send, `(() => {
        window.MarkdownEditor.__testApi.loadDocumentForTest(${JSON.stringify(filename)}, ${JSON.stringify(text)});
        const before = window.MarkdownEditor.__testApi.getEditorStateForTest().markdownText;
        document.querySelector('[data-action="bold"]').click();
        document.querySelector("#documentMoreButton").click();
        const softWrapEnabled = !document.querySelector("#toggleSoftWrap").disabled;
        document.querySelector("#documentMoreButton").dispatchEvent(new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Escape"
        }));
        const editor = document.querySelector("#markdownEditor");
        editor.value += " edited";
        editor.dispatchEvent(new Event("input", { bubbles: true }));
        return {
          boldBlocked: window.MarkdownEditor.__testApi.getEditorStateForTest().markdownText === before + " edited",
          editorUsable: editor.value.endsWith(" edited"),
          formatHidden: document.querySelector("#formatToolbar").hidden,
          softWrapEnabled,
          toggleDisabled: document.querySelector("#toggleFormatToolbar").disabled,
          toggleHidden: document.querySelector("#toggleFormatToolbar").hidden
        };
      })()`);
      assert.deepEqual(sourceOnly, {
        boldBlocked: true,
        editorUsable: true,
        formatHidden: true,
        softWrapEnabled: true,
        toggleDisabled: true,
        toggleHidden: true
      }, extension);
    }

    await evaluate(send, `window.MarkdownEditor.__testApi.loadMarkdownForTest("Back.md", "Back to Markdown")`);
    assert.deepEqual(await evaluate(send, `({
      expanded: document.querySelector("#toggleFormatToolbar").getAttribute("aria-expanded"),
      hidden: document.querySelector("#formatToolbar").hidden,
      toggleHidden: document.querySelector("#toggleFormatToolbar").hidden
    })`), { expanded: "true", hidden: false, toggleHidden: false });

    assert.equal(await evaluate(send, `document.querySelector("#compactAiButton")`), null);
    await evaluate(send, `document.querySelector('[data-workbench-view="ai"]').click()`);
    assert.deepEqual(await evaluate(send, `({
      count: document.querySelectorAll("#aiAssistantPanel").length,
      hidden: document.querySelector("#aiAssistantPanel").hidden,
      pressed: document.querySelector('[data-workbench-view="ai"]').getAttribute("aria-pressed")
    })`), { count: 1, hidden: false, pressed: "true" });
    await evaluate(send, `document.querySelector('[data-workbench-view="ai"]').click()`);
    assert.equal(await evaluate(send, `document.querySelector("#aiAssistantPanel").hidden`), false);
    assert.equal(await evaluate(send, `document.activeElement === document.querySelector("#aiAssistantPanelClose")`), true);
    await evaluate(send, `document.querySelector("#aiAssistantPanelClose").click()`);
    assert.equal(await evaluate(send, `document.querySelector('[data-workbench-view="ai"]').getAttribute("aria-pressed")`), "false");

    await evaluate(send, `(() => {
      for (let index = 0; index < 12; index += 1) {
        document.querySelector("#newTabButton").click();
        window.MarkdownEditor.__testApi.loadMarkdownForTest("Tab-" + index + ".md", "tab " + index);
      }
      document.querySelector("#tabScrollRight").click();
    })()`);
    await delay(200);
    const tabs = await evaluate(send, `(() => {
      const viewport = document.querySelector("#tabViewport");
      const active = document.querySelector('.doc-tab-wrap.is-active');
      const actions = document.querySelector(".compact-document-actions");
      const before = actions.getBoundingClientRect();
      viewport.scrollLeft = viewport.scrollWidth;
      viewport.dispatchEvent(new Event("scroll"));
      const after = actions.getBoundingClientRect();
      return {
        actionFixed: before.left === after.left && before.right === after.right,
        activeVisible: active.getBoundingClientRect().right >= viewport.getBoundingClientRect().left &&
          active.getBoundingClientRect().left <= viewport.getBoundingClientRect().right,
        canScroll: viewport.scrollWidth > viewport.clientWidth,
        count: window.MarkdownEditor.__testApi.getOpenTabsForTest().length
      };
    })()`);
    assert.equal(tabs.actionFixed, true);
    assert.equal(tabs.activeVisible, true);
    assert.equal(tabs.canScroll, true);
    assert.ok(tabs.count >= 13);

    await evaluate(send, `(() => {
      const first = document.querySelector("#tabList .doc-tab");
      first.click();
      document.querySelector("#tabList .doc-tab-wrap.is-active .tab-close").click();
      document.querySelector("#newTabButton").click();
    })()`);
    assert.ok((await evaluate(send, `window.MarkdownEditor.__testApi.getOpenTabsForTest().length`)) >= 13);

    for (const width of [1440, 1024, 768, 480]) {
      await setWidth(send, width);
      const responsive = await evaluate(send, `(() => {
        const low = document.querySelector('#formatToolbar > [data-action="link"]');
        const medium = document.querySelector('#formatToolbar > [data-action="unorderedList"]');
        const actions = document.querySelector(".compact-document-actions").getBoundingClientRect();
        document.querySelector("#formatMoreButton").click();
        const menu = document.querySelector("#formatMoreMenu");
        const menuRect = menu.getBoundingClientRect();
        const result = {
          actionsReachable: actions.left >= 0 && actions.right <= innerWidth,
          lowVisible: getComputedStyle(low).display !== "none",
          mediumVisible: getComputedStyle(medium).display !== "none",
          menuHasHiddenCommands: Boolean(
            menu.querySelector('[data-action="link"]') &&
            menu.querySelector('[data-action="unorderedList"]')
          ),
          menuInsideViewport: menuRect.left >= 0 && menuRect.right <= innerWidth &&
            menuRect.top >= 0 && menuRect.bottom <= innerHeight,
          noPageOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          tabScrolls: document.querySelector("#tabViewport").scrollWidth >
            document.querySelector("#tabViewport").clientWidth
        };
        document.querySelector("#formatMoreButton").dispatchEvent(new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Escape"
        }));
        return result;
      })()`);
      assert.equal(responsive.actionsReachable, true, `compact actions at ${width}px`);
      assert.equal(responsive.menuHasHiddenCommands, true, `overflow commands at ${width}px`);
      assert.equal(responsive.menuInsideViewport, true, `popup position at ${width}px`);
      assert.equal(responsive.noPageOverflow, true, `page overflow at ${width}px`);
      assert.equal(responsive.tabScrolls, true, `tab scrolling at ${width}px`);
      assert.equal(responsive.lowVisible, width >= 1100, `low priority at ${width}px`);
      assert.equal(responsive.mediumVisible, width >= 760, `medium priority at ${width}px`);
    }

    await setWidth(send, 1024);
    const keyboard = await evaluate(send, `(() => {
      window.MarkdownEditor.__testApi.loadMarkdownForTest("Keyboard.md", "keyboard line");
      const editor = document.querySelector("#markdownEditor");
      editor.focus();
      editor.selectionStart = 0;
      editor.selectionEnd = editor.value.length;
      const trigger = document.querySelector("#formatMoreButton");
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
      const firstFocused = document.activeElement === document.querySelector('#formatMoreMenu [data-action="unorderedList"]');
      document.activeElement.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "ArrowDown"
      }));
      const secondFocused = document.activeElement === document.querySelector('#formatMoreMenu [data-action="orderedList"]');
      document.activeElement.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter"
      }));
      const activatedAndClosed = document.querySelector("#formatMoreMenu").hidden;
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowDown" }));
      document.activeElement.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape"
      }));
      return {
        activatedAndClosed,
        firstFocused,
        focusRestored: document.activeElement === trigger,
        secondFocused
      };
    })()`);
    assert.deepEqual(keyboard, {
      activatedAndClosed: true,
      firstFocused: true,
      focusRestored: true,
      secondFocused: true
    });

    assert.deepEqual(connection.exceptions, []);
    await evaluate(send, `localStorage.removeItem(${JSON.stringify(preferenceKey)})`);
  } finally {
    if (connection) connection.ws.close();
    await stopProcess(chrome.process);
    await stopProcess(server);
    try {
      fs.rmSync(chrome.userDataDir, { force: true, maxRetries: 12, recursive: true, retryDelay: 250 });
    } catch (error) {
      // Chrome may briefly retain its temporary profile; the OS can remove it later.
    }
  }
}

main().then(() => {
  console.log("ok - compact topbar, overflow menus, persistence, and responsive behavior");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
