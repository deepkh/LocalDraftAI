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

function createViewportFixture() {
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
  const preview = createScrollElement({
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
  preview.anchors = [
    createAnchor(preview, {
      baseTop: 200,
      line: 10,
      text: "Synchronized block"
    })
  ];

  const viewport = window.MarkdownEditor.viewport.create({
    getActiveMode() {
      return "wysiwyg";
    },
    getMarkdownText() {
      return "Synchronized block";
    },
    markdownEditor,
    preview,
    wysiwygEditor
  });

  return {
    markdownEditor,
    preview,
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

runTest("ignores preview scroll events caused by editor-to-preview sync", function () {
  const fixture = createViewportFixture();

  fixture.preview.setScrollListener(function () {
    fixture.viewport.scheduleEditorSync();
  });

  fixture.viewport.schedulePreviewSync();
  raf.runFrame();
  raf.runFrame();
  raf.runFrame();

  assert.equal(Math.round(fixture.preview.scrollTop), 220);
  assert.equal(Math.round(fixture.wysiwygEditor.scrollTop), 100);
});

runTest("still syncs editor from user-driven preview scrolls", function () {
  const fixture = createViewportFixture();

  fixture.wysiwygEditor.scrollTop = 60;
  fixture.preview.scrollTop = 220;
  fixture.viewport.scheduleEditorSync();
  raf.runFrame();

  assert.equal(Math.round(fixture.wysiwygEditor.scrollTop), 100);
});

runTest("suppresses preview scroll feedback during editor-driven preview renders", function () {
  const fixture = createViewportFixture();

  fixture.preview.setScrollListener(function () {
    fixture.viewport.scheduleEditorSync();
  });

  fixture.viewport.suppressPreviewFeedback();
  fixture.preview.scrollTop = 220;
  raf.runFrame();
  raf.runFrame();

  assert.equal(Math.round(fixture.wysiwygEditor.scrollTop), 100);
});

runTest("suppresses all pane sync during programmatic scroll restoration", function () {
  const fixture = createViewportFixture();

  fixture.wysiwygEditor.setScrollListener(function () {
    fixture.viewport.schedulePreviewSync();
  });
  fixture.preview.setScrollListener(function () {
    fixture.viewport.scheduleEditorSync();
  });

  fixture.viewport.suppressScrollSync();
  fixture.wysiwygEditor.scrollTop = 60;
  fixture.preview.scrollTop = 220;
  raf.runFrame();
  raf.runFrame();

  assert.equal(Math.round(fixture.wysiwygEditor.scrollTop), 60);
  assert.equal(Math.round(fixture.preview.scrollTop), 220);
});
