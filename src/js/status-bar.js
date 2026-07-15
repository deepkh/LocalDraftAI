(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function textCounts(value) {
    var text = String(value || "");
    var trimmed = text.trim();
    var words = trimmed ? trimmed.split(/\s+/).length : 0;

    return {
      characters: text.length,
      words: words
    };
  }

  function createStatusBar(context) {
    var countTimer = 0;

    function setWorkspace(name) {
      var label = String(name || "").trim() || "No Workspace";

      context.workspace.textContent = label;
      context.workspace.title = "Current workspace: " + label;
    }

    function setDocument(state) {
      var dirty = Boolean(state && state.dirty);
      var title = String(state && state.title || "Untitled.md");

      context.document.textContent = dirty ? "Unsaved" : "";
      context.document.hidden = !dirty;
      context.document.title = dirty ? title + " has unsaved changes" : title;
    }

    function setMode(mode) {
      context.mode.textContent = mode === "markdown" ? "Markdown" : "WYSIWYG";
      context.mode.title = "Editor mode: " + context.mode.textContent;
    }

    function setSoftWrap(enabled) {
      context.softWrap.textContent = enabled ? "Wrap" : "No Wrap";
      context.softWrap.title = "Soft Wrap: " + (enabled ? "On" : "Off");
    }

    function renderCounts(value) {
      var counts = textCounts(value);

      context.wordCount.textContent = counts.words + (counts.words === 1 ? " word" : " words");
      context.charCount.textContent = counts.characters + (counts.characters === 1 ? " char" : " chars");
    }

    function scheduleCounts(value) {
      window.clearTimeout(countTimer);
      countTimer = window.setTimeout(function () {
        renderCounts(value);
      }, 80);
    }

    function setCursor(mode, value, offset) {
      var position;

      if (mode !== "markdown") {
        context.cursor.hidden = true;
        return;
      }

      position = ME.editorMode.getLineColumnFromOffset(value, offset);
      context.cursor.hidden = false;
      context.cursor.textContent = "Ln " + String(position.line + 1) + ", Col " + String(position.column + 1);
      context.cursor.title = "Cursor at line " + String(position.line + 1) + ", column " + String(position.column + 1);
    }

    function setAiStatus(state) {
      if (!state || !context.aiStatus) {
        return;
      }

      context.aiStatus.dataset.status = state.status;
      context.aiStatus.textContent = state.providerLabel
        ? state.providerLabel + " · " + state.label
        : state.label;
      context.aiStatus.title = state.detail || state.label;
      context.aiStatus.setAttribute("aria-label", "AI status: " + state.label + ". " + (state.detail || ""));
    }

    function showMessage(message, timeoutMs) {
      var text = String(message || "");

      context.message.textContent = text;
      context.message.hidden = !text;
      if (text && timeoutMs) {
        window.setTimeout(function () {
          if (context.message.textContent === text) {
            context.message.textContent = "";
            context.message.hidden = true;
          }
        }, timeoutMs);
      }
    }

    return {
      renderCounts: renderCounts,
      scheduleCounts: scheduleCounts,
      setAiStatus: setAiStatus,
      setCursor: setCursor,
      setDocument: setDocument,
      setMode: setMode,
      setSoftWrap: setSoftWrap,
      setWorkspace: setWorkspace,
      showMessage: showMessage
    };
  }

  ME.statusBar = {
    create: createStatusBar,
    textCounts: textCounts
  };
}());
