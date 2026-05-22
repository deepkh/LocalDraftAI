const assert = require("node:assert/strict");

global.window = {};
require("../../src/js/tab-manager.js");

let nextId = 1;

function createSession(options) {
  options = options || {};
  return {
    id: options.id || "test-session-" + nextId++,
    title: options.title || "Untitled.md",
    markdownText: String(options.markdownText || ""),
    fileHandle: options.fileHandle || null,
    dirty: Boolean(options.dirty),
    history: options.history || { snapshots: [] },
    activeMode: options.activeMode || "wysiwyg",
    scrollState: options.scrollState || null
  };
}

function createManager() {
  return window.MarkdownEditor.tabManager.create({
    createSession: createSession
  });
}

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
  await runTest("creates first untitled session", function () {
    const manager = createManager();
    const session = manager.createUntitledSession();

    assert.equal(session.title, "Untitled.md");
    assert.equal(manager.getActiveSession(), session);
    assert.deepEqual(manager.listSessions(), [session]);
  });

  await runTest("creates multiple untitled sessions with unique titles", function () {
    const manager = createManager();

    assert.equal(manager.createUntitledSession().title, "Untitled.md");
    assert.equal(manager.createUntitledSession().title, "Untitled-2.md");
    assert.equal(manager.createUntitledSession().title, "Untitled-3.md");
    assert.equal(manager.listSessions().length, 3);
  });

  await runTest("switches active session by id", function () {
    const manager = createManager();
    const first = manager.createUntitledSession();
    const second = manager.createUntitledSession();

    assert.equal(manager.setActiveSession(first.id), first);
    assert.equal(manager.getActiveSession(), first);
    assert.equal(manager.setActiveSession(second), second);
    assert.equal(manager.getActiveSession(), second);
  });

  await runTest("closes inactive tab without changing active tab", function () {
    const manager = createManager();
    const first = manager.createUntitledSession();
    const second = manager.createUntitledSession();
    const third = manager.createUntitledSession();

    manager.setActiveSession(third.id);
    assert.equal(manager.closeSession(first.id), third);
    assert.equal(manager.getActiveSession(), third);
    assert.deepEqual(manager.listSessions(), [second, third]);
  });

  await runTest("closes active tab and selects neighbor tab", function () {
    const manager = createManager();
    const first = manager.createUntitledSession();
    const second = manager.createUntitledSession();
    const third = manager.createUntitledSession();

    manager.setActiveSession(second.id);
    assert.equal(manager.closeSession(second.id), third);
    assert.equal(manager.getActiveSession(), third);
    assert.deepEqual(manager.listSessions(), [first, third]);
  });

  await runTest("refuses to close a missing tab id", function () {
    const manager = createManager();
    const session = manager.createUntitledSession();

    assert.equal(manager.closeSession("missing"), null);
    assert.equal(manager.getActiveSession(), session);
    assert.deepEqual(manager.listSessions(), [session]);
  });

  await runTest("keeps dirty data and history isolated per tab", function () {
    const manager = createManager();
    const firstHistory = { snapshots: ["# One"] };
    const secondHistory = { snapshots: ["# Two"] };
    const first = manager.addSession(createSession({
      title: "one.md",
      markdownText: "# One",
      dirty: true,
      history: firstHistory
    }));
    const second = manager.addSession(createSession({
      title: "two.md",
      markdownText: "# Two",
      dirty: false,
      history: secondHistory
    }));

    assert.equal(first.dirty, true);
    assert.equal(second.dirty, false);
    assert.equal(first.history, firstHistory);
    assert.equal(second.history, secondHistory);
    assert.equal(manager.getActiveSession(), second);
  });

  await runTest("moves first tab to last", function () {
    const manager = createManager();
    const first = manager.createUntitledSession({ title: "a.md" });
    const second = manager.createUntitledSession({ title: "b.md" });
    const third = manager.createUntitledSession({ title: "c.md" });

    assert.equal(manager.moveSession(first.id, 2), true);
    assert.deepEqual(manager.listSessions(), [second, third, first]);
  });

  await runTest("moves last tab to first", function () {
    const manager = createManager();
    const first = manager.createUntitledSession({ title: "a.md" });
    const second = manager.createUntitledSession({ title: "b.md" });
    const third = manager.createUntitledSession({ title: "c.md" });

    assert.equal(manager.moveSession(third.id, 0), true);
    assert.deepEqual(manager.listSessions(), [third, first, second]);
  });

  await runTest("moves middle tab left", function () {
    const manager = createManager();
    const first = manager.createUntitledSession({ title: "a.md" });
    const second = manager.createUntitledSession({ title: "b.md" });
    const third = manager.createUntitledSession({ title: "c.md" });

    assert.equal(manager.moveSession(second.id, 0), true);
    assert.deepEqual(manager.listSessions(), [second, first, third]);
  });

  await runTest("moves middle tab right", function () {
    const manager = createManager();
    const first = manager.createUntitledSession({ title: "a.md" });
    const second = manager.createUntitledSession({ title: "b.md" });
    const third = manager.createUntitledSession({ title: "c.md" });

    assert.equal(manager.moveSession(second.id, 2), true);
    assert.deepEqual(manager.listSessions(), [first, third, second]);
  });

  await runTest("moving active tab keeps active session", function () {
    const manager = createManager();
    const first = manager.createUntitledSession({ title: "a.md" });
    const second = manager.createUntitledSession({ title: "b.md" });
    const third = manager.createUntitledSession({ title: "c.md" });

    manager.setActiveSession(second.id);
    assert.equal(manager.moveSession(second.id, 0), true);
    assert.equal(manager.getActiveSession(), second);
    assert.deepEqual(manager.listSessions(), [second, first, third]);
  });

  await runTest("moving dirty tab keeps dirty state", function () {
    const manager = createManager();
    const first = manager.createUntitledSession({ title: "a.md" });
    const second = manager.createUntitledSession({ title: "b.md", dirty: true });
    const third = manager.createUntitledSession({ title: "c.md" });

    assert.equal(manager.moveSession(second.id, 0), true);
    assert.equal(manager.listSessions()[0], second);
    assert.equal(manager.listSessions()[0].dirty, true);
    assert.deepEqual(manager.listSessions(), [second, first, third]);
  });

  await runTest("moving tab keeps the same session object", function () {
    const manager = createManager();
    const first = manager.createUntitledSession({ title: "a.md" });
    const second = manager.createUntitledSession({ title: "b.md" });
    const third = manager.createUntitledSession({ title: "c.md" });
    const originalSecond = second;

    assert.equal(manager.moveSession(second.id, 0), true);
    assert.equal(manager.listSessions()[0], originalSecond);
    assert.deepEqual(manager.listSessions(), [second, first, third]);
  });

  await runTest("refuses to move a missing tab id", function () {
    const manager = createManager();
    const first = manager.createUntitledSession({ title: "a.md" });
    const second = manager.createUntitledSession({ title: "b.md" });

    assert.equal(manager.moveSession("missing", 0), false);
    assert.deepEqual(manager.listSessions(), [first, second]);
  });

  await runTest("move target below zero clamps to first tab", function () {
    const manager = createManager();
    const first = manager.createUntitledSession({ title: "a.md" });
    const second = manager.createUntitledSession({ title: "b.md" });
    const third = manager.createUntitledSession({ title: "c.md" });

    assert.equal(manager.moveSession(third.id, -10), true);
    assert.deepEqual(manager.listSessions(), [third, first, second]);
  });

  await runTest("move target above length clamps to last tab", function () {
    const manager = createManager();
    const first = manager.createUntitledSession({ title: "a.md" });
    const second = manager.createUntitledSession({ title: "b.md" });
    const third = manager.createUntitledSession({ title: "c.md" });

    assert.equal(manager.moveSession(first.id, 99), true);
    assert.deepEqual(manager.listSessions(), [second, third, first]);
  });

  await runTest("finds an already-open file handle", async function () {
    const manager = createManager();
    const fileHandle = {
      name: "notes.md",
      async isSameEntry(other) {
        return other && other.name === "notes.md";
      }
    };
    const session = manager.addSession(createSession({
      title: "notes.md",
      fileHandle: fileHandle
    }));

    assert.equal(await manager.findSessionByFileHandle({ name: "notes.md" }), session);
    assert.equal(await manager.findSessionByFileHandle({ name: "other.md" }), null);
  });
}());
