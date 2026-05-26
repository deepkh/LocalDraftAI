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
require("../../src/js/ai-provider.js");

const providerApi = window.MarkdownEditor.aiProvider;

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
  delete window.fetch;
}

(async function () {
  await runTest("runs local mock action when no endpoint is configured", async function () {
    var provider;
    var result;

    resetSettings();
    provider = providerApi.create();
    result = await provider.run("correctGrammar", "teh value");

    assert.equal(result, "the value");
  });

  await runTest("sends OpenAI-compatible action requests with configured settings", async function () {
    var provider;
    var request;
    var result;

    resetSettings();
    window.localStorage.setItem("localDraftAI.ai.endpoint", "http://localhost:11434/v1/chat/completions");
    window.localStorage.setItem("localDraftAI.ai.model", "gemma4:e2b");
    window.localStorage.setItem("localDraftAI.ai.apiKey", "test-key");
    window.fetch = async function (url, options) {
      request = {
        body: JSON.parse(options.body),
        headers: options.headers,
        url: url
      };

      return {
        ok: true,
        status: 200,
        json: async function () {
          return {
            choices: [
              {
                message: {
                  content: "```markdown\nFixed text\n```"
                }
              }
            ]
          };
        }
      };
    };

    provider = providerApi.create();
    result = await provider.run("improveWording", "text");

    assert.equal(result, "Fixed text");
    assert.equal(request.url, "http://localhost:11434/v1/chat/completions");
    assert.equal(request.headers.Authorization, "Bearer test-key");
    assert.equal(request.body.model, "gemma4:e2b");
    assert.equal(request.body.stream, false);
    assert.match(request.body.messages[0].content, /Improve the wording/);
  });

  await runTest("tests configured provider connections", async function () {
    var provider;
    var request;
    var result;

    resetSettings();
    window.localStorage.setItem("localDraftAI.ai.endpoint", "http://localhost:11434/v1/chat/completions");
    window.localStorage.setItem("localDraftAI.ai.model", "gemma4:e2b");
    window.fetch = async function (url, options) {
      request = {
        body: JSON.parse(options.body),
        url: url
      };

      return {
        ok: true,
        status: 200,
        json: async function () {
          return {
            choices: [
              {
                message: {
                  content: "OK"
                }
              }
            ]
          };
        }
      };
    };

    provider = providerApi.create();
    result = await provider.testConnection();

    assert.equal(result.endpoint, "http://localhost:11434/v1/chat/completions");
    assert.equal(result.model, "gemma4:e2b");
    assert.equal(request.url, "http://localhost:11434/v1/chat/completions");
    assert.equal(request.body.max_tokens, 8);
  });

  await runTest("accepts reasoning-only connection test responses", async function () {
    var provider;
    var result;

    resetSettings();
    window.localStorage.setItem("localDraftAI.ai.endpoint", "http://localhost:11434/v1/chat/completions");
    window.localStorage.setItem("localDraftAI.ai.model", "gemma4:e2b");
    window.fetch = async function () {
      return {
        ok: true,
        status: 200,
        json: async function () {
          return {
            choices: [
              {
                message: {
                  content: "",
                  reasoning: "Thinking about the connection test."
                }
              }
            ]
          };
        }
      };
    };

    provider = providerApi.create();
    result = await provider.testConnection();

    assert.equal(result.endpoint, "http://localhost:11434/v1/chat/completions");
    assert.equal(result.model, "gemma4:e2b");
  });

  await runTest("lists models from a base URL", async function () {
    var provider;
    var request;
    var models;

    resetSettings();
    window.fetch = async function (url, options) {
      request = {
        method: options.method,
        url: url
      };

      return {
        ok: true,
        status: 200,
        json: async function () {
          return {
            object: "list",
            data: [
              { id: "gemma4:e2b" },
              { id: "gemma4:e4b" }
            ]
          };
        }
      };
    };

    provider = providerApi.create();
    models = await provider.listModels({
      endpoint: "http://127.0.0.1:11434/v1/"
    });

    assert.equal(request.url, "http://127.0.0.1:11434/v1/models");
    assert.equal(request.method, "GET");
    assert.deepEqual(models, ["gemma4:e2b", "gemma4:e4b"]);
  });

  await runTest("saves and clears provider settings", function () {
    resetSettings();

    providerApi.saveSettings({
      apiKey: "secret",
      endpoint: " http://localhost:11434/v1/chat/completions ",
      mode: "server",
      model: " gemma4:e2b "
    });

    assert.equal(window.localStorage.getItem("localDraftAI.ai.provider"), "openai-compatible");
    assert.equal(window.localStorage.getItem("localDraftAI.ai.baseUrl"), "http://localhost:11434/v1/");
    assert.equal(window.localStorage.getItem("localDraftAI.ai.endpoint"), "");
    assert.equal(window.localStorage.getItem("localDraftAI.ai.model"), "gemma4:e2b");
    assert.equal(window.localStorage.getItem("localDraftAI.ai.apiKey"), "secret");
    assert.equal(window.MarkdownEditor.aiProvider.readSettings().provider, "openai-compatible");
    assert.equal(window.MarkdownEditor.aiProvider.readSettings().baseUrl, "http://localhost:11434/v1/");

    providerApi.saveSettings({
      endpoint: "http://127.0.0.1:11434/v1/",
      mode: "server",
      model: "gemma4:e2b"
    });

    assert.equal(window.localStorage.getItem("localDraftAI.ai.provider"), "openai-compatible");
    assert.equal(window.localStorage.getItem("localDraftAI.ai.baseUrl"), "http://127.0.0.1:11434/v1/");
    assert.equal(window.localStorage.getItem("localDraftAI.ai.endpoint"), "");

    providerApi.clearSettings();

    assert.equal(window.localStorage.getItem("localDraftAI.ai.provider"), "");
    assert.equal(window.localStorage.getItem("localDraftAI.ai.baseUrl"), "");
    assert.equal(window.localStorage.getItem("localDraftAI.ai.endpoint"), "");
    assert.equal(window.localStorage.getItem("localDraftAI.ai.model"), "");
    assert.equal(window.localStorage.getItem("localDraftAI.ai.apiKey"), "");
  });

  await runTest("exposes the configured AI action timeout", function () {
    var provider = providerApi.create();

    assert.equal(providerApi.actionTimeoutMs(), 600000);
    assert.equal(provider.actionTimeoutMs(), 600000);
  });

  await runTest("exposes HTTP status on provider errors", async function () {
    var provider;

    resetSettings();
    window.localStorage.setItem("localDraftAI.ai.endpoint", "http://localhost:11434/v1/chat/completions");
    window.fetch = async function () {
      return {
        ok: false,
        status: 403,
        text: async function () {
          return "forbidden";
        }
      };
    };

    provider = providerApi.create();

    await assert.rejects(
      function () {
        return provider.testConnection();
      },
      function (error) {
        assert.equal(error.code, "http_error");
        assert.equal(error.status, 403);
        return true;
      }
    );
  });
}());
