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

function createSidebar(storage) {
  const root = createElement();
  const workspace = createElement();
  const folderChanges = [];
  const scrollChanges = [];

  storage.values[workspaceSidebar.MODE_STORAGE_KEY] = "expanded";
  const sidebar = workspaceSidebar.create({
    rootElement: root,
    storage,
    workspaceElement: workspace,
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
      tree: workspaceStore.buildTree([
        { name: "ai-agent.md", path: "docs/ai-agent.md" },
        { name: "archive.md", path: "docs/archive/archive.md" },
        { name: "plan.md", path: "plans/plan.md" },
        { name: "README.md", path: "README.md" }
      ])
    }
  });

  return { folderChanges, root, scrollChanges, sidebar };
}

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
