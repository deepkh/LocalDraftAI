(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var GROUP_LABELS = {
    advanced: "Advanced",
    cloud: "Cloud",
    local: "Local"
  };
  var PROVIDERS = [
    {
      defaultBaseUrl: "",
      defaultModel: "local-model",
      group: "local",
      id: "mock",
      label: "Local mock",
      shortLabel: "Mock",
      supportsModelList: false,
      supportsReasoning: false,
      transport: "mock"
    },
    {
      defaultBaseUrl: "http://127.0.0.1:11434",
      defaultModel: "qwen3:1.7b",
      group: "local",
      id: "ollama",
      label: "Ollama",
      providerHelp: "Uses Ollama native /api/chat and /api/tags endpoints on your machine.",
      shortLabel: "Ollama",
      supportsModelList: true,
      supportsReasoning: true,
      supportsReasoningSummary: true,
      transport: "ollama-native"
    },
    {
      defaultBaseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-5.5",
      group: "cloud",
      id: "openai",
      label: "OpenAI",
      providerHelp: "Uses OpenAI-compatible /chat/completions and /models endpoints.",
      requiresApiKey: true,
      shortLabel: "OpenAI",
      supportsExtraHighReasoning: true,
      supportsModelList: true,
      supportsReasoning: true,
      supportsReasoningSummary: true,
      transport: "openai-compatible"
    },
    {
      defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      defaultModel: "gemini-2.5-flash",
      group: "cloud",
      id: "gemini",
      label: "Google Gemini",
      providerHelp: "Uses Gemini's OpenAI-compatible API.",
      requiresApiKey: true,
      shortLabel: "Gemini",
      supportsModelList: true,
      supportsReasoning: true,
      supportsReasoningSummary: true,
      transport: "openai-compatible"
    },
    {
      defaultBaseUrl: "https://api.groq.com/openai/v1",
      defaultModel: "openai/gpt-oss-20b",
      group: "cloud",
      id: "groq",
      label: "Groq",
      providerHelp: "Uses Groq OpenAI-compatible endpoints.",
      requiresApiKey: true,
      shortLabel: "Groq",
      supportsModelList: true,
      supportsReasoning: true,
      supportsReasoningSummary: true,
      transport: "openai-compatible"
    },
    {
      defaultBaseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "openai/gpt-oss-20b:free",
      extraHeaders: {
        "HTTP-Referer": "https://localdraft.ai/",
        "X-Title": "LocalDraft AI"
      },
      group: "cloud",
      id: "openrouter",
      label: "OpenRouter",
      providerHelp: "Uses OpenRouter's OpenAI-compatible API and provider-normalized reasoning options.",
      requiresApiKey: true,
      shortLabel: "OpenRouter",
      supportsModelList: true,
      supportsReasoning: true,
      supportsReasoningSummary: true,
      transport: "openai-compatible"
    },
    {
      defaultBaseUrl: "https://api.mistral.ai/v1",
      defaultModel: "mistral-small-latest",
      group: "cloud",
      id: "mistral",
      label: "Mistral AI",
      providerHelp: "Uses Mistral chat completions endpoints.",
      requiresApiKey: true,
      shortLabel: "Mistral",
      supportsModelList: true,
      supportsReasoning: true,
      supportsReasoningSummary: true,
      transport: "openai-compatible"
    },
    {
      defaultBaseUrl: "https://api.anthropic.com/v1",
      defaultModel: "claude-sonnet-4-6",
      group: "cloud",
      id: "claude",
      label: "Claude / Anthropic",
      providerHelp: "Uses Anthropic's native Messages API.",
      requiresApiKey: true,
      shortLabel: "Claude",
      supportsModelList: true,
      supportsReasoning: true,
      supportsReasoningBudget: true,
      supportsReasoningSummary: true,
      transport: "anthropic-messages"
    },
    {
      defaultBaseUrl: "https://api.x.ai/v1",
      defaultModel: "grok-4.3",
      group: "cloud",
      id: "grok",
      label: "Grok / xAI",
      providerHelp: "Uses xAI OpenAI-compatible endpoints.",
      requiresApiKey: true,
      shortLabel: "Grok",
      supportsModelList: true,
      supportsReasoning: true,
      supportsReasoningSummary: true,
      transport: "openai-compatible"
    },
    {
      defaultBaseUrl: "http://127.0.0.1:11434/v1",
      defaultModel: "local-model",
      group: "advanced",
      id: "openai-compatible",
      label: "OpenAI-compatible custom",
      providerHelp: "Uses a custom /chat/completions server. Reasoning support depends on that server.",
      shortLabel: "OpenAI-compatible",
      supportsModelList: true,
      supportsReasoning: false,
      supportsReasoningSummary: false,
      transport: "openai-compatible"
    }
  ];
  var ALIASES = {
    anthropic: "claude",
    claude: "claude",
    "local-mock": "mock",
    server: "openai-compatible"
  };

  function cloneProvider(provider) {
    var copy = Object.assign({}, provider || {});

    if (provider && provider.extraHeaders) {
      copy.extraHeaders = Object.assign({}, provider.extraHeaders);
    }

    return copy;
  }

  function normalizeId(value, fallback) {
    var id = String(value || fallback || "").trim().toLowerCase();

    if (!id) {
      return "mock";
    }

    return ALIASES[id] || id;
  }

  function getProvider(providerId) {
    var id = normalizeId(providerId);
    var found = PROVIDERS.filter(function (provider) {
      return provider.id === id;
    })[0];

    return found ? cloneProvider(found) : null;
  }

  function listProviders() {
    return PROVIDERS.map(cloneProvider);
  }

  function isCloudProvider(providerId) {
    var provider = getProvider(providerId);

    return Boolean(provider && provider.group === "cloud");
  }

  ME.aiProviderRegistry = {
    groupLabels: GROUP_LABELS,
    getProvider: getProvider,
    isCloudProvider: isCloudProvider,
    listProviders: listProviders,
    normalizeId: normalizeId
  };
}());
