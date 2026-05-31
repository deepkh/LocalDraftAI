(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var markdown = ME.markdown;
  var fileStore = ME.fileStore;
  var workspaceStore = ME.workspaceStore;
  var assetStore = ME.assetStore;
  var recentStore = ME.recentFiles ? ME.recentFiles.create({ maxFiles: 10 }) : null;
  var editorMode = ME.editorMode;
  var EDITOR_MODES = editorMode.EDITOR_MODES;

  var tabs = null;
  var recentRecords = [];
  var focusModeEnabled = false;
  var syncTimer = 0;
  var wysiwygNeedsSync = false;
  var isSyncingEditors = false;
  var activeEditSource = null;
  var softWrapEnabled = editorMode.readStoredSoftWrap();

  var wysiwygEditor = document.getElementById("wysiwygEditor");
  var markdownEditor = document.getElementById("markdownEditor");
  var workspace = document.getElementById("workspace");
  var workspaceSidebarElement = document.getElementById("workspaceSidebar");
  var workspaceSidebarResizer = document.getElementById("workspaceSidebarResizer");
  var toggleEditorMode = document.getElementById("toggleEditorMode");
  var toggleSoftWrap = document.getElementById("toggleSoftWrap");
  var modeLabel = document.getElementById("modeLabel");
  var wordCount = document.getElementById("wordCount");
  var charCount = document.getElementById("charCount");
  var formatBlock = document.getElementById("formatBlock");
  var toggleFocusMode = document.getElementById("toggleFocusMode");
  var aboutButton = document.getElementById("aboutButton");
  var aboutOverlay = document.getElementById("aboutOverlay");
  var aboutDialog = document.querySelector(".about-dialog");
  var aboutClose = document.getElementById("aboutClose");
  var aiAssistantButton = document.getElementById("aiAssistantButton");
  var aiStatusBadge = document.getElementById("aiStatusBadge");
  var aiToolbarMenu = document.getElementById("aiToolbarMenu");
  var aiReviewOverlay = document.getElementById("aiReviewOverlay");
  var aiReviewDialog = document.getElementById("aiReviewDialog");
  var aiReviewTitle = document.getElementById("aiReviewTitle");
  var aiReviewStatus = document.getElementById("aiReviewStatus");
  var aiReviewLog = document.getElementById("aiReviewLog");
  var aiOriginalText = document.getElementById("aiOriginalText");
  var aiResultTitle = document.getElementById("aiResultTitle");
  var aiResultText = document.getElementById("aiResultText");
  var aiDiffSideBySideButton = document.getElementById("aiDiffSideBySideButton");
  var aiDiffUnifiedButton = document.getElementById("aiDiffUnifiedButton");
  var aiDiffInteractiveButton = document.getElementById("aiDiffInteractiveButton");
  var aiDiffHideUnchanged = document.getElementById("aiDiffHideUnchanged");
  var aiDiffSummary = document.getElementById("aiDiffSummary");
  var aiDiffView = document.getElementById("aiDiffView");
  var aiPatchAcceptAll = document.getElementById("aiPatchAcceptAll");
  var aiPatchRejectAll = document.getElementById("aiPatchRejectAll");
  var aiPatchReset = document.getElementById("aiPatchReset");
  var aiEngineSummary = document.getElementById("aiEngineSummary");
  var aiEngineSummaryPill = document.getElementById("aiEngineSummaryPill");
  var aiEngineSummaryDetail = document.getElementById("aiEngineSummaryDetail");
  var aiEngineChangeSettingsButton = document.getElementById("aiEngineChangeSettingsButton");
  var aiEngineAdvancedToggle = document.getElementById("aiEngineAdvancedToggle");
  var aiEngineAdvancedPanel = document.getElementById("aiEngineAdvancedPanel");
  var aiEngineOverrideModel = document.getElementById("aiEngineOverrideModel");
  var aiEngineOverrideModelOptions = document.getElementById("aiEngineOverrideModelOptions");
  var aiEngineOverrideReasoning = document.getElementById("aiEngineOverrideReasoning");
  var aiEngineTemporaryOverride = document.getElementById("aiEngineTemporaryOverride");
  var aiEngineAdvancedStatus = document.getElementById("aiEngineAdvancedStatus");
  var aiEngineRegenerateButton = document.getElementById("aiEngineRegenerateButton");
  var aiReviewApply = document.getElementById("aiReviewApply");
  var aiReviewCancel = document.getElementById("aiReviewCancel");
  var aiReviewClose = document.getElementById("aiReviewClose");
  var aiAssistantPanel = document.getElementById("aiAssistantPanel");
  var aiAssistantPanelBody = document.getElementById("aiAssistantPanelBody");
  var aiPanelResizeHandle = document.getElementById("aiPanelResizeHandle");
  var aiRevisionSection = document.getElementById("aiRevisionSection");
  var aiRevisionList = document.getElementById("aiRevisionList");
  var aiRevisionStatus = document.getElementById("aiRevisionStatus");
  var aiApplyModeInputs = Array.prototype.slice.call(document.querySelectorAll('input[name="aiApplyMode"]'));
  var aiApplyStatus = document.getElementById("aiApplyStatus");
  var aiApplyStatusText = document.getElementById("aiApplyStatusText");
  var aiRestoreOriginal = document.getElementById("aiRestoreOriginal");
  var aiSettingsOverlay = document.getElementById("aiSettingsOverlay");
  var aiSettingsDialog = document.getElementById("aiSettingsDialog");
  var aiSettingsForm = document.getElementById("aiSettingsForm");
  var aiModeMock = document.getElementById("aiModeMock");
  var aiModeServer = document.getElementById("aiModeServer");
  var aiProviderSelect = document.getElementById("aiProviderSelect");
  var aiProviderHint = document.getElementById("aiProviderHint");
  var aiEndpointInput = document.getElementById("aiEndpointInput");
  var aiModelInput = document.getElementById("aiModelInput");
  var aiModelListButton = document.getElementById("aiModelListButton");
  var aiModelOptions = document.getElementById("aiModelOptions");
  var aiModelSelect = document.getElementById("aiModelSelect");
  var aiApiKeyInput = document.getElementById("aiApiKeyInput");
  var aiReasoningEnabled = document.getElementById("aiReasoningEnabled");
  var aiReasoningEnabledLabel = document.getElementById("aiReasoningEnabledLabel");
  var aiReasoningEffort = document.getElementById("aiReasoningEffort");
  var aiReasoningEffortLabel = document.getElementById("aiReasoningEffortLabel");
  var aiReasoningLegend = document.getElementById("aiReasoningLegend");
  var aiReasoningSummary = document.getElementById("aiReasoningSummary");
  var aiReasoningSummaryLabel = document.getElementById("aiReasoningSummaryLabel");
  var aiReasoningTokenBudget = document.getElementById("aiReasoningTokenBudget");
  var aiReasoningTokenBudgetLabel = document.getElementById("aiReasoningTokenBudgetLabel");
  var aiPrivacySection = document.getElementById("aiPrivacySection");
  var aiCloudConsent = document.getElementById("aiCloudConsent");
  var aiSettingsStatus = document.getElementById("aiSettingsStatus");
  var aiSettingsTest = document.getElementById("aiSettingsTest");
  var aiSettingsSave = document.getElementById("aiSettingsSave");
  var aiSettingsCancel = document.getElementById("aiSettingsCancel");
  var aiSettingsClose = document.getElementById("aiSettingsClose");
  var documentTitle = document.getElementById("documentTitle");
  var newFileButton = document.getElementById("newFile");
  var openFileButton = document.getElementById("openFile");
  var saveFileButton = document.getElementById("saveFile");
  var saveAsFileButton = document.getElementById("saveAsFile");
  var recentFilesSelect = document.getElementById("recentFiles");
  var workspaceButton = document.getElementById("workspaceButton");
  var workspaceMenu = document.getElementById("workspaceMenu");
  var openWorkspaceFolderButton = document.getElementById("openWorkspaceFolder");
  var refreshWorkspaceButton = document.getElementById("refreshWorkspace");
  var closeWorkspaceButton = document.getElementById("closeWorkspace");
  var showWorkspaceSidebarButton = document.getElementById("showWorkspaceSidebar");
  var hideWorkspaceSidebarButton = document.getElementById("hideWorkspaceSidebar");
  var minimizeWorkspaceSidebarButton = document.getElementById("minimizeWorkspaceSidebar");
  var tabViewport = document.getElementById("tabViewport");
  var tabList = document.getElementById("tabList");
  var tabScrollLeft = document.getElementById("tabScrollLeft");
  var tabScrollRight = document.getElementById("tabScrollRight");
  var newTabButton = document.getElementById("newTabButton");
  var editorToolbar = document.querySelector(".toolbar");
  var toolbarButtons = Array.prototype.slice.call(document.querySelectorAll("[data-action]"));
  var insertImageButton = document.querySelector('[data-action="image"]');
  var undoButton = document.querySelector('[data-action="undo"]');
  var redoButton = document.querySelector('[data-action="redo"]');

  var viewport;
  var aiPanelResizer;
  var actions;
  var aiAssistant;
  var workspaceSidebar;
  var nextWorkspaceId = 1;
  var workspaceState = {
    id: "",
    rootHandle: null,
    rootName: "",
    files: [],
    tree: null,
    isScanning: false,
    error: ""
  };
  var suppressNextTabClick = false;
  var tabDrag = {
    active: false,
    started: false,
    sessionId: null,
    startX: 0,
    startY: 0,
    pointerId: null,
    dropSessionId: null,
    dropPosition: null
  };

  function getActiveSession() {
    return tabs ? tabs.getActiveSession() : null;
  }

  function getMarkdownText() {
    var session = getActiveSession();
    return session ? session.markdownText : "";
  }

  function getActiveMode() {
    var session = getActiveSession();
    return editorMode.normalizeEditorMode(session ? session.editorMode || session.activeMode : editorMode.readStoredEditorMode());
  }

  function getEditorMode() {
    return getActiveMode();
  }

  function setActiveEditorSource(source) {
    var session = getActiveSession();
    var normalized = editorMode.normalizeEditorMode(source);

    activeEditSource = normalized;
    if (session) {
      session.editorMode = normalized;
      session.activeMode = normalized;
      session.activeEditorSource = normalized;
    }
    if (modeLabel) {
      modeLabel.textContent = normalized === "markdown" ? "Markdown" : "WYSIWYG";
    }
    if (actions) {
      actions.updateFormatSelect();
    }
  }

  function getActiveHistory() {
    var session = getActiveSession();
    return session ? session.history : null;
  }

  function isFileAccessSupported() {
    return fileStore && fileStore.isSupported();
  }

  function isWorkspaceSupported() {
    return workspaceStore && workspaceStore.isSupported();
  }

  function isImagePickerSupported() {
    return assetStore && assetStore.isImagePickerSupported();
  }

  function resolveImageUrl(src) {
    var session = getActiveSession();

    if (
      session &&
      session.assetObjectUrls &&
      session.assetObjectUrls[src]
    ) {
      return session.assetObjectUrls[src];
    }

    return src;
  }

  function renderMarkdownForSession(markdownText) {
    return markdown.renderMarkdown(markdownText, 0, {
      resolveImageUrl: resolveImageUrl
    });
  }

  function getActiveEditorElement() {
    return getActiveMode() === "markdown" ? markdownEditor : wysiwygEditor;
  }

  function getWysiwygCaretTextOffset(root) {
    var selection = window.getSelection();
    var range;
    var preRange;

    if (!selection || !selection.rangeCount) {
      return 0;
    }

    range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      return 0;
    }

    preRange = range.cloneRange();
    preRange.selectNodeContents(root);
    preRange.setEnd(range.endContainer, range.endOffset);
    return preRange.toString().length;
  }

  function getWysiwygCaretTextHint(root) {
    var selection = window.getSelection();
    var range;
    var node;
    var offset;
    var text;

    if (!selection || !selection.rangeCount) {
      return null;
    }

    range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      return null;
    }

    node = range.endContainer;
    offset = range.endOffset;
    if (node && node.nodeType !== Node.TEXT_NODE) {
      node = node.childNodes[offset] || node.childNodes[offset - 1] || node;
      if (node && node.nodeType !== Node.TEXT_NODE) {
        text = node.textContent || "";
        offset = Math.min(offset, text.length);
      }
    }

    text = node && node.nodeType === Node.TEXT_NODE ? node.nodeValue || "" : text || "";
    if (!text) {
      return null;
    }

    return {
      after: text.slice(offset, offset + 48).trim(),
      before: text.slice(Math.max(0, offset - 48), offset).trim(),
      text: text.trim()
    };
  }

  function placeCaretAtEnd(element) {
    var range = document.createRange();
    var selection = window.getSelection();

    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function placeCaretAtStart(element) {
    var range = document.createRange();
    var selection = window.getSelection();

    range.selectNodeContents(element);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function restoreWysiwygCaretByTextOffset(root, targetOffset) {
    return restoreWysiwygCaretWithinElement(root, targetOffset);
  }

  function restoreWysiwygCaretWithinElement(root, targetOffset) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var current = 0;
    var node;
    var next;
    var range;
    var selection;

    targetOffset = Math.max(0, Number(targetOffset) || 0);
    while ((node = walker.nextNode())) {
      next = current + node.nodeValue.length;
      if (targetOffset <= next) {
        range = document.createRange();
        selection = window.getSelection();
        range.setStart(node, Math.max(0, targetOffset - current));
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }
      current = next;
    }

    placeCaretAtEnd(root);
    return false;
  }

  function closestMarkdownLineElement(node) {
    while (node && node !== wysiwygEditor) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        node.hasAttribute &&
        node.hasAttribute("data-md-line")
      ) {
        return node;
      }
      node = node.parentNode;
    }

    return null;
  }

  function wysiwygCaretLineAnchor(root) {
    var selection = window.getSelection();
    var range;
    var lineElement;
    var preRange;
    var line;

    if (!selection || !selection.rangeCount) {
      return null;
    }

    range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      return null;
    }

    lineElement = closestMarkdownLineElement(range.endContainer);
    if (!lineElement) {
      return null;
    }

    line = Number(lineElement.getAttribute("data-md-line"));
    if (!Number.isFinite(line)) {
      return null;
    }

    preRange = range.cloneRange();
    preRange.selectNodeContents(lineElement);
    preRange.setEnd(range.endContainer, range.endOffset);
    return {
      column: preRange.toString().length,
      line: line
    };
  }

  function findWysiwygLineElement(line) {
    var elements = Array.prototype.slice.call(wysiwygEditor.querySelectorAll("[data-md-line]"));
    var selected = null;

    elements.forEach(function (element) {
      var elementLine = Number(element.getAttribute("data-md-line"));

      if (!Number.isFinite(elementLine) || elementLine > line) {
        return;
      }

      if (!selected || elementLine > selected.line) {
        selected = {
          element: element,
          line: elementLine
        };
      } else if (selected.line === elementLine && selected.element.contains(element)) {
        selected = {
          element: element,
          line: elementLine
        };
      }
    });

    return selected ? selected.element : null;
  }

  function restoreScrollRatio(element, anchor) {
    var maxOld;
    var maxNew;
    var ratio;

    if (!element || !anchor || !anchor.scrollHeight) {
      return;
    }

    maxOld = Math.max(1, anchor.scrollHeight - anchor.clientHeight);
    maxNew = Math.max(1, element.scrollHeight - element.clientHeight);
    ratio = (anchor.scrollTop || 0) / maxOld;
    element.scrollTop = Math.round(maxNew * ratio);
  }

  function captureMarkdownAnchor() {
    var text = markdownEditor.value;
    var start = markdownEditor.selectionStart || 0;
    var lineColumn = editorMode.getLineColumnFromOffset(text, start);
    var lines = text.split("\n");

    return {
      clientHeight: markdownEditor.clientHeight,
      column: lineColumn.column,
      line: lineColumn.line,
      lineText: lines[lineColumn.line] || "",
      markdownOffset: start,
      markdownSelectionEnd: markdownEditor.selectionEnd || start,
      scrollHeight: markdownEditor.scrollHeight,
      scrollTop: markdownEditor.scrollTop,
      source: "markdown",
      visibleTextOffset: editorMode.markdownOffsetToVisibleTextOffset(text, start)
    };
  }

  function captureWysiwygAnchor() {
    var lineAnchor = wysiwygCaretLineAnchor(wysiwygEditor);

    return {
      clientHeight: wysiwygEditor.clientHeight,
      column: lineAnchor ? lineAnchor.column : null,
      line: lineAnchor ? lineAnchor.line : null,
      scrollHeight: wysiwygEditor.scrollHeight,
      scrollTop: wysiwygEditor.scrollTop,
      source: "wysiwyg",
      textHint: getWysiwygCaretTextHint(wysiwygEditor),
      visibleTextOffset: getWysiwygCaretTextOffset(wysiwygEditor)
    };
  }

  function captureEditorAnchor(mode) {
    return editorMode.normalizeEditorMode(mode) === EDITOR_MODES.MARKDOWN
      ? captureMarkdownAnchor()
      : captureWysiwygAnchor();
  }

  function captureActiveEditorState() {
    var mode = getActiveMode();
    var state = {
      anchor: captureEditorAnchor(mode),
      mode: mode
    };
    var selection;
    var range;

    if (mode === EDITOR_MODES.MARKDOWN) {
      state.selectionStart = markdownEditor.selectionStart || 0;
      state.selectionEnd = markdownEditor.selectionEnd || state.selectionStart;
      return state;
    }

    selection = window.getSelection();
    range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    if (range && wysiwygEditor.contains(range.commonAncestorContainer)) {
      state.range = range.cloneRange();
    }

    return state;
  }

  function findMarkdownOffsetFromTextHint(markdownText, textHint) {
    var text = String(markdownText || "");
    var lines = text.split("\n");
    var offset = 0;
    var before = textHint && textHint.before;
    var after = textHint && textHint.after;
    var fullText = textHint && textHint.text;
    var i;
    var line;
    var index;

    for (i = 0; i < lines.length; i += 1) {
      line = lines[i];
      if (before) {
        index = line.indexOf(before);
        if (index !== -1) {
          return offset + index + before.length;
        }
      }
      if (after) {
        index = line.indexOf(after);
        if (index !== -1) {
          return offset + index;
        }
      }
      if (fullText) {
        index = line.indexOf(fullText.slice(0, Math.min(48, fullText.length)));
        if (index !== -1) {
          return offset + index;
        }
      }
      offset += line.length + 1;
    }

    return null;
  }

  function restoreMarkdownAnchor(anchor) {
    var text = markdownEditor.value;
    var offset = 0;
    var hintedOffset;
    var lineOffset;
    var lines;

    hintedOffset = anchor && anchor.source === "wysiwyg" ? findMarkdownOffsetFromTextHint(text, anchor.textHint) : null;

    if (
      anchor &&
      anchor.source === "wysiwyg" &&
      typeof anchor.line === "number" &&
      typeof anchor.column === "number"
    ) {
      lines = text.split("\n");
      lineOffset = editorMode.visibleTextOffsetToMarkdownOffset(lines[anchor.line] || "", anchor.column);
      offset = editorMode.getOffsetFromLineColumn(text, anchor.line, lineOffset);
    } else if (typeof hintedOffset === "number") {
      offset = hintedOffset;
    } else if (anchor && typeof anchor.markdownOffset === "number") {
      offset = Math.min(anchor.markdownOffset, text.length);
    } else if (anchor && typeof anchor.visibleTextOffset === "number") {
      offset = editorMode.visibleTextOffsetToMarkdownOffset(text, anchor.visibleTextOffset);
    } else if (anchor && typeof anchor.line === "number") {
      offset = editorMode.getOffsetFromLineColumn(text, anchor.line, anchor.column || 0);
    }

    markdownEditor.selectionStart = offset;
    markdownEditor.selectionEnd = offset;
    restoreScrollRatio(markdownEditor, anchor);
  }

  function restoreWysiwygAnchor(anchor) {
    var visibleTextOffset = anchor && typeof anchor.visibleTextOffset === "number"
      ? anchor.visibleTextOffset
      : editorMode.markdownOffsetToVisibleTextOffset(getMarkdownText(), anchor ? anchor.markdownOffset || 0 : 0);
    var lineElement;
    var lineColumn;

    if (anchor && anchor.source === "markdown" && typeof anchor.line === "number") {
      lineElement = findWysiwygLineElement(anchor.line);
      if (lineElement) {
        lineColumn = editorMode.markdownOffsetToVisibleTextOffset(anchor.lineText || "", anchor.column || 0);
        if (restoreWysiwygCaretWithinElement(lineElement, lineColumn)) {
          restoreScrollRatio(wysiwygEditor, anchor);
          return;
        }
      }
    }

    restoreWysiwygCaretByTextOffset(wysiwygEditor, visibleTextOffset);
    restoreScrollRatio(wysiwygEditor, anchor);
  }

  function restoreActiveEditorState(state) {
    var selection;

    if (!state || state.mode !== getActiveMode()) {
      focusActiveEditor();
      return;
    }

    if (state.mode === EDITOR_MODES.MARKDOWN) {
      markdownEditor.focus();
      restoreMarkdownAnchor(state.anchor);
      markdownEditor.selectionStart = typeof state.selectionStart === "number" ? state.selectionStart : markdownEditor.selectionStart;
      markdownEditor.selectionEnd = typeof state.selectionEnd === "number" ? state.selectionEnd : markdownEditor.selectionStart;
      if (state.anchor && typeof state.anchor.scrollTop === "number") {
        markdownEditor.scrollTop = state.anchor.scrollTop;
      }
      return;
    }

    wysiwygEditor.focus();
    if (state.range && wysiwygEditor.contains(state.range.commonAncestorContainer)) {
      try {
        selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(state.range);
      } catch (error) {
        restoreWysiwygAnchor(state.anchor);
      }
    } else {
      restoreWysiwygAnchor(state.anchor);
    }
    if (state.anchor && typeof state.anchor.scrollTop === "number") {
      wysiwygEditor.scrollTop = state.anchor.scrollTop;
    }
  }

  function saveActiveEditorState(session) {
    var markdownAnchor;

    if (!session) {
      return;
    }

    session.wysiwygScrollTop = wysiwygEditor.scrollTop;
    session.markdownScrollTop = markdownEditor.scrollTop;
    if (getEditorMode() === EDITOR_MODES.MARKDOWN) {
      markdownAnchor = captureMarkdownAnchor();
      session.markdownSelectionStart = markdownAnchor.markdownOffset;
      session.markdownSelectionEnd = markdownAnchor.markdownSelectionEnd;
      session.lastKnownLine = markdownAnchor.line;
      session.lastKnownColumn = markdownAnchor.column;
    } else {
      session.wysiwygTextOffset = getWysiwygCaretTextOffset(wysiwygEditor);
    }
  }

  function capturePaneScrollState() {
    var editor = getActiveEditorElement();

    return {
      editor: editor,
      editorScrollTop: editor.scrollTop,
      wysiwygScrollTop: wysiwygEditor.scrollTop,
      markdownScrollTop: markdownEditor.scrollTop,
      windowScrollX: window.scrollX,
      windowScrollY: window.scrollY
    };
  }

  function restorePaneScrollState(scrollState) {
    if (!scrollState) {
      return;
    }

    if (viewport && viewport.suppressScrollSync) {
      viewport.suppressScrollSync();
    }

    scrollState.editor.scrollTop = scrollState.editorScrollTop;
    wysiwygEditor.scrollTop = scrollState.wysiwygScrollTop;
    markdownEditor.scrollTop = scrollState.markdownScrollTop;
    window.scrollTo(scrollState.windowScrollX, scrollState.windowScrollY);
  }

  function renderWysiwygFromMarkdown(options) {
    var scrollState;
    var html = renderMarkdownForSession(getMarkdownText());

    options = options || {};
    if (options.preservePaneScroll) {
      scrollState = capturePaneScrollState();
    }

    if (document.activeElement === wysiwygEditor && options.force !== true) {
      return;
    }

    if (viewport && options.preservePaneScroll && viewport.suppressScrollSync) {
      viewport.suppressScrollSync();
    }

    isSyncingEditors = true;
    wysiwygEditor.innerHTML = html;
    isSyncingEditors = false;
    wysiwygNeedsSync = false;

    if (scrollState) {
      restorePaneScrollState(scrollState);
      window.requestAnimationFrame(function () {
        restorePaneScrollState(scrollState);
      });
    }
  }

  function updateCounts() {
    var text = getMarkdownText();
    var trimmed = text.trim();
    var words = trimmed ? trimmed.split(/\s+/).length : 0;

    wordCount.textContent = words + (words === 1 ? " word" : " words");
    charCount.textContent = text.length + (text.length === 1 ? " char" : " chars");
  }

  function updateDocumentTitle() {
    var session = getActiveSession();
    var title = session ? session.title : "Untitled.md";
    var displayTitle = (session && session.dirty ? "* " : "") + title;

    documentTitle.textContent = displayTitle;
    documentTitle.title = session && session.dirty ? title + " has unsaved changes" : title;
    document.title = displayTitle + " - LocalDraftAI";
  }

  function updateDirtyState() {
    var session = getActiveSession();
    var history = getActiveHistory();
    var wasDirty;

    if (!session || !history) {
      return;
    }

    wasDirty = session.dirty;
    session.dirty = !history.isClean();
    updateDocumentTitle();
    if (wasDirty !== session.dirty) {
      renderTabs();
    }
  }

  function markSessionClean() {
    var session = getActiveSession();
    var history = getActiveHistory();

    if (!session || !history) {
      return;
    }

    history.markClean(session.markdownText);
    session.dirty = false;
    updateDocumentTitle();
    renderTabs();
  }

  function createSessionHistory() {
    return ME.history.create({
      flushActiveEditor: flushActiveEditor,
      focusActiveEditor: focusActiveEditor,
      redoButton: redoButton,
      restoreMarkdownSnapshot: restoreMarkdownSnapshot,
      undoButton: undoButton
    });
  }

  function createSession(options) {
    var session = ME.documentSession.create(options);

    session.history = session.history || createSessionHistory();
    session.history.reset(session.markdownText);
    session.dirty = Boolean(options && options.dirty);
    session.editorMode = editorMode.normalizeEditorMode(session.editorMode || (options && options.editorMode) || session.activeMode || editorMode.readStoredEditorMode());
    session.activeMode = session.editorMode;
    session.activeEditorSource = session.activeMode;

    return session;
  }

  function revokeAssetObjectUrls(session) {
    if (!session || !session.assetObjectUrls || !window.URL || typeof window.URL.revokeObjectURL !== "function") {
      return;
    }

    Object.keys(session.assetObjectUrls).forEach(function (src) {
      window.URL.revokeObjectURL(session.assetObjectUrls[src]);
    });
    session.assetObjectUrls = {};
  }

  function registerAssetObjectUrl(session, relativePath, file) {
    if (!session || !relativePath || !window.URL || typeof window.URL.createObjectURL !== "function") {
      return relativePath;
    }

    session.assetObjectUrls = session.assetObjectUrls || {};
    session.assetObjectUrls[relativePath] = window.URL.createObjectURL(file);
    return session.assetObjectUrls[relativePath];
  }

  function resetScrollPositions() {
    wysiwygEditor.scrollTop = 0;
    markdownEditor.scrollTop = 0;
    markdownEditor.selectionStart = 0;
    markdownEditor.selectionEnd = 0;
    placeCaretAtStart(wysiwygEditor);
    window.scrollTo(window.scrollX, 0);
  }

  function showWysiwygEditor() {
    wysiwygEditor.hidden = false;
    markdownEditor.hidden = true;
    setActiveEditorSource(EDITOR_MODES.WYSIWYG);
  }

  function showMarkdownEditor() {
    markdownEditor.value = getMarkdownText();
    wysiwygEditor.hidden = true;
    markdownEditor.hidden = false;
    setActiveEditorSource(EDITOR_MODES.MARKDOWN);
  }

  function applySoftWrapState() {
    markdownEditor.classList.toggle("is-soft-wrap", softWrapEnabled);
    wysiwygEditor.classList.toggle("is-soft-wrap", softWrapEnabled);

    if (toggleSoftWrap) {
      toggleSoftWrap.classList.toggle("is-active", softWrapEnabled);
      toggleSoftWrap.setAttribute("aria-pressed", String(softWrapEnabled));
      toggleSoftWrap.title = softWrapEnabled
        ? "Disable Soft Wrap and allow horizontal scrolling"
        : "Enable Soft Wrap to visually wrap long lines";
    }
  }

  function updateModeControls() {
    var mode = getEditorMode();

    if (toggleEditorMode) {
      toggleEditorMode.textContent = mode === EDITOR_MODES.MARKDOWN ? "Markdown" : "WYSIWYG";
      toggleEditorMode.setAttribute("aria-pressed", String(mode === EDITOR_MODES.MARKDOWN));
      toggleEditorMode.title = mode === EDITOR_MODES.MARKDOWN
        ? "Switch to WYSIWYG editing"
        : "Switch to Markdown editing";
    }

    if (modeLabel) {
      modeLabel.textContent = mode === EDITOR_MODES.MARKDOWN ? "Markdown" : "WYSIWYG";
    }

    applySoftWrapState();
    if (actions) {
      actions.updateFormatSelect();
    }
  }

  function toggleSoftWrapState() {
    softWrapEnabled = !softWrapEnabled;
    editorMode.storeSoftWrap(softWrapEnabled);
    applySoftWrapState();
  }

  function setActiveSession(session, options) {
    var previousSession;
    var activeSession;

    options = options || {};

    if (!tabs || !session) {
      return;
    }

    window.clearTimeout(syncTimer);
    previousSession = getActiveSession();

    if (previousSession && previousSession !== session) {
      saveActiveEditorState(previousSession);
    }
    if (previousSession && previousSession !== session && viewport && viewport.capture) {
      previousSession.scrollState = viewport.capture();
    }

    activeSession = tabs.setActiveSession(session.id || session);
    if (!activeSession) {
      return;
    }

    markdownEditor.value = activeSession.markdownText;
    wysiwygEditor.innerHTML = renderMarkdownForSession(activeSession.markdownText);
    wysiwygNeedsSync = false;
    activeEditSource = activeSession.activeMode;
    if (getEditorMode() === EDITOR_MODES.MARKDOWN) {
      showMarkdownEditor();
    } else {
      showWysiwygEditor();
    }
    updateCounts();
    updateModeControls();
    activeSession.history.updateControls();
    updateDocumentTitle();
    renderTabs();

    window.requestAnimationFrame(function () {
      if (options.restoreScroll) {
        if (getEditorMode() === EDITOR_MODES.MARKDOWN) {
          if (typeof activeSession.markdownSelectionStart === "number") {
            markdownEditor.selectionStart = Math.min(activeSession.markdownSelectionStart, markdownEditor.value.length);
            markdownEditor.selectionEnd = Math.min(activeSession.markdownSelectionEnd || activeSession.markdownSelectionStart, markdownEditor.value.length);
          }
          markdownEditor.scrollTop = activeSession.markdownScrollTop || 0;
        } else {
          restoreWysiwygCaretByTextOffset(wysiwygEditor, activeSession.wysiwygTextOffset || 0);
          wysiwygEditor.scrollTop = activeSession.wysiwygScrollTop || 0;
        }
        if (activeSession.scrollState && viewport) {
          viewport.restore(activeSession.scrollState);
        }
      } else {
        resetScrollPositions();
      }

      viewport.remember();
      actions.updateFormatSelect();
    });
  }

  function setMarkdown(value, source, options) {
    var activeSession = getActiveSession();
    var history = getActiveHistory();

    options = options || {};

    if (!activeSession) {
      return;
    }

    activeSession.markdownText = String(value || "");
    if (source !== "textarea" && source !== "markdown" && getEditorMode() === EDITOR_MODES.MARKDOWN) {
      markdownEditor.value = activeSession.markdownText;
    }

    if (source !== "wysiwyg" && getEditorMode() === EDITOR_MODES.WYSIWYG) {
      renderWysiwygFromMarkdown({
        force: true,
        preservePaneScroll: source === "restore" || source === "textarea" || source === "markdown"
      });
    }

    updateCounts();

    if (history && options.history !== false) {
      history.record(activeSession.markdownText);
      if (options.dirty !== false) {
        updateDirtyState();
      }
    } else if (history) {
      history.updateControls();
    }

    if (options.dirty === false) {
      activeSession.dirty = false;
      updateDocumentTitle();
      renderTabs();
    }
  }

  function syncFromWysiwyg() {
    var activeSession = getActiveSession();
    var converted = markdown.htmlToMarkdown(wysiwygEditor);

    if (isSyncingEditors) {
      return;
    }

    activeEditSource = "wysiwyg";
    if (
      activeSession &&
      /\n$/.test(activeSession.markdownText) &&
      converted &&
      !/\n$/.test(converted)
    ) {
      converted += "\n";
    }

    setMarkdown(converted, "wysiwyg");
    wysiwygNeedsSync = false;
  }

  function scheduleSyncFromWysiwyg() {
    if (isSyncingEditors) {
      return;
    }

    wysiwygNeedsSync = true;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(syncFromWysiwyg, 140);
  }

  function focusActiveEditor() {
    if (getActiveMode() === "wysiwyg") {
      wysiwygEditor.focus();
    } else {
      markdownEditor.focus();
    }
  }

  function flushActiveEditor() {
    window.clearTimeout(syncTimer);
    if (wysiwygNeedsSync) {
      syncFromWysiwyg();
    }

    if (getActiveMode() === "markdown") {
      setMarkdown(markdownEditor.value, "textarea");
    }
  }

  function restoreMarkdownSnapshot(value, placeCaretAtEnd) {
    var activeSession = getActiveSession();

    if (!activeSession) {
      return;
    }

    activeSession.markdownText = String(value || "");
    markdownEditor.value = activeSession.markdownText;
    renderWysiwygFromMarkdown({
      force: true
    });
    updateCounts();

    if (getActiveMode() === "wysiwyg") {
      wysiwygNeedsSync = false;
      wysiwygEditor.focus();
      placeCaretAtEnd(wysiwygEditor);
    } else {
      markdownEditor.focus();
      markdownEditor.selectionStart = activeSession.markdownText.length;
      markdownEditor.selectionEnd = activeSession.markdownText.length;
    }

    updateDirtyState();
  }

  function applyHistoryStep(direction) {
    var history = getActiveHistory();

    if (!history) {
      return;
    }

    history.applyStep(direction);
    updateDirtyState();
  }

  function setEditorMode(nextMode) {
    var activeSession = getActiveSession();
    var currentMode = getEditorMode();
    var normalized = editorMode.normalizeEditorMode(nextMode);
    var anchor;

    if (!activeSession || normalized === currentMode) {
      focusActiveEditor();
      return;
    }

    if (aiAssistant) {
      aiAssistant.hideTransientUi();
    }

    anchor = captureEditorAnchor(currentMode);
    flushActiveEditor();

    activeSession.editorMode = normalized;
    activeSession.activeMode = normalized;
    activeSession.activeEditorSource = normalized;
    editorMode.storeEditorMode(normalized);

    if (normalized === EDITOR_MODES.MARKDOWN) {
      markdownEditor.value = activeSession.markdownText || "";
      showMarkdownEditor();
    } else {
      renderWysiwygFromMarkdown({
        force: true
      });
      showWysiwygEditor();
    }

    updateModeControls();
    updateCounts();

    window.requestAnimationFrame(function () {
      if (normalized === EDITOR_MODES.MARKDOWN) {
        restoreMarkdownAnchor(anchor);
      } else {
        restoreWysiwygAnchor(anchor);
      }
      focusActiveEditor();
      window.requestAnimationFrame(function () {
        if (normalized === EDITOR_MODES.MARKDOWN) {
          restoreMarkdownAnchor(anchor);
        } else {
          restoreWysiwygAnchor(anchor);
        }
        saveActiveEditorState(activeSession);
      });
    });
  }

  function toggleEditorModeState() {
    setEditorMode(getEditorMode() === EDITOR_MODES.WYSIWYG
      ? EDITOR_MODES.MARKDOWN
      : EDITOR_MODES.WYSIWYG);
  }

  function setFocusMode(enabled) {
    var nextEnabled = Boolean(enabled);

    flushActiveEditor();

    focusModeEnabled = nextEnabled;
    document.body.classList.toggle("focus-mode", focusModeEnabled);

    if (toggleFocusMode) {
      toggleFocusMode.textContent = focusModeEnabled ? "Exit Focus" : "Focus";
      toggleFocusMode.setAttribute("aria-pressed", String(focusModeEnabled));
      toggleFocusMode.title = focusModeEnabled
        ? "Exit focus mode (Esc)"
        : "Focus mode (Ctrl/Cmd+Shift+F)";
    }

    if (viewport && viewport.remember) {
      window.requestAnimationFrame(function () {
        viewport.remember();
      });
    }
  }

  function toggleFocusModeState() {
    setFocusMode(!focusModeEnabled);
  }

  function openAboutDialog() {
    aboutOverlay.hidden = false;
    window.requestAnimationFrame(function () {
      aboutDialog.focus();
    });
  }

  function closeAboutDialog() {
    aboutOverlay.hidden = true;
    aboutButton.focus();
  }

  function renderRecentFiles(records) {
    var placeholder = document.createElement("option");
    var openGroup;
    var removeGroup;

    recentRecords = records || [];
    recentFilesSelect.innerHTML = "";
    placeholder.value = "";
    placeholder.textContent = recentRecords.length ? "Recent" : "No recent";
    recentFilesSelect.appendChild(placeholder);

    if (recentRecords.length) {
      openGroup = document.createElement("optgroup");
      openGroup.label = "Open";
      removeGroup = document.createElement("optgroup");
      removeGroup.label = "Remove from Recent";

      recentRecords.forEach(function (record) {
        var openOption = document.createElement("option");
        var removeOption = document.createElement("option");
        var name = record.name || "Untitled.md";

        openOption.value = "open:" + String(record.id);
        openOption.textContent = name;
        openGroup.appendChild(openOption);

        removeOption.value = "remove:" + String(record.id);
        removeOption.textContent = "Remove " + name;
        removeGroup.appendChild(removeOption);
      });

      recentFilesSelect.appendChild(openGroup);
      recentFilesSelect.appendChild(removeGroup);
    }

    recentFilesSelect.value = "";
    recentFilesSelect.disabled = !isFileAccessSupported() || !recentRecords.length;
  }

  async function refreshRecentFiles() {
    if (!recentStore || !recentStore.isSupported()) {
      renderRecentFiles([]);
      return;
    }

    try {
      renderRecentFiles(await recentStore.list());
    } catch (error) {
      renderRecentFiles([]);
    }
  }

  async function addRecentFile(fileHandle, title) {
    if (!recentStore || !recentStore.isSupported() || !fileHandle) {
      return;
    }

    try {
      renderRecentFiles(await recentStore.add(fileHandle, title));
    } catch (error) {
      await refreshRecentFiles();
    }
  }

  function currentWorkspaceRootName() {
    return workspaceState.rootName || "";
  }

  function sessionBelongsToWorkspace(session) {
    return Boolean(
      session &&
      workspaceState.rootHandle &&
      session.workspacePath &&
      session.workspaceId === workspaceState.id &&
      session.workspaceRootName === currentWorkspaceRootName()
    );
  }

  function findWorkspaceFile(path) {
    var files = workspaceState.files || [];
    var i;

    for (i = 0; i < files.length; i += 1) {
      if (files[i].path === path) {
        return files[i];
      }
    }

    return null;
  }

  function findSessionByWorkspacePath(path) {
    var sessions = tabs ? tabs.listSessions() : [];
    var i;

    for (i = 0; i < sessions.length; i += 1) {
      if (sessions[i].workspaceId === workspaceState.id && sessions[i].workspacePath === path) {
        return sessions[i];
      }
    }

    return null;
  }

  function workspaceDirtyPaths() {
    var dirtyPaths = [];

    if (!tabs || !workspaceState.id) {
      return dirtyPaths;
    }

    tabs.listSessions().forEach(function (session) {
      if (session.workspaceId === workspaceState.id && session.workspacePath && session.dirty) {
        dirtyPaths.push(session.workspacePath);
      }
    });

    return dirtyPaths;
  }

  function selectedWorkspacePath() {
    var session = getActiveSession();

    return sessionBelongsToWorkspace(session) ? session.workspacePath : "";
  }

  function renderWorkspaceSidebar() {
    if (!workspaceSidebar) {
      return;
    }

    workspaceSidebar.update({
      dirtyPaths: workspaceDirtyPaths(),
      selectedPath: selectedWorkspacePath(),
      workspaceState: {
        error: workspaceState.error,
        files: workspaceState.files,
        isScanning: workspaceState.isScanning,
        isSupported: isWorkspaceSupported(),
        rootName: workspaceState.rootName,
        tree: workspaceState.tree
      }
    });
  }

  function updateWorkspaceMenuControls() {
    var hasWorkspace = Boolean(workspaceState.rootHandle);
    var supported = isWorkspaceSupported();

    if (openWorkspaceFolderButton) {
      openWorkspaceFolderButton.disabled = !supported;
      openWorkspaceFolderButton.title = supported
        ? "Open a local folder as a Markdown workspace"
        : "Folder workspace is supported in Chrome / Edge. You can still open individual Markdown files.";
    }
    if (refreshWorkspaceButton) {
      refreshWorkspaceButton.disabled = !hasWorkspace || workspaceState.isScanning;
    }
    if (closeWorkspaceButton) {
      closeWorkspaceButton.disabled = !hasWorkspace;
    }
  }

  function closeWorkspaceMenu() {
    if (!workspaceMenu || workspaceMenu.hidden) {
      return;
    }

    workspaceMenu.hidden = true;
    workspaceButton.setAttribute("aria-expanded", "false");
  }

  function positionWorkspaceMenu() {
    var rect;

    if (!workspaceButton || !workspaceMenu) {
      return;
    }

    rect = workspaceButton.getBoundingClientRect();
    workspaceMenu.style.top = Math.min(rect.bottom + 6, window.innerHeight - 8) + "px";
    workspaceMenu.style.left = Math.min(rect.left, window.innerWidth - workspaceMenu.offsetWidth - 8) + "px";
  }

  function toggleWorkspaceMenu() {
    if (!workspaceMenu || !workspaceButton) {
      return;
    }

    if (!workspaceMenu.hidden) {
      closeWorkspaceMenu();
      return;
    }

    updateWorkspaceMenuControls();
    workspaceMenu.hidden = false;
    workspaceButton.setAttribute("aria-expanded", "true");
    positionWorkspaceMenu();
  }

  function resetWorkspaceState() {
    workspaceState = {
      id: "",
      rootHandle: null,
      rootName: "",
      files: [],
      tree: null,
      isScanning: false,
      error: ""
    };
    renderWorkspaceSidebar();
    updateWorkspaceMenuControls();
  }

  function applyWorkspaceScanResult(result) {
    workspaceState = {
      id: result.workspaceId || workspaceState.id || "workspace-" + nextWorkspaceId++,
      rootHandle: result.rootHandle,
      rootName: result.rootName,
      files: result.files || [],
      tree: result.tree || [],
      isScanning: false,
      error: ""
    };
    renderWorkspaceSidebar();
    updateWorkspaceMenuControls();
  }

  function showWorkspaceError(message) {
    workspaceState.error = message;
    workspaceState.isScanning = false;
    renderWorkspaceSidebar();
    updateWorkspaceMenuControls();
  }

  async function handleOpenWorkspaceFolder() {
    var result;

    closeWorkspaceMenu();
    if (!isWorkspaceSupported()) {
      if (workspaceSidebar) {
        workspaceSidebar.setMode("expanded");
      }
      showWorkspaceError("Folder workspace is not supported in this browser. Use Chrome or Edge, or open individual Markdown files.");
      return;
    }

    if (workspaceSidebar) {
      workspaceSidebar.setMode("expanded");
    }

    try {
      result = await workspaceStore.openWorkspace();
      result.workspaceId = "workspace-" + nextWorkspaceId++;
      applyWorkspaceScanResult(result);
    } catch (error) {
      if (workspaceStore && workspaceStore.isAbortError(error)) {
        return;
      }
      showWorkspaceError("Could not read this workspace. Please open the folder again.");
    }
  }

  async function handleRefreshWorkspace() {
    var result;

    closeWorkspaceMenu();
    if (!workspaceState.rootHandle || !workspaceStore) {
      return;
    }

    workspaceState.isScanning = true;
    workspaceState.error = "";
    renderWorkspaceSidebar();
    updateWorkspaceMenuControls();

    try {
      result = await workspaceStore.scanWorkspace(workspaceState.rootHandle);
      applyWorkspaceScanResult(result);
    } catch (error) {
      showWorkspaceError("Could not read this workspace. Please open the folder again.");
    }
  }

  function handleCloseWorkspace() {
    closeWorkspaceMenu();
    resetWorkspaceState();
  }

  async function attachCurrentWorkspacePath(session) {
    var pathParts;
    var path;

    if (
      !session ||
      !workspaceState.rootHandle ||
      !session.fileHandle ||
      typeof workspaceState.rootHandle.resolve !== "function"
    ) {
      return false;
    }

    try {
      pathParts = await workspaceState.rootHandle.resolve(session.fileHandle);
    } catch (error) {
      pathParts = null;
    }

    if (!pathParts || !pathParts.length) {
      return false;
    }

    path = pathParts.join("/");
    if (!workspaceStore.isMarkdownFile(path)) {
      return false;
    }

    session.workspaceDirHandle = workspaceState.rootHandle;
    session.workspaceId = workspaceState.id;
    session.workspaceRootName = workspaceState.rootName;
    session.workspacePath = path;
    session.workspaceFileHandle = session.fileHandle;
    return true;
  }

  async function openWorkspaceFile(path) {
    var fileItem = findWorkspaceFile(path);
    var existingSession;
    var file;
    var markdownText;
    var session;

    closeWorkspaceMenu();
    if (!fileItem || !fileItem.handle) {
      return;
    }

    flushActiveEditor();

    existingSession = findSessionByWorkspacePath(fileItem.path);
    if (!existingSession) {
      existingSession = await tabs.findSessionByFileHandle(fileItem.handle);
      if (existingSession) {
        existingSession.workspaceDirHandle = workspaceState.rootHandle;
        existingSession.workspaceId = workspaceState.id;
        existingSession.workspaceRootName = workspaceState.rootName;
        existingSession.workspacePath = fileItem.path;
        existingSession.workspaceFileHandle = fileItem.handle;
      }
    }

    if (existingSession) {
      setActiveSession(existingSession, { restoreScroll: true });
      await addRecentFile(fileItem.handle, fileItem.name);
      focusActiveEditor();
      return;
    }

    try {
      file = await fileItem.handle.getFile();
      markdownText = await file.text();
      session = createSession({
        activeMode: getActiveMode(),
        editorMode: getEditorMode(),
        fileHandle: fileItem.handle,
        markdownText: markdownText,
        title: fileItem.name,
        workspaceDirHandle: workspaceState.rootHandle,
        workspaceFileHandle: fileItem.handle,
        workspaceId: workspaceState.id,
        workspacePath: fileItem.path,
        workspaceRootName: workspaceState.rootName
      });
      tabs.addSession(session, { activate: false });
      setActiveSession(session, { restoreScroll: false });
      await addRecentFile(fileItem.handle, fileItem.name);
      focusActiveEditor();
    } catch (error) {
      showFileError("Open workspace file", error);
    }
  }

  function findRecentRecord(id) {
    var numericId = Number(id);
    var i;

    for (i = 0; i < recentRecords.length; i += 1) {
      if (recentRecords[i].id === numericId) {
        return recentRecords[i];
      }
    }

    return null;
  }

  function updateFileControls() {
    var supported = isFileAccessSupported();
    var controls = [openFileButton, saveFileButton, saveAsFileButton];

    controls.forEach(function (control) {
      control.disabled = !supported;
    });

    if (insertImageButton) {
      insertImageButton.disabled = !isImagePickerSupported();
      insertImageButton.title = isImagePickerSupported()
        ? "Insert image"
        : "Image insertion requires browser file and folder access";
    }

    if (!supported) {
      recentFilesSelect.disabled = true;
      recentFilesSelect.title = "File access is not supported in this browser";
      updateWorkspaceMenuControls();
      return;
    }

    recentFilesSelect.title = "Open or remove recent files";
    updateWorkspaceMenuControls();
  }

  function handleBeforeUnload(event) {
    var dirtySessions;

    flushActiveEditor();
    dirtySessions = tabs ? tabs.listSessions().filter(function (session) {
      return session.dirty;
    }) : [];

    if (!dirtySessions.length) {
      return;
    }

    event.preventDefault();
    event.returnValue = dirtySessions.length === 1
      ? "Discard unsaved changes to " + dirtySessions[0].title + "?"
      : "Discard unsaved changes to " + dirtySessions.length + " open documents?";
  }

  function showFileError(action, error) {
    if (fileStore && fileStore.isAbortError(error)) {
      return;
    }

    window.alert(action + " failed. " + (error && error.message ? error.message : ""));
  }

  function showAssetError(action, error) {
    if (assetStore && assetStore.isAbortError(error)) {
      return;
    }

    window.alert(action + " failed. " + (error && error.message ? error.message : ""));
  }

  function showClipboardError(action, error) {
    window.alert(action + " failed. " + (error && error.message ? error.message : ""));
  }

  function handleClipboardAction(actionId, detail) {
    var labels = {
      copy: "Copy",
      cut: "Cut",
      paste: "Paste"
    };

    actions.applyClipboardAction(actionId, detail && detail.selection).catch(function (error) {
      showClipboardError(labels[actionId] || "Clipboard action", error);
      focusActiveEditor();
    });
  }

  async function saveImagesForInsertion(session, files, options) {
    var images = [];
    var i;
    var relativePath;
    var file;

    if (!assetStore || !assetStore.isStorageSupported()) {
      throw new Error("Image storage is not supported in this browser.");
    }

    for (i = 0; i < files.length; i += 1) {
      file = files[i];
      relativePath = await assetStore.saveImageFile(session, file, {
        prefix: options.prefix
      });
      images.push({
        alt: options.alt || assetStore.imageAlt(file, options.fallbackAlt),
        displaySrc: registerAssetObjectUrl(session, relativePath, file),
        src: relativePath
      });
    }

    return images;
  }

  async function storeAndInsertImages(files, options) {
    var session = getActiveSession();
    var selection = options.selection || actions.captureSelection();
    var images;

    if (!session || !files || !files.length) {
      return;
    }

    try {
      images = await saveImagesForInsertion(session, files, options);
      if (getActiveSession() !== session) {
        return;
      }
      actions.insertMarkdownImages(images, selection);
    } catch (error) {
      showAssetError(options.action || "Insert image", error);
      focusActiveEditor();
    }
  }

  async function handleInsertImage() {
    var selection = actions.captureSelection();
    var file;

    if (!assetStore || !assetStore.isImagePickerSupported()) {
      showAssetError("Insert image", new Error("Image selection is not supported in this browser."));
      return;
    }

    try {
      file = await assetStore.chooseImageFile();
      await storeAndInsertImages([file], {
        action: "Insert image",
        fallbackAlt: "image",
        prefix: "image",
        selection: selection
      });
    } catch (error) {
      showAssetError("Insert image", error);
      focusActiveEditor();
    }
  }

  function updateTabScrollButtons() {
    var maxScroll;

    if (!tabViewport || !tabScrollLeft || !tabScrollRight) {
      return;
    }

    maxScroll = Math.max(tabViewport.scrollWidth - tabViewport.clientWidth, 0);
    tabScrollLeft.disabled = maxScroll <= 0 || tabViewport.scrollLeft <= 0;
    tabScrollRight.disabled = maxScroll <= 0 || tabViewport.scrollLeft >= maxScroll - 1;
  }

  function scrollTabsByPage(direction) {
    var amount;

    if (!tabViewport) {
      return;
    }

    amount = Math.max(160, Math.floor(tabViewport.clientWidth * 0.75));

    if (typeof tabViewport.scrollBy === "function") {
      tabViewport.scrollBy({
        left: direction * amount,
        behavior: "smooth"
      });
    } else {
      tabViewport.scrollLeft += direction * amount;
    }

    window.setTimeout(updateTabScrollButtons, 140);
  }

  function handleTabWheel(event) {
    if (
      !tabViewport ||
      tabViewport.scrollWidth <= tabViewport.clientWidth ||
      Math.abs(event.deltaY) <= Math.abs(event.deltaX)
    ) {
      return;
    }

    event.preventDefault();
    tabViewport.scrollLeft += event.deltaY;
    updateTabScrollButtons();
  }

  function scrollActiveTabIntoView() {
    var activeTab;

    if (!tabList) {
      return;
    }

    activeTab = tabList.querySelector(".doc-tab-wrap.is-active") ||
      tabList.querySelector(".doc-tab.is-active");

    if (!activeTab) {
      updateTabScrollButtons();
      return;
    }

    activeTab.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth"
    });

    window.setTimeout(updateTabScrollButtons, 140);
  }

  function queueActiveTabScroll() {
    window.requestAnimationFrame(function () {
      scrollActiveTabIntoView();
      updateTabScrollButtons();
    });
  }

  function getTabWraps() {
    if (!tabList) {
      return [];
    }

    return Array.prototype.slice.call(tabList.querySelectorAll(".doc-tab-wrap"));
  }

  function clearTabDropIndicators() {
    getTabWraps().forEach(function (wrap) {
      wrap.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
    });
  }

  function resetTabDrag() {
    clearTabDropIndicators();
    tabDrag.active = false;
    tabDrag.started = false;
    tabDrag.sessionId = null;
    tabDrag.startX = 0;
    tabDrag.startY = 0;
    tabDrag.pointerId = null;
    tabDrag.dropSessionId = null;
    tabDrag.dropPosition = null;
  }

  function suppressNextClick() {
    suppressNextTabClick = true;
    window.setTimeout(function () {
      suppressNextTabClick = false;
    }, 0);
  }

  function updateTabDropTarget(clientX) {
    var wraps;
    var bestWrap = null;
    var bestPosition = "after";

    clearTabDropIndicators();
    tabDrag.dropSessionId = null;
    tabDrag.dropPosition = null;

    wraps = getTabWraps();
    wraps.some(function (wrap) {
      var sessionId = wrap.getAttribute("data-session-id");
      var rect;

      if (sessionId === tabDrag.sessionId) {
        wrap.classList.add("is-dragging");
        return false;
      }

      rect = wrap.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) {
        bestWrap = wrap;
        bestPosition = "before";
        return true;
      }

      bestWrap = wrap;
      bestPosition = "after";
      return false;
    });

    if (!bestWrap) {
      return;
    }

    bestWrap.classList.add(bestPosition === "before" ? "is-drop-before" : "is-drop-after");
    tabDrag.dropSessionId = bestWrap.getAttribute("data-session-id");
    tabDrag.dropPosition = bestPosition;
  }

  function autoScrollTabsDuringDrag(clientX) {
    var rect;
    var edgeSize = 48;
    var speed = 18;
    var beforeScroll;

    if (!tabViewport) {
      return;
    }

    rect = tabViewport.getBoundingClientRect();
    beforeScroll = tabViewport.scrollLeft;

    if (clientX < rect.left + edgeSize) {
      tabViewport.scrollLeft -= speed;
    } else if (clientX > rect.right - edgeSize) {
      tabViewport.scrollLeft += speed;
    }

    if (beforeScroll !== tabViewport.scrollLeft) {
      updateTabDropTarget(clientX);
      updateTabScrollButtons();
    }
  }

  function applyTabDrop() {
    var sourceIndex;
    var targetIndex;

    if (!tabs || !tabDrag.sessionId || !tabDrag.dropSessionId) {
      clearTabDropIndicators();
      return;
    }

    sourceIndex = tabs.indexOfSession(tabDrag.sessionId);
    targetIndex = tabs.indexOfSession(tabDrag.dropSessionId);

    if (sourceIndex < 0 || targetIndex < 0) {
      clearTabDropIndicators();
      return;
    }

    if (tabDrag.dropPosition === "after") {
      targetIndex += 1;
    }

    if (sourceIndex < targetIndex) {
      targetIndex -= 1;
    }

    if (tabs.moveSession(tabDrag.sessionId, targetIndex)) {
      renderTabs();
      scrollActiveTabIntoView();
    } else {
      clearTabDropIndicators();
      updateTabScrollButtons();
    }
  }

  function handleTabPointerDown(event) {
    var wrap = event.currentTarget;

    if (event.button !== 0 || event.target.closest(".tab-close")) {
      return;
    }

    tabDrag.active = true;
    tabDrag.started = false;
    tabDrag.sessionId = wrap.getAttribute("data-session-id");
    tabDrag.startX = event.clientX;
    tabDrag.startY = event.clientY;
    tabDrag.pointerId = event.pointerId;
    tabDrag.dropSessionId = null;
    tabDrag.dropPosition = null;

    if (wrap.setPointerCapture) {
      wrap.setPointerCapture(event.pointerId);
    }
  }

  function handleTabPointerMove(event) {
    var dx;
    var dy;

    if (!tabDrag.active || tabDrag.pointerId !== event.pointerId) {
      return;
    }

    dx = Math.abs(event.clientX - tabDrag.startX);
    dy = Math.abs(event.clientY - tabDrag.startY);

    if (!tabDrag.started && dx < 5 && dy < 5) {
      return;
    }

    tabDrag.started = true;
    event.preventDefault();
    updateTabDropTarget(event.clientX);
    autoScrollTabsDuringDrag(event.clientX);
  }

  function handleTabPointerUp(event) {
    if (!tabDrag.active || tabDrag.pointerId !== event.pointerId) {
      return;
    }

    if (
      event.currentTarget.releasePointerCapture &&
      (!event.currentTarget.hasPointerCapture || event.currentTarget.hasPointerCapture(event.pointerId))
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!tabDrag.started) {
      resetTabDrag();
      return;
    }

    event.preventDefault();
    suppressNextClick();
    applyTabDrop();
    resetTabDrag();
  }

  function handleTabPointerCancel(event) {
    if (!tabDrag.active || tabDrag.pointerId !== event.pointerId) {
      return;
    }

    resetTabDrag();
  }

  function renderTabs() {
    var sessions;
    var activeSession;

    if (!tabList || !tabs) {
      return;
    }

    sessions = tabs.listSessions();
    activeSession = tabs.getActiveSession();
    tabList.innerHTML = "";

    sessions.forEach(function (session) {
      var isActive = Boolean(activeSession && activeSession.id === session.id);
      var wrap = document.createElement("div");
      var tab = document.createElement("button");
      var dirty = document.createElement("span");
      var title = document.createElement("span");
      var close = document.createElement("button");

      wrap.className = "doc-tab-wrap" + (isActive ? " is-active" : "");
      wrap.setAttribute("role", "presentation");
      wrap.setAttribute("data-session-id", session.id);

      tab.className = "doc-tab" + (isActive ? " is-active" : "");
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(isActive));
      tab.setAttribute("tabindex", isActive ? "0" : "-1");
      tab.setAttribute("data-session-id", session.id);
      tab.setAttribute("aria-label", (session.dirty ? "Unsaved changes, " : "") + session.title);
      tab.title = session.title + (session.dirty ? " has unsaved changes" : "");

      dirty.className = "tab-dirty";
      dirty.setAttribute("aria-hidden", "true");
      dirty.textContent = session.dirty ? "*" : "";

      title.className = "tab-title";
      title.textContent = session.title;

      close.className = "tab-close";
      close.type = "button";
      close.textContent = "×";
      close.title = "Close " + session.title;
      close.setAttribute("aria-label", "Close " + session.title);

      wrap.addEventListener("pointerdown", handleTabPointerDown);
      wrap.addEventListener("pointermove", handleTabPointerMove);
      wrap.addEventListener("pointerup", handleTabPointerUp);
      wrap.addEventListener("pointercancel", handleTabPointerCancel);

      wrap.addEventListener("click", function (event) {
        if (event.target.closest(".tab-close")) {
          return;
        }
        if (suppressNextTabClick) {
          event.preventDefault();
          return;
        }
        switchToTab(session.id);
      });

      close.addEventListener("click", function (event) {
        event.stopPropagation();
        closeTab(session.id);
      });

      tab.appendChild(dirty);
      tab.appendChild(title);
      wrap.appendChild(tab);
      wrap.appendChild(close);
      tabList.appendChild(wrap);
    });

    queueActiveTabScroll();
    renderWorkspaceSidebar();
  }

  function switchToTab(sessionId, options) {
    var session = tabs && tabs.getSession(sessionId);
    var activeSession = getActiveSession();

    if (!session) {
      return;
    }

    if (activeSession && activeSession.id === session.id) {
      scrollActiveTabIntoView();
      focusActiveEditor();
      return;
    }

    flushActiveEditor();
    setActiveSession(session, {
      restoreScroll: !options || options.restoreScroll !== false
    });
    focusActiveEditor();
  }

  function switchToTabIndex(index) {
    var sessions = tabs ? tabs.listSessions() : [];

    if (index < 0 || index >= sessions.length) {
      return;
    }

    switchToTab(sessions[index].id);
  }

  function switchRelativeTab(direction) {
    var sessions = tabs ? tabs.listSessions() : [];
    var activeSession = getActiveSession();
    var activeIndex;
    var nextIndex;

    if (!sessions.length || !activeSession) {
      return;
    }

    activeIndex = sessions.map(function (session) {
      return session.id;
    }).indexOf(activeSession.id);

    if (activeIndex === -1) {
      return;
    }

    nextIndex = (activeIndex + direction + sessions.length) % sessions.length;
    switchToTab(sessions[nextIndex].id);
  }

  function moveActiveTabBy(offset) {
    var activeSession = getActiveSession();
    var currentIndex;
    var targetIndex;

    if (!tabs || !activeSession) {
      return;
    }

    currentIndex = tabs.indexOfSession(activeSession.id);
    if (currentIndex < 0) {
      return;
    }

    targetIndex = currentIndex + offset;
    if (tabs.moveSession(activeSession.id, targetIndex)) {
      renderTabs();
      scrollActiveTabIntoView();
      focusActiveEditor();
    }
  }

  function confirmCloseDirtyTab(session) {
    if (!session || !session.dirty) {
      return true;
    }

    return window.confirm(
      "Close " + session.title + " with unsaved changes?\n\nUnsaved changes will be discarded."
    );
  }

  async function closeTab(sessionId) {
    var session = tabs && tabs.getSession(sessionId);
    var activeSession = getActiveSession();
    var wasActive = Boolean(session && activeSession && session.id === activeSession.id);
    var nextSession;

    if (!session) {
      return;
    }

    if (wasActive) {
      flushActiveEditor();
    }

    if (!confirmCloseDirtyTab(session)) {
      if (wasActive) {
        focusActiveEditor();
      }
      return;
    }

    revokeAssetObjectUrls(session);
    tabs.closeSession(session.id);

    if (!tabs.listSessions().length) {
      nextSession = createSession({
        activeMode: session.activeMode || "wysiwyg",
        editorMode: session.editorMode || getEditorMode(),
        markdownText: "",
        title: "Untitled.md"
      });
      tabs.addSession(nextSession, { activate: false });
      setActiveSession(nextSession, { restoreScroll: false });
      focusActiveEditor();
      return;
    }

    if (wasActive) {
      setActiveSession(tabs.getActiveSession(), { restoreScroll: true });
      focusActiveEditor();
      return;
    }

    renderTabs();
  }

  function closeActiveTab() {
    var activeSession = getActiveSession();

    if (activeSession) {
      closeTab(activeSession.id);
    }
  }

  function handleNewFile() {
    var session;

    flushActiveEditor();
    session = tabs.createUntitledSession({
      activate: false,
      activeMode: getActiveMode(),
      editorMode: getEditorMode(),
      markdownText: ""
    });
    setActiveSession(session, { restoreScroll: false });
    focusActiveEditor();
  }

  async function handleOpenFile() {
    var fileData;
    var existingSession;
    var session;

    if (!isFileAccessSupported()) {
      return;
    }

    flushActiveEditor();

    try {
      fileData = await fileStore.openMarkdownFile();
      existingSession = await tabs.findSessionByFileHandle(fileData.fileHandle);
      if (existingSession) {
        await attachCurrentWorkspacePath(existingSession);
        setActiveSession(existingSession, { restoreScroll: true });
        await addRecentFile(fileData.fileHandle, fileData.title);
        focusActiveEditor();
        return;
      }

      session = createSession({
        activeMode: getActiveMode(),
        editorMode: getEditorMode(),
        fileHandle: fileData.fileHandle,
        markdownText: fileData.markdownText,
        title: fileData.title
      });
      await attachCurrentWorkspacePath(session);
      tabs.addSession(session, { activate: false });
      setActiveSession(session, { restoreScroll: false });
      await addRecentFile(fileData.fileHandle, fileData.title);
      focusActiveEditor();
    } catch (error) {
      showFileError("Open", error);
    }
  }

  async function handleSaveFile() {
    var activeSession = getActiveSession();

    if (!isFileAccessSupported() || !activeSession) {
      return;
    }

    flushActiveEditor();

    try {
      await fileStore.saveSession(activeSession);
      markSessionClean();
      await addRecentFile(activeSession.fileHandle, activeSession.title);
      renderWorkspaceSidebar();
    } catch (error) {
      showFileError("Save", error);
    }
  }

  async function handleSaveAsFile() {
    var activeSession = getActiveSession();

    if (!isFileAccessSupported() || !activeSession) {
      return;
    }

    flushActiveEditor();

    try {
      await fileStore.saveSessionAs(activeSession);
      if (await attachCurrentWorkspacePath(activeSession)) {
        await handleRefreshWorkspace();
      }
      markSessionClean();
      await addRecentFile(activeSession.fileHandle, activeSession.title);
      renderWorkspaceSidebar();
    } catch (error) {
      showFileError("Save As", error);
    }
  }

  async function handleRecentFileOpen(recentId) {
    var record = findRecentRecord(recentId);
    var fileData;
    var existingSession;
    var session;

    if (!recentId || !record) {
      return;
    }

    flushActiveEditor();

    try {
      fileData = await recentStore.openRecord(record);
      existingSession = await tabs.findSessionByFileHandle(fileData.fileHandle);
      if (existingSession) {
        await attachCurrentWorkspacePath(existingSession);
        setActiveSession(existingSession, { restoreScroll: true });
        await refreshRecentFiles();
        focusActiveEditor();
        return;
      }

      session = createSession({
        activeMode: getActiveMode(),
        editorMode: getEditorMode(),
        fileHandle: fileData.fileHandle,
        markdownText: fileData.markdownText,
        title: fileData.title
      });
      await attachCurrentWorkspacePath(session);
      tabs.addSession(session, { activate: false });
      setActiveSession(session, { restoreScroll: false });
      await refreshRecentFiles();
      focusActiveEditor();
    } catch (error) {
      await refreshRecentFiles();
      showFileError("Open recent file", error);
    }
  }

  async function handleRecentFileRemove(recentId) {
    var record = findRecentRecord(recentId);
    var name = record ? record.name || "Untitled.md" : "this entry";

    if (!recentId || !record || !recentStore || !recentStore.isSupported()) {
      return;
    }

    if (!window.confirm("Remove " + name + " from Recent files?")) {
      return;
    }

    try {
      await recentStore.remove(record.id);
      await refreshRecentFiles();
    } catch (error) {
      await refreshRecentFiles();
      showFileError("Remove recent file", error);
    }
  }

  async function handleRecentFileChange() {
    var value = recentFilesSelect.value;
    var parts;

    recentFilesSelect.value = "";

    if (!value) {
      return;
    }

    parts = value.split(":");

    if (parts[0] === "remove") {
      await handleRecentFileRemove(parts[1]);
      return;
    }

    await handleRecentFileOpen(parts[1]);
  }

  function handleFileShortcut(key, event) {
    if (event.altKey) {
      return false;
    }

    if (key === "n") {
      event.preventDefault();
      handleNewFile();
      return true;
    }

    if (key === "o") {
      event.preventDefault();
      handleOpenFile();
      return true;
    }

    if (key === "s") {
      event.preventDefault();
      if (event.shiftKey) {
        handleSaveAsFile();
      } else {
        handleSaveFile();
      }
      return true;
    }

    return false;
  }

  function handleTabShortcut(key, event) {
    if (event.altKey) {
      return false;
    }

    if (key === "w") {
      event.preventDefault();
      closeActiveTab();
      return true;
    }

    if (key === "pageup") {
      event.preventDefault();
      if (event.shiftKey) {
        moveActiveTabBy(-1);
      } else {
        switchRelativeTab(-1);
      }
      return true;
    }

    if (key === "pagedown") {
      event.preventDefault();
      if (event.shiftKey) {
        moveActiveTabBy(1);
      } else {
        switchRelativeTab(1);
      }
      return true;
    }

    if (/^[1-9]$/.test(key)) {
      event.preventDefault();
      switchToTabIndex(Number(key) - 1);
      return true;
    }

    return false;
  }

  function transferHasImages(dataTransfer) {
    return Boolean(assetStore && assetStore.hasImageItems(dataTransfer));
  }

  function imageFilesFromTransfer(dataTransfer) {
    return assetStore ? assetStore.imageFilesFromTransfer(dataTransfer) : [];
  }

  function dropSelection(event) {
    if (event.currentTarget === wysiwygEditor) {
      setActiveEditorSource("wysiwyg");
      actions.placeWysiwygCaretAtPoint(event.clientX, event.clientY);
    } else {
      setActiveEditorSource("markdown");
      markdownEditor.focus();
    }

    return actions.captureSelection();
  }

  function handleEditorDragOver(event) {
    if (!transferHasImages(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleEditorDrop(event) {
    var files;
    var selection;

    if (!transferHasImages(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    files = imageFilesFromTransfer(event.dataTransfer);
    if (!files.length) {
      return;
    }

    selection = dropSelection(event);
    storeAndInsertImages(files, {
      action: "Drop image",
      fallbackAlt: "dropped image",
      prefix: "dropped",
      selection: selection
    });
  }

  function wysiwygBlockForRange(range) {
    var node = range && range.startContainer;

    if (node && node.nodeType === Node.TEXT_NODE) {
      node = node.parentNode;
    }

    while (node && node !== wysiwygEditor) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        /^(blockquote|div|h[1-6]|li|ol|p|pre|ul)$/i.test(node.tagName)
      ) {
        return node;
      }
      node = node.parentNode;
    }

    return null;
  }

  function isHeadingBlock(node) {
    return Boolean(node && node.nodeType === Node.ELEMENT_NODE && /^h[1-6]$/i.test(node.tagName));
  }

  function isParagraphLikeBlock(node) {
    return Boolean(node && node.nodeType === Node.ELEMENT_NODE && /^(div|p)$/i.test(node.tagName));
  }

  function isEmptyEditableBlock(node) {
    return Boolean(
      node &&
      node.nodeType === Node.ELEMENT_NODE &&
      isParagraphLikeBlock(node) &&
      !(node.textContent || "").trim()
    );
  }

  function isRangeAtStartOfBlock(range, block) {
    var preRange;

    if (!range || !block || !block.contains(range.startContainer)) {
      return false;
    }

    preRange = range.cloneRange();
    preRange.selectNodeContents(block);
    preRange.setEnd(range.startContainer, range.startOffset);
    return preRange.toString().length === 0;
  }

  function isRangeAtEndOfBlock(range, block) {
    var postRange;

    if (!range || !block || !block.contains(range.startContainer)) {
      return false;
    }

    postRange = range.cloneRange();
    postRange.selectNodeContents(block);
    postRange.setStart(range.startContainer, range.startOffset);
    return postRange.toString().length === 0;
  }

  function insertParagraphBeforeBlock(block) {
    var paragraph = document.createElement("p");

    paragraph.appendChild(document.createElement("br"));
    block.parentNode.insertBefore(paragraph, block);
    wysiwygEditor.focus();
    restoreWysiwygCaretWithinElement(block, 0);
    window.setTimeout(function () {
      if (block.parentNode) {
        wysiwygEditor.focus();
        restoreWysiwygCaretWithinElement(block, 0);
      }
    }, 0);
  }

  function insertParagraphAfterBlock(block) {
    var paragraph = document.createElement("p");

    paragraph.appendChild(document.createElement("br"));
    block.parentNode.insertBefore(paragraph, block.nextSibling);
    restoreWysiwygCaretWithinElement(paragraph, 0);
  }

  function removeEmptyBlockBeforeHeading(block) {
    var next = block && block.nextElementSibling;

    if (!isEmptyEditableBlock(block) || !isHeadingBlock(next)) {
      return false;
    }

    block.parentNode.removeChild(block);
    restoreWysiwygCaretWithinElement(next, 0);
    return true;
  }

  function mergeParagraphIntoPreviousHeadingAsParagraph(block) {
    var previous = block && block.previousElementSibling;
    var paragraph;
    var caretOffset;
    var child;

    if (!isParagraphLikeBlock(block) || !isHeadingBlock(previous)) {
      return false;
    }

    caretOffset = previous.textContent.length;
    paragraph = document.createElement("p");

    while (previous.firstChild) {
      paragraph.appendChild(previous.firstChild);
    }

    while (block.firstChild) {
      child = block.firstChild;
      block.removeChild(child);
      if (!(child.nodeType === Node.ELEMENT_NODE && child.tagName === "BR")) {
        paragraph.appendChild(child);
      }
    }

    previous.parentNode.insertBefore(paragraph, previous);
    previous.parentNode.removeChild(previous);
    block.parentNode.removeChild(block);
    restoreWysiwygCaretWithinElement(paragraph, caretOffset);
    return true;
  }

  function mergeHeadingIntoPreviousParagraphAsParagraph(block) {
    var previous = block && block.previousElementSibling;
    var caretOffset;
    var child;

    if (!isHeadingBlock(block) || !isParagraphLikeBlock(previous)) {
      return false;
    }

    caretOffset = previous.textContent.length;
    while (block.firstChild) {
      child = block.firstChild;
      block.removeChild(child);
      if (!(child.nodeType === Node.ELEMENT_NODE && child.tagName === "BR")) {
        previous.appendChild(child);
      }
    }

    block.parentNode.removeChild(block);
    restoreWysiwygCaretWithinElement(previous, caretOffset);
    return true;
  }

  function normalizeNestedHeadingsInParagraphs() {
    var changed = false;
    var selection = window.getSelection();
    var range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    var headings = Array.prototype.slice.call(wysiwygEditor.querySelectorAll("h1, h2, h3, h4, h5, h6"));

    headings.forEach(function (heading) {
      var paragraph = heading.parentElement;
      var text = document.createTextNode(heading.textContent || "");
      var caretOffset = null;
      var preRange;

      if (!isParagraphLikeBlock(paragraph) || paragraph === wysiwygEditor) {
        return;
      }

      if (range && heading.contains(range.startContainer)) {
        preRange = document.createRange();
        preRange.selectNodeContents(paragraph);
        preRange.setEnd(range.startContainer, range.startOffset);
        caretOffset = preRange.toString().length;
      }

      paragraph.replaceChild(text, heading);
      if (caretOffset !== null) {
        restoreWysiwygCaretWithinElement(paragraph, caretOffset);
      }
      changed = true;
    });

    return changed;
  }

  function handleWysiwygStructuralKey(event) {
    var selection;
    var range;
    var block;

    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
      return false;
    }

    selection = window.getSelection();
    range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !range.collapsed || !wysiwygEditor.contains(range.commonAncestorContainer)) {
      return false;
    }

    block = wysiwygBlockForRange(range);
    if (event.key === "Enter" && isHeadingBlock(block) && isRangeAtStartOfBlock(range, block)) {
      event.preventDefault();
      insertParagraphBeforeBlock(block);
      return true;
    }

    if (event.key === "Enter" && isHeadingBlock(block) && isRangeAtEndOfBlock(range, block)) {
      event.preventDefault();
      insertParagraphAfterBlock(block);
      scheduleSyncFromWysiwyg();
      return true;
    }

    if (
      event.key === "Backspace" &&
      isHeadingBlock(block) &&
      isRangeAtStartOfBlock(range, block) &&
      (removeEmptyBlockBeforeHeading(block.previousElementSibling) ||
        mergeHeadingIntoPreviousParagraphAsParagraph(block))
    ) {
      event.preventDefault();
      scheduleSyncFromWysiwyg();
      return true;
    }

    if (
      event.key === "Backspace" &&
      isRangeAtStartOfBlock(range, block) &&
      mergeParagraphIntoPreviousHeadingAsParagraph(block)
    ) {
      event.preventDefault();
      scheduleSyncFromWysiwyg();
      return true;
    }

    if (event.key === "Delete") {
      if (
        isHeadingBlock(block) &&
        isRangeAtStartOfBlock(range, block) &&
        (removeEmptyBlockBeforeHeading(block.previousElementSibling) ||
          mergeHeadingIntoPreviousParagraphAsParagraph(block))
      ) {
        event.preventDefault();
        scheduleSyncFromWysiwyg();
        return true;
      }

      if (
        isParagraphLikeBlock(block) &&
        isRangeAtEndOfBlock(range, block) &&
        mergeHeadingIntoPreviousParagraphAsParagraph(block.nextElementSibling)
      ) {
        event.preventDefault();
        scheduleSyncFromWysiwyg();
        return true;
      }

      if (removeEmptyBlockBeforeHeading(block)) {
        event.preventDefault();
        scheduleSyncFromWysiwyg();
        return true;
      }
    }

    return false;
  }

  function bindEvents() {
    newFileButton.addEventListener("click", handleNewFile);
    newTabButton.addEventListener("click", handleNewFile);
    if (tabScrollLeft) {
      tabScrollLeft.addEventListener("click", function () {
        scrollTabsByPage(-1);
      });
    }
    if (tabScrollRight) {
      tabScrollRight.addEventListener("click", function () {
        scrollTabsByPage(1);
      });
    }
    if (tabViewport) {
      tabViewport.addEventListener("scroll", updateTabScrollButtons, { passive: true });
      tabViewport.addEventListener("wheel", handleTabWheel, { passive: false });
    }
    openFileButton.addEventListener("click", handleOpenFile);
    saveFileButton.addEventListener("click", handleSaveFile);
    saveAsFileButton.addEventListener("click", handleSaveAsFile);
    recentFilesSelect.addEventListener("change", handleRecentFileChange);
    if (workspaceButton) {
      workspaceButton.addEventListener("click", toggleWorkspaceMenu);
    }
    if (openWorkspaceFolderButton) {
      openWorkspaceFolderButton.addEventListener("click", handleOpenWorkspaceFolder);
    }
    if (refreshWorkspaceButton) {
      refreshWorkspaceButton.addEventListener("click", handleRefreshWorkspace);
    }
    if (closeWorkspaceButton) {
      closeWorkspaceButton.addEventListener("click", handleCloseWorkspace);
    }
    if (showWorkspaceSidebarButton) {
      showWorkspaceSidebarButton.addEventListener("click", function () {
        closeWorkspaceMenu();
        if (workspaceSidebar) {
          workspaceSidebar.setMode("expanded");
        }
      });
    }
    if (hideWorkspaceSidebarButton) {
      hideWorkspaceSidebarButton.addEventListener("click", function () {
        closeWorkspaceMenu();
        if (workspaceSidebar) {
          workspaceSidebar.setMode("hidden");
        }
      });
    }
    if (minimizeWorkspaceSidebarButton) {
      minimizeWorkspaceSidebarButton.addEventListener("click", function () {
        closeWorkspaceMenu();
        if (workspaceSidebar) {
          workspaceSidebar.setMode("minimized");
        }
      });
    }

    toggleEditorMode.addEventListener("pointerdown", function (event) {
      event.preventDefault();
    });
    toggleSoftWrap.addEventListener("pointerdown", function (event) {
      event.preventDefault();
    });
    toggleEditorMode.addEventListener("click", toggleEditorModeState);
    toggleSoftWrap.addEventListener("click", toggleSoftWrapState);

    if (toggleFocusMode) {
      toggleFocusMode.addEventListener("click", toggleFocusModeState);
    }
    aboutButton.addEventListener("click", openAboutDialog);
    aboutClose.addEventListener("click", closeAboutDialog);
    aboutOverlay.addEventListener("click", function (event) {
      if (event.target === aboutOverlay) {
        closeAboutDialog();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && workspaceMenu && !workspaceMenu.hidden) {
        event.preventDefault();
        closeWorkspaceMenu();
        workspaceButton.focus();
      } else if (event.key === "Escape" && aiAssistant && aiAssistant.closeTransientUi()) {
        event.preventDefault();
      } else if (event.key === "Escape" && !aboutOverlay.hidden) {
        event.preventDefault();
        closeAboutDialog();
      } else if (event.key === "Escape" && focusModeEnabled) {
        event.preventDefault();
        setFocusMode(false);
      }
    });

    document.addEventListener("click", function (event) {
      if (
        workspaceMenu &&
        !workspaceMenu.hidden &&
        !workspaceMenu.contains(event.target) &&
        workspaceButton &&
        !workspaceButton.contains(event.target)
      ) {
        closeWorkspaceMenu();
      }
    });
    formatBlock.addEventListener("change", function () {
      if (getActiveMode() === "markdown") {
        actions.applyMarkdownFormat(formatBlock.value);
        return;
      }
      actions.execWysiwyg("formatBlock", formatBlock.value);
    });

    toolbarButtons.forEach(function (button) {
      button.addEventListener("pointerdown", function (event) {
        event.preventDefault();
      });
    });

    editorToolbar.addEventListener("click", function (event) {
      var button = event.target.closest("[data-action]");
      var action;

      if (!button || !editorToolbar.contains(button)) {
        return;
      }

      action = button.getAttribute("data-action");
      if (action === "image") {
        handleInsertImage();
        return;
      }
      actions.applyToolbarAction(action);
    });

    window.addEventListener("scroll", viewport.scheduleTracking, { passive: true });
    window.addEventListener("resize", function () {
      updateTabScrollButtons();
      if (workspaceMenu && !workspaceMenu.hidden) {
        positionWorkspaceMenu();
      }
    });
    window.addEventListener("beforeunload", handleBeforeUnload);
    wysiwygEditor.addEventListener("scroll", viewport.scheduleTracking, { passive: true });
    markdownEditor.addEventListener("scroll", viewport.scheduleTracking, { passive: true });

    wysiwygEditor.addEventListener("focus", function () {
      setActiveEditorSource("wysiwyg");
    });
    wysiwygEditor.addEventListener("pointerdown", function () {
      setActiveEditorSource("wysiwyg");
    });
    markdownEditor.addEventListener("focus", function () {
      setActiveEditorSource("markdown");
    });
    markdownEditor.addEventListener("pointerdown", function () {
      setActiveEditorSource("markdown");
    });

    wysiwygEditor.addEventListener("input", function () {
      setActiveEditorSource("wysiwyg");
      normalizeNestedHeadingsInParagraphs();
      scheduleSyncFromWysiwyg();
    });
    wysiwygEditor.addEventListener("keyup", actions.updateFormatSelect);
    wysiwygEditor.addEventListener("mouseup", actions.updateFormatSelect);

    wysiwygEditor.addEventListener("paste", function (event) {
      var data = event.clipboardData;
      var imageFiles;
      if (!data) {
        return;
      }

      if (transferHasImages(data)) {
        imageFiles = imageFilesFromTransfer(data);
        event.preventDefault();
        storeAndInsertImages(imageFiles, {
          action: "Paste image",
          alt: "pasted image",
          fallbackAlt: "pasted image",
          prefix: "pasted",
          selection: actions.captureSelection()
        });
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
      var session;

      if (isSyncingEditors) {
        return;
      }
      activeEditSource = "markdown";
      setActiveEditorSource("markdown");
      window.clearTimeout(syncTimer);
      wysiwygNeedsSync = false;
      setMarkdown(markdownEditor.value, "textarea");
      session = getActiveSession();
      if (session) {
        session.markdownSelectionStart = markdownEditor.selectionStart;
        session.markdownSelectionEnd = markdownEditor.selectionEnd;
        session.markdownScrollTop = markdownEditor.scrollTop;
      }
    });

    wysiwygEditor.addEventListener("keydown", function (event) {
      if (handleWysiwygStructuralKey(event)) {
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        actions.applyToolbarAction(event.shiftKey ? "outdentList" : "indentList");
      }
    });

    markdownEditor.addEventListener("keydown", function (event) {
      if (event.key === "Tab") {
        event.preventDefault();
        actions.applyToolbarAction(event.shiftKey ? "outdentList" : "indentList");
      }
    });

    markdownEditor.addEventListener("paste", function (event) {
      var data = event.clipboardData;
      if (!data) {
        return;
      }

      event.preventDefault();
      actions.insertTextIntoTextarea(data.getData("text/plain") || "");
    });

    wysiwygEditor.addEventListener("dragover", handleEditorDragOver);
    wysiwygEditor.addEventListener("drop", handleEditorDrop);
    markdownEditor.addEventListener("dragover", handleEditorDragOver);
    markdownEditor.addEventListener("drop", handleEditorDrop);

    document.addEventListener("selectionchange", actions.updateFormatSelect);

    document.addEventListener("keydown", function (event) {
      var isModifier = event.metaKey || event.ctrlKey;
      if (!isModifier) {
        return;
      }

      var key = event.key.toLowerCase();

      if (event.shiftKey && key === "f") {
        event.preventDefault();
        toggleFocusModeState();
        return;
      }

      if (handleFileShortcut(key, event)) {
        return;
      }

      if (handleTabShortcut(key, event)) {
        return;
      }

      if (key === "z" && !event.altKey) {
        event.preventDefault();
        applyHistoryStep(event.shiftKey ? 1 : -1);
      } else if (key === "y" && !event.altKey) {
        event.preventDefault();
        applyHistoryStep(1);
      } else if (key === "b") {
        event.preventDefault();
        actions.applyToolbarAction("bold");
      } else if (key === "i") {
        event.preventDefault();
        actions.applyToolbarAction("italic");
      }
    });
  }

  function installTestApi() {
    var params;

    try {
      params = new URLSearchParams(window.location.search);
    } catch (error) {
      return;
    }

    if (!params.has("e2e")) {
      return;
    }

    ME.__testApi = {
      getEditorStateForTest: function () {
        var session = getActiveSession();
        return {
          editorMode: getEditorMode(),
          softWrapEnabled: softWrapEnabled,
          markdownText: session ? session.markdownText : "",
          markdownSelectionStart: markdownEditor.selectionStart,
          markdownSelectionEnd: markdownEditor.selectionEnd,
          markdownScrollTop: markdownEditor.scrollTop,
          wysiwygScrollTop: wysiwygEditor.scrollTop,
          modeLabel: modeLabel.textContent,
          markdownHidden: markdownEditor.hidden,
          wysiwygHidden: wysiwygEditor.hidden
        };
      },
      loadMarkdownForTest: function (filename, markdownText) {
        var session = getActiveSession();

        if (!session) {
          return;
        }

        flushActiveEditor();
        session.title = filename || "Test.md";
        session.markdownText = String(markdownText || "");
        markdownEditor.value = session.markdownText;
        renderWysiwygFromMarkdown({ force: true });
        if (getEditorMode() === EDITOR_MODES.MARKDOWN) {
          showMarkdownEditor();
        } else {
          showWysiwygEditor();
        }
        if (session.history) {
          session.history.reset(session.markdownText);
        }
        resetScrollPositions();
        session.dirty = false;
        updateCounts();
        updateModeControls();
        updateDocumentTitle();
        renderTabs();
      },
      captureSelectionForTest: function () {
        var selection = actions.captureSelection();

        return selection ? {
          captureMethod: selection.captureMethod || "",
          contentType: selection.contentType || "",
          mode: selection.mode || "",
          text: selection.text || "",
          value: selection.value || ""
        } : null;
      }
    };
  }

  function init() {
    var initialSession;

    viewport = ME.viewport.create({
      getActiveMode: getActiveMode,
      getMarkdownText: getMarkdownText,
      markdownEditor: markdownEditor,
      wysiwygEditor: wysiwygEditor
    });

    actions = ME.editorActions.create({
      applyHistoryStep: applyHistoryStep,
      formatBlock: formatBlock,
      getActiveMode: getActiveMode,
      markdownEditor: markdownEditor,
      scheduleSyncFromWysiwyg: scheduleSyncFromWysiwyg,
      setMarkdown: setMarkdown,
      wysiwygEditor: wysiwygEditor
    });

    if (ME.resizer && ME.resizer.createAiPanel) {
      aiPanelResizer = ME.resizer.createAiPanel({
        handle: aiPanelResizeHandle,
        workspace: workspace
      });
      aiPanelResizer.bindEvents();
    }

    if (ME.workspaceSidebar && workspaceSidebarElement) {
      workspaceSidebar = ME.workspaceSidebar.create({
        rootElement: workspaceSidebarElement,
        resizerElement: workspaceSidebarResizer,
        workspaceElement: workspace,
        onOpenFile: openWorkspaceFile,
        onOpenFolder: handleOpenWorkspaceFolder,
        onRefresh: handleRefreshWorkspace,
        onClose: handleCloseWorkspace
      });
      workspaceSidebar.bindEvents();
    }

    aiAssistant = ME.aiAssistant.create({
      applyButton: aiReviewApply,
      applyModeInputs: aiApplyModeInputs,
      applyStatus: aiApplyStatus,
      applyStatusText: aiApplyStatusText,
      cancelButton: aiReviewCancel,
      captureActiveEditorState: captureActiveEditorState,
      closeButton: aiReviewClose,
      captureSelection: actions.captureSelection,
      focusActiveEditor: focusActiveEditor,
      getActiveMode: getActiveMode,
      getActiveSessionId: function () {
        var session = getActiveSession();
        return session ? session.id : null;
      },
      getMarkdownText: getMarkdownText,
      insertHtmlAtSelection: actions.insertHtmlAtSelection,
      markdownEditor: markdownEditor,
      originalText: aiOriginalText,
      resultTitle: aiResultTitle,
      renderMarkdownToHtml: renderMarkdownForSession,
      restoreActiveEditorState: restoreActiveEditorState,
      restoreOriginalButton: aiRestoreOriginal,
      resultText: aiResultText,
      revisionList: aiRevisionList,
      revisionSection: aiRevisionSection,
      revisionStatus: aiRevisionStatus,
      diffHideUnchanged: aiDiffHideUnchanged,
      diffInteractiveButton: aiDiffInteractiveButton,
      diffSideBySideButton: aiDiffSideBySideButton,
      diffSummary: aiDiffSummary,
      diffUnifiedButton: aiDiffUnifiedButton,
      diffView: aiDiffView,
      aiEngineAdvancedPanel: aiEngineAdvancedPanel,
      aiEngineAdvancedStatus: aiEngineAdvancedStatus,
      aiEngineAdvancedToggle: aiEngineAdvancedToggle,
      aiEngineChangeSettingsButton: aiEngineChangeSettingsButton,
      aiEngineOverrideModel: aiEngineOverrideModel,
      aiEngineOverrideModelOptions: aiEngineOverrideModelOptions,
      aiEngineOverrideReasoning: aiEngineOverrideReasoning,
      aiEngineRegenerateButton: aiEngineRegenerateButton,
      aiEngineSummary: aiEngineSummary,
      aiEngineSummaryDetail: aiEngineSummaryDetail,
      aiEngineSummaryPill: aiEngineSummaryPill,
      aiEngineTemporaryOverride: aiEngineTemporaryOverride,
      patchAcceptAllButton: aiPatchAcceptAll,
      patchRejectAllButton: aiPatchRejectAll,
      patchResetButton: aiPatchReset,
      onClipboardAction: handleClipboardAction,
      wysiwygEditor: wysiwygEditor,
      reviewDialog: aiReviewDialog,
      reviewLog: aiReviewLog,
      reviewOverlay: aiReviewOverlay,
      reviewStatus: aiReviewStatus,
      reviewTitle: aiReviewTitle,
      setMarkdown: setMarkdown,
      settings: {
        apiKeyInput: aiApiKeyInput,
        cancelButton: aiSettingsCancel,
        closeButton: aiSettingsClose,
        dialog: aiSettingsDialog,
        endpointInput: aiEndpointInput,
        form: aiSettingsForm,
        modeMock: aiModeMock,
        modeServer: aiModeServer,
        modelInput: aiModelInput,
        modelListButton: aiModelListButton,
        modelOptions: aiModelOptions,
        modelSelect: aiModelSelect,
        overlay: aiSettingsOverlay,
        privacySection: aiPrivacySection,
        providerHint: aiProviderHint,
        providerSelect: aiProviderSelect,
        reasoningEffort: aiReasoningEffort,
        reasoningEffortLabel: aiReasoningEffortLabel,
        reasoningEnabled: aiReasoningEnabled,
        reasoningEnabledLabel: aiReasoningEnabledLabel,
        reasoningLegend: aiReasoningLegend,
        reasoningSummary: aiReasoningSummary,
        reasoningSummaryLabel: aiReasoningSummaryLabel,
        reasoningTokenBudget: aiReasoningTokenBudget,
        reasoningTokenBudgetLabel: aiReasoningTokenBudgetLabel,
        saveButton: aiSettingsSave,
        cloudConsent: aiCloudConsent,
        statusElement: aiSettingsStatus,
        testButton: aiSettingsTest
      },
      statusBadge: aiStatusBadge,
      toolbarButton: aiAssistantButton,
      toolbarMenu: aiToolbarMenu,
      workspace: workspace,
      aiAssistantPanel: aiAssistantPanel,
      aiAssistantPanelBody: aiAssistantPanelBody
    });

    tabs = ME.tabManager.create({
      createSession: createSession
    });
    initialSession = createSession({
      markdownText: "",
      title: "Untitled.md",
      editorMode: editorMode.readStoredEditorMode()
    });
    tabs.addSession(initialSession, { activate: false });
    setActiveSession(initialSession, { restoreScroll: false });
    bindEvents();
    aiAssistant.bindEvents();
    installTestApi();
    updateFileControls();
    renderWorkspaceSidebar();
    refreshRecentFiles();
    focusActiveEditor();
  }

  init();
}());
