const assert = require("node:assert/strict");

global.window = {};

require("../../src/js/command-registry.js");

const createRegistry = window.MarkdownEditor.commandRegistry.create;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("registers and executes commands with context", function () {
  const registry = createRegistry();
  const context = { source: "unit-test" };

  registry.registerCommand("file.save", function (received) {
    assert.equal(received, context);
    return "saved";
  });

  assert.equal(registry.hasCommand("file.save"), true);
  assert.equal(registry.executeCommand("file.save", context), "saved");
});

runTest("rejects duplicate command ids", function () {
  const registry = createRegistry();

  registry.registerCommand("view.toggle", function () {});
  assert.throws(function () {
    registry.registerCommand("view.toggle", function () {});
  }, /already registered/);
});

runTest("rejects unknown commands", function () {
  const registry = createRegistry();

  assert.equal(registry.hasCommand("missing.command"), false);
  assert.throws(function () {
    registry.executeCommand("missing.command");
  }, /Unknown command/);
});

runTest("returned disposer unregisters a command", function () {
  const registry = createRegistry();
  const dispose = registry.registerCommand("help.about", function () {});

  dispose();
  assert.equal(registry.hasCommand("help.about"), false);
});
