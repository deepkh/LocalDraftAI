(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var escapeHtml = ME.utils.escapeHtml;
  var clamp = ME.utils.clamp;

  var MODE_STORAGE_KEY = "localdraftai.workspaceSidebar.mode";
  var WIDTH_STORAGE_KEY = "localdraftai.workspaceSidebar.width";
  var SIDEBAR_MODES = {
    EXPANDED: "expanded",
    HIDDEN: "hidden",
    MINIMIZED: "minimized"
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

  function normalizeMode(mode) {
    if (mode === SIDEBAR_MODES.EXPANDED) {
      return mode;
    }
    if (mode === SIDEBAR_MODES.HIDDEN || mode === SIDEBAR_MODES.MINIMIZED) {
      return mode;
    }

    return SIDEBAR_MODES.HIDDEN;
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

  function createSidebar(context) {
    var rootElement = context.rootElement;
    var resizerElement = context.resizerElement;
    var workspaceElement = context.workspaceElement || (rootElement && rootElement.parentElement);
    var storage = context.storage || window.localStorage;
    var onOpenFile = context.onOpenFile || function () {};
    var onOpenFolder = context.onOpenFolder || function () {};
    var onRefresh = context.onRefresh || function () {};
    var onClose = context.onClose || function () {};
    var state = {
      error: "",
      files: [],
      isScanning: false,
      isSupported: true,
      rootName: "",
      tree: null
    };
    var selectedPath = "";
    var dirtyPaths = {};
    var searchQuery = "";
    var mode = normalizeMode(readStorage(storage, MODE_STORAGE_KEY));
    var width = normalizeWidth(readStorage(storage, WIDTH_STORAGE_KEY));
    var activePointerId = null;

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

    function renderTree(nodes, depth) {
      if (!nodes || !nodes.length) {
        return "";
      }

      return nodes.map(function (node) {
        var isDirectory = node.kind === "directory";
        var isActive = !isDirectory && node.path === selectedPath;
        var isDirty = !isDirectory && dirtyPaths[node.path];
        var label = escapeHtml(node.name || "");
        var rowClass = "workspace-tree-item" +
          (isDirectory ? " is-directory" : " is-file") +
          (isActive ? " is-active" : "") +
          (isDirty ? " is-dirty" : "");
        var style = " style=\"--workspace-tree-depth:" + String(depth || 0) + "\"";
        var dirty = isDirty ? "<span class=\"workspace-dirty\" aria-hidden=\"true\">*</span>" : "";
        var button;

        if (isDirectory) {
          button = "<div class=\"" + rowClass + "\"" + style + ">" +
            "<span class=\"workspace-disclosure\" aria-hidden=\"true\">v</span>" +
            "<span class=\"workspace-tree-label\">" + label + "</span>" +
            "</div>";
          return button + renderTree(node.children || [], (depth || 0) + 1);
        }

        return "<button type=\"button\" class=\"" + rowClass + "\" data-workspace-path=\"" +
          escapeHtml(node.path || "") + "\"" + style + " title=\"" + escapeHtml(node.path || "") + "\">" +
          "<span class=\"workspace-file-dot\" aria-hidden=\"true\"></span>" +
          "<span class=\"workspace-tree-label\">" + label + "</span>" +
          dirty +
          "</button>";
      }).join("");
    }

    function emptyMessage() {
      if (!state.isSupported) {
        return "<div class=\"workspace-empty\">Folder workspace is supported in Chrome / Edge.<br>You can still open individual Markdown files.</div>";
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

    function renderExpanded() {
      var filteredTree = ME.workspaceStore && ME.workspaceStore.filterTree
        ? ME.workspaceStore.filterTree(state.tree || [], searchQuery)
        : state.tree || [];
      var body = treeHasNodes(filteredTree)
        ? "<div class=\"workspace-tree\" role=\"tree\">" + renderTree(filteredTree, 0) + "</div>"
        : emptyMessage();

      rootElement.innerHTML =
        "<div class=\"workspace-sidebar-header\">" +
        "<div class=\"workspace-sidebar-title-group\">" +
        "<div class=\"workspace-sidebar-title\">Workspace</div>" +
        "<div class=\"workspace-sidebar-root\" title=\"" + escapeHtml(state.rootName || "") + "\">" +
        escapeHtml(state.rootName || "No folder") +
        "</div>" +
        "</div>" +
        "<div class=\"workspace-sidebar-actions\">" +
        "<button type=\"button\" class=\"workspace-sidebar-icon\" data-workspace-action=\"minimize\" title=\"Minimize sidebar\" aria-label=\"Minimize sidebar\">-</button>" +
        "<button type=\"button\" class=\"workspace-sidebar-icon\" data-workspace-action=\"hide\" title=\"Hide sidebar\" aria-label=\"Hide sidebar\">x</button>" +
        "</div>" +
        "</div>" +
        "<div class=\"workspace-search-wrap\">" +
        "<input class=\"workspace-search\" type=\"search\" placeholder=\"Search Markdown files...\" value=\"" + escapeHtml(searchQuery) + "\" aria-label=\"Search Markdown files\">" +
        "</div>" +
        "<div class=\"workspace-sidebar-body\">" + body + "</div>";
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

    function setWorkspaceState(nextState) {
      state = {
        error: nextState && nextState.error ? nextState.error : "",
        files: nextState && nextState.files ? nextState.files : [],
        isScanning: Boolean(nextState && nextState.isScanning),
        isSupported: nextState ? nextState.isSupported !== false : true,
        rootName: nextState && nextState.rootName ? nextState.rootName : "",
        tree: nextState && nextState.tree ? nextState.tree : null
      };
      render();
    }

    function setSelection(path) {
      selectedPath = path || "";
      render();
    }

    function setDirtyPaths(paths) {
      dirtyPaths = createDirtyLookup(paths);
      render();
    }

    function update(nextState) {
      nextState = nextState || {};
      if (Object.prototype.hasOwnProperty.call(nextState, "workspaceState")) {
        state = {
          error: nextState.workspaceState && nextState.workspaceState.error ? nextState.workspaceState.error : "",
          files: nextState.workspaceState && nextState.workspaceState.files ? nextState.workspaceState.files : [],
          isScanning: Boolean(nextState.workspaceState && nextState.workspaceState.isScanning),
          isSupported: nextState.workspaceState ? nextState.workspaceState.isSupported !== false : true,
          rootName: nextState.workspaceState && nextState.workspaceState.rootName ? nextState.workspaceState.rootName : "",
          tree: nextState.workspaceState && nextState.workspaceState.tree ? nextState.workspaceState.tree : null
        };
      }
      if (Object.prototype.hasOwnProperty.call(nextState, "selectedPath")) {
        selectedPath = nextState.selectedPath || "";
      }
      if (Object.prototype.hasOwnProperty.call(nextState, "dirtyPaths")) {
        dirtyPaths = createDirtyLookup(nextState.dirtyPaths);
      }
      render();
    }

    function handleClick(event) {
      var actionElement = event.target.closest("[data-workspace-action]");
      var fileElement;
      var action;

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

      fileElement = event.target.closest("[data-workspace-path]");
      if (fileElement && rootElement.contains(fileElement)) {
        onOpenFile(fileElement.getAttribute("data-workspace-path"));
      }
    }

    function handleInput(event) {
      var nextInput;
      var selectionEnd;

      if (!event.target.classList || !event.target.classList.contains("workspace-search")) {
        return;
      }

      searchQuery = event.target.value || "";
      selectionEnd = event.target.selectionEnd;
      render();
      nextInput = rootElement.querySelector(".workspace-search");
      if (nextInput) {
        nextInput.focus();
        nextInput.selectionStart = typeof selectionEnd === "number" ? selectionEnd : searchQuery.length;
        nextInput.selectionEnd = typeof selectionEnd === "number" ? selectionEnd : searchQuery.length;
      }
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
      setDirtyPaths: setDirtyPaths,
      setMode: setMode,
      setSelection: setSelection,
      setWorkspaceState: setWorkspaceState,
      update: update
    };
  }

  ME.workspaceSidebar = {
    DEFAULT_WIDTH: DEFAULT_WIDTH,
    MINIMIZED_WIDTH: MINIMIZED_WIDTH,
    MIN_WIDTH: MIN_WIDTH,
    MODE_STORAGE_KEY: MODE_STORAGE_KEY,
    WIDTH_STORAGE_KEY: WIDTH_STORAGE_KEY,
    create: createSidebar,
    normalizeMode: normalizeMode,
    normalizeWidth: normalizeWidth
  };
}());
