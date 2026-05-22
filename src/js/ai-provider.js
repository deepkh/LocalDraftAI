(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function localStorageValue(key) {
    try {
      return window.localStorage ? window.localStorage.getItem(key) || "" : "";
    } catch (error) {
      return "";
    }
  }

  function readSettings() {
    var globalConfig = window.MarkdownForgeAIConfig || {};

    return {
      endpoint: globalConfig.endpoint || localStorageValue("markdownForge.ai.endpoint"),
      apiKey: globalConfig.apiKey || localStorageValue("markdownForge.ai.apiKey"),
      model: globalConfig.model || localStorageValue("markdownForge.ai.model") || "local-model"
    };
  }

  function cleanProviderResult(value) {
    var text = String(value || "").trim();
    var fence = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);

    return fence ? fence[1].trim() : text;
  }

  async function callOpenAiCompatible(settings, actionId, selectedText) {
    var headers = {
      "Content-Type": "application/json"
    };
    var response;
    var payload;
    var data;
    var content;

    if (typeof window.fetch !== "function") {
      throw new Error("Fetch is not available in this browser.");
    }

    if (settings.apiKey) {
      headers.Authorization = "Bearer " + settings.apiKey;
    }

    payload = {
      model: settings.model,
      messages: ME.aiActions.buildMessages(actionId, selectedText),
      temperature: 0.2
    };

    response = await window.fetch(settings.endpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("Provider returned HTTP " + response.status + ".");
    }

    data = await response.json();
    content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : data && data.output_text;

    if (!content) {
      throw new Error("Provider response did not include Markdown content.");
    }

    return cleanProviderResult(content);
  }

  function runMockAction(actionId, selectedText) {
    return Promise.resolve(ME.markdownRepair.runAction(actionId, selectedText));
  }

  function createProvider() {
    async function run(actionId, selectedText) {
      var settings = readSettings();

      if (!ME.aiActions.get(actionId)) {
        throw new Error("Unknown AI action.");
      }

      if (settings.endpoint) {
        return callOpenAiCompatible(settings, actionId, selectedText);
      }

      return runMockAction(actionId, selectedText);
    }

    return {
      run: run
    };
  }

  ME.aiProvider = {
    create: createProvider,
    readSettings: readSettings
  };
}());
