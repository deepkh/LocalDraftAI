const assert = require("node:assert/strict");

global.window = {
  AbortController: global.AbortController
};

require("../../src/js/ai-reasoning.js");
require("../../src/js/ai-provider-common.js");
require("../../src/js/ai-provider-registry.js");
require("../../src/js/ai-provider-openai-compatible.js");
require("../../src/js/ai-provider-openai.js");

const openai = window.MarkdownEditor.aiProviders.openai;

async function runTest(name, callback) {
  try {
    await callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

function settings() {
  return {
    apiKey: "key",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.5",
    reasoning: {
      enabled: true,
      effort: "medium",
      showSummary: true,
      tokenBudget: 2048
    }
  };
}

function aiRequest() {
  return {
    messages: [
      { role: "system", content: "Edit Markdown." },
      { role: "user", content: "Selected Markdown:\n\ntext" }
    ],
    systemPrompt: "Edit Markdown.",
    userContent: "Selected Markdown:\n\ntext"
  };
}

(async function () {
  await runTest("sends reasoning effort through chat completions", async function () {
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
                  reasoning_content: "Checked the text."
                }
              }
            ],
            usage: {
              output_tokens: 3
            }
          };
        }
      };
    };

    const result = await openai.runAction(settings(), aiRequest());

    assert.equal(request.url, "https://api.openai.com/v1/chat/completions");
    assert.equal(request.headers.Authorization, "Bearer key");
    assert.equal(request.body.reasoning_effort, "medium");
    assert.equal(result.text, "Fixed text");
    assert.equal(result.reasoningSummary, "Checked the text.");
  });

  await runTest("lists models from the OpenAI-compatible models endpoint", async function () {
    let request;

    window.fetch = async function (url, options) {
      request = {
        headers: options.headers,
        method: options.method,
        url
      };
      return {
        ok: true,
        status: 200,
        json: async function () {
          return {
            data: [
              { id: "gpt-5.5" }
            ]
          };
        }
      };
    };

    const models = await openai.listModels(settings());

    assert.equal(request.method, "GET");
    assert.equal(request.url, "https://api.openai.com/v1/models");
    assert.deepEqual(models, ["gpt-5.5"]);
  });
}());
