(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var providers = ME.aiProviders = ME.aiProviders || {};
  var common = ME.aiProviderCommon;
  var reasoning = ME.aiReasoning;
  var DEFAULT_BASE_URL = "https://api.openai.com/v1";

  function baseUrlFromInput(value) {
    return common.normalizeBaseUrl(value, DEFAULT_BASE_URL);
  }

  function endpointForSettings(settings) {
    return common.appendEndpointPath(baseUrlFromInput(settings && settings.baseUrl), "responses");
  }

  function chatEndpoint(settings) {
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

  function collectResponseOutputText(data) {
    var parts = [];

    if (data && data.output_text) {
      return data.output_text;
    }

    (data && data.output || []).forEach(function (item) {
      (item.content || []).forEach(function (content) {
        if (content.type === "output_text" || content.type === "text") {
          parts.push(common.textFromContent(content.text || content.content));
        }
      });
    });

    return parts.join("").trim();
  }

  function collectResponseReasoning(data, settings) {
    var parts = [];

    if (!settings.reasoning || !settings.reasoning.showSummary) {
      return "";
    }

    (data && data.output || []).forEach(function (item) {
      if (item.type === "reasoning") {
        parts.push(common.collectReasoningSummary(item.summary || item.content));
      }
      (item.content || []).forEach(function (content) {
        if (content.type === "reasoning" || content.type === "summary_text") {
          parts.push(common.collectReasoningSummary(content.summary || content.text || content.content));
        }
      });
    });

    return parts.filter(Boolean).join("\n").trim();
  }

  function resultFromResponsesData(data, settings) {
    var text = collectResponseOutputText(data);

    if (!text) {
      throw common.createProviderError("Provider response did not include Markdown content.", {
        code: "empty_response"
      });
    }

    return {
      rawProvider: "openai-responses",
      reasoningSummary: collectResponseReasoning(data, settings),
      text: text,
      usage: data && data.usage || null
    };
  }

  async function requestResponses(settings, aiRequest, timeoutMs) {
    var payload = {
      input: [
        {
          role: "system",
          content: aiRequest.systemPrompt
        },
        {
          role: "user",
          content: aiRequest.userContent
        }
      ],
      model: settings.model
    };
    var reasoningPayload = reasoning.openAiReasoning(settings.reasoning);

    if (reasoningPayload) {
      payload.reasoning = reasoningPayload;
    }

    if (aiRequest.maxOutputTokens) {
      payload.max_output_tokens = aiRequest.maxOutputTokens;
    }

    return common.requestJson({
      body: payload,
      headers: headers(settings),
      method: "POST",
      timeoutMs: timeoutMs,
      url: endpointForSettings(settings)
    });
  }

  async function requestChatFallback(settings, aiRequest) {
    var data = await common.requestJson({
      body: {
        messages: aiRequest.messages,
        model: settings.model,
        stream: false,
        temperature: 0.2
      },
      headers: headers(settings),
      method: "POST",
      timeoutMs: common.ACTION_TIMEOUT_MS,
      url: chatEndpoint(settings)
    });
    var result = {
      rawProvider: "openai-chat-completions-fallback",
      reasoningSummary: "",
      text: common.extractOpenAiCompatibleContent(data),
      usage: data && data.usage || null
    };

    return result;
  }

  async function runAction(settings, aiRequest) {
    try {
      return resultFromResponsesData(
        await requestResponses(settings, aiRequest, common.ACTION_TIMEOUT_MS),
        settings
      );
    } catch (error) {
      if (error && error.code === "http_error" && (error.status === 400 || error.status === 404)) {
        return requestChatFallback(settings, aiRequest);
      }

      throw error;
    }
  }

  async function testConnection(settings) {
    var data = await requestResponses(settings, {
      maxOutputTokens: 16,
      systemPrompt: "Reply with OK.",
      userContent: "Test connection."
    }, common.CONNECTION_TIMEOUT_MS);

    if (!collectResponseOutputText(data)) {
      throw common.createProviderError("Provider response did not include a completion result.", {
        code: "empty_response"
      });
    }

    return {
      endpoint: endpointForSettings(settings),
      model: settings.model
    };
  }

  providers.openai = {
    baseUrlFromInput: baseUrlFromInput,
    defaultBaseUrl: DEFAULT_BASE_URL,
    defaultModel: "gpt-5",
    endpointForSettings: endpointForSettings,
    id: "openai",
    label: "OpenAI",
    listModels: listModels,
    modelsEndpoint: modelsEndpoint,
    reasoningEffortLabel: "Reasoning effort",
    reasoningEfforts: ["minimal", "low", "medium", "high", "xhigh"],
    reasoningEnableLabel: "Enable OpenAI reasoning",
    reasoningLabel: "OpenAI reasoning",
    reasoningSummaryLabel: "Show reasoning summary if supported",
    reasoningTokenBudgetLabel: "Advanced token budget",
    runAction: runAction,
    shortLabel: "OpenAI",
    supportsModelList: true,
    supportsReasoning: true,
    supportsReasoningSummary: true,
    testConnection: testConnection
  };
}());
