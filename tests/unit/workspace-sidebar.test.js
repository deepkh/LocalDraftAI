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

  return {
    classList: createClassList(),
    hidden: false,
    innerHTML: "",
    listeners,
    parentElement: null,
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
    querySelector() {
      return null;
    },
    setAttribute() {}
  };
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

  storage.values[workspaceSidebar.MODE_STORAGE_KEY] = "expanded";
  const sidebar = workspaceSidebar.create({
    rootElement: root,
    storage,
    workspaceElement: workspace
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

  return { root, sidebar };
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
