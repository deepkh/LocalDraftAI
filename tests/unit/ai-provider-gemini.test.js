const assert = require("node:assert/strict");

global.window = {
  AbortController: global.AbortController
};

require("../../src/js/ai-reasoning.js");
require("../../src/js/ai-provider-common.js");
require("../../src/js/ai-provider-registry.js");
require("../../src/js/ai-provider-openai-compatible.js");
require("../../src/js/ai-provider-gemini.js");

const gemini = window.MarkdownEditor.aiProviders.gemini;

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

async function capturePayload(model) {
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

  await gemini.runAction({
    apiKey: "key",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model,
    reasoning: {
      enabled: true,
      effort: "low",
      showSummary: false,
      tokenBudget: 4096
    }
  }, aiRequest());

  return request;
}

(async function () {
  await runTest("maps Gemini reasoning to OpenAI-compatible reasoning_effort", async function () {
    const request = await capturePayload("gemini-2.5-flash");

    assert.equal(request.url, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    assert.equal(request.body.reasoning_effort, "low");
    assert.equal(request.body.extra_body, undefined);
  });

  await runTest("sends Gemini API key as a bearer token for the compatibility endpoint", async function () {
    let request;

    window.fetch = async function (url, options) {
      request = {
        headers: options.headers,
        url
      };
      return {
        ok: true,
        status: 200,
        json: async function () {
          return {
            data: [
              { id: "gemini-2.5-flash" }
            ]
          };
        }
      };
    };

    await gemini.listModels({
      apiKey: "key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-2.5-flash"
    });

    assert.equal(request.headers.Authorization, "Bearer key");
  });
}());
