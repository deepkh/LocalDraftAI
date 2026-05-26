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
  const descriptors = {
    mock: {
      defaultBaseUrl: "",
      defaultModel: "local-model",
      id: "mock",
      label: "Local mock",
      reasoningEffortLabel: "Effort",
      reasoningEfforts: [],
      reasoningEnableLabel: "Enable reasoning mode",
      reasoningLabel: "Reasoning",
      reasoningSummaryLabel: "Show reasoning summary if supported",
      reasoningTokenBudgetLabel: "Advanced token budget",
      supportsModelList: false,
      supportsReasoning: false
    },
    ollama: {
      defaultBaseUrl: "http://127.0.0.1:11434",
      defaultModel: "local-model",
      id: "ollama",
      label: "Ollama local",
      reasoningEffortLabel: "Think level",
      reasoningEfforts: [
        { value: "low", label: "Low think" },
        { value: "medium", label: "Medium think" },
        { value: "high", label: "High think" }
      ],
      reasoningEnableLabel: "Enable Ollama think",
      reasoningLabel: "Ollama think",
      reasoningSummaryLabel: "Show returned thinking if supported",
      supportsModelList: true,
      supportsReasoning: true,
      supportsReasoningSummary: true
    },
    "openai-compatible": {
      defaultBaseUrl: "http://127.0.0.1:11434/v1/",
      defaultModel: "local-model",
      id: "openai-compatible",
      label: "OpenAI-compatible custom",
      reasoningEfforts: [],
      supportsModelList: true,
      supportsReasoning: false
    }
  };

  const context = {
    apiKeyInput: element(),
    cancelButton: element(),
    closeButton: element(),
    dialog: element(),
    endpointInput: element(),
    form: element(),
    modelInput: element(),
    modelListButton: element(),
    modelOptions: element(),
    modelSelect: element(),
    overlay: element(),
    providerHint: element(),
    providerSelect: element(),
    reasoningEffort: element(),
    reasoningEffortLabel: element(),
    reasoningEnabled: element(),
    reasoningEnabledLabel: element(),
    reasoningLegend: element(),
    reasoningSummary: element(),
    reasoningSummaryLabel: element(),
    reasoningTokenBudget: element(),
    reasoningTokenBudgetLabel: element(),
    saveButton: element(),
    statusElement: element(),
    testButton: element()
  };

  context.overlay.hidden = true;
  context.provider = Object.assign({
    clearSettings() {
      context.cleared = true;
    },
    defaultBaseUrl(providerId) {
      return descriptors[providerId] ? descriptors[providerId].defaultBaseUrl : descriptors["openai-compatible"].defaultBaseUrl;
    },
    getProvider(providerId) {
      return descriptors[providerId] || descriptors.mock;
    },
    listModels(settings) {
      context.listed = settings;
      return Promise.resolve(["gemma4:e2b", "gemma4:e4b"]);
    },
    listProviders() {
      return [descriptors.mock, descriptors.ollama, descriptors["openai-compatible"]];
    },
    readSettings() {
      return {
        apiKey: "",
        baseUrl: "",
        endpoint: "",
        model: "local-model",
        provider: "mock",
        providerLabel: "Local mock",
        reasoning: {
          enabled: true,
          effort: "medium",
          mode: "auto",
          showSummary: false,
          tokenBudget: 2048
        },
        reasoningMode: "auto"
      };
    },
    saveSettings(settings) {
      context.saved = settings;
    },
    testConnection(settings) {
      context.tested = settings;
      return Promise.resolve({
        baseUrl: settings.baseUrl,
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
    assert.equal(context.providerSelect.value, "mock");
    assert.equal(context.endpointInput.disabled, true);
    assert.equal(context.testButton.disabled, true);
    assert.equal(context.modelListButton.disabled, true);
    assert.equal(context.modelSelect.disabled, true);
    assert.equal(context.endpointInput.value, "http://127.0.0.1:11434");
    assert.equal(context.statusElement.textContent, "Local mock selected.");
  });

  await runTest("saves provider settings from the form", function () {
    const context = createContext();
    const dialog = aiSettings.create(context);

    dialog.bindEvents();
    dialog.open();
    context.providerSelect.value = "openai-compatible";
    context.endpointInput.value = " http://localhost:11434/v1/ ";
    context.modelInput.value = " gemma4:e2b ";
    context.apiKeyInput.value = "secret";
    context.saveButton.click();

    assert.equal(context.saved.apiKey, "secret");
    assert.equal(context.saved.baseUrl, "http://localhost:11434/v1/");
    assert.equal(context.saved.endpoint, "http://localhost:11434/v1/");
    assert.equal(context.saved.mode, "server");
    assert.equal(context.saved.model, "gemma4:e2b");
    assert.equal(context.saved.provider, "openai-compatible");
    assert.equal(context.saved.reasoning.enabled, false);
    assert.equal(context.saved.reasoning.effort, "off");
    assert.equal(context.saved.reasoningMode, "off");
    assert.equal(context.refreshed, true);
    assert.equal(context.overlay.hidden, true);
  });

  await runTest("tests typed settings before saving", async function () {
    const context = createContext();
    const dialog = aiSettings.create(context);

    dialog.bindEvents();
    dialog.open();
    context.providerSelect.value = "openai-compatible";
    context.endpointInput.value = "http://localhost:11434/v1/";
    context.modelInput.value = "gemma4:e2b";
    await dialog.testConnection();

    assert.equal(context.tested.apiKey, "");
    assert.equal(context.tested.baseUrl, "http://localhost:11434/v1/");
    assert.equal(context.tested.endpoint, "http://localhost:11434/v1/");
    assert.equal(context.tested.mode, "server");
    assert.equal(context.tested.model, "gemma4:e2b");
    assert.equal(context.tested.provider, "openai-compatible");
    assert.equal(context.statusElement.dataset.status, "success");
  });

  await runTest("loads model suggestions from the base URL", async function () {
    const context = createContext();
    const dialog = aiSettings.create(context);

    dialog.bindEvents();
    dialog.open();
    context.providerSelect.value = "openai-compatible";
    context.endpointInput.value = "http://127.0.0.1:11434/v1/";
    await dialog.listModels();

    assert.equal(context.listed.apiKey, "");
    assert.equal(context.listed.baseUrl, "http://127.0.0.1:11434/v1/");
    assert.equal(context.listed.endpoint, "http://127.0.0.1:11434/v1/");
    assert.equal(context.listed.mode, "server");
    assert.equal(context.listed.model, "");
    assert.equal(context.listed.provider, "openai-compatible");
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
    context.providerSelect.value = "openai-compatible";
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
    context.providerSelect.value = "openai-compatible";
    context.modelInput.value = "";
    context.saveButton.click();

    assert.equal(context.saved, undefined);
    assert.equal(context.statusElement.dataset.status, "error");
    assert.match(context.statusElement.textContent, /Model is required/);
  });

  await runTest("disables unsupported reasoning controls by provider", function () {
    const context = createContext();
    const dialog = aiSettings.create(context);

    dialog.bindEvents();
    dialog.open();

    assert.equal(context.reasoningEnabled.disabled, true);

    context.providerSelect.value = "openai-compatible";
    context.providerSelect.dispatch("change");
    assert.equal(context.reasoningEnabled.disabled, true);
    assert.equal(context.reasoningEffort.disabled, true);

    context.providerSelect.value = "ollama";
    context.providerSelect.dispatch("change");
    assert.equal(context.reasoningEnabled.disabled, false);
    assert.equal(context.reasoningEffort.disabled, false);
    assert.deepEqual(context.reasoningEffort.children.map((option) => option.value), ["auto", "off", "low", "medium", "high"]);
    assert.deepEqual(context.reasoningEffort.children.map((option) => option.textContent), ["Auto", "Off", "Low", "Medium", "High"]);
    assert.equal(context.reasoningLegend.textContent, "Ollama think");
    assert.equal(context.reasoningEffortLabel.textContent, "Think level");
  });

  await runTest("saves reasoning auto as the default for supported providers", function () {
    const context = createContext();
    const dialog = aiSettings.create(context);

    dialog.bindEvents();
    dialog.open();
    context.providerSelect.value = "ollama";
    context.providerSelect.dispatch("change");
    context.endpointInput.value = "http://127.0.0.1:11434";
    context.modelInput.value = "gemma4:e2b";
    context.reasoningEffort.value = "auto";
    context.saveButton.click();

    assert.equal(context.saved.reasoningMode, "auto");
    assert.equal(context.saved.reasoning.enabled, true);
    assert.equal(context.saved.reasoning.effort, "medium");
  });

  await runTest("accepts Off Low Medium and High reasoning values", function () {
    ["off", "low", "medium", "high"].forEach(function (mode) {
      const context = createContext();
      const dialog = aiSettings.create(context);

      dialog.bindEvents();
      dialog.open();
      context.providerSelect.value = "ollama";
      context.providerSelect.dispatch("change");
      context.endpointInput.value = "http://127.0.0.1:11434";
      context.modelInput.value = "gemma4:e2b";
      context.reasoningEffort.value = mode;
      context.reasoningEffort.dispatch("change");
      context.saveButton.click();

      assert.equal(context.saved.reasoningMode, mode);
      assert.equal(context.saved.reasoning.enabled, mode !== "off");
      assert.equal(context.saved.reasoning.effort, mode);
    });
  });

  await runTest("invalid reasoning values fall back to Auto when loaded", function () {
    const context = createContext({
      readSettings() {
        return {
          apiKey: "",
          baseUrl: "http://127.0.0.1:11434",
          endpoint: "http://127.0.0.1:11434/api/chat",
          model: "gemma4:e2b",
          provider: "ollama",
          providerLabel: "Ollama local",
          reasoning: {
            enabled: true,
            effort: "invalid",
            showSummary: false,
            tokenBudget: 2048
          },
          reasoningMode: "invalid"
        };
      }
    });
    const dialog = aiSettings.create(context);

    dialog.bindEvents();
    dialog.open();

    assert.equal(context.reasoningEffort.value, "auto");
  });

  await runTest("existing settings without reasoningMode still load reasoning effort", function () {
    const context = createContext({
      readSettings() {
        return {
          apiKey: "",
          baseUrl: "http://127.0.0.1:11434",
          endpoint: "http://127.0.0.1:11434/api/chat",
          model: "gemma4:e2b",
          provider: "ollama",
          providerLabel: "Ollama local",
          reasoning: {
            enabled: true,
            effort: "high",
            showSummary: true,
            tokenBudget: 4096
          }
        };
      }
    });
    const dialog = aiSettings.create(context);

    dialog.bindEvents();
    dialog.open();

    assert.equal(context.reasoningEffort.value, "high");
    assert.equal(context.reasoningSummary.checked, true);
    assert.equal(context.reasoningTokenBudget.value, 4096);
  });
}());
