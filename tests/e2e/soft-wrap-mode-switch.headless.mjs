import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const port = Number(process.env.LOCALDRAFTAI_E2E_PORT || 8766);
const debugPort = Number(process.env.LOCALDRAFTAI_E2E_DEBUG_PORT || 9240);
const origin = `http://127.0.0.1:${port}`;
const pageUrl = `${origin}/src/local_draft_ai.html?e2e=1`;
const planDir = path.join(repoRoot, "..", "LocalDraftAI_Plan");
const planFiles = fs.existsSync(planDir)
  ? fs.readdirSync(planDir).filter((name) => /\.md$/i.test(name)).sort()
  : [];
const longLine = "E2E_SOFT_WRAP_LONG_LINE_START " +
  "This is a very long line used to verify Soft Wrap behavior without inserting newline characters. ".repeat(24) +
  "E2E_SOFT_WRAP_LONG_LINE_END";
const testMarkdown = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8") + "\n\n" + longLine + "\n";
const agentsMarkdown = fs.readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");

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

  if (!result.result) {
    throw new Error(`Unexpected DevTools response: ${JSON.stringify(result)}`);
  }

  if (result.result.exceptionDetails) {
    throw new Error(result.result.exceptionDetails.text || "Page evaluation failed.");
  }

  return result.result.result.value;
}

async function waitForTestApi(send, timeoutMs = 8000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(send, `Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi)`)) {
        return;
      }
    } catch (error) {
      if (!String(error && error.message || "").includes("Execution context was destroyed")) {
        throw error;
      }
    }
    await delay(100);
  }

  throw new Error("Timed out waiting for test API.");
}

function readPlan(index) {
  if (!planFiles.length) {
    return {
      name: "README.md",
      text: fs.readFileSync(path.join(repoRoot, "README.md"), "utf8")
    };
  }

  const name = planFiles[index % planFiles.length];

  return {
    name,
    text: fs.readFileSync(path.join(planDir, name), "utf8")
  };
}

async function loadMarkdown(send, filename, markdownText) {
  await evaluate(send, `window.MarkdownEditor.__testApi.loadMarkdownForTest(${JSON.stringify(filename)}, ${JSON.stringify(markdownText)})`);
}

async function ensureMode(send, mode) {
  let state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);

  if (state.editorMode !== mode) {
    await evaluate(send, `document.querySelector("#toggleEditorMode").click()`);
    state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
  }

  assert.equal(state.editorMode, mode);
  return state;
}

async function dispatchKey(send, key, code, windowsVirtualKeyCode) {
  await send("Input.dispatchKeyEvent", {
    code,
    key,
    type: "keyDown",
    windowsVirtualKeyCode
  });
  await send("Input.dispatchKeyEvent", {
    code,
    key,
    type: "keyUp",
    windowsVirtualKeyCode
  });
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
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(1500)
  ]);
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

    await loadMarkdown(send, "AGENTS.md", agentsMarkdown);
    await loadMarkdown(send, "README.md", testMarkdown);

    let state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    if (state.editorMode !== "wysiwyg") {
      await evaluate(send, `document.querySelector("#toggleEditorMode").click()`);
      state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    }
    assert.equal(state.editorMode, "wysiwyg");

    const placed = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const target = "E2E_SOFT_WRAP_LONG_LINE_START";
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const index = node.nodeValue.indexOf(target);
        if (index >= 0) {
          const range = document.createRange();
          const selection = window.getSelection();
          range.setStart(node, index + target.length);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          editor.focus();
          const block = node.parentElement;
          editor.scrollTop = Math.max(0, block.offsetTop - editor.clientHeight / 2);
          return true;
        }
      }
      return false;
    })()`);
    assert.equal(placed, true);

    await evaluate(send, `document.querySelector("#toggleEditorMode").click()`);
    state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    assert.equal(state.editorMode, "markdown");
    assert.equal(state.markdownHidden, false);
    assert.equal(state.wysiwygHidden, true);

    const markdownLineCheck = await evaluate(send, `(() => {
      const editor = document.querySelector("#markdownEditor");
      const text = editor.value;
      const offset = editor.selectionStart;
      const line = text.slice(0, offset).split("\\n").length - 1;
      const lines = text.split("\\n");
      const currentLine = lines[line] || "";
      const nearby = lines.slice(Math.max(0, line - 2), line + 3).join("\\n");
      return {
        line,
        currentLine,
        hasLongLine: nearby.includes("E2E_SOFT_WRAP_LONG_LINE_START"),
        scrollTop: editor.scrollTop
      };
    })()`);
    assert.equal(markdownLineCheck.hasLongLine, true, JSON.stringify(markdownLineCheck));

    state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    if (!state.softWrapEnabled) {
      await evaluate(send, `document.querySelector("#toggleSoftWrap").click()`);
    }

    let wrapCheck = await evaluate(send, `(() => {
      const editor = document.querySelector("#markdownEditor");
      const style = getComputedStyle(editor);
      const matchingLines = editor.value
        .split("\\n")
        .filter((line) => line.includes("E2E_SOFT_WRAP_LONG_LINE_START")).length;
      return {
        pressed: document.querySelector("#toggleSoftWrap").getAttribute("aria-pressed"),
        classEnabled: editor.classList.contains("is-soft-wrap"),
        whiteSpace: style.whiteSpace,
        scrollWidth: editor.scrollWidth,
        clientWidth: editor.clientWidth,
        matchingLines
      };
    })()`);
    assert.equal(wrapCheck.pressed, "true");
    assert.equal(wrapCheck.classEnabled, true);
    assert.equal(wrapCheck.whiteSpace, "pre-wrap");
    assert.equal(wrapCheck.matchingLines, 1);

    await evaluate(send, `document.querySelector("#toggleSoftWrap").click()`);
    wrapCheck = await evaluate(send, `(() => {
      const editor = document.querySelector("#markdownEditor");
      const style = getComputedStyle(editor);
      const matchingLines = editor.value
        .split("\\n")
        .filter((line) => line.includes("E2E_SOFT_WRAP_LONG_LINE_START")).length;
      return {
        pressed: document.querySelector("#toggleSoftWrap").getAttribute("aria-pressed"),
        classEnabled: editor.classList.contains("is-soft-wrap"),
        whiteSpace: style.whiteSpace,
        scrollWidth: editor.scrollWidth,
        clientWidth: editor.clientWidth,
        matchingLines
      };
    })()`);
    assert.equal(wrapCheck.pressed, "false");
    assert.equal(wrapCheck.classEnabled, false);
    assert.equal(wrapCheck.whiteSpace, "pre");
    assert.equal(wrapCheck.matchingLines, 1);
    assert.ok(wrapCheck.scrollWidth > wrapCheck.clientWidth);

    await evaluate(send, `document.querySelector("#toggleEditorMode").click()`);
    state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    assert.equal(state.editorMode, "wysiwyg");
    assert.equal(state.markdownHidden, true);
    assert.equal(state.wysiwygHidden, false);

    const wysiwygVisibleCheck = await evaluate(send, `document.querySelector("#wysiwygEditor").innerText.includes("E2E_SOFT_WRAP_LONG_LINE_START")`);
    assert.equal(wysiwygVisibleCheck, true);

    await evaluate(send, `document.querySelector("#toggleSoftWrap").click()`);
    state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    assert.equal(state.softWrapEnabled, true);

    await evaluate(send, `document.querySelector("#toggleSoftWrap").click()`);
    state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    assert.equal(state.softWrapEnabled, false);

    await evaluate(send, `document.querySelector("#toggleEditorMode").click()`);
    const finalMarkdownCheck = await evaluate(send, `(() => {
      const editor = document.querySelector("#markdownEditor");
      const text = editor.value;
      const offset = editor.selectionStart;
      const line = text.slice(0, offset).split("\\n").length - 1;
      const lines = text.split("\\n");
      const currentLine = lines[line] || "";
      const nearby = lines.slice(Math.max(0, line - 2), line + 3).join("\\n");
      return {
        line,
        currentLine,
        hasLongLine: nearby.includes("E2E_SOFT_WRAP_LONG_LINE_START"),
        matchingLines: text.split("\\n").filter((line) => line.includes("E2E_SOFT_WRAP_LONG_LINE_START")).length
      };
    })()`);
    assert.equal(finalMarkdownCheck.hasLongLine, true);
    assert.equal(finalMarkdownCheck.matchingLines, 1);

    await loadMarkdown(send, "heading-enter-delete.md", "Text line\n# Heading 1 line string\n");
    await ensureMode(send, "wysiwyg");

    const placedHeading = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const headings = Array.from(editor.querySelectorAll("h1,h2,h3,h4,h5,h6"));
      for (const heading of headings) {
        const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const index = node.nodeValue.indexOf("Heading 1 line string");
          if (index >= 0) {
            const range = document.createRange();
            const selection = getSelection();
            range.setStart(node, index);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            editor.focus();
            return true;
          }
        }
      }
      return false;
    })()`);
    assert.equal(placedHeading, true);
    await dispatchKey(send, "Enter", "Enter", 13);
    const headingEnterCaret = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const selection = getSelection();
      const range = selection.rangeCount ? selection.getRangeAt(0) : null;
      let block = range && range.startContainer;
      if (block && block.nodeType === Node.TEXT_NODE) {
        block = block.parentElement;
      }
      while (block && block !== editor && !/^H[1-6]$/.test(block.tagName)) {
        block = block.parentElement;
      }
      return {
        caretBlock: block && block !== editor ? block.tagName : "",
        html: editor.innerHTML
      };
    })()`);
    assert.equal(headingEnterCaret.caretBlock, "H1", JSON.stringify(headingEnterCaret));
    const replacedHeadingCaret = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const headings = Array.from(editor.querySelectorAll("h1,h2,h3,h4,h5,h6"));
      for (const heading of headings) {
        const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const index = node.nodeValue.indexOf("Heading 1 line string");
          if (index >= 0) {
            const range = document.createRange();
            const selection = getSelection();
            range.setStart(node, index);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            editor.focus();
            return true;
          }
        }
      }
      return false;
    })()`);
    assert.equal(replacedHeadingCaret, true);
    await dispatchKey(send, "Delete", "Delete", 46);
    await delay(300);
    state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    assert.match(state.markdownText, /# Heading 1 line string/);

    await loadMarkdown(send, "heading-backspace-repro.md", "# ABC\n");
    await ensureMode(send, "wysiwyg");
    const placedHeadingEnd = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const heading = editor.querySelector("h1");
      if (!heading) {
        return false;
      }
      const range = document.createRange();
      const selection = getSelection();
      range.selectNodeContents(heading);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
      return true;
    })()`);
    assert.equal(placedHeadingEnd, true);
    await dispatchKey(send, "Enter", "Enter", 13);
    await send("Input.insertText", { text: "HELLO WORLD" });
    const headingParagraphBeforeBackspace = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const paragraph = Array.from(editor.querySelectorAll("p")).find((block) => block.textContent === "HELLO WORLD");
      return {
        html: editor.innerHTML,
        paragraphFontSize: paragraph ? getComputedStyle(paragraph).fontSize : "",
        paragraphTag: paragraph ? paragraph.tagName : ""
      };
    })()`);
    assert.equal(headingParagraphBeforeBackspace.paragraphTag, "P", JSON.stringify(headingParagraphBeforeBackspace));

    const placedParagraphStart = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const index = node.nodeValue.indexOf("HELLO WORLD");
        if (index >= 0) {
          const range = document.createRange();
          const selection = getSelection();
          range.setStart(node, index);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          editor.focus();
          return true;
        }
      }
      return false;
    })()`);
    assert.equal(placedParagraphStart, true);
    await dispatchKey(send, "Backspace", "Backspace", 8);
    await delay(300);
    const headingBackspaceMerge = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const block = editor.firstElementChild;
      return {
        fontSize: block ? getComputedStyle(block).fontSize : "",
        headingCount: editor.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
        html: editor.innerHTML,
        tag: block ? block.tagName : "",
        text: editor.innerText
      };
    })()`);
    assert.equal(headingBackspaceMerge.tag, "P", JSON.stringify(headingBackspaceMerge));
    assert.equal(headingBackspaceMerge.headingCount, 0, JSON.stringify(headingBackspaceMerge));
    assert.equal(headingBackspaceMerge.text, "ABCHELLO WORLD", JSON.stringify(headingBackspaceMerge));
    state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    assert.match(state.markdownText, /^ABCHELLO WORLD\n?$/);

    await loadMarkdown(send, "text-heading-append-repro.md", "ABC\n\n# HELLO\n");
    await ensureMode(send, "wysiwyg");
    const placedHeadingStart = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const heading = editor.querySelector("h1");
      if (!heading) {
        return false;
      }
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
      const node = walker.nextNode();
      if (!node) {
        return false;
      }
      const range = document.createRange();
      const selection = getSelection();
      range.setStart(node, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
      return true;
    })()`);
    assert.equal(placedHeadingStart, true);
    await dispatchKey(send, "Backspace", "Backspace", 8);
    await delay(300);
    const textHeadingAppendMerge = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const block = editor.firstElementChild;
      return {
        children: Array.from(editor.children).map((child) => ({
          fontSize: getComputedStyle(child).fontSize,
          tag: child.tagName,
          text: child.textContent
        })),
        fontSize: block ? getComputedStyle(block).fontSize : "",
        headingCount: editor.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
        html: editor.innerHTML,
        mergedText: block ? block.textContent : "",
        tag: block ? block.tagName : "",
        text: editor.innerText
      };
    })()`);
    assert.equal(textHeadingAppendMerge.tag, "P", JSON.stringify(textHeadingAppendMerge));
    assert.equal(textHeadingAppendMerge.headingCount, 0, JSON.stringify(textHeadingAppendMerge));
    assert.equal(textHeadingAppendMerge.mergedText, "ABCHELLO", JSON.stringify(textHeadingAppendMerge));
    assert.equal(textHeadingAppendMerge.children.length, 1, JSON.stringify(textHeadingAppendMerge));
    state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    assert.match(state.markdownText, /^ABCHELLO\n?$/);

    await loadMarkdown(send, "inline-heading-fragment-repro.md", "ABC\n");
    await ensureMode(send, "wysiwyg");
    const normalizedNestedHeading = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const paragraph = editor.querySelector("p");
      paragraph.innerHTML = "ABC<h1>HELLO</h1>";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertHTML" }));
      return new Promise((resolve) => setTimeout(() => {
        const block = editor.firstElementChild;
        resolve({
          headingCount: editor.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
          html: editor.innerHTML,
          mergedText: block ? block.textContent : "",
          tag: block ? block.tagName : ""
        });
      }, 300));
    })()`);
    assert.equal(normalizedNestedHeading.tag, "P", JSON.stringify(normalizedNestedHeading));
    assert.equal(normalizedNestedHeading.headingCount, 0, JSON.stringify(normalizedNestedHeading));
    assert.equal(normalizedNestedHeading.mergedText, "ABCHELLO", JSON.stringify(normalizedNestedHeading));
    state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    assert.match(state.markdownText, /^ABCHELLO\n?$/);

    await loadMarkdown(send, "paste-heading-at-text-end.md", "ABC\n");
    await ensureMode(send, "wysiwyg");
    const pastedHeadingAtTextEnd = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const paragraph = editor.querySelector("p");
      const range = document.createRange();
      const selection = getSelection();
      range.selectNodeContents(paragraph);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();

      const data = new DataTransfer();
      data.setData("text/html", "<h1>HELLO</h1>");
      data.setData("text/plain", "HELLO");
      editor.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data
      }));

      return new Promise((resolve) => setTimeout(() => {
        const block = editor.firstElementChild;
        resolve({
          children: Array.from(editor.children).map((child) => ({
            fontSize: getComputedStyle(child).fontSize,
            tag: child.tagName,
            text: child.textContent
          })),
          headingCount: editor.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
          html: editor.innerHTML,
          mergedText: block ? block.textContent : "",
          tag: block ? block.tagName : ""
        });
      }, 300));
    })()`);
    assert.equal(pastedHeadingAtTextEnd.tag, "P", JSON.stringify(pastedHeadingAtTextEnd));
    assert.equal(pastedHeadingAtTextEnd.headingCount, 0, JSON.stringify(pastedHeadingAtTextEnd));
    assert.equal(pastedHeadingAtTextEnd.children.length, 1, JSON.stringify(pastedHeadingAtTextEnd));
    assert.equal(pastedHeadingAtTextEnd.mergedText, "ABCHELLO", JSON.stringify(pastedHeadingAtTextEnd));
    state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    assert.match(state.markdownText, /^ABCHELLO\n?$/);

    const wrapPlan = readPlan(1);
    const reportedLongLine = "REPORTED_LONG_LINE_START " +
      "long segment without intended markdown line break ".repeat(50) +
      "REPORTED_LONG_LINE_END";
    await loadMarkdown(send, wrapPlan.name, `${wrapPlan.text}\n\n${reportedLongLine}\n`);
    await ensureMode(send, "wysiwyg");
    state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    if (!state.softWrapEnabled) {
      await evaluate(send, `document.querySelector("#toggleSoftWrap").click()`);
    }

    let wysiwygWrapCheck = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const style = getComputedStyle(editor);
      return {
        classEnabled: editor.classList.contains("is-soft-wrap"),
        clientWidth: editor.clientWidth,
        overflowX: style.overflowX,
        scrollWidth: editor.scrollWidth,
        whiteSpace: style.whiteSpace
      };
    })()`);
    assert.equal(wysiwygWrapCheck.classEnabled, true);
    assert.match(wysiwygWrapCheck.whiteSpace, /wrap/);

    await evaluate(send, `document.querySelector("#toggleSoftWrap").click()`);
    wysiwygWrapCheck = await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const style = getComputedStyle(editor);
      return {
        classEnabled: editor.classList.contains("is-soft-wrap"),
        clientWidth: editor.clientWidth,
        overflowX: style.overflowX,
        scrollWidth: editor.scrollWidth,
        whiteSpace: style.whiteSpace
      };
    })()`);
    assert.equal(wysiwygWrapCheck.classEnabled, false);
    assert.ok(wysiwygWrapCheck.scrollWidth > wysiwygWrapCheck.clientWidth, JSON.stringify(wysiwygWrapCheck));

    const scrollPlan = readPlan(2);
    await loadMarkdown(send, scrollPlan.name, `${scrollPlan.text}\n\n${Array(220).fill("scroll line").join("\n")}`);
    await ensureMode(send, "markdown");
    await evaluate(send, `document.querySelector("#markdownEditor").scrollTop = document.querySelector("#markdownEditor").scrollHeight`);
    const freshScrollPlan = readPlan(3);
    await loadMarkdown(send, freshScrollPlan.name, `${freshScrollPlan.text}\n\n${Array(220).fill("fresh line").join("\n")}`);
    const scrollTop = await evaluate(send, `document.querySelector("#markdownEditor").scrollTop`);
    assert.equal(scrollTop, 0);

    const listPlan = readPlan(4);
    await loadMarkdown(send, listPlan.name, "- Parent\n  - Child\n- Next\n\n1. Parent\n  1. Child\n2. Next\n");
    await ensureMode(send, "wysiwyg");
    await evaluate(send, `(() => {
      const editor = document.querySelector("#wysiwygEditor");
      const firstLi = editor.querySelector("li");
      firstLi.firstChild.nodeValue = firstLi.firstChild.nodeValue + "!";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "!" }));
    })()`);
    await delay(300);
    state = await evaluate(send, `window.MarkdownEditor.__testApi.getEditorStateForTest()`);
    assert.match(state.markdownText, /\n  - Child/);
    assert.match(state.markdownText, /\n  1\. Child/);

    const escapePlan = readPlan(5);
    const escapedMarkdown = "\\\\ backslash\n\\` backtick\n\\* asterisk\n\\_ underscore\n\\{\\} curly\n\\[\\] square\n\\(\\) parens\n\\# hash\n\\+ plus\n\\- minus\n1\\. dot\n\\! bang\n\\| pipe\n\\> blockquote";
    await loadMarkdown(send, escapePlan.name, escapedMarkdown);
    await ensureMode(send, "wysiwyg");
    const escapeText = await evaluate(send, `document.querySelector("#wysiwygEditor").innerText`);
    assert.match(escapeText, /\\ backslash/);
    assert.match(escapeText, /\* asterisk/);
    assert.match(escapeText, /# hash/);
    assert.match(escapeText, /> blockquote/);

    await evaluate(send, `document.querySelector("#wysiwygEditor").dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 18,
      clientY: 18
    }))`);
    const menuText = await evaluate(send, `(() => {
      const menu = document.querySelector(".ai-context-menu");
      return menu && !menu.hidden ? menu.innerText : "";
    })()`);
    assert.match(menuText, /Cut/);
    assert.match(menuText, /Copy/);
    assert.match(menuText, /Paste/);

    console.log("ok - soft wrap mode switch headless");
  } finally {
    if (connection) {
      connection.ws.close();
    }
    await stopProcess(chrome.process);
    await stopProcess(server);
    try {
      fs.rmSync(chrome.userDataDir, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      // Chrome can leave profile files locked briefly after exit; the temp dir is safe to clean later.
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
