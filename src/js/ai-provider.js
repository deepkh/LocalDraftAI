(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var STORAGE_KEYS = {
    apiKey: "localDraftAI.ai.apiKey",
    endpoint: "localDraftAI.ai.endpoint",
    model: "localDraftAI.ai.model"
  };
  var DEFAULT_SERVER_URL = "http://127.0.0.1:11434/v1/";
  var ACTION_TIMEOUT_MS = 550000;
  var CONNECTION_TIMEOUT_MS = 8000;
  var MODEL_LIST_TIMEOUT_MS = 8000;

  function endsWithPath(value, path) {
    return value.toLowerCase().slice(-path.length) === path;
  }

  function withTrailingSlash(value) {
    return value.slice(-1) === "/" ? value : value + "/";
  }

  function appendEndpointPath(baseUrl, path) {
    return withTrailingSlash(baseUrl) + path;
  }

  function defaultServerUrl() {
    return DEFAULT_SERVER_URL;
  }

  function actionTimeoutMs() {
    return ACTION_TIMEOUT_MS;
  }

  function serverBaseUrl(value) {
    var endpoint = String(value || DEFAULT_SERVER_URL).trim();

    if (endsWithPath(endpoint, "/chat/completions")) {
      endpoint = endpoint.slice(0, -"/chat/completions".length);
    } else if (endsWithPath(endpoint, "/models")) {
      endpoint = endpoint.slice(0, -"/models".length);
    }

    return withTrailingSlash(endpoint);
  }

  function chatCompletionsEndpoint(value) {
    var endpoint = String(value || DEFAULT_SERVER_URL).trim();

    if (endsWithPath(endpoint, "/chat/completions")) {
      return endpoint;
    }

    if (endsWithPath(endpoint, "/models")) {
      return endpoint.slice(0, -"/models".length) + "/chat/completions";
    }

    return appendEndpointPath(serverBaseUrl(endpoint), "chat/completions");
  }

  function modelsEndpoint(value) {
    var endpoint = String(value || DEFAULT_SERVER_URL).trim();

    if (endsWithPath(endpoint, "/models")) {
      return endpoint;
    }

    if (endsWithPath(endpoint, "/chat/completions")) {
      return endpoint.slice(0, -"/chat/completions".length) + "/models";
    }

    return appendEndpointPath(serverBaseUrl(endpoint), "models");
  }

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

  function readSettings() {
    var globalConfig = window.LocalDraftAIConfig || {};

    return {
      endpoint: globalConfig.endpoint || localStorageValue(STORAGE_KEYS.endpoint),
      apiKey: globalConfig.apiKey || localStorageValue(STORAGE_KEYS.apiKey),
      model: globalConfig.model || localStorageValue(STORAGE_KEYS.model) || "local-model"
    };
  }

  function clearSettings() {
    removeLocalStorageValue(STORAGE_KEYS.endpoint);
    removeLocalStorageValue(STORAGE_KEYS.apiKey);
    removeLocalStorageValue(STORAGE_KEYS.model);
    return readSettings();
  }

  function saveSettings(settings) {
    var endpoint = chatCompletionsEndpoint(settings && settings.endpoint || DEFAULT_SERVER_URL);
    var apiKey = String(settings && settings.apiKey || "");
    var model = String(settings && settings.model || "").trim() || "local-model";
    var mode = settings && settings.mode ? settings.mode : settings && settings.endpoint ? "server" : "mock";

    if (mode === "mock") {
      return clearSettings();
    }

    setLocalStorageValue(STORAGE_KEYS.endpoint, endpoint);
    setLocalStorageValue(STORAGE_KEYS.model, model);

    if (apiKey) {
      setLocalStorageValue(STORAGE_KEYS.apiKey, apiKey);
    } else {
      removeLocalStorageValue(STORAGE_KEYS.apiKey);
    }

    return readSettings();
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

  async function requestOpenAiCompatible(settings, payload, options) {
    var headers = {
      "Content-Type": "application/json"
    };
    var timeoutMs = options && options.timeoutMs ? options.timeoutMs : 15000;
    var Controller = abortControllerCtor();
    var controller = Controller ? new Controller() : null;
    var timeoutId = 0;
    var timedOut = false;
    var fetchOptions;
    var response;
    var data;
    var bodyText;

    if (!settings.endpoint) {
      throw createProviderError("AI server endpoint is not configured.", {
        code: "no_endpoint"
      });
    }

    if (typeof window.fetch !== "function") {
      throw createProviderError("Fetch is not available in this browser.", {
        code: "fetch_unavailable"
      });
    }

    if (settings.apiKey) {
      headers.Authorization = "Bearer " + settings.apiKey;
    }

    fetchOptions = {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload)
    };

    if (controller) {
      fetchOptions.signal = controller.signal;
      timeoutId = setTimeout(function () {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    }

    try {
      response = await window.fetch(settings.endpoint, fetchOptions);
    } catch (error) {
      if (timedOut || error.name === "AbortError") {
        throw createProviderError("AI server did not respond before timeout.", {
          code: "timeout",
          timeoutMs: timeoutMs
        });
      }

      throw createProviderError(error && error.message ? error.message : "AI server request failed.", {
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
        bodyText = await response.text();
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

  function extractProviderContent(data) {
    var content;

    content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : data && data.output_text;

    if (!content) {
      throw createProviderError("Provider response did not include Markdown content.", {
        code: "empty_response"
      });
    }

    return content;
  }

  function hasConnectionResult(data) {
    return Boolean(
      data && (
        data.output_text !== undefined ||
        data.choices && data.choices[0] && (
          data.choices[0].message ||
          data.choices[0].text !== undefined
        )
      )
    );
  }

  async function callOpenAiCompatible(settings, actionId, selectedText) {
    var data = await requestOpenAiCompatible(settings, {
      messages: ME.aiActions.buildMessages(actionId, selectedText),
      model: settings.model,
      stream: false,
      temperature: 0.2
    }, {
      timeoutMs: ACTION_TIMEOUT_MS
    });

    return cleanProviderResult(extractProviderContent(data));
  }

  async function testConnection(settingsOverride) {
    var settings = settingsOverride || readSettings();
    settings.endpoint = chatCompletionsEndpoint(settings.endpoint);
    var data = await requestOpenAiCompatible(settings, {
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
    }, {
      timeoutMs: CONNECTION_TIMEOUT_MS
    });

    if (!hasConnectionResult(data)) {
      throw createProviderError("Provider response did not include a completion result.", {
        code: "empty_response"
      });
    }

    return {
      endpoint: settings.endpoint,
      model: settings.model
    };
  }

  async function listModels(settingsOverride) {
    var settings = settingsOverride || readSettings();
    var endpoint = modelsEndpoint(settings.endpoint);
    var headers = {
      Accept: "application/json"
    };
    var Controller = abortControllerCtor();
    var controller = Controller ? new Controller() : null;
    var timeoutId = 0;
    var timedOut = false;
    var fetchOptions;
    var response;
    var data;

    if (typeof window.fetch !== "function") {
      throw createProviderError("Fetch is not available in this browser.", {
        code: "fetch_unavailable"
      });
    }

    if (settings.apiKey) {
      headers.Authorization = "Bearer " + settings.apiKey;
    }

    fetchOptions = {
      headers: headers,
      method: "GET"
    };

    if (controller) {
      fetchOptions.signal = controller.signal;
      timeoutId = setTimeout(function () {
        timedOut = true;
        controller.abort();
      }, MODEL_LIST_TIMEOUT_MS);
    }

    try {
      response = await window.fetch(endpoint, fetchOptions);
    } catch (error) {
      if (timedOut || error.name === "AbortError") {
        throw createProviderError("AI server did not respond before timeout.", {
          code: "timeout",
          timeoutMs: MODEL_LIST_TIMEOUT_MS
        });
      }

      throw createProviderError(error && error.message ? error.message : "AI server request failed.", {
        cause: error,
        code: "network_error"
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    if (!response.ok) {
      throw createProviderError("Provider returned HTTP " + response.status + ".", {
        code: "http_error",
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

    if (Array.isArray(data.data)) {
      return data.data.map(function (model) {
        return model && (model.id || model.name);
      }).filter(Boolean);
    }

    if (Array.isArray(data.models)) {
      return data.models.map(function (model) {
        return model && (model.id || model.name || model.model);
      }).filter(Boolean);
    }

    throw createProviderError("Provider response did not include a model list.", {
      code: "empty_response"
    });
  }

  function runMockAction(actionId, selectedText) {
    return Promise.resolve(ME.markdownRepair.runAction(actionId, selectedText));
  }

  function createProvider() {
    async function run(actionId, selectedText) {
      var settings = readSettings();

      if (!ME.aiActions.get(actionId)) {
        throw new Error("Unknown AI action.");
      }

      if (settings.endpoint) {
        return callOpenAiCompatible(settings, actionId, selectedText);
      }

      return runMockAction(actionId, selectedText);
    }

    return {
      actionTimeoutMs: actionTimeoutMs,
      chatCompletionsEndpoint: chatCompletionsEndpoint,
      clearSettings: clearSettings,
      defaultServerUrl: defaultServerUrl,
      listModels: listModels,
      modelsEndpoint: modelsEndpoint,
      readSettings: readSettings,
      saveSettings: saveSettings,
      serverBaseUrl: serverBaseUrl,
      testConnection: testConnection,
      run: run
    };
  }

  ME.aiProvider = {
    actionTimeoutMs: actionTimeoutMs,
    chatCompletionsEndpoint: chatCompletionsEndpoint,
    clearSettings: clearSettings,
    create: createProvider,
    defaultServerUrl: defaultServerUrl,
    listModels: listModels,
    modelsEndpoint: modelsEndpoint,
    readSettings: readSettings,
    saveSettings: saveSettings,
    serverBaseUrl: serverBaseUrl
  };
}());
