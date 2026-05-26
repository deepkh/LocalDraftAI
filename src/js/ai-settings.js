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
    var providerSelect = context.providerSelect;
    var providerHint = context.providerHint;
    var endpointInput = context.endpointInput;
    var modelInput = context.modelInput;
    var modelListButton = context.modelListButton;
    var modelOptions = context.modelOptions;
    var modelSelect = context.modelSelect;
    var apiKeyInput = context.apiKeyInput;
    var reasoningLegend = context.reasoningLegend;
    var reasoningEnabled = context.reasoningEnabled;
    var reasoningEnabledLabel = context.reasoningEnabledLabel;
    var reasoningEffort = context.reasoningEffort;
    var reasoningEffortLabel = context.reasoningEffortLabel;
    var reasoningSummary = context.reasoningSummary;
    var reasoningSummaryLabel = context.reasoningSummaryLabel;
    var reasoningTokenBudget = context.reasoningTokenBudget;
    var reasoningTokenBudgetLabel = context.reasoningTokenBudgetLabel;
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

    function readSettings(overrides) {
      if (provider && typeof provider.readSettings === "function") {
        return provider.readSettings(overrides);
      }

      return ME.aiProvider.readSettings(overrides);
    }

    function listProviders() {
      if (provider && typeof provider.listProviders === "function") {
        return provider.listProviders();
      }

      return [
        {
          defaultBaseUrl: "",
          id: "mock",
          label: "Local mock",
          supportsModelList: false,
          supportsReasoning: false
        },
        {
          defaultBaseUrl: "http://127.0.0.1:11434/v1/",
          id: "openai-compatible",
          label: "OpenAI-compatible custom",
          supportsModelList: true,
          supportsReasoning: false
        }
      ];
    }

    function getProvider(providerId) {
      if (provider && typeof provider.getProvider === "function") {
        return provider.getProvider(providerId);
      }

      return listProviders().filter(function (item) {
        return item.id === providerId;
      })[0] || listProviders()[0];
    }

    function setStatus(message, type) {
      statusElement.textContent = message || "";
      statusElement.dataset.status = type || "";
    }

    function activeProviderId() {
      if (providerSelect) {
        return providerSelect.value || "mock";
      }

      return modeServer && modeServer.checked ? "openai-compatible" : "mock";
    }

    function activeMode() {
      return activeProviderId() === "mock" ? "mock" : "server";
    }

    function defaultBaseUrl(providerId) {
      var descriptor = getProvider(providerId || activeProviderId());

      if (provider && typeof provider.defaultBaseUrl === "function") {
        return provider.defaultBaseUrl(descriptor.id);
      }

      if (provider && typeof provider.defaultServerUrl === "function") {
        return provider.defaultServerUrl();
      }

      return descriptor.defaultBaseUrl || "http://127.0.0.1:11434/v1/";
    }

    function displayBaseUrl(settings) {
      if (settings && settings.baseUrl !== undefined) {
        return settings.baseUrl || defaultBaseUrl(settings.provider);
      }

      if (provider && typeof provider.serverBaseUrl === "function") {
        return provider.serverBaseUrl(settings && settings.endpoint || defaultBaseUrl());
      }

      return settings && settings.endpoint || defaultBaseUrl();
    }

    function reasoningSettingsFromForm() {
      var descriptor = getProvider(activeProviderId());

      return {
        enabled: Boolean(descriptor && descriptor.supportsReasoning && reasoningEnabled && reasoningEnabled.checked),
        effort: reasoningEffort ? reasoningEffort.value : "medium",
        showSummary: reasoningSummary ? reasoningSummary.checked : false,
        tokenBudget: reasoningTokenBudget ? reasoningTokenBudget.value : 2048
      };
    }

    function formSettings() {
      var providerId = activeProviderId();

      return {
        apiKey: apiKeyInput.value,
        baseUrl: endpointInput.value.trim(),
        endpoint: endpointInput.value.trim(),
        mode: providerId === "mock" ? "mock" : "server",
        model: modelInput.value.trim(),
        provider: providerId,
        reasoning: reasoningSettingsFromForm()
      };
    }

    function modelListSettings() {
      return formSettings();
    }

    function hasServerInput(settings) {
      if (settings.mode === "mock") {
        return true;
      }

      if (!endpointInput.value.trim()) {
        endpointInput.value = defaultBaseUrl(settings.provider);
      }

      if (!settings.model) {
        setStatus("Model is required for this provider.", "error");
        modelInput.focus();
        return false;
      }

      return true;
    }

    function updateProviderHint() {
      var descriptor = getProvider(activeProviderId());
      var hint = "";

      if (!providerHint || !descriptor) {
        return;
      }

      if (descriptor.id === "mock") {
        hint = "Runs deterministic local transforms in this browser.";
      } else if (descriptor.id === "ollama") {
        hint = "Uses Ollama native /api/chat and /api/tags endpoints.";
      } else if (descriptor.id === "openai-compatible") {
        hint = "Uses a custom /chat/completions server. Reasoning support depends on that server.";
      } else {
        hint = "Cloud API keys are stored only in this browser profile. A local proxy keeps keys out of browser storage.";
      }

      providerHint.textContent = hint;
    }

    function setText(element, value) {
      if (element) {
        element.textContent = value;
      }
    }

    function updateReasoningLabels() {
      var descriptor = getProvider(activeProviderId()) || {};

      setText(reasoningLegend, descriptor.reasoningLabel || "Reasoning");
      setText(reasoningEnabledLabel, descriptor.reasoningEnableLabel || "Enable reasoning mode");
      setText(reasoningEffortLabel, descriptor.reasoningEffortLabel || "Effort");
      setText(reasoningSummaryLabel, descriptor.reasoningSummaryLabel || "Show reasoning summary if supported");
      setText(reasoningTokenBudgetLabel, descriptor.reasoningTokenBudgetLabel || "Advanced token budget");
    }

    function updateFieldState() {
      var providerId = activeProviderId();
      var descriptor = getProvider(providerId);
      var serverMode = providerId !== "mock";
      var supportsReasoning = Boolean(serverMode && descriptor && descriptor.supportsReasoning);
      var supportsReasoningSummary = Boolean(supportsReasoning && descriptor.supportsReasoningSummary);
      var supportsReasoningBudget = Boolean(supportsReasoning && descriptor.supportsReasoningBudget);

      endpointInput.disabled = !serverMode;
      modelInput.disabled = !serverMode;
      apiKeyInput.disabled = !serverMode;
      testButton.disabled = testing || !serverMode;
      if (modelListButton) {
        modelListButton.disabled = loadingModels || !serverMode || !descriptor || !descriptor.supportsModelList || !provider || typeof provider.listModels !== "function";
      }
      if (modelSelect) {
        modelSelect.disabled = !serverMode || !listedModels.length;
      }
      if (reasoningEnabled) {
        reasoningEnabled.disabled = !supportsReasoning;
      }
      if (reasoningEffort) {
        reasoningEffort.disabled = !supportsReasoning || reasoningEnabled && !reasoningEnabled.checked;
      }
      if (reasoningSummary) {
        reasoningSummary.disabled = !supportsReasoningSummary || reasoningEnabled && !reasoningEnabled.checked;
      }
      if (reasoningTokenBudget) {
        reasoningTokenBudget.disabled = !supportsReasoningBudget || reasoningEnabled && !reasoningEnabled.checked;
      }
      updateProviderHint();
      updateReasoningLabels();
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

    function effortValue(option) {
      return option && typeof option === "object" ? option.value : option;
    }

    function effortLabel(option) {
      var value = effortValue(option);

      if (option && typeof option === "object" && option.label) {
        return option.label;
      }

      return {
        high: "High",
        low: "Low",
        medium: "Medium",
        minimal: "Minimal",
        xhigh: "Extra High"
      }[value] || value;
    }

    function reasoningEfforts(descriptor) {
      if (!descriptor || !descriptor.supportsReasoning) {
        return [];
      }

      return descriptor.reasoningEfforts && descriptor.reasoningEfforts.length
        ? descriptor.reasoningEfforts.slice()
        : ["minimal", "low", "medium", "high", "xhigh"];
    }

    function syncReasoningEffortOptions(preferredEffort) {
      var descriptor = getProvider(activeProviderId());
      var efforts = reasoningEfforts(descriptor);
      var preferred = preferredEffort || reasoningEffort && reasoningEffort.value || "medium";
      var nextValue;

      if (!reasoningEffort) {
        return;
      }

      clearElement(reasoningEffort);
      efforts.forEach(function (effort) {
        appendOption(reasoningEffort, effortValue(effort), effortLabel(effort));
      });

      if (!efforts.length) {
        reasoningEffort.value = "";
        return;
      }

      efforts = efforts.map(effortValue);
      nextValue = efforts.indexOf(preferred) > -1
        ? preferred
        : efforts.indexOf("medium") > -1 ? "medium" : efforts[0];
      reasoningEffort.value = nextValue;
    }

    function renderProviderOptions() {
      if (!providerSelect || providerSelect.options && providerSelect.options.length) {
        return;
      }

      listProviders().forEach(function (descriptor) {
        appendOption(providerSelect, descriptor.id, descriptor.label);
      });
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
        endpointInput.value = defaultBaseUrl(settings.provider);
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

    function setLegacyMode(providerId) {
      if (modeMock) {
        modeMock.checked = providerId === "mock";
      }
      if (modeServer) {
        modeServer.checked = providerId !== "mock";
      }
    }

    function setReasoningFields(settings) {
      var values = settings.reasoning || {};

      if (reasoningEnabled) {
        reasoningEnabled.checked = values.enabled !== false;
      }
      syncReasoningEffortOptions(values.effort);
      if (reasoningEffort) {
        if (values.effort && reasoningEffort.options && reasoningEffort.options.length) {
          syncReasoningEffortOptions(values.effort);
        }
      }
      if (reasoningSummary) {
        reasoningSummary.checked = Boolean(values.showSummary);
      }
      if (reasoningTokenBudget) {
        reasoningTokenBudget.value = values.tokenBudget || 2048;
      }
    }

    function loadSettings() {
      var settings = readSettings();
      var providerId = settings.provider || (settings.endpoint ? "openai-compatible" : "mock");
      var hasEndpoint = providerId !== "mock";

      renderProviderOptions();
      if (providerSelect) {
        providerSelect.value = providerId;
      }
      setLegacyMode(providerId);
      endpointInput.value = hasEndpoint ? displayBaseUrl(settings) : defaultBaseUrl("ollama");
      modelInput.value = hasEndpoint ? settings.model || "" : "";
      apiKeyInput.value = settings.apiKey || "";
      setReasoningFields(settings);
      setModelOptions([]);
      setStatus(hasEndpoint ? (settings.providerLabel || getProvider(providerId).label) + " settings loaded." : "Local mock selected.", "info");
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
        endpointInput.value = result.baseUrl || endpointInput.value || result.endpoint || settings.baseUrl;
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

    function handleProviderChange() {
      var providerId = activeProviderId();
      var descriptor = getProvider(providerId);

      setLegacyMode(providerId);
      setModelOptions([]);

      if (providerId === "mock") {
        modelInput.value = "";
        setStatus("Local mock selected.", "info");
      } else {
        endpointInput.value = descriptor.defaultBaseUrl || defaultBaseUrl(providerId);
        if (!modelInput.value.trim()) {
          modelInput.value = descriptor.defaultModel || "local-model";
        }
        setStatus(descriptor.label + " selected.", "info");
      }

      syncReasoningEffortOptions(reasoningEffort && reasoningEffort.value);
      updateFieldState();
      if (providerId !== "mock") {
        listModels({ silent: true });
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape" && !overlay.hidden) {
        event.preventDefault();
        close();
      }
    }

    function bindEvents() {
      renderProviderOptions();
      if (providerSelect) {
        providerSelect.addEventListener("change", handleProviderChange);
      }
      if (modeMock) {
        modeMock.addEventListener("change", function () {
          if (modeMock.checked && providerSelect) {
            providerSelect.value = "mock";
          }
          updateFieldState();
        });
      }
      if (modeServer) {
        modeServer.addEventListener("change", function () {
          if (modeServer.checked && providerSelect) {
            providerSelect.value = "openai-compatible";
          }
          if (modeServer.checked && !endpointInput.value.trim()) {
            endpointInput.value = defaultBaseUrl("openai-compatible");
          }
          updateFieldState();
          listModels({ silent: true });
        });
      }
      if (reasoningEnabled) {
        reasoningEnabled.addEventListener("change", updateFieldState);
      }
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
