const assert = require("node:assert/strict");

global.window = {};

require("../../src/js/ai-status.js");

const aiStatus = window.MarkdownEditor.aiStatus;

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
  await runTest("reports mock mode when no endpoint is configured", async function () {
    var seen = [];
    var status = aiStatus.create({
      onStatusChange: function (state) {
        seen.push(state);
      },
      provider: {
        readSettings: function () {
          return {
            endpoint: "",
            model: "local-model"
          };
        }
      }
    });

    assert.equal(status.getState().status, "mock");
    await status.start();
    assert.equal(seen[seen.length - 1].status, "mock");
    assert.equal(seen[seen.length - 1].mode, "mock");
  });

  await runTest("marks a configured provider as connected after a test response", async function () {
    var seen = [];
    var status = aiStatus.create({
      onStatusChange: function (state) {
        seen.push(state.status);
      },
      provider: {
        readSettings: function () {
          return {
            endpoint: "http://localhost:11434/v1/chat/completions",
            model: "gemma4:e2b",
            providerLabel: "OpenAI-compatible custom"
          };
        },
        testConnection: async function () {
          return {
            endpoint: "http://localhost:11434/v1/chat/completions",
            model: "gemma4:e2b"
          };
        }
      }
    });

    await status.start();

    assert.deepEqual(seen, ["checking", "connected"]);
    assert.equal(status.getState().label, "Connected");
  });

  await runTest("classifies authorization failures", async function () {
    var status = aiStatus.create({
      provider: {
        readSettings: function () {
          return {
            endpoint: "http://localhost:11434/v1/chat/completions",
            model: "gemma4:e2b",
            providerLabel: "OpenAI-compatible custom"
          };
        },
        testConnection: async function () {
          var error = new Error("Forbidden");
          error.code = "http_error";
          error.status = 403;
          throw error;
        }
      }
    });

    await status.start();

    assert.equal(status.getState().status, "auth-error");
    assert.equal(status.getState().detail, "Authentication failed. Check the API key for OpenAI-compatible custom.");
  });

  await runTest("classifies unreachable servers", function () {
    var classification = aiStatus.classifyError({
      code: "network_error",
      message: "Failed to fetch"
    }, {
      providerLabel: "OpenAI"
    });

    assert.equal(classification.status, "unreachable");
    assert.equal(classification.detail, "Browser could not reach OpenAI. Try the local proxy mode.");
  });

  await runTest("classifies provider-aware HTTP failures", function () {
    assert.equal(aiStatus.classifyError({
      code: "http_error",
      status: 429
    }, {
      providerLabel: "Groq"
    }).detail, "Rate limit reached for Groq. Try again later or use another model.");

    assert.equal(aiStatus.classifyError({
      code: "http_error",
      status: 503
    }, {
      providerLabel: "Mistral AI"
    }).detail, "Mistral AI server error. Try again later.");
  });
}());
