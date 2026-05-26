(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var providers = ME.aiProviders = ME.aiProviders || {};
  var common = ME.aiProviderCommon;
  var reasoning = ME.aiReasoning;
  var DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

  function baseUrlFromInput(value) {
    return common.normalizeBaseUrl(value, DEFAULT_BASE_URL);
  }

  function endpointForSettings(settings) {
    return common.appendEndpointPath(baseUrlFromInput(settings && settings.baseUrl), "chat/completions");
  }

  function modelsEndpoint(settings) {
    return common.appendEndpointPath(baseUrlFromInput(settings && settings.baseUrl), "models");
  }

  function headers(settings) {
    return Object.assign({
      Accept: "application/json"
    }, common.authorizationHeaders(settings));
  }

  async function listModels(settings) {
    return common.requireModelList(await common.requestJson({
      headers: headers(settings),
      method: "GET",
      timeoutMs: common.MODEL_LIST_TIMEOUT_MS,
      url: modelsEndpoint(settings)
    }));
  }

  function applyReasoningPayload(payload, settings) {
    var thinkingConfig = reasoning.geminiThinkingConfig(settings.model, settings.reasoning);

    if (thinkingConfig) {
      payload.extra_body = {
        google: {
          thinking_config: thinkingConfig
        }
      };
    }
  }

  async function runAction(settings, aiRequest) {
    var payload = {
      messages: aiRequest.messages,
      model: settings.model,
      stream: false,
      temperature: 0.2
    };
    var data;

    applyReasoningPayload(payload, settings);
    data = await common.requestJson({
      body: payload,
      headers: headers(settings),
      method: "POST",
      timeoutMs: common.ACTION_TIMEOUT_MS,
      url: endpointForSettings(settings)
    });

    return {
      rawProvider: "gemini-openai-compatible",
      reasoningSummary: settings.reasoning && settings.reasoning.showSummary
        ? common.extractOpenAiCompatibleReasoning(data)
        : "",
      text: common.extractOpenAiCompatibleContent(data),
      usage: data && data.usage || null
    };
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
    }));
    data = await common.requestJson({
      body: payload,
      headers: headers(settings),
      method: "POST",
      timeoutMs: common.CONNECTION_TIMEOUT_MS,
      url: endpointForSettings(settings)
    });

    if (!common.hasConnectionResult(data)) {
      throw common.createProviderError("Provider response did not include a completion result.", {
        code: "empty_response"
      });
    }

    return {
      endpoint: endpointForSettings(settings),
      model: settings.model
    };
  }

  providers.gemini = {
    baseUrlFromInput: baseUrlFromInput,
    defaultBaseUrl: DEFAULT_BASE_URL,
    defaultModel: "gemini-3-pro",
    endpointForSettings: endpointForSettings,
    id: "gemini",
    label: "Gemini",
    listModels: listModels,
    modelsEndpoint: modelsEndpoint,
    reasoningEffortLabel: "Thinking level",
    reasoningEfforts: [
      { value: "minimal", label: "Minimal thinking" },
      { value: "low", label: "Low thinking" },
      { value: "medium", label: "Medium thinking" },
      { value: "high", label: "High thinking" }
    ],
    reasoningEnableLabel: "Enable Gemini thinking",
    reasoningLabel: "Gemini thinking",
    reasoningSummaryLabel: "Include thought summaries if supported",
    reasoningTokenBudgetLabel: "Thinking budget for Gemini 2.5",
    runAction: runAction,
    shortLabel: "Gemini",
    supportsModelList: true,
    supportsReasoningBudget: true,
    supportsReasoning: true,
    supportsReasoningSummary: true,
    testConnection: testConnection
  };
}());
