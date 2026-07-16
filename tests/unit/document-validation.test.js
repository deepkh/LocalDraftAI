const assert = require("node:assert/strict");

global.window = {
  jsyaml: require("../../src/js/vendor/js-yaml.min.js")
};
require("../../src/js/document-type.js");
require("../../src/js/document-validation.js");

const validateDocument = window.MarkdownEditor.documentValidation.validateDocument;

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

runTest("validates JSON without changing the input", function () {
  const text = "{\n  \"enabled\": true\n}\n";
  const result = validateDocument("json", text);

  assert.equal(result.status, "valid");
  assert.equal(text, "{\n  \"enabled\": true\n}\n");
});

runTest("reports invalid and empty JSON", function () {
  const invalid = validateDocument("json", "{\n  \"enabled\":\n}");
  const empty = validateDocument("json", "");

  assert.equal(invalid.status, "invalid");
  assert.ok(invalid.message);
  assert.equal(empty.status, "invalid");
});

runTest("accepts valid, empty, and multi-document YAML", function () {
  assert.equal(validateDocument("yaml", "name: first\n").status, "valid");
  assert.equal(validateDocument("yaml", "").status, "valid");
  assert.equal(validateDocument("yaml", "---\nname: first\n---\nname: second\n").status, "valid");
});

runTest("reports invalid YAML with source location when available", function () {
  const result = validateDocument("yaml", "name: [broken\n");

  assert.equal(result.status, "invalid");
  assert.ok(result.message);
  assert.equal(typeof result.line, "number");
  assert.equal(typeof result.column, "number");
});

runTest("returns not-applicable for Markdown and plain text", function () {
  assert.equal(validateDocument("markdown", "# Title").status, "not-applicable");
  assert.equal(validateDocument("text", "Title").status, "not-applicable");
});
