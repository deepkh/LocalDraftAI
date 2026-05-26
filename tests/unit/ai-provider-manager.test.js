const assert = require("node:assert/strict");

function createStorage() {
  return {
    values: {},
    getItem(key) {
      return this.values[key] || "";
    },
    removeItem(key) {
      delete this.values[key];
    },
    setItem(key, value) {
      this.values[key] = String(value);
    }
  };
}

global.window = {
  AbortController: global.AbortController,
  localStorage: createStorage()
};

require("../../src/js/ai-actions.js");
require("../../src/js/markdown-repair.js");
require("../../src/js/ai-reasoning.js");
require("../../src/js/ai-provider-common.js");
require("../../src/js/ai-provider-openai-compatible.js");
require("../../src/js/ai-provider-ollama.js");
require("../../src/js/ai-provider-openai.js");
require("../../src/js/ai-provider-anthropic.js");
require("../../src/js/ai-provider-gemini.js");
require("../../src/js/ai-provider-manager.js");

const manager = window.MarkdownEditor.aiProviderManager;

async function runTest(name, callback) {
  try {
    await callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

function resetSettings() {
  window.localStorage.values = {};
  delete window.LocalDraftAIConfig;
}

(async function () {
  await runTest("lists the built-in providers", function () {
    assert.deepEqual(manager.listProviders().map((item) => item.id), [
      "mock",
      "ollama",
      "openai",
      "anthropic",
      "gemini",
      "openai-compatible"
    ]);
  });

  await runTest("migrates existing OpenAI-compatible settings", function () {
    resetSettings();
    window.localStorage.setItem("localDraftAI.ai.endpoint", "http://localhost:11434/v1/chat/completions");
    window.localStorage.setItem("localDraftAI.ai.model", "gemma4:e2b");

    const settings = manager.readSettings();

    assert.equal(settings.provider, "openai-compatible");
    assert.equal(settings.baseUrl, "http://localhost:11434/v1/");
    assert.equal(settings.endpoint, "http://localhost:11434/v1/chat/completions");
    assert.equal(settings.model, "gemma4:e2b");
  });

  await runTest("saves provider and reasoning settings", function () {
    resetSettings();

    manager.saveSettings({
      baseUrl: "http://127.0.0.1:11434",
      model: "gemma4:e2b",
      provider: "ollama",
      reasoning: {
        enabled: true,
        effort: "high",
        showSummary: true,
        tokenBudget: 4096
      }
    });

    assert.equal(window.localStorage.getItem("localDraftAI.ai.provider"), "ollama");
    assert.equal(window.localStorage.getItem("localDraftAI.ai.baseUrl"), "http://127.0.0.1:11434");
    assert.equal(window.localStorage.getItem("localDraftAI.ai.reasoning.mode"), "high");
    assert.equal(window.localStorage.getItem("localDraftAI.ai.reasoning.effort"), "high");
    assert.equal(window.localStorage.getItem("localDraftAI.ai.reasoning.showSummary"), "true");
    assert.equal(manager.readSettings().endpoint, "http://127.0.0.1:11434/api/chat");
  });

  await runTest("uses action reasoning defaults when global reasoning is auto", function () {
    resetSettings();

    const grammar = manager.resolveActionSettings("correctGrammar", {
      baseUrl: "http://127.0.0.1:11434",
      model: "gemma4:e2b",
      provider: "ollama",
      reasoningMode: "auto"
    });
    const summarize = manager.resolveActionSettings("summarize", {
      baseUrl: "http://127.0.0.1:11434",
      model: "gemma4:e2b",
      provider: "ollama",
      reasoningMode: "auto"
    });

    assert.equal(grammar.reasoningMode, "off");
    assert.equal(grammar.reasoning.enabled, false);
    assert.equal(summarize.reasoningMode, "medium");
    assert.equal(summarize.reasoning.enabled, true);
  });

  await runTest("global reasoning mode wins over action defaults", function () {
    resetSettings();

    const settings = manager.resolveActionSettings("correctGrammar", {
      baseUrl: "http://127.0.0.1:11434",
      model: "gemma4:e2b",
      provider: "ollama",
      reasoningMode: "high"
    });

    assert.equal(settings.reasoningMode, "high");
    assert.equal(settings.reasoning.effort, "high");
  });

  await runTest("returns a normalized detailed mock result", async function () {
    resetSettings();

    const result = await manager.runDetailed("correctGrammar", "teh value");

    assert.equal(result.text, "the value");
    assert.equal(result.rawProvider, "mock");
  });
}());
