(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function createPatchChunks(diffChunks) {
    return (diffChunks || []).map(function (chunk, index) {
      return {
        accepted: true,
        id: "chunk-" + index,
        newText: chunk.newText || "",
        oldText: chunk.oldText || "",
        tokens: chunk.tokens ? chunk.tokens.slice() : [],
        type: chunk.type
      };
    });
  }

  function findPatchChunk(patchChunks, chunkId) {
    return (patchChunks || []).find(function (chunk) {
      return chunk.id === chunkId;
    });
  }

  function setChunkAccepted(patchChunks, chunkId, accepted) {
    var chunk = findPatchChunk(patchChunks, chunkId);

    if (!chunk || chunk.type === "same") {
      return null;
    }

    chunk.accepted = Boolean(accepted);
    return chunk;
  }

  function acceptAll(patchChunks) {
    (patchChunks || []).forEach(function (chunk) {
      if (chunk.type !== "same") {
        chunk.accepted = true;
      }
    });

    return patchChunks;
  }

  function rejectAll(patchChunks) {
    (patchChunks || []).forEach(function (chunk) {
      if (chunk.type !== "same") {
        chunk.accepted = false;
      }
    });

    return patchChunks;
  }

  function acceptedLine(chunk) {
    if (chunk.type === "same") {
      return chunk.oldText;
    }

    if (chunk.type === "added") {
      return chunk.accepted ? chunk.newText : null;
    }

    if (chunk.type === "removed") {
      return chunk.accepted ? null : chunk.oldText;
    }

    if (chunk.type === "changed") {
      return chunk.accepted ? chunk.newText : chunk.oldText;
    }

    return null;
  }

  function buildAcceptedResult(patchChunks) {
    var lines = [];

    (patchChunks || []).forEach(function (chunk) {
      var line = acceptedLine(chunk);

      if (line !== null) {
        lines.push(line);
      }
    });

    return lines.join("\n");
  }

  function summarizePatch(patchChunks) {
    var summary = {
      accepted: 0,
      rejected: 0,
      totalChanges: 0,
      unchanged: 0
    };

    (patchChunks || []).forEach(function (chunk) {
      if (chunk.type === "same") {
        summary.unchanged += 1;
        return;
      }

      summary.totalChanges += 1;
      if (chunk.accepted) {
        summary.accepted += 1;
      } else {
        summary.rejected += 1;
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

  function setPressed(button, active) {
    if (button.classList) {
      if (active) {
        button.classList.add("is-active");
      } else {
        button.classList.remove("is-active");
      }
    }

    button.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function appendDecisionButton(container, chunk, label, accepted, onChange) {
    var button = createElement("button", "ai-patch-decision");

    button.type = "button";
    button.textContent = label;
    button.dataset.patchAction = accepted ? "accept" : "reject";
    button.dataset.patchChunkId = chunk.id;
    button.setAttribute("aria-label", label + " " + chunk.id);
    setPressed(button, chunk.accepted === accepted);
    button.addEventListener("click", function () {
      if (typeof onChange === "function") {
        onChange(chunk, accepted);
      }
    });
    container.appendChild(button);
  }

  function appendControls(row, chunk, onChange) {
    var controls = createElement("span", "ai-patch-controls");

    if (chunk.type !== "same") {
      appendDecisionButton(controls, chunk, "Accept", true, onChange);
      appendDecisionButton(controls, chunk, "Reject", false, onChange);
    }

    row.appendChild(controls);
  }

  function appendStatus(row, chunk) {
    var status = createElement("span", "ai-patch-status");

    if (chunk.type === "same") {
      status.textContent = "Unchanged";
    } else {
      status.textContent = chunk.accepted ? "Accepted" : "Rejected";
    }

    row.appendChild(status);
  }

  function appendPatchCells(row, chunk) {
    var oldCell = createElement("span", "ai-diff-content");
    var newCell = createElement("span", "ai-diff-content");

    if (chunk.type === "changed" && chunk.tokens && chunk.tokens.length) {
      appendTokenText(oldCell, chunk.tokens, "old", chunk.oldText);
      appendTokenText(newCell, chunk.tokens, "new", chunk.newText);
    } else {
      oldCell.textContent = chunk.type === "added" ? "" : chunk.oldText || "";
      newCell.textContent = chunk.type === "removed" ? "" : chunk.newText || "";
    }

    row.appendChild(oldCell);
    row.appendChild(newCell);
  }

  function appendHeader(container) {
    var header = createElement("div", "ai-patch-row ai-patch-header-row");
    var controls = createElement("span", "ai-patch-controls");
    var status = createElement("span", "ai-patch-status");
    var oldHeading = createElement("span", "ai-diff-content");
    var newHeading = createElement("span", "ai-diff-content");

    status.textContent = "State";
    oldHeading.textContent = "Original";
    newHeading.textContent = "AI Result - AI can make mistakes";
    header.appendChild(controls);
    header.appendChild(status);
    header.appendChild(oldHeading);
    header.appendChild(newHeading);
    container.appendChild(header);
  }

  function renderInteractiveDiff(patchChunks, options) {
    var container = createElement("div", "ai-patch-interactive");
    var hideUnchanged = Boolean(options && options.hideUnchanged);
    var onChange = options && options.onChange;
    var visibleRows = 0;

    appendHeader(container);

    (patchChunks || []).forEach(function (chunk) {
      var row;

      if (hideUnchanged && chunk.type === "same") {
        return;
      }

      row = createElement("div", "ai-patch-row is-" + chunk.type);
      row.dataset.patchChunkId = chunk.id;
      if (chunk.type !== "same") {
        row.dataset.patchState = chunk.accepted ? "accepted" : "rejected";
        row.className += chunk.accepted ? " is-accepted" : " is-rejected";
      }

      appendControls(row, chunk, onChange);
      appendStatus(row, chunk);
      appendPatchCells(row, chunk);
      container.appendChild(row);
      visibleRows += 1;
    });

    if (!visibleRows) {
      appendEmptyState(container, patchChunks && patchChunks.length ? "No changed lines." : "No content to compare.");
    }

    return container;
  }

  ME.aiPatch = {
    acceptAll: acceptAll,
    buildAcceptedResult: buildAcceptedResult,
    createPatchChunks: createPatchChunks,
    rejectAll: rejectAll,
    renderInteractiveDiff: renderInteractiveDiff,
    setChunkAccepted: setChunkAccepted,
    summarizePatch: summarizePatch
  };
}());
