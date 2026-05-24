const assert = require("node:assert/strict");

global.window = {};

require("../../src/js/ai-diff.js");
require("../../src/js/ai-patch.js");

const aiDiff = window.MarkdownEditor.aiDiff;
const aiPatch = window.MarkdownEditor.aiPatch;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

function patchFor(original, result) {
  return aiPatch.createPatchChunks(aiDiff.diffText(original, result));
}

function firstChunkOfType(patchChunks, type) {
  return patchChunks.find((chunk) => chunk.type === type);
}

runTest("same line is always preserved", function () {
  const chunks = patchFor("Alpha", "Alpha");

  aiPatch.setChunkAccepted(chunks, chunks[0].id, false);

  assert.equal(aiPatch.buildAcceptedResult(chunks), "Alpha");
});

runTest("accepted added line appears in accepted result", function () {
  const chunks = patchFor("Alpha", "Alpha\nBeta");

  assert.equal(aiPatch.buildAcceptedResult(chunks), "Alpha\nBeta");
});

runTest("rejected added line is removed from accepted result", function () {
  const chunks = patchFor("Alpha", "Alpha\nBeta");
  const added = firstChunkOfType(chunks, "added");

  aiPatch.setChunkAccepted(chunks, added.id, false);

  assert.equal(aiPatch.buildAcceptedResult(chunks), "Alpha");
});

runTest("accepted removed line is removed from accepted result", function () {
  const chunks = patchFor("Alpha\nBeta", "Alpha");

  assert.equal(aiPatch.buildAcceptedResult(chunks), "Alpha");
});

runTest("rejected removed line is preserved", function () {
  const chunks = patchFor("Alpha\nBeta", "Alpha");
  const removed = firstChunkOfType(chunks, "removed");

  aiPatch.setChunkAccepted(chunks, removed.id, false);

  assert.equal(aiPatch.buildAcceptedResult(chunks), "Alpha\nBeta");
});

runTest("accepted changed line uses new text", function () {
  const chunks = patchFor("Need fix grammar.", "The grammar needs to be fixed.");

  assert.equal(aiPatch.buildAcceptedResult(chunks), "The grammar needs to be fixed.");
});

runTest("rejected changed line uses old text", function () {
  const chunks = patchFor("Need fix grammar.", "The grammar needs to be fixed.");
  const changed = firstChunkOfType(chunks, "changed");

  aiPatch.setChunkAccepted(chunks, changed.id, false);

  assert.equal(aiPatch.buildAcceptedResult(chunks), "Need fix grammar.");
});

runTest("acceptAll produces the full AI result", function () {
  const chunks = patchFor("Alpha\nBeta", "Alpha updated\nBeta\nGamma");

  aiPatch.rejectAll(chunks);
  aiPatch.acceptAll(chunks);

  assert.equal(aiPatch.buildAcceptedResult(chunks), "Alpha updated\nBeta\nGamma");
});

runTest("rejectAll produces the original selection", function () {
  const chunks = patchFor("Alpha\nBeta", "Alpha updated\nBeta\nGamma");

  aiPatch.rejectAll(chunks);

  assert.equal(aiPatch.buildAcceptedResult(chunks), "Alpha\nBeta");
});

runTest("mixed accept and reject produces expected final text", function () {
  const chunks = patchFor("Alpha\nBeta\nGamma", "Alpha updated\nBeta\nGamma\nDelta");
  const changed = firstChunkOfType(chunks, "changed");

  aiPatch.setChunkAccepted(chunks, changed.id, false);

  assert.equal(aiPatch.buildAcceptedResult(chunks), "Alpha\nBeta\nGamma\nDelta");
});

runTest("empty original can accept added text", function () {
  const chunks = patchFor("", "New result");

  assert.equal(aiPatch.buildAcceptedResult(chunks), "New result");
});

runTest("original text can accept an empty AI result", function () {
  const chunks = patchFor("Original selection", "");

  assert.equal(aiPatch.buildAcceptedResult(chunks), "");
});

runTest("Markdown heading changed line can be accepted", function () {
  const chunks = patchFor("# Draft title", "# Final title");

  assert.equal(aiPatch.buildAcceptedResult(chunks), "# Final title");
});

runTest("Markdown bullet changed line can be rejected", function () {
  const chunks = patchFor("- Save files", "- Save local files");
  const changed = firstChunkOfType(chunks, "changed");

  aiPatch.setChunkAccepted(chunks, changed.id, false);

  assert.equal(aiPatch.buildAcceptedResult(chunks), "- Save files");
});

runTest("fenced code block changed line can be rejected", function () {
  const chunks = patchFor("```js\nconst x = 1;\n```", "```js\nconst x = 2;\n```");
  const changed = firstChunkOfType(chunks, "changed");

  aiPatch.setChunkAccepted(chunks, changed.id, false);

  assert.equal(aiPatch.buildAcceptedResult(chunks), "```js\nconst x = 1;\n```");
});

runTest("Traditional Chinese changed line can be accepted or rejected", function () {
  const chunks = patchFor("這是一段草稿。", "這是一段完成稿。");
  const changed = firstChunkOfType(chunks, "changed");

  assert.equal(aiPatch.buildAcceptedResult(chunks), "這是一段完成稿。");

  aiPatch.setChunkAccepted(chunks, changed.id, false);

  assert.equal(aiPatch.buildAcceptedResult(chunks), "這是一段草稿。");
});
