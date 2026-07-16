import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFetch(url, timeoutMs = 15000) {
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

async function waitForFile(filePath, timeoutMs = 10000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const value = fs.readFileSync(filePath, "utf8").trim();
      if (value.startsWith("http://")) return value;
    } catch (error) {
      // The bridge has not invoked the test browser opener yet.
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for the bridge startup URL.");
}

async function firstJsonLine(child, timeoutMs = 10000) {
  const lines = readline.createInterface({ input: child.stdout });
  const timeout = delay(timeoutMs).then(() => { throw new Error("Timed out starting the SSH test server."); });
  const line = await Promise.race([
    new Promise((resolve, reject) => {
      lines.once("line", resolve);
      child.once("exit", (code) => reject(new Error(`SSH test server exited with ${code}`)));
    }),
    timeout
  ]);
  lines.close();
  return JSON.parse(line);
}

function buildGoBinary(bridgeRoot, output, packagePath) {
  const result = spawnSync("go", ["build", "-o", output, packagePath], {
    cwd: bridgeRoot,
    encoding: "utf8",
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`Go build failed for ${packagePath}: ${result.stderr || result.stdout}`);
  }
}

function startChrome(userDataDir, pageUrl, debugPort) {
  return spawn("google-chrome", [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--window-size=1440,900",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    pageUrl
  ], { stdio: "ignore" });
}

async function connectToPage(debugPort) {
  const response = await waitForFetch(`http://127.0.0.1:${debugPort}/json`);
  const page = (await response.json()).find((tab) => tab.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  const exceptions = [];
  let id = 0;

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(
        message.params.exceptionDetails.exception && message.params.exceptionDetails.exception.description ||
        message.params.exceptionDetails.text ||
        "Uncaught page exception"
      );
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

async function waitFor(send, expression, timeoutMs = 15000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (await evaluate(send, expression)) return;
    await delay(100);
  }
  const diagnostic = await evaluate(send, `({
    href: location.href,
    readyState: document.readyState,
    title: document.title,
    body: document.body && document.body.innerText.slice(0, 320),
    testApi: Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi),
    bridge: Boolean(window.MarkdownEditor && window.MarkdownEditor.activeBridgeClient)
  })`);
  throw new Error(`Timed out waiting for: ${expression}\n${JSON.stringify(diagnostic)}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    delay(2000).then(() => false)
  ]);
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(2000)]);
  }
}

function writeFixtureFiles(remoteRoot, files) {
  Object.entries(files || {}).forEach(([relativePath, contents]) => {
    const filePath = path.join(remoteRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  });
}

export async function startRemoteWorkspaceFixture(options = {}) {
  const repoRoot = process.cwd();
  const bridgeRoot = path.join(repoRoot, "bridge");
  const bridgePort = Number(options.bridgePort || 8782);
  const debugPort = Number(options.debugPort || 9252);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), options.prefix || "localdraftai-remote-recovery-e2e-"));
  const remoteRoot = path.join(tempRoot, "remote");
  const configDir = path.join(tempRoot, "config");
  const binDir = path.join(tempRoot, "bin");
  const openUrlFile = path.join(tempRoot, "startup-url");
  const userDataDir = path.join(tempRoot, "chrome");
  const sshBinary = path.join(tempRoot, "testssh");
  const bridgeBinary = path.join(tempRoot, "localdraft-bridge");
  let sshProcess;
  let bridgeProcess;
  let chromeProcess;
  let connection;

  fs.mkdirSync(remoteRoot, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  writeFixtureFiles(remoteRoot, options.files || { "README.md": "# Remote Notes\n" });
  fs.writeFileSync(path.join(binDir, "xdg-open"), "#!/bin/sh\numask 077\nprintf '%s' \"$1\" > \"$LOCALDRAFTAI_OPEN_URL_FILE\"\n", { mode: 0o700 });

  async function cleanup() {
    if (connection) connection.ws.close();
    await stopProcess(chromeProcess);
    await stopProcess(bridgeProcess);
    await stopProcess(sshProcess);
    try {
      fs.rmSync(tempRoot, { force: true, maxRetries: 12, recursive: true, retryDelay: 250 });
    } catch (error) {
      // Chrome may release its profile asynchronously.
    }
  }

  try {
    buildGoBinary(bridgeRoot, sshBinary, "./internal/testssh/cmd");
    buildGoBinary(bridgeRoot, bridgeBinary, "./cmd/localdraft-bridge");
    sshProcess = spawn(sshBinary, ["--root", remoteRoot, "--config-dir", configDir], {
      stdio: ["ignore", "pipe", "inherit"]
    });
    const sshInfo = await firstJsonLine(sshProcess);
    bridgeProcess = spawn(bridgeBinary, [
      "serve",
      "--listen", `127.0.0.1:${bridgePort}`,
      "--web-root", repoRoot,
      "--config-dir", configDir
    ], {
      env: {
        ...process.env,
        LOCALDRAFTAI_OPEN_URL_FILE: openUrlFile,
        PATH: `${binDir}:${process.env.PATH || ""}`
      },
      stdio: "ignore"
    });
    await waitForFetch(`http://127.0.0.1:${bridgePort}/api/health`);
    const startupUrl = await waitForFile(openUrlFile);
    fs.rmSync(openUrlFile, { force: true });
    fs.mkdirSync(userDataDir, { recursive: true });
    chromeProcess = startChrome(userDataDir, startupUrl, debugPort);
    connection = await connectToPage(debugPort);
    const { send } = connection;

    await waitFor(send, "Boolean(window.MarkdownEditor && window.MarkdownEditor.activeBridgeClient)");
    await evaluate(send, "location.replace('/src/local_draft_ai.html?e2e')");
    await delay(250);
    await waitFor(send, "Boolean(window.MarkdownEditor && window.MarkdownEditor.__testApi && window.MarkdownEditor.activeBridgeClient)");
    await evaluate(send, `(() => {
      window.__localPickerCalls = 0;
      window.showOpenFilePicker = () => { window.__localPickerCalls += 1; throw new Error("Local picker opened"); };
      window.showSaveFilePicker = () => { window.__localPickerCalls += 1; throw new Error("Local picker opened"); };
      window.showDirectoryPicker = () => { window.__localPickerCalls += 1; throw new Error("Local picker opened"); };
    })()`);
    await evaluate(send, `document.querySelector("#workspaceButton").click(); document.querySelector("#connectRemoteHost").click()`);
    await waitFor(send, `document.querySelector("#remoteConnectionsOverlay").hidden === false && document.querySelector("[data-connection-id='${sshInfo.connectionId}']")`);
    await evaluate(send, `document.querySelector("[data-connection-id='${sshInfo.connectionId}']").click(); document.querySelector("#remoteConnectionConnect").click()`);
    await waitFor(send, `document.querySelector("#remotePromptOverlay").hidden === false`);
    await evaluate(send, `document.querySelector("#remotePromptConfirm").click()`);
    await waitFor(send, `document.querySelector("#remoteStatusItem").dataset.state === "connected"`);
    await evaluate(send, `document.querySelector("#workspaceButton").click(); document.querySelector("#openRemoteFolder").click()`);
    await waitFor(send, `document.querySelector("#remoteFolderOverlay").hidden === false`);
    await evaluate(send, `document.querySelector("#remoteFolderOpen").click()`);
    await waitFor(send, `document.querySelector("#remoteFolderOverlay").hidden && document.querySelector("[data-workspace-path='README.md']")`);

    return {
      cleanup,
      connection,
      delay,
      evaluate(expression) { return evaluate(send, expression); },
      remoteRoot,
      sshInfo,
      waitFor(expression, timeoutMs) { return waitFor(send, expression, timeoutMs); }
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
