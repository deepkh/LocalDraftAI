(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var markdown = ME.markdown;
  var fileStore = ME.fileStore;
  var assetStore = ME.assetStore;
  var recentStore = ME.recentFiles ? ME.recentFiles.create({ maxFiles: 10 }) : null;

  var tabs = null;
  var recentRecords = [];
  var previewVisible = true;
  var focusModeEnabled = false;
  var syncTimer = 0;
  var wysiwygNeedsSync = false;

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
  var toggleFocusMode = document.getElementById("toggleFocusMode");
  var previewStatus = document.getElementById("previewStatus");
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
  var aiResultText = document.getElementById("aiResultText");
  var aiReviewApply = document.getElementById("aiReviewApply");
  var aiReviewCancel = document.getElementById("aiReviewCancel");
  var aiReviewClose = document.getElementById("aiReviewClose");
  var aiSettingsOverlay = document.getElementById("aiSettingsOverlay");
  var aiSettingsDialog = document.getElementById("aiSettingsDialog");
  var aiSettingsForm = document.getElementById("aiSettingsForm");
  var aiModeMock = document.getElementById("aiModeMock");
  var aiModeServer = document.getElementById("aiModeServer");
  var aiEndpointInput = document.getElementById("aiEndpointInput");
  var aiModelInput = document.getElementById("aiModelInput");
  var aiModelListButton = document.getElementById("aiModelListButton");
  var aiModelOptions = document.getElementById("aiModelOptions");
  var aiModelSelect = document.getElementById("aiModelSelect");
  var aiApiKeyInput = document.getElementById("aiApiKeyInput");
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
  var tabViewport = document.getElementById("tabViewport");
  var tabList = document.getElementById("tabList");
  var tabScrollLeft = document.getElementById("tabScrollLeft");
  var tabScrollRight = document.getElementById("tabScrollRight");
  var newTabButton = document.getElementById("newTabButton");
  var toolbarButtons = Array.prototype.slice.call(document.querySelectorAll("[data-action]"));
  var insertImageButton = document.querySelector('[data-action="image"]');
  var undoButton = document.querySelector('[data-action="undo"]');
  var redoButton = document.querySelector('[data-action="redo"]');

  var viewport;
  var actions;
  var resizer;
  var aiAssistant;
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
    return session ? session.activeMode : "wysiwyg";
  }

  function getActiveHistory() {
    var session = getActiveSession();
    return session ? session.history : null;
  }

  function isFileAccessSupported() {
    return fileStore && fileStore.isSupported();
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

  function renderPreview() {
    var html = renderMarkdownForSession(getMarkdownText());
    preview.innerHTML = html || '<p class="preview-empty">Preview</p>';
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
    document.title = displayTitle + " - Markdown Forge";
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
    preview.scrollTop = 0;
    window.scrollTo(window.scrollX, 0);
  }

  function updateModeControls() {
    var inWysiwyg = getActiveMode() === "wysiwyg";

    wysiwygMode.classList.toggle("is-active", inWysiwyg);
    markdownMode.classList.toggle("is-active", !inWysiwyg);
    wysiwygMode.setAttribute("aria-pressed", String(inWysiwyg));
    markdownMode.setAttribute("aria-pressed", String(!inWysiwyg));
    wysiwygEditor.hidden = !inWysiwyg;
    markdownEditor.hidden = inWysiwyg;
    modeLabel.textContent = inWysiwyg ? "WYSIWYG" : "Markdown";
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
    renderPreview();
    updateCounts();
    updateModeControls();
    activeSession.history.updateControls();
    updateDocumentTitle();
    renderTabs();

    window.requestAnimationFrame(function () {
      if (options.restoreScroll && activeSession.scrollState && viewport) {
        viewport.restore(activeSession.scrollState);
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
    if (source !== "textarea") {
      markdownEditor.value = activeSession.markdownText;
    }
    renderPreview();
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
    setMarkdown(markdown.htmlToMarkdown(wysiwygEditor), "wysiwyg");
    wysiwygNeedsSync = false;
  }

  function scheduleSyncFromWysiwyg() {
    wysiwygNeedsSync = true;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(syncFromWysiwyg, 0);
  }

  function focusActiveEditor() {
    if (getActiveMode() === "wysiwyg") {
      wysiwygEditor.focus();
    } else {
      markdownEditor.focus();
    }
  }

  function flushActiveEditor() {
    if (getActiveMode() === "wysiwyg") {
      window.clearTimeout(syncTimer);
      if (wysiwygNeedsSync) {
        syncFromWysiwyg();
      }
    } else {
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
    renderPreview();
    updateCounts();

    if (getActiveMode() === "wysiwyg") {
      wysiwygEditor.innerHTML = renderMarkdownForSession(activeSession.markdownText);
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

  function switchMode(mode) {
    var activeSession = getActiveSession();
    var viewportAnchor;

    if (!activeSession || mode === getActiveMode()) {
      viewport.consumeModeSwitchAnchor();
      return;
    }

    if (aiAssistant) {
      aiAssistant.hideTransientUi();
    }

    viewportAnchor = viewport.consumeModeSwitchAnchor();

    if (getActiveMode() === "wysiwyg") {
      flushActiveEditor();
    } else {
      setMarkdown(markdownEditor.value, "textarea");
    }

    activeSession.activeMode = mode;

    if (getActiveMode() === "wysiwyg") {
      wysiwygEditor.innerHTML = renderMarkdownForSession(activeSession.markdownText);
      wysiwygNeedsSync = false;
    } else {
      markdownEditor.value = activeSession.markdownText;
    }

    updateModeControls();

    window.requestAnimationFrame(function () {
      focusActiveEditor();
      window.requestAnimationFrame(function () {
        viewport.restore(viewportAnchor);
        window.requestAnimationFrame(function () {
          viewport.restore(viewportAnchor);
          viewport.remember();
          activeSession.scrollState = viewport.capture();
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

  function setFocusMode(enabled) {
    focusModeEnabled = Boolean(enabled);
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
      return;
    }

    recentFilesSelect.title = "Open or remove recent files";
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
        setActiveSession(existingSession, { restoreScroll: true });
        await addRecentFile(fileData.fileHandle, fileData.title);
        focusActiveEditor();
        return;
      }

      session = createSession({
        activeMode: getActiveMode(),
        fileHandle: fileData.fileHandle,
        markdownText: fileData.markdownText,
        title: fileData.title
      });
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
      markSessionClean();
      await addRecentFile(activeSession.fileHandle, activeSession.title);
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
        setActiveSession(existingSession, { restoreScroll: true });
        await refreshRecentFiles();
        focusActiveEditor();
        return;
      }

      session = createSession({
        activeMode: getActiveMode(),
        fileHandle: fileData.fileHandle,
        markdownText: fileData.markdownText,
        title: fileData.title
      });
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
    if (getActiveMode() === "wysiwyg") {
      actions.placeWysiwygCaretAtPoint(event.clientX, event.clientY);
    } else {
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

    wysiwygMode.addEventListener("pointerdown", viewport.prepareModeSwitchAnchor);
    markdownMode.addEventListener("pointerdown", viewport.prepareModeSwitchAnchor);

    wysiwygMode.addEventListener("click", function () {
      switchMode("wysiwyg");
    });

    markdownMode.addEventListener("click", function () {
      switchMode("markdown");
    });

    togglePreview.addEventListener("click", togglePreviewPane);
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
    resizer.bindEvents();

    formatBlock.addEventListener("change", function () {
      if (getActiveMode() === "markdown") {
        actions.applyMarkdownFormat(formatBlock.value);
        return;
      }
      actions.execWysiwyg("formatBlock", formatBlock.value);
    });

    toolbarButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        var action = button.getAttribute("data-action");
        if (action === "image") {
          handleInsertImage();
          return;
        }
        actions.applyToolbarAction(action);
      });
    });

    window.addEventListener("scroll", viewport.scheduleTracking, { passive: true });
    window.addEventListener("resize", updateTabScrollButtons);
    window.addEventListener("beforeunload", handleBeforeUnload);
    wysiwygEditor.addEventListener("scroll", viewport.schedulePreviewSync, { passive: true });
    markdownEditor.addEventListener("scroll", viewport.schedulePreviewSync, { passive: true });
    preview.addEventListener("scroll", viewport.scheduleEditorSync, { passive: true });

    wysiwygEditor.addEventListener("input", scheduleSyncFromWysiwyg);
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
      setMarkdown(markdownEditor.value, "textarea");
    });

    wysiwygEditor.addEventListener("keydown", function (event) {
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

  function init() {
    var initialSession;

    viewport = ME.viewport.create({
      getActiveMode: getActiveMode,
      getMarkdownText: getMarkdownText,
      markdownEditor: markdownEditor,
      preview: preview,
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

    resizer = ME.resizer.create({
      isPreviewVisible: function () { return previewVisible; },
      paneResizer: paneResizer,
      workspace: workspace
    });

    aiAssistant = ME.aiAssistant.create({
      applyButton: aiReviewApply,
      cancelButton: aiReviewCancel,
      closeButton: aiReviewClose,
      captureSelection: actions.captureSelection,
      focusActiveEditor: focusActiveEditor,
      getActiveMode: getActiveMode,
      getActiveSessionId: function () {
        var session = getActiveSession();
        return session ? session.id : null;
      },
      insertHtmlAtSelection: actions.insertHtmlAtSelection,
      markdownEditor: markdownEditor,
      originalText: aiOriginalText,
      renderMarkdownToHtml: renderMarkdownForSession,
      resultText: aiResultText,
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
        saveButton: aiSettingsSave,
        statusElement: aiSettingsStatus,
        testButton: aiSettingsTest
      },
      statusBadge: aiStatusBadge,
      toolbarButton: aiAssistantButton,
      toolbarMenu: aiToolbarMenu
    });

    tabs = ME.tabManager.create({
      createSession: createSession
    });
    initialSession = createSession({
      markdownText: "",
      title: "Untitled.md"
    });
    tabs.addSession(initialSession, { activate: false });
    setActiveSession(initialSession, { restoreScroll: false });
    bindEvents();
    aiAssistant.bindEvents();
    updateFileControls();
    refreshRecentFiles();
    resizer.updateValue(workspace.querySelector(".editor-pane").getBoundingClientRect().width);
    focusActiveEditor();
  }

  init();
}());
