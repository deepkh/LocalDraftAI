const assert = require("node:assert/strict");

function element() {
  return {
    checked: false,
    dataset: {},
    disabled: false,
    hidden: false,
    listeners: {},
    _innerHTML: "",
    textContent: "",
    value: "",
    children: [],
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(value) {
      this._innerHTML = value;
      this.children = [];
    },
    get options() {
      return this.children;
    },
    addEventListener(type, callback) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(callback);
    },
    appendChild(child) {
      this.children.push(child);
    },
    click() {
      this.dispatch("click", {
        preventDefault() {},
        target: this
      });
    },
    dispatch(type, event) {
      (this.listeners[type] || []).forEach((callback) => callback(event || {
        preventDefault() {},
        target: this
      }));
    },
    focus() {
      this.focused = true;
    }
  };
}

global.document = {
  addEventListener() {},
  createElement() {
    return element();
  }
};

global.window = {
  requestAnimationFrame(callback) {
    callback();
  }
};

window.MarkdownEditor = {
  aiStatus: {
    classifyError(error) {
      return {
        detail: error.message,
        label: "Server unreachable",
        status: "unreachable"
      };
    }
  }
};

require("../../src/js/ai-settings.js");

const aiSettings = window.MarkdownEditor.aiSettings;

function createContext(providerOverrides) {
  function defaultServerUrl() {
    return "http://127.0.0.1:11434/v1/";
  }

  function serverBaseUrl(endpoint) {
    return String(endpoint || defaultServerUrl())
      .replace(/\/chat\/completions$/i, "/")
      .replace(/\/models$/i, "/");
  }

  function chatCompletionsEndpoint(endpoint) {
    const value = String(endpoint || defaultServerUrl()).trim();

    if (/\/chat\/completions$/i.test(value)) {
      return value;
    }

    if (/\/models$/i.test(value)) {
      return value.replace(/\/models$/i, "/chat/completions");
    }

    return serverBaseUrl(value).replace(/\/?$/, "/") + "chat/completions";
  }

  const context = {
    apiKeyInput: element(),
    cancelButton: element(),
    closeButton: element(),
    dialog: element(),
    endpointInput: element(),
    form: element(),
    modeMock: element(),
    modeServer: element(),
    modelInput: element(),
    modelListButton: element(),
    modelOptions: element(),
    modelSelect: element(),
    overlay: element(),
    saveButton: element(),
    statusElement: element(),
    testButton: element()
  };

  context.overlay.hidden = true;
  context.provider = Object.assign({
    clearSettings() {
      context.cleared = true;
    },
    chatCompletionsEndpoint,
    defaultServerUrl,
    listModels(settings) {
      context.listed = settings;
      return Promise.resolve(["gemma4:e2b", "gemma4:e4b"]);
    },
    readSettings() {
      return {
        apiKey: "",
        endpoint: "",
        model: "local-model"
      };
    },
    saveSettings(settings) {
      context.saved = settings;
    },
    serverBaseUrl,
    testConnection(settings) {
      context.tested = settings;
      return Promise.resolve({
        endpoint: settings.endpoint,
        model: settings.model
      });
    }
  }, providerOverrides || {});
  context.aiStatus = {
    refresh() {
      context.refreshed = true;
    }
  };
  context.focusAfterClose = function () {
    context.focusedAfterClose = true;
  };

  return context;
}

async function runTest(name, callback) {
  try {
    await callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

(async function () {
  await runTest("opens with mock mode selected when no endpoint is configured", function () {
    const context = createContext();
    const dialog = aiSettings.create(context);

    dialog.bindEvents();
    dialog.open();

    assert.equal(context.overlay.hidden, false);
    assert.equal(context.modeMock.checked, true);
    assert.equal(context.endpointInput.disabled, true);
    assert.equal(context.testButton.disabled, true);
    assert.equal(context.modelListButton.disabled, true);
    assert.equal(context.modelSelect.disabled, true);
    assert.equal(context.endpointInput.value, "http://127.0.0.1:11434/v1/");
    assert.equal(context.statusElement.textContent, "Local mock mode selected.");
  });

  await runTest("saves server settings from the form", function () {
    const context = createContext();
    const dialog = aiSettings.create(context);

    dialog.bindEvents();
    dialog.open();
    context.modeMock.checked = false;
    context.modeServer.checked = true;
    context.endpointInput.value = " http://localhost:11434/v1/ ";
    context.modelInput.value = " gemma4:e2b ";
    context.apiKeyInput.value = "secret";
    context.saveButton.click();

    assert.deepEqual(context.saved, {
      apiKey: "secret",
      endpoint: "http://localhost:11434/v1/chat/completions",
      mode: "server",
      model: "gemma4:e2b"
    });
    assert.equal(context.refreshed, true);
    assert.equal(context.overlay.hidden, true);
  });

  await runTest("tests typed settings before saving", async function () {
    const context = createContext();
    const dialog = aiSettings.create(context);

    dialog.bindEvents();
    dialog.open();
    context.modeMock.checked = false;
    context.modeServer.checked = true;
    context.endpointInput.value = "http://localhost:11434/v1/";
    context.modelInput.value = "gemma4:e2b";
    await dialog.testConnection();

    assert.deepEqual(context.tested, {
      apiKey: "",
      endpoint: "http://localhost:11434/v1/chat/completions",
      mode: "server",
      model: "gemma4:e2b"
    });
    assert.equal(context.statusElement.dataset.status, "success");
  });

  await runTest("loads model suggestions from the server URL", async function () {
    const context = createContext();
    const dialog = aiSettings.create(context);

    dialog.bindEvents();
    dialog.open();
    context.modeMock.checked = false;
    context.modeServer.checked = true;
    context.endpointInput.value = "http://127.0.0.1:11434/v1/";
    await dialog.listModels();

    assert.deepEqual(context.listed, {
      apiKey: "",
      endpoint: "http://127.0.0.1:11434/v1/",
      mode: "server",
      model: ""
    });
    assert.equal(context.modelOptions.children.length, 2);
    assert.equal(context.modelOptions.children[0].value, "gemma4:e2b");
    assert.equal(context.modelSelect.children.length, 3);
    assert.equal(context.modelSelect.children[1].value, "gemma4:e2b");
    assert.equal(context.modelSelect.value, "gemma4:e2b");
    assert.equal(context.modelSelect.disabled, false);
    assert.equal(context.modelInput.value, "gemma4:e2b");
    assert.equal(context.statusElement.dataset.status, "success");
  });

  await runTest("copies a visible model dropdown choice into the model input", async function () {
    const context = createContext();
    const dialog = aiSettings.create(context);

    dialog.bindEvents();
    dialog.open();
    context.modeMock.checked = false;
    context.modeServer.checked = true;
    context.endpointInput.value = "http://127.0.0.1:11434/v1/";
    await dialog.listModels();
    context.modelSelect.value = "gemma4:e4b";
    context.modelSelect.dispatch("change");

    assert.equal(context.modelInput.value, "gemma4:e4b");
  });

  await runTest("requires model before saving server mode", function () {
    const context = createContext();
    const dialog = aiSettings.create(context);

    dialog.bindEvents();
    dialog.open();
    context.modeMock.checked = false;
    context.modeServer.checked = true;
    context.modelInput.value = "";
    context.saveButton.click();

    assert.equal(context.saved, undefined);
    assert.equal(context.statusElement.dataset.status, "error");
    assert.match(context.statusElement.textContent, /Model is required/);
  });
}());
