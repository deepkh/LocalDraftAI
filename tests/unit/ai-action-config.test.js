const assert = require("node:assert/strict");

function createStorage() {
  return {
    values: {},
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null;
    },
    setItem(key, value) {
      this.values[key] = String(value);
    }
  };
}

global.window = {
  jsyaml: require("../../src/js/vendor/js-yaml.min.js"),
  localStorage: createStorage()
};

require("../../src/js/ai-action-defaults.js");
require("../../src/js/ai-action-config.js");
require("../../src/js/ai-action-config-store.js");
require("../../src/js/ai-actions.js");

const ME = window.MarkdownEditor;
const configApi = ME.aiActionConfig;

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
  await runTest("default YAML parses and validates", function () {
    const parsed = configApi.parseYaml(ME.aiActionDefaults.defaultYaml);

    assert.equal(configApi.validateConfig(parsed), parsed);
    assert.equal(parsed.actions.length, 7);
  });

  await runTest("rejects duplicate action ids", function () {
    assert.throws(function () {
      configApi.validateConfig({
        version: 1,
        actions: [
          { id: "same", label: "One", prompt: "Prompt" },
          { id: "same", label: "Two", prompt: "Prompt" }
        ]
      });
    }, /Duplicate action id/);
  });

  await runTest("reports YAML syntax errors", function () {
    assert.throws(function () {
      configApi.parseYaml("version: 1\nactions: [");
    }, /YAML parse error/);
  });

  await runTest("rejects missing labels and prompts", function () {
    assert.throws(function () {
      configApi.validateConfig({ version: 1, actions: [{ id: "missingLabel", prompt: "Prompt" }] });
    }, /label/);
    assert.throws(function () {
      configApi.validateConfig({ version: 1, actions: [{ id: "missingPrompt", label: "Label" }] });
    }, /prompt/);
  });

  await runTest("rejects invalid action schema values", function () {
    assert.throws(function () {
      configApi.validateConfig({ version: 1, actions: {} });
    }, /actions.*array/);
    assert.throws(function () {
      configApi.validateConfig({
        version: 1,
        actions: [{ id: "badReasoning", label: "Bad", prompt: "Prompt", reasoningDefault: "maximum" }]
      });
    }, /invalid reasoningDefault/);
  });

  await runTest("groups enabled actions in category order", function () {
    configApi.reloadFromYaml([
      "version: 1",
      "actions:",
      "  - id: first",
      "    label: First",
      "    category: Custom",
      "    reasoningDefault: high",
      "    prompt: First prompt",
      "  - id: hidden",
      "    enabled: false",
      "    label: Hidden",
      "    category: Custom",
      "    prompt: Hidden prompt",
      "  - id: second",
      "    label: Second",
      "    category: Markdown",
      "    prompt: Second prompt"
    ].join("\n"));

    assert.deepEqual(configApi.groups().map((group) => group.label), ["Custom", "Markdown"]);
    assert.deepEqual(configApi.groups().flatMap((group) => group.actions.map((action) => action.id)), ["first", "second"]);
    assert.equal(configApi.defaultReasoningMode("first"), "high");
    assert.equal(ME.aiActions.get("first").label, "First");
  });

  await runTest("renders supported prompt variables", function () {
    const action = { prompt: "Translate {{selection}} for {{documentTitle}}." };
    assert.equal(configApi.renderPrompt(action, { selection: "Hello", documentTitle: "Notes" }), "Translate Hello for Notes.");
  });

  await runTest("loads the last good YAML when the current config is broken", async function () {
    window.localStorage.setItem("localdraftai.aiActionsYaml", "version: 1\nactions: [");
    window.localStorage.setItem("localdraftai.aiActionsYamlLastGood", ME.aiActionDefaults.defaultYaml);

    await configApi.load();

    assert.equal(configApi.groups().flatMap((group) => group.actions).length, 7);
    assert.match(configApi.warning(), /last good config/);
  });

  await runTest("invalid YAML does not overwrite the stored last good config", async function () {
    const validYaml = ME.aiActionDefaults.defaultYaml;
    const currentKey = "localdraftai.aiActionsYaml";
    const lastGoodKey = "localdraftai.aiActionsYamlLastGood";

    await ME.aiActionConfigStore.saveYaml(validYaml);
    await ME.aiActionConfigStore.saveLastGoodYaml(validYaml);
    await assert.rejects(
      ME.aiActionConfigStore.saveYaml("version: 1\nactions:\n  - id: broken\n    label: Broken\n"),
      /prompt/
    );
    assert.equal(window.localStorage.getItem(currentKey), validYaml);
    assert.equal(window.localStorage.getItem(lastGoodKey), validYaml);
  });

  configApi.reloadFromYaml(ME.aiActionDefaults.defaultYaml);
}());
