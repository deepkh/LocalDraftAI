(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var PROTOCOL_VERSION = 1;

  function bridgeError(code, message, options) {
    if (ME.storageProviderErrors) {
      return ME.storageProviderErrors.create(code, message, options);
    }
    var error = new Error(message);
    error.name = "StorageProviderError";
    error.code = code;
    error.retryable = Boolean(options && options.retryable);
    error.details = options && options.details || {};
    return error;
  }

  function defaultWebSocketUrl(locationValue) {
    var protocol = locationValue && locationValue.protocol === "https:" ? "wss:" : "ws:";
    return protocol + "//" + locationValue.host + "/api/bridge";
  }

  function requestId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "request-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function create(options) {
    options = options || {};
    var WebSocketImpl = options.WebSocketImpl || window.WebSocket;
    var locationValue = options.location || window.location;
    var url = options.url || defaultWebSocketUrl(locationValue);
    var timeoutMs = Math.max(100, Number(options.timeoutMs) || 10000);
    var socket = null;
    var pending = {};
    var listeners = {};
    var state = "disconnected";
    var hello = null;

    function emit(method, params) {
      (listeners[method] || []).slice().forEach(function (listener) {
        listener(params);
      });
      (listeners["*"] || []).slice().forEach(function (listener) {
        listener({ method: method, params: params });
      });
    }

    function rejectPending(error) {
      Object.keys(pending).forEach(function (id) {
        window.clearTimeout(pending[id].timer);
        pending[id].reject(error);
        delete pending[id];
      });
    }

    function handleMessage(event) {
      var message;
      var waiting;

      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }
      if (message && message.id != null) {
        waiting = pending[String(message.id)];
        if (!waiting) {
          return;
        }
        window.clearTimeout(waiting.timer);
        delete pending[String(message.id)];
        if (message.error) {
          waiting.reject(bridgeError(
            message.error.data && message.error.data.code || "BRIDGE_UNAVAILABLE",
            message.error.message || "The LocalDraft Bridge request failed.",
            {
              retryable: Boolean(message.error.data && message.error.data.retryable),
              details: message.error.data && message.error.data.details || {}
            }
          ));
          return;
        }
        waiting.resolve(message.result);
        return;
      }
      if (message && message.method) {
        emit(message.method, message.params || {});
      }
    }

    function request(method, params, requestOptions) {
      var id;
      var callTimeout;

      if (!socket || socket.readyState !== WebSocketImpl.OPEN) {
        return Promise.reject(bridgeError("BRIDGE_UNAVAILABLE", "The LocalDraft Bridge is not connected.", {
          retryable: true
        }));
      }
      id = requestId();
      callTimeout = Math.max(100, Number(requestOptions && requestOptions.timeoutMs) || timeoutMs);
      return new Promise(function (resolve, reject) {
        pending[id] = {
          reject: reject,
          resolve: resolve,
          timer: window.setTimeout(function () {
            delete pending[id];
            reject(bridgeError("BRIDGE_UNAVAILABLE", "The LocalDraft Bridge request timed out.", {
              retryable: true
            }));
          }, callTimeout)
        };
        socket.send(JSON.stringify({
          jsonrpc: "2.0",
          id: id,
          method: method,
          params: params || {}
        }));
      });
    }

    async function connect() {
      if (!WebSocketImpl) {
        throw bridgeError("BRIDGE_UNAVAILABLE", "WebSocket support is unavailable.");
      }
      if (state === "connected") {
        return hello;
      }
      state = "connecting";
      emit("bridge.stateChanged", { state: state });
      socket = new WebSocketImpl(url);
      socket.onmessage = handleMessage;
      socket.onclose = function () {
        state = "disconnected";
        emit("bridge.stateChanged", { state: state });
        rejectPending(bridgeError("BRIDGE_UNAVAILABLE", "The LocalDraft Bridge connection closed.", {
          retryable: true
        }));
      };

      await new Promise(function (resolve, reject) {
        var timer = window.setTimeout(function () {
          reject(bridgeError("BRIDGE_UNAVAILABLE", "The LocalDraft Bridge did not respond.", {
            retryable: true
          }));
        }, timeoutMs);
        socket.onopen = function () {
          window.clearTimeout(timer);
          resolve();
        };
        socket.onerror = function () {
          window.clearTimeout(timer);
          reject(bridgeError("BRIDGE_UNAVAILABLE", "The LocalDraft Bridge is unavailable.", {
            retryable: true
          }));
        };
      });

      hello = await request("bridge.hello", {});
      if (!hello || Number(hello.protocolVersion) !== PROTOCOL_VERSION) {
        close();
        throw bridgeError("BRIDGE_PROTOCOL_MISMATCH", "This LocalDraft Bridge version is not compatible with the browser app.", {
          details: {
            expected: PROTOCOL_VERSION,
            received: hello && hello.protocolVersion
          }
        });
      }
      state = "connected";
      emit("bridge.stateChanged", { state: state });
      return hello;
    }

    function close() {
      if (socket && socket.readyState < WebSocketImpl.CLOSING) {
        socket.close(1000, "browser client closed");
      }
      state = "disconnected";
      emit("bridge.stateChanged", { state: state });
    }

    function on(method, listener) {
      listeners[method] = listeners[method] || [];
      listeners[method].push(listener);
      return function () {
        listeners[method] = (listeners[method] || []).filter(function (item) {
          return item !== listener;
        });
      };
    }

    return {
      close: close,
      connect: connect,
      getHello: function () { return hello; },
      getState: function () { return state; },
      on: on,
      request: request,
      url: url
    };
  }

  async function detect(options) {
    options = options || {};
    var locationValue = options.location || window.location;
    var fetchImpl = options.fetchImpl || window.fetch;
    var response;
    var health;
    var client;

    if (!locationValue || (locationValue.protocol !== "http:" && locationValue.protocol !== "https:") || !fetchImpl) {
      return null;
    }
    try {
      response = await fetchImpl("/api/health", {
        cache: "no-store",
        credentials: "same-origin"
      });
      if (!response || !response.ok) {
        return null;
      }
      health = await response.json();
    } catch (error) {
      return null;
    }
    if (Number(health.protocolVersion) !== PROTOCOL_VERSION) {
      throw bridgeError("BRIDGE_PROTOCOL_MISMATCH", "This LocalDraft Bridge version is not compatible with the browser app.", {
        details: { expected: PROTOCOL_VERSION, received: health.protocolVersion }
      });
    }
    client = create(options);
    await client.connect();
    return client;
  }

  ME.bridgeClient = {
    PROTOCOL_VERSION: PROTOCOL_VERSION,
    create: create,
    detect: detect
  };
}());
