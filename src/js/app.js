(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var markdown = ME.markdown;
  var fileStore = ME.fileStore;
  var workspaceStore = ME.workspaceStore;
  var workspaceSession = ME.workspaceSession;
  var workspaceOperations = ME.workspaceOperations;
  var workspaceSearch = ME.workspaceSearch;
  var workspaceRelated = ME.workspaceRelated;
  var documentType = ME.documentType;
  var documentValidation = ME.documentValidation;
  var assetStore = ME.assetStore;
  var storageProviders = ME.storageProviders;
  var localFilesystemProvider = ME.localFilesystemProvider;
  var bridgeClient = ME.bridgeClient;
  var remoteStatus = ME.remoteStatus;
  var remoteConnectionUI = ME.remoteConnectionUI;
  var remoteSSHProviderModule = ME.remoteSSHProvider;
  var recentStore = ME.recentFiles ? ME.recentFiles.create({ maxFiles: 10 }) : null;
  var editorMode = ME.editorMode;
  var EDITOR_MODES = editorMode.EDITOR_MODES;

  var tabs = null;
  var recentRecords = [];
  var recentWorkspaceRecords = [];
  var recentRemoteWorkspaceRecords = [];
  var focusModeEnabled = false;
  var syncTimer = 0;
  var validationTimer = 0;
  var wysiwygNeedsSync = false;
  var isSyncingEditors = false;
  var activeEditSource = null;
  var lastEditorAnchor = null;
  var softWrapEnabled = editorMode.readStoredSoftWrap();

  var menuBarElement = document.getElementById("menuBar");
  var wysiwygEditor = document.getElementById("wysiwygEditor");
  var markdownEditor = document.getElementById("markdownEditor");
  var workspace = document.getElementById("workspace");
  var activityBarElement = document.getElementById("activityBar");
  var themeToggleButton = document.getElementById("themeToggleButton");
  var workspaceSidebarElement = document.getElementById("workspaceSidebar");
  var workspaceSidebarResizer = document.getElementById("workspaceSidebarResizer");
  var toggleEditorMode = document.getElementById("toggleEditorMode");
  var toggleSoftWrap = document.getElementById("toggleSoftWrap");
  var modeLabel = document.getElementById("modeLabel");
  var workspaceStatus = document.getElementById("workspaceStatus");
  var documentStatus = document.getElementById("documentStatus");
  var documentTypeStatus = document.getElementById("documentTypeStatus");
  var validationStatus = document.getElementById("validationStatus");
  var applicationStatus = document.getElementById("applicationStatus");
  var softWrapStatus = document.getElementById("softWrapStatus");
  var cursorPosition = document.getElementById("cursorPosition");
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
  var aiAssistantPanelWelcome = document.getElementById("aiAssistantPanelWelcome");
  var aiAssistantPanelClose = document.getElementById("aiAssistantPanelClose");
  var aiAssistantPanelSettings = document.getElementById("aiAssistantPanelSettings");
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
  var aiSettingsConfigureActions = document.getElementById("aiSettingsConfigureActions");
  var aiActionConfigOverlay = document.getElementById("aiActionConfigOverlay");
  var aiActionConfigDialog = document.getElementById("aiActionConfigDialog");
  var aiActionConfigEditor = document.getElementById("aiActionConfigEditor");
  var aiActionConfigStatus = document.getElementById("aiActionConfigStatus");
  var aiActionConfigValidate = document.getElementById("aiActionConfigValidate");
  var aiActionConfigImport = document.getElementById("aiActionConfigImport");
  var aiActionConfigImportInput = document.getElementById("aiActionConfigImportInput");
  var aiActionConfigExport = document.getElementById("aiActionConfigExport");
  var aiActionConfigReset = document.getElementById("aiActionConfigReset");
  var aiActionConfigCancel = document.getElementById("aiActionConfigCancel");
  var aiActionConfigClose = document.getElementById("aiActionConfigClose");
  var aiActionConfigSave = document.getElementById("aiActionConfigSave");
  var documentTitle = document.getElementById("documentTitle");
  var newFileButton = document.getElementById("newFile");
  var openFileButton = document.getElementById("openFile");
  var saveFileButton = document.getElementById("saveFile");
  var saveAsFileButton = document.getElementById("saveAsFile");
  var recentFilesSelect = document.getElementById("recentFiles");
  var fileMenuButton = document.getElementById("fileMenuButton");
  var fileMenu = document.getElementById("fileMenu");
  var editMenuButton = document.getElementById("editMenuButton");
  var editMenu = document.getElementById("editMenu");
  var viewMenuButton = document.getElementById("viewMenuButton");
  var viewMenu = document.getElementById("viewMenu");
  var workspaceButton = document.getElementById("workspaceButton");
  var workspaceMenu = document.getElementById("workspaceMenu");
  var openWorkspaceFolderButton = document.getElementById("openWorkspaceFolder");
  var restoreWorkspaceButton = document.getElementById("restoreWorkspace");
  var recentWorkspacesSelect = document.getElementById("recentWorkspaces");
  var recentRemoteWorkspacesSelect = document.getElementById("recentRemoteWorkspaces");
  var refreshWorkspaceButton = document.getElementById("refreshWorkspace");
  var closeWorkspaceButton = document.getElementById("closeWorkspace");
  var expandWorkspaceFoldersButton = document.getElementById("expandWorkspaceFolders");
  var collapseWorkspaceFoldersButton = document.getElementById("collapseWorkspaceFolders");
  var showWorkspaceSidebarButton = document.getElementById("showWorkspaceSidebar");
  var hideWorkspaceSidebarButton = document.getElementById("hideWorkspaceSidebar");
  var minimizeWorkspaceSidebarButton = document.getElementById("minimizeWorkspaceSidebar");
  var moreButton = document.getElementById("moreButton");
  var moreMenu = document.getElementById("moreMenu");
  var tabViewport = document.getElementById("tabViewport");
  var tabList = document.getElementById("tabList");
  var tabScrollLeft = document.getElementById("tabScrollLeft");
  var tabScrollRight = document.getElementById("tabScrollRight");
  var newTabButton = document.getElementById("newTabButton");
  var editorToolbar = document.querySelector(".toolbar");
  var editorArea = document.getElementById("editorArea");
  var toolbarButtons = Array.prototype.slice.call(document.querySelectorAll("[data-action]"));
  var viewModeMenuItem = document.querySelector('[data-command="view.toggleEditorMode"]');
  var copyRenderedHtmlMenuItem = document.querySelector('[data-command="edit.copyRenderedHtml"]');
  var insertImageButton = document.querySelector('[data-action="image"]');
  var undoButton = document.querySelector('[data-action="undo"]');
  var redoButton = document.querySelector('[data-action="redo"]');

  var viewport;
  var statusBarController;
  var menuBarController;
  var aiPanelResizer;
  var activityBar;
  var remoteStatusController;
  var remoteConnectionController;
  var remoteSSHProvider;
  var actions;
  var aiAssistant;
  var workspaceSidebar;
  var nextWorkspaceId = 1;
  var workspaceState = {
    directories: [],
    id: "",
    providerId: "",
    rootHandle: null,
    rootName: "",
    workspace: null,
    files: [],
    tree: null,
    isScanning: false,
    error: "",
    lazy: false
  };
  var workspaceContentSearchState = {
    error: "",
    isSearching: false,
    limited: false,
    query: "",
    results: []
  };
  var restorableWorkspaceSession = null;
  var recentlyOpenedWorkspacePaths = [];
  var workspaceSessionSaveTimer = 0;
  var suppressWorkspaceSessionSave = false;
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

  function activeDocumentAllowsMarkdownCommands() {
    var session = getActiveSession();

    return Boolean(session && documentType && documentType.allowsMarkdownCommands(session.documentType));
  }

  function getActiveMode() {
    var session = getActiveSession();
    var mode = session ? session.editorMode || session.activeMode : editorMode.readStoredEditorMode();

    return editorMode.normalizeEditorModeForDocument
      ? editorMode.normalizeEditorModeForDocument(mode, session && session.documentType || "markdown")
      : editorMode.normalizeEditorMode(mode);
  }

  function getEditorMode() {
    return getActiveMode();
  }

  function setActiveEditorSource(source) {
    var session = getActiveSession();
    var normalized = editorMode.normalizeEditorModeForDocument
      ? editorMode.normalizeEditorModeForDocument(source, session && session.documentType || "markdown")
      : editorMode.normalizeEditorMode(source);

    activeEditSource = normalized;
    if (session) {
      session.editorMode = normalized;
      session.activeMode = normalized;
      session.activeEditorSource = normalized;
    }
    if (modeLabel) {
      modeLabel.textContent = session && session.sourceOnly ? "Source" : normalized === "markdown" ? "Markdown" : "WYSIWYG";
    }
    if (statusBarController) {
      statusBarController.setMode(session && session.sourceOnly ? "source" : normalized);
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

  function activeWorkspaceProvider() {
    return storageProviders && storageProviders.getForWorkspace(workspaceState.workspace || workspaceState) || localFilesystemProvider || null;
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
    if (!activeDocumentAllowsMarkdownCommands()) {
      return "";
    }
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

  function selectionWithinEditor(mode) {
    var normalized = editorMode.normalizeEditorMode(mode);
    var selection;
    var range;

    if (normalized === EDITOR_MODES.MARKDOWN) {
      return document.activeElement === markdownEditor;
    }

    selection = window.getSelection();
    range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    return Boolean(range && wysiwygEditor.contains(range.commonAncestorContainer));
  }

  function rememberActiveEditorAnchor() {
    var mode = getActiveMode();

    if (!selectionWithinEditor(mode)) {
      return;
    }

    lastEditorAnchor = captureEditorAnchor(mode);
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

    if (!session || session !== getActiveSession()) {
      return;
    }

    session.wysiwygScrollTop = wysiwygEditor.scrollTop;
    session.markdownScrollTop = markdownEditor.scrollTop;
    session.softWrapEnabled = softWrapEnabled;
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
    var html;

    if (!activeDocumentAllowsMarkdownCommands()) {
      return;
    }
    html = renderMarkdownForSession(getMarkdownText());

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
    var trimmed;
    var words;

    if (statusBarController) {
      statusBarController.scheduleCounts(text);
      return;
    }
    trimmed = text.trim();
    words = trimmed ? trimmed.split(/\s+/).length : 0;
    wordCount.textContent = words + (words === 1 ? " word" : " words");
    charCount.textContent = text.length + (text.length === 1 ? " char" : " chars");
  }

  function updateCursorStatus() {
    var mode;

    if (!statusBarController) {
      return;
    }

    mode = getEditorMode();
    statusBarController.setCursor(
      mode,
      mode === EDITOR_MODES.MARKDOWN ? markdownEditor.value : getMarkdownText(),
      mode === EDITOR_MODES.MARKDOWN ? markdownEditor.selectionStart : 0
    );
  }

  function updateValidationStatus(session) {
    session = session || getActiveSession();
    if (statusBarController && session) {
      statusBarController.setDocumentType(session.documentType);
      statusBarController.setValidation(session.documentType, session.validationState);
    }
  }

  function validateSession(session, options) {
    var validationState;

    options = options || {};
    session = session || getActiveSession();
    if (!session || !documentValidation) {
      return null;
    }

    validationState = documentValidation.validateDocument(session.documentType, session.markdownText);
    session.validationState = validationState;
    if (session === getActiveSession()) {
      updateValidationStatus(session);
      if (options.announce && statusBarController) {
        statusBarController.showMessage(
          validationState.status === "invalid"
            ? validationState.message || "This document contains a syntax warning."
            : validationState.status === "valid"
              ? "Document syntax is valid."
              : "Validation is not applicable to this document type.",
          4000
        );
      }
    }
    return validationState;
  }

  function scheduleDocumentValidation(session) {
    window.clearTimeout(validationTimer);
    validationTimer = window.setTimeout(function () {
      validateSession(session);
    }, 350);
  }

  function updateDocumentTitle() {
    var session = getActiveSession();
    var title = session ? session.title : "Untitled.md";
    var displayTitle = (session && session.dirty ? "* " : "") + title;

    documentTitle.textContent = displayTitle;
    documentTitle.title = session && session.dirty ? title + " has unsaved changes" : title;
    document.title = displayTitle + " - LocalDraftAI";
    if (statusBarController) {
      statusBarController.setDocument({
        dirty: Boolean(session && session.dirty),
        title: title
      });
      if (session) {
        updateValidationStatus(session);
      }
    }
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
    options = options || {};
    if (options.softWrapEnabled == null) {
      options.softWrapEnabled = softWrapEnabled;
    }
    var session = ME.documentSession.create(options);

    session.history = session.history || createSessionHistory();
    session.history.reset(session.markdownText);
    session.dirty = Boolean(options.dirty);
    session.editorMode = editorMode.normalizeEditorModeForDocument
      ? editorMode.normalizeEditorModeForDocument(session.editorMode || options.editorMode || session.activeMode || editorMode.readStoredEditorMode(), session.documentType)
      : editorMode.normalizeEditorMode(session.editorMode || options.editorMode || session.activeMode || editorMode.readStoredEditorMode());
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
    var session = getActiveSession();

    if (session && session.sourceOnly) {
      showMarkdownEditor();
      return;
    }
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
    if (statusBarController) {
      statusBarController.setSoftWrap(softWrapEnabled);
    }
  }

  function updateModeControls() {
    var mode = getEditorMode();
    var session = getActiveSession();
    var sourceOnly = Boolean(session && session.sourceOnly);
    var allowFormatting = Boolean(session && documentType && documentType.allowsFormattingToolbar(session.documentType));

    if (toggleEditorMode) {
      toggleEditorMode.disabled = sourceOnly;
      toggleEditorMode.textContent = sourceOnly ? "Source" : mode === EDITOR_MODES.MARKDOWN ? "Markdown" : "WYSIWYG";
      toggleEditorMode.setAttribute("aria-pressed", String(mode === EDITOR_MODES.MARKDOWN));
      toggleEditorMode.title = sourceOnly
        ? "WYSIWYG is available only for Markdown files"
        : mode === EDITOR_MODES.MARKDOWN
        ? "Switch to WYSIWYG editing"
        : "Switch to Markdown editing";
    }

    if (viewModeMenuItem) {
      viewModeMenuItem.disabled = sourceOnly;
      viewModeMenuItem.title = sourceOnly ? "WYSIWYG is available only for Markdown files" : "Switch editor mode";
    }
    if (copyRenderedHtmlMenuItem) {
      copyRenderedHtmlMenuItem.disabled = sourceOnly;
    }
    if (formatBlock) {
      formatBlock.disabled = !allowFormatting;
    }
    toolbarButtons.forEach(function (button) {
      var action = button.getAttribute("data-action");
      if (action !== "undo" && action !== "redo") {
        button.disabled = !allowFormatting || (action === "image" && !isImagePickerSupported());
      }
    });
    if (editorArea) {
      editorArea.classList.toggle("is-source-only", sourceOnly);
    }
    markdownEditor.classList.toggle("is-source-document", sourceOnly);

    if (modeLabel) {
      modeLabel.textContent = sourceOnly ? "Source" : mode === EDITOR_MODES.MARKDOWN ? "Markdown" : "WYSIWYG";
    }
    if (statusBarController) {
      statusBarController.setMode(sourceOnly ? "source" : mode);
      if (session) {
        updateValidationStatus(session);
      }
    }

    applySoftWrapState();
    if (actions) {
      actions.updateFormatSelect();
    }
  }

  function toggleSoftWrapState() {
    softWrapEnabled = !softWrapEnabled;
    if (getActiveSession()) {
      getActiveSession().softWrapEnabled = softWrapEnabled;
    }
    editorMode.storeSoftWrap(softWrapEnabled);
    applySoftWrapState();
    scheduleWorkspaceSessionSave();
  }

  function setActiveSession(session, options) {
    var previousSession;
    var activeSession;

    options = options || {};

    if (!tabs || !session) {
      return;
    }

    window.clearTimeout(syncTimer);
    window.clearTimeout(validationTimer);
    previousSession = getActiveSession();

    if (previousSession && previousSession !== session) {
      saveActiveEditorState(previousSession);
      validateSession(previousSession);
    }
    if (previousSession && previousSession !== session && viewport && viewport.capture) {
      previousSession.scrollState = viewport.capture();
    }

    activeSession = tabs.setActiveSession(session.id || session);
    if (!activeSession) {
      return;
    }

    lastEditorAnchor = null;
    softWrapEnabled = activeSession.softWrapEnabled !== false;
    markdownEditor.value = activeSession.markdownText;
    if (activeSession.sourceOnly) {
      wysiwygEditor.innerHTML = "";
    } else {
      wysiwygEditor.innerHTML = renderMarkdownForSession(activeSession.markdownText);
    }
    wysiwygNeedsSync = false;
    activeEditSource = activeSession.activeMode;
    if (getEditorMode() === EDITOR_MODES.MARKDOWN) {
      showMarkdownEditor();
    } else {
      showWysiwygEditor();
    }
    updateCounts();
    updateModeControls();
    updateFileControls();
    updateCursorStatus();
    activeSession.history.updateControls();
    updateDocumentTitle();
    validateSession(activeSession);
    renderTabs();
    scheduleWorkspaceSessionSave();

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
      updateCursorStatus();
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
    activeSession.hasFinalNewline = /\n$/.test(activeSession.markdownText);
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
    updateCursorStatus();
    scheduleDocumentValidation(activeSession);

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
    } else if (sessionBelongsToWorkspace(activeSession)) {
      renderWorkspaceSidebar();
      scheduleWorkspaceSessionSave();
    }
  }

  function syncFromWysiwyg() {
    var activeSession = getActiveSession();
    var converted;

    if (isSyncingEditors || !activeSession || activeSession.sourceOnly) {
      return;
    }
    converted = markdown.htmlToMarkdown(wysiwygEditor);

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
    if (isSyncingEditors || (getActiveSession() && getActiveSession().sourceOnly)) {
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
    if (!activeSession.sourceOnly) {
      renderWysiwygFromMarkdown({
        force: true
      });
    }
    updateCounts();
    updateCursorStatus();

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
    var normalized = editorMode.normalizeEditorModeForDocument
      ? editorMode.normalizeEditorModeForDocument(nextMode, activeSession && activeSession.documentType || "markdown")
      : editorMode.normalizeEditorMode(nextMode);
    var anchor;

    if (!activeSession) {
      return;
    }
    if (activeSession.sourceOnly) {
      showMarkdownEditor();
      updateModeControls();
      focusActiveEditor();
      return;
    }
    if (normalized === currentMode) {
      focusActiveEditor();
      return;
    }

    if (aiAssistant) {
      aiAssistant.hideTransientUi();
    }

    anchor = selectionWithinEditor(currentMode) || !lastEditorAnchor || lastEditorAnchor.source !== currentMode
      ? captureEditorAnchor(currentMode)
      : lastEditorAnchor;
    flushActiveEditor();

    activeSession.editorMode = normalized;
    activeSession.activeMode = normalized;
    activeSession.activeEditorSource = normalized;
    editorMode.storeEditorMode(normalized);
    scheduleWorkspaceSessionSave();

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
    updateCursorStatus();

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
    closeMoreMenu();
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

  function formatRecentWorkspaceTime(timestamp) {
    var date = new Date(Number(timestamp) || 0);

    if (!timestamp || Number.isNaN(date.getTime())) {
      return "unknown time";
    }

    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "short",
        timeStyle: "short"
      }).format(date);
    } catch (error) {
      return date.toLocaleString();
    }
  }

  function renderRecentWorkspaces(records) {
    var placeholder = document.createElement("option");
    var openGroup;
    var removeGroup;

    records = records || [];
    recentRemoteWorkspaceRecords = records.filter(function (record) {
      return record.providerId === "remote-ssh";
    });
    records = records.filter(function (record) {
      return record.providerId !== "remote-ssh";
    });
    if (recentRemoteWorkspacesSelect) {
      recentRemoteWorkspacesSelect.innerHTML = "";
      var remotePlaceholder = document.createElement("option");
      remotePlaceholder.value = "";
      remotePlaceholder.textContent = recentRemoteWorkspaceRecords.length
        ? recentRemoteWorkspaceRecords.length + " recent remote workspace" + (recentRemoteWorkspaceRecords.length === 1 ? "" : "s")
        : "No recent remote";
      recentRemoteWorkspacesSelect.appendChild(remotePlaceholder);
      recentRemoteWorkspaceRecords.forEach(function (record) {
        var option = document.createElement("option");

        option.value = String(record.id || "");
        option.textContent = record.workspaceName + " — " + record.workspaceRef.connectionId;
        recentRemoteWorkspacesSelect.appendChild(option);
      });
      recentRemoteWorkspacesSelect.disabled = true;
      recentRemoteWorkspacesSelect.title = recentRemoteWorkspaceRecords.length
        ? "Remote workspace restoration is enabled in the restoration phase"
        : "No recent remote workspaces";
    }
    if (!recentWorkspacesSelect) {
      return;
    }

    recentWorkspaceRecords = records;
    recentWorkspacesSelect.innerHTML = "";
    placeholder.value = "";
    placeholder.textContent = recentWorkspaceRecords.length ? "Recent" : "No recent";
    recentWorkspacesSelect.appendChild(placeholder);

    if (recentWorkspaceRecords.length) {
      openGroup = document.createElement("optgroup");
      openGroup.label = "Open";
      removeGroup = document.createElement("optgroup");
      removeGroup.label = "Remove from Recent";

      recentWorkspaceRecords.forEach(function (record) {
        var openOption = document.createElement("option");
        var removeOption = document.createElement("option");
        var name = record.workspaceName || "Workspace";
        var openedAt = formatRecentWorkspaceTime(record.lastOpened);

        openOption.value = "open:" + String(record.id);
        openOption.textContent = name + " - " + openedAt;
        openGroup.appendChild(openOption);

        removeOption.value = "remove:" + String(record.id);
        removeOption.textContent = "Remove " + name;
        removeGroup.appendChild(removeOption);
      });

      recentWorkspacesSelect.appendChild(openGroup);
      recentWorkspacesSelect.appendChild(removeGroup);
    }

    recentWorkspacesSelect.value = "";
    recentWorkspacesSelect.disabled = !isWorkspaceSupported() || !recentWorkspaceRecords.length;
  }

  async function refreshRecentWorkspaces() {
    if (!workspaceSession || !workspaceSession.isSupported || !workspaceSession.isSupported() || !workspaceSession.listRecentWorkspaces) {
      renderRecentWorkspaces([]);
      return;
    }

    try {
      renderRecentWorkspaces(await workspaceSession.listRecentWorkspaces());
    } catch (error) {
      renderRecentWorkspaces([]);
    }
  }

  async function addRecentWorkspace(workspaceHandle, workspaceName) {
    if (
      !workspaceSession ||
      !workspaceSession.isSupported ||
      !workspaceSession.isSupported() ||
      !workspaceSession.addRecentWorkspace ||
      !workspaceHandle
    ) {
      return;
    }

    try {
      renderRecentWorkspaces(await workspaceSession.addRecentWorkspace(workspaceHandle, workspaceName, {
        maxWorkspaces: 10
      }));
    } catch (error) {
      await refreshRecentWorkspaces();
    }
  }

  function currentWorkspaceRootName() {
    return workspaceState.rootName || "";
  }

  function hasActiveWorkspace() {
    return Boolean(workspaceState.workspace && workspaceState.id);
  }

  function sessionBelongsToWorkspace(session) {
    return Boolean(
      session &&
      hasActiveWorkspace() &&
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

  function storageResourceForWorkspaceFile(fileItem) {
    var provider = activeWorkspaceProvider();

    if (!fileItem) {
      return null;
    }
    if (fileItem.resource) {
      return fileItem.resource;
    }
    return provider && provider.resourceForHandle && fileItem.handle
      ? provider.resourceForHandle(fileItem.handle, {
        workspaceId: workspaceState.id,
        path: fileItem.path,
        displayName: fileItem.name
      })
      : null;
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

  function relatedWorkspaceView() {
    var session = getActiveSession();

    if (!workspaceRelated || !sessionBelongsToWorkspace(session)) {
      return null;
    }

    return workspaceRelated.getRelatedFiles({
      activePath: session.workspacePath,
      documentType: session.documentType,
      files: workspaceState.files,
      markdownText: session.markdownText,
      recentPaths: recentlyOpenedWorkspacePaths
    });
  }

  function renderWorkspaceSidebar() {
    var workspaceLabel = workspaceState.rootName;

    if (workspaceState.workspace && workspaceState.workspace.authority && workspaceState.workspace.authority.type === "ssh") {
      workspaceLabel = workspaceState.workspace.authority.label + ": " + workspaceState.workspace.root.displayPath;
    }
    if (statusBarController) {
      statusBarController.setWorkspace(workspaceLabel);
    }
    if (!workspaceSidebar) {
      return;
    }

    workspaceSidebar.update({
      dirtyPaths: workspaceDirtyPaths(),
      selectedPath: selectedWorkspacePath(),
      workspaceState: {
        directories: workspaceState.directories,
        capabilities: workspaceState.workspace && workspaceState.workspace.capabilities || {},
        error: workspaceState.error,
        files: workspaceState.files,
        isScanning: workspaceState.isScanning,
        isSupported: hasActiveWorkspace() || isWorkspaceSupported(),
        related: relatedWorkspaceView(),
        restorePrompt: restorableWorkspaceSession ? {
          workspaceName: restorableWorkspaceSession.workspaceName
        } : null,
        rootName: workspaceState.rootName,
        search: workspaceContentSearchState,
        tree: workspaceState.tree
      }
    });
  }

  function updateWorkspaceMenuControls() {
    var hasWorkspace = hasActiveWorkspace();
    var supported = isWorkspaceSupported();

    if (openWorkspaceFolderButton) {
      openWorkspaceFolderButton.disabled = !supported;
      openWorkspaceFolderButton.title = supported
        ? "Open a local folder as a text-document workspace"
        : "Folder workspace is supported in Chrome or Edge. You can still open individual text documents.";
    }
    if (refreshWorkspaceButton) {
      refreshWorkspaceButton.disabled = !hasWorkspace || workspaceState.isScanning;
    }
    if (restoreWorkspaceButton) {
      restoreWorkspaceButton.disabled = !restorableWorkspaceSession;
    }
    if (recentWorkspacesSelect) {
      recentWorkspacesSelect.disabled = !supported || !recentWorkspaceRecords.length;
    }
    if (closeWorkspaceButton) {
      closeWorkspaceButton.disabled = !hasWorkspace;
    }
    if (expandWorkspaceFoldersButton) {
      expandWorkspaceFoldersButton.disabled = !hasWorkspace;
    }
    if (collapseWorkspaceFoldersButton) {
      collapseWorkspaceFoldersButton.disabled = !hasWorkspace;
    }
    if (remoteConnectionController) {
      remoteConnectionController.updateCommandElements(workspaceMenu);
    }
  }

  function workspaceSessionTabs() {
    var activeSession = getActiveSession();

    if (!tabs || !hasActiveWorkspace()) {
      return [];
    }

    if (activeSession) {
      saveActiveEditorState(activeSession);
    }

    return tabs.listSessions().filter(function (session) {
      return session.workspaceId === workspaceState.id && session.workspacePath;
    }).map(function (session) {
      var mode = editorMode.normalizeEditorModeForDocument
        ? editorMode.normalizeEditorModeForDocument(session.editorMode || session.activeMode, session.documentType)
        : editorMode.normalizeEditorMode(session.editorMode || session.activeMode);

      return {
        documentType: session.documentType,
        dirty: session.dirty,
        mode: mode,
        path: session.workspacePath,
        selectionEnd: session.markdownSelectionEnd || 0,
        selectionStart: session.markdownSelectionStart || 0,
        scrollTop: mode === EDITOR_MODES.MARKDOWN
          ? session.markdownScrollTop || 0
          : session.wysiwygScrollTop || 0,
        softWrap: session.softWrapEnabled !== false,
        title: session.title || session.workspacePath,
        wysiwygTextOffset: session.wysiwygTextOffset || 0
      };
    });
  }

  function currentWorkspaceSessionMetadata() {
    var activeSession;

    if (!hasActiveWorkspace()) {
      return null;
    }

    activeSession = getActiveSession();
    return {
      activePath: sessionBelongsToWorkspace(activeSession) ? activeSession.workspacePath : "",
      collapsedFolders: workspaceSidebar && typeof workspaceSidebar.getCollapsedFolders === "function"
        ? workspaceSidebar.getCollapsedFolders()
        : [],
      openedTabs: workspaceSessionTabs(),
      providerId: workspaceState.providerId || "local-fsa",
      sidebarScroll: workspaceSidebar && typeof workspaceSidebar.getScrollState === "function"
        ? workspaceSidebar.getScrollState()
        : null,
      workspaceHandle: workspaceState.providerId === "local-fsa" ? workspaceState.rootHandle : null,
      workspaceRef: {
        localHandle: workspaceState.providerId === "local-fsa" ? workspaceState.rootHandle : null,
        connectionId: workspaceState.providerId === "remote-ssh"
          ? workspaceState.workspace.authority.connectionId
          : "",
        remoteRootPath: workspaceState.providerId === "remote-ssh"
          ? workspaceState.workspace.root.displayPath
          : ""
      },
      workspaceName: workspaceState.rootName
    };
  }

  async function persistWorkspaceSessionMetadata(metadata, options) {
    if (!workspaceSession || !workspaceSession.isSupported || !workspaceSession.isSupported() || !metadata) {
      return;
    }

    options = options || {};
    await workspaceSession.saveSession(metadata);
    if (options.recent !== false && workspaceSession.saveRecentWorkspaceSession) {
      await workspaceSession.saveRecentWorkspaceSession(metadata, {
        maxWorkspaces: 10
      });
    }
  }

  function saveCurrentWorkspaceSession() {
    var metadata;

    if (suppressWorkspaceSessionSave) {
      return;
    }

    metadata = currentWorkspaceSessionMetadata();
    persistWorkspaceSessionMetadata(metadata).catch(function () {
      // Session restore is optional.
    });
  }

  function scheduleWorkspaceSessionSave() {
    if (suppressWorkspaceSessionSave) {
      return;
    }

    window.clearTimeout(workspaceSessionSaveTimer);
    workspaceSessionSaveTimer = window.setTimeout(saveCurrentWorkspaceSession, 180);
  }

  function closeWorkspaceMenu() {
    if (menuBarController) {
      menuBarController.close("workspace");
      return;
    }
    if (!workspaceMenu || workspaceMenu.hidden) {
      return;
    }

    workspaceMenu.hidden = true;
    workspaceButton.setAttribute("aria-expanded", "false");
  }

  function closeFileMenu() {
    if (menuBarController) {
      menuBarController.close("file");
      return;
    }
    if (!fileMenu || fileMenu.hidden) {
      return;
    }

    fileMenu.hidden = true;
    fileMenuButton.setAttribute("aria-expanded", "false");
  }

  function closeMoreMenu() {
    if (menuBarController) {
      menuBarController.close("help");
      return;
    }
    if (!moreMenu || moreMenu.hidden) {
      return;
    }

    moreMenu.hidden = true;
    moreButton.setAttribute("aria-expanded", "false");
  }

  function closeGlobalMenus(exceptMenu) {
    if (menuBarController) {
      menuBarController.closeAll(exceptMenu === "more" ? "help" : exceptMenu);
    }
    if (exceptMenu !== "workspace") {
      closeWorkspaceMenu();
    }
    if (exceptMenu !== "file") {
      closeFileMenu();
    }
    if (exceptMenu !== "more") {
      closeMoreMenu();
    }
    if (exceptMenu !== "ai" && aiAssistant && typeof aiAssistant.hideTransientUi === "function") {
      aiAssistant.hideTransientUi();
    }
  }

  function resetWorkspaceState() {
    workspaceState = {
      directories: [],
      id: "",
      providerId: "",
      rootHandle: null,
      rootName: "",
      workspace: null,
      files: [],
      tree: null,
      isScanning: false,
      error: "",
      lazy: false
    };
    workspaceContentSearchState = {
      error: "",
      isSearching: false,
      limited: false,
      query: "",
      results: []
    };
    recentlyOpenedWorkspacePaths = [];
    renderWorkspaceSidebar();
    updateWorkspaceMenuControls();
  }

  function applyWorkspaceScanResult(result) {
    workspaceState = {
      directories: result.directories || [],
      id: result.workspaceId || workspaceState.id || "workspace-" + nextWorkspaceId++,
      providerId: result.providerId || result.workspace && result.workspace.providerId || "local-fsa",
      rootHandle: result.rootHandle,
      rootName: result.rootName,
      workspace: result.workspace || null,
      files: result.files || [],
      tree: result.tree || [],
      isScanning: false,
      error: "",
      lazy: Boolean(result.lazy)
    };
    renderWorkspaceSidebar();
    updateWorkspaceMenuControls();
    scheduleWorkspaceSessionSave();
  }

  function showWorkspaceError(message) {
    workspaceState.error = message;
    workspaceState.isScanning = false;
    renderWorkspaceSidebar();
    updateWorkspaceMenuControls();
  }

  async function isSameWorkspaceHandle(leftHandle, rightHandle) {
    if (!leftHandle || !rightHandle) {
      return false;
    }
    if (leftHandle === rightHandle) {
      return true;
    }
    if (typeof leftHandle.isSameEntry === "function") {
      try {
        if (await leftHandle.isSameEntry(rightHandle)) {
          return true;
        }
      } catch (error) {
        // Try the other handle below before treating it as a different workspace.
      }
    }
    if (typeof rightHandle.isSameEntry === "function") {
      try {
        return await rightHandle.isSameEntry(leftHandle);
      } catch (error) {
        return false;
      }
    }
    return false;
  }

  async function isSameWorkspace(nextResult) {
    var current = workspaceState.workspace;
    var next = nextResult && nextResult.workspace;

    if (!current || !next || current.providerId !== next.providerId) {
      return false;
    }
    if (current.providerId === "remote-ssh") {
      return current.authority.connectionId === next.authority.connectionId &&
        current.root.displayPath === next.root.displayPath;
    }
    return isSameWorkspaceHandle(workspaceState.rootHandle, nextResult.rootHandle);
  }

  async function closePreviousWorkspaceTabsForSwitch(nextResult, options) {
    var previousWorkspaceId = workspaceState.id;
    var previousRootName = workspaceState.rootName || "the previous workspace";
    var workspaceSessions;
    var dirtySessions;
    var activeSession;
    var closedActiveSession;
    var nextSession;

    options = options || {};
    if (!tabs || !previousWorkspaceId || !hasActiveWorkspace() || !(nextResult && nextResult.workspace)) {
      return true;
    }

    if (await isSameWorkspace(nextResult)) {
      return true;
    }

    activeSession = getActiveSession();
    if (activeSession && activeSession.workspaceId === previousWorkspaceId) {
      flushActiveEditor();
    }

    workspaceSessions = tabs.listSessions().filter(function (session) {
      return session.workspaceId === previousWorkspaceId && session.workspacePath;
    });

    if (!workspaceSessions.length) {
      return true;
    }

    dirtySessions = workspaceSessions.filter(function (session) {
      return session.dirty;
    });

    if (dirtySessions.length && !window.confirm(
      "Close " + workspaceSessions.length + " open workspace tab" + (workspaceSessions.length === 1 ? "" : "s") +
      " from " + previousRootName + "?\n\n" +
      dirtySessions.length + " tab" + (dirtySessions.length === 1 ? " has" : "s have") +
      " unsaved changes that will be discarded."
    )) {
      focusActiveEditor();
      return false;
    }

    await persistWorkspaceSessionMetadata(currentWorkspaceSessionMetadata()).catch(function () {
      // Switching workspaces should continue even if optional restore metadata fails.
    });

    window.clearTimeout(workspaceSessionSaveTimer);
    suppressWorkspaceSessionSave = true;
    try {
      closedActiveSession = Boolean(activeSession && workspaceSessions.some(function (session) {
        return session.id === activeSession.id;
      }));

      workspaceSessions.forEach(function (session) {
        revokeAssetObjectUrls(session);
        tabs.closeSession(session.id);
      });

      if (!tabs.listSessions().length) {
        if (options.deferEmptyTab) {
          return true;
        }

        nextSession = createSession({
          activeMode: activeSession ? activeSession.activeMode : getActiveMode(),
          editorMode: activeSession ? activeSession.editorMode : getEditorMode(),
          markdownText: "",
          title: "Untitled.md"
        });
        tabs.addSession(nextSession, { activate: false });
        setActiveSession(nextSession, { restoreScroll: false });
        return true;
      }

      if (closedActiveSession || !tabs.getActiveSession()) {
        setActiveSession(tabs.getActiveSession() || tabs.listSessions()[0], { restoreScroll: true });
        return true;
      }

      renderTabs();
      return true;
    } finally {
      suppressWorkspaceSessionSave = false;
    }
  }

  async function assignWorkspaceIdForScanResult(result) {
    if (result && result.workspaceId) {
      return result;
    }
    if (
      result &&
      workspaceState.id &&
      workspaceState.rootHandle &&
      await isSameWorkspaceHandle(workspaceState.rootHandle, result.rootHandle)
    ) {
      result.workspaceId = workspaceState.id;
      return result;
    }

    result.workspaceId = "workspace-" + nextWorkspaceId++;
    return result;
  }

  async function closeActiveWorkspaceStorage(nextResult) {
    var provider;

    if (!hasActiveWorkspace() || nextResult && await isSameWorkspace(nextResult)) {
      return;
    }
    provider = activeWorkspaceProvider();
    if (provider && typeof provider.closeWorkspace === "function") {
      try {
        await provider.closeWorkspace(workspaceState.workspace);
      } catch (error) {
        // The old workspace is already being replaced; stale remote workspace cleanup is best effort.
      }
    }
  }

  async function handleOpenWorkspaceFolder() {
    var result;

    closeWorkspaceMenu();
    if (!isWorkspaceSupported()) {
      if (workspaceSidebar) {
        workspaceSidebar.setMode("expanded");
      }
      showWorkspaceError("Folder workspace is supported in Chrome or Edge. You can still open individual text documents.");
      return;
    }

    if (workspaceSidebar) {
      workspaceSidebar.setMode("expanded");
    }

    try {
      result = await workspaceStore.openWorkspace({ provider: localFilesystemProvider });
      await assignWorkspaceIdForScanResult(result);
      restorableWorkspaceSession = null;
      if (!await closePreviousWorkspaceTabsForSwitch(result)) {
        return;
      }
      await closeActiveWorkspaceStorage(result);
      applyWorkspaceScanResult(result);
      await addRecentWorkspace(result.rootHandle, result.rootName);
    } catch (error) {
      if (workspaceStore && workspaceStore.isAbortError(error)) {
        return;
      }
      showWorkspaceError("Could not read this workspace. Please open the folder again.");
    }
  }

  async function handleOpenRemoteWorkspace(selection) {
    var result;

    if (!remoteSSHProvider || !workspaceStore || !selection) {
      throw new Error("The Remote SSH storage provider is unavailable.");
    }
    if (workspaceSidebar) {
      workspaceSidebar.setMode("expanded");
    }
    try {
      result = await workspaceStore.openWorkspace({
        provider: remoteSSHProvider,
        connectionId: selection.connectionId,
        connectionLabel: selection.connectionLabel,
        path: selection.path
      });
      if (!await closePreviousWorkspaceTabsForSwitch(result)) {
        await remoteSSHProvider.closeWorkspace(result.workspace).catch(function () {});
        throw new Error("The current workspace was kept open.");
      }
      await closeActiveWorkspaceStorage(result);
      restorableWorkspaceSession = null;
      applyWorkspaceScanResult(result);
      ME.pendingRemoteWorkspace = null;
      scheduleWorkspaceSessionSave();
      return result;
    } catch (error) {
      if (workspaceState.workspace !== (result && result.workspace)) {
        throw error;
      }
      showWorkspaceError(error && error.message || "Could not open the remote workspace.");
      throw error;
    }
  }

  async function handleExpandWorkspaceFolder(path) {
    var result;

    if (!workspaceState.lazy || !workspaceStore || !workspaceStore.loadDirectory) {
      return;
    }
    result = await workspaceStore.loadDirectory(workspaceState.workspace, workspaceState.tree, path);
    workspaceState.tree = result.tree;
    workspaceState.files = result.files;
    workspaceState.directories = result.directories;
    renderWorkspaceSidebar();
  }

  async function restoreWorkspaceTabs(sessionData, options) {
    var openedTabs = sessionData.openedTabs || [];
    var restoredSessions = [];
    var activePath = sessionData.activePath || "";
    var i;
    var tabData;
    var fileItem;
    var fileData;
    var resource;
    var session;
    var activeSession = null;

    options = options || {};
    if (!openedTabs.length) {
      return;
    }

    if (options.replaceAll !== false) {
      tabs.listSessions().forEach(function (existingSession) {
        revokeAssetObjectUrls(existingSession);
      });
      if (typeof tabs.clearSessions === "function") {
        tabs.clearSessions();
      }
    }

    for (i = 0; i < openedTabs.length; i += 1) {
      tabData = openedTabs[i];
      fileItem = findWorkspaceFile(tabData.path);
      resource = storageResourceForWorkspaceFile(fileItem);
      if (!fileItem || !resource) {
        continue;
      }

      try {
        fileData = await fileStore.openResource(resource);
        session = createSession({
          activeMode: tabData.mode,
          documentType: tabData.documentType || fileItem.documentType,
          dirty: tabData.dirty,
          editorMode: tabData.mode,
          fileHandle: fileData.fileHandle,
          hasFinalNewline: fileData.hasFinalNewline,
          hasUtf8Bom: fileData.hasUtf8Bom,
          markdownSelectionEnd: tabData.selectionEnd,
          markdownSelectionStart: tabData.selectionStart,
          markdownScrollTop: tabData.mode === EDITOR_MODES.MARKDOWN ? tabData.scrollTop : 0,
          markdownText: fileData.markdownText,
          preferredLineEnding: fileData.preferredLineEnding,
          softWrapEnabled: tabData.softWrap,
          storageProviderId: fileData.storageProviderId,
          storageResource: fileData.storageResource,
          storageRevision: fileData.storageRevision,
          title: fileItem.name,
          workspaceDirHandle: workspaceState.rootHandle,
          workspaceFileHandle: fileData.fileHandle,
          workspaceId: workspaceState.id,
          workspacePath: fileItem.path,
          workspaceRootName: workspaceState.rootName,
          wysiwygTextOffset: tabData.wysiwygTextOffset,
          wysiwygScrollTop: tabData.mode === EDITOR_MODES.WYSIWYG ? tabData.scrollTop : 0
        });
        tabs.addSession(session, { activate: false });
        restoredSessions.push(session);
        rememberWorkspacePath(fileItem.path);
        if (fileItem.path === activePath) {
          activeSession = session;
        }
      } catch (error) {
        // Skip missing or unreadable files during session restore.
      }
    }

    if (!restoredSessions.length && options.replaceAll !== false) {
      session = createSession({
        editorMode: editorMode.readStoredEditorMode(),
        markdownText: "",
        title: "Untitled.md"
      });
      tabs.addSession(session, { activate: false });
      setActiveSession(session, { restoreScroll: false });
      return;
    }

    if (restoredSessions.length) {
      setActiveSession(activeSession || restoredSessions[restoredSessions.length - 1], { restoreScroll: true });
    }
  }

  async function handleRestoreWorkspaceSession(action) {
    var permission;
    var result;
    var restoredSession;

    if (action === "skip") {
      restorableWorkspaceSession = null;
      renderWorkspaceSidebar();
      return;
    }

    if (action === "different") {
      restorableWorkspaceSession = null;
      renderWorkspaceSidebar();
      await handleOpenWorkspaceFolder();
      return;
    }

    if (!restorableWorkspaceSession || !workspaceSession) {
      return;
    }

    if (workspaceSidebar) {
      workspaceSidebar.setMode("expanded");
    }

    try {
      restoredSession = restorableWorkspaceSession;
      permission = await workspaceSession.requestWorkspacePermission(restoredSession.workspaceHandle, "read");
      if (permission !== "granted") {
        showWorkspaceError("Permission was not granted. Open the workspace folder manually to continue.");
        return;
      }

      workspaceState.isScanning = true;
      workspaceState.error = "";
      renderWorkspaceSidebar();
      result = await workspaceStore.scanWorkspace(restoredSession.workspaceHandle);
      await assignWorkspaceIdForScanResult(result);
      if (!await closePreviousWorkspaceTabsForSwitch(result)) {
        workspaceState.isScanning = false;
        renderWorkspaceSidebar();
        updateWorkspaceMenuControls();
        return;
      }
      await closeActiveWorkspaceStorage(result);
      applyWorkspaceScanResult(result);
      await addRecentWorkspace(result.rootHandle, result.rootName);
      if (workspaceSidebar && typeof workspaceSidebar.setCollapsedFolders === "function") {
        workspaceSidebar.setCollapsedFolders(restoredSession.collapsedFolders || []);
      }
      await restoreWorkspaceTabs(restoredSession);
      restorableWorkspaceSession = null;
      renderWorkspaceSidebar();
      if (workspaceSidebar && typeof workspaceSidebar.setScrollState === "function") {
        workspaceSidebar.setScrollState(restoredSession.sidebarScroll);
      }
      scheduleWorkspaceSessionSave();
    } catch (error) {
      showWorkspaceError("Could not restore this workspace. Open the folder manually to continue.");
    }
  }

  async function loadRestorableWorkspaceSession() {
    var sessionData;

    if (!workspaceSession || !workspaceSession.isSupported || !workspaceSession.isSupported()) {
      return;
    }

    sessionData = await workspaceSession.loadSession();
    if (!sessionData || !sessionData.workspaceHandle) {
      return;
    }

    restorableWorkspaceSession = sessionData;
    if (workspaceSidebar) {
      workspaceSidebar.setMode("expanded");
    }
    renderWorkspaceSidebar();
  }

  function findRecentWorkspaceRecord(id) {
    var numericId = Number(id);
    var i;

    for (i = 0; i < recentWorkspaceRecords.length; i += 1) {
      if (recentWorkspaceRecords[i].id === numericId) {
        return recentWorkspaceRecords[i];
      }
    }

    return null;
  }

  async function handleRecentWorkspaceOpen(recentId) {
    var record = findRecentWorkspaceRecord(recentId);
    var emptySession;
    var openedRecord;
    var result;

    closeWorkspaceMenu();
    if (!recentId || !record || !workspaceSession || !workspaceSession.openRecentWorkspace || !workspaceStore) {
      return;
    }

    if (workspaceSidebar) {
      workspaceSidebar.setMode("expanded");
    }

    try {
      openedRecord = await workspaceSession.openRecentWorkspace(record);
      workspaceState.isScanning = true;
      workspaceState.error = "";
      renderWorkspaceSidebar();
      updateWorkspaceMenuControls();
      result = await workspaceStore.scanWorkspace(openedRecord.workspaceHandle);
      await assignWorkspaceIdForScanResult(result);
      if (!await closePreviousWorkspaceTabsForSwitch(result, {
        deferEmptyTab: Boolean(openedRecord.openedTabs && openedRecord.openedTabs.length)
      })) {
        workspaceState.isScanning = false;
        renderWorkspaceSidebar();
        updateWorkspaceMenuControls();
        return;
      }
      await closeActiveWorkspaceStorage(result);
      restorableWorkspaceSession = null;
      applyWorkspaceScanResult(result);
      await addRecentWorkspace(result.rootHandle, result.rootName);
      if (workspaceSidebar && typeof workspaceSidebar.setCollapsedFolders === "function") {
        workspaceSidebar.setCollapsedFolders(openedRecord.collapsedFolders || []);
      }
      await restoreWorkspaceTabs(openedRecord, { replaceAll: false });
      if (!tabs.listSessions().length) {
        emptySession = createSession({
          editorMode: editorMode.readStoredEditorMode(),
          markdownText: "",
          title: "Untitled.md"
        });
        tabs.addSession(emptySession, { activate: false });
        setActiveSession(emptySession, { restoreScroll: false });
      }
      renderWorkspaceSidebar();
      if (workspaceSidebar && typeof workspaceSidebar.setScrollState === "function") {
        workspaceSidebar.setScrollState(openedRecord.sidebarScroll);
      }
      scheduleWorkspaceSessionSave();
    } catch (error) {
      await refreshRecentWorkspaces();
      showWorkspaceError("Could not open this recent workspace. Open the folder manually to continue.");
    }
  }

  async function handleRecentWorkspaceRemove(recentId) {
    var record = findRecentWorkspaceRecord(recentId);
    var name = record ? record.workspaceName || "Workspace" : "this entry";

    closeWorkspaceMenu();
    if (!recentId || !record || !workspaceSession || !workspaceSession.removeRecentWorkspace) {
      return;
    }

    if (!window.confirm("Remove " + name + " from Recent workspaces?")) {
      return;
    }

    try {
      await workspaceSession.removeRecentWorkspace(record.id);
      await refreshRecentWorkspaces();
    } catch (error) {
      await refreshRecentWorkspaces();
      showWorkspaceError("Could not remove this recent workspace.");
    }
  }

  async function handleRecentWorkspaceChange() {
    var value;
    var parts;

    if (!recentWorkspacesSelect) {
      return;
    }

    value = recentWorkspacesSelect.value;
    recentWorkspacesSelect.value = "";

    if (!value) {
      return;
    }

    parts = value.split(":");

    if (parts[0] === "remove") {
      await handleRecentWorkspaceRemove(parts[1]);
      return;
    }

    await handleRecentWorkspaceOpen(parts[1]);
  }

  async function handleRefreshWorkspace(path) {
    var result;

    closeWorkspaceMenu();
    if (!hasActiveWorkspace() || !workspaceStore) {
      return;
    }

    workspaceState.isScanning = true;
    workspaceState.error = "";
    renderWorkspaceSidebar();
    updateWorkspaceMenuControls();

    try {
      if (workspaceState.lazy && path) {
        result = await workspaceStore.loadDirectory(workspaceState.workspace, workspaceState.tree, path);
        workspaceState.tree = result.tree;
        workspaceState.files = result.files;
        workspaceState.directories = result.directories;
        workspaceState.isScanning = false;
        renderWorkspaceSidebar();
        updateWorkspaceMenuControls();
        return;
      }
      result = await workspaceStore.scanWorkspace(workspaceState.workspace || workspaceState.rootHandle, {
        workspaceId: workspaceState.id
      });
      applyWorkspaceScanResult(result);
    } catch (error) {
      showWorkspaceError("Could not read this workspace. Please open the folder again.");
    }
  }

  async function handleWorkspaceContentSearch(query) {
    var searchQuery = String(query || "");
    var capabilities = workspaceState.workspace && workspaceState.workspace.capabilities || {};
    var result;

    if (!workspaceSearch || !hasActiveWorkspace() || !searchQuery.trim()) {
      workspaceContentSearchState = {
        error: "",
        isSearching: false,
        limited: false,
        query: searchQuery,
        results: []
      };
      renderWorkspaceSidebar();
      return;
    }
    if (capabilities.search === false) {
      workspaceContentSearchState = {
        error: "Remote workspace search is not available yet.",
        isSearching: false,
        limited: false,
        query: searchQuery,
        results: []
      };
      renderWorkspaceSidebar();
      return;
    }

    workspaceContentSearchState = {
      error: "",
      isSearching: true,
      limited: false,
      query: searchQuery,
      results: []
    };
    renderWorkspaceSidebar();

    try {
      result = await workspaceSearch.searchWorkspace({
        provider: activeWorkspaceProvider(),
        workspace: workspaceState.workspace,
        files: workspaceState.files,
        query: searchQuery,
        maxMatchesPerFile: 5,
        maxResults: 100
      });
      if (workspaceContentSearchState.query !== searchQuery) {
        return;
      }
      workspaceContentSearchState = {
        error: "",
        isSearching: false,
        limited: result.limited,
        query: result.query,
        results: result.results
      };
      renderWorkspaceSidebar();
    } catch (error) {
      workspaceContentSearchState = {
        error: "Search failed. Please refresh the workspace and try again.",
        isSearching: false,
        limited: false,
        query: searchQuery,
        results: []
      };
      renderWorkspaceSidebar();
    }
  }

  function workspaceFileSession(path) {
    return findSessionByWorkspacePath(path);
  }

  async function refreshWorkspaceAfterOperation(openPath) {
    await handleRefreshWorkspace();
    if (openPath) {
      await openWorkspaceFile(openPath);
    }
    scheduleWorkspaceSessionSave();
  }

  async function handleWorkspaceNewTextFile(target) {
    var name = window.prompt("New file name", "Untitled.md");
    var validation;
    var result;

    if (name == null || !workspaceOperations) {
      return;
    }

    validation = workspaceOperations.validateFileName(name, { enforceMarkdownExtension: true });
    if (!validation.ok) {
      window.alert(validation.message);
      return;
    }

    try {
      result = await workspaceOperations.createTextFile({
        directoryPath: target && target.path || "",
        initialText: "",
        name: name,
        provider: activeWorkspaceProvider(),
        workspace: workspaceState.workspace
      });
      await refreshWorkspaceAfterOperation(result.path);
    } catch (error) {
      showFileError("New file", error);
    }
  }

  async function handleWorkspaceNewFolder(target) {
    var name = window.prompt("New folder name", "notes");
    var result;

    if (name == null || !workspaceOperations) {
      return;
    }

    try {
      result = await workspaceOperations.createFolder({
        directoryPath: target && target.path || "",
        name: name,
        provider: activeWorkspaceProvider(),
        workspace: workspaceState.workspace
      });
      await refreshWorkspaceAfterOperation();
      if (workspaceSidebar && result.path) {
        workspaceSidebar.revealFile(result.path);
      }
    } catch (error) {
      showFileError("New folder", error);
    }
  }

  async function handleWorkspaceDuplicateFile(target) {
    var fileItem = findWorkspaceFile(target && target.path);
    var suggested;
    var name;
    var result;

    if (!fileItem || !workspaceOperations) {
      return;
    }

    suggested = workspaceRelated.basename(workspaceOperations.suggestedDuplicateName(fileItem.path));
    name = window.prompt("Duplicate as", suggested);
    if (name == null) {
      return;
    }

    try {
      result = await workspaceOperations.duplicateTextFile({
        name: name,
        path: fileItem.path,
        provider: activeWorkspaceProvider(),
        resource: fileItem.resource,
        workspace: workspaceState.workspace
      });
      await refreshWorkspaceAfterOperation(result.path);
    } catch (error) {
      showFileError("Duplicate file", error);
    }
  }

  async function handleWorkspaceRenameFile(target) {
    var fileItem = findWorkspaceFile(target && target.path);
    var session = workspaceFileSession(target && target.path);
    var name;
    var result;

    if (!fileItem || !workspaceOperations) {
      return;
    }
    if (session && session.dirty) {
      window.alert("Save or close unsaved changes before renaming this file.");
      return;
    }

    name = window.prompt("Rename file", fileItem.name);
    if (name == null) {
      return;
    }

    try {
      result = await workspaceOperations.renameTextFile({
        name: name,
        path: fileItem.path,
        provider: activeWorkspaceProvider(),
        resource: fileItem.resource,
        workspace: workspaceState.workspace
      });
      if (session && !result.unchanged) {
        session.fileHandle = result.fileHandle;
        session.workspaceFileHandle = result.fileHandle;
        session.storageProviderId = workspaceState.providerId;
        session.storageResource = result.resource;
        session.storageRevision = result.resource && result.resource.revision || null;
        session.title = result.name;
        session.workspacePath = result.path;
        fileStore.applyDocumentTypeToSession(session, result.name);
      }
      await refreshWorkspaceAfterOperation(result.path);
      renderTabs();
      updateDocumentTitle();
    } catch (error) {
      showFileError("Rename file", error);
    }
  }

  async function handleWorkspaceCopyPath(target) {
    if (!workspaceOperations || !(target && target.path)) {
      return;
    }

    try {
      await workspaceOperations.copyRelativePath(target.path);
    } catch (error) {
      showClipboardError("Copy relative path", error);
    }
  }

  async function handleWorkspaceContextAction(action, target) {
    if (action === "refresh") {
      await handleRefreshWorkspace(target && target.kind === "directory" ? target.path : "");
      return;
    }
    if (action === "open" && target && target.path) {
      await openWorkspaceFile(target.path);
      return;
    }
    if (action === "reveal" && workspaceSidebar && target && target.path) {
      workspaceSidebar.revealFile(target.path);
      return;
    }
    if (action === "copy-path") {
      await handleWorkspaceCopyPath(target);
      return;
    }
    if (action === "new-file") {
      await handleWorkspaceNewTextFile(target);
      return;
    }
    if (action === "new-folder") {
      await handleWorkspaceNewFolder(target);
      return;
    }
    if (action === "duplicate") {
      await handleWorkspaceDuplicateFile(target);
      return;
    }
    if (action === "rename") {
      await handleWorkspaceRenameFile(target);
    }
  }

  async function handleCloseWorkspace() {
    var provider = activeWorkspaceProvider();

    closeWorkspaceMenu();
    if (hasActiveWorkspace() && provider && typeof provider.closeWorkspace === "function") {
      try {
        await provider.closeWorkspace(workspaceState.workspace);
      } catch (error) {
        if (workspaceState.providerId === "remote-ssh") {
          showWorkspaceError(error && error.message || "Could not close the remote workspace.");
          return;
        }
      }
    }
    resetWorkspaceState();
    restorableWorkspaceSession = null;
    if (workspaceSession && workspaceSession.clearSession) {
      workspaceSession.clearSession().catch(function () {});
    }
  }

  async function attachCurrentWorkspacePath(session) {
    var provider = activeWorkspaceProvider();
    var resource;
    var path;

    if (
      !session ||
      !workspaceState.workspace ||
      !provider ||
      typeof provider.resolveResource !== "function"
    ) {
      return false;
    }

    resource = session.storageResource;
    if (!resource && session.fileHandle && provider.resourceForHandle) {
      resource = provider.resourceForHandle(session.fileHandle, {
        displayName: session.title
      });
    }
    if (!resource) {
      return false;
    }
    try {
      path = await provider.resolveResource(workspaceState.workspace, resource);
    } catch (error) {
      path = "";
    }

    if (!path) {
      return false;
    }

    if (!workspaceStore.isSupportedFileName(path)) {
      return false;
    }

    session.workspaceDirHandle = workspaceState.rootHandle;
    session.workspaceId = workspaceState.id;
    session.workspaceRootName = workspaceState.rootName;
    session.workspacePath = path;
    session.workspaceFileHandle = session.fileHandle;
    session.storageProviderId = provider.id;
    session.storageResource = provider.resourceForHandle
      ? provider.resourceForHandle(session.fileHandle, {
        workspaceId: workspaceState.id,
        path: path,
        displayName: session.title,
        revision: session.storageRevision
      })
      : resource;
    session.storageRevision = session.storageResource.revision;
    return true;
  }

  function rememberWorkspacePath(path) {
    if (!path) {
      return;
    }

    recentlyOpenedWorkspacePaths = [path].concat(recentlyOpenedWorkspacePaths.filter(function (item) {
      return item !== path;
    })).slice(0, 12);
  }

  function jumpToWorkspaceLine(line) {
    var targetLine = Math.max(1, Number(line) || 1);
    var lines;
    var offset;
    var element;

    window.requestAnimationFrame(function () {
      if (getEditorMode() === EDITOR_MODES.MARKDOWN) {
        lines = markdownEditor.value.split("\n");
        offset = editorMode.getOffsetFromLineColumn(markdownEditor.value, Math.min(targetLine - 1, lines.length - 1), 0);
        markdownEditor.focus();
        markdownEditor.selectionStart = offset;
        markdownEditor.selectionEnd = offset;
        markdownEditor.scrollTop = Math.max(0, Math.floor((targetLine - 1) / Math.max(lines.length, 1) * markdownEditor.scrollHeight) - 80);
        return;
      }

      element = wysiwygEditor.querySelector("[data-md-line=\"" + String(targetLine - 1) + "\"]");
      if (element && typeof element.scrollIntoView === "function") {
        element.scrollIntoView({ block: "center" });
      }
      wysiwygEditor.focus();
    });
  }

  async function openWorkspaceFile(path, options) {
    var fileItem = findWorkspaceFile(path);
    var existingSession;
    var fileData;
    var resource = storageResourceForWorkspaceFile(fileItem);
    var session;

    options = options || {};
    closeWorkspaceMenu();
    if (!fileItem || !resource) {
      return;
    }

    flushActiveEditor();

    existingSession = findSessionByWorkspacePath(fileItem.path);
    if (!existingSession) {
      existingSession = tabs.findSessionByStorageResource
        ? await tabs.findSessionByStorageResource(resource)
        : await tabs.findSessionByFileHandle(fileItem.handle);
      if (existingSession) {
        existingSession.workspaceDirHandle = workspaceState.rootHandle;
        existingSession.workspaceId = workspaceState.id;
        existingSession.workspaceRootName = workspaceState.rootName;
        existingSession.workspacePath = fileItem.path;
        existingSession.workspaceFileHandle = fileItem.handle;
        existingSession.storageProviderId = resource.providerId;
        existingSession.storageResource = resource;
        existingSession.storageRevision = resource.revision;
      }
    }

    if (existingSession) {
      setActiveSession(existingSession, { restoreScroll: true });
      await addRecentFile(fileItem.handle, fileItem.name);
      rememberWorkspacePath(fileItem.path);
      if (options.line) {
        jumpToWorkspaceLine(options.line);
      }
      focusActiveEditor();
      return;
    }

    try {
      fileData = await fileStore.openResource(resource);
      session = createSession({
        activeMode: getActiveMode(),
        documentType: fileItem.documentType,
        editorMode: getEditorMode(),
        fileHandle: fileData.fileHandle,
        hasFinalNewline: fileData.hasFinalNewline,
        hasUtf8Bom: fileData.hasUtf8Bom,
        markdownText: fileData.markdownText,
        preferredLineEnding: fileData.preferredLineEnding,
        storageProviderId: fileData.storageProviderId,
        storageResource: fileData.storageResource,
        storageRevision: fileData.storageRevision,
        title: fileItem.name,
        workspaceDirHandle: workspaceState.rootHandle,
        workspaceFileHandle: fileData.fileHandle,
        workspaceId: workspaceState.id,
        workspacePath: fileItem.path,
        workspaceRootName: workspaceState.rootName
      });
      tabs.addSession(session, { activate: false });
      setActiveSession(session, { restoreScroll: false });
      await addRecentFile(fileItem.handle, fileItem.name);
      rememberWorkspacePath(fileItem.path);
      if (options.line) {
        jumpToWorkspaceLine(options.line);
      }
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
    var activeSession = getActiveSession();
    var remoteReadOnly = Boolean(activeSession && activeSession.storageProviderId === "remote-ssh");

    openFileButton.disabled = !supported;
    saveFileButton.disabled = !supported || remoteReadOnly;
    saveAsFileButton.disabled = !supported || remoteReadOnly;
    saveFileButton.title = remoteReadOnly
      ? "Remote workspaces are currently read-only"
      : "Save document (Ctrl/Cmd+S)";
    saveAsFileButton.title = remoteReadOnly
      ? "Remote Save As is not available yet"
      : "Save document as (Ctrl/Cmd+Shift+S)";

    if (insertImageButton) {
      insertImageButton.disabled = remoteReadOnly || !isImagePickerSupported() || !activeDocumentAllowsMarkdownCommands();
      insertImageButton.title = remoteReadOnly
        ? "Remote image asset storage is not available yet"
        : !activeDocumentAllowsMarkdownCommands()
        ? "Images can be inserted only in Markdown files"
        : isImagePickerSupported()
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

  function copyTextToClipboard(text) {
    var textarea;

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text);
    }

    textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      if (!document.execCommand("copy")) {
        throw new Error("Clipboard copy failed.");
      }
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    } finally {
      document.body.removeChild(textarea);
    }
  }

  function handleCopyRenderedHtml() {
    closeMoreMenu();
    copyTextToClipboard(renderMarkdownForSession(getMarkdownText())).catch(function (error) {
      showClipboardError("Copy rendered HTML", error);
    });
  }

  function handleFeedbackFromMore() {
    closeMoreMenu();
    window.open("https://github.com/deepkh/LocalDraftAI/issues", "_blank", "noopener,noreferrer");
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

    if (!session || !activeDocumentAllowsMarkdownCommands() || !files || !files.length) {
      return;
    }
    if (session.storageProviderId === "remote-ssh") {
      showAssetError(options.action || "Insert image", new Error(
        "Remote image asset storage is not available yet. No local asset folder was used."
      ));
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
    scheduleWorkspaceSessionSave();
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

    closeFileMenu();
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

    closeFileMenu();
    if (!isFileAccessSupported()) {
      return;
    }

    flushActiveEditor();

    try {
      fileData = await fileStore.openTextDocument();
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
        documentType: fileData.documentType,
        editorMode: getEditorMode(),
        fileHandle: fileData.fileHandle,
        hasFinalNewline: fileData.hasFinalNewline,
        hasUtf8Bom: fileData.hasUtf8Bom,
        markdownText: fileData.markdownText,
        preferredLineEnding: fileData.preferredLineEnding,
        storageProviderId: fileData.storageProviderId,
        storageResource: fileData.storageResource,
        storageRevision: fileData.storageRevision,
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

    closeFileMenu();
    if (activeSession && activeSession.storageProviderId === "remote-ssh") {
      if (statusBarController) {
        statusBarController.showMessage("Remote workspaces are read-only in this phase.", 5000);
      }
      return;
    }
    if (!isFileAccessSupported() || !activeSession) {
      return;
    }

    flushActiveEditor();
    validateSession(activeSession);

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

    closeFileMenu();
    if (activeSession && activeSession.storageProviderId === "remote-ssh") {
      if (statusBarController) {
        statusBarController.showMessage("Remote Save As is not available while the workspace is read-only.", 5000);
      }
      return;
    }
    if (!isFileAccessSupported() || !activeSession) {
      return;
    }

    flushActiveEditor();
    validateSession(activeSession);

    try {
      await fileStore.saveSessionAs(activeSession);
      if (await attachCurrentWorkspacePath(activeSession)) {
        await handleRefreshWorkspace();
      }
      markSessionClean();
      setActiveSession(activeSession, { restoreScroll: true });
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
        documentType: fileData.documentType,
        editorMode: getEditorMode(),
        fileHandle: fileData.fileHandle,
        hasFinalNewline: fileData.hasFinalNewline,
        hasUtf8Bom: fileData.hasUtf8Bom,
        markdownText: fileData.markdownText,
        preferredLineEnding: fileData.preferredLineEnding,
        storageProviderId: fileData.storageProviderId,
        storageResource: fileData.storageResource,
        storageRevision: fileData.storageRevision,
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
    closeFileMenu();

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
    if (!activeDocumentAllowsMarkdownCommands() || !transferHasImages(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleEditorDrop(event) {
    var files;
    var selection;

    if (!activeDocumentAllowsMarkdownCommands() || !transferHasImages(event.dataTransfer)) {
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

  function registerApplicationCommands() {
    var registry = ME.commandRegistry;

    if (!registry) {
      return;
    }

    function register(commandId, handler) {
      if (!registry.hasCommand(commandId)) {
        registry.registerCommand(commandId, handler);
      }
    }

    register("file.new", handleNewFile);
    register("file.open", handleOpenFile);
    register("file.save", handleSaveFile);
    register("file.saveAs", handleSaveAsFile);
    register("document.validate", function () {
      flushActiveEditor();
      validateSession(getActiveSession(), { announce: true });
    });
    register("document.format", function () {
      if (statusBarController) {
        statusBarController.showMessage("Automatic document formatting is not available yet.", 4000);
      }
    });

    register("edit.undo", function () {
      applyHistoryStep(-1);
    });
    register("edit.redo", function () {
      applyHistoryStep(1);
    });
    register("edit.cut", function () {
      handleClipboardAction("cut");
    });
    register("edit.copy", function () {
      handleClipboardAction("copy");
    });
    register("edit.paste", function () {
      handleClipboardAction("paste");
    });
    register("edit.copyRenderedHtml", handleCopyRenderedHtml);

    register("view.toggleEditorMode", toggleEditorModeState);
    register("view.toggleSoftWrap", toggleSoftWrapState);
    register("view.toggleTheme", function () {
      if (ME.theme) {
        ME.theme.toggleTheme();
      }
    });
    register("view.toggleFocusMode", toggleFocusModeState);
    register("view.togglePrimarySidebar", function () {
      if (workspaceSidebar) {
        workspaceSidebar.setMode(workspaceSidebar.getMode() === "hidden" ? "expanded" : "hidden");
      }
    });
    register("view.showPrimarySidebar", function () {
      if (workspaceSidebar) {
        workspaceSidebar.setMode("expanded");
      }
    });
    register("view.hidePrimarySidebar", function () {
      if (workspaceSidebar) {
        workspaceSidebar.setMode("hidden");
      }
    });
    register("view.minimizePrimarySidebar", function () {
      if (workspaceSidebar) {
        workspaceSidebar.setMode("minimized");
      }
    });
    register("view.toggleSecondarySidebar", function () {
      if (!aiAssistant) {
        return;
      }
      if (aiAssistant.isPanelOpen()) {
        aiAssistant.closeAssistant();
      } else {
        aiAssistant.openAssistant();
      }
    });

    register("workspace.openFolder", handleOpenWorkspaceFolder);
    register("workspace.restore", function () {
      return handleRestoreWorkspaceSession("restore");
    });
    register("workspace.refresh", handleRefreshWorkspace);
    register("workspace.close", handleCloseWorkspace);
    register("workspace.expandAll", function () {
      if (workspaceSidebar) {
        workspaceSidebar.expandAllFolders();
      }
    });
    register("workspace.collapseAll", function () {
      if (workspaceSidebar) {
        workspaceSidebar.collapseAllFolders();
      }
    });

    register("remote.connectHost", function () {
      return remoteConnectionController && remoteConnectionController.openManager();
    });
    register("remote.openFolder", function () {
      return remoteConnectionController && remoteConnectionController.openRemoteFolder();
    });
    register("remote.manageConnections", function () {
      return remoteConnectionController && remoteConnectionController.openManager();
    });
    register("remote.showLog", function () {
      return remoteConnectionController && remoteConnectionController.showLogs();
    });
    register("remote.reconnect", function () {
      return remoteConnectionController && remoteConnectionController.reconnect();
    });
    register("remote.closeConnection", function () {
      return remoteConnectionController && remoteConnectionController.disconnect();
    });

    register("ai.openAssistant", function () {
      if (aiAssistant) {
        aiAssistant.openAssistant();
      }
    });
    register("ai.configureActions", function () {
      if (aiAssistant) {
        aiAssistant.openActionConfig();
      }
    });
    register("ai.openSettings", function () {
      if (aiAssistant) {
        aiAssistant.openSettings();
      }
    });

    register("help.openFeedback", handleFeedbackFromMore);
    register("help.showAbout", openAboutDialog);
  }

  function bindEvents() {
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
    recentFilesSelect.addEventListener("change", handleRecentFileChange);
    if (recentWorkspacesSelect) {
      recentWorkspacesSelect.addEventListener("change", handleRecentWorkspaceChange);
    }
    if (aiAssistantButton) {
      aiAssistantButton.addEventListener("click", function () {
        closeGlobalMenus("ai");
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
    if (themeToggleButton && ME.commandRegistry) {
      themeToggleButton.addEventListener("click", function () {
        ME.commandRegistry.executeCommand("view.toggleTheme");
      });
    }
    aboutClose.addEventListener("click", closeAboutDialog);
    aboutOverlay.addEventListener("click", function (event) {
      if (event.target === aboutOverlay) {
        closeAboutDialog();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && aiAssistant && aiAssistant.closeTransientUi()) {
        event.preventDefault();
      } else if (event.key === "Escape" && !aboutOverlay.hidden) {
        event.preventDefault();
        closeAboutDialog();
      } else if (event.key === "Escape" && focusModeEnabled) {
        event.preventDefault();
        setFocusMode(false);
      }
    });

    formatBlock.addEventListener("change", function () {
      if (!activeDocumentAllowsMarkdownCommands()) {
        return;
      }
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
    });
    window.addEventListener("beforeunload", handleBeforeUnload);
    wysiwygEditor.addEventListener("scroll", function () {
      viewport.scheduleTracking();
      scheduleWorkspaceSessionSave();
    }, { passive: true });
    markdownEditor.addEventListener("scroll", function () {
      viewport.scheduleTracking();
      scheduleWorkspaceSessionSave();
    }, { passive: true });

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
      actions.handleWysiwygPasteEvent(event);
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
      if (event.key === "Tab" && activeDocumentAllowsMarkdownCommands()) {
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
      actions.insertClipboardPayload({
        files: [],
        html: data.getData("text/html") || "",
        text: data.getData("text/plain") || ""
      }, actions.captureSelection());
    });

    wysiwygEditor.addEventListener("dragover", handleEditorDragOver);
    wysiwygEditor.addEventListener("drop", handleEditorDrop);
    markdownEditor.addEventListener("dragover", handleEditorDragOver);
    markdownEditor.addEventListener("drop", handleEditorDrop);

    document.addEventListener("selectionchange", function () {
      rememberActiveEditorAnchor();
      actions.updateFormatSelect();
      updateCursorStatus();
    });

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
    var testWorkspaceContents = {};

    function testFileText(path) {
      return Object.prototype.hasOwnProperty.call(testWorkspaceContents, path)
        ? testWorkspaceContents[path]
        : "";
    }

    function testFileHandle(path) {
      var name = String(path || "").split("/").pop();

      return {
        __localDraftAIId: "e2e:" + path,
        kind: "file",
        name: name,
        async createWritable() {
          var nextValue = testFileText(path);

          return {
            async write(value) {
              if (value instanceof ArrayBuffer) {
                nextValue = new TextDecoder("utf-8").decode(new Uint8Array(value));
              } else if (typeof Blob !== "undefined" && value instanceof Blob) {
                nextValue = await value.text();
              } else {
                nextValue = String(value == null ? "" : value);
              }
            },
            async close() {
              testWorkspaceContents[path] = nextValue;
            }
          };
        },
        async getFile() {
          return new File([testFileText(path)], name, { type: "text/plain" });
        },
        async isSameEntry(other) {
          return Boolean(other && other.__localDraftAIId === "e2e:" + path);
        }
      };
    }

    async function loadWorkspaceForTest(files, restoreMetadata) {
      var fileItems;
      var rootHandle;
      var workspaceDescriptor;

      testWorkspaceContents = Object.assign({}, files || {});
      fileItems = Object.keys(testWorkspaceContents).filter(function (path) {
        return documentType.isSupportedFileName(path);
      }).map(function (path) {
        var descriptor = documentType.getDocumentTypeForName(path);

        return {
          documentType: descriptor.id,
          extension: documentType.extensionForName(path),
          handle: testFileHandle(path),
          isPlan: descriptor.id === "markdown" && workspaceRelated.isPlanFile(path),
          kind: "file",
          name: path.split("/").pop(),
          path: path
        };
      });
      rootHandle = {
        name: "PlainTextTest",
        async resolve(handle) {
          var match = fileItems.filter(function (item) {
            return item.handle.__localDraftAIId === handle.__localDraftAIId;
          })[0];
          return match ? match.path.split("/") : null;
        }
      };
      workspaceDescriptor = localFilesystemProvider.createWorkspaceDescriptor(rootHandle, {
        id: "workspace-e2e"
      });
      fileItems.forEach(function (item) {
        item.resource = localFilesystemProvider.resourceForHandle(item.handle, {
          workspaceId: workspaceDescriptor.id,
          path: item.path,
          displayName: item.name
        });
      });
      workspaceState = {
        directories: [],
        error: "",
        files: fileItems,
        id: "workspace-e2e",
        isScanning: false,
        providerId: "local-fsa",
        rootHandle: rootHandle,
        rootName: rootHandle.name,
        tree: workspaceStore.buildTree(fileItems, []),
        workspace: workspaceDescriptor
      };
      renderWorkspaceSidebar();
      if (restoreMetadata) {
        await restoreWorkspaceTabs(restoreMetadata, { replaceAll: true });
      }
      return fileItems.map(function (item) {
        return { documentType: item.documentType, name: item.name, path: item.path };
      });
    }

    function loadDocumentForTest(filename, text) {
      var session = getActiveSession();
      var descriptor;

      if (!session) {
        return;
      }

      flushActiveEditor();
      session.title = filename || "Test.md";
      descriptor = documentType.getDocumentTypeForName(session.title) || documentType.getDocumentTypeById("markdown");
      session.documentType = descriptor.id;
      session.extension = documentType.extensionForName(session.title) || descriptor.defaultExtension;
      session.sourceOnly = !descriptor.allowWysiwyg;
      session.editorMode = editorMode.normalizeEditorModeForDocument(session.editorMode, session.documentType);
      session.activeMode = session.editorMode;
      session.activeEditorSource = session.editorMode;
      session.markdownText = String(text || "");
      session.hasFinalNewline = /\n$/.test(session.markdownText);
      markdownEditor.value = session.markdownText;
      if (session.sourceOnly) {
        wysiwygEditor.innerHTML = "";
        showMarkdownEditor();
      } else {
        renderWysiwygFromMarkdown({ force: true });
        if (getEditorMode() === EDITOR_MODES.MARKDOWN) {
          showMarkdownEditor();
        } else {
          showWysiwygEditor();
        }
      }
      if (session.history) {
        session.history.reset(session.markdownText);
      }
      resetScrollPositions();
      session.dirty = false;
      validateSession(session);
      updateCounts();
      updateModeControls();
      updateCursorStatus();
      updateDocumentTitle();
      renderTabs();
    }

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
          documentType: session ? session.documentType : "markdown",
          editorMode: getEditorMode(),
          softWrapEnabled: softWrapEnabled,
          markdownText: session ? session.markdownText : "",
          markdownSelectionStart: markdownEditor.selectionStart,
          markdownSelectionEnd: markdownEditor.selectionEnd,
          markdownScrollTop: markdownEditor.scrollTop,
          wysiwygScrollTop: wysiwygEditor.scrollTop,
          modeLabel: modeLabel.textContent,
          sourceOnly: Boolean(session && session.sourceOnly),
          validationState: session ? session.validationState : null,
          storageProviderId: session ? session.storageProviderId : "",
          title: session ? session.title : "",
          markdownHidden: markdownEditor.hidden,
          wysiwygHidden: wysiwygEditor.hidden
        };
      },
      closeActiveTabForTest: function () {
        var session = getActiveSession();
        return session ? closeTab(session.id) : null;
      },
      getOpenTabsForTest: function () {
        return tabs.listSessions().map(function (session) {
          return {
            documentType: session.documentType,
            editorMode: session.editorMode,
            path: session.workspacePath,
            softWrapEnabled: session.softWrapEnabled,
            sourceOnly: session.sourceOnly,
            title: session.title
          };
        });
      },
      getWorkspaceContentsForTest: function () {
        return Object.assign({}, testWorkspaceContents);
      },
      getWorkspaceMetadataForTest: function () {
        var metadata = currentWorkspaceSessionMetadata();
        if (!metadata) {
          return null;
        }
        return {
          activePath: metadata.activePath,
          collapsedFolders: metadata.collapsedFolders,
          openedTabs: metadata.openedTabs,
          sidebarScroll: metadata.sidebarScroll,
          workspaceName: metadata.workspaceName
        };
      },
      loadDocumentForTest: loadDocumentForTest,
      loadMarkdownForTest: loadDocumentForTest,
      loadWorkspaceForTest: loadWorkspaceForTest,
      openWorkspaceFileForTest: function (path, options) {
        return openWorkspaceFile(path, options);
      },
      saveActiveDocumentForTest: async function () {
        var session = getActiveSession();
        flushActiveEditor();
        validateSession(session);
        await fileStore.saveSession(session);
        markSessionClean();
        return session && session.workspacePath ? testFileText(session.workspacePath) : session.markdownText;
      },
      searchWorkspaceForTest: async function (query) {
        await handleWorkspaceContentSearch(query);
        return workspaceContentSearchState;
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

    if (storageProviders && localFilesystemProvider && !storageProviders.get(localFilesystemProvider.id)) {
      storageProviders.register(localFilesystemProvider);
    }
    if (remoteSSHProviderModule && !remoteSSHProvider) {
      remoteSSHProvider = remoteSSHProviderModule.create({
        getBridgeClient: function () { return ME.activeBridgeClient || null; }
      });
    }
    if (storageProviders && remoteSSHProvider && !storageProviders.get(remoteSSHProvider.id)) {
      storageProviders.register(remoteSSHProvider);
    }

    if (ME.statusBar) {
      statusBarController = ME.statusBar.create({
        aiStatus: aiStatusBadge,
        charCount: charCount,
        cursor: cursorPosition,
        document: documentStatus,
        documentType: documentTypeStatus,
        message: applicationStatus,
        mode: modeLabel,
        softWrap: softWrapStatus,
        validation: validationStatus,
        wordCount: wordCount,
        workspace: workspaceStatus
      });
      statusBarController.setWorkspace("");
      statusBarController.setSoftWrap(softWrapEnabled);
    }

    if (remoteStatus) {
      remoteStatusController = remoteStatus.create({
        button: document.getElementById("remoteStatusItem"),
        menu: document.getElementById("remoteStatusMenu"),
        onCommand: function (commandId) {
          if (ME.commandRegistry && ME.commandRegistry.hasCommand(commandId)) {
            ME.commandRegistry.executeCommand(commandId);
          }
        }
      });
    }

    if (remoteConnectionUI && remoteStatusController) {
      remoteConnectionController = remoteConnectionUI.create({
        addButton: document.getElementById("remoteConnectionAdd"),
        connectButton: document.getElementById("remoteConnectionConnect"),
        editButton: document.getElementById("remoteConnectionEdit"),
        folderCancel: document.getElementById("remoteFolderCancel"),
        folderClose: document.getElementById("remoteFolderClose"),
        folderList: document.getElementById("remoteFolderList"),
        folderOpen: document.getElementById("remoteFolderOpen"),
        folderOverlay: document.getElementById("remoteFolderOverlay"),
        folderPath: document.getElementById("remoteFolderPath"),
        folderStatus: document.getElementById("remoteFolderStatus"),
        folderUp: document.getElementById("remoteFolderUp"),
        formFields: {
          allowPassword: document.getElementById("remoteConnectionAllowPassword"),
          defaultRemotePath: document.getElementById("remoteConnectionDefaultPath"),
          host: document.getElementById("remoteConnectionHost"),
          identityFile: document.getElementById("remoteConnectionIdentityFile"),
          label: document.getElementById("remoteConnectionName"),
          port: document.getElementById("remoteConnectionPort"),
          useAgent: document.getElementById("remoteConnectionUseAgent"),
          user: document.getElementById("remoteConnectionUser")
        },
        importedList: document.getElementById("importedConnectionsList"),
        logClose: document.getElementById("remoteLogClose"),
        logContents: document.getElementById("remoteLogContents"),
        logDialog: document.getElementById("remoteLogDialog"),
        logDone: document.getElementById("remoteLogDone"),
        logOverlay: document.getElementById("remoteLogOverlay"),
        managerCancel: document.getElementById("remoteConnectionsCancel"),
        managerClose: document.getElementById("remoteConnectionsClose"),
        managerDialog: document.getElementById("remoteConnectionsDialog"),
        managerLists: document.getElementById("remoteConnectionLists"),
        managerOverlay: document.getElementById("remoteConnectionsOverlay"),
        managerStatus: document.getElementById("remoteConnectionsStatus"),
        onMessage: function (message, kind) {
          if (statusBarController && message) {
            statusBarController.showMessage(message, kind === "error" ? 8000 : 4000);
          }
        },
        onRemoteFolderSelected: handleOpenRemoteWorkspace,
        profileForm: document.getElementById("remoteConnectionForm"),
        profileFormCancel: document.getElementById("remoteConnectionFormCancel"),
        profileFormSave: document.getElementById("remoteConnectionFormSave"),
        profileFormStatus: document.getElementById("remoteConnectionFormStatus"),
        profileFormTitle: document.getElementById("remoteConnectionFormTitle"),
        promptCancel: document.getElementById("remotePromptCancel"),
        promptConfirm: document.getElementById("remotePromptConfirm"),
        promptFingerprint: document.getElementById("remotePromptFingerprint"),
        promptMessage: document.getElementById("remotePromptMessage"),
        promptOverlay: document.getElementById("remotePromptOverlay"),
        promptTitle: document.getElementById("remotePromptTitle"),
        refreshButton: document.getElementById("remoteConnectionsRefresh"),
        removeButton: document.getElementById("remoteConnectionRemove"),
        savedList: document.getElementById("savedConnectionsList"),
        secretField: document.getElementById("remoteSecretField"),
        secretInput: document.getElementById("remoteSecretInput"),
        statusController: remoteStatusController
      });
    }

    viewport = ME.viewport.create({
      getActiveMode: getActiveMode,
      getMarkdownText: getMarkdownText,
      markdownEditor: markdownEditor,
      wysiwygEditor: wysiwygEditor
    });

    actions = ME.editorActions.create({
      applyHistoryStep: applyHistoryStep,
      allowsMarkdownCommands: activeDocumentAllowsMarkdownCommands,
      formatBlock: formatBlock,
      getActiveMode: getActiveMode,
      insertClipboardImages: function (files, selection) {
        return storeAndInsertImages(files, {
          action: "Paste image",
          alt: "pasted image",
          fallbackAlt: "pasted image",
          prefix: "pasted",
          selection: selection
        });
      },
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
        onContextAction: handleWorkspaceContextAction,
        onOpenFile: openWorkspaceFile,
        onOpenFolder: handleOpenWorkspaceFolder,
        onExpandFolder: handleExpandWorkspaceFolder,
        onRefresh: handleRefreshWorkspace,
        onClose: handleCloseWorkspace,
        onRestoreAction: handleRestoreWorkspaceSession,
        onFolderStateChange: scheduleWorkspaceSessionSave,
        onModeChange: function (mode) {
          if (activityBar) {
            activityBar.syncPrimarySidebarMode(mode);
          }
        },
        onPanelChange: function (panel) {
          if (activityBar) {
            activityBar.syncPrimaryView(panel);
          }
        },
        onScrollStateChange: scheduleWorkspaceSessionSave,
        onSearchContent: handleWorkspaceContentSearch
      });
      workspaceSidebar.bindEvents();
    }

    aiAssistant = ME.aiAssistant.create({
      actionConfig: {
        cancelButton: aiActionConfigCancel,
        closeButton: aiActionConfigClose,
        dialog: aiActionConfigDialog,
        editor: aiActionConfigEditor,
        exportButton: aiActionConfigExport,
        importButton: aiActionConfigImport,
        importInput: aiActionConfigImportInput,
        overlay: aiActionConfigOverlay,
        resetButton: aiActionConfigReset,
        saveButton: aiActionConfigSave,
        status: aiActionConfigStatus,
        validateButton: aiActionConfigValidate
      },
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
      getDocumentType: function () {
        var session = getActiveSession();
        return session ? session.documentType : "markdown";
      },
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
        configureActionsButton: aiSettingsConfigureActions,
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
      aiAssistantPanelBody: aiAssistantPanelBody,
      aiAssistantPanelWelcome: aiAssistantPanelWelcome,
      aiAssistantPanelClose: aiAssistantPanelClose,
      aiAssistantPanelSettings: aiAssistantPanelSettings,
      onPanelVisibilityChange: function (visible) {
        if (activityBar) {
          activityBar.syncSecondarySidebar(visible);
        }
      },
      onStatusChange: function (state) {
        if (statusBarController) {
          statusBarController.setAiStatus(state);
        }
      }
    });

    if (ME.activityBar && activityBarElement) {
      activityBar = ME.activityBar.create({
        aiAssistant: aiAssistant,
        rootElement: activityBarElement,
        workspaceSidebar: workspaceSidebar
      });
    }

    registerApplicationCommands();
    if (ME.menuBar && menuBarElement && ME.commandRegistry) {
      menuBarController = ME.menuBar.create({
        commandRegistry: ME.commandRegistry,
        entries: [
          { id: "file", button: fileMenuButton, menu: fileMenu },
          { id: "edit", button: editMenuButton, menu: editMenu },
          { id: "view", button: viewMenuButton, menu: viewMenu },
          { id: "workspace", button: workspaceButton, menu: workspaceMenu, beforeOpen: updateWorkspaceMenuControls },
          { id: "help", button: moreButton, menu: moreMenu }
        ],
        onBeforeOpen: function () {
          if (aiAssistant) {
            aiAssistant.hideTransientUi();
          }
        },
        rootElement: menuBarElement
      });
    }

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
    if (remoteStatusController) {
      remoteStatusController.bindEvents();
    }
    if (remoteConnectionController) {
      remoteConnectionController.bindEvents();
    }
    aiAssistant.bindEvents();
    if (activityBar) {
      activityBar.bindEvents();
    }
    if (menuBarController) {
      menuBarController.bindEvents();
    }
    installTestApi();
    if (bridgeClient && typeof bridgeClient.detect === "function") {
      bridgeClient.detect().then(function (client) {
        ME.activeBridgeClient = client;
        if (remoteConnectionController) {
          remoteConnectionController.setBridgeClient(client);
        }
      }).catch(function (error) {
        ME.bridgeDetectionError = error;
        if (remoteConnectionController) {
          remoteConnectionController.setBridgeError(error);
        }
      });
    }
    updateFileControls();
    renderWorkspaceSidebar();
    refreshRecentFiles();
    refreshRecentWorkspaces();
    loadRestorableWorkspaceSession();
    focusActiveEditor();
  }

  init();
}());
