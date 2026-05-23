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
      detail: state.detail,
      endpoint: state.endpoint,
      label: state.label,
      mode: state.mode,
      model: state.model,
      status: state.status
    };
  }

  function mockState(settings) {
    return {
      detail: "No AI server endpoint is configured. Local mock transforms will run.",
      endpoint: "",
      label: "Mock mode",
      mode: "mock",
      model: settings.model || "local-model",
      status: "mock"
    };
  }

  function checkingState(settings) {
    return {
      detail: "Testing connection to " + settings.endpoint + ".",
      endpoint: settings.endpoint,
      label: "Checking",
      mode: "server",
      model: settings.model,
      status: "checking"
    };
  }

  function connectedState(settings, detail) {
    return {
      detail: detail || "Connected to " + settings.endpoint + ".",
      endpoint: settings.endpoint,
      label: "Connected",
      mode: "server",
      model: settings.model,
      status: "connected"
    };
  }

  function errorState(settings, classification) {
    return {
      detail: classification.detail,
      endpoint: settings.endpoint || "",
      label: classification.label,
      mode: settings.endpoint ? "server" : "mock",
      model: settings.model || "local-model",
      status: classification.status
    };
  }

  function runningState(settings, actionLabel) {
    return {
      detail: actionLabel ? "Running " + actionLabel + "." : "AI action is processing.",
      endpoint: settings.endpoint || "",
      label: "Running...",
      mode: settings.endpoint ? "server" : "mock",
      model: settings.model || "local-model",
      status: "running"
    };
  }

  function classifyError(error) {
    var status = error && error.status;
    var code = error && error.code;

    if (code === "no_endpoint") {
      return {
        detail: "AI server is not configured. Set localDraftAI.ai.endpoint before testing a server.",
        label: "Not configured",
        status: "not-configured"
      };
    }

    if (code === "timeout" || error && error.name === "AbortError") {
      return {
        detail: "AI server did not respond before timeout.",
        label: "Server unreachable",
        status: "unreachable"
      };
    }

    if (status === 401 || status === 403) {
      return {
        detail: "API key is invalid or missing.",
        label: "Auth error",
        status: "auth-error"
      };
    }

    if (status === 404) {
      return {
        detail: "Endpoint path is wrong. Check /v1/chat/completions.",
        label: "Endpoint error",
        status: "model-error"
      };
    }

    if (status >= 500) {
      return {
        detail: "AI server returned an internal error.",
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
        detail: "Cannot reach AI server. Check if the server is running and allows browser requests.",
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
        return setState(errorState(settings, classifyError(error)));
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
      var classification = classifyError(error);

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
