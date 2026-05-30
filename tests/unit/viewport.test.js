const assert = require("node:assert/strict");

function createRafHarness() {
  let nextId = 1;
  let queue = [];
  let afterFrame = [];
  const canceled = new Set();

  return {
    requestAnimationFrame(callback) {
      const id = nextId++;
      queue.push({ id, callback });
      return id;
    },
    cancelAnimationFrame(id) {
      canceled.add(id);
    },
    afterCurrentFrame(callback) {
      afterFrame.push(callback);
    },
    runFrame() {
      const frameQueue = queue;
      const scrollQueue = afterFrame;

      queue = [];
      afterFrame = [];

      frameQueue.forEach(function (entry) {
        if (!canceled.has(entry.id)) {
          entry.callback();
        }
      });

      scrollQueue.forEach(function (callback) {
        callback();
      });
    }
  };
}

function createScrollElement(options) {
  let scrollTop = options.scrollTop || 0;
  let onScroll = null;
  const element = {
    clientHeight: options.clientHeight || 100,
    scrollHeight: options.scrollHeight || 1000,
    anchors: [],
    textContent: options.textContent || "",
    getBoundingClientRect() {
      return {
        top: options.top || 0,
        bottom: (options.top || 0) + (options.height || 100),
        height: options.height || 100
      };
    },
    querySelectorAll() {
      return this.anchors;
    },
    setScrollListener(callback) {
      onScroll = callback;
    }
  };

  Object.defineProperty(element, "scrollTop", {
    get() {
      return scrollTop;
    },
    set(value) {
      const nextValue = Number(value) || 0;

      if (Math.round(nextValue) === Math.round(scrollTop)) {
        scrollTop = nextValue;
        return;
      }

      scrollTop = nextValue;
      if (onScroll) {
        options.raf.afterCurrentFrame(onScroll);
      }
    }
  });

  return element;
}

function createAnchor(parent, options) {
  return {
    textContent: options.text || "Anchor text",
    getAttribute(name) {
      return name === "data-md-line" ? String(options.line) : null;
    },
    getBoundingClientRect() {
      const top = options.baseTop - parent.scrollTop;
      const height = options.height || 40;

      return {
        top,
        bottom: top + height,
        height
      };
    }
  };
}

global.window = {};
const raf = createRafHarness();
let nextTimeoutId = 1;
const timeoutIds = new Set();

window.requestAnimationFrame = raf.requestAnimationFrame;
window.cancelAnimationFrame = raf.cancelAnimationFrame;
window.setTimeout = function (callback) {
  const id = nextTimeoutId++;

  timeoutIds.add(id);
  return id;
};
window.clearTimeout = function (id) {
  timeoutIds.delete(id);
};
window.getComputedStyle = function () {
  return {
    fontSize: "16px",
    lineHeight: "24px",
    paddingTop: "0px"
  };
};
window.scrollX = 0;
window.scrollY = 0;
window.innerHeight = 800;
window.scrollTo = function (_x, y) {
  window.scrollY = y;
};

global.document = {
  documentElement: {
    scrollHeight: 1000
  },
  scrollingElement: {
    scrollHeight: 1000
  },
  querySelector() {
    return null;
  }
};

require("../../src/js/utils.js");
require("../../src/js/viewport.js");

function createViewportFixture(initialMode) {
  let activeMode = initialMode || "wysiwyg";
  const wysiwygEditor = createScrollElement({
    raf,
    scrollTop: 100,
    scrollHeight: 1000,
    clientHeight: 100
  });
  const markdownEditor = createScrollElement({
    raf,
    scrollTop: 0,
    scrollHeight: 1000,
    clientHeight: 100
  });
  wysiwygEditor.anchors = [
    createAnchor(wysiwygEditor, {
      baseTop: 80,
      line: 10,
      text: "Synchronized block"
    })
  ];

  const viewport = window.MarkdownEditor.viewport.create({
    getActiveMode() {
      return activeMode;
    },
    getMarkdownText() {
      return "0\n1\n2\n3\n4\n5\n6\n7\n8\n9\nSynchronized block";
    },
    markdownEditor,
    wysiwygEditor
  });

  return {
    markdownEditor,
    setActiveMode(mode) {
      activeMode = mode;
    },
    viewport,
    wysiwygEditor
  };
}

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("captures the visible WYSIWYG block as a viewport anchor", function () {
  const fixture = createViewportFixture();
  const anchor = fixture.viewport.capture();

  assert.equal(anchor.mode, "wysiwyg");
  assert.equal(anchor.line, 10);
  assert.equal(anchor.blockRatio, 0.5);
});

runTest("restores the Markdown source editor to a matching Markdown line", function () {
  const fixture = createViewportFixture();

  fixture.setActiveMode("markdown");
  fixture.viewport.restore({
    mode: "wysiwyg",
    line: 10,
    blockRatio: 0.5,
    scrollRatio: 0,
    textHint: "Synchronized block"
  });

  assert.equal(Math.round(fixture.markdownEditor.scrollTop), 240);
});

runTest("restores the WYSIWYG editor to a matching rendered block", function () {
  const fixture = createViewportFixture();

  fixture.setActiveMode("wysiwyg");
  fixture.viewport.restore({
    mode: "markdown",
    line: 10,
    lineOffset: 0,
    blockRatio: 0,
    scrollRatio: 0
  });

  assert.equal(Math.round(fixture.wysiwygEditor.scrollTop), 80);
});

runTest("keeps a pending view-switch anchor until consumed", function () {
  const fixture = createViewportFixture();

  fixture.viewport.prepareModeSwitchAnchor();
  fixture.setActiveMode("markdown");

  const anchor = fixture.viewport.consumeModeSwitchAnchor();

  assert.equal(anchor.mode, "wysiwyg");
  assert.equal(anchor.line, 10);
});
