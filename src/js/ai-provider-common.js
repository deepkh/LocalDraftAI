(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var ACTION_TIMEOUT_MS = 600000;
  var CONNECTION_TIMEOUT_MS = 120000;
  var MODEL_LIST_TIMEOUT_MS = 30000;

  function endsWithPath(value, path) {
    return String(value || "").toLowerCase().slice(-path.length) === path;
  }

  function trimSlashes(value, side) {
    var text = String(value || "");

    if (side === "left") {
      return text.replace(/^\/+/, "");
    }

    if (side === "right") {
      return text.replace(/\/+$/, "");
    }

    return text.replace(/^\/+|\/+$/g, "");
  }

  function withTrailingSlash(value) {
    var text = String(value || "");
    return text.slice(-1) === "/" ? text : text + "/";
  }

  function appendEndpointPath(baseUrl, path) {
    return trimSlashes(baseUrl, "right") + "/" + trimSlashes(path, "left");
  }

  function normalizeBaseUrl(value, fallback) {
    var baseUrl = String(value || fallback || "").trim();

    return trimSlashes(baseUrl, "right");
  }

  function openAiCompatibleBaseUrl(value, fallback) {
    var endpoint = String(value || fallback || "").trim();

    if (endsWithPath(endpoint, "/chat/completions")) {
      endpoint = endpoint.slice(0, -"/chat/completions".length);
    } else if (endsWithPath(endpoint, "/models")) {
      endpoint = endpoint.slice(0, -"/models".length);
    }

    return withTrailingSlash(endpoint);
  }

  function chatCompletionsEndpoint(value, fallback) {
    var endpoint = String(value || fallback || "").trim();

    if (endsWithPath(endpoint, "/chat/completions")) {
      return endpoint;
    }

    if (endsWithPath(endpoint, "/models")) {
      return endpoint.slice(0, -"/models".length) + "/chat/completions";
    }

    return appendEndpointPath(openAiCompatibleBaseUrl(endpoint, fallback), "chat/completions");
  }

  function modelsEndpoint(value, fallback) {
    var endpoint = String(value || fallback || "").trim();

    if (endsWithPath(endpoint, "/models")) {
      return endpoint;
    }

    if (endsWithPath(endpoint, "/chat/completions")) {
      return endpoint.slice(0, -"/chat/completions".length) + "/models";
    }

    return appendEndpointPath(openAiCompatibleBaseUrl(endpoint, fallback), "models");
  }

  function cleanProviderResult(value) {
    var text = String(value || "").trim();
    var fence = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);

    return fence ? fence[1].trim() : text;
  }

  function createProviderError(message, details) {
    var error = new Error(message);

    Object.keys(details || {}).forEach(function (key) {
      error[key] = details[key];
    });

    return error;
  }

  function abortControllerCtor() {
    if (window.AbortController) {
      return window.AbortController;
    }

    if (typeof AbortController === "function") {
      return AbortController;
    }

    return null;
  }

  function authorizationHeaders(settings, mode) {
    var headers = {};

    if (!settings || !settings.apiKey) {
      return headers;
    }

    if (mode === "anthropic") {
      headers["x-api-key"] = settings.apiKey;
      return headers;
    }

    if (mode === "gemini-native") {
      headers["x-goog-api-key"] = settings.apiKey;
      return headers;
    }

    headers.Authorization = "Bearer " + settings.apiKey;
    return headers;
  }

  async function requestJson(options) {
    var headers = Object.assign({}, options.headers || {});
    var timeoutMs = options.timeoutMs || 15000;
    var Controller = abortControllerCtor();
    var controller = Controller ? new Controller() : null;
    var timeoutId = 0;
    var timedOut = false;
    var fetchOptions;
    var response;
    var data;
    var bodyText;

    if (typeof window.fetch !== "function") {
      throw createProviderError("Fetch is not available in this browser.", {
        code: "fetch_unavailable"
      });
    }

    fetchOptions = {
      headers: headers,
      method: options.method || "GET"
    };

    if (options.body !== undefined) {
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
      fetchOptions.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }

    if (controller) {
      fetchOptions.signal = controller.signal;
      timeoutId = setTimeout(function () {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    }

    try {
      response = await window.fetch(options.url, fetchOptions);
    } catch (error) {
      if (timedOut || error.name === "AbortError") {
        throw createProviderError("AI provider did not respond before timeout.", {
          code: "timeout",
          timeoutMs: timeoutMs
        });
      }

      throw createProviderError(error && error.message ? error.message : "AI provider request failed.", {
        cause: error,
        code: "network_error"
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    if (!response.ok) {
      try {
        bodyText = typeof response.text === "function" ? await response.text() : "";
      } catch (error) {
        bodyText = "";
      }

      throw createProviderError("Provider returned HTTP " + response.status + ".", {
        code: "http_error",
        responseBody: bodyText ? bodyText.slice(0, 500) : "",
        status: response.status
      });
    }

    try {
      data = await response.json();
    } catch (error) {
      throw createProviderError("Provider response was not valid JSON.", {
        code: "invalid_json"
      });
    }

    return data;
  }

  function textFromContent(value) {
    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(function (part) {
        if (typeof part === "string") {
          return part;
        }

        return part && (part.text || part.content || part.value) || "";
      }).filter(Boolean).join("");
    }

    return value && (value.text || value.content || value.value) || "";
  }

  function collectReasoningSummary(value) {
    var summary = [];

    if (!value) {
      return "";
    }

    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      value.forEach(function (item) {
        var text = textFromContent(item && (item.text || item.summary || item.content || item.value) || item);
        if (text) {
          summary.push(text);
        }
      });
      return summary.join("\n").trim();
    }

    return textFromContent(value.summary || value.text || value.content || value.value || "");
  }

  function extractOpenAiCompatibleContent(data) {
    var message = data && data.choices && data.choices[0] && data.choices[0].message;
    var content = message ? textFromContent(message.content) : "";

    if (!content && data && data.choices && data.choices[0] && data.choices[0].text !== undefined) {
      content = data.choices[0].text;
    }

    if (!content && data && data.output_text !== undefined) {
      content = data.output_text;
    }

    if (!content) {
      throw createProviderError("Provider response did not include Markdown content.", {
        code: "empty_response"
      });
    }

    return content;
  }

  function extractOpenAiCompatibleReasoning(data) {
    var message = data && data.choices && data.choices[0] && data.choices[0].message;

    if (!message) {
      return "";
    }

    return collectReasoningSummary(
      message.reasoning_summary ||
      message.reasoning ||
      message.thinking ||
      message.reasoning_content
    );
  }

  function hasConnectionResult(data) {
    return Boolean(
      data && (
        data.output_text !== undefined ||
        data.message ||
        data.choices && data.choices[0] && (
          data.choices[0].message ||
          data.choices[0].text !== undefined
        ) ||
        data.content && data.content.length
      )
    );
  }

  function modelId(model) {
    return model && (model.id || model.name || model.model || model.displayName);
  }

  function parseModelList(data) {
    var source = [];

    if (Array.isArray(data)) {
      source = data;
    } else if (Array.isArray(data && data.data)) {
      source = data.data;
    } else if (Array.isArray(data && data.models)) {
      source = data.models;
    }

    return source.map(modelId).filter(Boolean);
  }

  function requireModelList(data) {
    var models = parseModelList(data);

    if (!models.length) {
      throw createProviderError("Provider response did not include a model list.", {
        code: "empty_response"
      });
    }

    return models;
  }

  ME.aiProviderCommon = {
    ACTION_TIMEOUT_MS: ACTION_TIMEOUT_MS,
    CONNECTION_TIMEOUT_MS: CONNECTION_TIMEOUT_MS,
    MODEL_LIST_TIMEOUT_MS: MODEL_LIST_TIMEOUT_MS,
    appendEndpointPath: appendEndpointPath,
    authorizationHeaders: authorizationHeaders,
    chatCompletionsEndpoint: chatCompletionsEndpoint,
    cleanProviderResult: cleanProviderResult,
    collectReasoningSummary: collectReasoningSummary,
    createProviderError: createProviderError,
    extractOpenAiCompatibleContent: extractOpenAiCompatibleContent,
    extractOpenAiCompatibleReasoning: extractOpenAiCompatibleReasoning,
    hasConnectionResult: hasConnectionResult,
    modelsEndpoint: modelsEndpoint,
    normalizeBaseUrl: normalizeBaseUrl,
    openAiCompatibleBaseUrl: openAiCompatibleBaseUrl,
    parseModelList: parseModelList,
    requestJson: requestJson,
    requireModelList: requireModelList,
    textFromContent: textFromContent,
    withTrailingSlash: withTrailingSlash
  };
}());
