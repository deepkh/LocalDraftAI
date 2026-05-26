const assert = require("node:assert/strict");

global.window = {
  AbortController: global.AbortController
};

require("../../src/js/ai-reasoning.js");
require("../../src/js/ai-provider-common.js");
require("../../src/js/ai-provider-registry.js");
require("../../src/js/ai-provider-openai-compatible.js");

const providers = window.MarkdownEditor.aiProviders;

async function runTest(name, callback) {
  try {
    await callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

function aiRequest() {
  return {
    messages: [
      { role: "system", content: "Edit Markdown." },
      { role: "user", content: "Selected Markdown:\n\ntext" }
    ]
  };
}

function settings(providerId, overrides) {
  const provider = providers[providerId];

  return Object.assign({
    apiKey: "key",
    baseUrl: provider.defaultBaseUrl,
    model: provider.defaultModel,
    provider: providerId,
    reasoning: {
      enabled: true,
      effort: "high",
      showSummary: true,
      tokenBudget: 2048
    }
  }, overrides || {});
}

(async function () {
  await runTest("builds chat completions URLs and parses content", async function () {
    let request;

    window.fetch = async function (url, options) {
      request = {
        body: JSON.parse(options.body),
        headers: options.headers,
        url
      };
      return {
        ok: true,
        status: 200,
        json: async function () {
          return {
            choices: [
              {
                message: {
                  content: "Fixed text",
                  reasoning_content: "Reasoned"
                }
              }
            ]
          };
        }
      };
    };

    const result = await providers.groq.runAction(settings("groq"), aiRequest());

    assert.equal(request.url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(request.headers.Authorization, "Bearer key");
    assert.equal(request.body.reasoning_effort, "high");
    assert.equal(result.text, "Fixed text");
    assert.equal(result.reasoningSummary, "Reasoned");
  });

  await runTest("maps OpenRouter reasoning into reasoning.effort and sends extra headers", async function () {
    let request;

    window.fetch = async function (url, options) {
      request = {
        body: JSON.parse(options.body),
        headers: options.headers,
        url
      };
      return {
        ok: true,
        status: 200,
        json: async function () {
          return {
            choices: [
              {
                message: {
                  content: "Fixed text"
                }
              }
            ]
          };
        }
      };
    };

    await providers.openrouter.runAction(settings("openrouter"), aiRequest());

    assert.equal(request.url, "https://openrouter.ai/api/v1/chat/completions");
    assert.deepEqual(request.body.reasoning, { effort: "high" });
    assert.equal(request.headers["HTTP-Referer"], "https://localdraft.ai/");
    assert.equal(request.headers["X-Title"], "LocalDraft AI");
  });

  await runTest("maps xhigh to high when the provider does not support extra high", async function () {
    let request;

    window.fetch = async function (url, options) {
      request = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async function () {
          return {
            choices: [
              {
                message: {
                  content: "Fixed text"
                }
              }
            ]
          };
        }
      };
    };

    await providers.mistral.runAction(settings("mistral", {
      reasoning: {
        enabled: true,
        effort: "xhigh",
        showSummary: false
      }
    }), aiRequest());

    assert.equal(request.reasoning_effort, "high");
  });

  await runTest("lists models from the models endpoint", async function () {
    let request;

    window.fetch = async function (url, options) {
      request = {
        method: options.method,
        url
      };
      return {
        ok: true,
        status: 200,
        json: async function () {
          return {
            data: [
              { id: "grok-4.3" }
            ]
          };
        }
      };
    };

    assert.deepEqual(await providers.grok.listModels(settings("grok")), ["grok-4.3"]);
    assert.equal(request.method, "GET");
    assert.equal(request.url, "https://api.x.ai/v1/models");
  });
}());
