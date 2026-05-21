(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var markdown = ME.markdown;
  var fileStore = ME.fileStore;
  var assetStore = ME.assetStore;
  var recentStore = ME.recentFiles ? ME.recentFiles.create({ maxFiles: 10 }) : null;

  var activeSession = null;
  var recentRecords = [];
  var previewVisible = true;
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
  var previewStatus = document.getElementById("previewStatus");
  var aboutButton = document.getElementById("aboutButton");
  var aboutOverlay = document.getElementById("aboutOverlay");
  var aboutDialog = document.querySelector(".about-dialog");
  var aboutClose = document.getElementById("aboutClose");
  var documentTitle = document.getElementById("documentTitle");
  var newFileButton = document.getElementById("newFile");
  var openFileButton = document.getElementById("openFile");
  var saveFileButton = document.getElementById("saveFile");
  var saveAsFileButton = document.getElementById("saveAsFile");
  var recentFilesSelect = document.getElementById("recentFiles");
  var toolbarButtons = Array.prototype.slice.call(document.querySelectorAll("[data-action]"));
  var insertImageButton = document.querySelector('[data-action="image"]');
  var undoButton = document.querySelector('[data-action="undo"]');
  var redoButton = document.querySelector('[data-action="redo"]');

  var viewport;
  var actions;
  var resizer;

  function getMarkdownText() {
    return activeSession ? activeSession.markdownText : "";
  }

  function getActiveMode() {
    return activeSession ? activeSession.activeMode : "wysiwyg";
  }

  function getActiveHistory() {
    return activeSession ? activeSession.history : null;
  }

  function isFileAccessSupported() {
    return fileStore && fileStore.isSupported();
  }

  function isImagePickerSupported() {
    return assetStore && assetStore.isImagePickerSupported();
  }

  function resolveImageUrl(src) {
    if (
      activeSession &&
      activeSession.assetObjectUrls &&
      activeSession.assetObjectUrls[src]
    ) {
      return activeSession.assetObjectUrls[src];
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
    var title = activeSession ? activeSession.title : "Untitled.md";
    var displayTitle = (activeSession && activeSession.dirty ? "* " : "") + title;

    documentTitle.textContent = displayTitle;
    documentTitle.title = activeSession && activeSession.dirty ? title + " has unsaved changes" : title;
    document.title = displayTitle + " - Markdown Forge";
  }

  function updateDirtyState() {
    var history = getActiveHistory();

    if (!activeSession || !history) {
      return;
    }

    activeSession.dirty = !history.isClean();
    updateDocumentTitle();
  }

  function markSessionClean() {
    var history = getActiveHistory();

    if (!activeSession || !history) {
      return;
    }

    history.markClean(activeSession.markdownText);
    activeSession.dirty = false;
    updateDocumentTitle();
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
    options = options || {};

    window.clearTimeout(syncTimer);

    if (activeSession && activeSession !== session && viewport && viewport.capture) {
      activeSession.scrollState = viewport.capture();
    }

    if (activeSession && activeSession !== session) {
      revokeAssetObjectUrls(activeSession);
    }

    activeSession = session;
    markdownEditor.value = activeSession.markdownText;
    wysiwygEditor.innerHTML = renderMarkdownForSession(activeSession.markdownText);
    wysiwygNeedsSync = false;
    renderPreview();
    updateCounts();
    updateModeControls();
    activeSession.history.updateControls();
    updateDocumentTitle();

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
    var viewportAnchor;

    if (mode === getActiveMode()) {
      viewport.consumeModeSwitchAnchor();
      return;
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

    recentRecords = records || [];
    recentFilesSelect.innerHTML = "";
    placeholder.value = "";
    placeholder.textContent = recentRecords.length ? "Recent" : "No recent";
    recentFilesSelect.appendChild(placeholder);

    recentRecords.forEach(function (record) {
      var option = document.createElement("option");
      option.value = String(record.id);
      option.textContent = record.name || "Untitled.md";
      recentFilesSelect.appendChild(option);
    });

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

    recentFilesSelect.title = "Recent files";
  }

  function confirmDiscardDirtySession() {
    if (!activeSession || !activeSession.dirty) {
      return true;
    }

    return window.confirm("Discard unsaved changes to " + activeSession.title + "?");
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
    var session = activeSession;
    var selection = options.selection || actions.captureSelection();
    var images;

    if (!session || !files || !files.length) {
      return;
    }

    try {
      images = await saveImagesForInsertion(session, files, options);
      if (activeSession !== session) {
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

  function handleNewFile() {
    flushActiveEditor();

    if (!confirmDiscardDirtySession()) {
      focusActiveEditor();
      return;
    }

    setActiveSession(createSession({
      activeMode: getActiveMode(),
      markdownText: "",
      title: "Untitled.md"
    }));
    focusActiveEditor();
  }

  async function handleOpenFile() {
    var fileData;

    if (!isFileAccessSupported()) {
      return;
    }

    flushActiveEditor();

    if (!confirmDiscardDirtySession()) {
      focusActiveEditor();
      return;
    }

    try {
      fileData = await fileStore.openMarkdownFile();
      setActiveSession(createSession({
        activeMode: getActiveMode(),
        fileHandle: fileData.fileHandle,
        markdownText: fileData.markdownText,
        title: fileData.title
      }));
      await addRecentFile(fileData.fileHandle, fileData.title);
      focusActiveEditor();
    } catch (error) {
      showFileError("Open", error);
    }
  }

  async function handleSaveFile() {
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

  async function handleRecentFileOpen() {
    var recentId = recentFilesSelect.value;
    var record = findRecentRecord(recentId);
    var fileData;

    recentFilesSelect.value = "";

    if (!recentId || !record) {
      return;
    }

    flushActiveEditor();

    if (!confirmDiscardDirtySession()) {
      focusActiveEditor();
      return;
    }

    try {
      fileData = await recentStore.openRecord(record);
      setActiveSession(createSession({
        activeMode: getActiveMode(),
        fileHandle: fileData.fileHandle,
        markdownText: fileData.markdownText,
        title: fileData.title
      }));
      await refreshRecentFiles();
      focusActiveEditor();
    } catch (error) {
      await refreshRecentFiles();
      showFileError("Open recent file", error);
    }
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
    openFileButton.addEventListener("click", handleOpenFile);
    saveFileButton.addEventListener("click", handleSaveFile);
    saveAsFileButton.addEventListener("click", handleSaveAsFile);
    recentFilesSelect.addEventListener("change", handleRecentFileOpen);

    wysiwygMode.addEventListener("pointerdown", viewport.prepareModeSwitchAnchor);
    markdownMode.addEventListener("pointerdown", viewport.prepareModeSwitchAnchor);

    wysiwygMode.addEventListener("click", function () {
      switchMode("wysiwyg");
    });

    markdownMode.addEventListener("click", function () {
      switchMode("markdown");
    });

    togglePreview.addEventListener("click", togglePreviewPane);
    aboutButton.addEventListener("click", openAboutDialog);
    aboutClose.addEventListener("click", closeAboutDialog);
    aboutOverlay.addEventListener("click", function (event) {
      if (event.target === aboutOverlay) {
        closeAboutDialog();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !aboutOverlay.hidden) {
        event.preventDefault();
        closeAboutDialog();
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

      if (handleFileShortcut(key, event)) {
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

    setActiveSession(createSession({
      markdownText: "",
      title: "Untitled.md"
    }));
    bindEvents();
    updateFileControls();
    refreshRecentFiles();
    resizer.updateValue(workspace.querySelector(".editor-pane").getBoundingClientRect().width);
    focusActiveEditor();
  }

  init();
}());
