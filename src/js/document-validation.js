(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function result(status, message, line, column) {
    return {
      status: status,
      message: String(message || ""),
      line: typeof line === "number" ? line : null,
      column: typeof column === "number" ? column : null
    };
  }

  function lineColumnFromOffset(text, offset) {
    var source = String(text || "");
    var safeOffset = Math.max(0, Math.min(Number(offset) || 0, source.length));
    var before = source.slice(0, safeOffset);
    var lines = before.split("\n");

    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1
    };
  }

  function jsonErrorLocation(error, text) {
    var message = String(error && error.message || "");
    var lineColumn = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    var position = message.match(/(?:at\s+)?position\s+(\d+)/i);

    if (lineColumn) {
      return {
        line: Number(lineColumn[1]),
        column: Number(lineColumn[2])
      };
    }
    if (position) {
      return lineColumnFromOffset(text, Number(position[1]));
    }
    return { line: null, column: null };
  }

  function validateJson(text) {
    var source = String(text || "");
    var location;

    try {
      JSON.parse(source);
      return result("valid", "", null, null);
    } catch (error) {
      location = jsonErrorLocation(error, source);
      return result("invalid", error && error.message || "Invalid JSON.", location.line, location.column);
    }
  }

  function validateYaml(text) {
    var yaml = window.jsyaml;
    var mark;

    if (!yaml || typeof yaml.loadAll !== "function") {
      return result("invalid", "YAML validation is unavailable.", null, null);
    }

    try {
      yaml.loadAll(String(text || ""), function () {});
      return result("valid", "", null, null);
    } catch (error) {
      mark = error && error.mark;
      return result(
        "invalid",
        error && (error.reason || error.message) || "Invalid YAML.",
        mark && typeof mark.line === "number" ? mark.line + 1 : null,
        mark && typeof mark.column === "number" ? mark.column + 1 : null
      );
    }
  }

  function validateDocument(documentType, text) {
    var descriptor = ME.documentType && ME.documentType.getDocumentTypeById(documentType);
    var validationType = descriptor ? descriptor.validationType : null;

    if (validationType === "json") {
      return validateJson(text);
    }
    if (validationType === "yaml") {
      return validateYaml(text);
    }
    return result("not-applicable", "", null, null);
  }

  ME.documentValidation = {
    lineColumnFromOffset: lineColumnFromOffset,
    validateDocument: validateDocument
  };
}());
