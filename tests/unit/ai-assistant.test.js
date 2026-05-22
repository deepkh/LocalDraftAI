const assert = require("node:assert/strict");

function element() {
  return {
    classList: {
      add() {},
      remove() {}
    },
    disabled: false,
    hidden: true,
    innerHTML: "",
    textContent: "",
    value: "",
    addEventListener() {},
    appendChild() {},
    contains() {
      return false;
    },
    dataset: {},
    focus() {},
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
    removeAttribute() {},
    scrollHeight: 0,
    scrollTop: 0,
    setAttribute() {},
    style: {}
  };
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
  createElement() {
    return element();
  }
};

require("../../src/js/ai-actions.js");
require("../../src/js/markdown-ai-guards.js");

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

(async function () {
  await runTest("does not close an open AI review dialog as transient UI", async function () {
    let resolveProvider;
    const cancelButton = element();
    const reviewOverlay = element();
    const assistant = aiAssistant.create({
      applyButton: element(),
      cancelButton,
      captureSelection() {},
      closeButton: element(),
      focusActiveEditor() {},
      getActiveMode() {
        return "markdown";
      },
      getActiveSessionId() {
        return "session-1";
      },
      markdownEditor: element(),
      originalText: element(),
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
      },
      resultText: element(),
      reviewDialog: element(),
      reviewLog: element(),
      reviewOverlay,
      reviewStatus: element(),
      reviewTitle: element(),
      setMarkdown() {},
      statusBadge: element(),
      toolbarButton: element(),
      toolbarMenu: element(),
      wysiwygEditor: element()
    });

    const request = assistant.requestAction("correctGrammar", {
      selection: {
        end: 4,
        mode: "markdown",
        start: 0,
        text: "text"
      }
    });

    assert.equal(reviewOverlay.hidden, false);
    assert.equal(cancelButton.disabled, true);
    assert.equal(assistant.closeTransientUi(), false);
    assert.equal(reviewOverlay.hidden, false);

    resolveProvider("result");
    await request;
  });
}());
