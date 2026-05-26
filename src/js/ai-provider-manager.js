(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var common = ME.aiProviderCommon;
  var reasoning = ME.aiReasoning;
  var STORAGE_KEYS = {
    apiKey: "localDraftAI.ai.apiKey",
    baseUrl: "localDraftAI.ai.baseUrl",
    endpoint: "localDraftAI.ai.endpoint",
    model: "localDraftAI.ai.model",
    provider: "localDraftAI.ai.provider",
    reasoningEnabled: "localDraftAI.ai.reasoning.enabled",
    reasoningEffort: "localDraftAI.ai.reasoning.effort",
    reasoningShowSummary: "localDraftAI.ai.reasoning.showSummary",
    reasoningTokenBudget: "localDraftAI.ai.reasoning.tokenBudget"
  };
  var PROVIDER_ORDER = ["mock", "ollama", "openai", "anthropic", "gemini", "openai-compatible"];
  var MOCK_PROVIDER = {
    defaultBaseUrl: "",
    defaultModel: "local-model",
    endpointForSettings: function () {
      return "";
    },
    id: "mock",
    label: "Local mock",
    reasoningEffortLabel: "Effort",
    reasoningEfforts: [],
    reasoningEnableLabel: "Enable reasoning mode",
    reasoningLabel: "Reasoning",
    reasoningSummaryLabel: "Show reasoning summary if supported",
    reasoningTokenBudgetLabel: "Advanced token budget",
    shortLabel: "Mock",
    supportsModelList: false,
    supportsReasoning: false,
    supportsReasoningSummary: false
  };

  function localStorageValue(key) {
    try {
      return window.localStorage ? window.localStorage.getItem(key) || "" : "";
    } catch (error) {
      return "";
    }
  }

  function setLocalStorageValue(key, value) {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (error) {
      return;
    }
  }

  function removeLocalStorageValue(key) {
    try {
      if (window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (error) {
      return;
    }
  }

  function providerMap() {
    return ME.aiProviders || {};
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function normalizeProviderId(value, fallback) {
    var providerId = String(value || fallback || "").trim();

    if (providerId === "server") {
      providerId = "openai-compatible";
    }

    if (!providerId) {
      return "mock";
    }

    if (providerId === "claude") {
      return "anthropic";
    }

    if (providerId === "local-mock") {
      return "mock";
    }

    return getProvider(providerId) ? providerId : "openai-compatible";
  }

  function getProvider(providerId) {
    if (providerId === "mock") {
      return MOCK_PROVIDER;
    }

    return providerMap()[providerId] || null;
  }

  function listProviders() {
    return PROVIDER_ORDER.map(getProvider).filter(Boolean);
  }

  function defaultBaseUrl(providerId) {
    var provider = getProvider(providerId || "openai-compatible");

    return provider && provider.defaultBaseUrl || "";
  }

  function baseUrlForProvider(provider, value) {
    if (!provider || provider.id === "mock") {
      return "";
    }

    if (provider.baseUrlFromInput) {
      return provider.baseUrlFromInput(value || provider.defaultBaseUrl || "");
    }

    return common.normalizeBaseUrl(value, provider.defaultBaseUrl || "");
  }

  function endpointForSettings(settings) {
    var provider = getProvider(settings.provider);

    if (!provider || provider.id === "mock") {
      return "";
    }

    if (provider.endpointForSettings) {
      return provider.endpointForSettings(settings);
    }

    return settings.baseUrl || "";
  }

  function readReasoningSettings(config) {
    var configReasoning = config && config.reasoning || {};

    return reasoning.normalize({
      enabled: configReasoning.enabled !== undefined
        ? configReasoning.enabled
        : localStorageValue(STORAGE_KEYS.reasoningEnabled),
      effort: configReasoning.effort || localStorageValue(STORAGE_KEYS.reasoningEffort),
      showSummary: configReasoning.showSummary !== undefined
        ? configReasoning.showSummary
        : localStorageValue(STORAGE_KEYS.reasoningShowSummary),
      tokenBudget: configReasoning.tokenBudget || localStorageValue(STORAGE_KEYS.reasoningTokenBudget)
    });
  }

  function readSettings(overrides) {
    var globalConfig = window.LocalDraftAIConfig || {};
    var config = Object.assign({}, globalConfig, overrides || {});
    var storedProvider = localStorageValue(STORAGE_KEYS.provider);
    var storedEndpoint = localStorageValue(STORAGE_KEYS.endpoint);
    var providerId = normalizeProviderId(
      config.provider || config.providerId || storedProvider,
      config.endpoint || storedEndpoint ? "openai-compatible" : "mock"
    );
    var provider = getProvider(providerId);
    var baseUrl = "";
    var model;
    var settings;

    if (providerId !== "mock") {
      baseUrl = baseUrlForProvider(provider, config.baseUrl || localStorageValue(STORAGE_KEYS.baseUrl) || config.endpoint || storedEndpoint || provider.defaultBaseUrl);
    }

    model = String(config.model || localStorageValue(STORAGE_KEYS.model) || provider.defaultModel || "local-model").trim() || "local-model";
    settings = {
      apiKey: hasOwn(config, "apiKey") ? config.apiKey : localStorageValue(STORAGE_KEYS.apiKey),
      baseUrl: baseUrl,
      endpoint: "",
      mode: providerId === "mock" ? "mock" : "server",
      model: model,
      provider: providerId,
      providerLabel: provider.label,
      reasoning: readReasoningSettings(config)
    };

    settings.endpoint = endpointForSettings(settings);
    return settings;
  }

  function clearSettings() {
    Object.keys(STORAGE_KEYS).forEach(function (key) {
      removeLocalStorageValue(STORAGE_KEYS[key]);
    });
    return readSettings({
      provider: "mock"
    });
  }

  function saveSettings(settings) {
    var providerId = normalizeProviderId(settings && (settings.provider || settings.providerId), (settings && settings.mode === "server") || (settings && settings.endpoint) ? "openai-compatible" : "mock");
    var provider = getProvider(providerId);
    var apiKey = String(settings && settings.apiKey || "");
    var model = String(settings && settings.model || provider.defaultModel || "local-model").trim() || "local-model";
    var normalizedReasoning = reasoning.normalize(settings && settings.reasoning);
    var baseUrl;

    if (settings && settings.mode === "mock" || providerId === "mock") {
      return clearSettings();
    }

    baseUrl = baseUrlForProvider(provider, settings && (settings.baseUrl || settings.endpoint) || provider.defaultBaseUrl);
    setLocalStorageValue(STORAGE_KEYS.provider, providerId);
    setLocalStorageValue(STORAGE_KEYS.baseUrl, baseUrl);
    setLocalStorageValue(STORAGE_KEYS.model, model);
    setLocalStorageValue(STORAGE_KEYS.reasoningEnabled, normalizedReasoning.enabled ? "true" : "false");
    setLocalStorageValue(STORAGE_KEYS.reasoningEffort, normalizedReasoning.effort);
    setLocalStorageValue(STORAGE_KEYS.reasoningShowSummary, normalizedReasoning.showSummary ? "true" : "false");
    setLocalStorageValue(STORAGE_KEYS.reasoningTokenBudget, String(normalizedReasoning.tokenBudget));
    removeLocalStorageValue(STORAGE_KEYS.endpoint);

    if (apiKey) {
      setLocalStorageValue(STORAGE_KEYS.apiKey, apiKey);
    } else {
      removeLocalStorageValue(STORAGE_KEYS.apiKey);
    }

    return readSettings({
      provider: providerId
    });
  }

  function buildAiRequest(actionId, selectedText, settings) {
    var messages = ME.aiActions.buildMessages(actionId, selectedText);
    var systemPrompt = messages[0] ? messages[0].content : "";
    var userContent = messages[1] ? messages[1].content : String(selectedText || "");

    return {
      action: ME.aiActions.get(actionId),
      actionId: actionId,
      messages: messages,
      reasoning: settings.reasoning,
      selectedText: selectedText,
      systemPrompt: systemPrompt,
      userContent: userContent
    };
  }

  function normalizeProviderResult(result) {
    if (typeof result === "string") {
      return {
        text: common.cleanProviderResult(result)
      };
    }

    if (!result || !result.text) {
      throw common.createProviderError("Provider response did not include Markdown content.", {
        code: "empty_response"
      });
    }

    return {
      rawProvider: result.rawProvider || "",
      reasoningSummary: result.reasoningSummary || "",
      text: common.cleanProviderResult(result.text),
      usage: result.usage || null
    };
  }

  function runMockAction(actionId, selectedText) {
    return Promise.resolve({
      rawProvider: "mock",
      text: ME.markdownRepair.runAction(actionId, selectedText)
    });
  }

  async function runDetailed(actionId, selectedText, settingsOverride) {
    var settings = readSettings(settingsOverride);
    var provider = getProvider(settings.provider);
    var aiRequest;

    if (!ME.aiActions.get(actionId)) {
      throw new Error("Unknown AI action.");
    }

    if (settings.provider === "mock") {
      return normalizeProviderResult(await runMockAction(actionId, selectedText));
    }

    if (!provider || typeof provider.runAction !== "function") {
      throw common.createProviderError("AI provider is not configured.", {
        code: "no_endpoint"
      });
    }

    aiRequest = buildAiRequest(actionId, selectedText, settings);
    return normalizeProviderResult(await provider.runAction(settings, aiRequest));
  }

  async function run(actionId, selectedText) {
    return (await runDetailed(actionId, selectedText)).text;
  }

  async function listModels(settingsOverride) {
    var settings = readSettings(settingsOverride);
    var provider = getProvider(settings.provider);

    if (!provider || settings.provider === "mock" || typeof provider.listModels !== "function") {
      return [];
    }

    return provider.listModels(settings);
  }

  async function testConnection(settingsOverride) {
    var settings = readSettings(settingsOverride);
    var provider = getProvider(settings.provider);

    if (!provider || settings.provider === "mock" || typeof provider.testConnection !== "function") {
      throw common.createProviderError("AI server endpoint is not configured.", {
        code: "no_endpoint"
      });
    }

    return provider.testConnection(settings);
  }

  ME.aiProviderManager = {
    actionTimeoutMs: function () {
      return common.ACTION_TIMEOUT_MS;
    },
    clearSettings: clearSettings,
    create: function () {
      return ME.aiProviderManager;
    },
    defaultBaseUrl: defaultBaseUrl,
    getProvider: getProvider,
    listModels: listModels,
    listProviders: listProviders,
    readSettings: readSettings,
    run: run,
    runDetailed: runDetailed,
    saveSettings: saveSettings,
    testConnection: testConnection
  };
}());
