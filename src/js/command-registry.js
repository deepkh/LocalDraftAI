(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function createRegistry() {
    var handlers = Object.create(null);

    function normalizeCommandId(commandId) {
      return String(commandId || "").trim();
    }

    function registerCommand(commandId, handler) {
      var id = normalizeCommandId(commandId);

      if (!id) {
        throw new Error("A command id is required.");
      }
      if (typeof handler !== "function") {
        throw new Error("Command handler must be a function: " + id);
      }
      if (handlers[id]) {
        throw new Error("Command is already registered: " + id);
      }

      handlers[id] = handler;
      return function () {
        delete handlers[id];
      };
    }

    function hasCommand(commandId) {
      return Boolean(handlers[normalizeCommandId(commandId)]);
    }

    function executeCommand(commandId, context) {
      var id = normalizeCommandId(commandId);

      if (!handlers[id]) {
        throw new Error("Unknown command: " + id);
      }

      return handlers[id](context);
    }

    return {
      executeCommand: executeCommand,
      hasCommand: hasCommand,
      registerCommand: registerCommand
    };
  }

  ME.commandRegistry = createRegistry();
  ME.commandRegistry.create = createRegistry;
}());
