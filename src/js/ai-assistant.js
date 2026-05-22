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
    var reviewOverlay = context.reviewOverlay;
    var reviewDialog = context.reviewDialog;
    var reviewTitle = context.reviewTitle;
    var reviewStatus = context.reviewStatus;
    var originalText = context.originalText;
    var resultText = context.resultText;
    var applyButton = context.applyButton;
    var cancelButton = context.cancelButton;
    var closeButton = context.closeButton;
    var reviewState = null;
    var contextMenu;

    function renderMenu(menu, onAction) {
      menu.innerHTML = "";

      actions.groups().forEach(function (group, groupIndex) {
        if (groupIndex === 0) {
          var title = document.createElement("div");
          title.className = "ai-menu-title";
          title.textContent = "AI Assistant";
          menu.appendChild(title);
        } else {
          var separator = document.createElement("div");
          separator.className = "ai-menu-separator";
          separator.setAttribute("role", "separator");
          menu.appendChild(separator);
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
      return guards.selectedRange(markdownEditor);
    }

    function closeToolbarMenu() {
      toolbarMenu.hidden = true;
      toolbarButton.setAttribute("aria-expanded", "false");
    }

    function openToolbarMenu() {
      renderMenu(toolbarMenu, function (actionId) {
        closeToolbarMenu();
        requestAction(actionId, { source: "toolbar" });
      });
      toolbarMenu.hidden = false;
      toolbarButton.setAttribute("aria-expanded", "true");
    }

    function toggleToolbarMenu() {
      if (toolbarMenu.hidden) {
        openToolbarMenu();
      } else {
        closeToolbarMenu();
      }
    }

    function setReviewBusy(action, range) {
      reviewState = {
        actionId: action.id,
        end: range.end,
        original: range.text,
        result: "",
        sessionId: context.getActiveSessionId(),
        start: range.start
      };

      reviewTitle.textContent = action.label;
      reviewStatus.classList.remove("is-error");
      reviewStatus.textContent = "AI Assistant is processing.";
      originalText.textContent = range.text;
      resultText.value = "";
      resultText.disabled = true;
      applyButton.disabled = true;
      reviewOverlay.hidden = false;
      window.requestAnimationFrame(function () {
        reviewDialog.focus();
      });
    }

    function setReviewResult(result) {
      if (!reviewState) {
        return;
      }

      reviewState.result = String(result || "");
      reviewStatus.classList.remove("is-error");
      reviewStatus.textContent = "AI result ready.";
      resultText.disabled = false;
      resultText.value = reviewState.result;
      applyButton.disabled = false;
      resultText.focus();
    }

    function setReviewError(error) {
      reviewStatus.classList.add("is-error");
      reviewStatus.textContent = error && error.message ? error.message : "AI Assistant failed.";
      resultText.disabled = true;
      applyButton.disabled = true;
      reviewDialog.focus();
    }

    function closeReview() {
      reviewOverlay.hidden = true;
      reviewState = null;
      resultText.value = "";
      originalText.textContent = "";
      applyButton.disabled = true;
      context.focusActiveEditor();
    }

    function unavailableMessage() {
      if (context.getActiveMode() !== "markdown") {
        return "AI Assistant only works in Markdown mode.";
      }

      return "Please select Markdown text first.";
    }

    async function requestAction(actionId, options) {
      var action = actions.get(actionId);
      var range = options && options.range ? options.range : selectedRange();
      var result;

      if (contextMenu) {
        contextMenu.hide();
      }

      closeToolbarMenu();

      if (!action) {
        return;
      }

      if (!guards.canUseMarkdownSelection(context.getActiveMode(), range)) {
        if (!options || options.source === "toolbar") {
          window.alert(unavailableMessage());
        }
        context.focusActiveEditor();
        return;
      }

      setReviewBusy(action, range);

      try {
        result = await provider.run(actionId, range.text);
        setReviewResult(result);
      } catch (error) {
        setReviewError(error);
      }
    }

    function applyReview() {
      var replacement;

      if (!reviewState) {
        return;
      }

      if (context.getActiveMode() !== "markdown" || context.getActiveSessionId() !== reviewState.sessionId) {
        window.alert("The active Markdown selection changed. Please run the AI action again.");
        closeReview();
        return;
      }

      if (markdownEditor.value.slice(reviewState.start, reviewState.end) !== reviewState.original) {
        window.alert("The selected Markdown text changed. Please run the AI action again.");
        closeReview();
        return;
      }

      replacement = resultText.value;
      markdownEditor.setRangeText(replacement, reviewState.start, reviewState.end, "select");
      markdownEditor.selectionStart = reviewState.start;
      markdownEditor.selectionEnd = reviewState.start + replacement.length;
      context.setMarkdown(markdownEditor.value, "textarea");
      closeReview();
    }

    function closeTransientUi() {
      var handled = false;

      if (!reviewOverlay.hidden) {
        closeReview();
        handled = true;
      }

      if (!toolbarMenu.hidden) {
        closeToolbarMenu();
        handled = true;
      }

      if (contextMenu && contextMenu.isOpen()) {
        contextMenu.hide();
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

      reviewOverlay.addEventListener("click", function (event) {
        if (event.target === reviewOverlay) {
          closeReview();
        }
      });

      applyButton.addEventListener("click", applyReview);
      cancelButton.addEventListener("click", closeReview);
      closeButton.addEventListener("click", closeReview);

      contextMenu = ME.aiContextMenu.create({
        getActiveMode: context.getActiveMode,
        markdownEditor: markdownEditor,
        onAction: requestAction
      });
      contextMenu.bindEvents();
    }

    return {
      bindEvents: bindEvents,
      closeTransientUi: closeTransientUi,
      hideTransientUi: function () {
        closeToolbarMenu();
        if (contextMenu) {
          contextMenu.hide();
        }
      },
      requestAction: requestAction
    };
  }

  ME.aiAssistant = {
    create: createAiAssistant
  };
}());
