(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function sanitizeUrl(value) {
    var url = String(value || "").trim();
    if (!url) {
      return "";
    }

    if (/^(https?:|mailto:|tel:)/i.test(url) || /^[#/]/.test(url)) {
      return url;
    }

    return "";
  }

  function textContent(node) {
    return node.textContent || "";
  }

  function cleanMarkdownSpacing(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function prefixLines(value, prefix) {
    return String(value || "").split("\n").map(function (line) {
      return prefix + line;
    }).join("\n");
  }

  function normalizeViewportText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  ME.utils = {
    escapeHtml: escapeHtml,
    escapeAttribute: escapeAttribute,
    sanitizeUrl: sanitizeUrl,
    textContent: textContent,
    cleanMarkdownSpacing: cleanMarkdownSpacing,
    prefixLines: prefixLines,
    normalizeViewportText: normalizeViewportText,
    clamp: clamp
  };
}());
