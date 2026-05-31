(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var escapeHtml = ME.utils.escapeHtml;
  var clamp = ME.utils.clamp;

  var MODE_STORAGE_KEY = "localdraftai.workspaceSidebar.mode";
  var WIDTH_STORAGE_KEY = "localdraftai.workspaceSidebar.width";
  var PANEL_STORAGE_KEY = "localdraftai.workspaceSidebar.panel";
  var COLLAPSED_FOLDERS_STORAGE_KEY = "localdraftai.workspaceSidebar.collapsedFolders";
  var SIDEBAR_MODES = {
    EXPANDED: "expanded",
    HIDDEN: "hidden",
    MINIMIZED: "minimized"
  };
  var PANELS = {
    FILES: "files",
    RELATED: "related",
    SEARCH: "search"
  };
  var DEFAULT_WIDTH = 280;
  var MIN_WIDTH = 220;
  var MAX_WIDTH = 480;
  var MINIMIZED_WIDTH = 44;

  function readStorage(storage, key) {
    try {
      return storage ? storage.getItem(key) : null;
    } catch (error) {
      return null;
    }
  }

  function writeStorage(storage, key, value) {
    try {
      if (storage) {
        storage.setItem(key, String(value));
      }
    } catch (error) {
      // Sidebar persistence is optional.
    }
  }

  function readJsonStorage(storage, key) {
    var raw = readStorage(storage, key);
    var parsed;

    if (!raw) {
      return {};
    }

    try {
      parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeJsonStorage(storage, key, value) {
    writeStorage(storage, key, JSON.stringify(value || {}));
  }

  function normalizeFolderPath(path) {
    return String(path || "").split("/").filter(Boolean).join("/");
  }

  function workspaceStorageKey(rootName) {
    return String(rootName || "").trim();
  }

  function lookupFromPaths(paths) {
    var lookup = {};

    (paths || []).forEach(function (path) {
      path = normalizeFolderPath(path);
      if (path) {
        lookup[path] = true;
      }
    });

    return lookup;
  }

  function pathsFromLookup(lookup) {
    return Object.keys(lookup || {}).filter(Boolean).sort();
  }

  function parentFolderPaths(filePath) {
    var parts = String(filePath || "").split("/").filter(Boolean);
    var paths = [];
    var current = "";
    var i;

    parts.pop();
    for (i = 0; i < parts.length; i += 1) {
      current = normalizeFolderPath([current, parts[i]].join("/"));
      if (current) {
        paths.push(current);
      }
    }

    return paths;
  }

  function collectCollapsibleFolders(nodes, paths) {
    paths = paths || [];
    (nodes || []).forEach(function (node) {
      if (node.kind !== "directory") {
        return;
      }
      if (node.children && node.children.length) {
        paths.push(normalizeFolderPath(node.path));
      }
      collectCollapsibleFolders(node.children || [], paths);
    });
    return paths.filter(Boolean);
  }

  function normalizeMode(mode) {
    if (mode === SIDEBAR_MODES.EXPANDED) {
      return mode;
    }
    if (mode === SIDEBAR_MODES.HIDDEN || mode === SIDEBAR_MODES.MINIMIZED) {
      return mode;
    }

    return SIDEBAR_MODES.HIDDEN;
  }

  function normalizePanel(panel) {
    if (panel === PANELS.SEARCH || panel === PANELS.RELATED) {
      return panel;
    }

    return PANELS.FILES;
  }

  function normalizeWidth(width, viewportWidth) {
    var max = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.floor((viewportWidth || window.innerWidth || MAX_WIDTH) * 0.4)));
    var numericWidth = Number(width);

    if (!Number.isFinite(numericWidth)) {
      numericWidth = DEFAULT_WIDTH;
    }

    return clamp(Math.round(numericWidth), MIN_WIDTH, max);
  }

  function createDirtyLookup(paths) {
    var lookup = {};

    (paths || []).forEach(function (path) {
      lookup[path] = true;
    });

    return lookup;
  }

  function treeHasNodes(nodes) {
    return Boolean(nodes && nodes.length);
  }

  function pathName(path) {
    return ME.workspaceRelated && ME.workspaceRelated.basename
      ? ME.workspaceRelated.basename(path)
      : String(path || "").split("/").pop();
  }

  function createSidebar(context) {
    var rootElement = context.rootElement;
    var resizerElement = context.resizerElement;
    var workspaceElement = context.workspaceElement || (rootElement && rootElement.parentElement);
    var storage = context.storage || window.localStorage;
    var onOpenFile = context.onOpenFile || function () {};
    var onOpenFolder = context.onOpenFolder || function () {};
    var onRefresh = context.onRefresh || function () {};
    var onClose = context.onClose || function () {};
    var onContextAction = context.onContextAction || function () {};
    var onFolderStateChange = context.onFolderStateChange || function () {};
    var onSearchContent = context.onSearchContent || function () {};
    var onRestoreAction = context.onRestoreAction || function () {};
    var state = {
      directories: [],
      error: "",
      files: [],
      isScanning: false,
      isSupported: true,
      restorePrompt: null,
      rootName: "",
      search: {
        error: "",
        isSearching: false,
        limited: false,
        query: "",
        results: []
      },
      related: null,
      tree: null
    };
    var selectedPath = "";
    var dirtyPaths = {};
    var fileSearchQuery = "";
    var contentSearchQuery = "";
    var activePanel = normalizePanel(readStorage(storage, PANEL_STORAGE_KEY));
    var mode = normalizeMode(readStorage(storage, MODE_STORAGE_KEY));
    var width = normalizeWidth(readStorage(storage, WIDTH_STORAGE_KEY));
    var activePointerId = null;
    var searchTimer = 0;
    var contextMenu = null;
    var collapsedFolderPaths = lookupFromPaths(
      readJsonStorage(storage, COLLAPSED_FOLDERS_STORAGE_KEY)[workspaceStorageKey(state.rootName)]
    );

    function setGridWidth(nextWidth) {
      width = normalizeWidth(nextWidth);
      document.documentElement.style.setProperty("--workspace-sidebar-width", width + "px");
      if (resizerElement) {
        resizerElement.setAttribute("aria-valuemin", String(MIN_WIDTH));
        resizerElement.setAttribute("aria-valuemax", String(Math.min(MAX_WIDTH, Math.floor((window.innerWidth || MAX_WIDTH) * 0.4))));
        resizerElement.setAttribute("aria-valuenow", String(width));
      }
    }

    function applyModeClasses() {
      rootElement.classList.toggle("is-hidden", mode === SIDEBAR_MODES.HIDDEN);
      rootElement.classList.toggle("is-minimized", mode === SIDEBAR_MODES.MINIMIZED);
      rootElement.classList.toggle("is-expanded", mode === SIDEBAR_MODES.EXPANDED);

      if (resizerElement) {
        resizerElement.hidden = mode !== SIDEBAR_MODES.EXPANDED;
      }

      if (workspaceElement) {
        workspaceElement.classList.toggle("has-workspace-sidebar", mode === SIDEBAR_MODES.EXPANDED);
        workspaceElement.classList.toggle("workspace-sidebar-minimized", mode === SIDEBAR_MODES.MINIMIZED);
      }
    }

    function planBadge(node) {
      if (!(node && (node.isPlan || (ME.workspaceRelated && ME.workspaceRelated.isPlanFile(node.path))))) {
        return "";
      }

      return "<span class=\"workspace-plan-badge\">PLAN</span>";
    }

    function persistCollapsedFolders() {
      var key = workspaceStorageKey(state.rootName);
      var collapsedByWorkspace;

      if (!key) {
        return;
      }

      collapsedByWorkspace = readJsonStorage(storage, COLLAPSED_FOLDERS_STORAGE_KEY);
      collapsedByWorkspace[key] = pathsFromLookup(collapsedFolderPaths);
      writeJsonStorage(storage, COLLAPSED_FOLDERS_STORAGE_KEY, collapsedByWorkspace);
      onFolderStateChange(pathsFromLookup(collapsedFolderPaths));
    }

    function loadCollapsedFolders(rootName) {
      var key = workspaceStorageKey(rootName);
      var collapsedByWorkspace = readJsonStorage(storage, COLLAPSED_FOLDERS_STORAGE_KEY);

      collapsedFolderPaths = lookupFromPaths(key ? collapsedByWorkspace[key] : []);
    }

    function expandParentFolders(path, shouldPersist) {
      var changed = false;

      parentFolderPaths(path).forEach(function (folderPath) {
        if (collapsedFolderPaths[folderPath]) {
          delete collapsedFolderPaths[folderPath];
          changed = true;
        }
      });

      if (changed && shouldPersist) {
        persistCollapsedFolders();
      }

      return changed;
    }

    function toggleFolder(path) {
      path = normalizeFolderPath(path);
      if (!path) {
        return;
      }

      if (collapsedFolderPaths[path]) {
        delete collapsedFolderPaths[path];
      } else {
        collapsedFolderPaths[path] = true;
      }
      persistCollapsedFolders();
      render();
    }

    function expandAllFolders() {
      collapsedFolderPaths = {};
      persistCollapsedFolders();
      render();
    }

    function collapseAllFolders() {
      var activeParents = lookupFromPaths(parentFolderPaths(selectedPath));

      collapsedFolderPaths = lookupFromPaths(collectCollapsibleFolders(state.tree || []));
      Object.keys(activeParents).forEach(function (path) {
        delete collapsedFolderPaths[path];
      });
      persistCollapsedFolders();
      render();
    }

    function setCollapsedFolders(paths, options) {
      options = options || {};
      collapsedFolderPaths = lookupFromPaths(paths);
      if (options.revealActive !== false) {
        expandParentFolders(selectedPath, false);
      }
      if (options.persist !== false) {
        persistCollapsedFolders();
      }
      render();
    }

    function renderTree(nodes, depth, options) {
      if (!nodes || !nodes.length) {
        return "";
      }

      options = options || {};

      return nodes.map(function (node) {
        var isDirectory = node.kind === "directory";
        var isActive = !isDirectory && node.path === selectedPath;
        var isDirty = !isDirectory && dirtyPaths[node.path];
        var label = escapeHtml(node.name || "");
        var folderPath = normalizeFolderPath(node.path);
        var isCollapsed = isDirectory && !options.forceExpanded && Boolean(collapsedFolderPaths[folderPath]);
        var rowClass = "workspace-tree-item" +
          (isDirectory ? " is-directory" : " is-file") +
          (isDirectory && isCollapsed ? " is-collapsed" : "") +
          (isDirectory && !isCollapsed ? " is-expanded" : "") +
          (isActive ? " is-active" : "") +
          (isDirty ? " is-dirty" : "");
        var style = " style=\"--workspace-tree-depth:" + String(depth || 0) + "\"";
        var dirty = isDirty ? "<span class=\"workspace-dirty\" aria-hidden=\"true\">*</span>" : "";
        var button;

        if (isDirectory) {
          button = "<button type=\"button\" class=\"" + rowClass + "\"" + style +
            " data-workspace-folder-path=\"" + escapeHtml(folderPath) + "\" title=\"" +
            escapeHtml(folderPath) + "\" aria-expanded=\"" + String(!isCollapsed) + "\">" +
            "<span class=\"workspace-disclosure\" aria-hidden=\"true\">" +
            (isCollapsed ? "&#9656;" : "&#9662;") + "</span>" +
            "<span class=\"workspace-tree-label\">" + label + "/</span>" +
            "</button>";
          return button + (isCollapsed ? "" : renderTree(node.children || [], (depth || 0) + 1, options));
        }

        return "<button type=\"button\" class=\"" + rowClass + "\" data-workspace-path=\"" +
          escapeHtml(node.path || "") + "\"" + style + " title=\"" + escapeHtml(node.path || "") + "\">" +
          "<span class=\"workspace-file-dot\" aria-hidden=\"true\"></span>" +
          "<span class=\"workspace-tree-label\">" + label + "</span>" +
          planBadge(node) +
          dirty +
          "</button>";
      }).join("");
    }

    function emptyMessage() {
      if (!state.isSupported) {
        return "<div class=\"workspace-empty\">Folder workspace is supported in Chrome or Edge.<br>You can still open individual Markdown files.</div>";
      }

      if (state.isScanning) {
        return "<div class=\"workspace-empty\">Scanning Markdown files...</div>";
      }

      if (state.error) {
        return "<div class=\"workspace-error\">" + escapeHtml(state.error) + "</div>";
      }

      if (!state.rootName) {
        return "<div class=\"workspace-empty\">No workspace opened</div>" +
          "<button type=\"button\" class=\"file-button workspace-open-inline\" data-workspace-action=\"open\">Open Folder</button>";
      }

      return "<div class=\"workspace-empty\">No Markdown files found in this folder.</div>";
    }

    function renderRestorePrompt() {
      var prompt = state.restorePrompt;

      if (!prompt || !prompt.workspaceName) {
        return "";
      }

      return "<div class=\"workspace-restore-prompt\">" +
        "<div class=\"workspace-restore-title\">Restore previous workspace \"" + escapeHtml(prompt.workspaceName) + "\"?</div>" +
        "<div class=\"workspace-restore-actions\">" +
        "<button type=\"button\" class=\"file-button\" data-workspace-restore=\"restore\">Restore Workspace</button>" +
        "<button type=\"button\" class=\"file-button\" data-workspace-restore=\"different\">Open Different Folder</button>" +
        "<button type=\"button\" class=\"file-button\" data-workspace-restore=\"skip\">Skip</button>" +
        "</div>" +
        "</div>";
    }

    function renderPanelTabs() {
      return "<div class=\"workspace-panel-tabs\" role=\"tablist\" aria-label=\"Workspace views\">" +
        ["files", "search", "related"].map(function (panel) {
          var label = panel.charAt(0).toUpperCase() + panel.slice(1);
          var active = panel === activePanel;

          return "<button type=\"button\" class=\"workspace-panel-tab" + (active ? " is-active" : "") +
            "\" data-workspace-panel=\"" + panel + "\" aria-selected=\"" + String(active) + "\">" + label + "</button>";
        }).join("") +
        "</div>";
    }

    function renderFilesPanel() {
      var isFiltering = Boolean(fileSearchQuery.trim());
      var filteredTree = ME.workspaceStore && ME.workspaceStore.filterTree
        ? ME.workspaceStore.filterTree(state.tree || [], fileSearchQuery)
        : state.tree || [];
      var body = treeHasNodes(filteredTree)
        ? "<div class=\"workspace-tree\" role=\"tree\" data-workspace-root=\"true\">" +
          renderTree(filteredTree, 0, { forceExpanded: isFiltering }) + "</div>"
        : emptyMessage();

      return "<div class=\"workspace-search-wrap\">" +
        "<input class=\"workspace-search workspace-file-search\" type=\"search\" placeholder=\"Search Markdown files...\" value=\"" +
        escapeHtml(fileSearchQuery) + "\" aria-label=\"Search Markdown files\">" +
        "</div>" +
        "<div class=\"workspace-sidebar-body\" data-workspace-root=\"true\">" + body + "</div>";
    }

    function renderSearchResults() {
      var search = state.search || {};

      if (!state.rootName) {
        return "<div class=\"workspace-empty\">Open a workspace to search Markdown content.</div>";
      }
      if (search.error) {
        return "<div class=\"workspace-error\">" + escapeHtml(search.error) + "</div>";
      }
      if (search.isSearching) {
        return "<div class=\"workspace-empty\">Searching Markdown content...</div>";
      }
      if (!contentSearchQuery.trim()) {
        return "<div class=\"workspace-empty\">Search only scans .md and .markdown files in the current workspace.</div>";
      }
      if (!search.results || !search.results.length) {
        return "<div class=\"workspace-empty\">No Markdown matches found.</div>";
      }

      return "<div class=\"workspace-content-results\">" +
        search.results.map(function (result) {
          return "<button type=\"button\" class=\"workspace-content-result\" data-workspace-search-path=\"" +
            escapeHtml(result.path || "") + "\" data-workspace-search-line=\"" + String(result.line || 1) + "\">" +
            "<span class=\"workspace-result-path\">" + escapeHtml(result.path || "") + "</span>" +
            "<span class=\"workspace-result-preview\">line " + String(result.line || 1) + ": " +
            escapeHtml(result.preview || "") + "</span>" +
            "</button>";
        }).join("") +
        (search.limited ? "<div class=\"workspace-search-limit\">Showing first 100 matches.</div>" : "") +
        "</div>";
    }

    function renderSearchPanel() {
      return "<div class=\"workspace-search-wrap\">" +
        "<input class=\"workspace-search workspace-content-search\" type=\"search\" placeholder=\"Search Markdown content...\" value=\"" +
        escapeHtml(contentSearchQuery) + "\" aria-label=\"Search Markdown content\">" +
        "</div>" +
        "<div class=\"workspace-sidebar-body\">" + renderSearchResults() + "</div>";
    }

    function renderRelatedSection(title, items) {
      if (!items || !items.length) {
        return "<section class=\"workspace-related-section\"><h3>" + escapeHtml(title) + "</h3>" +
          "<div class=\"workspace-related-empty\">None</div></section>";
      }

      return "<section class=\"workspace-related-section\"><h3>" + escapeHtml(title) + "</h3>" +
        items.map(function (item) {
          var disabled = item.exists === false;

          return "<button type=\"button\" class=\"workspace-related-item" + (disabled ? " is-missing" : "") +
            "\" data-workspace-related-path=\"" + escapeHtml(item.path || "") + "\"" +
            (disabled ? " disabled" : "") + " title=\"" + escapeHtml(item.path || "") + "\">" +
            "<span>" + escapeHtml(item.name || pathName(item.path)) + "</span>" +
            (disabled ? "<span class=\"workspace-related-status\">not found</span>" : planBadge(item)) +
            "</button>";
        }).join("") +
        "</section>";
    }

    function renderRelatedPanel() {
      var related = state.related || {};
      var hasRelated;

      if (!state.rootName) {
        return "<div class=\"workspace-sidebar-body\"><div class=\"workspace-empty\">Open a workspace to see related Markdown files.</div></div>";
      }
      if (!related.activePath) {
        return "<div class=\"workspace-sidebar-body\"><div class=\"workspace-empty\">Open a workspace Markdown file to see related files.</div></div>";
      }

      hasRelated = (related.sameFolder && related.sameFolder.length) ||
        (related.linked && related.linked.length) ||
        (related.recent && related.recent.length) ||
        (related.plans && related.plans.length);
      if (!hasRelated) {
        return "<div class=\"workspace-sidebar-body\"><div class=\"workspace-related-current\"><span>Related to:</span><strong title=\"" +
          escapeHtml(related.activePath || "") + "\">" + escapeHtml(related.activePath || "") + "</strong></div>" +
          "<div class=\"workspace-empty\">No related Markdown files found.</div></div>";
      }

      return "<div class=\"workspace-sidebar-body\">" +
        "<div class=\"workspace-related-current\"><span>Related to:</span><strong title=\"" +
        escapeHtml(related.activePath || "") + "\">" + escapeHtml(related.activePath || "") + "</strong></div>" +
        renderRelatedSection("Same folder", related.sameFolder) +
        renderRelatedSection("Linked files", related.linked) +
        renderRelatedSection("Recently opened", related.recent) +
        renderRelatedSection("Plans", related.plans) +
        "</div>";
    }

    function renderContextMenu() {
      var actions;

      if (!contextMenu) {
        return "";
      }

      actions = contextMenu.kind === "file"
        ? [
          ["open", "Open"],
          ["rename", "Rename"],
          ["duplicate", "Duplicate"],
          ["copy-path", "Copy Relative Path"],
          ["reveal", "Reveal in Workspace"]
        ]
        : [
          ["new-file", "New Markdown File"],
          ["new-folder", "New Folder"],
          ["refresh", "Refresh"]
        ];

      return "<div class=\"workspace-context-menu\" style=\"left:" + String(contextMenu.x) + "px;top:" +
        String(contextMenu.y) + "px\" role=\"menu\">" +
        actions.map(function (action) {
          return "<button type=\"button\" role=\"menuitem\" data-workspace-context-action=\"" +
            action[0] + "\">" + action[1] + "</button>";
        }).join("") +
        "</div>";
    }

    function renderExpanded() {
      var panelHtml = activePanel === PANELS.SEARCH
        ? renderSearchPanel()
        : activePanel === PANELS.RELATED
          ? renderRelatedPanel()
          : renderFilesPanel();

      rootElement.innerHTML =
        "<div class=\"workspace-sidebar-header\">" +
        "<div class=\"workspace-sidebar-title-group\">" +
        "<div class=\"workspace-sidebar-title\">Workspace</div>" +
        "<div class=\"workspace-sidebar-root\" data-workspace-root=\"true\" title=\"" + escapeHtml(state.rootName || "") + "\">" +
        escapeHtml(state.rootName || "No folder") +
        "</div>" +
        "</div>" +
        "<div class=\"workspace-sidebar-actions\">" +
        "<button type=\"button\" class=\"workspace-sidebar-icon\" data-workspace-action=\"minimize\" title=\"Minimize sidebar\" aria-label=\"Minimize sidebar\">-</button>" +
        "<button type=\"button\" class=\"workspace-sidebar-icon\" data-workspace-action=\"hide\" title=\"Hide sidebar\" aria-label=\"Hide sidebar\">x</button>" +
        "</div>" +
        "</div>" +
        renderRestorePrompt() +
        renderPanelTabs() +
        panelHtml +
        renderContextMenu();
    }

    function renderMinimized() {
      rootElement.innerHTML =
        "<button type=\"button\" class=\"workspace-minimized-button\" data-workspace-action=\"expand\" title=\"Show workspace sidebar\" aria-label=\"Show workspace sidebar\">" +
        "<span aria-hidden=\"true\">|</span>" +
        "<span aria-hidden=\"true\">[]</span>" +
        "<span aria-hidden=\"true\">&gt;</span>" +
        "</button>";
    }

    function render() {
      applyModeClasses();
      setGridWidth(width);

      if (mode === SIDEBAR_MODES.HIDDEN) {
        rootElement.innerHTML = "";
        return;
      }

      if (mode === SIDEBAR_MODES.MINIMIZED) {
        renderMinimized();
        return;
      }

      renderExpanded();
    }

    function setMode(nextMode) {
      mode = normalizeMode(nextMode);
      writeStorage(storage, MODE_STORAGE_KEY, mode);
      render();
    }

    function setPanel(nextPanel) {
      activePanel = normalizePanel(nextPanel);
      writeStorage(storage, PANEL_STORAGE_KEY, activePanel);
      contextMenu = null;
      render();
    }

    function setWorkspaceState(nextState) {
      var previousRootName = state.rootName;
      var previousSearch = state.search;
      var previousRelated = state.related;

      state = {
        directories: nextState && nextState.directories ? nextState.directories : [],
        error: nextState && nextState.error ? nextState.error : "",
        files: nextState && nextState.files ? nextState.files : [],
        isScanning: Boolean(nextState && nextState.isScanning),
        isSupported: nextState ? nextState.isSupported !== false : true,
        restorePrompt: nextState && nextState.restorePrompt ? nextState.restorePrompt : null,
        rootName: nextState && nextState.rootName ? nextState.rootName : "",
        search: nextState && nextState.search ? nextState.search : previousSearch,
        related: nextState && nextState.related ? nextState.related : previousRelated,
        tree: nextState && nextState.tree ? nextState.tree : null
      };
      if (state.rootName !== previousRootName) {
        loadCollapsedFolders(state.rootName);
      }
      expandParentFolders(selectedPath, true);
      render();
    }

    function setSelection(path) {
      selectedPath = path || "";
      expandParentFolders(selectedPath, true);
      render();
    }

    function setDirtyPaths(paths) {
      dirtyPaths = createDirtyLookup(paths);
      render();
    }

    function update(nextState) {
      nextState = nextState || {};
      if (Object.prototype.hasOwnProperty.call(nextState, "workspaceState")) {
        var previousRootName = state.rootName;
        var previousSearch = state.search;
        var previousRelated = state.related;

        state = {
          directories: nextState.workspaceState && nextState.workspaceState.directories ? nextState.workspaceState.directories : [],
          error: nextState.workspaceState && nextState.workspaceState.error ? nextState.workspaceState.error : "",
          files: nextState.workspaceState && nextState.workspaceState.files ? nextState.workspaceState.files : [],
          isScanning: Boolean(nextState.workspaceState && nextState.workspaceState.isScanning),
          isSupported: nextState.workspaceState ? nextState.workspaceState.isSupported !== false : true,
          restorePrompt: nextState.workspaceState && nextState.workspaceState.restorePrompt ? nextState.workspaceState.restorePrompt : null,
          rootName: nextState.workspaceState && nextState.workspaceState.rootName ? nextState.workspaceState.rootName : "",
          search: nextState.workspaceState && nextState.workspaceState.search ? nextState.workspaceState.search : previousSearch,
          related: nextState.workspaceState && nextState.workspaceState.related ? nextState.workspaceState.related : previousRelated,
          tree: nextState.workspaceState && nextState.workspaceState.tree ? nextState.workspaceState.tree : null
        };
        if (state.rootName !== previousRootName) {
          loadCollapsedFolders(state.rootName);
        }
      }
      if (Object.prototype.hasOwnProperty.call(nextState, "selectedPath")) {
        selectedPath = nextState.selectedPath || "";
      }
      expandParentFolders(selectedPath, true);
      if (Object.prototype.hasOwnProperty.call(nextState, "dirtyPaths")) {
        dirtyPaths = createDirtyLookup(nextState.dirtyPaths);
      }
      render();
    }

    function handleClick(event) {
      var actionElement = event.target.closest("[data-workspace-action]");
      var restoreElement = event.target.closest("[data-workspace-restore]");
      var panelElement = event.target.closest("[data-workspace-panel]");
      var contextActionElement = event.target.closest("[data-workspace-context-action]");
      var searchResultElement = event.target.closest("[data-workspace-search-path]");
      var relatedElement = event.target.closest("[data-workspace-related-path]");
      var folderElement;
      var fileElement;
      var action;

      if (contextActionElement && rootElement.contains(contextActionElement) && contextMenu) {
        action = contextActionElement.getAttribute("data-workspace-context-action");
        onContextAction(action, {
          kind: contextMenu.kind,
          name: contextMenu.name,
          path: contextMenu.path
        });
        contextMenu = null;
        render();
        return;
      }

      contextMenu = null;

      if (restoreElement && rootElement.contains(restoreElement)) {
        onRestoreAction(restoreElement.getAttribute("data-workspace-restore"));
        render();
        return;
      }

      if (panelElement && rootElement.contains(panelElement)) {
        setPanel(panelElement.getAttribute("data-workspace-panel"));
        return;
      }

      if (actionElement && rootElement.contains(actionElement)) {
        action = actionElement.getAttribute("data-workspace-action");
        if (action === "expand") {
          setMode(SIDEBAR_MODES.EXPANDED);
        } else if (action === "hide") {
          setMode(SIDEBAR_MODES.HIDDEN);
        } else if (action === "minimize") {
          setMode(SIDEBAR_MODES.MINIMIZED);
        } else if (action === "open") {
          onOpenFolder();
        } else if (action === "refresh") {
          onRefresh();
        } else if (action === "close") {
          onClose();
        }
        return;
      }

      if (searchResultElement && rootElement.contains(searchResultElement)) {
        onOpenFile(searchResultElement.getAttribute("data-workspace-search-path"), {
          line: Number(searchResultElement.getAttribute("data-workspace-search-line")) || 1
        });
        return;
      }

      if (relatedElement && rootElement.contains(relatedElement)) {
        onOpenFile(relatedElement.getAttribute("data-workspace-related-path"));
        return;
      }

      folderElement = event.target.closest("[data-workspace-folder-path]");
      if (folderElement && rootElement.contains(folderElement)) {
        toggleFolder(folderElement.getAttribute("data-workspace-folder-path"));
        return;
      }

      fileElement = event.target.closest("[data-workspace-path]");
      if (fileElement && rootElement.contains(fileElement)) {
        onOpenFile(fileElement.getAttribute("data-workspace-path"));
      }
    }

    function handleInput(event) {
      var nextInput;
      var selectionEnd;

      if (!event.target.classList) {
        return;
      }

      if (event.target.classList.contains("workspace-file-search")) {
        fileSearchQuery = event.target.value || "";
        selectionEnd = event.target.selectionEnd;
        render();
        nextInput = rootElement.querySelector(".workspace-file-search");
        if (nextInput) {
          nextInput.focus();
          nextInput.selectionStart = typeof selectionEnd === "number" ? selectionEnd : fileSearchQuery.length;
          nextInput.selectionEnd = typeof selectionEnd === "number" ? selectionEnd : fileSearchQuery.length;
        }
        return;
      }

      if (event.target.classList.contains("workspace-content-search")) {
        contentSearchQuery = event.target.value || "";
        selectionEnd = event.target.selectionEnd;
        state.search = {
          error: "",
          isSearching: Boolean(contentSearchQuery.trim()),
          limited: false,
          query: contentSearchQuery,
          results: []
        };
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(function () {
          onSearchContent(contentSearchQuery);
        }, 250);
        render();
        nextInput = rootElement.querySelector(".workspace-content-search");
        if (nextInput) {
          nextInput.focus();
          nextInput.selectionStart = typeof selectionEnd === "number" ? selectionEnd : contentSearchQuery.length;
          nextInput.selectionEnd = typeof selectionEnd === "number" ? selectionEnd : contentSearchQuery.length;
        }
      }
    }

    function handleContextMenu(event) {
      var fileElement = event.target.closest("[data-workspace-path]");
      var folderElement = event.target.closest("[data-workspace-folder-path]");
      var rootContext = event.target.closest("[data-workspace-root]");

      if (!rootElement.contains(event.target) || !state.rootName) {
        return;
      }

      if (!fileElement && !folderElement && !rootContext) {
        return;
      }

      event.preventDefault();
      if (fileElement) {
        contextMenu = {
          kind: "file",
          name: pathName(fileElement.getAttribute("data-workspace-path")),
          path: fileElement.getAttribute("data-workspace-path"),
          x: event.clientX,
          y: event.clientY
        };
      } else {
        contextMenu = {
          kind: "directory",
          name: folderElement ? pathName(folderElement.getAttribute("data-workspace-folder-path")) : state.rootName,
          path: folderElement ? folderElement.getAttribute("data-workspace-folder-path") : "",
          x: event.clientX,
          y: event.clientY
        };
      }
      render();
    }

    function widthFromPointer(clientX) {
      var rect = workspaceElement.getBoundingClientRect();

      return clientX - rect.left;
    }

    function stopResize(event) {
      if (!resizerElement || activePointerId === null) {
        return;
      }

      activePointerId = null;
      resizerElement.classList.remove("is-dragging");
      document.body.classList.remove("is-resizing-workspace-sidebar");
      writeStorage(storage, WIDTH_STORAGE_KEY, width);

      if (event && resizerElement.hasPointerCapture && resizerElement.hasPointerCapture(event.pointerId)) {
        resizerElement.releasePointerCapture(event.pointerId);
      }
    }

    function bindResizeEvents() {
      if (!resizerElement || !workspaceElement) {
        return;
      }

      resizerElement.addEventListener("pointerdown", function (event) {
        if (mode !== SIDEBAR_MODES.EXPANDED) {
          return;
        }

        event.preventDefault();
        activePointerId = event.pointerId;
        setGridWidth(widthFromPointer(event.clientX));
        resizerElement.classList.add("is-dragging");
        document.body.classList.add("is-resizing-workspace-sidebar");

        if (resizerElement.setPointerCapture) {
          resizerElement.setPointerCapture(event.pointerId);
        }
      });

      resizerElement.addEventListener("pointermove", function (event) {
        if (activePointerId === null) {
          return;
        }

        event.preventDefault();
        setGridWidth(widthFromPointer(event.clientX));
      });

      resizerElement.addEventListener("pointerup", stopResize);
      resizerElement.addEventListener("pointercancel", stopResize);
      resizerElement.addEventListener("dblclick", function (event) {
        event.preventDefault();
        setGridWidth(DEFAULT_WIDTH);
        writeStorage(storage, WIDTH_STORAGE_KEY, width);
      });

      window.addEventListener("resize", function () {
        setGridWidth(width);
      });
    }

    function bindEvents() {
      rootElement.addEventListener("click", handleClick);
      rootElement.addEventListener("input", handleInput);
      rootElement.addEventListener("contextmenu", handleContextMenu);
      document.addEventListener("click", function (event) {
        if (contextMenu && !rootElement.contains(event.target)) {
          contextMenu = null;
          render();
        }
      });
      bindResizeEvents();
      render();
    }

    return {
      bindEvents: bindEvents,
      getMode: function () {
        return mode;
      },
      getWidth: function () {
        return width;
      },
      collapseAllFolders: collapseAllFolders,
      expandAllFolders: expandAllFolders,
      getCollapsedFolders: function () {
        return pathsFromLookup(collapsedFolderPaths);
      },
      revealFile: function (path) {
        selectedPath = path || selectedPath;
        activePanel = PANELS.FILES;
        fileSearchQuery = "";
        writeStorage(storage, PANEL_STORAGE_KEY, activePanel);
        expandParentFolders(selectedPath, true);
        render();
      },
      setDirtyPaths: setDirtyPaths,
      setCollapsedFolders: setCollapsedFolders,
      setMode: setMode,
      setPanel: setPanel,
      setSelection: setSelection,
      setWorkspaceState: setWorkspaceState,
      update: update
    };
  }

  ME.workspaceSidebar = {
    DEFAULT_WIDTH: DEFAULT_WIDTH,
    COLLAPSED_FOLDERS_STORAGE_KEY: COLLAPSED_FOLDERS_STORAGE_KEY,
    MINIMIZED_WIDTH: MINIMIZED_WIDTH,
    MIN_WIDTH: MIN_WIDTH,
    MODE_STORAGE_KEY: MODE_STORAGE_KEY,
    PANEL_STORAGE_KEY: PANEL_STORAGE_KEY,
    WIDTH_STORAGE_KEY: WIDTH_STORAGE_KEY,
    create: createSidebar,
    normalizeMode: normalizeMode,
    normalizePanel: normalizePanel,
    normalizeWidth: normalizeWidth
  };
}());
