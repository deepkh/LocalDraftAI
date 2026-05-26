const assert = require("node:assert/strict");

global.window = {
  AbortController: global.AbortController
};

require("../../src/js/ai-reasoning.js");
require("../../src/js/ai-provider-common.js");
require("../../src/js/ai-provider-registry.js");
require("../../src/js/ai-provider-anthropic.js");

const anthropic = window.MarkdownEditor.aiProviders.anthropic;

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
  await runTest("uses native Claude thinking instead of reasoning_effort", async function () {
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
            content: [
              { type: "thinking", summary: "Checked wording." },
              { type: "text", text: "Fixed text" }
            ]
          };
        }
      };
    };

    const result = await anthropic.runAction({
      apiKey: "key",
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-sonnet-4-5",
      reasoning: {
        enabled: true,
        effort: "high",
        showSummary: true,
        tokenBudget: 2048
      }
    }, {
      systemPrompt: "Edit Markdown.",
      userContent: "Selected Markdown:\n\ntext"
    });

    assert.equal(request.url, "https://api.anthropic.com/v1/messages");
    assert.equal(request.headers["x-api-key"], "key");
    assert.deepEqual(request.body.thinking, {
      type: "adaptive",
      effort: "high"
    });
    assert.equal(request.body.reasoning_effort, undefined);
    assert.equal(request.body.temperature, undefined);
    assert.equal(result.text, "Fixed text");
    assert.equal(result.reasoningSummary, "Checked wording.");
  });
}());
