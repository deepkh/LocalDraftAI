const assert = require("node:assert/strict");

global.window = {
  AbortController: global.AbortController
};

require("../../src/js/ai-reasoning.js");
require("../../src/js/ai-provider-common.js");
require("../../src/js/ai-provider-registry.js");
require("../../src/js/ai-provider-ollama.js");

const ollama = window.MarkdownEditor.aiProviders.ollama;

async function runTest(name, callback) {
  try {
    await callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

function settings(reasoning) {
  return {
    apiKey: "",
    baseUrl: "http://127.0.0.1:11434",
    model: "gemma4:e2b",
    reasoning: Object.assign({
      enabled: true,
      effort: "medium",
      showSummary: false,
      tokenBudget: 2048
    }, reasoning || {})
  };
}

function aiRequest() {
  return {
    messages: [
      { role: "system", content: "Edit Markdown." },
      { role: "user", content: "Selected Markdown:\n\ntext" }
    ]
  };
}

(async function () {
  await runTest("sends think false when reasoning is off", async function () {
    let request;

    window.fetch = async function (url, options) {
      request = {
        body: JSON.parse(options.body),
        url
      };
      return {
        ok: true,
        status: 200,
        json: async function () {
          return {
            message: {
              content: "Fixed text",
              thinking: "Reasoned"
            }
          };
        }
      };
    };

    const result = await ollama.runAction(settings({ enabled: false, showSummary: true }), aiRequest());

    assert.equal(request.url, "http://127.0.0.1:11434/api/chat");
    assert.equal(request.body.think, false);
    assert.equal(result.text, "Fixed text");
    assert.equal(result.reasoningSummary, "Reasoned");
  });

  await runTest("sends medium think effort when reasoning is medium", async function () {
    let request;

    window.fetch = async function (url, options) {
      request = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async function () {
          return {
            message: {
              content: "Fixed text"
            }
          };
        }
      };
    };

    await ollama.runAction(settings({ effort: "medium" }), aiRequest());

    assert.equal(request.think, "medium");
    assert.equal(request.options.temperature, 0.2);
  });

  await runTest("lists models from Ollama tags", async function () {
    let requestUrl;

    window.fetch = async function (url) {
      requestUrl = url;
      return {
        ok: true,
        status: 200,
        json: async function () {
          return {
            models: [
              { name: "gemma4:e2b" },
              { model: "llama3.2" }
            ]
          };
        }
      };
    };

    assert.deepEqual(await ollama.listModels(settings()), ["gemma4:e2b", "llama3.2"]);
    assert.equal(requestUrl, "http://127.0.0.1:11434/api/tags");
  });
}());
