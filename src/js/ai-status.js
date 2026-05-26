(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function readSettings(provider) {
    if (provider && typeof provider.readSettings === "function") {
      return provider.readSettings();
    }

    return ME.aiProvider.readSettings();
  }

  function copyState(state) {
    return {
      baseUrl: state.baseUrl,
      detail: state.detail,
      endpoint: state.endpoint,
      label: state.label,
      mode: state.mode,
      model: state.model,
      provider: state.provider,
      providerLabel: state.providerLabel,
      status: state.status
    };
  }

  function mockState(settings) {
    return {
      baseUrl: "",
      detail: "Local mock transforms run in this browser. No server request is sent.",
      endpoint: "",
      label: "Mock mode",
      mode: "mock",
      model: settings.model || "local-model",
      provider: "mock",
      providerLabel: "Local mock",
      status: "mock"
    };
  }

  function checkingState(settings) {
    return {
      baseUrl: settings.baseUrl || "",
      detail: "Testing connection to " + (settings.providerLabel || "AI provider") + ".",
      endpoint: settings.endpoint,
      label: "Checking",
      mode: "server",
      model: settings.model,
      provider: settings.provider || "openai-compatible",
      providerLabel: settings.providerLabel || "OpenAI-compatible custom",
      status: "checking"
    };
  }

  function connectedState(settings, detail) {
    return {
      baseUrl: settings.baseUrl || "",
      detail: detail || "Connected to " + (settings.providerLabel || "AI provider") + ".",
      endpoint: settings.endpoint,
      label: "Connected",
      mode: "server",
      model: settings.model,
      provider: settings.provider || "openai-compatible",
      providerLabel: settings.providerLabel || "OpenAI-compatible custom",
      status: "connected"
    };
  }

  function errorState(settings, classification) {
    return {
      baseUrl: settings.baseUrl || "",
      detail: classification.detail,
      endpoint: settings.endpoint || "",
      label: classification.label,
      mode: settings.provider === "mock" || !settings.endpoint ? "mock" : "server",
      model: settings.model || "local-model",
      provider: settings.provider || (settings.endpoint ? "openai-compatible" : "mock"),
      providerLabel: settings.providerLabel || (settings.endpoint ? "OpenAI-compatible custom" : "Local mock"),
      status: classification.status
    };
  }

  function runningState(settings, actionLabel) {
    return {
      baseUrl: settings.baseUrl || "",
      detail: actionLabel ? "Running " + actionLabel + "." : "AI action is processing.",
      endpoint: settings.endpoint || "",
      label: "Running...",
      mode: settings.provider === "mock" || !settings.endpoint ? "mock" : "server",
      model: settings.model || "local-model",
      provider: settings.provider || (settings.endpoint ? "openai-compatible" : "mock"),
      providerLabel: settings.providerLabel || (settings.endpoint ? "OpenAI-compatible custom" : "Local mock"),
      status: "running"
    };
  }

  function providerLabel(settings) {
    return settings && (settings.providerLabel || settings.label) || "AI provider";
  }

  function classifyError(error, settings) {
    var status = error && error.status;
    var code = error && error.code;
    var label = providerLabel(settings);

    if (code === "no_endpoint") {
      return {
        detail: "AI provider is not configured. Choose a provider and model in AI Settings.",
        label: "Not configured",
        status: "not-configured"
      };
    }

    if (code === "timeout" || error && error.name === "AbortError") {
      return {
        detail: label + " request timed out.",
        label: "Server unreachable",
        status: "unreachable"
      };
    }

    if (status === 401 || status === 403) {
      return {
        detail: "Authentication failed. Check the API key for " + label + ".",
        label: "Auth error",
        status: "auth-error"
      };
    }

    if (status === 404) {
      return {
        detail: "Endpoint or model was not found. Check the Base URL and model name.",
        label: "Endpoint error",
        status: "model-error"
      };
    }

    if (status === 429) {
      return {
        detail: "Rate limit reached for " + label + ". Try again later or use another model.",
        label: "Rate limited",
        status: "rate-limited"
      };
    }

    if (status >= 500) {
      return {
        detail: label + " server error. Try again later.",
        label: "Model error",
        status: "model-error"
      };
    }

    if (code === "empty_response") {
      return {
        detail: "AI server responded, but no text was returned.",
        label: "Model error",
        status: "model-error"
      };
    }

    if (code === "invalid_json") {
      return {
        detail: "AI server responded, but not with valid JSON.",
        label: "Model error",
        status: "model-error"
      };
    }

    if (code === "network_error") {
      return {
        detail: "Browser could not reach " + label + ". Try the local proxy mode.",
        label: "Server unreachable",
        status: "unreachable"
      };
    }

    if (error && /failed to fetch|cors/i.test(String(error.message || ""))) {
      return {
        detail: "Browser could not reach " + label + ". Try the local proxy mode.",
        label: "Server unreachable",
        status: "unreachable"
      };
    }

    if (code === "fetch_unavailable") {
      return {
        detail: "This browser cannot make AI server requests.",
        label: "Server unreachable",
        status: "unreachable"
      };
    }

    return {
      detail: error && error.message ? error.message : "AI Assistant failed.",
      label: "Model error",
      status: "model-error"
    };
  }

  function createAiStatus(options) {
    var provider = options.provider;
    var onStatusChange = options.onStatusChange || function () {};
    var state = readSettings(provider).endpoint
      ? checkingState(readSettings(provider))
      : mockState(readSettings(provider));

    function setState(nextState) {
      state = nextState;
      onStatusChange(copyState(state));
      return getState();
    }

    function getState() {
      return copyState(state);
    }

    function refresh() {
      var settings = readSettings(provider);

      if (!settings.endpoint) {
        return Promise.resolve(setState(mockState(settings)));
      }

      return testConnection();
    }

    async function testConnection() {
      var settings = readSettings(provider);
      var result;

      if (!settings.endpoint) {
        return setState(mockState(settings));
      }

      setState(checkingState(settings));

      try {
        result = await provider.testConnection();
        settings.endpoint = result.endpoint || settings.endpoint;
        settings.model = result.model || settings.model;
        return setState(connectedState(settings, "Connected. Model responded successfully."));
      } catch (error) {
        return setState(errorState(settings, classifyError(error, settings)));
      }
    }

    function setRunning(actionLabel) {
      return setState(runningState(readSettings(provider), actionLabel));
    }

    function setActionSuccess() {
      var settings = readSettings(provider);

      if (!settings.endpoint) {
        return setState(mockState(settings));
      }

      return setState(connectedState(settings, "Last AI action completed successfully."));
    }

    function setActionError(error) {
      var settings = readSettings(provider);
      var classification = classifyError(error, settings);

      setState(errorState(settings, classification));
      return classification;
    }

    return {
      classifyError: classifyError,
      getState: getState,
      refresh: refresh,
      setActionError: setActionError,
      setActionSuccess: setActionSuccess,
      setRunning: setRunning,
      start: refresh,
      testConnection: testConnection
    };
  }

  ME.aiStatus = {
    classifyError: classifyError,
    create: createAiStatus
  };
}());
