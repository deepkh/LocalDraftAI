(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  if (!ME.aiProviders) {
    ME.aiProviders = {};
  }

  if (!ME.aiProviders.gemini && ME.aiOpenAiCompatibleTransport) {
    ME.aiOpenAiCompatibleTransport.registerProvider("gemini");
  }
}());
