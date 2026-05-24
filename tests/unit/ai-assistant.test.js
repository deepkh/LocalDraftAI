const assert = require("node:assert/strict");

function element(tagName) {
  const listeners = {};
  const classes = new Set();
  let textContent = "";
  let innerHTML = "";
  const node = {
    attributes: {},
    checked: false,
    children: [],
    className: "",
    dataset: {},
    disabled: false,
    hidden: true,
    scrollHeight: 0,
    scrollTop: 0,
    selectionEnd: 0,
    selectionStart: 0,
    style: {},
    tagName: tagName || "div",
    value: "",
    addEventListener(type, callback) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(callback);
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    contains() {
      return false;
    },
    dispatchEvent(event) {
      const eventObject = typeof event === "string" ? { type: event } : event;
      (listeners[eventObject.type] || []).forEach((callback) => callback(eventObject));
    },
    focus() {
      this.focused = true;
    },
    getBoundingClientRect() {
      return {
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0
      };
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    setRangeText(replacement, start, end) {
      this.value = this.value.slice(0, start) + replacement + this.value.slice(end);
      this.selectionStart = start;
      this.selectionEnd = start + replacement.length;
    }
  };

  Object.defineProperty(node, "textContent", {
    get() {
      return textContent;
    },
    set(value) {
      textContent = String(value || "");
      if (!textContent) {
        node.children = [];
      }
    }
  });

  Object.defineProperty(node, "innerHTML", {
    get() {
      return innerHTML;
    },
    set(value) {
      innerHTML = String(value || "");
      if (!innerHTML) {
        node.children = [];
      }
    }
  });

  node.classList = {
    add(name) {
      classes.add(name);
      node.className = Array.from(classes).join(" ");
    },
    contains(name) {
      return classes.has(name);
    },
    remove(name) {
      classes.delete(name);
      node.className = Array.from(classes).join(" ");
    }
  };

  return node;
}

global.window = {
  addEventListener() {},
  innerHeight: 768,
  innerWidth: 1024,
  requestAnimationFrame(callback) {
    callback();
  }
};

global.document = {
  addEventListener() {},
  createElement(tagName) {
    return element(tagName);
  }
};

require("../../src/js/ai-actions.js");
require("../../src/js/markdown-ai-guards.js");
require("../../src/js/ai-diff.js");
require("../../src/js/ai-patch.js");

window.MarkdownEditor.aiContextMenu = {
  create() {
    return {
      bindEvents() {},
      hide() {},
      isOpen() {
        return false;
      }
    };
  }
};

require("../../src/js/ai-assistant.js");

const aiAssistant = window.MarkdownEditor.aiAssistant;

async function runTest(name, callback) {
  try {
    await callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

function createContext(overrides) {
  const markdownEditor = element("textarea");
  const context = {
    applyButton: element("button"),
    cancelButton: element("button"),
    captureSelection() {},
    closeButton: element("button"),
    diffHideUnchanged: element("input"),
    diffInteractiveButton: element("button"),
    diffSideBySideButton: element("button"),
    diffSummary: element("div"),
    diffUnifiedButton: element("button"),
    diffView: element("div"),
    focusActiveEditor() {
      context.focusedActiveEditor = true;
    },
    getActiveMode() {
      return "markdown";
    },
    getActiveSessionId() {
      return "session-1";
    },
    markdownEditor,
    originalText: element("pre"),
    patchAcceptAllButton: element("button"),
    patchRejectAllButton: element("button"),
    patchResetButton: element("button"),
    provider: {
      actionTimeoutMs() {
        return 1000;
      },
      readSettings() {
        return {
          endpoint: "",
          model: "local-model"
        };
      },
      run() {
        return Promise.resolve("result");
      }
    },
    resultTitle: element("h3"),
    resultText: element("textarea"),
    reviewDialog: element("div"),
    reviewLog: element("div"),
    reviewOverlay: element("div"),
    reviewStatus: element("div"),
    reviewTitle: element("h2"),
    setMarkdown(value, source) {
      context.lastMarkdown = value;
      context.lastMarkdownSource = source;
    },
    statusBadge: element("span"),
    toolbarButton: element("button"),
    toolbarMenu: element("div"),
    wysiwygEditor: element("div")
  };

  context.toolbarMenu.hidden = true;

  return Object.assign(context, overrides || {});
}

function bindAssistant(context) {
  const assistant = aiAssistant.create(context);

  assistant.bindEvents();
  return assistant;
}

function collectNodes(node, predicate, result) {
  const matches = result || [];

  if (!node) {
    return matches;
  }

  if (predicate(node)) {
    matches.push(node);
  }

  (node.children || []).forEach((child) => collectNodes(child, predicate, matches));
  return matches;
}

function nodesByPatchAction(context, action) {
  return collectNodes(context.diffView, (node) => node.dataset && node.dataset.patchAction === action);
}

(async function () {
  await runTest("does not close an open AI review dialog as transient UI", async function () {
    let resolveProvider;
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "http://127.0.0.1:11434/v1/",
            model: "local-model"
          };
        },
        run() {
          return new Promise((resolve) => {
            resolveProvider = resolve;
          });
        }
      }
    });
    const assistant = bindAssistant(context);

    const request = assistant.requestAction("correctGrammar", {
      selection: {
        end: 4,
        mode: "markdown",
        start: 0,
        text: "text"
      }
    });

    assert.equal(context.reviewOverlay.hidden, false);
    assert.equal(context.cancelButton.disabled, true);
    assert.equal(assistant.closeTransientUi(), false);
    assert.equal(context.reviewOverlay.hidden, false);

    resolveProvider("result");
    await request;
  });

  await runTest("keeps diff empty while AI is processing", async function () {
    let resolveProvider;
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "",
            model: "local-model"
          };
        },
        run() {
          return new Promise((resolve) => {
            resolveProvider = resolve;
          });
        }
      }
    });
    const assistant = bindAssistant(context);

    const request = assistant.requestAction("correctGrammar", {
      selection: {
        end: 11,
        mode: "markdown",
        start: 0,
        text: "Hello world"
      }
    });

    assert.equal(context.diffSummary.textContent, "");
    assert.equal(context.diffView.children.length, 0);

    resolveProvider("Hello LocalDraftAI world");
    await request;
  });

  await runTest("renders diff after AI result is ready", async function () {
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "",
            model: "local-model"
          };
        },
        run() {
          return Promise.resolve("Hello LocalDraftAI world");
        }
      }
    });
    const assistant = bindAssistant(context);

    await assistant.requestAction("correctGrammar", {
      selection: {
        end: 11,
        mode: "markdown",
        start: 0,
        text: "Hello world"
      }
    });

    assert.equal(context.resultText.value, "Hello LocalDraftAI world");
    assert.equal(context.diffSummary.textContent, "+ 1 added   - 0 removed   ~ 1 changed");
    assert.equal(context.diffView.children.length, 1);
  });

  await runTest("refreshes diff when editable AI result changes", async function () {
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "",
            model: "local-model"
          };
        },
        run() {
          return Promise.resolve("Hello LocalDraftAI world");
        }
      }
    });
    const assistant = bindAssistant(context);

    await assistant.requestAction("correctGrammar", {
      selection: {
        end: 11,
        mode: "markdown",
        start: 0,
        text: "Hello world"
      }
    });

    context.resultText.value = "Hello world";
    context.resultText.dispatchEvent("input");

    assert.equal(context.diffSummary.textContent, "No differences.");
  });

  await runTest("applies the edited AI result", async function () {
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "",
            model: "local-model"
          };
        },
        run() {
          return Promise.resolve("the");
        }
      }
    });
    context.markdownEditor.value = "teh text";
    const assistant = bindAssistant(context);

    await assistant.requestAction("correctGrammar", {
      selection: {
        end: 3,
        mode: "markdown",
        start: 0,
        text: "teh"
      }
    });

    context.resultText.value = "the edited";
    context.resultText.dispatchEvent("input");
    context.applyButton.dispatchEvent("click");

    assert.equal(context.markdownEditor.value, "the edited text");
    assert.equal(context.lastMarkdown, "the edited text");
    assert.equal(context.lastMarkdownSource, "textarea");
  });

  await runTest("clears original result and diff state on cancel", async function () {
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "",
            model: "local-model"
          };
        },
        run() {
          return Promise.resolve("Hello LocalDraftAI world");
        }
      }
    });
    const assistant = bindAssistant(context);

    await assistant.requestAction("correctGrammar", {
      selection: {
        end: 11,
        mode: "markdown",
        start: 0,
        text: "Hello world"
      }
    });

    context.diffInteractiveButton.dispatchEvent("click");
    assert.equal(context.patchAcceptAllButton.hidden, false);

    context.cancelButton.dispatchEvent("click");

    assert.equal(context.reviewOverlay.hidden, true);
    assert.equal(context.originalText.textContent, "");
    assert.equal(context.resultText.value, "");
    assert.equal(context.diffSummary.textContent, "");
    assert.equal(context.diffView.children.length, 0);
    assert.equal(context.resultTitle.textContent, "AI Result");
    assert.equal(context.patchAcceptAllButton.hidden, true);
  });

  await runTest("interactive mode renders accept and reject controls", async function () {
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "",
            model: "local-model"
          };
        },
        run() {
          return Promise.resolve("Hello LocalDraftAI world");
        }
      }
    });
    const assistant = bindAssistant(context);

    await assistant.requestAction("correctGrammar", {
      selection: {
        end: 11,
        mode: "markdown",
        start: 0,
        text: "Hello world"
      }
    });

    context.diffInteractiveButton.dispatchEvent("click");

    assert.equal(context.resultTitle.textContent, "Accepted Result Preview");
    assert.equal(context.resultText.readOnly, true);
    assert.equal(context.applyButton.textContent, "Apply Accepted Changes");
    assert.equal(context.diffSummary.textContent, "1 changes total | 1 accepted | 0 rejected");
    assert.equal(nodesByPatchAction(context, "accept").length, 1);
    assert.equal(nodesByPatchAction(context, "reject").length, 1);
  });

  await runTest("rejecting an interactive chunk updates accepted result preview", async function () {
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "",
            model: "local-model"
          };
        },
        run() {
          return Promise.resolve("The grammar needs to be fixed.");
        }
      }
    });
    const assistant = bindAssistant(context);

    await assistant.requestAction("correctGrammar", {
      selection: {
        end: 17,
        mode: "markdown",
        start: 0,
        text: "Need fix grammar."
      }
    });

    context.diffInteractiveButton.dispatchEvent("click");
    nodesByPatchAction(context, "reject")[0].dispatchEvent("click");

    assert.equal(context.resultText.value, "Need fix grammar.");
    assert.equal(context.diffSummary.textContent, "1 changes total | 0 accepted | 1 rejected");
  });

  await runTest("accepting an interactive chunk updates accepted result preview", async function () {
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "",
            model: "local-model"
          };
        },
        run() {
          return Promise.resolve("The grammar needs to be fixed.");
        }
      }
    });
    const assistant = bindAssistant(context);

    await assistant.requestAction("correctGrammar", {
      selection: {
        end: 17,
        mode: "markdown",
        start: 0,
        text: "Need fix grammar."
      }
    });

    context.diffInteractiveButton.dispatchEvent("click");
    nodesByPatchAction(context, "reject")[0].dispatchEvent("click");
    nodesByPatchAction(context, "accept")[0].dispatchEvent("click");

    assert.equal(context.resultText.value, "The grammar needs to be fixed.");
    assert.equal(context.diffSummary.textContent, "1 changes total | 1 accepted | 0 rejected");
  });

  await runTest("applies only accepted interactive changes", async function () {
    const original = "Alpha\nBeta";
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "",
            model: "local-model"
          };
        },
        run() {
          return Promise.resolve("Alpha updated\nBeta\nGamma");
        }
      }
    });
    context.markdownEditor.value = original + " tail";
    const assistant = bindAssistant(context);

    await assistant.requestAction("correctGrammar", {
      selection: {
        end: original.length,
        mode: "markdown",
        start: 0,
        text: original
      }
    });

    context.diffInteractiveButton.dispatchEvent("click");
    nodesByPatchAction(context, "reject")[0].dispatchEvent("click");
    context.applyButton.dispatchEvent("click");

    assert.equal(context.markdownEditor.value, "Alpha\nBeta\nGamma tail");
    assert.equal(context.lastMarkdown, "Alpha\nBeta\nGamma tail");
  });

  await runTest("editing AI result before interactive mode rebuilds patch state", async function () {
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "",
            model: "local-model"
          };
        },
        run() {
          return Promise.resolve("Hello LocalDraftAI world");
        }
      }
    });
    const assistant = bindAssistant(context);

    await assistant.requestAction("correctGrammar", {
      selection: {
        end: 11,
        mode: "markdown",
        start: 0,
        text: "Hello world"
      }
    });

    context.resultText.value = "Hello world";
    context.resultText.dispatchEvent("input");
    context.diffInteractiveButton.dispatchEvent("click");

    assert.equal(context.resultText.value, "Hello world");
    assert.equal(context.diffSummary.textContent, "No differences.");
    assert.equal(nodesByPatchAction(context, "reject").length, 0);
  });

  await runTest("blocks interactive apply after active document changes", async function () {
    const original = "Alpha\nBeta";
    const alerts = [];
    const previousAlert = window.alert;
    const context = createContext({
      getActiveSessionId() {
        return context.sessionId || "session-1";
      },
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "",
            model: "local-model"
          };
        },
        run() {
          return Promise.resolve("Alpha updated\nBeta");
        }
      }
    });
    context.markdownEditor.value = original;
    window.alert = function (message) {
      alerts.push(message);
    };

    try {
      const assistant = bindAssistant(context);

      await assistant.requestAction("correctGrammar", {
        selection: {
          end: original.length,
          mode: "markdown",
          start: 0,
          text: original
        }
      });

      context.diffInteractiveButton.dispatchEvent("click");
      context.sessionId = "session-2";
      context.applyButton.dispatchEvent("click");

      assert.equal(context.markdownEditor.value, original);
      assert.match(alerts[0], /active document changed/i);
    } finally {
      window.alert = previousAlert;
    }
  });
}());
