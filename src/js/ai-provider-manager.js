(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var common = ME.aiProviderCommon;
  var reasoning = ME.aiReasoning;
  var registry = ME.aiProviderRegistry;
  var STORAGE_KEYS = {
    apiKey: "localDraftAI.ai.apiKey",
    baseUrl: "localDraftAI.ai.baseUrl",
    endpoint: "localDraftAI.ai.endpoint",
    model: "localDraftAI.ai.model",
    provider: "localDraftAI.ai.provider",
    reasoning: "localDraftAI.ai.reasoning",
    reasoningEnabled: "localDraftAI.ai.reasoning.enabled",
    reasoningEffort: "localDraftAI.ai.reasoning.effort",
    reasoningMode: "localDraftAI.ai.reasoningMode",
    reasoningModeLegacy: "localDraftAI.ai.reasoning.mode",
    reasoningShowSummary: "localDraftAI.ai.reasoning.showSummary",
    reasoningTokenBudget: "localDraftAI.ai.reasoning.tokenBudget"
  };
  var FALLBACK_PROVIDER_ORDER = ["mock", "ollama", "openai", "gemini", "groq", "openrouter", "mistral", "claude", "grok", "openai-compatible"];
  var REASONING_MODES = ["auto", "off", "low", "medium", "high", "xhigh"];
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

  function readStoredReasoning() {
    var value = localStorageValue(STORAGE_KEYS.reasoning);

    if (!value) {
      return {};
    }

    try {
      return JSON.parse(value) || {};
    } catch (error) {
      return {};
    }
  }

  function providerMap() {
    return ME.aiProviders || {};
  }

  function registryProvider(providerId) {
    if (registry && typeof registry.getProvider === "function") {
      return registry.getProvider(providerId);
    }

    return null;
  }

  function registryProviders() {
    if (registry && typeof registry.listProviders === "function") {
      return registry.listProviders();
    }

    return [];
  }

  function providerExists(providerId) {
    var id = String(providerId || "").trim();

    return Boolean(
      id === "mock" ||
      registryProvider(id) ||
      providerMap()[id] ||
      id === "claude" && providerMap().anthropic ||
      id === "anthropic" && providerMap().claude
    );
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function normalizeProviderId(value, fallback) {
    var providerId = String(value || fallback || "").trim();

    if (registry && typeof registry.normalizeId === "function") {
      providerId = registry.normalizeId(providerId, fallback);
    }

    if (!providerId) {
      return "mock";
    }

    if (providerId === "server") {
      providerId = "openai-compatible";
    }

    if (providerId === "anthropic") {
      providerId = "claude";
    }

    if (providerId === "local-mock") {
      return "mock";
    }

    return providerExists(providerId) ? providerId : "openai-compatible";
  }

  function getProvider(providerId) {
    var normalized = normalizeProviderId(providerId || "mock", "mock");
    var descriptor = registryProvider(normalized);
    var adapter;

    if (normalized === "mock") {
      return Object.assign({}, descriptor || {}, MOCK_PROVIDER);
    }

    adapter = providerMap()[normalized] || (normalized === "claude" ? providerMap().anthropic : null);

    return adapter || descriptor ? Object.assign({}, descriptor || {}, adapter || {}) : null;
  }

  function listProviders() {
    var ids = registryProviders().length
      ? registryProviders().map(function (provider) { return provider.id; })
      : FALLBACK_PROVIDER_ORDER;

    return ids.map(getProvider).filter(Boolean);
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

  function normalizeReasoningMode(value, fallback) {
    var mode = String(value === undefined || value === null ? "" : value).trim().toLowerCase();

    if (mode === "minimal") {
      return "low";
    }

    if (mode === "none" || mode === "disabled" || mode === "false") {
      return "off";
    }

    if (REASONING_MODES.indexOf(mode) > -1) {
      return mode;
    }

    return fallback || "auto";
  }

  function falseValue(value) {
    return value === false || value === "false";
  }

  function explicitReasoningMode(config) {
    var configReasoning = config && config.reasoning || {};

    if (hasOwn(config || {}, "reasoningMode")) {
      return normalizeReasoningMode(config.reasoningMode);
    }

    if (hasOwn(configReasoning, "mode")) {
      return normalizeReasoningMode(configReasoning.mode);
    }

    if (hasOwn(configReasoning, "reasoningMode")) {
      return normalizeReasoningMode(configReasoning.reasoningMode);
    }

    if (hasOwn(configReasoning, "enabled") && falseValue(configReasoning.enabled)) {
      return "off";
    }

    if (hasOwn(configReasoning, "effort") && configReasoning.effort) {
      return normalizeReasoningMode(configReasoning.effort);
    }

    return "";
  }

  function readReasoningMode(config) {
    var mode = explicitReasoningMode(config);
    var storedReasoning = readStoredReasoning();
    var storedMode;
    var storedEffort;

    if (mode) {
      return mode;
    }

    storedMode = localStorageValue(STORAGE_KEYS.reasoningMode);
    if (storedMode) {
      return normalizeReasoningMode(storedMode);
    }

    if (storedReasoning.mode || storedReasoning.reasoningMode) {
      return normalizeReasoningMode(storedReasoning.mode || storedReasoning.reasoningMode);
    }

    if (hasOwn(storedReasoning, "enabled") && falseValue(storedReasoning.enabled)) {
      return "off";
    }

    if (storedReasoning.effort) {
      return normalizeReasoningMode(storedReasoning.effort);
    }

    storedMode = localStorageValue(STORAGE_KEYS.reasoningModeLegacy);
    if (storedMode) {
      return normalizeReasoningMode(storedMode);
    }

    if (falseValue(localStorageValue(STORAGE_KEYS.reasoningEnabled))) {
      return "off";
    }

    storedEffort = localStorageValue(STORAGE_KEYS.reasoningEffort);
    if (storedEffort) {
      return normalizeReasoningMode(storedEffort);
    }

    return "auto";
  }

  function readReasoningSettings(config, mode) {
    var configReasoning = config && config.reasoning || {};
    var storedReasoning = readStoredReasoning();
    var reasoningMode = normalizeReasoningMode(mode || readReasoningMode(config));
    var effort = reasoningMode === "auto" ? "medium" : reasoningMode;

    return reasoning.normalize({
      enabled: reasoningMode !== "off",
      effort: effort,
      showSummary: configReasoning.showSummary !== undefined
        ? configReasoning.showSummary
        : storedReasoning.showSummary !== undefined
          ? storedReasoning.showSummary
          : localStorageValue(STORAGE_KEYS.reasoningShowSummary),
      tokenBudget: configReasoning.tokenBudget || storedReasoning.tokenBudget
        || localStorageValue(STORAGE_KEYS.reasoningTokenBudget)
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
    var reasoningMode = readReasoningMode(config);
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
      reasoning: readReasoningSettings(config, reasoningMode),
      reasoningMode: reasoningMode
    };

    settings.endpoint = endpointForSettings(settings);
    return settings;
  }

  function resolvedReasoningForMode(mode, sourceReasoning) {
    var reasoningMode = normalizeReasoningMode(mode, "off");
    var source = sourceReasoning || {};

    return reasoning.normalize({
      enabled: reasoningMode !== "off",
      effort: reasoningMode === "auto" ? "medium" : reasoningMode,
      showSummary: source.showSummary,
      tokenBudget: source.tokenBudget
    });
  }

  function providerSupportsReasoning(settings, provider) {
    return Boolean(
      provider &&
      provider.id !== "mock" &&
      settings &&
      settings.endpoint &&
      (provider.supportsReasoning || settings.enableCompatibleReasoning)
    );
  }

  function resolveActionSettings(actionId, settingsOverride) {
    var settings = readSettings(settingsOverride);
    var provider = getProvider(settings.provider);
    var resolvedMode = normalizeReasoningMode(settings.reasoningMode, "auto");
    var resolved;

    if (!providerSupportsReasoning(settings, provider)) {
      resolvedMode = "off";
    } else if (resolvedMode === "auto") {
      resolvedMode = normalizeReasoningMode(
        ME.aiActions && typeof ME.aiActions.defaultReasoningMode === "function"
          ? ME.aiActions.defaultReasoningMode(actionId)
          : "low",
        "low"
      );
    }

    resolved = Object.assign({}, settings);
    resolved.reasoningMode = resolvedMode;
    resolved.reasoning = resolvedReasoningForMode(resolvedMode, settings.reasoning);
    return resolved;
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
    var reasoningMode = readReasoningMode(settings || {});
    var normalizedReasoning = readReasoningSettings(settings || {}, reasoningMode);
    var baseUrl;

    if (settings && settings.mode === "mock" || providerId === "mock") {
      return clearSettings();
    }

    baseUrl = baseUrlForProvider(provider, settings && (settings.baseUrl || settings.endpoint) || provider.defaultBaseUrl);
    setLocalStorageValue(STORAGE_KEYS.provider, providerId);
    setLocalStorageValue(STORAGE_KEYS.baseUrl, baseUrl);
    setLocalStorageValue(STORAGE_KEYS.model, model);
    setLocalStorageValue(STORAGE_KEYS.reasoningMode, reasoningMode);
    setLocalStorageValue(STORAGE_KEYS.reasoning, JSON.stringify({
      enabled: normalizedReasoning.enabled,
      effort: normalizedReasoning.effort,
      mode: reasoningMode,
      showSummary: normalizedReasoning.showSummary,
      tokenBudget: normalizedReasoning.tokenBudget
    }));
    setLocalStorageValue(STORAGE_KEYS.reasoningModeLegacy, reasoningMode);
    setLocalStorageValue(STORAGE_KEYS.reasoningEnabled, normalizedReasoning.enabled ? "true" : "false");
    setLocalStorageValue(STORAGE_KEYS.reasoningEffort, reasoningMode === "auto" ? "auto" : normalizedReasoning.effort);
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
      reasoningMode: settings.reasoningMode,
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

  function settingsOverrideFromOptions(options) {
    if (options && hasOwn(options, "settingsOverride")) {
      return options.settingsOverride;
    }

    return options;
  }

  async function runDetailed(actionId, selectedText, options) {
    var settings = resolveActionSettings(actionId, settingsOverrideFromOptions(options));
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

  async function run(actionId, selectedText, options) {
    return (await runDetailed(actionId, selectedText, options)).text;
  }

  function summarizeSettings(settingsOverride) {
    var settings = readSettings(settingsOverride);
    var provider = getProvider(settings.provider);
    var mode = settings.provider === "mock" || !settings.endpoint ? "mock" : "server";
    var reasoningMode = normalizeReasoningMode(settings.reasoningMode || (settings.reasoning && settings.reasoning.enabled ? settings.reasoning.effort : "off"), "off");

    if (mode === "mock" || !providerSupportsReasoning(settings, provider)) {
      reasoningMode = "off";
    }

    return {
      endpoint: mode === "server" ? settings.endpoint : "",
      mode: mode,
      model: settings.model || "",
      provider: settings.provider || (mode === "server" ? "openai-compatible" : "mock"),
      providerLabel: mode === "server"
        ? provider && (provider.shortLabel || provider.label) || settings.providerLabel || "AI provider"
        : "Local mock",
      reasoningMode: reasoningMode
    };
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
    normalizeReasoningMode: normalizeReasoningMode,
    getProvider: getProvider,
    listModels: listModels,
    listProviders: listProviders,
    readSettings: readSettings,
    resolveActionSettings: resolveActionSettings,
    run: run,
    runDetailed: runDetailed,
    saveSettings: saveSettings,
    summarizeSettings: summarizeSettings,
    testConnection: testConnection
  };
}());
