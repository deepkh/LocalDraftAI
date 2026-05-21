(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var markdown = ME.markdown;

  var markdownText = "";
  var activeMode = "wysiwyg";
  var previewVisible = true;
  var syncTimer = 0;

  var workspace = document.getElementById("workspace");
  var wysiwygEditor = document.getElementById("wysiwygEditor");
  var markdownEditor = document.getElementById("markdownEditor");
  var preview = document.getElementById("preview");
  var previewPane = document.getElementById("previewPane");
  var paneResizer = document.getElementById("paneResizer");
  var wysiwygMode = document.getElementById("wysiwygMode");
  var markdownMode = document.getElementById("markdownMode");
  var modeLabel = document.getElementById("modeLabel");
  var wordCount = document.getElementById("wordCount");
  var charCount = document.getElementById("charCount");
  var formatBlock = document.getElementById("formatBlock");
  var togglePreview = document.getElementById("togglePreview");
  var previewStatus = document.getElementById("previewStatus");
  var toolbarButtons = Array.prototype.slice.call(document.querySelectorAll("[data-action]"));
  var undoButton = document.querySelector('[data-action="undo"]');
  var redoButton = document.querySelector('[data-action="redo"]');

  var history;
  var viewport;
  var actions;
  var resizer;

  function renderPreview() {
    var html = markdown.renderMarkdown(markdownText);
    preview.innerHTML = html || '<p class="preview-empty">Preview</p>';
  }

  function updateCounts() {
    var trimmed = markdownText.trim();
    var words = trimmed ? trimmed.split(/\s+/).length : 0;
    wordCount.textContent = words + (words === 1 ? " word" : " words");
    charCount.textContent = markdownText.length + (markdownText.length === 1 ? " char" : " chars");
  }

  function setMarkdown(value, source, options) {
    markdownText = String(value || "");
    if (source !== "textarea") {
      markdownEditor.value = markdownText;
    }
    renderPreview();
    updateCounts();

    if (!options || options.history !== false) {
      history.record(markdownText);
    } else {
      history.updateControls();
    }
  }

  function syncFromWysiwyg() {
    setMarkdown(markdown.htmlToMarkdown(wysiwygEditor), "wysiwyg");
  }

  function scheduleSyncFromWysiwyg() {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(syncFromWysiwyg, 0);
  }

  function updateModeControls() {
    var inWysiwyg = activeMode === "wysiwyg";
    wysiwygMode.classList.toggle("is-active", inWysiwyg);
    markdownMode.classList.toggle("is-active", !inWysiwyg);
    wysiwygMode.setAttribute("aria-pressed", String(inWysiwyg));
    markdownMode.setAttribute("aria-pressed", String(!inWysiwyg));
    wysiwygEditor.hidden = !inWysiwyg;
    markdownEditor.hidden = inWysiwyg;
    modeLabel.textContent = inWysiwyg ? "WYSIWYG" : "Markdown";
  }

  function focusActiveEditor() {
    if (activeMode === "wysiwyg") {
      wysiwygEditor.focus();
    } else {
      markdownEditor.focus();
    }
  }

  function flushActiveEditor() {
    if (activeMode === "wysiwyg") {
      window.clearTimeout(syncTimer);
      syncFromWysiwyg();
    } else {
      setMarkdown(markdownEditor.value, "textarea");
    }
  }

  function restoreMarkdownSnapshot(value, placeCaretAtEnd) {
    markdownText = String(value || "");
    markdownEditor.value = markdownText;
    renderPreview();
    updateCounts();

    if (activeMode === "wysiwyg") {
      wysiwygEditor.innerHTML = markdown.renderMarkdown(markdownText);
      wysiwygEditor.focus();
      placeCaretAtEnd(wysiwygEditor);
    } else {
      markdownEditor.focus();
      markdownEditor.selectionStart = markdownText.length;
      markdownEditor.selectionEnd = markdownText.length;
    }
  }

  function switchMode(mode) {
    if (mode === activeMode) {
      viewport.consumeModeSwitchAnchor();
      return;
    }

    var viewportAnchor = viewport.consumeModeSwitchAnchor();

    if (activeMode === "wysiwyg") {
      syncFromWysiwyg();
    } else {
      setMarkdown(markdownEditor.value, "textarea");
    }

    activeMode = mode;

    if (activeMode === "wysiwyg") {
      wysiwygEditor.innerHTML = markdown.renderMarkdown(markdownText);
    } else {
      markdownEditor.value = markdownText;
    }

    updateModeControls();

    window.requestAnimationFrame(function () {
      focusActiveEditor();
      window.requestAnimationFrame(function () {
        viewport.restore(viewportAnchor);
        window.requestAnimationFrame(function () {
          viewport.restore(viewportAnchor);
          viewport.remember();
        });
      });
    });
  }

  function togglePreviewPane() {
    previewVisible = !previewVisible;
    previewPane.hidden = !previewVisible;
    workspace.classList.toggle("preview-hidden", !previewVisible);
    togglePreview.setAttribute("aria-pressed", String(previewVisible));
    togglePreview.title = previewVisible ? "Hide preview" : "Show preview";
    previewStatus.textContent = previewVisible ? "Live" : "Hidden";
  }

  function bindEvents() {
    wysiwygMode.addEventListener("pointerdown", viewport.prepareModeSwitchAnchor);
    markdownMode.addEventListener("pointerdown", viewport.prepareModeSwitchAnchor);

    wysiwygMode.addEventListener("click", function () {
      switchMode("wysiwyg");
    });

    markdownMode.addEventListener("click", function () {
      switchMode("markdown");
    });

    togglePreview.addEventListener("click", togglePreviewPane);
    resizer.bindEvents();

    formatBlock.addEventListener("change", function () {
      if (activeMode === "markdown") {
        actions.applyMarkdownFormat(formatBlock.value);
        return;
      }
      actions.execWysiwyg("formatBlock", formatBlock.value);
    });

    toolbarButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        actions.applyToolbarAction(button.getAttribute("data-action"));
      });
    });

    window.addEventListener("scroll", viewport.scheduleTracking, { passive: true });
    wysiwygEditor.addEventListener("scroll", viewport.scheduleTracking, { passive: true });
    markdownEditor.addEventListener("scroll", viewport.scheduleTracking, { passive: true });

    wysiwygEditor.addEventListener("input", scheduleSyncFromWysiwyg);
    wysiwygEditor.addEventListener("keyup", actions.updateFormatSelect);
    wysiwygEditor.addEventListener("mouseup", actions.updateFormatSelect);

    wysiwygEditor.addEventListener("paste", function (event) {
      var data = event.clipboardData;
      if (!data) {
        return;
      }

      var html = data.getData("text/html");
      var text = data.getData("text/plain");
      event.preventDefault();

      if (html) {
        actions.insertHtmlAtSelection(markdown.sanitizePastedHtml(html));
      } else if (text) {
        document.execCommand("insertText", false, text);
        scheduleSyncFromWysiwyg();
      }
    });

    markdownEditor.addEventListener("input", function () {
      setMarkdown(markdownEditor.value, "textarea");
    });

    markdownEditor.addEventListener("paste", function (event) {
      var data = event.clipboardData;
      if (!data) {
        return;
      }

      event.preventDefault();
      actions.insertTextIntoTextarea(data.getData("text/plain") || "");
    });

    document.addEventListener("selectionchange", actions.updateFormatSelect);

    document.addEventListener("keydown", function (event) {
      var isModifier = event.metaKey || event.ctrlKey;
      if (!isModifier) {
        return;
      }

      var key = event.key.toLowerCase();

      if (key === "z" && !event.altKey) {
        event.preventDefault();
        history.applyStep(event.shiftKey ? 1 : -1);
      } else if (key === "y" && !event.altKey) {
        event.preventDefault();
        history.applyStep(1);
      } else if (key === "b") {
        event.preventDefault();
        actions.applyToolbarAction("bold");
      } else if (key === "i") {
        event.preventDefault();
        actions.applyToolbarAction("italic");
      }
    });
  }

  function init() {
    history = ME.history.create({
      flushActiveEditor: flushActiveEditor,
      focusActiveEditor: focusActiveEditor,
      redoButton: redoButton,
      restoreMarkdownSnapshot: restoreMarkdownSnapshot,
      undoButton: undoButton
    });

    viewport = ME.viewport.create({
      getActiveMode: function () { return activeMode; },
      getMarkdownText: function () { return markdownText; },
      markdownEditor: markdownEditor,
      wysiwygEditor: wysiwygEditor
    });

    actions = ME.editorActions.create({
      applyHistoryStep: history.applyStep,
      formatBlock: formatBlock,
      getActiveMode: function () { return activeMode; },
      markdownEditor: markdownEditor,
      scheduleSyncFromWysiwyg: scheduleSyncFromWysiwyg,
      setMarkdown: setMarkdown,
      wysiwygEditor: wysiwygEditor
    });

    resizer = ME.resizer.create({
      isPreviewVisible: function () { return previewVisible; },
      paneResizer: paneResizer,
      workspace: workspace
    });

    bindEvents();
    setMarkdown("", "init", { history: false });
    history.record("");
    updateModeControls();
    resizer.updateValue(workspace.querySelector(".editor-pane").getBoundingClientRect().width);
    viewport.remember();
    focusActiveEditor();
  }

  init();
}());
