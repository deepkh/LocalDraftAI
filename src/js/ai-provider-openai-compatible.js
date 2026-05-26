(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var providers = ME.aiProviders = ME.aiProviders || {};
  var common = ME.aiProviderCommon;
  var reasoning = ME.aiReasoning;
  var DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1/";

  function baseUrlFromInput(value) {
    return common.openAiCompatibleBaseUrl(value, DEFAULT_BASE_URL);
  }

  function endpointForSettings(settings) {
    return common.chatCompletionsEndpoint(settings && (settings.baseUrl || settings.endpoint), DEFAULT_BASE_URL);
  }

  function modelsUrl(settings) {
    return common.modelsEndpoint(settings && (settings.baseUrl || settings.endpoint), DEFAULT_BASE_URL);
  }

  function headers(settings) {
    return Object.assign({
      Accept: "application/json"
    }, common.authorizationHeaders(settings));
  }

  function resultFromData(data, settings) {
    return {
      rawProvider: "openai-compatible",
      reasoningSummary: settings && settings.reasoning && settings.reasoning.showSummary
        ? common.extractOpenAiCompatibleReasoning(data)
        : "",
      text: common.extractOpenAiCompatibleContent(data),
      usage: data && data.usage || null
    };
  }

  async function listModels(settings) {
    return common.requireModelList(await common.requestJson({
      headers: headers(settings),
      method: "GET",
      timeoutMs: common.MODEL_LIST_TIMEOUT_MS,
      url: modelsUrl(settings)
    }));
  }

  async function runChatRequest(settings, payload, timeoutMs) {
    return common.requestJson({
      body: payload,
      headers: Object.assign({
        Accept: "application/json"
      }, common.authorizationHeaders(settings)),
      method: "POST",
      timeoutMs: timeoutMs,
      url: endpointForSettings(settings)
    });
  }

  async function runAction(settings, aiRequest) {
    var payload = {
      messages: aiRequest.messages,
      model: settings.model,
      stream: false,
      temperature: 0.2
    };
    var reasoningEffort = reasoning.openAiCompatibleReasoningEffort(settings.reasoning);

    if (reasoningEffort && settings.enableCompatibleReasoning) {
      payload.reasoning_effort = reasoningEffort;
    }

    return resultFromData(await runChatRequest(settings, payload, common.ACTION_TIMEOUT_MS), settings);
  }

  async function testConnection(settings) {
    var data = await runChatRequest(settings, {
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
    }, common.CONNECTION_TIMEOUT_MS);

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

  providers["openai-compatible"] = {
    baseUrlFromInput: baseUrlFromInput,
    defaultBaseUrl: DEFAULT_BASE_URL,
    defaultModel: "local-model",
    endpointForSettings: endpointForSettings,
    id: "openai-compatible",
    label: "OpenAI-compatible custom",
    listModels: listModels,
    modelsEndpoint: modelsUrl,
    runAction: runAction,
    shortLabel: "OpenAI-compatible",
    supportsModelList: true,
    supportsReasoning: false,
    supportsReasoningSummary: false,
    testConnection: testConnection
  };
}());
