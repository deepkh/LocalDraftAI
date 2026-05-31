(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function normalizeText(value) {
    return String(value || "").replace(/\r\n?/g, "\n");
  }

  function splitLines(value) {
    var text = normalizeText(value);

    return text ? text.split("\n") : [];
  }

  function tokenize(value) {
    return String(value || "").match(/(\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_])/g) || [];
  }

  function lcsMatrix(left, right) {
    var rows = left.length;
    var cols = right.length;
    var matrix = new Array(rows + 1);
    var i;
    var j;

    for (i = 0; i <= rows; i += 1) {
      matrix[i] = new Int32Array(cols + 1);
    }

    for (i = rows - 1; i >= 0; i -= 1) {
      for (j = cols - 1; j >= 0; j -= 1) {
        matrix[i][j] = left[i] === right[j]
          ? matrix[i + 1][j + 1] + 1
          : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
      }
    }

    return matrix;
  }

  function rawDiff(left, right) {
    var matrix = lcsMatrix(left, right);
    var i = 0;
    var j = 0;
    var operations = [];

    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) {
        operations.push({
          type: "same",
          oldText: left[i],
          newText: right[j]
        });
        i += 1;
        j += 1;
      } else if (matrix[i + 1][j] >= matrix[i][j + 1]) {
        operations.push({
          type: "removed",
          oldText: left[i]
        });
        i += 1;
      } else {
        operations.push({
          type: "added",
          newText: right[j]
        });
        j += 1;
      }
    }

    while (i < left.length) {
      operations.push({
        type: "removed",
        oldText: left[i]
      });
      i += 1;
    }

    while (j < right.length) {
      operations.push({
        type: "added",
        newText: right[j]
      });
      j += 1;
    }

    return operations;
  }

  function appendSegment(segments, type, text) {
    var previous;

    if (!text) {
      return;
    }

    previous = segments[segments.length - 1];
    if (previous && previous.type === type) {
      previous.text += text;
      return;
    }

    segments.push({
      type: type,
      text: text
    });
  }

  function diffWords(oldText, newText) {
    var operations = rawDiff(tokenize(oldText), tokenize(newText));
    var segments = [];

    operations.forEach(function (operation) {
      if (operation.type === "same") {
        appendSegment(segments, "same", operation.oldText);
      } else if (operation.type === "removed") {
        appendSegment(segments, "removed", operation.oldText);
      } else if (operation.type === "added") {
        appendSegment(segments, "added", operation.newText);
      }
    });

    return segments;
  }

  function buildChangedChunks(removed, added) {
    var chunks = [];
    var pairs = Math.min(removed.length, added.length);
    var index;

    for (index = 0; index < pairs; index += 1) {
      chunks.push({
        type: "changed",
        oldText: removed[index],
        newText: added[index],
        tokens: diffWords(removed[index], added[index])
      });
    }

    for (index = pairs; index < removed.length; index += 1) {
      chunks.push({
        type: "removed",
        oldText: removed[index]
      });
    }

    for (index = pairs; index < added.length; index += 1) {
      chunks.push({
        type: "added",
        newText: added[index]
      });
    }

    return chunks;
  }

  function diffText(original, result) {
    var operations = rawDiff(splitLines(original), splitLines(result));
    var chunks = [];
    var index = 0;
    var removed;
    var added;

    while (index < operations.length) {
      if (operations[index].type === "same") {
        chunks.push(operations[index]);
        index += 1;
        continue;
      }

      removed = [];
      added = [];

      while (index < operations.length && operations[index].type !== "same") {
        if (operations[index].type === "removed") {
          removed.push(operations[index].oldText);
        } else if (operations[index].type === "added") {
          added.push(operations[index].newText);
        }
        index += 1;
      }

      buildChangedChunks(removed, added).forEach(function (chunk) {
        chunks.push(chunk);
      });
    }

    return chunks;
  }

  function summarizeDiff(chunks) {
    var summary = {
      added: 0,
      addedLines: 0,
      addedTokens: 0,
      changed: 0,
      changedLines: 0,
      removed: 0,
      removedLines: 0,
      removedTokens: 0,
      unchanged: 0
    };

    (chunks || []).forEach(function (chunk) {
      if (chunk.type === "same") {
        summary.unchanged += 1;
        return;
      }

      if (chunk.type === "added") {
        summary.added += 1;
        summary.addedLines += 1;
        return;
      }

      if (chunk.type === "removed") {
        summary.removed += 1;
        summary.removedLines += 1;
        return;
      }

      if (chunk.type === "changed") {
        summary.changed += 1;
        summary.changedLines += 1;
        (chunk.tokens || []).forEach(function (token) {
          if (token.type === "added") {
            summary.added += 1;
            summary.addedTokens += 1;
          } else if (token.type === "removed") {
            summary.removed += 1;
            summary.removedTokens += 1;
          }
        });
      }
    });

    return summary;
  }

  function createElement(tagName, className) {
    var element = document.createElement(tagName);

    if (className) {
      element.className = className;
    }

    return element;
  }

  function appendText(parent, text, className) {
    var span = createElement("span", className || "");

    span.textContent = text;
    parent.appendChild(span);
  }

  function appendTokenText(parent, tokens, side, fallback) {
    var appended = false;

    (tokens || []).forEach(function (token) {
      if (side === "old" && token.type === "added") {
        return;
      }

      if (side === "new" && token.type === "removed") {
        return;
      }

      appendText(
        parent,
        token.text,
        token.type === "added" ? "ai-diff-token-added" :
          token.type === "removed" ? "ai-diff-token-removed" : ""
      );
      appended = true;
    });

    if (!appended) {
      parent.textContent = fallback || "";
    }
  }

  function appendEmptyState(container, message) {
    var empty = createElement("div", "ai-diff-empty");

    empty.textContent = message;
    container.appendChild(empty);
  }

  function renderUnifiedRow(container, prefix, text, className) {
    var row = createElement("div", "ai-diff-row " + className);
    var prefixElement = createElement("span", "ai-diff-prefix");
    var content = createElement("span", "ai-diff-content");

    prefixElement.textContent = prefix;
    content.textContent = text;
    row.appendChild(prefixElement);
    row.appendChild(content);
    container.appendChild(row);
  }

  function renderUnifiedChangedRow(container, prefix, tokens, side, fallback) {
    var row = createElement("div", "ai-diff-row is-changed");
    var prefixElement = createElement("span", "ai-diff-prefix");
    var content = createElement("span", "ai-diff-content");

    prefixElement.textContent = prefix;
    appendTokenText(content, tokens, side, fallback);
    row.appendChild(prefixElement);
    row.appendChild(content);
    container.appendChild(row);
  }

  function renderUnifiedDiff(chunks, options) {
    var container = createElement("div", "ai-diff-unified");
    var hideUnchanged = Boolean(options && options.hideUnchanged);
    var visibleRows = 0;

    (chunks || []).forEach(function (chunk) {
      if (chunk.type === "same") {
        if (!hideUnchanged) {
          renderUnifiedRow(container, " ", chunk.oldText, "is-same");
          visibleRows += 1;
        }
      } else if (chunk.type === "removed") {
        renderUnifiedRow(container, "-", chunk.oldText, "is-removed");
        visibleRows += 1;
      } else if (chunk.type === "added") {
        renderUnifiedRow(container, "+", chunk.newText, "is-added");
        visibleRows += 1;
      } else if (chunk.type === "changed") {
        renderUnifiedChangedRow(container, "~-", chunk.tokens, "old", chunk.oldText);
        renderUnifiedChangedRow(container, "~+", chunk.tokens, "new", chunk.newText);
        visibleRows += 2;
      }
    });

    if (!visibleRows) {
      appendEmptyState(container, chunks && chunks.length ? "No changed lines." : "No content to compare.");
    }

    return container;
  }

  function renderSideBySideRow(container, prefix, oldText, newText, className, tokens) {
    var row = createElement("div", "ai-diff-row ai-diff-split-row " + className);
    var prefixElement = createElement("span", "ai-diff-prefix");
    var oldCell = createElement("span", "ai-diff-content");
    var newCell = createElement("span", "ai-diff-content");

    prefixElement.textContent = prefix;
    if (tokens) {
      appendTokenText(oldCell, tokens, "old", oldText);
      appendTokenText(newCell, tokens, "new", newText);
    } else {
      oldCell.textContent = oldText || "";
      newCell.textContent = newText || "";
    }

    row.appendChild(prefixElement);
    row.appendChild(oldCell);
    row.appendChild(newCell);
    container.appendChild(row);
  }

  function appendSideBySideHeader(container) {
    var header = createElement("div", "ai-diff-row ai-diff-split-row ai-diff-header-row");
    var prefix = createElement("span", "ai-diff-prefix");
    var oldHeading = createElement("span", "ai-diff-content");
    var newHeading = createElement("span", "ai-diff-content");

    prefix.textContent = "";
    oldHeading.textContent = "Original";
    newHeading.textContent = "AI Result - AI can make mistakes";
    header.appendChild(prefix);
    header.appendChild(oldHeading);
    header.appendChild(newHeading);
    container.appendChild(header);
  }

  function renderSideBySideDiff(chunks, options) {
    var container = createElement("div", "ai-diff-side-by-side");
    var hideUnchanged = Boolean(options && options.hideUnchanged);
    var visibleRows = 0;

    appendSideBySideHeader(container);

    (chunks || []).forEach(function (chunk) {
      if (chunk.type === "same") {
        if (!hideUnchanged) {
          renderSideBySideRow(container, " ", chunk.oldText, chunk.newText, "is-same");
          visibleRows += 1;
        }
      } else if (chunk.type === "removed") {
        renderSideBySideRow(container, "-", chunk.oldText, "", "is-removed");
        visibleRows += 1;
      } else if (chunk.type === "added") {
        renderSideBySideRow(container, "+", "", chunk.newText, "is-added");
        visibleRows += 1;
      } else if (chunk.type === "changed") {
        renderSideBySideRow(container, "~", chunk.oldText, chunk.newText, "is-changed", chunk.tokens);
        visibleRows += 1;
      }
    });

    if (!visibleRows) {
      appendEmptyState(container, chunks && chunks.length ? "No changed lines." : "No content to compare.");
    }

    return container;
  }

  ME.aiDiff = {
    diffText: diffText,
    renderSideBySideDiff: renderSideBySideDiff,
    renderUnifiedDiff: renderUnifiedDiff,
    summarizeDiff: summarizeDiff
  };
}());
