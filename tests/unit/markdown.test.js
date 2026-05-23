const assert = require("node:assert/strict");

global.window = {};

require("../../src/js/utils.js");
require("../../src/js/markdown.js");

const markdown = window.MarkdownEditor.markdown;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("renders nested unordered lists from indented Markdown", function () {
  const html = markdown.renderMarkdown("- Parent\n  - Child\n- Next");

  assert.match(html, /<ul data-md-line="0"><li data-md-line="0">Parent<ul data-md-line="1"><li data-md-line="1">Child<\/li><\/ul><\/li><li data-md-line="2">Next<\/li><\/ul>/);
});

runTest("renders nested ordered lists from indented Markdown", function () {
  const html = markdown.renderMarkdown("1. Parent\n  1. Child\n2. Next");

  assert.match(html, /<ol data-md-line="0"><li data-md-line="0">Parent<ol data-md-line="1"><li data-md-line="1">Child<\/li><\/ol><\/li><li data-md-line="2">Next<\/li><\/ol>/);
});

runTest("renders Markdown thematic breaks as horizontal rules", function () {
  const html = markdown.renderMarkdown("Before\n\n---\n\nAfter");

  assert.match(html, /<p data-md-line="0"><span data-md-line="0">Before<\/span><\/p>\n<hr data-md-line="2">\n<p data-md-line="4"><span data-md-line="4">After<\/span><\/p>/);
});

runTest("splits paragraphs when a thematic break appears between lines", function () {
  const html = markdown.renderMarkdown("Before\n---\nAfter");

  assert.match(html, /<p data-md-line="0"><span data-md-line="0">Before<\/span><\/p>\n<hr data-md-line="1">\n<p data-md-line="2"><span data-md-line="2">After<\/span><\/p>/);
});
