const assert = require("node:assert/strict");

global.window = {};

require("../../src/js/ai-provider-registry.js");

const registry = window.MarkdownEditor.aiProviderRegistry;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("lists all requested providers", function () {
  assert.deepEqual(registry.listProviders().map((provider) => provider.id), [
    "mock",
    "ollama",
    "openai",
    "gemini",
    "groq",
    "openrouter",
    "mistral",
    "claude",
    "grok",
    "openai-compatible"
  ]);
});

runTest("separates local cloud and advanced groups", function () {
  const groups = registry.listProviders().reduce((result, provider) => {
    result[provider.group] = result[provider.group] || [];
    result[provider.group].push(provider.id);
    return result;
  }, {});

  assert.deepEqual(groups.local, ["mock", "ollama"]);
  assert.deepEqual(groups.cloud, ["openai", "gemini", "groq", "openrouter", "mistral", "claude", "grok"]);
  assert.deepEqual(groups.advanced, ["openai-compatible"]);
});

runTest("returns defaults for each cloud provider", function () {
  assert.equal(registry.getProvider("openai").defaultBaseUrl, "https://api.openai.com/v1");
  assert.equal(registry.getProvider("gemini").defaultModel, "gemini-2.5-flash");
  assert.equal(registry.getProvider("groq").defaultBaseUrl, "https://api.groq.com/openai/v1");
  assert.equal(registry.getProvider("openrouter").extraHeaders["X-Title"], "LocalDraft AI");
  assert.equal(registry.getProvider("mistral").defaultModel, "mistral-small-latest");
  assert.equal(registry.getProvider("claude").transport, "anthropic-messages");
  assert.equal(registry.getProvider("grok").defaultBaseUrl, "https://api.x.ai/v1");
});

runTest("keeps anthropic as a claude alias", function () {
  assert.equal(registry.normalizeId("anthropic"), "claude");
  assert.equal(registry.getProvider("anthropic").id, "claude");
});
