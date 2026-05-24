const assert = require("node:assert/strict");

global.window = {};

require("../../src/js/ai-diff.js");

const aiDiff = window.MarkdownEditor.aiDiff;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

function summaryFor(original, result) {
  return aiDiff.summarizeDiff(aiDiff.diffText(original, result));
}

function firstChangedChunk(original, result) {
  return aiDiff.diffText(original, result).find((chunk) => chunk.type === "changed");
}

runTest("reports no changes for same text", function () {
  const summary = summaryFor("Alpha\nBeta", "Alpha\nBeta");

  assert.equal(summary.added, 0);
  assert.equal(summary.removed, 0);
  assert.equal(summary.changed, 0);
  assert.equal(summary.unchanged, 2);
});

runTest("reports an added line", function () {
  const summary = summaryFor("Alpha", "Alpha\nBeta");

  assert.equal(summary.addedLines, 1);
  assert.equal(summary.removedLines, 0);
  assert.equal(summary.changedLines, 0);
});

runTest("reports a removed line", function () {
  const summary = summaryFor("Alpha\nBeta", "Alpha");

  assert.equal(summary.addedLines, 0);
  assert.equal(summary.removedLines, 1);
  assert.equal(summary.changedLines, 0);
});

runTest("reports a changed line", function () {
  const summary = summaryFor("This sentence is bad.", "This sentence is unclear.");

  assert.equal(summary.changedLines, 1);
  assert.equal(summary.addedTokens, 1);
  assert.equal(summary.removedTokens, 1);
});

runTest("reports a word-level insertion inside a changed line", function () {
  const chunk = firstChangedChunk("Hello world", "Hello LocalDraftAI world");

  assert.equal(chunk.type, "changed");
  assert.deepEqual(
    chunk.tokens.filter((token) => token.type === "added").map((token) => token.text),
    ["LocalDraftAI "]
  );
  assert.equal(summaryFor("Hello world", "Hello LocalDraftAI world").added, 1);
});

runTest("diffs a Markdown heading change", function () {
  const summary = summaryFor("# Draft title", "# Final title");

  assert.equal(summary.changedLines, 1);
  assert.equal(summary.addedTokens, 1);
  assert.equal(summary.removedTokens, 1);
});

runTest("diffs a Markdown bullet list change", function () {
  const summary = summaryFor("- Keep Markdown\n- Save files", "- Keep Markdown\n- Save local files");

  assert.equal(summary.changedLines, 1);
  assert.equal(summary.addedTokens, 1);
});

runTest("diffs a Markdown code block change", function () {
  const summary = summaryFor("```js\nconst x = 1;\n```", "```js\nconst x = 2;\n```");

  assert.equal(summary.changedLines, 1);
  assert.equal(summary.unchanged, 2);
});

runTest("diffs a Traditional Chinese sentence change", function () {
  const summary = summaryFor("這是一段草稿。", "這是一段完成稿。");

  assert.equal(summary.changedLines, 1);
  assert.ok(summary.addedTokens > 0);
  assert.ok(summary.removedTokens > 0);
});

runTest("reports text added from an empty original", function () {
  const summary = summaryFor("", "New result");

  assert.equal(summary.addedLines, 1);
  assert.equal(summary.removedLines, 0);
});

runTest("reports text removed from an empty AI result", function () {
  const summary = summaryFor("Original selection", "");

  assert.equal(summary.addedLines, 0);
  assert.equal(summary.removedLines, 1);
});

runTest("diffs large text with 500+ lines", function () {
  const originalLines = Array.from({ length: 520 }, (_, index) => "Line " + index);
  const resultLines = originalLines.slice();
  resultLines[250] = "Line 250 updated";
  resultLines.push("Line 520");

  const summary = summaryFor(originalLines.join("\n"), resultLines.join("\n"));

  assert.equal(summary.changedLines, 1);
  assert.equal(summary.addedLines, 1);
  assert.equal(summary.unchanged, 519);
});

runTest("renders compared Markdown through textContent", function () {
  const previousDocument = global.document;
  let innerHtmlWrites = 0;

  function fakeElement(tagName) {
    return {
      children: [],
      className: "",
      tagName,
      textContent: "",
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      setAttribute() {}
    };
  }

  function flattenText(node) {
    return String(node.textContent || "") + (node.children || []).map(flattenText).join("");
  }

  global.document = {
    createElement(tagName) {
      const node = fakeElement(tagName);

      Object.defineProperty(node, "innerHTML", {
        set() {
          innerHtmlWrites += 1;
          throw new Error("Diff renderers must not write innerHTML.");
        }
      });

      return node;
    }
  };

  try {
    const chunks = aiDiff.diffText("```cpp\nint x = 1;\n```", "```cpp\nint x = 2;\n```");
    const rendered = aiDiff.renderUnifiedDiff(chunks, {});
    const text = flattenText(rendered);

    assert.equal(innerHtmlWrites, 0);
    assert.match(text, /```cpp/);
    assert.match(text, /int x = 1;/);
    assert.match(text, /int x = 2;/);
  } finally {
    global.document = previousDocument;
  }
});
