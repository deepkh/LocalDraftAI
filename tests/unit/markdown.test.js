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
