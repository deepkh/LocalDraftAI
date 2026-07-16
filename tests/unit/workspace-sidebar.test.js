const assert = require("node:assert/strict");

function createStorage(initial) {
  const values = Object.assign({}, initial || {});

  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem(key, value) {
      values[key] = String(value);
    },
    values
  };
}

function createClassList() {
  const names = new Set();

  return {
    add(name) {
      names.add(name);
    },
    remove(name) {
      names.delete(name);
    },
    toggle(name, enabled) {
      if (enabled) {
        names.add(name);
      } else {
        names.delete(name);
      }
    },
    contains(name) {
      return names.has(name);
    }
  };
}

function createElement() {
  const listeners = {};
  let html = "";
  const element = {
    get innerHTML() {
      return html;
    },
    set innerHTML(value) {
      html = String(value || "");
      if (element.sidebarBody) {
        element.sidebarBody.scrollLeft = 0;
        element.sidebarBody.scrollTop = 0;
      }
    },

    classList: createClassList(),
    hidden: false,
    listeners,
    activeFile: null,
    parentElement: null,
    sidebarBody: null,
    style: {
      values: {},
      setProperty(name, value) {
        this.values[name] = value;
      }
    },
    addEventListener(name, callback) {
      listeners[name] = listeners[name] || [];
      listeners[name].push(callback);
    },
    contains() {
      return true;
    },
    dispatch(name, event) {
      (listeners[name] || []).forEach(function (callback) {
        callback(event || {});
      });
    },
    querySelector(selector) {
      if (selector === ".workspace-sidebar-body") {
        return this.sidebarBody;
      }
      if (selector === ".workspace-tree-item.is-file.is-active") {
        return this.activeFile;
      }
      return null;
    },
    setAttribute() {}
  };

  return element;
}

function createFolderClickTarget(path) {
  const folderElement = {
    getAttribute(name) {
      return name === "data-workspace-folder-path" ? path : "";
    }
  };

  return {
    closest(selector) {
      return selector === "[data-workspace-folder-path]" ? folderElement : null;
    }
  };
}

function createFileSearchInput(value) {
  return {
    classList: {
      contains(name) {
        return name === "workspace-file-search";
      }
    },
    selectionEnd: value.length,
    value
  };
}

function createContextTarget(kind, path) {
  const targetElement = {
    getAttribute(name) {
      if (name === "data-workspace-path" || name === "data-workspace-folder-path") {
        return path;
      }
      return "";
    }
  };

  return {
    closest(selector) {
      if (kind === "file" && selector === "[data-workspace-path]") {
        return targetElement;
      }
      if (kind === "directory" && selector === "[data-workspace-folder-path]") {
        return targetElement;
      }
      return null;
    }
  };
}

function createContextActionTarget(action) {
  const actionElement = {
    getAttribute(name) {
      return name === "data-workspace-context-action" ? action : "";
    }
  };

  return {
    closest(selector) {
      return selector === "[data-workspace-context-action]" ? actionElement : null;
    }
  };
}

global.window = {
  innerWidth: 1200,
  addEventListener() {},
  localStorage: createStorage()
};

global.document = {
  addEventListener() {},
  body: createElement(),
  documentElement: createElement()
};

require("../../src/js/utils.js");
require("../../src/js/document-type.js");
require("../../src/js/workspace-store.js");
require("../../src/js/workspace-sidebar.js");

const workspaceStore = window.MarkdownEditor.workspaceStore;
const workspaceSidebar = window.MarkdownEditor.workspaceSidebar;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

function createSidebar(storage, options) {
  const root = createElement();
  const workspace = createElement();
  const contextActions = [];
  const folderChanges = [];
  const scrollChanges = [];

  options = options || {};
  storage.values[workspaceSidebar.MODE_STORAGE_KEY] = "expanded";
  const sidebar = workspaceSidebar.create({
    rootElement: root,
    storage,
    workspaceElement: workspace,
    onContextAction(action, target) {
      contextActions.push({ action, target });
    },
    onFolderStateChange(paths) {
      folderChanges.push(paths);
    },
    onScrollStateChange(scrollState) {
      scrollChanges.push(scrollState);
    }
  });

  sidebar.bindEvents();
  sidebar.update({
    workspaceState: {
      rootName: "Project",
      tree: options.tree || workspaceStore.buildTree([
        { name: "ai-agent.md", path: "docs/ai-agent.md" },
        { name: "archive.md", path: "docs/archive/archive.md" },
        { name: "plan.md", path: "plans/plan.md" },
        { name: "README.md", path: "README.md" }
      ]),
      capabilities: options.capabilities || {}
    }
  });

  return { contextActions, folderChanges, root, scrollChanges, sidebar };
}

runTest("omits an internal header and duplicate controls from every primary sidebar view", function () {
  const storage = createStorage();
  const view = createSidebar(storage);

  ["files", "search", "related"].forEach(function (panel) {
    view.sidebar.setPanel(panel);
    assert.doesNotMatch(view.root.innerHTML, /workspace-sidebar-header|workspace-sidebar-root/);
    assert.doesNotMatch(view.root.innerHTML, /workspace-sidebar-title|workspace-sidebar-actions|workspace-sidebar-icon/);
    assert.doesNotMatch(view.root.innerHTML, /data-workspace-action="(?:hide|minimize)"|Hide sidebar|>Workspace</);
  });
});

runTest("leaves Files, Search, and Related navigation to the Activity Bar", function () {
  const storage = createStorage();
  const view = createSidebar(storage);

  assert.doesNotMatch(view.root.innerHTML, /workspace-panel-tabs|data-workspace-panel/);
  assert.match(view.root.innerHTML, /workspace-file-search/);

  view.sidebar.setPanel("search");
  assert.doesNotMatch(view.root.innerHTML, /workspace-panel-tabs|data-workspace-panel/);
  assert.match(view.root.innerHTML, /workspace-content-search/);

  view.sidebar.setPanel("related");
  assert.doesNotMatch(view.root.innerHTML, /workspace-panel-tabs|data-workspace-panel/);
  assert.match(view.root.innerHTML, /Open a workspace file to see related files/);
});

runTest("collapses folders and persists relative paths per workspace", function () {
  const storage = createStorage();
  const view = createSidebar(storage);

  view.root.dispatch("click", {
    target: createFolderClickTarget("docs")
  });

  assert.deepEqual(view.sidebar.getCollapsedFolders(), ["docs"]);
  assert.match(view.root.innerHTML, /docs\//);
  assert.doesNotMatch(view.root.innerHTML, /ai-agent\.md/);
  assert.deepEqual(JSON.parse(storage.values[workspaceSidebar.COLLAPSED_FOLDERS_STORAGE_KEY]), {
    Project: ["docs"]
  });
});

runTest("restores collapsed folders when the same workspace opens again", function () {
  const storage = createStorage({
    [workspaceSidebar.COLLAPSED_FOLDERS_STORAGE_KEY]: JSON.stringify({
      Project: ["docs"]
    })
  });
  const view = createSidebar(storage);

  assert.deepEqual(view.sidebar.getCollapsedFolders(), ["docs"]);
  assert.doesNotMatch(view.root.innerHTML, /ai-agent\.md/);
});

runTest("folder click preserves the sidebar scroll position", function () {
  const storage = createStorage();
  const view = createSidebar(storage);

  view.root.sidebarBody = {
    scrollLeft: 0,
    scrollTop: 180
  };
  view.root.dispatch("click", {
    target: createFolderClickTarget("docs")
  });

  assert.equal(view.root.sidebarBody.scrollTop, 180);
});

runTest("file selection updates preserve the sidebar scroll position", function () {
  const storage = createStorage();
  const view = createSidebar(storage);

  view.root.sidebarBody = {
    scrollLeft: 0,
    scrollTop: 220
  };
  view.sidebar.update({
    selectedPath: "docs/ai-agent.md"
  });

  assert.equal(view.root.sidebarBody.scrollTop, 220);
});

runTest("reports and restores sidebar scroll state for workspace restore", function () {
  const storage = createStorage();
  const view = createSidebar(storage);

  view.root.sidebarBody = {
    scrollLeft: 3,
    scrollTop: 260
  };
  assert.deepEqual(view.sidebar.getScrollState(), {
    panel: "files",
    scrollLeft: 3,
    scrollTop: 260
  });

  view.root.sidebarBody.scrollTop = 0;
  view.root.sidebarBody.scrollLeft = 0;
  view.sidebar.setScrollState({
    panel: "files",
    scrollLeft: 3,
    scrollTop: 260
  });

  assert.equal(view.root.sidebarBody.scrollTop, 260);
  assert.equal(view.root.sidebarBody.scrollLeft, 3);
});

runTest("sidebar scroll changes can trigger workspace session saves", function () {
  const storage = createStorage();
  const view = createSidebar(storage);

  view.root.sidebarBody = {
    scrollLeft: 0,
    scrollTop: 140
  };
  view.root.dispatch("scroll", {
    target: view.root.sidebarBody
  });

  assert.deepEqual(view.scrollChanges[0], {
    panel: "files",
    scrollLeft: 0,
    scrollTop: 140
  });
});

runTest("applies collapsed folders from restored workspace session metadata", function () {
  const storage = createStorage();
  const view = createSidebar(storage);

  view.sidebar.setCollapsedFolders(["docs/archive", "plans"]);

  assert.deepEqual(view.sidebar.getCollapsedFolders(), ["docs/archive", "plans"]);
  assert.match(view.root.innerHTML, /ai-agent\.md/);
  assert.doesNotMatch(view.root.innerHTML, /archive\.md/);
  assert.doesNotMatch(view.root.innerHTML, /plan\.md/);
  assert.deepEqual(JSON.parse(storage.values[workspaceSidebar.COLLAPSED_FOLDERS_STORAGE_KEY]), {
    Project: ["docs/archive", "plans"]
  });
  assert.deepEqual(view.folderChanges[view.folderChanges.length - 1], ["docs/archive", "plans"]);
});

runTest("restored collapsed folders still reveal active file parents", function () {
  const storage = createStorage();
  const view = createSidebar(storage);

  view.sidebar.revealFile("docs/archive/archive.md");
  view.sidebar.setCollapsedFolders(["docs", "docs/archive", "plans"]);

  assert.deepEqual(view.sidebar.getCollapsedFolders(), ["plans"]);
  assert.match(view.root.innerHTML, /archive\.md/);
  assert.doesNotMatch(view.root.innerHTML, /plan\.md/);
});

runTest("revealing the active file expands collapsed parent folders", function () {
  const storage = createStorage({
    [workspaceSidebar.COLLAPSED_FOLDERS_STORAGE_KEY]: JSON.stringify({
      Project: ["docs", "docs/archive"]
    })
  });
  const view = createSidebar(storage);

  view.sidebar.revealFile("docs/archive/archive.md");

  assert.deepEqual(view.sidebar.getCollapsedFolders(), []);
  assert.match(view.root.innerHTML, /archive\.md/);
  assert.deepEqual(JSON.parse(storage.values[workspaceSidebar.COLLAPSED_FOLDERS_STORAGE_KEY]), {
    Project: []
  });
});

runTest("revealing a selected file scrolls its active Explorer row into view", function () {
  const storage = createStorage();
  const view = createSidebar(storage);
  const calls = [];

  view.root.activeFile = {
    getAttribute(name) {
      return name === "data-workspace-path" ? "docs/archive/archive.md" : "";
    },
    scrollIntoView(options) {
      calls.push(options);
    }
  };
  view.sidebar.revealSelection("docs/archive/archive.md");

  assert.deepEqual(calls, [{
    block: "nearest",
    inline: "nearest"
  }]);
});

runTest("selected-file reveal waits for Files without switching away from another view", function () {
  const storage = createStorage();
  const view = createSidebar(storage);
  const calls = [];

  view.sidebar.setPanel("search");
  view.root.activeFile = {
    getAttribute(name) {
      return name === "data-workspace-path" ? "docs/ai-agent.md" : "";
    },
    scrollIntoView(options) {
      calls.push(options);
    }
  };
  view.sidebar.revealSelection("docs/ai-agent.md");

  assert.equal(view.sidebar.getPanel(), "search");
  assert.deepEqual(calls, []);

  view.sidebar.setPanel("files");

  assert.deepEqual(calls, [{
    block: "nearest",
    inline: "nearest"
  }]);
});

runTest("file filtering temporarily expands matched collapsed folders", function () {
  const storage = createStorage();
  const view = createSidebar(storage);

  view.root.dispatch("click", {
    target: createFolderClickTarget("docs")
  });
  view.root.dispatch("input", {
    target: createFileSearchInput("agent")
  });

  assert.deepEqual(view.sidebar.getCollapsedFolders(), ["docs"]);
  assert.match(view.root.innerHTML, /ai-agent\.md/);
  assert.deepEqual(JSON.parse(storage.values[workspaceSidebar.COLLAPSED_FOLDERS_STORAGE_KEY]), {
    Project: ["docs"]
  });

  view.root.dispatch("input", {
    target: createFileSearchInput("")
  });

  assert.doesNotMatch(view.root.innerHTML, /ai-agent\.md/);
  assert.deepEqual(view.sidebar.getCollapsedFolders(), ["docs"]);
});

runTest("collapse all keeps active file parent folders expanded", function () {
  const storage = createStorage();
  const view = createSidebar(storage);

  view.sidebar.revealFile("docs/archive/archive.md");
  view.sidebar.collapseAllFolders();

  assert.deepEqual(view.sidebar.getCollapsedFolders(), ["plans"]);
  assert.match(view.root.innerHTML, /archive\.md/);
  assert.doesNotMatch(view.root.innerHTML, /plan\.md/);
});

runTest("renders only relevant folders, their ancestors, and supported file rows", function () {
  const storage = createStorage();
  const completeTree = workspaceStore.buildTree([
    { name: "launch.json", path: ".vscode/launch.json" },
    { name: "README.md", path: "docs/README.md" },
    { name: "design.yaml", path: "notes/architecture/design.yaml" }
  ], [
    { name: ".vscode", path: ".vscode" },
    { name: "docs", path: "docs" },
    { name: "include", path: "include" },
    { name: "lib", path: "lib" },
    { name: "notes", path: "notes" },
    { name: "architecture", path: "notes/architecture" },
    { name: "src", path: "src" },
    { name: "internal", path: "src/internal" },
    { name: "assets", path: "assets" }
  ]);
  const view = createSidebar(storage, {
    tree: workspaceStore.pruneTreeToRelevantFolders(completeTree)
  });

  [".vscode/", "docs/", "notes/", "architecture/", "launch.json", "README.md", "design.yaml"].forEach(function (label) {
    assert.match(view.root.innerHTML, new RegExp(label.replace(".", "\\.")), label);
  });
  ["include/", "lib/", "src/", "internal/", "assets/"].forEach(function (label) {
    assert.doesNotMatch(view.root.innerHTML, new RegExp(label), label);
  });
  assert.match(view.root.innerHTML, /data-workspace-path="\.vscode\/launch\.json"/);
  assert.match(view.root.innerHTML, /data-workspace-path="docs\/README\.md"/);
  assert.match(view.root.innerHTML, /data-workspace-path="notes\/architecture\/design\.yaml"/);
});

runTest("renders the supported-files empty message for an empty canonical tree", function () {
  const storage = createStorage();
  const view = createSidebar(storage, { tree: [] });

  assert.match(view.root.innerHTML, /No supported text files found in this folder/);
  assert.match(view.root.innerHTML, /data-workspace-root="true"/);
});

runTest("file-name filtering retains matching ancestors and restores the relevant tree", function () {
  const storage = createStorage();
  const tree = workspaceStore.buildTree([
    { name: "README.md", path: "docs/README.md" },
    { name: "design.yaml", path: "notes/architecture/design.yaml" }
  ]);
  const view = createSidebar(storage, { tree });

  view.root.dispatch("input", {
    target: createFileSearchInput("design")
  });

  assert.match(view.root.innerHTML, /notes\//);
  assert.match(view.root.innerHTML, /architecture\//);
  assert.match(view.root.innerHTML, /design\.yaml/);
  assert.doesNotMatch(view.root.innerHTML, /docs\//);
  assert.doesNotMatch(view.root.innerHTML, /README\.md/);

  view.root.dispatch("input", {
    target: createFileSearchInput("")
  });

  assert.match(view.root.innerHTML, /docs\//);
  assert.match(view.root.innerHTML, /README\.md/);
  assert.match(view.root.innerHTML, /notes\//);
  assert.match(view.root.innerHTML, /design\.yaml/);
});

runTest("stale collapsed paths do not create nonexistent folder rows", function () {
  const storage = createStorage();
  const view = createSidebar(storage, {
    tree: workspaceStore.buildTree([
      { name: "README.md", path: "docs/README.md" }
    ])
  });

  view.sidebar.setCollapsedFolders(["hidden", "docs"]);

  assert.doesNotMatch(view.root.innerHTML, /data-workspace-folder-path="hidden"/);
  assert.match(view.root.innerHTML, /data-workspace-folder-path="docs"/);
  assert.doesNotMatch(view.root.innerHTML, /README\.md/);
});

runTest("a transient preserved empty folder receives folder context actions", function () {
  const storage = createStorage();
  const completeTree = workspaceStore.buildTree([], [
    { name: "drafts", path: "drafts" },
    { name: "new", path: "drafts/new" }
  ]);
  const view = createSidebar(storage, {
    capabilities: {
      createDirectory: true,
      createFile: true
    },
    tree: workspaceStore.pruneTreeToRelevantFolders(completeTree, {
      preserveDirectoryPaths: ["drafts/new"]
    })
  });

  view.root.dispatch("contextmenu", {
    clientX: 40,
    clientY: 60,
    preventDefault() {},
    target: createContextTarget("directory", "drafts/new")
  });

  assert.match(view.root.innerHTML, /data-workspace-context-action="new-file"/);
  assert.match(view.root.innerHTML, /data-workspace-context-action="new-folder"/);
  view.root.dispatch("click", {
    target: createContextActionTarget("new-file")
  });
  assert.deepEqual(view.contextActions, [{
    action: "new-file",
    target: {
      kind: "directory",
      name: "new",
      path: "drafts/new"
    }
  }]);
});
