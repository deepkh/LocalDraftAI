(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function createAiSettingsDialog(context) {
    var provider = context.provider;
    var aiStatus = context.aiStatus;
    var overlay = context.overlay;
    var dialog = context.dialog;
    var form = context.form;
    var modeMock = context.modeMock;
    var modeServer = context.modeServer;
    var endpointInput = context.endpointInput;
    var modelInput = context.modelInput;
    var modelListButton = context.modelListButton;
    var modelOptions = context.modelOptions;
    var modelSelect = context.modelSelect;
    var apiKeyInput = context.apiKeyInput;
    var statusElement = context.statusElement;
    var testButton = context.testButton;
    var saveButton = context.saveButton;
    var cancelButton = context.cancelButton;
    var closeButton = context.closeButton;
    var onSaved = context.onSaved || function () {};
    var focusAfterClose = context.focusAfterClose || function () {};
    var testing = false;
    var loadingModels = false;
    var listedModels = [];

    function readSettings() {
      if (provider && typeof provider.readSettings === "function") {
        return provider.readSettings();
      }

      return ME.aiProvider.readSettings();
    }

    function setStatus(message, type) {
      statusElement.textContent = message || "";
      statusElement.dataset.status = type || "";
    }

    function activeMode() {
      return modeServer.checked ? "server" : "mock";
    }

    function defaultServerUrl() {
      return provider && typeof provider.defaultServerUrl === "function"
        ? provider.defaultServerUrl()
        : "http://127.0.0.1:11434/v1/";
    }

    function displayServerUrl(endpoint) {
      return provider && typeof provider.serverBaseUrl === "function"
        ? provider.serverBaseUrl(endpoint || defaultServerUrl())
        : endpoint || defaultServerUrl();
    }

    function chatCompletionsEndpoint(endpoint) {
      return provider && typeof provider.chatCompletionsEndpoint === "function"
        ? provider.chatCompletionsEndpoint(endpoint || defaultServerUrl())
        : endpoint || defaultServerUrl();
    }

    function formSettings() {
      return {
        apiKey: apiKeyInput.value,
        endpoint: chatCompletionsEndpoint(endpointInput.value.trim()),
        mode: activeMode(),
        model: modelInput.value.trim()
      };
    }

    function modelListSettings() {
      return {
        apiKey: apiKeyInput.value,
        endpoint: endpointInput.value.trim() || defaultServerUrl(),
        mode: activeMode(),
        model: modelInput.value.trim()
      };
    }

    function hasServerInput(settings) {
      if (!endpointInput.value.trim()) {
        setStatus("Server URL is required for server mode.", "error");
        endpointInput.focus();
        return false;
      }

      if (!settings.model) {
        setStatus("Model is required for server mode.", "error");
        modelInput.focus();
        return false;
      }

      return true;
    }

    function updateFieldState() {
      var serverMode = activeMode() === "server";

      endpointInput.disabled = !serverMode;
      modelInput.disabled = !serverMode;
      apiKeyInput.disabled = !serverMode;
      testButton.disabled = testing || !serverMode;
      if (modelListButton) {
        modelListButton.disabled = loadingModels || !serverMode || !provider || typeof provider.listModels !== "function";
      }
      if (modelSelect) {
        modelSelect.disabled = !serverMode || !listedModels.length;
      }
    }

    function clearElement(element) {
      if (element) {
        element.innerHTML = "";
      }
    }

    function appendOption(select, value, label) {
      var option = document.createElement("option");

      option.value = value;
      option.textContent = label || value;
      select.appendChild(option);
    }

    function syncModelSelect() {
      if (!modelSelect) {
        return;
      }

      modelSelect.value = listedModels.indexOf(modelInput.value.trim()) > -1
        ? modelInput.value.trim()
        : "";
    }

    function setModelOptions(models) {
      listedModels = models.slice();
      clearElement(modelOptions);
      clearElement(modelSelect);

      if (modelOptions) {
        models.forEach(function (model) {
          appendOption(modelOptions, model);
        });
      }

      if (modelSelect) {
        appendOption(modelSelect, "", models.length ? "Choose loaded model" : "No models loaded");
        models.forEach(function (model) {
          appendOption(modelSelect, model);
        });
      }

      syncModelSelect();
    }

    async function listModels(options) {
      var settings = modelListSettings();
      var models;

      if (settings.mode === "mock" || !provider || typeof provider.listModels !== "function") {
        return;
      }

      if (!endpointInput.value.trim()) {
        endpointInput.value = defaultServerUrl();
      }

      loadingModels = true;
      updateFieldState();

      if (!options || !options.silent) {
        setStatus("Loading models.", "info");
      }

      try {
        models = await provider.listModels(settings);
        setModelOptions(models);
        if (!modelInput.value.trim() && models.length) {
          modelInput.value = models[0];
          syncModelSelect();
        }
        setStatus(models.length ? "Loaded " + models.length + " models." : "No models were returned.", models.length ? "success" : "error");
      } catch (error) {
        if (!options || !options.silent) {
          setStatus(ME.aiStatus.classifyError(error).detail, "error");
        }
      } finally {
        loadingModels = false;
        updateFieldState();
      }
    }

    function loadSettings() {
      var settings = readSettings();
      var hasEndpoint = Boolean(settings.endpoint);

      modeMock.checked = !hasEndpoint;
      modeServer.checked = hasEndpoint;
      endpointInput.value = displayServerUrl(settings.endpoint || defaultServerUrl());
      modelInput.value = hasEndpoint ? settings.model || "" : "";
      apiKeyInput.value = settings.apiKey || "";
      setModelOptions([]);
      setStatus(hasEndpoint ? "Server settings loaded." : "Local mock mode selected.", "info");
      updateFieldState();
      if (hasEndpoint) {
        listModels({ silent: true });
      }
    }

    function open() {
      loadSettings();
      overlay.hidden = false;
      window.requestAnimationFrame(function () {
        if (activeMode() === "server") {
          endpointInput.focus();
        } else {
          dialog.focus();
        }
      });
    }

    function close() {
      overlay.hidden = true;
      testing = false;
      loadingModels = false;
      updateFieldState();
      focusAfterClose();
    }

    async function testConnection() {
      var settings = formSettings();
      var result;
      var classification;

      if (settings.mode === "mock") {
        setStatus("Local mock mode does not use a server connection.", "success");
        return;
      }

      if (!hasServerInput(settings)) {
        return;
      }

      testing = true;
      updateFieldState();
      setStatus("Testing connection.", "info");

      try {
        result = await provider.testConnection(settings);
        setStatus("Connected. Model responded successfully. Click Save to use these settings.", "success");
        endpointInput.value = displayServerUrl(result.endpoint || settings.endpoint);
        modelInput.value = result.model || settings.model;
      } catch (error) {
        classification = ME.aiStatus.classifyError(error);
        setStatus(classification.detail, "error");
      } finally {
        testing = false;
        updateFieldState();
      }
    }

    function save() {
      var settings = formSettings();

      if (settings.mode === "server" && !hasServerInput(settings)) {
        return;
      }

      if (settings.mode === "mock") {
        provider.clearSettings();
      } else {
        provider.saveSettings(settings);
      }

      if (aiStatus) {
        aiStatus.refresh();
      }

      onSaved();
      close();
    }

    function handleEscape(event) {
      if (event.key === "Escape" && !overlay.hidden) {
        event.preventDefault();
        close();
      }
    }

    function bindEvents() {
      modeMock.addEventListener("change", updateFieldState);
      modeServer.addEventListener("change", function () {
        if (modeServer.checked && !endpointInput.value.trim()) {
          endpointInput.value = defaultServerUrl();
        }
        updateFieldState();
        listModels({ silent: true });
      });
      if (modelListButton) {
        modelListButton.addEventListener("click", function () {
          listModels();
        });
      }
      if (modelSelect) {
        modelSelect.addEventListener("change", function () {
          if (modelSelect.value) {
            modelInput.value = modelSelect.value;
          }
        });
      }
      modelInput.addEventListener("input", syncModelSelect);
      testButton.addEventListener("click", testConnection);
      saveButton.addEventListener("click", save);
      cancelButton.addEventListener("click", close);
      closeButton.addEventListener("click", close);

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        save();
      });

      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
          close();
        }
      });

      document.addEventListener("keydown", handleEscape);
    }

    return {
      bindEvents: bindEvents,
      close: close,
      isOpen: function () {
        return !overlay.hidden;
      },
      listModels: listModels,
      open: open,
      testConnection: testConnection
    };
  }

  ME.aiSettings = {
    create: createAiSettingsDialog
  };
}());
