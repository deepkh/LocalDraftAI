(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function createAiAssistant(context) {
    var actions = ME.aiActions;
    var guards = ME.markdownAiGuards;
    var provider = context.provider || ME.aiProvider.create();
    var markdownEditor = context.markdownEditor;
    var toolbarButton = context.toolbarButton;
    var toolbarMenu = context.toolbarMenu;
    var statusBadge = context.statusBadge;
    var reviewOverlay = context.reviewOverlay;
    var reviewDialog = context.reviewDialog;
    var reviewTitle = context.reviewTitle;
    var reviewStatus = context.reviewStatus;
    var reviewLog = context.reviewLog;
    var originalText = context.originalText;
    var resultTitle = context.resultTitle;
    var resultText = context.resultText;
    var applyButton = context.applyButton;
    var cancelButton = context.cancelButton;
    var closeButton = context.closeButton;
    var diffHideUnchanged = context.diffHideUnchanged;
    var diffInteractiveButton = context.diffInteractiveButton;
    var diffSideBySideButton = context.diffSideBySideButton;
    var diffSummary = context.diffSummary;
    var diffUnifiedButton = context.diffUnifiedButton;
    var diffView = context.diffView;
    var aiEngineSummary = context.aiEngineSummary;
    var aiEngineSummaryPill = context.aiEngineSummaryPill;
    var aiEngineSummaryDetail = context.aiEngineSummaryDetail;
    var aiEngineChangeSettingsButton = context.aiEngineChangeSettingsButton;
    var aiEngineAdvancedToggle = context.aiEngineAdvancedToggle;
    var aiEngineAdvancedPanel = context.aiEngineAdvancedPanel;
    var aiEngineOverrideModel = context.aiEngineOverrideModel;
    var aiEngineOverrideModelOptions = context.aiEngineOverrideModelOptions;
    var aiEngineOverrideReasoning = context.aiEngineOverrideReasoning;
    var aiEngineTemporaryOverride = context.aiEngineTemporaryOverride;
    var aiEngineAdvancedStatus = context.aiEngineAdvancedStatus;
    var aiEngineRegenerateButton = context.aiEngineRegenerateButton;
    var patchAcceptAllButton = context.patchAcceptAllButton;
    var patchRejectAllButton = context.patchRejectAllButton;
    var patchResetButton = context.patchResetButton;
    var diffMode = "side-by-side";
    var reviewState = null;
    var reviewLogResizeObserver = null;
    var contextMenu;
    var settingsDialog = null;
    var aiStatus = ME.aiStatus ? ME.aiStatus.create({
      onStatusChange: function (state) {
        renderStatusBadge(state);
        rerenderOpenToolbarMenu();
      },
      provider: provider
    }) : null;

    function readProviderSettings() {
      if (provider && typeof provider.readSettings === "function") {
        return provider.readSettings();
      }

      return ME.aiProvider.readSettings();
    }

    function resolveActionSettings(actionId, settings) {
      if (provider && typeof provider.resolveActionSettings === "function") {
        return provider.resolveActionSettings(actionId, settings);
      }

      if (ME.aiProvider && typeof ME.aiProvider.resolveActionSettings === "function") {
        return ME.aiProvider.resolveActionSettings(actionId, settings);
      }

      return settings;
    }

    function summarizeSettings(settings) {
      if (provider && typeof provider.summarizeSettings === "function") {
        return provider.summarizeSettings(settings);
      }

      if (ME.aiProvider && typeof ME.aiProvider.summarizeSettings === "function") {
        return ME.aiProvider.summarizeSettings(settings);
      }

      return {
        endpoint: settings && settings.endpoint || "",
        mode: settings && settings.endpoint ? "server" : "mock",
        model: settings && settings.model || "",
        providerLabel: settings && settings.providerLabel || (settings && settings.endpoint ? "AI provider" : "Local mock"),
        reasoningMode: settings && settings.reasoning && settings.reasoning.enabled ? settings.reasoning.effort : "off"
      };
    }

    function cloneSettings(settings) {
      var copy = Object.assign({}, settings || {});

      if (settings && settings.reasoning) {
        copy.reasoning = Object.assign({}, settings.reasoning);
      }

      return copy;
    }

    function currentActionTimeoutMs() {
      if (provider && typeof provider.actionTimeoutMs === "function") {
        return provider.actionTimeoutMs();
      }

      if (ME.aiProvider && typeof ME.aiProvider.actionTimeoutMs === "function") {
        return ME.aiProvider.actionTimeoutMs();
      }

      return 0;
    }

    function formatReasoningLabel(value) {
      var labels = {
        auto: "Auto",
        high: "High",
        low: "Low",
        medium: "Medium",
        off: "Off"
      };
      var key = String(value || "off").toLowerCase();

      return labels[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : "Off");
    }

    function renderAiEngineSummary(settingsSnapshot) {
      var summary;
      var model;
      var reasoningLabel;

      if (!aiEngineSummaryPill || !aiEngineSummaryDetail) {
        return;
      }

      summary = summarizeSettings(settingsSnapshot);
      if (aiEngineSummary) {
        aiEngineSummary.hidden = false;
      }

      if (summary.mode === "mock") {
        aiEngineSummaryPill.textContent = "Local mock · No reasoning";
        aiEngineSummaryDetail.textContent = "Current result was generated locally in mock mode. No server request was sent.";
        return;
      }

      model = summary.model || "No model";
      reasoningLabel = formatReasoningLabel(summary.reasoningMode);
      aiEngineSummaryPill.textContent = summary.providerLabel + " · " + model + " · Reasoning: " + reasoningLabel;
      aiEngineSummaryDetail.textContent = "Current result was generated by " + model + " using reasoning mode: " + reasoningLabel + ".";
    }

    function setAdvancedStatus(message, type) {
      if (!aiEngineAdvancedStatus) {
        return;
      }

      aiEngineAdvancedStatus.textContent = message || "";
      aiEngineAdvancedStatus.dataset.status = type || "";
    }

    function clearOptions(element) {
      if (element) {
        element.innerHTML = "";
      }
    }

    function appendOption(element, value) {
      var option;

      if (!element || !value) {
        return;
      }

      option = document.createElement("option");
      option.value = value;
      element.appendChild(option);
    }

    function setAdvancedControlsDisabled(disabled) {
      var summary = reviewState ? summarizeSettings(reviewState.usedSettings) : { mode: "mock" };
      var serverMode = summary.mode === "server";

      if (aiEngineOverrideModel) {
        aiEngineOverrideModel.disabled = disabled || !serverMode;
      }
      if (aiEngineOverrideReasoning) {
        aiEngineOverrideReasoning.disabled = disabled || !serverMode;
      }
      if (aiEngineTemporaryOverride) {
        aiEngineTemporaryOverride.disabled = disabled;
      }
      if (aiEngineRegenerateButton) {
        aiEngineRegenerateButton.disabled = disabled || !reviewState || !reviewState.result;
      }
    }

    function syncAdvancedPanel(settingsSnapshot) {
      var summary = summarizeSettings(settingsSnapshot);

      if (aiEngineOverrideModel) {
        aiEngineOverrideModel.value = summary.mode === "server" ? summary.model || "" : "";
      }
      clearOptions(aiEngineOverrideModelOptions);
      appendOption(aiEngineOverrideModelOptions, summary.model);
      if (aiEngineOverrideReasoning) {
        aiEngineOverrideReasoning.value = "default";
      }
      if (aiEngineTemporaryOverride) {
        aiEngineTemporaryOverride.checked = true;
      }
      setAdvancedStatus("", "");
      setAdvancedControlsDisabled(true);
      if (aiEngineAdvancedPanel) {
        aiEngineAdvancedPanel.hidden = true;
      }
      if (aiEngineAdvancedToggle) {
        aiEngineAdvancedToggle.setAttribute("aria-expanded", "false");
      }
    }

    function markAdvancedOverrideDirty() {
      if (!reviewState) {
        return;
      }

      reviewState.overrideDirty = true;
      setAdvancedStatus("Settings changed. Click Regenerate Result to update the AI output.", "warning");
    }

    function readAdvancedOverrideSettings() {
      return {
        model: aiEngineOverrideModel ? aiEngineOverrideModel.value.trim() : "",
        reasoningMode: aiEngineOverrideReasoning ? aiEngineOverrideReasoning.value : "default"
      };
    }

    function buildEffectiveSettings(baseSettings, overrideSettings) {
      var effective = cloneSettings(baseSettings);

      if (overrideSettings && overrideSettings.model) {
        effective.model = overrideSettings.model;
      }

      if (overrideSettings && overrideSettings.reasoningMode && overrideSettings.reasoningMode !== "default") {
        effective.reasoningMode = overrideSettings.reasoningMode;
        effective.reasoning = Object.assign({}, effective.reasoning || {}, {
          enabled: overrideSettings.reasoningMode !== "off",
          effort: overrideSettings.reasoningMode === "off" ? "off" : overrideSettings.reasoningMode
        });
      }

      return resolveActionSettings(reviewState ? reviewState.actionId : "", effective);
    }

    async function runProviderAction(actionId, text, settingsOverride) {
      var options = {
        settingsOverride: settingsOverride
      };
      var result;

      if (provider && typeof provider.runDetailed === "function") {
        result = await provider.runDetailed(actionId, text, options);
        return result && result.text !== undefined ? result : { text: String(result || "") };
      }

      result = provider && typeof provider.run === "function"
        ? await provider.run(actionId, text, options)
        : await ME.aiProvider.run(actionId, text, options);
      return {
        text: String(result || "")
      };
    }

    function nowTime() {
      return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    }

    function clearReviewLog() {
      if (reviewLog) {
        reviewLog.innerHTML = "";
      }
    }

    function scrollReviewLogToLatest() {
      if (!reviewLog) {
        return;
      }

      reviewLog.scrollTop = reviewLog.scrollHeight;
    }

    function isReviewLogResizeGrip(event) {
      var rect;

      if (!reviewLog || typeof reviewLog.getBoundingClientRect !== "function") {
        return false;
      }

      rect = reviewLog.getBoundingClientRect();
      return event.clientY >= rect.bottom - 18 && event.clientX >= rect.right - 18;
    }

    function allowReviewLogManualResize(event) {
      var maxHeight;

      if (!isReviewLogResizeGrip(event)) {
        return;
      }

      maxHeight = Math.max(120, Math.min(260, Math.floor(window.innerHeight * 0.36)));
      reviewLog.style.maxHeight = maxHeight + "px";
      window.requestAnimationFrame(scrollReviewLogToLatest);
    }

    function bindReviewLogResize() {
      if (!reviewLog) {
        return;
      }

      reviewLog.title = "Drag the lower-right corner to resize the action log.";
      reviewLog.addEventListener("pointerdown", allowReviewLogManualResize);

      if (!reviewLogResizeObserver && typeof window.ResizeObserver === "function") {
        reviewLogResizeObserver = new window.ResizeObserver(scrollReviewLogToLatest);
        reviewLogResizeObserver.observe(reviewLog);
      }
    }

    function setDiffModeButton(button, active) {
      if (!button) {
        return;
      }

      if (button.classList) {
        if (active) {
          button.classList.add("is-active");
        } else {
          button.classList.remove("is-active");
        }
      }
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }

    function setPatchToolbarButton(button, visible, disabled) {
      if (!button) {
        return;
      }

      button.hidden = !visible;
      button.disabled = Boolean(disabled);
    }

    function hasPatchChanges() {
      return Boolean(
        reviewState &&
        reviewState.patchChunks &&
        ME.aiPatch &&
        ME.aiPatch.summarizePatch(reviewState.patchChunks).totalChanges
      );
    }

    function updatePatchActionControls() {
      var visible = diffMode === "interactive";
      var disabled = !hasPatchChanges() || Boolean(applyButton && applyButton.disabled);

      setPatchToolbarButton(patchAcceptAllButton, visible, disabled);
      setPatchToolbarButton(patchRejectAllButton, visible, disabled);
      setPatchToolbarButton(patchResetButton, visible, disabled);
    }

    function updateDiffModeControls() {
      setDiffModeButton(diffSideBySideButton, diffMode === "side-by-side");
      setDiffModeButton(diffUnifiedButton, diffMode === "unified");
      setDiffModeButton(diffInteractiveButton, diffMode === "interactive");
      updatePatchActionControls();
    }

    function clearDiffView() {
      if (diffSummary) {
        diffSummary.textContent = "";
      }

      if (diffView) {
        diffView.textContent = "";
      }

      updateDiffModeControls();
    }

    function formatDiffSummary(summary) {
      if (!summary || (!summary.added && !summary.removed && !summary.changed)) {
        return "No differences.";
      }

      return "+ " + summary.added + " added   - " + summary.removed + " removed   ~ " + summary.changed + " changed";
    }

    function formatPatchSummary(summary) {
      if (!summary || !summary.totalChanges) {
        return "No differences.";
      }

      return summary.totalChanges + " changes total | " +
        summary.accepted + " accepted | " +
        summary.rejected + " rejected";
    }

    function rebuildPatchStateFromResult(result) {
      if (!reviewState || !ME.aiDiff || !ME.aiPatch) {
        return;
      }

      reviewState.result = String(result || "");
      reviewState.diffChunks = ME.aiDiff.diffText(reviewState.original, reviewState.result);
      reviewState.patchChunks = ME.aiPatch.createPatchChunks(reviewState.diffChunks);
      reviewState.acceptedResult = ME.aiPatch.buildAcceptedResult(reviewState.patchChunks);
    }

    function updateAcceptedResultFromPatch() {
      if (!reviewState || !ME.aiPatch || !reviewState.patchChunks) {
        return;
      }

      reviewState.acceptedResult = ME.aiPatch.buildAcceptedResult(reviewState.patchChunks);
    }

    function syncResultFieldForMode() {
      var nextValue;

      if (!resultText) {
        return;
      }

      if (diffMode === "interactive" && reviewState && reviewState.patchChunks) {
        if (resultTitle) {
          resultTitle.textContent = "Accepted Result Preview";
        }
        resultText.readOnly = true;
        nextValue = reviewState.acceptedResult || "";
        if (resultText.value !== nextValue) {
          resultText.value = nextValue;
        }
        applyButton.textContent = "Apply Accepted Changes";
        return;
      }

      if (resultTitle) {
        resultTitle.textContent = "AI Result";
      }
      resultText.readOnly = false;
      nextValue = reviewState ? reviewState.result : "";
      if (resultText.value !== nextValue) {
        resultText.value = nextValue;
      }
      applyButton.textContent = "Apply";
    }

    function renderBasicDiff(original, result, chunks) {
      var rendered;
      var summary;
      var options = {
        hideUnchanged: Boolean(diffHideUnchanged && diffHideUnchanged.checked)
      };

      updateDiffModeControls();

      if (!diffView || !ME.aiDiff) {
        return;
      }

      chunks = chunks || ME.aiDiff.diffText(original, result);
      summary = ME.aiDiff.summarizeDiff(chunks);
      if (diffSummary) {
        diffSummary.textContent = formatDiffSummary(summary);
      }

      diffView.textContent = "";
      rendered = diffMode === "unified"
        ? ME.aiDiff.renderUnifiedDiff(chunks, options)
        : ME.aiDiff.renderSideBySideDiff(chunks, options);
      if (rendered) {
        diffView.appendChild(rendered);
      }
    }

    function renderInteractiveDiff() {
      var rendered;
      var summary;
      var options;

      updateDiffModeControls();

      if (!diffView || !ME.aiPatch || !reviewState) {
        return;
      }

      updateAcceptedResultFromPatch();
      syncResultFieldForMode();
      summary = ME.aiPatch.summarizePatch(reviewState.patchChunks);
      if (diffSummary) {
        diffSummary.textContent = formatPatchSummary(summary);
      }

      options = {
        hideUnchanged: Boolean(diffHideUnchanged && diffHideUnchanged.checked),
        onChange: function (chunk, accepted) {
          ME.aiPatch.setChunkAccepted(reviewState.patchChunks, chunk.id, accepted);
          updateAcceptedResultFromPatch();
          renderReviewDiff();
        }
      };

      diffView.textContent = "";
      rendered = ME.aiPatch.renderInteractiveDiff(reviewState.patchChunks, options);
      if (rendered) {
        diffView.appendChild(rendered);
      }
    }

    function renderReviewDiff() {
      if (!reviewState) {
        updateDiffModeControls();
        return;
      }

      syncResultFieldForMode();

      if (diffMode === "interactive") {
        renderInteractiveDiff();
        return;
      }

      renderBasicDiff(reviewState.original, reviewState.result, reviewState.diffChunks);
    }

    function refreshDiffFromReview() {
      if (!reviewState) {
        updateDiffModeControls();
        return;
      }

      if (diffMode !== "interactive") {
        rebuildPatchStateFromResult(resultText.value);
      }

      renderReviewDiff();
    }

    function setDiffMode(mode) {
      if (reviewState && diffMode !== "interactive") {
        rebuildPatchStateFromResult(resultText.value);
      }

      diffMode = mode;
      if (reviewState && diffMode === "interactive" && !reviewState.patchChunks) {
        rebuildPatchStateFromResult(reviewState.result);
      }

      renderReviewDiff();
    }

    function setAllPatchChunks(accepted) {
      if (!reviewState || !ME.aiPatch || !reviewState.patchChunks) {
        return;
      }

      if (accepted) {
        ME.aiPatch.acceptAll(reviewState.patchChunks);
      } else {
        ME.aiPatch.rejectAll(reviewState.patchChunks);
      }

      updateAcceptedResultFromPatch();
      renderReviewDiff();
    }

    function appendReviewLog(message, type) {
      var item;
      var time;
      var text;

      if (!reviewLog) {
        return;
      }

      item = document.createElement("div");
      item.className = "ai-review-log-entry";
      if (type) {
        item.dataset.type = type;
      }
      time = document.createElement("span");
      time.className = "ai-review-log-time";
      time.textContent = "[" + nowTime() + "]";
      text = document.createElement("span");
      text.textContent = message;
      item.appendChild(time);
      item.appendChild(text);
      reviewLog.appendChild(item);
      scrollReviewLogToLatest();
    }

    function elapsedMs() {
      return reviewState && reviewState.startedAt ? Date.now() - reviewState.startedAt : 0;
    }

    function timeoutLabel(error) {
      return error && error.timeoutMs ? error.timeoutMs + " ms" : "the configured timeout";
    }

    function errorSuggestion(error) {
      if (error && error.code === "timeout") {
        return "Suggestion: check that the provider is reachable, the model is loaded, and the model is not still warming up.";
      }

      if (error && error.code === "network_error") {
        return "Suggestion: check the Base URL, CORS settings such as OLLAMA_ORIGINS, and whether the app is loaded from an allowed origin.";
      }

      if (error && error.status === 401 || error && error.status === 403) {
        return "Suggestion: check the API key and server permissions.";
      }

      if (error && error.status === 404) {
        return "Suggestion: check that the Base URL matches the selected provider.";
      }

      if (error && error.code === "empty_response") {
        return "Suggestion: try a different model or use Test Connection in AI Settings before running the action again.";
      }

      return "Suggestion: use AI Assistant Settings to test the provider, model, and Base URL.";
    }

    function renderStatusBadge(state) {
      if (!statusBadge || !state) {
        return;
      }

      statusBadge.dataset.status = state.status;
      statusBadge.textContent = state.label;
      statusBadge.title = state.detail;
      statusBadge.setAttribute("aria-label", "AI status: " + state.label + ". " + state.detail);
      toolbarButton.title = "AI Assistant - " + state.label;
    }

    function openSettingsDialog() {
      closeToolbarMenu();

      if (settingsDialog) {
        settingsDialog.open();
      }
    }

    function appendSeparator(menu) {
      var separator = document.createElement("div");

      separator.className = "ai-menu-separator";
      separator.setAttribute("role", "separator");
      menu.appendChild(separator);
    }

    function menuGuidanceText(selection) {
      if (guards.hasTextSelection(selection)) {
        return "";
      }

      return "Select text first.";
    }

    function appendStatusRow(container, label, value) {
      var row;
      var name;
      var text;

      if (!value) {
        return;
      }

      row = document.createElement("div");
      row.className = "ai-status-meta-row";
      name = document.createElement("span");
      name.textContent = label;
      text = document.createElement("span");
      text.textContent = value;
      row.appendChild(name);
      row.appendChild(text);
      container.appendChild(row);
    }

    function appendStatusSection(menu) {
      var state = aiStatus ? aiStatus.getState() : {
        detail: "AI status is unavailable.",
        endpoint: "",
        label: "Unknown",
        mode: "mock",
        model: "local-model",
        status: "not-configured"
      };
      var title = document.createElement("div");
      var panel = document.createElement("div");
      var line = document.createElement("div");
      var dot = document.createElement("span");
      var label = document.createElement("span");
      var detail = document.createElement("div");
      var meta = document.createElement("div");
      var guidance = menuGuidanceText(selectedRange());
      var guidanceElement;
      var testButton;
      var settingsButton;

      title.className = "ai-menu-title";
      title.textContent = "AI Assistant";
      menu.appendChild(title);

      panel.className = "ai-status-panel";
      panel.dataset.status = state.status;

      line.className = "ai-status-line";
      dot.className = "ai-status-dot";
      dot.setAttribute("aria-hidden", "true");
      label.textContent = state.label;
      line.appendChild(dot);
      line.appendChild(label);
      panel.appendChild(line);

      detail.className = "ai-status-detail";
      detail.textContent = state.detail;
      panel.appendChild(detail);

      meta.className = "ai-status-meta";
      appendStatusRow(meta, "Provider", state.providerLabel || (state.mode === "server" ? "OpenAI-compatible custom" : "Local mock"));
      appendStatusRow(meta, "Endpoint", state.endpoint);
      appendStatusRow(meta, "Model", state.model);
      panel.appendChild(meta);

      testButton = document.createElement("button");
      testButton.type = "button";
      testButton.className = "ai-menu-status-action";
      testButton.textContent = "Test Connection";
      testButton.disabled = !state.endpoint || state.status === "checking" || state.status === "running";
      testButton.addEventListener("click", function (event) {
        event.stopPropagation();
        if (aiStatus) {
          aiStatus.testConnection();
        }
      });
      panel.appendChild(testButton);

      settingsButton = document.createElement("button");
      settingsButton.type = "button";
      settingsButton.className = "ai-menu-status-action";
      settingsButton.textContent = "Settings";
      settingsButton.addEventListener("click", function (event) {
        event.stopPropagation();
        openSettingsDialog();
      });
      panel.appendChild(settingsButton);

      if (guidance) {
        guidanceElement = document.createElement("div");
        guidanceElement.className = "ai-menu-guidance";
        guidanceElement.textContent = guidance;
        panel.appendChild(guidanceElement);
      }

      menu.appendChild(panel);
      appendSeparator(menu);
    }

    function renderMenu(menu, onAction) {
      menu.innerHTML = "";
      appendStatusSection(menu);

      actions.groups().forEach(function (group, groupIndex) {
        if (groupIndex > 0) {
          appendSeparator(menu);
        }

        group.actions.forEach(function (action) {
          var item = document.createElement("button");
          item.type = "button";
          item.setAttribute("role", "menuitem");
          item.dataset.actionId = action.id;
          item.textContent = action.label;
          item.addEventListener("click", function () {
            onAction(action.id);
          });
          menu.appendChild(item);
        });
      });
    }

    function selectedRange() {
      if (context.captureSelection) {
        return context.captureSelection();
      }

      return guards.selectedRange(markdownEditor);
    }

    function closeToolbarMenu() {
      toolbarMenu.hidden = true;
      toolbarButton.setAttribute("aria-expanded", "false");
    }

    function positionToolbarMenu() {
      var buttonRect;
      var menuRect;
      var left;
      var top;

      if (toolbarMenu.hidden) {
        return;
      }

      buttonRect = toolbarButton.getBoundingClientRect();
      toolbarMenu.style.left = "0px";
      toolbarMenu.style.top = "0px";
      menuRect = toolbarMenu.getBoundingClientRect();
      left = Math.max(8, Math.min(buttonRect.right - menuRect.width, window.innerWidth - menuRect.width - 8));
      top = Math.max(8, Math.min(buttonRect.bottom + 6, window.innerHeight - menuRect.height - 8));
      toolbarMenu.style.left = left + "px";
      toolbarMenu.style.top = top + "px";
    }

    function handleToolbarAction(actionId) {
      closeToolbarMenu();
      requestAction(actionId, { source: "toolbar" });
    }

    function rerenderOpenToolbarMenu() {
      if (!toolbarMenu.hidden) {
        renderMenu(toolbarMenu, handleToolbarAction);
        positionToolbarMenu();
      }
    }

    function openToolbarMenu() {
      renderMenu(toolbarMenu, handleToolbarAction);
      toolbarMenu.hidden = false;
      positionToolbarMenu();
      toolbarButton.setAttribute("aria-expanded", "true");
    }

    function toggleToolbarMenu() {
      if (toolbarMenu.hidden) {
        openToolbarMenu();
      } else {
        closeToolbarMenu();
      }
    }

    function setReviewBusy(action, selection) {
      var settings = resolveActionSettings(action.id, readProviderSettings());
      var summary = summarizeSettings(settings);
      var mode = summary.mode;
      var selectionMode = selection && selection.mode ? selection.mode : context.getActiveMode();
      var markdownSelection = selectionMode === "markdown";
      var providerLabel = summary.providerLabel || (mode === "server" ? "AI provider" : "Local mock");

      diffMode = "side-by-side";
      reviewState = {
        actionId: action.id,
        end: markdownSelection ? selection.end : null,
        mode: mode,
        acceptedResult: "",
        diffChunks: null,
        original: selection.text,
        overrideDirty: false,
        overrideSettings: null,
        patchChunks: null,
        result: "",
        sessionId: context.getActiveSessionId(),
        startedAt: Date.now(),
        timeoutMs: currentActionTimeoutMs(),
        selection: selection,
        selectionMode: selectionMode,
        start: markdownSelection ? selection.start : null,
        usedSettings: settings
      };

      reviewTitle.textContent = action.label;
      reviewStatus.classList.remove("is-error");
      reviewStatus.textContent = reviewState.mode === "mock"
        ? "Local mock mode is processing."
        : "AI Assistant is processing.";
      clearReviewLog();
      appendReviewLog("Action started: " + action.label + ".");
      appendReviewLog("Selection length: " + selection.text.length + " characters.");
      appendReviewLog("Selection source: " + (selectionMode === "wysiwyg" ? "WYSIWYG editor." : "Markdown editor."));
      appendReviewLog("Provider: " + providerLabel + ".");
      if (selectionMode === "wysiwyg") {
        appendReviewLog("WYSIWYG selection was converted to Markdown before the AI request.");
      }
      if (mode === "server") {
        appendReviewLog("Endpoint: " + settings.endpoint + ".");
        appendReviewLog("Model: " + settings.model + ".");
        appendReviewLog("Reasoning mode: " + formatReasoningLabel(summary.reasoningMode) + ".");
        if (settings.reasoning && settings.reasoning.enabled && settings.reasoning.showSummary) {
          appendReviewLog("Reasoning summary: requested if the provider supports it.");
        }
        appendReviewLog("Waiting for AI server response.");
        if (reviewState.timeoutMs > 0) {
          appendReviewLog("Configured action timeout: " + reviewState.timeoutMs + " ms.");
        }
      } else {
        appendReviewLog("Local mock transform runs in the browser; no server request is sent.");
      }
      originalText.textContent = selection.text;
      resultText.value = "";
      resultText.disabled = true;
      resultText.readOnly = false;
      syncResultFieldForMode();
      clearDiffView();
      renderAiEngineSummary(settings);
      syncAdvancedPanel(settings);
      applyButton.disabled = true;
      cancelButton.disabled = true;
      reviewOverlay.hidden = false;
      window.requestAnimationFrame(function () {
        reviewDialog.focus();
      });
    }

    function setReviewResult(result, details) {
      if (!reviewState) {
        return;
      }

      rebuildPatchStateFromResult(result);
      reviewStatus.classList.remove("is-error");
      reviewStatus.textContent = reviewState.mode === "mock"
        ? "Result generated by local mock mode, not an AI server."
        : "AI result ready.";
      appendReviewLog("Action completed in " + elapsedMs() + " ms.", "success");
      if (details && details.reasoningSummary) {
        appendReviewLog("Reasoning summary: " + details.reasoningSummary, "info");
      }
      resultText.disabled = false;
      applyButton.disabled = false;
      cancelButton.disabled = false;
      setAdvancedControlsDisabled(false);
      renderReviewDiff();
      resultText.focus();
    }

    function setReviewError(error, classification) {
      var detail = classification && classification.detail
        ? classification.detail
        : error && error.message ? error.message : "AI Assistant failed.";

      reviewStatus.classList.add("is-error");
      reviewStatus.textContent = detail;
      if (error && error.code === "timeout") {
        appendReviewLog("Timeout after " + timeoutLabel(error) + ".", "error");
        appendReviewLog("Elapsed before timeout: " + elapsedMs() + " ms.", "warning");
      }
      appendReviewLog("Error after " + elapsedMs() + " ms: " + detail, "error");
      appendReviewLog(errorSuggestion(error), "warning");
      resultText.disabled = true;
      resultText.readOnly = false;
      applyButton.disabled = true;
      applyButton.textContent = "Apply";
      cancelButton.disabled = false;
      setAdvancedControlsDisabled(true);
      updateDiffModeControls();
      reviewDialog.focus();
    }

    function closeReview() {
      reviewOverlay.hidden = true;
      reviewState = null;
      diffMode = "side-by-side";
      resultText.value = "";
      resultText.readOnly = false;
      resultText.disabled = false;
      originalText.textContent = "";
      if (resultTitle) {
        resultTitle.textContent = "AI Result";
      }
      clearReviewLog();
      clearDiffView();
      if (aiEngineAdvancedPanel) {
        aiEngineAdvancedPanel.hidden = true;
      }
      if (aiEngineAdvancedToggle) {
        aiEngineAdvancedToggle.setAttribute("aria-expanded", "false");
      }
      setAdvancedStatus("", "");
      applyButton.disabled = true;
      applyButton.textContent = "Apply";
      cancelButton.disabled = false;
      context.focusActiveEditor();
    }

    function unavailableMessage() {
      return "AI Assistant works on selected text in the WYSIWYG editor or Markdown editor. Select text first.";
    }

    async function requestAction(actionId, options) {
      var action = actions.get(actionId);
      var range = options && options.selection ? options.selection : options && options.range ? options.range : selectedRange();
      var selectionMode = range && range.mode ? range.mode : context.getActiveMode();
      var result;
      var providerResult;

      if (contextMenu) {
        contextMenu.hide();
      }

      closeToolbarMenu();

      if (!action) {
        return;
      }

      if (!guards.canUseMarkdownSelection(selectionMode, range)) {
        if (!options || options.source === "toolbar") {
          window.alert(unavailableMessage());
        }
        context.focusActiveEditor();
        return;
      }

      setReviewBusy(action, range);

      try {
        if (aiStatus) {
          aiStatus.setRunning(action.label);
        }
        appendReviewLog("Request sent to provider.");
        providerResult = await runProviderAction(actionId, range.text, reviewState.usedSettings);
        result = providerResult.text;
        if (aiStatus) {
          aiStatus.setActionSuccess();
        }
        setReviewResult(result, providerResult);
      } catch (error) {
        setReviewError(error, aiStatus ? aiStatus.setActionError(error) : null);
      }
    }

    async function regenerateReviewResult() {
      var effectiveSettings;
      var providerResult;
      var result;
      var generationId;

      if (!reviewState) {
        return;
      }

      effectiveSettings = buildEffectiveSettings(reviewState.usedSettings, readAdvancedOverrideSettings());
      reviewState.overrideSettings = readAdvancedOverrideSettings();
      reviewState.startedAt = Date.now();
      reviewState.timeoutMs = currentActionTimeoutMs();
      generationId = (reviewState.generationId || 0) + 1;
      reviewState.generationId = generationId;

      resultText.disabled = true;
      applyButton.disabled = true;
      cancelButton.disabled = true;
      setAdvancedControlsDisabled(true);
      setAdvancedStatus("Regenerating result.", "info");
      appendReviewLog("Regenerating with model: " + (effectiveSettings.model || "local-model") + ".");
      appendReviewLog("Reasoning: " + formatReasoningLabel(summarizeSettings(effectiveSettings).reasoningMode) + ".");

      try {
        if (aiStatus) {
          aiStatus.setRunning(actions.get(reviewState.actionId).label);
        }
        providerResult = await runProviderAction(reviewState.actionId, reviewState.original, effectiveSettings);
        if (!reviewState || reviewState.generationId !== generationId) {
          return;
        }
        result = providerResult.text;
        reviewState.usedSettings = effectiveSettings;
        reviewState.overrideDirty = false;
        reviewState.result = String(result || "");
        rebuildPatchStateFromResult(reviewState.result);
        resultText.value = reviewState.result;
        resultText.disabled = false;
        cancelButton.disabled = false;
        applyButton.disabled = false;
        setAdvancedControlsDisabled(false);
        renderAiEngineSummary(effectiveSettings);
        renderReviewDiff();
        setAdvancedStatus("Result regenerated.", "success");
        appendReviewLog("Regenerate completed in " + elapsedMs() + " ms.", "success");
        if (providerResult.reasoningSummary) {
          appendReviewLog("Reasoning summary: " + providerResult.reasoningSummary, "info");
        }
        if (aiStatus) {
          aiStatus.setActionSuccess();
        }
      } catch (error) {
        if (!reviewState || reviewState.generationId !== generationId) {
          return;
        }
        setAdvancedStatus("Regenerate failed: " + (error && error.message ? error.message : "AI Assistant failed."), "error");
        setReviewError(error, aiStatus ? aiStatus.setActionError(error) : null);
      }
    }

    function applyReview() {
      var replacement;
      var renderedHtml;

      if (!reviewState) {
        return;
      }

      if (context.getActiveSessionId() !== reviewState.sessionId) {
        window.alert("The active document changed. Please run the AI action again.");
        closeReview();
        return;
      }

      if (diffMode === "interactive" && ME.aiPatch && reviewState.patchChunks) {
        updateAcceptedResultFromPatch();
        replacement = reviewState.acceptedResult;
      } else {
        replacement = resultText.value;
      }

      if (reviewState.selectionMode === "wysiwyg") {
        if (!context.insertHtmlAtSelection) {
          window.alert("WYSIWYG AI replacement is unavailable in this browser.");
          closeReview();
          return;
        }

        renderedHtml = context.renderMarkdownToHtml
          ? context.renderMarkdownToHtml(replacement)
          : (ME.markdown && typeof ME.markdown.renderMarkdown === "function"
            ? ME.markdown.renderMarkdown(replacement, 0, {})
            : replacement);
        context.insertHtmlAtSelection(renderedHtml, reviewState.selection);
        closeReview();
        return;
      }

      if (markdownEditor.value.slice(reviewState.start, reviewState.end) !== reviewState.original) {
        window.alert("The selected Markdown text changed. Please run the AI action again.");
        closeReview();
        return;
      }

      markdownEditor.setRangeText(replacement, reviewState.start, reviewState.end, "select");
      markdownEditor.selectionStart = reviewState.start;
      markdownEditor.selectionEnd = reviewState.start + replacement.length;
      context.setMarkdown(markdownEditor.value, "textarea");
      closeReview();
    }

    function closeTransientUi() {
      var handled = false;

      if (!toolbarMenu.hidden) {
        closeToolbarMenu();
        handled = true;
      }

      if (contextMenu && contextMenu.isOpen()) {
        contextMenu.hide();
        handled = true;
      }

      if (settingsDialog && settingsDialog.isOpen()) {
        settingsDialog.close();
        handled = true;
      }

      return handled;
    }

    function bindEvents() {
      toolbarButton.addEventListener("click", function (event) {
        event.stopPropagation();
        toggleToolbarMenu();
      });

      document.addEventListener("pointerdown", function (event) {
        if (!toolbarMenu.hidden && !toolbarMenu.contains(event.target) && event.target !== toolbarButton) {
          closeToolbarMenu();
        }
      });

      window.addEventListener("resize", positionToolbarMenu);
      window.addEventListener("scroll", positionToolbarMenu, { passive: true });
      bindReviewLogResize();

      applyButton.addEventListener("click", applyReview);
      cancelButton.addEventListener("click", closeReview);
      closeButton.addEventListener("click", closeReview);
      resultText.addEventListener("input", refreshDiffFromReview);

      if (aiEngineChangeSettingsButton) {
        aiEngineChangeSettingsButton.addEventListener("click", openSettingsDialog);
      }

      if (aiEngineAdvancedToggle && aiEngineAdvancedPanel) {
        aiEngineAdvancedToggle.addEventListener("click", function () {
          var expanded = aiEngineAdvancedPanel.hidden;

          aiEngineAdvancedPanel.hidden = !expanded;
          aiEngineAdvancedToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        });
      }

      if (aiEngineOverrideModel) {
        aiEngineOverrideModel.addEventListener("input", markAdvancedOverrideDirty);
      }

      if (aiEngineOverrideReasoning) {
        aiEngineOverrideReasoning.addEventListener("change", markAdvancedOverrideDirty);
      }

      if (aiEngineRegenerateButton) {
        aiEngineRegenerateButton.addEventListener("click", regenerateReviewResult);
      }

      if (diffSideBySideButton) {
        diffSideBySideButton.addEventListener("click", function () {
          setDiffMode("side-by-side");
        });
      }

      if (diffUnifiedButton) {
        diffUnifiedButton.addEventListener("click", function () {
          setDiffMode("unified");
        });
      }

      if (diffInteractiveButton) {
        diffInteractiveButton.addEventListener("click", function () {
          setDiffMode("interactive");
        });
      }

      if (diffHideUnchanged) {
        diffHideUnchanged.addEventListener("change", refreshDiffFromReview);
      }

      if (patchAcceptAllButton) {
        patchAcceptAllButton.addEventListener("click", function () {
          setAllPatchChunks(true);
        });
      }

      if (patchRejectAllButton) {
        patchRejectAllButton.addEventListener("click", function () {
          setAllPatchChunks(false);
        });
      }

      if (patchResetButton) {
        patchResetButton.addEventListener("click", function () {
          setAllPatchChunks(true);
        });
      }

      if (context.settings && ME.aiSettings) {
        settingsDialog = ME.aiSettings.create({
          aiStatus: aiStatus,
          apiKeyInput: context.settings.apiKeyInput,
          cancelButton: context.settings.cancelButton,
          closeButton: context.settings.closeButton,
          dialog: context.settings.dialog,
          endpointInput: context.settings.endpointInput,
          focusAfterClose: context.focusActiveEditor,
          form: context.settings.form,
          modeMock: context.settings.modeMock,
          modeServer: context.settings.modeServer,
          modelInput: context.settings.modelInput,
          modelListButton: context.settings.modelListButton,
          modelOptions: context.settings.modelOptions,
          modelSelect: context.settings.modelSelect,
          onSaved: rerenderOpenToolbarMenu,
          overlay: context.settings.overlay,
          provider: provider,
          providerHint: context.settings.providerHint,
          providerSelect: context.settings.providerSelect,
          reasoningEffort: context.settings.reasoningEffort,
          reasoningEffortLabel: context.settings.reasoningEffortLabel,
          reasoningEnabled: context.settings.reasoningEnabled,
          reasoningEnabledLabel: context.settings.reasoningEnabledLabel,
          reasoningLegend: context.settings.reasoningLegend,
          reasoningSummary: context.settings.reasoningSummary,
          reasoningSummaryLabel: context.settings.reasoningSummaryLabel,
          reasoningTokenBudget: context.settings.reasoningTokenBudget,
          reasoningTokenBudgetLabel: context.settings.reasoningTokenBudgetLabel,
          saveButton: context.settings.saveButton,
          statusElement: context.settings.statusElement,
          testButton: context.settings.testButton
        });
        settingsDialog.bindEvents();
      }

      contextMenu = ME.aiContextMenu.create({
        captureSelection: context.captureSelection,
        getActiveMode: context.getActiveMode,
        markdownEditor: markdownEditor,
        wysiwygEditor: context.wysiwygEditor,
        onAction: requestAction
      });
      contextMenu.bindEvents();

      if (aiStatus) {
        renderStatusBadge(aiStatus.getState());
        aiStatus.start();
      }
    }

    return {
      bindEvents: bindEvents,
      closeTransientUi: closeTransientUi,
      hideTransientUi: function () {
        closeToolbarMenu();
        if (contextMenu) {
          contextMenu.hide();
        }
        if (settingsDialog && settingsDialog.isOpen()) {
          settingsDialog.close();
        }
      },
      requestAction: requestAction
    };
  }

  ME.aiAssistant = {
    create: createAiAssistant
  };
}());
