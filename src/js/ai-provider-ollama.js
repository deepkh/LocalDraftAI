(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var providers = ME.aiProviders = ME.aiProviders || {};
  var common = ME.aiProviderCommon;
  var reasoning = ME.aiReasoning;
  var DEFAULT_BASE_URL = "http://127.0.0.1:11434";

  function baseUrlFromInput(value) {
    return common.normalizeBaseUrl(value, DEFAULT_BASE_URL);
  }

  function endpointForSettings(settings) {
    return common.appendEndpointPath(baseUrlFromInput(settings && settings.baseUrl), "api/chat");
  }

  function tagsEndpoint(settings) {
    return common.appendEndpointPath(baseUrlFromInput(settings && settings.baseUrl), "api/tags");
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
      url: tagsEndpoint(settings)
    }));
  }

  function resultFromData(data, settings) {
    var message = data && data.message || {};
    var text = common.textFromContent(message.content);

    if (!text) {
      throw common.createProviderError("Provider response did not include Markdown content.", {
        code: "empty_response"
      });
    }

    return {
      rawProvider: "ollama",
      reasoningSummary: settings && settings.reasoning && settings.reasoning.showSummary
        ? common.collectReasoningSummary(message.thinking)
        : "",
      text: text,
      usage: {
        evalCount: data && data.eval_count,
        promptEvalCount: data && data.prompt_eval_count
      }
    };
  }

  async function runAction(settings, aiRequest) {
    var payload = {
      messages: aiRequest.messages,
      model: settings.model,
      options: {
        temperature: 0.2
      },
      stream: false,
      think: reasoning.ollamaThink(settings.reasoning)
    };

    return resultFromData(await common.requestJson({
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
        options: {
          temperature: 0
        },
        stream: false,
        think: false
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

  providers.ollama = {
    baseUrlFromInput: baseUrlFromInput,
    defaultBaseUrl: DEFAULT_BASE_URL,
    defaultModel: "local-model",
    endpointForSettings: endpointForSettings,
    id: "ollama",
    label: "Ollama local",
    listModels: listModels,
    modelsEndpoint: tagsEndpoint,
    reasoningEffortLabel: "Think level",
    reasoningEfforts: [
      { value: "low", label: "Low think" },
      { value: "medium", label: "Medium think" },
      { value: "high", label: "High think" }
    ],
    reasoningEnableLabel: "Enable Ollama think",
    reasoningLabel: "Ollama think",
    reasoningSummaryLabel: "Show returned thinking if supported",
    runAction: runAction,
    shortLabel: "Ollama",
    supportsModelList: true,
    supportsReasoning: true,
    supportsReasoningSummary: true,
    testConnection: testConnection
  };
}());
