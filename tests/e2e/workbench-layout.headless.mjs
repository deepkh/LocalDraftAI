import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const port = Number(process.env.LOCALDRAFTAI_E2E_PORT || 8770);
const debugPort = Number(process.env.LOCALDRAFTAI_E2E_DEBUG_PORT || 9244);
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "localdraftai-workbench-e2e-"));

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
  const exited = await Promise.race([new Promise((resolve) => child.once("exit", () => resolve(true))), delay(1500).then(() => false)]);
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
    await evaluate(send, `(() => {
      localStorage.removeItem("localdraftai.appearance.theme");
      location.reload();
    })()`);
    await delay(300);
    await waitFor(send, "Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi)");

    const startupTheme = await evaluate(send, `(() => {
      const themeScript = document.querySelector('script[src="js/theme.js"]');
      const stylesheet = document.querySelector('link[href="styles.css"]');
      return {
        appliedBeforeStyles: Boolean(themeScript && stylesheet && (themeScript.compareDocumentPosition(stylesheet) & 4)),
        stored: localStorage.getItem("localdraftai.appearance.theme"),
        theme: document.documentElement.dataset.theme
      };
    })()`);
    assert.deepEqual(startupTheme, { appliedBeforeStyles: true, stored: null, theme: "light" });

    const shell = await evaluate(send, `(() => {
      const ids = ["workbench", "menuBar", "activityBar", "workspaceSidebar", "editorArea", "aiAssistantPanel", "statusBar"];
      const editorArea = document.querySelector("#editorArea");
      const activityButtons = Array.from(document.querySelectorAll("#activityBar button"));
      return {
        regions: ids.map((id) => Boolean(document.getElementById(id))),
        editorOwnsChrome: Boolean(editorArea.querySelector(".tab-strip") && editorArea.querySelector(".toolbar") && editorArea.querySelector("#editorPane")),
        activityButtons: activityButtons.map((button) => ({
          ariaLabel: button.getAttribute("aria-label"),
          hasIcon: Boolean(button.querySelector("svg")),
          title: button.title,
          type: button.type
        })),
        activeActivities: activityButtons.filter((button) => button.classList.contains("is-active")).length,
        statusHeight: document.querySelector("#statusBar").getBoundingClientRect().height
      };
    })()`);

    assert.deepEqual(shell.regions, [true, true, true, true, true, true, true]);
    assert.equal(shell.editorOwnsChrome, true);
    assert.equal(shell.activeActivities, 1);
    assert.equal(shell.statusHeight, 24);
    assert.equal(shell.activityButtons.length, 6);
    shell.activityButtons.forEach((button) => {
      assert.equal(button.type, "button");
      assert.ok(button.title);
      assert.ok(button.ariaLabel);
      assert.equal(button.hasIcon, true);
    });

    const remoteShell = await evaluate(send, `(() => {
      const status = document.querySelector("#remoteStatusItem");
      const manager = document.querySelector("#remoteConnectionsDialog");
      const folder = document.querySelector("#remoteFolderDialog");
      const prompt = document.querySelector("#remotePromptDialog");
      return {
        folderLabel: folder.getAttribute("aria-labelledby"),
        managerLabel: manager.getAttribute("aria-labelledby"),
        managerModal: manager.getAttribute("aria-modal"),
        promptLabel: prompt.getAttribute("aria-labelledby"),
        statusAria: status.getAttribute("aria-label"),
        statusText: status.textContent.trim()
      };
    })()`);
    assert.equal(remoteShell.statusText, ">< Local");
    assert.match(remoteShell.statusAria, /Remote connection: Local mode/);
    assert.deepEqual({
      folderLabel: remoteShell.folderLabel,
      managerLabel: remoteShell.managerLabel,
      managerModal: remoteShell.managerModal,
      promptLabel: remoteShell.promptLabel
    }, {
      folderLabel: "remoteFolderTitle",
      managerLabel: "remoteConnectionsTitle",
      managerModal: "true",
      promptLabel: "remotePromptTitle"
    });

    await evaluate(send, `document.querySelector("#workspaceButton").click()`);
    assert.deepEqual(await evaluate(send, `(() => {
      const button = document.querySelector("#closeAllOpenFiles");
      return {
        command: button.dataset.command,
        label: button.textContent.trim()
      };
    })()`), {
      command: "workspace.closeAllFiles",
      label: "Close All Open Files"
    });
    assert.deepEqual(await evaluate(send, `Array.from(document.querySelectorAll("#workspaceMenu [data-remote-command]"))
      .map((button) => ({ command: button.dataset.remoteCommand, disabled: button.disabled }))`), [
      { command: "remote.connectHost", disabled: true },
      { command: "remote.openFolder", disabled: true },
      { command: "remote.manageConnections", disabled: true },
      { command: "remote.showLog", disabled: true },
      { command: "remote.reconnect", disabled: true },
      { command: "remote.closeConnection", disabled: true }
    ]);
    await evaluate(send, `document.querySelector("#workspaceButton").dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }))`);

    const menuLabels = await evaluate(send, `Array.from(document.querySelectorAll("#menuBar [aria-haspopup='menu']"))
      .sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left)
      .map((button) => button.textContent.trim())`);
    assert.deepEqual(menuLabels, ["File", "Edit", "View", "Workspace", "AI", "Help"]);

    await evaluate(send, `document.querySelector("#fileMenuButton").click()`);
    assert.equal(await evaluate(send, `document.querySelector("#fileMenu").hidden`), false);
    await evaluate(send, `document.querySelector("#viewMenuButton").click()`);
    assert.deepEqual(await evaluate(send, `({ file: document.querySelector("#fileMenu").hidden, view: document.querySelector("#viewMenu").hidden })`), {
      file: true,
      view: false
    });
    await evaluate(send, `document.querySelector("#viewMenuButton").dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }))`);
    assert.equal(await evaluate(send, `document.querySelector("#viewMenu").hidden`), true);

    for (const selector of ["#workspaceButton", "#aiAssistantButton", "#moreButton"]) {
      await evaluate(send, `document.querySelector(${JSON.stringify(selector)}).click()`);
      await evaluate(send, `document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }))`);
    }

    const closeAllResult = await evaluate(send, `(() => {
      window.MarkdownEditor.__testApi.loadMarkdownForTest("First.md", "First tab");
      document.querySelector("#newTabButton").click();
      window.MarkdownEditor.__testApi.loadMarkdownForTest("Second.md", "Second tab");
      if (window.MarkdownEditor.__testApi.getEditorStateForTest().editorMode !== "markdown") {
        document.querySelector("#toggleEditorMode").click();
      }
      const editor = document.querySelector("#markdownEditor");
      editor.value += " edited";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      const originalConfirm = window.confirm;
      let confirmation = "";
      window.confirm = (message) => {
        confirmation = message;
        return true;
      };
      document.querySelector("#workspaceButton").click();
      document.querySelector("#closeAllOpenFiles").click();
      window.confirm = originalConfirm;
      return {
        confirmation,
        editor: window.MarkdownEditor.__testApi.getEditorStateForTest(),
        tabs: window.MarkdownEditor.__testApi.getOpenTabsForTest()
      };
    })()`);
    assert.match(closeAllResult.confirmation, /Close all 2 open tabs/);
    assert.match(closeAllResult.confirmation, /1 tab has unsaved changes/);
    assert.equal(closeAllResult.editor.markdownText, "");
    assert.deepEqual(closeAllResult.tabs.map((tab) => tab.title), ["Untitled.md"]);

    await send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: 900,
      mobile: false,
      width: 1440
    });
    await evaluate(send, `(() => {
      localStorage.setItem("localdraftai.workspaceSidebar.mode", "expanded");
      localStorage.setItem("localdraftai.workspaceSidebar.width", "360");
      location.reload();
    })()`);
    await delay(300);
    await waitFor(send, "Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi)");

    const restored = await evaluate(send, `({
      sidebarWidth: document.querySelector("#workspaceSidebar").getBoundingClientRect().width,
      storedMode: localStorage.getItem("localdraftai.workspaceSidebar.mode"),
      storedWidth: localStorage.getItem("localdraftai.workspaceSidebar.width")
    })`);
    assert.equal(restored.sidebarWidth, 360);
    assert.equal(restored.storedMode, "expanded");
    assert.equal(restored.storedWidth, "360");

    await evaluate(send, `(() => {
      window.MarkdownEditor.__testApi.loadMarkdownForTest("Theme.md", "Theme state must stay unchanged.");
      if (window.MarkdownEditor.__testApi.getEditorStateForTest().editorMode !== "markdown") {
        document.querySelector("#toggleEditorMode").click();
      }
      const editor = document.querySelector("#markdownEditor");
      editor.focus();
      editor.selectionStart = 6;
      editor.selectionEnd = 11;
      document.dispatchEvent(new Event("selectionchange"));
    })()`);
    const beforeThemeToggle = await evaluate(send, `(() => {
      const activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
      return {
        activeTabId: activeTab && activeTab.dataset.sessionId,
        activeTabTitle: activeTab && activeTab.textContent,
        editor: window.MarkdownEditor.__testApi.getEditorStateForTest(),
        sidebarWidth: document.querySelector("#workspaceSidebar").getBoundingClientRect().width,
        workspaceClasses: document.querySelector("#workspace").className
      };
    })()`);

    await evaluate(send, `document.querySelector("#themeToggleButton").click()`);
    const darkTheme = await evaluate(send, `(() => {
      const activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
      const toggle = document.querySelector("#themeToggleButton");
      return {
        activeTabId: activeTab && activeTab.dataset.sessionId,
        activeTabTitle: activeTab && activeTab.textContent,
        ariaLabel: toggle.getAttribute("aria-label"),
        ariaPressed: toggle.getAttribute("aria-pressed"),
        editor: window.MarkdownEditor.__testApi.getEditorStateForTest(),
        moonDisplay: getComputedStyle(toggle.querySelector(".theme-icon-moon")).display,
        sidebarWidth: document.querySelector("#workspaceSidebar").getBoundingClientRect().width,
        stored: localStorage.getItem("localdraftai.appearance.theme"),
        sunDisplay: getComputedStyle(toggle.querySelector(".theme-icon-sun")).display,
        theme: document.documentElement.dataset.theme,
        workspaceClasses: document.querySelector("#workspace").className
      };
    })()`);
    assert.equal(darkTheme.theme, "dark");
    assert.equal(darkTheme.stored, "dark");
    assert.equal(darkTheme.ariaPressed, "true");
    assert.equal(darkTheme.ariaLabel, "Switch to light theme");
    assert.equal(darkTheme.moonDisplay, "none");
    assert.notEqual(darkTheme.sunDisplay, "none");
    assert.deepEqual({
      activeTabId: darkTheme.activeTabId,
      activeTabTitle: darkTheme.activeTabTitle,
      editor: darkTheme.editor,
      sidebarWidth: darkTheme.sidebarWidth,
      workspaceClasses: darkTheme.workspaceClasses
    }, beforeThemeToggle);

    await evaluate(send, `document.querySelector("#viewMenuButton").click()`);
    assert.equal(await evaluate(send, `document.querySelector("#darkThemeMenuItem").getAttribute("aria-checked")`), "true");
    await evaluate(send, `document.querySelector("#viewMenuButton").dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }))`);

    await evaluate(send, `document.querySelector('[data-workbench-view="settings"]').click()`);
    const settingsSurface = await evaluate(send, `getComputedStyle(document.querySelector("#aiSettingsDialog")).backgroundColor`);
    await evaluate(send, `document.querySelector("#aiSettingsCancel").click()`);
    await evaluate(send, `(() => {
      const editor = document.querySelector("#markdownEditor");
      editor.focus();
      editor.selectionStart = 0;
      editor.selectionEnd = editor.value.length;
      document.querySelector("#aiAssistantButton").click();
      document.querySelector("#aiToolbarMenu [data-action-id]").click();
    })()`);
    await waitFor(send, `document.querySelector("#aiAssistantPanel").hidden === false && document.querySelector("#aiAssistantPanelWelcome").hidden === true`);
    const darkSurfaces = await evaluate(send, `({
      editor: getComputedStyle(document.querySelector("#editorArea")).backgroundColor,
      panel: getComputedStyle(document.querySelector("#aiAssistantPanel")).backgroundColor,
      remote: getComputedStyle(document.querySelector("#remoteConnectionsDialog")).backgroundColor,
      review: getComputedStyle(document.querySelector("#aiReviewDialog")).backgroundColor
    })`);
    assert.equal(settingsSurface, darkSurfaces.editor);
    assert.equal(darkSurfaces.panel, darkSurfaces.editor);
    assert.equal(darkSurfaces.review, darkSurfaces.editor);
    assert.equal(darkSurfaces.remote, darkSurfaces.editor);
    assert.notEqual(darkSurfaces.editor, "rgb(255, 255, 255)");
    await evaluate(send, `document.querySelector("#aiAssistantPanelClose").click()`);

    await evaluate(send, `location.reload()`);
    await delay(300);
    await waitFor(send, "Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi)");
    assert.deepEqual(await evaluate(send, `({
      checked: document.querySelector("#darkThemeMenuItem").getAttribute("aria-checked"),
      pressed: document.querySelector("#themeToggleButton").getAttribute("aria-pressed"),
      stored: localStorage.getItem("localdraftai.appearance.theme"),
      theme: document.documentElement.dataset.theme
    })`), { checked: "true", pressed: "true", stored: "dark", theme: "dark" });

    await evaluate(send, `(() => {
      document.querySelector("#viewMenuButton").click();
      document.querySelector("#darkThemeMenuItem").click();
    })()`);
    assert.deepEqual(await evaluate(send, `({
      checked: document.querySelector("#darkThemeMenuItem").getAttribute("aria-checked"),
      stored: localStorage.getItem("localdraftai.appearance.theme"),
      theme: document.documentElement.dataset.theme
    })`), { checked: "false", stored: "light", theme: "light" });

    await evaluate(send, `document.querySelector('[data-workbench-view="search"]').click()`);
    await waitFor(send, `document.activeElement.matches(".workspace-content-search")`);
    let activity = await evaluate(send, `({
      active: document.querySelector("#activityBar .is-active").dataset.workbenchView,
      duplicateViewTabs: document.querySelectorAll("#workspaceSidebar [data-workspace-panel]").length,
      focusedSearch: document.activeElement.matches(".workspace-content-search"),
      hideButtons: document.querySelectorAll("#workspaceSidebar [data-workspace-action='hide']").length,
      panel: localStorage.getItem("localdraftai.workspaceSidebar.panel")
    })`);
    assert.deepEqual(activity, {
      active: "search",
      duplicateViewTabs: 0,
      focusedSearch: true,
      hideButtons: 0,
      panel: "search"
    });
    assert.equal(await evaluate(send, `document.querySelector("#workspaceSidebar .workspace-sidebar-header")`), null);

    await evaluate(send, `document.querySelector('[data-workbench-view="related"]').click()`);
    assert.equal(await evaluate(send, `document.querySelector("#activityBar .is-active").dataset.workbenchView`), "related");

    await evaluate(send, `document.querySelector('[data-workbench-view="files"]').click()`);
    await evaluate(send, `document.querySelector('[data-workbench-view="files"]').click()`);
    assert.equal(await evaluate(send, `localStorage.getItem("localdraftai.workspaceSidebar.mode")`), "hidden");
    await evaluate(send, `document.querySelector('[data-workbench-view="files"]').click()`);
    assert.equal(await evaluate(send, `localStorage.getItem("localdraftai.workspaceSidebar.mode")`), "expanded");

    await evaluate(send, `document.querySelector('[data-workbench-view="ai"]').click()`);
    assert.equal(await evaluate(send, `!document.querySelector("#aiAssistantPanel").hidden && !document.querySelector("#aiAssistantPanelWelcome").hidden`), true);
    await evaluate(send, `document.querySelector("#aiAssistantPanelClose").click()`);
    assert.equal(await evaluate(send, `document.querySelector("#aiAssistantPanel").hidden`), true);

    await evaluate(send, `document.querySelector('[data-workbench-view="settings"]').click()`);
    assert.equal(await evaluate(send, `document.querySelector("#aiSettingsOverlay").hidden`), false);
    await evaluate(send, `document.querySelector("#aiSettingsCancel").click()`);

    await evaluate(send, `(() => {
      window.MarkdownEditor.__testApi.loadMarkdownForTest("Workbench.md", "Hello workbench review");
      if (window.MarkdownEditor.__testApi.getEditorStateForTest().editorMode !== "markdown") {
        document.querySelector("#toggleEditorMode").click();
      }
      const editor = document.querySelector("#markdownEditor");
      editor.focus();
      editor.selectionStart = 0;
      editor.selectionEnd = editor.value.length;
      document.dispatchEvent(new Event("selectionchange"));
    })()`);
    await waitFor(send, `document.querySelector("#wordCount").textContent === "3 words"`);
    const status = await evaluate(send, `({
      ai: document.querySelector("#aiStatusBadge").textContent,
      cursor: document.querySelector("#cursorPosition").textContent,
      mode: document.querySelector("#modeLabel").textContent,
      workspace: document.querySelector("#workspaceStatus").textContent,
      wrap: document.querySelector("#softWrapStatus").textContent
    })`);
    assert.equal(status.mode, "Markdown");
    assert.match(status.cursor, /^Ln 1, Col \d+$/);
    assert.equal(status.workspace, "No Workspace");
    assert.match(status.ai, /Local mock/);

    await evaluate(send, `(() => {
      document.querySelector("#viewMenuButton").click();
      document.querySelector('[data-command="view.toggleSoftWrap"]').click();
    })()`);
    assert.notEqual(await evaluate(send, `document.querySelector("#softWrapStatus").textContent`), status.wrap);

    await evaluate(send, `(() => {
      const editor = document.querySelector("#markdownEditor");
      editor.focus();
      editor.selectionStart = 0;
      editor.selectionEnd = editor.value.length;
      document.querySelector("#aiAssistantButton").click();
      document.querySelector("#aiToolbarMenu [data-action-id]").click();
    })()`);
    await waitFor(send, "document.querySelector('#aiAssistantPanel').hidden === false");

    const wide = await evaluate(send, `({
      editorWidth: document.querySelector("#editorArea").getBoundingClientRect().width,
      panelWidth: document.querySelector("#aiAssistantPanel").getBoundingClientRect().width,
      pageOverflow: document.documentElement.scrollWidth > innerWidth
    })`);
    assert.ok(wide.editorWidth >= 480);
    assert.ok(wide.panelWidth >= 320);
    assert.equal(wide.pageOverflow, false);

    for (const width of [1024, 768, 480]) {
      await send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: 1,
        height: 800,
        mobile: false,
        width
      });
      await delay(100);
      const responsive = await evaluate(send, `({
        editorVisible: document.querySelector("#editorArea").getBoundingClientRect().width > 0,
        menusReachable: Array.from(document.querySelectorAll("#menuBar [aria-haspopup='menu']"))
          .every((button) => button.getBoundingClientRect().left >= 0 && button.getBoundingClientRect().right <= innerWidth),
        menuVisible: document.querySelector("#menuBar").getBoundingClientRect().height > 0,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        remoteDialogFits: (() => {
          const overlay = document.querySelector("#remoteConnectionsOverlay");
          overlay.hidden = false;
          const rect = document.querySelector("#remoteConnectionsDialog").getBoundingClientRect();
          const fits = rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
          overlay.hidden = true;
          return fits;
        })(),
        statusVisible: document.querySelector("#statusBar").getBoundingClientRect().height > 0
      })`);
      assert.equal(responsive.editorVisible, true, `editor should remain visible at ${width}px`);
      assert.equal(responsive.menusReachable, true, `menus should remain reachable at ${width}px`);
      assert.equal(responsive.menuVisible, true, `menu should remain visible at ${width}px`);
      assert.equal(responsive.pageOverflow, false, `page should not overflow at ${width}px`);
      assert.equal(responsive.remoteDialogFits, true, `remote dialog should fit at ${width}px`);
      assert.equal(responsive.statusVisible, true, `status should remain visible at ${width}px`);
    }

    assert.deepEqual(connection.exceptions, []);
  } finally {
    if (connection) connection.ws.close();
    await stopProcess(chrome.process);
    await stopProcess(server);
    try {
      fs.rmSync(chrome.userDataDir, { force: true, maxRetries: 12, recursive: true, retryDelay: 250 });
    } catch (error) {
      // Chrome can keep profile files busy briefly after exit; the OS can clean this temp directory later.
    }
  }
}

main().then(() => {
  console.log("ok - semantic workbench shell and responsive panel layout");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
