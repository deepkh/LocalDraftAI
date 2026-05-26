(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var compatibleProvider = ME.aiProviders && ME.aiProviders["openai-compatible"];

  function requireManager() {
    if (!ME.aiProviderManager) {
      throw new Error("AI provider manager is not loaded.");
    }

    return ME.aiProviderManager;
  }

  function createProvider() {
    return requireManager().create();
  }

  ME.aiProvider = {
    actionTimeoutMs: function () {
      return requireManager().actionTimeoutMs();
    },
    chatCompletionsEndpoint: function (value) {
      return compatibleProvider && compatibleProvider.endpointForSettings
        ? compatibleProvider.endpointForSettings({ baseUrl: value, endpoint: value })
        : value;
    },
    clearSettings: function () {
      return requireManager().clearSettings();
    },
    create: createProvider,
    defaultBaseUrl: function (providerId) {
      return requireManager().defaultBaseUrl(providerId);
    },
    defaultServerUrl: function () {
      return requireManager().defaultBaseUrl("openai-compatible");
    },
    getProvider: function (providerId) {
      return requireManager().getProvider(providerId);
    },
    listModels: function (settings) {
      return requireManager().listModels(settings);
    },
    listProviders: function () {
      return requireManager().listProviders();
    },
    modelsEndpoint: function (value) {
      return compatibleProvider && compatibleProvider.modelsEndpoint
        ? compatibleProvider.modelsEndpoint({ baseUrl: value, endpoint: value })
        : value;
    },
    readSettings: function (settings) {
      return requireManager().readSettings(settings);
    },
    run: function (actionId, selectedText) {
      return requireManager().run(actionId, selectedText);
    },
    runDetailed: function (actionId, selectedText, settings) {
      return requireManager().runDetailed(actionId, selectedText, settings);
    },
    saveSettings: function (settings) {
      return requireManager().saveSettings(settings);
    },
    serverBaseUrl: function (value) {
      return compatibleProvider && compatibleProvider.baseUrlFromInput
        ? compatibleProvider.baseUrlFromInput(value)
        : value;
    },
    testConnection: function (settings) {
      return requireManager().testConnection(settings);
    }
  };
}());
