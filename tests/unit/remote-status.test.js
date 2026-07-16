const assert = require("node:assert/strict");

function item(command) {
  return {
    disabled: false,
    getAttribute(name) {
      return name === "data-remote-command" ? command : "";
    }
  };
}

function element(items) {
  return {
    attributes: {},
    dataset: {},
    hidden: true,
    listeners: {},
    offsetWidth: 240,
    style: {},
    textContent: "",
    title: "",
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    contains() { return false; },
    focus() { this.focused = true; },
    getAttribute(name) { return this.attributes[name]; },
    getBoundingClientRect() { return { left: 10, top: 700 }; },
    querySelectorAll() { return items || []; },
    setAttribute(name, value) { this.attributes[name] = String(value); }
  };
}

global.document = { addEventListener() {} };
global.window = {
  innerHeight: 800,
  innerWidth: 1200,
  addEventListener() {},
  MarkdownEditor: {},
  setTimeout(callback) { callback(); }
};

require("../../src/js/remote-status.js");

const remoteStatus = window.MarkdownEditor.remoteStatus;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("renders local, connecting, connected, disconnected, reconnecting, and error states", function () {
  assert.equal(remoteStatus.describe({ bridgeAvailable: false }).displayLabel, ">< Local");
  assert.equal(remoteStatus.describe({ bridgeAvailable: true, connectionId: "home", label: "home-server", state: "connecting" }).displayLabel, ">< SSH: Connecting…");
  assert.equal(remoteStatus.describe({ bridgeAvailable: true, connectionId: "home", label: "home-server", state: "connected" }).displayLabel, ">< SSH: home-server");
  assert.match(remoteStatus.describe({ bridgeAvailable: true, connectionId: "home", label: "home-server", state: "connected" }).accessibleLabel, /SSH home-server, connected/);
  assert.equal(remoteStatus.describe({ bridgeAvailable: true, connectionId: "home", state: "disconnected" }).displayLabel, ">< SSH: Disconnected");
  assert.equal(remoteStatus.describe({ bridgeAvailable: true, connectionId: "home", state: "reconnecting" }).displayLabel, ">< SSH: Reconnecting…");
  assert.equal(remoteStatus.describe({ protocolError: "Version mismatch" }).displayLabel, ">< SSH: Error");
});

runTest("enables remote commands only for valid bridge and connection states", function () {
  let availability = remoteStatus.commandAvailability({ bridgeAvailable: false });
  assert.equal(availability["remote.connectHost"], false);
  assert.equal(availability["remote.openFolder"], false);

  availability = remoteStatus.commandAvailability({ bridgeAvailable: true, connectionId: "home", state: "connected" });
  assert.equal(availability["remote.openFolder"], true);
  assert.equal(availability["remote.closeConnection"], true);
  assert.equal(availability["remote.reconnect"], false);

  availability = remoteStatus.commandAvailability({ bridgeAvailable: true, connectionId: "home", state: "error" });
  assert.equal(availability["remote.reconnect"], true);
  assert.equal(availability["remote.openFolder"], false);
});

runTest("updates the status element and menu command enablement", function () {
  const commands = [item("remote.connectHost"), item("remote.openFolder"), item("remote.reconnect")];
  const button = element();
  const menu = element(commands);
  const controller = remoteStatus.create({ button, menu });

  controller.setBridgeAvailable(true);
  controller.setConnection({ connectionId: "home", label: "home-server", state: "connected" });

  assert.equal(button.textContent, ">< SSH: home-server");
  assert.equal(button.dataset.state, "connected");
  assert.match(button.attributes["aria-label"], /connected/);
  assert.equal(commands[0].disabled, false);
  assert.equal(commands[1].disabled, false);
  assert.equal(commands[2].disabled, true);
});
