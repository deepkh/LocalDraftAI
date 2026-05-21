(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function createHistory(context) {
    var historyStack = [];
    var historyIndex = -1;
    var cleanValue = "";
    var maxHistoryEntries = 200;
    var isRestoringHistory = false;

    function updateControls() {
      if (context.undoButton) {
        context.undoButton.disabled = historyIndex <= 0;
      }

      if (context.redoButton) {
        context.redoButton.disabled = historyIndex >= historyStack.length - 1;
      }
    }

    function record(value) {
      value = String(value || "");

      if (isRestoringHistory) {
        return;
      }

      if (historyIndex >= 0 && historyStack[historyIndex] === value) {
        updateControls();
        return;
      }

      historyStack = historyStack.slice(0, historyIndex + 1);
      historyStack.push(value);

      if (historyStack.length > maxHistoryEntries) {
        historyStack.shift();
      }

      historyIndex = historyStack.length - 1;
      updateControls();
    }

    function reset(value) {
      value = String(value || "");
      historyStack = [value];
      historyIndex = 0;
      cleanValue = value;
      updateControls();
    }

    function markClean(value) {
      value = String(value || "");
      record(value);
      cleanValue = value;
      updateControls();
    }

    function isClean() {
      if (historyIndex < 0) {
        return cleanValue === "";
      }

      return historyStack[historyIndex] === cleanValue;
    }

    function placeCaretAtEnd(element) {
      var range = document.createRange();
      var selection = window.getSelection();

      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    function restoreSnapshot(value) {
      isRestoringHistory = true;
      context.restoreMarkdownSnapshot(String(value || ""), placeCaretAtEnd);
      isRestoringHistory = false;
      updateControls();
    }

    function applyStep(direction) {
      context.flushActiveEditor();

      var nextIndex = historyIndex + direction;
      if (nextIndex < 0 || nextIndex >= historyStack.length) {
        updateControls();
        context.focusActiveEditor();
        return;
      }

      historyIndex = nextIndex;
      restoreSnapshot(historyStack[historyIndex]);
    }

    return {
      applyStep: applyStep,
      isClean: isClean,
      markClean: markClean,
      record: record,
      reset: reset,
      updateControls: updateControls
    };
  }

  ME.history = {
    create: createHistory
  };
}());
