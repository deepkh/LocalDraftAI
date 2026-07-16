const assert = require("node:assert/strict");

global.window = {
  clearTimeout,
  setTimeout,
  location: { protocol: "http:", host: "127.0.0.1:4782" }
};
require("../../src/js/storage-provider-registry.js");
require("../../src/js/bridge-client.js");

const bridgeClient = window.MarkdownEditor.bridgeClient;

class FakeWebSocket {
  static OPEN = 1;
  static CLOSING = 2;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.protocolVersion = 1;
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen();
    });
  }

  send(value) {
    const request = JSON.parse(value);
    queueMicrotask(() => {
      let result = {};
      if (request.method === "bridge.hello") {
        result = { protocolVersion: this.protocolVersion, bridgeVersion: "0.1.0" };
      } else if (request.method === "bridge.getStatus") {
        result = { status: "ready" };
      } else if (request.method === "fail") {
        this.onmessage({ data: JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32020, message: "Disconnected", data: { code: "CONNECTION_LOST", retryable: true } }
        }) });
        return;
      }
      this.onmessage({ data: JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) });
    });
  }

  close() {
    this.readyState = FakeWebSocket.CLOSING;
    if (this.onclose) this.onclose();
  }

  notify(method, params) {
    this.onmessage({ data: JSON.stringify({ jsonrpc: "2.0", method, params }) });
  }
}

(async function () {
  const client = bridgeClient.create({
    WebSocketImpl: FakeWebSocket,
    location: window.location,
    timeoutMs: 500
  });
  const hello = await client.connect();
  assert.equal(hello.protocolVersion, 1);
  assert.equal(client.getState(), "connected");
  assert.equal((await client.request("bridge.getStatus")).status, "ready");

  let notification = null;
  client.on("connection.stateChanged", function (params) { notification = params; });
  FakeWebSocket.instances[0].notify("connection.stateChanged", { state: "disconnected" });
  assert.deepEqual(notification, { state: "disconnected" });

  await assert.rejects(client.request("fail"), function (error) {
    return error.code === "CONNECTION_LOST" && error.retryable === true;
  });
  client.close();

  class MismatchWebSocket extends FakeWebSocket {
    constructor(url) {
      super(url);
      this.protocolVersion = 2;
    }
  }
  const mismatch = bridgeClient.create({ WebSocketImpl: MismatchWebSocket, location: window.location, timeoutMs: 500 });
  await assert.rejects(mismatch.connect(), function (error) {
    return error.code === "BRIDGE_PROTOCOL_MISMATCH";
  });

  const absent = await bridgeClient.detect({
    fetchImpl: async function () { return { ok: false }; },
    location: window.location,
    WebSocketImpl: FakeWebSocket
  });
  assert.equal(absent, null);

  console.log("ok - authenticates bridge RPC state, errors, notifications, and protocol versions");
}()).catch(function (error) {
  console.error("not ok - bridge client");
  throw error;
});
