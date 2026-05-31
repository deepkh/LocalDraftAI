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
    aiEngineAdvancedPanel: element("div"),
    aiEngineAdvancedStatus: element("div"),
    aiEngineAdvancedToggle: element("button"),
    aiEngineChangeSettingsButton: element("button"),
    aiEngineOverrideModel: element("input"),
    aiEngineOverrideModelOptions: element("datalist"),
    aiEngineOverrideReasoning: element("select"),
    aiEngineRegenerateButton: element("button"),
    aiEngineSummary: element("section"),
    aiEngineSummaryDetail: element("div"),
    aiEngineSummaryPill: element("span"),
    aiEngineTemporaryOverride: element("input"),
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

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createSettingsContext() {
  return {
    apiKeyInput: element("input"),
    cancelButton: element("button"),
    closeButton: element("button"),
    dialog: element("div"),
    endpointInput: element("input"),
    form: element("form"),
    modeMock: element("input"),
    modeServer: element("input"),
    modelInput: element("input"),
    modelListButton: element("button"),
    modelOptions: element("datalist"),
    modelSelect: element("select"),
    overlay: element("div"),
    providerHint: element("div"),
    providerSelect: element("select"),
    reasoningEffort: element("select"),
    reasoningEffortLabel: element("span"),
    reasoningEnabled: element("input"),
    reasoningEnabledLabel: element("span"),
    reasoningLegend: element("legend"),
    reasoningSummary: element("input"),
    reasoningSummaryLabel: element("span"),
    reasoningTokenBudget: element("input"),
    reasoningTokenBudgetLabel: element("span"),
    saveButton: element("button"),
    statusElement: element("div"),
    testButton: element("button")
  };
}

function createApplyModeInputs(selectedMode) {
  return ["replace", "insert-below", "copy"].map((mode) => {
    const input = element("input");

    input.value = mode;
    input.checked = mode === (selectedMode || "replace");
    return input;
  });
}

function findButtonByText(root, text) {
  return collectNodes(root, (node) => node.tagName === "button" && node.textContent === text)[0] || null;
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

  await runTest("AI review dialog renders engine summary for mock mode", async function () {
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "",
            model: "local-model",
            provider: "mock"
          };
        },
        run() {
          return Promise.resolve("result");
        }
      }
    });
    const assistant = bindAssistant(context);

    await assistant.requestAction("correctGrammar", {
      selection: {
        end: 4,
        mode: "markdown",
        start: 0,
        text: "text"
      }
    });

    assert.equal(context.aiEngineSummary.hidden, false);
    assert.equal(context.aiEngineSummaryPill.textContent, "Local mock · No reasoning");
    assert.match(context.aiEngineSummaryDetail.textContent, /No server request was sent/);
  });

  await runTest("AI review dialog renders server model and reasoning summary", async function () {
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "http://127.0.0.1:11434/api/chat",
            model: "qwen3:1.7b",
            provider: "ollama",
            providerLabel: "Ollama",
            reasoning: {
              enabled: true,
              effort: "low"
            },
            reasoningMode: "low"
          };
        },
        run() {
          return Promise.resolve("result");
        }
      }
    });
    const assistant = bindAssistant(context);

    await assistant.requestAction("improveWording", {
      selection: {
        end: 4,
        mode: "markdown",
        start: 0,
        text: "text"
      }
    });

    assert.match(context.aiEngineSummaryPill.textContent, /Ollama/);
    assert.match(context.aiEngineSummaryPill.textContent, /qwen3:1\.7b/);
    assert.match(context.aiEngineSummaryPill.textContent, /Reasoning: Low/);
  });

  await runTest("Advanced panel is hidden by default and toggles", async function () {
    const context = createContext();
    const assistant = bindAssistant(context);

    await assistant.requestAction("correctGrammar", {
      selection: {
        end: 4,
        mode: "markdown",
        start: 0,
        text: "text"
      }
    });

    assert.equal(context.aiEngineAdvancedPanel.hidden, true);
    assert.equal(context.aiEngineAdvancedToggle.attributes["aria-expanded"], "false");

    context.aiEngineAdvancedToggle.dispatchEvent("click");
    assert.equal(context.aiEngineAdvancedPanel.hidden, false);
    assert.equal(context.aiEngineAdvancedToggle.attributes["aria-expanded"], "true");

    context.aiEngineAdvancedToggle.dispatchEvent("click");
    assert.equal(context.aiEngineAdvancedPanel.hidden, true);
    assert.equal(context.aiEngineAdvancedToggle.attributes["aria-expanded"], "false");
  });

  await runTest("Change Settings opens the global AI settings dialog", async function () {
    const previousSettings = window.MarkdownEditor.aiSettings;
    let opened = false;
    let bound = false;

    window.MarkdownEditor.aiSettings = {
      create() {
        return {
          bindEvents() {
            bound = true;
          },
          close() {},
          isOpen() {
            return false;
          },
          open() {
            opened = true;
          }
        };
      }
    };

    try {
      const context = createContext({
        settings: createSettingsContext()
      });
      const assistant = bindAssistant(context);

      await assistant.requestAction("correctGrammar", {
        selection: {
          end: 4,
          mode: "markdown",
          start: 0,
          text: "text"
        }
      });
      context.aiEngineChangeSettingsButton.dispatchEvent("click");

      assert.equal(bound, true);
      assert.equal(opened, true);
    } finally {
      window.MarkdownEditor.aiSettings = previousSettings;
    }
  });

  await runTest("changing Advanced fields marks the override dirty", async function () {
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "http://127.0.0.1:11434/api/chat",
            model: "qwen3:1.7b",
            provider: "ollama",
            providerLabel: "Ollama",
            reasoning: {
              enabled: true,
              effort: "low"
            },
            reasoningMode: "low"
          };
        },
        run() {
          return Promise.resolve("result");
        }
      }
    });
    const assistant = bindAssistant(context);

    await assistant.requestAction("improveWording", {
      selection: {
        end: 4,
        mode: "markdown",
        start: 0,
        text: "text"
      }
    });

    context.aiEngineOverrideModel.value = "qwen3:4b";
    context.aiEngineOverrideModel.dispatchEvent("input");

    assert.equal(context.aiEngineAdvancedStatus.dataset.status, "warning");
    assert.match(context.aiEngineAdvancedStatus.textContent, /Regenerate Result/);
  });

  await runTest("Regenerate uses settingsOverride and Apply uses the visible result", async function () {
    const calls = [];
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "http://127.0.0.1:11434/api/chat",
            model: "qwen3:1.7b",
            provider: "ollama",
            providerLabel: "Ollama",
            reasoning: {
              enabled: true,
              effort: "low"
            },
            reasoningMode: "low"
          };
        },
        resolveActionSettings(actionId, settings) {
          return Object.assign({}, settings, {
            reasoning: Object.assign({}, settings.reasoning)
          });
        },
        run(actionId, text, options) {
          calls.push({
            actionId,
            options,
            text
          });
          return Promise.resolve(calls.length === 1 ? "first result" : "second result");
        },
        summarizeSettings(settings) {
          return {
            endpoint: settings.endpoint,
            mode: settings.endpoint ? "server" : "mock",
            model: settings.model,
            providerLabel: settings.providerLabel || "Ollama",
            reasoningMode: settings.reasoningMode
          };
        }
      }
    });
    context.markdownEditor.value = "text tail";
    const assistant = bindAssistant(context);

    await assistant.requestAction("improveWording", {
      selection: {
        end: 4,
        mode: "markdown",
        start: 0,
        text: "text"
      }
    });

    context.aiEngineOverrideModel.value = "qwen3:4b";
    context.aiEngineOverrideModel.dispatchEvent("input");
    context.aiEngineOverrideReasoning.value = "high";
    context.aiEngineOverrideReasoning.dispatchEvent("change");
    context.aiEngineRegenerateButton.dispatchEvent("click");
    await tick();

    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.settingsOverride.model, "qwen3:4b");
    assert.equal(calls[1].options.settingsOverride.reasoningMode, "high");
    assert.equal(context.resultText.value, "second result");
    assert.match(context.reviewLog.children[context.reviewLog.children.length - 1].children[1].textContent, /^Regenerate completed in \d+ ms\.$/);

    context.applyButton.dispatchEvent("click");
    assert.equal(context.markdownEditor.value, "second result tail");
  });

  await runTest("Apply does not regenerate after Advanced settings change", async function () {
    const calls = [];
    const context = createContext({
      provider: {
        actionTimeoutMs() {
          return 1000;
        },
        readSettings() {
          return {
            endpoint: "http://127.0.0.1:11434/api/chat",
            model: "qwen3:1.7b",
            provider: "ollama",
            providerLabel: "Ollama",
            reasoning: {
              enabled: true,
              effort: "low"
            },
            reasoningMode: "low"
          };
        },
        run(actionId, text, options) {
          calls.push({
            actionId,
            options,
            text
          });
          return Promise.resolve("visible result");
        }
      }
    });
    context.markdownEditor.value = "text tail";
    const assistant = bindAssistant(context);

    await assistant.requestAction("improveWording", {
      selection: {
        end: 4,
        mode: "markdown",
        start: 0,
        text: "text"
      }
    });

    context.aiEngineOverrideModel.value = "qwen3:4b";
    context.aiEngineOverrideModel.dispatchEvent("input");
    context.applyButton.dispatchEvent("click");

    assert.equal(calls.length, 1);
    assert.equal(context.markdownEditor.value, "visible result tail");
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
    assert.equal(context.resultTitle.textContent, "AI Result - AI can make mistakes");
    assert.equal(context.patchAcceptAllButton.hidden, true);
  });

  await runTest("restores WYSIWYG editor state on cancel", async function () {
    const capturedState = { mode: "wysiwyg", scrollTop: 420 };
    const context = createContext({
      captureActiveEditorState() {
        context.captureActiveEditorStateCalled = true;
        return capturedState;
      },
      getActiveMode() {
        return "wysiwyg";
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
          return Promise.resolve("Hello LocalDraftAI world");
        }
      },
      restoreActiveEditorState(state) {
        context.restoredEditorState = state;
      }
    });
    const assistant = bindAssistant(context);

    await assistant.requestAction("correctGrammar", {
      selection: {
        mode: "wysiwyg",
        range: {},
        text: "Hello world"
      }
    });

    context.cancelButton.dispatchEvent("click");

    assert.equal(context.captureActiveEditorStateCalled, true);
    assert.equal(context.restoredEditorState, capturedState);
    assert.equal(context.focusedActiveEditor, undefined);
  });

  await runTest("does not refocus WYSIWYG editor through close path after apply", async function () {
    const context = createContext({
      getActiveMode() {
        return "wysiwyg";
      },
      insertHtmlAtSelection(html, selection) {
        context.insertedHtml = html;
        context.insertedSelection = selection;
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
          return Promise.resolve("the");
        }
      },
      renderMarkdownToHtml(value) {
        return "<p>" + value + "</p>";
      }
    });
    const assistant = bindAssistant(context);
    const selection = {
      mode: "wysiwyg",
      range: {},
      text: "teh"
    };

    await assistant.requestAction("correctGrammar", {
      selection
    });

    context.applyButton.dispatchEvent("click");

    assert.equal(context.insertedHtml, "<p>the</p>");
    assert.equal(context.insertedSelection, selection);
    assert.equal(context.reviewOverlay.hidden, true);
    assert.equal(context.focusedActiveEditor, undefined);
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

  await runTest("opens AI review in the right-hand panel when panel context exists", async function () {
    const context = createContext({
      aiAssistantPanel: element("aside"),
      aiAssistantPanelBody: element("div"),
      workspace: element("main")
    });
    const assistant = bindAssistant(context);

    await assistant.requestAction("correctGrammar", {
      selection: {
        end: 4,
        mode: "markdown",
        start: 0,
        text: "text"
      }
    });

    assert.equal(context.reviewOverlay.hidden, true);
    assert.equal(context.aiAssistantPanel.hidden, false);
    assert.equal(context.aiAssistantPanelBody.children.includes(context.reviewDialog), true);
    assert.equal(context.workspace.classList.contains("ai-panel-open"), true);
    assert.equal(context.reviewDialog.attributes.role, "region");
    assert.equal(context.reviewDialog.attributes["aria-modal"], undefined);
  });

  await runTest("Regenerate adds selectable revisions instead of replacing the first result", async function () {
    const calls = [];
    const context = createContext({
      aiAssistantPanel: element("aside"),
      aiAssistantPanelBody: element("div"),
      revisionList: element("div"),
      revisionSection: element("section"),
      revisionStatus: element("span"),
      workspace: element("main"),
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
          calls.push(true);
          return Promise.resolve(calls.length === 1 ? "first result" : "second result");
        }
      }
    });
    const assistant = bindAssistant(context);

    await assistant.requestAction("improveWording", {
      selection: {
        end: 4,
        mode: "markdown",
        start: 0,
        text: "text"
      }
    });

    assert.equal(context.revisionSection.hidden, false);
    assert.equal(context.revisionList.children.length, 2);
    assert.equal(context.resultText.value, "first result");

    context.aiEngineRegenerateButton.dispatchEvent("click");
    await tick();

    assert.equal(context.revisionList.children.length, 3);
    assert.equal(context.resultText.value, "second result");
    assert.equal(context.revisionStatus.textContent, "Active: Result 2");

    findButtonByText(context.revisionList, "Result 1").dispatchEvent("click");
    assert.equal(context.resultText.value, "first result");

    findButtonByText(context.revisionList, "Result 2").dispatchEvent("click");
    assert.equal(context.resultText.value, "second result");
  });

  await runTest("panel apply keeps review open and restores the original Markdown selection", async function () {
    const context = createContext({
      aiAssistantPanel: element("aside"),
      aiAssistantPanelBody: element("div"),
      applyModeInputs: createApplyModeInputs("replace"),
      applyStatus: element("div"),
      applyStatusText: element("span"),
      restoreOriginalButton: element("button"),
      revisionList: element("div"),
      revisionSection: element("section"),
      revisionStatus: element("span"),
      workspace: element("main"),
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
          return Promise.resolve("fixed");
        }
      }
    });
    context.markdownEditor.value = "text tail";
    const assistant = bindAssistant(context);

    await assistant.requestAction("correctGrammar", {
      selection: {
        end: 4,
        mode: "markdown",
        start: 0,
        text: "text"
      }
    });

    context.applyButton.dispatchEvent("click");

    assert.equal(context.aiAssistantPanel.hidden, false);
    assert.equal(context.markdownEditor.value, "fixed tail");
    assert.match(context.applyStatusText.textContent, /Applied: Grammar Correction · Result 1/);
    assert.equal(context.restoreOriginalButton.disabled, false);

    context.restoreOriginalButton.dispatchEvent("click");

    assert.equal(context.markdownEditor.value, "text tail");
    assert.equal(context.lastMarkdown, "text tail");
    assert.equal(context.applyStatusText.textContent, "Original restored.");
  });

  await runTest("Insert below mode can be restored safely", async function () {
    const context = createContext({
      aiAssistantPanel: element("aside"),
      aiAssistantPanelBody: element("div"),
      applyModeInputs: createApplyModeInputs("insert-below"),
      applyStatus: element("div"),
      applyStatusText: element("span"),
      restoreOriginalButton: element("button"),
      workspace: element("main"),
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
          return Promise.resolve("new result");
        }
      }
    });
    context.markdownEditor.value = "text tail";
    const assistant = bindAssistant(context);

    await assistant.requestAction("improveWording", {
      selection: {
        end: 4,
        mode: "markdown",
        start: 0,
        text: "text"
      }
    });

    context.applyButton.dispatchEvent("click");
    assert.equal(context.markdownEditor.value, "text\n\nnew result tail");

    context.restoreOriginalButton.dispatchEvent("click");
    assert.equal(context.markdownEditor.value, "text tail");
  });

  await runTest("Copy result only mode does not mutate the document", async function () {
    let copiedText = "";
    const context = createContext({
      aiAssistantPanel: element("aside"),
      aiAssistantPanelBody: element("div"),
      applyModeInputs: createApplyModeInputs("copy"),
      applyStatus: element("div"),
      applyStatusText: element("span"),
      copyTextToClipboard(text) {
        copiedText = text;
      },
      restoreOriginalButton: element("button"),
      workspace: element("main"),
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
          return Promise.resolve("copied result");
        }
      }
    });
    context.markdownEditor.value = "text tail";
    const assistant = bindAssistant(context);

    await assistant.requestAction("makeShorter", {
      selection: {
        end: 4,
        mode: "markdown",
        start: 0,
        text: "text"
      }
    });

    context.applyButton.dispatchEvent("click");
    await tick();

    assert.equal(copiedText, "copied result");
    assert.equal(context.markdownEditor.value, "text tail");
    assert.match(context.applyStatusText.textContent, /Copied: Make Shorter · Result 1/);
    assert.equal(context.restoreOriginalButton.hidden, true);
  });
}());
