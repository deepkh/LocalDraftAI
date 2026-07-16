(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function config() {
    if (!ME.aiActionConfig) {
      throw new Error("AI Actions config is unavailable.");
    }
    return ME.aiActionConfig;
  }

  function isActionAllowedForDocument(action, documentType) {
    if (!action) {
      return false;
    }
    if (documentType === "json" || documentType === "yaml") {
      return false;
    }
    if (documentType === "text") {
      return action.category !== "Markdown" && [
        "beautifyMarkdown",
        "fixMarkdownSyntax"
      ].indexOf(action.id) === -1;
    }
    return true;
  }

  function groupsForDocument(documentType) {
    return config().groups().map(function (group) {
      return Object.assign({}, group, {
        actions: group.actions.filter(function (action) {
          return isActionAllowedForDocument(action, documentType || "markdown");
        })
      });
    }).filter(function (group) {
      return group.actions.length;
    });
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
    groupsForDocument: groupsForDocument,
    groups: function () {
      return config().groups();
    },
    isActionAllowedForDocument: isActionAllowedForDocument
  };
}());
