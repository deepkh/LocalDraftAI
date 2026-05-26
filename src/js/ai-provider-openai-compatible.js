(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var providers = ME.aiProviders = ME.aiProviders || {};
  var common = ME.aiProviderCommon;
  var reasoning = ME.aiReasoning;
  var registry = ME.aiProviderRegistry;
  var DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";
  var COMPATIBLE_PROVIDER_IDS = [
    "openai-compatible",
    "openai",
    "gemini",
    "groq",
    "openrouter",
    "mistral",
    "grok"
  ];

  function descriptorFor(providerId, overrides) {
    var descriptor = registry && typeof registry.getProvider === "function"
      ? registry.getProvider(providerId)
      : null;

    descriptor = Object.assign({
      defaultBaseUrl: DEFAULT_BASE_URL,
      defaultModel: "local-model",
      id: providerId || "openai-compatible",
      label: "OpenAI-compatible custom",
      shortLabel: "OpenAI-compatible",
      supportsModelList: true,
      supportsReasoning: false,
      supportsReasoningSummary: false
    }, descriptor || {}, overrides || {});

    return descriptor;
  }

  function baseUrlFromInput(value, descriptor) {
    return common.openAiCompatibleBaseUrl(value, descriptor.defaultBaseUrl || DEFAULT_BASE_URL);
  }

  function endpointForSettings(settings, descriptor) {
    return common.chatCompletionsEndpoint(settings && (settings.baseUrl || settings.endpoint), descriptor.defaultBaseUrl || DEFAULT_BASE_URL);
  }

  function modelsUrl(settings, descriptor) {
    return common.modelsEndpoint(settings && (settings.baseUrl || settings.endpoint), descriptor.defaultBaseUrl || DEFAULT_BASE_URL);
  }

  function headers(settings, descriptor) {
    return Object.assign({
      Accept: "application/json"
    }, descriptor.extraHeaders || {}, common.authorizationHeaders(settings));
  }

  function resultFromData(data, settings, descriptor) {
    return {
      rawProvider: descriptor.id + "-openai-compatible",
      reasoningSummary: settings && settings.reasoning && settings.reasoning.showSummary
        ? common.extractOpenAiCompatibleReasoning(data)
        : "",
      text: common.extractOpenAiCompatibleContent(data),
      usage: data && data.usage || null
    };
  }

  function compatibleReasoningEffort(settings, descriptor) {
    var normalized = reasoning.normalize(settings && settings.reasoning);

    if (!normalized.enabled) {
      return "";
    }

    return reasoning.providerEffort(normalized, {
      allowed: descriptor.supportsExtraHighReasoning
        ? ["low", "medium", "high", "xhigh"]
        : ["low", "medium", "high"],
      minimalAs: "low",
      xhighAs: descriptor.supportsExtraHighReasoning ? "" : "high"
    });
  }

  function shouldSendReasoning(settings, descriptor) {
    return Boolean(
      descriptor.supportsReasoning ||
      settings && settings.enableCompatibleReasoning
    );
  }

  function applyReasoningPayload(payload, settings, descriptor) {
    var effort;

    if (!shouldSendReasoning(settings, descriptor)) {
      return;
    }

    effort = compatibleReasoningEffort(settings, descriptor);
    if (!effort || effort === "off") {
      return;
    }

    if (descriptor.id === "openrouter") {
      payload.reasoning = {
        effort: effort
      };
    } else {
      payload.reasoning_effort = effort;
    }
  }

  async function runChatRequest(settings, payload, timeoutMs, descriptor) {
    return common.requestJson({
      body: payload,
      headers: headers(settings, descriptor),
      method: "POST",
      timeoutMs: timeoutMs,
      url: endpointForSettings(settings, descriptor)
    });
  }

  function createProvider(providerId, overrides) {
    var descriptor = descriptorFor(providerId, overrides);

    async function listModels(settings) {
      return common.requireModelList(await common.requestJson({
        headers: headers(settings, descriptor),
        method: "GET",
        timeoutMs: common.MODEL_LIST_TIMEOUT_MS,
        url: modelsUrl(settings, descriptor)
      }));
    }

    async function runAction(settings, aiRequest) {
      var payload = {
        messages: aiRequest.messages,
        model: settings.model,
        stream: false,
        temperature: 0.2
      };

      applyReasoningPayload(payload, settings, descriptor);

      return resultFromData(
        await runChatRequest(settings, payload, common.ACTION_TIMEOUT_MS, descriptor),
        settings,
        descriptor
      );
    }

    async function testConnection(settings) {
      var payload = {
        max_tokens: 8,
        messages: [
          {
            role: "system",
            content: "Reply with OK."
          },
          {
            role: "user",
            content: "Test connection."
          }
        ],
        model: settings.model,
        stream: false,
        temperature: 0
      };
      var data;

      applyReasoningPayload(payload, Object.assign({}, settings, {
        reasoning: {
          enabled: false
        }
      }), descriptor);

      data = await runChatRequest(settings, payload, common.CONNECTION_TIMEOUT_MS, descriptor);

      if (!common.hasConnectionResult(data)) {
        throw common.createProviderError("Provider response did not include a completion result.", {
          code: "empty_response"
        });
      }

      return {
        baseUrl: baseUrlFromInput(settings && (settings.baseUrl || settings.endpoint), descriptor),
        endpoint: endpointForSettings(settings, descriptor),
        model: settings.model
      };
    }

    return Object.assign({}, descriptor, {
      baseUrlFromInput: function (value) {
        return baseUrlFromInput(value, descriptor);
      },
      endpointForSettings: function (settings) {
        return endpointForSettings(settings, descriptor);
      },
      listModels: listModels,
      modelsEndpoint: function (settings) {
        return modelsUrl(settings, descriptor);
      },
      runAction: runAction,
      testConnection: testConnection
    });
  }

  function registerProvider(providerId, overrides) {
    providers[providerId] = createProvider(providerId, overrides);
    return providers[providerId];
  }

  ME.aiOpenAiCompatibleTransport = {
    applyReasoningPayload: applyReasoningPayload,
    createProvider: createProvider,
    registerProvider: registerProvider
  };

  COMPATIBLE_PROVIDER_IDS.forEach(function (providerId) {
    registerProvider(providerId);
  });
}());
