(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function config() {
    if (!ME.aiActionConfig) {
      throw new Error("AI Actions config is unavailable.");
    }
    return ME.aiActionConfig;
  }

  ME.aiActions = {
    buildMessages: function (actionId, selectedText, context) {
      return config().buildMessages(actionId, selectedText, context);
    },
    defaultReasoningMode: function (actionId) {
      return config().defaultReasoningMode(actionId);
    },
    get: function (actionId) {
      return config().get(actionId);
    },
    groups: function () {
      return config().groups();
    }
  };
}());
