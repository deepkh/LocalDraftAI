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

  function sanitizeUrlWithProtocols(value, protocols) {
    var url = String(value || "").trim();
    var compact = url.replace(/[\u0000-\u001f\u007f\s]+/g, "");
    var protocolMatch;
    var protocol;

    if (!url) {
      return "";
    }

    if (/[\u0000-\u001f\u007f]/.test(url) || /[\\]/.test(url)) {
      return "";
    }

    if (/^(javascript|data|vbscript):/i.test(compact)) {
      return "";
    }

    protocolMatch = compact.match(/^([a-z][a-z0-9+.-]*):/i);
    if (protocolMatch) {
      protocol = protocolMatch[1].toLowerCase();
      return protocols[protocol] ? url : "";
    }

    if (/^#/.test(url) || /^\/(?!\/)/.test(url) || /^\.{1,2}\//.test(url)) {
      return url;
    }

    if (/^[A-Za-z0-9._~-]/.test(url)) {
      return url;
    }

    return "";
  }

  function sanitizeUrl(value) {
    return sanitizeUrlWithProtocols(value, {
      http: true,
      https: true,
      mailto: true,
      tel: true
    });
  }

  function sanitizeImageUrl(value) {
    return sanitizeUrlWithProtocols(value, {
      blob: true,
      http: true,
      https: true
    });
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
    sanitizeImageUrl: sanitizeImageUrl,
    sanitizeUrl: sanitizeUrl,
    textContent: textContent,
    cleanMarkdownSpacing: cleanMarkdownSpacing,
    prefixLines: prefixLines,
    normalizeViewportText: normalizeViewportText,
    clamp: clamp
  };
}());
