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
            model: "gemma4:e2b"
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
            model: "gemma4:e2b"
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
    assert.equal(status.getState().detail, "API key is invalid or missing.");
  });

  await runTest("classifies unreachable servers", function () {
    var classification = aiStatus.classifyError({
      code: "network_error",
      message: "Failed to fetch"
    });

    assert.equal(classification.status, "unreachable");
    assert.match(classification.detail, /Cannot reach AI server/);
  });
}());
