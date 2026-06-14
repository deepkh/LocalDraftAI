(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var utils = ME.utils;
  var escapeHtml = utils.escapeHtml;
  var escapeAttribute = utils.escapeAttribute;
  var sanitizeUrl = utils.sanitizeUrl;
  var sanitizeImageUrl = utils.sanitizeImageUrl;
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

  function markdownImageAlt(value) {
    return String(value || "")
      .replace(/[\r\n]+/g, " ")
      .replace(/[\[\]]/g, "")
      .trim();
  }

  function escapeMarkdownText(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/([`*_{}\[\]()!|])/g, "\\$1");
  }

  function unescapeMarkdownText(value) {
    return String(value || "").replace(/\\([\\`*_{}\[\]()#\+\-.!|>])/g, "$1");
  }

  function escapeMarkdownBlockStarts(value) {
    return String(value || "").split("\n").map(function (line) {
      if (/^(\s{0,3})(#{1,6})(\s+)/.test(line)) {
        return line.replace(/^(\s{0,3})#/, "$1\\#");
      }

      if (/^(\s*)([-+])(\s+)/.test(line)) {
        return line.replace(/^(\s*)([-+])/, "$1\\$2");
      }

      if (/^(\s*)>(\s?)/.test(line)) {
        return line.replace(/^(\s*)>/, "$1\\>");
      }

      if (/^(\s*)\d+[.)]\s+/.test(line)) {
        return line.replace(/^(\s*\d+)([.)])/, "$1\\$2");
      }

      if (/^\s{0,3}-(?:\s*-){2,}\s*$/.test(line)) {
        return line.replace(/^(\s*)-/, "$1\\-");
      }

      return line;
    }).join("\n");
  }

  function imageDisplaySource(src, options) {
    var safeSrc = sanitizeImageUrl(src);
    var displaySrc;

    if (!safeSrc) {
      return null;
    }

    displaySrc = safeSrc;
    if (options && typeof options.resolveImageUrl === "function") {
      displaySrc = sanitizeImageUrl(options.resolveImageUrl(safeSrc) || safeSrc) || safeSrc;
    }

    return {
      displaySrc: displaySrc,
      markdownSrc: safeSrc
    };
  }

  function renderInline(value, options) {
    var tokens = createTokenStore();
    var text = String(value || "");

    text = text.replace(/`([^`\n]+)`/g, function (_, code) {
      return tokens.save("<code>" + escapeHtml(code) + "</code>");
    });

    text = text.replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, function (match, alt, src) {
      var image = imageDisplaySource(src, options);
      if (!image) {
        return tokens.save(escapeHtml(match));
      }

      return tokens.save(
        '<img src="' + escapeAttribute(image.displaySrc) + '" alt="' + escapeAttribute(alt) + '" data-md-src="' + escapeAttribute(image.markdownSrc) + '">'
      );
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

    text = text.replace(/\\([\\`*_{}\[\]()#\+\-.!|>])/g, function (_, escaped) {
      return tokens.save(escapeHtml(escaped));
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

  function isThematicBreak(line) {
    var match = String(line || "").match(/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/);
    return !!match;
  }

  function splitTableRow(line) {
    var text = String(line || "");
    var cells = [];
    var cell = "";
    var codeTicks = 0;
    var i = 0;

    while (i < text.length) {
      var character = text.charAt(i);

      if (character === "\\" && i + 1 < text.length) {
        cell += character + text.charAt(i + 1);
        i += 2;
        continue;
      }

      if (character === "`") {
        var tickStart = i;
        while (i < text.length && text.charAt(i) === "`") {
          i += 1;
        }
        var tickCount = i - tickStart;
        cell += text.slice(tickStart, i);
        if (!codeTicks) {
          codeTicks = tickCount;
        } else if (tickCount === codeTicks) {
          codeTicks = 0;
        }
        continue;
      }

      if (character === "|" && !codeTicks) {
        cells.push(cell);
        cell = "";
        i += 1;
        continue;
      }

      cell += character;
      i += 1;
    }

    cells.push(cell);
    if (/^\s*\|/.test(text) && cells.length && !cells[0].trim()) {
      cells.shift();
    }
    if (/\|\s*$/.test(text) && cells.length && !cells[cells.length - 1].trim()) {
      cells.pop();
    }

    return cells.map(normalizeTableCell);
  }

  function normalizeTableCell(value) {
    return String(value || "").trim();
  }

  function isTableDelimiterCell(value) {
    return /^:?-{3,}:?$/.test(normalizeTableCell(value));
  }

  function parseTableDelimiter(line) {
    var cells = splitTableRow(line);

    if (!cells.length || !cells.every(isTableDelimiterCell)) {
      return null;
    }

    return cells.map(function (cell) {
      var left = cell.charAt(0) === ":";
      var right = cell.charAt(cell.length - 1) === ":";

      if (left && right) {
        return "center";
      }
      if (right) {
        return "right";
      }
      if (left) {
        return "left";
      }
      return "";
    });
  }

  function isExplicitSingleCellTableRow(line) {
    return /^\s*\|[\s\S]*\|\s*$/.test(String(line || ""));
  }

  function isTableStart(lines, index) {
    var headerCells;
    var alignments;

    if (index + 1 >= lines.length) {
      return false;
    }

    headerCells = splitTableRow(lines[index]);
    alignments = parseTableDelimiter(lines[index + 1]);

    if (!alignments || headerCells.length !== alignments.length) {
      return false;
    }

    return headerCells.length >= 2 || (
      headerCells.length === 1 &&
      isExplicitSingleCellTableRow(lines[index]) &&
      isExplicitSingleCellTableRow(lines[index + 1])
    );
  }

  function tableCellAttributes(alignment) {
    if (!alignment) {
      return "";
    }

    return ' data-md-align="' + alignment + '" class="md-table-align-' + alignment + '"';
  }

  function normalizeTableRow(cells, length) {
    var normalized = cells.slice(0, length);
    while (normalized.length < length) {
      normalized.push("");
    }
    return normalized;
  }

  function parseTableBlock(lines, start, lineOffset, options) {
    var headerCells = splitTableRow(lines[start]);
    var alignments = parseTableDelimiter(lines[start + 1]);
    var i = start + 2;
    var bodyRows = [];
    var headerHtml;
    var bodyHtml;

    while (i < lines.length && !isBlank(lines[i])) {
      var cells = splitTableRow(lines[i]);
      var isRow = headerCells.length === 1
        ? isExplicitSingleCellTableRow(lines[i])
        : cells.length > 1 || isExplicitSingleCellTableRow(lines[i]);

      if (!isRow) {
        break;
      }

      bodyRows.push({
        cells: normalizeTableRow(cells, headerCells.length),
        line: lineOffset + i
      });
      i += 1;
    }

    headerHtml = headerCells.map(function (cell, index) {
      return "<th" + tableCellAttributes(alignments[index]) + ">" + renderInline(cell, options) + "</th>";
    }).join("");
    bodyHtml = bodyRows.map(function (row) {
      return "<tr" + blockAttrs(row.line) + ">" + row.cells.map(function (cell, index) {
        return "<td" + tableCellAttributes(alignments[index]) + ">" + renderInline(cell, options) + "</td>";
      }).join("") + "</tr>";
    }).join("");

    return {
      html: '<table class="md-table"' + blockAttrs(lineOffset + start) + "><thead><tr" + blockAttrs(lineOffset + start) + ">" + headerHtml + "</tr></thead><tbody>" + bodyHtml + "</tbody></table>",
      end: i
    };
  }

  function isBlockStart(line) {
    return (
      /^```/.test(line) ||
      /^(#{1,6})\s+/.test(line) ||
      /^>\s?/.test(line) ||
      isThematicBreak(line) ||
      /^\s*([-*+])\s+/.test(line) ||
      /^\s*\d+[.)]\s+/.test(line)
    );
  }

  function blockAttrs(lineIndex) {
    return ' data-md-line="' + Math.max(0, lineIndex) + '"';
  }

  function fenceInfoAttribute(value) {
    var info = String(value || "").trim();

    return /^[A-Za-z0-9_-]+$/.test(info)
      ? ' data-md-fence-info="' + escapeAttribute(info) + '"'
      : "";
  }

  function markdownFenceInfo(node) {
    var info = node.getAttribute("data-md-fence-info") || "";
    var code;

    if (!info) {
      code = node.querySelector ? node.querySelector("code[data-md-fence-info]") : null;
      info = code ? code.getAttribute("data-md-fence-info") || "" : "";
    }

    return /^[A-Za-z0-9_-]+$/.test(info) ? info : "";
  }

  function listLineInfo(line) {
    var match = String(line || "").match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
    var marker;

    if (!match) {
      return null;
    }

    marker = match[2];
    return {
      indent: match[1].replace(/\t/g, "  ").length,
      ordered: /^\d/.test(marker),
      text: match[3]
    };
  }

  function renderListBlock(lines, start, lineOffset, options) {
    var first = listLineInfo(lines[start]);
    var tag = first.ordered ? "ol" : "ul";
    var startIndent = first.indent;
    var i = start;
    var items = [];

    while (i < lines.length) {
      var info = listLineInfo(lines[i]);
      var itemHtml;

      if (!info || info.indent < startIndent) {
        break;
      }

      if (info.indent > startIndent) {
        if (!items.length) {
          break;
        }
        var nested = renderListBlock(lines, i, lineOffset, options);
        items[items.length - 1] += nested.html;
        i = nested.end;
        continue;
      }

      if (info.ordered !== first.ordered) {
        break;
      }

      itemHtml = "<li" + blockAttrs(lineOffset + i) + ">" + renderInline(info.text, options);
      i += 1;

      while (i < lines.length) {
        var next = listLineInfo(lines[i]);
        if (!next || next.indent <= startIndent) {
          break;
        }
        var child = renderListBlock(lines, i, lineOffset, options);
        itemHtml += child.html;
        i = child.end;
      }

      itemHtml += "</li>";
      items.push(itemHtml);
    }

    return {
      html: "<" + tag + blockAttrs(lineOffset + start) + ">" + items.join("") + "</" + tag + ">",
      end: i
    };
  }

  function renderMarkdown(markdown, baseLine, options) {
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
        html.push("<pre" + blockAttrs(fenceLine) + fenceInfoAttribute(fence[1]) + "><code" + fenceInfoAttribute(fence[1]) + ">" + codeLines.map(function (codeLine, index) {
          return "<span" + blockAttrs(fenceLine + index + 1) + ">" + escapeHtml(codeLine) + "</span>";
        }).join("\n") + "</code></pre>");
        continue;
      }

      var heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        var level = heading[1].length;
        html.push("<h" + level + blockAttrs(lineOffset + i) + ' data-md-heading-level="' + level + '">' + renderInline(heading[2], options) + "</h" + level + ">");
        i += 1;
        continue;
      }

      if (isThematicBreak(line)) {
        html.push("<hr" + blockAttrs(lineOffset + i) + ">");
        i += 1;
        continue;
      }

      if (isTableStart(lines, i)) {
        var tableBlock = parseTableBlock(lines, i, lineOffset, options);
        html.push(tableBlock.html);
        i = tableBlock.end;
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
        html.push("<blockquote" + blockAttrs(quoteLine) + ">" + renderMarkdown(quoteLines.join("\n"), quoteLine, options) + "</blockquote>");
        continue;
      }

      if (listLineInfo(line)) {
        var listBlock = renderListBlock(lines, i, lineOffset, options);
        html.push(listBlock.html);
        i = listBlock.end;
        continue;
      }

      var paragraph = [];
      var paragraphLine = lineOffset + i;
      while (i < lines.length && !isBlank(lines[i]) && !isBlockStart(lines[i]) && !isTableStart(lines, i)) {
        paragraph.push(lines[i]);
        i += 1;
      }

      if (paragraph.length) {
        html.push("<p" + blockAttrs(paragraphLine) + ">" + paragraph.map(function (paragraphText, index) {
          return "<span" + blockAttrs(paragraphLine + index) + ">" + renderInline(paragraphText, options) + "</span>";
        }).join("<br>") + "</p>");
      } else {
        i += 1;
      }
    }

    return html.join("");
  }

  function inlineNodesToMarkdown(node) {
    var output = "";
    Array.prototype.forEach.call(node.childNodes, function (child) {
      output += nodeToMarkdown(child, true);
    });
    return output;
  }

  function isListElement(node) {
    return (
      node.nodeType === Node.ELEMENT_NODE &&
      /^(ol|ul)$/i.test(node.tagName)
    );
  }

  function isMarkdownBlockElement(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    return /^(blockquote|div|h[1-6]|hr|li|ol|p|pre|section|article|table|ul)$/i.test(node.tagName);
  }

  function hasMarkdownBlockChildren(node) {
    return Array.prototype.some.call(node.childNodes, isMarkdownBlockElement);
  }

  function isCodeLineElement(node) {
    return (
      node.nodeType === Node.ELEMENT_NODE &&
      /^(div|p|li|tr)$/i.test(node.tagName)
    );
  }

  function codeBlockText(node) {
    var output = "";

    function appendLineBreak() {
      if (output && !/\n$/.test(output)) {
        output += "\n";
      }
    }

    function walk(current) {
      if (current.nodeType === Node.TEXT_NODE) {
        output += current.nodeValue || "";
        return;
      }

      if (current.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      var tag = current.tagName.toLowerCase();
      if (tag === "br") {
        output += "\n";
        return;
      }

      Array.prototype.forEach.call(current.childNodes, walk);

      if (isCodeLineElement(current)) {
        appendLineBreak();
      }
    }

    walk(node);
    return output.replace(/\r\n?/g, "\n");
  }

  function blockChildrenToMarkdown(node, depth) {
    var parts = [];
    var inlineBuffer = "";

    function flushInlineBuffer() {
      var inline = escapeMarkdownBlockStarts(inlineBuffer.trim());
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
    var parts = [];
    var nested = [];
    var inlineBuffer = "";

    function flushInlineBuffer() {
      var inline = escapeMarkdownBlockStarts(inlineBuffer.trim());
      if (inline) {
        parts.push(inline);
      }
      inlineBuffer = "";
    }

    Array.prototype.forEach.call(item.childNodes, function (child) {
      var rendered;

      if (isListElement(child)) {
        flushInlineBuffer();
        rendered = nodeToMarkdown(child, false, depth + 1).trim();
        if (rendered) {
          nested.push(rendered);
        }
        return;
      }

      if (!isMarkdownBlockElement(child)) {
        inlineBuffer += nodeToMarkdown(child, true);
        return;
      }

      flushInlineBuffer();
      rendered = nodeToMarkdown(child, false, depth + 1).trim();
      if (rendered) {
        parts.push(rendered);
      }
    });

    flushInlineBuffer();

    var content = parts.join("\n\n");
    var lines = content.split("\n");
    var first = lines.shift() || "";
    var continuation = lines.map(function (line) {
      return "  " + line;
    });
    var output = marker + " " + first + (continuation.length ? "\n" + continuation.join("\n") : "");

    nested.forEach(function (childMarkdown) {
      output += "\n" + childMarkdown.split("\n").map(function (line) {
        return "  " + line;
      }).join("\n");
    });

    return output;
  }

  function listChildrenToMarkdown(list, markerForItem, depth) {
    var items = [];
    var itemIndex = 0;

    Array.prototype.forEach.call(list.childNodes, function (child) {
      var rendered;

      if (child.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      if (child.tagName && child.tagName.toLowerCase() === "li") {
        itemIndex += 1;
        items.push(listItemToMarkdown(child, markerForItem(itemIndex), depth));
        return;
      }

      if (isListElement(child)) {
        rendered = nodeToMarkdown(child, false, depth + 1).trim();
        if (!rendered) {
          return;
        }

        rendered = rendered.split("\n").map(function (line) {
          return "  " + line;
        }).join("\n");

        if (items.length) {
          items[items.length - 1] += "\n" + rendered;
        } else {
          items.push(rendered.replace(/^ {2}/gm, ""));
        }
      }
    });

    return items.join("\n");
  }

  function tableRows(table) {
    var rows = [];

    function walk(node) {
      Array.prototype.forEach.call(node.children || [], function (child) {
        var tag = child.tagName.toLowerCase();

        if (tag === "table") {
          return;
        }
        if (tag === "tr") {
          rows.push(child);
          return;
        }
        walk(child);
      });
    }

    walk(table);
    return rows;
  }

  function tableRowCells(row) {
    return Array.prototype.filter.call(row.children || [], function (child) {
      return /^(th|td)$/i.test(child.tagName);
    });
  }

  function escapeTableCellPipes(value) {
    var text = String(value || "");
    var output = "";
    var codeTicks = 0;
    var i = 0;

    while (i < text.length) {
      var character = text.charAt(i);

      if (character === "\\" && i + 1 < text.length) {
        output += character + text.charAt(i + 1);
        i += 2;
        continue;
      }

      if (character === "`") {
        var tickStart = i;
        while (i < text.length && text.charAt(i) === "`") {
          i += 1;
        }
        var tickCount = i - tickStart;
        output += text.slice(tickStart, i);
        if (!codeTicks) {
          codeTicks = tickCount;
        } else if (tickCount === codeTicks) {
          codeTicks = 0;
        }
        continue;
      }

      output += character === "|" && !codeTicks ? "\\|" : character;
      i += 1;
    }

    return output;
  }

  function tableCellToMarkdown(cell) {
    return escapeTableCellPipes(
      inlineNodesToMarkdown(cell).replace(/\s*\n+\s*/g, " ").trim()
    );
  }

  function tableCellAlignment(cell) {
    var alignment = String(cell.getAttribute("data-md-align") || cell.getAttribute("align") || "").toLowerCase();
    var className;
    var classMatch;

    if (/^(left|center|right)$/.test(alignment)) {
      return alignment;
    }

    className = cell.getAttribute("class") || "";
    classMatch = className.match(/(?:^|\s)md-table-align-(left|center|right)(?:\s|$)/);
    return classMatch ? classMatch[1] : "";
  }

  function tableDelimiterForAlignment(alignment) {
    if (alignment === "left") {
      return ":---";
    }
    if (alignment === "center") {
      return ":---:";
    }
    if (alignment === "right") {
      return "---:";
    }
    return "---";
  }

  function tableToMarkdown(table) {
    var rows = tableRows(table);
    var headerRow = rows[0];
    var headerCells;
    var columnCount;
    var output;

    if (!headerRow) {
      return "";
    }

    headerCells = tableRowCells(headerRow);
    columnCount = headerCells.length;
    if (!columnCount) {
      return "";
    }

    output = [
      "| " + headerCells.map(tableCellToMarkdown).join(" | ") + " |",
      "| " + headerCells.map(function (cell) {
        return tableDelimiterForAlignment(tableCellAlignment(cell));
      }).join(" | ") + " |"
    ];

    rows.slice(1).forEach(function (row) {
      var cells = tableRowCells(row).slice(0, columnCount);
      while (cells.length < columnCount) {
        cells.push(null);
      }
      output.push("| " + cells.map(function (cell) {
        return cell ? tableCellToMarkdown(cell) : "";
      }).join(" | ") + " |");
    });

    return output.join("\n");
  }

  function nodeToMarkdown(node, inline, depth) {
    var childDepth = depth || 0;

    if (node.nodeType === Node.TEXT_NODE) {
      return escapeMarkdownText(node.nodeValue || "");
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

    if (tag === "img") {
      var src = sanitizeImageUrl(node.getAttribute("data-md-src") || node.getAttribute("src") || "");
      var alt = markdownImageAlt(node.getAttribute("alt") || "");
      return src ? "![" + alt + "](" + src + ")" : "";
    }

    if (inline) {
      return inlineNodesToMarkdown(node);
    }

    if (/^h[1-6]$/.test(tag)) {
      return "#".repeat(Number(tag.charAt(1))) + " " + inlineNodesToMarkdown(node).trim();
    }

    if (node.getAttribute && node.getAttribute("data-md-heading-level")) {
      var headingLevel = Math.max(1, Math.min(6, Number(node.getAttribute("data-md-heading-level")) || 1));
      return "#".repeat(headingLevel) + " " + inlineNodesToMarkdown(node).trim();
    }

    if (tag === "hr") {
      return "---";
    }

    if (tag === "pre") {
      var info = markdownFenceInfo(node);
      return "```" + info + "\n" + codeBlockText(node).replace(/\n+$/g, "") + "\n```";
    }

    if (tag === "table") {
      return tableToMarkdown(node);
    }

    if (tag === "blockquote") {
      return prefixLines(blockChildrenToMarkdown(node, childDepth).trim(), "> ");
    }

    if (tag === "ul") {
      return listChildrenToMarkdown(node, function () {
        return "-";
      }, childDepth);
    }

    if (tag === "ol") {
      return listChildrenToMarkdown(node, function (index) {
        return String(index) + ".";
      }, childDepth);
    }

    if (tag === "li") {
      return hasMarkdownBlockChildren(node)
        ? blockChildrenToMarkdown(node, childDepth)
        : inlineNodesToMarkdown(node).trim();
    }

    if (tag === "p" || tag === "div" || tag === "section" || tag === "article") {
      return hasMarkdownBlockChildren(node)
        ? blockChildrenToMarkdown(node, childDepth)
        : escapeMarkdownBlockStarts(inlineNodesToMarkdown(node).trim());
    }

    return blockChildrenToMarkdown(node, childDepth) || inlineNodesToMarkdown(node).trim();
  }

  function htmlToMarkdown(root) {
    var parts = [];
    var inlineBuffer = "";

    function flushInlineBuffer() {
      var inline = escapeMarkdownBlockStarts(inlineBuffer.trim());
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
      hr: true,
      img: true,
      i: true,
      li: true,
      ol: true,
      p: true,
      pre: true,
      strong: true,
      table: true,
      tbody: true,
      td: true,
      th: true,
      thead: true,
      tr: true,
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

      if (!allowed[tag]) {
        return Array.prototype.map.call(node.childNodes, function (child) {
          return clean(child);
        }).join("");
      }

      if (tag === "pre") {
        return "<pre><code>" + escapeHtml(codeBlockText(node).replace(/\n+$/g, "")) + "</code></pre>";
      }

      var children = Array.prototype.map.call(node.childNodes, function (child) {
        return clean(child);
      }).join("");

      if (tag === "b") {
        tag = "strong";
      }

      if (tag === "i") {
        tag = "em";
      }

      if (tag === "br") {
        return "<br>";
      }

      if (tag === "hr") {
        return "<hr>";
      }

      if (tag === "a") {
        var href = sanitizeUrl(node.getAttribute("href") || "");
        if (!href) {
          return children;
        }
        return '<a href="' + escapeAttribute(href) + '">' + children + "</a>";
      }

      if (tag === "img") {
        var src = sanitizeImageUrl(node.getAttribute("src") || "");
        var alt = markdownImageAlt(node.getAttribute("alt") || "");
        if (!src) {
          return "";
        }
        return '<img src="' + escapeAttribute(src) + '" alt="' + escapeAttribute(alt) + '">';
      }

      if (tag === "table") {
        return '<table class="md-table">' + children + "</table>";
      }

      if (tag === "th" || tag === "td") {
        var alignment = String(node.getAttribute("data-md-align") || node.getAttribute("align") || "").toLowerCase();
        var alignmentAttribute = /^(left|center|right)$/.test(alignment)
          ? ' data-md-align="' + alignment + '"'
          : "";
        return "<" + tag + alignmentAttribute + ">" + children + "</" + tag + ">";
      }

      return "<" + tag + ">" + children + "</" + tag + ">";
    }

    return Array.prototype.map.call(doc.body.childNodes, function (child) {
      return clean(child);
    }).join("");
  }

  ME.markdown = {
    escapeMarkdownBlockStarts: escapeMarkdownBlockStarts,
    escapeMarkdownText: escapeMarkdownText,
    renderInline: renderInline,
    renderMarkdown: renderMarkdown,
    htmlToMarkdown: htmlToMarkdown,
    sanitizePastedHtml: sanitizePastedHtml,
    unescapeMarkdownText: unescapeMarkdownText
  };
}());
