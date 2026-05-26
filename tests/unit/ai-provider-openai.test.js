const assert = require("node:assert/strict");

global.window = {
  AbortController: global.AbortController
};

require("../../src/js/ai-reasoning.js");
require("../../src/js/ai-provider-common.js");
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
    model: "gpt-5",
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
  await runTest("sends reasoning effort through the Responses API", async function () {
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
            output: [
              {
                type: "reasoning",
                summary: [
                  { text: "Checked the text." }
                ]
              }
            ],
            output_text: "Fixed text",
            usage: {
              output_tokens: 3
            }
          };
        }
      };
    };

    const result = await openai.runAction(settings(), aiRequest());

    assert.equal(request.url, "https://api.openai.com/v1/responses");
    assert.equal(request.headers.Authorization, "Bearer key");
    assert.deepEqual(request.body.reasoning, {
      effort: "medium",
      summary: "auto"
    });
    assert.equal(result.text, "Fixed text");
    assert.equal(result.reasoningSummary, "Checked the text.");
  });

  await runTest("falls back to chat completions after a responses path error", async function () {
    const urls = [];

    window.fetch = async function (url, options) {
      urls.push(url);
      if (url.endsWith("/responses")) {
        return {
          ok: false,
          status: 404,
          text: async function () {
            return "not found";
          }
        };
      }
      return {
        ok: true,
        status: 200,
        json: async function () {
          return {
            choices: [
              {
                message: {
                  content: "Fallback text"
                }
              }
            ]
          };
        }
      };
    };

    const result = await openai.runAction(settings(), aiRequest());

    assert.deepEqual(urls, [
      "https://api.openai.com/v1/responses",
      "https://api.openai.com/v1/chat/completions"
    ]);
    assert.equal(result.text, "Fallback text");
  });
}());
