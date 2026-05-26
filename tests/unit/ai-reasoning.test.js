const assert = require("node:assert/strict");

global.window = {};

require("../../src/js/ai-reasoning.js");

const reasoning = window.MarkdownEditor.aiReasoning;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("normalizes default reasoning settings", function () {
  assert.deepEqual(reasoning.normalize({}), {
    enabled: true,
    effort: "medium",
    showSummary: false,
    tokenBudget: 2048
  });
});

runTest("turns off reasoning when effort is off", function () {
  assert.deepEqual(reasoning.normalize({
    enabled: true,
    effort: "off",
    showSummary: true,
    tokenBudget: 512
  }), {
    enabled: false,
    effort: "off",
    showSummary: true,
    tokenBudget: 512
  });
});

runTest("maps Ollama reasoning effort", function () {
  assert.equal(reasoning.ollamaThink({ enabled: false }), false);
  assert.equal(reasoning.ollamaThink({ enabled: true, effort: "minimal" }), "low");
  assert.equal(reasoning.ollamaThink({ enabled: true, effort: "medium" }), "medium");
  assert.equal(reasoning.ollamaThink({ enabled: true, effort: "xhigh" }), "high");
});

runTest("builds OpenAI reasoning payloads", function () {
  assert.equal(reasoning.openAiReasoning({ enabled: false }), null);
  assert.deepEqual(reasoning.openAiReasoning({
    enabled: true,
    effort: "high",
    showSummary: true
  }), {
    effort: "high",
    summary: "auto"
  });
});

runTest("maps Claude adaptive thinking", function () {
  assert.deepEqual(reasoning.claudeThinking({
    enabled: true,
    effort: "xhigh"
  }), {
    type: "adaptive",
    effort: "high"
  });
});

runTest("maps Gemini model-specific thinking config", function () {
  assert.deepEqual(reasoning.geminiThinkingConfig("gemini-3-pro", {
    enabled: true,
    effort: "low"
  }), {
    thinking_level: "low"
  });
  assert.deepEqual(reasoning.geminiThinkingConfig("gemini-2.5-pro", {
    enabled: true,
    effort: "high",
    tokenBudget: 4096
  }), {
    thinking_budget: 4096
  });
});
