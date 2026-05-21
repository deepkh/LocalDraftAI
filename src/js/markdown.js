(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var utils = ME.utils;
  var escapeHtml = utils.escapeHtml;
  var escapeAttribute = utils.escapeAttribute;
  var sanitizeUrl = utils.sanitizeUrl;
  var textContent = utils.textContent;
  var cleanMarkdownSpacing = utils.cleanMarkdownSpacing;
  var prefixLines = utils.prefixLines;

  function createTokenStore() {
    var items = [];

    return {
      save: function (html) {
        var index = items.push(html) - 1;
        return "\u0000MDTOKEN" + index + "\u0000";
      },
      restore: function (html) {
        return html.replace(/\u0000MDTOKEN(\d+)\u0000/g, function (_, index) {
          return items[Number(index)] || "";
        });
      }
    };
  }

  function renderInline(value) {
    var tokens = createTokenStore();
    var text = String(value || "");

    text = text.replace(/`([^`\n]+)`/g, function (_, code) {
      return tokens.save("<code>" + escapeHtml(code) + "</code>");
    });

    text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function (match, label, href) {
      var safeHref = sanitizeUrl(href);
      if (!safeHref) {
        return match;
      }

      return tokens.save(
        '<a href="' + escapeAttribute(safeHref) + '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(label) +
        "</a>"
      );
    });

    text = escapeHtml(text);
    text = text.replace(/(\*\*|__)(.+?)\1/g, "<strong>$2</strong>");
    text = text.replace(/(^|[^\w*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    text = text.replace(/(^|[^\w_])_([^_\n]+)_/g, "$1<em>$2</em>");

    return tokens.restore(text);
  }

  function isBlank(line) {
    return /^\s*$/.test(line);
  }

  function isBlockStart(line) {
    return (
      /^```/.test(line) ||
      /^(#{1,6})\s+/.test(line) ||
      /^>\s?/.test(line) ||
      /^\s*([-*+])\s+/.test(line) ||
      /^\s*\d+[.)]\s+/.test(line)
    );
  }

  function blockAttrs(lineIndex) {
    return ' data-md-line="' + Math.max(0, lineIndex) + '"';
  }

  function renderMarkdown(markdown, baseLine) {
    var lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    var lineOffset = baseLine || 0;
    var html = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      if (isBlank(line)) {
        i += 1;
        continue;
      }

      var fence = line.match(/^```\s*([A-Za-z0-9_-]+)?\s*$/);
      if (fence) {
        var codeLines = [];
        var fenceLine = lineOffset + i;
        i += 1;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) {
          codeLines.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) {
          i += 1;
        }
        html.push("<pre" + blockAttrs(fenceLine) + "><code>" + codeLines.map(function (codeLine, index) {
          return "<span" + blockAttrs(fenceLine + index + 1) + ">" + escapeHtml(codeLine) + "</span>";
        }).join("\n") + "</code></pre>");
        continue;
      }

      var heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        var level = heading[1].length;
        html.push("<h" + level + blockAttrs(lineOffset + i) + ">" + renderInline(heading[2]) + "</h" + level + ">");
        i += 1;
        continue;
      }

      if (/^>\s?/.test(line)) {
        var quoteLines = [];
        var quoteLine = lineOffset + i;
        while (i < lines.length && (/^>\s?/.test(lines[i]) || isBlank(lines[i]))) {
          if (isBlank(lines[i])) {
            quoteLines.push("");
          } else {
            quoteLines.push(lines[i].replace(/^>\s?/, ""));
          }
          i += 1;
        }
        html.push("<blockquote" + blockAttrs(quoteLine) + ">" + renderMarkdown(quoteLines.join("\n"), quoteLine) + "</blockquote>");
        continue;
      }

      if (/^\s*([-*+])\s+/.test(line)) {
        var bulletItems = [];
        var bulletLine = lineOffset + i;
        while (i < lines.length && /^\s*([-*+])\s+/.test(lines[i])) {
          bulletItems.push({
            line: lineOffset + i,
            text: lines[i].replace(/^\s*([-*+])\s+/, "")
          });
          i += 1;
        }
        html.push("<ul" + blockAttrs(bulletLine) + ">" + bulletItems.map(function (item) {
          return "<li" + blockAttrs(item.line) + ">" + renderInline(item.text) + "</li>";
        }).join("") + "</ul>");
        continue;
      }

      if (/^\s*\d+[.)]\s+/.test(line)) {
        var orderedItems = [];
        var orderedLine = lineOffset + i;
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          orderedItems.push({
            line: lineOffset + i,
            text: lines[i].replace(/^\s*\d+[.)]\s+/, "")
          });
          i += 1;
        }
        html.push("<ol" + blockAttrs(orderedLine) + ">" + orderedItems.map(function (item) {
          return "<li" + blockAttrs(item.line) + ">" + renderInline(item.text) + "</li>";
        }).join("") + "</ol>");
        continue;
      }

      var paragraph = [];
      var paragraphLine = lineOffset + i;
      while (i < lines.length && !isBlank(lines[i]) && !isBlockStart(lines[i])) {
        paragraph.push(lines[i]);
        i += 1;
      }

      if (paragraph.length) {
        html.push("<p" + blockAttrs(paragraphLine) + ">" + paragraph.map(function (paragraphText, index) {
          return "<span" + blockAttrs(paragraphLine + index) + ">" + renderInline(paragraphText) + "</span>";
        }).join("<br>") + "</p>");
      } else {
        i += 1;
      }
    }

    return html.join("\n");
  }

  function inlineNodesToMarkdown(node) {
    var output = "";
    Array.prototype.forEach.call(node.childNodes, function (child) {
      output += nodeToMarkdown(child, true);
    });
    return output;
  }

  function isMarkdownBlockElement(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    return /^(blockquote|div|h[1-6]|li|ol|p|pre|section|article|ul)$/i.test(node.tagName);
  }

  function hasMarkdownBlockChildren(node) {
    return Array.prototype.some.call(node.childNodes, isMarkdownBlockElement);
  }

  function blockChildrenToMarkdown(node, depth) {
    var parts = [];
    var inlineBuffer = "";

    function flushInlineBuffer() {
      var inline = inlineBuffer.trim();
      if (inline) {
        parts.push(inline);
      }
      inlineBuffer = "";
    }

    Array.prototype.forEach.call(node.childNodes, function (child) {
      if (!isMarkdownBlockElement(child)) {
        inlineBuffer += nodeToMarkdown(child, true);
        return;
      }

      flushInlineBuffer();
      var rendered = nodeToMarkdown(child, false, depth);
      if (rendered.trim()) {
        parts.push(rendered.trim());
      }
    });

    flushInlineBuffer();
    return parts.join("\n\n");
  }

  function listItemToMarkdown(item, marker, depth) {
    var content = hasMarkdownBlockChildren(item)
      ? blockChildrenToMarkdown(item, depth + 1)
      : inlineNodesToMarkdown(item).trim();

    var lines = content.split("\n");
    var first = lines.shift() || "";
    var continuation = lines.map(function (line) {
      return "  " + line;
    });

    return marker + " " + first + (continuation.length ? "\n" + continuation.join("\n") : "");
  }

  function nodeToMarkdown(node, inline, depth) {
    var childDepth = depth || 0;

    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue || "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    var tag = node.tagName.toLowerCase();

    if (tag === "br") {
      return "\n";
    }

    if (tag === "strong" || tag === "b") {
      return "**" + inlineNodesToMarkdown(node).trim() + "**";
    }

    if (tag === "em" || tag === "i") {
      return "*" + inlineNodesToMarkdown(node).trim() + "*";
    }

    if (tag === "code" && node.parentElement && node.parentElement.tagName.toLowerCase() !== "pre") {
      return "`" + textContent(node).replace(/`/g, "\\`") + "`";
    }

    if (tag === "a") {
      var href = sanitizeUrl(node.getAttribute("href") || "");
      var label = inlineNodesToMarkdown(node).trim() || href;
      return href ? "[" + label + "](" + href + ")" : label;
    }

    if (inline) {
      return inlineNodesToMarkdown(node);
    }

    if (/^h[1-6]$/.test(tag)) {
      return "#".repeat(Number(tag.charAt(1))) + " " + inlineNodesToMarkdown(node).trim();
    }

    if (tag === "pre") {
      return "```\n" + textContent(node).replace(/\n+$/g, "") + "\n```";
    }

    if (tag === "blockquote") {
      return prefixLines(blockChildrenToMarkdown(node, childDepth).trim(), "> ");
    }

    if (tag === "ul") {
      return Array.prototype.map.call(node.children, function (item) {
        return listItemToMarkdown(item, "-", childDepth);
      }).join("\n");
    }

    if (tag === "ol") {
      return Array.prototype.map.call(node.children, function (item, index) {
        return listItemToMarkdown(item, String(index + 1) + ".", childDepth);
      }).join("\n");
    }

    if (tag === "li") {
      return hasMarkdownBlockChildren(node)
        ? blockChildrenToMarkdown(node, childDepth)
        : inlineNodesToMarkdown(node).trim();
    }

    if (tag === "p" || tag === "div" || tag === "section" || tag === "article") {
      return hasMarkdownBlockChildren(node)
        ? blockChildrenToMarkdown(node, childDepth)
        : inlineNodesToMarkdown(node).trim();
    }

    return blockChildrenToMarkdown(node, childDepth) || inlineNodesToMarkdown(node).trim();
  }

  function htmlToMarkdown(root) {
    var parts = [];
    var inlineBuffer = "";

    function flushInlineBuffer() {
      var inline = inlineBuffer.trim();
      if (inline) {
        parts.push(inline);
      }
      inlineBuffer = "";
    }

    Array.prototype.forEach.call(root.childNodes, function (child) {
      if (!isMarkdownBlockElement(child)) {
        inlineBuffer += nodeToMarkdown(child, true);
        return;
      }

      flushInlineBuffer();
      var rendered = nodeToMarkdown(child, false, 0);
      if (rendered.trim()) {
        parts.push(rendered.trim());
      }
    });

    flushInlineBuffer();
    return cleanMarkdownSpacing(parts.join("\n\n"));
  }

  function sanitizePastedHtml(html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(String(html || ""), "text/html");
    var allowed = {
      a: true,
      b: true,
      blockquote: true,
      br: true,
      code: true,
      div: true,
      em: true,
      h1: true,
      h2: true,
      h3: true,
      h4: true,
      h5: true,
      h6: true,
      i: true,
      li: true,
      ol: true,
      p: true,
      pre: true,
      strong: true,
      ul: true
    };

    function clean(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return escapeHtml(node.nodeValue || "");
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return "";
      }

      var tag = node.tagName.toLowerCase();
      var children = Array.prototype.map.call(node.childNodes, clean).join("");

      if (!allowed[tag]) {
        return children;
      }

      if (tag === "b") {
        tag = "strong";
      }

      if (tag === "i") {
        tag = "em";
      }

      if (tag === "br") {
        return "<br>";
      }

      if (tag === "a") {
        var href = sanitizeUrl(node.getAttribute("href") || "");
        if (!href) {
          return children;
        }
        return '<a href="' + escapeAttribute(href) + '">' + children + "</a>";
      }

      return "<" + tag + ">" + children + "</" + tag + ">";
    }

    return Array.prototype.map.call(doc.body.childNodes, clean).join("");
  }

  ME.markdown = {
    renderInline: renderInline,
    renderMarkdown: renderMarkdown,
    htmlToMarkdown: htmlToMarkdown,
    sanitizePastedHtml: sanitizePastedHtml
  };
}());
