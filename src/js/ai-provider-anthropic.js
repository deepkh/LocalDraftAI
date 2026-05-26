(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var providers = ME.aiProviders = ME.aiProviders || {};
  var common = ME.aiProviderCommon;
  var reasoning = ME.aiReasoning;
  var DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
  var ANTHROPIC_VERSION = "2023-06-01";

  function baseUrlFromInput(value) {
    return common.normalizeBaseUrl(value, DEFAULT_BASE_URL);
  }

  function endpointForSettings(settings) {
    return common.appendEndpointPath(baseUrlFromInput(settings && settings.baseUrl), "messages");
  }

  function modelsEndpoint(settings) {
    return common.appendEndpointPath(baseUrlFromInput(settings && settings.baseUrl), "models");
  }

  function headers(settings) {
    return Object.assign({
      Accept: "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
      "anthropic-version": ANTHROPIC_VERSION
    }, common.authorizationHeaders(settings, "anthropic"));
  }

  async function listModels(settings) {
    return common.requireModelList(await common.requestJson({
      headers: headers(settings),
      method: "GET",
      timeoutMs: common.MODEL_LIST_TIMEOUT_MS,
      url: modelsEndpoint(settings)
    }));
  }

  function contentResult(data, settings) {
    var text = [];
    var summary = [];

    (data && data.content || []).forEach(function (block) {
      if (block.type === "text") {
        text.push(common.textFromContent(block.text || block.content));
      } else if (settings.reasoning && settings.reasoning.showSummary && block.type === "thinking") {
        summary.push(common.collectReasoningSummary(block.summary || block.thinking || block.text || block.content));
      }
    });

    if (!text.join("").trim()) {
      throw common.createProviderError("Provider response did not include Markdown content.", {
        code: "empty_response"
      });
    }

    return {
      rawProvider: "anthropic-messages",
      reasoningSummary: summary.filter(Boolean).join("\n").trim(),
      text: text.join("").trim(),
      usage: data && data.usage || null
    };
  }

  function maxTokens(settings) {
    var tokenBudget = settings.reasoning && settings.reasoning.tokenBudget || 2048;

    if (settings.reasoning && settings.reasoning.enabled) {
      return Math.max(4096, tokenBudget + 1024);
    }

    return 2048;
  }

  async function runAction(settings, aiRequest) {
    var payload = {
      max_tokens: maxTokens(settings),
      messages: [
        {
          role: "user",
          content: aiRequest.userContent
        }
      ],
      model: settings.model,
      system: aiRequest.systemPrompt
    };
    var thinking = reasoning.claudeThinking(settings.reasoning);

    if (thinking) {
      payload.thinking = thinking;
    } else {
      payload.temperature = 0.2;
    }

    return contentResult(await common.requestJson({
      body: payload,
      headers: headers(settings),
      method: "POST",
      timeoutMs: common.ACTION_TIMEOUT_MS,
      url: endpointForSettings(settings)
    }), settings);
  }

  async function testConnection(settings) {
    var data = await common.requestJson({
      body: {
        max_tokens: 16,
        messages: [
          {
            role: "user",
            content: "Test connection."
          }
        ],
        model: settings.model,
        system: "Reply with OK."
      },
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

  providers.claude = {
    baseUrlFromInput: baseUrlFromInput,
    defaultBaseUrl: DEFAULT_BASE_URL,
    defaultModel: "claude-sonnet-4-6",
    endpointForSettings: endpointForSettings,
    group: "cloud",
    id: "claude",
    label: "Claude / Anthropic",
    listModels: listModels,
    modelsEndpoint: modelsEndpoint,
    reasoningEffortLabel: "Adaptive thinking effort",
    reasoningEfforts: [
      { value: "low", label: "Adaptive low" },
      { value: "medium", label: "Adaptive medium" },
      { value: "high", label: "Adaptive high" }
    ],
    reasoningEnableLabel: "Enable Claude extended thinking",
    reasoningLabel: "Claude extended thinking",
    reasoningSummaryLabel: "Show returned thinking summary if supported",
    reasoningTokenBudgetLabel: "Thinking token budget",
    supportsReasoningBudget: true,
    runAction: runAction,
    shortLabel: "Claude",
    supportsModelList: true,
    supportsReasoning: true,
    supportsReasoningSummary: true,
    testConnection: testConnection,
    transport: "anthropic-messages"
  };
  providers.anthropic = providers.claude;
}());
