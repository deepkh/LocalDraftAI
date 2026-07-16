const assert = require("node:assert/strict");

function element() {
  return {
    checked: false,
    dataset: {},
    hidden: false,
    listeners: {},
    textContent: "",
    type: "text",
    value: "",
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    dispatch(type, event) {
      if (this.listeners[type]) this.listeners[type](event || { target: this });
    },
    focus() { this.focused = true; },
    removeAttribute(name) { delete this.dataset[name]; }
  };
}

global.document = {
  addEventListener() {},
  querySelectorAll() { return []; }
};
global.window = {
  MarkdownEditor: {},
  confirm() { return true; },
  setTimeout(callback) { callback(); }
};

require("../../src/js/remote-connection-ui.js");

const remoteConnectionUI = window.MarkdownEditor.remoteConnectionUI;

function runTest(name, callback) {
  return Promise.resolve().then(callback).then(function () {
    console.log("ok - " + name);
  }).catch(function (error) {
    console.error("not ok - " + name);
    throw error;
  });
}

(async function () {
  await runTest("normalizes profile fields without accepting secret fields", function () {
    const fields = {
      allowPassword: Object.assign(element(), { checked: true, type: "checkbox" }),
      defaultRemotePath: Object.assign(element(), { value: "/home/gary/notes" }),
      host: Object.assign(element(), { value: "192.0.2.4" }),
      identityFile: Object.assign(element(), { value: "~/.ssh/id_ed25519" }),
      label: Object.assign(element(), { value: "Home Server" }),
      port: Object.assign(element(), { value: "2222" }),
      useAgent: Object.assign(element(), { checked: true, type: "checkbox" }),
      user: Object.assign(element(), { value: "gary" })
    };
    const profile = remoteConnectionUI.profileFromFields(fields, "home-server");

    assert.equal(profile.port, 2222);
    assert.deepEqual(profile.auth, {
      allowPassword: true,
      identityFile: "~/.ssh/id_ed25519",
      useAgent: true
    });
    assert.equal(Object.prototype.hasOwnProperty.call(profile.auth, "password"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(profile.auth, "passphrase"), false);
  });

  await runTest("calculates POSIX parent paths", function () {
    assert.equal(remoteConnectionUI.parentRemotePath("/home/gary/notes/"), "/home/gary");
    assert.equal(remoteConnectionUI.parentRemotePath("/home"), "/");
    assert.equal(remoteConnectionUI.parentRemotePath("/"), "/");
  });

  await runTest("clears session-only secrets before the prompt request settles", async function () {
    const callbacks = {};
    const requests = [];
    const secretInput = Object.assign(element(), { value: "temporary-secret" });
    const promptConfirm = element();
    const promptCancel = element();
    const promptOverlay = Object.assign(element(), { hidden: true });
    const statusController = {
      getCommandAvailability() { return {}; },
      setBridgeAvailable() {},
      setConnection() {}
    };
    const bridge = {
      on(method, callback) {
        callbacks[method] = callback;
        return function () {};
      },
      request(method, params) {
        requests.push({ method, params: Object.assign({}, params) });
        return Promise.resolve({ accepted: true });
      }
    };
    const ui = remoteConnectionUI.create({
      promptCancel,
      promptConfirm,
      promptFingerprint: element(),
      promptMessage: element(),
      promptOverlay,
      promptTitle: element(),
      secretField: element(),
      secretInput,
      statusController
    });

    ui.bindEvents();
    ui.setBridgeClient(bridge);
    callbacks["connection.secretPrompt"]({
      promptId: "prompt-1",
      type: "password",
      message: "Password"
    });
    secretInput.value = "temporary-secret";
    promptConfirm.dispatch("click");

    assert.equal(secretInput.value, "");
    assert.equal(promptOverlay.hidden, true);
    assert.equal(requests[0].method, "connection.respondToPrompt");
    assert.equal(requests[0].params.secret, "temporary-secret");

    callbacks["connection.hostKeyPrompt"]({
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:test-fingerprint",
      host: "home-server",
      promptId: "prompt-2"
    });
    assert.equal(promptOverlay.hidden, false);
    assert.equal(secretInput.value, "");
    callbacks["connection.error"]({ connectionId: "home", message: "Authentication failed" });
    assert.equal(ui.getConnection().state, "error");
  });

  await runTest("reports bridge-unavailable recovery without opening a dialog", async function () {
    let message = "";
    const ui = remoteConnectionUI.create({
      onMessage(value) { message = value; },
      statusController: {
        getCommandAvailability() { return {}; },
        setBridgeAvailable() {},
        setConnection() {}
      }
    });

    assert.equal(await ui.openManager(), false);
    assert.match(message, /LocalDraft Bridge/);
  });

  await runTest("announces connection state changes for workspace recovery", async function () {
    const callbacks = {};
    const states = [];
    const ui = remoteConnectionUI.create({
      onConnectionStateChange(connection) { states.push(connection.state); },
      statusController: {
        getCommandAvailability() { return {}; },
        setBridgeAvailable() {},
        setConnection() {}
      }
    });
    ui.setBridgeClient({
      on(method, callback) {
        callbacks[method] = callback;
        return function () {};
      }
    });

    callbacks["connection.stateChanged"]({ connectionId: "home", state: "disconnected" });
    callbacks["connection.stateChanged"]({ connectionId: "home", state: "reconnecting" });
    callbacks["connection.stateChanged"]({ connectionId: "home", state: "connected" });

    assert.deepEqual(states, ["disconnected", "reconnecting", "connected"]);
  });
}()).catch(function (error) {
  process.exitCode = 1;
  throw error;
});
